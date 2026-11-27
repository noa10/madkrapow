"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Package, X, Ban, BadgeDollarSign, ChefHat } from "lucide-react";
import { getAdminAuth, getCachedAdminAuth, subscribeAdminAuth } from "@/lib/admin/role-cache";
import {
  CANCELLABLE_STATUSES,
  TERMINAL_STATUSES,
  parseOrderStatus,
} from "@/lib/orders/status";

interface StatusTransitionButtonsProps {
  orderId: string;
  currentStatus: string;
  isGrabFood?: boolean;
  onStatusUpdate?: (newStatus: string) => void;
}

interface FlowStep {
  status: string;
  label: string;
  icon: React.ElementType;
  next: string;
}

const STATUS_FLOW: FlowStep[] = [
  { status: "pending", label: "Mark as Paid", icon: BadgeDollarSign, next: "paid" },
  { status: "paid", label: "Start Preparing", icon: ChefHat, next: "preparing" },
  { status: "preparing", label: "Mark Ready", icon: Package, next: "ready" },
];

export function StatusTransitionButtons({
  orderId,
  currentStatus,
  isGrabFood = false,
  onStatusUpdate,
}: StatusTransitionButtonsProps) {
  const [forwardLoading, setForwardLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState(() => getCachedAdminAuth()?.role ?? null);

  useEffect(() => {
    if (!isGrabFood) return;
    let active = true;
    const unsubscribe = subscribeAdminAuth((snapshot) => setRole(snapshot.role));
    void getAdminAuth()
      .then((snapshot) => { if (active) setRole(snapshot.role); })
      .catch(() => { if (active) setRole(null); });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [isGrabFood]);

  const canConfirmGrabReady =
    isGrabFood && (role === "admin" || role === "manager") &&
    (currentStatus === "paid" || currentStatus === "preparing");

  const parsed = parseOrderStatus(currentStatus);
  const currentStep = STATUS_FLOW.find((s) => s.status === currentStatus);
  const canForward = currentStep !== undefined;
  const canCancel = parsed !== "unknown" && CANCELLABLE_STATUSES.has(parsed);
  const isTerminal = parsed !== "unknown" && TERMINAL_STATUSES.has(parsed);

  const handleTransition = useCallback(
    async (targetStatus: string, localReadyOnly = false) => {
      if (!orderId) return;

      setError(null);
      if (targetStatus === "cancelled") {
        setCancelLoading(true);
      } else {
        setForwardLoading(true);
      }

      try {
        const response = await fetch(`/api/admin/orders/${orderId}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            localReadyOnly
              ? { status: targetStatus, alreadyMarkedReadyInGrab: true }
              : { status: targetStatus }
          ),
        });

        if (!response.ok) {
          try {
            const body = await response.json();
            setError(
              body.error || `Failed to update status (HTTP ${response.status})`
            );
          } catch {
            setError(`Failed to update status (HTTP ${response.status})`);
          }
          return;
        }

        let savedStatus = targetStatus;
        try {
          const result = await response.json();
          const parsedStatus = parseOrderStatus(result?.status);
          if (parsedStatus !== "unknown") savedStatus = parsedStatus;
        } catch {
          // Older responses may not contain JSON; keep the requested status.
        }

        if (onStatusUpdate) {
          onStatusUpdate(savedStatus);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setForwardLoading(false);
        setCancelLoading(false);
      }
    },
    [orderId, onStatusUpdate]
  );

  if (isTerminal || (!canForward && !canCancel && !canConfirmGrabReady)) {
    return null;
  }

  const ForwardIcon = currentStep?.icon ?? Package;
  const loading = forwardLoading || cancelLoading;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canForward && (
        <Button
          onClick={() => handleTransition(currentStep.next)}
          disabled={loading}
          className="gap-2"
        >
          {forwardLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ForwardIcon className="h-4 w-4" />
          )}
          {currentStep.label}
        </Button>
      )}

      {canConfirmGrabReady && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (typeof window !== "undefined" && !window.confirm(
              "Only continue if you already marked this order Ready in the Grab Merchant app. " +
                "This updates Mad Krapow to Ready and will not notify Grab."
            )) return;
            void handleTransition("ready", true);
          }}
          disabled={loading}
          className="gap-2"
        >
          Already marked ready in Grab
        </Button>
      )}

      {canCancel && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => handleTransition("cancelled")}
          disabled={loading}
          className="gap-2"
        >
          {cancelLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Ban className="h-4 w-4" />
          )}
          Cancel Order
        </Button>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive w-full">
          <X className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
