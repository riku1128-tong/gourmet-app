import type { LatLng } from './types';

// 2 点間の距離（m）。Google の geometry ライブラリと同じ球面距離（Haversine）。
// 純関数にしておくことで正規化処理を Maps 無しでテストできる
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371008.8; // 地球の平均半径（m）
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const fmtDist = (m: number): string => (m < 1000 ? Math.round(m / 10) * 10 + 'm' : (m / 1000).toFixed(1) + 'km');
export const walk = (m: number): number => Math.max(1, Math.round(m / 80)); // 徒歩分数は 80m/分で概算
