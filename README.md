# Trip Quest 🐼

A pixel-art board game that doubles as a travel journal for the Chongqing → Chengdu
mother-daughter trip (Sat 24 Oct – Mon 2 Nov 2026).

- **Timeline**: a horizontal side-scrolling world (endless-runner style). START → 30
  checkpoints (10 days × morning / afternoon / night) → GOAL, one signpost per checkpoint
  and a banner at the start of each day. The sky shifts morning → afternoon → night, the
  skyline changes from Chongqing towers to Chengdu bamboo, and the mother-daughter duo
  walks to the next signpost each time you clear one (tap them to jump).
- **Locks**: only the next checkpoint can be cleared or skipped; later ones are view-only.
  A day also can't be cleared before its date (China time). Settings → *Test mode* turns
  the date lock off so you can try the game before the trip. Only the most recently
  cleared checkpoint can be undone; earlier ones can still be edited.
- **Scrolling**: drag the little train along the track under the world (or tap the track)
  to scroll; numbered posts mark each day. Tap a day button (two rows of five) to centre
  that day in the window.
- **Decisions**: each checkpoint offers the planned activity, optional alternatives
  (e.g. Ciqikou, Dujiangyan, Sanxingdui, Wuhou Shrine), "Rest at the hotel", or
  "Did something else", with directions and travel time. All text is English except
  place names and food names, which are in Chinese (handy to show a taxi driver or point
  at on a menu). Food names have a short English hint in brackets.
- **Journal**: mood hearts, notes, up to 3 photos per checkpoint (a swipeable strip), who wrote it. Browse it all in
  the Journal book; export/import a JSON backup.
- **Game bits**: roll a die once per checkpoint for coins and a chance card (lucky break,
  oops, or side quest), earn EXP and level up, and collect 12 stamps.
- **Two save modes**:
  - *This device only* (default) — saved in the browser's localStorage. Needs no setup.
  - *Synced trip* — both phones share one journal through Supabase, with live updates.

All sprites are original (drawn as character grids in `src/components/Pixel.tsx`).
Icons are generated from emoji at runtime: each one is converted to a 16×16 pixel grid with
flat colours and a dark outline, then drawn as SVG so it stays sharp on any screen. Because
they start from the device's emoji font, icons look slightly different on iPhone and Android. The look is inspired by
2D side-scrolling MMOs, but no assets from any existing game are used.

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into dist/
```

Requires Node 20+.

### Unlock everything for local testing

Create `.env.local` with:

```
VITE_UNLOCK_ALL=true
```

Restart `npm run dev`. Every checkpoint opens (no order or date lock) and any cleared
checkpoint can be undone. A banner shows when this is on. Don't set it in Vercel.

## Project layout

```
src/
  data/itinerary.ts   ← the trip plan (edit this to change activities, directions, dates)
  data/game.ts        ← chance cards, EXP/levels, stamps (pure functions of the entries)
  data/locks.ts       ← order lock + date lock rules
  lib/repo.ts         ← storage interface the UI talks to
  lib/localRepo.ts    ← localStorage implementation
  lib/cloudRepo.ts    ← Supabase implementation (anonymous auth + join code + realtime)
  components/         ← Timeline (side-scroller), QuestModal, Journal/Stamps/Settings panels, pixel sprites
supabase/schema.sql   ← tables, RLS policies, RPCs, photo bucket
```

## Deploy to Vercel (local mode)

1. Push this folder to a GitHub repo.
2. On vercel.com → **Add New… → Project** → import the repo.
   Vercel detects Vite automatically (build `npm run build`, output `dist`).
3. Deploy. That's it — each phone keeps its own journal.

## Add Supabase sync (optional, free tier is plenty)

1. Create a project at supabase.com.
2. **SQL Editor → New query** → paste `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers** → turn on **Allow anonymous sign-ins**.
4. **Project Settings → API Keys** (or the **Connect** button at the top): copy the *Project URL* and the
   *publishable key* (`sb_publishable_…`). Never use the `sb_secret_…` key in this app.
5. In Vercel → Project → **Settings → Environment Variables**, add:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = publishable key (the older `VITE_SUPABASE_ANON_KEY` name also works)

   Then redeploy (Vite reads these at build time). For local dev, put the same two lines in
   `.env.local` (see `.env.example`).
6. Optional: set `VITE_REQUIRE_TRIP=true` (in `.env.local` and Vercel) to make the cloud trip mandatory. The game then
   shows a "Create a trip / Join with a code" screen first and never falls back to saving in the browser. If the
   Supabase keys are missing it says so instead of silently playing offline. "Leave trip" returns to that screen.
7. In the app: **⚙ Settings → Start a shared trip** on one phone (tick "Copy this phone's
   journal" to keep what you've written). It shows a 6-letter code. On the other phone:
   **Settings → Join with a code**.

### How the security works

- The publishable (anon) key is designed to be public; data is protected by Row Level Security.
- Each phone signs in anonymously (no email or password). Only members of a trip
  (whoever created it or joined with its code) can read or write its entries and photos.
- Anyone who has the code can join, so treat the code like a private link.
- Anonymous sessions live in the browser. If a phone clears its site data, re-join
  with the code; the journal itself stays in Supabase.
- Photos go to a private bucket (`journal-photos/<trip>/<checkpoint>/…`). They're
  downscaled to 1280 px before upload and shown via signed URLs that expire after 1 hour.

The schema was tested against Postgres (PGlite) with Supabase-style stubs: members can
read and write, non-members get nothing, the join code works, and photo-folder access is
limited to members.

## Ask the Panda (Gemini tips, optional)

Each checkpoint can show an "Ask the Panda" box for food and place suggestions. The browser never sees the
Gemini key: it calls a Supabase Edge Function (`supabase/functions/ask-guide`) that checks the player's login and
trip membership, counts the question against a daily limit, then calls Gemini.

1. Get a Gemini API key at https://aistudio.google.com/apikey.
2. Run the "AI guide quota" part of `supabase/schema.sql` in the Supabase SQL Editor (it is safe to re-run the whole file).
3. In a terminal, from this folder (install the Supabase CLI first: https://supabase.com/docs/guides/cli):

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>      # the part before .supabase.co in your project URL
   supabase secrets set GEMINI_API_KEY=your-key-here
   supabase functions deploy ask-guide
   ```

4. Set `VITE_ENABLE_GUIDE=true` in `.env.local` (and in Vercel, then redeploy).

Optional secrets: `GUIDE_SEARCH` (`off` disables Google Search), `GUIDE_DAILY_LIMIT` (questions per trip per day, default 30) and `GEMINI_MODEL`
(default `gemini-3.8-flash`). Set them the same way with `supabase secrets set`.

Things to know:

- Only the plan text and the question are sent to Gemini. Journal notes and photos are never sent.
- On Google's free tier, prompts may be used to improve Google products. Paid tier does not.
- Gemini searches Google before answering and the answer shows its source links. That lowers, but does not remove, the chance of wrong places or hours, so the box still reminds players to check Dianping or Amap.
- If your Gemini plan rejects the search tool, run `supabase secrets set GUIDE_SEARCH=off` to turn it off (answers then come from the model's memory and are less reliable).
- To run the function locally: copy `supabase/functions/.env.example` to `supabase/functions/.env`, then
  `supabase functions serve ask-guide --env-file supabase/functions/.env`.

## Known limits

- In local mode, photos are stored as small (640 px) JPEGs in localStorage. Browsers allow
  roughly 5 MB per site, so about 50–100 photos fit (up to 3 per checkpoint, 90 in a full trip). Use cloud sync for more.
- Fonts load from Google Fonts (Press Start 2P, VT323). Offline, the app falls back to
  system fonts.
- Realtime sync covers new and edited entries. If one phone *undoes* a checkpoint, the
  other phone sees it on the next reload, because Supabase filtered realtime channels don't
  deliver deletes.
- "Today" is calculated in China time (Asia/Shanghai).

## Ideas for later

- Add a PWA manifest so it can be installed to the home screen and work offline.
- Generate an end-of-trip "storybook" page you can share.
