"use client";

import Link from "next/link";

const GRABFOOD_URL = process.env.NEXT_PUBLIC_GRABFOOD_URL || "#";

export function HowToOrderSection() {
  return (
    <section id="how_to_order" className="relative px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <div className="container mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl leading-tight text-white sm:text-4xl lg:text-5xl">
            Two Ways to Order
          </h2>
          <p className="mt-4 text-base leading-7 text-[#d8d1c6] sm:text-lg">
            Choose GrabFood for instant checkout, or order direct for Lalamove delivery.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* GrabFood card */}
          <div className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm sm:p-8">
            <h3 className="font-display text-xl text-white sm:text-2xl">Order on GrabFood</h3>
            <p className="mt-3 text-sm leading-6 text-[#d8d1c6] sm:text-base sm:leading-7">
              Tap, pay, and track in the Grab app. Best for quick cravings within Grab&apos;s delivery zone.
            </p>
            <a
              href={GRABFOOD_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="Opens GrabFood app"
              className="mt-6 inline-block rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
            >
              Open GrabFood
            </a>
          </div>

          {/* Direct card */}
          <div className="rounded-[1.4rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 backdrop-blur-sm sm:p-8">
            <h3 className="font-display text-xl text-white sm:text-2xl">Order Direct — Lalamove Delivery</h3>
            <p className="mt-3 text-sm leading-6 text-[#d8d1c6] sm:text-base sm:leading-7">
              Order at madkrapow.com or WhatsApp us. We dispatch via Lalamove for lower fees and wider coverage across Shah Alam, Subang and Klang Valley.
            </p>
            <Link
              href="/order"
              className="mt-6 inline-block rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
            >
              Order Now
            </Link>
            <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-[#9a9388]">
              Delivery fee calculated by Lalamove at checkout
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
