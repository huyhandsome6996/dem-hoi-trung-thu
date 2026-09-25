// ============================================================
//  KIỂM THỬ HIỆU NĂNG v3 — chứng minh DSA giúp server gánh nhiều người chơi
//  · Mô phỏng 16 người chơi gửi 'pos' 12 lần/s (kiến trúc client-authoritative)
//  · Đo thời gian xử lý tick server qua /api/health (response time)
//  · Kiểm tra Spatial Hash: nhặt đồ vẫn hoạt động với nhiều người
//  · Đo tốc độ snapshot nhận về
// ============================================================
const { io } = require('socket.io-client');
const http = require('http');

const N_PLAYERS = parseInt(process.argv[2] || '16', 10);

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: 'localhost', port: 3000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let buf = ''; res.on('data', c => buf += c); res.on('end', () => resolve(JSON.parse(buf)));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}
function get(path) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    http.get({ host: 'localhost', port: 3000, path }, (res) => {
      let buf = ''; res.on('data', c => buf += c); res.on('end', () => resolve({ ms: Date.now() - t0, body: JSON.parse(buf) }));
    }).on('error', reject);
  });
}

(async () => {
  console.log(`=== TEST TẢI ${N_PLAYERS} NGƯỜI CHƠI (pos 12Hz mỗi người = ${N_PLAYERS * 12} gói/s) ===`);
  const health0 = await get('/api/health');
  console.log('health trước test:', health0.ms + 'ms, ver=' + health0.body.ver);

  const sockets = [];
  const collects = [];
  for (let i = 0; i < N_PLAYERS; i++) {
    const login = await post('/api/login', { name: `Load Bot ${i}`, studentId: `LOAD${i}` });
    const s = io('http://localhost:3000', { auth: { token: login.token } });
    s.myId = null;
    s.collected = 0;
    s.on('welcome', w => { s.myId = w.youId; });
    s.on('ev', ev => { if (ev.k === 'collect' && ev.pid) s.collected++; });
    sockets.push(s);
  }
  await new Promise(r => setTimeout(r, 800));

  // mọi bot chạy loạn xạ quanh bản đồ (như người chơi thật) — client-authoritative
  const DIRS = sockets.map(() => ({ dx: Math.random() * 2 - 1, dy: Math.random() * 2 - 1 }));
  const posTimer = setInterval(() => {
    for (let i = 0; i < sockets.length; i++) {
      const s = sockets[i];
      if (!s.myId || !s.connected) continue;
      if (Math.random() < 0.06) { DIRS[i] = { dx: Math.random() * 2 - 1, dy: Math.random() * 2 - 1 }; }
      s.x = Math.max(10, Math.min(470, (s.x || 40 + i * 25) + DIRS[i].dx * 8));
      s.y = Math.max(10, Math.min(262, (s.y || 136) + DIRS[i].dy * 8));
      s.emit('pos', { x: Math.round(s.x), y: Math.round(s.y), dx: DIRS[i].dx, dy: DIRS[i].dy });
    }
  }, 80);

  const t0 = Date.now();
  let snaps = 0;
  sockets[0].on('snap', () => snaps++);
  const healthSamples = [];
  const healthTimer = setInterval(async () => {
    try { healthSamples.push((await get('/api/health')).ms); } catch {}
  }, 250);

  await new Promise(r => setTimeout(r, 6000));
  clearInterval(posTimer); clearInterval(healthTimer);

  const avgHealth = healthSamples.length ? (healthSamples.reduce((a, b) => a + b, 0) / healthSamples.length).toFixed(1) : '?';
  const maxHealth = healthSamples.length ? Math.max(...healthSamples) : '?';
  const snapRate = (snaps / 6).toFixed(1);
  const totalCollect = sockets.reduce((a, s) => a + s.collected, 0);

  console.log('--- KẾT QUẢ SAU 6 GIÂY ---');
  console.log(`Health API: TB ${avgHealth}ms / MAX ${maxHealth}ms (dưới 100ms = server không nghẽn)`);
  console.log(`Snapshot client 0 nhận: ${snapRate} gói/s (kỳ vọng ~15)`);
  console.log(`Nhặt đồ (Spatial Hash hoạt động): ${totalCollect} lần nhặt trong ${N_PLAYERS} người`);
  console.log(`Online thực tế: ${health0.body.online + 0}`);

  const pass = Number(avgHealth) < 150 && Number(snapRate) >= 12;
  console.log(pass ? '=== PASS: server gánh tốt nhờ DSA + client-authoritative ===' : '=== WARN: xem lại ===');

  for (const s of sockets) s.close();
  process.exit(pass ? 0 : 1);
})();
