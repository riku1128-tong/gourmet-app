import { describe, expect, it } from 'vitest';
import { computeTaste, rankWith, scoreWith } from './taste';
import type { SavedShop, Shop } from './types';

const mk = (i: number, genre: string, price: string, dist: number): Shop => ({
  id: 'g:' + i, name: 'T' + i, genre, lat: 0, lng: 0, dish: '-', dishLabel: '口コミ', price, hours: '', photo: '', url: '', dist, source: 'Google'
});
const saved = (s: Shop, over: Partial<SavedShop> = {}): SavedShop => ({ ...s, at: 0, reason: 'none', expires: null, ...over });

describe('computeTaste / scoreWith', () => {
  it('履歴が無ければスコアは 0', () => {
    const t = computeTaste([], []);
    expect(t.n).toBe(0);
    expect(scoreWith(t, mk(1, '焼肉店', '¥1,000〜3,000', 200))).toBe(0);
  });
  it('お気に入りのジャンルは好み、削除したジャンルは苦手', () => {
    const t = computeTaste(
      [saved(mk(1, '焼肉店', '¥1,000〜3,000', 200)), saved(mk(2, '焼肉店', '¥1,000〜3,000', 300))],
      [saved(mk(3, 'ラーメン', '〜¥1,000', 250), { reason: 'none' })]);
    expect(scoreWith(t, mk(9, '焼肉店', '¥1,000〜3,000', 300))).toBeGreaterThan(0.9);
    expect(scoreWith(t, mk(9, 'ラーメン', '〜¥1,000', 300))).toBeLessThan(0);
  });
  it('「高い」は価格帯だけ、「遠い」は距離帯だけを減点する', () => {
    const t = computeTaste([], [saved(mk(1, '焼肉店', '¥8,000〜', 200), { reason: 'high' }), saved(mk(2, 'カフェ', '〜¥1,000', 900), { reason: 'far' })]);
    expect(t.price['¥8,000〜']).toBe(-1); expect(t.genre['焼肉店']).toBe(-0.3);
    expect(t.dist['far']).toBe(-1); expect(t.genre['カフェ']).toBe(0 || undefined);
  });
  it('価格帯不明は学習に使わない', () => {
    const t = computeTaste([saved(mk(1, '焼肉店', '価格帯 不明', 200))], []);
    expect(Object.keys(t.price)).toHaveLength(0);
  });
});

describe('rankWith', () => {
  it('履歴が無ければ近い順になる（乱数を固定）', () => {
    const t = computeTaste([], []);
    const list = [mk(1, 'a', '-', 900), mk(2, 'b', '-', 100), mk(3, 'c', '-', 500)];
    expect(rankWith(t, list, 1000, () => 0).map(x => x.id)).toEqual(['g:2', 'g:3', 'g:1']);
  });
  it('好みのジャンルは近さより優先されうる', () => {
    const p = '価格帯 不明'; // 価格帯と距離帯が学習に混ざらないようにする
    const t = computeTaste([saved(mk(0, '焼肉店', p, 400)), saved(mk(5, '焼肉店', p, 400)), saved(mk(6, '焼肉店', p, 400))], []);
    const list = [mk(1, 'カフェ', p, 100), mk(2, '焼肉店', p, 400)];
    expect(rankWith(t, list, 1000, () => 0)[0].id).toBe('g:2');
  });
});
