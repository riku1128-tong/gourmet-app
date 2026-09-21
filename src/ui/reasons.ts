// 削除直後の理由 4 択。理由で学習の重みが変わり、「今の気分じゃない」は 7 日で自動復旧
import type { DeleteReason } from '../types';
import { $, S, save, toast } from '../state';
import { REASONS, buildTaste } from '../taste';
import { renderLists } from './lists';

let timer: ReturnType<typeof setTimeout> | undefined;

export function askReason(id: string): void {
  const box = $('#reasons'), wrap = box.querySelector('.rbtns') as HTMLElement; wrap.innerHTML = '';
  (Object.entries(REASONS) as [DeleteReason, { label: string }][]).forEach(([k, r]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = r.label;
    b.onclick = () => { setReason(id, k); hideReasons(); }; wrap.appendChild(b);
  });
  box.classList.add('on'); clearTimeout(timer); timer = setTimeout(hideReasons, 5000);
}
export function hideReasons(): void { $('#reasons').classList.remove('on'); }
export function setReason(id: string, k: DeleteReason): void {
  const it = S.deleted.find(x => x.id === id); if (!it) return;
  const days = REASONS[k].days;
  it.reason = k; it.expires = days ? it.at + days * 864e5 : null; save('deleted', S.deleted);
  buildTaste(); renderLists(); toast(k === 'mood' ? '1週間後に自動で復旧します' : '好みに反映しました');
}
