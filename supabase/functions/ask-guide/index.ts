// ask-guide: answers a food or places question for one checkpoint using Gemini.
//
// Why this exists: the Gemini API key must stay secret, so the browser never calls Gemini
// directly. The game calls this function instead, and the key is read here from
// Supabase's secret store (set with `supabase secrets set GEMINI_API_KEY=...`).
//
// Who can call it: only signed-in players (auth: 'user'), and only for a trip they belong
// to; the daily question limit per trip is enforced in the database (use_guide_quota).
import { withSupabase } from 'npm:@supabase/server@^1';
import { GuideError, askGemini, parseRequest } from './guide.ts';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const DEFAULT_LIMIT = 30;

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

    const parsed = parseRequest(await req.json().catch(() => null));
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set. Run: supabase secrets set GEMINI_API_KEY=...');
      return json({ error: 'The guide is not set up yet.' }, 503);
    }
    const limit = Math.max(1, Number(Deno.env.get('GUIDE_DAILY_LIMIT')) || DEFAULT_LIMIT);

    // Count this question first (also checks the caller belongs to the trip).
    const { data: used, error } = await ctx.supabase.rpc('use_guide_quota', {
      p_trip: parsed.value.tripId,
      p_limit: limit,
    });
    if (error) {
      if (error.code === 'P0001')
        return json({ error: 'This trip has used all of today’s questions. Try again tomorrow.' }, 429);
      if (error.code === '42501') return json({ error: 'You are not part of this trip.' }, 403);
      console.error('use_guide_quota failed:', error.code, error.message);
      return json({ error: 'Could not check the question limit.' }, 500);
    }

    try {
      const { answer, sources } = await askGemini(parsed.value, {
        apiKey,
        model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
        baseUrl: Deno.env.get('GEMINI_API_BASE') || 'https://generativelanguage.googleapis.com',
        search: Deno.env.get('GUIDE_SEARCH') !== 'off',
      });
      return json({ answer, sources, used, limit });
    } catch (e) {
      if (e instanceof GuideError) return json({ error: e.message }, e.status);
      console.error('ask-guide failed:', e);
      return json({ error: 'Something went wrong.' }, 500);
    }
  }),
};
