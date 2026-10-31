import { W, H, FLOOR, drawSky, drawGifts, drawGiftGlows } from './scenes'

/* ===========================================================================
   三个「天气场景」：雨夜 / 下雪夜 / 下雪白天
   - 和 office、cafe 一样是整幅手画场景（不是 SCENE_DATA 的数据场景），因为雨雪要动、光要渐变
   - 画面是同一间客厅：沙发在左、茶几和台灯在右、窗在右上、墙上一排灯串
   - 小人由 art.js 的 drawChar 画在这之上（这里的 FLOOR = 98，和家里一致）
   - 这三个场景不画礼物摆件：礼物坐标是按卧室床边排的，硬套过来会穿帮
   =========================================================================== */

export const WEATHER_KEYS = ['rain_day', 'rain', 'snow_day', 'snow_night']

export const isWeatherScene = (k) => WEATHER_KEYS.indexOf(k) >= 0

const R = (ctx, x, y, w, h, c) => {
  if (w <= 0 || h <= 0) return
  ctx.fillStyle = c
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}
const mod = (a, n) => ((a % n) + n) % n

function disc(ctx, cx, cy, rad, c) {
  for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) {
    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad) R(ctx, x, y, 1, 1, c)
    }
  }
}

/** 柔和光晕：径向渐变，夜里用 'lighter' 叠在暗部上 */
function glowAt(ctx, cx, cy, rad, rgb, alpha, mode) {
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
  grd.addColorStop(0, `rgba(${rgb},${alpha})`)
  grd.addColorStop(0.45, `rgba(${rgb},${(alpha * 0.45).toFixed(3)})`)
  grd.addColorStop(1, `rgba(${rgb},0)`)
  ctx.save()
  if (mode) ctx.globalCompositeOperation = mode
  ctx.fillStyle = grd
  ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2)
  ctx.restore()
}

/* ---------- 三套调色板：同一间屋子，只换光 ---------- */

const MOOD = {
  rain: {
    wall: '#2b3156', wallTop: '#39406a', stripe: '#333a61', base: '#1d2340', baseHi: '#28304f',
    floor1: '#5f4534', floor2: '#55402f',
    winFrame: '#7d6144', winIn: '#9c7f5c', sill: '#c2a37c',
    sofaBack: '#5c6a9e', sofaTop: '#6f7db2', sofaArm: '#6675a6', sofaArmTop: '#7d8cc0',
    sofaSeat: '#8796c8', sofaSeatTop: '#98a7d6', sofaLeg: '#2f3756',
    tableTop: '#8e6136', tableHi: '#a87a49', tableLeg: '#7a5230',
    rug: '#5b4f9e', rugBorder: '#7364c0', rugFringe: '#665ab0',
    pot: '#8a5a3c', leaf: '#2f7a52', leaf2: '#3f9a66',
    lights: true, lamp: true,
  },
  rain_day: {
    wall: '#b9c7d8', wallTop: '#c3d0df', stripe: '#a9b8ca', base: '#94a4b8', baseHi: '#a8b7c8',
    floor1: '#63492f', floor2: '#583f28',
    winFrame: '#847764', winIn: '#ab9578', sill: '#c6b398',
    sofaBack: '#64749f', sofaTop: '#7787b0', sofaArm: '#6c7ba6', sofaArmTop: '#8191b8',
    sofaSeat: '#8b99bd', sofaSeatTop: '#9eabd0', sofaLeg: '#4a5570',
    tableTop: '#a87d55', tableHi: '#c09368', tableLeg: '#8d6743',
    rug: '#7a6fbe', rugBorder: '#9187d0', rugFringe: '#8479c6',
    pot: '#a97a55', leaf: '#4f9b6c', leaf2: '#67b083',
    lights: false, lamp: true, // 雨天白天也是暗的，所以台灯开着
  },
  snow_night: {
    wall: '#2a3160', wallTop: '#363e70', stripe: '#343c6c', base: '#1c2244', baseHi: '#2a3156',
    floor1: '#5b4436', floor2: '#513c30',
    winFrame: '#8a6f52', winIn: '#a98b66', sill: '#cbb08a',
    sofaBack: '#5a689b', sofaTop: '#6d7cb0', sofaArm: '#6473a4', sofaArmTop: '#7b8abd',
    sofaSeat: '#8593c6', sofaSeatTop: '#96a5d4', sofaLeg: '#2c3352',
    tableTop: '#8b5f36', tableHi: '#a67849', tableLeg: '#775030',
    rug: '#5a4f9c', rugBorder: '#7265bd', rugFringe: '#655aad',
    pot: '#89603e', leaf: '#2c7550', leaf2: '#3b9464',
    lights: true, lamp: true,
  },
  snow_day: {
    wall: '#d7e2ef', wallTop: '#e3edf7', stripe: '#c9d7e7', base: '#bccbe0', baseHi: '#ccd9e8',
    floor1: '#7f6047', floor2: '#735640',
    winFrame: '#a89a86', winIn: '#c3ab8c', sill: '#d8c6ad',
    sofaBack: '#7f8db4', sofaTop: '#93a0c4', sofaArm: '#8b98be', sofaArmTop: '#a2aecf',
    sofaSeat: '#a9b4d2', sofaSeatTop: '#bcc6de', sofaLeg: '#5a6480',
    tableTop: '#a87d55', tableHi: '#c09368', tableLeg: '#8d6743',
    rug: '#7a6fbe', rugBorder: '#9187d0', rugFringe: '#8479c6',
    pot: '#a97a55', leaf: '#4f9b6c', leaf2: '#67b083',
    lights: false, lamp: false,
  },
}

/* ---------- 窗外 ---------- */

function skyRect(ctx, x, y, w, h, stops) {
  const grd = ctx.createLinearGradient(0, y, 0, y + h)
  stops.forEach((c, i) => grd.addColorStop(i / (stops.length - 1), c))
  ctx.fillStyle = grd
  ctx.fillRect(x, y, w, h)
}

function outsideRain(ctx) {
  skyRect(ctx, 100, 14, 40, 44, ['#0b1130', '#121a3e', '#1b2450'])
  // 远处的楼，几扇亮着的窗
  R(ctx, 100, 46, 12, 12, '#0a0f2a')
  R(ctx, 112, 50, 8, 8, '#0b1231')
  R(ctx, 120, 44, 10, 14, '#090e28')
  R(ctx, 130, 48, 10, 10, '#0a102c')
  R(ctx, 123, 40, 1, 4, '#090e28') // 天线
  R(ctx, 103, 49, 2, 2, '#ffcf6b')
  R(ctx, 107, 53, 2, 2, '#ffd98a')
  R(ctx, 114, 52, 2, 2, '#ffcf6b')
  R(ctx, 124, 47, 2, 2, '#ffb347')
  R(ctx, 127, 51, 2, 2, '#ffd98a')
  R(ctx, 133, 50, 2, 2, '#ffcf6b')
  // 湿漉漉的地面 + 反光
  R(ctx, 100, 54, 40, 4, '#131a3c')
  R(ctx, 104, 55, 7, 1, '#2a3566')
  R(ctx, 118, 56, 9, 1, '#2a3566')
  R(ctx, 131, 55, 6, 1, '#26305e')
}

function outsideRainDay(ctx) {
  skyRect(ctx, 100, 14, 40, 44, ['#8fa6bf', '#b9c8d8', '#d6e0e8'])
  // 远处的楼（白天雨里是灰蓝的剪影）
  R(ctx, 100, 44, 12, 14, '#4d5a6c')
  R(ctx, 112, 48, 9, 10, '#566680')
  R(ctx, 121, 42, 10, 16, '#46536a')
  R(ctx, 131, 47, 9, 11, '#4d5a6c')
  R(ctx, 124, 38, 1, 4, '#46536a') // 天线
  // 楼顶的亮边
  R(ctx, 100, 44, 12, 1, '#77869a')
  R(ctx, 121, 42, 10, 1, '#6d7c90')
  // 湿地面 + 反光
  R(ctx, 100, 54, 40, 4, '#7d8896')
  R(ctx, 104, 55, 7, 1, '#a5b4c4')
  R(ctx, 118, 56, 9, 1, '#9fb0c0')
  R(ctx, 131, 55, 6, 1, '#a5b4c4')
}

function outsideSnowNight(ctx) {
  skyRect(ctx, 100, 14, 40, 44, ['#0a1438', '#16224e', '#22305e'])
  disc(ctx, 130, 20, 4, '#fdf6d8')
  disc(ctx, 132.7, 18.3, 3.4, '#101c46') // 挖出月牙
  for (const [tx, hh, ww] of [[104, 12, 7], [112, 16, 9], [122, 10, 6], [131, 14, 8]]) {
    for (let i = 0; i < hh; i++) {
      const w = Math.max(1, Math.round((ww * (i + 1)) / hh))
      R(ctx, tx - (w >> 1), 54 - hh + i, w, 1, '#101a34')
    }
    R(ctx, tx - (ww >> 1), 54 - hh + 1, ww, 1, '#cfe0f5') // 树顶的雪
  }
  R(ctx, 100, 52, 40, 6, '#dfe9ff')
  R(ctx, 100, 52, 40, 1, '#f4f9ff')
  for (let i = 0; i < 7; i++) R(ctx, 102 + i * 5, 53 + (i % 2), 2, 1, '#c9d8f2')
}

function outsideSnowDay(ctx) {
  skyRect(ctx, 100, 14, 40, 44, ['#b9d6f1', '#d5eaf9', '#edf6fc'])
  R(ctx, 100, 38, 40, 8, '#dbe8f6')
  R(ctx, 100, 40, 40, 1, '#e8f2fb')
  for (const [tx, hh, ww] of [[103, 11, 7], [111, 15, 9], [121, 9, 6], [130, 13, 8]]) {
    for (let i = 0; i < hh; i++) {
      const w = Math.max(1, Math.round((ww * (i + 1)) / hh))
      R(ctx, tx - (w >> 1), 52 - hh + i, w, 1, '#3f6b57')
    }
    R(ctx, tx - (ww >> 1), 52 - hh + 1, ww, 1, '#f0f7ff')
    R(ctx, tx - (ww >> 1) + 1, 52 - hh + 3, ww - 1, 1, '#e4f0fb')
  }
  R(ctx, 100, 50, 40, 8, '#f6fbff')
  R(ctx, 100, 50, 40, 1, '#ffffff')
  for (let i = 0; i < 8; i++) R(ctx, 101 + i * 5, 52 + (i % 3), 3, 1, '#e6f0fa')
}

/* ---------- 雨丝 / 雪花（只在玻璃里） ---------- */

function particlesInGlass(ctx, key, t) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(100, 14, 40, 44)
  ctx.clip()
  if (key === 'rain' || key === 'rain_day') {
    for (let i = 0; i < 34; i++) {
      const x = 101 + mod(i * 13.7, 38)
      const y = 14 + mod(i * 9.1 + t * (72 + (i % 4) * 16), 44)
      const len = i % 7 === 0 ? 4 : 1 + (i % 2)
      const ink = key === 'rain_day' ? '86,106,138' : '158,182,245'
      const strong = i % 7 === 0
      const a = key === 'rain_day' ? (strong ? 0.85 : 0.6) : (strong ? 0.75 : 0.5)
      R(ctx, x, y, 1, len, `rgba(${ink},${a})`)
    }
    for (let i = 0; i < 5; i++) {
      const ph = mod(t * 1.7 + i * 0.37, 1)
      if (ph < 0.18) R(ctx, 102 + i * 8, 56, 2, 1, 'rgba(190,215,255,.5)') // 打在窗台的水花
    }
  } else {
    for (let i = 0; i < 46; i++) {
      const drift = Math.sin(t * 0.7 + i * 1.7) * 3
      const x = 100 + mod(i * 17.3 + drift, 40)
      const y = 14 + mod(i * 11.7 + t * (9 + (i % 3) * 3.5), 44)
      const big = i % 6 === 0
      R(ctx, x, y, big ? 2 : 1, big ? 2 : 1, big ? '#ffffff' : 'rgba(240,247,255,.85)')
    }
  }
  ctx.restore()
}

/* ---------- 窗 ---------- */

function drawWindowWith(ctx, M, opt) {
  R(ctx, 95, 9, 50, 54, M.winFrame)
  R(ctx, 98, 12, 44, 48, M.winIn)
  ctx.save()
  ctx.beginPath()
  ctx.rect(100, 14, 40, 44)
  ctx.clip()
  opt.glass(ctx)
  ctx.restore()
  // 玻璃反光
  ctx.save()
  ctx.globalAlpha = opt.shine
  R(ctx, 102, 16, 4, 38, '#ffffff')
  ctx.restore()
  // 窗棂
  R(ctx, 119, 14, 2, 44, M.winIn)
  R(ctx, 100, 35, 40, 2, M.winIn)
  R(ctx, 119, 14, 1, 44, 'rgba(255,255,255,.18)')
  // 窗台
  R(ctx, 92, 60, 56, 3, M.sill)
  R(ctx, 92, 63, 56, 1, M.winFrame)
  R(ctx, 92, 60, 56, 1, 'rgba(255,255,255,.25)')
  R(ctx, 92, 64, 56, 2, 'rgba(0,0,0,.10)')
  if (opt.snow) {
    R(ctx, 91, 58, 58, 2, '#f2f7ff') // 积雪
    R(ctx, 91, 58, 58, 1, '#ffffff')
    for (let i = 0; i < 9; i++) R(ctx, 93 + i * 6, 57, 3, 1, '#f7fbff')
  }
}

function drawWindow(ctx, M, key, t) {
  const day = key === 'snow_day' || key === 'rain_day'
  drawWindowWith(ctx, M, {
    snow: key.indexOf('snow') === 0,
    shine: day ? 0.18 : 0.07,
    glass: (c) => {
      if (key === 'rain') outsideRain(c)
      else if (key === 'rain_day') outsideRainDay(c)
      else if (key === 'snow_night') outsideSnowNight(c)
      else outsideSnowDay(c)
      particlesInGlass(c, key, t)
    },
  })
}

/* ---------- 房间 ---------- */

function drawRoom(ctx, M) {
  R(ctx, 0, 0, W, 94, M.wall)
  R(ctx, 0, 0, W, 9, M.wallTop)
  for (let x = 0; x < W; x += 8) R(ctx, x, 0, 1, 94, M.stripe)
  R(ctx, 0, 89, W, 5, M.base)
  R(ctx, 0, 94, W, 4, M.base)
  R(ctx, 0, 96, W, 1, M.baseHi)
  // 地板
  let y = FLOOR
  let row = 0
  while (y < H) {
    const hh = Math.min(6, H - y)
    R(ctx, 0, y, W, hh, row % 2 === 0 ? M.floor1 : M.floor2)
    const off = row % 2 === 0 ? 0 : 28
    for (let x = -off; x < W; x += 56) R(ctx, x, y, 1, hh, 'rgba(0,0,0,.1)')
    R(ctx, 0, y, W, 1, 'rgba(0,0,0,.1)')
    y += 6
    row += 1
  }
  R(ctx, 0, FLOOR, W, 1, 'rgba(0,0,0,.18)')
}

function drawRug(ctx, M) {
  R(ctx, 50, 101, 62, 13, M.rug)
  R(ctx, 50, 101, 62, 1, M.rugBorder)
  R(ctx, 50, 113, 62, 1, M.rugBorder)
  R(ctx, 50, 101, 1, 13, M.rugBorder)
  R(ctx, 111, 101, 1, 13, M.rugBorder)
  R(ctx, 55, 104, 52, 1, M.rugBorder)
  R(ctx, 55, 110, 52, 1, M.rugBorder)
  for (let x = 52; x < 111; x += 4) {
    R(ctx, x, 99, 2, 1, M.rugFringe)
    R(ctx, x, 114, 2, 1, M.rugFringe)
  }
  for (let yy = 103; yy < 113; yy += 4) {
    R(ctx, 48, yy, 1, 2, M.rugFringe)
    R(ctx, 113, yy, 1, 2, M.rugFringe)
  }
  R(ctx, 50, 114, 62, 1, 'rgba(0,0,0,.16)')
}

function drawSofa(ctx, M) {
  R(ctx, 8, 74, 54, 8, M.sofaBack)
  R(ctx, 8, 74, 54, 2, M.sofaTop)
  R(ctx, 6, 80, 9, 16, M.sofaArm)
  R(ctx, 6, 80, 9, 2, M.sofaArmTop)
  R(ctx, 57, 80, 9, 16, M.sofaArm)
  R(ctx, 57, 80, 9, 2, M.sofaArmTop)
  R(ctx, 14, 80, 44, 16, M.sofaBack)
  R(ctx, 15, 84, 20, 11, M.sofaSeat)
  R(ctx, 37, 84, 20, 11, M.sofaSeat)
  R(ctx, 15, 84, 20, 1, M.sofaSeatTop)
  R(ctx, 37, 84, 20, 1, M.sofaSeatTop)
  R(ctx, 10, 95, 4, 3, M.sofaLeg)
  R(ctx, 59, 95, 4, 3, M.sofaLeg)
  // 抱枕
  R(ctx, 18, 80, 10, 9, '#ff9fb6')
  R(ctx, 18, 80, 10, 1, '#ffc3d2')
  R(ctx, 20, 82, 6, 2, '#f2799a')
  R(ctx, 40, 82, 9, 7, '#ffcf6b')
  R(ctx, 40, 82, 9, 1, '#ffe4a3')
  R(ctx, 8, 96, 54, 2, 'rgba(0,0,0,.35)')
}

function drawTable(ctx, M) {
  R(ctx, 100, 88, 26, 3, M.tableTop)
  R(ctx, 100, 88, 26, 1, M.tableHi)
  R(ctx, 102, 91, 2, 7, M.tableLeg)
  R(ctx, 122, 91, 2, 7, M.tableLeg)
  // 杯中咖啡
  R(ctx, 108, 83, 5, 5, '#f6f2e8')
  R(ctx, 108, 85, 5, 1, '#e8996a')
  R(ctx, 113, 84, 1, 3, '#f6f2e8')
  if (M.lamp) drawTableLamp(ctx)
}

function drawTableLamp(ctx) {
  R(ctx, 116, 87, 10, 1, '#5f6478')
  R(ctx, 120, 81, 2, 6, '#8d92a6')
  R(ctx, 116, 76, 9, 5, '#ffd77a')
  R(ctx, 115, 76, 11, 1, '#ffe9b8')
  R(ctx, 116, 80, 9, 1, '#e0ac4c')
}

function drawPlant(ctx, M) {
  R(ctx, 146, 82, 10, 16, M.pot)
  R(ctx, 146, 82, 10, 1, 'rgba(255,255,255,.18)')
  R(ctx, 147, 68, 8, 15, M.leaf)
  R(ctx, 143, 74, 4, 7, M.leaf2)
  R(ctx, 155, 72, 3, 8, M.leaf2)
  R(ctx, 149, 64, 4, 5, M.leaf2)
}

function drawFairyLights(ctx, t) {
  for (let i = 0; i < 10; i++) {
    const x = 8 + i * 16
    const y = 11 + Math.round(3 * Math.abs((i % 4) - 1.5))
    const tw = 0.65 + 0.35 * Math.sin(t * 2.1 + i * 1.3)
    glowAt(ctx, x + 1, y + 1, 10, '255,214,130', 0.16 * tw, 'lighter')
    R(ctx, x, y, 2, 2, '#ffe6a8')
  }
}

/** 光：白天只有窗光落在地上；夜里是窗外的冷光 + 台灯的暖光 */
function drawLight(ctx, key, t) {
  ctx.save()
  ctx.beginPath()
  if (key === 'snow_day' || key === 'rain_day') {
    const rainy = key === 'rain_day'
    ctx.moveTo(98, FLOOR)
    ctx.lineTo(142, FLOOR)
    ctx.lineTo(150, H)
    ctx.lineTo(88, H)
    ctx.closePath()
    ctx.clip()
    const lg = ctx.createLinearGradient(0, FLOOR, 0, H)
    lg.addColorStop(0, rainy ? 'rgba(226,236,246,.20)' : 'rgba(255,255,255,.26)')
    lg.addColorStop(1, 'rgba(255,255,255,.02)')
    ctx.fillStyle = lg
    ctx.fillRect(88, FLOOR, 62, H - FLOOR)
    ctx.restore()
    glowAt(ctx, 120, 66, 26, rainy ? '214,228,242' : '235,246,255', rainy ? 0.14 : 0.2, 'lighter')
    if (key === 'snow_day') return
  } else {
    ctx.moveTo(98, FLOOR)
    ctx.lineTo(142, FLOOR)
    ctx.lineTo(148, H)
    ctx.lineTo(92, H)
    ctx.closePath()
    ctx.clip()
    ctx.globalAlpha = key === 'snow_night' ? 0.13 : 0.07
    R(ctx, 92, FLOOR, 56, H - FLOOR, '#9fc4ff')
    ctx.restore()
  }
  // 台灯：灯罩下的暖光 + 地上的一滩
  const flick = 0.86 + 0.14 * Math.sin(t * 3.1) * Math.sin(t * 1.7)
  glowAt(ctx, 120, 78, 34, '255,186,110', 0.46 * flick, 'lighter')
  ctx.save()
  ctx.globalAlpha = 0.22 * flick
  R(ctx, 108, 96, 26, 8, '#ffb877')
  ctx.restore()
}

function vignette(ctx, key) {
  if (key === 'snow_day' || key === 'rain_day') return // 白天不加暗角，不然中间会显出一块假亮
  const grd = ctx.createRadialGradient(78, 62, 34, 78, 62, 108)
  grd.addColorStop(0, 'rgba(4,6,18,0)')
  grd.addColorStop(1, 'rgba(4,6,18,.42)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, W, H)
}

/**
 * 画一个天气场景。key 见 WEATHER_KEYS，t = 秒（驱动雨雪和灯光）。
 * 只画背景，小人由 art.js 接着画。
 */
export function drawWeatherScene(ctx, key, t) {
  const M = MOOD[key] || MOOD.rain
  drawRoom(ctx, M)
  drawLight(ctx, key, t)
  drawRug(ctx, M)
  drawWindow(ctx, M, key, t)
  if (M.lights) drawFairyLights(ctx, t)
  drawSofa(ctx, M)
  drawTable(ctx, M)
  drawPlant(ctx, M)
  if (key === 'rain_day') {
    ctx.save()
    ctx.globalAlpha = 0.04
    R(ctx, 0, 0, W, H, '#3c4a63')
    ctx.restore()
  }
  vignette(ctx, key)
}

/* ===========================================================================
   家里的客厅（「家」的一种房间，不是独立场景）
   - 同一间屋子、同一套家具，窗外用 scenes.js 的 drawSky，按时段自己变
   - 傍晚以后开灯串和台灯，地上留一滩暖光
   - 卧室（drawHome）继续负责睡觉和起床到出门
   =========================================================================== */

const LIVING = {
  wall: '#f0e3cf', wallTop: '#f8efdf', stripe: '#e6d6bd', base: '#dcc9ae', baseHi: '#eadcc4',
  floor1: '#b98b62', floor2: '#ad7f56',
  winFrame: '#b08a63', winIn: '#cdae8a', sill: '#dcc4a2',
  sofaBack: '#7c8ab0', sofaTop: '#8f9dc2', sofaArm: '#8492b8', sofaArmTop: '#99a6ca',
  sofaSeat: '#9dabd0', sofaSeatTop: '#b0bcdc', sofaLeg: '#5a6478',
  tableTop: '#b98b62', tableHi: '#d0a274', tableLeg: '#9a7047',
  rug: '#f0b8c8', rugBorder: '#dc93a8', rugFringe: '#e3a3b6',
  pot: '#c56a4a', leaf: '#62c46e', leaf2: '#3f9a4f',
}

/** 傍晚开灯：19:00 到第二天 6:30（和 art.js 里那层暖色滤镜同一个时间段） */
export const isLivingDark = (hr) => hr >= 19 || hr < 6.5

/** 客厅。hr = 现在的钟点，t = 秒（灯串和台灯会轻轻呼吸）；gifts = 收到的礼物（摆到客厅的插槽上） */
export function drawLivingRoom(ctx, hr, t, gifts = []) {
  const dark = isLivingDark(hr)
  const M = { ...LIVING, lamp: dark, lights: dark }
  drawRoom(ctx, M)
  // 白天：窗光落在地上
  if (!dark) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(98, FLOOR)
    ctx.lineTo(142, FLOOR)
    ctx.lineTo(150, H)
    ctx.lineTo(88, H)
    ctx.closePath()
    ctx.clip()
    const lg = ctx.createLinearGradient(0, FLOOR, 0, H)
    lg.addColorStop(0, 'rgba(255,247,224,.22)')
    lg.addColorStop(1, 'rgba(255,247,224,.02)')
    ctx.fillStyle = lg
    ctx.fillRect(88, FLOOR, 62, H - FLOOR)
    ctx.restore()
  }
  drawRug(ctx, M)
  drawWindowWith(ctx, M, {
    snow: false,
    shine: dark ? 0.06 : 0.10,
    glass: (c) => drawSky(c, 100, 14, 40, 44, hr, t, false, true),
  })
  drawSofa(ctx, M)
  drawTable(ctx, { ...M, lamp: false })
  drawPlant(ctx, M)
  drawGifts(ctx, gifts, t, 'living')
  if (dark) {
    // 先把房间压暗，再把灯画上去——顺序反了灯也会被压暗，屋里就没有暖光了
    ctx.save()
    ctx.globalAlpha = 0.28
    R(ctx, 0, 0, W, H, '#1d1730')
    ctx.restore()
    const flick = 0.86 + 0.14 * Math.sin(t * 3.1) * Math.sin(t * 1.7)
    drawFairyLights(ctx, t)
    drawTableLamp(ctx)
    glowAt(ctx, 120, 78, 34, '255,186,110', 0.5 * flick, 'lighter')
    ctx.save()
    ctx.globalAlpha = 0.24 * flick
    R(ctx, 108, 96, 26, 8, '#ffb877')
    ctx.restore()
    drawGiftGlows(ctx, gifts, 'living')
  }
}
