'use client';

import { useEffect, useState } from 'react';
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
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-lg">⏰</span>
          <div>
            <p className="font-medium text-amber-800">Currently Closed</p>
            {storeStatus.nextOpen && (
              <p className="text-sm text-amber-700">
                Opens {formatNextOpenTime(storeStatus.nextOpen)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
