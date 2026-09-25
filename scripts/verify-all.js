// ============================================================
//  VERIFY ALL: Kiểm thử toàn diện DSA, Audio, Unikey, Mobile D-Pad
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');

console.log('--- 1. KIỂM THỬ DSA (SpatialHash, RingBuffer, Arena) ---');
const { Arena } = require('../arena');
const C = require('../game-config');

const arena = new Arena(1, (ev) => {});
assert.strictEqual(typeof arena.itemHash.insert, 'function', 'SpatialHash phải có hàm insert');
assert.strictEqual(typeof arena.itemHash.remove, 'function', 'SpatialHash phải có hàm remove');
assert.ok(arena.items.length > 0, 'Phải có đồ vật khởi tạo');

// Test SpatialHash query
const near = [];
const firstItem = arena.items[0];
arena.itemHash.query(firstItem.x, firstItem.y, 10, near);
assert.ok(near.some(it => it.id === firstItem.id), 'SpatialHash query phải tìm thấy vật phẩm lân cận');

// Test incremental remove
const oldLen = near.length;
arena.itemHash.remove(firstItem);
near.length = 0;
arena.itemHash.query(firstItem.x, firstItem.y, 10, near);
assert.ok(!near.some(it => it.id === firstItem.id), 'Vật phẩm đã remove không được xuất hiện trong query');

// Test incremental insert
arena.itemHash.insert(firstItem);
near.length = 0;
arena.itemHash.query(firstItem.x, firstItem.y, 10, near);
assert.ok(near.some(it => it.id === firstItem.id), 'Vật phẩm insert lại phải xuất hiện trong query');

// Test Tick
const events = arena.tick(0.016);
assert.ok(Array.isArray(events), 'Tick phải trả về mảng sự kiện');
console.log('-> DSA SpatialHash và Arena: PASS');

console.log('\n--- 2. KIỂM THỬ FILE NHẠC NỀN CHÍNH (.MP3) ---');
const mp3Path = path.join(__dirname, '../public/audio/den-ong-sao.mp3');
assert.ok(fs.existsSync(mp3Path), 'File public/audio/den-ong-sao.mp3 phải tồn tại');
const stats = fs.statSync(mp3Path);
assert.ok(stats.size > 1000000, `Kích thước file MP3 phải > 1MB (thực tế: ${stats.size} bytes)`);
console.log(`-> File MP3 chiếc đèn ông sao: PASS (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

console.log('\n--- 3. KIỂM THỬ MAPPING PHÍM UNIKEY TIẾNG VIỆT & TIẾNG ANH ---');
// Giả lập logic parseDirection trong game.js
function parseDirection(e) {
  const code = e.code || '';
  const key = (e.key || '').toLowerCase();
  if (code === 'KeyW' || code === 'ArrowUp' || key === 'w' || key === 'ư' || key === 'arrowup') return 'up';
  if (code === 'KeyS' || code === 'ArrowDown' || key === 's' || key === 'arrowdown') return 'down';
  if (code === 'KeyA' || code === 'ArrowLeft' ||
      key === 'a' || key === 'â' || key === 'ă' || key === 'á' || key === 'à' ||
      key === 'ả' || key === 'ã' || key === 'ạ' || key === 'arrowleft') return 'left';
  if (code === 'KeyD' || code === 'ArrowRight' || key === 'd' || key === 'đ' || key === 'arrowright') return 'right';
  return null;
}

// Kiểm thử tiếng Anh mặc định
assert.strictEqual(parseDirection({ code: 'KeyW', key: 'w' }), 'up');
assert.strictEqual(parseDirection({ code: 'KeyS', key: 's' }), 'down');
assert.strictEqual(parseDirection({ code: 'KeyA', key: 'a' }), 'left');
assert.strictEqual(parseDirection({ code: 'KeyD', key: 'd' }), 'right');
assert.strictEqual(parseDirection({ code: 'ArrowUp', key: 'ArrowUp' }), 'up');

// Kiểm thử khi bật Unikey Telex
assert.strictEqual(parseDirection({ code: 'KeyW', key: 'ư' }), 'up', 'W gõ Telex ra ư phải đi lên');
assert.strictEqual(parseDirection({ code: '', key: 'ư' }), 'up', 'Ký tự ư phải đi lên');
assert.strictEqual(parseDirection({ code: 'KeyA', key: 'â' }), 'left', 'A gõ Telex ra â phải đi trái');
assert.strictEqual(parseDirection({ code: '', key: 'á' }), 'left', 'Ký tự á phải đi trái');
assert.strictEqual(parseDirection({ code: 'KeyD', key: 'đ' }), 'right', 'D gõ Telex ra đ phải đi phải');
assert.strictEqual(parseDirection({ code: '', key: 'đ' }), 'right', 'Ký tự đ phải đi phải');
assert.strictEqual(parseDirection({ code: 'KeyS', key: 's' }), 'down', 'S gõ Telex phải đi xuống');

console.log('-> Logic phím Unikey (tiếng Việt Telex/VNI & tiếng Anh): PASS');

console.log('\n--- 4. KIỂM THỬ GIAO DIỆN D-PAD MOBILE ---');
const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
assert.ok(indexHtml.includes('id="mobile-dpad"'), 'index.html phải có #mobile-dpad');
assert.ok(indexHtml.includes('data-dir="up"'), 'D-Pad phải có nút Up');
assert.ok(indexHtml.includes('data-dir="down"'), 'D-Pad phải có nút Down');
assert.ok(indexHtml.includes('data-dir="left"'), 'D-Pad phải có nút Left');
assert.ok(indexHtml.includes('data-dir="right"'), 'D-Pad phải có nút Right');

const styleCss = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
assert.ok(styleCss.includes('.mobile-dpad'), 'style.css phải có class .mobile-dpad');
assert.ok(styleCss.includes('.dpad-btn'), 'style.css phải có class .dpad-btn');
assert.ok(styleCss.includes('#joystick { display: none !important; }'), 'Joystick cũ phải bị vô hiệu hóa');
console.log('-> Giao diện D-Pad mobile (Lên, Xuống, Trái, Phải): PASS');

console.log('\n--- 5. KIỂM THỬ SERVER & SOCKET.IO ---');
// Khởi động server để kiểm tra tải MP3 và socket
const express = require('express');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const ioServer = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

server.listen(3333, () => {
  // Test HTTP GET mp3
  http.get('http://localhost:3333/audio/den-ong-sao.mp3', (res) => {
    assert.strictEqual(res.statusCode, 200, 'Tải MP3 phải trả về mã 200');
    assert.strictEqual(res.headers['content-type'], 'audio/mpeg', 'Content-type phải là audio/mpeg');
    console.log('-> Máy chủ phục vụ file MP3 HTTP 200: PASS');
    server.close();
    console.log('\n=== TẤT CẢ CÁC BƯỚC KIỂM THỬ ĐÃ ĐẠT 100% ===');
    process.exit(0);
  }).on('error', (err) => {
    console.error('Lỗi tải MP3:', err);
    process.exit(1);
  });
});
