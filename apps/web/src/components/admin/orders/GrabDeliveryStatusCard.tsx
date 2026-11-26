"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBrowserClient } from "@/lib/supabase/client";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Awaiting acceptance",
  ACCEPTED: "Order accepted",
  DRIVER_ALLOCATED: "Rider assigned",
  DRIVER_ARRIVED: "Rider arrived",
  COLLECTED: "Picked up",
  DELIVERED: "Delivered",
  COMPLETED: "Delivered",
  CANCELLED: "Cancelled",
  FAILED: "Delivery failed",
  REFUNDED: "Refunded",
  BILL_PAID: "Bill paid",
  Accepted: "Order accepted",
  DriverAssigned: "Rider assigned",
  DriverArrived: "Rider arrived",
  Collected: "Picked up",
  Completed: "Delivered",
  Cancelled: "Cancelled",
  Failed: "Delivery failed",
};

export function GrabDeliveryStatusCard({ orderId, terminal }: { orderId: string; terminal: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    let active = true;
    let inFlight = false;
    let refreshPending = false;

    const refresh = async () => {
      if (inFlight) {
        refreshPending = true;
        return;
      }
      inFlight = true;
      try {
        const { data, error } = await supabase
          .from("channel_orders")
          .select("external_status")
          .eq("order_id", orderId)
          .eq("channel", "grabfood")
          .maybeSingle();
        if (!active) return;
        if (error) setUncertain(true);
        else {
          setStatus(data?.external_status ?? null);
          setUncertain(false);
        }
      } catch {
        if (active) setUncertain(true);
      } finally {
        inFlight = false;
        if (active) {
          setLoading(false);
          if (refreshPending && document.visibilityState === "visible" && !terminal) {
            refreshPending = false;
            void refresh();
          }
        }
      }
    };

    void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !terminal) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = terminal ? null : setInterval(() => {
      if (document.visibilityState === "visible" && !inFlight) void refresh();
    }, 15000);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (interval !== null) clearInterval(interval);
    };
  }, [orderId, terminal]);

  return (
    <Card>
      <CardHeader><CardTitle>Grab delivery status</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        <p className="text-sm text-muted-foreground">Latest update from Grab</p>
        <p className="font-medium">
          {loading ? "Checking Grab delivery status…" : status ? STATUS_LABELS[status] ?? "Other update from Grab" : "No Grab delivery update available"}
        </p>
        {uncertain && <p role="alert" className="text-sm text-amber-700">Unable to refresh Grab delivery status; the latest update may be out of date.</p>}
      </CardContent>
    </Card>
  );
}
