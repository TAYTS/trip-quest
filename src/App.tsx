import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHECKPOINTS, SLOT_LABEL, dayOf, type Checkpoint } from './data/itinerary';
import { EXP_PER_LEVEL, computeStats, earnedBadges, entryExp, type Entry, type EntryMap } from './data/game';
import { UNLOCK_ALL, lastClearedIndex, lockFor } from './data/locks';
import type { Repo } from './lib/repo';
import { createLocalRepo, readLocalEntries, replaceLocalEntries } from './lib/localRepo';
import { REQUIRE_TRIP, isCloudConfigured } from './lib/supabase';
import {
  createCloudRepo,
  createTrip,
  forgetTrip,
  getTrip,
  joinTrip,
  savedTripId,
  uploadLocalJournal,
} from './lib/cloudRepo';
import { authorName, loadPrefs, savePrefs, type Prefs } from './lib/prefs';
import { tripTiming } from './lib/time';
import { sfx, setSoundEnabled } from './lib/sfx';
import { DayLog, DayStrip, Timeline } from './components/Timeline';
import { QuestModal } from './components/QuestModal';
import { JournalModal, SettingsModal, StampsModal } from './components/Panels';
import { TripGate } from './components/TripGate';
import { Window } from './components/Window';
import { PixelEmoji, PixelSprite } from './components/Pixel';
import { RecapScreen } from './components/Recap';
import { GUIDE_ENABLED } from './lib/guide';
import { loadRecap, subscribeRecap } from './lib/recapApi';
import type { RecapData } from './lib/recap';

type Modal =
  | { type: 'quest'; cp: Checkpoint }
  | { type: 'journal' }
  | { type: 'stamps' }
  | { type: 'settings' }
  | { type: 'goal' }
  | { type: 'wrapped' }
  | null;

interface Toast {
  id: number;
  icon: string;
  text: string;
}

export default function App() {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [entries, setEntries] = useState<EntryMap>({});
  const [modal, setModal] = useState<Modal>(null);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  // With REQUIRE_TRIP on, true while we wait for the player to create or join a trip.
  const [needsTrip, setNeedsTrip] = useState(false);
  const [timing, setTiming] = useState(() => tripTiming());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [focusDay, setFocusDay] = useState<number | null>(null);
  // Trip Wrapped: once made, the journal is read-only (enforced in the database too).
  const [recapState, setRecapState] = useState<{ tripId: string; data: RecapData | null } | null>(null);
  const toastId = useRef(0);

  const stats = useMemo(() => computeStats(entries), [entries]);
  const badges = useMemo(() => earnedBadges(entries), [entries]);

  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    savePrefs(p);
  };
  useEffect(() => setSoundEnabled(prefs.sound), [prefs.sound]);

  // Re-check the date every minute so days unlock at midnight China time.
  useEffect(() => {
    const t = window.setInterval(() => setTiming(tripTiming()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const toast = useCallback((icon: string, text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, icon, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // ------------------------------------------------------------ boot: pick repo
  const activate = useCallback(async (r: Repo) => {
    setEntries(await r.loadEntries());
    setRepo(r);
  }, []);

  useEffect(() => {
    (async () => {
      const tripId = isCloudConfigured ? savedTripId() : null;
      if (tripId) {
        try {
          const trip = await getTrip(tripId);
          if (trip) {
            await activate(createCloudRepo(trip));
            return;
          }
          forgetTrip();
        } catch (e) {
          setBootError(
            `Couldn't reach the shared trip (${e instanceof Error ? e.message : e}).` +
              (REQUIRE_TRIP ? ' Check your connection and reload.' : " Showing this phone's journal instead."),
          );
        }
      }
      if (REQUIRE_TRIP) {
        setNeedsTrip(true); // no browser-only fallback: wait for create / join
        return;
      }
      await activate(createLocalRepo());
    })();
  }, [activate]);

  // live updates from the other phone
  useEffect(() => {
    if (!repo) return;
    return repo.subscribe((change) => {
      setEntries((m) => {
        const next = { ...m };
        if ('deleted' in change) delete next[change.deleted];
        else next[change.checkpointId] = change;
        return next;
      });
    });
  }, [repo]);

  // Trip Wrapped: load it for this trip, and hear about it when the other phone makes it.
  const recapTripId = GUIDE_ENABLED && repo?.kind === 'cloud' ? repo.tripId : undefined;
  useEffect(() => {
    if (!recapTripId) return;
    let alive = true;
    loadRecap(recapTripId)
      .then((data) => alive && setRecapState({ tripId: recapTripId, data }))
      .catch(() => undefined);
    const stop = subscribeRecap(recapTripId, (data) => setRecapState({ tripId: recapTripId, data }));
    return () => {
      alive = false;
      stop();
    };
  }, [recapTripId]);
  const recap = recapState && recapState.tripId === recapTripId ? recapState.data : null;
  const setRecap = (data: RecapData | null) => recapTripId && setRecapState({ tripId: recapTripId, data });

  // ------------------------------------------------------------ actions
  async function saveEntry(entry: Entry) {
    if (!repo) return;
    const before = stats;
    const beforeBadges = new Set(badges.map((b) => b.id));
    const wasNew = !entries[entry.checkpointId];
    await repo.saveEntry(entry);
    const next = { ...entries, [entry.checkpointId]: entry };
    setEntries(next);
    setModal(null);
    setSelectedDay(null);

    const after = computeStats(next);
    if (wasNew) {
      if (entry.status === 'done') sfx.clear();
      else sfx.skip();
      toast(
        entry.status === 'done' ? '⭐' : '💤',
        `+${entryExp(entry)} EXP${entry.coins ? ` · +${entry.coins} coins` : ''}`,
      );
    } else {
      sfx.save();
      toast('💾', 'Journal updated');
    }
    if (after.level > before.level) {
      setTimeout(() => sfx.levelUp(), 300);
      toast('🆙', `LEVEL UP! Lv.${after.level} ${after.levelTitle}`);
    }
    for (const b of earnedBadges(next)) {
      if (!beforeBadges.has(b.id)) {
        setTimeout(() => sfx.badge(), 600);
        toast(b.icon, `New stamp: ${b.name}`);
      }
    }
    if (after.position >= CHECKPOINTS.length && before.position < CHECKPOINTS.length) {
      setTimeout(() => setModal({ type: 'goal' }), 1600);
    }
  }

  async function clearEntry(id: string) {
    if (!repo) return;
    await repo.deleteEntry(id);
    setEntries((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
    setModal(null);
    toast('↩️', 'Checkpoint undone');
  }

  async function importEntries(m: EntryMap) {
    if (!repo) return;
    if (repo.kind === 'cloud') await uploadLocalJournal(repo, m);
    else for (const e of Object.values(m)) await repo.saveEntry(e);
    setEntries(await repo.loadEntries());
  }

  async function startTrip(name: string, copyLocal: boolean) {
    const trip = await createTrip(name, authorName(prefs));
    const r = createCloudRepo(trip);
    if (copyLocal) await uploadLocalJournal(r, readLocalEntries());
    await activate(r);
    setNeedsTrip(false);
    setBootError(null);
    toast('🔗', `Trip created! Code ${trip.join_code}`);
  }

  async function enterTrip(code: string) {
    const trip = await joinTrip(code, authorName(prefs));
    await activate(createCloudRepo(trip));
    setNeedsTrip(false);
    setBootError(null);
    toast('🤝', `Joined "${trip.name}"`);
  }

  async function leaveTrip() {
    forgetTrip();
    if (REQUIRE_TRIP) {
      // Back to the "create or join" screen; nothing from the old trip stays on screen.
      setModal(null);
      setEntries({});
      setRepo(null);
      setNeedsTrip(true);
      return;
    }
    await activate(createLocalRepo());
    toast('📱', 'Back to this-device mode');
  }

  // ------------------------------------------------------------ render
  if (!repo && needsTrip) {
    return (
      <TripGate
        error={bootError}
        hasLocalJournal={Object.keys(readLocalEntries()).length > 0}
        onCreate={startTrip}
        onJoin={enterTrip}
      />
    );
  }
  if (!repo) {
    return (
      <div className="app theme-morning">
        <div className="loading">
          <PixelSprite name="panda" scale={6} />
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  const current = CHECKPOINTS[stats.position];
  const finished = !current;
  const theme = finished ? 'goal' : current.slot;
  const currentDay = current?.day ?? 10;
  const shownDay = selectedDay ?? currentDay;
  const currentLock = current ? lockFor(current, entries, timing.today, prefs.testMode) : null;
  const openQuest = (cp: Checkpoint) => setModal({ type: 'quest', cp });
  const openCurrent = () => {
    sfx.click();
    setModal(current ? { type: 'quest', cp: current } : { type: 'goal' });
  };
  const undoIdx = lastClearedIndex(entries);
  // The Wrapped button shows after the trip (or the last checkpoint), or any time in Test mode.
  const showWrapped =
    !!recapTripId &&
    (!!recap || ((finished || timing.phase === 'after' || prefs.testMode || UNLOCK_ALL) && stats.done > 0));
  const travellers = `${prefs.momName} & ${prefs.daughterName}`;

  return (
    <div className={`app theme-${theme}`}>
      <header className="hud narrow">
        <div className="logo-row">
          <h1 className="logo">
            TRIP<span>QUEST</span>
          </h1>
          <span className="phase">
            {timing.phase === 'before' && `Departs in ${timing.daysUntil} day${timing.daysUntil === 1 ? '' : 's'}`}
            {timing.phase === 'during' && `Today is Day ${timing.todayDay}`}
            {timing.phase === 'after' && 'Trip memories'}
          </span>
        </div>
        <div className="hud-panel">
          <div className="lv">
            <span className="lv-num">Lv.{stats.level}</span>
            <span className="lv-title">{stats.levelTitle}</span>
            <div className="exp-bar" aria-label={`EXP ${stats.expIntoLevel} of ${EXP_PER_LEVEL}`}>
              <span style={{ width: `${(stats.expIntoLevel / EXP_PER_LEVEL) * 100}%` }} />
              <em>
                EXP {stats.expIntoLevel}/{EXP_PER_LEVEL}
              </em>
            </div>
          </div>
          <div className="hud-stats">
            <span className="pill">
              <PixelEmoji emoji="🪙" size={16} /> {stats.coins}
            </span>
            <span className="pill">
              <PixelEmoji emoji="🏁" size={16} /> {stats.cleared}/{CHECKPOINTS.length}
            </span>
          </div>
        </div>
        <nav className="hud-buttons">
          <button type="button" className="btn btn-hud" onClick={() => setModal({ type: 'journal' })}>
            <PixelEmoji emoji="📖" size={16} /> Journal
          </button>
          <button type="button" className="btn btn-hud" onClick={() => setModal({ type: 'stamps' })}>
            <PixelEmoji emoji="🏅" size={16} /> Stamps {badges.length}
          </button>
          {showWrapped && (
            <button
              type="button"
              className="btn btn-hud btn-wrapped"
              onClick={() => {
                sfx.click();
                setModal({ type: 'wrapped' });
              }}
            >
              <PixelEmoji emoji="🎁" size={16} /> Wrapped
            </button>
          )}
          <button
            type="button"
            className="btn btn-hud icon-only"
            onClick={() => setModal({ type: 'settings' })}
            aria-label="Settings"
          >
            <PixelEmoji emoji="⚙️" size={16} />
          </button>
        </nav>
        {bootError && <p className="banner">{bootError}</p>}
        {UNLOCK_ALL ? (
          <p className="banner small">Dev unlock on (VITE_UNLOCK_ALL): every checkpoint is open.</p>
        ) : (
          prefs.testMode && <p className="banner small">Test mode on: dates ignored.</p>
        )}
      </header>

      <main>
        <Timeline
          entries={entries}
          position={stats.position}
          today={timing.today}
          todayDay={timing.todayDay}
          testMode={prefs.testMode}
          focusDay={focusDay}
          onOpen={openQuest}
          onGoal={() => setModal({ type: 'goal' })}
        />
        <div className="narrow">
          <DayStrip
            selected={shownDay}
            currentDay={currentDay}
            todayDay={timing.todayDay}
            onSelect={(d) => {
              sfx.click();
              setSelectedDay(d);
              setFocusDay(null);
              requestAnimationFrame(() => setFocusDay(d));
            }}
          />
          <DayLog day={shownDay} entries={entries} today={timing.today} testMode={prefs.testMode} onOpen={openQuest} />
        </div>
      </main>

      <footer className="cta">
        <button
          type="button"
          className={`btn btn-cta ${currentLock?.kind === 'date' ? 'waiting' : ''}`}
          onClick={openCurrent}
        >
          {finished ? (
            <span className="cta-label">Trip clear! Open the trophy</span>
          ) : (
            <>
              <span className="cta-label">
                {currentLock?.kind === 'date' ? 'UP NEXT' : '▶ NEXT'} · DAY {current.day}{' '}
                {SLOT_LABEL[current.slot].en.toUpperCase()}
              </span>
              <span className="cta-sub">
                {currentLock?.kind === 'date'
                  ? currentLock.message
                  : `${current.options[0].title} · ${dayOf(current.day).city}`}
              </span>
            </>
          )}
        </button>
      </footer>

      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <PixelEmoji emoji={t.icon} size={24} /> {t.text}
          </div>
        ))}
      </div>

      {modal?.type === 'quest' && (
        <QuestModal
          key={modal.cp.id}
          checkpoint={modal.cp}
          entry={entries[modal.cp.id]}
          repo={repo}
          author={authorName(prefs)}
          lock={lockFor(modal.cp, entries, timing.today, prefs.testMode)}
          canUndo={UNLOCK_ALL || CHECKPOINTS.findIndex((c) => c.id === modal.cp.id) === undoIdx}
          frozen={!!recap}
          onSave={saveEntry}
          onClear={clearEntry}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'journal' && (
        <JournalModal
          entries={entries}
          repo={repo}
          onClose={() => setModal(null)}
          onOpen={(cp) => setModal({ type: 'quest', cp })}
          onImport={importEntries}
        />
      )}
      {modal?.type === 'stamps' && <StampsModal entries={entries} onClose={() => setModal(null)} />}
      {modal?.type === 'settings' && (
        <SettingsModal
          prefs={prefs}
          setPrefs={setPrefs}
          repo={repo}
          onCreateTrip={startTrip}
          onJoinTrip={enterTrip}
          onLeaveTrip={() => void leaveTrip()}
          onReset={async () => {
            replaceLocalEntries({});
            setEntries({});
            toast('🧹', 'Local journal erased');
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'wrapped' && recapTripId && (
        <RecapScreen
          tripId={recapTripId}
          entries={entries}
          travellers={travellers}
          recap={recap}
          canDelete={prefs.testMode || UNLOCK_ALL}
          onRecap={setRecap}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'goal' && (
        <Window
          onClose={() => setModal(null)}
          icon={<PixelEmoji emoji="🏆" size={16} />}
          title="Trip Complete!"
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setModal({ type: 'journal' })}>
                Open journal
              </button>
              {showWrapped && (
                <button type="button" className="btn btn-go" onClick={() => setModal({ type: 'wrapped' })}>
                  🎁 Trip Wrapped
                </button>
              )}
            </>
          }
        >
          <div className="goal">
            <div className="goal-sprites">
              <PixelSprite name="mom" scale={5} />
              <PixelSprite name="panda" scale={5} />
              <PixelSprite name="daughter" scale={5} />
            </div>
            {finished ? (
              <p>
                {prefs.momName} & {prefs.daughterName} cleared all {CHECKPOINTS.length} checkpoints!
              </p>
            ) : (
              <p>{CHECKPOINTS.length - stats.cleared} checkpoints to go. Keep walking!</p>
            )}
            <ul className="goal-stats">
              <li>
                Lv.{stats.level} {stats.levelTitle}
              </li>
              <li>{stats.coins} coins</li>
              <li>{badges.length} stamps</li>
              <li>{stats.done} checkpoints done</li>
            </ul>
          </div>
        </Window>
      )}
    </div>
  );
}
