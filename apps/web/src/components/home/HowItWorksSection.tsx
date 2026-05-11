"use client";

import Link from "next/link";
import { ShoppingCart, MapPin, CreditCard, Truck } from "lucide-react";

const steps = [
  {
    icon: ShoppingCart,
    step: "01",
    title: "Pick your dish",
    description: "Browse the menu and add your favorite Phad Kra Phao to the cart.",
  },
  {
    icon: MapPin,
    step: "02",
    title: "Enter your address",
    description: "Provide your delivery address within Kampung Subang Baru, Shah Alam.",
  },
  {
    icon: CreditCard,
    step: "03",
    title: "Review & pay",
    description: "Confirm your delivery fee and total, then check out securely.",
  },
  {
    icon: Truck,
    step: "04",
    title: "Wait for delivery",
    description: "Your food is cooked fresh and delivered hot straight to your door.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how_it_works" className="relative px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
            How It Works
          </h2>
          <p className="mt-4 text-base leading-7 text-[#d8d1c6] sm:text-lg">
            Four simple steps from craving to doorstep.
          </p>
        </div>

        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((item) => (
            <li
              key={item.step}
              className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line-strong)] bg-white/5">
                <item.icon className="h-5 w-5 text-[var(--gold-strong)]" aria-hidden />
              </div>
              <p className="mt-4 text-xs uppercase tracking-[0.35em] text-[var(--gold-strong)]">
                Step {item.step}
              </p>
              <p className="mt-1 text-lg font-semibold text-white">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-[#d8d1c6]">{item.description}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex justify-center">
          <Link
            href="/order"
            className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-7 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
          >
            Start Order
          </Link>
        </div>
      </div>
    </section>
  );
}
