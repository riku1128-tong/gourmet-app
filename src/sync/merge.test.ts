import { describe, expect, it } from 'vitest';
import { mergeState, type SyncRow } from './merge';
import type { SavedShop } from '../types';

const shop = (id: string, at: number, over: Partial<SavedShop> = {}): SavedShop => ({
  id, name: id, genre: 'g', lat: 0, lng: 0, dish: '-', dishLabel: '口コミ', price: '-', hours: '', photo: '', url: '', dist: 100, source: 'Google', at, ...over
});
const row = (kind: 'fav' | 'deleted', id: string, updated_at: number, removed = false, data: SavedShop | null = shop(id, updated_at)): SyncRow => ({ kind, shop_id: id, data, removed, updated_at });

describe('mergeState', () => {
  it('サーバーが空なら端末の内容をそのまま送る', () => {
    const r = mergeState({ favs: [shop('a', 10)], deleted: [shop('b', 20, { reason: 'high' })] }, [], []);
    expect(r.favs.map(x => x.id)).toEqual(['a']); expect(r.deleted.map(x => x.id)).toEqual(['b']);
    expect(r.toPush.map(p => [p.kind, p.id, p.removed])).toEqual([['fav', 'a', false], ['deleted', 'b', false]]);
  });
  it('端末に無いサーバーの行は取り込み、送らない', () => {
    const r = mergeState({ favs: [], deleted: [] }, [], [row('fav', 'a', 10), row('deleted', 'b', 20)]);
    expect(r.favs.map(x => x.id)).toEqual(['a']); expect(r.deleted.map(x => x.id)).toEqual(['b']);
    expect(r.toPush).toEqual([]);
  });
  it('サーバーの墓標が新しければ端末から消える', () => {
    const r = mergeState({ favs: [shop('a', 10)], deleted: [] }, [], [row('fav', 'a', 30, true, null)]);
    expect(r.favs).toEqual([]); expect(r.toPush).toEqual([]);
  });
  it('端末の方が新しければサーバーの墓標を上書きして送る', () => {
    const r = mergeState({ favs: [shop('a', 50)], deleted: [] }, [], [row('fav', 'a', 30, true, null)]);
    expect(r.favs.map(x => x.id)).toEqual(['a']);
    expect(r.toPush).toEqual([{ kind: 'fav', id: 'a', removed: false, data: expect.objectContaining({ id: 'a' }), at: 50 }]);
  });
  it('未送信の削除は墓標として扱い、サーバーより新しければ送る', () => {
    const r = mergeState({ favs: [], deleted: [] }, [{ kind: 'fav', id: 'a', removed: true, at: 40 }], [row('fav', 'a', 10)]);
    expect(r.favs).toEqual([]);
    expect(r.toPush).toEqual([{ kind: 'fav', id: 'a', removed: true, data: undefined, at: 40 }]);
  });
  it('未送信の削除がサーバーより古ければサーバーが勝って復活する', () => {
    const r = mergeState({ favs: [], deleted: [] }, [{ kind: 'fav', id: 'a', removed: true, at: 5 }], [row('fav', 'a', 10)]);
    expect(r.favs.map(x => x.id)).toEqual(['a']); expect(r.toPush).toEqual([]);
  });
  it('同時刻はサーバーを優先して往復で揺れない', () => {
    const r = mergeState({ favs: [shop('a', 10, { name: 'mine' })], deleted: [] }, [], [row('fav', 'a', 10, false, shop('a', 10, { name: 'theirs' }))]);
    expect(r.favs[0].name).toBe('theirs'); expect(r.toPush).toEqual([]);
  });
  it('削除理由の更新（updatedAt）が新しければ送る', () => {
    const r = mergeState({ favs: [], deleted: [shop('b', 20, { reason: 'mood', updatedAt: 60 })] }, [], [row('deleted', 'b', 20)]);
    expect(r.deleted[0].reason).toBe('mood');
    expect(r.toPush[0]).toMatchObject({ kind: 'deleted', id: 'b', removed: false, at: 60 });
  });
  it('一覧は追加が新しい順', () => {
    const r = mergeState({ favs: [shop('old', 10), shop('new', 30)], deleted: [] }, [], []);
    expect(r.favs.map(x => x.id)).toEqual(['new', 'old']);
  });
});
