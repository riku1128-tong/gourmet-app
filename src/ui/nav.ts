// タブ切替とジャンルチップ
import type { View } from '../types';
import { $, GENRES, S } from '../state';
import { triggerResize } from '../maps';
import { search } from '../search';

export function showView(v: View): void {
  S.view = v; document.querySelectorAll<HTMLElement>('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  const find = v === 'find';
  ['#chips', '#filters', '#findScroll'].forEach(s => { $(s).style.display = find ? '' : 'none'; });
  $('#vFav').classList.toggle('on', v === 'fav'); $('#vTrash').classList.toggle('on', v === 'trash'); $('#vSet').classList.toggle('on', v === 'set');
  if (find) triggerResize();
}

export function initNav(): void {
  document.querySelectorAll<HTMLElement>('nav button').forEach(b => { b.onclick = () => showView(b.dataset.v as View); });
  const chips = $('#chips');
  GENRES.forEach(g => {
    const b = document.createElement('button'); b.className = 'pill' + (g.label === S.genre ? ' on' : ''); b.textContent = g.label;
    b.onclick = () => { S.genre = g.label; chips.querySelectorAll('.pill').forEach(x => x.classList.toggle('on', x === b)); search(); };
    chips.appendChild(b);
  });
}
