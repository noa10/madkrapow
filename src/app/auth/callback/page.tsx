'use client'

import { createClient } from '@/lib/supabase/client'
import { isAdminUser } from '@/lib/auth/roles'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

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
    access_denied: "Access was denied. Please try again",
    callback_error: "Authentication failed. Please try again",
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

export default function AuthCallbackPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for password recovery flow (access_token in hash)
        const hash = window.location.hash
        const hashParams = new URLSearchParams(hash.replace('#', ''))
        const type = hashParams.get('type')
        const accessToken = hashParams.get('access_token')

        // Handle password recovery flow
        if (type === 'recovery' && accessToken) {
          // The session is automatically set by Supabase when the URL has access_token
          // We just need to redirect to the update-password page
          window.location.href = '/auth/update-password'
          return
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          setError(getAuthErrorMessage(sessionError))
          setLoading(false)
          return
        }

        if (session) {
          window.location.href = isAdminUser(session.user) ? '/admin' : '/'
          return
        }

        const urlParams = new URL(window.location.href)
        const params = new URLSearchParams(urlParams.search)
        const code = params.get('code')
        const errorCode = params.get('error_code')
        const errorDescription = params.get('error_description')

        if (errorCode) {
          const urlError = {
            code: errorCode,
            message: errorDescription || 'Authentication failed'
          };
          setError(getAuthErrorMessage(urlError))
          setLoading(false)
          return
        }

        if (code) {
          const { data: { session: newSession }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Code exchange error:', exchangeError)
            setError(getAuthErrorMessage(exchangeError))
          } else if (newSession) {
            window.location.href = isAdminUser(newSession.user) ? '/admin' : '/'
            return
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Callback error:', err)
        setError('Unable to connect. Please check your connection')
        setLoading(false)
      }
    }

    handleCallback()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 px-10 py-12 text-center shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[var(--gold-strong)]" />
          <p className="text-[#d8d1c6]">Signing you in...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-white/5 p-8 text-center shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <h1 className="mb-4 text-2xl font-bold text-white">Authentication Error</h1>
        <p className="mb-6 text-[#d8d1c6]" role="alert" aria-live="assertive">
          {error || 'Something went wrong'}
        </p>
        <a
          href="/auth"
          className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-5 font-medium text-black hover:brightness-105"
        >
          Try Again
        </a>
      </div>
    </div>
  )
}
