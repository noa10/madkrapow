import { create } from "zustand"
import type { Order, OrderTab, DateRange } from "@/types/orders"

export type DateFilterValue = "today" | "weekly" | "monthly" | "custom"

export interface CustomDateRange {
  start: string
  end: string
}

export type SourceFilterValue = "all" | import("@/types/orders").OrderSource

interface TabCache {
  orders: Order[]
  isLoading: boolean
  error: Error | null
  lastFetchedAt: number
  refetchTrigger: number
}

type TabCaches = Record<OrderTab, TabCache>

interface AdminOrdersState {
  activeTab: OrderTab
  caches: TabCaches
  dateRange: DateRange
  activeDateFilter: DateFilterValue
  customDateRange: CustomDateRange
  orderTabAssignments: Map<string, OrderTab[]>
  sourceFilter: SourceFilterValue
}

interface AdminOrdersActions {
  setActiveTab: (tab: OrderTab) => void
  setTabOrders: (tab: OrderTab, orders: Order[]) => void
  setTabLoading: (tab: OrderTab, loading: boolean) => void
  setTabError: (tab: OrderTab, error: Error | null) => void
  invalidateTab: (tab: OrderTab) => void
  invalidateAllTabs: () => void
  setDateRange: (range: DateRange) => void
  setActiveDateFilter: (filter: DateFilterValue) => void
  setCustomDateRange: (range: CustomDateRange) => void
  setOrderTabAssignments: (assignments: Map<string, OrderTab[]>) => void
  setSourceFilter: (source: SourceFilterValue) => void
}

const initialTabCache = (): TabCache => ({
  orders: [],
  isLoading: false,
  error: null,
  lastFetchedAt: 0,
  refetchTrigger: 0,
})

const initialCaches = (): TabCaches => ({
  preparing: initialTabCache(),
  ready: initialTabCache(),
  upcoming: initialTabCache(),
  history: initialTabCache(),
})

export const useAdminOrdersStore = create<AdminOrdersState & AdminOrdersActions>()((set) => ({
  activeTab: "preparing",
  caches: initialCaches(),
  dateRange: { start: "", end: "" },
  activeDateFilter: "today",
  customDateRange: { start: "", end: "" },
  orderTabAssignments: new Map(),
  sourceFilter: "all",

  setActiveTab: (tab) => set({ activeTab: tab }),

  setTabOrders: (tab, orders) =>
    set((state) => ({
      caches: {
        ...state.caches,
        [tab]: {
          ...state.caches[tab],
          orders,
          isLoading: false,
          error: null,
          lastFetchedAt: Date.now(),
        },
      },
    })),

  setTabLoading: (tab, loading) =>
    set((state) => ({
      caches: {
        ...state.caches,
        [tab]: {
          ...state.caches[tab],
          isLoading: loading,
        },
      },
    })),

  setTabError: (tab, error) =>
    set((state) => ({
      caches: {
        ...state.caches,
        [tab]: {
          ...state.caches[tab],
          isLoading: false,
          error,
        },
      },
    })),

  invalidateTab: (tab) =>
    set((state) => ({
      caches: {
        ...state.caches,
        [tab]: {
          ...state.caches[tab],
          lastFetchedAt: 0,
          refetchTrigger: state.caches[tab].refetchTrigger + 1,
        },
      },
    })),

  invalidateAllTabs: () =>
    set((state) => ({
      caches: {
        preparing: {
          ...state.caches.preparing,
          lastFetchedAt: 0,
          refetchTrigger: state.caches.preparing.refetchTrigger + 1,
        },
        ready: {
          ...state.caches.ready,
          lastFetchedAt: 0,
          refetchTrigger: state.caches.ready.refetchTrigger + 1,
        },
        upcoming: {
          ...state.caches.upcoming,
          lastFetchedAt: 0,
          refetchTrigger: state.caches.upcoming.refetchTrigger + 1,
        },
        history: {
          ...state.caches.history,
          lastFetchedAt: 0,
          refetchTrigger: state.caches.history.refetchTrigger + 1,
        },
      },
    })),

  setDateRange: (range) => set({ dateRange: range }),
  setActiveDateFilter: (filter) => set({ activeDateFilter: filter }),
  setCustomDateRange: (range) => set({ customDateRange: range }),

  setOrderTabAssignments: (assignments) => set({ orderTabAssignments: assignments }),
  setSourceFilter: (sourceFilter) => set({ sourceFilter }),
}))
