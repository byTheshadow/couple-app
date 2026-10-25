/* 换装：衣服的数据格式、校验、注册表
 *
 * 一件衣服 = 16 宽的一块字符画 + 自己的调色板（见 docs/outfit-design.md）：
 *   { slot, y0, pal: ['#rrggbb', ...], rows: ['................', ...] }
 *   rows 里 '.' = 不画，'a'..'h' = pal[0..7]
 * 画的时候只落在身体轮廓内：不盖头发、不盖皮肤，配饰不盖五官（见 art.js 的 drawWorn）。
 */

export const SLOT_KEYS = ['top', 'bottom', 'shoes', 'acc']
export const SLOT_NAMES = { top: '上装', bottom: '下装', shoes: '鞋', acc: '配饰' }
export const SLOT_HINT = { top: '12~20 行', bottom: '17~20 行', shoes: '21~22 行', acc: '0~4 或 11~14 行' }
// 每个部位允许画的行（闭区间），一件衣服必须整块落在一个区间里
export const SLOT_RANGES = { top: [[12, 20]], bottom: [[17, 20]], shoes: [[21, 22]], acc: [[0, 4], [11, 14]] }
// 叠的先后：下装 → 鞋 → 上装 → 配饰
export const SLOT_Z = { bottom: 0, shoes: 1, top: 2, acc: 3 }

export const OUTFIT_W = 16
export const OUTFIT_H = 23
export const OUTFIT_MAX_ROWS = 9
export const OUTFIT_MAX_PAL = 8
export const OUTFIT_MAX = 12 // 每个部位最多存几件
export const OUTFIT_BYTES = 2000 // 一件衣服序列化后的大小上限

const w16 = (s) => {
  if (typeof s !== 'string' || s.length !== OUTFIT_W) throw new Error('衣服的每一行必须正好 16 格：' + s)
  return s
}

/* ---------- 内置衣服（两个人都有，不用存数据库） ---------- */

export const BUILTINS = [
  {
    id: 'b:sweater', name: '粗针毛衣', slot: 'top',
    data: {
      slot: 'top', y0: 12,
      pal: ['#c96a4a', '#a8503a', '#e8a37f'],
      rows: [
        '....aabccbaa....',
        '...aaabccbaaa...',
        '..aabbccccbbaa..',
        '..aabbccccbbaa..',
        '..aabbbbbbbbaa..',
        '....bbbbbbbb....',
      ].map(w16),
    },
  },
  {
    id: 'b:dress', name: '长连衣裙', slot: 'top',
    data: {
      slot: 'top', y0: 12,
      pal: ['#2f7d6b', '#22604f', '#3f9a84'],
      rows: [
        '....aabccbaa....',
        '...aaabccbaaa...',
        '..aabbccccbbaa..',
        '..aabbccccbbaa..',
        '..aabbbbbbbbaa..',
        '....aaaaaaaa....',
        '...aaaaaaaaaa...',
        '..aaaaaaaaaaaa..',
        '..bbbbbbbbbbbb..',
      ].map(w16),
    },
  },
  {
    id: 'b:skirt', name: '直筒裙', slot: 'bottom',
    data: {
      slot: 'bottom', y0: 17,
      pal: ['#7b4fa6', '#5d3a80'],
      rows: [
        '....aaaaaaaa....',
        '...aaaaaaaaaa...',
        '..aaaaaaaaaaaa..',
        '..bbbbbbbbbbbb..',
      ].map(w16),
    },
  },
  {
    id: 'b:pants', name: '宽松长裤', slot: 'bottom',
    data: {
      slot: 'bottom', y0: 17,
      pal: ['#4b6a98', '#33507a'],
      rows: [
        '....aaaaaaaa....',
        '....aaaaaaaa....',
        '...aaaabbaaaa...',
        '...bbbb..bbbb...',
      ].map(w16),
    },
  },
  {
    id: 'b:sneaker', name: '白球鞋', slot: 'shoes',
    data: {
      slot: 'shoes', y0: 21,
      pal: ['#f2f2f2', '#9aa3b0'],
      rows: [
        '....aaa..aaa....',
        '...bbbb..bbbb...',
      ].map(w16),
    },
  },
  {
    id: 'b:beanie', name: '毛线帽', slot: 'acc',
    data: {
      slot: 'acc', y0: 0,
      pal: ['#3f7fbf', '#2f5f93'],
      rows: [
        '.....aaaaaa.....',
        '...aaaaaaaaaa...',
        '..aaaaaaaaaaaa..',
        '..bbbbbbbbbbbb..',
      ].map(w16),
    },
  },
  {
    id: 'b:scarf', name: '围巾', slot: 'acc',
    data: {
      slot: 'acc', y0: 11,
      pal: ['#e0b13c', '#b8892a'],
      rows: [
        '..aaaaaaaaaaaa..',
        '....aaaaaaaa....',
      ].map(w16),
    },
  },
  {
    id: 'b:striped', name: '条纹毛衣', slot: 'top',
    data: {
      slot: 'top', y0: 12,
      pal: ['#4a7fc1', '#2f5a8c'],
      rows: [
        '....aaaaaaaa....',
        '...aaaaaaaaaa...',
        '...bbbbbbbbbb...',
        '...aaaaaaaaaa...',
        '...bbbbbbbbbb...',
        '....bbbbbbbb....',
      ].map(w16),
    },
  },
  {
    id: 'b:check', name: '格纹衬衫', slot: 'top',
    data: {
      slot: 'top', y0: 12,
      pal: ['#e6dfd0', '#c26b64'],
      rows: [
        '....abababab....',
        '...ababababab...',
        '...bababababa...',
        '...ababababab...',
        '...bababababa...',
        '....abababab....',
      ].map(w16),
    },
  },
  {
    id: 'b:hoodie', name: '连帽卫衣', slot: 'top',
    data: {
      slot: 'top', y0: 12,
      pal: ['#5b8f6f', '#3f6b52'],
      rows: [
        '....aabbbbaa....',
        '...aaabbbbaaa...',
        '...aaaaaaaaaa...',
        '...aabbbbbbaa...',
        '...aabbbbbbaa...',
        '....aaaaaaaa....',
      ].map(w16),
    },
  },
  {
    id: 'b:trench', name: '长风衣', slot: 'top',
    data: {
      slot: 'top', y0: 12,
      pal: ['#c9a06a', '#8f6b42', '#5a4327'],
      rows: [
        '....aabbbbaa....',
        '...aabbbbbbaa...',
        '...aaaaaaaaaa...',
        '...aaaaaaaaaa...',
        '...cccccccccc...',
        '...aaaaaaaaaa...',
        '...aaaaaaaaaa...',
        '...aaaaaaaaaa...',
        '...bbbbbbbbbb...',
      ].map(w16),
    },
  },
  {
    id: 'b:pleat', name: '百褶裙', slot: 'bottom',
    data: {
      slot: 'bottom', y0: 17,
      pal: ['#c25b7c', '#8f3d57'],
      rows: [
        '....abababab....',
        '...ababababab...',
        '..abababababab..',
        '..bbbbbbbbbbbb..',
      ].map(w16),
    },
  },
  {
    id: 'b:cuffpants', name: '卷边长裤', slot: 'bottom',
    data: {
      slot: 'bottom', y0: 17,
      pal: ['#3f5d8c', '#2b4166'],
      rows: [
        '....aaaaaaaa....',
        '....aaaaaaaa....',
        '...aaaaaaaaaa...',
        '...bbbb..bbbb...',
      ].map(w16),
    },
  },
  {
    id: 'b:canvas', name: '红帆布鞋', slot: 'shoes',
    data: {
      slot: 'shoes', y0: 21,
      pal: ['#c0392b', '#f5f5f5'],
      rows: [
        '....aaa..aaa....',
        '...bbbb..bbbb...',
      ].map(w16),
    },
  },
  {
    id: 'b:boots', name: '短靴', slot: 'shoes',
    data: {
      slot: 'shoes', y0: 21,
      pal: ['#4a3728', '#2a1f16'],
      rows: [
        '...aaaa..aaaa...',
        '...bbbb..bbbb...',
      ].map(w16),
    },
  },
  {
    id: 'b:beret', name: '贝雷帽', slot: 'acc',
    data: {
      slot: 'acc', y0: 0,
      pal: ['#b03a48', '#7d2733'],
      rows: [
        '.......aa.......',
        '....aaaaaaaa....',
        '...aaaaaaaaaa...',
        '...bbbbbbbbbb...',
      ].map(w16),
    },
  },
  {
    id: 'b:cat', name: '猫耳', slot: 'acc',
    data: {
      slot: 'acc', y0: 0,
      pal: ['#5c5c70', '#3a3a4a'],
      rows: [
        '....aa...aa.....',
        '....aaa.aaa.....',
        '..aaaaaaaaaaaa..',
        '..bbbbbbbbbbbb..',
      ].map(w16),
    },
  },
]

/* ---------- 校验：返回 ''（没问题）或一句人话 ---------- */

const HEX = /^#[0-9a-fA-F]{6}$/

/** 和 docs/outfit-design.md 第 3 节、服务端 pal_outfit_ok 同一套规则 */
export function validateOutfit(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return '衣服不是一份数据'
  const slot = d.slot
  if (!SLOT_KEYS.includes(slot)) return '部位只能是 top / bottom / shoes / acc'
  const pal = d.pal
  if (!Array.isArray(pal) || pal.length < 1 || pal.length > OUTFIT_MAX_PAL) return `颜色要 1~${OUTFIT_MAX_PAL} 个`
  if (!pal.every((c) => typeof c === 'string' && HEX.test(c))) return '颜色要写成 #rrggbb'
  const y0 = d.y0
  if (!Number.isInteger(y0) || y0 < 0) return '起始行不对'
  const rows = d.rows
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > OUTFIT_MAX_ROWS) return `行数要 1~${OUTFIT_MAX_ROWS}`
  if (y0 + rows.length > OUTFIT_H) return '超出小人高度'
  const bands = SLOT_RANGES[slot]
  if (!bands.some(([lo, hi]) => y0 >= lo && y0 + rows.length - 1 <= hi)) {
    return `${SLOT_NAMES[slot]}只能画在 ${SLOT_HINT[slot]}`
  }
  for (const r of rows) {
    if (typeof r !== 'string' || r.length !== OUTFIT_W) return '每一行要正好 16 格'
    for (const ch of r) {
      if (ch === '.') continue
      const i = ch.charCodeAt(0) - 97
      if (ch < 'a' || ch > 'h' || i >= pal.length) return '只能用 . 和调色板里的字母'
    }
  }
  if (JSON.stringify(d).length > OUTFIT_BYTES) return '这件衣服太大了'
  return ''
}

/* ---------- 注册表：内置的 + 从数据库读回来的 ---------- */

const USER = new Map() // id -> { id, name, slot, data }
const BUILTIN = new Map(BUILTINS.map((g) => [g.id, g]))

/** 读到一件自己/TA 的衣服就登记进来，之后设置里写它的 id 就能画出来 */
export function registerOutfit(id, item) {
  if (typeof id !== 'string' || !id || !item || !SLOT_KEYS.includes(item.slot)) return false
  USER.set(id, { id, name: item.name || '我的衣服', slot: item.slot, data: item.data })
  return true
}
export function unregisterOutfit(id) {
  USER.delete(id)
}
export function isBuiltin(id) {
  return BUILTIN.has(id)
}
export function outfitOf(id) {
  if (!id || typeof id !== 'string') return null
  return USER.get(id) || BUILTIN.get(id) || null
}

/** 把 {top,bottom,shoes,acc} 里的 id 解析成真衣服；找不到 / 部位对不上的直接跳过 */
export function resolveWorn(outfit) {
  if (!outfit || typeof outfit !== 'object') return []
  const out = []
  for (const k of SLOT_KEYS) {
    const g = outfitOf(outfit[k])
    if (g && g.slot === k) out.push(g)
  }
  return out.sort((a, b) => SLOT_Z[a.slot] - SLOT_Z[b.slot])
}

/** 存进 pal_settings.outfit 的整理版：只留四个 key，空的丢掉 */
export function outfitRow(worn) {
  const out = {}
  for (const k of SLOT_KEYS) {
    const id = worn && worn[k]
    if (typeof id === 'string' && id) out[k] = id
  }
  return out
}

/** 导入 / AI 产出的一份 JSON：可以带 name，取出来单独存 */
export function splitOutfitJson(raw) {
  const d = raw && typeof raw === 'object' ? raw : {}
  const name = typeof d.name === 'string' ? d.name.slice(0, 8) : ''
  const data = { slot: d.slot, y0: d.y0, pal: d.pal, rows: d.rows }
  return { name, data }
}

/* ---------- 给 AI 的提示词：让它吐一件能通过校验的衣服 ---------- */

const SLOT_TIPS = {
  top: '上装从肩膀（第 12 行）往下画，可以一直画到第 20 行做长裙/长风衣；不要盖住头发（第 0~11 行两侧垂下来的部分）和手（第 16 行最左/最右）。',
  bottom: '下装只画第 17~20 行、第 4~11 列（腿的位置）；裙子可以填满两条腿中间的空隙，长裤就分开画。',
  shoes: '鞋只画第 21~22 行、第 3~12 列；两只鞋中间留空，不要连成一块。',
  acc: '配饰二选一：帽子画在第 0~4 行（可以盖住头发），围巾/领子画在第 11~14 行（可以盖住脖子，但绝对不能盖住第 5~9 行的脸）。',
}

const SLOT_Y0 = { top: 12, bottom: 17, shoes: 21, acc: 0 }

/** 搭一份让模型照着写的提示词。retry = 上一次哪里不对（会附在最后让它改） */
export function outfitMessages(slot, idea, retry) {
  const name = SLOT_NAMES[slot] || '上装'
  const system = '你是一个像素画师，专门给 16×23 的像素小人设计衣服。你只输出一个 JSON 对象，不要 markdown 代码块，不要解释，不要多余的字。'
  const user = [
    `请设计一件「${name}」。想要的样子：${String(idea || '').trim() || '随便设计一件好看的'}`,
    '',
    '网格：宽 16 格，高 23 行（第 0 行是头顶，第 22 行是脚底）。',
    `这件「${name}」只能画在 ${SLOT_HINT[slot]}。`,
    '小人的身体大致占位：头在第 0~11 行、左右各留 2~3 格空白；肩膀从第 12 行开始，最宽到第 4~11 列；手在第 16 行最左最右；腿在第 17~20 行的第 4~11 列；鞋在第 21~22 行。',
    `落笔规则：${SLOT_TIPS[slot]}`,
    '格式规则：',
    "- rows 从 y0 开始往下排，每一行必须正好 16 个字符，也不能多也不能少",
    "- '.' 表示这里不画，其它字符表示颜色：'a' 是 pal 里的第 1 个颜色，'b' 是第 2 个……最多 8 个颜色",
    '- pal 里的颜色写成 #rrggbb',
    '- 画到身体外面的像素会被丢掉，所以别画太宽',
    '',
    '只输出这样的 JSON：',
    `{"name":"八个字以内的名字","slot":"${slot}","y0":${SLOT_Y0[slot]},"pal":["#c96a4a","#a8503a"],"rows":["................"]}`,
  ].join('\n')
  const msgs = [{ role: 'system', content: system }, { role: 'user', content: user }]
  if (retry) msgs.push({ role: 'user', content: `上一次的输出有问题：${retry}。请重新输出一个合格的 JSON，注意每一行必须正好 16 个字符。` })
  return msgs
}

/** 从模型回复里抠出 JSON（外面裹了 ```json 也能认） */
export function parseOutfitText(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start < 0 || end <= start) return { error: 'AI 没有给出 JSON' }
  let obj
  try {
    obj = JSON.parse(s.slice(start, end + 1))
  } catch {
    return { error: 'AI 给的 JSON 格式不对' }
  }
  if (!obj || typeof obj !== 'object') return { error: 'AI 给的不是一件衣服' }
  return { data: obj }
}
