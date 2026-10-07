// Which checkpoints can be cleared right now.
//  - Order lock: only the next checkpoint in sequence can be cleared or skipped.
//  - Date lock:  a day can't be cleared before its date (China time), unless Test mode is on.
// Cleared checkpoints stay editable; only the most recent one can be undone.
//  - VITE_UNLOCK_ALL=true (in .env.local) turns off both locks, for local testing.
import { CHECKPOINTS, SLOT_LABEL, dayOf, type Checkpoint } from './itinerary';
import type { EntryMap } from './game';
import { fmtDate } from '../lib/time';

/** Dev switch: set VITE_UNLOCK_ALL=true in .env.local to open every checkpoint. */
export const UNLOCK_ALL = import.meta.env.VITE_UNLOCK_ALL === 'true';

export type Lock = { kind: 'open' } | { kind: 'order'; message: string } | { kind: 'date'; message: string };

export function lockFor(cp: Checkpoint, entries: EntryMap, today: string, testMode: boolean): Lock {
  if (UNLOCK_ALL || entries[cp.id]) return { kind: 'open' };
  const idx = CHECKPOINTS.findIndex((c) => c.id === cp.id);
  const nextIdx = CHECKPOINTS.findIndex((c) => !entries[c.id]);
  if (nextIdx !== -1 && idx > nextIdx) {
    const next = CHECKPOINTS[nextIdx];
    return { kind: 'order', message: `Locked. Clear Day ${next.day} ${SLOT_LABEL[next.slot].en} first.` };
  }
  const day = dayOf(cp.day);
  if (!testMode && day.date > today) {
    return { kind: 'date', message: `Unlocks on ${day.weekday} ${fmtDate(day.date)} (China time).` };
  }
  return { kind: 'open' };
}

/** Index of the most recently cleared checkpoint (the only one that can be undone). */
export function lastClearedIndex(entries: EntryMap): number {
  for (let i = CHECKPOINTS.length - 1; i >= 0; i--) if (entries[CHECKPOINTS[i].id]) return i;
  return -1;
}
