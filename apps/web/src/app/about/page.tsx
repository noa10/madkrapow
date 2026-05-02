'use client'

import Link from 'next/link'
import { Flame, MapPin, Clock, UtensilsCrossed } from 'lucide-react'
import { ClientPageShell } from '@/components/layout/ClientPageShell'

const highlights = [
  {
    icon: UtensilsCrossed,
    title: 'Iconic dish',
    description: 'Thai-inspired Phad Kra Phao as the star of every plate.',
  },
  {
    icon: Flame,
    title: 'Cooked hot',
    description: 'Freshly prepared for delivery — never sitting under a heat lamp.',
  },
  {
    icon: MapPin,
    title: 'Local focus',
    description: 'Serving Kampung Subang Baru, Shah Alam and surrounding areas.',
  },
  {
    icon: Clock,
    title: 'Bold flavor',
    description: 'Fiery, savory, crave-worthy — every single time.',
  },
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

        <div className="mt-10 max-w-2xl space-y-6 text-base leading-8 text-[#d8d1c6] sm:text-lg">
          <p>
            Launched in February 2023, Mad Krapow was created to bring one of
            Thailand&apos;s most iconic dishes straight to hungry customers in Kampung
            Subang Baru, Shah Alam.
          </p>
          <p>
            We focus on bold, satisfying renditions of Phad Kra Phao — cooked hot,
            packed with flavor, and made for cravings that need more than an ordinary
            meal.
          </p>
          <p>
            Whether you&apos;re already a fan of Thai food or trying this fiery favorite
            for the first time, Mad Krapow is here to deliver a comforting, spicy kick
            right to your door.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm"
            >
              <item.icon className="mb-3 h-5 w-5 text-[var(--gold-strong)]" />
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">
                {item.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#d8d1c6]">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-4">
          <Link
            href="/#menu"
            className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-7 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
          >
            Order Now
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-[var(--gold-strong)]"
          >
            Back to menu
          </Link>
        </div>
      </div>
    </div>
    </ClientPageShell>
  )
}
