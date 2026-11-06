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

/* ===========================================================================
   第十三轮：在家可以去的新房间（厨房 / 阁楼 / 花房 / 游戏角）
   和客厅一样是整幅手画场景：小人由 art.js 的 drawChar 画在这之上（FLOOR = 98）。
   不画礼物摆件（礼物坐标是按卧室/客厅排的）。
   =========================================================================== */

const PX = (ctx, x, y, c) => R(ctx, x, y, 1, 1, c)

function LN(ctx, x0, y0, x1, y1, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, e = dx + dy
  for (;;) {
    PX(ctx, x0, y0, c)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * e
    if (e2 >= dy) { e += dy; x0 += sx }
    if (e2 <= dx) { e += dx; y0 += sy }
  }
}

function EL(ctx, cx, cy, rx, ry, c) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if ((x * x) / ((rx + .5) * (rx + .5)) + (y * y) / ((ry + .5) * (ry + .5)) <= 1) PX(ctx, cx + x, cy + y, c)
  }
}

function FR(ctx, x, y, w, h, c) {
  R(ctx, x, y, w, 2, c); R(ctx, x, y + h - 2, w, 2, c); R(ctx, x, y, 2, h, c); R(ctx, x + w - 2, y, 2, h, c)
}

const isDarkHour = (hr) => hr >= 19 || hr < 6.5

function roomWall(ctx, M) {
  R(ctx, 0, 0, W, 94, M.wall); R(ctx, 0, 0, W, 9, M.wallTop)
  for (let x = 0; x < W; x += 8) R(ctx, x, 0, 1, 94, M.stripe)
  R(ctx, 0, 89, W, 5, M.base); R(ctx, 0, 94, W, 4, M.base); R(ctx, 0, 96, W, 1, M.baseHi)
}

function plankFloor(ctx, c1, c2, seam = 'rgba(0,0,0,.10)') {
  for (let y = FLOOR; y < H; y += 6) {
    const row = (y - FLOOR) / 6
    R(ctx, 0, y, W, 6, row % 2 ? c1 : c2); R(ctx, 0, y, W, 1, 'rgba(0,0,0,.10)')
  }
  for (let x = 0; x < W; x += 24) R(ctx, x, FLOOR, 1, H - FLOOR, seam)
  R(ctx, 0, FLOOR, W, 1, 'rgba(0,0,0,.22)')
}

function roomDim(ctx, a) { ctx.save(); ctx.globalAlpha = a; R(ctx, 0, 0, W, H, '#151226'); ctx.restore() }

/* ---------- 厨房（早上默认来这儿） ---------- */

export function drawKitchen(ctx, hr, t) {
  const M = { wall: '#f8f1e3', wallTop: '#fffaf0', stripe: '#eee2cc', base: '#e2d3b8', baseHi: '#f1e5cd' }
  roomWall(ctx, M)
  for (let yy = FLOOR; yy < H; yy += 6) for (let x = 0; x < W; x += 12) R(ctx, x, yy, 12, 6, ((x / 12 + (yy - FLOOR) / 6) | 0) % 2 ? '#cdbfa6' : '#ddd0b8')
  R(ctx, 0, FLOOR, W, 1, 'rgba(0,0,0,.22)')
  // 绿墙砖
  R(ctx, 0, 56, 70, 14, '#9db89a')
  for (let x = 0; x < 70; x += 8) R(ctx, x, 56, 1, 14, '#8aa887')
  for (let y = 56; y < 70; y += 7) R(ctx, 0, y, 70, 1, '#8aa887')
  R(ctx, 0, 56, 70, 1, 'rgba(255,255,255,.25)')
  // 柜台 + 柜门 + 烤箱
  R(ctx, 0, 70, 70, 4, '#b98b62'); R(ctx, 0, 70, 70, 1, '#d0a274')
  R(ctx, 0, 74, 70, 18, '#efe6d2')
  for (let x = 2; x < 70; x += 16) { R(ctx, x, 74, 1, 18, '#ded1b8'); R(ctx, x + 8, 79, 4, 1, '#8d7a5c') }
  R(ctx, 14, 76, 20, 14, '#3a3a42'); R(ctx, 15, 77, 18, 9, '#1d1d24'); R(ctx, 15, 77, 18, 2, '#2b2b33'); R(ctx, 15, 87, 18, 1, '#5a5a66')
  // 灶 + 锅 + 热气
  R(ctx, 12, 66, 28, 4, '#3a3a42'); R(ctx, 13, 66, 26, 1, '#4d4d58')
  R(ctx, 17, 59, 14, 7, '#c9503e'); R(ctx, 17, 59, 14, 1, '#e06a55'); R(ctx, 16, 61, 1, 3, '#8f3a2c'); R(ctx, 31, 61, 1, 3, '#8f3a2c')
  R(ctx, 20, 57, 8, 1, '#e06a55')
  const s = Math.sin(t * 2.2)
  R(ctx, 21, 52 + (s > 0 ? 0 : 1), 2, 4, 'rgba(255,255,255,.5)')
  R(ctx, 25, 49 + (s > 0 ? 1 : 0), 2, 4, 'rgba(255,255,255,.35)')
  // 吊柜
  R(ctx, 4, 22, 44, 26, '#efe6d2'); R(ctx, 4, 22, 44, 2, '#ded1b8'); R(ctx, 26, 22, 1, 26, '#ded1b8')
  R(ctx, 12, 34, 5, 1, '#8d7a5c'); R(ctx, 34, 34, 5, 1, '#8d7a5c')
  // 窗
  FR(ctx, 96, 12, 44, 42, '#b08a63')
  R(ctx, 98, 14, 40, 38, '#cfe6f5'); drawSky(ctx, 98, 14, 40, 38, hr, t, false, true)
  R(ctx, 94, 54, 48, 3, '#dcc4a2')
  for (let i = 0; i < 3; i++) {
    R(ctx, 100 + i * 11, 46, 7, 6, '#c56a4a'); R(ctx, 100 + i * 11, 46, 7, 1, '#d98a6a')
    R(ctx, 102 + i * 11, 41, 3, 5, '#5fb86a'); R(ctx, 101 + i * 11, 43, 2, 3, '#4a9c55')
  }
  // 冰箱
  R(ctx, 140, 54, 18, 38, '#eae5da'); R(ctx, 140, 54, 18, 1, '#f7f3ea'); R(ctx, 140, 74, 18, 1, '#d6cfc0')
  R(ctx, 155, 58, 1, 12, '#b9b1a0'); R(ctx, 155, 78, 1, 10, '#b9b1a0')
  R(ctx, 145, 60, 3, 3, '#ff8fa3'); R(ctx, 150, 82, 3, 2, '#7cc4e8')
  // 挂锅杆
  R(ctx, 48, 28, 20, 2, '#8d7a5c')
  for (let i = 0; i < 2; i++) { const x = 53 + i * 9; R(ctx, x, 30, 1, 3, '#8d7a5c'); R(ctx, x - 3, 33, 6, 4, '#5a5f6a'); R(ctx, x - 3, 33, 6, 1, '#8a9099') }
  // 吊灯
  const dark = isDarkHour(hr)
  R(ctx, 80, 0, 1, 12, '#6b6357'); R(ctx, 74, 12, 13, 6, '#e8b84a'); R(ctx, 73, 12, 15, 1, '#f6d98a'); R(ctx, 74, 17, 13, 1, '#c99a34')
  // 地垫
  R(ctx, 62, 104, 38, 10, '#d8c8a8'); R(ctx, 62, 104, 38, 1, '#c4b190'); R(ctx, 62, 113, 38, 1, '#c4b190')
  if (dark) {
    roomDim(ctx, 0.26)
    glowAt(ctx, 80, 18, 30, '255,200,120', 0.3, 'lighter')
    ctx.save(); ctx.globalAlpha = 0.16; R(ctx, 64, 96, 40, 10, '#ffb877'); ctx.restore()
  }
}

/* ---------- 阁楼（夜里默认来这儿） ---------- */

export function drawAttic(ctx, hr, t) {
  // 木墙板 + 木结
  R(ctx, 0, 0, W, 94, '#4a3a2e')
  for (let x = 0; x < W; x += 12) R(ctx, x, 0, 1, 94, '#413226')
  for (let i = 0; i < 9; i++) R(ctx, 16 + (i * 37) % 140, 46 + (i * 23) % 40, 2, 1, '#3a2c22')
  R(ctx, 0, 0, W, 6, '#3a2c22')
  // 斜梁 + 椽
  for (let x = 0; x < W; x++) {
    const y = 26 - Math.round(Math.abs(x - 80) * 0.3)
    R(ctx, x, y, 1, 5, '#6b513d'); R(ctx, x, y, 1, 1, '#7d6048')
  }
  R(ctx, 0, 26, W, 3, '#5b4534')
  for (let x = 30; x < 150; x += 40) { R(ctx, x, 8, 3, 18, '#5b4534'); R(ctx, x, 8, 1, 18, '#6b513d') }
  // 斜天窗（里面是当前时段的天空）
  for (let i = 0; i < 26; i++) {
    const off = Math.round(i * 0.5)
    const edge = i < 2 || i > 23
    R(ctx, 44 + off, 3 + i, 46, 1, edge ? '#6b513d' : '#0f1836')
  }
  R(ctx, 47, 5, 44, 20, '#0f1836')
  drawSky(ctx, 47, 5, 44, 20, hr, t, false, true)
  R(ctx, 43, 28, 50, 2, '#6b513d')
  // 月光斜下来
  for (let y = 30; y < FLOOR; y++) {
    const k = (y - 30) / (FLOOR - 30)
    R(ctx, Math.round(38 + k * 26), y, 26, 1, 'rgba(170,190,255,.05)')
  }
  // 地板 + 地毯
  plankFloor(ctx, '#7d6247', '#876b4e')
  R(ctx, 46, 100, 70, 14, '#8a6450'); R(ctx, 48, 101, 66, 12, '#a4795f')
  R(ctx, 48, 101, 66, 1, '#c08f6f'); R(ctx, 48, 112, 66, 1, '#8a6450')
  for (let x = 52; x < 112; x += 10) R(ctx, x, 104, 4, 4, '#c08f6f')
  // 纸箱
  const box = (x, yy, w, h, c) => {
    R(ctx, x, yy, w, h, c); R(ctx, x, yy, w, 1, 'rgba(255,255,255,.14)')
    R(ctx, x + (w >> 1) - 2, yy, 4, h, '#e8d9b8'); R(ctx, x + 4, yy + 4, 8, 5, '#f2e8cf')
    R(ctx, x + 5, yy + 5, 6, 1, '#b9a88a'); R(ctx, x + 5, yy + 7, 4, 1, '#b9a88a')
  }
  box(6, 80, 26, 16, '#c9a06a'); box(10, 66, 20, 14, '#b8915e'); box(34, 86, 15, 10, '#c9a06a')
  // 架子 + 玻璃罐
  R(ctx, 6, 40, 42, 3, '#6b513d'); R(ctx, 6, 40, 42, 1, '#7d6048')
  for (const [c, x] of [['#c9a06a', 10], ['#8fb5a8', 22], ['#c9503e', 33]]) {
    R(ctx, x, 31, 8, 9, c); R(ctx, x, 31, 8, 1, 'rgba(255,255,255,.35)'); R(ctx, x + 1, 29, 6, 2, '#b9a88a')
  }
  // 相框
  FR(ctx, 56, 34, 16, 14, '#6b513d'); R(ctx, 58, 36, 12, 10, '#d8c8a8'); R(ctx, 60, 38, 8, 6, '#8fb5a8'); R(ctx, 61, 39, 6, 2, '#e8e2d0')
  // 矮桌 + 书 + 杯子
  R(ctx, 78, 84, 26, 3, '#8a6a4f'); R(ctx, 78, 84, 26, 1, '#a07d5c'); R(ctx, 80, 87, 2, 9, '#6b513d'); R(ctx, 100, 87, 2, 9, '#6b513d')
  R(ctx, 82, 78, 8, 6, '#c9503e'); R(ctx, 82, 78, 8, 1, '#e06a55'); R(ctx, 84, 74, 6, 4, '#4a6fa8')
  R(ctx, 94, 79, 6, 5, '#e8e2d0'); R(ctx, 94, 79, 6, 1, '#f6f2e8'); R(ctx, 100, 80, 1, 3, '#e8e2d0'); R(ctx, 95, 81, 4, 1, '#c98a5a')
  // 懒人椅
  R(ctx, 108, 80, 40, 12, '#5b4a3c'); R(ctx, 108, 80, 40, 2, '#6b584a')
  R(ctx, 110, 74, 36, 8, '#c08f6f'); R(ctx, 110, 74, 36, 2, '#d8a888')
  R(ctx, 112, 76, 10, 6, '#ff9fb6'); R(ctx, 124, 76, 10, 6, '#8fb5a8')
  R(ctx, 108, 92, 3, 5, '#3f3126'); R(ctx, 145, 92, 3, 5, '#3f3126')
  // 吉他
  R(ctx, 148, 72, 9, 14, '#c9803f'); R(ctx, 150, 75, 5, 8, '#e5a05a'); R(ctx, 152, 78, 2, 2, '#3a2412')
  R(ctx, 154, 58, 2, 15, '#7a4a24'); R(ctx, 153, 53, 5, 6, '#3a2412')
  // 吊灯
  R(ctx, 64, 0, 1, 22, '#3f3126'); R(ctx, 59, 22, 11, 6, '#ffd77a'); R(ctx, 58, 22, 13, 1, '#ffe9b8'); R(ctx, 60, 27, 9, 1, '#e0ac4c')
  // 灯串
  for (let i = 0; i < 9; i++) {
    const x = 14 + i * 16
    const yy = 30 + Math.round(2 * Math.sin(i * 1.2))
    R(ctx, x, yy, 1, 3, '#2b211b'); R(ctx, x - 1, yy + 3, 3, 2, '#ffe6a8')
  }
  roomDim(ctx, 0.3)
  glowAt(ctx, 64, 25, 30, '255,200,120', 0.22, 'lighter')
  for (let i = 0; i < 9; i++) glowAt(ctx, 14 + i * 16, 33 + Math.round(2 * Math.sin(i * 1.2)), 6, '255,210,130', 0.1, 'lighter')
  glowAt(ctx, 60, 14, 26, '150,175,255', 0.1, 'lighter')
}

/* ---------- 花房（白天） ---------- */

const SWAY = [0, 1, 0, -1]
const FLOWER_COLORS = [['#ff5d73', '#d93a55'], ['#ffd34d', '#e8b52e'], ['#a487e8', '#7d5cc8'], ['#6aa8ff', '#3c6bff'], ['#ffb3c7', '#e07a95']]

function basketAt(ctx, x, top, t, i) {
  for (let y = top; y < top + 12; y++) PX(ctx, x, y, y % 2 ? '#8d968f' : '#b4bcb6')
  LN(ctx, x, top + 12, x - 6, top + 16, '#8d968f'); LN(ctx, x, top + 12, x + 6, top + 16, '#8d968f')
  EL(ctx, x, top + 17, 7, 2, '#3f8a45'); EL(ctx, x, top + 16, 4, 1, '#6fbd5a')
  R(ctx, x - 6, top + 18, 13, 2, '#9a6a35'); R(ctx, x - 5, top + 20, 11, 2, '#7a4e24'); R(ctx, x - 3, top + 22, 7, 1, '#5e3b1a')
  const sway = SWAY[Math.floor(t * 2 + i) % 4]
  for (const d of [[-4, 9], [-2, 12], [0, 7], [2, 13], [4, 9], [6, 6]]) {
    const dx = d[0], len = d[1]
    for (let k = 0; k < len; k++) {
      const py = top + 19 + k
      if (k < 3) continue
      const px = x + dx + Math.round(sway * k / len * 1.5)
      PX(ctx, px, py, k % 3 === 2 ? '#6fbd5a' : '#3f8a45')
      if (k % 3 === 1) PX(ctx, px + (i % 2 ? 1 : -1), py, '#56a24e')
    }
    PX(ctx, x + dx + Math.round(sway * 1.5), top + 19 + len, i % 2 ? '#ffb3c7' : '#ffd34d')
  }
  PX(ctx, x - 3, top + 17, i % 2 ? '#ffb3c7' : '#ffd34d'); PX(ctx, x + 3, top + 16, i % 2 ? '#ffd34d' : '#ffb3c7')
}

function flowerBed(ctx, t, soilY) {
  let i = 0
  for (let x = 3; x < W - 2; x += 4) {
    const h = 8 + ((i * 7) % 8)
    const o = SWAY[(Math.floor(t * 2) + (i >> 2)) % 4]
    for (let k = 1; k < h; k++) PX(ctx, x + Math.round(o * k / h), soilY - k, k % 3 ? '#4c8f3e' : '#3f7a34')
    PX(ctx, x - 1, soilY - 2, '#5fb04f'); PX(ctx, x + 1, soilY - 1, '#5fb04f')
    const c = FLOWER_COLORS[i % 5]
    const tx = x + o, ty = soilY - h
    PX(ctx, tx, ty, c[0]); PX(ctx, tx - 1, ty + 1, c[0]); PX(ctx, tx + 1, ty + 1, c[0]); PX(ctx, tx, ty - 1, c[1]); PX(ctx, tx, ty + 1, '#fff1b8')
    i++
  }
}

function cloche(ctx, x, y) {
  EL(ctx, x, y, 4, 5, 'rgba(210,240,255,.16)')
  for (let a = 0; a < 40; a++) { const an = Math.PI * a / 39; PX(ctx, x - Math.cos(an) * 4, y - Math.sin(an) * 5, 'rgba(200,235,255,.75)') }
  PX(ctx, x, y + 2, '#4f9a4a'); PX(ctx, x - 1, y + 1, '#6fbd5a'); PX(ctx, x + 1, y, '#6fbd5a')
  R(ctx, x - 5, y + 5, 11, 2, '#7a4a26'); R(ctx, x - 5, y + 5, 11, 1, '#b5763f')
}

export function drawGreenhouse(ctx, hr, t) {
  // 天空 / 云 / 山
  for (let y = 0; y < 58; y++) { const k = y / 58; R(ctx, 0, y, W, 1, `rgb(${Math.round(143 + 93 * k)},${Math.round(205 + 41 * k)},${Math.round(230 - 4 * k)})`) }
  for (const c of [[10, 22, .9, 1], [64, 34, .6, .8], [112, 18, .45, .7]]) {
    const cx = ((c[0] + t * c[2] * 4) % 200) - 20
    EL(ctx, cx, c[1], 13 * c[3], 3, 'rgba(255,255,255,.8)'); EL(ctx, cx - 6 * c[3], c[1] + 1, 7 * c[3], 2, '#ffffff'); EL(ctx, cx + 7 * c[3], c[1] - 1, 6 * c[3], 2, '#ffffff')
  }
  for (let i = 0; i < 6; i++) EL(ctx, i * 30 + 8, 60, 22, 8, '#b5dba3')
  for (let i = 0; i < 5; i++) EL(ctx, i * 34 + 22, 63, 18, 7, '#8cc77a')
  for (let i = 0; i < 14; i++) EL(ctx, (i * 37) % 160, 56 + (i * 11) % 6, 2, 2, '#5f9f57')
  R(ctx, 0, 58, W, 36, 'rgba(232,244,236,.55)')
  // 木裙板
  R(ctx, 0, 78, W, 16, '#b5763f')
  for (let y = 78; y < 94; y += 4) R(ctx, 0, y, W, 1, 'rgba(90,50,20,.22)')
  for (let x = 0; x < W; x += 20) R(ctx, x, 78, 1, 16, 'rgba(90,50,20,.18)')
  R(ctx, 0, 78, W, 1, '#cf9257')
  // 玻璃结构
  for (let k = -5; k <= 5; k++) { LN(ctx, 80 + k * 4, 0, 80 + k * 15, 15, '#f3f6ef'); LN(ctx, 81 + k * 4, 0, 81 + k * 15, 15, '#b8c6b4') }
  R(ctx, 0, 15, W, 2, '#f3f6ef'); R(ctx, 0, 17, W, 1, '#b8c6b4')
  for (const x of [0, 40, 80, 120, 157]) { R(ctx, x, 18, 3, 76, '#f3f6ef'); R(ctx, x + 2, 18, 1, 76, '#b8c6b4') }
  R(ctx, 0, 44, W, 2, '#f3f6ef'); R(ctx, 0, 46, W, 1, '#b8c6b4')
  for (let x = 4; x < W; x += 10) LN(ctx, x, 42, x + 3, 24, 'rgba(255,255,255,.25)')
  // 右侧爬藤架
  for (let y = 22; y < 76; y += 6) R(ctx, 143, y, 15, 1, '#c9b08a')
  for (let x = 143; x <= 158; x += 5) R(ctx, x, 22, 1, 54, '#c9b08a')
  R(ctx, 142, 22, 2, 54, '#b5763f'); R(ctx, 157, 22, 2, 54, '#b5763f')
  for (let k = 0; k < 40; k++) {
    const px = 145 + Math.round(6 * Math.sin(k * 0.4 + t * 1.2)), py = 74 - k
    PX(ctx, px, py, k % 4 ? '#4c8f3e' : '#5fb04f')
    if (k % 5 === 2) PX(ctx, px + (k % 2 ? 1 : -1), py, '#7fd08a')
    if (k % 9 === 4) PX(ctx, px + 1, py, '#ffd34d')
  }
  // 串灯
  for (let x = 0; x < W; x++) PX(ctx, x, 30 + Math.round(3 * Math.sin(Math.PI * (x % 32) / 32)), '#6a5b48')
  for (let s = 0; s < 5; s++) for (const lx of [5, 11, 17, 23, 29]) {
    const x = s * 32 + lx, y = 32 + Math.round(3 * Math.sin(Math.PI * lx / 32))
    const ph = (s * 5 + lx + Math.floor(t * 3)) % 4
    if (ph === 0 || ph === 3) glowAt(ctx, x, y, 5, '255,226,140', 0.2, 'lighter')
    PX(ctx, x, y, ph === 0 || ph === 3 ? '#fff6c8' : '#d9a443'); PX(ctx, x, y + 1, '#ffd76a')
  }
  // 吊篮（46 号那个在洒水壶上方）
  basketAt(ctx, 22, 0, t, 0); basketAt(ctx, 80, 2, t, 1); basketAt(ctx, 46, 0, t, 2)
  // 花槽
  R(ctx, 0, 62, W, 4, '#c4673a'); R(ctx, 0, 62, W, 1, '#de8656')
  for (let x = 0; x < W; x += 12) R(ctx, x, 62, 1, 4, 'rgba(120,50,20,.35)')
  R(ctx, 0, 66, W, 4, '#5a3a24')
  flowerBed(ctx, t, 66)
  R(ctx, 0, 70, W, 8, '#b5583a')
  for (let y = 70; y < 78; y += 4) R(ctx, 0, y, W, 1, '#86402a')
  for (let x = 0; x < W; x += 16) R(ctx, x, 70, 1, 8, '#86402a')
  R(ctx, 0, 70, W, 1, '#e0a070')
  // 操作台
  R(ctx, 2, 80, 56, 3, '#b5763f'); R(ctx, 2, 80, 56, 1, '#cf9257'); R(ctx, 2, 83, 56, 1, '#7a4a26')
  R(ctx, 4, 84, 3, 13, '#7a4a26'); R(ctx, 53, 84, 3, 13, '#7a4a26')
  R(ctx, 2, 89, 56, 2, '#8a5a30'); R(ctx, 2, 89, 56, 1, '#a06c3c')
  for (const x of [8, 18, 28]) { R(ctx, x, 85, 6, 4, '#c4673a'); R(ctx, x, 85, 6, 1, '#de8656'); PX(ctx, x + 2, 83, '#5fb04f'); PX(ctx, x + 3, 83, '#6fbd5a') }
  cloche(ctx, 16, 73)
  R(ctx, 26, 78, 10, 2, '#3b3b3b'); for (let k = 0; k < 5; k++) { PX(ctx, 27 + k * 2, 76, '#6fbd5a'); PX(ctx, 27 + k * 2, 75, '#9bd677') }
  R(ctx, 42, 74, 9, 6, '#6aa79a'); R(ctx, 42, 74, 2, 6, '#9ad0c2'); LN(ctx, 51, 76, 55, 71, '#6aa79a'); R(ctx, 54, 69, 2, 3, '#4a8478')
  for (let k = 0; k < 3; k++) { const dy = (t * 9 + k * 5) % 14; PX(ctx, 46, 58 + dy, 'rgba(200,235,255,.85)') }
  // 圆桌
  R(ctx, 118, 82, 24, 2, '#b5763f'); R(ctx, 118, 82, 24, 1, '#cf9257'); R(ctx, 128, 84, 2, 12, '#7a4a26'); R(ctx, 121, 94, 18, 2, '#7a4a26')
  R(ctx, 124, 77, 5, 4, '#f3efe2'); R(ctx, 124, 77, 5, 1, '#fffdf4'); R(ctx, 129, 78, 1, 2, '#f3efe2'); R(ctx, 125, 79, 3, 1, '#c08a5a')
  const st = Math.sin(t * 3)
  PX(ctx, 126, 74 + (st > 0 ? 0 : 1), 'rgba(255,255,255,.5)'); PX(ctx, 127, 72 + (st > 0 ? 1 : 0), 'rgba(255,255,255,.35)')
  R(ctx, 136, 76, 4, 6, '#e8e2d0'); PX(ctx, 137, 73, '#4c8f3e'); PX(ctx, 137, 72, '#ff9fb6'); PX(ctx, 138, 72, '#ffb3c7')
  // 地板（陶土斜格）
  for (let y = FLOOR; y < H; y += 2) for (let x = 0; x < W; x += 2) R(ctx, x, y, 2, 2, (((x >> 1) + (y >> 1)) % 2) ? '#d68c5d' : '#c47a4d')
  R(ctx, 0, FLOOR, W, 1, 'rgba(90,40,10,.35)')
  R(ctx, 4, 118, 52, 2, 'rgba(80,30,10,.18)'); R(ctx, 116, 118, 32, 2, 'rgba(80,30,10,.15)')
  // 蝴蝶 / 光柱 / 尘埃
  const bp = [[40, 56], [70, 48], [104, 56], [84, 62], [52, 60]][Math.floor(t * 1.5) % 5]
  const flap = Math.floor(t * 6) % 2
  PX(ctx, bp[0], bp[1], '#ffb3c7'); PX(ctx, bp[0] + (flap ? 2 : 1), bp[1], '#ffb3c7'); PX(ctx, bp[0] + 1, bp[1] + 1, '#5a4a3a')
  ctx.save(); ctx.globalAlpha = 0.14 + 0.05 * Math.sin(t * 2)
  for (let y = 0; y < FLOOR; y++) { const k = y / FLOOR; R(ctx, Math.round(96 - k * 22), y, 13, 1, '#fff6c4'); R(ctx, Math.round(38 - k * 6), y, 8, 1, '#fff6c4') }
  ctx.restore()
  for (let i = 0; i < 9; i++) PX(ctx, 30 + ((i * 17 + Math.floor(t * 3)) % 110), 30 + ((i * 23 + Math.floor(t * 2)) % 58), 'rgba(255,250,215,.8)')
  if (isDarkHour(hr)) {
    roomDim(ctx, 0.34)
    for (let s = 0; s < 5; s++) for (const lx of [5, 11, 17, 23, 29]) glowAt(ctx, s * 32 + lx, 34 + Math.round(3 * Math.sin(Math.PI * lx / 32)), 8, '255,220,150', 0.12, 'lighter')
    glowAt(ctx, 80, 10, 40, '150,175,255', 0.06, 'lighter')
  }
}

/* ---------- 游戏角（赛博朋克） ---------- */

const NEON_COLORS = ['#ff2fd6', '#8a3cff', '#2fe6ff', '#3c6bff']
const PIXEL_FONT = {
  P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
  L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
}

function neonText(ctx, x, y, str, color) {
  for (const ch of str) {
    const g = PIXEL_FONT[ch]
    for (let ry = 0; ry < 5; ry++) for (let rx = 0; rx < 3; rx++) if (g[ry][rx] === 'X') PX(ctx, x + rx, y + ry, color)
    x += 4
  }
}

export function drawGameCorner(ctx, hr, t) {
  R(ctx, 0, 0, W, 94, '#1c1234')
  for (let x = 0; x < W; x += 26) R(ctx, x, 0, 3, 94, '#140c27')
  R(ctx, 0, 0, W, 7, '#0b0716')
  const led = NEON_COLORS[Math.floor(t * 1.5) % 4]
  R(ctx, 0, 7, W, 1, led)
  ctx.save(); ctx.globalAlpha = 0.16; R(ctx, 0, 8, W, 8, led); ctx.restore()
  // 窗
  FR(ctx, 6, 12, 82, 64, '#3b2f5c')
  R(ctx, 8, 14, 78, 60, '#090418')
  for (let y = 0; y < 60; y++) { const k = y / 60; R(ctx, 8, 14 + y, 78, 1, `rgb(${Math.round(9 + 60 * k)},${Math.round(4 + 22 * k)},${Math.round(24 + 60 * k)})`) }
  EL(ctx, 66, 26, 6, 6, '#e8e2c8'); EL(ctx, 64, 24, 3, 3, '#f6f0d8')
  for (let i = 0; i < 6; i++) { const h = 10 + (i * 7) % 18; R(ctx, 10 + i * 12, 74 - h, 10, h, i % 2 ? '#140833' : '#1b1040') }
  for (let i = 0; i < 18; i++) { const x = 10 + (i * 13) % 72, y = 40 + (i * 11) % 32; PX(ctx, x, y, i % 3 ? '#ff2fd6' : '#2fe6ff') }
  R(ctx, 12, 64, 14, 4, 'rgba(255,47,214,.35)'); R(ctx, 40, 58, 10, 3, 'rgba(47,230,255,.35)')
  const carX = 10 + Math.floor((t * 14) % 74), carY = 36 + Math.round(2 * Math.sin(t * 3))
  R(ctx, carX, carY, 5, 2, '#2fe6ff'); R(ctx, carX - 4, carY + 1, 4, 1, 'rgba(47,230,255,.5)'); PX(ctx, carX + 5, carY, '#ff2fd6')
  for (let i = 0; i < 16; i++) { const x = 8 + (i * 19 + Math.floor(t * 30)) % 78, y = 14 + (i * 13 + Math.floor(t * 40)) % 58; R(ctx, x, y, 1, 3, 'rgba(190,215,255,.22)') }
  ctx.save(); ctx.globalAlpha = 0.12; R(ctx, 14, 14, 2, 58, '#fff'); R(ctx, 48, 14, 2, 58, '#fff'); ctx.restore()
  // 霓虹 PLAY
  const flick = (Math.floor(t * 7) % 23 === 0) ? 0.35 : 1
  ctx.save(); ctx.globalAlpha = flick
  neonText(ctx, 102, 16, 'PLAY', '#ff2fd6')
  ctx.restore()
  glowAt(ctx, 110, 18, 20, '255,47,214', 0.2, 'lighter')
  // 六边形灯板
  for (let i = 0; i < 3; i++) {
    const cx = 104 + i * 10, cy = 30
    const c = NEON_COLORS[(i + Math.floor(t * 1.5)) % 4]
    for (let a = 0; a < 6; a++) { const an = Math.PI / 3 * a; PX(ctx, cx + Math.cos(an) * 4, cy + Math.sin(an) * 4, c) }
    R(ctx, cx - 2, cy - 2, 4, 4, c)
  }
  // 桌子
  R(ctx, 70, 82, 90, 4, '#251a3e'); R(ctx, 70, 82, 90, 1, '#3d2e66')
  R(ctx, 70, 86, 90, 10, '#130d22')
  R(ctx, 72, 96, 4, 2, '#0f0a1c'); R(ctx, 156, 96, 4, 2, '#0f0a1c')
  R(ctx, 76, 90, 80, 1, led)
  // 主屏
  R(ctx, 88, 38, 62, 44, '#0b0716'); R(ctx, 88, 38, 62, 1, '#3d2e66'); R(ctx, 88, 80, 62, 2, '#0b0716')
  R(ctx, 92, 42, 54, 34, '#1a1030')
  for (let y = 0; y < 14; y++) { const ww = Math.round(20 * Math.sin(Math.PI * (y + 1) / 16)); R(ctx, 119 - (ww >> 1), 44 + y, ww, 1, y % 3 === 0 ? '#ff8a3d' : '#ff4d8d') }
  R(ctx, 92, 58, 54, 1, '#ff2e88')
  for (let y = 60; y < 76; y += 3) R(ctx, 92, y, 54, 1, y % 2 ? 'rgba(47,230,255,.35)' : 'rgba(47,230,255,.18)')
  for (let x = 92; x < 146; x += 6) R(ctx, x, 60, 1, 16, 'rgba(47,230,255,.16)')
  for (let y = 42; y < 76; y += 2) R(ctx, 92, y, 54, 1, 'rgba(0,0,0,.16)')
  // 副屏代码
  R(ctx, 72, 50, 18, 32, '#0b0716'); R(ctx, 74, 52, 14, 28, '#0f1a22')
  for (let i = 0; i < 8; i++) R(ctx, 75, 54 + i * 3, 4 + (i * 5) % 9, 1, i % 3 ? '#4dff8a' : '#5fd4ff')
  // 键盘 / 鼠标 / 耳机 / 罐
  R(ctx, 98, 78, 30, 4, '#1b1430'); R(ctx, 100, 79, 26, 1, '#2b2040')
  for (let i = 0; i < 8; i++) PX(ctx, 101 + i * 3, 79, i % 2 ? '#ff2fd6' : '#2fe6ff')
  R(ctx, 132, 79, 5, 3, '#1b1430'); PX(ctx, 133, 78, '#2fe6ff')
  R(ctx, 82, 74, 6, 8, '#2b2040'); R(ctx, 83, 71, 4, 4, '#3d2e66'); PX(ctx, 84, 70, '#ff2fd6')
  R(ctx, 144, 74, 5, 8, '#20163a'); R(ctx, 144, 74, 5, 1, '#3d2e66')
  // 机箱
  R(ctx, 150, 58, 8, 24, '#0f0a1c'); R(ctx, 150, 58, 8, 1, '#3d2e66')
  for (let i = 0; i < 3; i++) EL(ctx, 154, 62 + i * 7, 2, 2, NEON_COLORS[(i + Math.floor(t * 1.5)) % 4])
  // 线缆
  for (const c of [[96, '#2b2040'], [120, led], [142, '#2fe6ff']]) R(ctx, c[0], 76, 1, 8, c[1])
  // 电竞椅
  R(ctx, 28, 62, 26, 6, '#241a3d'); R(ctx, 28, 62, 26, 1, '#3d2e66')
  R(ctx, 30, 68, 22, 20, '#1b1430'); R(ctx, 32, 70, 18, 16, '#241a3d')
  R(ctx, 28, 68, 2, 20, '#1b1430'); R(ctx, 54, 68, 2, 20, '#1b1430')
  R(ctx, 28, 68, 2, 20, '#3d2e66'); PX(ctx, 28, 70, '#ff2fd6'); PX(ctx, 54, 70, '#ff2fd6')
  R(ctx, 32, 88, 3, 9, '#0f0a1c'); R(ctx, 47, 88, 3, 9, '#0f0a1c'); R(ctx, 30, 96, 24, 2, '#2b2040')
  R(ctx, 40, 86, 2, 10, '#0f0a1c')
  // 地板
  R(ctx, 0, FLOOR, W, 22, '#0c0816')
  for (let y = FLOOR; y < H; y += 4) R(ctx, 0, y, W, 1, 'rgba(60,40,110,.35)')
  for (let x = 0; x < W; x += 20) R(ctx, x, FLOOR, 1, 22, 'rgba(30,20,60,.5)')
  R(ctx, 84, 100, 62, 12, 'rgba(255,47,214,.10)'); R(ctx, 8, 102, 40, 10, 'rgba(47,230,255,.08)')
  // 光
  glowAt(ctx, 119, 58, 46, '255,47,214', 0.16, 'lighter')
  glowAt(ctx, 110, 30, 30, '255,47,214', 0.1, 'lighter')
  glowAt(ctx, 40, 30, 34, '47,230,255', 0.08, 'lighter')
  glowAt(ctx, 76, 96, 36, '47,230,255', 0.1, 'lighter')
  for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.05; R(ctx, 0, i, W, 1, '#000'); R(ctx, 0, H - 1 - i, W, 1, '#000') }
  ctx.globalAlpha = 1
}

/* ===========================================================================
   猫屋（第十四轮 · 一起养的猫）
   - 房间：暖木小屋，壁纸 + 护墙板 + 木地板 + 窗帘 + 台灯 + 猫窝 + 坐垫 + 食盆
   - 猫在家：蜷在坐垫上（眨眼 / 呼吸 / 冒心）；刚出门：爪印 + 猫毛 + 滚出来的毛线球
   - 架子上摆它捡回来的东西；墙上贴着最近一张明信片
   - 白天 / 夜里两套光，按 hour 切，和别的房间一样
   =========================================================================== */

let CTX = null
let CAT_STATE = { home: false, justLeft: false, items: [], latest: null }

const catR = (x, y, w, h, c) => { if (w <= 0 || h <= 0) return; CTX.fillStyle = c; CTX.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)) }
const catP = (x, y, c) => catR(x, y, 1, 1, c)
function catEll(cx, cy, rx, ry, c) {
  if (ry === 0) { catR(cx - rx, cy, rx * 2 + 1, 1, c); return }
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)))
    catR(cx - w, cy + y, w * 2 + 1, 1, c)
  }
}
function catSpr(rows, map, x, y) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j]
    for (let i = 0; i < row.length; i++) { const col = map[row[i]]; if (col) catP(x + i, y + j, col) }
  }
}

/* 它捡回来的东西（架子上的四格） */
const CAT_ITEMS = {
  ticket: { s: ['XXXXX', 'XbbbX', 'XbXbX', 'XbbbX', 'XXXXX'], p: { X: '#8a6a45', b: '#f5e8c6' } },
  shell:  { s: ['.XXX.', 'XaaaX', 'XaabX', '.XaX.', '..X..'], p: { X: '#d9c3a5', a: '#f4b3a2', b: '#fde2d6' } },
  leaf:   { s: ['..XX.', '.XdX.', 'XdddX', '.XddX', '..X..'], p: { X: '#7a4b2a', d: '#d98a3f' } },
  marble: { s: ['.XXX.', 'XcccX', 'XcccX', '.XcX.', '..X..'], p: { X: '#5f7f8f', c: '#a8d6e4' } },
  candy:  { s: ['X.X..', 'XcX..', 'XcX..', 'X.X..', '.....'], p: { X: '#c0554f', c: '#f2a2ac' } },
}
const CAT_LOOT_SPOTS = [[113, 36], [121, 36], [129, 36], [137, 36]]

function catDrawLoot() {
  const list = (CAT_STATE.items || []).slice(-4)
  list.forEach((k, i) => {
    const it = CAT_ITEMS[k]
    if (!it) return
    catSpr(it.s, it.p, CAT_LOOT_SPOTS[i][0], CAT_LOOT_SPOTS[i][1])
  })
}

function catDrawPostcard(t, night) {
  catR(114, 14, 20, 17, '#fbf6ea'); catR(114, 14, 20, 1, '#e2d7c2')
  if (!CAT_STATE.latest) {
    catR(116, 18, 16, 1, '#d8cdb8'); catR(116, 21, 10, 1, '#d8cdb8')
    return
  }
  catR(116, 16, 9, 7, night ? '#3c4a6a' : '#bfe0f5')
  catR(116, 21, 9, 2, night ? '#2b3550' : '#7aa86a')
  catR(127, 17, 5, 3, '#e8dfc8'); catR(128, 18, 3, 1, '#c9b9a0')
  catR(127, 23, 5, 1, '#c9beb0'); catR(127, 25, 4, 1, '#c9beb0'); catR(127, 27, 5, 1, '#c9beb0')
  catR(123, 12, 3, 3, '#8a6a45')
}

/** 猫屋。cat = { home, justLeft, items: [], latest } */
export function drawCatRoom(ctx, hr, t, cat) {
  const night = hr >= 19 || hr < 6.5
  CAT_STATE = { home: false, justLeft: false, items: [], latest: null, ...(cat || {}) }
  CTX = ctx
  catR(0, 0, W, H, '#3a2a22')
  catDrawRoom(t, night)
  catDrawHouse()
  catDrawRug()
  catDrawMat()
  if (CAT_STATE.justLeft) catDrawPawPrints()
  catDrawBasket(!CAT_STATE.justLeft)
  catDrawBowls(!CAT_STATE.justLeft, t)
  catDrawCushion(!!CAT_STATE.justLeft)
  if (CAT_STATE.home) catDrawCat(t)
  if (CAT_STATE.justLeft) catDrawLeftovers(t, 999)
  catDrawLight(t, night)
  catDrawLoot()
  catDrawPostcard(t, night)
  if (!night) { CTX.fillStyle = 'rgba(255,246,228,0.06)'; CTX.fillRect(0, 0, W, H) }
}

const CATK = { o:'#5a3420', O:'#f2a558', D:'#d77f38', L:'#fff0d6', E:'#3a2620', W:'#ffffff', P:'#f08aa0', K:'#f7a7a0' }
const CATSPR = ['..oo..........oo..','..oPo........oPo..','.oOPP........PPOo.','.OOOOOOODDDOOOOOO.','.OOOOOODOOOOOOOOO.','oOOOOOOOOOOOOOOOOo','oOOOWEOOOOOOEWOOOo','oOOOEEOOOOOOEEOOOo','oOOOEEOOOOOOEEOOOo','oOOOOOOOPPOOOOOOOo','oOOOOOOoOOoOOOOOOo','oOOOOOOOooOOOOOOOo','.OOOOOOLLLLOOOOOO.','.ooooooLLLooooooo.','...oOOLLLLLLOOo...','...oOOLLLLLLOOo...','...oOOLLLLLLOOo...','...oOOLLLLLLOOo...','...oOLLLLLLLLOo...','...oLLLLooLLLLo...','...oooooooooooo...']
const CATSPR_BLINK = ['..oo..........oo..','..oPo........oPo..','.oOPP........PPOo.','.OOOOOOODDDOOOOOO.','.OOOOOODOOOOOOOOO.','oOOOOOOOOOOOOOOOOo','oOOOOOOOOOOOOOOOOo','oOOOooOOOOOOooOOOo','oOOOOOOOOOOOOOOOOo','oOOOOOOOPPOOOOOOOo','oOOOOOOoOOoOOOOOOo','oOOOOOOOooOOOOOOOo','.OOOOOOLLLLOOOOOO.','.ooooooLLLooooooo.','...oOOLLLLLLOOo...','...oOOLLLLLLOOo...','...oOOLLLLLLOOo...','...oOOLLLLLLOOo...','...oOLLLLLLLLOo...','...oLLLLooLLLLo...','...oooooooooooo...']
const CATHEART = ['.P.P.', 'PPPPP', 'PPPPP', '.PPP.', '..P..']
const CATFISH = ['......oo....','..o..oFFo...','.oFooFFFFo..','.oFFFFFFEFo.','.oFooFFFFo..','..o..oFFo...','......oo....']

function catDrawRoom(t, night) {
  catR(0,0,W,64, night ? '#e7b98f' : '#f0c8a2')
  for (let x=3;x<W;x+=10) catR(x,0,3,63,'#deac80')
  for (let x=8,j=0;x<W;x+=10,j++){
    for (let y=6+(j%2)*7;y<58;y+=14){
      catP(x,y,'#f4d3ae'); catP(x-1,y+1,'#f4d3ae'); catP(x+1,y+1,'#f4d3ae'); catP(x,y+2,'#f4d3ae'); catP(x,y+1,'#e98a7a')
    }
  }
  catR(0,0,W,2,'#b97a55')
  catR(0,63,W,21, night ? '#a8674a' : '#b0714f')
  catR(0,63,W,2,'#e3b58a'); catR(0,65,W,1,'#7f4a35')
  for (let x=4;x<W;x+=20){ catR(x,69,16,11,'#9a5d42'); catR(x,69,16,1,'#7f4a35'); catR(x,79,16,1,'#c07f5c') }
  catR(0,82,W,2,'#5e3626')
  catR(0,84,W,36, night ? '#8a5639' : '#96603f')
  for (let row=0,y=84;y<H;y+=6,row++){
    catR(0,y,W,1,'#6e4130')
    for (let x=(row%2?12:32);x<W;x+=40) catR(x,y,1,6,'#6e4130')
    for (let x=(row*17)%23;x<W;x+=23) catR(x,y+3,3,1,'#97613f')
  }
  catR(52,9,60,2,'#4a3428'); catR(51,8,3,4,'#4a3428'); catR(110,8,3,4,'#4a3428')
  catR(62,12,40,36,'#f3e0c2')
  if (night) { catR(65,15,34,30,'#2b2d5c'); catR(65,31,34,14,'#35356c') }
  else {
    catR(65,15,34,30,'#8cc4ea'); catR(65,31,34,14,'#bfe0f5')
    catR(67,19,9,3,'#ffffff'); catR(76,18,7,3,'#ffffff'); catR(85,22,11,3,'#ffffff')
    catR(68,26,6,2,'#eaf6ff'); catR(88,28,10,2,'#eaf6ff')
    catR(65,40,34,5,'#9dbf7a')   // 窗外远处一点树/屋顶
  }
  if (night) {
    ;[[68,18],[73,24],[85,17],[95,33],[70,34],[77,19],[90,27]].forEach(([x,y],i)=>{
      if ((t+i*7)%22 < 16) catP(x,y,'#fff6d8')
      if ((t+i*5)%40 < 4){ catP(x-1,y,'#9aa0e0'); catP(x+1,y,'#9aa0e0'); catP(x,y-1,'#9aa0e0'); catP(x,y+1,'#9aa0e0') }
    })
    catEll(92,21,3,3,'#fff2c4'); catP(91,20,'#efdca0'); catP(93,22,'#efdca0')
    catR(65,40,9,5,'#1d1e44'); catR(74,37,7,8,'#1d1e44'); catR(83,39,6,6,'#1d1e44'); catR(89,36,10,9,'#1d1e44')
    catP(76,39,'#f2c46b'); catP(78,41,'#f2c46b'); catP(92,39,'#f2c46b'); catP(95,42,(t%30)<20?'#f2c46b':'#1d1e44')
  } else {
    catR(65,40,9,4,'#7aa86a'); catR(74,38,7,6,'#6f9e60'); catR(83,40,6,4,'#7aa86a'); catR(89,37,10,7,'#67955a')
    catP(76,39,'#e8f0c0'); catP(92,39,'#e8f0c0')
  }
  catR(81,15,2,30,'#f3e0c2'); catR(65,29,34,2,'#f3e0c2')
  catR(59,48,46,3,'#e8cfa8'); catR(59,51,46,1,'#b88a63')
  catR(68,38,2,7,'#5f9a5a'); catR(66,40,1,3,'#5f9a5a'); catR(66,42,2,1,'#5f9a5a'); catR(70,39,1,2,'#5f9a5a'); catP(68,37,'#f08aa0')
  catR(66,44,6,4,'#c2603f'); catR(66,44,6,1,'#d9774f')
  for (const cx of [56,100]){
    catR(cx,10,8,40,'#b9475a'); catR(cx-1,44,10,12,'#b9475a')
    catR(cx+2,10,1,46,'#93354a'); catR(cx+5,10,1,46,'#93354a')
    catR(cx,33,8,2,'#f2c46b')
  }
  // 交给 catDrawLoot() / catDrawPostcard() 画（内容由当天状态决定）                                  // 木夹
  catR(112,42,30,2,'#7d4a2e'); catR(115,44,2,3,'#7d4a2e'); catR(137,44,2,3,'#7d4a2e')
  // 交给 catDrawLoot() / catDrawPostcard() 画（内容由当天状态决定）
  catR(147,50,2,34,'#4a3428'); catEll(148,85,5,1,'#4a3428')
  for (let i=0;i<12;i++){ const hw = 4 + Math.floor(i/2)
    catR(148-hw,38+i,hw*2,1, night ? (i%4===3 ? '#e9b85e' : '#f6d27a') : (i%4===3 ? '#d8c9a6' : '#e6d9b8')) }
}

function catDrawHouse() {
  catR(8,92,38,2,'rgba(40,20,15,.35)')
  catR(10,64,34,28,'#b06f45')
  for (let y=68;y<92;y+=5) catR(10,y,34,1,'#9a5d3a')
  catR(9,64,1,28,'#5e3626'); catR(44,64,1,28,'#5e3626')
  catR(10,65,34,2,'rgba(0,0,0,.18)')
  for (let i=0;i<=18;i++){
    const h = Math.round(i*1.15)+1
    catR(27-h,46+i,h*2+1,1,(Math.floor(i/3)%2)?'#7a4767':'#6a3a5a')
    catP(27-h,46+i,'#4a2440'); catP(27+h,46+i,'#4a2440')
  }
  catSpr(CATHEART,{P:'#f3a3b4'},25,53)
  catR(21,67,12,4,'#f3e0c2'); catR(26,69,2,1,'#7d4a2e'); catP(25,68,'#7d4a2e'); catP(28,68,'#7d4a2e')
  catR(25,73,4,1,'#e0a674')
  for (let y=74;y<92;y++){
    const dy = 80-y
    const hw = y<80 ? Math.round(7*Math.sqrt(1-(dy*dy)/36)) : 7
    catR(27-hw-1,y,hw*2+2,1,'#e0a674')
    if (hw>0) catR(27-hw,y,hw*2,1,'#2a1a1e')
  }
  catR(21,88,12,4,'#6f5a8a'); catR(21,88,12,1,'#8a74a6')
}

function catDrawBasket(full) {
  catR(47,101,16,1,'rgba(40,20,15,.3)')
  catR(48,94,14,7,'#c99a5c')
  for (let x=48;x<62;x+=2) for (let y=95;y<101;y+=2) catP(x+((y/2)%2),y,'#a87a42')
  if (full){
    catEll(52,91,3,3,'#7aa6d9'); catP(51,89,'#5a86b9'); catP(52,90,'#5a86b9'); catP(53,91,'#5a86b9'); catP(50,91,'#a7c6ea')
    catEll(58,92,2,1,'#a0a0ae'); catP(57,90,'#e98a9a'); catP(59,91,'#2a1a1e')
  }
  catR(47,93,16,2,'#8f6234')
}

function catDrawRug() {
  catEll(80,105,37,11,'#f2c46b')
  catEll(80,105,35,10,'#c45c6a')
  catEll(80,105,27,7,'#d4707c')
  for (let i=-3;i<=3;i++){ const x=80+i*9; catP(x,105,'#f2c46b'); catP(x-1,106,'#f2c46b'); catP(x+1,106,'#f2c46b'); catP(x,107,'#f2c46b') }
  for (let x=46;x<=114;x+=4){ catP(x,116,'#f2c46b') }
}
function catDrawMat() {
  catR(112,101,34,9,'#86a3b8'); catR(112,101,34,1,'#a3bccd')
  catP(112,101,'#8a5639'); catP(145,101,'#8a5639'); catP(112,109,'#8a5639'); catP(145,109,'#8a5639')
}
function catBowl(cx,y,c,hi,lo){ catR(cx-6,y,13,4,c); catR(cx-7,y-1,15,1,hi); catR(cx-5,y+4,11,1,lo) }
function catDrawBowls(full,t) {
  if (full){ catEll(122,102,5,2,'#a0603a'); [[119,101],[122,100],[125,102],[121,103]].forEach(([x,y])=>catP(x,y,'#c98250')) }
  else { catEll(122,103,3,1,'#a0603a'); catP(121,102,'#c98250'); catP(128,108,'#a0603a'); catP(116,107,'#a0603a'); catP(130,107,'#a0603a') }
  catBowl(122,104,'#e05a6a','#f08392','#a83d4c')
  catBowl(136,104,'#5b8fd1','#86b2e6','#3f6aa6')
  catR(130,103,13,1,'#9bd3ea')
  catP(132+((t>>2)%3)*3,103,'#ffffff')
}
function catDrawCushion(dented) {
  catEll(78,100,15,5,'#4f8784')
  catEll(78,99,14,4,'#6fa3a0')
  if (dented){
    catEll(78,98,8,2,'#5a8f8c')
    ;[[72,97],[73,96],[83,98],[84,97],[79,96]].forEach(([x,y])=>catP(x,y,'#f0b070'))
  } else {
    catEll(78,97,9,1,'#8fc2bb')
  }
}
function catTailPts(ox,oy,dir,sway){ const pts=[]; for (let i=0;i<7;i++){ const k=i/6; pts.push([ox+dir*(i*1.2+Math.sin(sway)*k*k*2.5), oy-i*i*0.20]) } return pts }
function catDrawTail(pts){ pts.forEach(([x,y])=>catR(x-1,y-1,3,3,CATK.o)); pts.forEach(([x,y],i)=>catR(x,y,1,1,(i===2||i===4||i>=6)?CATK.D:CATK.O)) }
function catDrawCat(t){
  const bob = Math.sin(t * 0.55) > 0.86 ? -1 : 0
  // 尾巴：贴在身侧的一小卷，跟着呼吸动一格
  const tx = 87, ty = 99 + bob
  catR(tx, ty - 3, 2, 5, CATK.o)
  catP(tx, ty - 3, CATK.O); catP(tx, ty - 2, CATK.D); catP(tx + 1, ty - 1, CATK.D)
  catSpr((t%36)<2 ? CATSPR_BLINK : CATSPR, CATK, 69, 83 + bob)
  const hp = t%50
  if (hp<20){ CTX.globalAlpha = 1-hp/20; catSpr(CATHEART,{P:'#f06b85'},86,Math.round(74-hp*0.6)); CTX.globalAlpha = 1 }
}
function catPaw(x,y,c){ catR(x,y+1,3,2,c); catP(x-1,y,c); catP(x+1,y-1,c); catP(x+3,y,c) }
function catDrawPawPrints(){ for (let k=0;k<8;k++){ const x = 94+k*9; const y = Math.min(116, 106+k*1.5) + (k%2 ? 2 : -1); catPaw(x,Math.round(y),'rgba(70,38,28,.38)') } }
function catDrawLeftovers(t,st){
  for (let x=70;x<=96;x++) catP(x,Math.round(107+Math.sin(x*0.35)*1.5),'#7aa6d9')
  const roll = Math.round(Math.sin(st*0.5)*2*Math.exp(-st/30))
  const bx = 100+roll
  catEll(bx,110,4,4,'#7aa6d9')
  ;[[-2,-2],[-1,-1],[0,0],[1,1],[2,-1],[1,-3],[-3,1],[-1,2]].forEach(([dx,dy])=>catP(bx+dx,110+dy,'#5a86b9'))
  catP(bx-2,108,'#a7c6ea')
  catEll(64,113,3,2,'#a0a0ae'); catR(62,114,5,1,'#c4c4d0')
  catP(62,111,'#e98a9a'); catP(62,112,'#2a1a1e'); catP(68,113,'#e98a9a'); catP(69,112,'#e98a9a'); catP(70,112,'#e98a9a'); catP(71,113,'#e98a9a')
  for (let i=0;i<=16;i++) catP(42+i,113-Math.round(i*6/16),'#b98a52')
  ;[[39,112],[40,113],[41,114],[40,111],[39,114],[38,113],[41,112]].forEach(([x,y])=>catP(x,y,'#e98a9a'))
  ;[[38,111],[37,112],[40,115]].forEach(([x,y])=>catP(x,y,'#f6c1c9'))
  catP(36,113,'#6fa3a0'); catP(37,114,'#6fa3a0')
  for (let i=0;i<3;i++){ const ph = (t*0.5+i*13)%30; if (ph<24) catP(74+i*5+Math.round(Math.sin((t+i*10)*0.2)), 80+ph*0.6, '#f0b070') }
  if (st<16) catDrawTail(catTailPts(162+st*1.4,97,-1,st*0.6))
}
function catDrawLight(t, night){
  if (!night) {
    // 白天：窗光落在坐垫和地板上，一点点
    for (let y=88;y<=112;y++) catR(Math.round(58-(y-88)*0.5),y,44,1,'rgba(255,250,235,0.07)')
    return
  }
  for (let y=86;y<=100;y++) catR(Math.round(56-(y-86)*1.4),y,34,1,'rgba(200,210,255,0.09)')
  const f = 1+0.08*Math.sin(t*0.7)
  ;[[30,.045],[20,.06],[12,.08]].forEach(([r,a])=>catEll(148,46,r,Math.round(r*0.85),`rgba(255,206,130,${(a*f).toFixed(3)})`))
  catEll(148,86,12,3,'rgba(255,206,130,0.12)')
}


