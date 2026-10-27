// ask-guide: answers a food or places question for one checkpoint using Gemini.
//
// Why this exists: the Gemini API key must stay secret, so the browser never calls Gemini
// directly. The game calls this function instead, and the key is read here from
// Supabase's secret store (set with `supabase secrets set GEMINI_API_KEY=...`).
//
// Who can call it: only signed-in players (auth: 'user'), and only for a trip they belong
// to; the daily question limit per trip is enforced in the database (take_guide_wish), and a wish
// is only given back (refund_guide_wish) with the ticket this function got when it spent it.
import { withSupabase } from 'npm:@supabase/server@^1';
import { GuideError, askGemini, parseRequest, parseTripId, type Grounding } from './guide.ts';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_LIMIT = 10; // wishes per trip per day

// GUIDE_GROUNDING: 'agent' (default: Antigravity agent + Google Search), 'search' (paid plan only) or 'none'.
const groundingMode = (): Grounding => {
  const v = Deno.env.get('GUIDE_GROUNDING');
  return v === 'search' || v === 'none' ? v : 'agent';
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

    const body = await req.json().catch(() => null);
    const limit = Math.max(1, Number(Deno.env.get('GUIDE_DAILY_LIMIT')) || DEFAULT_LIMIT);

    // "How many wishes are left?" Read-only: it does not use up a wish or call Gemini.
    if ((body as { status?: unknown } | null)?.status === true) {
      const tripId = parseTripId((body as { tripId?: unknown }).tripId);
      if (!tripId) return json({ error: 'Missing or invalid trip.' }, 400);
      const { data: used, error } = await ctx.supabase.rpc('guide_quota_used', { p_trip: tripId });
      if (error) {
        if (error.code === '42501') return json({ error: 'You are not part of this trip.' }, 403);
        console.error('guide_quota_used failed:', error.code, error.message);
        return json({ error: 'Could not read the wish counter.' }, 500);
      }
      return json({ used, limit });
    }

    const parsed = parseRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set. Run: supabase secrets set GEMINI_API_KEY=...');
      return json({ error: 'The guide is not set up yet.' }, 503);
    }

    // Count this question first (also checks the caller belongs to the trip). The database hands back a
    // ticket for the wish; only this function holds it, so only a failure here can give the wish back.
    const { data: taken, error } = await ctx.supabase.rpc('take_guide_wish', {
      p_trip: parsed.value.tripId,
      p_limit: limit,
    });
    const first = (Array.isArray(taken) ? taken[0] : taken) as { used_count?: number; wish_ticket?: string } | null;
    if (!error && (typeof first?.used_count !== 'number' || typeof first?.wish_ticket !== 'string')) {
      console.error('take_guide_wish returned an unexpected result');
      return json({ error: 'Could not check the question limit.' }, 500);
    }
    if (error) {
      if (error.code === 'P0001')
        return json(
          {
            error: `Panda Guide is tired today! Your party has used all ${limit} wishes. They refill at midnight China time.`,
          },
          429,
        );
      if (error.code === '42501') return json({ error: 'You are not part of this trip.' }, 403);
      console.error('take_guide_wish failed:', error.code, error.message);
      return json({ error: 'Could not check the question limit.' }, 500);
    }
    const used = first!.used_count!;
    const ticket = first!.wish_ticket!;

    try {
      const { answer, sources, grounded } = await askGemini(parsed.value, {
        apiKey,
        model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
        baseUrl: Deno.env.get('GEMINI_API_BASE') || 'https://generativelanguage.googleapis.com',
        grounding: groundingMode(),
        agentModel: Deno.env.get('GUIDE_AGENT_MODEL') || undefined,
      });
      return json({ answer, sources, grounded, used, limit });
    } catch (e) {
      // The Panda did not answer, so the wish is given back.
      const { error: refundError } = await ctx.supabase.rpc('refund_guide_wish', { p_ticket: ticket });
      if (refundError) console.error('refund_guide_wish failed:', refundError.code, refundError.message);
      if (e instanceof GuideError) return json({ error: e.message }, e.status);
      console.error('ask-guide failed:', e);
      return json({ error: 'Something went wrong.' }, 500);
    }
  }),
};
