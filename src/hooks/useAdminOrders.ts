"use client";

import { useEffect, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/client";

export interface AdminOrder {
  id: string;
  status: string;
  total_amount: number;
  delivery_fee: number;
  created_at: string;
  delivery_address: string;
  customer_phone: string | null;
  customer_name: string | null;
}

export function useAdminOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();

    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setError(error.message);
        return;
      }

      setOrders(data || []);
      setLoading(false);
    };

    fetchOrders();

    const channel = supabase
      .channel("admin-orders-hook")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<AdminOrder>) => {
          setOrders((prev) => [payload.new as AdminOrder, ...prev]);
          window.dispatchEvent(new Event("new-order-alert"));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload: RealtimePostgresChangesPayload<AdminOrder>) => {
          const nextOrder = payload.new as AdminOrder;
          setOrders((prev) =>
            prev.map((order) =>
              order.id === nextOrder.id ? nextOrder : order
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { orders, loading, error };
}
