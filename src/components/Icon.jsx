// 先用内联线性图标；后续换成 Lordicon / Lottie 动态图标时，只需要改这个文件。
const PATHS = {
  mail: <><rect x="4" y="5" width="16" height="14" rx="3" /><path d="M4.5 7.5l7.5 6 7.5-6" /></>,
  pen: <path d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19z" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.2 1 2 2 2.2C11 8.5 11 5.5 12 3z" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  home: <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>,
  out: <path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H9" />,
  wave: <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 12V5a1.5 1.5 0 0 1 3 0v7M14 12V6.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2c-2.5 0-4-1-5.5-3L4 14.5a1.4 1.4 0 0 1 2-2L8 14" />,
}

export function Svg({ name, size = 22, stroke = 1.6 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

/* ---------- 状态图标（可选集合，存进数据库的是 id） ---------- */
export const STATUS_ICONS = [
  { id: 'coffee', label: '咖啡' },
  { id: 'moon', label: '夜晚' },
  { id: 'heart', label: '想你' },
  { id: 'code', label: '敲代码' },
  { id: 'bolt', label: '充电' },
  { id: 'music', label: '听歌' },
]

export function StatusIcon({ id, size = 30 }) {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
  }
  switch (id) {
    case 'moon': return <svg {...common}><path d={'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'} /></svg>
    case 'heart': return <svg {...common}><path d={'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'} /></svg>
    case 'code': return <svg {...common}><path d={'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12'} /></svg>
    case 'bolt': return <svg {...common}><path d={'M13 3L5 13h6l-1 8 8-10h-6z'} /></svg>
    case 'music': return <svg {...common}><path d={'M9 18V6l10-2v12'} /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></svg>
    case 'coffee':
    default:
      return (
        <svg {...common}>
          <path className="st" d="M8 2.5c-1 1 1 2 0 3.2" />
          <path className="st two" d="M12 2.5c-1 1 1 2 0 3.2" />
          <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
          <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
        </svg>
      )
  }
}

// id 要和 styles.css 里的 [data-deco='xxx'] 对上：cat-ears / halo / orbit / pixel / polaroid
export const DECORATIONS = [
  { id: 'none', label: '无' },
  { id: 'cat-ears', label: '猫耳' },
  { id: 'halo', label: '光环' },
  { id: 'orbit', label: '轨道' },
  { id: 'pixel', label: '像素框' },
  { id: 'polaroid', label: '拍立得' },
]