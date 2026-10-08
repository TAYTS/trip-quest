// "Ask the Panda": food / place suggestions from Gemini, for the checkpoint being viewed.
import { useState } from 'react';
import { askGuide, type GuideContext, type GuideSource } from '../lib/guide';
import { sfx } from '../lib/sfx';

const QUICK = ['Where to eat nearby?', 'A rainy-day backup?', 'What to order here?', 'Something quick and cheap?'];

interface Props {
  tripId: string;
  context: GuideContext;
  /** Lets the player paste the answer into their journal note. */
  onAddToNotes?: (text: string) => void;
}

export function GuideBox({ tripId, context, onAddToNotes }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<GuideSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [added, setAdded] = useState(false);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    sfx.click();
    setLoading(true);
    setError(null);
    setAdded(false);
    try {
      const res = await askGuide(tripId, text, context);
      setAnswer(res.answer);
      setSources(res.sources);
      setLeft(Math.max(0, res.limit - res.used));
    } catch (e) {
      setAnswer(null);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="guide" aria-label="Ask the Panda">
      <h3 className="section-title">Ask the Panda</h3>
      <div className="guide-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" className="chip chip-light" disabled={loading} onClick={() => ask(q)}>
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
          placeholder="Ask about food or places for this stop…"
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="btn btn-go" disabled={loading || !question.trim()}>
          {loading ? '…' : 'Ask'}
        </button>
      </form>
      {loading && <p className="hint">The Panda is thinking…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {answer && (
        <div className="guide-answer">
          <p>{answer}</p>
          {sources.length > 0 && (
            <p className="guide-sources">
              Sources:{' '}
              {sources.map((src, i) => (
                <span key={src.url}>
                  {i > 0 && ' · '}
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.title}
                  </a>
                </span>
              ))}
            </p>
          )}
          <p className="hint">
            AI can be wrong. Check opening hours and the location on Dianping or Amap before you go.
            {left !== null && ` ${left} questions left today.`}
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
