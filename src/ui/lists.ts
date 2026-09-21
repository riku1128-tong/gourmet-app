// お気に入り一覧・削除管理一覧（復旧ボタン、削除理由と自動復旧予定を表示）
import type { SavedShop } from '../types';
import { $, S, save, toast } from '../state';
import { fmtDist, walk } from '../geo';
import { REASONS } from '../taste';
import { ICON_HEART_LG } from './icons';
import { openSheet } from './sheet';
import { refresh } from '../search';
import { uncachePhotos } from '../pwa';

function rowEl(it: SavedShop, btn: string): HTMLElement {
  const w = document.createElement('div');
  w.innerHTML = `<div class="row"><div class="th" style="${it.photo ? `background-image:url('${it.photo}')` : ''}"></div>
    <div class="tx"><b></b><span class="l1"></span><span class="l2"></span></div>${btn}</div>`;
  const row = w.firstElementChild as HTMLElement;
  row.querySelector('b')!.textContent = it.name;
  return row;
}

export function renderLists(): void {
  $('#bFav').textContent = String(S.favs.length); $('#bDel').textContent = String(S.deleted.length);
  $('#favSub').textContent = S.favs.length + '件・近い順'; $('#trashCount').textContent = '削除済み ' + S.deleted.length + '件';
  const fl = $('#favList'); fl.innerHTML = '';
  [...S.favs].sort((a, b) => a.dist - b.dist).forEach(it => {
    const row = rowEl(it, `<button class="ic" aria-label="お気に入りを解除">${ICON_HEART_LG}</button>`);
    row.querySelector('.l1')!.textContent = it.genre + '・' + it.dish;
    row.querySelector('.l2')!.textContent = '予算 ' + it.price + '・' + fmtDist(it.dist) + '（徒歩約' + walk(it.dist) + '分）';
    (row.querySelector('.ic') as HTMLElement).onclick = () => { S.favs = S.favs.filter(x => x.id !== it.id); save('favs', S.favs); uncachePhotos(it); refresh(); renderLists(); };
    (row.querySelector('.th') as HTMLElement).onclick = () => openSheet(it, 'fav'); (row.querySelector('.tx') as HTMLElement).onclick = () => openSheet(it, 'fav');
    fl.appendChild(row);
  });
  const tl = $('#trashList'); tl.innerHTML = '';
  const day = (t: number) => new Date(t).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
  S.deleted.forEach(it => {
    const row = rowEl(it, '<button class="rb">復旧</button>');
    (row.querySelector('.th') as HTMLElement).style.opacity = '.55';
    (row.querySelector('.th') as HTMLElement).onclick = () => openSheet(it, 'trash'); (row.querySelector('.tx') as HTMLElement).onclick = () => openSheet(it, 'trash');
    row.querySelector('.l1')!.textContent = it.genre + '・' + it.price + '・' + fmtDist(it.dist);
    row.querySelector('.l2')!.textContent = day(it.at) + ' 削除' + (it.reason && it.reason !== 'none' ? '・' + REASONS[it.reason].label : '') + (it.expires ? '・' + day(it.expires) + 'に自動復旧' : '');
    (row.querySelector('.rb') as HTMLElement).onclick = () => { S.deleted = S.deleted.filter(x => x.id !== it.id); save('deleted', S.deleted); refresh(); renderLists(); toast('復旧しました'); };
    tl.appendChild(row);
  });
}

export function initLists(): void {
  $('#btnRestoreAll').onclick = () => { if (!S.deleted.length) return; S.deleted = []; save('deleted', []); refresh(); renderLists(); toast('すべて復旧しました'); };
}
