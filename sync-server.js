/**
 * 享界政企大客户工作台 - 云同步后端（零依赖 Node.js）
 *
 * 功能：
 *   GET  /sync   拉取已保存的整库 JSON（需 X-Sync-Token 头）
 *   PUT  /sync   推送并覆盖保存整库 JSON（需 X-Sync-Token 头）
 *   GET  /       健康检查
 *
 * 部署（任选其一）：
 *   1) 本地 / 内网： node sync-server.js  → http://<本机IP>:3000/sync
 *   2) 云主机 / Docker： 暴露端口，用 nginx 反代并配置 HTTPS
 *   3) 云平台（Render / Railway / CloudStudio 等）： 上传本文件，设环境变量后启动
 *
 * 环境变量：
 *   PORT        监听端口，默认 3000
 *   SYNC_TOKEN  访问令牌（必填，前后端一致），默认 "change-me"
 *   SYNC_FILE   数据落盘文件，默认 ./sync-data.json
 *   SYNC_SLOT   是否支持多工作区命名空间（可选，?slot=xxx 区分多套台账）
 *
 * 安全提示：
 *   令牌为简单共享密钥，仅适合小团队/个人。公网部署务必配合 HTTPS 与强令牌，
 *   并建议用反向代理限制来源 IP。不要在公网保留默认令牌。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.SYNC_TOKEN || 'change-me';
const FILE = process.env.SYNC_FILE || path.join(__dirname, 'sync-data.json');
const SLOTS = process.env.SYNC_SLOT === '1';

function slotFile(slot) {
  if (!slot || !SLOTS) return FILE;
  const safe = String(slot).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'default';
  return path.join(path.dirname(FILE), 'sync-data-' + safe + '.json');
}
function readFile(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (e) { return JSON.stringify({ app: 'xiangjie-keyaccount', data: {} }); }
}
function writeFile(file, s) {
  try { fs.writeFileSync(file, s); return true; } catch (e) { return false; }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Sync-Token'
};
const server = http.createServer((req, res) => {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const [urlPath, query] = req.url.split('?');
  if (urlPath !== '/sync' && urlPath !== '/') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  if (urlPath === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, msg: 'xiangjie sync server', slots: SLOTS }));
    return;
  }
  const token = req.headers['x-sync-token'] || '';
  if (token !== TOKEN) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('forbidden');
    return;
  }
  const file = slotFile((query || '').match(/slot=([^&]+)/) && decodeURIComponent(query.match(/slot=([^&]+)/)[1]));

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(readFile(file));
    return;
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 50 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        JSON.parse(body);
        const ok = writeFile(file, body);
        if (!ok) { res.writeHead(500); res.end('write failed'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('bad json');
      }
    });
    return;
  }
  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('method not allowed');
});

server.listen(PORT, () => {
  console.log('[xiangjie-sync] listening on http://localhost:' + PORT + '/sync  (token=' + (TOKEN === 'change-me' ? 'CHANGE-ME(请设置SYNC_TOKEN)' : '已设置') + ', slots=' + SLOTS + ')');
});
