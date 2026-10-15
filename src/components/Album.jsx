
import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { usePhotos } from '../lib/hooks'
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

export default function Album() {
  const { me } = useAuth()
  const { photos } = usePhotos(MAX)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef(null)

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

  const shown = photos.slice(0, expanded ? MAX : PREVIEW)
  const [openPhoto, setOpenPhoto] = useState(null)

  return (
    <section className="col rv" style={{ gap: 10 }}>
      <div className="sect">
        <b>相册</b>
        <button type="button" className="mini tap" onClick={pick} disabled={busy}>
          <Svg name="plus" size={14} stroke={2} />{busy ? '上传中…' : '传照片'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {toast && <div className="h-sub">{toast}</div>}
      {photos.length === 0 ? (
        <div className="glass h-sub" style={{ borderRadius: 18, padding: 16 }}>还没有照片，传第一张吧</div>
      ) : (
        <>
                   <div className="photos">
            {shown.map((p) => (
              <button key={p.id} type="button" className="ph tap" onClick={() => setOpenPhoto(p)}>
                <div className="art" style={{ backgroundImage: `url(${p.url})` }} />
              </button>
            ))}
          </div>
          {openPhoto && <PhotoModal photo={openPhoto} onClose={() => setOpenPhoto(null)} />}
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