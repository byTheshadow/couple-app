/* 每天的内容：十一月来自 docs/november_content.py（30 天，真实节日与史实），
   别的月份退到一条冷知识。两条路都按日期算，两边一致、不联网也拿得到。 */
import { NOVEMBER } from '../data/november.js'
import { pickDaily, parseDay } from './calendar.js'

const BY_DAY = new Map(NOVEMBER.map((x) => [x.day, x]))

/* 十一月之外的日子：冷知识。一条一行，读完要「哦」一下 */
export const FACTS = [
  '章鱼有三个心脏，血是蓝色的。',
  '月亮每年离地球远 3.8 厘米。',
  '蜂蜜放三千年也坏不了。',
  '香蕉是浆果，草莓不是。',
  '蜂鸟是唯一会倒着飞的鸟。',
  '打哈欠会传染，狗也会被传染。',
  '一棵大树一天要喝掉两百多升水。',
  '你手机算得比登月那台电脑快几百万倍。',
  '雨的味道来自土壤里的放线菌。',
  '一张纸大概对折七次就到头了。',
  '考拉的指纹和人的几乎分不出来。',
  '一天其实只有 23 小时 56 分 4 秒。',
  '人的骨头比混凝土更抗压。',
  '蓝鲸的心脏有一辆小汽车那么大。',
  '地球上的蚂蚁加起来，和人的总重量差不多。',
  '你一天大约眨眼两万次，每次 0.1 秒。',
  '银河系和仙女座星系大约 45 亿年后会撞上。',
  '一杯水里就有几十亿个水分子。',
  '你的血管接起来可以绕地球两圈半。',
  '把地球的水均匀铺开，大约有 3.7 公里深。'
]

/** 每天一张：十一月的日子用那天的故事，其余月份用一条冷知识 */
export function dailyCard(key) {
  const { m, d } = parseDay(key)
  const story = m === 11 ? BY_DAY.get(d) : null
  if (story) {
    return {
      kind: 'story',
      title: story.title,
      sub: story.sub,
      body: story.story,
      festivals: story.festivals,
      sources: story.sources
    }
  }
  return {
    kind: 'fact',
    title: '今天的小知识',
    sub: '',
    body: [pickDaily(key, FACTS)],
    festivals: [],
    sources: []
  }
}