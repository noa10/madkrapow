export interface DayHours {
  open: string;
  close: string;
}

export interface OperatingHours {
  mon: DayHours;
  tue: DayHours;
  wed: DayHours;
  thu: DayHours;
  fri: DayHours;
  sat: DayHours;
  sun: DayHours;
}

export interface StoreStatus {
  isOpen: boolean;
  nextOpen?: {
    day: string;
    time: string;
    date: Date;
  };
}

function getDayKey(date: Date): keyof OperatingHours {
  const days: (keyof OperatingHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[date.getDay()];
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function timeToMinutes(timeStr: string): number {
  const { hours, minutes } = parseTime(timeStr);
  return hours * 60 + minutes;
}

function formatDayName(day: keyof OperatingHours): string {
  const dayNames: Record<keyof OperatingHours, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
  };
  return dayNames[day];
}

export function isStoreOpen(
  operatingHours: OperatingHours | null,
  now: Date = new Date()
): StoreStatus {
  if (!operatingHours) {
    return { isOpen: false };
  }

  const currentDay = getDayKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const todayHours = operatingHours[currentDay];

  if (!todayHours) {
    return { isOpen: false };
  }

  const openMinutes = timeToMinutes(todayHours.open);
  const closeMinutes = timeToMinutes(todayHours.close);

  if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
    return { isOpen: true };
  }

  const days: (keyof OperatingHours)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const currentDayIndex = days.indexOf(currentDay);

  for (let i = 1; i <= 7; i++) {
    const nextDayIndex = (currentDayIndex + i) % 7;
    const nextDay = days[nextDayIndex];
    const nextDayHours = operatingHours[nextDay];

    if (nextDayHours && nextDayHours.open !== nextDayHours.close) {
      const nextDate = new Date(now);
      nextDate.setDate(now.getDate() + i);

      return {
        isOpen: false,
        nextOpen: {
          day: formatDayName(nextDay),
          time: nextDayHours.open,
          date: nextDate,
        },
      };
    }
  }

  return { isOpen: false };
}

export function formatNextOpenTime(nextOpen: StoreStatus['nextOpen']): string {
  if (!nextOpen) return '';

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let dayPrefix = nextOpen.day;
  if (nextOpen.date.toDateString() === today.toDateString()) {
    dayPrefix = 'Today';
  } else if (nextOpen.date.toDateString() === tomorrow.toDateString()) {
    dayPrefix = 'Tomorrow';
  }

  return `${dayPrefix} at ${nextOpen.time}`;
}
