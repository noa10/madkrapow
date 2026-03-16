"use client";

import Link from "next/link";
import Image from "next/image";

const stats = [
  { value: "15", label: "Curated plates" },
  { value: "4.9", label: "Guest rating" },
  { value: "11PM", label: "Kitchen open until" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-14 pt-6 sm:px-6 lg:px-8 lg:pb-20 lg:pt-8">
      <div className="container-shell">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/8 bg-black/30 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80"
              alt="Refined Thai dining table with warm ambience"
              fill
              className="object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(210,176,123,0.18),transparent_30%),linear-gradient(90deg,rgba(8,8,8,0.92)_10%,rgba(8,8,8,0.68)_48%,rgba(8,8,8,0.9)_100%)]" />
          </div>

          <div className="relative grid gap-12 px-6 py-12 sm:px-10 md:px-12 lg:grid-cols-[1.15fr_0.85fr] lg:px-16 lg:py-18 xl:px-20">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.35em] text-[var(--gold-strong)]">
                <span className="h-2 w-2 rounded-full bg-[var(--gold-strong)]" />
                Elevated Thai kitchen · Kuala Lumpur
              </div>

              <h1 className="max-w-4xl font-display text-5xl leading-[0.94] text-white sm:text-6xl lg:text-7xl xl:text-[5.8rem]">
                A premium menu shaped by
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#f1d7aa] to-[#c59661]"> fire, fragrance, and finesse.</span>
              </h1>

              <p className="mt-6 max-w-2xl text-base leading-8 text-[#d8d1c6] sm:text-lg">
                Crafted for modern dining, our menu pairs dark cinematic presentation with vibrant Thai flavors,
                designed to feel immersive, polished, and unmistakably high-end.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  href="#menu"
                  className="rounded-full border border-[var(--line-strong)] bg-[linear-gradient(135deg,#f1d7aa,#c59661)] px-7 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-black transition hover:scale-[1.01]"
                >
                  Explore Menu
                </Link>
                <Link
                  href="#detail"
                  className="rounded-full border border-white/10 bg-white/5 px-7 py-3 text-sm font-medium uppercase tracking-[0.28em] text-white/90 transition hover:border-[var(--line-strong)] hover:text-[var(--gold-strong)]"
                >
                  Chef&apos;s Special
                </Link>
              </div>
            </div>

            <div className="grid gap-4 self-end sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[1.6rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-5 backdrop-blur-sm"
                >
                  <p className="font-display text-4xl text-white">{stat.value}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.28em] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
