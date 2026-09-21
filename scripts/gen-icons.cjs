// PWA 用アイコンを依存なしで生成する（Node の zlib だけで PNG を書く）
// 使い方: node scripts/gen-icons.cjs  → public/icons/*.png
// 絵柄: アクセント色の角丸背景に白いピン（CLAUDE.md のトークン #E4572E / #FBF7F0）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ACCENT = [0xE4, 0x57, 0x2E], CREAM = [0xFB, 0xF7, 0xF0];

function png(width, height, rgba) {
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// 形の判定（座標は 0..1 に正規化）
const inRoundedSquare = (x, y, r) => { const ax = Math.abs(x - 0.5), ay = Math.abs(y - 0.5), h = 0.5; if (ax > h || ay > h) return false; const dx = Math.max(ax - (h - r), 0), dy = Math.max(ay - (h - r), 0); return dx * dx + dy * dy <= r * r; };
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
function inPin(x, y, cx, cy, r) {
  // ティアドロップ: 上の円 + 下向きの三角（円の接線）
  if (inCircle(x, y, cx, cy, r)) return true;
  const tipY = cy + r * 2.1; if (y < cy || y > tipY) return false;
  const halfW = r * (1 - (y - cy) / (tipY - cy)) * 1.0; // 底に向かって細くなる
  return Math.abs(x - cx) <= halfW && y >= cy;
}

function render(size, { maskable }) {
  const out = Buffer.alloc(size * size * 4);
  const SS = 3; // スーパーサンプリング
  const bgRadius = maskable ? 0 : 0.22;
  const pinScale = maskable ? 0.72 : 0.9; // maskable は中央 80% の安全域に収める
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
      let col = null;
      if (maskable || inRoundedSquare(x, y, bgRadius)) {
        col = ACCENT;
        const cx = 0.5, cy = 0.5 - 0.11 * pinScale, pr = 0.19 * pinScale;
        if (inPin(x, y, cx, cy, pr)) col = CREAM;
        if (inCircle(x, y, cx, cy, pr * 0.42)) col = ACCENT; // ピンの穴
      }
      if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
    }
    const n = SS * SS, i = (py * size + px) * 4;
    out[i] = a ? Math.round(r / (a / 255)) : 0; out[i + 1] = a ? Math.round(g / (a / 255)) : 0; out[i + 2] = a ? Math.round(b / (a / 255)) : 0; out[i + 3] = Math.round(a / n);
  }
  return png(size, size, out);
}

const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
const targets = [
  ['icon-192.png', 192, { maskable: false }], ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }], ['apple-touch-icon.png', 180, { maskable: true }] // iOS は自分で角丸にする
];
for (const [name, size, opt] of targets) { fs.writeFileSync(path.join(dir, name), render(size, opt)); console.log('wrote', name); }
