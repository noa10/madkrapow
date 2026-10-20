import Image from "next/image"
import Link from "next/link"
import { Bike, Leaf } from "lucide-react"

const menuLinks = [
  { href: "/?category=set-krapow", label: "Set Krapow" },
  { href: "/?category=lauk-sahaja", label: "Lauk Sahaja" },
  { href: "/?category=minuman", label: "Minuman" },
  { href: "/?category=bazar-ramadan-ttdi-jaya", label: "Bazar Ramadan TTDI Jaya" },
]

const orderingLinks = [
  { href: "/#how_to_order", label: "Two ways to order" },
  { href: "/#how_it_works", label: "How it works" },
]

const colHeading = "text-[13px] font-extrabold tracking-[0.02em] text-foreground"
const colLink = "w-fit text-[13px] text-muted-foreground transition-colors hover:text-foreground"
const colText = "text-[13px] text-muted-foreground"

export function ClientFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-[clamp(40px,6vw,72px)] border-t border-border bg-surface-sunk pb-[104px] lg:pb-0">
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-[clamp(32px,5vw,56px)] sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-[30px] sm:grid-cols-2 sm:gap-8 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-10">
          <div className="flex min-w-0 flex-col gap-[9px]">
            <Image
              src="/madkrapow-logo.webp"
              alt="Mad Krapow"
              width={128}
              height={128}
              className="h-10 w-10 md:h-[46px] md:w-[46px]"
              sizes="46px"
            />
            <p className="max-w-[34ch] text-[13px] leading-5 text-muted-foreground">
              Hot, bold Phad Kra Phao from Kampung Subang Baru, Shah Alam. Locally sourced
              ingredients, cooked fresh and delivered fast.
            </p>
            <Link href="/about" className={colLink}>
              About
            </Link>
          </div>

          <div className="flex min-w-0 flex-col gap-[9px]">
            <p className={colHeading}>Menu</p>
            {menuLinks.map((link) => (
              <Link key={link.href} href={link.href} className={colLink}>
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex min-w-0 flex-col gap-[9px]">
            <p className={colHeading}>Visit &amp; hours</p>
            <span className={colText}>Kampung Subang Baru, Shah Alam</span>
            <span className={colText}>Open daily 11:00–22:00 · Fri &amp; Sat till 23:00</span>
          </div>

          <div className="flex min-w-0 flex-col gap-[9px]">
            <p className={colHeading}>Ordering</p>
            {orderingLinks.map((link) => (
              <Link key={link.href} href={link.href} className={colLink}>
                {link.label}
              </Link>
            ))}
            <span className={colText}>Minimum order RM 20.00</span>
          </div>
        </div>

        <div className="mt-[34px] flex flex-col items-center gap-3 border-t border-border py-5 text-center md:flex-row md:justify-between md:text-left">
          <p className="text-xs text-muted-foreground">© {year} Mad Krapow. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-[18px]">
            <span className="flex items-center gap-1.5 text-xs font-bold text-herb-text">
              <Leaf className="h-4 w-4 shrink-0" aria-hidden />
              Locally sourced ingredients
            </span>
            <span className="flex items-center gap-1.5 text-xs font-bold text-ember-text">
              <Bike className="h-4 w-4 shrink-0" aria-hidden />
              Lalamove delivery
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
