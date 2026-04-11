'use client'

import Link from 'next/link'
import { ShoppingCart, MapPin, CreditCard, Truck } from 'lucide-react'

const steps = [
  {
    icon: ShoppingCart,
    step: '01',
    title: 'Pick your dish',
    description: 'Browse the menu and add your favorite Phad Kra Phao to the cart.',
  },
  {
    icon: MapPin,
    step: '02',
    title: 'Enter your address',
    description: 'Provide your delivery address within Kampung Subang Baru, Shah Alam.',
  },
  {
    icon: CreditCard,
    step: '03',
    title: 'Review & pay',
    description: 'Confirm your delivery fee and total, then check out securely.',
  },
  {
    icon: Truck,
    step: '04',
    title: 'Wait for delivery',
    description: 'Your food is cooked fresh and delivered hot straight to your door.',
  },
]

export default function OrderPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(180deg,rgba(8,8,8,0.92)_0%,rgba(8,8,8,1)_100%)]" />

      <div className="relative mx-auto max-w-4xl py-16 sm:py-24">
        <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
          <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
          How it works
        </div>

        <h1 className="font-display text-5xl leading-[0.94] text-white sm:text-6xl">
          Get Mad Krapow{' '}
          <span className="bg-[var(--text-gradient-gold)] bg-clip-text text-transparent">
            delivered
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-8 text-[#d8d1c6] sm:text-lg">
          Ordering is simple — choose your meal, enter your delivery address,
          confirm the fee, and check out in minutes.
        </p>

        <div className="mt-14 space-y-6">
          {steps.map((item) => (
            <div
              key={item.step}
              className="flex gap-5 rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-white/5">
                <item.icon className="h-5 w-5 text-[var(--gold-strong)]" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-[var(--gold-strong)]">
                  Step {item.step}
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {item.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#d8d1c6]">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[1.2rem] border border-white/8 bg-white/5 p-5 text-sm text-[#d8d1c6]">
          <p className="font-semibold text-white">Service area</p>
          <p className="mt-1">
            We currently deliver within Kampung Subang Baru, Shah Alam. Delivery
            availability depends on your address — enter it at checkout to confirm.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/#menu"
            className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-7 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
          >
            Start Order
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
  )
}
