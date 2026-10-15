import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, usePhotos } from '../lib/hooks'
import { Svg } from './Icon'
import PhotoModal from './PhotoModal'
import './album.css'

const PREVIEW = 6 // 第一张 2×2 + 5 张小图 = 刚好三排
const MAX = 24
const MAX_PICK = 9 // 一次最多选几张
const MAX_ORIGINAL = 25 * 1024 * 1024 // 原图上限；压缩后会小很多
const MAX_UPLOAD = 6 * 1024 * 1024 // 压缩后的上限

// 上传前在本地把图片压小：最长边不超过 1600px，转成 JPEG
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob || file
  } catch {
    return file
  }
}

// 从公开 URL 还原出 storage 里的对象路径，删除原文件要用这个
function storagePathFromUrl(url) {
  const mark = '/album/'
  const i = url.indexOf(mark)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + mark.length).split('?')[0])
}

const initial = (s) => (s || '?').trim().slice(0, 1).toUpperCase()

// 单张缩略图：图片加载完再淡入，不会一格一格"啪"地蹦出来
function Tile({ photo, hero, mine, name, onOpen }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <button type="button" className={`al-tile tap${hero ? ' hero' : ''}${mine ? ' mine' : ''}`} onClick={onOpen} aria-label={`查看${name}上传的照片`}>
      <img
        src={photo.url} alt="" loading="lazy" decoding="async"
        className={loaded ? 'in' : ''} onLoad={() => setLoaded(true)} onError={() => setLoaded(true)}
      />
      <span className="al-by" aria-hidden="true">{initial(name)}</span>
      {hero && (
        <div className="al-cap">
          <b>最新的一张</b>
          <span>{name} · {fmtTime(photo.created_at)}</span>
        </div>
      )}
    </button>
  )
}

export default function Album() {
  const { me, partner } = useAuth()
  const { photos } = usePhotos(MAX)
  const [expanded, setExpanded] = useState(false)
  const [pending, setPending] = useState([]) // 正在上传的 { key, preview }
  const [toast, setToast] = useState('')
  const [openId, setOpenId] = useState(null)
  const fileRef = useRef(null)
  const toastTimer = useRef(null)
  const busy = pending.length > 0

  useEffect(() => () => clearTimeout(toastTimer.current), [])
  const say = (t) => {
    setToast(t)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }

  const nameOf = (uid) => (uid === me?.id ? me?.display_name || '我' : partner?.display_name || 'TA')

  const pick = () => fileRef.current?.click()

  // 支持一次选多张，按顺序一张一张传
  const onFile = async (e) => {
    const files = [...(e.target.files || [])].slice(0, MAX_PICK)
    e.target.value = ''
    if (!files.length || !me) return
    let ok = 0
    let fail = 0
    for (const file of files) {
      if (!file.type.startsWith('image/') || file.size > MAX_ORIGINAL) { fail += 1; continue }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const preview = URL.createObjectURL(file)
      setPending((p) => [...p, { key, preview }])
      try {
        const blob = await compressImage(file)
        if (blob.size > MAX_UPLOAD) throw new Error('too big')
        const path = `${me.id}/${key}.jpg`
        const { error: upErr } = await supabase.storage.from('album').upload(path, blob, { contentType: 'image/jpeg' })
        if (upErr) throw upErr
        const { data } = supabase.storage.from('album').getPublicUrl(path)
        const { error: insErr } = await supabase.from('photos').insert({ uploader_id: me.id, url: data.publicUrl })
        if (insErr) {
          await supabase.storage.from('album').remove([path]) // 记录没存上，别留下没人要的文件
          throw insErr
        }
        ok += 1
      } catch {
        fail += 1
      } finally {
        setPending((p) => p.filter((x) => x.key !== key))
        URL.revokeObjectURL(preview)
      }
    }
    if (ok && !fail) say(ok > 1 ? `${ok} 张照片已上传` : '照片已上传')
    else if (ok) say(`传好了 ${ok} 张，${fail} 张没成功`)
    else say('上传失败，换一张或稍后再试')
  }

  // 删除：返回 true / false，让看图界面知道要不要跳到下一张
  const removePhoto = async (photo) => {
    // 先删数据库记录；加 .select() 才能知道真的删没删（权限不够时 Supabase 不报错，只是什么都没删）
    const { data, error } = await supabase.from('photos').delete().eq('id', photo.id).select()
    if (error) { say('删除失败，再试一次'); return false }
    if (!data || data.length === 0) { say('没有删除权限，去 Supabase 加一条 photos 的删除策略'); return false }
    // 记录删掉之后再删图片文件；文件删不掉也不影响，只是多占一点空间
    const path = storagePathFromUrl(photo.url)
    if (path) await supabase.storage.from('album').remove([path])
    say('照片已删除')
    return true
  }

  const shown = photos.slice(0, expanded ? MAX : PREVIEW)

  return (
    <section className="al col rv">
      <div className="al-head">
        <div>
          <b>相册</b>
          {photos.length > 0 && <span className="al-count mono">{photos.length >= MAX ? `${MAX}+` : photos.length} 张</span>}
        </div>
        <button type="button" className="al-add tap" onClick={pick} disabled={busy}>
          <Svg name="camera" size={15} stroke={1.8} />{busy ? `上传中 · 剩 ${pending.length}` : '传照片'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFile} />
      </div>

      {toast && <div className="al-toast">{toast}</div>}

      {pending.length > 0 && (
        <div className="al-pending" aria-label="正在上传">
          {pending.map((p) => (
            <div key={p.key} className="al-pend"><img src={p.preview} alt="" /><i /></div>
          ))}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="al-empty">
          <Svg name="camera" size={30} stroke={1.3} />
          <div className="h-sub">还没有照片，把第一张留在这里吧</div>
          <button type="button" className="btn tap" onClick={pick} disabled={busy}>传第一张</button>
        </div>
      ) : (
        <>
          <div className="al-grid">
            {shown.map((p, idx) => (
              <Tile
                key={p.id} photo={p} hero={idx === 0} mine={p.uploader_id === me?.id}
                name={nameOf(p.uploader_id)} onOpen={() => setOpenId(p.id)}
              />
            ))}
          </div>
          {photos.length > PREVIEW && (
            <button type="button" className="mini tap al-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? '收起' : `查看更多（还有 ${Math.min(photos.length, MAX) - PREVIEW} 张）`}
            </button>
          )}
        </>
      )}

      {/* 放到 body 上：外层 .rv 带位移动画，会把 fixed 定位"困"在它自己里面 */}
      {openId && createPortal(
        <PhotoModal photos={photos} openId={openId} onChange={setOpenId} onClose={() => setOpenId(null)} onDelete={removePhoto} />,
        document.body,
      )}
    </section>
  )
}