// "Trip Wrapped": turns the journal + Gemini's per-checkpoint reading into the saved recap.
// Everything here is plain calculation (no network), so it gives the same result every time.
import { CHECKPOINTS, SLOT_LABEL, TRIP, dayOf, findOption, type Checkpoint } from '../data/itinerary';
import { computeStats, earnedBadges, type Entry, type EntryMap } from '../data/game';

export const FEELINGS = [
  'joy',
  'awe',
  'funny',
  'cosy',
  'tasty',
  'relaxed',
  'proud',
  'nostalgic',
  'tired',
  'stressed',
] as const;

export interface PhotoScore {
  joy: number;
  wow: number;
  quality: number;
}

/** What the trip-recap function saved for one checkpoint (see supabase/functions/trip-recap/recap.ts). */
export interface MomentAnalysis {
  noteSentiment: number | null;
  feelings: string[];
  quote: string;
  caption: string;
  photos: PhotoScore[];
  bestPhoto: number | null;
  ai: boolean;
  /** photos[i] belongs to photoPaths[i]. */
  photoPaths?: string[];
}

export interface RecapMoment {
  checkpointId: string;
  day: number;
  slot: string;
  city: string;
  title: string;
  hearts: number | null;
  quote: string;
  caption: string;
  photo: string | null;
  score: number;
}

/** The saved recap (recaps.data). Never changes once made. */
export interface RecapData {
  version: 1;
  createdAt: string;
  travellers: string;
  numbers: {
    cleared: number;
    total: number;
    done: number;
    skipped: number;
    photos: number;
    words: number;
    coins: number;
    level: number;
    levelTitle: string;
    stamps: number;
  };
  top: RecapMoment[];
  montage: string[];
  personality: { title: string; text: string };
  closingNote: string;
}

export interface SummaryInput {
  travellers: string;
  stats: string;
  days: string[];
  choices: string;
  feelings: string;
  top: string[];
  notes: string[];
}

export const photoScore = (p: PhotoScore) => (0.6 * p.joy + 0.4 * p.wow) * (0.5 + 0.5 * p.quality);

/** Words in a note: Latin words plus each Chinese character. */
export function countWords(text: string | undefined): number {
  if (!text) return 0;
  const cjk = text.match(/[㐀-鿿]/g)?.length ?? 0;
  const latin = text.replace(/[㐀-鿿]/g, ' ').match(/[A-Za-z0-9'’-]+/g)?.length ?? 0;
  return cjk + latin;
}

export const stopTitle = (cp: Checkpoint, e: Entry) =>
  e.choiceId === 'custom' && e.customTitle ? e.customTitle : (findOption(cp, e.choiceId)?.title ?? cp.options[0].title);

/** Checkpoints that count for the recap: cleared (not skipped), in trip order. */
export const doneCheckpoints = (entries: EntryMap) =>
  CHECKPOINTS.filter((cp) => entries[cp.id]?.status === 'done').map((cp) => ({ cp, entry: entries[cp.id] }));

/** The context the function puts in Gemini's prompt for one checkpoint. */
export const momentContext = (cp: Checkpoint, e: Entry) => ({
  day: cp.day,
  city: dayOf(cp.day).city,
  stop: stopTitle(cp, e),
  slot: SLOT_LABEL[cp.slot].en,
});

/** How happy a stop was, 0..1: their own hearts first, then the note's mood, else neutral. */
export function happiness(e: Entry, a: MomentAnalysis | undefined): number {
  if (e.mood) return (e.mood - 1) / 4;
  if (a?.noteSentiment != null) return (a.noteSentiment + 1) / 2;
  return 0.5;
}

/**
 * Ranking score, 0..1:
 *   40% hearts (their own rating), 25% note mood (Gemini), 25% best photo (happy faces, wow, sharpness),
 *   10% effort (photos and words added). Missing pieces fall back to the hearts, so a stop isn't punished
 *   for having no note.
 */
export function momentScore(e: Entry, a: MomentAnalysis | undefined): number {
  const heart = happiness(e, a);
  const note = a?.noteSentiment != null ? (a.noteSentiment + 1) / 2 : heart;
  const photo = a?.photos?.length ? Math.max(...a.photos.map(photoScore)) : 0;
  const photosAdded = e.photos?.length ?? 0;
  const effort = 0.5 * Math.min(photosAdded / 3, 1) + 0.5 * Math.min(countWords(e.note) / 60, 1);
  return 0.4 * heart + 0.25 * note + 0.25 * photo + 0.1 * effort;
}

/** The photo to show for a moment: Gemini's pick, else the first photo. */
export function bestPhotoPath(e: Entry, a: MomentAnalysis | undefined): string | null {
  const paths = a?.photoPaths?.length ? a.photoPaths : (e.photos ?? []);
  if (!paths.length) return null;
  const i = a?.bestPhoto ?? 0;
  return paths[i] ?? paths[0];
}

export function rankMoments(entries: EntryMap, analyses: Record<string, MomentAnalysis>): RecapMoment[] {
  return doneCheckpoints(entries)
    .map(({ cp, entry }, order) => {
      const a = analyses[cp.id];
      return {
        order,
        m: {
          checkpointId: cp.id,
          day: cp.day,
          slot: SLOT_LABEL[cp.slot].en,
          city: dayOf(cp.day).city,
          title: stopTitle(cp, entry),
          hearts: entry.mood ?? null,
          quote: a?.quote ?? '',
          caption: a?.caption ?? '',
          photo: bestPhotoPath(entry, a),
          score: Math.round(momentScore(entry, a) * 1000) / 1000,
        } satisfies RecapMoment,
      };
    })
    .sort((x, y) => y.m.score - x.m.score || x.order - y.order)
    .map((x) => x.m);
}

/** Up to 5 photos for the montage: the best-scoring ones that aren't already in the top 5. */
export function pickMontage(
  entries: EntryMap,
  analyses: Record<string, MomentAnalysis>,
  top: RecapMoment[],
  count = 5,
): string[] {
  const scored: { path: string; score: number }[] = [];
  for (const { cp, entry } of doneCheckpoints(entries)) {
    const a = analyses[cp.id];
    const paths = a?.photoPaths?.length ? a.photoPaths : (entry.photos ?? []);
    paths.forEach((path, i) => {
      const p = a?.photos?.[i];
      scored.push({ path, score: p ? photoScore(p) : 0.3 });
    });
  }
  scored.sort((a, b) => b.score - a.score);
  const inTop = new Set(top.map((m) => m.photo).filter(Boolean));
  const fresh = scored.filter((s) => !inTop.has(s.path)).map((s) => s.path);
  const reuse = scored.filter((s) => inTop.has(s.path)).map((s) => s.path);
  return [...fresh, ...reuse].slice(0, count);
}

export function recapNumbers(entries: EntryMap): RecapData['numbers'] {
  const stats = computeStats(entries);
  const list = Object.values(entries);
  return {
    cleared: stats.cleared,
    total: CHECKPOINTS.length,
    done: stats.done,
    skipped: stats.cleared - stats.done,
    photos: list.reduce((n, e) => n + (e.photos?.length ?? 0), 0),
    words: list.reduce((n, e) => n + countWords(e.note), 0),
    coins: stats.coins,
    level: stats.level,
    levelTitle: stats.levelTitle,
    stamps: earnedBadges(entries).length,
  };
}

/** The facts Gemini gets to write the personality and closing note. */
export function summaryInput(
  entries: EntryMap,
  analyses: Record<string, MomentAnalysis>,
  top: RecapMoment[],
  travellers: string,
): SummaryInput {
  const n = recapNumbers(entries);
  const done = doneCheckpoints(entries);

  const days: string[] = [];
  for (let d = 1; d <= 10; d++) {
    const items = done.filter((x) => x.cp.day === d);
    if (!items.length) continue;
    const avg = items.reduce((s, x) => s + happiness(x.entry, analyses[x.cp.id]), 0) / items.length;
    const feel = [...new Set(items.flatMap((x) => analyses[x.cp.id]?.feelings ?? []))].slice(0, 3);
    days.push(
      `Day ${d} (${dayOf(d).city}): happiness ${Math.round(avg * 10)}/10${feel.length ? `, felt ${feel.join('/')}` : ''}; did ${items.map((x) => stopTitle(x.cp, x.entry)).join(', ')}`,
    );
  }

  const kinds = { main: 0, optional: 0, rest: 0, custom: 0 };
  for (const { cp, entry } of done) kinds[findOption(cp, entry.choiceId)?.kind ?? 'main']++;

  const feelCount = new Map<string, number>();
  for (const { cp } of done)
    for (const f of analyses[cp.id]?.feelings ?? []) feelCount.set(f, (feelCount.get(f) ?? 0) + 1);
  const feelings = [...feelCount]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([f, c]) => `${f} ${c}`)
    .join(', ');

  return {
    travellers,
    stats: `${n.done} stops done, ${n.skipped} skipped, ${n.photos} photos, ${n.words} words written, level ${n.level} (${n.levelTitle}), ${n.stamps} stamps`,
    days,
    choices: `followed the plan ${kinds.main} times, picked the optional idea ${kinds.optional} times, rested ${kinds.rest} times, did something else ${kinds.custom} times`,
    feelings,
    top: top
      .slice(0, 5)
      .map(
        (m, i) =>
          `#${i + 1} Day ${m.day} ${m.slot}: ${m.title}${m.caption ? ` (${m.caption})` : ''}${m.quote ? `; they wrote "${m.quote}"` : ''}`,
      ),
    notes: done
      .filter((x) => x.entry.note)
      .map((x) => `Day ${x.cp.day} ${stopTitle(x.cp, x.entry)}: ${x.entry.note!.replace(/\s+/g, ' ').slice(0, 200)}`)
      .slice(0, 30),
  };
}

export function buildRecap(
  entries: EntryMap,
  analyses: Record<string, MomentAnalysis>,
  travellers: string,
  summary: { personalityTitle: string; personalityText: string; closingNote: string },
): RecapData {
  const ranked = rankMoments(entries, analyses);
  const top = ranked.slice(0, 5);
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    travellers,
    numbers: recapNumbers(entries),
    top,
    montage: pickMontage(entries, analyses, top),
    personality: { title: summary.personalityTitle, text: summary.personalityText },
    closingNote: summary.closingNote,
  };
}

/** "24 Oct – 2 Nov 2026" */
export function tripDates(): string {
  const f = (iso: string, year = false) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(year ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  return `${f(TRIP.start)} – ${f(TRIP.end, true)}`;
}
