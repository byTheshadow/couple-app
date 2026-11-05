/* 梦海兔 · 音景：WebAudio 现合成雨声兜底；public/sleep/ 有曲子就优先放。
   没有音频文件也必须能跑：先试曲子，失败/没有就下雨。 */
const TRACKS = [] // 例：['/sleep/rain.mp3', '/sleep/lullaby.mp3']，用户放了再填

export function createSleepAudio() {
  let ctx = null
  let src = null
  let lfo = null
  let gain = null
  let el = null
  let playing = false

  const rain = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false
      ctx = ctx || new AC()
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 400
      gain = ctx.createGain()
      gain.gain.value = 0.15
      lfo = ctx.createOscillator()
      lfo.frequency.value = 0.05
      const lg = ctx.createGain()
      lg.gain.value = 0.04
      lfo.connect(lg)
      lg.connect(gain.gain)
      src.connect(lp)
      lp.connect(gain)
      gain.connect(ctx.destination)
      src.start()
      lfo.start()
      return true
    } catch { return false }
  }

  const start = () => {
    if (playing) return
    // 有曲子先试曲子；没有/加载失败就雨声
    if (TRACKS.length) {
      try {
        el = new Audio(TRACKS[0])
        el.loop = true
        el.volume = 0.5
        el.play().then(() => { playing = true }).catch(() => { el = null; if (rain()) playing = true })
        return
      } catch { el = null }
    }
    if (rain()) playing = true
  }

  const stop = () => {
    try { if (el) { el.pause(); el.currentTime = 0 } } catch { /* ignore */ }
    try { if (src) src.stop() } catch { /* ignore */ }
    try { if (lfo) lfo.stop() } catch { /* ignore */ }
    try { if (ctx) ctx.close() } catch { /* ignore */ }
    el = null; src = null; lfo = null; ctx = null; gain = null; playing = false
  }

  const setLevel = (v) => {
    const k = Math.max(0, Math.min(1, v))
    try { if (gain) gain.gain.value = 0.15 * k } catch { /* ignore */ }
    try { if (el) el.volume = 0.5 * k } catch { /* ignore */ }
  }

  return { start, stop, setLevel, isPlaying: () => playing }
}