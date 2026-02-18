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
