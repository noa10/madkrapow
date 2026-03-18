'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, CheckCircle, ArrowLeft, Lock, Eye, EyeOff } from 'lucide-react'

/**
 * Maps Supabase auth error codes to user-friendly messages
 */
function getAuthErrorMessage(error: { code?: string; message?: string }): string {
  const errorMessages: Record<string, string> = {
    invalid_credentials: "Invalid email or password",
    email_not_confirmed: "Please verify your email first",
    too_many_requests: "Too many attempts. Try again later",
    session_expired: "Your session has expired. Please sign in again",
    user_not_found: "Invalid email or password",
    invalid_grant: "Invalid email or password",
    invalid_request: "Invalid request. Please try again",
    invalid_token: "Your session has expired. Please sign in again",
    refresh_token_not_found: "Your session has expired. Please sign in again",
    bad_code_verifier: "Authentication failed. Please try again",
    conflict: "An account with this email already exists",
    email_exists: "An account with this email already exists",
    phone_exists: "An account with this phone number already exists",
    signup_disabled: "Sign up is currently disabled",
    weak_password: "Password is too weak. Please choose a stronger password",
    provider_disabled: "This sign-in method is currently disabled",
    unexpected_failure: "An unexpected error occurred. Please try again",
    // Default fallback
  };

  // Check for network errors
  if (error.message?.toLowerCase().includes("network") ||
      error.message?.toLowerCase().includes("fetch") ||
      error.message?.toLowerCase().includes("connection")) {
    return "Unable to connect. Please check your connection";
  }

  // Return mapped message or fall back to the original message or a generic one
  return errorMessages[error.code || ""] || error.message || "An unexpected error occurred";
}

export default function UpdatePasswordPage() {
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValidLink, setIsValidLink] = useState(true)

  // Check if the reset link is valid (has access_token in hash)
  useEffect(() => {
    const checkSession = async () => {
      // Supabase puts the access token in the URL hash for password recovery
      const hash = window.location.hash
      const hasAccessToken = hash.includes('access_token=') || hash.includes('type=recovery')
      
      if (!hasAccessToken) {
        // Check if there's already a session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setIsValidLink(false)
          setError('Invalid or expired password reset link. Please request a new one.')
        }
      }
    }

    checkSession()
  }, [supabase])

  // Password strength calculation
  const getPasswordStrength = (pwd: string): { score: number; label: string; color: string } => {
    let score = 0
    if (pwd.length >= 8) score++
    if (pwd.match(/[a-z]/)) score++
    if (pwd.match(/[A-Z]/)) score++
    if (pwd.match(/[0-9]/)) score++
    if (pwd.match(/[^a-zA-Z0-9]/)) score++

    const strengthMap = [
      { label: 'Too weak', color: 'bg-red-500' },
      { label: 'Weak', color: 'bg-orange-500' },
      { label: 'Fair', color: 'bg-yellow-500' },
      { label: 'Good', color: 'bg-blue-500' },
      { label: 'Strong', color: 'bg-green-500' },
      { label: 'Very strong', color: 'bg-green-600' },
    ]

    return { score, ...strengthMap[score] }
  }

  const passwordStrength = getPasswordStrength(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters long')
      setIsLoading(false)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        setError(getAuthErrorMessage(updateError))
      } else {
        setIsSuccess(true)
      }
    } catch {
      setError('Unable to connect. Please check your connection')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isValidLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Link Expired</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/auth/reset-password"
            className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Request new link
          </a>
        </div>
      </div>
    )
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Password updated!</h1>
            <p className="text-gray-600 mb-6">
              Your password has been successfully reset. You can now sign in with your new password.
            </p>
            <a
              href="/auth"
              className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
            >
              Sign in
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <a
            href="/auth"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to sign in
          </a>
        </div>

        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Set new password</h1>
          <p className="text-gray-600">
            Enter your new password below.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              New password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1 h-1.5">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`flex-1 rounded-full transition-colors ${
                        passwordStrength.score >= level ? passwordStrength.color : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs ${
                  passwordStrength.score <= 2 ? 'text-red-600' : 
                  passwordStrength.score <= 3 ? 'text-yellow-600' : 'text-green-600'
                }`}>
                  {passwordStrength.label}
                </p>
              </div>
            )}
            
            <p className="text-xs text-gray-500">
              Must be at least 8 characters with uppercase, lowercase, number, and special character
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm password
            </label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            {confirmPassword && password !== confirmPassword && (
              <p className="text-xs text-red-600">Passwords do not match</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading || password !== confirmPassword || password.length < 8}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              'Update password'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
