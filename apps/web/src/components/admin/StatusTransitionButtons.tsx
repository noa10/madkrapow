"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Check, ChefHat, Package, Truck, X } from "lucide-react";

interface StatusTransitionButtonsProps {
  orderId: string;
  currentStatus: string;
  onStatusUpdate?: (newStatus: string) => void;
}

const STATUS_FLOW = [
  { status: "paid", label: "Start Preparing", icon: ChefHat, next: "preparing" },
  { status: "preparing", label: "Mark Ready", icon: Package, next: "ready" },
  { status: "ready", label: "Mark Picked Up", icon: Package, next: "picked_up" },
];

export function StatusTransitionButtons({
  orderId,
  currentStatus,
  onStatusUpdate,
}: StatusTransitionButtonsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = STATUS_FLOW.find((s) => s.status === currentStatus);
  const canTransition =
    currentStep && !["picked_up", "delivered", "cancelled"].includes(currentStatus);

  const handleTransition = useCallback(async () => {
    if (!currentStep || !orderId) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: currentStep.next }),
      });

      if (!response.ok) {
        try {
          const body = await response.json();
          setError(body.error || `Failed to update status (HTTP ${response.status})`);
        } catch {
          setError(`Failed to update status (HTTP ${response.status})`);
        }
        return;
      }

      if (onStatusUpdate) {
        onStatusUpdate(currentStep.next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [currentStep, orderId, onStatusUpdate]);

  if (!canTransition) {
    return null;
  }

  const Icon = currentStep.icon;

  return (
    <div className="space-y-2">
      <Button onClick={handleTransition} disabled={loading} className="gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
        {currentStep.label}
      </Button>
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <X className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
