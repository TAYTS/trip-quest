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
}

export interface GuideSource {
  url: string;
  title: string;
}

export interface GuideAnswer {
  answer: string;
  sources: GuideSource[];
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
  return { answer: d.answer, sources, used: d.used ?? 0, limit: d.limit ?? 0 };
}
