/* ===========================================================================
   猫说话（第十五轮 · AI）
   - 由现在这套 AI 通道（ai.js 的 loadAi / aiReady / chat）生成，不另配一套
   - 一天一张：算出来就缓存在本机，同一天不重复请求
   - 没配 AI / 请求失败：不报错，退回写死的那句（catWhyLine）
   =========================================================================== */
import { loadAi, aiReady, chat } from './ai'
import { palCatSay } from './store'

const LS_KEY = 'pp.cat.voice.v1'
const KEEP = 40

function readAll() {
  try { return JSON.parse(window.localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
function writeAll(o) {
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(o)) } catch { /* 存不了就每次都问一遍 */ }
}

const whyText = (why) => ({
  both: '两个人指到了同一个地方，你就去了那儿',
  alone: '只有一个人指了，你就去了他指的地方',
  like: '那儿是你本来就喜欢的地方',
  disobey: '你今天不想听他们的，自己挑了自己最想去的地方',
  random: '两个地方你都不太想去，随便挑了一个',
}[why] || '你自己挑的')

/**
 * 生成（或读缓存）今天的一句话。
 * 返回 { text, ai, cached, error }；text 为空表示这次没说出来，界面该退回写死的那句。
 */
export async function catSay({ day, scene, sceneName, persona, why, myPick, taPick, together, rowSay, peerId }) {
  if (!day || !scene || !persona) return { text: '', ai: false, cached: false, error: null }
  // 服务端已经有了（对方生成过）：直接读，不再花任何人的额度
  if (rowSay) return { text: rowSay, ai: true, cached: true, error: null }
  const key = `${day}|${scene}|${persona.k}`
  const all = readAll()
  if (all[key]) return { text: all[key], ai: true, cached: true, error: null }

  const cfg = loadAi()
  if (!aiReady(cfg)) return { text: '', ai: false, cached: false, error: null }

  const sys = '你是一只住在别人家里的小猫。你说话短、具体、有点自说自话，不撒娇、不卖萌、不用 emoji、不说教。每次只说一到两句，总共不超过 40 个字。'
  const user = [
    `你是一只${persona.n}（${persona.note}）。`,
    `今天你去了「${sceneName}」。为什么：${whyText(why)}。`,
    myPick && taPick && myPick === taPick ? '两个人今天指到了同一个地方。' : '',
    myPick && taPick && myPick !== taPick ? '他们今天各指了一个地方，没商量好。' : '',
    together > 0 ? `他们今天在小屋里一起待了 ${together} 分钟。` : '',
    '用猫的口气说一句，像写在明信片背面。只输出这一句，不要引号，不要解释。',
  ].filter(Boolean).join('')

  const { error, text } = await chat(cfg, [{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: 200 })
  if (error || !text) return { text: '', ai: false, cached: false, error: error || null }

  const clean = String(text).replace(/^[\s"'「」『』]+|[\s"'「」『』]+$/g, '').slice(0, 60)
  if (!clean) return { text: '', ai: false, cached: false, error: null }
  all[key] = clean
  const keys = Object.keys(all)
  if (keys.length > KEEP) keys.slice(0, keys.length - KEEP).forEach((k) => { delete all[k] })
  writeAll(all)
  // 写回服务端：先写的算数，另一边之后直接读这一句
  let written = false
  if (peerId) {
    const { error: e2 } = await palCatSay(peerId, clean)
    written = !e2
  }
  return { text: clean, ai: true, cached: false, written, error: null }
}