/* ===========================================================================
   小物 · 一起跳一跳 —— 现场合成的音效（没有音频文件）
   静音偏好沿用打地鼠 / 捏泡泡的 localStorage['whack.sfx']，三个小游戏共用一个开关。
   所有 window / AudioContext 访问都先判断，方便在 Node 里 import 来跑测试。
   =========================================================================== */

export const SFX_KEY = 'whack.sfx'

function readOn() {
  try { return (localStorage.getItem(SFX_KEY) || '1') !== '0' } catch (e) { return true }
}

export function createSfx() {
  let on = readOn()
  let ac = null
  let master = null

  function ctxOf() {
    if (!on || typeof window === 'undefined') return null
    const C = window.AudioContext || window.webkitAudioContext
    if (!C) return null
    if (!ac) {
      try {
        ac = new C()
        master = ac.createGain()
        master.gain.value = 0.2
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

  /** 一个滑音；delay 用来排两音上行 */
  function tone(freq, to, dur, type, gain, delay) {
    const c = ctxOf()
    if (!c || !master) return
    const t0 = c.currentTime + (delay || 0)
    let o = null
    let gn = null
    try {
      o = c.createOscillator()
      gn = c.createGain()
    } catch (e) { return }
    o.type = type || 'sine'
    o.frequency.setValueAtTime(freq, t0)
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur)
    gn.gain.setValueAtTime(0.0001, t0)
    gn.gain.linearRampToValueAtTime(gain == null ? 0.4 : gain, t0 + 0.01)
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.connect(gn)
    gn.connect(master)
    o.start(t0)
    o.stop(t0 + dur + 0.04)
  }

  /** 一小段噪声：落地 / 沙沙声 */
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
    f.type = type || 'lowpass'
    f.frequency.value = freq || 900
    const gn = c.createGain()
    gn.gain.value = gain == null ? 0.16 : gain
    src.connect(f)
    f.connect(gn)
    gn.connect(master)
    src.start()
  }

  function play(kind) {
    if (!on) return
    if (kind === 'jump') {
      tone(320, 520, 0.09, 'triangle', 0.22)
    } else if (kind === 'land') {
      tone(190, 120, 0.07, 'square', 0.16)
      noise(0.05, 0.14, 700)
    } else if (kind === 'perfect') {
      tone(660, 760, 0.09, 'sine', 0.3)
      tone(990, 1180, 0.12, 'sine', 0.26, 0.09)
    } else if (kind === 'spring') {
      tone(240, 900, 0.18, 'sine', 0.3)
      tone(480, 1200, 0.12, 'triangle', 0.12, 0.05)
    } else if (kind === 'teleport') {
      tone(1200, 320, 0.18, 'sawtooth', 0.14)
      tone(600, 1500, 0.12, 'sine', 0.16, 0.05)
    } else if (kind === 'gift') {
      tone(880, 990, 0.08, 'sine', 0.22)
      tone(1320, 1320, 0.08, 'sine', 0.18, 0.08)
      tone(1760, 1760, 0.1, 'sine', 0.14, 0.16)
    } else if (kind === 'magnet') {
      tone(420, 1200, 0.16, 'sine', 0.22)
      tone(1200, 1600, 0.08, 'triangle', 0.1, 0.12)
    } else if (kind === 'pick') {
      tone(1046, 1568, 0.07, 'sine', 0.2)
      tone(1568, 1568, 0.06, 'sine', 0.14, 0.06)
    } else if (kind === 'jet') {
      noise(0.34, 0.1, 520, 'lowpass')
      tone(180, 520, 0.3, 'sawtooth', 0.12)
    } else if (kind === 'fall') {
      tone(420, 110, 0.26, 'triangle', 0.18)
    }
  }

  return {
    get on() { return on },
    setOn(v) {
      on = !!v
      try { localStorage.setItem(SFX_KEY, on ? '1' : '0') } catch (e) { /* 存不了就算了 */ }
      if (on) ctxOf()
    },
    unlock() { ctxOf() },
    play,
    dispose() {
      master = null
      if (ac) {
        try { if (ac.state !== 'closed') ac.close() } catch (e) { /* 已关就算了 */ }
      }
      ac = null
    },
  }
}