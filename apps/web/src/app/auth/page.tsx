'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AuthForm } from '@/components/auth/AuthForm'

function LoginPageContent() {
  const searchParams = useSearchParams()
  const redirectParam = searchParams.get('redirect')
  const isCheckoutRedirect = redirectParam === '/checkout'

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <div className="grid w-full gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.11em] text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-ember" />
              Mad Krapow account
            </div>

            <div className="space-y-4">
              <h1 className="font-display text-[clamp(2.25rem,1.5rem+3vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.03em] text-foreground">
                Sign in to
                <span className="text-ember-text"> continue</span>
              </h1>
              <p className="max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
                {isCheckoutRedirect
                  ? "Create an account or sign in to complete your checkout. Your cart is safe and waiting for you."
                  : "Log in to place orders faster, save your delivery details, and keep track of your latest Mad Krapow orders."
                }
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-full bg-surface-2 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.11em] text-muted-foreground">
                Track your orders
              </span>
              <span className="rounded-full bg-surface-2 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.11em] text-muted-foreground">
                Reorder favourites
              </span>
              <span className="rounded-full bg-surface-2 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.11em] text-muted-foreground">
                Manage your profile
              </span>
            </div>

            <Link
              href={isCheckoutRedirect ? "/cart" : "/"}
              className="inline-flex min-h-11 items-center rounded-full border border-border-2 px-5 text-[13px] font-bold text-foreground transition hover:bg-surface-2"
            >
              {isCheckoutRedirect ? "Back to cart" : "Back to menu"}
            </Link>
          </div>

          <div className="rounded-3xl border border-border bg-surface p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] sm:p-8">
            <div className="mb-8 text-center">
              <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-ember-text">
                Welcome back
              </p>
              <h2 className="mt-2 font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                Sign in to continue
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Use your account for quicker checkout and order updates.
              </p>
            </div>

            <AuthForm />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  )
}
