import { describe, expect, it } from 'vitest';
import { distanceM, fmtDist, walk } from './geo';

describe('distanceM', () => {
  it('渋谷駅〜新宿駅はおよそ 3.3km', () => {
    const d = distanceM({ lat: 35.6590, lng: 139.7006 }, { lat: 35.6896, lng: 139.7006 });
    expect(d).toBeGreaterThan(3350); expect(d).toBeLessThan(3450);
  });
  it('同じ地点は 0', () => { expect(distanceM({ lat: 35, lng: 139 }, { lat: 35, lng: 139 })).toBe(0); });
});
describe('fmtDist / walk', () => {
  it('1km 未満は 10m 単位、以上は km 小数 1 桁', () => {
    expect(fmtDist(234)).toBe('230m'); expect(fmtDist(1234)).toBe('1.2km');
  });
  it('徒歩分数は 80m/分、最低 1 分', () => { expect(walk(400)).toBe(5); expect(walk(10)).toBe(1); });
});
