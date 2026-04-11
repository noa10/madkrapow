'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Mail, ArrowLeft, CheckCircle } from 'lucide-react'

/**
 * Maps Supabase auth error codes to user-friendly messages
 */
function getAuthErrorMessage(error: { code?: string; message?: string }): string {
  const errorMessages: Record<string, string> = {
    invalid_credentials: "Invalid email or password",
    email_not_confirmed: "Please verify your email first",
    too_many_requests: "Too many attempts. Try again later",
    session_expired: "Your session has expired. Please sign in again",
    user_not_found: "No account found with this email address",
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

export default function ResetPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      })

      if (error) {
        setError(getAuthErrorMessage(error))
      } else {
        setIsSent(true)
      }
    } catch {
      setError('Unable to connect. Please check your connection')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h1>
            <p className="text-gray-600 mb-6">
              We&apos;ve sent a password reset link to <strong>{email}</strong>. 
              Check your inbox and follow the instructions to reset your password.
            </p>
            <a
              href="/auth"
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
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Reset your password</h1>
          <p className="text-gray-600">
            Enter your email address and we&apos;ll send you a link to reset your password.
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

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Send reset link'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
