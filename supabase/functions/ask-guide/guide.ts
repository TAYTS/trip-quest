// Pure logic for the ask-guide Edge Function: validate the request, build the prompt,
// call Gemini, and read the answer. Kept separate from index.ts so it can be tested on its own.
// This runs on Deno (Supabase Edge Functions), not Node, and is not part of the game's build.

/** Who the guide is talking to. Edit this to change the advice (food, pace, interests). */
export const TRAVELLER_PROFILE =
  'a mother and her adult daughter visiting Chongqing and Chengdu, China (24 Oct to 2 Nov 2026). ' +
  'They prefer mild, non-spicy food, easy walking and little climbing, and enjoy cafes, desserts, ' +
  'shopping and relaxing. Historical sites are optional for them.';

export const SYSTEM_INSTRUCTION = [
  `You are the Panda Guide in a travel-journal game for ${TRAVELLER_PROFILE}`,
  'Answer the question using the day and plan details you are given.',
  'Rules:',
  '- Write in English, but write names of places, restaurants, streets and dishes in Chinese characters, with a few English words saying what each is.',
  '- Give at most 3 suggestions and keep the whole answer under 120 words.',
  '- Plain text only: short lines starting with "-", no markdown bold, no headings.',
  '- Search the web before answering. Only name a place or dish if your search results show it exists, and prefer places with recent mentions.',
  '- Only give opening hours, prices, addresses or phone numbers if a search result states them; say they come from the web and may be out of date. Otherwise say "check hours before you go".',
  '- Never guess. If the search does not confirm something, say you are not sure instead of filling the gap.',
].join('\n');

const MAX_QUESTION = 500;
const MAX_FIELD = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GuideContext {
  day: number;
  date: string;
  weekday: string;
  city: string;
  dayTitle: string;
  slot: string;
  planTitle: string;
  place: string;
  desc: string;
}

export interface GuideRequest {
  tripId: string;
  question: string;
  context: GuideContext;
}

export type Parsed = { ok: true; value: GuideRequest } | { ok: false; error: string };

const text = (v: unknown, max = MAX_FIELD) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** Checks the request body and trims every field, so the prompt can't be bloated. */
export function parseRequest(body: unknown): Parsed {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Send a JSON body.' };
  const b = body as Record<string, unknown>;
  const tripId = typeof b.tripId === 'string' ? b.tripId : '';
  if (!UUID.test(tripId)) return { ok: false, error: 'Missing or invalid trip.' };
  const question = text(b.question, MAX_QUESTION);
  if (!question) return { ok: false, error: 'Ask a question first.' };
  const c = (typeof b.context === 'object' && b.context !== null ? b.context : {}) as Record<string, unknown>;
  const day = Number(c.day);
  return {
    ok: true,
    value: {
      tripId,
      question,
      context: {
        day: Number.isInteger(day) && day >= 1 && day <= 31 ? day : 0,
        date: text(c.date, 20),
        weekday: text(c.weekday, 10),
        city: text(c.city, 40),
        dayTitle: text(c.dayTitle),
        slot: text(c.slot, 20),
        planTitle: text(c.planTitle),
        place: text(c.place),
        desc: text(c.desc, 600),
      },
    },
  };
}

export function buildInput({ question, context: c }: GuideRequest): string {
  const lines = [
    `Day ${c.day || '?'}${c.weekday || c.date ? ` (${[c.weekday, c.date].filter(Boolean).join(' ')})` : ''}` +
      `${c.city ? ` in ${c.city}` : ''}${c.dayTitle ? `: ${c.dayTitle}` : ''}.`,
    c.slot ? `Time of day: ${c.slot}.` : '',
    c.planTitle ? `Current plan: ${c.planTitle}${c.place ? ` (${c.place})` : ''}.` : '',
    c.desc ? `Plan details: ${c.desc}` : '',
    '',
    `Question: ${question}`,
  ];
  return lines.filter((l, i) => l !== '' || i === 4).join('\n');
}

export class GuideError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface Annotation {
  type?: string;
  url?: string;
  title?: string;
}
interface Step {
  type?: string;
  content?: { type?: string; text?: string; annotations?: Annotation[] }[];
}

export interface Source {
  url: string;
  title: string;
}

export interface GuideResult {
  answer: string;
  sources: Source[];
}

const MAX_SOURCES = 5;

/** Links the model cited (Google Search grounding). Only http(s) links, no duplicates. */
export function extractSources(data: unknown): Source[] {
  const steps = ((data as { steps?: Step[] } | null)?.steps ?? []) as Step[];
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const c of steps.filter((s) => s.type === 'model_output').flatMap((s) => s.content ?? [])) {
    for (const a of c.annotations ?? []) {
      if (a.type !== 'url_citation' || typeof a.url !== 'string' || !/^https?:\/\//i.test(a.url)) continue;
      if (seen.has(a.url)) continue;
      seen.add(a.url);
      out.push({ url: a.url, title: (typeof a.title === 'string' && a.title.trim()) || new URL(a.url).hostname });
      if (out.length >= MAX_SOURCES) return out;
    }
  }
  return out;
}

/** Pulls the model's text out of a Gemini Interactions API response. */
export function extractAnswer(data: unknown): string {
  const steps = ((data as { steps?: Step[] } | null)?.steps ?? []) as Step[];
  return steps
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text as string)
    .join('')
    .trim();
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Let Gemini search Google before answering (turn off with GUIDE_SEARCH=off). */
  search?: boolean;
  fetchFn?: typeof fetch;
}

export async function askGemini(req: GuideRequest, o: GeminiOptions): Promise<GuideResult> {
  const doFetch = o.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${o.baseUrl}/v1beta/interactions`, {
      method: 'POST',
      // The key goes in a header, never in the URL, so it can't end up in logs.
      headers: { 'x-goog-api-key': o.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: o.model,
        system_instruction: SYSTEM_INSTRUCTION,
        input: buildInput(req),
        ...(o.search === false ? {} : { tools: [{ type: 'google_search' }] }),
        generation_config: { max_output_tokens: 1024 },
        store: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    console.error('Gemini request failed:', e instanceof Error ? e.name : e);
    throw new GuideError('The guide took too long to answer. Try again.', 504);
  }
  if (!res.ok) {
    // Details go to the function logs only; the player just sees a short message.
    console.error('Gemini error', res.status, (await res.text().catch(() => '')).slice(0, 500));
    if (res.status === 429) throw new GuideError('The guide is busy right now. Try again in a minute.', 503);
    throw new GuideError('The guide is unavailable right now.', 502);
  }
  const data = await res.json().catch(() => null);
  const answer = extractAnswer(data);
  if (!answer) {
    console.error('Gemini returned no text. status:', (data as { status?: string } | null)?.status);
    throw new GuideError('The guide had no answer. Try rephrasing your question.', 502);
  }
  return { answer, sources: extractSources(data) };
}
