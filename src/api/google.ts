// Google Places API (New) の周辺検索。正規化は純関数にしてテスト可能にする
import type { Genre, LatLng, Shop } from '../types';
import { S } from '../state';
import { distanceM } from '../geo';
import { enrichFromHotPepper } from './hotpepper';
import { applyCachedDish } from './server';

export const PRICE: Record<string, string> = { FREE: '無料', INEXPENSIVE: '〜¥1,000', MODERATE: '¥1,000〜3,000', EXPENSIVE: '¥3,000〜8,000', VERY_EXPENSIVE: '¥8,000〜' };

// 「おまかせ」で追加するランダムタイプの候補（Places の Table A に存在する飲食系タイプ）
export const OMAKASE_TYPES = ['japanese_restaurant', 'ramen_restaurant', 'italian_restaurant', 'sushi_restaurant', 'cafe', 'korean_restaurant', 'chinese_restaurant', 'barbecue_restaurant', 'indian_restaurant', 'french_restaurant', 'thai_restaurant', 'hamburger_restaurant', 'pizza_restaurant', 'seafood_restaurant', 'steak_house', 'bakery', 'vietnamese_restaurant', 'mexican_restaurant'];
export const MAX_GOOGLE_REQUESTS = 4; // 1 検索あたりの Nearby Search 回数上限（課金対策）

export function shuffle<T>(a: T[], rnd: () => number = Math.random): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export interface NearbyReq { types: string[]; rank: 'POPULARITY' | 'DISTANCE' }
// 周辺検索は 1 回 20 件が上限。条件を変えた複数リクエストを並列に投げて重複除去する
export function buildGoogleRequests(gen: Genre, rnd: () => number = Math.random): NearbyReq[] {
  const reqs: NearbyReq[] = [{ types: gen.g, rank: 'POPULARITY' }, { types: gen.g, rank: 'DISTANCE' }];
  if (gen.label === 'おまかせ') shuffle([...OMAKASE_TYPES], rnd).slice(0, 2).forEach(t => reqs.push({ types: [t], rank: 'POPULARITY' }));
  return reqs.slice(0, MAX_GOOGLE_REQUESTS);
}

// 正規化に必要な Place の項目だけを表す（テストではプレーンオブジェクトを渡せる）
export interface PlaceLike {
  id: string; displayName?: string | null; primaryTypeDisplayName?: string | null;
  location?: { lat(): number; lng(): number } | null;
  priceLevel?: string | null; rating?: number | null; userRatingCount?: number | null;
  editorialSummary?: string | null; reviews?: { text?: string | null }[] | null;
  regularOpeningHours?: { weekdayDescriptions?: string[] } | null;
  photos?: { getURI(o: { maxWidth: number }): string; authorAttributions?: { displayName?: string }[] }[] | null;
  googleMapsURI?: string | null; formattedAddress?: string | null; nationalPhoneNumber?: string | null; websiteURI?: string | null;
  isReservable?: boolean | null; hasDineIn?: boolean | null; hasTakeout?: boolean | null; hasOutdoorSeating?: boolean | null;
}

export function normalizeGooglePlace(p: PlaceLike, center: LatLng, openNow: boolean | undefined, today: number): Shop {
  const lat = p.location?.lat() ?? 0, lng = p.location?.lng() ?? 0;
  const rev = p.reviews?.[0]?.text || '';
  return {
    id: 'g:' + p.id, name: p.displayName || '', genre: p.primaryTypeDisplayName || 'レストラン', lat, lng,
    dish: p.editorialSummary ? p.editorialSummary : (rev ? '口コミ「' + rev.replace(/\s+/g, ' ').slice(0, 42) + (rev.length > 42 ? '…' : '') + '」' : '情報なし'),
    dishLabel: p.editorialSummary ? 'おすすめ' : '口コミ',
    price: PRICE[p.priceLevel || ''] || '価格帯 不明',
    hours: p.regularOpeningHours?.weekdayDescriptions?.[today]?.replace(/^[^:：]+[:：]\s*/, '本日 ') || '',
    photo: p.photos?.[0]?.getURI({ maxWidth: 800 }) || '', url: p.googleMapsURI || '',
    rating: p.rating ?? undefined, ratingCount: p.userRatingCount ?? undefined,
    openNow, smoking: undefined, // smoking はホットペッパー突き合わせで付与
    reviews: (p.reviews || []).map(r => r.text || '').filter(Boolean).slice(0, 5), editorial: p.editorialSummary || '', // 名物抽出の材料
    // 詳細画面用（写真は最大 6 枚。URI は取得時に確定させる）
    photos: (p.photos || []).slice(0, 6).map(ph => ({ url: ph.getURI({ maxWidth: 800 }), by: ph.authorAttributions?.[0]?.displayName || '' })),
    hoursAll: p.regularOpeningHours?.weekdayDescriptions || [], address: p.formattedAddress || '', tel: p.nationalPhoneNumber || '', site: p.websiteURI || '', placeId: p.id,
    amenities: [p.isReservable && '予約可', p.hasDineIn && '店内飲食', p.hasTakeout && 'テイクアウト', p.hasOutdoorSeating && 'テラス席'].filter((x): x is string => !!x),
    dist: distanceM(center, { lat, lng }), source: 'Google'
  };
}

// reviews を含む時点で Enterprise + Atmosphere SKU なので、住所・電話・サイト・設備を足しても課金は変わらない
const FIELDS = ['id', 'displayName', 'location', 'primaryTypeDisplayName', 'priceLevel', 'rating', 'userRatingCount', 'photos', 'editorialSummary', 'reviews', 'regularOpeningHours', 'utcOffsetMinutes', 'businessStatus', 'googleMapsURI',
  'formattedAddress', 'nationalPhoneNumber', 'websiteURI', 'isReservable', 'hasTakeout', 'hasDineIn', 'hasOutdoorSeating'];

export async function searchGoogle(gen: Genre): Promise<Shop[]> {
  const { Place, SearchNearbyRankPreference } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
  const base = { fields: FIELDS, locationRestriction: { center: S.center, radius: S.radius }, maxResultCount: 20, language: 'ja', region: 'jp' };
  const settled = await Promise.allSettled(buildGoogleRequests(gen).map(r =>
    Place.searchNearby({ ...base, includedPrimaryTypes: r.types, rankPreference: SearchNearbyRankPreference[r.rank] })));
  const ok = settled.filter((r): r is PromiseFulfilledResult<{ places: google.maps.places.Place[] }> => r.status === 'fulfilled');
  if (!ok.length) throw (settled[0] as PromiseRejectedResult).reason;
  settled.filter(r => r.status === 'rejected').forEach(r => console.warn('Nearby Search 一部失敗', (r as PromiseRejectedResult).reason));
  const seen = new Set<string>(); let places: google.maps.places.Place[] = [];
  ok.forEach(r => (r.value.places || []).forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); places.push(p); } }));
  const kw = gen.kw;
  if (kw) places = places.filter(p => (p.displayName || '').includes(kw) || (p.primaryTypeDisplayName || '').includes(kw)).concat(places.filter(p => !(p.displayName || '').includes(kw)));
  const today = (new Date().getDay() + 6) % 7; // weekdayDescriptions は月曜始まり
  // 営業中判定は Place.isOpen()（regularOpeningHours + utcOffsetMinutes からクライアント側で計算。追加課金なし）
  const openFlags = await Promise.all(places.map(async p => {
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') return false;
    try { return await p.isOpen(); } catch { return undefined; }
  }));
  const items = places.map((p, i) => normalizeGooglePlace(p as unknown as PlaceLike, S.center, openFlags[i], today));
  await enrichFromHotPepper(items);
  items.forEach(applyCachedDish);
  return items;
}
