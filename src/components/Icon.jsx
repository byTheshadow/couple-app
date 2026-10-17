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
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <><rect x="7" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></>,
  note: <><circle cx="7" cy="18" r="2.6" /><circle cx="17" cy="16" r="2.6" /><path d="M9.6 18V5.5L19.6 4v12" /></>,
  camera: <><path d="M4 8.5a2 2 0 0 1 2-2h1.6l1-1.6a1.5 1.5 0 0 1 1.3-.7h4.2a1.5 1.5 0 0 1 1.3.7l1 1.6H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.6" /></>,
  check: <path d="M5 13l4.5 4.5L19 8" />,
  wave: <path d="M3 15c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />,
  doc: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></>,
   cup: <><path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 11h1.4a2.4 2.4 0 0 1 0 4.8H16" /></>,
  globe: <><circle cx="12" cy="10.5" r="6.5" /><path d="M6.5 20.5h11M8.4 16.2L7.3 20.5M15.6 16.2l1.1 4.3" /><path d="M9 8c.7-1.2 1.8-1.9 3.2-2.1" /></>,
  film: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M8 5v14M16 5v14M3 9h5M3 15h5M16 9h5M16 15h5" /></>,
  phones: <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.5M15 9.5v.5" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  // 聊天页用的图标
  chat: <path d="M5 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4 4v-4H7a2 2 0 0 1-2-2z" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  reply: <path d="M9 14L4 9l5-5M4 9h9a7 7 0 0 1 7 7v1" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>,
  undo: <path d="M8 5L4 9l4 4M4 9h9a6 6 0 0 1 0 12H9" />,
  // 涂鸦画板 / 小物页用的图标
  redo: <path d="M16 5l4 4-4 4M20 9h-9a6 6 0 0 0 0 12h4" />,
  marker: <><path d="M13 4.5l6.5 6.5-7.5 7.5L6 19l-.5-5.5z" /><path d="M4 21.5h8" /></>,
  eraser: <g transform="rotate(-45 12 12)"><rect x="3.5" y="8.5" width="17" height="9" rx="2.2" /><path d="M11 8.5v9" /></g>,
  back: <path d="M15 5l-7 7 7 7" />,
  send: <><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>,
  trash: <><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>,
  drawer: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M4 12h16M10 8h4M10 16h4" /></>,
  // 以下三个是「戳一戳」新增动作用的图标：抱一抱 / 亲一口 / 揍一拳
  hug: <><path d="M4 15c0-5 3.5-9 8-9s8 4 8 9" /><path d="M7 15a5 5 0 0 1 10 0" /></>,
  kiss: <path d="M4 12c2-3 4-3 5 0 .7-2 2-2 3 0 1-2 2.3-2 3 0 1.3-2 3-2 5 0" />,
  fist: <><rect x="6" y="9" width="12" height="9" rx="3" /><path d="M9 9V6a1.5 1.5 0 0 1 3 0v1M12 9V5.5a1.5 1.5 0 0 1 3 0V9M15 9.5V7a1.5 1.5 0 0 1 3 0v2.5" /></>,
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
  { id: 'work', label: '工作中' },
  { id: 'sport', label: '运动中' },
  { id: 'blank', label: '放空中' },
  { id: 'rest', label: '休息' },
  { id: 'drama', label: '看剧' },
  { id: 'outside', label: '出门' },
  { id: 'fish', label: '摸鱼' },
  { id: 'busy', label: '忙碌' },
  { id: 'draw', label: '画画' },
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
    case 'work': return <svg {...common}><rect x="4" y="8" width="16" height="11" rx="2" /><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M4 13h16" /></svg>
    case 'sport': return <svg {...common}><rect x="2" y="10" width="3" height="4" rx="1" /><rect x="19" y="10" width="3" height="4" rx="1" /><rect x="6" y="9" width="2.4" height="6" rx="1" /><rect x="15.6" y="9" width="2.4" height="6" rx="1" /><path d="M8.4 12h7.2" /></svg>
    case 'blank': return <svg {...common}><path d="M7 17a4 4 0 0 1 .3-8 5 5 0 0 1 9.6 1.2A3.5 3.5 0 0 1 16.5 17z" /></svg>
    case 'rest': return <svg {...common}><rect x="3" y="15" width="18" height="4" rx="1.5" /><path d="M3 15v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" /><path d="M21 15v-2a2 2 0 0 0-2-2h-4" /></svg>
    case 'drama': return <svg {...common}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 20h8" /><path d="M12 17v3" /></svg>
    case 'outside': return <svg {...common}><path d="M10 17l5-5-5-5" /><path d="M4 12h11" /><path d="M19 4v16" /></svg>
    case 'fish': return <svg {...common}><path d="M3 12c3-4 9-6 13-3 2 1.5 2 4.5 0 6-4 3-10 1-13-3z" /><path d="M16 9l4-2v10l-4-2" /></svg>
    case 'busy': return <svg {...common}><path d="M6 3h12M6 21h12M7 3c0 6 5 6.5 5 9s-5 3-5 9M17 3c0 6-5 6.5-5 9s5 3 5 9" /></svg>
    case 'draw': return <svg {...common}><path d="M4 20c0-3 1-5 3-5s3 2 3 5" /><path d="M10 15L19 6a2 2 0 0 0-3-3L7 12" /><path d="M7 12l3 3" /></svg>
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

// 名片背景色板：id 要和 styles.css 里的 [data-cardbg='xxx'] 对上。
// 对双方都可见——同一个值同时应用在「我的卡」和 TA 看到的「TA 此刻」工牌上。
export const CARD_BGS = [
  { id: 'none', label: '默认' },
  { id: 'peach', label: '蜜桃' },
  { id: 'mint', label: '薄荷' },
  { id: 'lavender', label: '薰衣草' },
  { id: 'sky', label: '天空' },
  { id: 'rose', label: '玫瑰' },
  { id: 'sunset', label: '日落' },
  { id: 'ocean', label: '深海' },
  { id: 'forest', label: '森林' },
  { id: 'gold', label: '香槟金' },
  { id: 'noir', label: '暗夜' },
]

// 心情 / 小图标，直接存 emoji 字符，不用 id 对照。
// 想加新的：在对应分类的 items 里加一个 emoji 就行；想加新分类：复制一组，改 id 和 label。
export const MOOD_GROUPS = [
  { id: 'face', label: '心情', items: ['😊', '🥰', '😴', '😭', '😤', '🥳', '😶', '🤒', '😂', '😍', '🤔', '😅', '🙃', '😡', '🥹', '🤗', '😬', '🥲', '😌', '😎', '🥺', '😮‍💨', '😵‍💫', '🤩', '😏', '😇', '🫠', '🥱', '😋', '🤤'] },
  { id: 'love', label: '爱意', items: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '😘', '💌', '💋', '🫶', '🤝', '🌹', '💍', '✨', '🫂'] },
  { id: 'food', label: '吃喝', items: ['☕', '🧋', '🍵', '🍜', '🍚', '🍣', '🍕', '🍔', '🍟', '🍰', '🍩', '🍪', '🍫', '🍓', '🍉', '🍎', '🍦', '🍺', '🥂', '🍳'] },
  { id: 'sky', label: '天气', items: ['☀️', '🌤️', '⛅', '☁️', '🌧️', '⛈️', '❄️', '🌈', '🌙', '⭐', '🌟', '💫', '🌸', '🍃', '🍂', '🔥', '💧', '🌊'] },
  { id: 'pet', label: '动物', items: ['🐱', '🐶', '🐰', '🐻', '🐼', '🐨', '🐹', '🦊', '🐷', '🐸', '🐧', '🐥', '🦋', '🐟', '🐙', '🦄', '🐢', '🐑'] },
  { id: 'life', label: '日常', items: ['💤', '🎧', '🎮', '📚', '💻', '🎬', '🎨', '✏️', '📷', '🛁', '🛏️', '🚗', '🚇', '✈️', '🏠', '💪', '🏃', '🧘', '🛒', '🎁', '🎂', '🎉', '🔋', '🪫', '📞', '🧸', '🕯️', '🎵'] },
]

// 旧名字保留（所有 emoji 平铺成一个数组），别处如果还在用 MOODS 不会坏
export const MOODS = MOOD_GROUPS.flatMap((g) => g.items)