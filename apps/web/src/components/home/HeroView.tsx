"use client";

import Image from "next/image";
import { CheckCircle2, Clock, Flame, Leaf, MapPin, ShieldCheck } from "lucide-react";
import { useRealtimeBranding } from "@/hooks/use-realtime-branding";

const trustChips = [
  { label: "Freshly cooked to order", icon: CheckCircle2, color: "text-sesame" },
  { label: "Bold Thai street-food flavour", icon: Flame, color: "text-ember" },
  { label: "Locally sourced ingredients", icon: Leaf, color: "text-herb-text" },
];

export function HeroView() {
  const { heroImageUrl, storeName } = useRealtimeBranding();

  return (
    <section
      className="relative isolate bg-background md:flex md:min-h-[clamp(376px,44vw,452px)] md:items-end"
      aria-labelledby="store-name"
    >
      {/* Media */}
      <div className="relative h-[clamp(168px,44vw,236px)] overflow-hidden md:absolute md:inset-0 md:h-auto">
        <Image
          src={heroImageUrl || "/hero-wok-kra-pao.jpg"}
          alt={`Wok-fired Phad Kra Phao at ${storeName || "Mad Krapow"} — Thai holy basil stir-fry with bird's eye chilli and a crisp-edged fried egg.`}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[50%_42%] md:opacity-60"
          unoptimized={!!heroImageUrl}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background from-1% via-background/40 via-52% to-background/5 md:hidden" />
        <div className="absolute inset-0 hidden bg-gradient-to-t from-background from-2% via-background/80 via-48% to-background/12 md:block" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-surface-sunk/95 via-surface-sunk/30 via-58% to-transparent md:block" />
      </div>

      {/* Body */}
      <div className="relative z-10 mx-auto flex w-full max-w-[1280px] flex-col gap-3.5 px-4 pb-7 pt-4 sm:px-6 md:gap-4 md:px-8 md:pb-10 md:pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunk/80 px-2.5 py-1.5 text-[11px] font-bold leading-tight text-sesame backdrop-blur-sm">
            <MapPin className="h-3.5 w-3.5" />
            Since February 2023 · Kampung Subang Baru, Shah Alam
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-herb/30 bg-herb/13 px-2.5 py-1.5 text-[11px] font-semibold leading-tight text-herb-text">
            <ShieldCheck className="h-3.5 w-3.5" />
            No pork, no lard
          </span>
        </div>

        <h1
          id="store-name"
          className="max-w-[22ch] font-display text-[clamp(1.875rem,1.2rem+2.6vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground"
        >
          Hot, Fiery Phad Kra Phao.
        </h1>

        <p className="max-w-[62ch] text-sm leading-6 text-muted-foreground md:text-[15px]">
          Craving bold Thai flavours? Mad Krapow serves fiery, flavourful plates of this iconic dish —
          wok-fired fresh to order and delivered fast from Kampung Subang Baru, Shah Alam.
        </p>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] font-semibold text-foreground">
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-ember-text" />
            Open daily 11:00–22:00 · Fri &amp; Sat till 23:00
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-ember-text" />
            Kampung Subang Baru, Shah Alam
          </li>
        </ul>

        <ul className="scrollbar-hide flex items-center gap-2.5 overflow-x-auto pb-0.5">
          {trustChips.map((chip) => {
            const Icon = chip.icon;
            return (
              <li
                key={chip.label}
                className="flex flex-none items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted-foreground"
              >
                <Icon className={`h-4 w-4 ${chip.color}`} />
                {chip.label}
              </li>
            );
          })}
        </ul>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          {/* The menu lives right below the hero — scroll to it instead of
              navigating (the old /menu route only redirects back here). */}
          <a
            href="#menu"
            className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full bg-[image:var(--grad-cta)] px-6 text-sm font-bold text-white shadow-[0_14px_32px_-12px_var(--accent)] transition hover:brightness-110 active:translate-y-px"
          >
            Order now
          </a>
          <a
            href="#menu"
            className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-full border border-border-2 px-6 text-sm font-bold text-foreground transition hover:bg-surface-2"
          >
            Explore menu
          </a>
        </div>
      </div>
    </section>
  );
}
