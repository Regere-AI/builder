import axios from 'axios'
import { getEnv } from '@/desktop'

// Default API base URL
const DEFAULT_API_BASE_URL = 'http://localhost:3010'

// Get API base URL from environment or use default
async function getApiBaseUrl(): Promise<string> {
  try {
    const baseUrl = await getEnv('STACK_GUARD_API_BASE_URL')
    if (baseUrl) {
      console.log('Using API base URL from environment:', baseUrl)
      return baseUrl
    }
  } catch (error) {
    console.warn('Could not get STACK_GUARD_API_BASE_URL from environment, using default:', error)
  }
  console.log('Using default API base URL:', DEFAULT_API_BASE_URL)
  return DEFAULT_API_BASE_URL
}
// Types
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

// Get API key from environment (must match .env: REGERE-API-KEY)
async function getApiKey(): Promise<string> {
  const apiKey = await getEnv('REGERE-API-KEY')
  if (!apiKey) {
    throw new Error('REGERE-API-KEY not found in environment variables')
  }
  return apiKey
}

// Create axios instance factory that gets base URL dynamically
async function createApiClient() {
  const baseURL = await getApiBaseUrl()
  return axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

// Signup function
export async function signup(data: SignupRequest): Promise<SignupResponse> {
  try {
    const apiClient = await createApiClient()
    const apiKey = await getApiKey()
    const response = await apiClient.post<SignupResponse>(
      '/api/auth/developer/signup',
      data,
      {
        headers: {
          'REGERE-API-KEY': apiKey,
        },
      }
    )
    return response.data
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      // Try to extract a more detailed error message
      const errorMessage = 
        error.response?.data?.error ||
        error.response?.data?.message || 
        (error.response?.data && typeof error.response.data === 'string' ? error.response.data : null) ||
        error.message || 
        'Signup failed'
      
      throw new Error(errorMessage)
    }
    throw error
  }
}

// Send OTP function
export async function sendOTP(data: SendOTPRequest): Promise<SendOTPResponse> {
  try {
    const apiClient = await createApiClient()
    const apiKey = await getApiKey()
    const response = await apiClient.post<SendOTPResponse>(
      '/api/auth/send-otp',
      data,
      {
        headers: {
          'REGERE-API-KEY': apiKey,
        },
      }
    )
    return response.data
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || error.message || 'Failed to send OTP'
      )
    }
    throw error
  }
}

// Verify OTP function
export async function verifyOTP(
  data: VerifyOTPRequest
): Promise<VerifyOTPResponse> {
  try {
    const apiClient = await createApiClient()
    // Note: verify-otp endpoint does not require REGERE-API-KEY header
    const response = await apiClient.post<VerifyOTPResponse>(
      '/api/auth/verify-otp',
      data
    )
    return response.data
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      // Log the full error for debugging
      console.error('Verify OTP Error:', {
        status: error.response?.status,
        data: error.response?.data,
        requestData: data,
      })
      
      // Try to extract a more detailed error message
      const errorMessage = 
        error.response?.data?.message || 
        error.response?.data?.error ||
        (error.response?.data && typeof error.response.data === 'string' ? error.response.data : null) ||
        error.message || 
        'OTP verification failed'
      
      throw new Error(errorMessage)
    }
    throw error
  }
}

// Signin function
export async function signin(data: SigninRequest): Promise<SigninResponse> {
  try {
    const apiClient = await createApiClient()
    const apiKey = await getApiKey()
    const response = await apiClient.post<SigninResponse>(
      '/api/auth/developer/signin',
      data,
      {
        headers: {
          'REGERE-API-KEY': apiKey,
        },
      }
    )
    return response.data
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.message || error.message || 'Signin failed'
      )
    }
    throw error
  }
}

// Verify 2FA function (for login)
export async function verify2FA(
  data: Verify2FARequest
): Promise<Verify2FAResponse> {
  try {
    const apiClient = await createApiClient()
    // Note: verify-2fa endpoint does not require REGERE-API-KEY header
    const response = await apiClient.post<Verify2FAResponse>(
      '/api/auth/verify-2fa',
      data
    )
    return response.data
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error('Verify 2FA Error:', {
        status: error.response?.status,
        data: error.response?.data,
        requestData: data,
      })
      
      const errorMessage = 
        error.response?.data?.message || 
        error.response?.data?.error ||
        (error.response?.data && typeof error.response.data === 'string' ? error.response.data : null) ||
        error.message || 
        '2FA verification failed'
      
      throw new Error(errorMessage)
    }
    throw error
  }
}

// Validate license function
export async function validateLicense(
  data: ValidateLicenseRequest
): Promise<ValidateLicenseResponse> {
  try {
    const apiClient = await createApiClient()
    const apiKey = await getApiKey()
    const response = await apiClient.post<ValidateLicenseResponse>(
      '/api/licenses/validate',
      data,
      {
        headers: {
          'REGERE-API-KEY': apiKey,
        },
      }
    )
    return response.data
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error('Validate License Error:', {
        status: error.response?.status,
        data: error.response?.data,
        requestData: data,
      })
      
      const errorMessage = 
        error.response?.data?.message || 
        error.response?.data?.error ||
        (error.response?.data && typeof error.response.data === 'string' ? error.response.data : null) ||
        error.message || 
        'License validation failed'
      
      throw new Error(errorMessage)
    }
    throw error
  }
}
