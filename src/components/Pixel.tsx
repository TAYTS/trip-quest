// Pixel art helpers.
// 1. PixelSprite — original hand-drawn sprites (character grids) rendered as crisp SVG.
// 2. PixelEmoji  — turns an emoji into a real pixel-art sprite: hard-edged pixels,
//    flat colours and a dark outline, rendered as SVG so it stays sharp on any screen.
import { useMemo } from 'react';

const PALETTE: Record<string, string> = {
  k: '#2b1d14', // outline / black
  w: '#ffffff',
  H: '#3b2a22', // mom's hair
  h: '#7a4a2a', // daughter's hair
  s: '#f7cfa8', // skin
  p: '#f49ac1', // blush / scrunchie
  r: '#d9473f', // red
  y: '#f6d36b', // buttons
  B: '#3a3550', // mom's trousers
  b: '#4c8ee8', // daughter's hoodie
  j: '#3d5a99', // jeans
  e: '#e6d8c3', // empty heart
  o: '#f0a030', // sun rim
  m: '#fff2a8', // moon
  g: '#5bbf4a',
  G: '#2f7d32',
  l: '#a8e278', // light green (bamboo highlight)
};

// prettier-ignore
export const SPRITES = {
  mom: [
    '...HHHHHH...',
    '..HHHHHHHH..',
    '.HHHHHHHHHH.',
    '.HHHssssHHH.',
    '.HssssssssH.',
    '.HskssssksH.',
    '.HspsssspsH.',
    '..sssrrsss..',
    '...ssssss...',
    '..rrrwwrrr..',
    '.rrrrrrrrrr.',
    'srrrryyrrrrs',
    'srrrrrrrrrrs',
    '..rrrrrrrr..',
    '..BBB..BBB..',
    '.kkkk..kkkk.',
  ],
  daughter: [
    '...hhhhhh...',
    '..hhhhhhhhpp',
    '.hhhhhhhhhhh',
    '.hsssssssshh',
    '.hskssssksh.',
    '.hspsssspsh.',
    '..sssrrsss..',
    '...ssssss...',
    '..bbbwwbbb..',
    '.bbbbbbbbbb.',
    'sbbbbbbbbbbs',
    'sbbbwwwwbbbs',
    '..bbbbbbbb..',
    '..jjj..jjj..',
    '..jjj..jjj..',
    '.wwww..wwww.',
  ],
  bamboo: [
    '.kkkkk...',
    '.klgGk...',
    '.klgGk.kk',
    '.klgGkkgk',
    'kkkkkkgk.',
    '.klgGkk..',
    '.klgGk...',
    '.klgGk...',
    'kkkkkkk..',
    '.klgGk...',
    '.klgGk...',
    '.kkkkk...',
  ],
  panda: [
    '..kk....kk..',
    '.kkkwwwwkkk.',
    '..wwwwwwww..',
    '.wwwwwwwwww.',
    '.wkkwwwwkkw.',
    '.wkwkwwkwkw.',
    '.wkkwwwwkkw.',
    '.wwwwkkwwww.',
    '..wwwppwww..',
    '...wwwwww...',
    '..kkwwwwkk..',
    '.kkkwwwwkkk.',
  ],
  sun: [
    '....oo....',
    '.o.oyyo.o.',
    '..oyyyyo..',
    '.oyyyyyyo.',
    'oyyywyyyyo',
    'oyyyyyyyyo',
    '.oyyyyyyo.',
    '..oyyyyo..',
    '.o.oyyo.o.',
    '....oo....',
  ],
  moon: [
    '...mmm....',
    '..mmm.....',
    '.mmm......',
    'mmmm......',
    'mmmm......',
    'mmmm......',
    'mmmm.....m',
    '.mmmm...mm',
    '..mmmmmmm.',
    '...mmmmm..',
  ],
  heart: [
    '.kk.kk.',
    'krrkrrk',
    'krwrrrk',
    'krrrrrk',
    '.krrrk.',
    '..krk..',
    '...k...',
  ],
  // little train for the timeline scrollbar (faces right)
  train: [
    '........................kk..',
    '.kkkkkkkkkkk..kkkkkk....kk..',
    'kbbbbbbbbbbbk.kryyrkkkkkkkk.',
    'kbyybyybyybbk.kryyrrrrrrrrrk',
    'kbyybyybyybbk.krrrrrrrrrrrrk',
    'kbbbbbbbbbbbk.krrrrrrrrrrryk',
    'kwwwwwwwwwwwkkkwwwwwwwwwwwwk',
    'kbbbbbbbbbbbk.krrrrrrrrrrrrk',
    '.kkkkkkkkkkk...kkkkkkkkkkkkk',
    '..kk.....kk.....kk..kk..kk..',
    '..kk.....kk.....kk..kk..kk..',
  ],
  heartEmpty: [
    '.kk.kk.',
    'keekeek',
    'kewwwek',
    'keeeeek',
    '.keeek.',
    '..kek..',
    '...k...',
  ],
} as const;

export type SpriteName = keyof typeof SPRITES;

/** Merges horizontal runs of the same colour into one rect so there are no seams. */
function runs(rows: readonly (string | null)[][]) {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === c) w++;
      out.push({ x, y, w, c });
      x += w;
    }
  });
  return out;
}

export function PixelSprite({
  name,
  scale = 4,
  className,
  title,
}: {
  name: SpriteName;
  scale?: number;
  className?: string;
  title?: string;
}) {
  const rows = SPRITES[name];
  const w = rows[0].length;
  const h = rows.length;
  const rects = useMemo(() => runs(rows.map((r) => [...r].map((ch) => PALETTE[ch] ?? null))), [rows]);
  return (
    <svg
      className={className}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- pixel emoji
const OUTLINE = '#2b1d14';
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const spriteCache = new Map<string, string | null>();

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * Converts an emoji into a res×res pixel grid:
 * - draws it large, crops to its real bounds, fits it inside a 1-pixel margin;
 * - each cell takes the most common colour in its block (no blended edge colours);
 * - cells less than ~half covered become transparent (no fuzzy halo);
 * - a dark 1-pixel outline is added around the shape, like a game sprite.
 */
function emojiToGrid(emoji: string, res: number): (string | null)[][] | null {
  const BIG = 160;
  const src = document.createElement('canvas');
  src.width = BIG;
  src.height = BIG;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.font = `${Math.round(BIG * 0.7)}px ${EMOJI_FONT}`;
  sctx.fillText(emoji, BIG / 2, BIG / 2);
  const sd = sctx.getImageData(0, 0, BIG, BIG).data;

  let x0 = BIG,
    y0 = BIG,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < BIG; y++) {
    for (let x = 0; x < BIG; x++) {
      if (sd[(y * BIG + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null; // no emoji font available

  const S = 8; // samples per pixel cell (each axis)
  const N = res * S;
  const inner = (res - 2) * S; // keep a 1-pixel margin for the outline
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const scale = Math.min(inner / bw, inner / bh);
  const dw = bw * scale;
  const dh = bh * scale;
  const dst = document.createElement('canvas');
  dst.width = N;
  dst.height = N;
  const dctx = dst.getContext('2d', { willReadFrequently: true });
  if (!dctx) return null;
  dctx.imageSmoothingEnabled = true;
  dctx.imageSmoothingQuality = 'high';
  dctx.drawImage(src, x0, y0, bw, bh, (N - dw) / 2, (N - dh) / 2, dw, dh);
  const d = dctx.getImageData(0, 0, N, N).data;

  const grid: (string | null)[][] = [];
  for (let cy = 0; cy < res; cy++) {
    const row: (string | null)[] = [];
    for (let cx = 0; cx < res; cx++) {
      const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
      let opaque = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const i = ((cy * S + sy) * N + cx * S + sx) * 4;
          if (d[i + 3] < 128) continue;
          opaque++;
          const r = d[i],
            g = d[i + 1],
            b = d[i + 2];
          const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
          const bk = buckets.get(key);
          if (bk) {
            bk.n++;
            bk.r += r;
            bk.g += g;
            bk.b += b;
          } else buckets.set(key, { n: 1, r, g, b });
        }
      }
      if (opaque < S * S * 0.45) {
        row.push(null);
        continue;
      }
      let best = { n: 0, r: 0, g: 0, b: 0 };
      for (const bk of buckets.values()) if (bk.n > best.n) best = bk;
      row.push(hex(best.r / best.n, best.g / best.n, best.b / best.n));
    }
    grid.push(row);
  }

  const filled = (x: number, y: number) => y >= 0 && y < res && x >= 0 && x < res && grid[y][x] !== null;
  return grid.map((row, y) =>
    row.map(
      (c, x) => c ?? (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1) ? OUTLINE : null),
    ),
  );
}

function emojiSprite(emoji: string, res: number): string | null {
  const key = `${emoji}@${res}`;
  if (spriteCache.has(key)) return spriteCache.get(key)!;
  let url: string | null = null;
  try {
    const grid = emojiToGrid(emoji, res);
    if (grid) {
      const byColour = new Map<string, string[]>();
      for (const r of runs(grid)) {
        const list = byColour.get(r.c) ?? [];
        list.push(`M${r.x} ${r.y}h${r.w}v1h-${r.w}z`);
        byColour.set(r.c, list);
      }
      const paths = [...byColour].map(([c, ds]) => `<path fill="${c}" d="${ds.join('')}"/>`).join('');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${res} ${res}" shape-rendering="crispEdges">${paths}</svg>`;
      url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
  } catch {
    url = null;
  }
  spriteCache.set(key, url);
  return url;
}

/**
 * Emoji as a crisp pixel sprite. Use sizes that are whole multiples of the grid
 * (16, 32, 48 → 16-pixel grid; 24 → 12-pixel grid) so every pixel is the same width.
 */
export function PixelEmoji({
  emoji,
  size = 32,
  className,
  label,
}: {
  emoji: string;
  size?: number;
  className?: string;
  label?: string;
}) {
  const res = size % 16 === 0 ? 16 : size % 12 === 0 ? 12 : 16;
  const src = useMemo(() => emojiSprite(emoji, res), [emoji, res]);
  if (!src) {
    return (
      <span
        className={`pixel-emoji fallback ${className ?? ''}`}
        style={{ fontSize: size * 0.8, width: size, height: size }}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {emoji}
      </span>
    );
  }
  return (
    <img
      className={`pixel-emoji ${className ?? ''}`}
      src={src}
      width={size}
      height={size}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
    />
  );
}

// ---------------------------------------------------------------- dice
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Die({ value, rolling }: { value: number; rolling?: boolean }) {
  return (
    <div className={`die ${rolling ? 'rolling' : ''}`} aria-label={`Dice shows ${value}`} role="img">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[value]?.includes(i) ? 'pip on' : 'pip'} />
      ))}
    </div>
  );
}

export function Hearts({
  value,
  onChange,
  scale = 3,
  disabled,
}: {
  value?: number;
  onChange?: (v: number) => void;
  scale?: number;
  disabled?: boolean;
}) {
  return (
    <div className="hearts" role={onChange ? 'radiogroup' : 'img'} aria-label={`Mood ${value ?? 0} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = (value ?? 0) >= n;
        const heart = <PixelSprite name={on ? 'heart' : 'heartEmpty'} scale={scale} />;
        return onChange ? (
          <button
            key={n}
            type="button"
            className="heart-btn"
            aria-label={`${n} hearts`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(value === n ? 0 : n)}
          >
            {heart}
          </button>
        ) : (
          <span key={n}>{heart}</span>
        );
      })}
    </div>
  );
}
