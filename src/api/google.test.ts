import { describe, expect, it } from 'vitest';
import { buildGoogleRequests, normalizeGooglePlace, type PlaceLike } from './google';

const center = { lat: 35.6, lng: 139.7 };
const place = (over: Partial<PlaceLike> = {}): PlaceLike => ({
  id: 'ChIJ1', displayName: '焼肉苑 溝口店', primaryTypeDisplayName: '焼肉店',
  location: { lat: () => 35.601, lng: () => 139.701 },
  priceLevel: 'MODERATE', rating: 4.3, userRatingCount: 212,
  reviews: [{ text: '平日夜20時頃に訪れました。席の空きがあり、すぐ着席できました。タン塩が最高でした。ハラミも柔らかくて量も十分です。' }, { text: 'ハラミも良い' }],
  regularOpeningHours: { weekdayDescriptions: ['月曜日: 11時00分～22時30分', '火曜日: 定休日', '水曜日: 11時00分～22時30分', '木曜日: 11時00分～22時30分', '金曜日: 11時00分～23時00分', '土曜日: 11時00分～23時00分', '日曜日: 11時00分～22時30分'] },
  photos: [{ getURI: () => 'https://img/1', authorAttributions: [{ displayName: 'Taro' }] }, { getURI: () => 'https://img/2' }],
  googleMapsURI: 'https://maps.google.com/?cid=1', formattedAddress: '神奈川県川崎市高津区溝口1-1-1', nationalPhoneNumber: '044-123-4567', websiteURI: 'https://example.com',
  isReservable: true, hasDineIn: true, hasTakeout: false, hasOutdoorSeating: null,
  ...over
});

describe('normalizeGooglePlace', () => {
  it('共通スキーマに正規化する', () => {
    const s = normalizeGooglePlace(place(), center, true, 0);
    expect(s.id).toBe('g:ChIJ1');
    expect(s.source).toBe('Google');
    expect(s.price).toBe('¥1,000〜3,000');
    expect(s.dishLabel).toBe('口コミ');
    expect(s.dish.startsWith('口コミ「平日夜20時頃')).toBe(true);
    expect(s.dish.endsWith('…」')).toBe(true);
    expect(s.hours).toBe('本日 11時00分～22時30分');
    expect(s.hoursAll).toHaveLength(7);
    expect(s.photo).toBe('https://img/1');
    expect(s.photos).toEqual([{ url: 'https://img/1', by: 'Taro' }, { url: 'https://img/2', by: '' }]);
    expect(s.amenities).toEqual(['予約可', '店内飲食']);
    expect(s.openNow).toBe(true);
    expect(s.smoking).toBeUndefined();
    expect(s.reviews).toHaveLength(2);
    expect(s.dist).toBeGreaterThan(100); expect(s.dist).toBeLessThan(200);
    expect(s.tel).toBe('044-123-4567'); expect(s.placeId).toBe('ChIJ1');
  });
  it('editorialSummary があれば「おすすめ」になり、priceLevel が無ければ不明', () => {
    const s = normalizeGooglePlace(place({ editorialSummary: '地元で人気の焼肉店', priceLevel: null }), center, undefined, 3);
    expect(s.dishLabel).toBe('おすすめ');
    expect(s.dish).toBe('地元で人気の焼肉店');
    expect(s.price).toBe('価格帯 不明');
    expect(s.hours).toBe('本日 11時00分～22時30分');
  });
  it('項目が欠けていても落ちない', () => {
    const s = normalizeGooglePlace({ id: 'x' }, center, undefined, 0);
    expect(s.name).toBe(''); expect(s.genre).toBe('レストラン'); expect(s.dish).toBe('情報なし');
    expect(s.photos).toEqual([]); expect(s.amenities).toEqual([]); expect(s.hours).toBe('');
  });
});

describe('buildGoogleRequests', () => {
  const gen = { label: 'ラーメン', g: ['ramen_restaurant'], hp: 'G013' };
  it('ジャンル指定は人気順＋距離順の 2 本', () => {
    expect(buildGoogleRequests(gen)).toEqual([{ types: ['ramen_restaurant'], rank: 'POPULARITY' }, { types: ['ramen_restaurant'], rank: 'DISTANCE' }]);
  });
  it('おまかせはランダム 2 タイプを足して最大 4 本', () => {
    const reqs = buildGoogleRequests({ label: 'おまかせ', g: ['restaurant'], hp: '' }, () => 0);
    expect(reqs).toHaveLength(4);
    expect(reqs[2].types).toHaveLength(1);
    expect(reqs[2].types[0]).not.toBe('restaurant');
  });
});
