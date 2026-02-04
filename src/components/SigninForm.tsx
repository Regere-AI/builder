import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { signin, sendOTP } from '@/services/api'

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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signin-email">Work Email <span className="text-red-500">*</span></Label>
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
          className={errors.workEmail ? 'border-destructive' : ''}
        />
        {errors.workEmail && (
          <p className="text-sm text-destructive">{errors.workEmail}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signin-password">Password <span className="text-red-500">*</span></Label>
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
          className={errors.password ? 'border-destructive' : ''}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Signing in...' : 'Sign In'}
      </Button>
    </form>
  )
}
