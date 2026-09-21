// 絞り込みチップ（今開いてる／徒歩5分以内／タバコ可）と雨の日バナー
import type { Filters } from '../types';
import { $, S, save } from '../state';
import { ICON_CLOCK, ICON_SMOKE, ICON_WALK } from './icons';
import { refresh } from '../search';

const FILTERS: { key: keyof Filters; label: string; icon: string }[] = [
  { key: 'open', label: '今開いてる', icon: ICON_CLOCK },
  { key: 'near', label: '徒歩5分以内', icon: ICON_WALK },
  { key: 'smoke', label: 'タバコ可', icon: ICON_SMOKE }
];
let rainDismissed = false;
export function resetRainDismissed(): void { rainDismissed = false; }

export function renderFilters(): void {
  const w = $('#filters'); w.innerHTML = '';
  FILTERS.forEach(f => {
    const b = document.createElement('button'); b.type = 'button';
    const rain = f.key === 'near' && !!S.weather?.rain;
    b.className = 'pill' + (S.filters[f.key] ? ' on' : '') + (rain ? ' rain' : '');
    b.innerHTML = f.icon; b.appendChild(document.createTextNode(rain ? '雨・徒歩5分以内' : f.label));
    b.setAttribute('aria-pressed', String(!!S.filters[f.key]));
    b.onclick = () => { S.filters[f.key] = !S.filters[f.key]; save('filters', S.filters); renderFilters(); renderRainbar(); refresh(); };
    w.appendChild(b);
  });
}
export function renderRainbar(): void { $('#rainbar').classList.toggle('on', !!(S.weather?.rain && !S.filters.near && !rainDismissed)); }

export function initFilters(): void {
  $('#rainGo').onclick = () => { S.filters.near = true; save('filters', S.filters); renderFilters(); renderRainbar(); refresh(); };
  $('#rainNo').onclick = () => { rainDismissed = true; renderRainbar(); };
  renderFilters();
}
