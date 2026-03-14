"use client";

import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Check, ChefHat, Package, Truck } from "lucide-react";

interface StatusTransitionButtonsProps {
  orderId: string;
  currentStatus: string;
  onStatusUpdate?: (newStatus: string) => void;
}

const STATUS_FLOW = [
  { status: "paid", label: "Accept Order", icon: Check, next: "accepted" },
  { status: "accepted", label: "Start Preparing", icon: ChefHat, next: "preparing" },
  { status: "preparing", label: "Mark Ready", icon: Package, next: "ready" },
  { status: "ready", label: "Hand to Driver", icon: Truck, next: "picked_up" },
];

export function StatusTransitionButtons({
  orderId,
  currentStatus,
  onStatusUpdate,
}: StatusTransitionButtonsProps) {
  const [loading, setLoading] = useState(false);
  const supabase = getBrowserClient();

  const currentStep = STATUS_FLOW.find((s) => s.status === currentStatus);
  const canTransition =
    currentStep && !["picked_up", "delivered", "cancelled"].includes(currentStatus);

  const handleTransition = async () => {
    if (!currentStep) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: currentStep.next })
        .eq("id", orderId);

      if (error) {
        console.error("Failed to update status:", error);
        return;
      }

      if (onStatusUpdate) {
        onStatusUpdate(currentStep.next);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canTransition) {
    return null;
  }

  const Icon = currentStep.icon;

  return (
    <Button onClick={handleTransition} disabled={loading} className="gap-2">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      {currentStep.label}
    </Button>
  );
}
