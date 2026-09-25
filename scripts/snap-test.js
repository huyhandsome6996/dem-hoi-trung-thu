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
  const login = await post('/api/login', { name: 'Bot Test', studentId: 'BOT01' });
  console.log('login ok, pid=', login.player.id);
  const socket = io('http://localhost:3000', { auth: { token: login.token } });
  socket.on('welcome', w => console.log('welcome:', JSON.stringify(w)));
  socket.on('snap', s => {
    console.log('SNAP keys:', Object.keys(s));
    console.log('ps:', JSON.stringify(s.ps));
    console.log('ls:', JSON.stringify(s.ls));
    console.log('its count:', s.its.length, JSON.stringify(s.its.slice(0,3)));
    socket.close(); process.exit(0);
  });
  socket.on('connect_error', e => { console.log('CONNECT ERROR:', e.message); process.exit(1); });
  setTimeout(() => { console.log('TIMEOUT no snap'); process.exit(1); }, 5000);
})();
