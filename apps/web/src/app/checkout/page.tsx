'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Loader2, Users } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { useCheckoutStore, type DeliveryAddress } from '@/stores/checkout'
import { getMenuItems, type MenuItem } from '@/lib/queries/menu-client'
import { env } from '@/lib/validators/env'
import { Button } from '@/components/ui/button'
import { DeliveryTypeSelector } from '@/components/checkout/DeliveryTypeSelector'
import { FulfillmentSelector } from '@/components/checkout/FulfillmentSelector'
import { TimeSlotPicker } from '@/components/checkout/TimeSlotPicker'
import { BulkOrderForm } from '@/components/checkout/BulkOrderForm'
import { PageContainer } from '@/components/layout/PageContainer'

import { DeliveryAddressInput } from '@/components/checkout/DeliveryAddressInput'

function formatPrice(priceCents: number): string {
  return `RM ${(priceCents / 100).toFixed(2)}`
}

function formatAddress(address: DeliveryAddress): string {
  const parts = [
    address.address_line1,
    address.address_line2,
    address.city,
    address.state,
    address.postal_code,
  ].filter(Boolean)
  return parts.join(', ')
}

interface CheckoutItem {
  id: string
  name: string
  price: number
  quantity: number
  image?: string
  modifiers?: Array<{ id: string; name: string; price_delta_cents: number }>
}

interface StoreSettings {
  operating_hours: Record<string, { open: string; close: string }> | null
  pickup_enabled: boolean
  kitchen_lead_minutes: number
}

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const clearCart = useCartStore((state) => state.clear)

  const deliveryAddress = useCheckoutStore((state) => state.delivery_address)
  const deliveryQuote = useCheckoutStore((state) => state.delivery_quote)
  const deliveryType = useCheckoutStore((state) => state.delivery_type)
  const fulfillmentType = useCheckoutStore((state) => state.fulfillment_type)
  const scheduledWindow = useCheckoutStore((state) => state.scheduled_window)
  const quotationId = useCheckoutStore((state) => state.quotation_id)
  const serviceType = useCheckoutStore((state) => state.service_type)
  const stopIds = useCheckoutStore((state) => state.stop_ids)
  const quoteExpiresAt = useCheckoutStore((state) => state.quote_expires_at)
  const priceBreakdown = useCheckoutStore((state) => state.price_breakdown)
  const isQuoteExpired = useCheckoutStore((state) => state.isQuoteExpired)
  const clearShippingQuote = useCheckoutStore((state) => state.clearShippingQuote)

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [isLoadingMenu, setIsLoadingMenu] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [showAddressInput, setShowAddressInput] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const subtotal = useMemo(() => getSubtotal(), [getSubtotal])
  const deliveryFee = deliveryType === 'self_pickup'
    ? 0
    : (deliveryQuote?.fee_cents ?? Math.round(parseFloat(priceBreakdown?.total || '0') * 100))
  const total = subtotal + deliveryFee

  // Quote expiry check
  const quoteExpired = deliveryType === 'delivery' && quoteExpiresAt && isQuoteExpired()

  const menuItemMap = useMemo(() => {
    return menuItems.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {} as Record<string, MenuItem>)
  }, [menuItems])

  const checkoutItems: CheckoutItem[] = useMemo(() => {
    return items.map((item) => {
      const menuItem = menuItemMap[item.menu_item_id]
      return {
        id: item.menu_item_id,
        name: menuItem?.name || `Item ${item.menu_item_id.slice(0, 8)}`,
        price: item.unit_price + item.selected_modifiers.reduce((sum, mod) => sum + mod.price_delta_cents, 0),
        quantity: item.quantity,
        image: menuItem?.image_url || undefined,
        modifiers: item.selected_modifiers.map((mod) => ({
          id: mod.id,
          name: mod.name,
          price_delta_cents: mod.price_delta_cents,
        })),
      }
    })
  }, [items, menuItemMap])

  useEffect(() => {
    async function fetchData() {
      try {
        const [menuData] = await Promise.all([
          getMenuItems(),
        ])
        setMenuItems(menuData)
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setIsLoadingMenu(false)
      }
    }

    async function fetchSettings() {
      try {
        const { getBrowserClient } = await import('@/lib/supabase/client')
        const supabase = getBrowserClient()
        const { data } = await supabase
          .from('store_settings')
          .select('operating_hours, pickup_enabled, kitchen_lead_minutes')
          .limit(1)
          .single()
        if (data) {
          setStoreSettings({
            operating_hours: data.operating_hours,
            pickup_enabled: data.pickup_enabled ?? true,
            kitchen_lead_minutes: data.kitchen_lead_minutes ?? 20,
          })
        }
      } catch (err) {
        console.error('Failed to fetch store settings:', err)
      }
    }

    fetchData()
    fetchSettings()
  }, [])

  // Refresh delivery quote
  const handleRefreshQuote = useCallback(async () => {
    console.log('[Checkout] handleRefreshQuote called', {
      lat: deliveryAddress?.latitude,
      lng: deliveryAddress?.longitude,
    })
    if (!deliveryAddress?.latitude || !deliveryAddress?.longitude) {
      console.log('[Checkout] No coords, skipping refresh')
      return
    }

    clearShippingQuote()

    try {
      console.log('[Checkout] Fetching quote...')
      const res = await fetch('/api/shipping/lalamove/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: crypto.randomUUID(),
          pickup: {
            latitude: env.STORE_LATITUDE,
            longitude: env.STORE_LONGITUDE,
            address: env.STORE_ADDRESS,
          },
          dropoff: {
            latitude: deliveryAddress.latitude,
            longitude: deliveryAddress.longitude,
            address: formatAddress(deliveryAddress),
          },
        }),
      })

      const data = await res.json()
      console.log('[Checkout] Quote response:', data)

      if (data.success) {
        useCheckoutStore.getState().setShippingQuote({
          quotation_id: data.quotationId,
          service_type: data.serviceType,
          stop_ids: data.stopIds,
          quote_expires_at: data.expiresAt,
          price_breakdown: data.priceBreakdown,
          fee_cents: data.feeCents,
        })
        console.log('[Checkout] Quote stored, fee:', data.feeCents)
      } else {
        console.error('[Checkout] Quote failed:', data.error)
      }
    } catch (err) {
      console.error('[Checkout] Quote fetch error:', err)
    }
  }, [deliveryAddress, clearShippingQuote])

  // Auto-refresh delivery quote when store is hydrated and address exists
  const hasAttemptedQuoteRefresh = useRef(false)

  useEffect(() => {
    // Wait for store hydration — deliveryAddress will be null until hydrated
    if (hasAttemptedQuoteRefresh.current) return
    if (deliveryType !== 'delivery') return
    if (!deliveryAddress?.latitude || !deliveryAddress?.longitude) return

    hasAttemptedQuoteRefresh.current = true

    console.log('[Checkout] Auto-refresh triggered after hydration')

    // Only refresh if quote is expired or never fetched
    if (!isQuoteExpired() && deliveryQuote) {
      console.log('[Checkout] Quote is fresh, skipping refresh')
      return
    }

    handleRefreshQuote()
  }, [deliveryAddress?.latitude, deliveryAddress?.longitude, deliveryType, deliveryQuote, handleRefreshQuote, isQuoteExpired])

  const isCartEmpty = items.length === 0
  const hasDeliveryAddress = !!deliveryAddress

  const needsDeliveryAddress = deliveryType === 'delivery'
  const needsScheduledTime = fulfillmentType === 'scheduled'
  const hasScheduledTime = !!scheduledWindow
  const needsScheduleSelection = needsScheduledTime && !hasScheduledTime

  const canCheckout =
    !isCartEmpty &&
    (!needsDeliveryAddress || hasDeliveryAddress) &&
    !needsScheduleSelection &&
    !quoteExpired

  const handlePayNow = async () => {
    if (!canCheckout || isProcessing) return

    // Block checkout if quote expired for delivery orders
    if (quoteExpired) {
      setError('Your delivery quote has expired. Please refresh the quote.')
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      const payload = {
        items: checkoutItems.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
          modifiers: item.modifiers?.map(mod => ({
            id: mod.id,
            name: mod.name,
            price_delta_cents: mod.price_delta_cents,
          })) ?? [],
        })),
        deliveryAddress: deliveryType === 'delivery' ? {
          fullName: deliveryAddress?.full_name || '',
          phone: deliveryAddress?.phone || '',
          address: deliveryAddress ? formatAddress(deliveryAddress) : '',
          address_line1: deliveryAddress?.address_line1 || '',
          address_line2: deliveryAddress?.address_line2 || '',
          postalCode: deliveryAddress?.postal_code || '',
          city: deliveryAddress?.city || '',
          state: deliveryAddress?.state || '',
          latitude: deliveryAddress?.latitude,
          longitude: deliveryAddress?.longitude,
        } : {
          fullName: '',
          phone: '',
          address: '',
          postalCode: '',
          city: '',
          state: '',
        },
        deliveryFee: deliveryFee,
        deliveryType,
        fulfillmentType,
        scheduledFor: scheduledWindow?.window_start,
        // v3 shipping fields
        ...(quotationId && stopIds && priceBreakdown && {
          quotationId,
          serviceType,
          stopIds,
          priceBreakdown,
        }),
      }

      const response = await fetch('/api/checkout/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create checkout session')
      }

      clearCart()
      window.location.href = data.checkoutUrl
    } catch (err) {
      console.error('Checkout error:', err)
      setError(err instanceof Error ? err.message : 'Failed to process checkout')
      setIsProcessing(false)
    }
  }

  const handleBulkSubmit = async (bulkData: {
    company_name: string
    requested_date: string
    requested_time: string
    budget: string
    invoice_name: string
    contact_phone: string
    special_notes: string
    dropoff_instructions: string
  }) => {
    setIsProcessing(true)
    setError(null)

    try {
      const payload = {
        items: checkoutItems.map((item) => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          modifiers: item.modifiers?.map(mod => ({
            id: mod.id,
            name: mod.name,
            price_delta_cents: mod.price_delta_cents,
          })) ?? [],
        })),
        bulkFields: {
          company_name: bulkData.company_name,
          requested_date: bulkData.requested_date,
          requested_time: bulkData.requested_time,
          budget: bulkData.budget ? parseInt(bulkData.budget) : undefined,
          invoice_name: bulkData.invoice_name || undefined,
          contact_phone: bulkData.contact_phone,
          special_notes: bulkData.special_notes || undefined,
          dropoff_instructions: bulkData.dropoff_instructions || undefined,
        },
        deliveryAddress: deliveryAddress ? {
          fullName: deliveryAddress.full_name || '',
          phone: deliveryAddress.phone || '',
          address: formatAddress(deliveryAddress),
          postalCode: deliveryAddress.postal_code || '',
          city: deliveryAddress.city || '',
          state: deliveryAddress.state || '',
        } : {
          fullName: bulkData.company_name,
          phone: bulkData.contact_phone,
          address: '',
          postalCode: '',
          city: '',
          state: '',
        },
        deliveryType: deliveryType,
      }

      const response = await fetch('/api/checkout/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit bulk order')
      }

      clearCart()
      setSuccessMessage(data.message)
    } catch (err) {
      console.error('Bulk order error:', err)
      setError(err instanceof Error ? err.message : 'Failed to submit bulk order')
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoadingMenu) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer size="narrow">
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </PageContainer>
      </main>
    )
  }

  if (successMessage) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer size="narrow">
          <div className="py-8">
            <h1 className="text-xl font-semibold font-display mb-8">Order Submitted</h1>
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <span className="text-2xl text-green-500">&#10003;</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 text-center">Bulk Order Submitted!</h2>
              <p className="text-muted-foreground text-center mb-6">{successMessage}</p>
              <Link href="/orders">
                <Button>View My Orders</Button>
              </Link>
            </div>
          </div>
        </PageContainer>
      </main>
    )
  }

  if (isCartEmpty) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer size="narrow">
          <div className="py-8">
            <h1 className="text-xl font-semibold font-display mb-8">Checkout</h1>
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground text-center mb-6">
                Your cart is empty. Add some items first.
              </p>
              <Link href="/">
                <Button>Browse Menu</Button>
              </Link>
            </div>
          </div>
        </PageContainer>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background">
      <PageContainer>
        <div className="py-6 md:py-10">
          <h1 className="text-2xl font-semibold font-display mb-8">Checkout</h1>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Left Column: Order Details */}
            <div className="lg:col-span-3 space-y-6">
              {/* Order Summary */}
              <section className="rounded-lg border bg-card p-5">
                <h2 className="text-lg font-semibold mb-4 font-display">Order Summary</h2>
                <div className="space-y-4">
                  {checkoutItems.map((item, index) => (
                    <div key={`${item.id}-${index}`} className="flex gap-4 text-sm">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          width={56}
                          height={56}
                          className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-muted flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.quantity}x</span>
                          <span className="truncate">{item.name}</span>
                        </div>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="text-muted-foreground text-xs mt-0.5">
                            {item.modifiers.map((mod) => mod.name).join(', ')}
                          </div>
                        )}
                      </div>
                      <span className="flex-shrink-0">{formatPrice(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Bulk Order Toggle */}
              <Button
                variant={isBulkMode ? 'default' : 'outline'}
                className="w-full gap-2"
                onClick={() => {
                  if (!isBulkMode) {
                    if (deliveryType === 'delivery' && !hasDeliveryAddress) {
                      setError('Please enter a delivery address first')
                      setShowAddressInput(true)
                      return
                    }
                  }
                  setIsBulkMode(!isBulkMode)
                }}
              >
                <Users className="h-4 w-4" />
                {isBulkMode ? 'Switch to Regular Order' : 'Bulk / Event Order'}
              </Button>

              {isBulkMode ? (
                <BulkOrderForm onSubmit={handleBulkSubmit} isSubmitting={isProcessing} />
              ) : (
                <>
                  {/* Delivery Address */}
                  {deliveryType === 'delivery' && (
                    <section className="rounded-lg border bg-card p-5">
                      <h2 className="text-lg font-semibold mb-4 font-display">Delivery Address</h2>
                      {showAddressInput ? (
                        <div className="space-y-4">
                          <DeliveryAddressInput
                            onAddressSelect={() => setShowAddressInput(false)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => setShowAddressInput(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : hasDeliveryAddress ? (
                        <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                          <MapPin className="h-5 w-5 text-primary mt-0.5" />
                          <div className="flex-1">
                            <p className="font-medium">{deliveryAddress.full_name}</p>
                            <p className="text-sm text-muted-foreground">{deliveryAddress.phone}</p>
                            <p className="text-sm text-muted-foreground">{formatAddress(deliveryAddress)}</p>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 mt-2 text-primary"
                              onClick={() => setShowAddressInput(true)}
                            >
                              Change Address
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center p-4 border border-dashed rounded-lg">
                          <p className="text-muted-foreground mb-3">No delivery address set</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddressInput(true)}
                          >
                            Add Delivery Address
                          </Button>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Delivery Type Selector */}
                  <section className="rounded-lg border bg-card p-5">
                    <DeliveryTypeSelector pickupEnabled={storeSettings?.pickup_enabled ?? true} />
                  </section>

                  {/* Fulfillment Selector */}
                  <section className="rounded-lg border bg-card p-5">
                    <FulfillmentSelector />
                  </section>

                  {/* Time Slot Picker */}
                  {fulfillmentType === 'scheduled' && (
                    <section className="rounded-lg border bg-card p-5">
                      <h2 className="text-lg font-semibold mb-4 font-display">Pick a Time Slot</h2>
                      <TimeSlotPicker
                        operatingHours={storeSettings?.operating_hours ?? null}
                        deliveryType={deliveryType}
                        kitchenLeadMinutes={storeSettings?.kitchen_lead_minutes ?? 20}
                      />
                    </section>
                  )}
                </>
              )}
            </div>

            {/* Right Column: Payment Summary (sticky) */}
            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24 space-y-4">
                <section className="rounded-lg border bg-card p-5">
                  <h2 className="text-lg font-semibold mb-4 font-display">Payment Details</h2>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {deliveryType === 'self_pickup' ? 'Pickup' : 'Delivery Fee'}
                      </span>
                      <span>
                        {deliveryType === 'self_pickup'
                          ? 'Free'
                          : deliveryFee > 0
                            ? formatPrice(deliveryFee)
                            : 'Calculated at checkout'}
                      </span>
                    </div>
                    {/* Service type and quote info */}
                    {deliveryType === 'delivery' && serviceType && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Service</span>
                        <span>{serviceType === 'CAR' ? 'Car' : 'Motorcycle'}</span>
                      </div>
                    )}
                    {/* Quote expiry warning */}
                    {quoteExpired && (
                      <div className="p-2 bg-amber-500/10 rounded-lg text-sm flex items-center justify-between">
                        <span className="text-amber-600">Quote expired</span>
                        <button
                          onClick={handleRefreshQuote}
                          className="text-amber-600 hover:text-amber-700 font-medium underline"
                        >
                          Refresh
                        </button>
                      </div>
                    )}
                    <div className="flex justify-between text-lg font-semibold border-t border-border pt-3">
                      <span>Total</span>
                      <span className="text-primary">{formatPrice(total)}</span>
                    </div>
                  </div>
                </section>

                {error && (
                  <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePayNow}
                  disabled={!canCheckout || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : needsScheduleSelection ? (
                    'Select a time slot'
                  ) : (
                    `Pay ${formatPrice(total)}`
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    </main>
  )
}
