import { useState, useEffect } from 'react'
import { SignupForm } from './components/auth/SignupForm'
import { SigninForm } from './components/auth/SigninForm'
import { VerificationCode } from './components/auth/VerificationCode'
import { LicenseValidation } from './components/auth/LicenseValidation'
import { IDELayout } from './components/ide/IDELayout'
import { cn } from './lib/utils'
import { Mail, Lock } from 'lucide-react'

type View = 'signup' | 'signin' | 'otp' | '2fa' | 'license' | 'welcome'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
}

function App() {
  const [currentView, setCurrentView] = useState<View>('signup')
  const [activeTab, setActiveTab] = useState<'signup' | 'signin'>('signup')
  const [userEmail, setUserEmail] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSignupSuccess = (email: string) => {
    setUserEmail(email)
    setCurrentView('otp')
    setError(null)
  }

  const handleSigninSuccess = (email: string) => {
    setUserEmail(email)
    setCurrentView('2fa')
    setError(null)
  }

  const handleOTPSuccess = (token: string, userData: User) => {
    console.log('handleOTPSuccess called with:', { token, userData })
    // After signup OTP, redirect to signin screen
    // Store token and user data temporarily (will be used after login)
    localStorage.setItem('signupToken', token)
    localStorage.setItem('signupUserData', JSON.stringify(userData))
    // Redirect to signin screen
    setCurrentView('signin')
    setActiveTab('signin')
    setError(null)
    // Show success message
    console.log('Signup successful, redirecting to signin')
  }

  const handle2FASuccess = (token: string, userData: User) => {
    console.log('handle2FASuccess called with:', { token, userData })
    // After login 2FA, redirect to license validation
    // Store token and user data for session persistence
    localStorage.setItem('authToken', token)
    localStorage.setItem('userData', JSON.stringify(userData))
    // Set user and view state to trigger redirect to license validation
    setUser(userData)
    setCurrentView('license')
    setError(null)
    console.log('2FA successful, redirecting to license validation')
  }

  const handleLicenseValidationSuccess = () => {
    console.log('License validation successful, redirecting to dashboard')
    // After license validation, redirect to dashboard
    // User data and token are already stored from handle2FASuccess
    if (user) {
      setCurrentView('welcome')
      setError(null)
    } else {
      // If no user in state, redirect back to signin
      setCurrentView('signin')
      setError('Session expired. Please sign in again.')
    }
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

  const handleTabSwitch = (tab: 'signup' | 'signin') => {
    setActiveTab(tab)
    setCurrentView(tab)
    setError(null)
  }

  const handleLogout = () => {
    // Remove auth token and user data from localStorage
    localStorage.removeItem('authToken')
    localStorage.removeItem('userData')
    // Clear user state
    setUser(null)
    // Reset view to signin
    setCurrentView('signin')
    // Clear any errors
    setError(null)
    // Reset active tab to signin
    setActiveTab('signin')
  }

  // Restore session from localStorage on app mount
  useEffect(() => {
    const token = localStorage.getItem('authToken')
    const userDataStr = localStorage.getItem('userData')
    
    if (token && userDataStr) {
      try {
        const userData = JSON.parse(userDataStr) as User
        // Validate that userData has required fields
        if (userData.id && userData.email && userData.firstName && userData.lastName) {
          setUser(userData)
          setCurrentView('welcome')
          setActiveTab('signin')
          console.log('Session restored from localStorage')
        } else {
          // Invalid user data structure, clear it
          console.warn('Invalid user data structure, clearing localStorage')
          localStorage.removeItem('authToken')
          localStorage.removeItem('userData')
        }
      } catch (error) {
        console.error('Failed to parse user data from localStorage:', error)
        // Clear corrupted data
        localStorage.removeItem('authToken')
        localStorage.removeItem('userData')
      }
    } else if (token || userDataStr) {
      // Only one exists, clear both to maintain consistency
      console.warn('Incomplete session data, clearing localStorage')
      localStorage.removeItem('authToken')
      localStorage.removeItem('userData')
    }
  }, []) // Run only on mount

  // Debug: Log view changes
  useEffect(() => {
    console.log('Current view changed to:', currentView, 'User:', user)
  }, [currentView, user])

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center",
      currentView !== 'welcome' && "bg-[#1e1e1e]"
    )}>
      <div className="w-full">
        {currentView === 'welcome' && user ? (
          <IDELayout user={user} onLogout={handleLogout}  />
        ) : currentView === 'otp' ? (
          <>
            <VerificationCode
              email={userEmail}
              purpose="emailVerification"
              title="Verify Your Email"
              icon={<Mail className="w-10 h-10 text-[#007acc]" />}
              buttonText="Verify Email"
              onVerificationSuccess={handleOTPSuccess}
              onError={handleError}
            />
            {error && (
              <div className="max-w-3xl mx-auto mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg animate-in slide-in-from-top duration-300">
                <p className="text-sm text-red-400 font-medium">{error}</p>
              </div>
            )}
          </>
        ) : currentView === '2fa' ? (
          <>
            <VerificationCode
              email={userEmail}
              purpose="login"
              title="Two-Factor Authentication"
              icon={<Lock className="w-10 h-10 text-[#007acc]" />}
              buttonText="Verify & Continue"
              onVerificationSuccess={handle2FASuccess}
              onError={handleError}
            />
            {error && (
              <div className="max-w-3xl mx-auto mt-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg animate-in slide-in-from-top duration-300">
                <p className="text-sm text-red-400 font-medium">{error}</p>
              </div>
            )}
          </>
        ) : currentView === 'license' ? (
          <LicenseValidation
            onValidationSuccess={handleLicenseValidationSuccess}
            onError={handleError}
          />
        ) : (
          <div className="w-full max-w-4xl mx-auto p-4">
            <div className="bg-[#2d2d2d] rounded-lg shadow-lg overflow-hidden border border-[#3e3e3e]">
              {/* Toggle Tabs */}
              <div className="flex border-b border-[#3e3e3e] bg-[#252526]">
                <button
                  onClick={() => handleTabSwitch('signup')}
                  className={cn(
                    'flex-1 px-10 py-6 text-base font-bold transition-all duration-300 relative',
                    activeTab === 'signup'
                      ? 'bg-[#2d2d2d] text-gray-200'
                      : 'bg-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2a2d2e]'
                  )}
                >
                  <span className="relative z-10">Sign Up</span>
                  {activeTab === 'signup' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#007acc]" />
                  )}
                </button>
                <button
                  onClick={() => handleTabSwitch('signin')}
                  className={cn(
                    'flex-1 px-10 py-6 text-base font-bold transition-all duration-300 relative',
                    activeTab === 'signin'
                      ? 'bg-[#2d2d2d] text-gray-200'
                      : 'bg-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2a2d2e]'
                  )}
                >
                  <span className="relative z-10">Sign In</span>
                  {activeTab === 'signin' && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#007acc]" />
                  )}
                </button>
              </div>

              {/* Form Content */}
              <div className="px-10 py-10">
                {error && (
                  <div className="mb-6 p-4 bg-red-900/20 border-l-4 border-red-500 rounded-r-lg animate-in slide-in-from-top duration-300">
                    <p className="text-sm text-red-400 font-semibold">{error}</p>
                  </div>
                )}
                {activeTab === 'signup' ? (
                  <SignupForm
                    onSignupSuccess={handleSignupSuccess}
                    onError={handleError}
                  />
                ) : (
                  <SigninForm
                    onSigninSuccess={handleSigninSuccess}
                    onError={handleError}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
