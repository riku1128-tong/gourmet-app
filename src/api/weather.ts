// 雨の日判定（Open-Meteo：キー不要・無料）
import type { LatLng } from '../types';
import { S } from '../state';

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export async function fetchWeather(c: LatLng): Promise<void> {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lng}&current=precipitation,weather_code&timezone=auto`;
    const j = await (await fetch(u)).json(); const cur = j.current || {};
    S.weather = { rain: (cur.precipitation || 0) > 0 || RAIN_CODES.has(cur.weather_code), code: cur.weather_code };
  } catch { S.weather = null; }
}
