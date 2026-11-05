/* 梦海兔 · 鱼图鉴数据（24 种）。纯数据，不 import 任何东西。
   shape: oval / round / koi / jelly / paper / crescent
   r: 1 普通（1 段）/ 2 少见（2 段）/ 3 传说（3 段）
   tip: 没钓到时给的出现提示 */
export const SLEEP_FISH = [
  { k: 'lantern', n: '灯笼鱼', r: 2, shape: 'oval', body: '#3a4c9a', tail: '#26346e', fin: '#6f7fd0', eye: '#fdf8ee', tip: '雨夜的海面' },
  { k: 'moon', n: '月光鱼', r: 2, shape: 'oval', body: '#cfd8e6', tail: '#9aa8bc', fin: '#e8eef8', eye: '#333b48', spot: '#fdfcf4', tip: '月亮升到最高的时候' },
  { k: 'clown', n: '小丑鱼', r: 1, shape: 'oval', body: '#f08c3c', tail: '#e07828', fin: '#f08c3c', eye: '#2a1c16', bands: true, tip: '船边就有' },
  { k: 'koi', n: '锦鲤', r: 3, shape: 'koi', body: '#f8f0dc', tail: '#e87850', eye: '#3a2a22', patches: true, tip: '和 TA 一起看海' },
  { k: 'star', n: '星星鱼', r: 2, shape: 'oval', body: '#343c70', tail: '#222850', fin: '#5a64a8', eye: '#fdf8ee', spots: true, tip: '流星划过之后' },
  { k: 'puffer', n: '泡泡鱼', r: 2, shape: 'round', body: '#f4aa60', tail: '#e08848', eye: '#3a2418', tip: '海面冒泡的时候' },
  { k: 'jelly', n: '水母', r: 1, shape: 'jelly', body: '#f59ec6', tail: '#ffc4dc', eye: '#5a3a4a', tip: '浅水区' },
  { k: 'paper', n: '纸船鱼', r: 1, shape: 'paper', body: '#ece2c6', tail: '#d8c8a4', eye: '#4a3a2c', tip: '像一张折起来的纸' },
  { k: 'ribbon', n: '缎带鱼', r: 2, shape: 'koi', body: '#7fd0c0', tail: '#50a894', eye: '#1e3a34', tip: '水草边上' },
  { k: 'cloud', n: '云朵鱼', r: 1, shape: 'oval', body: '#eef2f8', tail: '#c8d2e0', fin: '#fdf8ee', eye: '#5a6474', tip: '没有星星的晚上' },
  { k: 'ember', n: '炭火鱼', r: 2, shape: 'oval', body: '#d06050', tail: '#a04038', fin: '#e88070', eye: '#fdf8ee', tip: '船灯最亮的时候' },
  { k: 'leaf', n: '叶子鱼', r: 1, shape: 'oval', body: '#7fb070', tail: '#508850', fin: '#a8d098', eye: '#243a24', tip: '海面漂着叶子' },
  { k: 'shell', n: '贝壳鱼', r: 2, shape: 'round', body: '#e8c8a8', tail: '#c8a080', eye: '#4a3224', tip: '退潮的梦海' },
  { k: 'ink', n: '墨鱼', r: 2, shape: 'oval', body: '#4a4460', tail: '#2e2a40', fin: '#6a6488', eye: '#fdf8ee', tip: '很安静的晚上' },
  { k: 'glass', n: '玻璃鱼', r: 3, shape: 'crescent', body: '#b8e0e8', tail: '#88b8c8', eye: '#2a4a52', tip: '第 3 个晚上' },
  { k: 'pearl', n: '珍珠鱼', r: 3, shape: 'round', body: '#f8f0e0', tail: '#e0d0b0', eye: '#4a4030', tip: '月亮很圆的时候' },
  { k: 'moss', n: '青苔鱼', r: 1, shape: 'oval', body: '#6a8a50', tail: '#486838', fin: '#8aaa70', eye: '#243018', tip: '船底蹭到水草' },
  { k: 'coral', n: '珊瑚鱼', r: 2, shape: 'koi', body: '#f08070', tail: '#d05050', eye: '#3a1e1e', tip: '梦海天气：珊瑚' },
  { k: 'lantern2', n: '深海灯', r: 3, shape: 'oval', body: '#d8b060', tail: '#a88040', fin: '#f0d090', eye: '#fdf8ee', tip: '钓到 10 条以后' },
  { k: 'dream', n: '梦话鱼', r: 2, shape: 'jelly', body: '#b8a0e0', tail: '#d8c8f0', eye: '#3a2e50', tip: '说梦话的时候' },
  { k: 'paper2', n: '信纸鱼', r: 2, shape: 'paper', body: '#f0e0c0', tail: '#d8c090', eye: '#4a3a2c', tip: '把烦恼交给兔兔以后' },
  { k: 'star2', n: '星屑鱼', r: 3, shape: 'oval', body: '#6a5ac0', tail: '#443a90', fin: '#9080e0', eye: '#fdf8ee', spots: true, tip: '连续第 3 晚' },
  { k: 'moon2', n: '残月鱼', r: 2, shape: 'crescent', body: '#e8e0c8', tail: '#c8c0a0', eye: '#4a4430', tip: '月底的晚上' },
  { k: 'deep', n: '深海鱼', r: 3, shape: 'oval', body: '#2a3050', tail: '#1a2038', fin: '#4a5480', eye: '#fdf8ee', tip: '很晚很晚的时候' },
]
export const FISH_BY_KEY = Object.fromEntries(SLEEP_FISH.map((f) => [f.k, f]))
export const FISH_COUNT = SLEEP_FISH.length