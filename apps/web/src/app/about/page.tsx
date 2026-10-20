'use client'

import Link from 'next/link'
import { Flame } from 'lucide-react'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

const GRABFOOD_URL = process.env.NEXT_PUBLIC_GRABFOOD_URL || '#'

const promiseList = [
  'Wok-fired to order in 90 seconds',
  'Real Thai holy basil imported weekly',
]

export default function AboutPage() {
  return (
    <ClientPageShell>
      <div className="relative min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl py-12 sm:py-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.11em] text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-ember" />
            Our story
          </div>

          <h1 className="font-display text-[clamp(2.25rem,1.5rem+3vw,3.75rem)] font-extrabold leading-[1.02] tracking-[-0.03em] text-foreground">
            About <span className="text-ember-text">Mad Krapow</span>
          </h1>

          <p className="mt-4 font-display text-xl font-bold leading-tight text-ember-text sm:text-2xl">
            One Dish. Done Right.
          </p>

          <div className="mt-8 max-w-2xl space-y-5 text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
            <p>
              Mad Krapow started in February 2023 in a home kitchen in Kampung Subang Baru,
              Shah Alam, with one obsession: Phad Kra Phao the way it tastes on a Bangkok
              street, but made for Malaysia.
            </p>
            <p>
              We are a Muslim-friendly kitchen. That means no pork, no lard, no alcohol in
              any recipe. Our meats and sauces are sourced from trusted local suppliers
              in Selangor.
            </p>
            <p>
              In 2024, customers asked for faster, cheaper delivery beyond Grab&apos;s radius.
              We partnered with Lalamove so you can order direct from madkrapow.com and get
              the same wok-hot food with transparent delivery fees. Prefer GrabFood? We are
              there too.
            </p>
          </div>

          <ul className="mt-10 space-y-3">
            {promiseList.map((promise) => (
              <li
                key={promise}
                className="flex items-start gap-3 rounded-2xl border border-border bg-surface px-5 py-4"
              >
                <Flame className="mt-0.5 h-5 w-5 flex-none fill-ember/30 text-ember" />
                <span className="text-[15px] leading-7 text-foreground sm:text-base">
                  {promise}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-ember-text">
              Ready to try?
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <a
                href={GRABFOOD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[image:var(--grad-cta)] px-6 text-sm font-bold text-white shadow-[0_14px_32px_-12px_var(--accent)] transition hover:brightness-110 active:translate-y-px"
              >
                Order on GrabFood
              </a>
              <Link
                href="/#menu"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-border-2 px-6 text-sm font-bold text-foreground transition hover:bg-surface-2"
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
