// 店舗詳細のボトムシート
import type { Shop, SheetContext } from '../types';
import { $, DISH, S, el, save, toast } from '../state';
import { fmtDist, walk } from '../geo';
import { panTo } from '../maps';
import { ICON_HEART, ICON_LINK, ICON_PHONE, ICON_ROUTE, ICON_TRASH } from './icons';
import { act } from './deck';
import { renderLists } from './lists';
import { refresh } from '../search';

let sheetItem: Shop | null = null, sheetCtx: SheetContext = 'queue';

export function routeURL(it: Pick<Shop, 'lat' | 'lng' | 'placeId'>): string {
  const u = new URL('https://www.google.com/maps/dir/?api=1');
  u.searchParams.set('destination', it.lat + ',' + it.lng); u.searchParams.set('travelmode', 'walking');
  if (it.placeId) u.searchParams.set('destination_place_id', it.placeId);
  return u.toString();
}

export function openSheet(it: Shop, ctx: SheetContext = 'queue'): void {
  sheetItem = it; sheetCtx = ctx; renderSheet();
  $('#sheet').classList.add('on'); $('#sheetBd').classList.add('on'); $('#sheetBody').scrollTop = 0;
  panTo({ lat: it.lat, lng: it.lng });
}
export function closeSheet(): void { $('#sheet').classList.remove('on'); $('#sheetBd').classList.remove('on'); sheetItem = null; }

function renderSheet(): void {
  const it = sheetItem; if (!it) return;
  const b = $('#sheetBody'), f = $('#sheetFoot'); b.innerHTML = ''; f.innerHTML = '';
  // 写真ギャラリー
  const photos = it.photos?.length ? it.photos : (it.photo ? [{ url: it.photo, by: '' }] : []);
  if (photos.length) {
    const g = el('div', 'gallery');
    photos.forEach(p => {
      const fg = el('figure'); const im = el('img') as HTMLImageElement; im.src = p.url; im.alt = it.name; im.loading = 'lazy'; fg.appendChild(im);
      if (p.by) fg.appendChild(el('figcaption', null, '写真: ' + p.by)); g.appendChild(fg);
    });
    b.appendChild(g);
  }
  // 見出し
  const head = el('div'); head.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  head.appendChild(el('h2', null, it.name));
  const sub = el('div', 'sub2');
  [it.genre, it.rating ? '★' + it.rating + (it.ratingCount ? '（' + it.ratingCount + '件）' : '') : '', '予算 ' + it.price, fmtDist(it.dist) + '・徒歩 約' + walk(it.dist) + '分',
    it.openNow === true ? '営業中' : it.openNow === false ? '営業時間外' : '', it.smoking === true ? '喫煙可' : it.smoking === false ? '禁煙' : '', it.source]
    .filter(Boolean).forEach(t => sub.appendChild(el('span', null, t)));
  head.appendChild(sub); b.appendChild(head);
  // 名物／おすすめ
  const d = DISH[it.id];
  const hl = el('div', 'hl');
  if (d?.dish) { hl.appendChild(el('span', 't', '名物の一皿')); hl.appendChild(el('span', 'd', d.dish)); if (d.reason) hl.appendChild(el('span', 'r', d.reason)); }
  else { hl.appendChild(el('span', 't', it.dishLabel || 'おすすめ')); hl.appendChild(el('span', 'r', it.dish || '情報なし')); }
  if (d?.vibe) hl.appendChild(el('span', 'vibe', d.vibe));
  b.appendChild(hl);
  // 設備
  if (it.amenities?.length) { const a = el('div', 'amen'); it.amenities.forEach(t => a.appendChild(el('span', null, t))); b.appendChild(a); }
  // 行動ボタン（経路・電話・サイト・元ページ）
  const acts = el('div', 'acts');
  const link = (href: string, html: string, text: string, cls?: string) => {
    const a = el('a', cls) as HTMLAnchorElement; a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.innerHTML = html; a.appendChild(document.createTextNode(text)); return a;
  };
  acts.appendChild(link(routeURL(it), ICON_ROUTE, '経路（徒歩）', 'go'));
  if (it.tel) { const a = link('tel:' + it.tel.replace(/[^\d+]/g, ''), ICON_PHONE, it.tel); a.removeAttribute('target'); acts.appendChild(a); }
  if (it.site) acts.appendChild(link(it.site, ICON_LINK, '公式サイト'));
  if (it.url) acts.appendChild(link(it.url, ICON_LINK, it.source === 'Google' ? 'Google マップ' : 'ホットペッパー'));
  if (it.hpUrl && it.hpUrl !== it.url) acts.appendChild(link(it.hpUrl, ICON_LINK, 'ホットペッパーで予約'));
  b.appendChild(acts);
  // 営業時間（全曜日、今日を強調）
  const hoursAll = it.hoursAll?.length ? it.hoursAll : (it.hours ? [it.hours] : []);
  if (hoursAll.length || it.hoursNote) {
    const sec = el('div'); sec.appendChild(el('h3', null, '営業時間'));
    const ul = el('ul', 'hours'); const today = (new Date().getDay() + 6) % 7;
    hoursAll.forEach((line, i) => {
      const m = String(line).match(/^([^:：]+)[:：]\s*(.*)$/); const li = el('li', hoursAll.length === 7 && i === today ? 'today' : '');
      if (m) { li.appendChild(el('span', null, m[1])); li.appendChild(el('span', null, m[2])); } else li.appendChild(el('span', null, line));
      ul.appendChild(li);
    });
    if (it.hoursNote) { const li = el('li'); li.appendChild(el('span', null, it.hoursNote)); ul.appendChild(li); }
    sec.appendChild(ul); b.appendChild(sec);
  }
  // 住所・アクセス
  if (it.address || it.access) {
    const kv = el('div', 'kv');
    if (it.address) { const r = el('div'); r.appendChild(el('b', null, '住所')); r.appendChild(el('span', null, it.address)); kv.appendChild(r); }
    if (it.access) { const r = el('div'); r.appendChild(el('b', null, '交通')); r.appendChild(el('span', null, it.access)); kv.appendChild(r); }
    b.appendChild(kv);
  }
  // 口コミ
  if (it.reviews?.length) {
    const sec = el('div'); sec.appendChild(el('h3', null, '口コミ（Google）'));
    const w = el('div', 'revs');
    it.reviews.slice(0, 3).forEach(t => { const s = String(t).replace(/\s+/g, ' '); w.appendChild(el('p', null, s.length > 140 ? s.slice(0, 140) + '…' : s)); });
    sec.appendChild(w); b.appendChild(sec);
  }
  // フッター（文脈で切替）
  const btn = (cls: string, html: string, text: string, fn: () => void) => {
    const x = el('button', cls) as HTMLButtonElement; x.type = 'button'; x.innerHTML = html; x.appendChild(document.createTextNode(text)); x.onclick = fn; return x;
  };
  if (sheetCtx === 'queue') {
    f.appendChild(btn('bfav', ICON_HEART, 'お気に入り', () => { closeSheet(); act('fav', it.id); }));
    f.appendChild(btn('bdel', ICON_TRASH, '削除', () => { closeSheet(); act('del', it.id); }));
  } else if (sheetCtx === 'fav') {
    f.appendChild(btn('bdel', ICON_HEART, 'お気に入りを解除', () => { closeSheet(); S.favs = S.favs.filter(x => x.id !== it.id); save('favs', S.favs); refresh(); renderLists(); toast('解除しました'); }));
  } else {
    f.appendChild(btn('bsolid', '', '復旧する', () => { closeSheet(); S.deleted = S.deleted.filter(x => x.id !== it.id); save('deleted', S.deleted); refresh(); renderLists(); toast('復旧しました'); }));
  }
}

export function initSheet(): void {
  $('#sheetClose').onclick = closeSheet; $('#sheetBd').onclick = closeSheet;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetItem) closeSheet(); });
  // つまみを下にドラッグで閉じる
  const sh = $('#sheet'), grip = $('#sheetGrip'); let y0 = 0, dy = 0, on = false;
  grip.addEventListener('pointerdown', e => { if ((e.target as HTMLElement).closest('button')) return; on = true; y0 = e.clientY; dy = 0; sh.classList.add('drag'); grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointermove', e => { if (!on) return; dy = Math.max(0, e.clientY - y0); sh.style.transform = `translate(-50%,${dy}px)`; });
  const end = () => { if (!on) return; on = false; sh.classList.remove('drag'); sh.style.transform = ''; if (dy > 90) closeSheet(); };
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
}
