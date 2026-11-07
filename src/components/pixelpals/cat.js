/* ===========================================================================
   猫屋的「今天」：什么时候在家、今天带回来什么、它为什么去那儿
   纯函数，不碰网络、不碰 canvas。
   =========================================================================== */

/** 出门一趟：从两个人凑齐那一刻算起，出去 3 小时，前半小时算「刚走开」 */
export const CAT_TRIP_H = 3
export const CAT_JUST_H = 0.5

/**
 * 此刻猫在哪。
 * leftHour = 今天出发的那个钟点（两个人都指完的时刻）；没有就是还没出发。
 * 这样不管几点指完都能出去：22 点指完就 22 点走、1 点回来。
 */
export function catAt(hr, leftHour) {
  if (leftHour == null || !Number.isFinite(leftHour)) return { home: true, justLeft: false, out: false }
  const d = (((hr - leftHour) % 24) + 24) % 24
  const out = d < CAT_TRIP_H
  return { home: !out, justLeft: out && d < CAT_JUST_H, out }
}

/* 它可能叼回来的东西（和 rooms.js 里的 CAT_ITEMS 一一对应） */
export const CAT_LOOT = ['ticket', 'shell', 'leaf', 'marble', 'candy']

/** 同一天、同一个地方，两个人算出来是同一件东西 */
export function catItem(dayKey, scene) {
  if (!dayKey || !scene) return null
  const s = dayKey + '|' + scene
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return CAT_LOOT[h % CAT_LOOT.length]
}

/* ---------- 猫的脾气 ---------- */

/** 27 个场景各自的「味」：雨 / 夜 / 水 / 吃的 / 高处 / 热闹 / 安静 */
export const SCENE_TAG = {
  office: 'quiet', cafe: 'quiet', store: 'food', library: 'quiet',
  beach: 'water', stars: 'high', roof: 'high', park: 'quiet',
  station: 'quiet', balcony: 'high', snowy: 'cold', rainstation: 'rain',
  izakaya: 'food', onsen: 'water', onsen_snow: 'water', booth: 'quiet',
  london: 'rain', london_rain: 'rain', tokyo: 'loud', paris: 'loud',
  kyoto: 'quiet', nyc: 'loud', hongkong: 'loud',
  rain_day: 'rain', rain: 'rain', snow_day: 'cold', snow_night: 'cold',
}

const INDOOR_RAIN = ['rain', 'london_rain', 'rainstation']

export const PERSONAS = [
  {
    k: 'rain',
    n: '爱雨的猫',
    note: '下雨天最精神',
    fav: 'london_rain',
    like: ['rain', 'cold'],
    voice: ['下雨了，我出去听一会儿', '雨里走路最好，没人看得见我', '毛湿了也没关系'],
  },
  {
    k: 'food',
    n: '贪吃的猫',
    note: '哪里有吃的往哪走',
    fav: 'izakaya',
    like: ['food'],
    voice: ['那边有味道，很香', '我闻到烤鱼了', '就去看一眼，不吃'],
  },
  {
    k: 'high',
    n: '爱高的猫',
    note: '只想待在高的地方',
    fav: 'roof',
    like: ['high'],
    voice: ['高处风大，我喜欢', '上面看得远', '别担心，我跳得下来'],
  },
  {
    k: 'quiet',
    n: '怕吵的猫',
    note: '人多的地方不去',
    fav: 'kyoto',
    like: ['quiet'],
    voice: ['这边安静', '不想见人，就自己走走', '别跟来，我一会儿就回'],
  },
  {
    k: 'loud',
    n: '爱凑热闹的猫',
    note: '哪儿人多往哪儿钻',
    fav: 'hongkong',
    like: ['loud'],
    voice: ['那边灯都亮着，去看看', '有人吹口哨，是在叫我吧', '热闹的地方不冷'],
  },
]

const hashStr = (s) => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h
}

/** 这只猫的脾气：由两个人的 pair 决定，两边算出来一样 */
export function catPersona(pair) {
  return PERSONAS[(pair ? hashStr(pair) : 0) % PERSONAS.length]
}

const tagOf = (scene) => SCENE_TAG[scene] || 'quiet'

/**
 * 猫今天去哪：return { to, why }
 * why = 'both'（两个人指到一块儿）| 'like'（它本来就想去）| 'random'（两个它都不挑）| 'disobey'（今天不听你们的）
 */
export function catDest(persona, dayKey, pa, pb) {
  const a = pa || null
  const b = pb || null
  if (!a && !b) return null
  if (a && b && a === b) return { to: a, why: 'both' }
  if (!a || !b) return { to: a || b, why: 'alone' }
  const picks = [a, b].filter(Boolean)
  if (!persona) return { to: picks[0], why: 'random' }
  // 只要有一个是它本来就想去的地方，就顺着那个人
  for (const p of picks) if (persona.like.includes(tagOf(p))) return { to: p, why: 'like' }
  // 两个它都不喜欢：三十的几率干脆不听话，自己跑它最喜欢的地方
  const h = hashStr((dayKey || '') + a + b)
  if (h % 100 < 30) return { to: persona.fav, why: 'disobey' }
  return { to: picks[h % picks.length], why: 'random' }
}

/** 猫自己会说的一句（why 不同说不同的话） */
export function catWhyLine(persona, why, sceneName) {
  const p = persona || PERSONAS[0]
  if (why === 'both') return '两个人都指到一个地方了，那就去这儿'
  if (why === 'alone') return '只有一个人指了，那就去这儿吧'
  if (why === 'disobey') return `今天不想听你们的——我去${sceneName || '自己想去的地方'}`
  if (why === 'like') return p.voice[(sceneName || '').length % p.voice.length]
  return '随便挑了一个，别问了'
}

/** 给界面用的一句话：今天它在哪、听谁的 */
export function catLine(row, myPick, taPick) {
  if (!row) {
    if (myPick && !taPick) return '你指了，等 TA 也指一个'
    if (!myPick && taPick) return 'TA 指了，你也指一个'
    if (myPick && taPick) return '两个人都指了，看它今天听谁的'
    return '两个人都还没指'
  }
  return '点了就知道它今天听谁的'
}
