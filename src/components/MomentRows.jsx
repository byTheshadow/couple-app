// 此刻.txt 的内容区：心情图标 + 一句话，再加用户自己写的装饰小字。
// 主页（TA 的此刻）和编辑页（预览）共用这一个组件，两边永远长一样。
export default function MomentRows({ mood, moodText, rows = [], emptyText }) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && r.v) : []
  const empty = !mood && !moodText && list.length === 0
  if (empty) return <div className="wb h-sub">{emptyText || '还没写下此刻'}</div>
  return (
    <>
      {(mood || moodText) && (
        <div className="kv moment-main">
          <span className="moment-emoji">{mood || '·'}</span>
          <span className="v">{moodText || '（没写话，只留了心情）'}</span>
        </div>
      )}
      {list.map((r, i) => (
        <div key={i} className="kv"><span className="k">{r.k || '·'}</span><span className="v">{r.v}</span></div>
      ))}
    </>
  )
}