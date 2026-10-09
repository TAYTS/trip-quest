// The checkpoint "quest window": pick what you did, roll the chance die, and
// write the journal entry (mood, note, photo). Locked checkpoints are view-only.
import { useRef, useState } from 'react';
import { CHECKPOINTS, SLOT_LABEL, dayOf, getOptions, findOption, type Checkpoint } from '../data/itinerary';
import { MAX_PHOTOS, drawChance, findCard, type Entry, type EntryStatus } from '../data/game';
import type { Lock } from '../data/locks';
import type { Repo } from '../lib/repo';
import { fmtDate } from '../lib/time';
import { sfx } from '../lib/sfx';
import { Window } from './Window';
import { Die, Hearts, PixelEmoji, PixelSprite } from './Pixel';
import { ConfirmButton } from './ConfirmButton';
import { PhotoCarousel } from './PhotoCarousel';
import { GuideBox } from './GuideBox';
import { GUIDE_ENABLED } from '../lib/guide';

interface Props {
  checkpoint: Checkpoint;
  entry?: Entry;
  repo: Repo;
  author: string;
  lock: Lock;
  canUndo: boolean;
  onSave: (entry: Entry) => Promise<void>;
  onClear: (checkpointId: string) => Promise<void>;
  onClose: () => void;
}

export function QuestModal({ checkpoint: cp, entry, repo, author, lock, canUndo, onSave, onClear, onClose }: Props) {
  const day = dayOf(cp.day);
  const options = getOptions(cp);
  const locked = lock.kind !== 'open';
  const [choiceId, setChoiceId] = useState(entry?.choiceId ?? options[0].id);
  const [customTitle, setCustomTitle] = useState(entry?.customTitle ?? '');
  const [mood, setMood] = useState<number | undefined>(entry?.mood);
  const [note, setNote] = useState(entry?.note ?? '');
  const [dice, setDice] = useState<number | undefined>(entry?.dice);
  const [chanceId, setChanceId] = useState<string | undefined>(entry?.chanceId);
  const [coins, setCoins] = useState(entry?.coins ?? 0);
  const [rolling, setRolling] = useState(false);
  const [rollFace, setRollFace] = useState(entry?.dice ?? 1);
  const [photos, setPhotos] = useState<string[]>(entry?.photos ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const chosen = findOption(cp, choiceId) ?? options[0];
  const card = findCard(chanceId);

  function roll() {
    if (dice || rolling || locked) return;
    sfx.roll();
    setRolling(true);
    const result = drawChance();
    let n = 0;
    const timer = window.setInterval(() => {
      setRollFace(1 + Math.floor(Math.random() * 6));
      if (++n >= 8) {
        window.clearInterval(timer);
        setRollFace(result.dice);
        setDice(result.dice);
        setChanceId(result.card.id);
        setCoins(result.coins);
        setRolling(false);
        sfx.coin();
      }
    }, 80);
  }

  async function pickPhotos(files: FileList | null) {
    // The picker can return several files at once; keep only as many as still fit.
    const picked = Array.from(files ?? []).slice(0, MAX_PHOTOS - photos.length);
    if (picked.length === 0) return;
    setError(null);
    setBusy(picked.length > 1 ? 'Saving photos…' : 'Saving photo…');
    try {
      const saved: string[] = [];
      for (const file of picked) saved.push(await repo.savePhoto(cp.id, file));
      setPhotos((prev) => [...prev, ...saved].slice(0, MAX_PHOTOS));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(status: EntryStatus) {
    if (locked) return;
    if (choiceId === 'custom' && !customTitle.trim() && status === 'done') {
      setError('Write what you did in the "Did something else" box.');
      return;
    }
    setError(null);
    setBusy('Saving…');
    try {
      await onSave({
        checkpointId: cp.id,
        choiceId,
        customTitle: choiceId === 'custom' ? customTitle.trim() : undefined,
        status,
        mood: mood || undefined,
        note: note.trim() || undefined,
        dice,
        chanceId,
        coins,
        photos: photos.length ? photos : undefined,
        author,
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  const speech = entry
    ? `You cleared this one${entry.author ? ` (written by ${entry.author})` : ''}. Edit anything you like!`
    : lock.kind === 'order'
      ? "That's further down the road! Here's a peek at the plan."
      : lock.kind === 'date'
        ? "This day hasn't arrived yet. Here's a peek at the plan."
        : `${day.title}! Here's the plan for the ${SLOT_LABEL[cp.slot].en.toLowerCase()}.`;

  return (
    <Window
      onClose={onClose}
      icon={<PixelEmoji emoji={SLOT_LABEL[cp.slot].icon} size={16} />}
      title={
        <>
          Day {cp.day} · {SLOT_LABEL[cp.slot].en}
        </>
      }
      footer={
        locked ? (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            {entry && canUndo && (
              <ConfirmButton
                className="btn btn-ghost"
                disabled={!!busy}
                confirmLabel="Sure? Undo"
                onConfirm={() => void onClear(cp.id)}
              >
                Undo
              </ConfirmButton>
            )}
            {!entry && (
              <button type="button" className="btn btn-grey" disabled={!!busy} onClick={() => submit('skipped')}>
                Skip
              </button>
            )}
            <button
              type="button"
              className="btn btn-go"
              disabled={!!busy}
              onClick={() => submit(entry?.status ?? 'done')}
            >
              {busy ?? (entry ? 'Save ✓' : 'Clear! ✓')}
            </button>
          </>
        )
      }
    >
      <div className="quest-meta">
        <span className="chip" style={{ background: day.color }}>
          {day.weekday} {fmtDate(day.date)}
        </span>
        <span className="chip chip-light">{day.city}</span>
      </div>

      <div className="npc">
        <PixelSprite name="panda" scale={4} title="Panda guide" />
        <div className="speech">
          <b>Panda Guide</b>
          <p>{speech}</p>
        </div>
      </div>

      {locked && (
        <p className="lock-banner">
          <PixelEmoji emoji="🔒" size={16} /> {lock.message}
        </p>
      )}

      <h3 className="section-title">{locked ? 'The plan' : 'Choose your path'}</h3>
      <div className="options" role="radiogroup" aria-label="What did you do?">
        {options.map((op) => (
          <button
            key={op.id}
            type="button"
            role="radio"
            aria-checked={choiceId === op.id}
            className={`option ${choiceId === op.id ? 'selected' : ''} kind-${op.kind}`}
            onClick={() => {
              sfx.click();
              setChoiceId(op.id);
            }}
          >
            <PixelEmoji emoji={op.icon} size={32} />
            <span className="option-text">
              <span className="option-title">{op.title}</span>
              {op.place && <span className="option-place">{op.place}</span>}
            </span>
            {op.kind === 'main' && <span className="tag tag-main">PLAN</span>}
            {op.kind === 'optional' && <span className="tag tag-opt">OPTIONAL</span>}
          </button>
        ))}
      </div>

      {choiceId === 'custom' && !locked ? (
        <input
          className="field"
          id={`custom-${cp.id}`}
          placeholder="What did you do instead?"
          value={customTitle}
          maxLength={80}
          onChange={(e) => setCustomTitle(e.target.value)}
        />
      ) : (
        <div className="info-box">
          <p>{chosen.desc}</p>
          {chosen.transport && (
            <p className="transport">
              <b>Getting there:</b> {chosen.transport}
            </p>
          )}
        </div>
      )}

      {GUIDE_ENABLED && repo.tripId && !locked && !entry && (
        <GuideBox
          tripId={repo.tripId}
          context={{
            day: day.day,
            date: day.date,
            weekday: day.weekday,
            city: day.city,
            dayTitle: day.title,
            slot: SLOT_LABEL[cp.slot].en,
            planTitle: chosen.title,
            place: chosen.place,
            desc: chosen.desc,
            dayPlan: CHECKPOINTS.filter((c) => c.day === cp.day)
              .map((c) => `${SLOT_LABEL[c.slot].en}: ${c.options[0].title}`)
              .join('. '),
          }}
          onAddToNotes={
            locked ? undefined : (t) => setNote((n) => (n ? `${n}\n\n` : '') + `Panda tip:\n${t}`.slice(0, 4000))
          }
        />
      )}

      {!locked && (
        <>
          <h3 className="section-title">Chance card</h3>
          <div className="chance">
            <button
              type="button"
              className="dice-btn"
              onClick={roll}
              disabled={!!dice || rolling}
              aria-label={dice ? `Rolled ${dice}` : 'Roll the dice'}
            >
              <Die value={rollFace} rolling={rolling} />
            </button>
            {card ? (
              <div className={`card card-${card.kind}`}>
                <span className="card-kind">
                  {card.kind === 'ladder' ? 'LUCKY BREAK' : card.kind === 'snake' ? 'OOPS' : 'SIDE QUEST'}
                </span>
                <span className="card-text">
                  <PixelEmoji emoji={card.icon} size={16} /> {card.text}
                </span>
                <span className="card-coins">+{coins} coins</span>
              </div>
            ) : (
              <p className="hint">
                {rolling ? 'Rolling…' : 'Tap the die once per checkpoint for coins and a chance card.'}
              </p>
            )}
          </div>

          <h3 className="section-title">Journal</h3>
          <label className="label">How was it?</label>
          <Hearts
            value={mood}
            onChange={(v) => {
              sfx.click();
              setMood(v || undefined);
            }}
          />
          <label className="label" htmlFor={`note-${cp.id}`}>
            Notes · writing as {author}
          </label>
          <textarea
            id={`note-${cp.id}`}
            className="field"
            rows={4}
            maxLength={4000}
            placeholder="What happened? What did you eat? Funniest moment?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          <div className="photo-row">
            <PhotoCarousel
              repo={repo}
              photos={photos}
              busy={!!busy}
              onAdd={() => fileRef.current?.click()}
              onRemove={(i) => setPhotos((prev) => prev.filter((_, k) => k !== i))}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => pickPhotos(e.target.files)}
            />
          </div>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Window>
  );
}
