// server.js との連携: 機能の有無の確認（/api/status）と名物の一皿（/api/dish）
import type { Shop } from '../types';
import { DISH, S, SERVER, save } from '../state';

// 起動時に /api/status を 1 回叩いて、サーバーで使える機能を把握する（Render 無料枠のスリープ解除も兼ねる）
export async function probeServer(onReady?: () => void): Promise<void> {
  const el = document.querySelector('#srvStatus'); if (el) el.textContent = 'サーバー: 確認中…（スリープ中なら1分ほどかかります）';
  try {
    const r = await fetch(new URL('/api/status', S.settings.proxy), { signal: AbortSignal.timeout(90000) });
    const j = r.ok ? await r.json() : {};
    Object.assign(SERVER, { checked: true, ok: r.ok, hotpepper: !!j.hotpepper, dish: !!j.dish });
  } catch { Object.assign(SERVER, { checked: true, ok: false, hotpepper: false, dish: false }); }
  if (el) el.textContent = SERVER.ok
    ? `サーバー: 接続OK（ホットペッパー ${SERVER.hotpepper ? '有効' : '無効'} ／ 名物抽出 ${SERVER.dish ? '有効' : '無効'}）`
    : 'サーバー: 接続できません（ホットペッパー・名物抽出・喫煙情報は使えません）';
  if (SERVER.ok) onReady?.();
}

export function applyCachedDish(it: Shop): void {
  const d = DISH[it.id]; if (!d || !d.dish) return;
  it.dish = d.dish + (d.reason ? '・' + d.reason : ''); it.dishLabel = '名物'; it.vibe = d.vibe || '';
}

const inFlight = new Set<string>();
// 表示中の Google カードについて名物を問い合わせ、結果でカード DOM を直接更新する
export async function fetchDishes(items: Shop[]): Promise<void> {
  if (!SERVER.dish) return; // サーバー無し／キー未設定（probeServer の結果）
  const targets = items.filter(it => it.source === 'Google' && !DISH[it.id] && !inFlight.has(it.id) && (it.reviews?.length || it.editorial));
  await Promise.all(targets.map(async it => {
    inFlight.add(it.id);
    try {
      const r = await fetch(new URL('/api/dish', S.settings.proxy), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: it.id, name: it.name, genre: it.genre, reviews: it.reviews, editorial: it.editorial })
      });
      if (r.status === 404 || r.status === 501 || r.status === 403) { SERVER.dish = false; return; } // サーバー無し／キー未設定／Origin 不許可 → 以後呼ばない
      if (!r.ok) return;
      const d = await r.json();
      DISH[it.id] = { dish: d.dish || '', reason: d.reason || '', vibe: d.vibe || '', at: Date.now() }; save('dish', DISH);
      if (!d.dish) return;
      applyCachedDish(it);
      const c = document.querySelector(`.card[data-id="${CSS.escape(it.id)}"]`);
      if (c) { c.querySelector('.tag')!.textContent = it.dishLabel; c.querySelector('.dtext')!.textContent = it.dish; }
    } catch { /* ネットワーク失敗は無視（口コミ表示のまま） */ }
    finally { inFlight.delete(it.id); }
  }));
}
