import { describe, expect, it } from 'vitest';
import { normalizeHotPepperShop, rangeOf, sameShop, smokingOf, type HpShop } from './hotpepper';

const center = { lat: 35.6, lng: 139.7 };
const shop: HpShop = {
  id: 'J001', name: '焼肉苑　溝口店', lat: '35.6005', lng: '139.7005',
  genre: { name: '焼肉・ホルモン', catch: 'ジャンルのキャッチ' }, catch: '厚切りタン塩が自慢', budget: { name: '3001～4000円' },
  open: '月～日、祝日、祝前日: 17:00～23:00 （料理L.O. 22:30）', close: '年中無休', address: '神奈川県川崎市高津区溝口1-1-1', access: 'JR武蔵溝ノ口駅 徒歩3分',
  photo: { pc: { l: 'https://hp/pc.jpg' }, mobile: { l: 'https://hp/m.jpg' } }, urls: { pc: 'https://www.hotpepper.jp/strJ001/' },
  non_smoking: '一部禁煙', private_room: 'あり', card: '利用可', parking: 'なし', wifi: 'あり', lunch: 'なし', midnight: '営業していない', free_drink: 'あり'
};

describe('normalizeHotPepperShop', () => {
  it('共通スキーマに正規化する', () => {
    const s = normalizeHotPepperShop(shop, center);
    expect(s.id).toBe('hp:J001'); expect(s.source).toBe('ホットペッパーグルメ');
    expect(s.dish).toBe('厚切りタン塩が自慢'); expect(s.dishLabel).toBe('おすすめ');
    expect(s.price).toBe('3001～4000円');
    expect(s.hours).toBe('月～日、祝日、祝前日: 17:00～23:00 ');
    expect(s.hoursNote).toBe('定休日: 年中無休');
    expect(s.photo).toBe('https://hp/m.jpg'); expect(s.photos).toEqual([{ url: 'https://hp/pc.jpg', by: '' }]);
    expect(s.smoking).toBe(true); expect(s.openNow).toBeUndefined();
    expect(s.amenities).toEqual(['個室あり', 'カード可', 'Wi-Fi', '飲み放題']);
    expect(s.access).toBe('JR武蔵溝ノ口駅 徒歩3分');
    expect(s.dist).toBeLessThan(100);
  });
  it('キャッチが無ければジャンルのキャッチ、それも無ければ情報なし', () => {
    expect(normalizeHotPepperShop({ ...shop, catch: '' }, center).dish).toBe('ジャンルのキャッチ');
    expect(normalizeHotPepperShop({ ...shop, catch: '', genre: { name: 'x' } }, center).dish).toBe('情報なし');
  });
});

describe('smokingOf', () => {
  it('全面禁煙は false、一部禁煙／禁煙席なしは true、それ以外は不明', () => {
    expect(smokingOf({ ...shop, non_smoking: '全面禁煙' })).toBe(false);
    expect(smokingOf({ ...shop, non_smoking: '禁煙席なし' })).toBe(true);
    expect(smokingOf({ ...shop, non_smoking: '' })).toBeUndefined();
    expect(smokingOf({ ...shop, non_smoking: undefined })).toBeUndefined();
  });
});

describe('rangeOf', () => {
  it('半径を API の range に丸める', () => {
    expect(rangeOf(300)).toBe(1); expect(rangeOf(500)).toBe(2); expect(rangeOf(1000)).toBe(3); expect(rangeOf(2000)).toBe(4); expect(rangeOf(5000)).toBe(5);
  });
});

describe('sameShop', () => {
  const g = { name: '焼肉苑 溝口店', lat: 35.6, lng: 139.7 };
  it('80m 以内で店名の先頭が一致すれば同一店', () => {
    expect(sameShop(g, { name: '焼肉苑　溝口店', lat: 35.6003, lng: 139.7 })).toBe(true);
  });
  it('遠ければ別の店', () => {
    expect(sameShop(g, { name: '焼肉苑 溝口店', lat: 35.603, lng: 139.7 })).toBe(false);
  });
  it('名前が違えば別の店', () => {
    expect(sameShop(g, { name: 'スターバックス', lat: 35.6, lng: 139.7 })).toBe(false);
  });
});
