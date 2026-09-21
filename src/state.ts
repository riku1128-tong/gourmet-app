import type { DishInfo, Filters, Genre, HistoryEntry, LatLng, SavedShop, Settings, Shop, View, Weather } from './types';

// ---------- localStorage（キー名は単一 HTML 時代から互換） ----------
// テスト（node）でも import できるよう、ブラウザ API が無い環境では何もしない
const storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null;
const loc = typeof location !== 'undefined' ? location : { hostname: '', protocol: '', origin: '' };
export function LS<T>(k: string, d: T): T {
  try { return (JSON.parse(storage?.getItem('gourmet.' + k) ?? 'null') ?? d) as T; } catch { return d; }
}
export const save = (k: string, v: unknown): void => { storage?.setItem('gourmet.' + k, JSON.stringify(v)); };

export const PAGE = 3;       // 一度に表示する候補数（「さらに表示」で同数ずつ追加）
export const NEAR_M = 400;   // 「徒歩5分以内」= 80m/分 × 5
export const HISTORY_MAX = 8;

// サーバー（server.js）の既定 URL: ローカル配信なら同一オリジン、GitHub Pages なら Render、file:// なら固定ポート
export const PUBLIC_SERVER = 'https://gourmet-app-server.onrender.com';
export const ON_PAGES = /github\.io$/.test(loc.hostname);
export const DEFAULT_PROXY = ON_PAGES ? PUBLIC_SERVER : loc.protocol.startsWith('http') ? loc.origin : 'http://localhost:8797';

export interface AppState {
  settings: Settings;
  favs: SavedShop[];
  deleted: SavedShop[];
  center: LatLng;
  radius: number;
  genre: string;
  filters: Filters;
  weather: Weather | null;
  history: HistoryEntry[];
  results: Shop[];
  queue: Shop[];
  shown: number;
  view: View;
  locName: string;
}

export const S: AppState = {
  settings: LS<Settings>('settings', { gkey: '', source: 'google', proxy: '' }),
  favs: LS<SavedShop[]>('favs', []),
  deleted: LS<SavedShop[]>('deleted', []),
  center: LS<LatLng>('center', { lat: 35.6590, lng: 139.7006 }), // 渋谷駅
  radius: LS<number>('radius', 1000),
  genre: 'おまかせ',
  filters: LS<Filters>('filters', { open: false, near: false, smoke: false }),
  weather: null,
  history: LS<HistoryEntry[]>('history', []),
  results: [], queue: [], shown: PAGE, view: 'find', locName: '渋谷駅周辺'
};
if (!S.settings.proxy || S.settings.proxy === 'http://localhost:8787' || (ON_PAGES && S.settings.proxy === loc.origin)) S.settings.proxy = DEFAULT_PROXY;

// サーバーで使える機能（起動時の /api/status で判定）
export const SERVER = { checked: false, ok: false, hotpepper: false, dish: false };

// 名物の一皿の端末側キャッシュ
export const DISH: Record<string, DishInfo> = LS<Record<string, DishInfo>>('dish', {});

export const GENRES: Genre[] = [
  { label: 'おまかせ', g: ['restaurant'], hp: '' },
  { label: '和食', g: ['japanese_restaurant'], hp: 'G004' },
  { label: 'ラーメン', g: ['ramen_restaurant'], hp: 'G013' },
  { label: 'イタリアン', g: ['italian_restaurant'], hp: 'G006' },
  { label: '寿司', g: ['sushi_restaurant'], hp: 'G004', kw: '寿司' },
  { label: 'カフェ', g: ['cafe', 'coffee_shop'], hp: 'G014' },
  { label: '韓国料理', g: ['korean_restaurant'], hp: 'G017' },
  { label: '中華', g: ['chinese_restaurant'], hp: 'G007' },
  { label: '焼肉', g: ['barbecue_restaurant'], hp: 'G008' },
  { label: 'カレー', g: ['indian_restaurant'], hp: '', kw: 'カレー' },
  { label: '居酒屋', g: ['bar'], hp: 'G001' }
];

// ---------- DOM ユーティリティ ----------
export const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
  const e = document.querySelector<T>(sel);
  if (!e) throw new Error('要素が見つかりません: ' + sel);
  return e;
};
export const el = (tag: string, cls?: string | null, text?: string | null): HTMLElement => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
};
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(m: string): void {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}
