'use client'

import Link from 'next/link'
import { Flame } from 'lucide-react'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

const GRABFOOD_URL = process.env.NEXT_PUBLIC_GRABFOOD_URL || '#'

const promiseList = [
  'Wok-fired to order in 90 seconds',
  'Real Thai holy basil imported weekly',
  '100% halal-sourced ingredients',
]

export default function AboutPage() {
  return (
    <ClientPageShell activeHref="/about">
      <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(180deg,rgba(8,8,8,0.92)_0%,rgba(8,8,8,1)_100%)]" />

        <div className="relative mx-auto max-w-4xl py-16 sm:py-24">
          <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
            <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
            Our story
          </div>

          <h1 className="font-display text-5xl leading-[0.94] text-white sm:text-6xl">
            About{' '}
            <span className="bg-[var(--text-gradient-gold)] bg-clip-text text-transparent">
              Mad Krapow
            </span>
          </h1>

          <p className="mt-5 font-display text-xl leading-tight text-[var(--gold-strong)] sm:text-2xl">
            One Dish. Done Right. Done Halal.
          </p>

          <div className="mt-10 max-w-2xl space-y-6 text-base leading-8 text-[#d8d1c6] sm:text-lg">
            <p>
              Mad Krapow started in February 2023 in a home kitchen in Kampung Subang Baru,
              Shah Alam, with one obsession: Phad Kra Phao the way it tastes on a Bangkok
              street, but made for Malaysia.
            </p>
            <p>
              We are a Muslim-friendly kitchen. That means no pork, no lard, no alcohol in
              any recipe. Our meats are sourced from halal-certified suppliers in Selangor,
              and our sauces are checked for halal certification.
            </p>
            <p>
              In 2024, customers asked for faster, cheaper delivery beyond Grab&apos;s radius.
              We partnered with Lalamove so you can order direct from madkrapow.com and get
              the same wok-hot food with transparent delivery fees. Prefer GrabFood? We are
              there too.
            </p>
          </div>

          <ul className="mt-12 space-y-3">
            {promiseList.map((promise) => (
              <li
                key={promise}
                className="flex items-start gap-3 rounded-[1.2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-5 py-4 backdrop-blur-sm"
              >
                <Flame className="mt-0.5 h-5 w-5 flex-none text-[var(--gold-strong)]" />
                <span className="text-base leading-7 text-[#d8d1c6] sm:text-lg">
                  {promise}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-14">
            <p className="text-sm uppercase tracking-[0.28em] text-[var(--gold-strong)]">
              Ready to try?
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <a
                href={GRABFOOD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-7 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
              >
                Order on GrabFood
              </a>
              <Link
                href="/order"
                className="rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-[var(--gold-strong)]"
              >
                Order Direct
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ClientPageShell>
  )
}
