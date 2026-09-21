// 設定タブ（Google キー・ソース・サーバー URL）
import { $, DEFAULT_PROXY, S, save } from '../state';
import { search } from '../search';
import { showView } from './nav';

export function initSettings(onProxyChanged: () => void): void {
  const gkey = $<HTMLInputElement>('#gkey'), source = $<HTMLSelectElement>('#source'), proxy = $<HTMLInputElement>('#proxy');
  gkey.value = S.settings.gkey; source.value = S.settings.source; proxy.value = S.settings.proxy;
  $('#btnSave').onclick = () => {
    const changedKey = gkey.value.trim() !== S.settings.gkey;
    const nextProxy = proxy.value.trim() || DEFAULT_PROXY;
    const changedProxy = nextProxy !== S.settings.proxy;
    S.settings = { gkey: gkey.value.trim(), source: source.value as 'google' | 'hotpepper', proxy: nextProxy }; save('settings', S.settings);
    if (changedKey) { location.reload(); return; }
    if (changedProxy) { proxy.value = S.settings.proxy; onProxyChanged(); }
    showView('find'); search();
  };
}
