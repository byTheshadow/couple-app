/* ===========================================================================
   小物 · 一起跳一跳（抽屉第 08 格）
   - 一条共享的路：seed / platform / score 都在 pal_jump_run 的一行里，两个人异步接力
   - 生成 / 物理 / 题库 / 画面分别在 jump/ 下面，这里只管：画布循环、蓄力、答题卡、RPC
   - 落地先提交 RPC，成功才允许下一跳；stale = TA 先跳了，直接跟到新位置
   - 规则见 docs/jump-design.md，SQL 见 docs/jump-design.sql
   =========================================================================== */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { Svg } from './Icon'
import { buildRoad, SECTIONS, sectionOf, pickupAt, PICKUP_UP, PICKUP_R } from './jump/gen'
import {
  VIEW, PHYS, powerOf, velocityOf, widthOf, platformX, jumpGain,
  stepBall, hitPlatform, SPRING_GAIN,
} from './jump/engine'
import { questionAt, giftAt } from './jump/quiz'
import { createSfx } from './jump/sfx'
import { drawScene, drawBackdrop } from './jump/draw'
import { loadState, submitStepRetry, resetRun, takeTurn, handoffTurn, restartRun, guardFall, useBag, buyJet, useJet } from '../lib/jumpStore'
import './jump.css'

const W = VIEW.W
const H = VIEW.H
const CAM = VIEW.camX

/* ---------- 一局的内存状态（不进 React，每帧直接改） ---------- */
function makeGame(seed, platform) {
  const road = buildRoad(seed, Math.max(40, platform + 28))
  const p = road[Math.min(platform, road.length - 1)]
  const sec = sectionOf(platform)
  return {
    seed,
    sec,
    skyFrom: sec,
    skyTo: sec,
    skyMix: 1,
    skyAt: 0,
    road,
    idx: platform,
    x: p.x,
    y: p.y,
    vx: 0,
    vy: 0,
    mode: 'idle',
    from: platform,
    power: 0,
    held: 0,
    chargeAt: 0,
    cam: p.x - CAM,
    t: 0,
    landAt: 0,
    springAt: 0,
    fallAt: 0,
    hop: null,
    auto: false,
    combo: 0,
    narrow: {},
    snap: -1,
    // v4：这一跳吃到的拾取物 / 已经吃掉的那些块（同一局不再刷出来）
    picked: 0,
    got: {},
    jet: null,
    particles: [],
    floats: [],
    trail: [],
    squash: 0,
    shake: 0,
  }
}

/* 路是顺序生成的：快用到头了就多生成一些。换 seed 时整条重建。 */
function ensureRoad(g, i) {
  if (i + 10 >= g.road.length) g.road = buildRoad(g.seed, i + 30)
  return g.road[Math.max(0, Math.min(i, g.road.length - 1))]
}

function burst(g, x, y, color, n, speed, size) {
  for (let i = 0; i < n; i++) {
    if (g.particles.length >= 140) return
    const a = Math.random() * Math.PI * 2
    const v = speed * (0.35 + Math.random() * 0.85)
    g.particles.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
      life: 0.4, max: 0.4, color, size: size || 2,
    })
  }
}

function ring(g, x, y, color, n, r, size) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.particles.push({
      x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.65,
      vx: Math.cos(a) * 42, vy: Math.sin(a) * 42 - 36,
      life: 0.4, max: 0.4, color, size: size || 3,
    })
  }
}

function dust(g, x, y) {
  for (let i = 0; i < 6; i++) {
    g.particles.push({
      x: x - 10 + i * 4, y,
      vx: (i - 2.5) * 26, vy: -30 - Math.random() * 30,
      life: 0.32, max: 0.32, color: '#d8b58e', size: 2,
    })
  }
}

function addFloat(g, text, x, y, color) {
  g.floats.push({ text, x, y, color, life: 1, max: 1 })
  if (g.floats.length > 6) g.floats.shift()
}

/* ---------- 答题卡 ---------- */
function QuizCard({ q, onPick, onClose }) {
  return (
    <div className="jp-card" role="dialog" aria-modal="true" aria-label="问号平台的题">
      <div className="jp-card-in">
        <div className="jp-qtag">问号平台 · 答对下一跳吸中心</div>
        <div className="jp-q">{q.q}</div>
        <div className="jp-opts">
          {q.opts.map((o, i) => {
            let cls = 'jp-opt'
            if (q.done && o === q.right) cls += ' right'
            if (q.done && o === q.pick && q.ok) cls += ' ok'
            if (q.done && o === q.pick && !q.ok) cls += ' no'
            return (
              <button key={o} type="button" className={cls} disabled={q.done} onClick={() => onPick(o)}>
                <i>{'ABCD'[i]}</i><span>{o}</span>
              </button>
            )
          })}
        </div>
        {q.done && (
          <div className="jp-res">
            {q.ok
              ? <b className="ok">答对了，下一跳会吸到中心</b>
              : <b className="no">答错了，正确答案是「{q.right}」</b>}
            {!q.ok && <span>下一块会窄 35%；掉下去整条路从第 0 块重来</span>}
          </div>
        )}
        {q.done && (
          <button type="button" className="btn jp-cont" onClick={onClose}>继续跳</button>
        )}
      </div>
    </div>
  )
}

export default function JumpGame({ onExit }) {
  const { me, partner, loading: authLoading } = useAuth()
  const myId = me && me.id

  const canvasRef = useRef(null)
  const gRef = useRef(null)
  const aliveRef = useRef(true)
  const phaseRef = useRef('loading')
  const quizRef = useRef(null)
  const menuRef = useRef(false)
  const confirmRef = useRef('')
  const syncRef = useRef('idle')
  const pendingRef = useRef(null)
  const answeredRef = useRef({})
  const seqRef = useRef(0)
  const slotRef = useRef('u1')
  const commitRef = useRef(() => {})
  const landRef = useRef(() => {})
  const fallRef = useRef(() => {})
  const fallDone = useRef(false)
  const guardOk = useRef(false)
  const guardKind = useRef('')
  const guardSettled = useRef(true)
  const guardTry = useRef(() => {})
  const guardT = useRef(0)
  const bannerT = useRef(0)
  const cutT = useRef(0)
  const sayT = useRef(0)
  const capSaid = useRef(false)
  const askedRef = useRef(false)
  const encRef = useRef(new Set())
  const encT = useRef(0)
  const invRef = useRef(null)

  const [sfx] = useState(() => createSfx())
  const [sfxOn, setSfxOn] = useState(sfx.on)
  const [hud, setHud] = useState(null)
  const [phase, setPhase] = useState('loading')
  const [sync, setSync] = useState('idle')
  const [err, setErr] = useState('')
  const [quiz, setQuiz] = useState(null)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [toast, setToast] = useState('')
  const [inv, setInv] = useState(null)
  const [banner, setBanner] = useState(null)
  const [ask, setAsk] = useState(null)
  const [result, setResult] = useState(null)
  const [recOpen, setRecOpen] = useState(false)
  const [enc, setEnc] = useState(null)

  const say = useCallback((t) => {
    setToast(t)
    clearTimeout(sayT.current)
    sayT.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const showBanner = useCallback((title, sub, o) => {
    const opt = o || {}
    const kind = opt.kind === 'random' ? (Math.random() < 0.5 ? 'plaque' : 'line') : (opt.kind || 'plaque')
    setBanner({ title, sub, kind, tag: opt.tag || '', line: opt.line || sub })
    clearTimeout(bannerT.current)
    bannerT.current = setTimeout(() => setBanner(null), 2200)
  }, [])

  useEffect(() => {
    slotRef.current = (me && me.slot) || 'u1'
  }, [me])
  useEffect(() => { invRef.current = inv }, [inv])

  useEffect(() => () => {
    aliveRef.current = false
    clearTimeout(sayT.current)
    clearTimeout(bannerT.current)
    clearTimeout(guardT.current)
    clearTimeout(cutT.current)
    sfx.dispose()
  }, [sfx])

  /* ---------- 服务器状态 → 本地 ---------- */
  const applyState = useCallback((st) => {
    if (!st) return
    setHud(st)
    const g = gRef.current
    if (!g) return
    if (st.seed !== g.seed) {
      gRef.current = makeGame(st.seed, st.platform)
      answeredRef.current = {}
      return
    }
    if (st.platform !== g.idx) {
      const p = ensureRoad(g, st.platform)
      g.idx = st.platform
      g.x = p.x
      g.y = p.y
      g.vx = 0
      g.vy = 0
      g.mode = 'idle'
      g.power = 0
      g.snap = -1
      g.combo = 0
      g.sec = sectionOf(st.platform)
      g.skyFrom = g.sec
      g.skyTo = g.sec
      g.skyMix = 1
      g.cam = p.x - CAM
      g.particles.length = 0
      g.floats.length = 0
      g.trail.length = 0
    }
  }, [])

  /* ---------- 交一跳 ---------- */
  const commit = useCallback(async (from, to, gain, pick) => {
    if (syncRef.current === 'saving') return
    const seq = seqRef.current
    syncRef.current = 'saving'
    setSync('saving')
    const res = await submitStepRetry(from, to, gain, pick)
    if (!aliveRef.current || seq !== seqRef.current) return
    if (res.missing || res.error) {
      pendingRef.current = { from, to, gain, pick }
      syncRef.current = 'error'
      setSync('error')
      setErr(res.missing ? '服务端还没有这条路：先在 Supabase 跑 docs/jump-design.sql' : res.error)
      return
    }
    pendingRef.current = null
    syncRef.current = 'idle'
    setSync('idle')
    setErr('')
    if (res.me) setInv(res.me)
    applyState(res.state)
    if (!res.ok && res.reason === 'stale') say('TA 先跳了，跟上了')
    else if (!res.ok && res.reason === 'not_turn') say('接力棒在 TA 手里：等 TA 交棒')
    else if (!res.ok) say('这一跳没算上，重新来')
    else if (res.legacy) say('服务端还是旧版：金币和喷气背包要跑一下 v4 的 SQL')
    else if (res.wallet === false) say('金币没进钱包：先去像素小屋转一圈（钱包还没开户）')
    else if (res.me && res.me.coins_today >= res.me.day_cap && !capSaid.current) {
      capSaid.current = true
      say('今天 ' + res.me.day_cap + ' 枚赚满了，再跳只记分数')
    }
  }, [applyState, say])

  useEffect(() => { commitRef.current = commit }, [commit])

  /* ---------- 落地 ---------- */
  const onLand = useCallback((p, x, auto, viaJet) => {
    const g = gRef.current
    if (!g || !p) return
    const now = performance.now()
    g.idx = p.i
    g.x = x
    g.y = p.y
    g.vx = 0
    g.vy = 0
    g.mode = 'landed'
    g.landAt = now
    g.squash = 1
    g.shake = 1
    g.auto = false

    const w = widthOf(p, g.narrow[p.i])
    const cx = platformX(p, g.t)
    // 喷气落地和弹簧一样不算完美（不然白嫖连击）
    let perfect = !auto && !viaJet && Math.abs(x - cx) <= Math.max(4, w * PHYS.perfect)
    if (!auto && !viaJet && g.snap === p.i) {
      perfect = true
      g.x = cx
    }
    g.snap = -1
    // 磁铁：下一跳自动吸到下一块中心（落地时按 g.snap 判定）
    if (p.type === 'magnet') g.snap = p.i + 1
    g.combo = perfect ? g.combo + 1 : 0
    const from = g.from
    // 这一跳吃到的拾取物跟着这一跳一起交给服务器；交完就清空
    const pick = g.picked || 0
    g.picked = 0

    // 换段：天色在 0.5s 里淡过去（只在 25/50/75/100… 的休息台触发）
    const sec = sectionOf(p.i)
    if (sec !== g.sec) {
      g.skyFrom = g.sec
      g.skyTo = sec
      g.skyAt = now
      g.skyMix = 0
      g.sec = sec
    }

    // 段首休息台：报个段名，撒点彩带（不加分，不改规则）
    if (p.rest) {
      const sec = SECTIONS[sectionOf(p.i)]
      say('第 ' + sec.no + ' 段 · ' + sec.name + ' · 一起跳了 ' + p.i + ' 块')
      burst(g, g.x, p.y - 34, '#ffd45e', 12, 120, 3)
      burst(g, g.x, p.y - 34, '#ff9ec4', 8, 90, 3)
      addFloat(g, '第 ' + sec.no + ' 段 · ' + sec.name, g.x, p.y - 66, '#ffe6a3')
    }

    if (auto) {
      addFloat(g, '+2', g.x, p.y - 34, '#ffe9c4')
      dust(g, g.x, p.y)
      sfx.play('land')
      commitRef.current(from, p.i, SPRING_GAIN, pick)
      return
    }

    // 喷气落地：只 +1，不触发弹簧 / 传送 / 礼物，也不算完美
    if (viaJet) {
      dust(g, g.x, p.y)
      sfx.play('land')
      addFloat(g, '+1', g.x, p.y - 34, '#fff1d0')
      commitRef.current(from, p.i, 1, pick)
      return
    }

    if (p.type === 'spring') {
      g.mode = 'spring'
      g.springAt = now
      // 这一跳吃到的拾取物先挂回去：250ms 后的自动落地那次 commit 才交给服务器
      g.picked = pick
      sfx.play('spring')
      addFloat(g, '弹簧！', g.x, p.y - 48, '#b6f2cf')
      return
    }

    if (p.type === 'teleport') {
      burst(g, g.x, p.y - 20, '#bfe4ff', 16, 130, 3)
      ring(g, g.x, p.y - 16, '#eaf6ff', 8, 18, 3)
      sfx.play('teleport')
      addFloat(g, '传送 +3', g.x, p.y - 48, '#c9e8ff')
      const to = Math.min(p.i + 2, from + PHYS.maxStep)
      if (to > p.i) commitRef.current(from, to, 3, pick)
      else commitRef.current(from, p.i, jumpGain({ type: 'plain', perfect, combo: g.combo }), pick)
      return
    }

    const gain = jumpGain({ type: p.type, perfect, combo: g.combo })
    if (perfect) {
      ring(g, g.x, p.y - 16, '#ffe6a3', 12, 24, 4)
      burst(g, g.x, p.y - 40, '#fff2c8', 6, 60, 2)
      sfx.play('perfect')
      addFloat(g, '完美 +' + gain, g.x, p.y - 54, '#ffe6a3')
    } else {
      dust(g, g.x, p.y)
      sfx.play('land')
      addFloat(g, '+' + gain, g.x, p.y - 34, '#fff1d0')
    }
    if (p.type === 'gift') {
      burst(g, g.x, p.y - 26, '#ffc3d8', 14, 110, 3)
      sfx.play('gift')
      say('🎁 ' + giftAt())
    }
    if (p.type === 'magnet') {
      ring(g, g.x, p.y - 16, '#d8c8ff', 10, 22, 3)
      sfx.play('magnet')
      addFloat(g, '吸住下一块', g.x, p.y - 50, '#d8c8ff')
    }
    commitRef.current(from, p.i, gain, pick)
  }, [say, sfx])

  useEffect(() => { landRef.current = onLand }, [onLand])

  /* 把小人放到第 i 块（掉落重开 / 同步用），不碰服务器 */
  const snapTo = useCallback((g, i) => {
    const p = ensureRoad(g, i)
    g.idx = i
    g.x = platformX(p, g.t)
    g.y = p.y
    g.vx = 0
    g.vy = 0
    g.mode = 'idle'
    g.power = 0
    g.snap = -1
    g.landAt = 0
    g.combo = 0
    g.trail.length = 0
    g.narrow = {}
    g.cam = p.x - CAM
    const sec = sectionOf(i)
    g.sec = sec
    g.skyFrom = sec
    g.skyTo = sec
    g.skyMix = 1
  }, [])

  /* ---------- 守护住了：回到起跳那块，播小剧场 ---------- */
  const protectFrom = useCallback((from, serverKind) => {
    const g = gRef.current
    const u2 = slotRef.current === 'u2'
    if (g) snapTo(g, from)
    if (u2) {
      // u2：1.8 秒小剧场（落水 → 鲨鱼 → 顶回平台），播完再出金匾
      if (g) g.cut = { at: g.t }
      syncRef.current = 'saving'
      setSync('saving')
      clearTimeout(cutT.current)
      cutT.current = setTimeout(() => {
        const cur = gRef.current
        if (cur) cur.cut = null
        syncRef.current = 'idle'
        setSync('idle')
        if (!aliveRef.current) return
        showBanner('炫少的保护', '这一下不算数', { kind: 'random', tag: '第 ' + from + ' 块', line: '这一下，我替你挡了。' })
        sfx.play('perfect')
        say(serverKind === 'freeze' ? '冻结卡挡了一下，鲨鱼把你顶回来了' : '鲨鱼把你顶回来了')
      }, 1800)
    } else {
      if (g) {
        const sec = sectionOf(g.idx)
        g.guard = { at: g.t, kind: sec === 1 || sec === 4 ? 'devil' : 'angel' }
      }
      const sec2 = g ? sectionOf(g.idx) : 0
      if (sec2 === 1 || sec2 === 4) showBanner('恶魔的庇护', '这一下不算数')
      else showBanner('天使的守护', '这一下不算数')
      sfx.play('perfect')
      say(serverKind === 'freeze' ? '冻结卡挡了一下，这一下不算数' : '守护生效，这一下不算数')
    }
    fallDone.current = false
    guardSettled.current = true
  }, [say, showBanner, snapTo, sfx])

  /* ---------- 真掉下去：重置整条路，再把结算页顶出来 ---------- */
  const loseNow = useCallback(async (from, score, mine) => {
    const g = gRef.current
    if (g) snapTo(g, 0)
    syncRef.current = 'saving'
    setSync('saving')
    const seq = seqRef.current
    const res = await restartRun()
    if (!aliveRef.current || seq !== seqRef.current) { fallDone.current = false; return }
    if (res.missing || res.error) {
      // 服务端还没更新 / 网络不通：退回起跳那块，保持本地和服务端一致
      const cur = gRef.current
      if (cur) snapTo(cur, from)
      syncRef.current = 'idle'
      setSync('idle')
      say(res.missing ? '服务端还没更新：掉落先退回上一块（记得跑 docs/jump-design.sql）' : '没同步上：这一跳退回起跳那块')
      fallDone.current = false
      return
    }
    answeredRef.current = {}
    quizRef.current = null
    setQuiz(null)
    applyState(res.state)
    setErr('')
    encRef.current.clear()
    askedRef.current = false
    syncRef.current = 'idle'
    setSync('idle')
    fallDone.current = false
    setResult({ from, score, mine })
  }, [applyState, say, snapTo])

  /* ---------- 掉下去：先看守护，没守住再问背包，最后才结算 ---------- */
  const fallReset = useCallback(async (from, guarded, serverKind) => {
    if (guarded) { protectFrom(from, serverKind); return }
    const g = gRef.current
    const score = Number((hud && hud.score) || 0)
    const mine = Number((hud && hud.by_user && hud.by_user[myId]) || 0)
    // 没守住：还有背包就先问一次（每次掉落只问一次）
    if (!askedRef.current && invRef.current && invRef.current.bags > 0) {
      askedRef.current = true
      if (g) snapTo(g, from)
      syncRef.current = 'idle'
      setSync('idle')
      fallDone.current = false
      setAsk({ from, score, mine })
      return
    }
    await loseNow(from, score, mine)
  }, [hud, loseNow, myId, protectFrom, snapTo])

  useEffect(() => { fallRef.current = fallReset }, [fallReset])

  /* ---------- 保一次：扣一个背包，回到起跳那块 ---------- */
  const saveWithBag = useCallback(async () => {
    const a = ask
    if (!a) return
    syncRef.current = 'saving'
    setSync('saving')
    const res = await useBag()
    if (!aliveRef.current) return
    syncRef.current = 'idle'
    setSync('idle')
    if (res.missing) { say('服务端还没更新：先跑 docs/jump-design.sql'); return }
    if (res.error) { say(res.error); return }
    if (!res.ok) {
      setAsk(null)
      say('背包用完了，这一局保不住了')
      await loseNow(a.from, a.score, a.mine)
      return
    }
    if (res.me) setInv(res.me)
    setAsk(null)
    protectFrom(a.from, 'bag')
    say('背包保住了这一下')
  }, [ask, loseNow, protectFrom, say])

  const declineSave = useCallback(() => {
    const a = ask
    setAsk(null)
    if (a) loseNow(a.from, a.score, a.mine)
  }, [ask, loseNow])

  /* ---------- 炫少的鼓励：u2 每跳满 25 / 50 / 75 块弹一次 ---------- */
  useEffect(() => {
    if (phase !== 'ready' || !hud || !hud.by_user) return
    const mySlot = (me && me.slot) || 'u1'
    const u2id = mySlot === 'u2' ? myId : (partner && partner.id)
    if (!u2id) return
    const n = Number(hud.by_user[u2id] || 0)
    if (n < 25) { encRef.current.clear(); return }
    const LINES = { 25: '才 25 块？……行吧，有点东西。', 50: '五十块了。别停。', 75: '七十五块。你今天有点不一样。' }
    for (const m of [25, 50, 75]) {
      if (n >= m && !encRef.current.has(m)) {
        encRef.current.add(m)
        setEnc({ n: m, line: LINES[m] })
        clearTimeout(encT.current)
        encT.current = setTimeout(() => setEnc(null), 5200)
        break
      }
    }
  }, [hud, phase, me, partner, myId])

  /* 掉落时问服务器：这一下有没有守护（50% + 每日 3 次 + 冻结卡） */
  const tryGuard = useCallback(async () => {
    try {
      const res = await guardFall()
      if (!aliveRef.current) return
      guardOk.current = !!res.ok
      guardKind.current = res.kind || ''
      if (res.me) setInv(res.me)
    } catch (e) {
      guardOk.current = false
    } finally {
      guardSettled.current = true
    }
  }, [])

  useEffect(() => { guardTry.current = tryGuard }, [tryGuard])

  /* ---------- 开局：读共享的路 ---------- */
  const boot = useCallback(async () => {
    if (authLoading) return
    if (!myId) {
      phaseRef.current = 'noauth'
      setPhase('noauth')
      return
    }
    const seq = ++seqRef.current
    phaseRef.current = 'loading'
    setPhase('loading')
    setErr('')
    syncRef.current = 'idle'
    setSync('idle')
    pendingRef.current = null
    const res = await loadState()
    if (!aliveRef.current || seq !== seqRef.current) return
    if (res.missing) {
      phaseRef.current = 'missing'
      setPhase('missing')
      return
    }
    if (res.error) {
      phaseRef.current = 'error'
      setPhase('error')
      setErr(res.error)
      return
    }
    answeredRef.current = {}
    gRef.current = makeGame(res.state.seed, res.state.platform)
    setHud(res.state)
    setInv(res.me || null)
    phaseRef.current = 'ready'
    setPhase('ready')
  }, [authLoading, myId])

  useEffect(() => {
    aliveRef.current = true
    boot()
  }, [boot])

  /* ---------- 静音开关 ---------- */
  const toggleSfx = () => {
    const next = !sfxOn
    sfx.setOn(next)
    setSfxOn(next)
    if (next) {
      sfx.unlock()
      sfx.play('jump')
    }
  }

  /* ---------- 蓄力 / 起跳 ---------- */
  const canPlay = () => (
    phaseRef.current === 'ready' &&
    syncRef.current === 'idle' &&
    gRef.current && gRef.current.mode === 'idle' &&
    !quizRef.current && !menuRef.current && !confirmRef.current &&
    // 棒不在我手里时不能蓄力；turn 为空 = 棒悬空，谁先按谁接
    (!hud || !hud.turn || hud.turn === myId)
  )

  const openQuiz = useCallback(() => {
    const g = gRef.current
    if (!g) return
    const q = questionAt(g.seed, g.idx)
    const next = { q: q.q, opts: q.opts, right: q.right, pick: '', done: false, ok: false }
    quizRef.current = next
    setQuiz(next)
    sfx.play('land')
  }, [sfx])

  const pickAnswer = useCallback((text) => {
    const q = quizRef.current
    const g = gRef.current
    if (!q || q.done || !g) return
    const ok = text === q.right
    if (ok) g.snap = g.idx + 1
    else g.narrow[g.idx + 1] = true
    answeredRef.current[g.idx] = true
    const next = { ...q, done: true, ok, pick: text }
    quizRef.current = next
    setQuiz(next)
    sfx.play(ok ? 'perfect' : 'fall')
    try { navigator.vibrate?.(ok ? 8 : [10, 30, 10]) } catch (e) { /* iOS 不支持 */ }
  }, [sfx])

  const closeQuiz = useCallback(() => {
    quizRef.current = null
    setQuiz(null)
  }, [])

  const startCharge = (e) => {
    const gNow = gRef.current
    // 喷气飞行中：点一下就在最近的平台落下（不用再蓄力）
    if (gNow && gNow.mode === 'jet') {
      landJetNow()
      return
    }
    if (!canPlay()) return
    const g = gNow
    const p = g.road[g.idx]
    sfx.unlock()
    if (p && p.type === 'quiz' && !answeredRef.current[g.idx]) {
      openQuiz()
      return
    }
    g.mode = 'charge'
    g.chargeAt = performance.now()
    g.held = 0
    g.power = 0.04
    if (e && e.currentTarget && e.pointerId != null) {
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* 有些浏览器不支持 */ }
    }
  }

  const release = () => {
    const g = gRef.current
    if (!g || g.mode !== 'charge') return
    const power = powerOf(performance.now() - g.chargeAt)
    const v = velocityOf(power)
    g.from = g.idx
    g.power = power
    g.vx = v.vx
    g.vy = v.vy
    g.mode = 'fly'
    g.auto = false
    g.picked = 0
    sfx.play('jump')
    try { navigator.vibrate?.(4) } catch (e) { /* 跟随系统 */ }
  }

  const cancelCharge = () => {
    const g = gRef.current
    if (g && g.mode === 'charge') {
      g.mode = 'idle'
      g.power = 0
    }
  }

  /* ---------- 换一条路 ---------- */
  const openMenu = () => {
    const next = !menuRef.current
    if (next && (phaseRef.current !== 'ready' || syncRef.current !== 'idle' ||
      quizRef.current || confirmRef.current)) return
    menuRef.current = next
    setMenu(next)
  }

  const closeMenu = () => {
    menuRef.current = false
    setMenu(false)
  }

  const askReset = () => {
    menuRef.current = false
    setMenu(false)
    confirmRef.current = 'reset'
    setConfirm('reset')
  }

  const openShop = () => {
    menuRef.current = false
    setMenu(false)
    confirmRef.current = 'shop'
    setConfirm('shop')
  }

  const doBuy = useCallback(async () => {
    syncRef.current = 'saving'
    setSync('saving')
    const res = await buyJet()
    if (!aliveRef.current) return
    syncRef.current = 'idle'
    setSync('idle')
    if (res.missing) { say('服务端还没更新：先跑 docs/jump-design.sql'); return }
    if (res.error) { say(res.error); return }
    if (res.ok) {
      if (res.me) setInv(res.me)
      sfx.play('gift')
      say('买到一个喷气背包')
      return
    }
    if (res.reason === 'poor') say('金币不够，再跳几块')
    else if (res.reason === 'limit') say('今天买满了（2 个），明天再来')
    else if (res.reason === 'wallet') say('钱包还没开户：先去像素小屋转一圈')
    else say('没买成，再点一次')
  }, [say, sfx])

  const askTake = () => {
    menuRef.current = false
    setMenu(false)
    confirmRef.current = 'take'
    setConfirm('take')
  }

  const cancelReset = () => {
    confirmRef.current = ''
    setConfirm('')
  }

  const doReset = useCallback(async () => {
    confirmRef.current = ''
    setConfirm('')
    const seq = ++seqRef.current
    syncRef.current = 'saving'
    setSync('saving')
    const res = await resetRun()
    if (!aliveRef.current || seq !== seqRef.current) return
    syncRef.current = 'idle'
    setSync('idle')
    if (res.missing) { say('服务端还没有这条路：先跑 docs/jump-design.sql'); return }
    if (res.error) { say(res.error); return }
    answeredRef.current = {}
    quizRef.current = null
    pendingRef.current = null
    setQuiz(null)
    setErr('')
    gRef.current = makeGame(res.state.seed, 0)
    setHud(res.state)
    say('换了一条新路，两个人从头开始')
  }, [say])

  const doTake = useCallback(async () => {
    confirmRef.current = ''
    setConfirm('')
    const seq = ++seqRef.current
    syncRef.current = 'saving'
    setSync('saving')
    const res = await takeTurn()
    if (!aliveRef.current || seq !== seqRef.current) return
    syncRef.current = 'idle'
    setSync('idle')
    if (res.missing) { say('服务端还没更新：先跑 docs/jump-design.sql'); return }
    if (res.error) { say(res.error); return }
    applyState(res.state)
    if (res.state && res.state.turn === myId) say('接到棒了，你来跳')
  }, [applyState, say, myId])

  const doHandoff = useCallback(async () => {
    if (!partner) return
    const seq = ++seqRef.current
    syncRef.current = 'saving'
    setSync('saving')
    const res = await handoffTurn(partner.id)
    if (!aliveRef.current || seq !== seqRef.current) return
    syncRef.current = 'idle'
    setSync('idle')
    if (res.missing) { say('服务端还没更新：先跑 docs/jump-design.sql'); return }
    if (res.error) { say(res.error); return }
    if (!res.ok) { say('棒已经不在你手里了'); applyState(res.state); return }
    applyState(res.state)
    say('棒交给 ' + ((partner && partner.display_name) || 'TA') + ' 了')
  }, [partner, applyState, say])

  const useBagNow = useCallback(async () => {
    const g = gRef.current
    if (!g || !inv || inv.bags <= 0) return
    if (phaseRef.current !== 'ready' || syncRef.current !== 'idle') return
    if (g.mode !== 'idle' && g.mode !== 'landed') return
    // 问号平台还没答：背包也不能绕过题（和蓄力同一条规矩）
    const stand = g.road[g.idx]
    if (stand && stand.type === 'quiz' && !answeredRef.current[g.idx]) { openQuiz(); return }
    syncRef.current = 'saving'
    setSync('saving')
    const res = await useBag()
    syncRef.current = 'idle'
    setSync('idle')
    if (res.missing) { say('服务端还没更新：先跑 docs/jump-design.sql'); return }
    if (res.error) { say(res.error); return }
    if (!res.ok) { say('背包用完了'); return }
    if (res.me) setInv(res.me)
    const from = g.idx
    const to = Math.min(from + 3, g.road.length - 1)
    if (to <= from) { say('前面没有三块了'); return }
    const p = g.road[to]
    burst(g, p.x, p.y - 30, '#ffd45e', 14, 120, 3)
    addFloat(g, '飞跃 +3', p.x, p.y - 52, '#ffe6a3')
    sfx.play('teleport')
    say('背包：直接飞 3 格')
    commitRef.current(from, to, 1, 0)
  }, [inv, openQuiz, say, sfx])

  /* ---------- 喷气背包：点火 → 1.2 秒无重力平移 → 点一下提前落 ---------- */
  const landJetNow = useCallback(() => {
    const g = gRef.current
    if (!g || g.mode !== 'jet' || !g.jet) return
    const from = g.jet.from
    const last = Math.min(from + PHYS.maxStep, g.road.length - 1)
    let spot = null
    for (let i = from + 1; i <= last; i++) {
      const p = g.road[i]
      if (!p) continue
      if (platformX(p, g.t) >= g.x - 8) { spot = p; break }
    }
    if (!spot) spot = g.road[last]
    g.jet = null
    landRef.current(spot, platformX(spot, g.t), false, true)
  }, [])

  const useJetNow = useCallback(async () => {
    const g = gRef.current
    if (!g || !inv || inv.jets <= 0) return
    if (phaseRef.current !== 'ready' || syncRef.current !== 'idle') return
    if (g.mode !== 'idle' && g.mode !== 'landed') return
    // 棒不在我手里就别点火（和蓄力同一条规矩）
    if (hud && hud.turn && hud.turn !== myId) return
    // 问号平台还没答：先弹题
    const stand = g.road[g.idx]
    if (stand && stand.type === 'quiz' && !answeredRef.current[g.idx]) { openQuiz(); return }
    syncRef.current = 'saving'
    setSync('saving')
    const res = await useJet()
    if (!aliveRef.current) return
    syncRef.current = 'idle'
    setSync('idle')
    if (res.missing) { say('服务端还没更新：先跑 docs/jump-design.sql'); return }
    if (res.error) { say(res.error); return }
    if (!res.ok) { say('喷气背包用完了'); return }
    if (res.me) setInv(res.me)
    const from = g.idx
    const last = Math.min(from + PHYS.maxStep, g.road.length - 1)
    const end = ensureRoad(g, last)
    g.from = from
    g.picked = 0
    g.mode = 'jet'
    g.jet = {
      t0: performance.now(),
      from,
      y0: g.y,
      // 水平速度按「1.2 秒正好飞到第 3 块中心」算，不管间距多大都够得着
      vx: (end.x - g.x) / 1.2,
      dur: 1200,
    }
    sfx.play('jet')
    say('点火！再点一下就在最近的平台落下')
  }, [inv, hud, myId, openQuiz, say, sfx])

  const retry = () => {
    const p = pendingRef.current
    if (!p) return
    syncRef.current = 'idle'
    setSync('idle')
    commitRef.current(p.from, p.to, p.gain, p.pick)
  }

  /* ---------- 主循环 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    const reduce = !!(typeof window !== 'undefined' && window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)

    const startFall = (g, now) => {
      g.mode = 'fall'
      g.fallAt = now
      g.vx = 0
      g.vy = Math.max(g.vy, 120)
      g.power = 0
      g.combo = 0
      g.trail.length = 0
      sfx.play('fall')
      // 一次掉落只掷一次守护；1.2s 没回来就当没有，别让人一直往下掉
      askedRef.current = false
      guardOk.current = false
      guardKind.current = ''
      guardSettled.current = false
      clearTimeout(guardT.current)
      guardT.current = setTimeout(() => { guardSettled.current = true }, 1200)
      guardTry.current()
    }

    // 飞行途中吃拾取物：每个子步判一次，一帧跨过去也不会漏。
    // 从 g.from 开始算：脚下这块正上方如果还飘着一个，起跳时能顺手摘走。
    const sweep = (g) => {
      // 一跳只收一个：p_pick 服务器只认 0/1；多碰到的不吞掉（留着下次再吃），也不重复飘字
      if (g.picked) return
      const last = Math.min(g.from + PHYS.maxStep, g.road.length - 1)
      for (let i = g.from; i <= last; i++) {
        const p = g.road[i]
        if (!p || g.got[i]) continue
        if (pickupAt(g.seed, i) !== 'jet') continue
        const px = platformX(p, g.t)
        if (Math.abs(g.x - px) > PICKUP_R) continue
        if (Math.abs((g.y - 12) - (p.y - PICKUP_UP)) > 26) continue
        g.got[i] = true
        g.picked = (g.picked || 0) + 1
        burst(g, px, p.y - PICKUP_UP, '#bfe4ff', 10, 90, 3)
        addFloat(g, '喷气背包 +1', px, p.y - PICKUP_UP - 18, '#d8ecff')
        sfx.play('pick')
      }
    }

    const step = (g, now, dt) => {
      if (g.mode === 'charge') {
        g.held = now - g.chargeAt
        g.power = powerOf(g.held)
      } else if (g.power > 0.001) {
        g.power = Math.max(0, g.power - dt * 3.2)
      }

      if (g.mode === 'spring' && now - g.springAt > PHYS.springMs) {
        const next = ensureRoad(g, g.idx + 1)
        g.hop = { x0: g.x, y0: g.y, x1: next.x, y1: next.y, t0: now, dur: PHYS.hopMs }
        g.mode = 'hop'
        sfx.play('jump')
      }

      if (g.mode === 'hop' && g.hop) {
        const u = Math.min(1, (now - g.hop.t0) / g.hop.dur)
        g.x = g.hop.x0 + (g.hop.x1 - g.hop.x0) * u
        g.y = g.hop.y0 + (g.hop.y1 - g.hop.y0) * u - Math.sin(u * Math.PI) * 76
        g.vy = -Math.cos(u * Math.PI) * 300
        if (u >= 1) {
          const next = g.road[g.idx + 1]
          g.hop = null
          if (next) landRef.current(next, next.x, true)
        }
      }

      if (g.mode === 'jet' && g.jet) {
        const age = now - g.jet.t0
        g.x += g.jet.vx * dt
        const endP = g.road[Math.min(g.jet.from + PHYS.maxStep, g.road.length - 1)]
        const targetY = Math.min(g.jet.y0, (endP ? endP.y : g.y) - 30)
        g.y += (targetY - g.y) * Math.min(1, dt * 6)
        g.vy = -60
        sweep(g)
        if (age >= g.jet.dur) {
          landJetNow()
          return
        }
      }

      if (g.mode === 'fly') {
        const sub = Math.min(4, Math.max(1, Math.ceil(dt / (1 / 120))))
        const h = dt / sub
        for (let s = 0; s < sub; s++) {
          const prevY = g.y
          stepBall(g, h)
          sweep(g)
          if (g.vy > 0) {
            const last = Math.min(g.from + PHYS.maxStep, g.road.length - 1)
            for (let i = g.from + 1; i <= last; i++) {
              const p = g.road[i]
              if (!p) continue
              const w = widthOf(p, g.narrow[p.i])
              if (hitPlatform(prevY, g, p, w, g.t)) {
                landRef.current(p, g.x, false)
                return
              }
            }
          }
          if (g.y > PHYS.fallY) {
            startFall(g, now)
            return
          }
        }
      }

      if (g.mode === 'fall') {
        g.vy += PHYS.g * dt
        g.y += g.vy * dt
        // 掉下去：先看服务器这一下有没有守护，问到了再决定保住还是清零
        if (now - g.fallAt > PHYS.fallMs && !fallDone.current && guardSettled.current) {
          fallDone.current = true
          fallRef.current(g.from, guardOk.current, guardKind.current)
        }
      }

      if (g.mode === 'landed' && syncRef.current === 'idle' && now - g.landAt > 150) g.mode = 'idle'

      // 换段的天色淡入：0.5s 走完
      if (g.skyMix < 1) g.skyMix = Math.min(1, (now - g.skyAt) / 500)

      // 站在移动平台上：人跟着平台一起左右滑，别被平台甩下去
      const cur = g.road[g.idx]
      if (cur && cur.type === 'moving' && (g.mode === 'idle' || g.mode === 'charge' || g.mode === 'landed')) {
        g.x = platformX(cur, g.t)
      }

      // 相机：角色固定在 x = 120，世界横着滚
      g.cam += ((g.x - CAM) - g.cam) * Math.min(1, dt * 8)

      // 连击拖尾
      if (g.mode === 'fly' && g.combo >= 3) {
        g.trail.push({ x: g.x, y: g.y })
        if (g.trail.length > 6) g.trail.shift()
      } else if (g.trail.length) {
        g.trail.length = 0
      }

      // 粒子和浮字：都在 400ms / 1s 内收掉
      for (let i = g.particles.length - 1; i >= 0; i--) {
        const pa = g.particles[i]
        pa.life -= dt
        pa.x += pa.vx * dt
        pa.y += pa.vy * dt
        pa.vy += 240 * dt
        if (pa.life <= 0) g.particles.splice(i, 1)
      }
      for (let i = g.floats.length - 1; i >= 0; i--) {
        g.floats[i].life -= dt
        if (g.floats[i].life <= 0) g.floats.splice(i, 1)
      }
      if (g.squash > 0) g.squash = Math.max(0, g.squash - dt * 5)
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 6)
    }

    let raf = 0
    let last = performance.now()
    let backdrop = false
    const frame = (now) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const g = gRef.current
      if (!g) {
        if (!backdrop) {
          drawBackdrop(ctx)
          backdrop = true
        }
        return
      }
      if (document.hidden) return
      if (quizRef.current || menuRef.current || confirmRef.current) return
      if (phaseRef.current === 'ready') {
        g.t += dt
        step(g, now, dt)
      }
      const p = g.road[g.idx]
      const hint = !!(p && p.type === 'quiz' && !answeredRef.current[g.idx] && (g.mode === 'idle' || g.mode === 'landed'))
      drawScene(ctx, g, { slot: slotRef.current, quizHint: hint, reduce })
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [sfx])

  /* ---------- 键盘：空格蓄力，Esc 返回 ---------- */
  useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') return
        e.preventDefault()
        startCharge(null)
      }
    }
    const up = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        release()
      }
    }
    const esc = (e) => {
      if (e.key !== 'Escape') return
      if (quizRef.current || confirmRef.current || menuRef.current) {
        if (confirmRef.current) cancelReset()
        else if (menuRef.current) closeMenu()
        return
      }
      if (onExit) onExit()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('keydown', esc)
    }
  })

  /* ---------- 切后台：别一直蓄力 ---------- */
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) cancelCharge()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  })
  /* ---------- 界面上的几个数 ---------- */
  const byUser = (hud && hud.by_user) || {}
  const myScore = Number(byUser[myId] || 0)
  const taScore = partner ? Number(byUser[partner.id] || 0) : 0
  const blocks = hud ? hud.platform : 0
  const best = hud ? hud.best : 0
  const recRows = (() => {
    const rec = (hud && hud.rec) || {}
    const mySlot = (me && me.slot) || 'u1'
    const otherId = partner && partner.id
    const u1 = mySlot === 'u1' ? myId : otherId
    const u2 = mySlot === 'u2' ? myId : otherId
    const get = (uid) => (uid && rec[uid]) || {}
    return [
      { slot: 'u1', name: '炫少', best: Number(get(u1).best) || 0, total: Number(get(u1).total) || 0 },
      { slot: 'u2', name: mySlot === 'u2' ? '我' : ((partner && partner.display_name) || 'TA'), best: Number(get(u2).best) || 0, total: Number(get(u2).total) || 0 },
    ]
  })()
  const liveIdx = gRef.current ? gRef.current.idx : blocks
  const sec = SECTIONS[sectionOf(liveIdx)] || SECTIONS[0]
  const taName = (partner && partner.display_name) || 'TA'
  const turn = hud ? hud.turn : null
  const myTurn = !turn || turn === myId

  /* 等棒的时候每 6 秒看一眼服务器：TA 跳了 / 交棒了，这边能跟上（不是 realtime） */
  useEffect(() => {
    if (phase !== 'ready' || myTurn) return undefined
    let stop = false
    const tick = async () => {
      if (stop || document.hidden) return
      const res = await loadState()
      if (stop || !aliveRef.current) return
      if (res.state) applyState(res.state)
    }
    tick()
    const id = setInterval(tick, 6000)
    return () => { stop = true; clearInterval(id) }
  }, [phase, myTurn, applyState])
  const taJust = !!(
    hud && hud.last_uid && hud.last_uid !== myId && hud.updated_at &&
    Date.now() - new Date(hud.updated_at).getTime() < 5 * 60 * 1000
  )
  const standing = gRef.current && gRef.current.road[gRef.current.idx]
  const needQuiz = !!(standing && standing.type === 'quiz' && !answeredRef.current[standing.i])
  let hintText = '按住蓄力，松手起跳'
  if (phase === 'ready' && sync === 'saving') hintText = '正在把这一跳交给 TA…'
  else if (phase === 'ready' && sync === 'error') hintText = '没同步上：点上面的「重试」，同一跳不会重复加分'
  else if (phase === 'ready' && gRef.current && gRef.current.mode === 'jet') hintText = '喷气飞行中：点一下就在最近的平台落下'
  else if (phase === 'ready' && needQuiz) hintText = '这块是问号平台：按一下，先答题'
  else if (ask) hintText = '要掉下去了：用背包保一次？'
  else if (result) hintText = '掉下去了：再来一次，或者回小物'
  else if (phase === 'ready' && !myTurn) hintText = '棒在 ' + taName + ' 手里：等 TA 交棒，或者点「我来接棒」'
  else if (phase !== 'ready') hintText = '两个人在同一条路上接力'

  return (
    <div className="jp-root">
      <div className="jp-ui">
        <div className="jp-top">
          <button type="button" className="jp-ic tap" onClick={() => onExit && onExit()} aria-label="返回小物">
            <Svg name="back" size={18} />
          </button>
          <div className="jp-title">
            <h1>一起跳一跳</h1>
            <div className="sub">
              {blocks > 0
                ? `第 ${sec.no} 段 · ${sec.name} · 一起跳了 ${blocks} 块`
                : '一条两个人共用的路'}
            </div>
          </div>
          <button
            type="button" className={`jp-ic tap${sfxOn ? '' : ' off'}`} onClick={toggleSfx}
            aria-pressed={sfxOn} aria-label={sfxOn ? '关掉音效' : '打开音效'}
          >
            {sfxOn ? '🔊' : '🔇'}
          </button>
          <div className="jp-menu-wrap">
            <button type="button" className="jp-ic tap" onClick={openMenu} aria-label="更多">
              <span className="jp-dots">···</span>
            </button>
            {menu && (
              <div className="jp-menu">
                {partner && turn === myId && <button type="button" onClick={doHandoff}>交给 {taName}</button>}
                <button type="button" onClick={openShop}>小卖部</button>
                <button type="button" onClick={() => { setMenu(false); setRecOpen(true) }}>记录</button>
                <button type="button" onClick={askReset}>换一条路</button>
              </div>
            )}
          </div>
        </div>

        <div className="jp-stat">
          <span>你 <b>{myScore}</b></span>
          {partner && <span className="ta">{taName} <b>{taScore}</b></span>}
          <span className="jp-coin">🪙 一起攒了 <b>{(hud && hud.coins) || 0}</b> 枚</span>
          {taJust && <span className="jp-just">TA 刚跳了</span>}
          {!myTurn && <span className="jp-turn">轮到 {taName}</span>}
          <span className="grow" />
          {sync === 'saving' && <span className="jp-sync">同步中…</span>}
          {sync === 'error' && (
            <button type="button" className="jp-retry" onClick={retry}>重试</button>
          )}
        </div>

        <div className="jp-items">
          <button
            type="button" className="jp-item use"
            disabled={!inv || inv.bags <= 0 || !myTurn}
            onClick={useBagNow}
          >🎒 背包 ×{inv ? inv.bags : 0}</button>
          <button
            type="button" className="jp-item use"
            disabled={!inv || inv.jets <= 0 || !myTurn}
            onClick={useJetNow}
          >🚀 喷气 ×{inv ? inv.jets : 0}</button>
          <span className="jp-item">❄️ 冻结 ×{inv ? inv.freezes : 0}</span>
          <span className="jp-item">🛡 守护 {inv ? inv.guard_left : 3}/3</span>
        </div>

        <div className="jp-stage">
          <div className="jp-bezel">
            <div className="jp-screen">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                role="img"
                aria-label="一起跳一跳：按住画布蓄力，松手起跳；落在平台中间算完美，问号平台要先答题"
                onPointerDown={startCharge}
                onPointerUp={release}
                onPointerCancel={cancelCharge}
                onContextMenu={(e) => e.preventDefault()}
              />

              {phase === 'loading' && (
                <div className="jp-ov"><b>正在铺路…</b><span>把你们上次停下的地方找出来</span></div>
              )}

              {phase === 'noauth' && (
                <div className="jp-ov">
                  <b>登录后两个人一起跳</b>
                  <span>这条路只有你们两个人，登录才能接着跳</span>
                  <button type="button" className="btn" onClick={() => onExit && onExit()}>回小物</button>
                </div>
              )}

              {phase === 'missing' && (
                <div className="jp-ov">
                  <b>还没有这条路</b>
                  <span>在 Supabase → SQL Editor 里跑一遍 docs/jump-design.sql，再点重试</span>
                  <button type="button" className="btn" onClick={boot}>重试</button>
                </div>
              )}

              {phase === 'error' && (
                <div className="jp-ov">
                  <b>路没连上</b>
                  <span>{err || '网络不通'}</span>
                  <button type="button" className="btn" onClick={boot}>重试</button>
                </div>
              )}

              {phase === 'ready' && !myTurn && (
                <div className="jp-ov">
                  <b>轮到 {taName} 跳</b>
                  <span>棒在 TA 手里。TA 跳完会交给你；等不及就接过来（会把 TA 正在跳的这一下顶掉）</span>
                  <button type="button" className="btn" onClick={askTake}>我来接棒</button>
                </div>
              )}

              {banner && (banner.kind === 'line' ? (
                <div className="jp-guard jp-guard--line">
                  <div className="jp-gl">
                    {banner.tag && <span className="jp-gl-tag">{banner.tag}</span>}
                    <span className="jp-gl-title">{banner.title}</span>
                    <span className="jp-gl-line">{banner.line}</span>
                  </div>
                </div>
              ) : (
                <div className="jp-guard">
                  <div className="jp-guard-inner">
                    <span className="jp-guard-title">{banner.title}</span>
                    <span className="jp-guard-sub">{banner.sub}</span>
                  </div>
                </div>
              ))}

              {ask && (
                <div className="jp-card">
                  <div className="jp-card-in jp-ask">
                    <div className="jp-ask-kicker">🎒 背包 ×{inv ? inv.bags : 0} · 用掉 1 个保一次</div>
                    <b className="jp-ask-title">要掉下去了</b>
                    <p>用背包保一次？你会回到起跳的那块，这一下不算数，分数不清零。</p>
                    <div className="jp-confirm-acts">
                      <button type="button" className="btn ghost" onClick={declineSave}>算了</button>
                      <button type="button" className="btn" onClick={saveWithBag} disabled={sync === 'saving'}>用背包保一次</button>
                    </div>
                    <div className="jp-ask-note">不用的话，这一局就结束了。</div>
                  </div>
                </div>
              )}

              {result && (
                <div className="jp-card">
                  <div className="jp-card-in jp-result">
                    <b className="jp-result-title">掉下去了</b>
                    <div className="jp-res-nums">
                      <div><b>{result.score}</b><span>本局 · 一起跳的</span></div>
                      <div><b>{best}</b><span>最高纪录</span></div>
                    </div>
                    {recRows.map((r) => (
                      <div className="jp-rec-row" key={r.slot}>
                        <span className="nm">{r.name}</span>
                        <span className="vv">最多 {r.best} 块</span>
                        <span className="tt">{r.total} 跳</span>
                      </div>
                    ))}
                    <div className="jp-confirm-acts" style={{ marginTop: 10 }}>
                      <button type="button" className="btn ghost" onClick={() => onExit && onExit()}>回小物</button>
                      <button type="button" className="btn" onClick={() => setResult(null)}>再来一次</button>
                    </div>
                    <div className="jp-ask-note">再来一次：从第一块重新开始，两个人的分数清零，最高分保留。</div>
                  </div>
                </div>
              )}

              {recOpen && (
                <div className="jp-card">
                  <div className="jp-card-in jp-result">
                    <b className="jp-result-title">记录</b>
                    {recRows.map((r) => (
                      <div className="jp-rec-row" key={r.slot}>
                        <span className="nm">{r.name}</span>
                        <span className="vv">最多 {r.best} 块</span>
                        <span className="tt">{r.total} 跳</span>
                      </div>
                    ))}
                    <div className="jp-rec-line">这条路：一起跳到第 {blocks} 块 · 一起攒了 {(hud && hud.coins) || 0} 枚</div>
                    <button type="button" className="btn jp-cont" onClick={() => setRecOpen(false)}>继续跳</button>
                  </div>
                </div>
              )}

              {enc && (
                <div className="jp-enc-wrap" onClick={() => setEnc(null)}>
                  <div className="jp-enc">
                    <span className="jp-enc-badge">{enc.n}</span>
                    <span className="jp-enc-title">炫少的鼓励</span>
                    <span className="jp-enc-line">{enc.line}</span>
                    <button type="button" className="btn jp-enc-ok" onClick={() => setEnc(null)}>继续</button>
                  </div>
                </div>
              )}

              {quiz && <QuizCard q={quiz} onPick={pickAnswer} onClose={closeQuiz} />}

              {confirm === 'reset' && (
                <div className="jp-card">
                  <div className="jp-card-in jp-confirm">
                    <b>换一条路？</b>
                    <p>两个人都会从第一块重新开始，最高分保留。</p>
                    <div className="jp-confirm-acts">
                      <button type="button" className="btn ghost" onClick={cancelReset}>再想想</button>
                      <button type="button" className="btn" onClick={doReset}>换路</button>
                    </div>
                  </div>
                </div>
              )}

              {confirm === 'take' && (
                <div className="jp-card">
                  <div className="jp-card-in jp-confirm">
                    <b>接过接力棒？</b>
                    <p>如果 TA 正在跳，这一下会被顶掉、不算分。</p>
                    <div className="jp-confirm-acts">
                      <button type="button" className="btn ghost" onClick={cancelReset}>再等等</button>
                      <button type="button" className="btn" onClick={doTake}>接棒</button>
                    </div>
                  </div>
                </div>
              )}

              {confirm === 'shop' && (
                <div className="jp-card">
                  <div className="jp-card-in jp-shop">
                    <b>小卖部</b>
                    <p>金币和小屋钱包是同一个：跳一跳、打地鼠赚的都在这儿花。</p>
                    <div className="jp-shop-row">
                      <span className="jp-shop-ic">🚀</span>
                      <span className="jp-shop-nm">喷气背包<small>飞 1.2 秒，最多前进 3 块</small></span>
                      <span className="jp-shop-pr">20 枚</span>
                      <button
                        type="button"
                        className="btn jp-shop-buy"
                        disabled={!inv || inv.coins < 20 || inv.bought >= 2 || sync === 'saving'}
                        onClick={doBuy}
                      >买</button>
                    </div>
                    <div className="jp-shop-foot">
                      钱包 {inv ? inv.coins : 0} 枚 · 今天已买 {inv ? inv.bought : 0}/2 · 库存 ×{inv ? inv.jets : 0}
                    </div>
                    <button type="button" className="btn ghost jp-shop-close" onClick={cancelReset}>关上</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="jp-foot">
          <span>{hintText}</span>
          <span className="mono">{best > 0 ? `BEST ${best}` : ''}</span>
        </div>
      </div>

      {toast && <div className="toast glass">{toast}</div>}
    </div>
  )
}