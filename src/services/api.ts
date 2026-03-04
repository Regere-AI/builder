/**
 * API layer: frontend-only types and Tauri invoke wrappers.
 * All HTTP calls are performed in Rust (src-tauri/src/api.rs).
 */

import { invoke } from '@tauri-apps/api/core'

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

/** Login to launchpad (Auth Proxy: POST /login/email-password). Returns sessionToken on success.
 * Uses tenant from launchpad config in the X-Tenant-ID header. */
export async function launchpadLogin(
  baseUrl: string,
  tenant: string,
  email: string,
  password: string
): Promise<{ sessionToken: string }> {
  const url = baseUrl.replace(/\/$/, '') + '/login/email-password'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Tenant-ID': tenant, // tenant from launchpad config
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const text = await res.text()
    let message = `Login failed (${res.status})`
    try {
      const json = JSON.parse(text) as { message?: string; error?: string }
      message = json.message ?? json.error ?? message
    } catch {
      if (text) message = text.slice(0, 200)
    }
    throw new Error(message)
  }
  const data = (await res.json()) as { sessionToken?: string }
  if (!data.sessionToken) {
    throw new Error('Login succeeded but no session token returned')
  }
  return { sessionToken: data.sessionToken }
}

/** Launchpad health check (GET /health - Architect SDK health check). Returns true if healthy. */
export async function launchpadHealthCheck(baseUrl: string): Promise<boolean> {
  const url = baseUrl.replace(/\/$/, '') + '/health'
  const res = await fetch(url, { method: 'GET' })
  return res.ok
}

/** Launchpad session logout (POST /session/logout). Send Authorization: Bearer {sessionToken}. */
export async function launchpadLogout(baseUrl: string, sessionToken: string): Promise<void> {
  const url = baseUrl.replace(/\/$/, '') + '/session/logout'
  await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  })
  // Best-effort: don't throw on non-ok so switch still proceeds
}

const LAUNCHPAD_SESSION_STORAGE_KEY = 'builder_launchpad_session'

export interface LaunchpadSession {
  launchpadId: string
  url: string
  token: string
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
