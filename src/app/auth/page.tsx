'use client'

import Link from 'next/link'
import { AuthForm } from '@/components/auth/AuthForm'

export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(180deg,rgba(8,8,8,0.92)_0%,rgba(8,8,8,1)_100%)]" />
      <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-1/2 rounded-full bg-[rgba(210,176,123,0.12)] blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
              <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
              House account access
            </div>

            <div className="space-y-4">
              <h1 className="font-display text-5xl leading-[0.94] text-white sm:text-6xl">
                Return to the
                <span className="bg-[var(--text-gradient-gold)] bg-clip-text text-transparent"> Mad Krapow room.</span>
              </h1>
              <p className="max-w-xl text-base leading-8 text-[#d8d1c6] sm:text-lg">
                Sign in with your account to manage orders, review your profile, and move between the guest and admin experience without losing the cinematic feel of the homepage.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.28em] text-muted-foreground">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Warm gold accents
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                High-contrast controls
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
                Admin-ready sign in
              </span>
            </div>

            <Link
              href="/"
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-[var(--gold-strong)]"
            >
              Back to menu
            </Link>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
            <div className="mb-8 text-center">
              <p className="text-xs uppercase tracking-[0.32em] text-[var(--gold-strong)]">
                Welcome back
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-white">Sign in to continue</h2>
              <p className="mt-2 text-sm text-[#d8d1c6]">
                Use your email or Google account to enter the Mad Krapow dashboard.
              </p>
            </div>

            <AuthForm />
          </div>
        </div>
      </div>
    </div>
  )
}
