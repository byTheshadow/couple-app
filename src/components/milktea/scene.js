/* ===========================================================================
   奶茶店 3D 场景（three.js r128，package.json 里写死了 0.128.0，别升级：新版灯光亮度算法不同）
   只管画面和动画，不碰任何界面。MilkTea.jsx 通过 createMilkTeaScene() 拿到一个控制器：

     const sc = createMilkTeaScene(hostDiv, { night, onPick })
     sc.buildCup('mid')           选杯
     sc.pourTea(id, done)         倒茶底           sc.pourSweet(id, done)  糖浆
     sc.pourMilk(id, done)        加奶 / 奶盖       sc.addTopping(id, done) 加小料
     sc.shake(done)  sc.seal(done)  sc.addStraw(i, done)
     sc.setStep(step)             镜头      sc.setPickable(bool)  允许点料桶
     sc.setInset(px)              底部面板占的高度（把杯子顶到可见区域中间）
     sc.setNight(bool)  sc.celebrate()  sc.snapshot()  → 杯子小图的 data URL
     sc.reset()                   清掉所有进行中的动画，重新开一杯
     sc.dispose()                 离开页面时必须调用：停循环、释放显存

   场景全部由基础几何体拼成，贴图都是 canvas 当场画的，没有外部资源。
   =========================================================================== */
import * as THREE from 'three'
import { SIZES, TEAS, MILKS, SWEETS, TOPPINGS, STRAWS } from './menu'

const rnd = (a, b) => a + Math.random() * (b - a)
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const lin = (t) => t
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// 每一步的镜头。w：竖屏时这一步需要多"退远"一点（0 = 不用，1 = 竖屏最大程度拉远，因为要同时看到一排料桶 / 封口机）
const STEP_CAM = {
  size: { th: 0.12, ph: 1.18, r: 6.4, tx: 0, ty: 2.1, tz: 2.1, w: 0.5 },
  tea: { th: 0.05, ph: 1.26, r: 4.4, tx: 0, ty: 2.25, tz: 2.3, w: 0.3 },
  sweet: { th: 0.05, ph: 1.26, r: 4.4, tx: 0, ty: 2.25, tz: 2.3, w: 0.3 },
  milk: { th: -0.05, ph: 1.26, r: 4.2, tx: 0, ty: 2.3, tz: 2.3, w: 0.3 },
  topping: { th: 0.02, ph: 1.12, r: 5.6, tx: -0.3, ty: 2.1, tz: 1.9, w: 1 },
  shake: { th: 0.2, ph: 1.24, r: 4.0, tx: 0, ty: 2.3, tz: 2.35, w: 0.2 },
  seal: { th: -0.3, ph: 1.2, r: 4.2, tx: 2.4, ty: 2.2, tz: 2.3, w: 0.8 },
  straw: { th: 0.08, ph: 1.28, r: 3.8, tx: 0, ty: 2.5, tz: 2.3, w: 0.3 },
  ticket: { th: 0.35, ph: 1.2, r: 4.6, tx: 0, ty: 2.4, tz: 2.3, w: 0.3 },
}

export function createMilkTeaScene(host, opts = {}) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const shared = new Set() // 不随杯子一起释放的几何体 / 材质 / 贴图（料桶、小料、封膜贴图）
  const keep = (x) => { shared.add(x); return x }
  const allTex = []
  const std = (o) => new THREE.MeshStandardMaterial(o)

  function tex(w, h, draw, rx = 1, ry = 1) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    draw(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rx, ry)
    t.anisotropy = 4
    allTex.push(t)
    return t
  }

  /* ---------- 极简补间引擎 ---------- */
  let tweens = []
  function tween(dur, update, done, eas = ease) {
    const t = { t: 0, dur: Math.max(dur, 0.0001), update, done, eas } // dur 为 0（比如第一颗小料的延迟）时不能除以 0
    tweens.push(t)
    return t
  }
  const wait = (sec, done) => tween(sec, () => {}, done)
  function stepTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]
      if (!w) continue
      w.t += dt
      const p = Math.min(1, w.t / w.dur)
      w.update(w.eas(p), p)
      if (p >= 1) {
        const k = tweens.indexOf(w)
        if (k >= 0) tweens.splice(k, 1)
        if (w.done) w.done()
      }
    }
  }

  /* ---------- 渲染器 ---------- */
  let W = Math.max(1, host.clientWidth)
  let H = Math.max(1, host.clientHeight)
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2)
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(W, H, false)
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const el = renderer.domElement
  el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;-webkit-user-select:none;user-select:none'
  host.appendChild(el)

  const scene = new THREE.Scene()
  const DAYC = new THREE.Color(0xe7dcd0)
  const NIGHTC = new THREE.Color(0x16141c)
  scene.background = DAYC.clone()
  scene.fog = new THREE.Fog(DAYC.clone(), 10, 32)
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 120)

  const emissives = []
  const lampLights = []
  const hemi = new THREE.HemisphereLight(0xfff0dd, 0x6b5a4e, 0.55)
  scene.add(hemi)
  const key = new THREE.SpotLight(0xffd7a8, 1.45, 42, 0.78, 0.95, 1.2)
  key.position.set(4.5, 9.5, 7.5)
  key.target.position.set(0, 1.6, 1.4)
  key.castShadow = true
  key.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048)
  key.shadow.bias = -0.0006
  key.shadow.radius = 3
  scene.add(key, key.target)
  const fill = new THREE.DirectionalLight(0xbcd2ff, 0.34)
  fill.position.set(-7, 5, 5)
  scene.add(fill)
  const rim = new THREE.PointLight(0xff93bd, 0.9, 16, 2)
  rim.position.set(-1.5, 3.4, -3.2)
  scene.add(rim)

  /* ===================================================================
     房间 / 吧台 / 货架（后景）
     =================================================================== */
  const floorTex = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#efe6da'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#d9cbba'
    c.fillRect(0, 0, w / 2, h / 2); c.fillRect(w / 2, h / 2, w / 2, h / 2)
    c.strokeStyle = 'rgba(80,66,54,.18)'; c.lineWidth = 3
    ;[[0, 0], [w / 2, 0], [0, h / 2], [w / 2, h / 2]].forEach(([x, y]) => c.strokeRect(x, y, w / 2, h / 2))
  }, 9, 9)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), std({ map: floorTex, roughness: 0.72 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const woodTex = tex(256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#c08a5c'); g.addColorStop(1, '#a06f46')
    c.fillStyle = g; c.fillRect(0, 0, w, h)
    for (let i = 0; i < 46; i++) {
      c.strokeStyle = `rgba(90,58,34,${rnd(0.04, 0.14)})`; c.lineWidth = rnd(0.6, 2.4)
      c.beginPath()
      const y = rnd(0, h)
      c.moveTo(0, y)
      c.bezierCurveTo(w * 0.3, y + rnd(-7, 7), w * 0.6, y + rnd(-7, 7), w, y + rnd(-5, 5))
      c.stroke()
    }
  }, 3, 1)

  const wallMat = std({ color: 0xf0e4d6, roughness: 0.95 })
  const wallTop = new THREE.Mesh(new THREE.PlaneGeometry(28, 9), wallMat)
  wallTop.position.set(0, 4.5, -6.2); wallTop.receiveShadow = true; scene.add(wallTop)
  const wain = new THREE.Mesh(new THREE.PlaneGeometry(28, 1.15), std({ color: 0xa8745a, roughness: 0.6 }))
  wain.position.set(0, 0.575, -6.17); scene.add(wain)
  const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(26, 9), wallMat)
  sideWall.position.set(-10, 4.5, 0); sideWall.rotation.y = Math.PI / 2; sideWall.receiveShadow = true; scene.add(sideWall)

  // 后面的吧台
  const TOP_Y = 1.5
  const counter = new THREE.Group()
  counter.position.set(0, 0, -2.2)
  scene.add(counter)
  const cbody = new THREE.Mesh(new THREE.BoxGeometry(10, 1.42, 2.1), std({ color: 0xf2e7da, roughness: 0.8 }))
  cbody.position.y = 0.71; cbody.castShadow = true; cbody.receiveShadow = true; counter.add(cbody)
  const ctop = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.16, 2.45), std({ map: woodTex, roughness: 0.5 }))
  ctop.position.y = TOP_Y - 0.08; ctop.castShadow = true; ctop.receiveShadow = true; counter.add(ctop)
  for (let i = -1; i <= 1; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.92, 0.06), std({ color: 0xe2d2c0, roughness: 0.85 }))
    p.position.set(i * 3.1, 0.74, 1.06); p.receiveShadow = true; counter.add(p)
  }

  // 货架 + 料罐
  const shelfMat = std({ map: woodTex, roughness: 0.6 })
  function shelf(y) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.12, 0.72), shelfMat)
    b.position.set(-0.6, y, -5.7); b.castShadow = true; b.receiveShadow = true; scene.add(b)
  }
  shelf(2.3); shelf(3.3)
  const JARC = [0x2a1a14, 0xe0b36a, 0xa98fd6, 0x8fb264, 0xe77a95, 0xf2e3c8]
  function jar(x, y, h, r, color) {
    const g = new THREE.Group()
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.2, side: THREE.DoubleSide, clearcoat: 1, depthWrite: false }))
    glass.position.y = h / 2; glass.renderOrder = 4
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.12, 24), std({ color: 0xa5744d, roughness: 0.6 }))
    lid.position.y = h + 0.05; lid.castShadow = true
    const cg = new THREE.SphereGeometry(r * 0.3, 8, 6)
    const cm = std({ color, roughness: 0.35 })
    for (let i = 0; i < 12; i++) {
      const p = new THREE.Mesh(cg, cm)
      const a = Math.random() * 6.28
      const rr = Math.sqrt(Math.random()) * (r * 0.66)
      p.position.set(Math.cos(a) * rr, rnd(r * 0.3, h * 0.6), Math.sin(a) * rr)
      g.add(p)
    }
    g.add(glass, lid)
    g.position.set(x, y, -5.7)
    scene.add(g)
  }
  ;[-3.6, -2.75, -1.9, -1.05, -0.2, 0.65, 1.5, 2.35].forEach((x, i) => jar(x, 2.42, rnd(0.5, 0.78), 0.21, JARC[i % 6]))
  ;[-3.2, -2.3, -1.4, 0.6, 1.5, 2.4].forEach((x, i) => jar(x, 3.42, rnd(0.45, 0.65), 0.19, JARC[(i + 3) % 6]))

  // 菜单板
  const menuTex = tex(512, 640, (c, w, h) => {
    c.fillStyle = '#211c22'; c.fillRect(0, 0, w, h)
    c.strokeStyle = 'rgba(255,240,215,.35)'; c.lineWidth = 4; c.strokeRect(18, 18, w - 36, h - 36)
    c.fillStyle = '#fff0d7'; c.textAlign = 'center'
    c.font = 'bold 54px system-ui, sans-serif'; c.fillText('MENU', w / 2, 100)
    c.font = '22px ui-monospace, monospace'; c.fillStyle = 'rgba(255,240,215,.5)'
    c.fillText('手作茶饮 · 每日现煮', w / 2, 140)
    ;[['珍珠奶茶', '18'], ['芋泥波波', '22'], ['抹茶拿铁', '20'], ['仙草冻奶', '19'], ['乌龙鲜奶', '21']].forEach((r, i) => {
      const y = 225 + i * 70
      c.textAlign = 'left'; c.fillStyle = '#fff0d7'; c.font = '34px system-ui, sans-serif'; c.fillText(r[0], 60, y)
      c.textAlign = 'right'; c.fillStyle = 'rgba(255,200,140,.95)'; c.fillText('¥' + r[1], w - 60, y)
      c.strokeStyle = 'rgba(255,240,215,.14)'; c.lineWidth = 2
      c.beginPath(); c.moveTo(60, y + 16); c.lineTo(w - 60, y + 16); c.stroke()
    })
  })
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2, 2.5), std({ map: menuTex, roughness: 0.9 }))
  menu.position.set(-5.6, 3.3, -6.1); menu.rotation.y = 0.2; scene.add(menu)

  // 霓虹招牌：US
  const neonTex = tex(1024, 320, (c, w, h) => {
    c.textAlign = 'center'; c.textBaseline = 'middle'
    const draw = (blur, color, lw) => {
      c.shadowBlur = blur; c.shadowColor = color; c.strokeStyle = color; c.lineWidth = lw
      c.font = 'bold 190px system-ui, sans-serif'; c.strokeText('US', w / 2, h / 2 - 28)
      c.font = '40px ui-monospace, monospace'; c.strokeText('· TEA ROOM ·', w / 2, h / 2 + 100)
    }
    draw(46, 'rgba(255,120,180,.9)', 16); draw(26, 'rgba(255,180,220,1)', 8); draw(6, '#ffffff', 3)
  })
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.38),
    new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }))
  neon.position.set(0.6, 4.7, -6); scene.add(neon)
  const neonLight = new THREE.PointLight(0xff7ab6, 0.7, 12, 2)
  neonLight.position.set(0.6, 4.4, -5.3); scene.add(neonLight)
  lampLights.push({ l: neonLight, day: 0.7, night: 2 })

  // 吊灯
  function lamp(x, z, y = 4.4) {
    const g = new THREE.Group()
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.2, 8), std({ color: 0x2e2a30, roughness: 0.8 }))
    cord.position.y = y + 1.6
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.52, 28, 16, 0, 6.28, 0, Math.PI / 2),
      std({ color: 0xf6ead6, roughness: 0.55, side: THREE.DoubleSide, emissive: 0x6a4a28, emissiveIntensity: 0.25 }))
    shade.rotation.x = Math.PI; shade.position.y = y; shade.castShadow = true
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12),
      std({ color: 0xfff1d4, emissive: 0xffc078, emissiveIntensity: 2.2 }))
    bulb.position.y = y - 0.2
    emissives.push({ m: bulb.material, day: 2.2, night: 4.2 }, { m: shade.material, day: 0.25, night: 0.7 })
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.6, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.055, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    cone.position.y = y - 1.4
    const pl = new THREE.PointLight(0xffc98a, 0.75, 9, 2)
    pl.position.y = y - 0.3
    lampLights.push({ l: pl, day: 0.75, night: 1.9 })
    g.add(cord, shade, bulb, cone, pl)
    g.position.set(x, 0, z)
    scene.add(g)
  }
  lamp(-3, -1.6); lamp(0.4, -1.2, 4.7); lamp(3.6, -1.6)

  // 绿植
  function plant(x, z, s = 1) {
    const g = new THREE.Group()
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 20), std({ color: 0xc97d5c, roughness: 0.7 }))
    pot.position.y = 0.3; pot.castShadow = true; pot.receiveShadow = true; g.add(pot)
    const lm = [std({ color: 0x5f9150, roughness: 0.8 }), std({ color: 0x4a7a42, roughness: 0.8 }), std({ color: 0x79a95f, roughness: 0.8 })]
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.22, 0.4), 0), lm[i % 3])
      const a = (i / 9) * 6.28
      l.position.set(Math.cos(a) * rnd(0.1, 0.42), rnd(0.75, 1.5), Math.sin(a) * rnd(0.1, 0.42))
      l.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); l.castShadow = true; g.add(l)
    }
    g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g)
  }
  plant(-6.6, -3.4, 1.3); plant(6, -3.6, 1)

  /* ===================================================================
     操作台（游戏主舞台）：料桶一排 + 中间工作位 + 右边封口机
     =================================================================== */
  const station = new THREE.Group()
  station.position.set(0, 0, 2.1)
  scene.add(station)
  const ST_H = 1.1, ST_W = 9.2, ST_D = 2.0
  const stBody = new THREE.Mesh(new THREE.BoxGeometry(ST_W, ST_H, ST_D), std({ color: 0xead9c6, roughness: 0.82 }))
  stBody.position.y = ST_H / 2; stBody.castShadow = true; stBody.receiveShadow = true; station.add(stBody)
  const stTop = new THREE.Mesh(new THREE.BoxGeometry(ST_W + 0.24, 0.12, ST_D + 0.24), std({ color: 0xcfd3d8, roughness: 0.28, metalness: 0.7 }))
  stTop.position.y = ST_H + 0.06; stTop.castShadow = true; stTop.receiveShadow = true; station.add(stTop)
  const WORK_Y = ST_H + 0.12 // 台面高度
  const WORK = new THREE.Vector3(0, WORK_Y, station.position.z + 0.45) // 杯子工作位（世界坐标）

  const stSignTex = tex(1024, 180, (c, w, h) => {
    c.fillStyle = '#7a4a2c'; c.fillRect(0, 0, w, h)
    c.strokeStyle = 'rgba(255,240,215,.45)'; c.lineWidth = 5; c.strokeRect(14, 14, w - 28, h - 28)
    c.fillStyle = '#fff0d7'; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.font = 'bold 72px system-ui, sans-serif'; c.fillText('加料区 · TOPPINGS BAR', w / 2, h / 2 + 4)
  })
  const stSign = new THREE.Mesh(new THREE.PlaneGeometry(ST_W - 0.8, 0.42), std({ map: stSignTex, roughness: 0.85 }))
  stSign.position.set(0, ST_H - 0.4, ST_D / 2 + 0.01); station.add(stSign)

  /* ---------- 小料外形（按 menu.js 里的 id 对应） ---------- */
  const M_PEARL = keep(std({ color: 0x2a1a14, roughness: 0.2, metalness: 0.14 }))
  const M_TARO = [0xb98ade, 0xf2a65a, 0x9fd89b].map((c) => keep(std({ color: c, roughness: 0.45 })))
  const M_COCO = keep(new THREE.MeshPhysicalMaterial({ color: 0xfdf7ee, roughness: 0.08, transparent: true, opacity: 0.78, clearcoat: 1 }))
  const M_PUD = keep(std({ color: 0xf5c95e, roughness: 0.25 }))
  const M_BEAN = keep(std({ color: 0x8e3a3f, roughness: 0.5 }))
  const M_JELLY = keep(new THREE.MeshPhysicalMaterial({ color: 0x241c22, roughness: 0.22, transparent: true, opacity: 0.88, clearcoat: 1 }))
  const G_PEARL = keep(new THREE.SphereGeometry(0.095, 14, 12))
  const G_TARO = keep(new THREE.SphereGeometry(0.1, 14, 12))
  const G_COCO = keep(new THREE.BoxGeometry(0.15, 0.15, 0.15))
  const G_PUD = keep(new THREE.BoxGeometry(0.19, 0.15, 0.19))
  const G_BEAN = keep(new THREE.SphereGeometry(0.075, 10, 8))
  const G_JELLY = keep(new THREE.BoxGeometry(0.17, 0.17, 0.17))
  const TOP_MAKE = {
    pearl: () => new THREE.Mesh(G_PEARL, M_PEARL),
    taro: (i) => new THREE.Mesh(G_TARO, M_TARO[i % 3]),
    coco: () => new THREE.Mesh(G_COCO, M_COCO),
    pud: () => new THREE.Mesh(G_PUD, M_PUD),
    bean: () => new THREE.Mesh(G_BEAN, M_BEAN),
    jelly: () => new THREE.Mesh(G_JELLY, M_JELLY),
  }

  /* ---------- 料桶（可点击） ---------- */
  const tubs = {}
  const pickables = []
  function makeTub(x, top) {
    const g = new THREE.Group()
    const R = 0.42, HH = 0.5
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.9, HH, 28, 1, true),
      std({ color: 0xdfe3e8, roughness: 0.22, metalness: 0.85, side: THREE.DoubleSide }))
    body.position.y = HH / 2; body.castShadow = true
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.015, 0.035, 8, 30), std({ color: 0xeef1f4, roughness: 0.18, metalness: 0.9 }))
    lip.rotation.x = Math.PI / 2; lip.position.y = HH
    const bot = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.04, 24), std({ color: 0xb9bfc6, roughness: 0.3, metalness: 0.7 }))
    bot.position.y = 0.02
    g.add(body, lip, bot)
    for (let i = 0; i < 30; i++) {
      const m = TOP_MAKE[top.id](i)
      const a = Math.random() * 6.28
      const rr = Math.sqrt(Math.random()) * (R - 0.1)
      m.position.set(Math.cos(a) * rr, HH - 0.14 + (1 - rr / R) * 0.2 + rnd(-0.04, 0.06), Math.sin(a) * rr)
      m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3)); m.castShadow = true; g.add(m)
    }
    // 价牌
    const ct = tex(256, 150, (c, w, h) => {
      c.fillStyle = '#fdf6e8'; c.fillRect(0, 0, w, h)
      c.strokeStyle = 'rgba(122,74,44,.5)'; c.lineWidth = 4; c.strokeRect(9, 9, w - 18, h - 18)
      c.fillStyle = '#5c381f'; c.textAlign = 'center'
      c.font = 'bold 46px system-ui, sans-serif'; c.fillText(top.name, w / 2, 70)
      c.fillStyle = '#b4603a'; c.font = '30px ui-monospace, monospace'; c.fillText('+¥' + top.price, w / 2, 116)
    })
    const blank = std({ color: 0xfdf6e8, roughness: 0.9 })
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.28, 0.02), [blank, blank, blank, blank, std({ map: ct, roughness: 0.9 }), blank])
    card.position.set(0, 0.16, 0.52); card.rotation.x = -0.34; card.castShadow = true
    g.add(card)
    g.position.set(x, WORK_Y, -0.5)
    station.add(g)
    tubs[top.id] = g
    g.traverse((m) => { if (m.isMesh) { m.userData.tub = top.id; pickables.push(m) } })
  }
  TOPPINGS.forEach((t, i) => makeTub(-3.1 + i * 1.24, t))

  /* ---------- 封口机（右端，会压下来） ---------- */
  const sealer = new THREE.Group()
  sealer.position.set(3.55, WORK_Y, 0.25)
  station.add(sealer)
  const slBase = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 1.1), std({ color: 0x3b3640, roughness: 0.4, metalness: 0.4 }))
  slBase.position.y = 0.07
  const slCol = new THREE.Mesh(new THREE.BoxGeometry(0.26, 2.5, 0.9), std({ color: 0x3b3640, roughness: 0.4, metalness: 0.4 }))
  slCol.position.set(0, 1.25, -0.45)
  const slArm = new THREE.Group()
  const slHead = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.05), std({ color: 0xe8e2da, roughness: 0.4 }))
  const slPad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 28), std({ color: 0x5a5260, roughness: 0.6 }))
  slPad.position.y = -0.18
  const slLed = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), std({ color: 0x7af0c0, emissive: 0x2bd99a, emissiveIntensity: 1.6 }))
  slLed.position.set(0.45, 0.2, 0.5)
  emissives.push({ m: slLed.material, day: 1.6, night: 3 })
  slArm.add(slHead, slPad, slLed)
  slArm.position.y = 2.2
  sealer.add(slBase, slCol, slArm)
  sealer.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true } })

  /* ===================================================================
     临时物体（小壶 / 水流 / 飞行中的小料）：统一登记，重做和离开时一次清干净
     =================================================================== */
  const temps = new Set()
  function disposeObj(o) {
    o.traverse((m) => {
      if (m.geometry && !shared.has(m.geometry)) m.geometry.dispose()
      if (m.material) {
        ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => {
          if (shared.has(mt)) return
          if (mt.map && !shared.has(mt.map)) mt.map.dispose()
          mt.dispose()
        })
      }
    })
  }
  function addTemp(o) { scene.add(o); temps.add(o); return o }
  function dropTemp(o) {
    if (!temps.has(o)) return
    temps.delete(o)
    scene.remove(o)
    disposeObj(o)
  }
  function clearTemps() { Array.from(temps).forEach(dropTemp) }

  /* ===================================================================
     杯子：全部可动，液面会涨，小料会掉进去
     =================================================================== */
  const FILM_TEX = keep(tex(256, 256, (c, w, h) => {
    c.fillStyle = '#f7f1e8'; c.fillRect(0, 0, w, h)
    c.strokeStyle = 'rgba(122,74,44,.35)'; c.lineWidth = 6
    c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 22, 0, 6.28); c.stroke()
    c.fillStyle = '#7a4a2c'; c.textAlign = 'center'; c.textBaseline = 'middle'
    c.font = 'bold 96px system-ui, sans-serif'; c.fillText('US', w / 2, h / 2 - 8)
    c.font = '22px ui-monospace, monospace'; c.fillStyle = 'rgba(122,74,44,.65)'
    c.fillText('TEA ROOM', w / 2, h / 2 + 52)
  }))

  let cup = null
  let CUPDEF = SIZES.mid
  let pileLevel = 0 // 杯底料堆到多高

  function disposeCup() {
    if (!cup) return
    scene.remove(cup)
    disposeObj(cup)
    cup = null
  }

  function buildCup(sizeId) {
    disposeCup()
    const def = SIZES[sizeId] || SIZES.mid
    CUPDEF = def
    pileLevel = 0.08
    const g = new THREE.Group()
    const lerpR = (t) => def.rb + (def.rt - def.rb) * t

    const pts = []
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(lerpR(t), t * def.h)) }
    pts.push(new THREE.Vector2(def.rt + 0.035, def.h + 0.03))
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 44),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.07, transparent: true, opacity: 0.22, side: THREE.DoubleSide, clearcoat: 1, depthWrite: false }))
    shell.renderOrder = 6
    g.add(shell)

    const base = new THREE.Mesh(new THREE.CylinderGeometry(def.rb, def.rb * 0.95, 0.05, 32),
      std({ color: 0xffffff, roughness: 0.2, transparent: true, opacity: 0.5 }))
    base.position.y = 0.025
    g.add(base)

    // 液体：圆柱做成"从底部长高"，scale.y 就是液面比例
    const lg = new THREE.CylinderGeometry(def.rt - 0.035, def.rb - 0.03, def.h, 40)
    lg.translate(0, def.h / 2, 0)
    const liquid = new THREE.Mesh(lg, std({ color: 0xc98f5e, roughness: 0.25, transparent: true, opacity: 0.95 }))
    liquid.position.y = 0.03
    liquid.scale.y = 0.0001
    liquid.renderOrder = 2
    liquid.castShadow = true
    g.add(liquid)

    // 杯套
    const bt = tex(512, 256, (c, w, h) => {
      c.fillStyle = '#fff6ea'; c.fillRect(0, 0, w, h)
      c.fillStyle = 'rgba(160,110,70,.1)'
      for (let i = 0; i < 7; i++) c.fillRect(i * 74, 0, 34, h)
      c.fillStyle = '#7a4a2c'; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.font = 'bold 120px system-ui, sans-serif'; c.fillText('US', w / 2, h / 2 - 12)
      c.font = '26px ui-monospace, monospace'; c.fillStyle = 'rgba(122,74,44,.65)'
      c.fillText('— HANDMADE —', w / 2, h / 2 + 62)
    })
    const band = new THREE.Mesh(new THREE.CylinderGeometry(lerpR(0.52) + 0.015, lerpR(0.22) + 0.015, def.h * 0.38, 44, 1, true),
      std({ map: bt, roughness: 0.85, side: THREE.DoubleSide }))
    band.position.y = def.h * 0.36
    band.castShadow = true
    g.add(band)

    g.position.copy(WORK)
    scene.add(g)
    cup = g
    cup.userData = { shell, liquid, def, foam: null, foamR: 0, film: null, straw: null, fill: 0 }
    return g
  }

  // 当前液面（含奶盖）的杯内高度
  const liquidTop = () => CUPDEF.h * cup.userData.fill + 0.03
  const surfaceTop = () => {
    const f = cup.userData.foam
    return liquidTop() + (f ? f.scale.y * cup.userData.foamR : 0)
  }
  function setFill(v) { cup.userData.fill = v; cup.userData.liquid.scale.y = Math.max(0.0001, v) }

  /* ---------- 倒液体：小壶飞过来，倾斜，出一条水流（茶 / 糖浆 / 奶都用它） ---------- */
  function makePitcher(color, k) {
    const g = new THREE.Group()
    const pts = []
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(0.26 + Math.sin(t * Math.PI) * 0.12, t * 0.62)) }
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), std({ color: 0xe7e9ec, roughness: 0.25, metalness: 0.6, side: THREE.DoubleSide }))
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 24), std({ color: 0xcfd3d8, roughness: 0.3, metalness: 0.7 }))
    lid.position.y = 0.63
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.34, 14), std({ color: 0xe7e9ec, roughness: 0.25, metalness: 0.6 }))
    spout.position.set(0.28, 0.54, 0); spout.rotation.z = -0.9
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 20, Math.PI * 1.1), std({ color: 0x4a434e, roughness: 0.5 }))
    handle.position.set(-0.3, 0.34, 0); handle.rotation.z = -0.4
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20), std({ color, roughness: 0.3 }))
    tea.position.y = 0.5
    g.add(body, lid, spout, handle, tea)
    g.scale.setScalar(k)
    g.traverse((m) => { if (m.isMesh) m.castShadow = true })
    return g
  }

  // k：壶的大小（糖浆壶小一点）。toFill 等于当前液面时只演出倒的过程，液面不变
  function pourLiquid(color, toFill, dur, done, k = 1) {
    const sx = WORK.x - 2.6, sy = WORK.y + 2.4
    const ex = WORK.x - (0.05 + 0.57 * k)
    const ey = WORK.y + CUPDEF.h + 0.35 + 0.5 * k
    const p = makePitcher(color, k)
    p.position.set(sx, sy, WORK.z + 0.3)
    addTemp(p)

    const sg = new THREE.CylinderGeometry(0.055 * k, 0.075 * k, 1, 12)
    sg.translate(0, -0.5, 0) // 从顶端往下长
    const stream = new THREE.Mesh(sg, std({ color, roughness: 0.15, transparent: true, opacity: 0.9 }))
    stream.scale.y = 0.0001
    stream.visible = false
    addTemp(stream)

    const from = cup.userData.fill
    const spoutPos = new THREE.Vector3()
    const liquid = cup.userData.liquid

    tween(0.7, (t) => { // 飞过来 + 倾斜
      p.position.x = THREE.MathUtils.lerp(sx, ex, t)
      p.position.y = THREE.MathUtils.lerp(sy, ey, t)
      p.rotation.z = -1.05 * t
    }, () => {
      stream.visible = true
      tween(dur, (t) => {
        setFill(THREE.MathUtils.lerp(from, toFill, t))
        p.getWorldPosition(spoutPos)
        stream.position.set(WORK.x - 0.05, spoutPos.y + 0.12 * k, WORK.z)
        stream.scale.y = Math.max(0.02, stream.position.y - (WORK.y + surfaceTop()))
        liquid.rotation.z = Math.sin(t * 40) * 0.012 // 液面晃一下
      }, () => {
        stream.visible = false
        liquid.rotation.z = 0
        tween(0.6, (t) => { // 收壶
          p.rotation.z = -1.05 * (1 - t)
          p.position.x = THREE.MathUtils.lerp(ex, sx - 0.2, t)
          p.position.y = THREE.MathUtils.lerp(ey, sy + 0.2, t)
        }, () => { dropTemp(p); dropTemp(stream); if (done) done() })
      }, lin)
    })
  }

  function pourTea(id, done) {
    const t = TEAS.find((x) => x.id === id) || TEAS[0]
    cup.userData.liquid.material.color.setHex(t.color)
    pourLiquid(t.color, 0.42, 1.5, done)
  }

  // 糖浆：越甜倒得越久，茶色略微变亮；无糖就只是杯子点点头
  function pourSweet(id, done) {
    const s = SWEETS.find((x) => x.id === id) || SWEETS[0]
    if (s.pct === 0) {
      const y0 = cup.position.y
      tween(0.4, (t, raw) => { cup.position.y = y0 - Math.sin(raw * Math.PI) * 0.03 }, () => { cup.position.y = y0; if (done) done() }, lin)
      return
    }
    const col = cup.userData.liquid.material.color
    const c0 = col.clone()
    const c1 = c0.clone().lerp(new THREE.Color(0xf3c98b), (s.pct / 100) * 0.14)
    pourLiquid(0xd9a441, cup.userData.fill, 0.45 + s.pct * 0.012, () => {
      tween(0.4, (t) => col.lerpColors(c0, c1, t), done)
    }, 0.7)
  }

  function pourMilk(id, done) {
    const m = MILKS.find((x) => x.id === id) || MILKS[2]
    if (m.id === 'none') { if (done) done(); return }
    const col = cup.userData.liquid.material.color
    if (m.id === 'milk') {
      pourLiquid(m.color, 0.74, 1.3, () => {
        const c0 = col.clone()
        const c1 = new THREE.Color(m.mixc)
        tween(0.6, (t) => col.lerpColors(c0, c1, t), done)
      })
    } else {
      pourLiquid(m.color, 0.66, 1.0, () => { addFoam(m.color); wait(0.6, done) })
    }
  }

  /* ---------- 加小料：从料桶上方抛进杯子 ---------- */
  function addTopping(id, done) {
    const top = TOPPINGS.find((x) => x.id === id)
    const tub = tubs[id]
    if (!top || !tub) { if (done) done(); return }
    const from = new THREE.Vector3()
    tub.getWorldPosition(from)
    from.y += 0.75
    // 料桶轻轻一跳，表示被舀了一勺
    const y0 = tub.position.y
    tween(0.35, (p) => { tub.position.y = y0 + Math.sin(p * Math.PI) * 0.12 }, () => { tub.position.y = y0 }, lin)
    let landed = 0
    for (let i = 0; i < top.n; i++) {
      const m = TOP_MAKE[id](i)
      m.castShadow = true
      m.position.copy(from).add(new THREE.Vector3(rnd(-0.12, 0.12), rnd(0, 0.25), rnd(-0.12, 0.12)))
      m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3))
      scene.add(m)
      temps.add(m)
      const a = Math.random() * 6.28
      const rr = Math.sqrt(Math.random()) * (CUPDEF.rb - 0.14)
      const target = new THREE.Vector3(WORK.x + Math.cos(a) * rr, WORK.y + pileLevel + rnd(0, 0.12), WORK.z + Math.sin(a) * rr)
      const start = m.position.clone()
      wait(i * 0.035, () => {
        tween(0.55 + Math.random() * 0.12, (t, raw) => {
          m.position.lerpVectors(start, target, raw)
          m.position.y += Math.sin(raw * Math.PI) * 0.35 // 抛物线：水平匀速，垂直先抬一点再落
          m.rotation.x += 0.14
          m.rotation.z += 0.1
        }, () => {
          temps.delete(m)
          scene.remove(m)
          m.position.copy(target).sub(WORK)
          cup.add(m) // 落进杯子后跟着杯子动
          landed++
          if (landed === top.n) {
            pileLevel = Math.min(0.62, pileLevel + 0.1)
            if (done) done()
          }
        }, easeOut)
      })
    }
  }

  /* ---------- 奶盖 / 封膜 / 吸管 ---------- */
  function addFoam(color) {
    const r = CUPDEF.rb + (CUPDEF.rt - CUPDEF.rb) * cup.userData.fill - 0.05
    const foam = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 18, 0, 6.28, 0, Math.PI / 2), std({ color, roughness: 0.85 }))
    foam.scale.set(1, 0.0001, 1)
    foam.position.y = liquidTop() - 0.02
    foam.castShadow = true
    cup.add(foam)
    cup.userData.foam = foam
    cup.userData.foamR = r
    tween(0.5, (t) => { foam.scale.y = 0.5 * t }, null, easeOut)
  }

  function addFilm(done) {
    const film = new THREE.Mesh(new THREE.CylinderGeometry(CUPDEF.rt + 0.05, CUPDEF.rt + 0.05, 0.025, 40),
      [std({ color: 0xe6ded2, roughness: 0.5 }), std({ map: FILM_TEX, roughness: 0.55 }), std({ color: 0xf7f1e8, roughness: 0.5 })])
    film.position.y = CUPDEF.h + 0.02
    film.scale.setScalar(0.6)
    film.castShadow = true
    cup.add(film)
    cup.userData.film = film
    tween(0.35, (t) => film.scale.setScalar(0.6 + 0.4 * t), done, easeOut)
  }

  function addStraw(idx, done) {
    const hex = parseInt((STRAWS[idx] || STRAWS[0]).slice(1), 16)
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 18), std({ color: hex, roughness: 0.35 }))
    st.castShadow = true
    const yEnd = CUPDEF.h * 0.55 + 1.0
    st.position.set(0.16, yEnd + 2.4, 0.06)
    st.rotation.z = -0.17
    cup.add(st)
    cup.userData.straw = st
    tween(0.5, (t) => { st.position.y = THREE.MathUtils.lerp(yEnd + 2.4, yEnd, t) }, () => {
      // 戳破封膜：一点点抖动
      tween(0.3, (t) => { cup.rotation.z = Math.sin(t * 22) * 0.02 * (1 - t) }, () => { cup.rotation.z = 0; if (done) done() }, lin)
    }, easeOut)
  }

  /* ---------- 摇匀 / 封口 / 收尾转一圈 ---------- */
  function shake(done) {
    const base = cup.position.clone()
    const liquid = cup.userData.liquid
    tween(0.42, (t, raw) => {
      const damp = 1 - raw
      cup.rotation.z = Math.sin(raw * 28) * 0.17 * damp
      cup.position.x = base.x + Math.sin(raw * 28) * 0.1 * damp
      cup.position.y = base.y + Math.abs(Math.sin(raw * 14)) * 0.14 * damp
      liquid.rotation.z = Math.sin(raw * 24) * 0.05 * damp
    }, () => {
      cup.rotation.z = 0
      cup.position.copy(base)
      liquid.rotation.z = 0
      if (done) done()
    }, lin)
  }

  function seal(done) {
    const home = cup.position.clone()
    const seat = new THREE.Vector3()
    sealer.getWorldPosition(seat)
    seat.y = WORK.y
    tween(0.7, (t) => { cup.position.lerpVectors(home, seat, t) }, () => {
      tween(0.45, (t) => { slArm.position.y = THREE.MathUtils.lerp(2.2, CUPDEF.h + 0.28, t) }, () => {
        addFilm(() => {
          tween(0.45, (t) => { slArm.position.y = THREE.MathUtils.lerp(CUPDEF.h + 0.28, 2.2, t) }, () => {
            tween(0.7, (t) => { cup.position.lerpVectors(seat, home, t) }, done)
          })
        })
      })
    })
  }

  function celebrate() {
    tween(2.2, (t) => { cup.rotation.y = t * Math.PI * 2 }, () => { cup.rotation.y = 0 }, lin)
  }

  /* ---------- 杯子快照：换一台专拍杯子的相机渲一帧，立刻读走（不留在屏幕上） ---------- */
  function snapshot(outW = 300, outH = 380) {
    const cam2 = new THREE.PerspectiveCamera(30, outW / outH, 0.1, 120)
    const cy = WORK.y + (CUPDEF.h + 1.6) * 0.5
    const dist = ((CUPDEF.h + 2.0) * 0.58) / Math.tan(THREE.MathUtils.degToRad(15))
    cam2.position.set(WORK.x + dist * 0.2, cy + dist * 0.12, WORK.z + dist)
    cam2.lookAt(WORK.x, cy - 0.05, WORK.z)
    const rotY = cup.rotation.y
    cup.rotation.y = 0.3
    renderer.setPixelRatio(1)
    renderer.setSize(outW * 2, outH * 2, false)
    renderer.render(scene, cam2)
    const c = document.createElement('canvas')
    c.width = outW
    c.height = outH
    c.getContext('2d').drawImage(el, 0, 0, outW, outH)
    cup.rotation.y = rotY
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(W, H, false)
    let url = c.toDataURL('image/webp', 0.72)
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.78) // Safari 不能导出 webp
    if (url.length > 60000) url = c.toDataURL(url.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', 0.5)
    return url
  }

  /* ===================================================================
     镜头：拖动转 / 双指缩放 / 滚轮缩放 / 点料桶
     =================================================================== */
  const cam = { th: 0, ph: 1.22, r: 6.2, tx: 0, ty: 2.1, tz: 2.3 }
  const goal = Object.assign({}, cam)
  let stepBase = { r: 6.2, w: 0.5 }
  let insetPx = 0

  const portraitFactor = () => clamp(0.9 / (W / H), 1, 1.9)
  function refit() { goal.r = stepBase.r * (1 + (portraitFactor() - 1) * stepBase.w) }
  function setStep(s) {
    const g = STEP_CAM[s]
    if (!g) return
    Object.assign(goal, { th: g.th, ph: g.ph, tx: g.tx, ty: g.ty, tz: g.tz })
    stepBase = { r: g.r, w: g.w }
    refit()
  }
  function applyView() {
    if (insetPx > 0) camera.setViewOffset(W, H, 0, Math.round(insetPx * 0.5), W, H)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
  }
  function setInset(px) { insetPx = Math.max(0, px || 0); applyView() }
  function applyCam() {
    const ph = clamp(cam.ph, 0.12, 1.5)
    camera.position.set(
      cam.tx + cam.r * Math.sin(ph) * Math.sin(cam.th),
      cam.ty + cam.r * Math.cos(ph),
      cam.tz + cam.r * Math.sin(ph) * Math.cos(cam.th),
    )
    camera.lookAt(cam.tx, cam.ty, cam.tz)
  }

  const ptrs = new Map()
  let lastX = 0, lastY = 0, pinch = 0, moved = 0
  let pickable = false
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  function onDown(e) {
    try { el.setPointerCapture(e.pointerId) } catch (err) { /* 个别浏览器不支持 */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    lastX = e.clientX; lastY = e.clientY; moved = 0
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId)) return
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) goal.r = clamp(goal.r * (pinch / d), 2.4, 16)
      pinch = d
      moved = 99
      return
    }
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    moved += Math.abs(dx) + Math.abs(dy)
    goal.th -= dx * 0.005
    goal.ph = clamp(goal.ph - dy * 0.004, 0.3, 1.46)
    lastX = e.clientX; lastY = e.clientY
  }
  function onUp(e) {
    if (ptrs.size === 1 && moved < 8) clickScene(e.clientX, e.clientY)
    ptrs.delete(e.pointerId)
    if (ptrs.size < 2) pinch = 0
  }
  function onCancel(e) { ptrs.delete(e.pointerId); pinch = 0 }
  function onWheel(e) { e.preventDefault(); goal.r = clamp(goal.r + e.deltaY * 0.01, 2.4, 16) }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onCancel)
  el.addEventListener('wheel', onWheel, { passive: false })

  function clickScene(x, y) {
    if (!pickable) return
    const r = el.getBoundingClientRect()
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(pickables, false)[0]
    if (hit && hit.object.userData.tub && opts.onPick) opts.onPick(hit.object.userData.tub)
  }

  /* ---------- 尺寸 ---------- */
  function resize() {
    W = Math.max(1, host.clientWidth)
    H = Math.max(1, host.clientHeight)
    renderer.setSize(W, H, false)
    camera.aspect = W / H
    camera.fov = W / H < 0.9 ? 50 : 40
    applyView()
    refit()
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  if (ro) ro.observe(host)

  /* ---------- 昼夜 ---------- */
  let night = !!opts.night
  let mix = night ? 1 : 0
  function setNight(b) { night = !!b }

  /* ===================================================================
     主循环
     =================================================================== */
  const clock = new THREE.Clock()
  const cBg = new THREE.Color()
  let running = true
  let raf = 0
  function tick() {
    if (!running) return
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.05, clock.getDelta())
    const t = clock.elapsedTime
    stepTweens(dt)

    const k = 1 - Math.pow(0.002, dt)
    ;['th', 'ph', 'r', 'tx', 'ty', 'tz'].forEach((p) => { cam[p] += (goal[p] - cam[p]) * k })
    applyCam()

    neon.material.opacity = 0.78 + Math.sin(t * 1.6) * 0.06 + mix * 0.15

    // 可以点料桶时，料桶轻轻起伏，提示"可以点我"
    if (pickable) {
      TOPPINGS.forEach((top, i) => { tubs[top.id].position.y = WORK_Y + Math.sin(t * 2 + i) * 0.02 })
    }

    mix += ((night ? 1 : 0) - mix) * (1 - Math.pow(0.02, dt))
    cBg.copy(DAYC).lerp(NIGHTC, mix)
    scene.background.copy(cBg)
    scene.fog.color.copy(cBg)
    hemi.intensity = 0.55 - mix * 0.42
    key.intensity = 1.45 - mix * 1.0
    fill.intensity = 0.34 - mix * 0.27
    rim.intensity = 0.9 + mix * 0.9
    renderer.toneMappingExposure = 1.06 + mix * 0.12
    emissives.forEach((e) => { e.m.emissiveIntensity = e.day + (e.night - e.day) * mix })
    lampLights.forEach((e) => { e.l.intensity = e.day + (e.night - e.day) * mix })

    renderer.render(scene, camera)
  }

  /* ---------- 重做 / 离开 ---------- */
  function setPickable(b) {
    pickable = !!b
    if (!pickable) TOPPINGS.forEach((top) => { tubs[top.id].position.y = WORK_Y })
  }

  function reset(sizeId = 'mid') {
    tweens = [] // 进行中的动画全部作废
    clearTemps()
    setPickable(false)
    TOPPINGS.forEach((top) => { tubs[top.id].position.y = WORK_Y })
    slArm.position.y = 2.2
    buildCup(sizeId)
  }

  function dispose() {
    running = false
    cancelAnimationFrame(raf)
    tweens = []
    clearTemps()
    if (ro) ro.disconnect()
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onCancel)
    el.removeEventListener('wheel', onWheel)
    scene.traverse((m) => {
      if (m.geometry) m.geometry.dispose()
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => mt.dispose())
    })
    allTex.forEach((t) => t.dispose())
    renderer.dispose()
    if (renderer.forceContextLoss) renderer.forceContextLoss()
    if (el.parentNode) el.parentNode.removeChild(el)
  }

  /* ---------- 开场 ---------- */
  camera.fov = W / H < 0.9 ? 50 : 40
  buildCup('mid')
  setStep('size')
  Object.assign(cam, goal)
  applyView()
  applyCam()
  tick()

  return {
    buildCup, pourTea, pourSweet, pourMilk, addTopping, shake, seal, addStraw,
    setStep, setPickable, setInset, setNight, celebrate, snapshot, reset, dispose,
  }
}