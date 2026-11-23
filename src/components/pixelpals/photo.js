import { supabase } from '../../lib/supabase'
import { W, H, drawOther } from './art'
import { drawCatRoom } from './rooms'

/* ===========================================================================
   猫屋合影：把「猫屋 + 两个人 + 猫」画成一张照片，存进相册
   - 画法全部复用现有的：drawCatRoom / drawOther（和游戏里同一个人物画法）
   - 4 倍放大 + 白边，像一张拍立得；右下角是日期
   - 存法复用相册那套：storage 的 album 桶 + photos 表，不需要新 SQL
   =========================================================================== */

const SCALE = 4      // 160×120 → 640×480，像素放大，不开平滑
const PAD = 16       // 白边
const CAP = 26       // 底部留白，写日期

/** 画一张合影，返回 <canvas>（纯本地，不上传） */
export function composeCatPhoto({ hr, cat, mySlot, taSlot, myWorn, taWorn, date }) {
  const art = document.createElement('canvas')
  art.width = W
  art.height = H
  const ctx = art.getContext('2d')
  ctx.imageSmoothingEnabled = false

  drawCatRoom(ctx, hr, 1.7, cat)
  // 两个人站在猫两边：左边我（不镜像），右边 TA（镜像，脸朝中间）
  drawOther(ctx, { x: 52, slot: mySlot, worn: myWorn || [], t: 1.7, flip: false })
  drawOther(ctx, { x: 108, slot: taSlot, worn: taWorn || [], t: 1.7, flip: true })

  const out = document.createElement('canvas')
  out.width = W * SCALE + PAD * 2
  out.height = H * SCALE + PAD + CAP
  const o = out.getContext('2d')
  o.imageSmoothingEnabled = false
  o.fillStyle = '#ffffff'
  o.fillRect(0, 0, out.width, out.height)
  o.drawImage(art, PAD, PAD, W * SCALE, H * SCALE)
  o.fillStyle = '#9a9aa2'
  o.font = '13px ui-monospace, Menlo, Consolas, monospace'
  o.textAlign = 'right'
  o.fillText(date || '', out.width - PAD, out.height - 9)
  return out
}

/** 把画好的合影传进相册。成功返回 {}，失败返回 { error } */
export async function saveCatPhoto(canvas, myId) {
  if (!supabase) return { error: '没连上服务器' }
  if (!myId) return { error: '还没登录' }
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
  if (!blob) return { error: '照片没生成出来' }

  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const path = `${myId}/${key}.jpg`
  const { error: upErr } = await supabase.storage.from('album').upload(path, blob, { contentType: 'image/jpeg' })
  if (upErr) return { error: '上传失败，稍后再试' }

  const { data } = supabase.storage.from('album').getPublicUrl(path)
  const { error: insErr } = await supabase.from('photos').insert({ uploader_id: myId, url: data.publicUrl })
  if (insErr) {
    await supabase.storage.from('album').remove([path]) // 记录没存上，别留没人要的文件
    return { error: '存进相册失败' }
  }
  return {}
}