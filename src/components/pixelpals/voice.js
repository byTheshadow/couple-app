/* ===========================================================================
   像素小屋 · 小人的台词
   - 互动回应（投喂 / 按钮 / 礼物 / 悄悄话 / 戳一戳）按小人当时在上班、在家还是在睡觉，说不同的话
   - 日记：每条记录在服务器里只存「谁、做了什么、几个参数」，句子在这里按小人自己的口吻拼出来
   - 聊天：预览阶段用预设台词；以后接 AI 时只需要换掉 chatReply
   这个文件不碰界面也不碰服务器。
   =========================================================================== */
import { GIFTS, SCENES, pick, hourText, stateOf } from './art'

export const FOODS = [
  { k: 'bread', e: '🍞', n: '面包', full: '一片面包', cost: 5, d: 8 },
  { k: 'coffee', e: '☕', n: '咖啡', full: '一杯咖啡', cost: 8, d: 6 },
  { k: 'cake', e: '🍰', n: '草莓蛋糕', full: '一块草莓蛋糕', cost: 20, d: 15 },
]

// 会让小人当场做出反应的几种记录（其余是小人自己改安排的记录，只进日记）
export const PLAY_KINDS = ['button', 'feed', 'gift', 'note', 'poke', 'chat']

const V = {
  // user1：白发少年，软萌可爱、蓝眼睛，职业是代码小人
  u1: {
    button: {
      work: (l) => `呀，「${l}」！写代码都有力气啦～`,
      home: (l) => `「${l}」！好开心……心里暖暖的～`,
      sleep: (l) => `唔……（被「${l}」弄醒，迷迷糊糊地笑了）`,
    },
    feed: {
      work: (f) => `${f}！吃完我的 bug 好像都变少了～`,
      home: (f) => `${f}～好好吃！谢谢你呀！`,
      sleep: (f) => `（梦里好像吃到了${f}……嘿嘿）`,
    },
    gift: (g) => `哇，${g}！我要宝贝一辈子！`,
    note: () => '（偷偷展开纸条……小脸红扑扑的）',
    // 被戳的默认台词（自己没写的时候用）：平时 / 睡着时 / 被连戳烦了
    poke: ['呀！', '嘿嘿，好痒～', '再戳我就要咬你了哦'],
    pokeZ: ['唔……再睡五分钟～', '（梦里嘿嘿笑了一下）'],
    annoyed: ['呜……别戳啦！我要生气啦！', '再戳我就不理你了！哼～', '戳戳戳，你是不是没事干呀'],
    d: {
      button: (u, l) => `${u} 对我用了「${l}」！开心得敲错了好几行代码～`,
      feed: (u, f, d) => `${u} 喂了我${f}，好幸福！心情 +${d}。`,
      gift: (u, g) => `${u} 送了我${g}！已经小心翼翼摆进房间啦。`,
      note: (u) => `${u} 塞给我一张小纸条，偷偷看了好几遍。`,
      poke: (u, line, annoyed) => (annoyed ? `被 ${u} 连着戳了好几下，` : `被 ${u} 戳了一下，`) + (line ? `我说：“${line}”` : annoyed ? '有点生气了！' : '脸红了……'),
      chat: (u, q, a) => `${u}：“${q}”　我：“${a}”`,
      scene: (s) => `今天要去${s}写代码啦，加油～`,
      theme: (t) => `房间换成了${t}墙纸，好可爱！`,
      btns: (l) => `今天准备的互动是：${l}，快来找我玩～`,
      sched: (w, o) => `作息改成 ${w} 上班、${o} 下班啦。`,
    },
    fb: {
      work: ['在写代码呀～你呢你呢？', '这个 bug 有点凶……但我不怕！', '你来看我啦，好开心～'],
      home: ['下班啦～今天也辛苦你了！', '我在听歌，要不要一起听？', '今天的你也很可爱哦～'],
    },
    zzz: 'Zzz……（软软地翻了个身）唔……',
  },
  // user2：黑发少年，摇滚乐手、高冷，职业是打工小人
  u2: {
    button: {
      work: (l) => `「${l}」……上班呢。放那儿吧。`,
      home: (l) => `「${l}」。……还行。`,
      sleep: (l) => `……（被「${l}」吵醒，皱了下眉，翻身继续睡）`,
    },
    feed: {
      work: (f) => `${f}。……谢了。别让店长看见。`,
      home: (f) => `${f}。味道不错。别告诉别人我吃完了。`,
      sleep: (f) => `（闻到${f}的味道，没睁眼，嘴角动了一下）`,
    },
    gift: (g) => `${g}。……谢了。我会放在显眼的地方。`,
    note: () => '……（看完纸条，折好塞进了琴包）',
    poke: ['干嘛。', '别戳了。……再戳一下也行。', '嗯？'],
    pokeZ: ['……（皱眉，没醒）', '……别闹。困。'],
    annoyed: ['……够了。', '再戳我就戴耳机了。', '说了别戳。……听不懂？'],
    d: {
      button: (u, l) => `${u} 对我用了「${l}」。表面没反应，其实记住了。`,
      feed: (u, f, d) => `${u} 投喂了${f}。没说谢谢，但吃得很干净。心情 +${d}。`,
      gift: (u, g) => `${u} 送了我${g}。摆在了最显眼的地方。`,
      note: (u) => `${u} 给我塞了一张纸条。我折好收起来了。`,
      poke: (u, line, annoyed) => (annoyed ? `被 ${u} 连着戳了好几下。` : `被 ${u} 戳了一下。`) + (line ? `我说：“${line}”` : '……哼。'),
      chat: (u, q, a) => `${u}：“${q}”　我：“${a}”`,
      scene: (s) => `被安排去${s}打工。行。`,
      theme: (t) => `房间换成了${t}墙纸。……还不错。`,
      btns: (l) => `今天准备的互动是：${l}。`,
      sched: (w, o) => `作息改成 ${w} 上班、${o} 下班。`,
    },
    fb: {
      work: ['在上班。别烦我。……晚点再聊。', '今天店里很吵，没我的鼓点吵。', '你来看我了？……嗯。'],
      home: ['回来了。琴弦今天手感不错。', '你今天怎么样？……随便问问。', '要不要一起听歌。'],
    },
    zzz: 'Zzz……（戴着耳机睡着了）',
  },
}

// [匹配的词, 代码小人（软萌）怎么回, 打工小人（摇滚）怎么回]
const RULES = [
  [/累|困|辛苦|烦/, '呜……累了就靠着我嘛，我陪你～', '累了就歇会儿。……我陪你。'],
  [/想你|想我|喜欢/, '我也想你！！超级超级想！', '……嗯。我也是。别说出去。'],
  [/吃|饿|饭/, '我想吃草莓蛋糕～你请客吗？', '刚吃了泡面。别管我。'],
  [/加油|努力/, '嗯嗯！我会努力的！你也要加油哦～', '嗯。你也别太拼。'],
  [/晚安|睡/, '晚安～梦里见哦 ⭐', '晚安。别熬夜，不要学我。'],
  [/你好|嗨|在吗|hi|hello/i, '嗨嗨！你来看我啦！', '哟。在。'],
]

const voice = (slot) => V[slot] || V.u1
// 小人在 work / sleep 以外的状态（在家、玩耍、放空）说话都按「在家」的口吻
const stKey = (st) => (st === 'work' || st === 'sleep' ? st : 'home')

/** 默认的被戳台词（编辑区的灰色提示用）：{ work, home, sleep, annoyed } */
export function defaultPokes(slot) {
  const v = voice(slot)
  return { work: v.poke, home: v.poke, sleep: v.pokeZ, annoyed: v.annoyed }
}

/**
 * 被戳时说哪一句。st = 小人此刻的状态；annoyed = 是不是被连戳烦了；lines = 这个小人自己写的（可能没有）
 * 先从自己写的那一套里随机挑一句；那套没写，就用默认台词
 */
export function pokeLine(slot, st, annoyed, lines) {
  const v = voice(slot)
  const set = annoyed ? 'annoyed' : stKey(st)
  const mine = lines && Array.isArray(lines[set]) ? lines[set].filter((s) => typeof s === 'string' && s.trim() !== '').map((s) => s.trim()) : []
  if (mine.length) return pick(mine)
  if (st === 'sleep') return pick(v.pokeZ)
  return pick(annoyed ? v.annoyed : v.poke)
}
/** 互动按钮的默认回应（编辑区的灰色提示用）：{ work, home, sleep } */
export function defaultBtnLines(slot, e, t) {
  const v = voice(slot)
  const label = `${e || ''}${t || ''}`
  return { work: v.button.work(label), home: v.button.home(label), sleep: v.button.sleep(label) }
}

/**
 * 这个按钮、这个状态下，主人自己写的回应（没写返回空字符串）。
 * settings = 小人主人的设定（buttons + btn_lines）；st = 小人此刻的状态
 */
export function buttonLine(settings, st, e, t) {
  if (!settings || !Array.isArray(settings.buttons) || !Array.isArray(settings.btn_lines)) return ''
  const i = settings.buttons.findIndex((b) => b && b.e === e && b.t === t)
  const o = i >= 0 ? settings.btn_lines[i] : null
  const v = o && typeof o[stKey(st)] === 'string' ? o[stKey(st)].trim() : ''
  return v
}

// 日记里的时间点：服务端存的是数字（24 以上 = 次日）
const hh = (v) => (v == null || v === '' || !Number.isFinite(+v) ? '' : hourText(+v))
const giftOf = (k) => GIFTS.find((g) => g.k === k)
const foodOf = (k) => FOODS.find((f) => f.k === k)

/** 聊天回复。st = 小人此刻在 'work' / 'home' / 'sleep' */
export function chatReply(slot, st, q) {
  const v = voice(slot)
  if (st === 'sleep') return v.zzz
  const idx = slot === 'u2' ? 2 : 1
  for (const r of RULES) if (r[0].test(q)) return r[idx]
  return pick(v.fb[stKey(st)])
}

/**
 * settings（可选）= 这个小人主人的设定：按钮有没有自己写的回应，有就用，没有用默认模板
 * 一次互动之后，这个小人应该怎么反应：
 * { drop: 掉下来的东西（可选）, react: 蹦跳时长, blush: 脸红时长, hearts: 爱心个数, text: 气泡里的话, dur: 气泡停留秒数 }
 * kind / data 和服务器日记里存的一样：
 *   button { e, t }  feed { food }  gift { gift }  note {}  poke {}  chat { q, a }
 */
export function reactionFor(slot, st, kind, data, settings) {
  const v = voice(slot)
  const s = stKey(st)
  const d = data || {}
  if (kind === 'button') {
    const mine = buttonLine(settings, st, d.e, d.t)
    return { react: 1, hearts: 4, text: mine || v.button[s](`${d.e || ''}${d.t || ''}`), dur: mine ? 4.2 : undefined }
  }
  if (kind === 'feed') {
    const f = foodOf(d.food)
    return { drop: d.food === 'bread' ? 'bread' : 'box', react: 0.9, hearts: 5, text: v.feed[s](f ? f.full : '点心') }
  }
  if (kind === 'gift') {
    const g = giftOf(d.gift)
    return { drop: 'box', react: 1.2, hearts: 8, text: v.gift(g ? g.n : '礼物') }
  }
  if (kind === 'note') return { drop: 'note', react: 0.6, blush: 3, hearts: 3, text: v.note() }
  if (kind === 'poke') {
    // data.line 是 TA 戳的那一刻就挑好的那句（也存进了日记），两边屏幕上说的是同一句；老记录没有就现挑一句默认的
    const text = d.line ? String(d.line) : pokeLine(slot, st, !!d.annoyed, null)
    return d.annoyed ? { react: 0.9, hearts: 0, text, dur: 4.2 } : { react: 0.6, blush: 1.5, hearts: 2, text, dur: 4.2 }
  }
  if (kind === 'chat') return { react: 0.3, text: String(d.a || ''), dur: 4.5 }
  return null
}

/**
 * 日记里的一句话。owner = 这是谁的小人的日记（决定口吻），actorName = 做这件事的人叫什么
 * 认不出来的记录返回空字符串（界面上直接跳过）
 */
export function logLine(entry, ownerSlot, actorName, settings) {
  const d = voice(ownerSlot).d
  const x = entry.data || {}
  switch (entry.kind) {
    case 'button': {
      const base = d.button(actorName, `${x.e || ''}${x.t || ''}`)
      // 服务端只记了「点了哪个按钮」，当时小人在干嘛按记录的时间用现在的作息推一下；推不出来 / 没写就不加
      const t = entry.created_at ? new Date(entry.created_at) : null
      if (!settings || !t || Number.isNaN(t.getTime())) return base
      const mine = buttonLine(settings, stateOf(settings, t.getHours() + t.getMinutes() / 60), x.e, x.t)
      return mine ? `${base}我说：“${mine}”` : base
    }
    case 'feed': { const f = foodOf(x.food); return d.feed(actorName, f ? f.full : '点心', x.gain == null ? '' : x.gain) }
    case 'gift': { const g = giftOf(x.gift); return d.gift(actorName, g ? g.n : '礼物') }
    case 'note': return d.note(actorName)
    case 'poke': return d.poke(actorName, x.line ? String(x.line) : '', !!x.annoyed)
    case 'chat': return d.chat(actorName, String(x.q || ''), String(x.a || ''))
    case 'scene': return d.scene(SCENES[x.scene] || '新的地方')
    case 'theme': return d.theme({ cream: '奶油', mint: '薄荷', night: '星空' }[x.theme] || '新')
    case 'btns': return d.btns(Array.isArray(x.buttons) ? x.buttons.map((b) => `${b.e || ''}${b.t || ''}`).join('、') : '')
    case 'sched': return d.sched(hh(x.work), hh(x.off))
    default: return ''
  }
}