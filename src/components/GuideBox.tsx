// "Panda Wishes": food / place tips from Gemini for the checkpoint being viewed.
// Each question costs one wish. The whole party shares a few wishes a day, shown as stars.
import { useEffect, useState, type ReactNode } from 'react';
import { askGuide, getWishes, type GuideContext, type GuideSource, type Wishes } from '../lib/guide';
import { sfx } from '../lib/sfx';
import { PixelSprite } from './Pixel';

const QUICK = ['Where to eat nearby?', 'A rainy-day backup?', 'What to order here?', 'Something quick and cheap?'];

interface Props {
  tripId: string;
  context: GuideContext;
  /** Lets the player paste the answer into their journal note. */
  onAddToNotes?: (text: string) => void;
}

function WishStars({ wishes }: { wishes: Wishes }) {
  const left = Math.max(0, wishes.limit - wishes.used);
  return (
    <p className="wishes" aria-label={`${left} of ${wishes.limit} wishes left today`}>
      <span className="wish-stars" aria-hidden="true">
        {Array.from({ length: wishes.limit }, (_, i) => (
          <span key={i} className={i < left ? 'wish-star' : 'wish-star off'}>
            <PixelSprite name="bamboo" scale={2} />
          </span>
        ))}
      </span>
      <span className="wish-count">
        {left} of {wishes.limit} wishes left
      </span>
    </p>
  );
}

/** Wraps each run of Chinese text in its own span, so it can be sized to match the pixel font around it. */
function renderMixed(text: string) {
  return text.split(/([\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]+)/).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="cjk">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** Lines starting with "-", "*" or "•" become one tidy bullet list; any other lines stay as paragraphs. */
function renderAnswer(text: string) {
  const blocks: ReactNode[] = [];
  let items: string[] = [];
  const flush = () => {
    if (!items.length) return;
    const list = items;
    items = [];
    blocks.push(
      <ul key={`ul${blocks.length}`} className="guide-list">
        {list.map((it, i) => (
          <li key={i}>{renderMixed(it)}</li>
        ))}
      </ul>,
    );
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(?:[-*•]|–|—)\s+(.*)$/.exec(line);
    if (m) items.push(m[1]);
    else {
      flush();
      blocks.push(<p key={`p${blocks.length}`}>{renderMixed(line)}</p>);
    }
  }
  flush();
  return blocks;
}

export function GuideBox({ tripId, context, onAddToNotes }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<GuideSource[]>([]);
  const [grounded, setGrounded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wishes, setWishes] = useState<Wishes | null>(null);
  const [added, setAdded] = useState(false);

  const out = wishes !== null && wishes.used >= wishes.limit;

  // Show the counter as soon as the box opens. If it can't be read, the box still works.
  useEffect(() => {
    let alive = true;
    getWishes(tripId)
      .then((w) => alive && setWishes(w))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tripId]);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading || out) return;
    sfx.click();
    setLoading(true);
    setError(null);
    setAdded(false);
    try {
      const res = await askGuide(tripId, text, context);
      setAnswer(res.answer);
      setSources(res.sources);
      setGrounded(res.grounded);
      setWishes({ used: res.used, limit: res.limit });
      sfx.coin();
    } catch (e) {
      setAnswer(null);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      // A failed question gives the wish back, so read the counter again.
      getWishes(tripId)
        .then(setWishes)
        .catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="guide" aria-label="Panda Wishes">
      <div className="guide-head">
        <span className={loading ? 'panda-buddy busy' : 'panda-buddy'} aria-hidden="true">
          <PixelSprite name="panda" scale={3} />
        </span>
        <div className="guide-head-text">
          <h3 className="section-title">Panda Wishes</h3>
          {wishes && <WishStars wishes={wishes} />}
        </div>
      </div>
      {out && (
        <p className="hint">
          The Panda is resting. Your party has used all {wishes.limit} wishes today. They refill at midnight China time.
        </p>
      )}
      <div className="guide-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" className="chip chip-light" disabled={loading || out} onClick={() => ask(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="guide-form"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          className="field"
          value={question}
          maxLength={500}
          disabled={out}
          placeholder="Wish for a food or place tip for this stop…"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="btn btn-go" disabled={loading || out || !question.trim()}>
          {loading ? '…' : 'Wish'}
        </button>
      </form>
      {loading && (
        <div className="guide-loading" role="status">
          <span className="thinking-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>The Panda is checking the web… this can take up to a minute.</span>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <div className="guide-answer">
          {renderAnswer(answer)}
          {sources.length > 0 && (
            <div className="guide-sources">
              <p className="guide-sources-label">Sources</p>
              <ul>
                {sources.map((src) => (
                  <li key={src.url}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer">
                      {src.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="hint">
            {grounded || sources.length > 0
              ? 'AI can be wrong.'
              : 'Not checked against the web, so places may be wrong.'}{' '}
            Check opening hours and the location on Dianping or Amap before you go.
            {wishes && wishes.used >= wishes.limit && ' That was your last wish today!'}
          </p>
          {onAddToNotes && (
            <button
              type="button"
              className="btn btn-grey"
              disabled={added}
              onClick={() => {
                onAddToNotes(answer);
                setAdded(true);
              }}
            >
              {added ? 'Added ✓' : 'Add to notes'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
