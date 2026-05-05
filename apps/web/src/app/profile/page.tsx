"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Menu, LogOut, Loader2 } from "lucide-react"
import { getBrowserClient } from "@/lib/supabase/client"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { DashboardPageContainer } from "@/components/dashboard/DashboardPageContainer"
import { DashboardStats } from "@/components/dashboard/DashboardStats"
import { QuickActions } from "@/components/dashboard/QuickActions"
import { AddressManager } from "@/components/profile/AddressManager"
import { ContactManager } from "@/components/profile/ContactManager"
import { PersonalInfoEditor } from "@/components/profile/PersonalInfoEditor"
import { PasswordChangeForm } from "@/components/profile/PasswordChangeForm"
import { Button } from "@/components/ui/button"

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

interface CustomerContact {
  id: string
  name: string
  phone: string
  is_default: boolean
}

interface Customer {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  avatarUrl: string | null
  addresses: CustomerAddress[]
  contacts: CustomerContact[]
}

interface Order {
  id: string
  status: string
  total_cents: number
  delivery_fee_cents: number
  created_at: string
  delivery_address_json: Record<string, unknown> | null
  delivery_type: string
}

export default function ProfilePage() {
  const router = useRouter()
  const supabase = getBrowserClient()

  const [isLoading, setIsLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth")
        return
      }

      const [customerRes, ordersRes] = await Promise.all([
        fetch("/api/customer/profile"),
        fetch("/api/orders"),
      ])

      const customerData = await customerRes.json()
      const ordersData = await ordersRes.json()

      if (!customerData.success) {
        if (customerRes.status === 401) {
          router.push("/auth")
          return
        }
        setError(customerData.error || "Failed to load profile")
      } else {
        setCustomer(customerData.customer)
      }

      if (ordersData.success) {
        setOrders(ordersData.orders)
      }
    } catch (err) {
      console.error("Failed to fetch data:", err)
      setError("Failed to load profile")
    } finally {
      setIsLoading(false)
    }
  }, [router, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    )
  }

  if (error && !customer) {
    return (
      <main className="min-h-screen bg-background">
        <DashboardPageContainer>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center max-w-sm">
              <p className="text-red-400 mb-4 text-sm">{error}</p>
              <Button onClick={fetchData}>Try Again</Button>
            </div>
          </div>
        </DashboardPageContainer>
      </main>
    )
  }

  return (
    <>
      <DashboardSidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
      />

      <DashboardPageContainer collapsed={sidebarCollapsed}>
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold font-heading text-foreground">Profile</h1>
          </div>
          <div className="hidden lg:block">
            <h1 className="text-xl font-semibold font-heading text-foreground">Profile</h1>
            {customer?.email && (
              <p className="text-sm text-muted-foreground mt-0.5">{customer.email}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
            onClick={handleSignOut}
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </Button>
        </div>

        <div className="space-y-6">
          {/* Stats */}
          <DashboardStats orders={orders} />

          {/* Quick Actions */}
          <QuickActions />

          {/* Profile & Addresses */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PersonalInfoEditor customer={customer} onChange={fetchData} />
            <PasswordChangeForm />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <AddressManager
              customerId={customer?.id || ""}
              addresses={customer?.addresses || []}
              onChange={fetchData}
            />
            <ContactManager
              customerId={customer?.id || ""}
              contacts={customer?.contacts || []}
              onChange={fetchData}
            />
          </div>
        </div>
      </DashboardPageContainer>
    </>
  )
}
