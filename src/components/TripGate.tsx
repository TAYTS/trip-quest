// Shown instead of the game when VITE_REQUIRE_TRIP=true and there is no active cloud trip yet.
// You must create a trip or join one with a code before anything can be played or saved.
import { useState } from 'react';
import { isCloudConfigured } from '../lib/supabase';
import { PixelSprite } from './Pixel';

export function TripGate({
  error,
  hasLocalJournal,
  onCreate,
  onJoin,
}: {
  error: string | null;
  /** True when this browser still holds a journal from before, so we can offer to copy it. */
  hasLocalJournal: boolean;
  onCreate: (name: string, copyLocal: boolean) => Promise<void>;
  onJoin: (code: string) => Promise<void>;
}) {
  const [tripName, setTripName] = useState('Chongqing → Chengdu');
  const [copyLocal, setCopyLocal] = useState(hasLocalJournal);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(error);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
    // On success the app swaps this screen out, so there is nothing to reset.
  };

  return (
    <div className="app theme-morning">
      <div className="gate narrow">
        <PixelSprite name="panda" scale={6} />
        <h1 className="logo">
          TRIP<span>QUEST</span>
        </h1>

        {!isCloudConfigured ? (
          <p className="banner">
            VITE_REQUIRE_TRIP is on, but the Supabase keys are missing. Add VITE_SUPABASE_URL and
            VITE_SUPABASE_PUBLISHABLE_KEY to .env.local and restart, or set VITE_REQUIRE_TRIP=false.
          </p>
        ) : (
          <>
            <p className="hint">
              Create a shared trip, or join one with a code, to start. Your journal is saved to it.
            </p>
            {msg && (
              <p className="banner" role="alert">
                {msg}
              </p>
            )}
            <div className="sync-box">
              <b>Start a shared trip</b>
              <input
                className="field"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                maxLength={60}
                aria-label="Trip name"
              />
              {hasLocalJournal && (
                <label className="check">
                  <input type="checkbox" checked={copyLocal} onChange={(e) => setCopyLocal(e.target.checked)} /> Copy
                  the journal saved in this browser into it
                </label>
              )}
              <button
                type="button"
                className="btn btn-go"
                disabled={busy || !tripName.trim()}
                onClick={() => run(() => onCreate(tripName.trim(), copyLocal))}
              >
                {busy ? 'Working…' : 'Create trip'}
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
                aria-label="Trip code"
              />
              <button
                type="button"
                className="btn btn-blue"
                disabled={busy || code.length < 6}
                onClick={() => run(() => onJoin(code))}
              >
                Join trip
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
