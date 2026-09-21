// アプリ全体で使う型。Google Places とホットペッパーの結果はどちらも Shop に正規化する

export interface LatLng { lat: number; lng: number }

export interface Photo { url: string; by: string }

export type Source = 'Google' | 'ホットペッパーグルメ';

export interface Shop {
  id: string;            // 'g:<placeId>' | 'hp:<shopId>'
  name: string;
  genre: string;
  lat: number;
  lng: number;
  dish: string;          // カードの「おすすめ」欄（名物が取れたら差し替わる）
  dishLabel: string;     // 'おすすめ' | '口コミ' | '名物'
  price: string;
  hours: string;         // 本日分の営業時間（短縮）
  photo: string;
  url: string;
  rating?: number;
  ratingCount?: number;
  dist: number;          // 検索中心からの距離（m）
  source: Source;
  openNow?: boolean;     // undefined = 不明
  smoking?: boolean;     // undefined = 不明
  reviews?: string[];    // 名物抽出の材料（Google のみ）
  editorial?: string;
  vibe?: string;
  // 詳細画面用
  photos?: Photo[];
  hoursAll?: string[];
  hoursNote?: string;
  address?: string;
  access?: string;
  tel?: string;
  site?: string;
  hpUrl?: string;
  placeId?: string;
  amenities?: string[];
}

export type DeleteReason = 'high' | 'far' | 'mood' | 'none';

export interface SavedShop extends Shop {
  at: number;            // 追加した時刻
  updatedAt?: number;    // 最後に変更した時刻（同期の勝敗に使う。無ければ at）
  reason?: DeleteReason;
  expires?: number | null;
}

export interface Settings { gkey: string; source: 'google' | 'hotpepper'; proxy: string; sbUrl?: string; sbKey?: string }

export interface Filters { open: boolean; near: boolean; smoke: boolean }

export interface HistoryEntry { name: string; lat: number; lng: number; at: number }

export interface Weather { rain: boolean; code?: number }

export interface DishInfo { dish: string; reason: string; vibe: string; at: number }

export interface Genre { label: string; g: string[]; hp: string; kw?: string }

export type View = 'find' | 'fav' | 'trash' | 'set';

export type SheetContext = 'queue' | 'fav' | 'trash';
