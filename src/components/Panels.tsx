// Journal book, stamp collection, and settings / sync windows.
import { useEffect, useState } from 'react';
import { CHECKPOINTS, DAYS, SLOT_LABEL, findOption, type Checkpoint } from '../data/itinerary';
import { BADGES, type Entry, type EntryMap } from '../data/game';
import type { Repo } from '../lib/repo';
import type { Prefs } from '../lib/prefs';
import { REQUIRE_TRIP, isCloudConfigured } from '../lib/supabase';
import { fmtDate } from '../lib/time';
import { Window } from './Window';
import { Hearts, PixelEmoji } from './Pixel';
import { ConfirmButton } from './ConfirmButton';

// ---------------------------------------------------------------- journal
/** First photo as a small thumbnail, with a count badge when there are more. */
function Thumb({ repo, photos }: { repo: Repo; photos: string[] }) {
  const [url, setUrl] = useState<string>();
  const first = photos[0];
  useEffect(() => {
    let alive = true;
    repo
      .photoUrl(first)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [repo, first]);
  return (
    <span className="journal-thumb">
      {url ? (
        <img className="journal-photo" src={url} alt="" loading="lazy" />
      ) : (
        <span className="journal-photo placeholder">
          <PixelEmoji emoji="📷" size={16} />
        </span>
      )}
      {photos.length > 1 && <span className="journal-thumb-count">×{photos.length}</span>}
    </span>
  );
}

export function JournalModal({
  entries,
  repo,
  onOpen,
  onClose,
  onImport,
}: {
  entries: EntryMap;
  repo: Repo;
  onOpen: (cp: Checkpoint) => void;
  onClose: () => void;
  onImport: (m: EntryMap) => Promise<void>;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const written = Object.keys(entries).length;

  function exportJson() {
    const blob = new Blob(
      [JSON.stringify({ app: 'trip-quest', version: 1, exportedAt: new Date().toISOString(), entries }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'trip-quest-journal.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importJson(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const m = (parsed.entries ?? parsed) as EntryMap;
      if (typeof m !== 'object' || Array.isArray(m)) throw new Error('Not a Trip Quest journal file.');
      await onImport(m);
      setMsg(`Imported ${Object.keys(m).length} entries.`);
    } catch (e) {
      setMsg(`Import failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <Window
      wide
      onClose={onClose}
      icon={<PixelEmoji emoji="📖" size={16} />}
      title="Travel Journal"
      footer={
        <>
          <label className="btn btn-ghost">
            Import
            <input type="file" accept="application/json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
          </label>
          <button type="button" className="btn btn-blue" onClick={exportJson} disabled={!written}>
            Export backup
          </button>
        </>
      }
    >
      <p className="hint">
        {written} of {CHECKPOINTS.length} checkpoints written. Tap any line to edit.
      </p>
      {msg && <p className="hint">{msg}</p>}
      {DAYS.map((d) => {
        const cps = CHECKPOINTS.filter((c) => c.day === d.day);
        return (
          <section key={d.day} className="journal-day">
            <h3 className="journal-day-title" style={{ borderColor: d.color }}>
              <span className="chip" style={{ background: d.color }}>
                D{d.day}
              </span>{' '}
              {d.weekday} {fmtDate(d.date)} · {d.title}
            </h3>
            {cps.map((cp) => (
              <JournalRow key={cp.id} cp={cp} entry={entries[cp.id]} repo={repo} onOpen={onOpen} />
            ))}
          </section>
        );
      })}
    </Window>
  );
}

function JournalRow({
  cp,
  entry,
  repo,
  onOpen,
}: {
  cp: Checkpoint;
  entry?: Entry;
  repo: Repo;
  onOpen: (cp: Checkpoint) => void;
}) {
  const op = entry ? findOption(cp, entry.choiceId) : undefined;
  const title = entry?.choiceId === 'custom' ? entry.customTitle : op?.title;
  return (
    <button type="button" className={`journal-row ${entry ? '' : 'empty'}`} onClick={() => onOpen(cp)}>
      <span className="journal-slot">
        <PixelEmoji emoji={SLOT_LABEL[cp.slot].icon} size={16} />
      </span>
      <span className="journal-main">
        {entry ? (
          <>
            <span className="journal-title">
              {entry.status === 'skipped' && <span className="stamp skip inline">SKIP</span>}
              {op && <PixelEmoji emoji={op.icon} size={16} />} {title}
            </span>
            {entry.mood ? <Hearts value={entry.mood} scale={2} /> : null}
            {entry.note && <span className="journal-note">{entry.note}</span>}
            <span className="journal-meta">
              {entry.author && <>by {entry.author}</>}
              {entry.coins ? <> · {entry.coins} coins</> : null}
            </span>
          </>
        ) : (
          <span className="journal-title muted">{SLOT_LABEL[cp.slot].en}: not written yet</span>
        )}
      </span>
      {entry?.photos?.length ? <Thumb repo={repo} photos={entry.photos} /> : null}
    </button>
  );
}

// ---------------------------------------------------------------- stamps
export function StampsModal({ entries, onClose }: { entries: EntryMap; onClose: () => void }) {
  return (
    <Window onClose={onClose} icon={<PixelEmoji emoji="🏅" size={16} />} title="Stamp Book">
      <div className="stamps">
        {BADGES.map((b) => {
          const on = b.earned(entries);
          return (
            <div key={b.id} className={`stamp-card ${on ? 'earned' : ''}`}>
              <PixelEmoji emoji={b.icon} size={48} className={on ? '' : 'locked'} />
              <b>{b.name}</b>
              <span>{on ? 'Collected!' : b.hint}</span>
            </div>
          );
        })}
      </div>
    </Window>
  );
}

// ---------------------------------------------------------------- settings / sync
export function SettingsModal({
  prefs,
  setPrefs,
  repo,
  onCreateTrip,
  onJoinTrip,
  onLeaveTrip,
  onReset,
  onClose,
}: {
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  repo: Repo;
  onCreateTrip: (name: string, copyLocal: boolean) => Promise<void>;
  onJoinTrip: (code: string) => Promise<void>;
  onLeaveTrip: () => void;
  onReset: () => Promise<void>;
  onClose: () => void;
}) {
  const [tripName, setTripName] = useState('Chongqing → Chengdu');
  const [copyLocal, setCopyLocal] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window onClose={onClose} icon={<PixelEmoji emoji="⚙️" size={16} />} title="Settings">
      <h3 className="section-title">Players</h3>
      <div className="two-col">
        <label className="label">
          Mom's name
          <input
            className="field"
            value={prefs.momName}
            maxLength={20}
            onChange={(e) => setPrefs({ ...prefs, momName: e.target.value })}
          />
        </label>
        <label className="label">
          Daughter's name
          <input
            className="field"
            value={prefs.daughterName}
            maxLength={20}
            onChange={(e) => setPrefs({ ...prefs, daughterName: e.target.value })}
          />
        </label>
      </div>
      <label className="label">Who is holding this phone?</label>
      <div className="segmented">
        {(['mom', 'daughter'] as const).map((w) => (
          <button
            key={w}
            type="button"
            className={prefs.writingAs === w ? 'on' : ''}
            onClick={() => setPrefs({ ...prefs, writingAs: w })}
          >
            {w === 'mom' ? prefs.momName : prefs.daughterName}
          </button>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.sound}
          onChange={(e) => setPrefs({ ...prefs, sound: e.target.checked })}
        />{' '}
        Retro sound effects
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.testMode}
          onChange={(e) => setPrefs({ ...prefs, testMode: e.target.checked })}
        />{' '}
        Test mode: ignore dates
      </label>
      <p className="hint">
        Days normally unlock on their date (China time). Turn on Test mode to try the game before the trip. Checkpoints
        still unlock in order.
      </p>

      <h3 className="section-title">Save & sync</h3>
      <p className="hint">
        Now saving to: <b>{repo.label}</b>
      </p>

      {!isCloudConfigured && (
        <p className="hint">
          Cloud sync is off in this build. Add the Supabase keys when deploying (see README) so both phones share one
          journal.
        </p>
      )}

      {isCloudConfigured && repo.kind === 'local' && (
        <>
          <div className="sync-box">
            <b>Start a shared trip</b>
            <input className="field" value={tripName} onChange={(e) => setTripName(e.target.value)} maxLength={60} />
            <label className="check">
              <input type="checkbox" checked={copyLocal} onChange={(e) => setCopyLocal(e.target.checked)} /> Copy this
              phone's journal into it
            </label>
            <button
              type="button"
              className="btn btn-go"
              disabled={busy}
              onClick={() => run(() => onCreateTrip(tripName, copyLocal))}
            >
              Create trip
            </button>
          </div>
          <div className="sync-box">
            <b>Join with a code</b>
            <input
              className="field code"
              placeholder="ABC123"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button
              type="button"
              className="btn btn-blue"
              disabled={busy || code.length < 6}
              onClick={() => run(() => onJoinTrip(code))}
            >
              Join trip
            </button>
          </div>
        </>
      )}

      {repo.kind === 'cloud' && (
        <div className="sync-box">
          <b>Share this code with the other phone:</b>
          <span className="big-code">{repo.label.split('code ')[1]}</span>
          <button type="button" className="btn btn-ghost" onClick={onLeaveTrip}>
            {REQUIRE_TRIP ? 'Leave trip' : 'Leave trip (back to this-device mode)'}
          </button>
        </div>
      )}

      {repo.kind === 'local' && (
        <ConfirmButton
          className="btn btn-danger"
          disabled={busy}
          confirmLabel="Tap again to erase everything"
          onConfirm={() => void run(onReset)}
        >
          Erase local journal
        </ConfirmButton>
      )}
      {msg && (
        <p className="error" role="alert">
          {msg}
        </p>
      )}
    </Window>
  );
}
