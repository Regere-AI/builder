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
}

export interface LaunchpadAddInput {
  url: string
  email: string
  password: string
  color?: string
  environment?: LaunchpadEnvironment
  customerName?: string
}

export interface LaunchpadUpdateInput {
  url?: string
  email?: string
  password?: string
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
  const list = getStored().map(({ id, url, email, color, environment, customerName }) => ({
    id,
    url,
    email,
    color: color ?? DEFAULT_LAUNCHPAD_COLOR,
    environment: environment ?? DEFAULT_LAUNCHPAD_ENVIRONMENT,
    customerName: customerName?.trim() || undefined,
  }))
  return Promise.resolve(list)
}

export function launchpadAdd(input: LaunchpadAddInput): Promise<LaunchpadConfig> {
  const url = input.url.trim()
  const email = input.email.trim()
  if (!url || !email) {
    return Promise.reject(new Error('URL and email are required'))
  }
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `lp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const color = input.color?.trim() || DEFAULT_LAUNCHPAD_COLOR
  const environment = input.environment ?? DEFAULT_LAUNCHPAD_ENVIRONMENT
  const customerName = input.customerName?.trim() || undefined
  const stored: StoredLaunchpadConfig = { id, url, email, password: input.password, color, environment, customerName }
  const list = getStored()
  list.push(stored)
  setStored(list)
  return Promise.resolve({ id, url, email, color, environment, customerName })
}

export function launchpadUpdate(id: string, input: LaunchpadUpdateInput): Promise<LaunchpadConfig> {
  const list = getStored()
  const idx = list.findIndex((c) => c.id === id)
  if (idx === -1) return Promise.reject(new Error('Launchpad not found'))
  const current = list[idx]
  const url = input.url !== undefined ? input.url.trim() : current.url
  const email = input.email !== undefined ? input.email.trim() : current.email
  const password = input.password !== undefined ? input.password : current.password
  const color = input.color?.trim() || current.color || DEFAULT_LAUNCHPAD_COLOR
  const environment = input.environment ?? current.environment ?? DEFAULT_LAUNCHPAD_ENVIRONMENT
  const customerName = input.customerName !== undefined ? (input.customerName?.trim() || undefined) : current.customerName
  if (!url || !email) return Promise.reject(new Error('URL and email are required'))
  list[idx] = { ...current, id, url, email, password, color, environment, customerName }
  setStored(list)
  return Promise.resolve({ id, url, email, color, environment, customerName })
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
      }
    : null
}
