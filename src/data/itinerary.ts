// Trip plan, mirrored from the Notion page "重庆·成都 10日母女游" (updated 2026-10-06).
// All text is English. Chinese appears only for place names: in `place` (shown under
// the title, handy for taxi drivers) and in brackets after a place's first mention.
// Each day has three checkpoints (morning / afternoon / night). "Rest" and
// "Did something else" are added to every checkpoint by getOptions().

export type Slot = 'morning' | 'afternoon' | 'night';
export type City = 'Chongqing' | 'Chengdu' | 'On the move';

export type Tag =
  | 'travel'
  | 'sweet'
  | 'food'
  | 'shop'
  | 'photo'
  | 'relax'
  | 'rest'
  | 'night-view'
  | 'cruise'
  | 'panda'
  | 'show'
  | 'history'
  | 'walk'
  | 'home';

export interface PlanOption {
  id: string;
  icon: string; // emoji, rendered as a pixel sprite
  title: string;
  place?: string; // Chinese place name, if this option is a place
  desc: string;
  transport?: string;
  kind: 'main' | 'optional' | 'rest' | 'custom';
  tags: Tag[];
}

export interface Checkpoint {
  id: string; // e.g. "d3-morning"
  day: number;
  slot: Slot;
  options: PlanOption[]; // plan options (without the automatic rest/custom ones)
}

export interface Day {
  day: number;
  date: string; // ISO date (China time)
  weekday: string;
  city: City;
  title: string;
  color: string; // day colour band
}

export const TRIP = {
  name: 'Chongqing → Chengdu',
  start: '2026-10-24',
  end: '2026-11-02',
  timezone: 'Asia/Shanghai',
};

export const DAYS: Day[] = [
  {
    day: 1,
    date: '2026-10-24',
    weekday: 'Sat',
    city: 'Chongqing',
    title: 'Arrive in the Mountain City',
    color: '#e2574c',
  },
  { day: 2, date: '2026-10-25', weekday: 'Sun', city: 'Chongqing', title: 'Free & easy day', color: '#f08a3c' },
  {
    day: 3,
    date: '2026-10-26',
    weekday: 'Mon',
    city: 'Chongqing',
    title: 'Indoor forest & river night',
    color: '#e0a92e',
  },
  {
    day: 4,
    date: '2026-10-27',
    weekday: 'Tue',
    city: 'Chongqing',
    title: 'Cable car across the Yangtze',
    color: '#7fb33a',
  },
  {
    day: 5,
    date: '2026-10-28',
    weekday: 'Wed',
    city: 'On the move',
    title: 'Bullet train to Chengdu',
    color: '#3fb8af',
  },
  { day: 6, date: '2026-10-29', weekday: 'Thu', city: 'Chengdu', title: 'Panda morning', color: '#4f86c6' },
  { day: 7, date: '2026-10-30', weekday: 'Fri', city: 'Chengdu', title: 'Slow-life day', color: '#7b6fd0' },
  { day: 8, date: '2026-10-31', weekday: 'Sat', city: 'Chengdu', title: 'Hanfu & pastries', color: '#c26dbc' },
  { day: 9, date: '2026-11-01', weekday: 'Sun', city: 'Chengdu', title: 'Shopping finale', color: '#e06c9f' },
  { day: 10, date: '2026-11-02', weekday: 'Mon', city: 'On the move', title: 'Homeward', color: '#8d6e63' },
];

const o = (
  id: string,
  icon: string,
  title: string,
  desc: string,
  opts: { place?: string; transport?: string; kind?: PlanOption['kind']; tags?: Tag[] } = {},
): PlanOption => ({
  id,
  icon,
  title,
  desc,
  place: opts.place,
  transport: opts.transport,
  kind: opts.kind ?? 'main',
  tags: opts.tags ?? [],
});

export const CHECKPOINTS: Checkpoint[] = [
  // ---------------- Day 1 · Sat 10/24 · Chongqing ----------------
  {
    id: 'd1-morning',
    day: 1,
    slot: 'morning',
    options: [
      o(
        'taxi-hotel',
        '✈️',
        'Land at the airport, taxi to the hotel',
        'Land at Chongqing Jiangbei Airport (重庆江北国际机场). The hotel is IntercityHotel Jiefangbei at 107 Minquan Road (民权路107号), beside Jiaochangkou (较场口) metro Exit 10B. Check-in from 15:00; leave bags at the front desk if you arrive early.',
        {
          place: '重庆解放碑步行街城际酒店',
          transport: 'Taxi ~22 km, ~30 min (easiest with luggage).',
          tags: ['travel'],
        },
      ),
      o('metro-hotel', '🚇', 'Metro to the hotel', 'Cheaper, but there are stairs and a transfer with luggage.', {
        place: '较场口站',
        transport: 'Line 3 → change at Lianglukou (两路口) → Line 1 → Jiaochangkou (较场口), ~45 min.',
        kind: 'optional',
        tags: ['travel'],
      }),
    ],
  },
  {
    id: 'd1-afternoon',
    day: 1,
    slot: 'afternoon',
    options: [
      o(
        'jfb-tangyuan',
        '🍡',
        'Jiefangbei stroll & 山城小汤圆',
        'Slow walk around Jiefangbei. Afternoon tea is 山城小汤圆 (sweet rice balls) instead of coffee.',
        { place: '解放碑', transport: 'Walk ~5 min from the hotel.', tags: ['sweet', 'walk'] },
      ),
    ],
  },
  {
    id: 'd1-night',
    day: 1,
    slot: 'night',
    options: [
      o(
        'qiansimen',
        '🌉',
        'Hongyadong lights from Qiansimen Bridge',
        'See the whole lit-up Hongyadong (洪崖洞) from the middle of the bridge; no need to climb inside. Saturday night is busy, so skip it if tired. The Day 3 cruise covers this view too.',
        {
          place: '千厮门大桥',
          transport:
            'Walk ~10 min to Hongyadong 11F on Cangbai Road (沧白路), then a short flight of stairs down to the bridge walkway. Back: walk ~15 min or taxi.',
          tags: ['night-view', 'walk'],
        },
      ),
    ],
  },

  // ---------------- Day 2 · Sun 10/25 · Chongqing ----------------
  {
    id: 'd2-morning',
    day: 2,
    slot: 'morning',
    options: [
      o(
        'sleep-in-2',
        '😴',
        'Sleep in',
        'First full day, so no alarms. Sunday crowds are everywhere, so there are no queue-heavy plans today.',
        { tags: ['rest'] },
      ),
      o(
        'eling',
        '🏭',
        'Eling No.2 Factory',
        'An old printing factory turned creative park. Free, very photogenic, with dessert shops to rest in.',
        {
          place: '鹅岭二厂',
          transport: 'Taxi ~5 km, ~5 min. Avoid Line 1 to Eling station (鹅岭站): it is an 800 m uphill walk.',
          kind: 'optional',
          tags: ['photo'],
        },
      ),
    ],
  },
  {
    id: 'd2-afternoon',
    day: 2,
    slot: 'afternoon',
    options: [
      o(
        'liziba-gyq',
        '🚝',
        'Liziba monorail → Guanyinqiao',
        'Walk downhill from Eling No.2 Factory to Liziba station (15–20 min; the reverse is all uphill). Take Exit 2 and cross the road for the viewing platform. Then Guanyinqiao (观音桥) for shopping and the food street.',
        {
          place: '李子坝站 → 观音桥',
          transport:
            'Line 2 one stop to Niujiaotuo (牛角沱) → Line 3 two stops to Guanyinqiao, or taxi. Back: taxi ~6 km.',
          tags: ['shop', 'photo'],
        },
      ),
      o(
        'raffles',
        '🏙️',
        'Raffles City & the crystal skybridge',
        'The quiet version: mall browsing and the two-rivers view.',
        {
          place: '重庆来福士',
          transport: 'Line 1 from Jiaochangkou two stops to Chaotianmen (朝天门), or taxi.',
          kind: 'optional',
          tags: ['shop'],
        },
      ),
    ],
  },
  {
    id: 'd2-night',
    day: 2,
    slot: 'night',
    options: [
      o(
        'bayi',
        '🍢',
        'Bayi Snack Street',
        'Snack crawl near the hotel. Ask for 不要辣，不要豆芽 (no chilli, no bean sprouts).',
        { place: '八一好吃街', transport: 'Walk a few minutes from the hotel.', tags: ['food', 'sweet'] },
      ),
    ],
  },

  // ---------------- Day 3 · Mon 10/26 · Chongqing ----------------
  {
    id: 'd3-morning',
    day: 3,
    slot: 'morning',
    options: [
      o(
        'the-ring',
        '🌳',
        'The Ring mall & indoor forest',
        'A 42 m, 7-floor indoor rainforest garden inside a shopping mall. Rain-proof, and quiet on a Monday morning.',
        {
          place: '光环购物公园',
          transport:
            'Taxi ~15 km, ~15 min, ~¥40–60. Metro ~45 min: Line 1 → Xiaoshizi (小什字) → Line 6 → Ranjiaba (冉家坝) → Line 5 → Chongguang (重光).',
          tags: ['shop', 'photo'],
        },
      ),
      o(
        'ciqikou',
        '🏮',
        'Ciqikou Ancient Town',
        'Old riverside town. Buy 陈麻花 (fried dough twists) in original or rock-sugar flavour as gifts.',
        {
          place: '磁器口古镇',
          transport: 'Line 1 direct from Jiaochangkou, ~24 min. Exit 1, ~300 m walk.',
          kind: 'optional',
          tags: ['history', 'sweet'],
        },
      ),
    ],
  },
  {
    id: 'd3-afternoon',
    day: 3,
    slot: 'afternoon',
    options: [
      o(
        'massage-cq',
        '💆',
        'Foot & shoulder massage',
        'Pick a highly rated shop with posted prices on the Dianping app. Confirm the treatment and price before starting.',
        { tags: ['relax'] },
      ),
    ],
  },
  {
    id: 'd3-night',
    day: 3,
    slot: 'night',
    options: [
      o(
        'two-rivers',
        '⛴️',
        'Two Rivers night cruise',
        'About 45–50 minutes sitting down, with the whole city lit up. ~¥138–168 (check the booking page). Arrive 30 min early.',
        {
          place: '洪崖洞码头',
          transport:
            'Classic cruise: walk ~15 min to Hongyadong (洪崖洞) and take the scenic lift to B1 for boarding. Other cruises leave from Chaotianmen (朝天门) docks 7 and 9: Line 1 two stops, or taxi.',
          tags: ['night-view', 'cruise'],
        },
      ),
    ],
  },

  // ---------------- Day 4 · Tue 10/27 · Chongqing ----------------
  {
    id: 'd4-morning',
    day: 4,
    slot: 'morning',
    options: [
      o(
        'cablecar',
        '🚡',
        'Yangtze cable car → Longmenhao Old Street',
        'First, book an SF Express pickup to send the big suitcase to the Chengdu hotel. Cable car ¥30 one way, ~4 min. Walk the old street from top to bottom.',
        {
          place: '长江索道 → 龙门浩老街',
          transport:
            'Walk ~15 min to the north station on Xinhua Road (新华路), or Line 1 one stop to Xiaoshizi (小什字) Exit 5. From the south station it is 200–300 m to the old street.',
          tags: ['photo'],
        },
      ),
    ],
  },
  {
    id: 'd4-afternoon',
    day: 4,
    slot: 'afternoon',
    options: [
      o(
        'jiangtuan',
        '🐟',
        '清蒸江团 lunch, taxi back',
        'Lunch in the old street. 清蒸江团 (steamed Yangtze river fish) is mild, not spicy. Then rest at the hotel.',
        {
          transport: 'Taxi from Nanbin Road (南滨路) at the bottom of the street, so no climbing back up.',
          tags: ['food'],
        },
      ),
    ],
  },
  {
    id: 'd4-night',
    day: 4,
    slot: 'night',
    options: [
      o(
        'souvenirs-cq',
        '🎁',
        'Souvenir run at Jiefangbei',
        '陈麻花 (fried dough twists), 怪味胡豆 (strange-flavour broad beans), 合川桃片 (peach slices). Pack the overnight bag: moving day tomorrow!',
        { place: '解放碑', transport: 'Walk ~5 min.', tags: ['shop', 'sweet'] },
      ),
    ],
  },

  // ---------------- Day 5 · Wed 10/28 · Chongqing → Chengdu ----------------
  {
    id: 'd5-morning',
    day: 5,
    slot: 'morning',
    options: [
      o(
        'bayi-breakfast',
        '🥣',
        'Snack-street breakfast & check-out',
        '山城小汤圆 (sweet rice balls), or 银丝面 (silver-thread noodles) at Hengming (ask for 不要豆芽, no bean sprouts). Check out by 12:00.',
        { place: '八一好吃街', transport: 'Walk a few minutes.', tags: ['food', 'sweet'] },
      ),
    ],
  },
  {
    id: 'd5-afternoon',
    day: 5,
    slot: 'afternoon',
    options: [
      o(
        'train-spb',
        '🚄',
        'Bullet train Shapingba → Chengdu East',
        'Train ~1–1.5 h. Book seats D+F and tick the quiet carriage. Chengdu hotel check-in is from 14:00; check the shipped suitcase has arrived.',
        {
          place: '沙坪坝站 → 成都东站',
          transport:
            'Line 1 direct from Jiaochangkou to Shapingba (~20 min). In Chengdu: Line 2 from Chengdu East (成都东客站) to Chunxi Road (春熙路), 6 stops, ~15 min, then ~280 m to IntercityHotel Taikoo Li (成都太古里春熙路步行街城际酒店).',
          tags: ['travel'],
        },
      ),
      o(
        'train-other',
        '🚕',
        'Taxi to Chongqing West or North station',
        'Only if your ticket departs from Chongqing West or Chongqing North. Not Chongqing Station (重庆站, Caiyuanba): it has been closed for rebuilding since 2022.',
        { place: '重庆西站 / 重庆北站', kind: 'optional', tags: ['travel'] },
      ),
    ],
  },
  {
    id: 'd5-night',
    day: 5,
    slot: 'night',
    options: [
      o(
        'chunxi',
        '🐼',
        'Chunxi Road, IFS climbing panda, Taikoo Li',
        'All walkable. Dinner: 钟水饺 (mildly sweet dumplings) or a clear-broth restaurant in the mall.',
        { place: '春熙路 · IFS · 太古里', transport: 'Walk ~10 min from the hotel.', tags: ['shop', 'walk'] },
      ),
    ],
  },

  // ---------------- Day 6 · Thu 10/29 · Chengdu ----------------
  {
    id: 'd6-morning',
    day: 6,
    slot: 'morning',
    options: [
      o(
        'panda-base',
        '🐼',
        'Giant Panda Base',
        'Be there for the 7:30 opening, when the pandas are most active. Visitors aged 60+ enter free with ID; the daughter books on the official WeChat account (from 10/15). The ¥30 shuttle is worth it: in at the west gate, out at the south gate (downhill).',
        {
          place: '成都大熊猫繁育研究基地',
          transport: 'Taxi ~14 km, ~20 min, ~¥40. Back: taxi from the south gate.',
          tags: ['panda'],
        },
      ),
    ],
  },
  {
    id: 'd6-afternoon',
    day: 6,
    slot: 'afternoon',
    options: [o('nap-6', '😴', 'Nap at the hotel', 'Early start, so a proper 1–2 hour nap.', { tags: ['rest'] })],
  },
  {
    id: 'd6-night',
    day: 6,
    slot: 'night',
    options: [
      o(
        'kuanzhai',
        '🏯',
        'Kuanzhai Alley & snacks',
        'Dessert crawl: 三大炮 (sticky rice balls), 红糖糍粑 (brown-sugar rice cakes), 冰粉 (ice jelly). Jing Alley (井巷子) is the quieter lane.',
        {
          place: '宽窄巷子',
          transport:
            "Taxi ~5 km, ~16 min, or Line 3 → Second People's Hospital (市二医院) → Line 4 → Kuanzhai Alley Exit B. Back: Line 2 from Tonghuimen (通惠门).",
          tags: ['sweet', 'walk'],
        },
      ),
    ],
  },

  // ---------------- Day 7 · Fri 10/30 · Chengdu ----------------
  {
    id: 'd7-morning',
    day: 7,
    slot: 'morning',
    options: [
      o(
        'peoples-park',
        '🚣',
        "People's Park & rowing boats",
        "Chengdu's living room: free entry, flat paths, rowing boats and the famous matchmaking corner.",
        {
          place: '人民公园',
          transport: "Line 2 two stops from Chunxi Road to People's Park.",
          tags: ['relax', 'walk'],
        },
      ),
      o(
        'dujiangyan',
        '🏞️',
        'Dujiangyan day trip',
        'World Heritage irrigation works. Lunch: mild 白果炖鸡 (ginkgo chicken soup). Buy train tickets to Lidui Park (离堆公园), not Dujiangyan Station.',
        {
          place: '都江堰景区',
          transport: 'Line 2 to Xipu (犀浦) → intercity train to Lidui Park, ~1.5 h door to door.',
          kind: 'optional',
          tags: ['history'],
        },
      ),
    ],
  },
  {
    id: 'd7-afternoon',
    day: 7,
    slot: 'afternoon',
    options: [
      o('massage-cd', '💆', 'Mother-daughter massage', 'Foot or shoulder massage together. Confirm the price first.', {
        tags: ['relax'],
      }),
    ],
  },
  {
    id: 'd7-night',
    day: 7,
    slot: 'night',
    options: [
      o(
        'face-change',
        '🎭',
        'Sichuan opera & face-changing show',
        'Starts 20:00, ~90 min: face-changing, fire-breathing, shadow puppets. Seats roughly ¥110 / 140 / 190; check the booking page.',
        {
          place: '蜀风雅韵（文化公园）',
          transport:
            'Line 2 → Chengdu University of TCM (中医大省医院) → Line 5 → Qingyang Palace (青羊宫), ~23 min, or taxi ~5 km. Taxi back.',
          tags: ['show'],
        },
      ),
    ],
  },

  // ---------------- Day 8 · Sat 10/31 · Chengdu ----------------
  {
    id: 'd8-morning',
    day: 8,
    slot: 'morning',
    options: [
      o(
        'hanfu',
        '👘',
        'Mother-daughter hanfu photoshoot',
        'Hanfu is traditional Chinese dress; the package includes hair, make-up and photos. Book on Dianping or Meituan. Confirm the total price and the number of edited photos before paying, so there are no surprise add-ons.',
        { transport: 'Taxi to the studio you booked (Wenshufang area, ~10 min).', tags: ['photo'] },
      ),
      o(
        'sanxingdui',
        '🏺',
        'Sanxingdui Museum',
        'Indoors, with mysterious bronze masks. Book on the official WeChat account 1–7 days ahead (tickets released at 20:00), ¥72.',
        {
          place: '三星堆博物馆',
          transport: 'Line 2 → Chengdu East → train to Guanghan North (广汉北), ~18 min → shuttle ~15 min.',
          kind: 'optional',
          tags: ['history'],
        },
      ),
    ],
  },
  {
    id: 'd8-afternoon',
    day: 8,
    slot: 'afternoon',
    options: [
      o(
        'pastry',
        '🍰',
        'Palace pastry shop at Wenshufang',
        '拿破仑 (Napoleon cake), 桃酥 (walnut cookies), 蛋黄酥 (egg-yolk pastries); Wensuyuan (闻酥园) next door to compare. The Wenshu Monastery (文殊院) courtyard is free and flat (optional).',
        {
          place: '宫廷糕点铺（文殊院总店）',
          transport: 'Taxi ~3 km, ~10 min, or Line 2 → Tianfu Square (天府广场) → Line 1 → Wenshu Monastery Exit K.',
          tags: ['sweet'],
        },
      ),
    ],
  },
  {
    id: 'd8-night',
    day: 8,
    slot: 'night',
    options: [
      o(
        'wangping',
        '🐟',
        'Riverside dinner on Wangping Street',
        'A riverside food street where locals stroll after dinner. 清蒸鱼 (steamed fish) or 烤鱼 (grilled fish), ordered 不辣 (not spicy).',
        { place: '望平街 · 香香巷', transport: '~1 km from the hotel: walk or a short taxi.', tags: ['food', 'walk'] },
      ),
    ],
  },

  // ---------------- Day 9 · Sun 11/1 · Chengdu ----------------
  {
    id: 'd9-morning',
    day: 9,
    slot: 'morning',
    options: [
      o('brunch', '🥞', 'Sleep in & brunch', 'Slow morning.', { tags: ['rest'] }),
      o(
        'wuhou',
        '⛩️',
        'Wuhou Shrine & Jinli',
        'Three Kingdoms history. It is Sunday, so go at opening. 张飞牛肉 (Zhang Fei beef) at Jinli makes a good gift.',
        {
          place: '武侯祠 · 锦里',
          transport: 'Taxi ~4 km, ~18 min, or Line 3 → Gaoshengqiao (高升桥) Exit A + 10 min walk.',
          kind: 'optional',
          tags: ['history'],
        },
      ),
    ],
  },
  {
    id: 'd9-afternoon',
    day: 9,
    slot: 'afternoon',
    options: [
      o(
        'shopping-final',
        '🛍️',
        'Shopping finale at IFS & Taikoo Li',
        'Buy every remaining souvenir today. The hotel is 10 min away for breaks.',
        { place: 'IFS · 太古里', transport: 'Walk ~10 min.', tags: ['shop'] },
      ),
    ],
  },
  {
    id: 'd9-night',
    day: 9,
    slot: 'night',
    options: [
      o(
        'jinjiang',
        '⛵',
        'Jinjiang River night cruise',
        'From East Gate pier, ~40 min past Hejiang Pavilion (合江亭), Anshun Bridge (安顺廊桥) and Jiuyan Bridge (九眼桥). ~¥80–118. Arrive 19:00–19:30 as the lights come on.',
        { place: '夜游锦江 东门码头', transport: 'Taxi there and back.', tags: ['night-view', 'cruise'] },
      ),
      o(
        'river-walk',
        '🚶',
        'Riverside walk to Jiuyan Bridge',
        'Free ~2 km walk from East Gate pier along the lit-up river.',
        { place: '九眼桥', kind: 'optional', tags: ['walk', 'night-view'] },
      ),
    ],
  },

  // ---------------- Day 10 · Mon 11/2 · Chengdu → Home ----------------
  {
    id: 'd10-morning',
    day: 10,
    slot: 'morning',
    options: [
      o(
        'checkout',
        '🧳',
        'Breakfast & check-out',
        'Last breakfast. Check out by 12:00 and leave bags at the front desk.',
        { tags: ['food'] },
      ),
    ],
  },
  {
    id: 'd10-afternoon',
    day: 10,
    slot: 'afternoon',
    options: [
      o(
        'airport',
        '✈️',
        'To the airport',
        'Check the airport code on the ticket! TFU (Tianfu) is ~65 km: taxi ~70 min, ~¥200, or the airport bus under the IFS panda (~80 min). CTU (Shuangliu) is ~18 km: taxi 30–40 min.',
        { place: '天府国际机场 / 双流国际机场', tags: ['travel'] },
      ),
    ],
  },
  {
    id: 'd10-night',
    day: 10,
    slot: 'night',
    options: [
      o('home', '🏠', 'Home sweet home', 'Unpack, rest, and flip through this journal together.', { tags: ['home'] }),
    ],
  },
];

export const REST_OPTION: PlanOption = {
  id: 'rest',
  icon: '🛏️',
  title: 'Rest at the hotel',
  desc: 'Tired? Skip the plan and recharge. Totally allowed.',
  kind: 'rest',
  tags: ['rest'],
};

export const CUSTOM_OPTION: PlanOption = {
  id: 'custom',
  icon: '✨',
  title: 'Did something else',
  desc: 'Went off-script? Write what you did.',
  kind: 'custom',
  tags: [],
};

export function getOptions(cp: Checkpoint): PlanOption[] {
  const hasRest = cp.options.some((op) => op.tags.includes('rest'));
  return [...cp.options, ...(hasRest ? [] : [REST_OPTION]), CUSTOM_OPTION];
}

export function findOption(cp: Checkpoint, optionId: string | undefined): PlanOption | undefined {
  if (!optionId) return undefined;
  return getOptions(cp).find((op) => op.id === optionId);
}

export const dayOf = (n: number): Day => DAYS[n - 1];

export const SLOT_LABEL: Record<Slot, { en: string; icon: string }> = {
  morning: { en: 'Morning', icon: '🌅' },
  afternoon: { en: 'Afternoon', icon: '☀️' },
  night: { en: 'Night', icon: '🌙' },
};
