import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { verifyOTP, verify2FA } from '@/services/api'
import { Shield, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface VerificationCodeProps {
  email: string
  purpose: 'emailVerification' | 'login'
  title: string
  icon: ReactNode
  buttonText: string
  inputId?: string
  onVerificationSuccess: (token: string, user: { id: string; email: string; firstName: string; lastName: string }) => void
  onError: (error: string) => void
}

export function VerificationCode({ 
  email, 
  purpose, 
  title, 
  icon, 
  buttonText, 
  inputId,
  onVerificationSuccess, 
  onError 
}: VerificationCodeProps) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  // Generate input ID based on purpose if not provided
  const finalInputId = inputId || (purpose === 'emailVerification' ? 'otp' : '2fa-code')
  
  // Error messages based on purpose
  const validationError = purpose === 'emailVerification' 
    ? 'Please enter a 6-digit OTP' 
    : 'Please enter a 6-digit code'
  const failureError = purpose === 'emailVerification'
    ? 'OTP verification failed. Please try again.'
    : '2FA verification failed. Please try again.'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (code.length !== 6) {
      onError(validationError)
      return
    }

    setLoading(true)
    try {
      // Call appropriate API function based on purpose
      let response
      if (purpose === 'emailVerification') {
        response = await verifyOTP({
          email: email,
          code: code,
          purpose: 'emailVerification' as const,
        })
      } else {
        response = await verify2FA({
          email: email,
          code: code,
          purpose: 'login' as const,
        })
      }

      if (response.success) {
        onVerificationSuccess(response.data.token, response.data.user)
      } else {
        onError(failureError)
      }
    } catch (error: any) {
      console.error(`${purpose === 'emailVerification' ? 'OTP' : '2FA'} Verification Error:`, error)
      onError(error.message || failureError)
    } finally {
      setLoading(false)
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(value)
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-[#2d2d2d] rounded-lg shadow-lg overflow-hidden border border-[#3e3e3e]">
        <div className="bg-[#252526] px-10 py-8 border-b border-[#3e3e3e]">
          <h2 className="text-3xl font-bold text-gray-200 tracking-tight">{title}</h2>
          <p className="text-base text-gray-400 mt-2 font-medium">We've sent a verification code to {email}</p>
        </div>

        <div className="px-10 py-10">
          <div className="space-y-8">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-[#252526] border border-[#3e3e3e] flex items-center justify-center animate-in zoom-in duration-500">
                {icon}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom duration-300">
              <div className="space-y-3">
                <Label htmlFor={finalInputId} className="text-center block text-gray-200">
                  <Shield className="w-5 h-5 inline mr-2" />
                  Enter Verification Code
                </Label>
                <Input
                  id={finalInputId}
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={handleCodeChange}
                  placeholder="000000"
                  maxLength={6}
                  className="text-center text-3xl tracking-[0.5em] font-mono h-16 bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500"
                  autoFocus
                />
                <p className="text-xs text-gray-400 text-center">
                  Enter the 6-digit code sent to your email
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-base font-semibold bg-[#007acc] hover:bg-[#005a9e] text-white" 
                disabled={loading || code.length !== 6}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 mr-2" />
                    {buttonText}
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
