import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Svg } from './Icon'
import './music.css'

// 同一时间只放一首：开始播放时把别的 <audio> 暂停（我的卡和 TA 的卡不会同时出声）
let playingEl = null

const fmt = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

/** "歌名 - 歌手" 拆成两段；没写歌手就只有歌名。不需要数据库多加一列 */
export function splitTitle(raw) {
  const t = (raw || '').trim()
  const m = t.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  return m ? { title: m[1].trim(), artist: m[2].trim() } : { title: t, artist: '' }
}

/**
 * 「在听」黑胶卡片。主页上我的卡和 TA 的卡都用它，弹窗里的预览也用它。
 * row 只需要 music_url / music_title / music_source 三个字段。
 */
export function NowPlaying({ row, label = 'TA 在听' }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [bad, setBad] = useState(false)
  const url = row?.music_url || ''

  // TA 换歌（实时推过来）或者弹窗里换了链接：进度和状态全部归零
  useEffect(() => {
    setPlaying(false); setCur(0); setDur(0); setBad(false)
  }, [url])

  // 页面离开时别留着声音
  useEffect(() => () => {
    const el = audioRef.current
    if (el) el.pause()
    if (playingEl === el) playingEl = null
  }, [])

  if (!url) return null

  const { title, artist } = splitTitle(row.music_title || '一首歌')
  const sub = bad ? '这首歌打不开，换个链接试试' : artist || (row.music_source === 'upload' ? '本地上传' : '外部链接')
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (!el.paused) { el.pause(); return }
    if (playingEl && playingEl !== el) playingEl.pause()
    playingEl = el
    setBad(false)
    el.play().catch(() => setBad(true))
  }

  // 点进度条跳到对应位置
  const seek = (e) => {
    const el = audioRef.current
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return
    const r = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    el.currentTime = ratio * el.duration
    setCur(el.currentTime)
  }

  return (
    <div className={`w-music${playing ? ' play' : ''}${bad ? ' bad' : ''}`}>
      <div className="mu-disc" aria-hidden="true" />
      <div className="mu-info">
        <span className="mu-pill">{label}</span>
        <b className="ellipsis">{title}</b>
        <small className="ellipsis">{sub}</small>
        <div className="mu-prog" onClick={seek} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <i style={{ '--p': `${pct}%` }} />
        </div>
        <div className="mu-t"><span>{fmt(cur)}</span><span>{dur > 0 ? fmt(dur) : '--:--'}</span></div>
      </div>
      <button type="button" className="mu-btn tap" onClick={toggle} aria-label={playing ? '暂停' : '播放'}>
        <Svg name={playing ? 'pause' : 'play'} size={18} stroke={1.8} />
      </button>
      <audio
        ref={audioRef} src={url} preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0) }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); setBad(false) }}
        onError={() => setBad(true)}
      />
    </div>
  )
}

const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|flac)$/i

/**
 * 添加 / 更换「在听」的弹窗。点「确定」直接写进数据库，TA 那边实时就能看到，
 * 不用再回到编辑页底部点保存。写库成功后用 onSaved(新的三个字段) 通知编辑页同步表单。
 */
export function MusicModal({ userId, initial, onClose, onSaved, say }) {
  const hasInitial = !!initial?.music_url
  const [source, setSource] = useState(hasInitial ? initial.music_source || 'link' : 'upload')
  const [upUrl, setUpUrl] = useState(hasInitial && initial.music_source === 'upload' ? initial.music_url : '')
  const [linkUrl, setLinkUrl] = useState(hasInitial && initial.music_source !== 'upload' ? initial.music_url : '')
  const [title, setTitle] = useState(initial?.music_title || '')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)

  const url = source === 'upload' ? upUrl : linkUrl.trim()

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('audio/') && !AUDIO_EXT.test(file.name)) return setErr('只能上传音频文件（mp3 / m4a 等）')
    if (file.size > 15 * 1024 * 1024) return setErr('文件要小于 15MB')
    setErr(''); setBusy(true)
    const ext = (file.name.split('.').pop() || 'mp3').toLowerCase()
    const path = `${userId}/track.${ext}`
    const { error } = await supabase.storage.from('music').upload(path, file, { upsert: true, cacheControl: '3600' })
    setBusy(false)
    if (error) return setErr('上传失败，再试一次')
    const { data } = supabase.storage.from('music').getPublicUrl(path)
    const base = file.name.replace(/\.[^.]+$/, '')
    setUpUrl(`${data.publicUrl}?t=${Date.now()}`)
    setFileName(base)
    setTitle((t) => t || base)
  }

  // 写库：先 update，没有这一行（还没存过状态）再 insert
  const write = async (payload) => {
    const { data, error } = await supabase.from('status').update(payload).eq('user_id', userId).select('user_id')
    if (error) return error
    if (data && data.length) return null
    const { error: insErr } = await supabase.from('status').insert({ user_id: userId, ...payload })
    return insErr || null
  }

  const confirm = async () => {
    if (!url) return setErr(source === 'upload' ? '先选一首歌' : '先粘贴歌曲链接')
    if (source === 'link' && !/^https?:\/\//i.test(url)) return setErr('链接要以 http:// 或 https:// 开头')
    setErr(''); setBusy(true)
    const payload = { music_url: url, music_title: title.trim().slice(0, 60) || fileName || '一首歌', music_source: source }
    const error = await write(payload)
    setBusy(false)
    if (error) return setErr('保存失败，稍后再试')
    onSaved(payload)
    say?.('歌已更新，TA 那边会实时看到')
    onClose()
  }

  const clear = async () => {
    setBusy(true)
    const payload = { music_url: null, music_title: null, music_source: null }
    const error = await write(payload)
    setBusy(false)
    if (error) return setErr('清除失败，稍后再试')
    onSaved(payload)
    say?.('已清除在听的歌')
    onClose()
  }

  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div className="sheet mu-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mu-sheet-hd">
          <div style={{ fontSize: 18, fontWeight: 650 }}>{hasInitial ? '换一首歌' : '添加在听的歌'}</div>
          <span className="h-sub">TA 也能看到，可以一起听</span>
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className={`pill${source === 'upload' ? ' on' : ''}`} onClick={() => { setSource('upload'); setErr('') }}>上传音频</button>
          <button type="button" className={`pill${source === 'link' ? ' on' : ''}`} onClick={() => { setSource('link'); setErr('') }}>外链地址</button>
        </div>

        {source === 'upload' ? (
          <>
            <button type="button" className={`mu-drop tap${upUrl ? ' has' : ''}`} onClick={() => fileRef.current?.click()} disabled={busy}>
              <Svg name={upUrl ? 'check' : 'note'} size={22} stroke={1.6} />
              <span>{busy ? '上传中…' : upUrl ? (fileName ? `已选好：${fileName}` : '已选好一首歌，点这里可以重选') : '点这里选择音频文件'}</span>
              <small>mp3 / m4a，15MB 以内</small>
            </button>
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac" hidden onChange={onFile} />
          </>
        ) : (
          <input
            className="field" inputMode="url" autoCapitalize="off" autoCorrect="off"
            placeholder="粘贴歌曲外链（mp3 直链）" value={linkUrl}
            onChange={(e) => { setLinkUrl(e.target.value); setErr('') }}
          />
        )}

        <input
          className="field" maxLength={60} value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="歌名 - 歌手（歌手可不写）"
        />

        {url && <NowPlaying row={{ music_url: url, music_title: title.trim() || fileName || '一首歌', music_source: source }} label="预览" />}

        {err && <div className="h-sub" style={{ color: '#e5484d' }}>{err}</div>}

        <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
          {hasInitial ? (
            <button type="button" className="mini tap" style={{ color: '#e5484d' }} onClick={clear} disabled={busy}>清除这首歌</button>
          ) : <span />}
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>取消</button>
            <button type="button" className="btn" onClick={confirm} disabled={busy || !url}>{busy ? '处理中…' : '确定'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}