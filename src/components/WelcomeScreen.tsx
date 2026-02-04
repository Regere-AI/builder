import { CheckCircle, Sparkles, ArrowRight, LogOut } from 'lucide-react'
import { Button } from './ui/button'

interface WelcomeScreenProps {
  user: {
    firstName: string
    lastName: string
    email: string
  }
  onLogout: () => void
}

// Helper function to get time-based greeting
const getGreeting = (): string => {
  const hour = new Date().getHours()
  if (hour < 12) {
    return 'Good Morning'
  } else if (hour < 17) {
    return 'Good Afternoon'
  } else {
    return 'Good Evening'
  }
}

export function WelcomeScreen({ user, onLogout }: WelcomeScreenProps) {
  return (
    <div className="w-screen h-screen bg-gray-50 flex flex-col">
      {/* Header Bar */}
      <header className="w-full h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">
          {getGreeting()}, {user.firstName}!
        </div>
        <Button onClick={onLogout} variant="outline" className="flex items-center gap-2">
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="space-y-8 animate-in fade-in zoom-in duration-500">
            {/* Success Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg animate-in zoom-in duration-500">
                  <CheckCircle className="w-14 h-14 text-white" />
                </div>
                <div className="absolute -top-2 -right-2 animate-in zoom-in duration-700 delay-300">
                  <Sparkles className="w-8 h-8 text-yellow-400" />
                </div>
              </div>
            </div>

            {/* Welcome Message */}
            <div className="text-center space-y-3">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Welcome to the Developer Screen, {user.firstName}!
              </h1>
              <p className="text-lg text-muted-foreground">
                Your account has been successfully created and verified. You're all set to get started!
              </p>
            </div>

            {/* Account Details Card */}
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 bg-primary rounded-full" />
                <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Account Details</p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                  <span className="text-sm font-medium text-gray-600">Full Name</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {user.firstName} {user.lastName}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-200 last:border-0">
                  <span className="text-sm font-medium text-gray-600">Email Address</span>
                  <span className="text-sm font-semibold text-gray-900 break-all">{user.email}</span>
                </div>
              </div>
            </div>

            {/* Continue Button */}
            <div className="pt-4">
              <Button
                onClick={() => {
                  // TODO: Navigate to main app or dashboard
                  console.log('Continue to app')
                }}
                className="w-full h-12 text-base font-semibold group"
                size="lg"
              >
                Get Started
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
