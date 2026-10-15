import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { fmtTime, usePhotos } from '../lib/hooks'
import { Svg } from './Icon'
import PhotoModal from './PhotoModal'
const PREVIEW = 6
const MAX = 24

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

export default function Album() {
  const { me } = useAuth()
  const { photos } = usePhotos(MAX)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [openPhoto, setOpenPhoto] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const fileRef = useRef(null)
  const confirmTimer = useRef(null)

  const say = (t) => { setToast(t); setTimeout(() => setToast(''), 2400) }

  const pick = () => fileRef.current?.click()

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !me) return
    if (!file.type.startsWith('image/')) return say('只能上传图片')
    if (file.size > 5 * 1024 * 1024) return say('图片要小于 5MB')
    setBusy(true)
    const blob = await compressImage(file)
    const path = `${me.id}/${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('album').upload(path, blob, { contentType: 'image/jpeg' })
    if (upErr) { setBusy(false); return say('上传失败，再试一次') }
    const { data } = supabase.storage.from('album').getPublicUrl(path)
    const { error: insErr } = await supabase.from('photos').insert({ uploader_id: me.id, url: data.publicUrl })
    setBusy(false)
    if (insErr) return say('保存失败，再试一次')
    say('照片已上传')
  }

  // 先点一下变成"再点一次确认"，2.6 秒内再点一次才真的删，避免误触
  const handleDeleteTap = (photo) => {
    if (confirmingId !== photo.id) {
      setConfirmingId(photo.id)
      clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmingId(null), 2600)
      return
    }
    clearTimeout(confirmTimer.current)
    setConfirmingId(null)
    removePhoto(photo)
  }

  const removePhoto = async (photo) => {
    setDeletingId(photo.id)
    // 先删数据库记录；加 .select() 才能知道真的删没删（权限不够时 Supabase 不报错，只是什么都没删）
    const { data, error } = await supabase.from('photos').delete().eq('id', photo.id).select()
    setDeletingId(null)
    if (error) return say('删除失败，再试一次')
    if (!data || data.length === 0) return say('没有删除权限，去 Supabase 加一条 photos 的删除策略')
    if (openPhoto?.id === photo.id) setOpenPhoto(null)
    // 记录删掉之后再删图片文件；文件删不掉也不影响，只是多占一点空间
    const path = storagePathFromUrl(photo.url)
    if (path) await supabase.storage.from('album').remove([path])
    say('照片已删除')
  }

  const shown = photos.slice(0, expanded ? MAX : PREVIEW)

  return (
    <section className="col rv" style={{ gap: 10 }}>
      <div className="sect">
        <b>相册</b>
        <button type="button" className="mini tap" onClick={pick} disabled={busy}>
          <Svg name="camera" size={14} stroke={1.8} />{busy ? '上传中…' : '传照片'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {toast && <div className="h-sub">{toast}</div>}
      {photos.length === 0 ? (
        <div className="glass ph-empty rv" data-depth>
          <Svg name="camera" size={28} stroke={1.3} />
          <div className="h-sub">还没有照片，传第一张吧</div>
        </div>
      ) : (
        <>
          <div className="photos">
            {shown.map((p, idx) => {
              const mine = p.uploader_id === me?.id
              return (
                <div key={p.id} className="ph rv" style={{ '--rd': `${Math.min(idx, 5) * 0.05}s` }}>
                  <button type="button" className="ph-view tap" onClick={() => setOpenPhoto(p)} aria-label="查看照片">
                    <div className="art" style={{ backgroundImage: `url(${p.url})` }} />
                    <span className="ph-tag mono">{`IMG_${String(idx + 1).padStart(3, '0')}`}</span>
                    <span className="ph-time mono">{fmtTime(p.created_at)}</span>
                  </button>
                  <svg className="ph-frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M4 18V9a5 5 0 0 1 5-5h9" />
                    <path d="M96 18V9a5 5 0 0 0-5-5H82" />
                    <path d="M4 82v9a5 5 0 0 0 5 5h9" />
                    <path d="M96 82v9a5 5 0 0 1-5 5H82" />
                  </svg>
                  {mine && (
                    <button
                      type="button"
                      className={`ph-del tap${confirmingId === p.id ? ' on' : ''}`}
                      onClick={() => handleDeleteTap(p)}
                      aria-label={confirmingId === p.id ? '再点一次确认删除' : '删除照片'}
                      disabled={deletingId === p.id}
                    >
                      <Svg name={confirmingId === p.id ? 'check' : 'x'} size={12} stroke={2.4} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {openPhoto && <PhotoModal photo={openPhoto} onClose={() => setOpenPhoto(null)} onDelete={removePhoto} />}
          {photos.length > PREVIEW && (
            <button className="mini tap" style={{ alignSelf: 'center' }} onClick={() => setExpanded((v) => !v)}>
              {expanded ? '收起' : `查看更多（还有 ${Math.min(photos.length, MAX) - PREVIEW} 张）`}
            </button>
          )}
        </>
      )}
    </section>
  )
}