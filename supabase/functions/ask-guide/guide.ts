// Pure logic for the ask-guide Edge Function: validate the request, build the prompt,
// call Gemini, and read the answer. Kept separate from index.ts so it can be tested on its own.
// This runs on Deno (Supabase Edge Functions), not Node, and is not part of the game's build.

/** Who the guide is talking to. Edit this to change the advice (food, pace, interests). */
export const TRAVELLER_PROFILE =
  'a mother and her adult daughter visiting Chongqing and Chengdu, China (24 Oct to 2 Nov 2026). ' +
  'They want mild, non-spicy food, easy walking with little climbing, and enjoy cafes, desserts, ' +
  'shopping and relaxing. Historical sites are optional for them.';

/** Where they sleep, so "near the hotel" means something. Update if the bookings change. */
export const HOTELS: Record<string, string> = {
  chongqing:
    'IntercityHotel Jiefangbei (重庆解放碑步行街城际酒店), 107 Minquan Road (民权路107号), beside Jiaochangkou (较场口) metro Exit 10B, 24 to 28 Oct.',
  chengdu:
    'IntercityHotel Taikoo Li (成都太古里春熙路步行街城际酒店), about 280 m from Chunxi Road metro (春熙路), 28 Oct to 2 Nov.',
};

const BASE_RULES = [
  `You are the Panda Guide in a travel-journal game for ${TRAVELLER_PROFILE}`,
  "You will be given today's plan (all three time slots), the stop the traveller has open, their hotel and one question.",
  'How to answer:',
  '- Anchor every suggestion to the stop that is open (its place name). Keep to about 15 minutes on foot, or a short taxi, from that stop, unless the question asks for something else. If the question says "hotel", use the hotel given.',
  '- Fit the rest of the day: do not suggest something that clashes with the other time slots, and prefer places on the way between them.',
  '- Food: they want mild, non-spicy dishes. For each place give the dish to order, with its Chinese name. If the dish is normally spicy, say how to ask for it mild (不辣 bù là = not spicy; 微辣 wēi là is still spicy for most visitors).',
  '- Rain or tiredness: suggest indoor, seated places with little walking.',
  '- Write in English, but write names of places, restaurants, streets and dishes in Chinese characters, followed by a few English words saying what each is.',
  '- At most 3 suggestions, each on its own line starting with "- ": the name, then why it fits them and what to order. Keep the whole answer under 150 words.',
  '- Plain text only, no markdown bold or headings. Do not open with a greeting or restate the question.',
];

export type Grounding = 'none' | 'search' | 'agent';

/** How much the model may rely on tools: none = memory only, so it must be extra careful. */
export function systemInstruction(mode: Grounding): string {
  const searchRules = [
    '- Search the web before answering, and search in Chinese: use Chinese keywords that include the stop\'s place name and the dish or need (for example "解放碑 不辣 火锅 推荐"). Run at least one Chinese search; add an English one only if the Chinese results are thin.',
    '- Prefer Chinese sources written by local diners and recent: 大众点评 (Dianping), 小红书 (Xiaohongshu), 美团 (Meituan), 携程 (Ctrip), 马蜂窝 (Mafengwo) and local news or food-guide sites. Prefer posts from 2025 or 2026. Treat old posts and a single mention with caution.',
    '- Only name a place or dish if your search results show it exists. Prefer places that appear in more than one source, and say which source briefly in brackets, for example "(大众点评)".',
    '- Only give opening hours, prices, addresses or phone numbers if a search result states them; say they come from the web and may be out of date. Otherwise say "check hours on Dianping or Amap".',
    '- Never guess. If the search does not confirm something, say you are not sure instead of filling the gap.',
  ];
  const extra: Record<Grounding, string[]> = {
    search: searchRules,
    agent: [
      ...searchRules,
      '- Use Google Search only. Do not write code, create files or open pages other than search results. Reply with the final answer only, with no notes about your process.',
    ],
    none: [
      '- You cannot look anything up. Only suggest well-known places and classic local dishes that you are very confident exist. If you are not sure about a specific shop or restaurant, suggest a type of dish or area instead.',
      '- Never give opening hours, prices, addresses or phone numbers. Say "check hours on Dianping or Amap".',
      '- Never guess. If you are not sure, say so instead of filling the gap.',
    ],
  };
  return [...BASE_RULES, ...extra[mode]].join('\n');
}

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
  /** The day's three time slots, e.g. "Morning: X. Afternoon: Y. Night: Z." */
  dayPlan: string;
}

export interface GuideRequest {
  tripId: string;
  question: string;
  context: GuideContext;
}

/** Checks a trip id on its own (used by the "how many wishes left" request). */
export const parseTripId = (v: unknown): string | null => (typeof v === 'string' && UUID.test(v) ? v : null);

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
        dayPlan: text(c.dayPlan, 600),
      },
    },
  };
}

export function buildInput({ question, context: c }: GuideRequest): string {
  const hotel = HOTELS[c.city.toLowerCase()];
  const lines = [
    `Day ${c.day || '?'}${c.weekday || c.date ? ` (${[c.weekday, c.date].filter(Boolean).join(' ')})` : ''}` +
      `${c.city ? ` in ${c.city}` : ''}${c.dayTitle ? `: ${c.dayTitle}` : ''}.`,
    hotel ? `Hotel: ${hotel}` : '',
    c.dayPlan ? `Plan for the day: ${c.dayPlan}` : '',
    c.slot ? `Open stop, ${c.slot}: ${c.planTitle || 'no plan'}${c.place ? ` (${c.place})` : ''}.` : '',
    c.desc ? `Stop details: ${c.desc}` : '',
    '',
    `Question: ${question}`,
  ];
  return lines.filter((l, i) => l !== '' || i === lines.length - 2).join('\n');
}

/** Shown when Google's rate limit is hit (per minute or per day; Google's reply doesn't say which). */
export const TIRED_MESSAGE = 'Panda Guide is tired today! Please try again later.';

/** Shown when Google itself fails (a 5xx error on their side). */
export const UNHAPPY_MESSAGE = 'Panda is unhappy now, don’t want to answer.';

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
  /** False when tools were off or failed and the answer came from the model's memory. */
  grounded: boolean;
}

const MAX_SOURCES = 5;

/** Links the model cited (Google Search grounding). Only http(s) links, no duplicates. */
export function extractSources(data: unknown): Source[] {
  const steps = ((data as { steps?: Step[] } | null)?.steps ?? []) as Step[];
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const c of steps.filter((s) => s.type === 'model_output').flatMap((s) => s.content ?? [])) {
    for (const a of c.annotations ?? []) {
      if (a.type !== 'url_citation' || typeof a.url !== 'string' || !/^https?:\/\//i.test(a.url) || seen.has(a.url))
        continue;
      seen.add(a.url);
      out.push({ url: a.url, title: (typeof a.title === 'string' && a.title.trim()) || new URL(a.url).hostname });
      if (out.length >= MAX_SOURCES) return out;
    }
  }
  return out;
}

/** Pulls the model's text out of a Gemini Interactions API response. */
export function extractAnswer(data: unknown): string {
  // The Antigravity agent returns its final answer in output_text; the plain models use steps.
  const direct = (data as { output_text?: unknown } | null)?.output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
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
  /** How the model may look things up: 'agent' (Antigravity + Google Search), 'search' (Google Search) or 'none'. Default 'none'. */
  grounding?: Grounding;
  /** Antigravity agent id and the model it runs on (only used when grounding is 'agent'). */
  agentId?: string;
  agentModel?: string;
  fetchFn?: typeof fetch;
}

function toolsFor(mode: Grounding) {
  return mode === 'search' ? [{ type: 'google_search' }] : undefined;
}

/** The agent runs a few search steps in a sandbox, so it is slower than a plain model call. */
const TIMEOUT_MS = { agent: 90_000, other: 25_000 };

async function callGemini(req: GuideRequest, o: GeminiOptions, mode: Grounding): Promise<Response> {
  const common = {
    // The key goes in a header, never in the URL, so it can't end up in logs.
    headers: { 'x-goog-api-key': o.apiKey, 'content-type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(mode === 'agent' ? TIMEOUT_MS.agent : TIMEOUT_MS.other),
  };
  const url = `${o.baseUrl}/v1beta/interactions`;
  if (mode === 'agent') {
    // Antigravity has no documented system-instruction field, so the rules go at the top of the input.
    // Only Google Search is allowed: no code execution or URL fetching, which web pages could try to abuse.
    return await (o.fetchFn ?? fetch)(url, {
      ...common,
      body: JSON.stringify({
        agent: o.agentId ?? 'antigravity-preview-09-2026',
        input: `${systemInstruction('agent')}\n\n${buildInput(req)}`,
        environment: 'remote',
        tools: [{ type: 'google_search' }],
        agent_config: { type: 'antigravity', model: o.agentModel ?? 'gemini-3.5-flash-lite', max_total_tokens: 30_000 },
      }),
    });
  }
  const tools = toolsFor(mode);
  return await (o.fetchFn ?? fetch)(url, {
    ...common,
    body: JSON.stringify({
      model: o.model,
      system_instruction: systemInstruction(mode),
      input: buildInput(req),
      ...(tools ? { tools } : {}),
      generation_config: { max_output_tokens: 1024 },
      store: false,
    }),
  });
}

export async function askGemini(req: GuideRequest, o: GeminiOptions): Promise<GuideResult> {
  let mode: Grounding = o.grounding ?? 'none';
  let res: Response;
  try {
    res = await callGemini(req, o, mode);
    // If the tool is refused (not on this plan, not in this region, over its own quota), answer without it
    // rather than failing; the answer is then marked as not checked.
    if (!res.ok && mode !== 'none' && [400, 403, 429].includes(res.status)) {
      console.error(`Gemini refused ${mode} grounding`, res.status, (await res.text().catch(() => '')).slice(0, 500));
      mode = 'none';
      res = await callGemini(req, o, mode);
    }
  } catch (e) {
    console.error('Gemini request failed:', e instanceof Error ? e.name : e);
    throw new GuideError('The guide took too long to answer. Try again.', 504);
  }
  if (!res.ok) {
    // Details go to the function logs only; the player just sees a short message.
    console.error('Gemini error', res.status, (await res.text().catch(() => '')).slice(0, 500));
    if (res.status === 429) throw new GuideError(TIRED_MESSAGE, 429);
    if (res.status >= 500) throw new GuideError(UNHAPPY_MESSAGE, 502);
    throw new GuideError('The guide is unavailable right now.', 502);
  }
  const data = await res.json().catch(() => null);
  const answer = extractAnswer(data);
  if (!answer) {
    console.error('Gemini returned no text. status:', (data as { status?: string } | null)?.status);
    throw new GuideError('The guide had no answer. Try rephrasing your question.', 502);
  }
  return { answer, sources: extractSources(data), grounded: mode !== 'none' };
}
