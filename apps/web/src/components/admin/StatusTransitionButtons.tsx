"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ChefHat, Package, X, Ban } from "lucide-react";

interface StatusTransitionButtonsProps {
  orderId: string;
  currentStatus: string;
  onStatusUpdate?: (newStatus: string) => void;
}

interface FlowStep {
  status: string;
  label: string;
  icon: React.ElementType;
  next: string;
}

const STATUS_FLOW: FlowStep[] = [
  { status: "paid", label: "Start Preparing", icon: ChefHat, next: "preparing" },
  { status: "preparing", label: "Mark Ready", icon: Package, next: "ready" },
  { status: "ready", label: "Mark Picked Up", icon: Package, next: "picked_up" },
];

/** Statuses from which an admin can cancel an order. */
const CANCELLABLE_STATUSES = ["pending", "paid", "preparing", "ready", "accepted"];

/** Terminal statuses — no actions possible. */
const TERMINAL_STATUSES = ["picked_up", "delivered", "cancelled", "completed"];

export function StatusTransitionButtons({
  orderId,
  currentStatus,
  onStatusUpdate,
}: StatusTransitionButtonsProps) {
  const [forwardLoading, setForwardLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STATUS_FLOW.find((s) => s.status === currentStatus);
  const canForward = currentStep !== undefined;
  const canCancel = CANCELLABLE_STATUSES.includes(currentStatus);
  const isTerminal = TERMINAL_STATUSES.includes(currentStatus);

  const handleTransition = useCallback(
    async (targetStatus: string) => {
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
          body: JSON.stringify({ status: targetStatus }),
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

        if (onStatusUpdate) {
          onStatusUpdate(targetStatus);
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

  if (isTerminal || (!canForward && !canCancel)) {
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
