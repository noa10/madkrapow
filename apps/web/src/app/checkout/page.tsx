'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, Loader2, Users, ArrowLeft, Mail, RefreshCw } from 'lucide-react'
import { useCartStore } from '@/stores/cart'
import { useCheckoutStore, type DeliveryAddress } from '@/stores/checkout'
import { getMenuItems, type MenuItem } from '@/lib/queries/menu-client'
import { Button } from '@/components/ui/button'
import { DeliveryTypeSelector } from '@/components/checkout/DeliveryTypeSelector'
import { FulfillmentSelector } from '@/components/checkout/FulfillmentSelector'
import { TimeSlotPicker } from '@/components/checkout/TimeSlotPicker'
import { BulkOrderForm } from '@/components/checkout/BulkOrderForm'
import { PageContainer } from '@/components/layout/PageContainer'
import { PromoCodeInput } from '@/components/checkout/PromoCodeInput'
import { Skeleton } from '@/components/ui/Skeleton'
import { CheckoutSkeleton } from '@/components/ui/PageSkeleton'
import { cn } from '@/lib/utils'
import { getBrowserClient } from '@/lib/supabase/client'

import { DeliveryAddressInput } from '@/components/checkout/DeliveryAddressInput'
import { SavedAddressSelector, SavedContactSelector } from '@/components/checkout/SavedSelectors'
import { useGoogleMaps } from '@/hooks/useGoogleMaps'
import {
  decideQuoteNeed,
  quoteAddressKey,
  quoteKey,
  DELIVERY_QUOTE_TIMEOUT_MS,
  type QuoteStatus,
} from '@/lib/checkout/delivery-quote'

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
  originalPrice?: number
  discountPerUnit?: number
  quantity: number
  image?: string
  modifiers?: Array<{ id: string; name: string; price_delta_cents: number }>
}

interface StoreSettings {
  operating_hours: Record<string, { open: string; close: string }> | null
  pickup_enabled: boolean
  kitchen_lead_minutes: number
  cutlery_enabled: boolean
  cutlery_default: boolean
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = ['Cart', 'Details', 'Payment', 'Confirm']
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              i < currentStep && 'bg-primary/20 text-primary',
              i === currentStep && 'bg-primary text-primary-foreground',
              i > currentStep && 'bg-muted text-muted-foreground'
            )}
          >
            {step}
          </span>
          {i < 3 && (
            <div
              className={cn(
                'h-px w-4',
                i < currentStep ? 'bg-primary/40' : 'bg-border'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function CheckoutPage() {
  const items = useCartStore((state) => state.items)
  const getSubtotal = useCartStore((state) => state.getSubtotal)
  const getOriginalSubtotal = useCartStore((state) => state.getOriginalSubtotal)
  const clearCart = useCartStore((state) => state.clear)
  const isHydrated = useCartStore((state) => state.isHydrated)
const includeCutlery = useCartStore((state) => state.includeCutlery)
const setIncludeCutlery = useCartStore((state) => state.setIncludeCutlery)

  // Auth & verification state
  const [authChecked, setAuthChecked] = useState(false)
  const [isVerified, setIsVerified] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    async function checkAuth() {
      const supabase = getBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Middleware should have redirected, but as a safety net
        window.location.href = '/auth/signup?redirect=/checkout'
        return
      }
      setUserEmail(user.email ?? null)
      const confirmed = !!user.email_confirmed_at
      setIsVerified(confirmed)
      setAuthChecked(true)
    }
    checkAuth()
  }, [])

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/customer/profile')
        const data = await res.json()
        if (data.success) {
          setProfileAddresses(data.addresses || [])
          setProfileContacts(data.contacts || [])
          const defaultContact = data.contacts?.find((c: { is_default: boolean }) => c.is_default) || data.contacts?.[0]
          const defaultAddress = data.addresses?.find((a: { is_default: boolean }) => a.is_default) || data.addresses?.[0]
          if (defaultContact || defaultAddress) {
            const current = useCheckoutStore.getState().delivery_address
            useCheckoutStore.getState().setDeliveryAddress({
              full_name: defaultContact?.name || current?.full_name || '',
              phone: defaultContact?.phone || current?.phone || '',
              address_line1: defaultAddress?.address_line1 || current?.address_line1 || '',
              address_line2: defaultAddress?.address_line2 || current?.address_line2,
              city: defaultAddress?.city || current?.city || '',
              state: defaultAddress?.state || current?.state || '',
              postal_code: defaultAddress?.postal_code || current?.postal_code || '',
              country: defaultAddress?.country || current?.country || 'Malaysia',
              latitude: defaultAddress?.latitude || current?.latitude,
              longitude: defaultAddress?.longitude || current?.longitude,
            })
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err)
      } finally {
        setIsLoadingProfile(false)
      }
    }
    fetchProfile()
  }, [])

  const handleResendVerification = async () => {
    if (!userEmail) return
    setResendStatus('sending')
    try {
      const supabase = getBrowserClient()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: userEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/checkout`,
        },
      })
      if (error) {
        setResendStatus('error')
      } else {
        setResendStatus('sent')
      }
    } catch {
      setResendStatus('error')
    }
  }

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

  const { isLoaded: gmapsLoaded } = useGoogleMaps()

  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [isLoadingMenu, setIsLoadingMenu] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [showAddressInput, setShowAddressInput] = useState(false)
  const [showContactInput, setShowContactInput] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('idle')
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [quoteExpiryReached, setQuoteExpiryReached] = useState(false)

  // Quote request lifecycle. The store owns the quote; these refs only track
  // which request/address is current so stale responses can be ignored.
  const quoteStatusRef = useRef<QuoteStatus>('idle')
  const activeQuoteKeyRef = useRef<string | null>(null)
  const activeAddressKeyRef = useRef<string | null>(null)
  const requestTokenRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const [profileAddresses, setProfileAddresses] = useState<Array<{
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
  }>>([])

  const [profileContacts, setProfileContacts] = useState<Array<{
    id: string
    name: string
    phone: string
    is_default: boolean
  }>>([])

  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  const subtotal = getSubtotal()
  const promoDiscount = useCartStore((state) => state.getDiscountTotal())
  const lalamoveFeeCents = deliveryQuote?.fee_cents ?? Math.round(parseFloat(priceBreakdown?.total || '0') * 100)
  const deliveryFee = deliveryType === 'self_pickup'
    ? 0
    : lalamoveFeeCents
  const total = subtotal + deliveryFee - promoDiscount

  const isDeliveryFeeLoading = deliveryType === 'delivery' && quoteStatus === 'loading'

  const itemIdsKey = useMemo(
    () => [...new Set(items.map((i) => i.menu_item_id))].sort().join(','),
    [items]
  )

  useEffect(() => {
    async function fetchMenuPromos() {
      const uniqueItemIds = itemIdsKey ? itemIdsKey.split(',') : []
      if (uniqueItemIds.length === 0) return

      try {
        const originalSubtotal = getOriginalSubtotal()
        const responses = await Promise.all(
          uniqueItemIds.map(async (itemId) => {
            const res = await fetch('/api/promos/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ itemId, cartSubtotalCents: originalSubtotal }),
            })
            if (!res.ok) return { itemId, preview: null }
            const data = await res.json()
            const previews = data.previews as Array<{
              promoCode: string
              discountType: string
              savingsCents: number
              scope: string
            }> | undefined
            const preview = previews?.[0] ?? null
            return { itemId, preview }
          })
        )

        for (const { itemId, preview } of responses) {
          if (preview && preview.discountType === 'percentage' && preview.savingsCents > 0 && preview.scope === 'item') {
            useCartStore.getState().setDiscountPerItem(itemId, preview.savingsCents)
          }
        }
      } catch (err) {
        console.error('Failed to fetch menu promo previews:', err)
      }
    }
    fetchMenuPromos()
  }, [getOriginalSubtotal, itemIdsKey])

  useEffect(() => {
    async function fetchAutoPromos() {
      const originalSubtotal = getOriginalSubtotal()
      if (originalSubtotal <= 0) return
      try {
        const res = await fetch('/api/promos/auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subtotalCents: originalSubtotal, deliveryFeeCents: deliveryFee }),
        })
        const data = await res.json()
        useCartStore.getState().clearPromos()
        for (const p of data.applied ?? []) {
          useCartStore.getState().applyPromo({
            code: p.code,
            description: p.description,
            scope: p.scope,
            discountType: p.discountType,
            discountValue: p.discountValue,
            discountCents: p.discountCents,
          })
        }
      } catch (err) {
        console.error('Failed to fetch auto-promos:', err)
      }
    }
    fetchAutoPromos()
  }, [deliveryFee, getOriginalSubtotal, subtotal])

  const quoteExpired = deliveryType === 'delivery' && Boolean(quoteExpiresAt) && quoteExpiryReached

  const menuItemMap = useMemo(() => {
    return menuItems.reduce((acc, item) => {
      acc[item.id] = item
      return acc
    }, {} as Record<string, MenuItem>)
  }, [menuItems])

  const checkoutItems: CheckoutItem[] = useMemo(() => {
    return items.map((item) => {
      const menuItem = menuItemMap[item.menu_item_id]
      const modifierTotal = item.selected_modifiers.reduce((sum, mod) => sum + mod.price_delta_cents, 0)
      const discount = item.discount_per_unit_cents ?? 0
      return {
        id: item.menu_item_id,
        name: menuItem?.name || `Item ${item.menu_item_id.slice(0, 8)}`,
        price: item.unit_price - discount + modifierTotal,
        originalPrice: item.unit_price + modifierTotal,
        discountPerUnit: discount,
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

  const menuPromoSavings = useMemo(() => {
    return items.reduce((sum, item) => {
      const discount = item.discount_per_unit_cents ?? 0
      return sum + item.quantity * discount
    }, 0)
  }, [items])

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
          .select('operating_hours, pickup_enabled, kitchen_lead_minutes, cutlery_enabled, cutlery_default')
          .limit(1)
          .single()
        if (data) {
          setStoreSettings({
            operating_hours: data.operating_hours,
            pickup_enabled: data.pickup_enabled ?? true,
            kitchen_lead_minutes: data.kitchen_lead_minutes ?? 20,
            cutlery_enabled: data.cutlery_enabled ?? true,
            cutlery_default: data.cutlery_default ?? true,
          })
        }
      } catch (err) {
        console.error('Failed to fetch store settings:', err)
      }
    }

    fetchData()
    fetchSettings()
  }, [])

  const updateQuoteStatus = useCallback((status: QuoteStatus) => {
    quoteStatusRef.current = status
    setQuoteStatus(status)
  }, [setQuoteStatus])

  const cancelQuoteRequest = useCallback(() => {
    requestTokenRef.current += 1
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
  }, [])

  const requestDeliveryQuote = useCallback(async () => {
    const address = useCheckoutStore.getState().delivery_address
    if (!address) return
    if (useCheckoutStore.getState().delivery_type !== 'delivery') return

    const token = requestTokenRef.current + 1
    requestTokenRef.current = token
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    // This request owns the current address, even before it has coordinates.
    // Without this, a second keyword-less address would look like the same
    // "in-flight" geocode and the first response could overwrite it.
    activeAddressKeyRef.current = quoteAddressKey(address)

    updateQuoteStatus('loading')
    setQuoteError(null)

    let lat = address.latitude
    let lng = address.longitude
    const addressString = formatAddress(address)

    // A stalled geocoder or Lalamove quote must not leave the UI on
    // "Calculating delivery fee..." forever: fail into the retryable error
    // state after DELIVERY_QUOTE_TIMEOUT_MS.
    let timedOut = false
    const timeoutId = window.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, DELIVERY_QUOTE_TIMEOUT_MS)

    const isStale = () => (
      token !== requestTokenRef.current ||
      // A timeout abort is a failure, not a superseded request: report it.
      (!timedOut && controller.signal.aborted) ||
      useCheckoutStore.getState().delivery_type !== 'delivery'
    )

    if (quoteKey(address) === null) {
      // This request now owns the "needs geocoding" key. Register it before
      // awaiting so the address update after geocoding cannot trigger a
      // second, duplicate quote request.
      activeQuoteKeyRef.current = null

      if (!addressString.trim()) {
        updateQuoteStatus('error')
        setQuoteError('Please enter a complete delivery address.')
        return
      }

      try {
        // Try Google Maps Geocoder first, fall through to Nominatim on failure
        if (gmapsLoaded && window.google?.maps) {
          try {
            const { Geocoder } = await google.maps.importLibrary('geocoding') as google.maps.GeocodingLibrary
            const geocoder = new Geocoder()
            const results = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
              geocoder.geocode(
                { address: addressString + ', Malaysia', componentRestrictions: { country: 'my' } },
                (result, status) => {
                  if (status === 'OK' && result) resolve(result)
                  else reject(new Error(`Geocoder status: ${status}`))
                }
              )
            })
            if (isStale()) return
            if (results.length > 0) {
              lat = results[0].geometry.location.lat()
              lng = results[0].geometry.location.lng()
            }
          } catch (gmapsErr) {
            console.warn('[Checkout] Google geocoder failed, trying Nominatim:', gmapsErr)
          }
        }

        if (isStale()) return

        // Nominatim fallback when Google Maps failed or wasn't loaded
        if (lat == null || lng == null) {
          const geoRes = await fetch(
            `https://nominatim.openstreetmap.org/search?` +
            new URLSearchParams({ format: 'json', q: addressString + ', Malaysia', limit: '1', countrycodes: 'my' }),
            { headers: { 'User-Agent': 'MadKrapow/1.0' }, signal: controller.signal }
          )
          if (!geoRes.ok) throw new Error(`Geocoder HTTP ${geoRes.status}`)
          const geoData = await geoRes.json()
          if (isStale()) return
          if (geoData.length > 0) {
            lat = parseFloat(geoData[0].lat)
            lng = parseFloat(geoData[0].lon)
          } else {
            updateQuoteStatus('error')
            setQuoteError('We could not locate this delivery address. Please check it and try again.')
            return
          }
        }
      } catch (err) {
        if (isStale()) return
        console.error('[Checkout] Geocoding failed:', err)
        updateQuoteStatus('error')
        setQuoteError('We could not locate this delivery address. Please check it and try again.')
        return
      }

      if (isStale()) return
      if (lat == null || lng == null) {
        updateQuoteStatus('error')
        setQuoteError('We could not locate this delivery address. Please check it and try again.')
        return
      }

      // Remember the new coords before the store update re-runs the effect.
      // Merge into the latest address rather than the snapshot captured at
      // request start: the customer may have changed their name/phone while
      // geocoding was in flight, and that newer data must not be overwritten.
      const latestAddress = useCheckoutStore.getState().delivery_address
      if (!latestAddress) {
        updateQuoteStatus('idle')
        return
      }
      activeQuoteKeyRef.current = quoteKey({ latitude: lat, longitude: lng })
      useCheckoutStore.getState().setDeliveryAddress({ ...latestAddress, latitude: lat, longitude: lng })
    } else {
      const currentKey = quoteKey(address)
      activeQuoteKeyRef.current = currentKey
    }

    try {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (isStale()) return

      const res = await fetch('/api/delivery/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          dropoff: {
            latitude: lat,
            longitude: lng,
            address: addressString,
          },
        }),
        signal: controller.signal,
      })

      const data = await res.json()
      if (timedOut) {
        if (token === requestTokenRef.current) {
          updateQuoteStatus('error')
          setQuoteError('Delivery quote timed out. Please retry.')
        }
        return
      }
      if (isStale()) return

      if (!res.ok || !data.success) {
        console.error('[Checkout] Quote failed:', data.error ?? `HTTP ${res.status}`)
        updateQuoteStatus('error')
        setQuoteError(
          data.code === 'OUT_OF_ZONE'
            ? 'Delivery quote failed — address may be outside service area'
            : data.error || 'Unable to get a delivery quote. Please try again.'
        )
        return
      }

      useCheckoutStore.getState().setShippingQuote({
        quotation_id: data.quotationId,
        service_type: data.serviceType,
        stop_ids: data.stopIds,
        quote_expires_at: data.expiresAt,
        price_breakdown: data.priceBreakdown,
        fee_cents: data.feeCents,
      })
      setQuoteExpiryReached(false)
      updateQuoteStatus('ready')
    } catch (err) {
      if (timedOut) {
        if (token === requestTokenRef.current) {
          updateQuoteStatus('error')
          setQuoteError('Delivery quote timed out. Please retry.')
        }
        return
      }
      if (isStale()) return
      console.error('[Checkout] Quote fetch error:', err)
      updateQuoteStatus('error')
      setQuoteError('Unable to get a delivery quote. Please try again.')
    } finally {
      window.clearTimeout(timeoutId)
      if (token === requestTokenRef.current) {
        abortControllerRef.current = null
      }
    }
  }, [gmapsLoaded, updateQuoteStatus, setQuoteError, setQuoteExpiryReached])

  const handleRefreshQuote = useCallback(() => {
    void requestDeliveryQuote()
  }, [requestDeliveryQuote])

  // Switching to pickup must cancel any pending quote so a late response can
  // never write a delivery quote into pickup mode.
  useEffect(() => {
    if (deliveryType !== 'self_pickup') return
    cancelQuoteRequest()
    updateQuoteStatus('idle')
    setQuoteError(null)
  }, [deliveryType, cancelQuoteRequest, updateQuoteStatus])

  // `isQuoteExpired()` is not reactive, so poll it and re-check when the tab
  // regains focus; only write state when the boolean actually flips.
  useEffect(() => {
    if (deliveryType !== 'delivery' || !quoteExpiresAt) {
      setQuoteExpiryReached((previous) => (previous ? false : previous))
      return
    }

    const evaluateExpiry = () => {
      const next = isQuoteExpired()
      setQuoteExpiryReached((previous) => (previous === next ? previous : next))
    }

    evaluateExpiry()
    const intervalId = window.setInterval(evaluateExpiry, 30_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') evaluateExpiry()
    }
    window.addEventListener('focus', evaluateExpiry)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', evaluateExpiry)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [deliveryType, quoteExpiresAt, isQuoteExpired])

  // Abort the in-flight request when the page unmounts. In development this
  // also runs between StrictMode effect setups; resetting the ref lets the
  // remount start a fresh request instead of trusting an aborted "loading" one.
  useEffect(() => {
    return () => {
      requestTokenRef.current += 1
      quoteStatusRef.current = 'idle'
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!deliveryAddress) return

    const currentKey = quoteKey(deliveryAddress)
    const currentAddressKey = quoteAddressKey(deliveryAddress)

    // A persisted quote is already associated with the saved address/coords on
    // mount. Track both identities so the effect can tell later changes apart.
    if (deliveryQuote && !quoteExpired) {
      if (activeQuoteKeyRef.current === null && currentKey) {
        activeQuoteKeyRef.current = currentKey
      }
      if (activeAddressKeyRef.current === null) {
        activeAddressKeyRef.current = currentAddressKey
      }
    }

    const decision = decideQuoteNeed({
      deliveryType,
      hasAddressLine1: Boolean(deliveryAddress.address_line1?.trim()),
      addressKey: currentAddressKey,
      coordsKey: currentKey,
      hasQuote: Boolean(deliveryQuote || priceBreakdown),
      quoteExpired,
      activeAddressKey: activeAddressKeyRef.current,
      activeKey: activeQuoteKeyRef.current,
      status: quoteStatusRef.current,
    })

    if (decision.action === 'fetch') {
      void requestDeliveryQuote()
    }
  }, [deliveryAddress, deliveryType, deliveryQuote, priceBreakdown, quoteExpired, requestDeliveryQuote])

  const isCartEmpty = items.length === 0
  const hasDeliveryAddress = !!deliveryAddress
  const quoteFailed = deliveryType === 'delivery' && quoteStatus === 'error'

  const needsDeliveryAddress = deliveryType === 'delivery'
  const needsScheduledTime = fulfillmentType === 'scheduled'
  const hasScheduledTime = !!scheduledWindow
  const needsScheduleSelection = needsScheduledTime && !hasScheduledTime
  const hasUsableDeliveryQuote = !needsDeliveryAddress || Boolean(deliveryQuote || priceBreakdown)

  const canCheckout =
    !isCartEmpty &&
    (!needsDeliveryAddress || hasDeliveryAddress) &&
    !needsScheduleSelection &&
    !quoteExpired &&
    !quoteFailed &&
    !isDeliveryFeeLoading &&
    hasUsableDeliveryQuote

  const currentStep = needsDeliveryAddress && !hasDeliveryAddress ? 1
    : needsScheduleSelection ? 1
    : isBulkMode ? 1
    : 2

  const handlePayNow = async () => {
    if (!canCheckout || isProcessing) return

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
        promoCodes: useCartStore.getState().appliedPromos.map(p => ({ code: p.code, scope: p.scope })),
        includeCutlery: useCartStore.getState().includeCutlery,
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

      // Don't clear cart before Stripe redirect — cart must survive if user cancels or goes back.
      // Cart is cleared on /order/success page after payment is confirmed via webhook.
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
          <div className="py-8">
            <div className="flex items-center gap-4 mb-8">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/cart">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Cart
                </Link>
              </Button>
              <h1 className="text-xl font-semibold font-display">Checkout</h1>
            </div>
            <CheckoutSkeleton />
          </div>
        </PageContainer>
      </main>
    )
  }

  // Show verification prompt if authenticated but email not confirmed
  if (authChecked && !isVerified) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer size="narrow">
          <div className="py-8">
            <div className="flex items-center gap-4 mb-8">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/cart">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Cart
                </Link>
              </Button>
              <h1 className="text-xl font-semibold font-display">Checkout</h1>
            </div>
            <div className="flex flex-col items-center justify-center py-12 animate-fade-in-up">
              <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                <Mail className="h-8 w-8 text-amber-500" />
              </div>
              <h2 className="text-xl font-semibold mb-2 text-center font-display">Verify your email to continue</h2>
              <p className="text-muted-foreground text-center mb-6 max-w-md">
                We sent a verification link to <strong>{userEmail}</strong>.
                Please check your inbox and confirm your email address to proceed with checkout.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                >
                  {resendStatus === 'sending' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : resendStatus === 'sent' ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Verification email sent
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Resend verification email
                    </>
                  )}
                </Button>
                <Button variant="ghost" asChild>
                  <Link href="/cart">Back to Cart</Link>
                </Button>
              </div>
              {resendStatus === 'error' && (
                <p className="text-destructive text-sm mt-3">Failed to resend verification email. Please try again.</p>
              )}
              <p className="text-xs text-muted-foreground mt-6">
                Already verified? <button onClick={() => window.location.reload()} className="text-primary hover:underline">Refresh this page</button>
              </p>
            </div>
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
            <div className="flex items-center gap-4 mb-8">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/#menu">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Menu
                </Link>
              </Button>
              <h1 className="text-xl font-semibold font-display">Order Submitted</h1>
            </div>
            <div className="flex flex-col items-center justify-center py-12 animate-fade-in-up">
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <span className="text-2xl text-green-500">&#10003;</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 text-center font-display">Bulk Order Submitted!</h2>
              <p className="text-muted-foreground text-center mb-6">{successMessage}</p>
              <Link href="/orders">
                <Button className="shadow-gold">View My Orders</Button>
              </Link>
            </div>
          </div>
        </PageContainer>
      </main>
    )
  }

  if (!isHydrated) {
    return (
      <main className="min-h-screen bg-background">
        <PageContainer size="narrow">
          <div className="py-8">
            <div className="flex items-center gap-4 mb-8">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/cart">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Cart
                </Link>
              </Button>
              <h1 className="text-xl font-semibold font-display">Checkout</h1>
            </div>
            <CheckoutSkeleton />
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
            <div className="flex items-center gap-4 mb-8">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/#menu">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Menu
                </Link>
              </Button>
              <h1 className="text-xl font-semibold font-display">Checkout</h1>
            </div>
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground text-center mb-6">
                Your cart is empty. Add some items first.
              </p>
              <Link href="/">
                <Button className="shadow-gold">Browse Menu</Button>
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
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/cart">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Cart
              </Link>
            </Button>
            <h1 className="text-2xl font-semibold font-display">Checkout</h1>
          </div>

          <StepIndicator currentStep={currentStep} />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3 space-y-6">
              <section className="rounded-xl border bg-card p-5 shadow-sm">
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
                          sizes="56px"
                          className="h-14 w-14 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-lg bg-muted flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{item.quantity}x</span>
                          <span>{item.name}</span>
                        </div>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="mt-0.5">
                            {item.modifiers.map((mod) => (
                              <p key={mod.id} className="text-muted-foreground text-xs leading-relaxed">
                                {mod.name}{mod.price_delta_cents > 0 ? ` (+${formatPrice(mod.price_delta_cents)})` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="flex-shrink-0">
                        {item.discountPerUnit && item.discountPerUnit > 0 ? (
                          <div className="text-right">
                            <div className="text-primary font-medium">{formatPrice(item.price * item.quantity)}</div>
                            <div className="text-[11px] text-muted-foreground line-through">{formatPrice((item.originalPrice ?? item.price) * item.quantity)}</div>
                          </div>
                        ) : (
                          formatPrice(item.price * item.quantity)
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

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
                  <section className="rounded-xl border bg-card p-5 shadow-sm">
                    <h2 className="text-lg font-semibold mb-4 font-display">Contact Info</h2>
                    {isLoadingProfile ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : profileContacts.length > 0 && !showContactInput ? (
                      <SavedContactSelector
                        contacts={profileContacts}
                        onAddNew={() => setShowContactInput(true)}
                      />
                    ) : showContactInput ? (
                      <div className="space-y-4">
                        <DeliveryAddressInput
                          onAddressSelect={() => {
                            setShowContactInput(false)
                            setShowAddressInput(false)
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setShowContactInput(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center p-4 border border-dashed rounded-lg">
                        <p className="text-muted-foreground mb-3">No saved contacts</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowContactInput(true)}
                        >
                          Add Contact
                        </Button>
                      </div>
                    )}
                  </section>

                  {deliveryType === 'delivery' && (
                    <section className="rounded-xl border bg-card p-5 shadow-sm">
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
                      ) : isLoadingProfile ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : profileAddresses.length > 0 && !showAddressInput ? (
                        <SavedAddressSelector
                          addresses={profileAddresses}
                          onAddNew={() => setShowAddressInput(true)}
                        />
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

                  <section className="rounded-xl border bg-card p-5 shadow-sm">
                    <DeliveryTypeSelector pickupEnabled={storeSettings?.pickup_enabled ?? true} />
                  </section>

                  <section className="rounded-xl border bg-card p-5 shadow-sm">
                    <FulfillmentSelector />
                  </section>

                  {storeSettings?.cutlery_enabled !== false && (
                    <section className="rounded-xl border bg-card p-5 shadow-sm">
                      <label className="flex items-center justify-between cursor-pointer">
                        <div>
                          <span className="text-sm font-medium">Include cutlery?</span>
                          <p className="text-xs text-muted-foreground">Help reduce waste. Uncheck if you don&apos;t need forks/spoons.</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={includeCutlery}
                          onChange={(e) => setIncludeCutlery(e.target.checked)}
                          className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </label>
                    </section>
                  )}

                  {fulfillmentType === 'scheduled' && (
                    <section className="rounded-xl border bg-card p-5 shadow-sm">
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

            <div className="lg:col-span-2">
              <div className="lg:sticky lg:top-24 space-y-4">
                <section className="rounded-xl border bg-card p-5 shadow-sm">
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
                      {deliveryType === 'self_pickup' ? (
                        <span>Free</span>
                      ) : isDeliveryFeeLoading ? (
                        <Skeleton className="h-4 w-20" />
                      ) : deliveryFee > 0 ? (
                        <span>{formatPrice(deliveryFee)}</span>
                      ) : quoteFailed ? (
                        <span className="text-destructive text-xs">Quote failed</span>
                      ) : (
                        <span className="text-muted-foreground">Free</span>
                      )}
                    </div>
                    {deliveryType === 'delivery' && serviceType && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Service</span>
                        <span>{serviceType === 'CAR' ? 'Car' : 'Motorcycle'}</span>
                      </div>
                    )}
                    {storeSettings?.cutlery_enabled !== false && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Cutlery</span>
                        <span>{includeCutlery ? 'Yes' : 'No'}</span>
                      </div>
                    )}
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
                    {quoteFailed && (
                      <div className="p-2 bg-destructive/10 rounded-lg text-sm flex items-center justify-between gap-2">
                        <span className="text-destructive">
                          {quoteError ?? 'Delivery quote failed — address may be outside service area'}
                        </span>
                        <button
                          onClick={handleRefreshQuote}
                          className="text-destructive hover:text-destructive/80 font-medium underline whitespace-nowrap"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {menuPromoSavings > 0 && (
                      <div className="flex justify-between text-sm text-primary">
                        <span>Menu Promo Savings</span>
                        <span>-{formatPrice(menuPromoSavings)}</span>
                      </div>
                    )}
                    <PromoCodeInput
                      subtotalCents={subtotal}
                      deliveryFeeCents={deliveryFee}
                    />
                    {promoDiscount > 0 && (
                      <div className="flex justify-between text-sm text-primary">
                        <span>Promo Code Discount</span>
                        <span>-{formatPrice(promoDiscount)}</span>
                      </div>
                    )}
                    <div className="border-t border-primary/30 pt-4 mt-4">
                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total</span>
                        <span className="text-primary">{formatPrice(total)}</span>
                      </div>
                    </div>
                  </div>
                </section>

                {error && (
                  <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                    {error}
                  </div>
                )}

                <Button
                  className="w-full shadow-gold"
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
                  ) : needsDeliveryAddress && isDeliveryFeeLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Calculating delivery fee...
                    </>
                  ) : quoteFailed ? (
                    'Delivery quote unavailable'
                  ) : needsDeliveryAddress && !deliveryQuote && !priceBreakdown ? (
                    'Waiting for delivery quote'
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
