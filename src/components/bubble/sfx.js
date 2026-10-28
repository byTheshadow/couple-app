/* ===========================================================================
   小物 · 捏泡泡 —— 两个现场合成的音效（没有音频文件）
   沿用打地鼠的静音偏好 localStorage['whack.sfx']。
   所有 window / AudioContext 访问都先判断，方便在没有浏览器的环境下 import。
   =========================================================================== */

export const SFX_KEY = 'whack.sfx'

function readOn() {
  try { return (localStorage.getItem(SFX_KEY) || '1') !== '0' } catch (e) { return true }
}

function nowMs() {
  if (typeof performance !== 'undefined' && performance.now) return performance.now()
  return Date.now()
}

export function createSfx() {
  let on = readOn()
  let ac = null
  let master = null
  let lastPop = 0
  let chain = 0

  function ctxOf() {
    if (!on || typeof window === 'undefined') return null
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    if (!ac) {
      try {
        ac = new C()
        master = ac.createGain()
        master.gain.value = 0.22
        master.connect(ac.destination)
      } catch (e) {
        ac = null
        master = null
        return null
      }
    }
    if (ac.state === 'suspended') {
      try { ac.resume() } catch (e) { /* 等下一次手势 */ }
    }
    return ac
  }

  function tone(freq, to, dur, type, gain) {
    const c = ctxOf()
    if (!c || !master) return
    const t0 = c.currentTime
    const o = c.createOscillator()
    const gn = c.createGain()
    o.type = type || 'sine'
    o.frequency.setValueAtTime(freq, t0)
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur)
    gn.gain.setValueAtTime(0.0001, t0)
    gn.gain.linearRampToValueAtTime(gain == null ? 0.5 : gain, t0 + 0.008)
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(gn)
    gn.connect(master)
    o.start(t0)
    o.stop(t0 + dur + 0.03)
  }

  /** 一小段噪声：爆泡的皮层用 bandpass，换版的「沙」用 lowpass */
  function noise(dur, gain, freq, type) {
    const c = ctxOf()
    if (!c || !master) return
    const n = Math.max(1, Math.floor(c.sampleRate * dur))
    let buf = null
    try { buf = c.createBuffer(1, n, c.sampleRate) } catch (e) { return }
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) {
      const decay = 1 - i / n
      d[i] = (Math.random() * 2 - 1) * decay * decay
    }
    const src = c.createBufferSource()
    src.buffer = buf
    const f = c.createBiquadFilter()
    f.type = type || 'bandpass'
    f.frequency.value = freq || 1200
    f.Q.value = type === 'lowpass' ? 0.7 : 1.1
    const gn = c.createGain()
    gn.gain.value = gain == null ? 0.2 : gain
    src.connect(f)
    f.connect(gn)
    gn.connect(master)
    src.start()
  }

  function pop() {
    if (!on) return
    const t = nowMs()
    // 300 ms 内的连爆，每颗升 3%，最多升到 +30%
    if (t - lastPop < 300) chain = Math.min(10, chain + 1)
    else chain = 0
    lastPop = t
    const m = 1 + chain * 0.03
    tone(620 * m, 280 * m, 0.06, 'sine', 0.5)
    noise(0.03, 0.16, 1800 * m, 'bandpass')
  }

  function reset() {
    chain = 0
    lastPop = 0
    noise(0.12, 0.2, 600, 'lowpass')
  }

  return {
    get on() { return on },
    setOn(v) {
      on = !!v
      try { localStorage.setItem(SFX_KEY, on ? '1' : '0') } catch (e) { /* 存不了就算了 */ }
      if (on) ctxOf()
    },
    unlock() { ctxOf() },
    play(kind) {
      if (!on) return
      if (kind === 'pop') pop()
      else if (kind === 'reset') reset()
    },
    dispose() {
      chain = 0
      lastPop = 0
      master = null
      if (ac) {
        try { if (ac.state !== 'closed') ac.close() } catch (e) { /* 已关就算了 */ }
      }
      ac = null
    },
  }
}
