/* ===========================================================================
   水晶球的摆件工厂。每个都返回一个 Group，底面贴在 y=0，整体高度控制在 0.9 以内
   （球内半径 1.62，地面在 -0.74，所以 0.9 以内不会顶到玻璃）。
   k 是场景传进来的小工具箱：k.M 材质、k.tex 画贴图、k.glow 发光点。
   想加新摆件：这里写一个 BUILD.xxx，再去 data.js 的 ITEMS 里加一行，别的都不用动。
   带动画的摆件（比如灯塔）把每帧回调放在 group.userData.tick = (dt) => …
   =========================================================================== */
import * as THREE from 'three'

const rnd = (a, b) => a + Math.random() * (b - a)

export const BUILD = {}

BUILD.cabin = (k) => {
  const g = new THREE.Group()
  const wood = k.M(0x8d5c38, { roughness: 0.78 })
  const dark = k.M(0x5d3a22, { roughness: 0.8 })
  const snow = k.M(0xf7fbff, { roughness: 0.92 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.38), wood)
  body.position.y = 0.15
  g.add(body)
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.035, 0.44), dark)
    p.position.set(s * 0.113, 0.398, 0)
    p.rotation.z = -s * 0.72
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.03, 0.45), snow)
    w.position.set(s * 0.118, 0.428, 0)
    w.rotation.z = -s * 0.72
    g.add(p, w)
  }
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.07), dark)
  ch.position.set(0.13, 0.47, -0.08)
  g.add(ch)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.11),
    k.M(0xffdfa0, { emissive: 0xffb95c, emissiveIntensity: 1.5 }))
  win.position.set(-0.11, 0.17, 0.191)
  g.add(win, k.glow(0xffc070, 0.46, [-0.11, 0.17, 0.26]))
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.19, 0.02), dark)
  door.position.set(0.11, 0.095, 0.193)
  g.add(door)
  return g
}

BUILD.pine = (k) => {
  const g = new THREE.Group()
  const bark = k.M(0x6b4a30, { roughness: 0.9 })
  const leaf = k.M(0x2f5e42, { roughness: 0.85 })
  const snow = k.M(0xf4f9ff, { roughness: 0.9 })
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.16, 8), bark)
  tr.position.y = 0.08
  g.add(tr)
  const tier = [[0.24, 0.26, 0.13], [0.19, 0.22, 0.29], [0.13, 0.2, 0.44]]
  tier.forEach(([r, h, by]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), leaf)
    c.position.y = by + h / 2
    const s = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, h * 0.42, 12), snow)
    s.position.y = by + h * 0.79
    g.add(c, s)
  })
  return g
}

BUILD.lamp = (k) => {
  const g = new THREE.Group()
  const iron = k.M(0x2b2b33, { roughness: 0.42, metalness: 0.6 })
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.05, 14), iron)
  foot.position.y = 0.025
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.024, 0.5, 10), iron)
  pole.position.y = 0.3
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.1, 12), iron)
  hat.position.y = 0.63
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10),
    k.M(0xfff0c8, { emissive: 0xffc063, emissiveIntensity: 2.1 }))
  bulb.position.y = 0.555
  g.add(foot, pole, hat, bulb, k.glow(0xffc880, 0.72, [0, 0.56, 0]))
  return g
}

BUILD.snowman = (k) => {
  const g = new THREE.Group()
  const snow = k.M(0xfbfdff, { roughness: 0.88 })
  const coal = k.M(0x1b1b20, { roughness: 0.5 })
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), snow); b1.position.y = 0.135
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.113, 18, 14), snow); b2.position.y = 0.345
  const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), snow); b3.position.y = 0.51
  g.add(b1, b2, b3)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.08, 8), k.M(0xe8863c, { roughness: 0.6 }))
  nose.position.set(0, 0.512, 0.095); nose.rotation.x = Math.PI / 2
  g.add(nose)
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), coal)
    e.position.set(s * 0.032, 0.54, 0.072)
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.19, 6), k.M(0x6b4a30, { roughness: 0.9 }))
    a.position.set(s * 0.15, 0.37, 0); a.rotation.z = s * 1.05
    g.add(e, a)
  }
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.014, 16), coal)
  brim.position.y = 0.578
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.1, 16), coal)
  top.position.y = 0.635
  g.add(brim, top)
  return g
}

BUILD.bench = (k) => {
  const g = new THREE.Group()
  const wood = k.M(0x9a6b45, { roughness: 0.75 })
  const iron = k.M(0x32323a, { roughness: 0.45, metalness: 0.5 })
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.026, 0.13), wood)
  seat.position.y = 0.15
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.11, 0.022), wood)
  back.position.set(0, 0.22, -0.055)
  g.add(seat, back)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.15, 0.025), iron)
    l.position.set(sx * 0.15, 0.075, sz * 0.048)
    g.add(l)
  }
  return g
}

BUILD.deer = (k) => {
  const g = new THREE.Group()
  const fur = k.M(0x9c6b43, { roughness: 0.85 })
  const horn = k.M(0xd8c3a0, { roughness: 0.7 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fur)
  body.scale.set(0.11, 0.095, 0.19); body.position.y = 0.3
  g.add(body)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.011, 0.24, 7), fur)
    l.position.set(sx * 0.062, 0.12, sz * 0.12)
    g.add(l)
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.17, 10), fur)
  neck.position.set(0, 0.4, 0.15); neck.rotation.x = 0.42
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), fur)
  head.scale.set(0.05, 0.045, 0.075); head.position.set(0, 0.47, 0.21)
  g.add(neck, head)
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.13, 6), horn)
    a.position.set(s * 0.028, 0.54, 0.19); a.rotation.z = s * 0.3
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.08, 6), horn)
    b.position.set(s * 0.058, 0.57, 0.185); b.rotation.z = s * 0.85
    g.add(a, b)
  }
  return g
}

BUILD.cat = (k) => {
  const g = new THREE.Group()
  const fur = k.M(0x3a3a44, { roughness: 0.9 })
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), fur)
  body.scale.set(0.085, 0.072, 0.125); body.position.y = 0.075
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 11), fur)
  head.position.set(0, 0.145, 0.09)
  g.add(body, head)
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.055, 4), fur)
    e.position.set(s * 0.038, 0.195, 0.08)
    g.add(e)
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI * 1.15), fur)
  tail.position.set(0, 0.11, -0.11); tail.rotation.set(0, Math.PI / 2, -0.5)
  g.add(tail)
  return g
}

BUILD.tower = (k) => {
  const g = new THREE.Group()
  const stripe = k.tex(64, 256, (c, w, h) => {
    c.fillStyle = '#f6f3ee'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#d6504f'
    for (let i = 0; i < 5; i++) c.fillRect(0, i * (h / 5), w, h / 10)
  })
  const bodyM = k.M(0xffffff, { map: stripe, roughness: 0.65 })
  const iron = k.M(0x30303a, { roughness: 0.45, metalness: 0.5 })
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.08, 18), k.M(0x8e8a84, { roughness: 0.85 }))
  base.position.y = 0.04
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.145, 0.5, 20), bodyM)
  body.position.y = 0.33
  const gal = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.026, 20), iron)
  gal.position.y = 0.593
  const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.1, 16),
    k.M(0xfff3cf, { emissive: 0xffcf7a, emissiveIntensity: 2.3 }))
  lan.position.y = 0.655
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.09, 16), iron)
  roof.position.y = 0.75
  g.add(base, body, gal, lan, roof, k.glow(0xffd08a, 1.0, [0, 0.655, 0]))
  // 转一圈的光柱
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.0, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd79a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  beam.rotation.z = Math.PI / 2
  beam.position.set(0.5, 0, 0)
  const pivot = new THREE.Group()
  pivot.position.y = 0.655
  pivot.add(beam)
  g.add(pivot)
  g.userData.tick = (dt) => { pivot.rotation.y += dt * 0.75 }
  return g
}

BUILD.post = (k) => {
  const g = new THREE.Group()
  const red = k.M(0xc8464c, { roughness: 0.55 })
  const iron = k.M(0x2e2e36, { roughness: 0.5, metalness: 0.4 })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.024, 0.3, 10), iron)
  pole.position.y = 0.15
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.17, 14, 1, false, 0, Math.PI), red)
  box.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  box.position.y = 0.345
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.145, 0.012), red)
  back.position.set(0, 0.313, 0)
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.014, 0.01), iron)
  slot.position.set(0, 0.385, 0.071)
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.045), k.M(0xe8b23c, { roughness: 0.6 }))
  flag.position.set(0.09, 0.41, 0)
  g.add(pole, box, back, slot, flag)
  return g
}

BUILD.torii = (k) => {
  const g = new THREE.Group()
  const red = k.M(0xcf4b3a, { roughness: 0.6 })
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.46, 10), red)
    p.position.set(s * 0.17, 0.23, 0)
    g.add(p)
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.035, 0.055), red)
  top.position.y = 0.487
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.022, 0.04), red)
  cap.position.y = 0.455
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.04), red)
  mid.position.y = 0.385
  const pin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.03), red)
  pin.position.y = 0.42
  g.add(top, cap, mid, pin)
  return g
}

BUILD.shroom = (k) => {
  const g = new THREE.Group()
  const dot = k.tex(128, 64, (c, w, h) => {
    c.fillStyle = '#d6504f'; c.fillRect(0, 0, w, h)
    c.fillStyle = '#fdf4e6'
    for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(rnd(0, w), rnd(0, h), rnd(4, 9), 0, 6.28); c.fill() }
  })
  const cap = k.M(0xffffff, { map: dot, roughness: 0.65 })
  const stem = k.M(0xf3ead8, { roughness: 0.8 })
  const one = (x, z, s) => {
    const m = new THREE.Group()
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.032, 0.1, 10), stem)
    st.position.y = 0.05
    const cp = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 10, 0, 6.28, 0, Math.PI / 2), cap)
    cp.position.y = 0.1
    m.add(st, cp)
    m.position.set(x, 0, z)
    m.scale.setScalar(s)
    return m
  }
  g.add(one(0, 0, 1), one(0.1, 0.07, 0.68), one(-0.09, 0.05, 0.52))
  return g
}

BUILD.boat = (k) => {
  const g = new THREE.Group()
  const wood = k.M(0x9d6236, { roughness: 0.72 })
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.36, 14, 1, false, 0, Math.PI), wood)
  hull.rotation.set(Math.PI / 2, 0, 0)
  hull.position.y = 0.085
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.36), k.M(0xb78350, { roughness: 0.8 }))
  deck.position.y = 0.085
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.13, 14, 1, false, 0, Math.PI), wood)
  bow.rotation.set(-Math.PI / 2, 0, Math.PI)
  bow.position.set(0, 0.085, 0.24)
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.38, 8), k.M(0x6b4a30, { roughness: 0.85 }))
  mast.position.y = 0.28
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.26),
    k.M(0xf6efe0, { roughness: 0.9, side: THREE.DoubleSide }))
  sail.position.set(0.085, 0.32, 0); sail.rotation.y = Math.PI / 2
  g.add(hull, deck, bow, mast, sail)
  return g
}