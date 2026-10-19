"use client";

import Link from "next/link";
import { Bike, UtensilsCrossed, Zap } from "lucide-react";

const GRABFOOD_URL = process.env.NEXT_PUBLIC_GRABFOOD_URL || "#";

export function HowToOrderSection() {
  return (
    <section id="how_to_order" className="relative px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-6xl">
        <div className="mb-[18px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.11em] text-ember-text">Choose your channel</p>
          <h2 className="mt-1 font-display text-[clamp(1.375rem,1.15rem+0.9vw,1.875rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-foreground">
            Two ways to order
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Choose GrabFood for instant checkout, or order direct for Lalamove delivery.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {/* GrabFood card */}
          <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-[22px]">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ember-text/14 text-ember-text">
              <Zap className="h-5 w-5" fill="currentColor" aria-hidden />
            </span>
            <h3 className="text-base font-bold">Order on GrabFood</h3>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Prefer the Grab app? Find Mad Krapow on GrabFood for instant checkout and Grab-managed delivery.
            </p>
            <a
              href={GRABFOOD_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens GrabFood app"
              className="mt-1 inline-flex w-fit items-center rounded-full bg-surface-2 px-3 py-1.5 text-[11px] font-bold text-foreground transition hover:bg-surface-3"
            >
              Available on the Grab app
            </a>
          </div>

          {/* Direct card */}
          <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-[22px]">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-herb/13 text-herb-text">
              <Bike className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="text-base font-bold">Order direct</h3>
            <p className="text-[13px] leading-5 text-muted-foreground">
              Order here for Lalamove delivery, or choose self-pickup. The Lalamove fee is calculated at
              checkout, and the minimum order is RM 20.00.
            </p>
            <Link
              href="/menu"
              className="mt-1 inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-border-2 px-5 text-[13px] font-bold text-foreground transition hover:bg-surface-2"
            >
              <UtensilsCrossed className="h-4 w-4" aria-hidden />
              Browse the menu
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
