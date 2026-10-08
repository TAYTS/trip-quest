// Client for the "ask-guide" Supabase Edge Function (supabase/functions/ask-guide).
// The Gemini key lives only on the server; the browser just sends the question and the plan context.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Turn on with VITE_ENABLE_GUIDE=true once the edge function is deployed. */
export const GUIDE_ENABLED = import.meta.env.VITE_ENABLE_GUIDE === 'true';

export interface GuideContext {
  day: number;
  date: string;
  weekday: string;
  city: string;
  dayTitle: string;
  slot: string;
  planTitle: string;
  place?: string;
  desc: string;
  /** The day's three slots, so suggestions fit the rest of the day. */
  dayPlan: string;
}

export interface GuideSource {
  url: string;
  title: string;
}

export interface GuideAnswer {
  answer: string;
  sources: GuideSource[];
  /** False when the answer came from the model's memory only (no web check). */
  grounded: boolean;
  used: number;
  limit: number;
}

export async function askGuide(tripId: string, question: string, context: GuideContext): Promise<GuideAnswer> {
  if (!supabase) throw new Error('The guide needs a synced trip.');
  const { data, error } = await supabase.functions.invoke('ask-guide', { body: { tripId, question, context } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = (await error.context.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? 'The guide could not answer right now.');
    }
    throw new Error('Could not reach the guide. Check your connection.');
  }
  const d = data as Partial<GuideAnswer> | null;
  if (!d?.answer) throw new Error('The guide sent an empty answer.');
  const sources = (d.sources ?? []).filter((x) => /^https?:\/\//i.test(x?.url ?? ''));
  return { answer: d.answer, sources, grounded: d.grounded === true, used: d.used ?? 0, limit: d.limit ?? 0 };
}

export interface Wishes {
  used: number;
  limit: number;
}

/** How many of today's wishes the trip has used. Free: it does not use up a wish. */
export async function getWishes(tripId: string): Promise<Wishes> {
  if (!supabase) throw new Error('The guide needs a synced trip.');
  const { data, error } = await supabase.functions.invoke('ask-guide', { body: { tripId, status: true } });
  const d = data as Partial<Wishes> | null;
  if (error || typeof d?.used !== 'number' || typeof d.limit !== 'number')
    throw new Error('Could not read the wishes.');
  return { used: d.used, limit: d.limit };
}
