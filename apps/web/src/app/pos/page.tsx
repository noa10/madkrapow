'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Minus, Plus, ShoppingBag, Store, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { useToastStore } from '@/stores/toast'
import { getBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface PosMenuItem {
  id: string
  name: string
  price_cents: number
  is_available: boolean
  category_id: string
}

interface PosCategory {
  id: string
  name: string
  sort_order: number
  is_active: boolean
}

interface CartLine {
  menuItem: PosMenuItem
  quantity: number
}

type PaymentMethod = 'cash' | 'qr_pay'

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'qr_pay', label: 'QR Pay' },
]

function formatPrice(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`
}

export default function PosPage() {
  const { hasAccess, isLoading: isAccessLoading } = useRoleGuard([
    'admin',
    'manager',
    'cashier',
  ])
  const addToast = useToastStore((s) => s.addToast)

  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<PosCategory[]>([])
  const [menuItems, setMenuItems] = useState<PosMenuItem[]>([])
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [customerName, setCustomerName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)

  useEffect(() => {
    if (!hasAccess) return
    let cancelled = false
    ;(async () => {
      const supabase = getBrowserClient()
      const [catsRes, itemsRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, sort_order, is_active')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('menu_items')
          .select('id, name, price_cents, is_available, category_id')
          .eq('is_available', true)
          .order('sort_order'),
      ])
      if (cancelled) return
      if (catsRes.error || itemsRes.error) {
        addToast({ type: 'error', title: 'Failed to load menu' })
      } else {
        setCategories((catsRes.data as PosCategory[]) ?? [])
        setMenuItems((itemsRes.data as PosMenuItem[]) ?? [])
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [hasAccess, addToast])

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, PosMenuItem[]>()
    for (const item of menuItems) {
      const list = map.get(item.category_id) ?? []
      list.push(item)
      map.set(item.category_id, list)
    }
    return map
  }, [menuItems])

  const totalCents = useMemo(
    () => cart.reduce((sum, line) => sum + line.menuItem.price_cents * line.quantity, 0),
    [cart]
  )

  const addToCart = useCallback((menuItem: PosMenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItem.id === menuItem.id)
      if (existing) {
        return prev.map((l) =>
          l.menuItem.id === menuItem.id ? { ...l, quantity: l.quantity + 1 } : l
        )
      }
      return [...prev, { menuItem, quantity: 1 }]
    })
  }, [])

  const changeQuantity = useCallback((menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.menuItem.id === menuItemId ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    )
  }, [])

  const resetCart = useCallback(() => {
    setCart([])
    setCustomerName('')
    setPaymentMethod('cash')
  }, [])

  const submitOrder = useCallback(async () => {
    if (cart.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const supabase = getBrowserClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: cart.map((l) => ({ menu_item_id: l.menuItem.id, quantity: l.quantity })),
          payment_method: paymentMethod,
          customer_name: customerName.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        addToast({
          type: 'error',
          title: 'Failed to create order',
          description: data?.error ?? `HTTP ${res.status}`,
        })
        return
      }
      setLastOrderNumber(data.order_number)
      addToast({
        type: 'success',
        title: `Order ${data.order_number} created`,
        description: `${formatPrice(data.total_cents)} — ${paymentMethod === 'cash' ? 'Cash' : 'QR Pay'}`,
      })
      resetCart()
    } catch (err) {
      addToast({ type: 'error', title: 'Network error creating order' })
      console.error('[POS] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [cart, submitting, paymentMethod, customerName, addToast, resetCart])

  if (isAccessLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Staff access required.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Counter POS</h1>
        </div>
        {lastOrderNumber && (
          <span className="text-xs text-muted-foreground">Last: {lastOrderNumber}</span>
        )}
      </header>

      <div className="flex flex-col lg:flex-row">
        {/* Item grid */}
        <div className="flex-1 p-4 space-y-6">
          {categories.map((category) => {
            const items = itemsByCategory.get(category.id) ?? []
            if (items.length === 0) return null
            return (
              <section key={category.id}>
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {category.name}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors p-3 text-left"
                    >
                      <div className="text-sm font-medium leading-tight">{item.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                        {formatPrice(item.price_cents)}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>

        {/* Cart */}
        <aside className="lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 p-4 space-y-4 lg:sticky lg:top-0 lg:h-screen overflow-y-auto">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Current Sale</span>
          </div>

          {cart.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tap items to add them.</p>
          ) : (
            <ul className="space-y-2">
              {cart.map((line) => (
                <li
                  key={line.menuItem.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{line.menuItem.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatPrice(line.menuItem.price_cents * line.quantity)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => changeQuantity(line.menuItem.id, -1)}
                      className="rounded p-1 hover:bg-white/10"
                      aria-label={`Remove one ${line.menuItem.name}`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm tabular-nums w-5 text-center">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() => changeQuantity(line.menuItem.id, 1)}
                      className="rounded p-1 hover:bg-white/10"
                      aria-label={`Add one ${line.menuItem.name}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => changeQuantity(line.menuItem.id, -line.quantity)}
                      className="rounded p-1 hover:bg-white/10 text-red-400"
                      aria-label={`Clear ${line.menuItem.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2">
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="h-8 text-sm bg-white/5"
              maxLength={120}
            />
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPaymentMethod(opt.value)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    paymentMethod === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-baseline justify-between border-t border-white/10 pt-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-semibold tabular-nums">
              {formatPrice(totalCents)}
            </span>
          </div>

          <Button
            onClick={submitOrder}
            disabled={cart.length === 0 || submitting}
            className="w-full"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Charge ${formatPrice(totalCents)}`
            )}
          </Button>
        </aside>
      </div>
    </div>
  )
}
