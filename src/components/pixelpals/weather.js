/* ===========================================================================
   像素小屋 · 现实天气（第十七轮之后的新功能）
   - 城市只存在**本机** localStorage，不上传、对方看不到（和 ai.js 存 API key 一个道理）
   - 云端只同步「窗外是雨还是雪」这一个词，走实时通道的 presence，不写数据库
   - 只在雨 / 雪时接管窗外；其它天气一律返回 null，让原来的场景照旧
   - 拿不到（没网、没设城市、接口挂了）也返回 null，不报错、不留白
   这个文件不画图、不碰界面，只负责「现在外面是什么天气」。
   =========================================================================== */

const KEY = 'pal_weather_v1'
const TTL = 30 * 60 * 1000 // 半小时更新一次，够用，也不至于把免费额度刷爆

export const DEFAULT_WEATHER = {
  on: false,
  city: '',
  lat: null,
  lon: null,
  kind: null, // null | 'rain' | 'snow'
  heavy: false,
  temp: null,
  at: 0,
}

export function loadWeather() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { ...DEFAULT_WEATHER, ...o }
  } catch {
    return { ...DEFAULT_WEATHER }
  }
}

export function saveWeather(patch) {
  const next = { ...loadWeather(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* 隐私模式写不进去就算了 */ }
  return next
}

/** 要不要重新拉一次：没开、没坐标、或者过期了 */
export function needRefresh(w, now = Date.now()) {
  if (!w || !w.on || w.lat == null || w.lon == null) return false
  return !w.at || now - w.at > TTL
}

/**
 * WMO 天气码 -> 我们的两种窗外天气
 * 只认雨和雪：其它（晴、多云、雾）都返回 null，因为屋里没有对应画法，
 * 硬接管会把你选的场景顶掉。
 */
export function kindOf(code) {
  const c = Number(code)
  if (!Number.isFinite(c)) return { kind: null, heavy: false }
  if (c >= 95) return { kind: 'rain', heavy: true } // 雷阵雨
  if (c >= 85 && c <= 86) return { kind: 'snow', heavy: true } // 阵雪
  if (c >= 71 && c <= 77) return { kind: 'snow', heavy: c >= 75 }
  if (c >= 65 && c <= 67) return { kind: 'rain', heavy: true } // 冻雨 / 大雨
  if (c >= 61 && c <= 64) return { kind: 'rain', heavy: false }
  if (c >= 80 && c <= 82) return { kind: 'rain', heavy: c >= 82 } // 阵雨
  if (c >= 51 && c <= 57) return { kind: 'rain', heavy: false } // 毛毛雨
  return { kind: null, heavy: false }
}

/** 城市名 -> 坐标。查不到返回 null（界面提示「查不到这个城市」） */
export async function geocodeCity(name) {
  const q = String(name || '').trim()
  if (!q) return null
  const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=zh&format=json&name=' + encodeURIComponent(q)
  const r = await fetch(url)
  if (!r.ok) throw new Error('geocode ' + r.status)
  const d = await r.json()
  const hit = d && Array.isArray(d.results) ? d.results[0] : null
  if (!hit) return null
  return {
    lat: hit.latitude,
    lon: hit.longitude,
    city: hit.name || q,
    // 只用来在设置里显示，不上传
    label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(' · '),
  }
}

/**
 * 拉一次当前天气。成功返回新的 weather 状态，失败抛错（调用方自己决定要不要提示）。
 * 只取 current.weather_code / temperature_2m。
 */
export async function refreshWeather(w) {
  if (!w || w.lat == null || w.lon == null) return w
  const url = 'https://api.open-meteo.com/v1/forecast?current=weather_code,temperature_2m'
    + '&latitude=' + w.lat + '&longitude=' + w.lon
  const r = await fetch(url)
  if (!r.ok) throw new Error('weather ' + r.status)
  const d = await r.json()
  const cur = (d && d.current) || {}
  const k = kindOf(cur.weather_code)
  return saveWeather({
    kind: k.kind,
    heavy: k.heavy,
    temp: Number.isFinite(cur.temperature_2m) ? Math.round(cur.temperature_2m) : null,
    at: Date.now(),
  })
}

/** 设置里显示给人看的一句话 */
export function weatherText(w) {
  if (!w || !w.on) return '没开'
  if (w.lat == null) return '还没设城市'
  if (!w.at) return '正在查…'
  if (w.kind === 'snow') return (w.heavy ? '大雪' : '下雪') + (w.temp == null ? '' : ' · ' + w.temp + '°C')
  if (w.kind === 'rain') return (w.heavy ? '大雨' : '小雨') + (w.temp == null ? '' : ' · ' + w.temp + '°C')
  return '晴 / 多云' + (w.temp == null ? '' : ' · ' + w.temp + '°C')
}

/** 送去画图的形状：{ kind, heavy } —— 给 art.js 的窗口用 */
export function wxForArt(w) {
  if (!w || !w.on || !w.kind) return null
  return { kind: w.kind, heavy: !!w.heavy }
}