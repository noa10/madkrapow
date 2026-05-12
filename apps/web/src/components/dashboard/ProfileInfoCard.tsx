"use client"

import { User, MapPin, Phone, Mail } from "lucide-react"
import Image from "next/image"

interface CustomerAddress {
  id: string
  label: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  instructions: string | null
  is_default: boolean
}

interface ProfileInfoCardProps {
  customer: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
    avatarUrl: string | null
    addresses: CustomerAddress[]
  } | null
}

export function ProfileInfoCard({ customer }: ProfileInfoCardProps) {
  if (!customer) return null

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-white/8 bg-card/60 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10">
            <User className="h-4 w-4 text-gold" />
          </div>
          <h3 className="text-sm font-semibold text-foreground font-heading tracking-wide">
            Account Details
          </h3>
        </div>

        <div className="flex items-center gap-4 mb-4">
          {customer.avatarUrl ? (
            <div className="relative h-12 w-12 rounded-full overflow-hidden shrink-0">
              <Image
                src={customer.avatarUrl}
                alt="Profile photo"
                fill
                sizes="48px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 shrink-0">
              <User className="h-6 w-6 text-primary/60" />
            </div>
          )}
          {customer.name && (
            <div>
              <div className="text-sm font-medium text-foreground">{customer.name}</div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          {customer.email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Email</div>
                <div className="text-sm text-foreground">{customer.email}</div>
              </div>
            </div>
          )}
          {customer.name && (
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Name</div>
                <div className="text-sm text-foreground">{customer.name}</div>
              </div>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Phone</div>
                <div className="text-sm text-foreground">{customer.phone}</div>
              </div>
            </div>
          )}
          {!customer.name && !customer.phone && !customer.email && (
            <p className="text-sm text-muted-foreground text-center py-4">No account details yet</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-card/60 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
            <MapPin className="h-4 w-4 text-sky-400" />
          </div>
          <h3 className="text-sm font-semibold text-foreground font-heading tracking-wide">
            Saved Addresses
          </h3>
        </div>

        {!customer.addresses || customer.addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No saved addresses yet
          </p>
        ) : (
          <div className="space-y-2.5">
            {customer.addresses.map((address) => (
              <div
                key={address.id}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3 transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-medium text-foreground">{address.label || "Address"}</span>
                  {address.is_default && (
                    <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {address.address_line1}
                  {address.address_line2 && `, ${address.address_line2}`}
                </p>
                <p className="text-xs text-muted-foreground/80 mt-0.5">
                  {address.postal_code}, {address.city}, {address.state}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
