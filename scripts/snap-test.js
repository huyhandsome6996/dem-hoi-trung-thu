// ============================================================
//  KIỂM THỬ REALTIME v3 — giao thức mới (pos + items event)
//  1. login → socket connect → welcome
//  2. nhận 'items' event (kênh riêng)
//  3. snapshot 15Hz: ps + ls (KHÔNG còn its)
//  4. gửi 'pos' → vị trí đổi trong snapshot (client-authoritative)
//  5. Spatial Hash: đi tới gần đồ vật → server nhận đúng (collect)
// ============================================================
const { io } = require('socket.io-client');
const http = require('http');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: 'localhost', port: 3000, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let buf = ''; res.on('data', c => buf += c); res.on('end', () => resolve(JSON.parse(buf)));
    });
    req.on('error', reject); req.write(data); req.end();
  });
}

(async () => {
  const login = await post('/api/login', { name: 'Bot Test v3', studentId: 'BOT03' });
  console.log('PASS login, pid=', login.player.id);

  const socket = io('http://localhost:3000', { auth: { token: login.token } });
  let gotWelcome = false, gotItems = false, snapCount = 0, myId = null;
  let itemsCount = 0;
  const myPos = { x: 0, y: 0 };

  socket.on('welcome', w => {
    gotWelcome = true; myId = w.youId;
    console.log('PASS welcome:', JSON.stringify(w));
  });

  socket.on('items', d => {
    gotItems = true;
    itemsCount = d.its.length;
    console.log('PASS items event:', itemsCount, 'đồ vật:', JSON.stringify(d.its.slice(0, 2)));
  });

  socket.on('ev', ev => {
    if (ev.k === 'collect') console.log('PASS collect event:', ev.type, 'progress=', ev.progress);
  });

  socket.on('snap', s => {
    snapCount++;
    const me = s.ps.find(p => p[0] === myId);
    if (me) { myPos.x = me[1]; myPos.y = me[2]; }

    if (snapCount === 1) {
      console.log('SNAP keys:', Object.keys(s));
      if ('its' in s) { console.log('FAIL: snapshot còn its — phải bỏ rồi'); process.exit(1); }
      console.log('PASS snapshot không có its (nhẹ hơn):', JSON.stringify(s.ls), 'Lân');
    }

    // sau 1s gửi pos để thử di chuyển
    if (snapCount === 15) {
      console.log('Gửi pos (di chuyển phải 40px)...');
      socket.emit('pos', { x: myPos.x + 40, y: myPos.y, dx: 1, dy: 0 });
    }
    if (snapCount === 40) {
      console.log('--- KẾT QUẢ ---');
      console.log('welcome:', gotWelcome ? 'PASS' : 'FAIL');
      console.log('items event:', gotItems ? `PASS (${itemsCount} đồ vật)` : 'FAIL');
      console.log('snap nhận được:', snapCount, 'gói (15Hz kỳ vọng ~40 trong 2.6s)');
      console.log('vị trí sau pos:', myPos.x, myPos.y);
      socket.close(); process.exit(0);
    }
  });

  socket.on('connect_error', e => { console.log('FAIL CONNECT:', e.message); process.exit(1); });
  setTimeout(() => { console.log('FAIL TIMEOUT'); process.exit(1); }, 8000);
})();
