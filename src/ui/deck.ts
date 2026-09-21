// 「探す」のカード一覧: 描画・スワイプ・登録／削除
import type { Shop } from '../types';
import { $, PAGE, S, SERVER, toast } from '../state';
import { fmtDist, walk } from '../geo';
import { showShopMarkers } from '../maps';
import { isLiked } from '../taste';
import { fetchDishes } from '../api/server';
import { ICON_HEART, ICON_TRASH } from './icons';
import { openSheet } from './sheet';
import { renderLists } from './lists';
import { askReason } from './reasons';
import { addDeleted, addFav } from '../store';

// 表示中は S.queue の先頭 S.shown 件。登録／削除で 1 件抜けると次の候補が末尾に繰り上がる
export function renderDeck(loading = false, opts: { scrollToIndex?: number } = {}): void {
  const d = $('#deck'), sc = $('#findScroll'); const scrollTop = sc.scrollTop; d.innerHTML = '';
  $('#mapbadge').textContent = '半径' + fmtDist(S.radius) + '・残り ' + S.queue.length + '件';
  showShopMarkers([]);
  if (loading) { d.innerHTML = '<div class="empty"><b>お店を探しています…</b></div>'; return; }
  const visible = S.queue.slice(0, S.shown);
  if (!visible.length) {
    const f = S.filters, active = f.open || f.near || f.smoke;
    let title = S.results.length ? 'このジャンルの候補は見終わりました' : '候補が見つかりませんでした';
    let hint = '削除したお店は「削除管理」から復旧できます。<br>範囲を広げるか、別のジャンルを試してみてください。';
    if (S.results.length && active) {
      title = '絞り込み条件に合うお店がありません';
      const notes: string[] = [];
      if (f.smoke && !S.results.some(r => r.smoking !== undefined)) notes.push(SERVER.hotpepper ? '付近のお店はホットペッパーに喫煙情報が登録されていないようです。' : '喫煙情報はホットペッパーのデータにしかありません。設定の「サーバーURL」先に HOTPEPPER_KEY が設定されていると自動で突き合わせます。');
      if (f.open && !S.results.some(r => r.openNow !== undefined)) notes.push('営業中の判定は Google Places のデータでのみできます。');
      hint = (notes.length ? notes.join('<br>') + '<br>' : '') + '上の絞り込みを外すと候補が戻ります。';
    }
    d.innerHTML = '<div class="empty"><b>' + title + '</b><p>' + hint + '</p></div>';
    return;
  }
  visible.forEach(it => d.appendChild(cardEl(it)));
  showShopMarkers(visible);
  fetchDishes(visible); // 表示中のカードだけ名物を問い合わせる（非同期、結果はカードを直接更新）
  const rest = S.queue.length - visible.length;
  if (rest > 0) {
    const b = document.createElement('button'); b.className = 'more'; b.type = 'button';
    b.textContent = 'さらに' + Math.min(PAGE, rest) + '件表示（あと ' + rest + '件）';
    b.onclick = () => { const from = S.shown; S.shown += PAGE; renderDeck(false, { scrollToIndex: from }); };
    d.appendChild(b);
  }
  const target = opts.scrollToIndex != null ? d.children[opts.scrollToIndex] : null;
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  else sc.scrollTop = scrollTop;
}

function cardEl(it: Shop): HTMLElement {
  const c = document.createElement('div'); c.className = 'card'; c.dataset.id = it.id;
  c.innerHTML = `
    <div class="img" style="${it.photo ? `background-image:url('${it.photo}')` : ''}"><span class="src">${it.source}</span><span class="genre"></span></div>
    <div class="stamp fav">お気に入り</div><div class="stamp del">削除</div>
    <div class="body">
      <div class="ttl"><b></b><span class="dist">${fmtDist(it.dist)}</span></div>
      <div class="dish"><span class="tag">${it.dishLabel}</span><span class="dtext"></span></div>
      <div class="meta">${isLiked(it) ? '<span class="like">あなた好み</span>' : ''}<span>予算 ${it.price}</span><span>徒歩 約${walk(it.dist)}分</span>${it.rating ? `<span>★${it.rating}</span>` : ''}${it.openNow === true ? '<span style="color:var(--fav);font-weight:700">営業中</span>' : it.openNow === false ? '<span>営業時間外</span>' : ''}${it.smoking === true ? '<span>喫煙可</span>' : it.smoking === false ? '<span>禁煙</span>' : ''}${it.hours ? `<span>${it.hours}</span>` : ''}<a href="#" class="more-link">詳細を見る</a></div>
    </div>
    <div class="foot">
      <button type="button" class="bfav" aria-label="お気に入りに登録（左スワイプ）">${ICON_HEART}お気に入り</button>
      <button type="button" class="bdel" aria-label="削除する（右スワイプ）">${ICON_TRASH}削除</button>
    </div>`;
  c.querySelector('.genre')!.textContent = it.genre; c.querySelector('.ttl b')!.textContent = it.name; c.querySelector('.dtext')!.textContent = it.dish;
  (c.querySelector('.bfav') as HTMLElement).onclick = () => fly(c, -1, () => act('fav', it.id));
  (c.querySelector('.bdel') as HTMLElement).onclick = () => fly(c, 1, () => act('del', it.id));
  // 写真・店名・「詳細を見る」のタップで詳細シート（スワイプ中の誤タップは attachSwipe 側で抑止）
  (c.querySelector('.img') as HTMLElement).onclick = () => { if (!c.dataset.moved) openSheet(it, 'queue'); };
  (c.querySelector('.ttl b') as HTMLElement).onclick = () => { if (!c.dataset.moved) openSheet(it, 'queue'); };
  (c.querySelector('.more-link') as HTMLElement).onclick = (e) => { e.preventDefault(); openSheet(it, 'queue'); };
  attachSwipe(c, it.id);
  return c;
}

// ポインタースワイプ（しきい値 100px）。右 = 削除、左 = お気に入り（仕様として固定）
function attachSwipe(c: HTMLElement, id: string): void {
  let x0 = 0, dx = 0, active = false;
  const fav = c.querySelector('.stamp.fav') as HTMLElement, del = c.querySelector('.stamp.del') as HTMLElement;
  c.addEventListener('pointerdown', e => {
    if ((e.target as HTMLElement).closest('a, button')) return;
    active = true; x0 = e.clientX; dx = 0; delete c.dataset.moved; c.classList.add('drag'); c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', e => {
    if (!active) return; dx = e.clientX - x0;
    if (Math.abs(dx) > 8) c.dataset.moved = '1'; // 動かしたら直後の click で詳細を開かない
    c.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    fav.style.opacity = String(Math.min(1, Math.max(0, -dx / 90))); del.style.opacity = String(Math.min(1, Math.max(0, dx / 90)));
  });
  const end = () => {
    if (!active) return; active = false; c.classList.remove('drag');
    if (dx < -100) fly(c, -1, () => act('fav', id));       // 左スワイプ = お気に入り
    else if (dx > 100) fly(c, 1, () => act('del', id));    // 右スワイプ = 削除
    else { c.style.transform = ''; fav.style.opacity = '0'; del.style.opacity = '0'; }
  };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}
function fly(c: HTMLElement, dir: -1 | 1, cb: () => void): void {
  c.style.transform = `translateX(${dir * 600}px) rotate(${dir * 30}deg)`; c.style.opacity = '0'; setTimeout(cb, 220);
}

export function act(kind: 'fav' | 'del', id: string): void {
  const idx = S.queue.findIndex(x => x.id === id); if (idx < 0) return;
  const [it] = S.queue.splice(idx, 1);
  if (kind === 'fav') { addFav(it); toast('お気に入りに登録しました'); }
  else { addDeleted(it); askReason(it.id); }
  renderDeck(); renderLists();
}
