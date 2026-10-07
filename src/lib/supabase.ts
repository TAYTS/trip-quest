import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Supabase's dashboard now calls this the "publishable key" (sb_publishable_…). The older
// "anon" key (a long eyJ… token) works the same way, so either variable name is accepted.
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as
  string | undefined;

/** null when the env vars are not set → the app runs in local mode only. */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export const isCloudConfigured = supabase !== null;
