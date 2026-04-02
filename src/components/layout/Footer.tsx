import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Clock } from 'lucide-react'

const navLinks = [
  { label: 'Menu', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Order', href: '/order' },
]

export function Footer() {
  return (
    <footer className="border-t border-white/8 bg-black/45">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Link href="/" className="inline-block">
              <Image
                src="/madkrapow-logo.png"
                alt="Mad Krapow"
                width={0}
                height={0}
                className="h-10 w-auto"
                sizes="160px"
              />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-[#d8d1c6]">
              Hot, bold Phad Kra Phao delivery for Kampung Subang Baru, Shah Alam.
              Cooked fresh. Delivered fast.
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--gold-strong)]">
              Quick links
            </p>
            <ul className="mt-4 space-y-3">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-[#d8d1c6] transition hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--gold-strong)]">
              Location &amp; hours
            </p>
            <div className="mt-4 space-y-3 text-sm text-[#d8d1c6]">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--gold-strong)]" />
                <span>Kampung Subang Baru, Shah Alam, Selangor</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--gold-strong)]" />
                <span>Open daily · Kitchen until 11 PM</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/8 pt-6 text-center text-xs tracking-[0.2em] text-muted-foreground">
          &copy; {new Date().getFullYear()} Mad Krapow. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
