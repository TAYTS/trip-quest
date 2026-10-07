// Game rules: chance cards, EXP/levels, badges. Pure functions of the journal entries.
import { CHECKPOINTS, findOption, type Tag } from './itinerary';

export type EntryStatus = 'done' | 'skipped';

export interface Entry {
  checkpointId: string;
  choiceId: string;
  customTitle?: string;
  status: EntryStatus;
  mood?: number; // 1–5 hearts
  note?: string;
  dice?: number; // 1–6
  chanceId?: string;
  coins: number;
  photos?: string[]; // up to MAX_PHOTOS. local: data URLs · cloud: storage paths
  author?: string;
  updatedAt: string;
}

/** Most photos allowed per checkpoint. */
export const MAX_PHOTOS = 3;

export type EntryMap = Record<string, Entry>;

// ---------------------------------------------------------------- chance cards
export interface ChanceCard {
  id: string;
  kind: 'ladder' | 'snake' | 'quest';
  icon: string;
  text: string;
  bonus: number;
}

export const CHANCE_CARDS: ChanceCard[] = [
  { id: 'l-window', kind: 'ladder', icon: '🪟', text: 'Window seat with a river view!', bonus: 3 },
  { id: 'l-danhonggao', kind: 'ladder', icon: '🥞', text: 'Found a 蛋烘糕 (egg-cake) stall with no queue.', bonus: 3 },
  {
    id: 'l-bingfen',
    kind: 'ladder',
    icon: '🍧',
    text: 'A local auntie points you to the best 冰粉 (ice jelly) in town.',
    bonus: 2,
  },
  { id: 'l-light', kind: 'ladder', icon: '📸', text: 'Perfect golden light for a mother-daughter photo.', bonus: 3 },
  { id: 'l-taxi', kind: 'ladder', icon: '🚕', text: 'Taxi arrives in one minute flat.', bonus: 2 },
  { id: 'l-sample', kind: 'ladder', icon: '🍪', text: 'Free sample at the pastry shop!', bonus: 2 },
  { id: 's-rain', kind: 'snake', icon: '🌧️', text: 'Light rain! Duck into a dessert shop until it passes.', bonus: -1 },
  {
    id: 's-stairs',
    kind: 'snake',
    icon: '🪜',
    text: 'Stairs everywhere — welcome to the 8D city. Take a break.',
    bonus: -1,
  },
  {
    id: 's-sprouts',
    kind: 'snake',
    icon: '🌱',
    text: '豆芽 (bean sprouts) snuck into the bowl! Say 不要豆芽 next time.',
    bonus: -1,
  },
  { id: 's-battery', kind: 'snake', icon: '🔋', text: 'Phone battery at 5%. Rent a power bank.', bonus: -1 },
  {
    id: 'q-newfood',
    kind: 'quest',
    icon: '🥢',
    text: 'Side quest: try one food neither of you has eaten before.',
    bonus: 2,
  },
  { id: 'q-mompick', kind: 'quest', icon: '👩', text: 'Side quest: Mom picks the next snack, no vetoes.', bonus: 2 },
  { id: 'q-panda', kind: 'quest', icon: '🐼', text: 'Side quest: selfie with any panda statue or sign.', bonus: 2 },
  {
    id: 'q-xiexie',
    kind: 'quest',
    icon: '🙏',
    text: "Side quest: say 'xièxie' (thank you) to three people today.",
    bonus: 1,
  },
  {
    id: 'q-postcard',
    kind: 'quest',
    icon: '💌',
    text: 'Side quest: write one line to your future selves in the note.',
    bonus: 2,
  },
];

export const findCard = (id?: string) => CHANCE_CARDS.find((c) => c.id === id);

export function drawChance(): { dice: number; card: ChanceCard; coins: number } {
  const dice = 1 + Math.floor(Math.random() * 6);
  const card = CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
  return { dice, card, coins: Math.max(0, dice + card.bonus) };
}

// ---------------------------------------------------------------- EXP & levels
export function entryExp(e: Entry): number {
  if (e.status === 'skipped') return 2;
  let exp = 10;
  if (e.note && e.note.trim().length > 0) exp += 5;
  if (e.photos?.length) exp += 5;
  if (e.mood) exp += 2;
  return exp;
}

export const EXP_PER_LEVEL = 40;

export const LEVEL_TITLES = [
  'Newbie Traveller',
  'Map Reader',
  'Snack Scout',
  'Metro Master',
  'Dessert Hunter',
  'Panda Friend',
  'River Wanderer',
  'Hanfu Star',
  'Spice Dodger',
  'Sichuan Sage',
  'Legendary Duo',
];

export interface Stats {
  exp: number;
  level: number;
  levelTitle: string;
  expIntoLevel: number;
  coins: number;
  cleared: number; // done + skipped
  done: number;
  position: number; // index into CHECKPOINTS of the first open checkpoint (30 = finished)
}

export function computeStats(entries: EntryMap): Stats {
  let exp = 0,
    coins = 0,
    done = 0,
    cleared = 0;
  for (const e of Object.values(entries)) {
    exp += entryExp(e);
    coins += e.coins || 0;
    cleared += 1;
    if (e.status === 'done') done += 1;
  }
  const level = Math.floor(exp / EXP_PER_LEVEL) + 1;
  const position = CHECKPOINTS.findIndex((cp) => !entries[cp.id]);
  return {
    exp,
    coins,
    done,
    cleared,
    level,
    levelTitle: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    expIntoLevel: exp % EXP_PER_LEVEL,
    position: position === -1 ? CHECKPOINTS.length : position,
  };
}

// ---------------------------------------------------------------- badges (stamps)
export interface Badge {
  id: string;
  icon: string;
  name: string;
  hint: string;
  earned: (entries: EntryMap) => boolean;
}

function chosenTags(entries: EntryMap): Tag[][] {
  return CHECKPOINTS.flatMap((cp) => {
    const e = entries[cp.id];
    if (!e || e.status !== 'done') return [];
    const op = findOption(cp, e.choiceId);
    return op ? [op.tags] : [];
  });
}
const countTag = (entries: EntryMap, tag: Tag) => chosenTags(entries).filter((t) => t.includes(tag)).length;
const choseDone = (entries: EntryMap, cpId: string, optionId: string) =>
  entries[cpId]?.status === 'done' && entries[cpId]?.choiceId === optionId;

export const BADGES: Badge[] = [
  {
    id: 'first-step',
    icon: '👣',
    name: 'First Step',
    hint: 'Clear your first checkpoint',
    earned: (m) => Object.keys(m).length >= 1,
  },
  {
    id: 'panda-pal',
    icon: '🐼',
    name: 'Panda Pal',
    hint: 'Visit the Panda Base',
    earned: (m) => choseDone(m, 'd6-morning', 'panda-base'),
  },
  {
    id: 'river-night',
    icon: '⛵',
    name: 'Two-River Night',
    hint: 'Take both night cruises',
    earned: (m) => choseDone(m, 'd3-night', 'two-rivers') && choseDone(m, 'd9-night', 'jinjiang'),
  },
  {
    id: 'face-changer',
    icon: '🎭',
    name: 'Face Changer',
    hint: 'Watch the face-changing opera',
    earned: (m) => choseDone(m, 'd7-night', 'face-change'),
  },
  {
    id: 'hanfu-hero',
    icon: '👘',
    name: 'Hanfu Duo',
    hint: 'Do the hanfu photoshoot',
    earned: (m) => choseDone(m, 'd8-morning', 'hanfu'),
  },
  {
    id: 'sweet-tooth',
    icon: '🍰',
    name: 'Sweet Tooth',
    hint: 'Clear 5 dessert checkpoints',
    earned: (m) => countTag(m, 'sweet') >= 5,
  },
  {
    id: 'shopaholic',
    icon: '🛍️',
    name: 'Shopaholic',
    hint: 'Clear 4 shopping checkpoints',
    earned: (m) => countTag(m, 'shop') >= 4,
  },
  {
    id: 'zen',
    icon: '💆',
    name: 'Zen Mode',
    hint: 'Rest or relax 4 times',
    earned: (m) => countTag(m, 'relax') + countTag(m, 'rest') >= 4,
  },
  {
    id: 'lucky-six',
    icon: '🎲',
    name: 'Lucky Six',
    hint: 'Roll a 6',
    earned: (m) => Object.values(m).some((e) => e.dice === 6),
  },
  {
    id: 'journalist',
    icon: '📖',
    name: 'Journalist',
    hint: 'Write 15 notes',
    earned: (m) => Object.values(m).filter((e) => e.note?.trim()).length >= 15,
  },
  {
    id: 'photographer',
    icon: '📷',
    name: 'Photographer',
    hint: 'Add 10 photos',
    earned: (m) => Object.values(m).reduce((n, e) => n + (e.photos?.length ?? 0), 0) >= 10,
  },
  {
    id: 'trip-clear',
    icon: '🏆',
    name: 'Trip Clear!',
    hint: 'Clear all 30 checkpoints',
    earned: (m) => CHECKPOINTS.every((cp) => m[cp.id]),
  },
];

export const earnedBadges = (entries: EntryMap) => BADGES.filter((b) => b.earned(entries));
