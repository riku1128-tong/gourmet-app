// 設定タブ（Google キー・ソース・サーバー URL・同期のログイン）
import { $, DEFAULT_PROXY, S, save, toast } from '../state';
import { search } from '../search';
import { showView } from './nav';
import * as sync from '../sync';

export function initSettings(onProxyChanged: () => void): void {
  const gkey = $<HTMLInputElement>('#gkey'), source = $<HTMLSelectElement>('#source'), proxy = $<HTMLInputElement>('#proxy');
  const sbUrl = $<HTMLInputElement>('#sbUrl'), sbKey = $<HTMLInputElement>('#sbKey');
  gkey.value = S.settings.gkey; source.value = S.settings.source; proxy.value = S.settings.proxy;
  sbUrl.value = S.settings.sbUrl || ''; sbKey.value = S.settings.sbKey || '';
  // ビルドに接続先が埋め込まれていれば、手入力欄は畳んだまま（上書きは可能）
  if (import.meta.env.VITE_SUPABASE_URL) $('#syncAdv').querySelector('summary')!.textContent = '接続先（Supabase）を上書きする';

  $('#btnSave').onclick = () => {
    const changedKey = gkey.value.trim() !== S.settings.gkey;
    const nextProxy = proxy.value.trim() || DEFAULT_PROXY;
    const changedProxy = nextProxy !== S.settings.proxy;
    const changedSb = sbUrl.value.trim() !== (S.settings.sbUrl || '') || sbKey.value.trim() !== (S.settings.sbKey || '');
    S.settings = { gkey: gkey.value.trim(), source: source.value as 'google' | 'hotpepper', proxy: nextProxy, sbUrl: sbUrl.value.trim() || undefined, sbKey: sbKey.value.trim() || undefined };
    save('settings', S.settings);
    if (changedKey) { location.reload(); return; }
    if (changedProxy) { proxy.value = S.settings.proxy; onProxyChanged(); }
    if (changedSb) { sync.resetClient(); sync.initSync(); renderSync(); }
    showView('find'); search();
  };

  // ---- 同期のログイン ----
  const email = $<HTMLInputElement>('#syncEmail'), code = $<HTMLInputElement>('#syncCode');
  $('#syncSend').onclick = async () => {
    const e = email.value.trim(); if (!e) { toast('メールアドレスを入力してください'); return; }
    const err = await sync.sendCode(e);
    if (err) { toast('送信できませんでした: ' + err); return; }
    $('#syncCodeRow').hidden = false; code.focus(); toast('コードを送りました。メールを確認してください');
  };
  $('#syncVerify').onclick = async () => {
    const e = email.value.trim(), t = code.value.trim(); if (!e || !t) return;
    const err = await sync.verifyCode(e, t);
    if (err) { toast('ログインできませんでした: ' + err); return; }
    code.value = ''; $('#syncCodeRow').hidden = true; toast('ログインしました。同期を始めます');
    renderSync();
  };
  code.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ($('#syncVerify') as HTMLButtonElement).click(); } });
  $('#syncOut').onclick = async () => { await sync.signOut(); renderSync(); toast('ログアウトしました（この端末のお気に入りは残ります）'); };
  $('#syncNow').onclick = async () => { await sync.syncNow(); renderSync(); toast('同期しました'); };
  sync.onChange(renderSync);
  renderSync();
}

export function renderSync(): void {
  const st = $('#syncStatus'), login = $('#syncLogin'), on = $('#syncOn');
  if (!sync.isConfigured()) { st.textContent = '同期: 未設定（下の「接続先」に Supabase の URL と anon key を入れるか、ビルドに埋め込みます）'; login.hidden = true; on.hidden = true; return; }
  if (sync.isSignedIn()) {
    const n = sync.pendingCount();
    st.textContent = `同期: ${sync.userEmail()} でログイン中` + (n ? `（未送信 ${n} 件）` : '');
    login.hidden = true; on.hidden = false;
  } else { st.textContent = '同期: 未ログイン'; login.hidden = false; on.hidden = true; }
}
