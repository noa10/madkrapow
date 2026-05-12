"use client";

import Link from "next/link";
import Image from "next/image";

const proofChips = [
  "Freshly cooked to order",
  "Local delivery in Kampung Subang Baru",
  "Bold Thai street-food flavor",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8 lg:pb-20 lg:pt-8">
      <div className="container-shell">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-black/30 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80"
              alt="Mad Krapow kitchen with warm ambience"
              fill
              sizes="100vw"
              className="object-cover opacity-40"
              priority
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(90deg,rgba(8,8,8,0.92)_10%,rgba(8,8,8,0.68)_48%,rgba(8,8,8,0.9)_100%)]" />
          </div>

          <div className="relative grid gap-12 px-6 py-12 sm:px-10 md:px-12 lg:grid-cols-[1.15fr_0.85fr] lg:px-16 lg:py-18 xl:px-20">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
                <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
                Since February 2023 · Kampung Subang Baru, Shah Alam
              </div>

              <h1 className="max-w-4xl font-display text-5xl leading-[0.94] text-white sm:text-6xl lg:text-7xl xl:text-[5.8rem]">
                Hot, fiery Phad Kra Phao
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#f1d7aa] to-[#c59661]"> delivered to your door.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-[#d8d1c6] sm:text-lg">
                Craving bold Thai flavors? Mad Krapow serves fiery, flavorful plates of this iconic dish within Kampung Subang Baru, Shah Alam — cooked hot and delivered fast.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="#menu"
                  className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-7 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
                >
                  Order Now
                </Link>
                <Link
                  href="#menu"
                  className="rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-[var(--gold-strong)]"
                >
                  Explore Menu
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-3 self-end">
              {proofChips.map((chip) => (
                <div
                  key={chip}
                  className="rounded-full border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-5 py-3 text-xs uppercase tracking-[0.28em] text-[#d8d1c6] backdrop-blur-sm"
                >
                  {chip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
