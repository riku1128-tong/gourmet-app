// Supabase による同期: メールのコードでログインし、お気に入り／削除管理を端末間で共有する
// - 端末の変更は pending キュー（localStorage）に積み、オンラインなら即送る
// - 起動時・画面復帰時・ログイン時にサーバーから取得して mergeState で統合（新しい方が勝つ）
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { SavedShop } from '../types';
import { LS, S, save } from '../state';
import { mergeState, type Kind, type PendingOp, type SyncRow } from './merge';

const TABLE = 'sync_items';
let client: SupabaseClient | null = null;
let session: Session | null = null;
let pending: PendingOp[] = LS<PendingOp[]>('pending', []);
let lastPull = 0, pulling = false, flushing = false;
const listeners = new Set<() => void>();

// 接続先: ビルド時の環境変数（GitHub Secrets → VITE_SUPABASE_*）か、設定画面の入力
// Project URL はドメインまで。ダッシュボードの REST エンドポイント（…/rest/v1/）を貼られても origin に正規化する
export function normalizeUrl(raw: string): string {
  const v = (raw || '').trim(); if (!v) return '';
  try { return new URL(v.startsWith('http://') || v.startsWith('https://') ? v : 'https://' + v).origin; } catch { return ''; }
}
export const config = () => ({
  url: normalizeUrl(S.settings.sbUrl || (import.meta.env.VITE_SUPABASE_URL as string | undefined) || ''),
  key: (S.settings.sbKey || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '').trim()
});
export const isConfigured = (): boolean => { const c = config(); return !!(c.url && c.key); };
export const isSignedIn = (): boolean => !!session;
export const userEmail = (): string => session?.user.email || '';
export const pendingCount = (): number => pending.length;
export function onChange(fn: () => void): void { listeners.add(fn); }
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });

// supabase-js は大きいので、接続先が設定されているときだけ動的に読み込む（未設定の人の本体サイズを増やさない）
async function getClient(): Promise<SupabaseClient | null> {
  if (client) return client;
  const c = config(); if (!c.url || !c.key) return null;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(c.url, c.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  } catch (e) { console.warn('Supabase 初期化失敗', e); return null; }
  return client;
}
export function resetClient(): void { client = null; session = null; }

// 起動時に呼ぶ。セッションがあれば同期を始める
export async function initSync(): Promise<void> {
  const c = await getClient(); if (!c) return;
  const { data } = await c.auth.getSession(); session = data.session;
  c.auth.onAuthStateChange((_e, s) => { const was = !!session; session = s; if (!was && s) pull().then(flush); emit(); });
  if (session) { await pull(); await flush(); }
  window.addEventListener('online', () => { flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - lastPull > 60000) pull().then(flush); });
  emit();
}

// ---- 認証（メールに届くコード。桁数は Supabase 側の設定（既定 8 桁）。マジックリンクはホーム画面版で戻ってこないので使わない） ----
export async function sendCode(email: string): Promise<string | null> {
  const c = await getClient(); if (!c) return '同期の接続先が設定されていません';
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  return error ? error.message : null;
}
export async function verifyCode(email: string, token: string): Promise<string | null> {
  const c = await getClient(); if (!c) return '同期の接続先が設定されていません';
  const { data, error } = await c.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return error.message;
  session = data.session; return null;
}
export async function signOut(): Promise<void> {
  const c = await getClient(); if (c) await c.auth.signOut();
  session = null; emit();
}

// ---- 端末の変更を記録 ----
export function enqueue(kind: Kind, id: string, removed: boolean, data?: SavedShop, at: number = Date.now()): void {
  if (!isConfigured()) return; // 未設定なら溜めない（あとで設定しても、端末にある分は pull 時のマージで送られる）
  pending = pending.filter(p => !(p.kind === kind && p.id === id));
  pending.push({ kind, id, removed, data: removed ? undefined : data, at });
  save('pending', pending);
  if (session) flush();
}

// ---- サーバーとやり取り ----
export async function pull(): Promise<void> {
  const c = await getClient(); if (!c || !session || pulling) return;
  pulling = true;
  try {
    const { data, error } = await c.from(TABLE).select('kind, shop_id, data, removed, updated_at');
    if (error) { console.warn('同期の取得に失敗', error.message); return; }
    const merged = mergeState({ favs: S.favs, deleted: S.deleted }, pending, (data || []) as SyncRow[]);
    S.favs = merged.favs; S.deleted = merged.deleted; save('favs', S.favs); save('deleted', S.deleted);
    // マージで「送るべき」と判定された分をキューに置き換える（既存の pending は結果に反映済み）
    pending = merged.toPush; save('pending', pending);
    lastPull = Date.now(); emit();
  } finally { pulling = false; }
}
export async function flush(): Promise<void> {
  const c = await getClient(); if (!c || !session || flushing || !pending.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  flushing = true;
  const batch = pending.slice();
  try {
    const rows = batch.map(p => ({ user_id: session!.user.id, kind: p.kind, shop_id: p.id, data: p.removed ? null : (p.data ?? null), removed: p.removed, updated_at: p.at }));
    const { error } = await c.from(TABLE).upsert(rows, { onConflict: 'user_id,kind,shop_id' });
    if (error) { console.warn('同期の送信に失敗', error.message); return; }
    // 送信中に増えた分は残す
    pending = pending.filter(p => !batch.some(b => b.kind === p.kind && b.id === p.id && b.at === p.at));
    save('pending', pending); emit();
  } finally { flushing = false; }
}
export async function syncNow(): Promise<void> { await pull(); await flush(); }
