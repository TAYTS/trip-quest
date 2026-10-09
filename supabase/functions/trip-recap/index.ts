// trip-recap: the Gemini part of "Trip Wrapped".
//
// Two kinds of request (POST, signed-in trip members only):
//   { tripId, checkpointId, context }  → reads that checkpoint's note and photos, asks Gemini how it
//                                         felt (note mood, feelings, best photo, caption) and saves the
//                                         result in recap_moments. Saved once: asking again returns the
//                                         saved result without calling Gemini.
//   { tripId, summary }                 → asks Gemini for the travel-personality title, its description
//                                         and the closing note. The game saves the finished recap itself.
//
// The Gemini key lives in Supabase's secret store (GEMINI_API_KEY), never in the browser.
import { withSupabase } from 'npm:@supabase/server@^1';
import {
  RecapError,
  analyzeMoment,
  parseCheckpointId,
  parseMomentContext,
  parseSummaryInput,
  parseTripId,
  summarizeTrip,
  type GeminiOptions,
  type ImagePart,
} from './recap.ts';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const BUCKET = 'journal-photos';

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** Bytes → base64, in chunks so big photos don't overflow the call stack. */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function geminiOptions(): GeminiOptions | null {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return null;
  return {
    apiKey,
    model: Deno.env.get('RECAP_MODEL') || Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL,
    baseUrl: Deno.env.get('GEMINI_API_BASE') || 'https://generativelanguage.googleapis.com',
  };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const tripId = parseTripId(body?.tripId);
    if (!tripId) return json({ error: 'Missing or invalid trip.' }, 400);
    const db = ctx.supabase;

    // Membership: row-level security only shows the trip to its members.
    const { data: trip, error: tripError } = await db.from('trips').select('id').eq('id', tripId).maybeSingle();
    if (tripError) {
      console.error('trip lookup failed:', tripError.code, tripError.message);
      return json({ error: 'Could not check the trip.' }, 500);
    }
    if (!trip) return json({ error: 'You are not part of this trip.' }, 403);

    const { data: recap } = await db.from('recaps').select('trip_id').eq('trip_id', tripId).maybeSingle();
    const recapMade = !!recap;

    try {
      // ---------------------------------------------------------- one checkpoint
      if (body?.checkpointId !== undefined) {
        const checkpointId = parseCheckpointId(body.checkpointId);
        const context = parseMomentContext(body.context);
        if (!checkpointId || !context) return json({ error: 'Missing or invalid checkpoint.' }, 400);

        const saved = await db
          .from('recap_moments')
          .select('analysis')
          .eq('trip_id', tripId)
          .eq('checkpoint_id', checkpointId)
          .maybeSingle();
        if (saved.data) return json({ analysis: saved.data.analysis, saved: true });
        if (recapMade) return json({ error: 'The recap is already made.' }, 409);

        const { data: entry, error: entryError } = await db
          .from('entries')
          .select('status, note, mood, photo_paths')
          .eq('trip_id', tripId)
          .eq('checkpoint_id', checkpointId)
          .maybeSingle();
        if (entryError) {
          console.error('entry lookup failed:', entryError.code, entryError.message);
          return json({ error: 'Could not read the journal.' }, 500);
        }
        if (!entry || entry.status !== 'done') return json({ error: 'That checkpoint was not cleared.' }, 400);

        const o = geminiOptions();
        const note = typeof entry.note === 'string' ? entry.note.trim().slice(0, 4000) : '';
        const paths: string[] = Array.isArray(entry.photo_paths) ? entry.photo_paths.slice(0, 3) : [];
        if (!o && (note || paths.length)) {
          console.error('GEMINI_API_KEY is not set. Run: supabase secrets set GEMINI_API_KEY=...');
          return json({ error: 'The recap is not set up yet.' }, 503);
        }

        // Photos are read here with the player's own login, so storage rules still apply.
        const images: ImagePart[] = [];
        const sentPaths: string[] = [];
        for (const path of paths) {
          if (typeof path !== 'string' || !path.startsWith(`${tripId}/`)) continue;
          const { data: blob, error } = await db.storage.from(BUCKET).download(path);
          if (error || !blob) {
            console.error('photo download failed:', path, error?.message);
            continue;
          }
          images.push({
            data: toBase64(new Uint8Array(await blob.arrayBuffer())),
            mimeType: blob.type || 'image/jpeg',
          });
          sentPaths.push(path);
        }

        const analysis = await analyzeMoment(
          o!,
          context,
          note,
          typeof entry.mood === 'number' ? entry.mood : null,
          images,
        );
        // photos[i] and bestPhoto refer to photoPaths[i]: the photos that were actually read.
        const stored = { ...analysis, photoPaths: sentPaths };
        const { error: insertError } = await db
          .from('recap_moments')
          .upsert(
            { trip_id: tripId, checkpoint_id: checkpointId, analysis: stored },
            { onConflict: 'trip_id,checkpoint_id', ignoreDuplicates: true },
          );
        if (insertError) {
          console.error('saving analysis failed:', insertError.code, insertError.message);
          return json({ error: 'Could not save the analysis.' }, 500);
        }
        // If the other phone saved one first, theirs is the one that counts.
        const again = await db
          .from('recap_moments')
          .select('analysis')
          .eq('trip_id', tripId)
          .eq('checkpoint_id', checkpointId)
          .maybeSingle();
        return json({ analysis: again.data?.analysis ?? stored, saved: false });
      }

      // ---------------------------------------------------------- whole trip
      if (body?.summary !== undefined) {
        if (recapMade) return json({ error: 'The recap is already made.' }, 409);
        const input = parseSummaryInput(body.summary);
        if (!input) return json({ error: 'Missing trip summary.' }, 400);
        const o = geminiOptions();
        if (!o) {
          console.error('GEMINI_API_KEY is not set. Run: supabase secrets set GEMINI_API_KEY=...');
          return json({ error: 'The recap is not set up yet.' }, 503);
        }
        return json(await summarizeTrip(o, input));
      }

      return json({ error: 'Nothing to do.' }, 400);
    } catch (e) {
      if (e instanceof RecapError) return json({ error: e.message }, e.status);
      console.error('trip-recap failed:', e);
      return json({ error: 'Something went wrong.' }, 500);
    }
  }),
};
