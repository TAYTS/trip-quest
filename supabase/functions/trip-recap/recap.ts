// Prompts, Gemini calls and output cleaning for the trip recap ("Trip Wrapped").
// Kept separate from index.ts so it can be tested without Supabase.

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
export type Feeling = (typeof FEELINGS)[number];

export class RecapError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const TIRED_MESSAGE = 'The Panda is tired right now (too many requests). Please try again in a minute.';
export const UNHAPPY_MESSAGE = 'Panda is unhappy now, don’t want to answer. Please try again later.';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKPOINT = /^d([1-9]|1[0-9])-(morning|afternoon|night)$/;

export const parseTripId = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null);
export const parseCheckpointId = (v: unknown): string | null =>
  typeof v === 'string' && CHECKPOINT.test(v) ? v : null;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

// ------------------------------------------------------------------ per-checkpoint analysis
export interface MomentContext {
  day: number;
  city: string;
  stop: string; // what they did, e.g. "Liziba monorail → Guanyinqiao"
  slot: string; // Morning / Afternoon / Night
}

export interface PhotoScore {
  joy: number; // 0..1: how happy the people look (smiles, laughing). 0.5 if nobody is in it.
  wow: number; // 0..1: how striking the scene is
  quality: number; // 0..1: sharp and well lit = 1, blurry or dark = low
}

export interface MomentAnalysis {
  /** -1 (unhappy) .. 1 (very happy); null when there was no note. */
  noteSentiment: number | null;
  feelings: Feeling[];
  /** Copied word for word from the note (checked), or ''. */
  quote: string;
  caption: string;
  photos: PhotoScore[];
  /** Index into the entry's photos, or null when there are none. */
  bestPhoto: number | null;
  /** False when nothing was sent to Gemini (no note and no photos). */
  ai: boolean;
}

export function parseMomentContext(v: unknown): MomentContext | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const day = typeof o.day === 'number' && Number.isInteger(o.day) && o.day >= 1 && o.day <= 19 ? o.day : null;
  const stop = str(o.stop, 120);
  if (!day || !stop) return null;
  return { day, stop, city: str(o.city, 40), slot: str(o.slot, 20) };
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    note_sentiment: { type: ['number', 'null'], description: '-1 very unhappy … 1 very happy; null if no note' },
    feelings: { type: 'array', items: { type: 'string', enum: [...FEELINGS] }, maxItems: 3 },
    quote: { type: 'string', description: 'A short phrase copied exactly from the note, or empty' },
    caption: { type: 'string', description: 'One warm line, max 12 words' },
    photos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { joy: { type: 'number' }, wow: { type: 'number' }, quality: { type: 'number' } },
        required: ['joy', 'wow', 'quality'],
      },
    },
    best_photo: { type: ['integer', 'null'] },
  },
  required: ['note_sentiment', 'feelings', 'quote', 'caption', 'photos', 'best_photo'],
};

export function analysisPrompt(c: MomentContext, note: string, mood: number | null, photoCount: number): string {
  return [
    'You are helping make a cheerful end-of-trip recap for a mother and daughter travelling in China.',
    `This is one stop: Day ${c.day}, ${c.slot}, ${c.city}: ${c.stop}.`,
    mood ? `They rated it ${mood} out of 5 hearts.` : 'They did not rate it.',
    note ? `Their journal note (may mix English and Chinese):\n"""\n${note}\n"""` : 'There is no journal note.',
    photoCount ? `${photoCount} photo(s) follow, in order (photo 0 first).` : 'There are no photos.',
    '',
    'Return JSON only, with these fields:',
    '- note_sentiment: how happy the note sounds, from -1 (unhappy) to 1 (very happy). null if there is no note.',
    `- feelings: up to 3 from this list only: ${FEELINGS.join(', ')}.`,
    '- quote: the most memorable short phrase (max 15 words) copied EXACTLY from the note. Do not change any word. Empty string if there is no note.',
    '- caption: one warm line (max 12 words) about this stop, based only on the note, photos and stop name. Do not invent facts.',
    `- photos: exactly ${photoCount} items, one per photo in order, each with joy (0-1, how happy the people look; 0.5 if nobody is in it), wow (0-1, how striking the scene is) and quality (0-1, sharp and well lit = 1, blurry or dark = low).`,
    '- best_photo: the index of the photo that best captures a happy memory, or null if there are no photos.',
  ].join('\n');
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Cleans Gemini's reply: clamps numbers, keeps known feelings, drops a quote that isn't really in the note. */
export function cleanAnalysis(raw: unknown, note: string, photoCount: number): MomentAnalysis {
  const o = (raw ?? {}) as Record<string, unknown>;
  const feelings = Array.isArray(o.feelings)
    ? [...new Set(o.feelings.filter((f): f is Feeling => (FEELINGS as readonly string[]).includes(f as string)))].slice(
        0,
        3,
      )
    : [];
  let quote = normalize(str(o.quote, 200)).replace(/^["“']+|["”']+$/g, '');
  if (!quote || !note || !normalize(note).includes(quote)) quote = '';
  const rawPhotos = Array.isArray(o.photos) ? o.photos : [];
  const photos: PhotoScore[] = Array.from({ length: photoCount }, (_, i) => {
    const p = (rawPhotos[i] ?? {}) as Record<string, unknown>;
    return { joy: clamp(p.joy, 0, 1, 0.5), wow: clamp(p.wow, 0, 1, 0.5), quality: clamp(p.quality, 0, 1, 0.7) };
  });
  let bestPhoto: number | null = null;
  if (photoCount > 0) {
    const b = o.best_photo;
    if (typeof b === 'number' && Number.isInteger(b) && b >= 0 && b < photoCount) bestPhoto = b;
    else bestPhoto = photos.reduce((bi, p, i, a) => (photoScore(p) > photoScore(a[bi]) ? i : bi), 0);
  }
  return {
    noteSentiment: note ? clamp(o.note_sentiment, -1, 1, 0) : null,
    feelings,
    quote,
    caption: str(o.caption, 120),
    photos,
    bestPhoto,
    ai: true,
  };
}

export const photoScore = (p: PhotoScore) => (0.6 * p.joy + 0.4 * p.wow) * (0.5 + 0.5 * p.quality);

/** Used when there is nothing to send (no note, no photos): no Gemini call. */
export const emptyAnalysis = (): MomentAnalysis => ({
  noteSentiment: null,
  feelings: [],
  quote: '',
  caption: '',
  photos: [],
  bestPhoto: null,
  ai: false,
});

// ------------------------------------------------------------------ whole-trip summary
export interface SummaryInput {
  travellers: string; // e.g. "Mum and Tay"
  stats: string; // one line of numbers
  days: string[]; // one line per day: "Day 3 Chongqing: avg 4.5 hearts, feelings joy/awe"
  choices: string; // e.g. "followed the plan 18 times, optional 5, rested 2, did something else 3"
  feelings: string; // e.g. "joy 12, tasty 8, awe 5"
  top: string[]; // top moments, one line each
  notes: string[]; // short note excerpts
}

export interface Summary {
  personalityTitle: string;
  personalityText: string;
  closingNote: string;
}

export function parseSummaryInput(v: unknown): SummaryInput | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const list = (x: unknown, n: number, max: number) =>
    Array.isArray(x)
      ? x
          .slice(0, n)
          .map((s) => str(s, max))
          .filter(Boolean)
      : [];
  const out: SummaryInput = {
    travellers: str(o.travellers, 80),
    stats: str(o.stats, 400),
    days: list(o.days, 12, 200),
    choices: str(o.choices, 300),
    feelings: str(o.feelings, 300),
    top: list(o.top, 5, 300),
    notes: list(o.notes, 30, 300),
  };
  return out.travellers && out.stats ? out : null;
}

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    personality_title: { type: 'string' },
    personality_text: { type: 'string' },
    closing_note: { type: 'string' },
  },
  required: ['personality_title', 'personality_text', 'closing_note'],
};

export function summaryPrompt(s: SummaryInput): string {
  return [
    `Write the ending of a playful "Trip Wrapped" recap (like Spotify Wrapped) for ${s.travellers}, a mother and daughter who just finished a 10-day trip: Chongqing then Chengdu, China.`,
    'Use only the facts below. Do not invent places, food or events.',
    '',
    `Numbers: ${s.stats}`,
    `Choices: ${s.choices}`,
    `Most common feelings: ${s.feelings || 'not enough notes'}`,
    'Day by day:',
    ...s.days.map((d) => `- ${d}`),
    'Top moments:',
    ...s.top.map((t) => `- ${t}`),
    s.notes.length ? 'Some of their notes:' : '',
    ...s.notes.map((n) => `- ${n}`),
    '',
    'Return JSON only:',
    '- personality_title: a fun travel-personality name for the pair, 2 to 4 words, like "The Cosy Adventurers".',
    '- personality_text: 2 or 3 sentences (max 60 words) on why, pointing to their mood over the days, their feelings and their choices.',
    '- closing_note: a warm, short closing note to both of them (max 80 words), in plain English, mentioning one or two real highlights.',
  ].join('\n');
}

/** Shortens text to max characters, ending at a full sentence when possible (so it fits on one slide). */
export function sentences(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > max / 2 ? cut.slice(0, end + 1) : `${cut.slice(0, max - 1).trimEnd()}…`;
}

export function cleanSummary(raw: unknown): Summary {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s: Summary = {
    personalityTitle: str(o.personality_title, 60),
    personalityText: sentences(str(o.personality_text, 2000), 400),
    closingNote: sentences(str(o.closing_note, 2000), 600),
  };
  if (!s.personalityTitle || !s.closingNote)
    throw new RecapError('The Panda could not write the recap. Try again.', 502);
  return s;
}

// ------------------------------------------------------------------ Gemini
export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ImagePart {
  data: string; // base64
  mimeType: string;
}

/** Pulls the model's text out of a Gemini Interactions API response. */
export function extractText(data: unknown): string {
  const d = data as {
    output_text?: unknown;
    steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
  };
  if (typeof d?.output_text === 'string' && d.output_text.trim()) return d.output_text.trim();
  return (d?.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('')
    .trim();
}

/** Accepts plain JSON, or JSON wrapped in ```json fences or surrounded by stray words. */
export function parseJsonText(text: string): unknown {
  const t = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a !== -1 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

async function post(o: GeminiOptions, body: unknown): Promise<Response> {
  return (o.fetchImpl ?? fetch)(`${o.baseUrl}/v1beta/interactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': o.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
  });
}

/**
 * Asks Gemini for JSON. Uses Google's structured-output setting (response_format); if the model
 * refuses that setting (400), asks once more without it and relies on the prompt alone.
 */
export async function askJson(
  o: GeminiOptions,
  prompt: string,
  schema: unknown,
  images: ImagePart[] = [],
  maxTokens = 1024,
): Promise<unknown> {
  const input = images.length
    ? [{ type: 'text', text: prompt }, ...images.map((i) => ({ type: 'image', data: i.data, mime_type: i.mimeType }))]
    : prompt;
  const base = { model: o.model, input, generation_config: { max_output_tokens: maxTokens }, store: false };
  let res: Response;
  try {
    res = await post(o, { ...base, response_format: { type: 'text', mime_type: 'application/json', schema } });
    if (res.status === 400) {
      console.error(
        'Gemini refused response_format; retrying with prompt-only JSON:',
        (await res.text().catch(() => '')).slice(0, 300),
      );
      res = await post(o, base);
    }
  } catch (e) {
    console.error('Gemini request failed:', e instanceof Error ? e.name : e);
    throw new RecapError('The Panda took too long. Try again.', 504);
  }
  if (!res.ok) {
    console.error('Gemini error', res.status, (await res.text().catch(() => '')).slice(0, 500));
    if (res.status === 429) throw new RecapError(TIRED_MESSAGE, 429);
    if (res.status >= 500) throw new RecapError(UNHAPPY_MESSAGE, 502);
    throw new RecapError('The Panda is unavailable right now.', 502);
  }
  const parsed = parseJsonText(extractText(await res.json().catch(() => null)));
  if (!parsed || typeof parsed !== 'object')
    throw new RecapError('The Panda gave an answer it could not read. Try again.', 502);
  return parsed;
}

export async function analyzeMoment(
  o: GeminiOptions,
  c: MomentContext,
  note: string,
  mood: number | null,
  images: ImagePart[],
): Promise<MomentAnalysis> {
  if (!note && images.length === 0) return emptyAnalysis();
  const raw = await askJson(o, analysisPrompt(c, note, mood, images.length), ANALYSIS_SCHEMA, images, 800);
  return cleanAnalysis(raw, note, images.length);
}

export async function summarizeTrip(o: GeminiOptions, s: SummaryInput): Promise<Summary> {
  return cleanSummary(await askJson(o, summaryPrompt(s), SUMMARY_SCHEMA, [], 1024));
}
