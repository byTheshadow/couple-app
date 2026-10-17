/* ===========================================================================
   水晶球 3D 场景（three.js r128，package.json 里写死了 0.128.0，别升级：新版灯光亮度算法不同）
   只管画面和交互，不碰任何界面。Crystal.jsx 通过 createCrystalScene() 拿到一个控制器：

     const sc = createCrystalScene(hostDiv, { onSelect(i | -1), onChange() })
     sc.apply(globe)              整颗球换成另一颗（数据形状见 data.js，会先过 normalizeGlobe）
     sc.getData()                 现在这颗球的数据（深拷贝）
     sc.setEnv(id) sc.setFall(id) sc.setBase(id) sc.setSound(id) sc.setNote(文字)
     sc.addItem(t) sc.removeItem(i) sc.clearItems() sc.patchItem(i, { x, z, rot, s }) sc.select(i | -1)
     sc.shake(力度)               摇一摇
     sc.setInset(px)              底部面板占的高度（把球顶到可见区域中间）
     sc.setSleep(bool)            助眠：整体变暗、飘落变慢        sc.setEditable(bool)  是否允许点 / 拖摆件
     sc.snapshot(w, h)            → 球的小图 data URL（webp，Safari 回退 jpeg）
     sc.reset()                   回到默认的一屋一树一灯
     sc.dispose()                 离开页面时必须调用：停循环、释放显存

   场景全部由基础几何体拼成，贴图都是 canvas 当场画的，没有外部资源。
   onChange 在球的内容变了的时候触发（拖摆件时会连续触发，页面那边要自己节流）。
   =========================================================================== */
import * as THREE from 'three'
import { ENVS, FALLS, BASES, DEFAULT_GLOBE, normalizeGlobe, cleanNote } from './data'
import { BUILD } from './items'

const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lin = (t) => t

/* 球体尺寸：玻璃内半径 R，地面那块弦在 GY 高度，雪丘中间微微隆起 */
const R = 1.62
const GY = -0.74
const GR = 1.40                       // 地面圆盘半径
const PR = GR * 0.80                  // 摆件能放到的最远距离（data.js 里的 REACH 对应这个）
const groundY = (r) => GY + 0.13 * (1 - Math.min(1, (r / GR) ** 2))

export function createCrystalScene(host, opts = {}) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  const GC = 1.72                       // 球心高度
  const allTex = new Set()
  const skyBag = new Set() // 会随景色 / 底座文字 / 摆件重建的贴图，单独登记，重建前先释放，不然越用越占显存
  const baseBag = new Set()
  const itemBag = new Set()
  function freeBag(bag) { bag.forEach((t) => { t.dispose(); allTex.delete(t) }); bag.clear() }
  const M = (col, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: col }, o))

  function tex(w, h, draw, rx = 1, ry = 1, bag = null) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    draw(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(rx, ry)
    t.anisotropy = 4
    allTex.add(t)
    if (bag) bag.add(t)
    return t
  }
  function sprite(draw, size = 64) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    draw(c.getContext('2d'), size)
    const t = new THREE.CanvasTexture(c)
    allTex.add(t)
    return t
  }
  const GLOW_TEX = sprite((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g; c.fillRect(0, 0, s, s)
  }, 128)
  function glow(color, size, pos) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEX, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }))
    s.scale.setScalar(size)
    s.position.set(pos[0], pos[1], pos[2])
    return s
  }
  const KIT = { M, glow, tex: (w, h, draw, rx, ry) => tex(w, h, draw, rx, ry, itemBag) }

  /* ---------- 补间（和奶茶店一样，dur=0 要保护） ---------- */
  let tweens = []
  function tween(dur, update, done, eas = ease) {
    tweens.push({ t: 0, dur: Math.max(dur, 0.0001), update, done, eas })
  }
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

  /* ---------- 渲染器（透明底：直接露出 App 自己的背景） ---------- */
  let W = Math.max(1, host.clientWidth)
  let H = Math.max(1, host.clientHeight)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2)
  renderer.setPixelRatio(pixelRatio)
  renderer.setSize(W, H, false)
  renderer.setClearColor(0x000000, 0)
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const el = renderer.domElement
  el.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;-webkit-user-select:none;user-select:none'
  host.appendChild(el)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 60)

  /* ---------- 灯光（强度会被景色改写） ---------- */
  const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x2a3350, 0.55)
  const dir = new THREE.DirectionalLight(0xcfe0ff, 0.8)
  dir.position.set(-2, 3, 2)
  dir.castShadow = true
  dir.shadow.mapSize.set(coarse ? 512 : 1024, coarse ? 512 : 1024)
  dir.shadow.camera.left = -2; dir.shadow.camera.right = 2
  dir.shadow.camera.top = 2; dir.shadow.camera.bottom = -2
  dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 12
  dir.shadow.bias = -0.0012
  const amb = new THREE.AmbientLight(0x1a2440, 0.6)
  const key = new THREE.PointLight(0xffffff, 0.35, 8, 2)
  key.position.set(1.4, GC + 1.6, 2.2)
  scene.add(hemi, dir, dir.target, amb, key)
  dir.target.position.set(0, GC, 0)

  /* ---------- 球体内部的壳 ---------- */
  const globe = new THREE.Group()
  globe.position.y = GC
  scene.add(globe)

  // 天空穹顶：只盖住下面 82%，顶上留出通透的玻璃
  let skyMat = null, skyMesh = null
  function buildSky(env) {
    freeBag(skyBag)
    const t = tex(512, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, env.sky[0]); g.addColorStop(0.55, env.sky[1]); g.addColorStop(1, env.sky[2])
      c.fillStyle = g; c.fillRect(0, 0, w, h)
      if (env.star) {
        for (let i = 0; i < 260; i++) {
          const y = Math.pow(Math.random(), 1.6) * h * 0.7
          c.globalAlpha = rnd(0.25, 0.95)
          c.fillStyle = '#fff'
          c.fillRect(rnd(0, w), y, rnd(1, 2.4), rnd(1, 2.4))
        }
        c.globalAlpha = 1
      }
      if (env.aur) {
        for (let i = 0; i < 5; i++) {
          const y = rnd(h * 0.1, h * 0.4)
          const g2 = c.createLinearGradient(0, y - 70, 0, y + 90)
          g2.addColorStop(0, 'rgba(124,243,198,0)')
          g2.addColorStop(0.45, `rgba(${124 + i * 12},243,${198 - i * 20},.42)`)
          g2.addColorStop(1, 'rgba(90,140,255,0)')
          c.fillStyle = g2
          c.beginPath()
          c.moveTo(0, y)
          for (let x = 0; x <= w; x += 24) c.lineTo(x, y + Math.sin(x * 0.012 + i * 2) * 26)
          c.lineTo(w, y + 150); c.lineTo(0, y + 150); c.closePath(); c.fill()
        }
      }
      if (env.sea) { // 海平线
        c.fillStyle = 'rgba(20,80,110,.55)'; c.fillRect(0, h * 0.62, w, h * 0.1)
        c.fillStyle = 'rgba(255,255,255,.14)'
        for (let i = 0; i < 40; i++) c.fillRect(rnd(0, w), rnd(h * 0.63, h * 0.71), rnd(6, 26), 1.6)
      }
      // 顶边淡出，让球顶看起来还是玻璃
      const fade = c.createLinearGradient(0, 0, 0, h * 0.28)
      fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)')
      c.globalCompositeOperation = 'destination-out'
      c.fillStyle = fade; c.fillRect(0, 0, w, h * 0.28)
      c.globalCompositeOperation = 'source-over'
    }, 1, 1, skyBag)
    if (skyMesh) { globe.remove(skyMesh); skyMesh.geometry.dispose(); skyMat.dispose() }
    skyMat = new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, depthWrite: false })
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 0.985, 40, 28, 0, 6.28, Math.PI * 0.16, Math.PI * 0.84), skyMat)
    skyMesh.renderOrder = 0
    globe.add(skyMesh)
  }

  // 月亮
  const moon = glow(0xfff4d8, 0.62, [-0.85, 0.72, -1.0])
  moon.material.opacity = 0
  globe.add(moon)

  // 地面（中间微微隆起的雪丘）
  const groundTex = tex(256, 256, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h)
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(0,0,0,${rnd(0.01, 0.045)})`
      c.beginPath(); c.arc(rnd(0, w), rnd(0, h), rnd(1, 4.5), 0, 6.28); c.fill()
    }
  }, 2, 2)
  const gPts = []
  for (let i = 0; i <= 22; i++) { const r = (i / 22) * GR; gPts.push(new THREE.Vector2(r, groundY(r))) }
  gPts.push(new THREE.Vector2(GR, GY - 0.1), new THREE.Vector2(0, GY - 0.1))
  const groundMat = M(0xf2f6ff, { map: groundTex, roughness: 0.9 })
  const ground = new THREE.Mesh(new THREE.LatheGeometry(gPts, 48), groundMat)
  ground.receiveShadow = true
  globe.add(ground)

  // 拖摆件时用来接射线的隐形盘
  const pad = new THREE.Mesh(new THREE.CircleGeometry(GR, 24), new THREE.MeshBasicMaterial({ visible: false }))
  pad.rotation.x = -Math.PI / 2
  pad.position.y = GY + 0.08
  globe.add(pad)

  // 玻璃：主球 + 菲涅尔边缘高光
  const glass = new THREE.Mesh(new THREE.SphereGeometry(R, 54, 38),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.13, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false }))
  glass.renderOrder = 20
  const rimMat = new THREE.ShaderMaterial({
    uniforms: { uC: { value: new THREE.Color(0xdcefff) }, uO: { value: 0.55 } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uO; varying vec3 vN; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 3.0); gl_FragColor = vec4(uC, f * uO); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 54, 38), rimMat)
  rim.renderOrder = 21
  globe.add(glass, rim)

  /* ---------- 底座 ---------- */
  let baseGrp = null
  function buildBase(def, note) {
    freeBag(baseBag)
    if (baseGrp) { scene.remove(baseGrp); disposeObj(baseGrp) }
    const g = new THREE.Group()
    const pts = []
    const prof = [[1.1, 0.52], [1.06, 0.44], [0.88, 0.36], [0.84, 0.2], [0.98, 0.1], [1.02, 0.03], [0.98, 0]]
    prof.forEach(([r, y]) => pts.push(new THREE.Vector2(r, y)))
    pts.push(new THREE.Vector2(0, 0))
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48),
      M(def.col, { roughness: def.rough, metalness: def.metal }))
    body.castShadow = true; body.receiveShadow = true
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.07, 0.035, 10, 48),
      M(def.ring, { roughness: 0.3, metalness: 0.8 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.5
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.08, 0.06, 48),
      M(def.col2, { roughness: def.rough, metalness: def.metal }))
    lip.position.y = 0.49
    g.add(body, ring, lip)
    // 铭牌：刻上寄件人写的那句话
    const words = (note || 'US · 水晶球').slice(0, 16)
    const plate = tex(512, 128, (c, w, h) => {
      c.fillStyle = '#00000000'; c.clearRect(0, 0, w, h)
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 0, w, h)
      c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = 4; c.strokeRect(10, 10, w - 20, h - 20)
      c.fillStyle = '#fdf3dd'; c.textAlign = 'center'; c.textBaseline = 'middle'
      c.font = '44px "Songti SC", serif'
      c.fillText(words, w / 2, h / 2 + 2)
    }, 1, 1, baseBag)
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.24),
      M(0xffffff, { map: plate, roughness: 0.45, metalness: 0.2, transparent: true }))
    pl.position.set(0, 0.3, 0.86)
    pl.rotation.x = -0.14
    g.add(pl)
    baseGrp = g
    scene.add(g)
  }

  // 地面投影（一张软阴影贴图，免得为了一片影子再开一盏灯）
  const shadowSprite = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshBasicMaterial({ map: GLOW_TEX, color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }))
  shadowSprite.rotation.x = -Math.PI / 2
  shadowSprite.position.y = 0.004
  scene.add(shadowSprite)

  /* ---------- 摆件 ---------- */
  const itemsGrp = new THREE.Group()
  globe.add(itemsGrp)
  let data = DEFAULT_GLOBE()
  let selected = -1
  const itemTicks = []
  const changed = () => { if (opts.onChange) opts.onChange() } // 每次改动球的内容都通知页面（页面据此存草稿）

  const ringSel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.012, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }))
  ringSel.rotation.x = -Math.PI / 2
  ringSel.visible = false
  globe.add(ringSel)

  function disposeObj(o) {
    o.traverse((m) => {
      if (m.geometry) m.geometry.dispose()
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mt) => mt.dispose())
    })
  }
  function placeOne(o, it) {
    const r = Math.hypot(it.x, it.z) * GR
    const lim = Math.min(r, PR)
    const a = Math.atan2(it.z, it.x)
    const px = Math.cos(a) * lim
    const pz = Math.sin(a) * lim
    o.position.set(px, groundY(lim) - 0.01, pz)
    o.rotation.y = it.rot || 0
    o.scale.setScalar(it.s || 1)
  }
  function buildItems() {
    freeBag(itemBag)
    itemTicks.length = 0
    while (itemsGrp.children.length) {
      const c = itemsGrp.children.pop()
      itemsGrp.remove(c)
      disposeObj(c)
    }
    data.items.forEach((it, i) => {
      const mk = BUILD[it.t]
      if (!mk) return
      const o = mk(KIT)
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.idx = i } })
      o.userData.idx = i
      placeOne(o, it)
      if (o.userData.tick) itemTicks.push(o.userData.tick)
      itemsGrp.add(o)
    })
    syncRing()
  }
  function syncRing() {
    const o = itemsGrp.children[selected]
    if (!o) { ringSel.visible = false; return }
    ringSel.visible = true
    ringSel.position.copy(o.position)
    ringSel.position.y += 0.012
    ringSel.scale.setScalar(Math.max(0.6, (data.items[selected].s || 1)))
  }

  /* ---------- 飘落物 ---------- */
  const FSPRITE = {
    disc: sprite((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, s / 2, 0, 6.28); c.fill()
    }),
    streak: sprite((c, s) => {
      const g = c.createLinearGradient(0, 0, 0, s)
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = g; c.fillRect(s * 0.42, 0, s * 0.16, s)
    }),
    petal: sprite((c, s) => {
      c.fillStyle = '#fff'
      c.beginPath()
      c.ellipse(s / 2, s / 2, s * 0.2, s * 0.42, 0.6, 0, 6.28)
      c.fill()
    }),
    spark: sprite((c, s) => {
      c.fillStyle = '#fff'
      c.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 6.28
        const r = i % 2 ? s * 0.1 : s * 0.46
        c[i ? 'lineTo' : 'moveTo'](s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r)
      }
      c.closePath(); c.fill()
    }),
    glow: sprite((c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)')
      c.fillStyle = g; c.fillRect(0, 0, s, s)
    }),
    ring: sprite((c, s) => {
      c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = s * 0.07
      c.beginPath(); c.arc(s / 2, s / 2, s * 0.36, 0, 6.28); c.stroke()
      c.fillStyle = 'rgba(255,255,255,.35)'
      c.beginPath(); c.arc(s * 0.38, s * 0.36, s * 0.08, 0, 6.28); c.fill()
    }),
  }
  const RR = R - 0.1
  let pts = null, pPos = null, pVel = null, pSeed = null, pCfg = null, agit = 0

  function spawn(i, fromTop) {
    const a = Math.random() * 6.28
    const rr = Math.sqrt(Math.random()) * RR * 0.95
    const y = fromTop
      ? Math.sqrt(Math.max(0.01, RR * RR - rr * rr)) * rnd(0.75, 0.98)
      : (pCfg.mode === 'rise' ? GY + 0.1 : rnd(GY, Math.sqrt(Math.max(0.01, RR * RR - rr * rr))))
    pPos[i * 3] = Math.cos(a) * rr
    pPos[i * 3 + 1] = pCfg.mode === 'rise' && fromTop ? GY + rnd(0, 0.2) : y
    pPos[i * 3 + 2] = Math.sin(a) * rr
    pVel[i * 3] = rnd(-0.04, 0.04)
    pVel[i * 3 + 1] = rnd(pCfg.vy[0], pCfg.vy[1])
    pVel[i * 3 + 2] = rnd(-0.04, 0.04)
    pSeed[i] = Math.random() * 100
  }
  function buildFall(cfg) {
    if (pts) { globe.remove(pts); pts.geometry.dispose(); pts.material.dispose(); pts = null }
    pCfg = cfg
    if (!cfg.n) return
    pPos = new Float32Array(cfg.n * 3)
    pVel = new Float32Array(cfg.n * 3)
    pSeed = new Float32Array(cfg.n)
    for (let i = 0; i < cfg.n; i++) spawn(i, false)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
    pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: FSPRITE[cfg.sprite], color: cfg.color, size: cfg.size, sizeAttenuation: true,
      transparent: true, depthWrite: false, opacity: cfg.add ? 0.95 : 0.9,
      blending: cfg.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    }))
    pts.renderOrder = 8
    globe.add(pts)
  }
  function stepFall(dt, t) {
    if (!pts || !pCfg.n) return
    const sp = 1 + agit * 2.4
    for (let i = 0; i < pCfg.n; i++) {
      const j = i * 3
      const s = pSeed[i]
      if (pCfg.mode === 'float') {
        pPos[j] += Math.sin(t * 0.6 + s) * dt * 0.22
        pPos[j + 1] += Math.cos(t * 0.45 + s * 1.7) * dt * 0.16
        pPos[j + 2] += Math.sin(t * 0.52 + s * 2.3) * dt * 0.2
      } else {
        const d = pCfg.mode === 'rise' ? 1 : -1
        pPos[j + 1] += d * pVel[j + 1] * dt * sp
        pPos[j] += (pVel[j] + Math.sin(t * pCfg.spin + s) * 0.05) * dt * sp
        pPos[j + 2] += (pVel[j + 2] + Math.cos(t * pCfg.spin * 0.8 + s) * 0.05) * dt * sp
      }
      if (agit > 0.01) {
        pPos[j] += Math.sin(t * 9 + s) * agit * dt * 0.9
        pPos[j + 1] += Math.sin(t * 7 + s * 1.3) * agit * dt * 0.7
        pPos[j + 2] += Math.cos(t * 8 + s * 0.7) * agit * dt * 0.9
      }
      const x = pPos[j], y = pPos[j + 1], z = pPos[j + 2]
      const len = Math.sqrt(x * x + y * y + z * z)
      const below = y < groundY(Math.hypot(x, z)) + 0.01
      const above = pCfg.mode === 'rise' && y > RR * 0.9
      if (len > RR || below || above) spawn(i, pCfg.mode !== 'rise')
    }
    pts.geometry.attributes.position.needsUpdate = true
  }

  /* ---------- 景色 ---------- */
  let envDef = ENVS[0]
  function applyEnv(id) {
    envDef = ENVS.find((e) => e.id === id) || ENVS[0]
    buildSky(envDef)
    groundMat.color.setHex(envDef.ground)
    hemi.color.setHex(envDef.hemi[0]); hemi.groundColor.setHex(envDef.hemi[1]); hemi.intensity = envDef.hemi[2]
    dir.color.setHex(envDef.dir[0]); dir.intensity = envDef.dir[1]
    dir.position.set(envDef.dir[2][0], GC + envDef.dir[2][1], envDef.dir[2][2])
    amb.color.setHex(envDef.amb)
    renderer.toneMappingExposure = envDef.exp
    moon.material.opacity = envDef.moon ? 0.85 : 0
    rimMat.uniforms.uC.value.set(envDef.star ? 0xbfd8ff : 0xffffff)
  }

  /* ---------- 整球数据 ---------- */
  function apply(g) {
    data = normalizeGlobe(g) || DEFAULT_GLOBE()
    selected = -1
    applyEnv(data.env)
    buildFall(FALLS.find((f) => f.id === data.fall) || FALLS[0])
    buildBase(BASES.find((b) => b.id === data.base) || BASES[0], data.note)
    buildItems()
    if (opts.onSelect) opts.onSelect(-1)
  }
  const getData = () => JSON.parse(JSON.stringify(data))

  function setEnv(id) { data.env = id; applyEnv(id); changed() }
  function setFall(id) { data.fall = id; buildFall(FALLS.find((f) => f.id === id) || FALLS[0]); shake(0.6); changed() }
  function setBase(id) { data.base = id; buildBase(BASES.find((b) => b.id === id) || BASES[0], data.note); changed() }
  function setSound(id) { data.sound = id; changed() }
  function setNote(s) { data.note = cleanNote(s); buildBase(BASES.find((b) => b.id === data.base) || BASES[0], data.note); changed() }

  function addItem(t) {
    if (data.items.length >= 12) return -1
    const a = Math.random() * 6.28
    const rr = rnd(0.25, 0.7)
    data.items.push({ t, x: Math.cos(a) * rr, z: Math.sin(a) * rr, rot: rnd(-1, 1), s: 1 })
    buildItems()
    select(data.items.length - 1)
    changed()
    return data.items.length - 1
  }
  function removeItem(i) {
    if (i < 0 || i >= data.items.length) return
    data.items.splice(i, 1)
    selected = -1
    buildItems()
    if (opts.onSelect) opts.onSelect(-1)
    changed()
  }
  function clearItems() {
    data.items = []
    selected = -1
    buildItems()
    if (opts.onSelect) opts.onSelect(-1)
    changed()
  }
  function patchItem(i, p) {
    const it = data.items[i]
    if (!it) return
    Object.assign(it, p)
    it.s = clamp(it.s, 0.55, 1.6)
    const o = itemsGrp.children[i]
    if (o) placeOne(o, it)
    syncRing()
    changed()
  }
  function select(i) {
    selected = i
    syncRing()
    if (opts.onSelect) opts.onSelect(i)
  }

  function shake(power = 1) {
    agit = Math.max(agit, power)
    const g0 = globe.rotation.z
    tween(0.75, (t, raw) => { globe.rotation.z = g0 + Math.sin(raw * 26) * 0.045 * (1 - raw) }, () => { globe.rotation.z = g0 }, lin)
    try { navigator.vibrate && navigator.vibrate([6, 24, 6]) } catch (e) { /* iOS 不支持 */ }
  }

  /* ---------- 镜头 ---------- */
  const cam = { th: 0, ph: 1.15, r: 6.0 }
  const goal = Object.assign({}, cam)
  let insetPx = 0
  const TY = GC - 0.12
  const portrait = () => clamp(0.92 / (W / H), 1, 1.75)
  function refit() { goal.r = 5.6 * (1 + (portrait() - 1) * 0.55) }
  function applyView() {
    if (insetPx > 0) camera.setViewOffset(W, H, 0, Math.round(insetPx * 0.5), W, H)
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
  }
  function setInset(px) { insetPx = Math.max(0, px || 0); applyView() }
  function applyCam() {
    const ph = clamp(cam.ph, 0.45, 1.5)
    camera.position.set(cam.r * Math.sin(ph) * Math.sin(cam.th), TY + cam.r * Math.cos(ph), cam.r * Math.sin(ph) * Math.cos(cam.th))
    camera.lookAt(0, TY, 0)
  }

  /* ---------- 交互：拖动转球 / 点摆件挑中 / 拖摆件挪位置 ---------- */
  const ptrs = new Map()
  let lastX = 0, lastY = 0, pinch = 0, moved = 0, mode = '', cand = -1
  let editable = true
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const planeHit = new THREE.Vector3()
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(GC + GY + 0.08))

  function castNdc(x, y) {
    const r = el.getBoundingClientRect()
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
  }
  function hitItem(x, y) {
    castNdc(x, y)
    const h = ray.intersectObjects(itemsGrp.children, true)[0]
    return h && h.object.userData.idx !== undefined ? h.object.userData.idx : -1
  }
  function onDown(e) {
    try { el.setPointerCapture(e.pointerId) } catch (err) { /* 个别浏览器不支持 */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    lastX = e.clientX; lastY = e.clientY; moved = 0
    cand = editable ? hitItem(e.clientX, e.clientY) : -1
    mode = cand >= 0 ? 'maybe' : 'orbit'
  }
  function onMove(e) {
    if (!ptrs.has(e.pointerId)) return
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch) goal.r = clamp(goal.r * (pinch / d), 3.4, 11)
      pinch = d; moved = 99; mode = 'orbit'
      return
    }
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    moved += Math.abs(dx) + Math.abs(dy)
    lastX = e.clientX; lastY = e.clientY
    if (mode === 'maybe' && moved > 7) { mode = 'drag'; select(cand) }
    if (mode === 'drag') {
      castNdc(e.clientX, e.clientY)
      if (ray.ray.intersectPlane(dragPlane, planeHit)) {
        const lx = planeHit.x, lz = planeHit.z
        const r = Math.hypot(lx, lz)
        const k = r > PR ? PR / r : 1
        patchItem(selected, { x: (lx * k) / GR, z: (lz * k) / GR })
      }
      return
    }
    goal.th -= dx * 0.006
    goal.ph = clamp(goal.ph - dy * 0.004, 0.5, 1.46)
  }
  function onUp() {
    if (moved < 8) {
      if (mode === 'maybe') select(cand === selected ? -1 : cand)
      else if (mode === 'orbit') select(-1)
    }
    ptrs.clear(); pinch = 0; mode = ''
  }
  function onCancel() { ptrs.clear(); pinch = 0; mode = '' }
  function onWheel(e) { e.preventDefault(); goal.r = clamp(goal.r + e.deltaY * 0.008, 3.4, 11) }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onCancel)
  el.addEventListener('wheel', onWheel, { passive: false })

  function resize() {
    W = Math.max(1, host.clientWidth)
    H = Math.max(1, host.clientHeight)
    renderer.setSize(W, H, false)
    camera.aspect = W / H
    camera.fov = W / H < 0.9 ? 46 : 38
    applyView()
    refit()
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
  if (ro) ro.observe(host)

  /* ---------- 快照（寄出去的小图，webp data URL，Safari 回退 jpeg） ---------- */
  function snapshot(outW = 300, outH = 380) {
    const cam2 = new THREE.PerspectiveCamera(32, outW / outH, 0.1, 60)
    cam2.position.set(0.9, GC + 0.9, 5.4)
    cam2.lookAt(0, GC - 0.18, 0)
    const ringWas = ringSel.visible
    ringSel.visible = false
    renderer.setPixelRatio(1)
    renderer.setSize(outW * 2, outH * 2, false)
    renderer.render(scene, cam2)
    const c = document.createElement('canvas')
    c.width = outW; c.height = outH
    const cx = c.getContext('2d')
    const g = cx.createLinearGradient(0, 0, 0, outH)
    g.addColorStop(0, envDef.sky[0]); g.addColorStop(1, envDef.sky[1])
    cx.fillStyle = g; cx.fillRect(0, 0, outW, outH)
    cx.drawImage(el, 0, 0, outW, outH)
    ringSel.visible = ringWas
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(W, H, false)
    let url = c.toDataURL('image/webp', 0.72)
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.78)
    if (url.length > 60000) url = c.toDataURL(url.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', 0.5)
    return url
  }

  /* ---------- 主循环 ---------- */
  const clock = new THREE.Clock()
  let running = true, raf = 0, sleep = 0, sleepGoal = 0
  function tick() {
    if (!running || document.hidden) { raf = 0; return }
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.05, clock.getDelta())
    const t = clock.elapsedTime
    stepTweens(dt)
    const k = 1 - Math.pow(0.0025, dt)
    ;['th', 'ph', 'r'].forEach((p) => { cam[p] += (goal[p] - cam[p]) * k })
    applyCam()

    agit = Math.max(0, agit - dt * 0.42)
    const slowed = sleep > 0.5 ? 0.45 : 1
    stepFall(dt * slowed, t)
    itemTicks.forEach((fn) => fn(dt))
    if (envDef.star || envDef.aur) skyMesh.rotation.y += dt * 0.012
    ringSel.material.opacity = 0.55 + Math.sin(t * 3) * 0.3

    sleep += (sleepGoal - sleep) * (1 - Math.pow(0.05, dt))
    const dim = 1 - sleep * 0.55
    hemi.intensity = envDef.hemi[2] * dim
    dir.intensity = envDef.dir[1] * dim
    renderer.toneMappingExposure = envDef.exp * (1 - sleep * 0.25)

    renderer.render(scene, camera)
  }

  // 切到别的标签页 / 锁屏时停掉渲染循环，回来再接着转（省电，也不占 GPU）
  function onVis() {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0 }
    else if (running && !raf) { clock.getDelta(); raf = requestAnimationFrame(tick) }
  }
  document.addEventListener('visibilitychange', onVis)

  function setSleep(b) { sleepGoal = b ? 1 : 0 }
  function setEditable(b) { editable = !!b; if (!b) select(-1) }

  // 回到默认的一屋一树一灯：清掉进行中的动画、镜头回正
  function reset() {
    tweens = []
    globe.rotation.z = 0
    agit = 0
    sleep = 0
    sleepGoal = 0
    goal.th = 0
    goal.ph = 1.15
    refit()
    apply(DEFAULT_GLOBE())
  }

  function dispose() {
    running = false
    cancelAnimationFrame(raf)
    tweens = []
    document.removeEventListener('visibilitychange', onVis)
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
    allTex.forEach((x) => x.dispose())
    renderer.dispose()
    if (renderer.forceContextLoss) renderer.forceContextLoss()
    if (el.parentNode) el.parentNode.removeChild(el)
  }

  camera.fov = W / H < 0.9 ? 46 : 38
  refit()
  Object.assign(cam, goal)
  applyView()
  applyCam()
  apply(DEFAULT_GLOBE())
  tick()

  return {
    apply, reset, getData, setEnv, setFall, setBase, setSound, setNote,
    addItem, removeItem, clearItems, patchItem, select, shake,
    setInset, setSleep, setEditable, snapshot, dispose,
    get selected() { return selected },
  }
}