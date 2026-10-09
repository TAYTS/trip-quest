// Network side of "Trip Wrapped": the trip-recap Edge Function and the recaps / recap_moments tables.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { MomentAnalysis, RecapData, SummaryInput } from './recap';

const BUCKET = 'journal-photos';

function sb() {
  if (!supabase) throw new Error('Trip Wrapped needs a synced trip.');
  return supabase;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke('trip-recap', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const b = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw new Error(b?.error ?? 'The Panda could not finish the recap right now.');
    }
    throw new Error('Could not reach the Panda. Check your connection.');
  }
  return data as T;
}

export async function loadRecap(tripId: string): Promise<RecapData | null> {
  const { data, error } = await sb().from('recaps').select('data').eq('trip_id', tripId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.data as RecapData | undefined) ?? null;
}

/** Analyses already saved for this trip (so a retry only asks for the missing ones). */
export async function loadAnalyses(tripId: string): Promise<Record<string, MomentAnalysis>> {
  const { data, error } = await sb().from('recap_moments').select('checkpoint_id, analysis').eq('trip_id', tripId);
  if (error) throw new Error(error.message);
  const out: Record<string, MomentAnalysis> = {};
  for (const r of (data ?? []) as { checkpoint_id: string; analysis: MomentAnalysis }[])
    out[r.checkpoint_id] = r.analysis;
  return out;
}

export async function analyzeCheckpoint(
  tripId: string,
  checkpointId: string,
  context: { day: number; city: string; stop: string; slot: string },
): Promise<MomentAnalysis> {
  const r = await invoke<{ analysis?: MomentAnalysis }>({ tripId, checkpointId, context });
  if (!r?.analysis) throw new Error('The Panda sent an empty answer.');
  return r.analysis;
}

export async function summarize(
  tripId: string,
  summary: SummaryInput,
): Promise<{ personalityTitle: string; personalityText: string; closingNote: string }> {
  const r = await invoke<{ personalityTitle?: string; personalityText?: string; closingNote?: string }>({
    tripId,
    summary,
  });
  if (!r?.personalityTitle || !r.closingNote) throw new Error('The Panda could not write the ending.');
  return { personalityTitle: r.personalityTitle, personalityText: r.personalityText ?? '', closingNote: r.closingNote };
}

/** Saves the recap once. If the other phone saved one first, returns theirs. */
export async function saveRecap(tripId: string, data: RecapData): Promise<RecapData> {
  const { error } = await sb().from('recaps').insert({ trip_id: tripId, data });
  if (error && error.code !== '23505') throw new Error(error.message);
  return (await loadRecap(tripId)) ?? data;
}

export async function deleteRecap(tripId: string): Promise<void> {
  const { error } = await sb().rpc('delete_recap', { p_trip: tripId });
  if (error) throw new Error(error.message);
}

/** Live: tells this phone when the other phone makes (or deletes) the recap. */
export function subscribeRecap(tripId: string, onChange: (recap: RecapData | null) => void): () => void {
  const client = sb();
  const channel = client
    .channel(`recaps-${tripId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recaps', filter: `trip_id=eq.${tripId}` }, (p) => {
      // Deletes can't be filtered by trip on Supabase's side, so check the trip here.
      if (p.eventType === 'DELETE') {
        if ((p.old as { trip_id?: string }).trip_id === tripId) onChange(null);
      } else onChange((p.new as { data?: RecapData }).data ?? null);
    })
    .subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}

/**
 * Downloads a photo as a local blob URL. Same-origin blob URLs can be drawn into the PDF without
 * any cross-site image rules getting in the way.
 */
export async function photoBlobUrl(path: string): Promise<string> {
  if (path.startsWith('data:') || path.startsWith('blob:')) return path;
  const { data, error } = await sb().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? 'Could not load photo.');
  return URL.createObjectURL(data);
}
