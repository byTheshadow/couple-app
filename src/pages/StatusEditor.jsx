import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useStatus } from '../lib/hooks'
import { useScrollFx } from '../lib/scrollfx'
import Whisper from '../components/Whisper'
import { MusicModal, NowPlaying } from '../components/Music'
import TabBar from '../components/TabBar'
import { CARD_BGS, DECORATIONS, MOOD_GROUPS, STATUS_ICONS, StatusIcon, Svg } from '../components/Icon'
import { THEMES, useTheme } from '../lib/theme'
import '../components/moodpick.css'
import Badge from '../components/Badge'
import IdCard from '../components/IdCard'

const REVEAL_TYPES = [
  { id: 'scratch', label: '刮刮乐', desc: 'TA 刮开涂层才能看到' },
  { id: 'password', label: '密码锁', desc: 'TA 输入你们约定的 4 位数字才能看到' },
  { id: 'longpress', label: '长按充能', desc: 'TA 长按按钮，充满才解锁' },
  { id: 'timelock', label: '时限解锁', desc: '到你设定的时间才会自动解开' },
]

const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const initial = (name) => (name || '?').trim().slice(0, 1).toUpperCase()

function Backdrop() {
  return (
    <div className="bg">
      <div className="blobs" data-sy>
        <div className="blob a" /><div className="blob b" /><div className="blob c" />
        <div className="blob d" /><div className="blob e" />
      </div>
      <div className="aurora" />
    </div>
  )
}

export default function StatusEditor() {
  const { me, reload } = useAuth()
  const { row, loading } = useStatus(me?.id)
  const [form, setForm] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
    const [musicBusy, setMusicBusy] = useState(false)
  const [musicOpen, setMusicOpen] = useState(false)
  const [toast, setToast] = useState('')
    const [view, setView] = useState('me') // me = 我自己看到的卡，ta = TA 手机上看到的工牌
  const [moodTab, setMoodTab] = useState(0) // 心情选择器当前在哪个分类
  const { theme, choose: chooseTheme } = useTheme()
  const fileRef = useRef(null)
  const musicFileRef = useRef(null)

  useScrollFx()

  const say = useCallback((t) => { setToast(t); setTimeout(() => setToast(''), 2600) }, [])

  useEffect(() => { if (me) setName(me.display_name) }, [me])
    const inited = useRef(false)
  useEffect(() => {
    if (loading || inited.current) return
    inited.current = true
    setForm({
      icon_id: row?.icon_id || 'coffee',
      status_text: row?.status_text || '',
            decoration_id: row?.decoration_id || 'none',
      card_bg: row?.card_bg || 'none',
           avatar_url: row?.avatar_url || '',
      mood: row?.mood || '',
      mood_text: row?.mood_text || '',
      music_title: row?.music_title || '',
      music_url: row?.music_url || '',
      music_source: row?.music_source || 'link',
      secret_text: row?.secret_text || '',
      reveal_type: row?.reveal_type || 'scratch',
      pin: row?.reveal_config?.pin || '',
      unlockAt: toLocalInput(row?.reveal_config?.unlockAt),
    })
  }, [loading, row])

  if (!form) {
    return (
      <div className="shell">
        <Backdrop />
        <div className="page center"><div className="h-sub">加载中…</div></div>
      </div>
    )
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const type = REVEAL_TYPES.find((t) => t.id === form.reveal_type)

  const pickAvatar = () => fileRef.current?.click()
  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !me) return
    if (!file.type.startsWith('image/')) return say('只能上传图片')
    if (file.size > 5 * 1024 * 1024) return say('图片要小于 5MB')
    setAvatarBusy(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${me.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' })
    setAvatarBusy(false)
    if (error) return say('上传失败，再试一次')
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
       set('avatar_url', `${data.publicUrl}?t=${Date.now()}`)
    say('头像已更换，记得点保存')
  }

  const pickMusic = () => musicFileRef.current?.click()
  const onMusicFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !me) return
    if (!file.type.startsWith('audio/')) return say('只能上传音频文件')
    if (file.size > 15 * 1024 * 1024) return say('文件要小于 15MB')
    setMusicBusy(true)
    const ext = file.name.split('.').pop() || 'mp3'
    const path = `${me.id}/track.${ext}`
    const { error } = await supabase.storage.from('music').upload(path, file, { upsert: true, cacheControl: '3600' })
    setMusicBusy(false)
    if (error) return say('上传失败，再试一次')
    const { data } = supabase.storage.from('music').getPublicUrl(path)
    setForm((f) => ({
      ...f,
      music_url: `${data.publicUrl}?t=${Date.now()}`,
      music_source: 'upload',
      music_title: f.music_title || file.name.replace(/\.[^.]+$/, ''),
    }))
    say('歌曲已上传，记得点保存')
  }

  const now = new Date()
  const shortDate = `${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`

  const save = async () => {
    if (form.reveal_type === 'password' && !/^\d{4}$/.test(form.pin)) return say('密码锁需要 4 位数字')
    if (form.reveal_type === 'timelock' && !form.unlockAt) return say('请选择解锁时间')
    setSaving(true)
    const cfg = form.reveal_type === 'password' ? { pin: form.pin }
      : form.reveal_type === 'timelock' ? { unlockAt: new Date(form.unlockAt).toISOString() } : {}
    const [a, b] = await Promise.all([
      supabase.from('status').upsert({
        user_id: me.id, icon_id: form.icon_id, status_text: form.status_text.trim(),
        decoration_id: form.decoration_id, card_bg: form.card_bg, avatar_url: form.avatar_url || null,
        mood: form.mood || null,
        mood_text: form.mood_text.trim() || null,
        music_title: form.music_title.trim() || null,
        music_url: form.music_url.trim() || null,
        music_source: form.music_url.trim() ? form.music_source : null,
        secret_text: form.secret_text.trim(),
        reveal_type: form.reveal_type, reveal_config: cfg,
      }),
      name.trim() && name.trim() !== me.display_name
        ? supabase.from('profiles').update({ display_name: name.trim() }).eq('id', me.id)
        : Promise.resolve({}),
    ])
    setSaving(false)
    if (a.error || b.error) return say('保存失败，稍后再试')
    await reload()
    say('已保存，TA 那边会实时更新')
  }

  const preview = { user_id: me.id, updated_at: 'preview', secret_text: form.secret_text, reveal_type: form.reveal_type }

  return (
    <div className="shell">
      <Backdrop />
      {toast && <div className="toast glass">{toast}</div>}

      <div className="page">
        <div className="col hdr" data-sp style={{ padding: '0 6px', gap: 6 }}>
          <div className="h-sub">编辑我的状态</div>
          <h1 className="h-title">两层状态</h1>
        </div>

        {/* 实时预览：可以切换「我看到的」和「TA 看到的」，选装饰、写心情立刻看到效果 */}
        <div className="row rv" style={{ gap: 8 }}>
          <button type="button" className={`pill${view === 'me' ? ' on' : ''}`} onClick={() => setView('me')}>我看到的</button>
          <button type="button" className={`pill${view === 'ta' ? ' on' : ''}`} onClick={() => setView('ta')}>TA 看到的</button>
        </div>

              {view === 'ta' ? (
          <Badge
            preview
            person={{ id: me.id, name: name || '你的名字', slot: me.slot }}
            status={{ ...form, updated_at: null }}
          />
        ) : (
          <>
            <IdCard
              startOut
              person={{ id: me.id, name: name || '你的名字', slot: me.slot }}
              status={{ ...form, updated_at: row?.updated_at }}
              onEditAvatar={pickAvatar}
              editBusy={avatarBusy}
            />
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarFile} />
          </>
        )}

        <section className="col rv" style={{ gap: 10 }}>
          <div className="label">第一层 · 明面</div>
          <div className="glass editor-card">
            <input className="field" maxLength={16} value={form.status_text} onChange={(e) => set('status_text', e.target.value)} placeholder="搬砖中 / 电量低充电中…" />
            <div className="pickgrid">
              {STATUS_ICONS.map((i) => (
                <button key={i.id} className={`pick${form.icon_id === i.id ? ' on' : ''}`} onClick={() => set('icon_id', i.id)}>
                  <StatusIcon id={i.id} size={26} /><span>{i.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="label" style={{ marginTop: 4 }}>头像装饰</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {DECORATIONS.map((d) => (
              <button key={d.id} className={`pill${form.decoration_id === d.id ? ' on' : ''}`} onClick={() => set('decoration_id', d.id)}>{d.label}</button>
            ))}
          </div>
                    <div className="label" style={{ marginTop: 4 }}>名片背景（TA 也会看到）</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {CARD_BGS.map((c) => (
              <button key={c.id} className={`pill${form.card_bg === c.id ? ' on' : ''}`} onClick={() => set('card_bg', c.id)}>{c.label}</button>
            ))}
          </div>

                    <div className="label" style={{ marginTop: 4 }}>页面主题（只对这台设备生效）</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {THEMES.map((t) => (
              <button key={t.id} type="button" className={`pill${theme === t.id ? ' on' : ''}`} onClick={() => chooseTheme(t.id)}>{t.label}</button>
            ))}
          </div>

          <div className="label" style={{ marginTop: 4 }}>心情 / 小图标（点一下选中，再点一下取消）</div>
          <div className="mood-tabs">
            {MOOD_GROUPS.map((g, i) => (
              <button key={g.id} type="button" className={`mood-tab${moodTab === i ? ' on' : ''}`} onClick={() => setMoodTab(i)}>{g.label}</button>
            ))}
          </div>
          <div className="mood-grid">
            {MOOD_GROUPS[moodTab].items.map((em) => (
              <button key={em} type="button" className={`mood-cell${form.mood === em ? ' on' : ''}`}
                onClick={() => set('mood', form.mood === em ? '' : em)}>{em}</button>
            ))}
          </div>
          <div className="label" style={{ marginTop: 4 }}>心情一句话（TA 也能看到，可以不写）</div>
          <div className="field-wrap">
            <textarea className="field glass" rows={2} maxLength={40} value={form.mood_text} onChange={(e) => set('mood_text', e.target.value)} placeholder="今天有点累，但是想到你就好了" />
            <span className="cnt">{form.mood_text.length} / 40</span>
          </div>

                    <div className="label" style={{ marginTop: 4 }}>在听（TA 也能看到，可以一起听）</div>
          {form.music_url ? (
            <>
              <NowPlaying row={form} label="我在听" />
              <button type="button" className="mini tap" style={{ alignSelf: 'flex-start' }} onClick={() => setMusicOpen(true)}>换一首 / 清除</button>
            </>
          ) : (
            <button type="button" className="mini tap" style={{ alignSelf: 'flex-start' }} onClick={() => setMusicOpen(true)}>
              <Svg name="plus" size={14} stroke={2} />添加在听的歌
            </button>
          )}
        </section>

                <section className="col rv" style={{ gap: 10 }}>
          <div className="label">我的名字</div>
          <input className="field glass" maxLength={12} value={name} onChange={(e) => setName(e.target.value)} placeholder="TA 看到的你的名字" />
        </section>

        <section className="col rv" style={{ gap: 10 }}>
          <div className="label">第二层 · 暗面 · 想对 TA 说的话</div>
          <div className="field-wrap">
            <textarea className="field glass" rows={3} maxLength={120} value={form.secret_text} onChange={(e) => set('secret_text', e.target.value)} placeholder="写一句只想让 TA 解锁后看到的话" />
            <span className="cnt">{form.secret_text.length} / 120</span>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {REVEAL_TYPES.map((t) => (
              <button key={t.id} className={`pill${form.reveal_type === t.id ? ' on' : ''}`} onClick={() => set('reveal_type', t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="type-desc">{type?.desc}</div>
          {form.reveal_type === 'password' && (
            <input className="field glass" inputMode="numeric" maxLength={4} placeholder="约定的 4 位数字（纪念日）" value={form.pin} onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} />
          )}
          {form.reveal_type === 'timelock' && (
            <input className="field glass" type="datetime-local" value={form.unlockAt} onChange={(e) => set('unlockAt', e.target.value)} />
          )}
          <div className="glass col" style={{ borderRadius: 24, padding: 16, gap: 8 }} data-depth>
            <div className="h-sub row" style={{ gap: 6 }}><Svg name="lock" size={13} stroke={1.8} />你自己看到的是明文，TA 看到的是上锁版本</div>
            <Whisper row={preview} mine />
          </div>
        </section>

        <button className="btn rv" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>
      </div>
        <TabBar />
      {musicOpen && (
        <MusicModal
          userId={me.id} initial={form} say={say}
          onClose={() => setMusicOpen(false)}
          onSaved={(p) => setForm((f) => ({ ...f, ...p, music_title: p.music_title || '', music_url: p.music_url || '', music_source: p.music_source || 'link' }))}
        />
      )}
    </div>
  )
}