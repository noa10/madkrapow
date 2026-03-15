"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NewOrderAlertProps {
  onNewOrder?: () => void;
}

export function NewOrderAlert({ onNewOrder }: NewOrderAlertProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [hasNewOrder, setHasNewOrder] = useState(false);

  // Base64 encoded "ding" sound (short bell sound)
  const dingSound =
    "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE=";

  useEffect(() => {
    // Create audio element
    if (audioRef.current === null) {
      audioRef.current = new Audio(dingSound);
      audioRef.current.volume = 0.3; // Reasonable volume
    }
  }, []);

  // Expose playSound function via data attribute for external triggering
  useEffect(() => {
    const handleNewOrder = () => {
      if (audioRef.current && !isMuted) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((error) => {
          console.log("Audio play failed:", error);
        });
      }
      setHasNewOrder(true);
      setTimeout(() => setHasNewOrder(false), 3000);

      if (onNewOrder) {
        onNewOrder();
      }
    };
    window.addEventListener("new-order-alert", handleNewOrder);
    return () => window.removeEventListener("new-order-alert", handleNewOrder);
  }, [isMuted, onNewOrder]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
      {/* Visual Indicator */}
      {hasNewOrder && (
        <div className="animate-pulse bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
          New Order!
        </div>
      )}

      {/* Mute Toggle */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsMuted(!isMuted)}
        className="rounded-full"
        title={isMuted ? "Unmute" : "Mute"}
      >
        {isMuted ? (
          <BellOff className="h-4 w-4" />
        ) : (
          <Bell className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

// Helper function to trigger alert from anywhere
export function triggerNewOrderAlert() {
  window.dispatchEvent(new Event("new-order-alert"));
}