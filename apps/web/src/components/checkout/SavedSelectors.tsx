"use client"

import { useState } from "react"
import { Plus, Circle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useCheckoutStore, type DeliveryAddress } from "@/stores/checkout"

interface CustomerAddress {
  id: string
  label: string | null
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  postal_code: string
  country: string
  latitude: number | null
  longitude: number | null
  is_default: boolean
}

interface CustomerContact {
  id: string
  name: string
  phone: string
  is_default: boolean
}

interface SavedAddressSelectorProps {
  addresses: CustomerAddress[]
  onAddNew: () => void
}

export function SavedAddressSelector({ addresses, onAddNew }: SavedAddressSelectorProps) {
  const deliveryAddress = useCheckoutStore((state) => state.delivery_address)
  const setDeliveryAddress = useCheckoutStore((state) => state.setDeliveryAddress)
  const [selectedId, setSelectedId] = useState<string | null>(
    addresses.find((a) => a.is_default)?.id || addresses[0]?.id || null
  )

  const handleSelect = (address: CustomerAddress) => {
    setSelectedId(address.id)
    const current = deliveryAddress || {} as DeliveryAddress
    setDeliveryAddress({
      ...current,
      address_line1: address.address_line1,
      address_line2: address.address_line2 || undefined,
      city: address.city,
      state: address.state,
      postal_code: address.postal_code,
      country: address.country || 'Malaysia',
      latitude: address.latitude || undefined,
      longitude: address.longitude || undefined,
    })
  }

  return (
    <div className="space-y-3">
      {addresses.map((address) => (
        <button
          key={address.id}
          onClick={() => handleSelect(address)}
          className={cn(
            'w-full text-left rounded-lg border p-3 transition-all',
            selectedId === address.id
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          )}
        >
          <div className="flex items-start gap-3">
            {selectedId === address.id ? (
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{address.label || 'Address'}</span>
                {address.is_default && (
                  <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    Default
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {address.address_line1}
                {address.address_line2 && `, ${address.address_line2}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {address.postal_code}, {address.city}, {address.state}
              </p>
            </div>
          </div>
        </button>
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 h-9 text-muted-foreground hover:text-foreground"
        onClick={onAddNew}
      >
        <Plus className="h-4 w-4" />
        Add New Address
      </Button>
    </div>
  )
}

interface SavedContactSelectorProps {
  contacts: CustomerContact[]
  onAddNew: () => void
}

export function SavedContactSelector({ contacts, onAddNew }: SavedContactSelectorProps) {
  const deliveryAddress = useCheckoutStore((state) => state.delivery_address)
  const setDeliveryAddress = useCheckoutStore((state) => state.setDeliveryAddress)
  const [selectedId, setSelectedId] = useState<string | null>(
    contacts.find((c) => c.is_default)?.id || contacts[0]?.id || null
  )

  const handleSelect = (contact: CustomerContact) => {
    setSelectedId(contact.id)
    const current = deliveryAddress || {} as DeliveryAddress
    setDeliveryAddress({
      ...current,
      full_name: contact.name,
      phone: contact.phone,
    })
  }

  return (
    <div className="space-y-3">
      {contacts.map((contact) => (
        <button
          key={contact.id}
          onClick={() => handleSelect(contact)}
          className={cn(
            'w-full text-left rounded-lg border p-3 transition-all',
            selectedId === contact.id
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50'
          )}
        >
          <div className="flex items-start gap-3">
            {selectedId === contact.id ? (
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{contact.name}</span>
                {contact.is_default && (
                  <span className="text-[10px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    Default
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{contact.phone}</p>
            </div>
          </div>
        </button>
      ))}

      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 h-9 text-muted-foreground hover:text-foreground"
        onClick={onAddNew}
      >
        <Plus className="h-4 w-4" />
        Add New Contact
      </Button>
    </div>
  )
}
