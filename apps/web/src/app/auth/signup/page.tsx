'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, ArrowLeft, CheckCircle, Eye, EyeOff, UserPlus } from 'lucide-react'

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

/** Only allow same-origin relative redirect paths */
function isValidRedirect(redirect: string | null): redirect is string {
  if (!redirect || !redirect.startsWith('/')) return false
  if (redirect.startsWith('//') || redirect.startsWith('\\')) return false
  return true
}

export default function SignUpPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get('redirect')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const redirectUrl = new URL('/auth/callback', window.location.origin)
      if (isValidRedirect(redirectParam)) {
        redirectUrl.searchParams.set('redirect', redirectParam)
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl.toString(),
        },
      })

      if (signUpError) {
        setError(getAuthErrorMessage(signUpError))
      } else {
        setIsSuccess(true)
      }
    } catch {
      setError('Unable to connect. Please check your connection')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    const backHref = isValidRedirect(redirectParam)
      ? `/auth?redirect=${encodeURIComponent(redirectParam)}`
      : '/auth'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
            <p className="text-gray-600 mb-6">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>.
              Check your inbox and follow the instructions to verify your account.
            </p>
            <a
              href={backHref}
              className="inline-flex items-center justify-center h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    )
  }

  const signInHref = isValidRedirect(redirectParam)
    ? `/auth?redirect=${encodeURIComponent(redirectParam)}`
    : '/auth'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <div className="mb-6">
          <a
            href={signInHref}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to sign in
          </a>
        </div>

        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <UserPlus className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Create your account</h1>
          <p className="text-gray-600">
            Enter your details to get started with Mad Krapow.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a password"
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
            <p className="text-xs text-gray-500">
              Must be at least 6 characters
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading || password.length < 6}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <a href={signInHref} className="text-primary hover:text-primary/80 hover:underline font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
