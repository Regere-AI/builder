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
    #[serde(rename = "firstName")]
    pub first_name: String,
    #[serde(rename = "lastName")]
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
    if !status.is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("[api_verify_otp] {} response body: {}", status, text);
        return Err(extract_error_message(&text, "OTP verification failed"));
    }
    res.json()
        .await
        .map_err(|e| map_reqwest_error(e, "OTP verification failed"))
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

// ---------- Agent Generate ----------
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub prompt: String,
    pub stream: bool,
    pub mode: String,
    pub include_steps: bool,
}

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
    // Only non-streaming for now
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

    // Helper: get first non-empty string from a value using common keys (order matters).
    fn extract_text(v: &serde_json::Value) -> Option<String> {
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
    let result = extract_text(&parsed);
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
            extract_text(d)
        };
        (from_data.clone(), from_data.clone(), from_data)
    } else {
        (None, None, None)
    };

    // If no string field found, use the whole response body (e.g. JSON tree with type/props/children)
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
