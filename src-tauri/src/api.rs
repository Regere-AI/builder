//! API layer: all HTTP calls to the backend run in Rust.
//! Frontend only invokes Tauri commands and displays UI.

use reqwest::Client;
use serde::{Deserialize, Serialize};

const DEFAULT_API_BASE_URL: &str = "http://localhost:3010";
const DEFAULT_AGENT_URL: &str = "http://localhost:3000";

fn api_base_url() -> String {
    std::env::var("STACK_GUARD_API_BASE_URL").unwrap_or_else(|_| DEFAULT_API_BASE_URL.to_string())
}

fn api_key() -> Result<String, String> {
    std::env::var("REGERE-API-KEY")
        .map_err(|_| "REGERE-API-KEY not found in environment variables".to_string())
}

fn agent_url() -> String {
    std::env::var("AGENT_URL").unwrap_or_else(|_| DEFAULT_AGENT_URL.to_string())
}

// ---------- Signup ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignupRequest {
    pub first_name: String,
    pub last_name: String,
    pub work_email: String,
    pub contact_no: String,
    pub country_code: String,
    pub password: String,
    pub company_name: String,
    pub industry: String,
    pub designation: String,
    pub personal_email: String,
    pub accept_terms_and_conditions: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignupUser {
    pub id: String,
    pub email: String,
    #[serde(rename = "firstName")]
    pub first_name: String,
    #[serde(rename = "lastName")]
    pub last_name: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "termsAcceptedAt")]
    pub terms_accepted_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignupData {
    pub message: String,
    pub user: SignupUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignupResponse {
    pub success: bool,
    pub data: SignupData,
}

// ---------- Send OTP ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendOTPRequest {
    pub email: String,
    pub purpose: String, // "emailVerification" | "LOGIN"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendOTPData {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendOTPResponse {
    pub success: bool,
    pub data: SendOTPData,
}

// ---------- Verify OTP ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyOTPRequest {
    pub email: String,
    pub code: String,
    pub purpose: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyUser {
    pub id: String,
    pub email: String,
    #[serde(rename = "firstName", alias = "first_name")]
    pub first_name: String,
    #[serde(rename = "lastName", alias = "last_name")]
    pub last_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyOTPData {
    pub token: String,
    pub user: VerifyUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyOTPResponse {
    pub success: bool,
    pub data: VerifyOTPData,
}

// ---------- Signin ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SigninRequest {
    pub work_email: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SigninData {
    pub message: String,
    pub user: Option<VerifyUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SigninResponse {
    pub success: bool,
    pub data: SigninData,
}

// ---------- Verify 2FA ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verify2FARequest {
    pub email: String,
    pub code: String,
    pub purpose: String, // "login" | "emailVerification"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Verify2FAData {
    pub token: String,
    pub user: VerifyUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Verify2FAResponse {
    pub success: bool,
    pub data: Verify2FAData,
}

// ---------- Validate License ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateLicenseRequest {
    pub license_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidateLicenseResponse {
    pub validator: bool,
    pub status: String,
    pub message: String,
}

fn map_reqwest_error(e: reqwest::Error, _fallback: &str) -> String {
    e.to_string().chars().take(200).collect::<String>()
}

/// User-friendly error when the agent backend is unreachable (e.g. not running).
fn map_agent_connection_error(e: reqwest::Error, base_url: &str) -> String {
    if e.is_connect() || e.is_request() {
        format!(
            "Could not connect to the agent backend at {}. Is it running? From the project root run: npm run backend:start (or npm run tauri:dev to start both the app and the backend).",
            base_url
        )
    } else {
        e.to_string().chars().take(200).collect::<String>()
    }
}

/// Read response body as text, then parse as JSON. Empty body => {}. Non-JSON body => { "content": text }.
async fn decode_json_response(
    res: reqwest::Response,
    context: &str,
) -> Result<serde_json::Value, String> {
    let text = res.text().await.map_err(|e| {
        format!("{}: {}", context, map_reqwest_error(e, context))
    })?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(serde_json::json!({}));
    }
    match serde_json::from_str::<serde_json::Value>(trimmed) {
        Ok(v) => Ok(v),
        Err(_) => Ok(serde_json::json!({ "content": text })),
    }
}

/// Parse Server-Sent Events (SSE) stream and return final JSON.
/// Prefers the "data-complete" event's `data`; otherwise assembles from "data-json_delta" chunks.
fn parse_sse_to_json(text: &str) -> Result<serde_json::Value, String> {
    let mut complete_data: Option<serde_json::Value> = None;
    let mut json_chunks = String::new();
    for line in text.lines() {
        let line = line.trim();
        let data = match line.strip_prefix("data:") {
            Some(s) => s.trim(),
            None => continue,
        };
        if data == "[DONE]" || data.is_empty() {
            continue;
        }
        let event: serde_json::Value = serde_json::from_str(data)
            .map_err(|e| format!("SSE parse error: {}", e))?;
        let event_type = event.get("type").and_then(|t| t.as_str());
        match event_type {
            Some("data-complete") => {
                if let Some(data) = event.get("data").cloned() {
                    complete_data = Some(data);
                }
            }
            Some("data-json_delta") => {
                if let Some(chunk) = event.get("data").and_then(|d| d.get("chunk")).and_then(|c| c.as_str()) {
                    json_chunks.push_str(chunk);
                }
            }
            _ => {}
        }
    }
    if let Some(mut data) = complete_data {
        if let Some(obj) = data.as_object_mut() {
            if !obj.contains_key("content") {
                if let Some(ui) = obj.get("ui") {
                    if let Ok(s) = serde_json::to_string_pretty(ui) {
                        obj.insert("content".to_string(), serde_json::Value::String(s));
                    }
                }
            }
        }
        return Ok(data);
    }
    let assembled = json_chunks.trim();
    if assembled.is_empty() {
        return Ok(serde_json::json!({}));
    }
    let mut value: serde_json::Value =
        serde_json::from_str(assembled).map_err(|e| format!("Assembled JSON invalid: {}", e))?;
    // Ensure frontend gets a "content" field (layout JSON) so chat doesn't show "(No content)"
    let content_str = value.get("content").is_none().then(|| {
        let copy = value.clone();
        serde_json::to_string_pretty(&copy).ok()
    }).and_then(|o| o);
    if let Some(s) = content_str {
        if let Some(obj) = value.as_object_mut() {
            obj.insert("content".to_string(), serde_json::Value::String(s));
        }
    }
    Ok(value)
}

/// Extract error message from API error response (error, message, details[].msg, errors[]).
fn extract_error_message(text: &str, fallback: &str) -> String {
    let v = match serde_json::from_str::<serde_json::Value>(text).ok() {
        Some(x) => x,
        _ => {
            return if text.is_empty() {
                fallback.into()
            } else {
                text.to_string()
            }
        }
    };
    if let Some(s) = v.get("error").and_then(|m| m.as_str()) {
        return s.to_string();
    }
    if let Some(s) = v.get("message").and_then(|m| m.as_str()) {
        return s.to_string();
    }
    if let Some(arr) = v.get("details").and_then(|m| m.as_array()) {
        if let Some(obj) = arr.first().and_then(|e| e.as_object()) {
            if let Some(msg) = obj.get("msg").and_then(|m| m.as_str()) {
                return msg.to_string();
            }
        }
    }
    if let Some(arr) = v.get("errors").and_then(|m| m.as_array()) {
        if let Some(s) = arr.first().and_then(|e| e.as_str()) {
            return s.to_string();
        }
        if let Some(obj) = arr.first().and_then(|e| e.as_object()) {
            if let Some(msg) = obj.get("msg").and_then(|m| m.as_str()) {
                return msg.to_string();
            }
        }
    }
    if text.is_empty() {
        fallback.to_string()
    } else {
        text.to_string()
    }
}

#[tauri::command]
pub async fn api_signup(data: SignupRequest) -> Result<SignupResponse, String> {
    if data.work_email.trim().is_empty() {
        return Err("Valid work email is required".into());
    }
    if data.password.is_empty() {
        return Err("Password is required".into());
    }
    let base = api_base_url();
    let key = api_key()?;
    let url = format!("{}/api/auth/developer/signup", base);
    let body = serde_json::json!({
        "firstName": data.first_name.trim(),
        "lastName": data.last_name.trim(),
        "workEmail": data.work_email.trim(),
        "contactNo": data.contact_no.trim(),
        "countryCode": data.country_code.trim(),
        "password": data.password,
        "companyName": data.company_name.trim(),
        "industry": data.industry.trim(),
        "designation": data.designation.trim(),
        "personalEmail": data.personal_email.trim(),
        "acceptTermsAndConditions": data.accept_terms_and_conditions
    });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("REGERE-API-KEY", &key)
        .json(&body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "Signup failed"))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_signup] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "Signup failed"));
    }
    res.json()
        .await
        .map_err(|e| map_reqwest_error(e, "Signup failed"))
}

#[tauri::command]
pub async fn api_send_otp(data: SendOTPRequest) -> Result<SendOTPResponse, String> {
    if data.email.trim().is_empty() {
        return Err("Email is required".into());
    }
    if data.purpose.trim().is_empty() {
        return Err("Purpose is required".into());
    }
    let base = api_base_url();
    let key = api_key()?;
    let url = format!("{}/api/auth/send-otp", base);
    let body = serde_json::json!({
        "email": data.email.trim(),
        "purpose": data.purpose
    });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("REGERE-API-KEY", &key)
        .json(&body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "Failed to send OTP"))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_send_otp] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "Failed to send OTP"));
    }
    res.json()
        .await
        .map_err(|e| map_reqwest_error(e, "Failed to send OTP"))
}

#[tauri::command]
pub async fn api_verify_otp(data: VerifyOTPRequest) -> Result<VerifyOTPResponse, String> {
    if data.email.trim().is_empty() {
        return Err("Email is required".into());
    }
    if data.code.trim().is_empty() {
        return Err("Verification code is required".into());
    }
    if data.purpose.trim().is_empty() {
        return Err("Purpose is required".into());
    }
    let base = api_base_url();
    let url = format!("{}/api/auth/verify-otp", base);
    let body = serde_json::json!({
        "email": data.email.trim(),
        "code": data.code.trim(),
        "purpose": data.purpose
    });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "OTP verification failed"))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| map_reqwest_error(e, "OTP verification failed"))?;
    if !status.is_success() {
        eprintln!("[api_verify_otp] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "OTP verification failed"));
    }
    // Prefer { success, data: { token, user } }; fallback to flat { token, user }
    match serde_json::from_str::<VerifyOTPResponse>(&text) {
        Ok(out) => return Ok(out),
        Err(_) => {}
    }
    if let Ok(flat) = serde_json::from_str::<VerifyOTPData>(&text) {
        return Ok(VerifyOTPResponse {
            success: true,
            data: flat,
        });
    }
    let msg = format!(
        "OTP verification failed: could not parse response. Body: {}",
        text.chars().take(300).collect::<String>()
    );
    eprintln!("[api_verify_otp] {}", msg);
    Err(msg)
}

/// Redact a secret for logging (show first 4 chars + "***").
fn redact(s: &str) -> String {
    if s.len() <= 4 {
        "***".to_string()
    } else {
        format!("{}***", &s[..4.min(s.len())])
    }
}

#[tauri::command]
pub async fn api_signin(data: SigninRequest) -> Result<SigninResponse, String> {
    if data.work_email.trim().is_empty() {
        return Err("Valid work email is required".into());
    }
    if data.password.is_empty() {
        return Err("Password is required".into());
    }
    let base = api_base_url();
    let key = api_key()?;
    let url = format!("{}/api/auth/developer/signin", base);
    // Debug logging (redact secrets). Remove or gate with cfg!(debug_assertions) in production.
    eprintln!("[api_signin] base: {}", base);
    eprintln!("[api_signin] url: {}", url);
    eprintln!("[api_signin] key: {}", redact(&key));
    eprintln!(
        "[api_signin] data: SigninRequest {{ work_email: {:?}, password: \"***\" }}",
        data.work_email
    );
    // Build body with explicit keys "workEmail" and "password" so the server receives them.
    let body = serde_json::json!({
        "workEmail": data.work_email.trim(),
        "password": data.password
    });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("REGERE-API-KEY", &key)
        .json(&body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "Signin failed"))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_signin] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "Signin failed"));
    }
    res.json()
        .await
        .map_err(|e| map_reqwest_error(e, "Signin failed"))
}

#[tauri::command]
pub async fn api_verify_2fa(data: Verify2FARequest) -> Result<Verify2FAResponse, String> {
    if data.email.trim().is_empty() {
        return Err("Email is required".into());
    }
    if data.code.trim().is_empty() {
        return Err("Verification code is required".into());
    }
    if data.purpose.trim().is_empty() {
        return Err("Purpose is required".into());
    }
    let base = api_base_url();
    let url = format!("{}/api/auth/verify-2fa", base);
    let body = serde_json::json!({
        "email": data.email.trim(),
        "code": data.code.trim(),
        "purpose": data.purpose
    });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "2FA verification failed"))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_verify_2fa] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "2FA verification failed"));
    }
    res.json()
        .await
        .map_err(|e| map_reqwest_error(e, "2FA verification failed"))
}

#[tauri::command]
pub async fn api_validate_license(
    data: ValidateLicenseRequest,
) -> Result<ValidateLicenseResponse, String> {
    if data.license_key.trim().is_empty() {
        return Err("License key is required".into());
    }
    let base = api_base_url();
    let key = api_key()?;
    let url = format!("{}/api/licenses/validate", base);
    let body = serde_json::json!({
        "licenseKey": data.license_key.trim()
    });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("REGERE-API-KEY", &key)
        .json(&body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "License validation failed"))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_validate_license] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "License validation failed"));
    }
    res.json()
        .await
        .map_err(|e| map_reqwest_error(e, "License validation failed"))
}

// ---------- Agent Chat ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePart {
    #[serde(rename = "type")]
    pub part_type: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub parts: Vec<MessagePart>,
}

// ---------- Agent Generate ----------
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteStep {
    pub id: String,
    pub description: String,
    pub intent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    #[serde(default)]
    pub agent_mode: bool,
    #[serde(default)]
    pub plan_only: bool,
    #[serde(default)]
    pub execute_plan: bool,
    #[serde(default)]
    pub current_ui: Option<serde_json::Value>,
    #[serde(default)]
    pub steps: Option<Vec<ExecuteStep>>,
}

#[tauri::command]
pub async fn api_chat(data: ChatRequest) -> Result<serde_json::Value, String> {
    if data.messages.is_empty() {
        return Err("At least one message is required".into());
    }
    let base = agent_url();
    let url = format!("{}/api/chat", base);
    let body = serde_json::json!({
        "messages": data.messages,
        "agentMode": data.agent_mode,
        "planOnly": data.plan_only,
        "executePlan": data.execute_plan,
        "currentUI": data.current_ui,
        "steps": data.steps
    });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| map_agent_connection_error(e, &base))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| map_agent_connection_error(e, &base))?;
    if !status.is_success() {
        eprintln!("[api_chat] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "Chat failed"));
    }
    parse_sse_to_json(&text)
}

// ---------- Agent Modify ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifyRequest {
    pub prompt: String,
}

#[tauri::command]
pub async fn api_modify(data: ModifyRequest) -> Result<serde_json::Value, String> {
    if data.prompt.trim().is_empty() {
        return Err("Prompt is required".into());
    }
    let base = agent_url();
    let url = format!("{}/api/modify", base);
    let body = serde_json::json!({ "prompt": data.prompt.trim() });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| map_agent_connection_error(e, &base))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_modify] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "Modify failed"));
    }
    decode_json_response(res, "Modify failed").await
}

// ---------- Agent Generate (from main) ----------
/// Flexible response: API may return result, content, or data.content.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateResponse {
    #[serde(default)]
    pub result: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub data: Option<serde_json::Value>,
}

impl GenerateResponse {
    /// First non-empty text field for display/editor.
    #[allow(dead_code)]
    pub fn text(&self) -> String {
        self.result
            .as_deref()
            .or(self.content.as_deref())
            .or(self.code.as_deref())
            .unwrap_or("")
            .to_string()
    }
}

#[tauri::command]
pub async fn api_generate(
    prompt: String,
    stream: bool,
    mode: String,
    _include_steps: bool,
    model: Option<String>,
) -> Result<GenerateResponse, String> {
    if prompt.trim().is_empty() {
        return Err("Prompt is required".into());
    }
    if stream {
        return Err("Streaming not implemented yet".into());
    }
    let base = agent_url();
    let url = format!("{}/api/generate", base);
    let mut body = serde_json::json!({
        "prompt": prompt.trim(),
        "stream": false,
        "mode": mode.as_str(),
        "includeSteps": false
    });
    if let Some(m) = model.filter(|s| !s.is_empty()) {
        body["model"] = serde_json::Value::String(m);
    }
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| map_reqwest_error(e, "Generate failed"))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_generate] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "Generate failed"));
    }
    let parsed: serde_json::Value = res
        .json()
        .await
        .map_err(|e| map_reqwest_error(e, "Generate failed"))?;

    #[cfg(debug_assertions)]
    eprintln!(
        "[api_generate] raw response: {}",
        serde_json::to_string(&parsed).unwrap_or_default()
    );

    fn extract_text_generate(v: &serde_json::Value) -> Option<String> {
        let keys = [
            "result", "content", "code", "output", "response", "text", "message", "body",
        ];
        for key in keys {
            if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
                if !s.trim().is_empty() {
                    return Some(s.to_string());
                }
            }
        }
        None
    }

    let data = parsed.get("data").cloned();
    let result = extract_text_generate(&parsed);
    let (result, content, code) = if let Some(ref s) = result {
        (Some(s.clone()), None, None)
    } else if let Some(ref d) = data {
        let from_data = if let Some(s) = d.as_str() {
            if s.trim().is_empty() {
                None
            } else {
                Some(s.to_string())
            }
        } else {
            extract_text_generate(d)
        };
        (from_data.clone(), from_data.clone(), from_data)
    } else {
        (None, None, None)
    };

    let (result, content, code) = if result.is_some() || content.is_some() || code.is_some() {
        (result, content, code)
    } else if let Ok(full) = serde_json::to_string_pretty(&parsed) {
        (Some(full.clone()), Some(full.clone()), Some(full))
    } else {
        (result, content, code)
    };

    Ok(GenerateResponse {
        result,
        content,
        code,
        data,
    })
}

// ---------- Agent Goal ----------
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoalRequest {
    pub goal: String,
}

#[tauri::command]
pub async fn api_goal(data: GoalRequest) -> Result<serde_json::Value, String> {
    if data.goal.trim().is_empty() {
        return Err("Goal is required".into());
    }
    let base = agent_url();
    let url = format!("{}/api/goal", base);
    let body = serde_json::json!({ "goal": data.goal.trim() });
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| map_agent_connection_error(e, &base))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_goal] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "Goal failed"));
    }
    decode_json_response(res, "Goal failed").await
}

// ---------- Agent Health (for frontend to verify backend is running and configured) ----------
#[tauri::command]
pub async fn api_agent_health() -> Result<serde_json::Value, String> {
    let base = agent_url();
    let url = format!("{}/api/health", base);
    let client = Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| map_agent_connection_error(e, &base))?;
    let status = res.status();
    let text = res.text().await.map_err(|e| map_agent_connection_error(e, &base))?;
    if !status.is_success() {
        return Err(format!("Health check failed: {} {}", status, text));
    }
    serde_json::from_str(&text).map_err(|e| format!("Invalid health response: {}", e))
}

// ---------- Launchpad: GET /launchpad/api/v1/health ----------

#[tauri::command]
pub async fn launchpad_health_check(base_url: String) -> Result<bool, String> {
    let base = base_url.trim_end_matches('/');
    let url = format!("{}/launchpad/api/v1/health", base);
    let client = Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Health check request failed: {}", map_reqwest_error(e, "Request failed")))?;
    Ok(res.status().is_success())
}

// ---------- Launchpad: GET /api/v1/services (service registry) ----------

#[tauri::command]
pub async fn launchpad_get_services(
    base_url: String,
    session_token: Option<String>,
    tenant: String,
) -> Result<Vec<serde_json::Value>, String> {
    let base = base_url.trim_end_matches('/');
    let url = format!("{}/api/v1/services", base);
    let client = Client::new();
    let mut req = client.get(&url).header("X-Tenant-ID", tenant.as_str());
    if let Some(token) = session_token {
        if !token.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", token));
        }
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("Services request failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Services response read failed: {}", map_reqwest_error(e, "Read failed")))?;
    if !status.is_success() {
        let message: String = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|j| {
                j.get("message")
                    .or(j.get("error"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| text.chars().take(200).collect::<String>());
        return Err(format!("Services failed ({}): {}", status, message));
    }
    let data: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid services JSON: {}", e))?;
    let list = if let Some(arr) = data.as_array() {
        arr.clone()
    } else if let Some(arr) = data.get("data").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = data.get("services").and_then(|v| v.as_array()) {
        arr.clone()
    } else {
        vec![]
    };
    Ok(list)
}

// ---------- Launchpad: POST /api/v1/services (register new service) ----------

#[tauri::command]
pub async fn launchpad_register_service(
    base_url: String,
    session_token: String,
    tenant: String,
    slug: String,
    name: String,
    service_base_url: String,
    service_type: String,
    docker_image: Option<String>,
    tag: Option<String>,
) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    let url = format!("{}/api/v1/services", base);
    let client = Client::new();
    let mut body = serde_json::json!({
        "slug": slug.trim(),
        "name": name.trim(),
        "baseUrl": service_base_url.trim(),
        "serviceType": service_type.trim()
    });
    if let Some(ref img) = docker_image {
        let img = img.trim();
        if !img.is_empty() {
            body["dockerImage"] = serde_json::Value::String(img.to_string());
        }
    }
    if let Some(ref t) = tag {
        let t = t.trim();
        if !t.is_empty() {
            body["tag"] = serde_json::Value::String(t.to_string());
        }
    }
    let res = client
        .post(&url)
        .header("X-Tenant-ID", tenant.as_str())
        .header("Authorization", format!("Bearer {}", session_token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Register service request failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Register service response read failed: {}", map_reqwest_error(e, "Read failed")))?;
    if !status.is_success() {
        let message: String = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|j| {
                j.get("message")
                    .or(j.get("error"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| text.chars().take(200).collect::<String>());
        return Err(format!("Register service failed ({}): {}", status, message));
    }
    Ok(())
}

// ---------- Launchpad: POST /proxy/authrs/login/email-password ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchpadLoginResponse {
    #[serde(rename = "sessionToken")]
    pub session_token: String,
}

#[tauri::command]
pub async fn launchpad_login(
    base_url: String,
    tenant: String,
    email: String,
    password: String,
) -> Result<LaunchpadLoginResponse, String> {
    let base = base_url.trim_end_matches('/');
    let url = format!("{}/proxy/authrs/login/email-password", base);
    let client = Client::new();
    let body = serde_json::json!({ "email": email, "password": password });
    let res = client
        .post(&url)
        .header("X-Tenant-ID", tenant.as_str())
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Login request failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Login response read failed: {}", map_reqwest_error(e, "Read failed")))?;
    if !status.is_success() {
        let message: String = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|j| {
                j.get("message")
                    .or(j.get("error"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| text.chars().take(200).collect::<String>());
        return Err(format!("Login failed ({}): {}", status, message));
    }
    let data: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid login JSON: {}", e))?;
    let session_token = data
        .get("sessionToken")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Login succeeded but no session token returned".to_string())?;
    Ok(LaunchpadLoginResponse {
        session_token: session_token.to_string(),
    })
}

// ---------- Launchpad: POST /proxy/authrs/session/logout ----------

#[tauri::command]
pub async fn launchpad_logout(base_url: String, session_token: String) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    let url = format!("{}/proxy/authrs/session/logout", base);
    let client = Client::new();
    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", session_token))
        .send()
        .await
        .map_err(|e| format!("Logout request failed: {}", map_reqwest_error(e, "Request failed")))?;
    // Best-effort: don't fail the app if logout returns non-2xx (session may already be invalid)
    if !res.status().is_success() {
        let _ = res.text().await;
    }
    Ok(())
}

// ---------- Launchpad: GET /proxy/{slug}/spec (OpenAPI spec for a service) ----------

#[tauri::command]
pub async fn launchpad_get_service_spec(
    base_url: String,
    slug: String,
    session_token: String,
    tenant: String,
) -> Result<serde_json::Value, String> {
    let base = base_url.trim_end_matches('/');
    let slug = slug.trim();
    let url = if slug.is_empty() || slug.eq_ignore_ascii_case("launchpad") {
        format!("{}/launchpad/api/v1/spec", base)
    } else {
        format!("{}/proxy/{}/spec", base, slug)
    };
    let client = Client::new();
    let mut req = client.get(&url).header("Authorization", format!("Bearer {}", session_token));
    if !tenant.is_empty() {
        req = req.header("X-Tenant-ID", tenant.as_str());
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("Spec request failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Spec response read failed: {}", map_reqwest_error(e, "Read failed")))?;
    if !status.is_success() {
        let message: String = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|j| {
                j.get("message")
                    .or(j.get("error"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| text.chars().take(200).collect::<String>());
        return Err(format!("Spec failed ({}): {}", status, message));
    }
    let spec: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid spec JSON: {}", e))?;
    Ok(spec)
}

// ---------- Launchpad: Workflow proxy (workflow service) ----------

const WORKFLOW_SERVICE_SLUG: &str = "workflow";

/// POST /proxy/workflow/workflows — create workflow. Returns { id }.
#[tauri::command]
pub async fn launchpad_workflow_create(
    base_url: String,
    session_token: String,
    tenant: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let base = base_url.trim_end_matches('/');
    let url = format!("{}/proxy/{}/workflows", base, WORKFLOW_SERVICE_SLUG);
    let client = Client::new();
    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", session_token))
        .header("Content-Type", "application/json");
    if !tenant.is_empty() {
        req = req.header("X-Tenant-ID", tenant.as_str());
    }
    let res = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Workflow create failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Workflow create response: {}", map_reqwest_error(e, "Read failed")))?;
    if !status.is_success() {
        return Err(format!("Workflow create failed ({}): {}", status, text.chars().take(300).collect::<String>()));
    }
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid workflow create JSON: {}", e))?;
    let id = json.get("id").or_else(|| json.get("workflowId"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Workflow create response missing id".to_string())?;
    Ok(serde_json::json!({ "id": id }))
}

/// PUT /proxy/workflow/workflows/{workflow_id} — update workflow.
#[tauri::command]
pub async fn launchpad_workflow_update(
    base_url: String,
    session_token: String,
    tenant: String,
    workflow_id: String,
    body: serde_json::Value,
) -> Result<(), String> {
    let base = base_url.trim_end_matches('/');
    let encoded = urlencoding::encode(workflow_id.trim());
    let url = format!("{}/proxy/{}/workflows/{}", base, WORKFLOW_SERVICE_SLUG, encoded);
    let client = Client::new();
    let mut req = client
        .put(&url)
        .header("Authorization", format!("Bearer {}", session_token))
        .header("Content-Type", "application/json");
    if !tenant.is_empty() {
        req = req.header("X-Tenant-ID", tenant.as_str());
    }
    let res = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Workflow update failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Workflow update failed ({}): {}", status, text.chars().take(300).collect::<String>()));
    }
    Ok(())
}

/// POST /proxy/workflow/webhook/{workflow_id} — trigger execution.
#[tauri::command]
pub async fn launchpad_workflow_execute(
    base_url: String,
    session_token: String,
    tenant: String,
    workflow_id: String,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let base = base_url.trim_end_matches('/');
    let encoded = urlencoding::encode(workflow_id.trim());
    let url = format!("{}/proxy/{}/webhook/{}", base, WORKFLOW_SERVICE_SLUG, encoded);
    let client = Client::new();
    let mut req = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", session_token))
        .header("Content-Type", "application/json");
    if !tenant.is_empty() {
        req = req.header("X-Tenant-ID", tenant.as_str());
    }
    let res = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Workflow execute failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Workflow execute response: {}", map_reqwest_error(e, "Read failed")))?;
    if !status.is_success() {
        return Err(format!("Workflow execute failed ({}): {}", status, text.chars().take(300).collect::<String>()));
    }
    if text.trim().is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(&text).map_err(|e| format!("Invalid workflow execute JSON: {}", e))
}

/// GET /proxy/workflow/executions?workflow_id=... — list executions.
#[tauri::command]
pub async fn launchpad_workflow_executions(
    base_url: String,
    session_token: String,
    tenant: String,
    workflow_id: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let base = base_url.trim_end_matches('/');
    let url = if let Some(ref id) = workflow_id {
        if id.is_empty() {
            format!("{}/proxy/{}/executions", base, WORKFLOW_SERVICE_SLUG)
        } else {
            format!("{}/proxy/{}/executions?workflow_id={}", base, WORKFLOW_SERVICE_SLUG, urlencoding::encode(id))
        }
    } else {
        format!("{}/proxy/{}/executions", base, WORKFLOW_SERVICE_SLUG)
    };
    let client = Client::new();
    let mut req = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", session_token));
    if !tenant.is_empty() {
        req = req.header("X-Tenant-ID", tenant.as_str());
    }
    let res = req
        .send()
        .await
        .map_err(|e| format!("Workflow executions failed: {}", map_reqwest_error(e, "Request failed")))?;
    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Workflow executions response: {}", map_reqwest_error(e, "Read failed")))?;
    if !status.is_success() {
        return Err(format!("Workflow executions failed ({}): {}", status, text.chars().take(300).collect::<String>()));
    }
    let data: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid workflow executions JSON: {}", e))?;
    let list = if let Some(arr) = data.get("executions").and_then(|v| v.as_array()) {
        arr.clone()
    } else if let Some(arr) = data.as_array() {
        arr.clone()
    } else {
        vec![]
    };
    Ok(list)
}
