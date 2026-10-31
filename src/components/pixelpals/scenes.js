/* ===========================================================================
   像素小屋 · 场景与摆设
   这个文件现在只放三样东西：
   1) 汇总：把 scenedata/ 里「一个场景一个文件」的数据拼成 SCENE_DATA；
   2) 数据：礼物、小图案、场景清单（SCENE_LIST）；
   3) 一个通用的画法：按数据把场景画到 canvas 上，不执行任何数据里带来的代码。
   这样以后「让 AI 按描述生成场景」或者「自己画像素画」，拿到的也只是同样格式的数据：
   页面负责画，validateScene 负责检查格式和大小，数据本身永远不会被当成程序运行。
   （办公室和咖啡馆是第一轮手写的画法，还留在 art.js 里；新加的场景都走这里的数据。）

   场景数据的样子：
   { name, pal: ['#rrggbb', ...最多 32 色], spot: { walk: [最左, 最右], stand: 放空时站的位置 },
     draw: [画法...]     先画（在小人后面）
     front: [画法...]    后画（在小人前面，可以没有）
     jobs: { coder: [画法...], worker: [画法...] }   只有「上班」时才画（代码小人 / 打工小人各用自己的）}
   画法（颜色一律写调色板里的第几个）：
     ['r', 颜色, x, y, 宽, 高]                   矩形
     ['spr', 小图案名, x, y]                     摆一个小图案（见 SPRITE_LIB）
     ['window', x, y, 宽, 高]                    带窗框的窗，窗外随时间变化
     ['sky', x, y, 宽, 高, 夜晚?, 渐变?]         随时间变化的天空，夜晚? 写 1 就一直是夜空；渐变? 写 1 就是平滑渐变（不写是窗外那种两截的天）
     ['shade', 颜色, x, y, 宽, 高]               随时间变暗的一层罩子（傍晚淡淡的、夜里深一些，白天没有），给户外的地面和海用
     ['twinkle', 个数, x, y, 宽, 高, 种子]       一撮一闪一闪的星星
     ['meteor', 周期(0.1秒), x, y, 横向, 纵向]   每隔一阵划过的流星
     ['wave', y, 高, 颜色1, 颜色2]               一片流动的海浪
     ['flick', 颜色1, 颜色2, x, y, 宽, 高, 间隔(0.1秒)]   两种颜色来回闪（火苗、霓虹）
     ['glow', 颜色, x, y, 半径, 亮度(0~50)]       一团柔光
     ['steam', x, y, 颜色]                        冒热气
     ['snow', 片数, 下落速度, 种子]              飘雪（左右轻摆，跟着 t 动）
     ['rain', 条数, 速度, 种子]                  雨（竖线，贴地溅起小水花）
   画布固定 160×120，地面线 FLOOR = 98（和 art.js 一致）。
   这个文件不碰界面也不碰服务器。
   =========================================================================== */

export const W = 160
export const H = 120
export const FLOOR = 98

const R = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h) }
function pat(ctx, rows, map, x, y) {
  x = Math.round(x); y = Math.round(y)
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < rows[r].length; i++) {
      const ch = rows[r][i]
      if (ch === '.') continue
      ctx.fillStyle = map[ch]
      ctx.fillRect(x + i, y + r, 1, 1)
    }
  }
}
const hexRgba = (hex, a) => {
  const n = parseInt(String(hex).slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// 雨：两个独立哈希（x / y 分开算，否则雨滴会连成斜线簇，像划痕）
const h1 = (i, s) => { let h = Math.imul(i ^ (s * 2654435761), 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296 }
const h2 = (i, s) => { let h = Math.imul(i + 0x7f4a7c15, (s * 40503) | 1); h ^= h >>> 16; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13; return (h >>> 0) / 4294967296 }

/* ---------- 小图案（礼物和以后场景里可以摆的东西） ---------- */

export const SPRITE_LIB = {
  plant: { rows: ['..g.g..', '.gGgGg.', 'gGgGgGg', '..gGg..', '.PPPPP.', '.PPPPP.', '..PPP..'], map: {g:'#62c46e',G:'#3f9a4f',P:'#c56a4a'} },
  lamp: { rows: ['.YYYYY.', 'YYYYYYY', '...B...', '...B...', '..BBB..'], map: {Y:'#ffd77a',B:'#6b5a4a'} },
  cat: { rows: ['K...K.', 'KK.KK.', 'KKKKKK', 'KEKKEK', 'KKpKKK', '.KKKK.'], map: {K:'#f2f2f2',E:'#333333',p:'#ff9fb6'} },
  clover: { rows: ['.gg.gg.', 'gGGgGGg', '.gGGGg.', 'gGGgGGg', '.gg.gg.', '...s...', '.PPPPP.', '..PPP..'], map: {g:'#7fd67a',G:'#3fae5a',s:'#3f9a4f',P:'#d98a5a'} },
  candle: { rows: ['..y..', '..o..', '.WWW.', '.WWW.', '.WWW.', 'BBBBB', '.BBB.'], map: {y:'#ffe9a0',o:'#ff9a3c',W:'#fff6e8',B:'#c9a24a'} },
  sunflower: { rows: ['..y.y..', '.yyyyy.', 'yyBBByy', 'yyBBByy', '.yyyyy.', '..y.y..', '...g...', '.g.g...', '.ggg...', '...g...', '.PPPPP.', '..PPP..'], map: {y:'#ffcf3f',B:'#7a4a24',g:'#3f9a4f',P:'#c56a4a'} },
  bear: { rows: ['.OO..OO.', 'OOOOOOOO', 'OOEOOEOO', 'OOOnnOOO', '.OOOnOO.', '..RRRR..', '.OOOOOO.', 'OOOOOOOO', '.OO..OO.'], map: {O:'#c98a58',E:'#2b2230',n:'#f1d3b0',R:'#e5384f'} },
  frame: { rows: ['FFFFFFFFFFFFFF', 'FaaaaaaaaaaaaF', 'FaaaaaaayyaaaF', 'FaaaaaaayyaaaF', 'FaaaaaaaaaaaaF', 'FaaaaaaaaaaaaF', 'FaaggggggaaaaF', 'FaagggggggaaaF', 'FggggggggggggF', 'FggggggggggggF', 'FFFFFFFFFFFFFF'], map: {F:'#d9a441',a:'#9fd8ff',y:'#ffe066',g:'#5fbf7a'} },
  fishbowl: { rows: ['..BBBBB..', '.BwwwwwB.', 'BwwwwwwwB', 'BwwFffwwB', 'BwwFFFwwB', 'BwwwwwwwB', '.BwwwwwB.', '..BBBBB..', '..GGGGG..'], map: {B:'#cfe9ff',w:'#8fd0ff',F:'#ff9a3c',f:'#ffd9a0',G:'#a9845c'} },
  record: { rows: ['.BBBBBBB.', 'BdddddddB', 'BdDDDDDdB', 'BdDKKKDdB', 'BdDKKKDdB', 'BdDDDDDdB', 'BdddddddB', '.BBBBBBB.'], map: {B:'#2b2430',d:'#8a6249',D:'#3a3346',K:'#e5384f'} },
  starjar: { rows: ['..LLL..', '.LGGGL.', 'LGwwwGL', 'LwwwwwL', 'LwswwwL', 'LwwwswL', 'LwswwwL', 'LwwwwwL', '.LGGGL.', '..LLL..'], map: {L:'#c9a24a',G:'#cfe9ff',w:'#fff0b8',s:'#ffcf3f'} },
  clock: { rows: ['..DDDDD..', '.DfffffD.', 'DfffffffD', 'DfffkfffD', 'DfffkkkfD', 'DfffffffD', '.DfffffD.', '..DDDDD..'], map: {D:'#8a6249',f:'#f4e7d4',k:'#2b2430'} },
  windchime: { rows: ['BBBBBBB', '..B.B..', '.h.h.h.', '.h.h.h.', '.h.h.h.', '...h.h.', '..b.b.b', '..b...b', '..b....'], map: {B:'#c9a24a',h:'#cfe9ff',b:'#c9a24a'} },
  dream: { rows: ['..BBB..', '.B...B.', 'B..W..B', 'B.W.W.B', 'B..W..B', '.B...B.', '..BBB..', '.......', '..F.F..', '.FFF.FF', '..F.F..', '...F...'], map: {B:'#8a6249',W:'#f4e7d4',F:'#c56a4a'} },
}

/* ---------- 礼物 ----------
   cost / mood 要和服务端 pal_gift_catalog 表里的一致（服务端是准的，这里只是显示用）。
   at = 摆在家里的位置；glow = [x, y, 半径, 亮度]（睡觉关灯后发的光）；flick = [dx, dy, 颜色]（小图案里这一格来回闪）。
   新增礼物：1) 在 SPRITE_LIB 里加一个小图案，2) 在这里加一条，3) 在服务端 pal_gift_catalog 表里加一行（SQL 见第五轮文件末尾的说明）。 */
export const GIFTS = [
  { k: 'plant', e: '🪴', n: '盆栽', cost: 30, mood: 20, spr: 'plant', where: 'floor', at: [142,91] },
  { k: 'lamp', e: '💡', n: '小台灯', cost: 40, mood: 20, spr: 'lamp', where: 'surface', at: [114,43], glow: [3,2,34,45] },
  { k: 'cat', e: '🐱', n: '猫猫玩偶', cost: 50, mood: 20, spr: 'cat', where: 'floor', at: [46,72] },
  { k: 'clover', e: '🍀', n: '四叶草', cost: 8, mood: 6, spr: 'clover', where: 'surface', at: [129,40] },
  { k: 'candle', e: '🕯️', n: '小蜡烛', cost: 12, mood: 6, spr: 'candle', where: 'surface', at: [123,41], glow: [2,2,18,30], flick: [2,0,'#ff9a3c'] },
  { k: 'sunflower', e: '🌻', n: '向日葵', cost: 15, mood: 10, spr: 'sunflower', where: 'floor', at: [133,86] },
  { k: 'bear', e: '🧸', n: '小熊玩偶', cost: 18, mood: 10, spr: 'bear', where: 'floor', at: [28,68] },
  { k: 'frame', e: '🖼️', n: '小相框', cost: 20, mood: 10, spr: 'frame', where: 'wall', at: [36,22] },
  { k: 'fishbowl', e: '🐠', n: '小鱼缸', cost: 26, mood: 12, spr: 'fishbowl', room: 'living', where: 'floor' },
  { k: 'record', e: '🎵', n: '唱片机', cost: 60, mood: 18, spr: 'record', room: 'living', where: 'surface' },
  { k: 'starjar', e: '⭐', n: '星星罐', cost: 35, mood: 15, spr: 'starjar', where: 'surface', at: [152,88], glow: [3,4,26,38] },
  { k: 'clock', e: '🕰️', n: '小挂钟', cost: 22, mood: 8, spr: 'clock', room: 'living', where: 'wall' },
  { k: 'dream', e: '🪶', n: '捕梦网', cost: 28, mood: 12, spr: 'dream', where: 'wall', at: [54,9], glow: [3,9,20,22] },
  { k: 'windchime', e: '🎐', n: '风铃', cost: 24, mood: 10, spr: 'windchime', room: 'living', where: 'wall' },
]

/* ---------- 礼物摆哪：每个房间给几组固定位子，礼物自己带「摆哪一类」 ----------
   以前是每件礼物写死一个 at，加一件就要找空位；现在：
   - 每件礼物属于一个房间（room: home / living，默认 home），同一个礼物不会两个房间各摆一份；
   - 卧室优先用它自己习惯的 at（老的 8 件位置不变），被占了再按类别找空位；
   - 客厅没有手调位置，直接按类别（wall / surface / floor）排；
   - 摆放顺序 = 收到的顺序，所以新礼物只会排到后面的空位，不会挤走老的。 */
export const GIFT_SLOTS = {
  home: {
    wall: [[36, 22], [20, 12], [54, 9], [102, 8]],
    surface: [[114, 43], [123, 41], [129, 40], [140, 41]],
    floor: [[142, 91], [133, 86], [46, 72], [28, 68], [94, 88], [152, 88]],
  },
  living: {
    wall: [[24, 26], [76, 18], [150, 18], [62, 30]],
    surface: [[104, 76], [120, 76]],
    floor: [[132, 88], [40, 78], [70, 78]],
  },
}

/** 算出这一房间要摆哪些礼物、各在哪：返回 [{ g, x, y }] */
export function giftLayout(owned, room = 'home') {
  const slots = GIFT_SLOTS[room] || GIFT_SLOTS.home
  const taken = new Set()
  const out = []
  const put = (g, x, y) => { taken.add(x + ',' + y); out.push({ g, x, y }) }
  const list = (owned || []).map((k) => GIFTS.find((g) => g.k === k)).filter((g) => g && (g.room || 'home') === room)
  if (room === 'home') {
    for (const g of list) {
      if (!g.at) continue
      const key = g.at[0] + ',' + g.at[1]
      if (!taken.has(key)) put(g, g.at[0], g.at[1])
    }
  }
  for (const g of list) {
    if (out.some((o) => o.g === g)) continue
    const spots = slots[g.where] || slots.floor || []
    const spot = spots.find(([x, y]) => !taken.has(x + ',' + y))
    if (spot) put(g, spot[0], spot[1])
  }
  return out
}

/** 把已经收到的礼物摆进房间（room: 'home' 卧室 / 'living' 客厅） */
export function drawGifts(ctx, owned, t, room = 'home') {
  for (const { g, x, y } of giftLayout(owned, room)) {
    const s = SPRITE_LIB[g.spr]
    if (!s) continue
    pat(ctx, s.rows, s.map, x, y)
    if (g.flick && Math.floor(t * 6) % 2) R(ctx, g.flick[2], x + g.flick[0], y + g.flick[1], 1, 1)
  }
}

/** 睡觉关灯以后，有光的礼物（台灯、蜡烛、星星罐）还亮着；glow 是相对礼物的偏移 */
export function drawGiftGlows(ctx, owned, room = 'home') {
  for (const { g, x, y } of giftLayout(owned, room)) {
    if (!g.glow) continue
    const [dx, dy, r, a] = g.glow
    const gx = x + dx
    const gy = y + dy
    const gr = ctx.createRadialGradient(gx, gy, 2, gx, gy, r)
    gr.addColorStop(0, `rgba(255,214,130,${a / 100})`)
    gr.addColorStop(1, 'rgba(255,214,130,0)')
    ctx.fillStyle = gr
    ctx.fillRect(0, 0, W, H)
  }
}

/* ---------- 场景数据：一个场景一个文件（scenedata/） ---------- */
import { store } from './scenedata/store.js'
import { library } from './scenedata/library.js'
import { beach } from './scenedata/beach.js'
import { stars } from './scenedata/stars.js'
import { roof } from './scenedata/roof.js'
import { park } from './scenedata/park.js'
import { station } from './scenedata/station.js'
import { balcony } from './scenedata/balcony.js'
import { snowy } from './scenedata/snowy.js'
import { izakaya } from './scenedata/izakaya.js'
import { onsen } from './scenedata/onsen.js'
import { onsen_snow } from './scenedata/onsen_snow.js'
import { booth } from './scenedata/booth.js'
import { london } from './scenedata/london.js'
import { tokyo } from './scenedata/tokyo.js'
import { paris } from './scenedata/paris.js'
import { kyoto } from './scenedata/kyoto.js'

export const SCENE_DATA = {
  store,
  library,
  beach,
  stars,
  roof,
  park,
  station,
  balcony,
  snowy,
  izakaya,
  onsen,
  onsen_snow,
  booth,
  london,
  tokyo,
  paris,
  kyoto,
}

/* 所有场景：办公室、咖啡馆是手写画法，其余走上面的数据。上班和放空都能选 */
export const SCENE_LIST = [
  { k: 'office', n: '办公室', e: '🏢', tip: '' },
  { k: 'cafe', n: '咖啡馆', e: '☕', tip: '' },
  { k: 'store', n: '便利店', e: '🏪', tip: '' },
  { k: 'library', n: '图书馆', e: '📚', tip: '' },
  { k: 'beach', n: '海边', e: '🏖️', tip: '适合放空' },
  { k: 'stars', n: '星空', e: '🌌', tip: '适合放空' },
  { k: 'roof', n: '天台', e: '🌆', tip: '适合放空' },
  { k: 'park', n: '公园', e: '🌸', tip: '适合放空' },
  { k: 'station', n: '车站', e: '🚉', tip: '适合放空' },
  { k: 'balcony', n: '阳台', e: '🪴', tip: '适合放空' },
  { k: 'snowy', n: '雪夜', e: '⛄', tip: '适合放空' },
  { k: 'rainstation', n: '雨夜车站', e: '🚉', tip: '适合放空' },
  { k: 'izakaya', n: '居酒屋', e: '🏮', tip: '上班 / 放空都行' },
  { k: 'onsen', n: '温泉', e: '♨️', tip: '适合放空' },
  { k: 'onsen_snow', n: '温泉·雪', e: '🧖', tip: '适合放空' },
  { k: 'booth', n: '电话亭', e: '☎️', tip: '适合放空' },
  { k: 'london', n: '伦敦', e: '🎡', tip: '适合放空' },
  { k: 'tokyo', n: '东京塔', e: '🗼', tip: '适合放空' },
  { k: 'paris', n: '巴黎', e: '🥐', tip: '适合放空' },
  { k: 'kyoto', n: '京都', e: '⛩️', tip: '适合放空' },
  { k: 'rain_day', n: '下雨', e: '🌦️', tip: '适合放空' },
  { k: 'rain', n: '雨夜', e: '🌧️', tip: '适合放空' },
  { k: 'snow_day', n: '下雪', e: '❄️', tip: '适合放空' },
  { k: 'snow_night', n: '下雪夜', e: '🌨️', tip: '适合放空' },
]
export const SCENES = Object.fromEntries(SCENE_LIST.map((s) => [s.k, s.n]))
export const SCENE_ICON = Object.fromEntries(SCENE_LIST.map((s) => [s.k, s.e]))

/** 这个场景是不是走数据的（办公室、咖啡馆不是） */
export const isDataScene = (key) => Object.prototype.hasOwnProperty.call(SCENE_DATA, key)

// 手写画法的场景（办公室 / 咖啡馆 / 车站 / 天气场景）自己给站位
export const CODE_SPOTS = {
  rainstation: { walk: [30, 88], stand: 64 },
}

/** 小人在这个场景里站哪、走哪（数据场景和手写场景都有；其余返回 null） */
export const sceneSpot = (key) => (isDataScene(key) ? SCENE_DATA[key].spot : CODE_SPOTS[key] || null)

/* ---------- 天空和窗 ---------- */

const MOON = ['.MMM.', 'MMMM.', 'MMM..', 'MMMM.', '.MMM.']

const lerpHex = (a, b, k) => {
  const pa = parseInt(a.slice(1), 16); const pb = parseInt(b.slice(1), 16)
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

/** 随时间变化的天空（夜里有星星和月亮，白天有太阳和云，傍晚和清晨有落日）。force 写 true 就一直是夜空；smooth 写 true 是平滑渐变 */
export function drawSky(ctx, x, y, w, h, hr, t, force, smooth) {
  let top, bot, mode
  if (force || hr < 5.5 || hr >= 19.5) { top = '#10163a'; bot = '#26306a'; mode = 'night' }
  else if (hr < 7) { top = '#7b7cc4'; bot = '#ffbe9e'; mode = 'dawn' }
  else if (hr < 16.5) { top = '#6cbaff'; bot = '#c4e8ff'; mode = 'day' }
  else { top = '#6a55a6'; bot = '#ffa07a'; mode = 'dusk' }
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  if (smooth) {
    // 每 4 像素一档，从上到下慢慢过渡（像素风的渐变）
    for (let yy = 0; yy < h; yy += 4) R(ctx, lerpHex(top, bot, Math.min(1, yy / Math.max(1, h - 4))), x, y + yy, w, 4)
  } else {
    R(ctx, top, x, y, w, h)
    const sp = y + Math.floor(h * 0.6)
    R(ctx, bot, x, sp, w, h)
    for (let i = 0; i < w; i += 2) R(ctx, bot, x + i, sp - 1, 1, 1)
  }
  if (mode === 'night') {
    for (let i = 0; i < 12; i++) {
      const sx = x + (i * 53) % w
      const sy = y + (i * 29) % Math.max(1, h - 6)
      if (Math.floor(t * 2 + i) % 5) R(ctx, '#fff', sx, sy, 1, 1)
    }
    pat(ctx, MOON, { M: '#fff3c4' }, x + w - 9, y + 3)
  }
  if (mode === 'day') {
    R(ctx, '#ffe066', x + w - 11, y + 3, 6, 6)
    R(ctx, '#fff6b8', x + w - 10, y + 4, 2, 2)
    const cx = x + ((t * 3) % (w + 24)) - 16
    R(ctx, '#fff', cx, y + h * 0.36, 12, 3)
    R(ctx, '#fff', cx + 3, y + h * 0.36 - 2, 6, 2)
  }
  if (mode === 'dusk' || mode === 'dawn') R(ctx, '#ff7a4f', x + 5, y + h - 9, 7, 7)
  ctx.restore()
}

export function drawWindow(ctx, x, y, w, h, hr, t) {
  drawSky(ctx, x, y, w, h, hr, t, false)
  const f = '#fbfbff'
  R(ctx, f, x - 2, y - 2, w + 4, 2); R(ctx, f, x - 2, y + h, w + 4, 2)
  R(ctx, f, x - 2, y, 2, h); R(ctx, f, x + w, y, 2, h)
  R(ctx, f, x + Math.floor(w / 2) - 1, y, 2, h); R(ctx, f, x, y + Math.floor(h / 2) - 1, w, 1)
  R(ctx, '#d6d6e6', x - 4, y + h + 2, w + 8, 2)
}

/* ---------- 通用画法：按数据画一个场景 ---------- */

// 一撮星星的位置用「种子」算出来，每次画都一样（不会乱跳）
function twinkle(ctx, n, x0, y0, w, h, seed, t) {
  let s = (seed * 9301 + 49297) % 233280
  const next = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(next() * w)
    const y = y0 + Math.floor(next() * h)
    const ph = next() * 10
    if (Math.floor(t * 2 + ph) % 5) R(ctx, '#fff', x, y, 1, 1)
  }
}

function runOps(ctx, ops, sc, hr, t) {
  const pal = sc.pal
  for (const op of ops) {
    switch (op[0]) {
      case 'r': R(ctx, pal[op[1]], op[2], op[3], op[4], op[5]); break
      case 'spr': { const s = SPRITE_LIB[op[1]]; if (s) pat(ctx, s.rows, s.map, op[2], op[3]); break }
      case 'window': drawWindow(ctx, op[1], op[2], op[3], op[4], hr, t); break
      case 'sky': drawSky(ctx, op[1], op[2], op[3], op[4], hr, t, !!op[5], !!op[6]); break
      case 'shade': {
        // 夜里最深，傍晚、清晨淡淡的，白天不画
        const a = hr < 5.5 || hr >= 19.5 ? 0.5 : hr < 7 ? 0.14 : hr < 16.5 ? 0 : 0.16
        if (a > 0) { ctx.fillStyle = hexRgba(pal[op[1]], a); ctx.fillRect(op[2], op[3], op[4], op[5]) }
        break
      }
      case 'twinkle': twinkle(ctx, op[1], op[2], op[3], op[4], op[5], op[6], t); break
      case 'meteor': {
        const per = op[1] / 10
        const p = (t % per) / per
        if (p >= 0.3) break
        const q = p / 0.3
        const dx = op[4]; const dy = op[5]
        const len = Math.hypot(dx, dy) || 1
        const hx = op[2] + dx * q; const hy = op[3] + dy * q
        for (let i = 1; i <= 8; i++) {
          ctx.fillStyle = `rgba(255,255,255,${(1 - i / 9) * 0.8})`
          ctx.fillRect(Math.round(hx - (dx / len) * i * 2), Math.round(hy - (dy / len) * i * 2), 1, 1)
        }
        R(ctx, '#fff', Math.round(hx), Math.round(hy), 2, 2)
        break
      }
      case 'wave': {
        const y0 = op[1]; const h = op[2]
        for (let j = 0, y = y0; y < y0 + h; j++, y += 4) {
          const off = (t * 6 + j * 7) % 16
          ctx.fillStyle = pal[j % 2 ? op[3] : op[4]]
          for (let x = -16 + off; x < W; x += 16) ctx.fillRect(Math.round(x), y, 7, 1)
        }
        break
      }
      case 'flick': R(ctx, pal[Math.floor((t * 10) / op[7]) % 2 ? op[2] : op[1]], op[3], op[4], op[5], op[6]); break
      case 'glow': {
        const [, c, x, y, r, a] = op
        const g = ctx.createRadialGradient(x, y, 1, x, y, r)
        g.addColorStop(0, hexRgba(pal[c], a / 100))
        g.addColorStop(1, hexRgba(pal[c], 0))
        ctx.fillStyle = g
        ctx.fillRect(x - r, y - r, r * 2, r * 2)
        break
      }
      case 'steam':
        for (let i = 0; i < 3; i++) R(ctx, pal[op[3]], op[1] + (i % 2) * 2, op[2] - ((t * 6 + i * 3) % 9), 1, 1)
        break
      case 'snow': {
        // 飘雪：n 片，速度 speed(px/s)，seed 定位置，左右轻摆
        const n = op[1]; const sp = op[2] || 14; const sd = op[3] || 1
        for (let i = 0; i < n; i++) {
          const u = ((i * 7919 + sd * 104729) % 233280) / 233280
          const v = ((i * 1543 + sd * 37) % 233280) / 233280
          const x = u * 176 + Math.sin(t * 0.6 + v * 6.28) * 6 - 8
          const y = (t * sp + v * 126) % 130 - 6
          ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + u * 0.4).toFixed(2) + ')'
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
        }
        break
      }
      case 'rain': {
        // 雨：n 条，速度 px/s，种子定位置；近处更长更亮，最后在贴地那一带溅几颗水花
        const n = op[1]; const sp = op[2] || 200; const sd = op[3] || 1
        const a = Math.min(0.45, 0.10 + sp / 1100)
        for (let i = 0; i < n; i++) {
          const u = h1(i, sd); const v = h2(i, sd)
          const L = 3 + (i % 4) + Math.round(sp / 90)
          const x = u * 176 - 8
          const y = (t * sp + v * 140) % 140 - 14
          ctx.fillStyle = `rgba(226,240,255,${(a * 0.5).toFixed(3)})`
          ctx.fillRect(Math.round(x), Math.round(y), 1, L >> 1)
          ctx.fillStyle = `rgba(240,250,255,${a.toFixed(3)})`
          ctx.fillRect(Math.round(x), Math.round(y) + (L >> 1), 1, L - (L >> 1))
        }
        for (let i = 0; i < 10; i++) {
          const u = h1(i, sd + 101)
          const ph = (t * 3.2 + u * 10) % 1
          if (ph > 0.3) continue
          const x = 6 + u * 148
          const y = 96 + ((i * 37) % 20)
          const al = 0.55 * (1 - ph / 0.3)
          ctx.fillStyle = `rgba(236,248,255,${al.toFixed(2)})`
          ctx.fillRect(Math.round(x), Math.round(y), ph < 0.15 ? 3 : 2, 1)
          if (ph < 0.15) ctx.fillRect(Math.round(x + 1), Math.round(y - 1), 1, 1)
        }
        break
      }
      default: break
    }
  }
}

/**
 * 画一个数据场景的一层。layer: 'back'（在小人后面，上班时包含自己的那份小物件）或 'front'（在小人前面）。
 * o = { job: 'coder' | 'worker', working: 是不是在上班, hr, t }
 */
export function drawScene(ctx, key, layer, o) {
  const sc = SCENE_DATA[key]
  if (!sc) return
  if (layer === 'front') {
    if (sc.bmp) drawBmp(ctx, sc, 'fg', o.hr)
    if (sc.front && sc.front.length) runOps(ctx, sc.front, sc, o.hr, o.t)
    return
  }
  if (sc.bmp) drawBmp(ctx, sc, 'bg', o.hr)
  runOps(ctx, sc.draw, sc, o.hr, o.t)
  if (o.working && sc.jobs && sc.jobs[o.job]) runOps(ctx, sc.jobs[o.job], sc, o.hr, o.t)
}

/* ---------- 自己画的场景：80×60 的像素画（每格 2×2 个像素），分「背景」和「前景」两层 ----------
   scene.bmp = { w: 80, h: 60, dim?: 1, bg: '行程压缩', fg?: '行程压缩' }
   行程压缩 = 一串「连续几格*颜色」用逗号连起来，颜色是调色板里的第几个，前景层里 _ 表示这一格透明。
   例：'40*3,2*_,38*0' = 先 40 格颜色 3，再 2 格透明，再 38 格颜色 0。一层一共必须正好 4800 格（80×60，一行一行数）。
   背景层每一格都要有颜色（先画，在小人后面）；前景层可以有透明（后画，盖在小人前面）。
   dim = 1：夜里和傍晚自动变暗（和上面的 shade 一个节奏）。
   这些只是数据：页面按格子涂色，永远不会把它当程序运行。 */

export const BMP_W = 80
export const BMP_H = 60
export const BMP_SCALE = 2
export const BMP_CELLS = BMP_W * BMP_H
export const BMP_MAX_LEN = 26000
export const CLEAR = 255 // 这一格是透明的（只有前景层可以）
/** 自己画的场景在设置里的名字：u: + 一个 uuid（服务端的场景白名单也认这个格式） */
export const USER_SCENE_RE = /^u:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** 一层格子（Uint8Array，长度 4800，值 = 调色板序号，255 = 透明）→ 行程压缩字符串 */
export function encodeLayer(cells) {
  const out = []
  let i = 0
  while (i < cells.length) {
    const v = cells[i]
    let j = i + 1
    while (j < cells.length && cells[j] === v) j++
    out.push(`${j - i}*${v === CLEAR ? '_' : v}`)
    i = j
  }
  return out.join(',')
}

/** 行程压缩字符串 → 一层格子；格式不对、格数不是 4800、颜色超出调色板，都返回 null */
export function decodeLayer(str, palLen, allowClear) {
  if (typeof str !== 'string' || str.length === 0 || str.length > BMP_MAX_LEN) return null
  const out = new Uint8Array(BMP_CELLS)
  let pos = 0
  for (const tok of str.split(',')) {
    const m = /^(\d{1,4})\*(\d{1,2}|_)$/.exec(tok)
    if (!m) return null
    const n = Number(m[1])
    if (n < 1 || pos + n > BMP_CELLS) return null
    let v
    if (m[2] === '_') {
      if (!allowClear) return null
      v = CLEAR
    } else {
      v = Number(m[2])
      if (v >= palLen) return null
    }
    out.fill(v, pos, pos + n)
    pos += n
  }
  return pos === BMP_CELLS ? out : null
}

// 解码后的格子、画好的小画布都缓存在这里（按场景对象；场景数据换了一份，缓存就跟着作废）
const BMP_CACHE = new WeakMap()
const cacheOf = (sc) => {
  let c = BMP_CACHE.get(sc)
  if (!c) { c = { cells: {}, cv: {} }; BMP_CACHE.set(sc, c) }
  return c
}
function cellsOf(sc, which) {
  const c = cacheOf(sc)
  if (!(which in c.cells)) c.cells[which] = decodeLayer(sc.bmp[which], sc.pal.length, which === 'fg')
  return c.cells[which]
}

/** 把一层格子涂到 ctx 上（每格 BMP_SCALE 个像素；同一行里连着的同色格子并成一条） */
export function paintCells(ctx, cells, pal, scale = BMP_SCALE) {
  for (let y = 0; y < BMP_H; y++) {
    let x = 0
    while (x < BMP_W) {
      const v = cells[y * BMP_W + x]
      if (v === CLEAR) { x++; continue }
      let e = x + 1
      while (e < BMP_W && cells[y * BMP_W + e] === v) e++
      ctx.fillStyle = pal[v]
      ctx.fillRect(x * scale, y * scale, (e - x) * scale, scale)
      x = e
    }
  }
}

// 夜里最深，傍晚、清晨淡淡的，白天不变暗（和 shade 画法一样）
const dimAlpha = (hr) => (hr < 5.5 || hr >= 19.5 ? 0.5 : hr < 7 ? 0.14 : hr < 16.5 ? 0 : 0.16)

function drawBmp(ctx, sc, which, hr) {
  const cells = cellsOf(sc, which)
  if (!cells) { if (which === 'bg') R(ctx, '#000', 0, 0, W, H); return }
  const a = sc.bmp.dim ? dimAlpha(hr) : 0
  const shade = a > 0 ? `rgba(8,12,32,${a})` : ''
  if (typeof document === 'undefined') { // 没有 document（测试环境）就直接涂
    paintCells(ctx, cells, sc.pal)
    if (shade && which === 'bg') R(ctx, shade, 0, 0, W, H)
    return
  }
  const c = cacheOf(sc)
  const key = which === 'fg' && shade ? `fg:${a}` : which
  let cv = c.cv[key]
  if (!cv) {
    cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')
    paintCells(g, cells, sc.pal)
    if (which === 'fg' && shade) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = shade; g.fillRect(0, 0, W, H) }
    c.cv[key] = cv
  }
  ctx.drawImage(cv, 0, 0)
  if (which === 'bg' && shade) R(ctx, shade, 0, 0, W, H)
}

/** 把一份（通过检查的）自己画的场景登记进场景表：之后设置里写它的 id，两边的小屋就都能画出来 */
export function registerUserScene(id, data) {
  if (typeof id !== 'string' || !USER_SCENE_RE.test(id) || validateScene(data)) return false
  SCENE_DATA[id] = data
  SCENES[id] = Array.from(String(data.name || '我的场景')).slice(0, 8).join('')
  SCENE_ICON[id] = '🎨'
  return true
}
export function unregisterUserScene(id) {
  if (typeof id !== 'string' || !USER_SCENE_RE.test(id)) return
  delete SCENE_DATA[id]
  delete SCENES[id]
  delete SCENE_ICON[id]
}

/* ---------- 检查一份场景数据（以后 AI 生成的、自己画的，存之前都先过这一关；服务端也会按同样的规则再查一遍） ---------- */

export const SCENE_LIMITS = { palette: 32, ops: 600, coord: [-16, 176], size: 176 }

const SPEC = {
  r: ['c', 'i', 'i', 'n', 'n'],
  spr: ['s', 'i', 'i'],
  window: ['i', 'i', 'n', 'n'],
  sky: ['i', 'i', 'n', 'n', 'm', 'm'],
  shade: ['c', 'i', 'i', 'n', 'n'],
  twinkle: ['k', 'i', 'i', 'n', 'n', 'n'],
  meteor: ['p', 'i', 'i', 'd', 'd'],
  wave: ['i', 'n', 'c', 'c'],
  flick: ['c', 'c', 'i', 'i', 'n', 'n', 'q'],
  glow: ['c', 'i', 'i', 'g', 'a'],
  steam: ['i', 'i', 'c'],
  snow: ['k', 'n', 'n'],
  rain: ['K', 'S', 'k'],
}

/** 返回 ''（没问题）或一句说明哪里不对 */
export function validateScene(sc) {
  if (!sc || typeof sc !== 'object') return '场景不是一份数据'
  const pal = sc.pal
  if (!Array.isArray(pal) || pal.length < 1 || pal.length > SCENE_LIMITS.palette) return `调色板要有 1~${SCENE_LIMITS.palette} 种颜色`
  if (!pal.every((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) return '颜色要写成 #rrggbb'
  const sp = sc.spot
  if (!sp || !Array.isArray(sp.walk) || sp.walk.length !== 2 || !sp.walk.every(Number.isInteger) || sp.walk[0] >= sp.walk[1] || sp.walk[0] < 0 || sp.walk[1] > W) return '小人能走的范围不对'
  if (!Number.isInteger(sp.stand) || sp.stand < 0 || sp.stand > W) return '小人站的位置不对'
  const lists = [sc.draw, sc.front || [], (sc.jobs && sc.jobs.coder) || [], (sc.jobs && sc.jobs.worker) || []]
  if (!lists.every(Array.isArray)) return '画法要是一串列表'
  if (lists.reduce((n, l) => n + l.length, 0) > SCENE_LIMITS.ops) return `画法太多了（最多 ${SCENE_LIMITS.ops} 条）`
  const [lo, hi] = SCENE_LIMITS.coord
  const chk = {
    c: (v) => Number.isInteger(v) && v >= 0 && v < pal.length,
    i: (v) => Number.isInteger(v) && v >= lo && v <= hi,
    n: (v) => Number.isInteger(v) && v >= 0 && v <= SCENE_LIMITS.size,
    s: (v) => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SPRITE_LIB, v),
    m: (v) => v === undefined || v === 0 || v === 1,
    k: (v) => Number.isInteger(v) && v >= 1 && v <= 80,
    K: (v) => Number.isInteger(v) && v >= 1 && v <= 400,
    S: (v) => Number.isInteger(v) && v >= 1 && v <= 600,
    p: (v) => Number.isInteger(v) && v >= 20 && v <= 300,
    d: (v) => Number.isInteger(v) && v >= -SCENE_LIMITS.size && v <= SCENE_LIMITS.size,
    q: (v) => Number.isInteger(v) && v >= 1 && v <= 50,
    g: (v) => Number.isInteger(v) && v >= 1 && v <= 60,
    a: (v) => Number.isInteger(v) && v >= 0 && v <= 50,
  }
  for (const list of lists) {
    for (const op of list) {
      if (!Array.isArray(op)) return '有一条画法不是列表'
      const spec = SPEC[op[0]]
      if (!spec) return `不认识的画法：${String(op[0]).slice(0, 12)}`
      if (op.length - 1 > spec.length || op.length - 1 < (op[0] === 'sky' ? 4 : spec.length)) return `「${op[0]}」的参数个数不对`
      for (let i = 0; i < spec.length; i++) if (!chk[spec[i]](op[i + 1])) return `「${op[0]}」的第 ${i + 1} 个参数不合规矩`
    }
  }
  // 两个小人各自的小物件只能是 coder / worker
  if (sc.jobs && Object.keys(sc.jobs).some((k) => k !== 'coder' && k !== 'worker')) return '上班的小物件只能分给 coder / worker'
  // 自己画的像素画（可以没有）
  if (sc.bmp != null) {
    const b = sc.bmp
    if (typeof b !== 'object' || Array.isArray(b) || b.w !== BMP_W || b.h !== BMP_H) return `像素画的大小要是 ${BMP_W}×${BMP_H}`
    if (b.dim !== undefined && b.dim !== 0 && b.dim !== 1) return '像素画的「夜里变暗」只能是 0 或 1'
    if (!decodeLayer(b.bg, pal.length, false)) return '像素画的背景数据不对（格数要正好 4800，每格都要有颜色）'
    if (b.fg != null && !decodeLayer(b.fg, pal.length, true)) return '像素画的前景数据不对（格数要正好 4800）'
  }
  return ''
}