/* ===========================================================================
   像素小屋 · 预设：一键套用一整套安排
   - 日常预设：只改「上班地点 + 作息」，不动你的墙纸、互动按钮和被戳反应（那些是你自己编辑过的）
   - 特殊日 / 纪念日：整套都换（上班地点、墙纸、作息、3 个互动按钮、被戳反应，有的还带玩耍/放空时段）
   - 我的预设：存的是你当时看到的整套，包括被戳反应、玩耍/放空时段和「放空去哪」（老预设没有的项，套用时不会动你现在的）
   套用只是把整套值放进「草稿」，小人马上预览，还没保存；不喜欢点「还原」就回去了。
   所有作息都满足：起床 ≤ 上班 < 下班 ≤ 睡觉 ≤ 起床+23（24 以上 = 次日，见 art.js 的 checkSchedule）。
   这个文件不碰界面也不碰服务器。
   =========================================================================== */

import { normalizeSettings, checkSchedule, fitWindows, compactPokeLines, cleanEmoji, cleanLabel, SCENES, pointText } from './art'

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const WIN_KEYS = ['play_from', 'play_to', 'idle_from', 'idle_to']

export const DAILY_PRESETS = [
  { id: 'std', e: '🏢', n: '标准班', d: '7 点上班 · 17 点下班', set: { work_scene: 'office', wake_h: 6, work_h: 7, off_h: 17, sleep_h: 23 } },
  { id: 'early', e: '🌅', n: '早鸟', d: '6 点上班 · 15 点下班', set: { work_scene: 'office', wake_h: 5, work_h: 6, off_h: 15, sleep_h: 22 } },
  { id: 'late', e: '🌙', n: '晚班', d: '12 点上班 · 21 点下班', set: { work_scene: 'cafe', wake_h: 9, work_h: 12, off_h: 21, sleep_h: 23 } },
  { id: 'ot', e: '🔥', n: '加班日', d: '8 点上班 · 21 点下班', set: { work_scene: 'office', wake_h: 7, work_h: 8, off_h: 21, sleep_h: 23 } },
  { id: 'easy', e: '🐟', n: '摸鱼日', d: '10 点上班 · 16 点下班', set: { work_scene: 'cafe', wake_h: 8, work_h: 10, off_h: 16, sleep_h: 23 } },
]

/*
  特殊日预设里的 pokes：{ u1: 代码小人（软萌）怎么说, u2: 打工小人（高冷）怎么说 }，每套最多 4 句、每句 ≤ 20 字。
  套用时按「你是谁」挑对应的那份，这样白发少年说话还是软萌的，黑发少年还是高冷的。
*/
export const SPECIAL_PRESETS = [
  {
    id: 'anniv', e: '💕', n: '纪念日', d: '咖啡馆 · 星空墙纸 · 早点下班 · 甜甜的被戳反应',
    set: {
      work_scene: 'cafe', home_theme: 'night', wake_h: 8, work_h: 10, off_h: 15, sleep_h: 23,
      buttons: [{ e: '🌹', t: '送一朵花' }, { e: '💌', t: '读情书' }, { e: '🥂', t: '干杯' }],
    },
    pokes: {
      u1: {
        work: ['上班也在偷偷想你～', '今天要早点见到你！'],
        home: ['今天是纪念日呀……心跳好快', '想一直一直和你在一起～', '我准备了好多爱心哦'],
        sleep: ['（梦里在和你过纪念日）'],
        annoyed: ['再戳我，我就亲你啦', '别戳啦，我脸要红透了'],
      },
      u2: {
        work: ['今天纪念日。……我记得。', '早点下班。'],
        home: ['……纪念日快乐。', '别说我肉麻。只说一次。', '你在就够了。'],
        sleep: ['（梦里也记得今天）'],
        annoyed: ['再戳，我就吻你。', '……闹够了没。'],
      },
    },
  },
  {
    id: 'bday', e: '🎂', n: '生日', d: '奶油墙纸 · 14 点下班 · 戳一下就是祝福',
    set: {
      work_scene: 'cafe', home_theme: 'cream', wake_h: 9, work_h: 11, off_h: 14, sleep_h: 23,
      buttons: [{ e: '🎂', t: '吹蜡烛' }, { e: '🎁', t: '拆礼物' }, { e: '🎉', t: '唱生日歌' }],
      play_from: 14, play_to: 18, idle_from: null, idle_to: null,
    },
    pokes: {
      u1: {
        work: ['生日快乐～上班也要开心！', '今天是最特别的一天！'],
        home: ['生日快乐生日快乐！', '许个愿吧，我陪你～', '蛋糕！我要吃蛋糕！'],
        sleep: ['（梦里在吹蜡烛）'],
        annoyed: ['再戳就把蛋糕分我一半！', '寿星也不能戳个没完啦'],
      },
      u2: {
        work: ['今天过生日。别提醒我。', '……生日快乐。'],
        home: ['生日快乐。蛋糕分你一半。', '许愿了。不告诉你。', '今天允许你多戳几下。'],
        sleep: ['（梦里有蜡烛的光）'],
        annoyed: ['寿星最大。……也别戳了。', '再戳，蛋糕没你的份。'],
      },
    },
  },
  {
    id: 'date', e: '🌃', n: '约会夜', d: '星空墙纸 · 16 点下班 · 带点期待',
    set: {
      work_scene: 'office', home_theme: 'night', wake_h: 7, work_h: 9, off_h: 16, sleep_h: 23,
      buttons: [{ e: '🍷', t: '碰杯' }, { e: '🎬', t: '看电影' }, { e: '🌟', t: '看星星' }],
    },
    pokes: {
      u1: {
        work: ['今晚有约会，好期待～', '快点下班快点下班！'],
        home: ['星星好漂亮，和你一起看', '今晚想牵着你的手～', '你来啦！我等好久了'],
        sleep: ['（梦里在和你看星星）'],
        annoyed: ['再戳我，约会要迟到啦', '戳戳戳，是想抱抱吗'],
      },
      u2: {
        work: ['晚上有约。别迟到。', '……在想今晚。'],
        home: ['今晚的星星不错。', '过来，坐我旁边。', '别看星星了，看我。'],
        sleep: ['（睡前还在想约会）'],
        annoyed: ['再戳，就不请你看电影。', '……手别乱动。'],
      },
    },
  },
  {
    id: 'lazy', e: '🛋️', n: '躺平日', d: '薄荷墙纸 · 只上 2 小时班 · 下班后先去海边放空再玩',
    set: {
      work_scene: 'cafe', home_theme: 'mint', wake_h: 10, work_h: 13, off_h: 15, sleep_h: 23,
      buttons: [{ e: '🛋️', t: '一起躺' }, { e: '🍿', t: '递爆米花' }, { e: '😴', t: '陪睡觉' }],
      idle_from: 15, idle_to: 17, play_from: 17, play_to: 20,
      idle_scene: 'beach', // 放空的时候整个画面换成海边
    },
    pokes: {
      u1: {
        work: ['今天不想工作……就两小时嘛', '上完班就躺平～'],
        home: ['躺平万岁～', '一起躺着不动好不好', '零食在这边……'],
        sleep: ['Zzz……躺平真好'],
        annoyed: ['别戳，躺平的人不想动', '戳我我也不起来哦'],
      },
      u2: {
        work: ['两小时。混过去。', '今天不想动。'],
        home: ['躺着。别叫我。', '……来，一起躺。', '今天什么都不做。'],
        sleep: ['……（睡得很沉）'],
        annoyed: ['别戳。躺平中。', '再戳我装死。'],
      },
    },
  },
]

export const ALL_PRESETS = [...DAILY_PRESETS, ...SPECIAL_PRESETS]

/* ---------- 我的预设（存在服务器上，两台设备都能用，只有自己看得到） ---------- */

export const MAX_PRESETS = 8
const SCENE_NAME = SCENES
const THEME_NAME = { cream: '奶油', mint: '薄荷', night: '星空' }

const describe = (s) => `${SCENE_NAME[s.work_scene] || ''} · ${THEME_NAME[s.home_theme] || ''}墙纸 · ${pointText(s.work_h)}上班 ${pointText(s.off_h)}下班`

/** 把当前草稿存成一套预设。id 不给就新生成一个 */
export function makeCustomPreset(draft, emoji, name, id) {
  const set = {
    work_scene: draft.work_scene, home_theme: draft.home_theme,
    idle_scene: draft.idle_scene || null,
    wake_h: draft.wake_h, work_h: draft.work_h, off_h: draft.off_h, sleep_h: draft.sleep_h,
    buttons: draft.buttons.map(({ e, t }) => ({ e, t })),
    play_from: draft.play_from == null ? null : draft.play_from,
    play_to: draft.play_to == null ? null : draft.play_to,
    idle_from: draft.idle_from == null ? null : draft.idle_from,
    idle_to: draft.idle_to == null ? null : draft.idle_to,
    poke_lines: compactPokeLines(draft.poke_lines),
  }
  return { id: id || `u${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, e: emoji, n: name, d: describe(set), set, mine: true }
}

/** 服务器里的一项（扁平的）→ 界面用的预设；内容不合规就返回 null（直接跳过） */
export function presetFromRow(row, slot) {
  if (!row || typeof row !== 'object') return null
  const n = cleanLabel(row.n)
  const e = cleanEmoji(row.e)
  if (!n || !e || typeof row.id !== 'string') return null
  const t = normalizeSettings(row, slot)
  if (checkSchedule(t)) return null
  const p = makeCustomPreset(t, e, n, row.id)
  // 第四轮之前存的老预设没有这两项：套用时不去动你现在的被戳反应和玩耍/放空时段
  if (!has(row, 'poke_lines')) delete p.set.poke_lines
  if (!WIN_KEYS.some((k) => has(row, k))) WIN_KEYS.forEach((k) => { delete p.set[k] })
  // 第五轮之前存的老预设没有「放空去哪」：套用时不去动你现在选的
  if (!has(row, 'idle_scene')) delete p.set.idle_scene
  return p
}

/** 界面用的预设 → 服务器里的一项（扁平的） */
export const presetToRow = (p) => ({ id: p.id, n: p.n, e: p.e, ...p.set })

/** 这套预设在某个小人身上的实际内容：内置的特殊日按 slot 挑对应的被戳反应，「我的预设」本来就是整套存好的 */
const resolveSet = (preset, slot) => {
  const pk = preset.pokes && (preset.pokes[slot] || preset.pokes.u1)
  return pk ? { ...preset.set, poke_lines: pk } : preset.set
}

/**
 * 把预设套到草稿上，返回新草稿（预设里没写的项保持原样）。
 * 作息变了以后对不上的玩耍/放空时段会被取消（时段必须完整落在在家的时间里）
 */
export function applyPreset(draft, preset, slot) {
  const set = resolveSet(preset, slot)
  const buttons = set.buttons ? set.buttons.map((b) => ({ ...b })) : draft.buttons
  // 按钮换成了别的，原来写的「点了说什么」就对不上了，清掉；按钮没变就保留
  const sameBtns = JSON.stringify(buttons.map(({ e, t }) => ({ e, t }))) === JSON.stringify(draft.buttons.map(({ e, t }) => ({ e, t })))
  const next = {
    ...draft,
    ...set,
    buttons,
    btn_lines: sameBtns ? (draft.btn_lines || [{}, {}, {}]) : [{}, {}, {}],
    poke_lines: set.poke_lines ? compactPokeLines(set.poke_lines) : draft.poke_lines,
  }
  return fitWindows(next)
}

/** 草稿现在正好是哪个预设（用来高亮）；对不上就返回 null。list 是要比对的预设（默认只比内置的） */
export function activePreset(draft, list = ALL_PRESETS, slot = 'u1') {
  if (!draft) return null
  const mineLines = JSON.stringify(compactPokeLines(draft.poke_lines))
  return list.find((p) => {
    const set = resolveSet(p, slot)
    return Object.keys(set).every((k) => {
      if (k === 'buttons') return JSON.stringify(set.buttons) === JSON.stringify(draft.buttons.map(({ e, t }) => ({ e, t })))
      if (k === 'poke_lines') return JSON.stringify(compactPokeLines(set.poke_lines)) === mineLines
      return draft[k] === set[k]
    })
  }) || null
}

/** 换墙纸的时候，墙纸只在「家里」看得到：给一个落在家里的预览时间（钟点 0~24），没有就返回 null */
export function homeHour(s) {
  const mid = (f, t) => (((f + t) / 2) % 24)
  if (s.sleep_h > s.off_h) return mid(s.off_h, s.sleep_h) // 下班后到睡觉前（可能已经过了午夜）
  if (s.work_h > s.wake_h) return mid(s.wake_h, s.work_h) // 起床后到上班前
  return null
}