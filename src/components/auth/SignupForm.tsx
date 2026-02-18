import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Checkbox } from '../ui/checkbox'
import { StepIndicator } from '../ui/step-indicator'
import { signup, sendOTP, type SignupRequest } from '@/services/api'
import { User, Phone, Building2, Mail, Lock, ArrowLeft, ArrowRight, Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SignupFormProps {
  onSignupSuccess: (email: string) => void
  onError: (error: string) => void
}

const steps = [
  { id: 1, label: 'Personal', icon: <User className="w-5 h-5" /> },
  { id: 2, label: 'Contact', icon: <Phone className="w-5 h-5" /> },
  { id: 3, label: 'Company', icon: <Building2 className="w-5 h-5" /> },
]

export function SignupForm({ onSignupSuccess, onError }: SignupFormProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<SignupRequest>({
    firstName: '',
    lastName: '',
    workEmail: '',
    contactNo: '',
    countryCode: '+91',
    password: '',
    companyName: '',
    industry: '',
    designation: '',
    personalEmail: '',
    acceptTermsAndConditions: false,
  })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof SignupRequest | 'confirmPassword', string>>>({})

  const validatePassword = (password: string): string | null => {
    if (!password) {
      return 'Password is required'
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters'
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter (A-Z)'
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter (a-z)'
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number (0-9)'
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return 'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?'
    }
    return null
  }

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof SignupRequest | 'confirmPassword', string>> = {}

    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required'
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required'
      if (!formData.workEmail.trim()) {
        newErrors.workEmail = 'Work email is required'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.workEmail)) {
        newErrors.workEmail = 'Invalid email format'
      }
      const passwordError = validatePassword(formData.password)
      if (passwordError) {
        newErrors.password = passwordError
      }
      if (!confirmPassword) {
        newErrors.confirmPassword = 'Please confirm your password'
      } else if (formData.password !== confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match'
      }
    } else if (step === 2) {
      if (!formData.contactNo.trim()) {
        newErrors.contactNo = 'Contact number is required'
      }
      if (!formData.personalEmail.trim()) {
        newErrors.personalEmail = 'Personal email is required'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personalEmail)) {
        newErrors.personalEmail = 'Invalid email format'
      }
    } else if (step === 3) {
      if (!formData.companyName.trim()) newErrors.companyName = 'Company name is required'
      if (!formData.industry.trim()) newErrors.industry = 'Industry is required'
      if (!formData.designation.trim()) newErrors.designation = 'Designation is required'
      if (!formData.acceptTermsAndConditions) {
        newErrors.acceptTermsAndConditions = 'You must accept the terms and conditions'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = async () => {
    if (!validateStep(currentStep)) {
      return
    }

      if (currentStep === 3) {
        // Final step - submit form
        setLoading(true)
        try {
          const signupResponse = await signup(formData)
          
          if (signupResponse.success) {
            console.log('Sending OTP to:', formData.workEmail)
            await sendOTP({
              email: formData.workEmail,
              purpose: 'emailVerification',
            })
            
            await new Promise(resolve => setTimeout(resolve, 500))
            onSignupSuccess(formData.workEmail)
          } else {
            // Handle case where API returns success: false but doesn't throw
            const errorMsg = (signupResponse as any)?.error || 'Signup failed. Please try again.'
            onError(errorMsg)
          }
        } catch (error: any) {
          console.error('Signup/OTP Error:', error)
          // Extract error message from error object
          const errorMessage = error?.response?.data?.error || 
                              error?.response?.data?.message || 
                              error?.message || 
                              'Signup failed. Please try again.'
          onError(errorMessage)
        } finally {
          setLoading(false)
        }
    } else {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setErrors({})
    }
  }

  const handleChange = (field: keyof SignupRequest, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
    // Real-time password matching validation when password changes
    if (field === 'password' && confirmPassword) {
      if (confirmPassword !== value) {
        setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }))
      } else {
        setErrors((prev) => ({ ...prev, confirmPassword: undefined }))
      }
    }
  }

  const handleConfirmPasswordChange = (value: string) => {
    setConfirmPassword(value)
    // Real-time password matching validation
    if (value && formData.password && value !== formData.password) {
      setErrors((prev) => ({ ...prev, confirmPassword: 'Passwords do not match' }))
    } else if (errors.confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: undefined }))
    }
  }

  // Real-time password requirements checker
  const getPasswordRequirements = (password: string) => {
    return {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    }
  }

  const passwordRequirements = getPasswordRequirements(formData.password)
  const passwordsMatch = confirmPassword && formData.password && confirmPassword === formData.password
  const showPasswordMismatch = confirmPassword && formData.password && confirmPassword !== formData.password

  const progress = (currentStep / steps.length) * 100
  const getStepTitle = () => {
    switch (currentStep) {
      case 1: return 'Create Your Account'
      case 2: return 'Contact Details'
      case 3: return 'Company Information'
      default: return 'Sign Up'
    }
  }

  const getStepDescription = () => {
    switch (currentStep) {
      case 1: return 'Enter your personal information to get started'
      case 2: return 'Add your contact details'
      case 3: return 'Complete your company information'
      default: return ''
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-bold text-gray-200">{getStepTitle()}</h3>
            <p className="text-sm text-gray-400 mt-1">{getStepDescription()}</p>
          </div>
          <span className="text-sm font-semibold text-gray-400">Step {currentStep} of {steps.length}</span>
        </div>
        <div className="w-full h-2 bg-[#252526] rounded-full overflow-hidden shadow-inner border border-[#3e3e3e]">
          <div
            className="h-full bg-[#007acc] transition-all duration-700 ease-out shadow-sm"
            style={{ width: `${progress}%` }}
          />
        </div>
        <StepIndicator
          steps={steps}
          currentStep={currentStep}
          completedSteps={Array.from({ length: currentStep - 1 }, (_, i) => i + 1)}
        />
      </div>

      {/* Step 1: Personal Information */}
      {currentStep === 1 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="flex items-center gap-2 text-gray-200">
                <User className="w-4 h-4" />
                First Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                placeholder="Firstname"
                className={cn(
                  "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                  errors.firstName ? 'border-red-500' : ''
                )}
              />
              {errors.firstName && (
                <p className="text-sm text-red-400">{errors.firstName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="flex items-center gap-2 text-gray-200">
                <User className="w-4 h-4" />
                Last Name <span className="text-red-400">*</span>
              </Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                placeholder="Lastname"
                className={cn(
                  "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                  errors.lastName ? 'border-red-500' : ''
                )}
              />
              {errors.lastName && (
                <p className="text-sm text-red-400">{errors.lastName}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workEmail" className="flex items-center gap-2 text-gray-200">
              <Mail className="w-4 h-4" />
              Work Email <span className="text-red-400">*</span>
            </Label>
            <Input
              id="workEmail"
              type="email"
              value={formData.workEmail}
              onChange={(e) => handleChange('workEmail', e.target.value)}
              placeholder="Work Email"
              className={cn(
                "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                errors.workEmail ? 'border-red-500' : ''
              )}
            />
            {errors.workEmail && (
              <p className="text-sm text-red-400">{errors.workEmail}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2 text-gray-200">
              <Lock className="w-4 h-4" />
              Password <span className="text-red-400">*</span>
            </Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Password"
              className={cn(
                "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                errors.password ? 'border-red-500' : ''
              )}
            />
            {errors.password && (
              <p className="text-sm text-red-400">{errors.password}</p>
            )}
            {/* Real-time Password Requirements */}
            {formData.password && (
              <div className="mt-2 p-3 bg-[#252526] rounded-md border border-[#3e3e3e]">
                <p className="text-xs font-semibold text-gray-300 mb-2">Password requirements:</p>
                <ul className="space-y-1.5">
                  <li className={`flex items-center gap-2 text-xs transition-colors ${
                    passwordRequirements.minLength ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {passwordRequirements.minLength ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-gray-500" />
                    )}
                    <span>At least 8 characters</span>
                  </li>
                  <li className={`flex items-center gap-2 text-xs transition-colors ${
                    passwordRequirements.hasUppercase ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {passwordRequirements.hasUppercase ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-gray-500" />
                    )}
                    <span>1 Capital Letter (A-Z)</span>
                  </li>
                  <li className={`flex items-center gap-2 text-xs transition-colors ${
                    passwordRequirements.hasLowercase ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {passwordRequirements.hasLowercase ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-gray-500" />
                    )}
                    <span>1 Lowercase Letter (a-z)</span>
                  </li>
                  <li className={`flex items-center gap-2 text-xs transition-colors ${
                    passwordRequirements.hasNumber ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {passwordRequirements.hasNumber ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-gray-500" />
                    )}
                    <span>1 Number (0-9)</span>
                  </li>
                  <li className={`flex items-center gap-2 text-xs transition-colors ${
                    passwordRequirements.hasSpecialChar ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {passwordRequirements.hasSpecialChar ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-gray-500" />
                    )}
                    <span>1 Special Character: ! @ # $ % ^ & * ( ) _ + - = [ ] {'{ }'} ; ' : " \ | , . &lt; &gt; / ?</span>
                  </li>
                </ul>
              </div>
            )}
            {!formData.password && (
              <div className="text-xs text-gray-400 space-y-1">
                <p>Password must contain:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>At least 8 characters</li>
                  <li>One uppercase letter (A-Z)</li>
                  <li>One lowercase letter (a-z)</li>
                  <li>One number (0-9)</li>
                  <li>One special character: ! @ # $ % ^ & * ( ) _ + - = [ ] {'{ }'} ; ' : " \ | , . &lt; &gt; / ?</li>
                </ul>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="flex items-center gap-2 text-gray-200">
              <Lock className="w-4 h-4" />
              Confirm Password <span className="text-red-400">*</span>
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => handleConfirmPasswordChange(e.target.value)}
              placeholder="Confirm Password"
              className={cn(
                "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                showPasswordMismatch
                  ? 'border-red-500'
                  : passwordsMatch
                  ? 'border-green-500'
                  : errors.confirmPassword
                  ? 'border-red-500'
                  : ''
              )}
            />
            {/* Real-time password matching feedback */}
            {confirmPassword && (
              <div className="flex items-center gap-2">
                {passwordsMatch ? (
                  <div className="flex items-center gap-1.5 text-xs text-green-400">
                    <Check className="w-3.5 h-3.5" />
                    <span>Passwords match</span>
                  </div>
                ) : showPasswordMismatch ? (
                  <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <X className="w-3.5 h-3.5" />
                    <span>Passwords do not match</span>
                  </div>
                ) : null}
              </div>
            )}
            {errors.confirmPassword && !showPasswordMismatch && (
              <p className="text-sm text-red-400">{errors.confirmPassword}</p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Contact Information */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="countryCode" className="flex items-center gap-2 text-gray-200">
                <Phone className="w-4 h-4" />
                Country Code <span className="text-red-400">*</span>
              </Label>
              <Input
                id="countryCode"
                value={formData.countryCode}
                onChange={(e) => handleChange('countryCode', e.target.value)}
                placeholder="+91"
                className={cn(
                  "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                  errors.countryCode ? 'border-red-500' : ''
                )}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="contactNo" className="text-gray-200">Contact Number <span className="text-red-400">*</span></Label>
              <Input
                id="contactNo"
                value={formData.contactNo}
                onChange={(e) => handleChange('contactNo', e.target.value)}
                placeholder="Contact Number"
                className={cn(
                  "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                  errors.contactNo ? 'border-red-500' : ''
                )}
              />
              {errors.contactNo && (
                <p className="text-sm text-red-400">{errors.contactNo}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="personalEmail" className="flex items-center gap-2 text-gray-200">
              <Mail className="w-4 h-4" />
              Personal Email <span className="text-red-400">*</span>
            </Label>
            <Input
              id="personalEmail"
              type="email"
              value={formData.personalEmail}
              onChange={(e) => handleChange('personalEmail', e.target.value)}
              placeholder="Personal Email"
              className={cn(
                "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                errors.personalEmail ? 'border-red-500' : ''
              )}
            />
            {errors.personalEmail && (
              <p className="text-sm text-red-400">{errors.personalEmail}</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Company Information */}
      {currentStep === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <div className="space-y-2">
            <Label htmlFor="companyName" className="flex items-center gap-2 text-gray-200">
              <Building2 className="w-4 h-4" />
              Company Name <span className="text-red-400">*</span>
            </Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
              placeholder="Company Name"
              className={cn(
                "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                errors.companyName ? 'border-red-500' : ''
              )}
            />
            {errors.companyName && (
              <p className="text-sm text-red-400">{errors.companyName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry" className="flex items-center gap-2 text-gray-200">
              <Building2 className="w-4 h-4" />
              Industry <span className="text-red-400">*</span>
            </Label>
            <Input
              id="industry"
              value={formData.industry}
              onChange={(e) => handleChange('industry', e.target.value)}
              placeholder="Industry"
              className={cn(
                "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                errors.industry ? 'border-red-500' : ''
              )}
            />
            {errors.industry && (
              <p className="text-sm text-red-400">{errors.industry}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="designation" className="flex items-center gap-2 text-gray-200">
              <User className="w-4 h-4" />
              Designation <span className="text-red-400">*</span>
            </Label>
            <Input
              id="designation"
              value={formData.designation}
              onChange={(e) => handleChange('designation', e.target.value)}
              placeholder="Designation"
              className={cn(
                "bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                errors.designation ? 'border-red-500' : ''
              )}
            />
            {errors.designation && (
              <p className="text-sm text-red-400">{errors.designation}</p>
            )}
          </div>

          <div className="flex items-start space-x-3 pt-4 border-t border-[#3e3e3e]">
            <Checkbox
              id="acceptTerms"
              checked={formData.acceptTermsAndConditions}
              onCheckedChange={(checked) =>
                handleChange('acceptTermsAndConditions', checked === true)
              }
              className={cn(
                "mt-1",
                errors.acceptTermsAndConditions ? 'border-red-500' : ''
              )}
            />
            <Label
              htmlFor="acceptTerms"
              className="text-sm font-normal leading-relaxed cursor-pointer text-gray-200"
            >
              I accept the terms and conditions <span className="text-red-400">*</span>
            </Label>
          </div>
          {errors.acceptTermsAndConditions && (
            <p className="text-sm text-red-400">{errors.acceptTermsAndConditions}</p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-[#3e3e3e]">
        <div>
          {currentStep > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={loading}
              className="min-w-[100px] bg-[#2d2d2d] border-[#3e3e3e] text-gray-200 hover:bg-[#3e3e3e]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
        </div>

        <Button
          type="button"
          onClick={handleNext}
          disabled={loading}
          className="min-w-[100px] bg-[#007acc] hover:bg-[#005a9e] text-white"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              {currentStep === 3 ? 'Create Account' : 'Next'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
