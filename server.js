// ホットペッパーグルメAPI プロキシ + 静的配信（依存パッケージなし / Node 18+）
// 使い方:  HOTPEPPER_KEY=xxxx node server.js   → http://localhost:8787
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const KEY = process.env.HOTPEPPER_KEY || '';
const HP = 'https://webservice.recruit.co.jp/hotpepper/gourmet/v1/';
const ALLOWED = new Set(['lat', 'lng', 'range', 'genre', 'keyword', 'count', 'start', 'order', 'budget']);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

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

  // 静的ファイル（index.html）
  const file = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end('Not found');
  const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}  (HOTPEPPER_KEY ${KEY ? '設定済み' : '未設定'})`));

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
