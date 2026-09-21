// ホットペッパーグルメAPI プロキシ + 名物抽出（Claude API）+ 静的配信（依存パッケージなし / Node 18+）
// 使い方:  npm run build && node server.js   → http://localhost:8797（PORT=xxxx で変更可）
//          開発中は `npm run dev`（Vite、5173）を使うと /api がここへ転送される
// キーは環境変数か同じフォルダの .env（HOTPEPPER_KEY / ANTHROPIC_API_KEY）。.env は .gitignore 済み
const http = require('http');
const fs = require('fs');
const path = require('path');

loadDotEnv(path.join(__dirname, '.env'));
const PORT = process.env.PORT || 8797; // 8787 は他ツールと競合したため変更
const KEY = process.env.HOTPEPPER_KEY || '';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const STATIC = path.join(__dirname, 'dist');
const HP = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/';
const ALLOWED = new Set(['lat', 'lng', 'range', 'genre', 'keyword', 'count', 'start', 'order', 'budget']);

// ---------- 公開サーバー向けの守り（Origin 制限と回数上限。課金 API を通りすがりに叩かれないため） ----------
// ALLOWED_ORIGINS はカンマ区切り（例: https://riku1128-tong.github.io）。localhost は常に許可
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
const isLocalOrigin = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ''); // Origin 無し（curl 等）はローカルからのみ
  return isLocalOrigin(origin) || ALLOWED_ORIGINS.has(origin);
}
// 名物抽出の回数上限（メモリ内。再起動でリセット）: IP ごと 10 分 40 回、全体で 1 日 400 回
const DISH_LIMIT_PER_IP = { count: +(process.env.DISH_LIMIT_PER_IP || 40), windowMs: 10 * 60 * 1000 };
const DISH_LIMIT_PER_DAY = +(process.env.DISH_LIMIT_PER_DAY || 400);
const ipHits = new Map(); let dayHits = { day: '', count: 0 };
function dishAllowed(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  if (dayHits.day !== today) dayHits = { day: today, count: 0 };
  if (dayHits.count >= DISH_LIMIT_PER_DAY) return false;
  const hits = (ipHits.get(ip) || []).filter(t => now - t < DISH_LIMIT_PER_IP.windowMs);
  if (hits.length >= DISH_LIMIT_PER_IP.count) return false;
  hits.push(now); ipHits.set(ip, hits); dayHits.count++;
  return true;
}

// ---------- 名物抽出（Claude Messages API を fetch で直接呼ぶ。SDK を使わないのは依存ゼロ方針のため） ----------
const CLAUDE_MODEL = 'claude-opus-5';
const CACHE_FILE = path.join(__dirname, '.cache', 'dish.json');
const dishCache = loadCache();
const DISH_SCHEMA = {
  type: 'object',
  properties: {
    dish: { type: 'string', description: '名物と判断した料理名。口コミに実際に出てくるものだけ。判断できなければ空文字' },
    reason: { type: 'string', description: '口コミを根拠にした一言（40文字以内）' },
    vibe: { type: 'string', description: '店の雰囲気や向いているシーンを 20 文字以内で' }
  },
  required: ['dish', 'reason', 'vibe'],
  additionalProperties: false
};
const DISH_SYSTEM = '飲食店の口コミから、その店に行くなら頼むべき「名物の一皿」を見抜く編集者です。料理名は口コミに実際に登場するものだけを使い、複数の人が薦めているものを優先します。根拠が弱ければ dish は空文字にしてください。日本語で答えます。';

async function extractDish(body) {
  const id = String(body.id || '');
  if (!id) throw withStatus(new Error('id が必要です'), 400);
  if (dishCache[id]) return dishCache[id];
  if (!ANTHROPIC_KEY) throw withStatus(new Error('サーバーに ANTHROPIC_API_KEY が設定されていません'), 501);
  const reviews = (Array.isArray(body.reviews) ? body.reviews : []).map(String).filter(Boolean).slice(0, 5);
  const editorial = body.editorial ? String(body.editorial) : '';
  if (!reviews.length && !editorial) return { dish: '', reason: '', vibe: '' };
  const text = [
    '店名: ' + (body.name || ''), 'ジャンル: ' + (body.genre || ''),
    editorial ? 'Google の紹介文: ' + editorial : '',
    '口コミ:', ...reviews.map((r, i) => (i + 1) + '. ' + r.replace(/\s+/g, ' ').slice(0, 600))
  ].filter(Boolean).join('\n');

  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 40000);
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL, max_tokens: 512, fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: DISH_SCHEMA } },
        system: DISH_SYSTEM,
        messages: [{ role: 'user', content: text }]
      })
    });
  } finally { clearTimeout(timer); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw withStatus(new Error((j.error && j.error.message) || 'Claude API エラー ' + r.status), r.status === 429 ? 429 : 502);
  if (j.stop_reason === 'refusal') return { dish: '', reason: '', vibe: '' }; // 安全側で辞退された場合は空
  const textBlock = (j.content || []).find(b => b.type === 'text');
  let out = { dish: '', reason: '', vibe: '' };
  try {
    const p = JSON.parse((textBlock && textBlock.text) || '{}');
    out = { dish: String(p.dish || '').slice(0, 30), reason: String(p.reason || '').slice(0, 60), vibe: String(p.vibe || '').slice(0, 30) };
  } catch { /* 解析失敗は空扱い */ }
  dishCache[id] = { ...out, model: j.model, at: Date.now() };
  saveCache();
  return dishCache[id];
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const allowed = originAllowed(req);
  if (req.headers.origin && allowed) { res.setHeader('Access-Control-Allow-Origin', req.headers.origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  // /api/status は Render のヘルスチェック（Origin 無し）も叩くので制限しない。返すのはキーの有無だけ
  if (url.pathname === '/api/status') return json(res, 200, { hotpepper: !!KEY, dish: !!ANTHROPIC_KEY, model: CLAUDE_MODEL, cached: Object.keys(dishCache).length, originAllowed: allowed });
  if (url.pathname.startsWith('/api/') && !allowed) return json(res, 403, { error: 'このオリジンからの利用は許可されていません（ALLOWED_ORIGINS）' });

  if (url.pathname === '/api/hotpepper') {
    if (!KEY) return json(res, 500, { results: { error: [{ message: 'サーバーに HOTPEPPER_KEY が設定されていません' }] } });
    const q = new URLSearchParams({ key: KEY, format: 'json' });
    for (const [k, v] of url.searchParams) if (ALLOWED.has(k)) q.set(k, v);
    try {
      const r = await fetch(HP + '?' + q.toString());
      const body = await r.text();
      res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(body);
    } catch (e) {
      json(res, 502, { results: { error: [{ message: 'ホットペッパーAPIに接続できません: ' + e.message }] } });
    }
    return;
  }

  if (url.pathname === '/api/dish') {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST のみ' });
    try {
      const body = await readJson(req, 64 * 1024);
      if (!dishCache[String(body.id || '')] && !dishAllowed(req)) return json(res, 429, { error: '名物抽出の回数上限に達しました。しばらくしてから再度お試しください' });
      json(res, 200, await extractDish(body));
    } catch (e) { json(res, e.status || 500, { error: e.message }); }
    return;
  }

  // 静的ファイル: `vite build` の成果物 dist/ を配信（無ければ 404。開発中は `npm run dev` の Vite を使う）
  // ドットで始まるパス（.env / .cache / .git）は配信しない
  const file = path.join(STATIC, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(STATIC) || file.includes(path.sep + '.') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end('Not found');
  const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream';
  // ハッシュ付きアセットは長期キャッシュ、index.html は毎回確認
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': /\/assets\//.test(url.pathname) ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT + '  (HOTPEPPER_KEY ' + (KEY ? '設定済み' : '未設定') + ' / ANTHROPIC_API_KEY ' + (ANTHROPIC_KEY ? '設定済み' : '未設定') + ')'));

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function withStatus(err, status) { err.status = status; return err; }
function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(withStatus(new Error('リクエストが大きすぎます'), 413)); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(withStatus(new Error('JSON が不正です'), 400)); }
    });
    req.on('error', reject);
  });
}
// .env（KEY=value 形式、# はコメント）。既に環境変数にある値は上書きしない
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i); if (!m) continue;
    if (!(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
function loadCache() { try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; } }
function saveCache() {
  try { fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true }); fs.writeFileSync(CACHE_FILE, JSON.stringify(dishCache)); }
  catch (e) { console.warn('キャッシュ保存失敗', e.message); }
}
