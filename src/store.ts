// お気に入り／削除管理の変更はここに集める（localStorage への保存と同期キューへの記録を必ず対にする）
import type { DeleteReason, SavedShop, Shop } from './types';
import { S, save } from './state';
import { enqueue } from './sync';
import { cachePhotos, uncachePhotos } from './pwa';
import { REASONS } from './taste';

export function addFav(it: Shop): SavedShop {
  const now = Date.now(), saved: SavedShop = { ...it, at: now, updatedAt: now };
  S.favs = [saved, ...S.favs.filter(x => x.id !== it.id)]; save('favs', S.favs);
  enqueue('fav', it.id, false, saved, now); cachePhotos(it);
  return saved;
}
export function removeFav(id: string): void {
  const it = S.favs.find(x => x.id === id);
  S.favs = S.favs.filter(x => x.id !== id); save('favs', S.favs);
  enqueue('fav', id, true); if (it) uncachePhotos(it);
}
export function addDeleted(it: Shop): SavedShop {
  const now = Date.now(), saved: SavedShop = { ...it, at: now, updatedAt: now, reason: 'none', expires: null };
  S.deleted = [saved, ...S.deleted.filter(x => x.id !== it.id)]; save('deleted', S.deleted);
  enqueue('deleted', it.id, false, saved, now);
  return saved;
}
export function removeDeleted(id: string): void {
  S.deleted = S.deleted.filter(x => x.id !== id); save('deleted', S.deleted);
  enqueue('deleted', id, true);
}
export function clearDeleted(): void {
  const ids = S.deleted.map(x => x.id);
  S.deleted = []; save('deleted', []);
  ids.forEach(id => enqueue('deleted', id, true));
}
export function setDeleteReason(id: string, k: DeleteReason): SavedShop | undefined {
  const it = S.deleted.find(x => x.id === id); if (!it) return undefined;
  const days = REASONS[k].days;
  it.reason = k; it.expires = days ? it.at + days * 864e5 : null; it.updatedAt = Date.now(); save('deleted', S.deleted);
  enqueue('deleted', id, false, it, it.updatedAt);
  return it;
}
// 「今の気分じゃない」の期限切れを削除管理から自動で外す（＝再び提案される）
export function restoreExpired(): void {
  const now = Date.now(), expired = S.deleted.filter(x => x.expires && x.expires <= now);
  if (!expired.length) return;
  S.deleted = S.deleted.filter(x => !expired.includes(x)); save('deleted', S.deleted);
  expired.forEach(x => enqueue('deleted', x.id, true));
}
