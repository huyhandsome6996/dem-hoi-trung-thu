// ============================================================
//  ĐÊM HỘI TRUNG THU — Server (Express + Socket.IO + SQLite)
//  v3: client-authoritative movement + Spatial Hash + kênh items riêng
//  Chạy: node server.js   (PORT mặc định 3000)
// ============================================================
'use strict';

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');

const C = require('./game-config');
const store = require('./db');
const { Arena } = require('./arena');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'Admin';
// chấp nhận nhiều mật khẩu Admin (mặc định + biến môi trường)
const ADMIN_PASSWORDS = new Set([
  '@Huyhandsome', '@Huyhandsome2006',
  ...(process.env.ADMIN_PASSWORDS || '').split(',').map(s => s.trim()).filter(Boolean),
  ...(process.env.ADMIN_PASSWORD ? [process.env.ADMIN_PASSWORD] : []),
]);
const VERSION = 3;
const SECRET = process.env.SESSION_SECRET || 'trung-thu-2026-den-ong-sao-secret';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true }, maxHttpBufferSize: 1e6 });

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0, etag: true, setHeaders(res, p) {
  if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
} }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ---------- Tiện ích token (HMAC) ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sign = (payload) => {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
};
const verify = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
};

// ---------- Chống spam đăng nhập ----------
const loginHits = new Map();
function rateLimited(ip) {
  const t = Date.now();
  const arr = (loginHits.get(ip) || []).filter(x => t - x < 60_000);
  arr.push(t);
  loginHits.set(ip, arr);
  return arr.length > 15;
}

// ---------- Arena ----------
let roundId = store.ensureActiveRound();
const arena = new Arena(roundId, () => {});
const sessions = new Map(); // socket.id -> {pid, rid, name, studentId}

// ---------- REST: game ----------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ver: VERSION, round: arena.roundId, online: arena.players.size, champion: arena.champion ? arena.champion.name : null });
});

app.get('/api/config', (req, res) => {
  res.json({ ...C.clientConfig(), ver: VERSION });
});

app.post('/api/login', (req, res) => {
  res.status(403).json({ error: 'Hết trung thu rồi cháu iu ơi' });
});

// ---------- REST: admin ----------
function adminAuth(req, res, next) {
  const payload = verify(String(req.headers['x-admin-token'] || ''));
  if (!payload || !payload.a || (payload.exp && payload.exp < Date.now())) {
    return res.status(401).json({ error: 'Chưa đăng nhập Admin!' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const u = String(req.body?.username ?? '');
  const p = String(req.body?.password ?? '');
  const okU = u.toLowerCase() === ADMIN_USER.toLowerCase();
  let okP = false;
  for (const cand of ADMIN_PASSWORDS) {
    if (p.length === cand.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(cand))) { okP = true; break; }
  }
  if (!okU || !okP) {
    setTimeout(() => res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu Admin!' }), 600);
    return;
  }
  res.json({ token: sign({ a: 1, exp: Date.now() + 12 * 3600 * 1000 }) });
});

app.get('/api/admin/state', adminAuth, (req, res) => {
  res.json({ ...store.adminCurrentRound(), online: arena.players.size, championNow: arena.champion ? { name: arena.champion.name, studentId: arena.champion.studentId } : null });
});

app.post('/api/admin/round', adminAuth, (req, res) => {
  roundId = store.startNewRound();
  arena.reset(roundId);
  // người đang chơi giữ nguyên kết nối → chuyển sang lượt mới với tiến độ 0
  for (const [sid, s] of sessions) {
    const row = store.upsertPlayer(arena.roundId, s.name, s.studentId);
    s.pid = row.id; s.rid = arena.roundId;
    arena.addPlayer(row, sid);
  }
  io.to('arena').emit('ev', { k: 'reset', round: roundId });
  res.json({ ok: true, round: roundId });
});

app.patch('/api/admin/gift', adminAuth, (req, res) => {
  const id = Number(req.body?.playerId);
  const gift = !!req.body?.gift;
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Thiếu playerId' });
  store.setGift(id, gift);
  res.json({ ok: true });
});

app.post('/api/admin/clear', adminAuth, (req, res) => {
  roundId = store.clearAllData();
  arena.reset(roundId);
  for (const [sid, s] of sessions) {
    const row = store.upsertPlayer(arena.roundId, s.name, s.studentId);
    s.pid = row.id; s.rid = arena.roundId;
    arena.addPlayer(row, sid);
  }
  io.to('arena').emit('ev', { k: 'reset', round: roundId });
  res.json({ ok: true });
});

app.get('/api/admin/csv', adminAuth, (req, res) => {
  const rows = store.csvRows();
  const head = ['round', 'name', 'student_id', 'joined_at', 'finished_at', 'finish_rank', 'is_champion', 'lanterns', 'score', 'hits', 'gift_given'];
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head.join(',')];
  for (const r of rows) lines.push(head.map(h => esc(r[h])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="trung-thu-players.csv"');
  res.send('\uFEFF' + lines.join('\r\n'));
});

// ---------- Socket.IO ----------
io.on('connection', (socket) => {
  socket.emit('authError');
  socket.disconnect(true);
});

// dọn người chơi mất kết nối quá 15s
setInterval(() => {
  const t = Date.now();
  for (const [pid, p] of arena.players) {
    if (p.disconnectedAt && t - p.disconnectedAt > 15_000 && !p.finishedRank) {
      arena.removePlayer(pid);
    }
  }
}, 5_000);

// ---------- Vòng lặp game ----------
const TICK_MS = 50;
let last = Date.now();
setInterval(() => {
  const t = Date.now();
  const dt = Math.min(0.12, (t - last) / 1000);
  last = t;
  const events = arena.tick(dt);
  for (const ev of events) {
    io.to('arena').emit('ev', ev);
    // lưu DB ngay khi có sự kiện quan trọng
    if (ev.k === 'collect' || ev.k === 'hit') {
      const p = arena.players.get(ev.pid);
      if (p) store.updateProgress(p.id, p.progress, p.score, p.hits);
    } else if (ev.k === 'finish') {
      const p = arena.players.get(ev.pid);
      if (p) store.finishPlayer(p.id, ev.rankN, ev.champion, p.progress, p.score, p.hits);
    } else if (ev.k === 'drum' || ev.k === 'power') {
      const p = arena.players.get(ev.pid);
      if (p) store.updateProgress(p.id, p.progress, p.score, p.hits);
    }
  }
  // đồ vật chỉ broadcast KHI THAY ĐỔI (event-driven) — không gửi kèm mỗi snapshot
  if (arena.itemsChanged) {
    arena.itemsChanged = false;
    io.to('arena').emit('items', { its: arena.itemsList() });
  }
}, TICK_MS);

// snapshot 15Hz — (v3) đã nhẹ hơn: chỉ người chơi + Lân, không kèm đồ vật
setInterval(() => {
  if (io.sockets.adapter.rooms.get('arena')?.size) {
    io.to('arena').emit('snap', arena.snapshot());
  }
}, 66);

server.listen(PORT, () => {
  console.log(`🏮 ĐÊM HỘI TRUNG THU đang chạy tại port ${PORT} — lượt đấu #${arena.roundId}`);
});
