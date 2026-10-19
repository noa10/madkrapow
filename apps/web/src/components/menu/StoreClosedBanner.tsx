'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { OperatingHours, StoreStatus, isStoreOpen, formatNextOpenTime } from '@/lib/utils/operating-hours';

interface StoreClosedBannerProps {
  operatingHours: OperatingHours | null;
}

export function StoreClosedBanner({ operatingHours }: StoreClosedBannerProps) {
  const [storeStatus, setStoreStatus] = useState<StoreStatus>({ isOpen: true });

  useEffect(() => {
    function checkStatus() {
      setStoreStatus(isStoreOpen(operatingHours, new Date()));
    }

    checkStatus();
    const interval = setInterval(checkStatus, 60000);

    return () => clearInterval(interval);
  }, [operatingHours]);

  if (storeStatus.isOpen) {
    return null;
  }

  return (
    <div className="border-b border-border bg-surface-sunk px-4 py-3">
      <div className="mx-auto flex max-w-md items-center gap-2.5">
        <Clock className="h-4 w-4 flex-none text-ember-text" aria-hidden />
        <div>
          <p className="text-[13px] font-bold text-foreground">Currently closed</p>
          {storeStatus.nextOpen && (
            <p className="text-xs text-muted-foreground">
              Opens {formatNextOpenTime(storeStatus.nextOpen)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
