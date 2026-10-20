"use client";

import { ShoppingCart, MapPin, CreditCard, Truck } from "lucide-react";

const steps = [
  {
    icon: ShoppingCart,
    step: "01",
    title: "Pick your dish",
    description: "Browse the menu and add your favourite Phad Kra Phao to the cart.",
  },
  {
    icon: MapPin,
    step: "02",
    title: "Enter your address",
    description: "Provide your delivery address, or switch to self-pickup at the store.",
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
    <section id="how_it_works" className="relative scroll-mt-[var(--topbar-h)] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-[18px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-ember-text">Fast &amp; frictionless</p>
          <h2 className="mt-1 font-display text-[clamp(1.375rem,1.15rem+0.9vw,1.875rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-foreground">
            How it works
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Four steps from craving to doorstep.
          </p>
        </div>

        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((item) => (
            <li
              key={item.step}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3.5 rounded-2xl border border-border bg-surface p-4 lg:grid-cols-1 lg:gap-0"
            >
              <span className="grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] bg-accent/16 text-[#ffb3b6] lg:mb-[15px]">
                <item.icon className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ember-text">
                  Step {item.step}
                </p>
                <p className="mt-1 text-sm font-bold text-foreground">{item.title}</p>
                <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
