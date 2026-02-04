import { useState, useEffect } from 'react'
import { SignupForm } from './components/SignupForm'
import { SigninForm } from './components/SigninForm'
import { VerificationCode } from './components/VerificationCode'
import { WelcomeScreen } from './components/WelcomeScreen'
import { cn } from './lib/utils'
import { Mail, Lock } from 'lucide-react'

// Extend Window interface to include our custom APIs
declare global {
  interface Window {
    electronAPI?: {
      platform?: string
      versions?: {
        node: string
        chrome: string
        electron: string
      }
      getEnv: (key: string) => Promise<string | null>
    }
    ipcRenderer?: {
      on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      off: (channel: string, listener: (event: any, ...args: any[]) => void) => void
      send: (channel: string, ...args: any[]) => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
  }
}

type View = 'signup' | 'signin' | 'otp' | '2fa' | 'welcome'

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
    // Store token and user data for session persistence
    localStorage.setItem('authToken', token)
    localStorage.setItem('userData', JSON.stringify(userData))
    // Set user and view state to trigger redirect to welcome screen
    setUser(userData)
    setCurrentView('welcome')
    setError(null)
    console.log('State updated - should redirect to welcome screen now')
  }

  const handle2FASuccess = (token: string, userData: User) => {
    console.log('handle2FASuccess called with:', { token, userData })
    // Store token and user data for session persistence
    localStorage.setItem('authToken', token)
    localStorage.setItem('userData', JSON.stringify(userData))
    // Set user and view state to trigger redirect to welcome screen
    setUser(userData)
    setCurrentView('welcome')
    setError(null)
    console.log('State updated - should redirect to welcome screen now')
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
    <div className="min-h-screen bg-gradient-to-br from-gray-200 via-gray-400 to-black flex items-center justify-center p-4">
      <div className="w-full">
        {currentView === 'welcome' && user ? (
          <WelcomeScreen user={user} onLogout={handleLogout} />
        ) : currentView === 'otp' ? (
          <>
            <VerificationCode
              email={userEmail}
              purpose="emailVerification"
              title="Verify Your Email"
              icon={<Mail className="w-10 h-10 text-primary" />}
              buttonText="Verify Email"
              onVerificationSuccess={handleOTPSuccess}
              onError={handleError}
            />
            {error && (
              <div className="max-w-3xl mx-auto mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg animate-in slide-in-from-top duration-300">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}
          </>
        ) : currentView === '2fa' ? (
          <>
            <VerificationCode
              email={userEmail}
              purpose="login"
              title="Two-Factor Authentication"
              icon={<Lock className="w-10 h-10 text-primary" />}
              buttonText="Verify & Continue"
              onVerificationSuccess={handle2FASuccess}
              onError={handleError}
            />
            {error && (
              <div className="max-w-3xl mx-auto mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg animate-in slide-in-from-top duration-300">
                <p className="text-sm text-destructive font-medium">{error}</p>
              </div>
            )}
          </>
        ) : (
          <div className="w-full max-w-4xl mx-auto">
            <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden border border-gray-100">
              {/* Toggle Tabs */}
              <div className="flex border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
                <button
                  onClick={() => handleTabSwitch('signup')}
                  className={cn(
                    'flex-1 px-10 py-6 text-base font-bold transition-all duration-300 relative',
                    activeTab === 'signup'
                      ? 'bg-gradient-to-br from-gray-800 to-gray-800 text-white shadow-lg'
                      : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50/50'
                  )}
                >
                  <span className="relative z-10">Sign Up</span>
                  {activeTab === 'signup' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-t-full" />
                  )}
                </button>
                <button
                  onClick={() => handleTabSwitch('signin')}
                  className={cn(
                    'flex-1 px-10 py-6 text-base font-bold transition-all duration-300 relative',
                    activeTab === 'signin'
                      ? 'bg-gradient-to-br from-gray-900 to-gray-800 text-white shadow-lg'
                      : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50/50'
                  )}
                >
                  <span className="relative z-10">Sign In</span>
                  {activeTab === 'signin' && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white rounded-t-full" />
                  )}
                </button>
              </div>

              {/* Form Content */}
              <div className="px-10 py-10">
                {error && (
                  <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg animate-in slide-in-from-top duration-300">
                    <p className="text-sm text-red-800 font-semibold">{error}</p>
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
