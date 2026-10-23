/* ===========================================================================
   像素小屋 · 预设：一键套用一整套安排
   - 日常预设：只改「上班地点 + 作息」，不动你的墙纸和互动按钮（那些是你自己编辑过的）
   - 特殊日 / 纪念日：整套都换（上班地点、墙纸、作息、3 个互动按钮）
   套用只是把整套值放进「草稿」，小人马上预览，还没保存；不喜欢点「还原」就回去了。
   所有作息都满足：起床 ≤ 上班 < 下班 ≤ 睡觉（见 art.js 的 checkSchedule）。
   这个文件不碰界面也不碰服务器。
   =========================================================================== */

export const DAILY_PRESETS = [
  { id: 'std', e: '🏢', n: '标准班', d: '7 点上班 · 17 点下班', set: { work_scene: 'office', wake_h: 6, work_h: 7, off_h: 17, sleep_h: 23 } },
  { id: 'early', e: '🌅', n: '早鸟', d: '6 点上班 · 15 点下班', set: { work_scene: 'office', wake_h: 5, work_h: 6, off_h: 15, sleep_h: 22 } },
  { id: 'late', e: '🌙', n: '晚班', d: '12 点上班 · 21 点下班', set: { work_scene: 'cafe', wake_h: 9, work_h: 12, off_h: 21, sleep_h: 23 } },
  { id: 'ot', e: '🔥', n: '加班日', d: '8 点上班 · 21 点下班', set: { work_scene: 'office', wake_h: 7, work_h: 8, off_h: 21, sleep_h: 23 } },
  { id: 'easy', e: '🐟', n: '摸鱼日', d: '10 点上班 · 16 点下班', set: { work_scene: 'cafe', wake_h: 8, work_h: 10, off_h: 16, sleep_h: 23 } },
]

export const SPECIAL_PRESETS = [
  {
    id: 'anniv', e: '💕', n: '纪念日', d: '咖啡馆 · 星空墙纸 · 早点下班',
    set: {
      work_scene: 'cafe', home_theme: 'night', wake_h: 8, work_h: 10, off_h: 15, sleep_h: 23,
      buttons: [{ e: '🌹', t: '送一朵花' }, { e: '💌', t: '读情书' }, { e: '🥂', t: '干杯' }],
    },
  },
  {
    id: 'bday', e: '🎂', n: '生日', d: '奶油墙纸 · 14 点下班',
    set: {
      work_scene: 'cafe', home_theme: 'cream', wake_h: 9, work_h: 11, off_h: 14, sleep_h: 23,
      buttons: [{ e: '🎂', t: '吹蜡烛' }, { e: '🎁', t: '拆礼物' }, { e: '🎉', t: '唱生日歌' }],
    },
  },
  {
    id: 'date', e: '🌃', n: '约会夜', d: '星空墙纸 · 16 点下班',
    set: {
      work_scene: 'office', home_theme: 'night', wake_h: 7, work_h: 9, off_h: 16, sleep_h: 23,
      buttons: [{ e: '🍷', t: '碰杯' }, { e: '🎬', t: '看电影' }, { e: '🌟', t: '看星星' }],
    },
  },
  {
    id: 'lazy', e: '🛋️', n: '躺平日', d: '薄荷墙纸 · 只上 2 小时班',
    set: {
      work_scene: 'cafe', home_theme: 'mint', wake_h: 10, work_h: 13, off_h: 15, sleep_h: 23,
      buttons: [{ e: '🛋️', t: '一起躺' }, { e: '🍿', t: '递爆米花' }, { e: '😴', t: '陪睡觉' }],
    },
  },
]

export const ALL_PRESETS = [...DAILY_PRESETS, ...SPECIAL_PRESETS]

/** 把预设套到草稿上，返回新草稿（预设里没写的项保持原样） */
export function applyPreset(draft, preset) {
  return { ...draft, ...preset.set, buttons: preset.set.buttons ? preset.set.buttons.map((b) => ({ ...b })) : draft.buttons }
}

/** 草稿现在正好是哪个预设（用来高亮）；对不上就返回 null */
export function activePreset(draft) {
  if (!draft) return null
  return ALL_PRESETS.find((p) => Object.keys(p.set).every((k) => {
    if (k === 'buttons') return JSON.stringify(p.set.buttons) === JSON.stringify(draft.buttons.map(({ e, t }) => ({ e, t })))
    return draft[k] === p.set[k]
  })) || null
}

/** 换墙纸的时候，墙纸只在「家里」看得到：给一个落在家里的预览时间，没有就返回 null */
export function homeHour(s) {
  if (s.sleep_h > s.off_h) return (s.off_h + s.sleep_h) / 2 // 下班后到睡觉前
  if (s.work_h > s.wake_h) return (s.wake_h + s.work_h) / 2 // 起床后到上班前
  return null
}