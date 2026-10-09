// "Trip Wrapped": a Spotify-Wrapped-style recap of the trip.
// RecapScreen makes it once (Gemini reads each checkpoint, then writes the ending) and then plays it
// as full-screen story slides. The same slides, without animation, become the downloadable PDF.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { TRIP } from '../data/itinerary';
import type { EntryMap } from '../data/game';
import {
  buildRecap,
  doneCheckpoints,
  momentContext,
  rankMoments,
  summaryInput,
  tripDates,
  type MomentAnalysis,
  type RecapData,
} from '../lib/recap';
import { analyzeCheckpoint, deleteRecap, loadAnalyses, photoBlobUrl, saveRecap, summarize } from '../lib/recapApi';
import { sfx } from '../lib/sfx';
import { Window } from './Window';
import { ConfirmButton } from './ConfirmButton';
import { Hearts, PixelEmoji, PixelSprite } from './Pixel';

/** Seconds each slide stays before moving on (the last one waits for you). */
const DURATIONS = [5, 6, 9, 9, 8, 0];
const SLIDE_NAMES = ['Intro', 'Numbers', 'Best shots', 'Top 5', 'Personality', 'Closing note'];
const CONCURRENCY = 3;

type Photos = Record<string, string>;
type Mode = 'live' | 'print';

// ------------------------------------------------------------------ slides
function Sprite({ name, className }: { name: 'mom' | 'panda' | 'daughter'; className?: string }) {
  return (
    <span className={`wr-sprite ${className ?? ''}`}>
      <PixelSprite name={name} scale={4} />
    </span>
  );
}

function Img({ photos, path, className }: { photos: Photos; path: string | null; className?: string }) {
  const url = path ? photos[path] : undefined;
  return url ? (
    <img className={className} src={url} alt="" draggable={false} />
  ) : (
    <div className={`${className ?? ''} wr-noimg`}>
      <PixelSprite name="panda" scale={3} />
    </div>
  );
}

function IntroSlide({ recap }: { recap: RecapData }) {
  return (
    <div className="wr-slide wr-intro">
      <p className="wr-kicker">Trip Quest presents</p>
      <h2 className="wr-title wr-big">
        TRIP
        <br />
        WRAPPED
      </h2>
      <div className="wr-sprites">
        <Sprite name="mom" />
        <Sprite name="panda" className="wr-bob" />
        <Sprite name="daughter" />
      </div>
      <p className="wr-route">{TRIP.name}</p>
      <p className="wr-sub">{tripDates()}</p>
      <p className="wr-sub">{recap.travellers}</p>
    </div>
  );
}

function NumbersSlide({ recap }: { recap: RecapData }) {
  const n = recap.numbers;
  const tiles: [string, string][] = [
    [`${n.done}/${n.total}`, 'checkpoints cleared'],
    [n.photos.toLocaleString('en'), 'photos taken'],
    [n.words.toLocaleString('en'), 'words written'],
    [n.coins.toLocaleString('en'), 'coins collected'],
    [`Lv.${n.level}`, n.levelTitle],
    [String(n.stamps), 'stamps earned'],
  ];
  return (
    <div className="wr-slide wr-numbers">
      <h2 className="wr-title">Your trip in numbers</h2>
      <div className="wr-tiles">
        {tiles.map(([big, label], i) => (
          <div key={label} className="wr-tile" style={{ animationDelay: `${0.15 * i}s` }}>
            <b>{big}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {n.skipped > 0 && (
        <p className="wr-sub">
          …and {n.skipped} lazy {n.skipped === 1 ? 'break' : 'breaks'} you totally deserved.
        </p>
      )}
    </div>
  );
}

function MontageSlide({ recap, photos, mode }: { recap: RecapData; photos: Photos; mode: Mode }) {
  const list = recap.montage;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (mode !== 'live' || list.length < 2) return;
    const t = window.setInterval(() => setShown((s) => (s + 1) % list.length), 1800);
    return () => window.clearInterval(t);
  }, [mode, list.length]);
  return (
    <div className="wr-slide wr-montage">
      <h2 className="wr-title">Your best shots</h2>
      {list.length === 0 ? (
        <div className="wr-empty">
          <PixelSprite name="panda" scale={6} />
          <p className="wr-sub">No photos this time, just memories.</p>
        </div>
      ) : mode === 'live' ? (
        <div className="wr-kb-frame">
          {list.map((p, i) => (
            <div key={p} className={`wr-kb ${i === shown ? 'on' : ''} kb-${i % 3}`}>
              <Img photos={photos} path={p} />
            </div>
          ))}
          <div className="wr-kb-dots">
            {list.map((p, i) => (
              <span key={p} className={i === shown ? 'on' : ''} />
            ))}
          </div>
        </div>
      ) : (
        <div className={`wr-collage n${list.length}`}>
          {list.map((p) => (
            <Img key={p} photos={photos} path={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopSlide({ recap, photos }: { recap: RecapData; photos: Photos }) {
  const [first, ...rest] = recap.top;
  return (
    <div className="wr-slide wr-top">
      <h2 className="wr-title">Your top {recap.top.length} moments</h2>
      {first ? (
        <>
          <div className="wr-hero">
            <div className="wr-hero-photo">
              <Img photos={photos} path={first.photo} />
              <span className="wr-rank">#1</span>
            </div>
            <p className="wr-hero-title">{first.title}</p>
            <p className="wr-meta">
              Day {first.day} · {first.slot} · {first.city}
            </p>
            {first.hearts ? (
              <div className="wr-hearts">
                <Hearts value={first.hearts} scale={2} />
              </div>
            ) : null}
            {first.quote ? <p className="wr-quote">“{first.quote}”</p> : null}
            {first.quote ? null : first.caption ? <p className="wr-caption">{first.caption}</p> : null}
          </div>
          <ol className="wr-list" start={2}>
            {rest.map((m, i) => (
              <li key={m.checkpointId} style={{ animationDelay: `${0.2 * i + 0.4}s` }}>
                <span className="wr-num">#{i + 2}</span>
                <Img photos={photos} path={m.photo} className="wr-thumb" />
                <span className="wr-li-text">
                  <b>{m.title}</b>
                  <span className="wr-meta">
                    Day {m.day} · {m.slot}
                    {m.hearts ? ` · ${'♥'.repeat(m.hearts)}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="wr-sub">No cleared checkpoints yet.</p>
      )}
    </div>
  );
}

function PersonalitySlide({ recap }: { recap: RecapData }) {
  return (
    <div className="wr-slide wr-personality">
      <p className="wr-kicker">Your travel personality</p>
      <Sprite name="panda" className="wr-bob wr-mid" />
      <h2 className="wr-title wr-big2">{recap.personality.title}</h2>
      <p className={`wr-text ${recap.personality.text.length > 260 ? 'wr-long' : ''}`}>{recap.personality.text}</p>
    </div>
  );
}

function ClosingSlide({ recap, mode, footer }: { recap: RecapData; mode: Mode; footer?: ReactNode }) {
  return (
    <div className="wr-slide wr-closing">
      <p className="wr-kicker">A note from the Panda</p>
      <div className={`wr-sprites small ${recap.closingNote.length > 480 ? 'wr-hide' : ''}`}>
        <Sprite name="mom" />
        <Sprite name="panda" />
        <Sprite name="daughter" />
      </div>
      <p className={`wr-text wr-letter ${recap.closingNote.length > 380 ? 'wr-long' : ''}`}>{recap.closingNote}</p>
      {mode === 'live' ? footer : <p className="wr-sub wr-sign">Trip Quest · {tripDates()}</p>}
    </div>
  );
}

function SlideView({
  index,
  recap,
  photos,
  mode,
  footer,
}: {
  index: number;
  recap: RecapData;
  photos: Photos;
  mode: Mode;
  footer?: ReactNode;
}) {
  switch (index) {
    case 0:
      return <IntroSlide recap={recap} />;
    case 1:
      return <NumbersSlide recap={recap} />;
    case 2:
      return <MontageSlide recap={recap} photos={photos} mode={mode} />;
    case 3:
      return <TopSlide recap={recap} photos={photos} />;
    case 4:
      return <PersonalitySlide recap={recap} />;
    default:
      return <ClosingSlide recap={recap} mode={mode} footer={footer} />;
  }
}

// ------------------------------------------------------------------ player
function usePhotoUrls(recap: RecapData): { photos: Photos; ready: boolean } {
  const [photos, setPhotos] = useState<Photos>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    const paths = [...new Set([...recap.top.map((m) => m.photo), ...recap.montage].filter((p): p is string => !!p))];
    void Promise.all(
      paths.map(async (p) => {
        try {
          const url = await photoBlobUrl(p);
          if (url.startsWith('blob:')) made.push(url);
          return [p, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((list) => {
      if (!alive) return;
      setPhotos(Object.fromEntries(list.filter((x): x is readonly [string, string] => !!x)));
      setReady(true);
    });
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [recap]);
  return { photos, ready };
}

function RecapPlayer({
  recap,
  canDelete,
  onDelete,
  onClose,
}: {
  recap: RecapData;
  canDelete: boolean;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pdfState, setPdfState] = useState<'idle' | 'busy' | 'error'>('idle');
  const { photos, ready } = usePhotoUrls(recap);
  const printRef = useRef<HTMLDivElement>(null);
  const hold = useRef<{ timer: number; held: boolean } | null>(null);
  const last = SLIDE_NAMES.length - 1;

  const go = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(last, i + d))), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  async function downloadPdf() {
    if (!printRef.current) return;
    setPdfState('busy');
    try {
      const { slidesToPdf } = await import('../lib/recapPdf');
      const nodes = Array.from(printRef.current.querySelectorAll<HTMLElement>('.wr-stage'));
      await slidesToPdf(nodes, 'trip-wrapped.pdf');
      setPdfState('idle');
      sfx.coin();
    } catch (e) {
      console.error('PDF failed', e);
      setPdfState('error');
    }
  }

  const footer = (
    <div className="wr-actions" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn btn-go" disabled={pdfState === 'busy' || !ready} onClick={downloadPdf}>
        {pdfState === 'busy' ? 'Making PDF…' : !ready ? 'Loading photos…' : 'Download PDF'}
      </button>
      {pdfState === 'error' && <p className="wr-error">Could not make the PDF. Try again.</p>}
      {canDelete && (
        <ConfirmButton className="btn btn-ghost small" confirmLabel="Sure? Delete it" onConfirm={() => void onDelete()}>
          Delete this recap (test)
        </ConfirmButton>
      )}
    </div>
  );

  const onPointerDown = () => {
    const h = { timer: 0, held: false };
    h.timer = window.setTimeout(() => {
      h.held = true;
      setPaused(true);
    }, 220);
    hold.current = h;
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const h = hold.current;
    hold.current = null;
    if (!h) return;
    window.clearTimeout(h.timer);
    if (h.held) {
      setPaused(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    go(e.clientX - rect.left < rect.width / 3 ? -1 : 1);
  };

  return (
    <div className="wr-overlay" role="dialog" aria-modal="true" aria-label="Trip Wrapped">
      <div
        className={`wr-stage slide-${index} ${paused ? 'paused' : ''}`}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          if (hold.current) window.clearTimeout(hold.current.timer);
          hold.current = null;
          setPaused(false);
        }}
      >
        <div className="wr-bars" aria-hidden="true">
          {SLIDE_NAMES.map((n, i) => (
            <span key={n} className={i < index ? 'done' : ''}>
              {i === index && (
                <i
                  key={index}
                  className={DURATIONS[i] ? 'run' : 'full'}
                  style={{ animationDuration: `${DURATIONS[i]}s` }}
                  onAnimationEnd={() => go(1)}
                />
              )}
            </span>
          ))}
        </div>
        <button
          type="button"
          className="wr-close"
          aria-label="Close"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ×
        </button>
        <div key={index} className="wr-slide-wrap">
          <SlideView index={index} recap={recap} photos={photos} mode="live" footer={footer} />
        </div>
        <p className="wr-hint" aria-live="polite">
          {index + 1}/{SLIDE_NAMES.length} · {SLIDE_NAMES[index]}
          {paused ? ' · paused' : ''}
        </p>
      </div>
      <nav className="wr-sr">
        <button type="button" onClick={() => go(-1)} disabled={index === 0}>
          Previous slide
        </button>
        <button type="button" onClick={() => go(1)} disabled={index === last}>
          Next slide
        </button>
      </nav>

      {/* The PDF copy: same slides, no animation, fixed size, kept off screen. */}
      <div className="wr-print" ref={printRef} aria-hidden="true">
        {SLIDE_NAMES.map((n, i) => (
          <div key={n} className={`wr-stage print slide-${i}`}>
            <SlideView index={i} recap={recap} photos={photos} mode="print" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ maker
type Step =
  { kind: 'idle' } | { kind: 'reading'; done: number; total: number } | { kind: 'writing' } | { kind: 'saving' };

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  let failed: unknown = null;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length && !failed) {
        const item = items[next++];
        try {
          await fn(item);
        } catch (e) {
          failed = e;
        }
      }
    }),
  );
  if (failed) throw failed;
}

function RecapMaker({
  tripId,
  entries,
  travellers,
  onMade,
  onClose,
}: {
  tripId: string;
  entries: EntryMap;
  travellers: string;
  onMade: (r: RecapData) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const done = useMemo(() => doneCheckpoints(entries), [entries]);
  const busy = step.kind !== 'idle';

  async function make() {
    sfx.click();
    setError(null);
    try {
      const analyses: Record<string, MomentAnalysis> = await loadAnalyses(tripId);
      const todo = done.filter(({ cp }) => !analyses[cp.id]);
      let count = done.length - todo.length;
      setStep({ kind: 'reading', done: count, total: done.length });
      await pool(todo, CONCURRENCY, async ({ cp, entry }) => {
        const ctx = momentContext(cp, entry);
        let a: MomentAnalysis;
        try {
          a = await analyzeCheckpoint(tripId, cp.id, ctx);
        } catch {
          a = await analyzeCheckpoint(tripId, cp.id, ctx); // one retry
        }
        analyses[cp.id] = a;
        setStep({ kind: 'reading', done: ++count, total: done.length });
      });
      setStep({ kind: 'writing' });
      const top = rankMoments(entries, analyses).slice(0, 5);
      const summary = await summarize(tripId, summaryInput(entries, analyses, top, travellers));
      setStep({ kind: 'saving' });
      const saved = await saveRecap(tripId, buildRecap(entries, analyses, travellers, summary));
      sfx.levelUp();
      onMade(saved);
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : String(e)} What's done so far is saved, so trying again carries on from here.`,
      );
      setStep({ kind: 'idle' });
    }
  }

  return (
    <Window
      onClose={busy ? () => undefined : onClose}
      icon={<PixelEmoji emoji="🎁" size={16} />}
      title="Trip Wrapped"
      footer={
        busy ? undefined : (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Not yet
            </button>
            <ConfirmButton
              className="btn btn-go wr-make"
              confirmLabel="Let's GO!"
              disabled={done.length === 0}
              onConfirm={() => void make()}
            >
              {error ? 'Try again' : 'Make our Wrapped'}
            </ConfirmButton>
          </>
        )
      }
    >
      <div className="wr-maker">
        <div className="goal-sprites">
          <PixelSprite name="mom" scale={4} />
          <PixelSprite name="panda" scale={4} className={busy ? 'wr-hop' : ''} />
          <PixelSprite name="daughter" scale={4} />
        </div>
        {step.kind === 'idle' ? (
          <p className="wr-intro-text">
            The Panda will collect your memory fragments during the trip and create a recap for you to remember!
          </p>
        ) : (
          <div className="wr-progress" role="status">
            <p>
              {step.kind === 'reading'
                ? `The Panda is reading your journal… ${step.done}/${step.total}`
                : step.kind === 'writing'
                  ? 'The Panda is writing your ending…'
                  : 'Saving your Wrapped…'}
            </p>
            <div className="exp-bar">
              <span
                style={{
                  width: `${step.kind === 'reading' ? (step.done / Math.max(step.total, 1)) * 90 : step.kind === 'writing' ? 94 : 99}%`,
                }}
              />
            </div>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Window>
  );
}

// ------------------------------------------------------------------ entry point
export function RecapScreen({
  tripId,
  entries,
  travellers,
  recap,
  canDelete,
  onRecap,
  onClose,
}: {
  tripId: string;
  entries: EntryMap;
  travellers: string;
  recap: RecapData | null;
  canDelete: boolean;
  onRecap: (r: RecapData | null) => void;
  onClose: () => void;
}) {
  if (recap)
    return (
      <RecapPlayer
        recap={recap}
        canDelete={canDelete}
        onDelete={async () => {
          await deleteRecap(tripId);
          onRecap(null);
          onClose();
        }}
        onClose={onClose}
      />
    );
  return <RecapMaker tripId={tripId} entries={entries} travellers={travellers} onMade={onRecap} onClose={onClose} />;
}
