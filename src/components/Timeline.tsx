// Side-scrolling timeline: a horizontal world like an endless-runner game.
// Mom & daughter walk along the ground past one signpost per checkpoint;
// the sky shifts morning → afternoon → night, and each day starts at a banner.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { CHECKPOINTS, DAYS, SLOT_LABEL, dayOf, findOption, type Checkpoint, type Slot } from '../data/itinerary';
import type { EntryMap } from '../data/game';
import { lockFor } from '../data/locks';
import { fmtDate } from '../lib/time';
import { sfx } from '../lib/sfx';
import { PixelEmoji, PixelSprite } from './Pixel';

// ---------------------------------------------------------------- world geometry
const STAGE_H = 300;
const GROUND_H = 56;
const SKY_H = STAGE_H - GROUND_H;
const GAP = 128; // between checkpoints
const DAY_GAP = 76; // extra room for each day banner
const PAD_L = 120;
const PAD_R = 150;
const LAST = CHECKPOINTS.length + 1; // stop indexes: 0 START, 1..30 checkpoints, 31 GOAL

const dayIndex = (i: number) => (i === 0 ? 0 : i <= CHECKPOINTS.length ? CHECKPOINTS[i - 1].day : DAYS.length + 1);
export const stopX = (i: number) => PAD_L + i * GAP + dayIndex(i) * DAY_GAP;
const WORLD_W = stopX(LAST) + PAD_R;

/** A day's span: from its banner to its last signpost. */
function daySpan(day: number) {
  const first = CHECKPOINTS.findIndex((c) => c.day === day) + 1;
  const last = first + CHECKPOINTS.filter((c) => c.day === day).length - 1;
  return { banner: (stopX(first - 1) + stopX(first)) / 2, end: stopX(last) };
}
/** scrollLeft that centres a day. On narrow screens where a whole day can't fit,
 *  keep the day banner in view at the left instead. Clamped to the scroll range. */
function scrollForDay(day: number, clientWidth: number) {
  const { banner, end } = daySpan(day);
  const max = Math.max(0, WORLD_W - clientWidth);
  const left = Math.min((banner + end) / 2 - clientWidth / 2, banner - 52);
  return Math.min(max, Math.max(0, left));
}

type SkySlot = Slot | 'goal';
const slotAt = (i: number): SkySlot => (i === 0 ? 'morning' : i === LAST ? 'goal' : CHECKPOINTS[i - 1].slot);

const SKY: Record<
  SkySlot,
  { top: string; bottom: string; far: string; win: string; plant: string; litChance: number }
> = {
  morning: { top: '#86cff7', bottom: '#e3f5ff', far: '#a9c9e6', win: '#d8e9f7', plant: '#79c25a', litChance: 0.55 },
  afternoon: { top: '#58aae6', bottom: '#ffe1a6', far: '#bfb4d8', win: '#ece4f4', plant: '#6cb550', litChance: 0.55 },
  night: { top: '#151a45', bottom: '#423c80', far: '#262d63', win: '#ffd96b', plant: '#23463b', litChance: 0.45 },
  goal: { top: '#ff9f6e', bottom: '#ffe7a8', far: '#e2a27c', win: '#ffe1bd', plant: '#86ad48', litChance: 0.5 },
};

type Scenery = 'cq' | 'cd' | 'rail' | 'air' | 'home';
function sceneryAt(i: number): Scenery {
  if (i === 0) return 'cq';
  if (i === LAST) return 'home';
  const cp = CHECKPOINTS[i - 1];
  if (cp.day <= 4) return 'cq';
  if (cp.day === 5) return cp.slot === 'morning' ? 'cq' : cp.slot === 'afternoon' ? 'rail' : 'cd';
  if (cp.day <= 9) return 'cd';
  return cp.slot === 'morning' ? 'cd' : cp.slot === 'afternoon' ? 'air' : 'home';
}

// Deterministic random so the skyline is the same on every visit.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  c: string;
}

function buildScenery(): {
  rects: Rect[];
  stars: { x: number; y: number }[];
  clouds: { x: number; y: number; night: boolean }[];
  orbs: { x: number; y: number; e: 'sun' | 'moon' }[];
} {
  const rects: Rect[] = [];
  const stars: { x: number; y: number }[] = [];
  const orbs: { x: number; y: number; e: 'sun' | 'moon' }[] = [];
  for (let i = 0; i <= LAST; i++) {
    const r = rng(1000 + i * 97);
    const left = i === 0 ? 0 : (stopX(i - 1) + stopX(i)) / 2;
    const right = i === LAST ? WORLD_W : (stopX(i) + stopX(i + 1)) / 2;
    const slot = slotAt(i);
    const pal = SKY[slot];
    const scene = sceneryAt(i);
    const base = SKY_H;

    if (slot === 'night') {
      for (let k = 0; k < 9; k++)
        stars.push({ x: Math.round(left + r() * (right - left)), y: Math.round(8 + r() * 110) });
      orbs.push({ x: stopX(i) + 24, y: 18, e: 'moon' });
    } else if (slot === 'afternoon') {
      orbs.push({ x: stopX(i) + 30, y: 14, e: 'sun' });
    } else if (slot === 'morning' && i > 0) {
      orbs.push({ x: stopX(i) - 40, y: 96, e: 'sun' });
    }

    let x = Math.round(left);
    while (x < right) {
      if (scene === 'rail' || scene === 'air' || scene === 'home') {
        // low stepped hills
        const w = 24 + Math.round(r() * 24);
        const h = 14 + Math.round(r() * (scene === 'home' ? 22 : 30));
        rects.push({ x, y: base - h, w, h, c: pal.plant });
        if (scene === 'home' && r() > 0.6) {
          // little house
          rects.push({ x: x + 4, y: base - h - 14, w: 14, h: 14, c: pal.far });
          rects.push({ x: x + 2, y: base - h - 18, w: 18, h: 4, c: '#b5523d' });
          rects.push({ x: x + 9, y: base - h - 8, w: 4, h: 4, c: pal.win });
        }
        x += w;
        continue;
      }
      const tall = scene === 'cq';
      const w = tall ? 16 + Math.round(r() * 18) : 20 + Math.round(r() * 22);
      const h = tall ? 56 + Math.round(r() * 86) : 26 + Math.round(r() * 46);
      rects.push({ x, y: base - h, w, h, c: pal.far });
      if (tall && r() > 0.7) rects.push({ x: x + Math.floor(w / 2) - 1, y: base - h - 10, w: 2, h: 10, c: pal.far }); // antenna
      if (!tall && r() > 0.55) rects.push({ x: x - 2, y: base - h - 4, w: w + 4, h: 4, c: pal.far }); // eaves
      for (let wy = base - h + 6; wy < base - 8; wy += 9) {
        for (let wx = x + 4; wx < x + w - 5; wx += 7) {
          if (r() < pal.litChance) rects.push({ x: wx, y: wy, w: 3, h: 4, c: pal.win });
        }
      }
      if (scene === 'cd' && r() > 0.5) {
        // bamboo clump
        const bx = x + w + 2;
        for (let b = 0; b < 3; b++) {
          const bh = 30 + Math.round(r() * 30);
          rects.push({ x: bx + b * 5, y: base - bh, w: 2, h: bh, c: pal.plant });
          rects.push({ x: bx + b * 5 - 3, y: base - bh + 6, w: 5, h: 2, c: pal.plant });
          rects.push({ x: bx + b * 5 + 1, y: base - bh + 14, w: 5, h: 2, c: pal.plant });
        }
        x += 18;
      }
      x += w + 2 + Math.round(r() * 6);
    }
  }
  const cr = rng(42);
  const clouds: { x: number; y: number; night: boolean }[] = [];
  for (let cx = 40; cx < WORLD_W; cx += 210 + Math.round(cr() * 120)) {
    let nearest = 0;
    for (let i = 0; i <= LAST; i++) if (Math.abs(stopX(i) - cx) < Math.abs(stopX(nearest) - cx)) nearest = i;
    clouds.push({ x: cx, y: 14 + Math.round(cr() * 70), night: slotAt(nearest) === 'night' });
  }
  return { rects, stars, clouds, orbs };
}

const SCENERY = buildScenery();

function skyGradient(key: 'top' | 'bottom') {
  const stops = Array.from({ length: LAST + 1 }, (_, i) => `${SKY[slotAt(i)][key]} ${stopX(i)}px`);
  return `linear-gradient(to right, ${stops.join(', ')})`;
}
const SKY_TOP = skyGradient('top');
const SKY_BOTTOM = skyGradient('bottom');

// ---------------------------------------------------------------- component
interface Props {
  entries: EntryMap;
  position: number; // index into CHECKPOINTS of the next open checkpoint
  today: string;
  todayDay: number | null;
  testMode: boolean;
  focusDay: number | null;
  onOpen: (cp: Checkpoint) => void;
  onGoal: () => void;
}

export function Timeline({ entries, position, today, todayDay, testMode, focusDay, onOpen, onGoal }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const tokenStop = Math.min(position + 1, LAST);
  const duoX = stopX(tokenStop) - 74;
  const [walk, setWalk] = useState<{ dur: number; back: boolean } | null>(null);
  const [jumping, setJumping] = useState(false);
  const prevStop = useRef<number | null>(null);

  const followDuo = (smooth: boolean) => {
    const el = stageRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, duoX - el.clientWidth * 0.3), behavior: smooth ? 'smooth' : 'auto' });
  };

  // Walk to the new stop and keep the duo in view.
  useEffect(() => {
    const prev = prevStop.current;
    prevStop.current = tokenStop;
    if (prev === null) {
      followDuo(false);
      return;
    }
    if (prev === tokenStop) return;
    const steps = Math.abs(tokenStop - prev);
    const dur = Math.min(3, Math.max(0.7, steps * 0.55));
    setWalk({ dur, back: tokenStop < prev });
    followDuo(true);
    const t = window.setTimeout(() => setWalk(null), dur * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenStop]);

  // Centre a day (its banner + its three signposts) when a day chip is tapped.
  useEffect(() => {
    if (!focusDay || !stageRef.current) return;
    const el = stageRef.current;
    el.scrollTo({ left: scrollForDay(focusDay, el.clientWidth), behavior: 'smooth' });
  }, [focusDay]);

  const jump = () => {
    if (jumping) return;
    sfx.hop();
    setJumping(true);
    window.setTimeout(() => setJumping(false), 550);
  };

  const duoStyle: CSSProperties = {
    left: duoX,
    transitionDuration: walk ? `${walk.dur}s` : '0s',
  };

  const banners = useMemo(
    () =>
      DAYS.map((d) => {
        const first = CHECKPOINTS.findIndex((c) => c.day === d.day) + 1;
        return { d, x: (stopX(first - 1) + stopX(first)) / 2 };
      }),
    [],
  );

  return (
    <div className="stage-frame">
      <div
        className="stage"
        id="trip-stage"
        ref={stageRef}
        style={{ height: STAGE_H }}
        tabIndex={0}
        aria-label="Trip timeline, scroll sideways"
      >
        <div className="world" style={{ width: WORLD_W, height: STAGE_H }}>
          <div className="sky-layer" style={{ backgroundImage: SKY_TOP }} />
          <div className="sky-layer sky-low" style={{ backgroundImage: SKY_BOTTOM }} />

          {SCENERY.stars.map((s, i) => (
            <span key={i} className="star" style={{ left: s.x, top: s.y, animationDelay: `${(i % 7) * 0.35}s` }} />
          ))}
          {SCENERY.orbs.map((o, i) => (
            <span key={i} className="orb" style={{ left: o.x, top: o.y }}>
              <PixelSprite name={o.e} scale={3} />
            </span>
          ))}
          {SCENERY.clouds.map((c, i) => (
            <span key={i} className={`cloud ${c.night ? 'night' : ''}`} style={{ left: c.x, top: c.y }} />
          ))}

          <svg
            className="skyline"
            width={WORLD_W}
            height={SKY_H}
            viewBox={`0 0 ${WORLD_W} ${SKY_H}`}
            shapeRendering="crispEdges"
            aria-hidden
          >
            {SCENERY.rects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
            ))}
          </svg>

          <div className="ground" style={{ height: GROUND_H }} />

          {banners.map(({ d, x }) => (
            <div
              key={d.day}
              className={`day-gate ${todayDay === d.day ? 'today' : ''}`}
              style={{ left: x, bottom: GROUND_H - 4 }}
            >
              <span className="gate-flag" style={{ background: d.color }}>
                <b>DAY {d.day}</b>
                <span>
                  {d.weekday.toUpperCase()} {fmtDate(d.date)}
                </span>
                <span>{d.city.toUpperCase()}</span>
              </span>
              <span className="gate-pole" />
              {todayDay === d.day && <span className="today-tag">TODAY</span>}
            </div>
          ))}

          {/* START */}
          <div className="stop special" style={{ left: stopX(0), bottom: GROUND_H - 4 }}>
            <span className="sign big">
              <span className="sign-band" style={{ background: '#5bbf4a' }}>
                START
              </span>
              <PixelEmoji emoji="🧳" size={32} />
            </span>
            <span className="post" />
            <span className="stop-label">OCT 24</span>
          </div>

          {CHECKPOINTS.map((cp, k) => {
            const i = k + 1;
            const day = dayOf(cp.day);
            const entry = entries[cp.id];
            const chosen = entry ? findOption(cp, entry.choiceId) : undefined;
            const icon = (chosen ?? cp.options[0]).icon;
            const lock = lockFor(cp, entries, today, testMode);
            const state = entry ? entry.status : k === position ? 'current' : lock.kind !== 'open' ? 'locked' : 'open';
            return (
              <button
                key={cp.id}
                type="button"
                className={`stop ${state} ${lock.kind === 'date' ? 'date-locked' : ''}`}
                style={{ left: stopX(i), bottom: GROUND_H - 4 }}
                onClick={() => {
                  sfx.click();
                  onOpen(cp);
                }}
                aria-label={`Day ${cp.day} ${SLOT_LABEL[cp.slot].en}: ${(chosen ?? cp.options[0]).title}. ${entry ? entry.status : lock.kind === 'open' ? 'open' : 'locked'}`}
              >
                <span className="stop-status">
                  {entry?.status === 'done' && <span className="stamp">CLEAR</span>}
                  {entry?.status === 'skipped' && <span className="stamp skip">SKIP</span>}
                  {!entry && lock.kind !== 'open' && <PixelEmoji emoji="🔒" size={16} />}
                </span>
                <span className="sign">
                  <span className="sign-band" style={{ background: day.color }}>
                    D{cp.day}
                  </span>
                  <PixelEmoji emoji={icon} size={32} className={state === 'locked' ? 'faded' : ''} />
                </span>
                <span className="post" />
                <span className="stop-label">{SLOT_LABEL[cp.slot].en.toUpperCase()}</span>
              </button>
            );
          })}

          {/* GOAL */}
          <button
            type="button"
            className={`stop special goal ${position >= CHECKPOINTS.length ? 'current' : ''}`}
            style={{ left: stopX(LAST), bottom: GROUND_H - 4 }}
            onClick={onGoal}
            aria-label="Goal: trip complete"
          >
            <span className="sign big">
              <span className="sign-band" style={{ background: '#f2b632' }}>
                GOAL
              </span>
              <PixelEmoji emoji="🏆" size={32} />
            </span>
            <span className="post" />
            <span className="stop-label">NOV 2</span>
          </button>

          <button
            type="button"
            className={`duo ${walk ? 'walking' : ''} ${walk?.back ? 'back' : ''} ${jumping ? 'jumping' : ''}`}
            style={{ ...duoStyle, bottom: GROUND_H - 2 }}
            onClick={jump}
            aria-label="Make them jump"
          >
            <span className="duo-inner">
              <PixelSprite name="mom" scale={3} />
              <PixelSprite name="daughter" scale={3} />
            </span>
            <span className="duo-shadow" />
          </button>
        </div>
      </div>
      <button type="button" className="find-us" onClick={() => followDuo(true)}>
        ◉ Find us
      </button>
      <TrainTrack stageRef={stageRef} />
    </div>
  );
}

// ---------------------------------------------------------------- train-track scrollbar
// Replaces the thin native scrollbar: drag the train (or tap the track) to scroll the world.
// Small day posts under the rails show where each day is.
const TRAIN_W = 56; // 28 px sprite × 2

function TrainTrack({ stageRef }: { stageRef: RefObject<HTMLDivElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const grab = useRef<number | null>(null);
  const [m, setM] = useState({ frac: 0, cw: 0, moving: false });
  const stopTimer = useRef(0);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = el.scrollWidth - el.clientWidth;
        setM({ frac: max > 0 ? el.scrollLeft / max : 0, cw: el.clientWidth, moving: true });
        window.clearTimeout(stopTimer.current);
        stopTimer.current = window.setTimeout(() => setM((p) => ({ ...p, moving: false })), 160);
      });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(stopTimer.current);
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [stageRef]);

  const scrollToX = (clientX: number, smooth: boolean) => {
    const el = stageRef.current;
    const track = trackRef.current;
    if (!el || !track || grab.current === null) return;
    const rect = track.getBoundingClientRect();
    const span = rect.width - TRAIN_W;
    if (span <= 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left - grab.current) / span));
    el.scrollTo({ left: frac * (el.scrollWidth - el.clientWidth), behavior: smooth ? 'smooth' : 'auto' });
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const trainLeft = m.frac * (rect.width - TRAIN_W);
    const onTrain = x >= trainLeft && x <= trainLeft + TRAIN_W;
    grab.current = onTrain ? x - trainLeft : TRAIN_W / 2;
    track.setPointerCapture(e.pointerId);
    if (!onTrain) scrollToX(e.clientX, true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (grab.current !== null) scrollToX(e.clientX, false);
  };
  const onUp = () => {
    grab.current = null;
  };

  const max = Math.max(1, WORLD_W - m.cw);
  const pos = (frac: number) => `calc((100% - ${TRAIN_W}px) * ${frac} + ${TRAIN_W / 2}px)`;

  return (
    <div
      className="train-track"
      ref={trackRef}
      role="scrollbar"
      aria-controls="trip-stage"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(m.frac * 100)}
      aria-label="Drag the train to scroll the trip"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className="rails" />
      {m.cw > 0 &&
        DAYS.map((d) => (
          <span
            key={d.day}
            className="track-post"
            style={{ left: pos(scrollForDay(d.day, m.cw) / max), '--day': d.color } as CSSProperties}
          >
            {d.day}
          </span>
        ))}
      <span className={`train ${m.moving ? 'moving' : ''}`} style={{ left: pos(m.frac) }}>
        <PixelSprite name="train" scale={2} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- day chips + day log
export function DayStrip({
  selected,
  currentDay,
  todayDay,
  onSelect,
}: {
  selected: number;
  currentDay: number;
  todayDay: number | null;
  onSelect: (day: number) => void;
}) {
  return (
    <div className="day-strip" role="tablist" aria-label="Jump to day">
      {DAYS.map((d) => (
        <button
          key={d.day}
          type="button"
          role="tab"
          aria-selected={selected === d.day}
          className={`day-chip ${selected === d.day ? 'on' : ''} ${currentDay === d.day ? 'current' : ''}`}
          style={{ '--day': d.color } as CSSProperties}
          onClick={() => onSelect(d.day)}
        >
          <b>D{d.day}</b>
          <span>{fmtDate(d.date)}</span>
          {todayDay === d.day && <i>TODAY</i>}
        </button>
      ))}
    </div>
  );
}

export function DayLog({
  day,
  entries,
  today,
  testMode,
  onOpen,
}: {
  day: number;
  entries: EntryMap;
  today: string;
  testMode: boolean;
  onOpen: (cp: Checkpoint) => void;
}) {
  const d = dayOf(day);
  const cps = CHECKPOINTS.filter((c) => c.day === day);
  return (
    <section className="day-log">
      <h2 className="day-log-title">
        <span className="chip" style={{ background: d.color }}>
          DAY {d.day}
        </span>
        <span>
          {d.weekday} {fmtDate(d.date)} · {d.city}
        </span>
      </h2>
      <p className="day-log-sub">{d.title}</p>
      <div className="day-log-rows">
        {cps.map((cp) => {
          const entry = entries[cp.id];
          const op = entry ? findOption(cp, entry.choiceId) : cp.options[0];
          const lock = lockFor(cp, entries, today, testMode);
          const title = entry?.choiceId === 'custom' ? entry.customTitle : op?.title;
          return (
            <button
              key={cp.id}
              type="button"
              className={`log-row ${entry ? entry.status : lock.kind !== 'open' ? 'locked' : 'open'}`}
              onClick={() => {
                sfx.click();
                onOpen(cp);
              }}
            >
              <PixelEmoji
                emoji={op?.icon ?? '✨'}
                size={32}
                className={!entry && lock.kind !== 'open' ? 'faded' : ''}
              />
              <span className="log-main">
                <span className="log-slot">{SLOT_LABEL[cp.slot].en}</span>
                <span className="log-title">{title}</span>
              </span>
              <span className="log-state">
                {entry?.status === 'done' && <span className="stamp">CLEAR</span>}
                {entry?.status === 'skipped' && <span className="stamp skip">SKIP</span>}
                {!entry && lock.kind !== 'open' && <PixelEmoji emoji="🔒" size={16} />}
                {!entry && lock.kind === 'open' && <span className="go">GO ▶</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
