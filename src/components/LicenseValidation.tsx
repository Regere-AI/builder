import { useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { validateLicense } from '@/services/api'
import { Key, Loader2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LicenseValidationProps {
  onValidationSuccess: () => void
  onError: (error: string) => void
}

export function LicenseValidation({ onValidationSuccess, onError }: LicenseValidationProps) {
  const [licenseKey, setLicenseKey] = useState('')
  const [isValidatingLicense, setIsValidatingLicense] = useState(false)
  const [licenseValidationStatus, setLicenseValidationStatus] = useState<'unvalidated' | 'valid' | 'invalid' | 'error'>('unvalidated')
  const [licenseValidationMessage, setLicenseValidationMessage] = useState('')

  const handleValidateLicense = async () => {
    if (!licenseKey.trim()) {
      setLicenseValidationStatus('error')
      setLicenseValidationMessage('Please enter a license key')
      onError('Please enter a license key')
      return
    }

    setIsValidatingLicense(true)
    setLicenseValidationStatus('unvalidated')
    setLicenseValidationMessage('')

    try {
      const response = await validateLicense({ licenseKey: licenseKey.trim() })
      
      // Check if validator is true and status is active, inactive, or pending (not expired)
      const validStatuses = ['active', 'inactive', 'pending']
      const isValid = response.validator === true && validStatuses.includes(response.status.toLowerCase())
      
      if (isValid) {
        setLicenseValidationStatus('valid')
        setLicenseValidationMessage(response.message || 'License key is valid')
        // Call success handler after a brief delay to show success message
        setTimeout(() => {
          onValidationSuccess()
        }, 500)
      } else {
        setLicenseValidationStatus('invalid')
        setLicenseValidationMessage(response.message || 'License key is invalid or expired')
        onError(response.message || 'License key is invalid or expired')
      }
    } catch (error: any) {
      console.error('License validation error:', error)
      setLicenseValidationStatus('error')
      const errorMessage = error?.message || 'Failed to validate license key. Please try again.'
      setLicenseValidationMessage(errorMessage)
      onError(errorMessage)
    } finally {
      setIsValidatingLicense(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-[#2d2d2d] rounded-lg shadow-lg overflow-hidden border border-[#3e3e3e]">
        <div className="bg-[#252526] px-10 py-8 border-b border-[#3e3e3e]">
          <h2 className="text-3xl font-bold text-gray-200 tracking-tight">License Validation</h2>
          <p className="text-base text-gray-400 mt-2 font-medium">Please enter your license key to continue</p>
        </div>

        <div className="px-10 py-10">
          <div className="space-y-8">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-[#252526] border border-[#3e3e3e] flex items-center justify-center animate-in zoom-in duration-500">
                <Key className="w-10 h-10 text-[#007acc]" />
              </div>
            </div>

            <div className="space-y-6 animate-in fade-in slide-in-from-bottom duration-300">
              <div className="space-y-3">
                <Label htmlFor="licenseKey" className="text-center block text-gray-200">
                  <Key className="w-5 h-5 inline mr-2" />
                  Enter License Key
                </Label>
                <Input
                  id="licenseKey"
                  type="text"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="Enter your license key"
                  className={cn(
                    "text-center text-lg font-mono h-14 bg-[#252526] border-[#3e3e3e] text-gray-200 placeholder:text-gray-500",
                    licenseValidationStatus === 'valid'
                      ? 'border-green-500'
                      : licenseValidationStatus === 'invalid' || licenseValidationStatus === 'error'
                      ? 'border-red-500'
                      : ''
                  )}
                  disabled={isValidatingLicense}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isValidatingLicense) {
                      handleValidateLicense()
                    }
                  }}
                />
                <p className="text-xs text-gray-400 text-center">
                  Enter the license key provided to you
                </p>
              </div>

              {licenseValidationStatus !== 'unvalidated' && (
                <div
                  className={cn(
                    "flex items-center justify-center gap-2 text-sm p-3 rounded-lg",
                    licenseValidationStatus === 'valid'
                      ? 'bg-green-900/20 text-green-400 border border-green-500/50'
                      : licenseValidationStatus === 'invalid' || licenseValidationStatus === 'error'
                      ? 'bg-red-900/20 text-red-400 border border-red-500/50'
                      : ''
                  )}
                >
                  {licenseValidationStatus === 'valid' ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                  <span>{licenseValidationMessage}</span>
                </div>
              )}

              <Button 
                type="button"
                onClick={handleValidateLicense}
                className="w-full h-12 text-base font-semibold bg-[#007acc] hover:bg-[#005a9e] text-white" 
                disabled={isValidatingLicense || !licenseKey.trim()}
              >
                {isValidatingLicense ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Key className="w-5 h-5 mr-2" />
                    Validate License
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
