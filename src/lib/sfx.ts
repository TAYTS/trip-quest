// Tiny retro sound effects with the Web Audio API (no audio files needed).
let ctx: AudioContext | null = null;
let enabled = true;

export const setSoundEnabled = (on: boolean) => {
  enabled = on;
};

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'square', gain = 0.05) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur);
}

function play(notes: [number, number, number][], wave: OscillatorType = 'square') {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    notes.forEach(([f, s, d]) => tone(f, s, d, wave));
  } catch {
    /* audio unavailable */
  }
}

export const sfx = {
  click: () => play([[660, 0, 0.05]]),
  roll: () =>
    play([
      [300, 0, 0.05],
      [380, 0.06, 0.05],
      [460, 0.12, 0.05],
      [540, 0.18, 0.05],
      [620, 0.24, 0.05],
    ]),
  coin: () =>
    play([
      [988, 0, 0.08],
      [1319, 0.08, 0.2],
    ]),
  hop: () =>
    play([
      [440, 0, 0.06],
      [660, 0.06, 0.08],
    ]),
  // Clearing a checkpoint: a quick low-to-high "ta-da".
  clear: () =>
    play([
      [392, 0, 0.07],
      [523, 0.07, 0.07],
      [659, 0.14, 0.07],
      [784, 0.21, 0.28],
    ]),
  // Skipping a checkpoint: two soft notes going down.
  skip: () =>
    play(
      [
        [330, 0, 0.1],
        [247, 0.1, 0.2],
      ],
      'triangle',
    ),
  // Saving an edit to a journal entry: a soft double blip.
  save: () =>
    play(
      [
        [784, 0, 0.05],
        [1047, 0.06, 0.09],
      ],
      'triangle',
    ),
  // Level up: a longer fanfare than a normal clear.
  levelUp: () =>
    play([
      [523, 0, 0.1],
      [659, 0.1, 0.1],
      [784, 0.2, 0.1],
      [1047, 0.3, 0.1],
      [784, 0.42, 0.08],
      [1047, 0.5, 0.4],
    ]),
  badge: () =>
    play([
      [784, 0, 0.1],
      [988, 0.1, 0.1],
      [1175, 0.2, 0.2],
    ]),
};
