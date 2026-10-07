import { DAYS, TRIP } from '../data/itinerary';

/** Today's date (YYYY-MM-DD) in China time, where the trip happens. */
export function chinaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TRIP.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function tripTiming(now = new Date()) {
  const today = chinaToday(now);
  const todayDay = DAYS.find((d) => d.date === today)?.day ?? null;
  const msPerDay = 86_400_000;
  const daysUntil = Math.round((Date.parse(TRIP.start) - Date.parse(today)) / msPerDay);
  const phase: 'before' | 'during' | 'after' = todayDay ? 'during' : daysUntil > 0 ? 'before' : 'after';
  return { today, todayDay, daysUntil, phase };
}

export function fmtDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}
