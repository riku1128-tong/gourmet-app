// Google Maps JavaScript API の読み込みと地図・ピンの管理
import type { LatLng, Shop } from './types';
import { $, S } from './state';

let map: google.maps.Map | undefined;
let centerMarker: google.maps.marker.AdvancedMarkerElement | undefined;
let circle: google.maps.Circle | undefined;
let geocoder: google.maps.Geocoder | undefined;
let AdvancedMarker: typeof google.maps.marker.AdvancedMarkerElement | undefined;
let shopMarkers: google.maps.marker.AdvancedMarkerElement[] = []; // 表示中カードのピン

export const mapReady = (): boolean => !!map;
export const geocoderReady = (): boolean => !!geocoder;

export function loadMaps(key: string): Promise<void> {
  return new Promise((res, rej) => {
    if ((window as unknown as { google?: unknown }).google && google.maps) return res();
    const s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&libraries=places,marker&language=ja&region=JP&loading=async&callback=__mapsReady';
    (window as unknown as { __mapsReady: () => void }).__mapsReady = res;
    s.onerror = () => rej(new Error('Google Maps の読み込みに失敗しました'));
    document.head.appendChild(s);
  });
}

export async function initMap(onCenterDragEnd: (c: LatLng) => void): Promise<void> {
  const { Map } = await google.maps.importLibrary('maps') as google.maps.MapsLibrary;
  const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary('marker') as google.maps.MarkerLibrary;
  AdvancedMarker = AdvancedMarkerElement;
  geocoder = new google.maps.Geocoder();
  // Map 生成時にコンテナの子要素が消されるため、バッジは先に退避してから戻す
  const badge = $('#mapbadge');
  // ページ内に埋め込むため、1本指はページスクロール／2本指で地図操作（cooperative）
  map = new Map($('#map'), { center: S.center, zoom: 15, mapId: 'DEMO_MAP_ID', disableDefaultUI: true, gestureHandling: 'cooperative', clickableIcons: false });
  $('#map').appendChild(badge);
  const pin = new PinElement({ background: '#E4572E', borderColor: '#fff', glyphColor: '#fff', scale: 1.1 });
  centerMarker = new AdvancedMarkerElement({ map, position: S.center, content: pin.element, gmpDraggable: true, title: '検索の中心' });
  centerMarker.addListener('dragend', () => {
    const p = centerMarker!.position as google.maps.LatLngLiteral | google.maps.LatLng | null | undefined; if (!p) return;
    const lat = typeof p.lat === 'function' ? p.lat() : p.lat, lng = typeof p.lng === 'function' ? p.lng() : p.lng;
    onCenterDragEnd({ lat, lng });
  });
  circle = new google.maps.Circle({ map, center: S.center, radius: S.radius, fillColor: '#E4572E', fillOpacity: .08, strokeColor: '#E4572E', strokeOpacity: .4, strokeWeight: 1 });
}

function shopPin(name: string): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;flex-direction:column;align-items:center;transform:translateY(-4px)';
  d.innerHTML = '<div style="background:#1F1A17;color:#fff;font-size:12px;font-weight:700;padding:5px 10px;border-radius:12px;white-space:nowrap;margin-bottom:4px;font-family:inherit"></div><svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 37s13-12.5 13-22A13 13 0 0 0 2 15c0 9.5 13 22 13 22z" fill="#2F7A58" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>';
  (d.firstChild as HTMLElement).textContent = name; return d;
}

export function moveCenter(c: LatLng): void {
  if (!map) return;
  map.panTo(c); if (centerMarker) centerMarker.position = c; circle?.setCenter(c);
}
export function panTo(c: LatLng): void { map?.panTo(c); }
export function setCircleRadius(r: number): void { circle?.setRadius(r); }
export function triggerResize(): void { if (map) google.maps.event.trigger(map, 'resize'); }

export function clearShopMarkers(): void { shopMarkers.forEach(m => { m.map = null; }); shopMarkers = []; }
export function showShopMarkers(items: Shop[]): void {
  clearShopMarkers();
  if (!map || !AdvancedMarker) return;
  items.forEach((it, i) => shopMarkers.push(new AdvancedMarker!({ map, position: { lat: it.lat, lng: it.lng }, content: shopPin(it.name), zIndex: 100 - i })));
}

// 逆ジオコーディングで地名を作る（失敗したら null）
export async function reverseGeocode(c: LatLng): Promise<string | null> {
  if (!geocoder) return null;
  try {
    const r = await geocoder.geocode({ location: c, language: 'ja' });
    const a = r.results?.[0]?.address_components || [];
    const pick = (t: string) => a.find(x => x.types.includes(t))?.long_name;
    const area = [pick('sublocality_level_1') || pick('locality'), pick('sublocality_level_2')].filter(Boolean).join('');
    return area ? area + '付近' : (r.results?.[0]?.formatted_address || '指定地点');
  } catch { return '指定地点'; }
}
// 地名 → 座標。見つからなければ null。ZERO_RESULTS は例外として投げられることがあるので呼び出し側で扱う
export async function geocodeAddress(q: string): Promise<{ c: LatLng; name: string } | null> {
  if (!geocoder) throw new Error('地図の読み込みが終わっていません');
  const r = await geocoder.geocode({ address: q, region: 'jp', language: 'ja' });
  const g = r.results?.[0]; if (!g) return null;
  const c = { lat: g.geometry.location.lat(), lng: g.geometry.location.lng() };
  const name = g.formatted_address.replace(/^日本、?/, '').replace(/^〒?\d{3}-?\d{4}\s*/, '') || q;
  return { c, name };
}
