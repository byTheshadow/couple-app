/* ===========================================================================
   水晶球的音色：全部用 WebAudio 现场合成，不放任何音频文件。
   好处是体积为零、能无缝循环、能做渐弱定时关——助眠靠的就是这两样。
   用法：const sb = createSoundBox()；sb.play(id)；sb.setVolume(0~1)；sb.fade(分钟，0 = 不限时)；离开页面时 sb.destroy()
   浏览器要求声音必须由点击触发，所以只在用户点音色的时候才会创建 AudioContext。
   =========================================================================== */

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

export function createSoundBox() {
  let ctx = null, master = null, cur = null, nodes = [], timers = [], fadeT = 0
  let vol = 0.6, playing = 'none'

  function ensure() {
    if (ctx) return ctx
    const AC = window.AudioContext || window.webkitAudioContext
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = vol
    master.connect(ctx.destination)
    return ctx
  }
  function noise(kind) {
    const len = ctx.sampleRate * 2
    const b = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = b.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2 } else d[i] = w
    }
    // 收尾淡接，循环点听不出来
    const f = 1200
    for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[len - 1 - i] *= k }
    const s = ctx.createBufferSource()
    s.buffer = b
    s.loop = true
    return s
  }
  const reg = (n) => { nodes.push(n); return n }
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); }
  const every = (fn, ms) => { timers.push(setInterval(fn, ms)); }

  function bell(freq, dur, gain, type) {
    const o = ctx.createOscillator()
    const o2 = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type || 'sine'; o.frequency.value = freq
    o2.type = 'sine'; o2.frequency.value = freq * 2.76
    const g2 = ctx.createGain(); g2.gain.value = 0.22
    const now = ctx.currentTime
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(gain, now + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(master)
    o.start(now); o2.start(now)
    o.stop(now + dur + 0.05); o2.stop(now + dur + 0.05)
  }

  const PENTA = [523.25, 587.33, 698.46, 783.99, 932.33, 1046.5, 1174.66, 1396.91]
  const TUNE = [0, 2, 4, 2, 5, 4, 2, 0, 3, 2, 1, 2, 4, 5, 4, 2]

  const MAKE = {
    rain() {
      const s = reg(noise('white'))
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200
      const g = reg(ctx.createGain()); g.gain.value = 0.17
      const lfo = reg(ctx.createOscillator()); lfo.frequency.value = 0.09
      const lg = ctx.createGain(); lg.gain.value = 0.045
      lfo.connect(lg); lg.connect(g.gain)
      s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master)
      s.start(); lfo.start()
      // 屋檐上偶尔一滴
      every(() => { if (Math.random() < 0.55) bell(rnd(900, 1700), 0.18, 0.025, 'sine') }, 900)
    },
    wave() {
      const s = reg(noise('brown'))
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620
      const g = reg(ctx.createGain()); g.gain.value = 0.1
      const lfo = reg(ctx.createOscillator()); lfo.frequency.value = 0.075
      const lg = ctx.createGain(); lg.gain.value = 0.085
      lfo.connect(lg); lg.connect(g.gain)
      const lfo2 = reg(ctx.createOscillator()); lfo2.frequency.value = 0.11
      const lg2 = ctx.createGain(); lg2.gain.value = 260
      lfo2.connect(lg2); lg2.connect(lp.frequency)
      s.connect(lp); lp.connect(g); g.connect(master)
      s.start(); lfo.start(); lfo2.start()
    },
    fire() {
      const s = reg(noise('brown'))
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 760
      const g = reg(ctx.createGain()); g.gain.value = 0.16
      s.connect(lp); lp.connect(g); g.connect(master)
      s.start()
      every(() => {
        const n = 1 + Math.floor(Math.random() * 3)
        for (let i = 0; i < n; i++) {
          later(() => {
            if (!ctx) return
            const b = ctx.createBufferSource()
            const len = Math.floor(ctx.sampleRate * 0.05)
            const buf = ctx.createBuffer(1, len, ctx.sampleRate)
            const d = buf.getChannelData(0)
            for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 4)
            b.buffer = buf
            const bg = ctx.createGain(); bg.gain.value = rnd(0.05, 0.18)
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rnd(700, 2600)
            b.connect(bp); bp.connect(bg); bg.connect(master)
            b.start()
          }, Math.random() * 600)
        }
      }, 700)
    },
    chime() {
      every(() => {
        if (Math.random() < 0.45) return
        const n = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < n; i++) {
          later(() => { if (ctx) bell(PENTA[Math.floor(Math.random() * PENTA.length)], rnd(2.4, 4.2), 0.08, 'sine') }, i * rnd(120, 420))
        }
      }, 1700)
    },
    box() {
      let i = 0
      every(() => {
        if (!ctx) return
        const note = PENTA[TUNE[i % TUNE.length]]
        bell(note, 1.9, 0.075, 'triangle')
        if (i % 4 === 0) bell(note / 2, 2.6, 0.04, 'sine')
        i++
      }, 640)
    },
    wind() {
      const s = reg(noise('white'))
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.8
      const g = reg(ctx.createGain()); g.gain.value = 0.14
      const lfo = reg(ctx.createOscillator()); lfo.frequency.value = 0.06
      const lg = ctx.createGain(); lg.gain.value = 320
      lfo.connect(lg); lg.connect(bp.frequency)
      const lfo2 = reg(ctx.createOscillator()); lfo2.frequency.value = 0.13
      const lg2 = ctx.createGain(); lg2.gain.value = 0.06
      lfo2.connect(lg2); lg2.connect(g.gain)
      s.connect(bp); bp.connect(g); g.connect(master)
      s.start(); lfo.start(); lfo2.start()
    },
  }

  function stop() {
    timers.forEach((t) => { clearTimeout(t); clearInterval(t) })
    timers = []
    nodes.forEach((n) => { try { n.stop ? n.stop() : n.disconnect() } catch (e) { /* 已经停了 */ } })
    nodes = []
    cur = null
    playing = 'none'
  }
  function play(id) {
    stop()
    if (id === 'none' || !MAKE[id]) { playing = 'none'; return }
    ensure()
    if (ctx.state === 'suspended') ctx.resume()
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.setValueAtTime(vol, ctx.currentTime)
    MAKE[id]()
    cur = id
    playing = id
  }
  function setVolume(v) {
    vol = clamp(v, 0, 1)
    if (master && ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(vol, ctx.currentTime, 0.1) }
  }
  // 定时渐弱关闭：minutes=0 表示不限时
  function fade(minutes) {
    clearTimeout(fadeT)
    if (!minutes || !ctx) return
    const ms = minutes * 60000
    fadeT = setTimeout(() => {
      if (!ctx || !master) return
      master.gain.setTargetAtTime(0, ctx.currentTime, 25)
      setTimeout(stop, 90000)
    }, Math.max(0, ms - 90000))
  }
  function destroy() {
    stop()
    clearTimeout(fadeT)
    if (ctx) { try { ctx.close() } catch (e) { /* 忽略 */ } ctx = null }
  }
  return { play, stop, setVolume, fade, destroy, get now() { return playing } }
}