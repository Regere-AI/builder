import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Checkbox } from './ui/checkbox'
import { StepIndicator } from './ui/step-indicator'
import { signup, sendOTP, type SignupRequest } from '@/services/api'
import { User, Phone, Building2, Mail, Lock, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'

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
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof SignupRequest, string>>>({})

  const validateStep = (step: number): boolean => {
    const newErrors: Partial<Record<keyof SignupRequest, string>> = {}

    if (step === 1) {
      if (!formData.firstName.trim()) newErrors.firstName = 'First name is required'
      if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required'
      if (!formData.workEmail.trim()) {
        newErrors.workEmail = 'Work email is required'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.workEmail)) {
        newErrors.workEmail = 'Invalid email format'
      }
      if (!formData.password) {
        newErrors.password = 'Password is required'
      } else if (formData.password.length < 8) {
        newErrors.password = 'Password must be at least 8 characters'
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
        }
      } catch (error: any) {
        console.error('Signup/OTP Error:', error)
        onError(error.message || 'Signup failed. Please try again.')
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
  }

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
            <h3 className="text-2xl font-bold text-gray-900">{getStepTitle()}</h3>
            <p className="text-sm text-gray-600 mt-1">{getStepDescription()}</p>
          </div>
          <span className="text-sm font-semibold text-gray-500">Step {currentStep} of {steps.length}</span>
        </div>
        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 transition-all duration-700 ease-out shadow-sm"
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
              <Label htmlFor="firstName" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="firstName"
                value={formData.firstName}
                onChange={(e) => handleChange('firstName', e.target.value)}
                placeholder="Firstname"
                className={errors.firstName ? 'border-destructive' : ''}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lastName" className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Last Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="lastName"
                value={formData.lastName}
                onChange={(e) => handleChange('lastName', e.target.value)}
                placeholder="Lastname"
                className={errors.lastName ? 'border-destructive' : ''}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workEmail" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Work Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="workEmail"
              type="email"
              value={formData.workEmail}
              onChange={(e) => handleChange('workEmail', e.target.value)}
              placeholder="Work Email"
              className={errors.workEmail ? 'border-destructive' : ''}
            />
            {errors.workEmail && (
              <p className="text-sm text-destructive">{errors.workEmail}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Password <span className="text-red-500">*</span>
            </Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              placeholder="Password"
              className={errors.password ? 'border-destructive' : ''}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
            <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
          </div>
        </div>
      )}

      {/* Step 2: Contact Information */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="countryCode" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Country Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="countryCode"
                value={formData.countryCode}
                onChange={(e) => handleChange('countryCode', e.target.value)}
                placeholder="+91"
                className={errors.countryCode ? 'border-destructive' : ''}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="contactNo">Contact Number <span className="text-red-500">*</span></Label>
              <Input
                id="contactNo"
                value={formData.contactNo}
                onChange={(e) => handleChange('contactNo', e.target.value)}
                placeholder="Contact Number"
                className={errors.contactNo ? 'border-destructive' : ''}
              />
              {errors.contactNo && (
                <p className="text-sm text-destructive">{errors.contactNo}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="personalEmail" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Personal Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="personalEmail"
              type="email"
              value={formData.personalEmail}
              onChange={(e) => handleChange('personalEmail', e.target.value)}
              placeholder="Personal Email"
              className={errors.personalEmail ? 'border-destructive' : ''}
            />
            {errors.personalEmail && (
              <p className="text-sm text-destructive">{errors.personalEmail}</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Company Information */}
      {currentStep === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <div className="space-y-2">
            <Label htmlFor="companyName" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Company Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="companyName"
              value={formData.companyName}
              onChange={(e) => handleChange('companyName', e.target.value)}
              placeholder="Company Name"
              className={errors.companyName ? 'border-destructive' : ''}
            />
            {errors.companyName && (
              <p className="text-sm text-destructive">{errors.companyName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Industry <span className="text-red-500">*</span>
            </Label>
            <Input
              id="industry"
              value={formData.industry}
              onChange={(e) => handleChange('industry', e.target.value)}
              placeholder="Industry"
              className={errors.industry ? 'border-destructive' : ''}
            />
            {errors.industry && (
              <p className="text-sm text-destructive">{errors.industry}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="designation" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Designation <span className="text-red-500">*</span>
            </Label>
            <Input
              id="designation"
              value={formData.designation}
              onChange={(e) => handleChange('designation', e.target.value)}
              placeholder="Designation"
              className={errors.designation ? 'border-destructive' : ''}
            />
            {errors.designation && (
              <p className="text-sm text-destructive">{errors.designation}</p>
            )}
          </div>

          <div className="flex items-start space-x-3 pt-4 border-t border-gray-200">
            <Checkbox
              id="acceptTerms"
              checked={formData.acceptTermsAndConditions}
              onCheckedChange={(checked) =>
                handleChange('acceptTermsAndConditions', checked === true)
              }
              className={errors.acceptTermsAndConditions ? 'border-destructive mt-1' : 'mt-1'}
            />
            <Label
              htmlFor="acceptTerms"
              className="text-sm font-normal leading-relaxed cursor-pointer"
            >
              I accept the terms and conditions <span className="text-red-500">*</span>
            </Label>
          </div>
          {errors.acceptTermsAndConditions && (
            <p className="text-sm text-destructive">{errors.acceptTermsAndConditions}</p>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        <div>
          {currentStep > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={loading}
              className="min-w-[100px]"
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
          className="min-w-[100px]"
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
