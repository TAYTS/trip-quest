// Supabase-backed repo. Tables, RLS policies and RPCs live in supabase/schema.sql.
//
// How sharing works: each device signs in anonymously (no email/password).
// One device creates a trip and gets a 6-letter join code; the other device
// joins with that code. Row Level Security only lets trip members read/write
// that trip's entries and photos.
import type { Entry, EntryMap } from '../data/game';
import type { Repo } from './repo';
import { supabase } from './supabase';
import { safeStorage } from './safeStorage';
import { dataURLToBlob, downscaleImage } from './image';

const TRIP_KEY = 'trip-quest:cloud-trip';
const BUCKET = 'journal-photos';

export interface CloudTrip {
  id: string;
  name: string;
  join_code: string;
}

interface EntryRow {
  trip_id: string;
  checkpoint_id: string;
  choice_id: string;
  custom_title: string | null;
  status: 'done' | 'skipped';
  mood: number | null;
  note: string | null;
  dice: number | null;
  chance_id: string | null;
  coins: number;
  photo_paths: string[] | null;
  author: string | null;
  updated_at: string;
}

const toEntry = (r: EntryRow): Entry => ({
  checkpointId: r.checkpoint_id,
  choiceId: r.choice_id,
  customTitle: r.custom_title ?? undefined,
  status: r.status,
  mood: r.mood ?? undefined,
  note: r.note ?? undefined,
  dice: r.dice ?? undefined,
  chanceId: r.chance_id ?? undefined,
  coins: r.coins ?? 0,
  photos: r.photo_paths?.length ? r.photo_paths : undefined,
  author: r.author ?? undefined,
  updatedAt: r.updated_at,
});

const toRow = (tripId: string, e: Entry): Omit<EntryRow, 'updated_at'> & { updated_at: string } => ({
  trip_id: tripId,
  checkpoint_id: e.checkpointId,
  choice_id: e.choiceId,
  custom_title: e.customTitle ?? null,
  status: e.status,
  mood: e.mood ?? null,
  note: e.note ?? null,
  dice: e.dice ?? null,
  chance_id: e.chanceId ?? null,
  coins: e.coins ?? 0,
  photo_paths: e.photos ?? [],
  author: e.author ?? null,
  updated_at: e.updatedAt,
});

function client() {
  if (!supabase) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
  return supabase;
}

/** Signs in anonymously once per device; the session is persisted by supabase-js. */
export async function ensureSession() {
  const sb = client();
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  const res = await sb.auth.signInAnonymously();
  if (res.error) {
    throw new Error(
      `Anonymous sign-in failed: ${res.error.message}. Enable "Anonymous sign-ins" in Supabase → Authentication → Sign In / Providers.`,
    );
  }
  return res.data.session!;
}

export const savedTripId = () => safeStorage.get(TRIP_KEY);
export const forgetTrip = () => safeStorage.remove(TRIP_KEY);

export async function createTrip(name: string, displayName: string): Promise<CloudTrip> {
  await ensureSession();
  const { data, error } = await client().rpc('create_trip', { p_name: name, p_display_name: displayName });
  if (error) throw new Error(error.message);
  const trip = (Array.isArray(data) ? data[0] : data) as CloudTrip;
  safeStorage.set(TRIP_KEY, trip.id);
  return trip;
}

export async function joinTrip(code: string, displayName: string): Promise<CloudTrip> {
  await ensureSession();
  const { data, error } = await client().rpc('join_trip', {
    p_code: code.trim().toUpperCase(),
    p_display_name: displayName,
  });
  if (error) throw new Error(error.message);
  const trip = (Array.isArray(data) ? data[0] : data) as CloudTrip | null;
  if (!trip) throw new Error('No trip found with that code.');
  safeStorage.set(TRIP_KEY, trip.id);
  return trip;
}

export async function getTrip(tripId: string): Promise<CloudTrip | null> {
  await ensureSession();
  const { data, error } = await client().from('trips').select('id,name,join_code').eq('id', tripId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as CloudTrip | null;
}

export function createCloudRepo(trip: CloudTrip): Repo {
  const sb = client();
  const urlCache = new Map<string, { url: string; expires: number }>();

  const repo: Repo = {
    kind: 'cloud',
    label: `Synced trip · code ${trip.join_code}`,
    tripId: trip.id,

    async loadEntries() {
      const { data, error } = await sb.from('entries').select('*').eq('trip_id', trip.id);
      if (error) throw new Error(error.message);
      const map: EntryMap = {};
      for (const row of (data ?? []) as EntryRow[]) map[row.checkpoint_id] = toEntry(row);
      return map;
    },

    async saveEntry(entry) {
      const { error } = await sb.from('entries').upsert(toRow(trip.id, entry), { onConflict: 'trip_id,checkpoint_id' });
      if (error) throw new Error(error.message);
    },

    async deleteEntry(checkpointId) {
      const { error } = await sb.from('entries').delete().eq('trip_id', trip.id).eq('checkpoint_id', checkpointId);
      if (error) throw new Error(error.message);
    },

    async savePhoto(checkpointId, file) {
      const blob = await downscaleImage(file, 1280, 0.8);
      const path = `${trip.id}/${checkpointId}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
      return path;
    },

    async photoUrl(ref) {
      if (ref.startsWith('data:') || ref.startsWith('http')) return ref;
      const hit = urlCache.get(ref);
      if (hit && hit.expires > Date.now()) return hit.url;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(ref, 60 * 60);
      if (error || !data) throw new Error(error?.message ?? 'Could not load photo.');
      urlCache.set(ref, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
      return data.signedUrl;
    },

    subscribe(onChange) {
      const channel = sb
        .channel(`entries-${trip.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'entries', filter: `trip_id=eq.${trip.id}` },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const old = payload.old as Partial<EntryRow>;
              if (old.checkpoint_id) onChange({ deleted: old.checkpoint_id });
            } else {
              onChange(toEntry(payload.new as EntryRow));
            }
          },
        )
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
  };
  return repo;
}

/** Copies a local-mode journal into a cloud trip (photos are uploaded). */
export async function uploadLocalJournal(repo: Repo, entries: EntryMap) {
  for (const e of Object.values(entries)) {
    const photos: string[] = [];
    for (const ref of e.photos ?? []) {
      if (ref.startsWith('data:')) {
        const blob = await dataURLToBlob(ref);
        photos.push(await repo.savePhoto(e.checkpointId, new File([blob], 'photo.jpg', { type: 'image/jpeg' })));
      } else {
        photos.push(ref);
      }
    }
    await repo.saveEntry({ ...e, photos: photos.length ? photos : undefined });
  }
}
