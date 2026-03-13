/**
 * API layer: frontend-only types and Tauri invoke wrappers.
 * All HTTP calls are performed in Rust (src-tauri/src/api.rs).
 */

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/desktop'

// ----- Types (mirror backend API responses; no network logic) -----

export interface SignupRequest {
  firstName: string
  lastName: string
  workEmail: string
  contactNo: string
  countryCode: string
  password: string
  companyName: string
  industry: string
  designation: string
  personalEmail: string
  acceptTermsAndConditions: boolean
}

export interface SignupResponse {
  success: boolean
  data: {
    message: string
    user: {
      id: string
      email: string
      firstName: string
      lastName: string
      createdAt: string
      termsAcceptedAt: string
    }
  }
}

export interface SendOTPRequest {
  email: string
  purpose: 'emailVerification' | 'LOGIN'
}

export interface SendOTPResponse {
  success: boolean
  data: {
    message: string
  }
}

export interface VerifyOTPRequest {
  email: string
  code: string
  purpose: 'emailVerification' | 'LOGIN'
}

export interface VerifyOTPResponse {
  success: boolean
  data: {
    token: string
    user: {
      id: string
      email: string
      firstName: string
      lastName: string
    }
  }
}

export interface SigninRequest {
  workEmail: string
  password: string
}

export interface SigninResponse {
  success: boolean
  data: {
    message: string
    user?: {
      id: string
      email: string
      firstName: string
      lastName: string
    }
  }
}

export interface Verify2FARequest {
  email: string
  code: string
  purpose: 'login' | 'emailVerification'
}

export interface Verify2FAResponse {
  success: boolean
  data: {
    token: string
    user: {
      id: string
      email: string
      firstName: string
      lastName: string
    }
  }
}

export interface ValidateLicenseRequest {
  licenseKey: string
}

export interface ValidateLicenseResponse {
  validator: boolean
  status: string
  message: string
}

function toError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'string') return new Error(err)
  const msg = (err as { message?: string })?.message
  return new Error(msg ?? 'Request failed')
}

export async function signup(data: SignupRequest): Promise<SignupResponse> {
  try {
    return await invoke<SignupResponse>('api_signup', { data })
  } catch (e) {
    throw toError(e)
  }
}

export async function sendOTP(data: SendOTPRequest): Promise<SendOTPResponse> {
  try {
    return await invoke<SendOTPResponse>('api_send_otp', { data })
  } catch (e) {
    throw toError(e)
  }
}

export async function verifyOTP(data: VerifyOTPRequest): Promise<VerifyOTPResponse> {
  try {
    return await invoke<VerifyOTPResponse>('api_verify_otp', { data })
  } catch (e) {
    throw toError(e)
  }
}

export async function signin(data: SigninRequest): Promise<SigninResponse> {
  try {
    return await invoke<SigninResponse>('api_signin', { data })
  } catch (e) {
    console.error('Signin Error:', e)
    throw toError(e)
  }
}

export async function verify2FA(data: Verify2FARequest): Promise<Verify2FAResponse> {
  try {
    return await invoke<Verify2FAResponse>('api_verify_2fa', { data })
  } catch (e) {
    throw toError(e)
  }
}

export async function validateLicense(
  data: ValidateLicenseRequest
): Promise<ValidateLicenseResponse> {
  try {
    return await invoke<ValidateLicenseResponse>('api_validate_license', { data })
  } catch (e) {
    throw toError(e)
  }
}

// ----- Launchpad configs (stored in localStorage) -----

const LAUNCHPAD_STORAGE_KEY = 'builder_launchpad_configs'
const DEFAULT_LAUNCHPAD_COLOR = '#007acc'

export type LaunchpadEnvironment = 'dev' | 'qa' | 'prod'
const DEFAULT_LAUNCHPAD_ENVIRONMENT: LaunchpadEnvironment = 'dev'

export interface LaunchpadConfig {
  id: string
  url: string
  email: string
  color?: string
  environment?: LaunchpadEnvironment
  customerName?: string
  tenant?: string
  configFolderPath?: string
}

export interface LaunchpadAddInput {
  url: string
  email: string
  password: string
  tenant: string
  customerName: string
  configFolderPath: string
  color?: string
  environment?: LaunchpadEnvironment
}

export interface LaunchpadUpdateInput {
  url?: string
  email?: string
  password?: string
  tenant?: string
  configFolderPath?: string
  color?: string
  environment?: LaunchpadEnvironment
  customerName?: string
}

interface StoredLaunchpadConfig extends LaunchpadConfig {
  password: string
}

function getStored(): StoredLaunchpadConfig[] {
  try {
    const raw = localStorage.getItem(LAUNCHPAD_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredLaunchpadConfig[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function setStored(configs: StoredLaunchpadConfig[]) {
  localStorage.setItem(LAUNCHPAD_STORAGE_KEY, JSON.stringify(configs))
}

export function launchpadList(): Promise<LaunchpadConfig[]> {
  const list = getStored().map(({ id, url, email, color, environment, customerName, tenant, configFolderPath }) => ({
    id,
    url,
    email,
    color: color ?? DEFAULT_LAUNCHPAD_COLOR,
    environment: environment ?? DEFAULT_LAUNCHPAD_ENVIRONMENT,
    customerName: customerName?.trim() || undefined,
    tenant: tenant?.trim() || undefined,
    configFolderPath: configFolderPath?.trim() || undefined,
  }))
  return Promise.resolve(list)
}

export function launchpadAdd(input: LaunchpadAddInput): Promise<LaunchpadConfig> {
  const url = input.url.trim()
  const email = input.email.trim()
  const tenant = input.tenant.trim()
  if (!url || !email) {
    return Promise.reject(new Error('URL and email are required'))
  }
  if (!tenant) {
    return Promise.reject(new Error('Tenant is required'))
  }
  const customerName = input.customerName?.trim()
  if (!customerName) {
    return Promise.reject(new Error('Customer name is required'))
  }
  const configFolderPath = input.configFolderPath?.trim()
  if (!configFolderPath) {
    return Promise.reject(new Error('Config folder path is required'))
  }
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `lp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const color = input.color?.trim() || DEFAULT_LAUNCHPAD_COLOR
  const environment = input.environment ?? DEFAULT_LAUNCHPAD_ENVIRONMENT
  const stored: StoredLaunchpadConfig = { id, url, email, password: input.password, tenant, configFolderPath, color, environment, customerName }
  const list = getStored()
  list.push(stored)
  setStored(list)
  return Promise.resolve({ id, url, email, color, environment, customerName, tenant, configFolderPath })
}

export function launchpadUpdate(id: string, input: LaunchpadUpdateInput): Promise<LaunchpadConfig> {
  const list = getStored()
  const idx = list.findIndex((c) => c.id === id)
  if (idx === -1) return Promise.reject(new Error('Launchpad not found'))
  const current = list[idx]
  const url = input.url !== undefined ? input.url.trim() : current.url
  const email = input.email !== undefined ? input.email.trim() : current.email
  const password = input.password !== undefined ? input.password : current.password
  const tenantValue = input.tenant !== undefined ? (input.tenant?.trim() || undefined) : (current as StoredLaunchpadConfig).tenant
  if (!tenantValue) return Promise.reject(new Error('Tenant is required'))
  const color = input.color?.trim() || current.color || DEFAULT_LAUNCHPAD_COLOR
  const environment = input.environment ?? current.environment ?? DEFAULT_LAUNCHPAD_ENVIRONMENT
  const customerName = input.customerName !== undefined ? (input.customerName?.trim() || undefined) : current.customerName
  if (!customerName) return Promise.reject(new Error('Customer name is required'))
  const configFolderPath = input.configFolderPath !== undefined ? (input.configFolderPath?.trim() || undefined) : (current as StoredLaunchpadConfig).configFolderPath
  if (!configFolderPath) return Promise.reject(new Error('Config folder path is required'))
  if (!url || !email) return Promise.reject(new Error('URL and email are required'))
  list[idx] = { ...current, id, url, email, password, tenant: tenantValue, configFolderPath, color, environment, customerName }
  setStored(list)
  return Promise.resolve({ id, url, email, color, environment, customerName, tenant: tenantValue, configFolderPath })
}

export function launchpadDelete(id: string): Promise<void> {
  const list = getStored().filter((c) => c.id !== id)
  setStored(list)
  return Promise.resolve()
}

/** Get full config including password (for "Get in" / use). */
export function launchpadGet(id: string): (LaunchpadConfig & { password: string }) | null {
  const c = getStored().find((x) => x.id === id)
  return c
    ? {
        id: c.id,
        url: c.url,
        email: c.email,
        password: c.password,
        color: c.color ?? DEFAULT_LAUNCHPAD_COLOR,
        environment: c.environment ?? DEFAULT_LAUNCHPAD_ENVIRONMENT,
        customerName: c.customerName?.trim() || undefined,
        tenant: c.tenant?.trim() || undefined,
        configFolderPath: c.configFolderPath?.trim() || undefined,
      }
    : null
}

/** Login to launchpad (Auth Proxy: POST /proxy/authrs/login/email-password). Returns sessionToken on success. Calls Rust backend. */
export async function launchpadLogin(
  baseUrl: string,
  tenant: string,
  email: string,
  password: string
): Promise<{ sessionToken: string }> {
  if (!isTauri()) {
    throw new Error('Launchpad login is only available in the desktop app')
  }
  const res = await invoke<{ sessionToken: string }>('launchpad_login', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    tenant: tenant || '',
    email,
    password,
  })
  return { sessionToken: res.sessionToken }
}

/** Launchpad health check (GET /launchpad/api/v1/health). Returns true if healthy. Uses Rust backend when in Tauri. */
export async function launchpadHealthCheck(baseUrl: string): Promise<boolean> {
  if (isTauri()) {
    try {
      return await invoke<boolean>('launchpad_health_check', {
        baseUrl: baseUrl.replace(/\/$/, ''),
      })
    } catch {
      return false
    }
  }
  const url = baseUrl.replace(/\/$/, '') + '/launchpad/api/v1/health'
  const res = await fetch(url, { method: 'GET' })
  return res.ok
}

/** Response shape from GET /api/v1/services (list of services for the current launchpad). */
export interface LaunchpadService {
  id?: string
  name?: string
  serviceType?: string
  slug?: string
  baseUrl?: string
  dockerImage?: string
  tag?: string
  [key: string]: unknown
}

/** Fetch list of services from the current launchpad (GET /api/v1/services). Calls Rust (src-tauri/src/api.rs). Returns [] when not in Tauri (e.g. web). */
export async function launchpadGetServices(
  baseUrl: string,
  options: { sessionToken: string | null; tenant: string }
): Promise<LaunchpadService[]> {
  if (!isTauri()) {
    return []
  }
  const list = await invoke<LaunchpadService[]>('launchpad_get_services', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sessionToken: options.sessionToken,
    tenant: options.tenant || '',
  })
  return Array.isArray(list) ? list : []
}

/** Register a new service in the launchpad (POST /api/v1/services). Calls Rust backend. */
export async function launchpadRegisterService(
  baseUrl: string,
  options: { sessionToken: string; tenant: string },
  service: {
    slug: string
    name: string
    baseUrl: string
    serviceType: string
    dockerImage?: string
    tag?: string
  }
): Promise<void> {
  if (!isTauri()) {
    throw new Error('Register service is only available in the desktop app')
  }
  await invoke('launchpad_register_service', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sessionToken: options.sessionToken,
    tenant: options.tenant || '',
    slug: service.slug.trim(),
    name: service.name.trim(),
    serviceBaseUrl: service.baseUrl.trim(),
    serviceType: service.serviceType.trim() || 'other',
    dockerImage: service.dockerImage?.trim() || null,
    tag: service.tag?.trim() || null,
  })
}

/** Launchpad session logout (POST /proxy/authrs/session/logout). Calls Rust backend. No-op when not in Tauri. */
export async function launchpadLogout(baseUrl: string, sessionToken: string): Promise<void> {
  if (!isTauri()) return
  await invoke('launchpad_logout', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sessionToken,
  })
}

/** Fetch OpenAPI spec for a service (GET /proxy/{slug}/spec or /api/v1/spec). Calls Rust backend. */
export async function launchpadGetServiceSpec(
  baseUrl: string,
  slug: string,
  sessionToken: string,
  tenant?: string
): Promise<object> {
  const tenantId = tenant ?? getLaunchpadSession()?.tenant ?? ''
  if (!isTauri()) {
    const base = baseUrl.replace(/\/$/, '')
    const s = slug.trim()
    const url = s === '' || s.toLowerCase() === 'launchpad'
      ? `${base}/launchpad/api/v1/spec`
      : `${base}/proxy/${encodeURIComponent(s)}/spec`
    const headers: Record<string, string> = { Authorization: `Bearer ${sessionToken}` }
    if (tenantId) headers['X-Tenant-ID'] = tenantId
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`Failed to load spec: ${res.status} ${res.statusText}`)
    return res.json()
  }
  return invoke<object>('launchpad_get_service_spec', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    slug: slug.trim(),
    sessionToken,
    tenant: tenantId,
  })
}

/** Install package for a framework service (POST /proxy/{slug}/api/v1/config/package). Multipart form with file. */
export async function launchpadInstallPackage(
  baseUrl: string,
  options: { sessionToken: string; tenant: string },
  slug: string,
  file: File
): Promise<void> {
  const base = baseUrl.replace(/\/$/, '')
  const s = slug.trim()
  if (!s) throw new Error('Service slug is required')
  const url = `${base}/proxy/${encodeURIComponent(s)}/api/v1/config/package`
  const formData = new FormData()
  formData.append('file', file)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.sessionToken}`,
  }
  if (options.tenant) headers['X-Tenant-ID'] = options.tenant
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text()
    const message = text.length > 300 ? `${text.slice(0, 300)}…` : text
    throw new Error(`Install package failed (${res.status}): ${message}`)
  }
}

/** Uninstall package for a framework service (DELETE /proxy/{slug}/api/v1/config/package/{packageName}). */
export async function launchpadUninstallPackage(
  baseUrl: string,
  options: { sessionToken: string; tenant: string },
  slug: string,
  packageName: string
): Promise<void> {
  const base = baseUrl.replace(/\/$/, '')
  const s = slug.trim()
  if (!s) throw new Error('Service slug is required')
  const encoded = encodeURIComponent(packageName.trim())
  const url = `${base}/proxy/${encodeURIComponent(s)}/api/v1/config/package/${encoded}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.sessionToken}`,
  }
  if (options.tenant) headers['X-Tenant-ID'] = options.tenant
  const res = await fetch(url, { method: 'DELETE', headers })
  if (!res.ok) {
    const text = await res.text()
    const message = text.length > 300 ? `${text.slice(0, 300)}…` : text
    throw new Error(`Uninstall package failed (${res.status}): ${message}`)
  }
}

/** Create workflow via launchpad proxy (POST /proxy/workflow/workflows). Calls Rust backend. Do not send id; backend assigns it. Returns the created workflow id. */
export async function launchpadWorkflowCreate(
  baseUrl: string,
  options: { sessionToken: string; tenant: string },
  body: {
    triggerType: string
    name: string
    description?: string
    version: number
    data: { nodes: unknown[]; edges: unknown[] }
  }
): Promise<{ id: string }> {
  if (!isTauri()) {
    throw new Error('Workflow API is only available in the desktop app')
  }
  const res = await invoke<{ id: string }>('launchpad_workflow_create', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sessionToken: options.sessionToken,
    tenant: options.tenant ?? '',
    body,
  })
  return res
}

/** Update workflow via launchpad proxy (PUT /proxy/workflow/workflows/{workflowId}). Calls Rust backend. */
export async function launchpadWorkflowUpdate(
  baseUrl: string,
  options: { sessionToken: string; tenant: string },
  workflowId: string,
  body: { definition: { data: { nodes: unknown[]; edges: unknown[] } }; is_latest: boolean }
): Promise<void> {
  if (!isTauri()) {
    throw new Error('Workflow API is only available in the desktop app')
  }
  await invoke('launchpad_workflow_update', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sessionToken: options.sessionToken,
    tenant: options.tenant ?? '',
    workflowId,
    body,
  })
}

/** Trigger workflow execution via launchpad proxy (POST /proxy/workflow/webhook/{workflowId}). Calls Rust backend. */
export async function launchpadWorkflowExecute(
  baseUrl: string,
  options: { sessionToken: string; tenant: string; customHeaders?: Record<string, string> },
  workflowId: string,
  body: Record<string, unknown>
): Promise<unknown> {
  if (!isTauri()) {
    throw new Error('Workflow API is only available in the desktop app')
  }
  return invoke('launchpad_workflow_execute', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sessionToken: options.sessionToken,
    tenant: options.tenant ?? '',
    workflowId,
    body,
  })
}

/** Node result in context.nodes (request/response for one step). Supports flat (headers, body, status) or nested request/response. */
export interface WorkflowExecutionNodeResult {
  /** Flat: request headers; or use request.headers if present. */
  headers?: Record<string, string>
  /** Flat: response body; or use response.body if present. */
  body?: unknown
  /** Flat: response status; or use response.status if present. */
  status?: number
  /** Optional nested request (headers, body). */
  request?: { headers?: Record<string, string>; body?: unknown }
  /** Optional nested response (status, body). */
  response?: { status?: number; body?: unknown }
  [key: string]: unknown
}

/** Execution context with Webhook and per-node results. */
export interface WorkflowExecutionContext {
  Webhook?: { body?: unknown; headers?: Record<string, string> }
  current?: Record<string, unknown>
  nodes?: Record<string, WorkflowExecutionNodeResult>
  [key: string]: unknown
}

/** Single workflow execution (matches API: id, workflow_id, started_at, finished_at, context). */
export interface WorkflowExecution {
  id?: string
  workflow_id?: string
  workflow_version?: number
  status?: string
  started_at?: string
  finished_at?: string
  context?: WorkflowExecutionContext
  /** Legacy/camelCase aliases */
  workflowId?: string
  workflowName?: string
  startedAt?: string
  completedAt?: string
  steps?: unknown[]
  input?: unknown
  output?: unknown
  error?: string
  [key: string]: unknown
}

/** List workflow executions via launchpad proxy (GET /proxy/workflow/executions?workflow_id=...). Calls Rust backend. */
export async function launchpadWorkflowExecutions(
  baseUrl: string,
  options: { sessionToken: string; tenant: string; workflowId?: string }
): Promise<WorkflowExecution[]> {
  if (!isTauri()) {
    throw new Error('Workflow API is only available in the desktop app')
  }
  const list = await invoke<WorkflowExecution[]>('launchpad_workflow_executions', {
    baseUrl: baseUrl.replace(/\/$/, ''),
    sessionToken: options.sessionToken,
    tenant: options.tenant ?? '',
    workflowId: options.workflowId ?? null,
  })
  return Array.isArray(list) ? list : []
}

const LAUNCHPAD_SESSION_STORAGE_KEY = 'builder_launchpad_session'

export interface LaunchpadSession {
  launchpadId: string
  url: string
  token: string
  /** Tenant ID for X-Tenant-ID header on launchpad API requests. */
  tenant?: string
}

export function setLaunchpadSession(session: LaunchpadSession): void {
  localStorage.setItem(LAUNCHPAD_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function getLaunchpadSession(): LaunchpadSession | null {
  try {
    const raw = localStorage.getItem(LAUNCHPAD_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LaunchpadSession
    if (!parsed?.launchpadId || !parsed?.url || !parsed?.token) return null
    return parsed
  } catch {
    return null
  }
}

export function clearLaunchpadSession(): void {
  localStorage.removeItem(LAUNCHPAD_SESSION_STORAGE_KEY)
}

// ----- Builder settings (API keys, stored in localStorage like launchpad) -----

const BUILDER_SETTINGS_STORAGE_KEY = 'builder_settings'

export type BuilderModelId = 'openai' | 'anthropic' | 'google'

export interface BuilderSettings {
  openaiApiKey?: string
  claudeApiKey?: string
  googleApiKey?: string
  /** Selected model for chat (default: openai). */
  selectedModel?: BuilderModelId
}

function getBuilderSettingsStored(): BuilderSettings {
  try {
    const raw = localStorage.getItem(BUILDER_SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as BuilderSettings
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function setBuilderSettingsStored(settings: BuilderSettings) {
  localStorage.setItem(BUILDER_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function getBuilderSettings(): BuilderSettings {
  return getBuilderSettingsStored()
}

export function setBuilderSettings(updates: Partial<BuilderSettings>): void {
  const current = getBuilderSettingsStored()
  setBuilderSettingsStored({ ...current, ...updates })
}

/** Clear all localStorage except builder settings (API keys, etc.). Call on builder logout. */
export function clearLocalStorageExceptBuilderSettings(): void {
  const preserved = localStorage.getItem(BUILDER_SETTINGS_STORAGE_KEY)
  localStorage.clear()
  if (preserved !== null) {
    localStorage.setItem(BUILDER_SETTINGS_STORAGE_KEY, preserved)
  }
}
