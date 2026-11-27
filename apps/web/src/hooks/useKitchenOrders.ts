"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";
import { isKitchenActive, KITCHEN_QUEUE_OR_FILTER } from "@/lib/orders/kitchen";
import { mergeRealtimeOrder } from "@/lib/orders/realtime";

export interface AdminOrder {
  id: string;
  display_code?: string | null;
  channel_orders?: { channel: string; external_order_number: string | null }[] | null;
  status: string;
  total_cents: number;
  delivery_fee_cents: number;
  created_at: string;
  delivery_address_json: string | Record<string, unknown> | null;
  customer_phone: string | null;
  customer_name: string | null;
  delivery_type: string;
  /** Dine-in table label snapshot (delivery_type = 'dine_in'). */
  table_label?: string | null;
  /** Dine-in party size. */
  pax?: number | null;
  fulfillment_type: string;
  scheduled_for: string | null;
  /** Free-text note the customer left for the whole order. */
  notes: string | null;
  /** Whether the kitchen should pack cutlery. */
  include_cutlery: boolean;
  source: import("@/types/orders").OrderSource;
}

export function useKitchenOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    const supabase = getBrowserClient();
    let active = true;
    let latestRequest = 0;
    let latestSuccess = 0;
    let latestFailure = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<AdminOrder[]>();
    const requests = new Map<AbortController, ReturnType<typeof setTimeout>>();

    const fetchOrders = async () => {
      const request = ++latestRequest;
      const changes: AdminOrder[] = [];
      const controller = new AbortController();
      pending.add(changes);
      const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        requests.set(controller, setTimeout(() => {
          controller.abort();
          resolve({ data: null, error: { message: "Kitchen orders request timed out" } });
        }, 15000));
      });
      const { data, error } = await Promise.race([supabase
        .from("orders")
        .select("*, channel_orders(channel, external_order_number)")
        // Only tickets the kitchen board can show. This keeps completed
        // orders and abandoned web checkouts from crowding out active
        // tickets under the row cap.
        .or(KITCHEN_QUEUE_OR_FILTER)
        .order("created_at", { ascending: false })
        .abortSignal(controller.signal)
        .limit(200), timeout]);

      clearTimeout(requests.get(controller));
      requests.delete(controller);
      pending.delete(changes);
      if (!active) return;
      if (request < latestSuccess) {
        if (changes.length) void fetchOrders();
        return;
      }
      if (error) {
        if (request >= latestFailure) {
          latestFailure = request;
          setError(error.message);
          clearTimeout(retry);
          retry = setTimeout(() => void fetchOrders(), 5000);
        }
        setLoading(false);
        return;
      }
      latestSuccess = request;

      const snapshot = changes.reduce<AdminOrder[]>((current, next) => {
        if (!isKitchenActive(next)) return current.filter((order) => order.id !== next.id);
        return current.some((order) => order.id === next.id)
          ? current.map((order) => order.id === next.id ? mergeRealtimeOrder(order, next) : order)
          : [next, ...current];
      }, data || []);
      setHasLoaded(true);
      if (request > latestFailure) {
        clearTimeout(retry);
        setError(null);
      }
      setOrders(snapshot);
      setLoading(false);
      // A queued event can be older than this snapshot, so confirm again.
      if (changes.length) void fetchOrders();
    };

    refreshRef.current = () => void fetchOrders();
    void fetchOrders();
    // Realtime may not deliver updates to rows that leave the kitchen RLS set.
    const interval = setInterval(() => {
      if (pending.size === 0) void fetchOrders();
    }, 30000);

    const channel = supabase
      .channel("admin-orders-hook")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<AdminOrder>) => {
          const nextOrder = payload.new as AdminOrder;
          if (!isKitchenActive(nextOrder)) return;
          for (const changes of pending) changes.push(nextOrder);
          setOrders((prev) =>
            prev.some((order) => order.id === nextOrder.id)
              ? prev.map((order) =>
                  order.id === nextOrder.id ? mergeRealtimeOrder(order, nextOrder) : order
                )
              : [nextOrder, ...prev]
          );
          window.dispatchEvent(new Event("new-order-alert"));
          void fetchOrders();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<AdminOrder>) => {
          const nextOrder = payload.new as AdminOrder;
          for (const changes of pending) changes.push(nextOrder);
          setOrders((prev) => {
            // A ticket that left the active set (ready → picked_up, or a
            // cancellation) disappears from the board immediately.
            if (!isKitchenActive(nextOrder)) {
              return prev.filter((order) => order.id !== nextOrder.id);
            }
            return prev.some((order) => order.id === nextOrder.id)
              ? prev.map((order) =>
                  order.id === nextOrder.id ? mergeRealtimeOrder(order, nextOrder) : order
                )
              : [nextOrder, ...prev];
          });
          // Only the Grab channel embed can change without an `orders`
          // column change; other updates are fully described by the payload.
          if (nextOrder.source === "grabfood") void fetchOrders();
        }
      )
      .subscribe();

    return () => {
      active = false;
      refreshRef.current = () => {};
      clearInterval(interval);
      clearTimeout(retry);
      for (const [controller, timeout] of requests) {
        clearTimeout(timeout);
        controller.abort();
      }
      requests.clear();
      supabase.removeChannel(channel);
    };
  }, []);

  return { orders, loading, error, hasLoaded, refresh };
}
