import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { signin, sendOTP } from '@/services/api'
import { Mail, Lock, Loader2 } from 'lucide-react'

interface SigninFormProps {
  onSigninSuccess: (email: string) => void
  onError: (error: string) => void
}

export function SigninForm({ onSigninSuccess, onError }: SigninFormProps) {
  const [workEmail, setWorkEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ workEmail?: string; password?: string }>({})

  const validate = (): boolean => {
    const newErrors: { workEmail?: string; password?: string } = {}

    if (!workEmail.trim()) {
      newErrors.workEmail = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
      newErrors.workEmail = 'Invalid email format'
    }
    if (!password) {
      newErrors.password = 'Password is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) {
      return
    }

    setLoading(true)
    try {
      console.log('Signing in with:', { workEmail })
      // Step 1: Signin
      const signinResponse = await signin({
        workEmail,
        password,
      })
      
      if (signinResponse.success) {
        // Step 2: Send OTP for 2FA (if needed - the API might auto-send, but we'll call it to be safe)
        try {
          await sendOTP({
            email: workEmail,
            purpose: 'LOGIN',
          })
          console.log('OTP sent for 2FA verification')
        } catch (otpError: any) {
          // If sending OTP fails, still proceed to 2FA screen
          // (the code might have been auto-sent by signin API)
          console.warn('Could not send OTP, proceeding anyway:', otpError)
        }
        
        console.log('Signin successful, redirecting to 2FA verification')
        onSigninSuccess(workEmail)
      }
    } catch (error: any) {
      console.error('Signin Error:', error)
      onError(error.message || 'Signin failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-200">Sign In to Your Account</h3>
            <p className="text-sm text-gray-400 mt-1">Enter your credentials to access your account</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <div className="space-y-2">
            <Label htmlFor="signin-email" className="flex items-center gap-2 text-gray-200">
              <Mail className="w-4 h-4" />
              Work Email <span className="text-red-400">*</span>
            </Label>
            <Input
              id="signin-email"
              type="email"
              value={workEmail}
              onChange={(e) => {
                setWorkEmail(e.target.value)
                if (errors.workEmail) {
                  setErrors((prev) => ({ ...prev, workEmail: undefined }))
                }
              }}
              placeholder="Work Email"
              className={`bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500 ${
                errors.workEmail ? 'border-red-500' : ''
              }`}
            />
            {errors.workEmail && (
              <p className="text-sm text-red-400">{errors.workEmail}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="signin-password" className="flex items-center gap-2 text-gray-200">
              <Lock className="w-4 h-4" />
              Password <span className="text-red-400">*</span>
            </Label>
            <Input
              id="signin-password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) {
                  setErrors((prev) => ({ ...prev, password: undefined }))
                }
              }}
              placeholder="Password"
              className={`bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500 ${
                errors.password ? 'border-red-500' : ''
              }`}
            />
            {errors.password && (
              <p className="text-sm text-red-400">{errors.password}</p>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end pt-6 border-t border-[#3e3e3e]">
          <Button type="submit" disabled={loading} className="min-w-[100px] bg-[#007acc] hover:bg-[#005a9e] text-white">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
