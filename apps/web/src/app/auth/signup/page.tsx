'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { getBrowserClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Maps Supabase auth error codes to user-friendly messages
 */
function getAuthErrorMessage(error: { code?: string; message?: string }): string {
  const errorMessages: Record<string, string> = {
    invalid_credentials: 'Invalid email or password',
    email_not_confirmed: 'Please verify your email first',
    too_many_requests: 'Too many attempts. Try again later',
    session_expired: 'Your session has expired. Please sign in again',
    user_not_found: 'Invalid email or password',
    invalid_grant: 'Invalid email or password',
    invalid_request: 'Invalid request. Please try again',
    invalid_token: 'Your session has expired. Please sign in again',
    refresh_token_not_found: 'Your session has expired. Please sign in again',
    bad_code_verifier: 'Authentication failed. Please try again',
    conflict: 'An account with this email already exists',
    email_exists: 'An account with this email already exists',
    phone_exists: 'An account with this phone number already exists',
    signup_disabled: 'Sign up is currently disabled',
    weak_password: 'Password is too weak. Please choose a stronger password',
    provider_disabled: 'This sign-in method is currently disabled',
    unexpected_failure: 'An unexpected error occurred. Please try again',
  }

  if (error.message?.toLowerCase().includes('network') ||
      error.message?.toLowerCase().includes('fetch') ||
      error.message?.toLowerCase().includes('connection')) {
    return 'Unable to connect. Please check your connection'
  }

  return errorMessages[error.code || ''] || error.message || 'An unexpected error occurred'
}

/** Only allow same-origin relative redirect paths */
function isValidRedirect(redirect: string | null): redirect is string {
  if (!redirect || !redirect.startsWith('/')) return false
  if (redirect.startsWith('//') || redirect.startsWith('\\')) return false
  return true
}

function SignUpPageContent() {
  const supabase = getBrowserClient()
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get('redirect')
  const isCheckoutRedirect = redirectParam === '/checkout'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signInHref = isValidRedirect(redirectParam)
    ? `/auth?redirect=${encodeURIComponent(redirectParam)}`
    : '/auth'

  const handleGoogleSignUp = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const redirectUrl = new URL('/auth/callback', window.location.origin)
      if (isValidRedirect(redirectParam)) {
        redirectUrl.searchParams.set('redirect', redirectParam)
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl.toString() },
      })
      if (oauthError) {
        setError(getAuthErrorMessage(oauthError))
      }
    } catch {
      setError('Unable to connect. Please check your connection')
    } finally {
      setIsLoading(false)
    }
  }

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
        options: { emailRedirectTo: redirectUrl.toString() },
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(180deg,rgba(8,8,8,0.92)_0%,rgba(8,8,8,1)_100%)]" />
      <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-[rgba(210,176,123,0.12)] blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
              <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
              Mad Krapow account
            </div>

            <div className="space-y-4">
              <h1 className="font-display text-5xl leading-[0.94] text-white sm:text-6xl">
                Create your
                <span className="bg-[var(--text-gradient-gold)] bg-clip-text text-transparent"> account</span>
              </h1>
              <p className="max-w-xl text-base leading-8 text-[#d8d1c6] sm:text-lg">
                {isCheckoutRedirect
                  ? 'Register to complete your checkout. Your cart is safe and waiting for you.'
                  : 'Sign up to place orders faster, save your delivery details, and track your Mad Krapow orders.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.28em] text-muted-foreground">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Track your orders
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Reorder favourites
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Manage your profile
              </span>
            </div>

            <Link
              href={isCheckoutRedirect ? '/cart' : '/'}
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-[var(--gold-strong)]"
            >
              {isCheckoutRedirect ? 'Back to cart' : 'Back to menu'}
            </Link>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
            {isSuccess ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(210,176,123,0.12)]">
                  <CheckCircle className="h-8 w-8 text-[var(--gold-strong)]" />
                </div>
                <p className="text-xs uppercase tracking-[0.32em] text-[var(--gold-strong)]">
                  Almost there
                </p>
                <h2 className="mt-3 text-3xl font-semibold text-white">Check your email</h2>
                <p className="mt-3 text-sm text-[#d8d1c6]">
                  We&apos;ve sent a confirmation link to <strong className="text-white">{email}</strong>.
                  Follow it to verify your account.
                </p>
                <Link
                  href={signInHref}
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-6 text-sm font-semibold uppercase tracking-[0.2em] text-black hover:brightness-105"
                >
                  Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-8 text-center">
                  <p className="text-xs uppercase tracking-[0.32em] text-[var(--gold-strong)]">
                    Join Mad Krapow
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold text-white">Create your account</h2>
                  <p className="mt-2 text-sm text-[#d8d1c6]">
                    Get started in seconds with email or Google.
                  </p>
                </div>

                <div className="space-y-6">
                  <Button
                    variant="outline"
                    onClick={handleGoogleSignUp}
                    disabled={isLoading}
                    className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Continue with Google
                  </Button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="rounded-full bg-black/55 px-3 py-1 tracking-[0.28em] text-[#d8d1c6]">
                        Or sign up with email
                      </span>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium text-foreground">
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
                        className="h-11 rounded-xl border-white/10 bg-black/30 text-white placeholder:text-white/35 focus-visible:ring-[var(--gold-strong)]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-medium text-foreground">
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
                          className="h-11 rounded-xl border-white/10 bg-black/30 pr-10 text-white placeholder:text-white/35 focus-visible:ring-[var(--gold-strong)]"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-0 top-0 h-full px-3 py-2 text-white/60 hover:bg-transparent hover:text-white"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-[#d8d1c6]/70">Must be at least 6 characters</p>
                    </div>

                    {error && (
                      <p
                        className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
                        role="alert"
                      >
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="h-11 w-full rounded-xl border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] font-semibold uppercase tracking-[0.2em] text-black hover:brightness-105"
                      disabled={isLoading || password.length < 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating account...
                        </>
                      ) : (
                        'Create account'
                      )}
                    </Button>

                    <p className="text-center text-sm text-muted-foreground">
                      Already have an account?{' '}
                      <Link
                        href={signInHref}
                        className="font-medium text-primary hover:text-primary/80 hover:underline"
                      >
                        Sign in
                      </Link>
                    </p>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpPageContent />
    </Suspense>
  )
}
