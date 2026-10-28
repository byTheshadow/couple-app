/* ===========================================================================
   聊天图片：压缩 → 传 chat-images → 发一条带 image_url 的消息。
   从 Chat.jsx 抽出来，参数 / 路径 / 错误文案保持原样，小胡子也复用它。
   =========================================================================== */
import { supabase } from './supabase'

export const MAX_UPLOAD = 6 * 1024 * 1024 // 压缩后的上限

/** 上传前在本地把图片压小：最长边不超过 1600px，转成 JPEG（和相册一致） */
export async function compressImage(file, maxDim = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob || file
  } catch (e) {
    return file
  }
}

function imageKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export async function uploadChatImage(blob, myId, key) {
  if (!myId) throw new Error('empty')
  const path = `${myId}/${key || imageKey()}.jpg`
  const { error } = await supabase.storage.from('chat-images').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  const { data } = supabase.storage.from('chat-images').getPublicUrl(path)
  return { path, url: data.publicUrl }
}

export async function removeChatImage(path) {
  if (!path) return
  try { await supabase.storage.from('chat-images').remove([path]) } catch (e) { /* 清理失败不挡主流程 */ }
}

/**
 * 上传一张图并发到聊天。
 * opts.send：聊天页把自己的 chat.send 传进来，保留乐观发送 / 失败气泡；
 *            不传时直接调 send_message（小胡子用）。
 * opts.key / opts.replyTo / opts.retryId：和 Chat.jsx 原来的行为对齐。
 * 返回 { error, url, path }；失败时会清掉已经上传的文件。
 */
export async function sendImageToChat(file, caption, myId, opts) {
  const o = opts || {}
  if (!myId) return { error: 'empty' }

  const blob = await compressImage(file)
  if (blob.size > MAX_UPLOAD) throw new Error('too big')

  let up = null
  try {
    up = await uploadChatImage(blob, myId, o.key)
  } catch (e) {
    return { error: e?.message || '图片上传失败' }
  }

  try {
    let r
    if (typeof o.send === 'function') {
      r = await o.send(caption, o.replyTo || null, o.retryId || null, up.url)
    } else {
      const body = (caption || '').trim()
      const { error } = await supabase.rpc('send_message', {
        p_body: body,
        p_reply_to: o.replyTo || null,
        p_image_url: up.url,
      })
      r = { error: error ? (error.message || '消息发送失败') : null }
    }
    if (r && r.error) {
      await removeChatImage(up.path)
      return { error: r.error }
    }
    return { error: null, url: up.url, path: up.path }
  } catch (e) {
    await removeChatImage(up.path)
    return { error: e?.message || '消息发送失败' }
  }
}
