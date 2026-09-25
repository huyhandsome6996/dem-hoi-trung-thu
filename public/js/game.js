// ============================================================
//  ĐÊM HỘI TRUNG THU — Client game  (v3 — mượt hơn nhờ DSA)
//  · MÔ PHỎNG LOCAL 60FPS cho chính mình (client-authoritative):
//    di chuyển tức thì, không chờ mạng; gửi vị trí lên server 12 lần/s
//  · Ring Buffer O(1) chứa snapshot + nội suy thích nghi theo độ trễ mạng
//  · Đồ vật qua kênh riêng 'items' — chỉ nhận khi thay đổi (event-driven)
//  · Joystick cảm ứng cho điện thoại · HUD + xếp hạng live
// ============================================================
'use strict';

(() => {
  const $ = (sel) => document.querySelector(sel);
  const cv = $('#game');
  const cx = cv.getContext('2d');
  cx.imageSmoothingEnabled = false;

  let CFG = null;          // config từ server
  let SPR = null;          // sprites
  let mySid = null, myId = null;
  let token = sessionStorage.getItem('tt_token') || null;
  const fx = [];           // hiệu ứng nhỏ (sparkle, !, ...)
  let shakeT = 0;
  let running = false;
  let skyRunning = true;

  // ============ DSA 1: RING BUFFER (hàng đợi vòng tròn) ============
  // push/đọc O(1) — không dùng array.shift() gây copy toàn mảng mỗi snapshot
  // → giảm GC, giảm giật khung hình khi mạng gửi dồn dập
  class RingBuffer {
    constructor(n) { this.a = new Array(n); this.n = n; this.i = 0; this.c = 0; }
    push(v) { this.a[this.i] = v; this.i = (this.i + 1) % this.n; if (this.c < this.n) this.c++; }
    at(k) { return this.a[(this.i - this.c + k + this.n * 2) % this.n]; }
    last() { return this.c ? this.at(this.c - 1) : null; }
    prev() { return this.c > 1 ? this.at(this.c - 2) : this.last(); }
    clear() { this.i = 0; this.c = 0; }
  }
  const snaps = new RingBuffer(12);
  let snapInterval = 0;    // EMA khoảng cách giữa 2 snapshot → delay nội suy thích nghi

  // Đồ vật: server chỉ gửi KHI THAY ĐỔI (event-driven) → ít dữ liệu hơn hẳn
  let items = [];

  // trạng thái của chính mình (mô phỏng local)
  const ghost = { x: 0, y: 0, dir: 1, have: false, moving: false };
  let selfStunUntil = 0;   // đang choáng vì bị Lân đụng (đồng bộ với server)
  let selfBoostUntil = 0;  // đang tăng tốc vì ăn bánh trung thu
  let lastFrameT = 0;
  let lastMoveT = 0;

  // ============ NỀN TRỜI MÀN ĐĂNG NHẬP ============
  const bgCv = $('#bg-canvas');
  const bgCx = bgCv.getContext('2d');
  function skyLoop(t) {
    if (!skyRunning) return;
    if (bgCv.width !== innerWidth || bgCv.height !== innerHeight) {
      bgCv.width = innerWidth; bgCv.height = innerHeight;
    }
    Sprites.drawSky(bgCx, bgCv.width, bgCv.height, t, SPR ? SPR.items.lantern : null);
    requestAnimationFrame(skyLoop);
  }

  // ============ VA CHẠM (bản sao nhẹ của server cho mô phỏng local) ============
  function isSolid(px, py) {
    const col = Math.floor(px / CFG.TILE), row = Math.floor(py / CFG.TILE);
    if (col < 0 || row < 0 || col >= CFG.MAP_W || row >= CFG.MAP_H) return true;
    return '#wcts'.includes(CFG.MAP[row][col]);
  }
  function ghostMove(dx, dy) {
    const r = 5;
    let nx = ghost.x + dx;
    if (!isSolid(nx - r, ghost.y - r * 0.5) && !isSolid(nx + r, ghost.y - r * 0.5) &&
        !isSolid(nx - r, ghost.y + r * 0.5) && !isSolid(nx + r, ghost.y + r * 0.5)) {
      ghost.x = Math.max(r + 1, Math.min(CFG.W - r - 1, nx));
    }
    let ny = ghost.y + dy;
    if (!isSolid(ghost.x - r, ny - r * 0.5) && !isSolid(ghost.x + r, ny - r * 0.5) &&
        !isSolid(ghost.x - r, ny + r * 0.5) && !isSolid(ghost.x + r, ny + r * 0.5)) {
      ghost.y = Math.max(r + 1, Math.min(CFG.H - r - 1, ny));
    }
  }

  // ============ ĐĂNG NHẬP ============
  const loginForm = $('#login-form');
  const loginErr = $('#login-err');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    AudioManager.ensureCtx();
    AudioManager.play('click');
    const name = $('#in-name').value.trim();
    const studentId = $('#in-sid').value.trim();
    if (!name || !studentId) {
      loginErr.textContent = 'Điền đủ Họ tên và Mã sinh viên nha!';
      loginErr.hidden = false;
      return;
    }
    // 🔐 BAN TỔ CHỨC: tên "Admin" + mật khẩu ở ô "Mã sinh viên" → thẳng trang Admin
    if (name.toLowerCase() === 'admin') {
      const btnA = $('#btn-login');
      btnA.disabled = true;
      btnA.textContent = '🔐 Đang vào trang Admin...';
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name, password: studentId }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Sai mật khẩu Admin!');
        sessionStorage.setItem('tt_admin', d.token);
        location.href = '/admin';
        return;
      } catch (err) {
        loginErr.textContent = err.message + ' (Người chơi bình thường thì điền tên thật + MSSV nha!)';
        loginErr.hidden = false;
        btnA.disabled = false;
        btnA.textContent = '🏮 VÀO HỘI NGAY';
        return;
      }
    }
    const btn = $('#btn-login');
    btn.disabled = true;
    btn.textContent = '🏮 Đang vào...';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, studentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra');
      token = data.token;
      sessionStorage.setItem('tt_token', token);
      startGame();
    } catch (err) {
      loginErr.textContent = err.message.includes('fetch') ? 'Không gọi được máy chủ — thử lại nha!' : err.message;
      loginErr.hidden = false;
      btn.disabled = false;
      btn.textContent = '🏮 VÀO HỘI NGAY';
    }
  });

  // ============ SOCKET ============
  let socket = null;
  function connect() {
    socket = io({ auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 5000 });
    socket.on('welcome', (w) => {
      mySid = w.youSid; myId = w.youId;
      $('#overlay-loading').hidden = true;
      $('#hud').classList.remove('hidden');
      if (!running) { running = true; requestAnimationFrame(renderLoop); }
    });
    socket.on('snap', (s) => {
      const rt = performance.now();
      // DSA 2: đo khoảng snapshot bằng EMA (trung bình trượt mũ) → nội suy thích nghi
      const prev = snaps.last();
      if (prev) {
        const gap = Math.min(400, Math.max(10, rt - prev.rt));
        snapInterval = snapInterval ? snapInterval * 0.85 + gap * 0.15 : gap;
      }
      snaps.push({ rt, d: s });
      reconcileSelf(s);
      updateHud(s);
    });
    // đồ vật chỉ gửi khi thay đổi — không kèm mỗi snapshot nữa
    socket.on('items', (d) => { items = d.its || []; });
    socket.on('ev', onEvent);
    socket.on('authError', () => { sessionStorage.removeItem('tt_token'); location.reload(); });
    socket.on('connect_error', () => { $('#overlay-error').hidden = false; });
    socket.on('disconnect', () => { $('#overlay-error').hidden = false; });
    socket.on('reconnect', () => {
      $('#overlay-error').hidden = true;
      socket.emit('auth', { token });
    });
  }

  // đối chiếu vị trí server: lệch lớn (reset/lỗi mạng) → snap; đứng yên mà trôi → kéo nhẹ
  function reconcileSelf(s) {
    if (!mySid) return;
    const me = s.ps.find(p => p[8] === mySid);
    if (!me) return;
    if (!ghost.have) { ghost.x = me[1]; ghost.y = me[2]; ghost.dir = me[3] || 1; ghost.have = true; return; }
    const dx = me[1] - ghost.x, dy = me[2] - ghost.y;
    const d = Math.hypot(dx, dy);
    if (d > 60) { ghost.x = me[1]; ghost.y = me[2]; }                       // lệch xa quá → đồng bộ cứng
    else if (d > 2 && !ghost.moving && performance.now() - lastMoveT > 350) {
      ghost.x += dx * 0.1; ghost.y += dy * 0.1;                             // chống trôi khi đứng yên
    }
  }

  // ============ INPUT ============
  const keys = {};
  addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    keys[e.key.toLowerCase()] = true;
  });
  addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

  const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
  const joyBase = $('#joy-base'), joyKnob = $('#joy-knob');
  const gameWrap = $('#game-wrap');

  function joyStart(e) {
    const t = e.changedTouches ? e.changedTouches[0] : e;
    if (t.target.closest('.hud-card, .btn-icon, .overlay, #rotate-hint')) return;
    joy.active = true; joy.id = t.identifier ?? 'mouse';
    joy.ox = t.clientX; joy.oy = t.clientY;
    joyBase.style.display = 'block';
    joyBase.style.left = (t.clientX - 52) + 'px';
    joyBase.style.top = (t.clientY - 52) + 'px';
    joyMove(e);
  }
  function joyMove(e) {
    if (!joy.active) return;
    const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
    for (const t of list) {
      if ((t.identifier ?? 'mouse') !== joy.id) continue;
      let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
      const d = Math.hypot(dx, dy);
      const max = 44;
      if (d > max) { dx = dx / d * max; dy = dy / d * max; }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      joy.dx = Math.abs(dx) > 8 ? dx / max : 0;
      joy.dy = Math.abs(dy) > 8 ? dy / max : 0;
    }
  }
  function joyEnd(e) {
    const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
    for (const t of list) {
      if ((t.identifier ?? 'mouse') !== joy.id) continue;
      joy.active = false; joy.dx = 0; joy.dy = 0;
      joyKnob.style.transform = '';
      joyBase.style.display = 'none';
    }
  }
  gameWrap.addEventListener('touchstart', joyStart, { passive: true });
  gameWrap.addEventListener('touchmove', joyMove, { passive: true });
  gameWrap.addEventListener('touchend', joyEnd);
  gameWrap.addEventListener('touchcancel', joyEnd);
  gameWrap.addEventListener('mousedown', joyStart);
  addEventListener('mousemove', joyMove);
  addEventListener('mouseup', joyEnd);

  // đọc input từ bàn phím + joystick
  function readInput() {
    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (joy.active && (joy.dx || joy.dy)) { dx = joy.dx; dy = joy.dy; }
    return { dx, dy };
  }

  let lastSent = { dx: 0, dy: 0 };
  // (v3) gửi VỊ TRÍ của mình lên server 12 lần/s — thay vì gửi input rồi chờ server di chuyển
  // → hành động của người chơi có phản hồi tức thì tại máy mình, mạng chỉ cần "xác nhận"
  setInterval(() => {
    if (!socket || !socket.connected || !running || !ghost.have) return;
    const { dx, dy } = readInput();
    if (dx !== lastSent.dx || dy !== lastSent.dy || dx || dy) {
      lastSent = { dx, dy };
      socket.emit('pos', { x: Math.round(ghost.x * 10) / 10, y: Math.round(ghost.y * 10) / 10, dx, dy });
    }
  }, 80);

  // ============ HUD ============
  function updateHud(s) {
    const me = s.ps.find(p => p[8] === mySid);
    if (me) {
      $('#hud-progress').textContent = `🏮 ${me[5]}/${s.target}`;
      $('#hud-progress').classList.toggle('done', me[5] >= s.target);
      $('#hud-score').textContent = `⭐ ${me[6]} điểm`;
      $('#hud-bar').style.width = Math.min(100, me[5] / s.target * 100) + '%';
    }
    // bảng xếp hạng: đã về đích theo hạng, còn lại theo tiến độ/điểm
    const rows = s.ps.map(p => ({
      name: p[7], prog: p[5], score: p[6], fin: !!(p[4] & 16), champ: !!(p[4] & 32), sid: p[8],
    })).sort((a, b) => (b.fin - a.fin) || (a.fin ? 0 : (b.prog - a.prog) || (b.score - a.score)));
    // chỉ dựng lại DOM khi dữ liệu thật sự đổi (đi lại liên tục không đổi xếp hạng → không jank)
    const standKey = rows.map(r => `${r.name}|${r.prog}|${r.score}|${r.fin ? 1 : 0}|${r.champ ? 1 : 0}|${r.sid === mySid ? 1 : 0}`).join(';');
    if (standKey !== updateHud._last) {
      updateHud._last = standKey;
      const list = $('#stand-list');
      list.innerHTML = '';
      rows.slice(0, 7).forEach((r, i) => {
        const li = document.createElement('li');
        if (r.sid === mySid) li.className = 'me';
        if (r.fin) li.classList.add('fin');
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        li.innerHTML = `<span>${medal}</span><span class="st-name"></span><span class="st-prog">${r.fin ? '🏁' : '🏮' + r.prog}</span>`;
        li.querySelector('.st-name').textContent = r.name + (r.champ ? ' 👑' : '');
        list.appendChild(li);
      });
    }
  }

  function toast(msg, cls = 'info', ms = 2600) {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }
  function banner(msg, ms = 2000) {
    const b = $('#banner');
    b.textContent = msg;
    b.hidden = false;
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.hidden = true; }, ms);
  }

  // ============ SỰ KIỆN GAME ============
  function onEvent(ev) {
    const mine = ev.sid === mySid;
    switch (ev.k) {
      case 'join':
        if (ev.name) { toast(`👋 ${ev.name} đã vào hội`, 'info', 1800); AudioManager.play('join'); }
        break;
      case 'collect': {
        fx.push({ type: 'spark', x: ev.x, y: ev.y, t: performance.now(), color: ev.type === 'star' ? '#ffd23b' : '#ff7a3c' });
        if (mine) AudioManager.play(ev.type === 'star' ? 'star' : 'collect');
        else if (ev.type === 'star') AudioManager.play('star');
        break;
      }
      case 'power':
        fx.push({ type: 'spark', x: ev.x, y: ev.y, t: performance.now(), color: '#d9a05b' });
        if (mine) {
          AudioManager.play('power'); toast('🥮 Bánh trung thu — tăng tốc 5 giây!', 'good');
          selfBoostUntil = performance.now() + (CFG?.RULES?.BOOST_MS || 5000); // mô phỏng local
        }
        break;
      case 'drum':
        fx.push({ type: 'ring', x: ev.x, y: ev.y, t: performance.now() });
        AudioManager.play('drum');
        toast(`🥁 ${ev.name} đánh trống — Lân bỏ chạy!`, 'good');
        break;
      case 'ready':
        if (mine) { banner('ĐỦ ĐÈN! CHẠY LÊN CỔNG ĐÍCH 🏮'); AudioManager.play('ready'); }
        else toast(`⚡ ${ev.name} đã đủ đèn — đang lao lên cổng!`, 'warn');
        break;
      case 'hit': {
        fx.push({ type: 'burst', x: ev.x, y: ev.y, t: performance.now() });
        if (mine) {
          AudioManager.play('hit');
          shakeT = 0.28;
          if (navigator.vibrate) navigator.vibrate(90);
          toast(`😱 Lân đụng vào! Rớt ${ev.drop} đèn — nhặt lại nha!`, 'warn');
          // đồng bộ với server: đứng choáng tại chỗ bị đụng (không di chuyển local)
          selfStunUntil = performance.now() + (CFG?.RULES?.STUN_MS || 1000);
          ghost.x = ev.x; ghost.y = ev.y;
          socket?.emit('pos', { x: Math.round(ghost.x * 10) / 10, y: Math.round(ghost.y * 10) / 10, dx: 0, dy: 0 });
        }
        break;
      }
      case 'lionTelegraph':
        fx.push({ type: 'excl', x: ev.x, y: ev.y - 14, t: performance.now() });
        break;
      case 'finish': {
        AudioManager.play(ev.champion ? 'champion' : 'finish');
        if (mine) {
          if (ev.champion) showChampion(ev);
          else showFinish(ev);
        } else {
          toast(`${ev.champion ? '👑' : '🏁'} ${ev.name} về đích HẠNG ${ev.rankN}!`, ev.champion ? 'warn' : 'info', 3200);
        }
        break;
      }
      case 'reset':
        $('#overlay-finish').hidden = true;
        $('#overlay-champion').hidden = true;
        clearTimeout(window._champTimer);
        banner('🔄 LƯỢT MỚI BẮT ĐẦU!', 1800);
        toast('Tiến độ đã đặt lại — ai nhanh nhất đây?', 'info');
        ghost.have = false;
        ghost.moving = false;
        selfStunUntil = 0; selfBoostUntil = 0;
        items = [];
        snaps.clear();
        updateHud._last = null;
        break;
      case 'leave':
        break;
    }
  }

  function showFinish(ev) {
    $('#finish-title').textContent = `Bạn về đích HẠNG #${ev.rankN}!`;
    $('#finish-stats').innerHTML = `🏮 <b>${ev.lanterns}/10 đèn</b> · ⭐ <b>${ev.score} điểm</b> · 💥 bị Lân đụng <b>${ev.hits} lần</b>`;
    $('#overlay-finish').hidden = false;
  }

  function showChampion(ev) {
    $('#champ-name').textContent = `🎉 ${ev.name} 🎉`;
    $('#btn-admin-go').href = '/admin';
    $('#overlay-champion').hidden = false;
    startConfetti();
    let n = 8;
    $('#champ-count').textContent = n;
    clearInterval(window._champTimer);
    window._champTimer = setInterval(() => {
      n--;
      if (n <= 0) { clearInterval(window._champTimer); location.href = '/admin'; return; }
      $('#champ-count').textContent = n;
    }, 1000);
  }

  $('#btn-spectate').addEventListener('click', () => { $('#overlay-finish').hidden = true; AudioManager.play('click'); });
  $('#btn-reload').addEventListener('click', () => location.reload());
  $('#btn-mute').addEventListener('click', () => {
    const m = !AudioManager.isMuted();
    AudioManager.setMuted(m);
    $('#btn-mute').textContent = m ? '🔇' : '🔊';
  });
  $('#btn-fs').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  if (AudioManager.isMuted()) $('#btn-mute').textContent = '🔇';

  // ============ PHÁO GIẤY ============
  const confCv = $('#confetti');
  function startConfetti() {
    confCv.width = confCv.clientWidth; confCv.height = confCv.clientHeight;
    const g = confCv.getContext('2d');
    const colors = ['#ffd23b', '#ff7a3c', '#5ad6c8', '#e84545', '#7ade6f', '#fff3b0'];
    const bits = Array.from({ length: 130 }, () => ({
      x: Math.random() * confCv.width, y: -20 - Math.random() * confCv.height * 0.5,
      vy: 1.6 + Math.random() * 2.6, vx: (Math.random() - 0.5) * 1.4,
      s: 4 + Math.random() * 5, c: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2,
    }));
    const t0 = performance.now();
    (function loop(t) {
      if ($('#overlay-champion').hidden) { g.clearRect(0, 0, confCv.width, confCv.height); return; }
      g.clearRect(0, 0, confCv.width, confCv.height);
      for (const b of bits) {
        b.x += b.vx; b.y += b.vy; b.rot += b.vr;
        if (b.y > confCv.height + 20) { b.y = -20; b.x = Math.random() * confCv.width; }
        g.save(); g.translate(b.x, b.y); g.rotate(b.rot);
        g.fillStyle = b.c; g.fillRect(-b.s / 2, -b.s / 2, b.s, b.s);
        g.restore();
      }
      if (t - t0 < 30000) requestAnimationFrame(loop);
    })(t0);
  }

  // ============ VÒNG LẶP VẼ ============
  const bg = document.createElement('canvas');
  bg.width = 480; bg.height = 272;
  let bgPainted = false;
  const interCache = { key: null, p0: null, l0: null };

  function paintBg() {
    const g = bg.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let row = 0; row < CFG.MAP_H; row++) {
      for (let col = 0; col < CFG.MAP_W; col++) {
        const ch = CFG.MAP[row][col];
        const x = col * 16, y = row * 16;
        let tile = (col + row) % 2 ? SPR.tiles.grass1 : SPR.tiles.grass2;
        if (ch === 'p') tile = SPR.tiles.path;
        else if (ch === '#') tile = SPR.tiles.hedge;
        else if (ch === 's') tile = SPR.tiles.stage;
        // nước vẽ động riêng → nền để cỏ
        g.drawImage(tile, x, y);
      }
    }
    // cây + thùng gỗ
    for (let row = 0; row < CFG.MAP_H; row++) {
      for (let col = 0; col < CFG.MAP_W; col++) {
        const ch = CFG.MAP[row][col];
        if (ch === 't') g.drawImage(SPR.tree, col * 16 + 1, row * 16 - 6);
        if (ch === 'c') g.drawImage(SPR.crate, col * 16 + 2, row * 16 + 3);
      }
    }
    // dây đèn treo ngang mép trên
    for (let x = 0; x < 480; x += 24) {
      const yy = 2 + Math.round(Math.sin(x / 48) * 2);
      g.fillStyle = '#5a3a2a';
      g.fillRect(x, yy, 24, 1);
      const col = (x / 24) % 3 === 0 ? '#ff5a4e' : (x / 24) % 3 === 1 ? '#ffd23b' : '#5ad6c8';
      g.fillStyle = col;
      g.fillRect(x + 9, yy + 1, 5, 5);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x + 10, yy + 2, 1, 1);
    }
    bgPainted = true;
  }

  function lerp(a, b, k) { return a + (b - a) * k; }
  function flagsOf(p) { return p[4]; }

  function renderLoop(t) {
    if (!running) return;
    requestAnimationFrame(renderLoop);
    try {
      renderFrame(t);
    } catch (err) {
      if (!window.__dbg) window.__dbg = {};
      window.__dbg.renderErr = (window.__dbg.renderErr || '') + String(err && err.stack || err) + '\n';
      window.__dbg.renderErrCount = (window.__dbg.renderErrCount || 0) + 1;
    }
  }

  function renderFrame(t) {

    // scale canvas theo màn hình
    fitCanvas();

    const s1 = snaps.last();
    if (!s1) return;
    const s0 = snaps.prev();
    // DSA 3: delay nội suy THÍCH NGHI — mạng nhanh → ~90ms, mạng jitter → tự nới tới 220ms
    const nowT = performance.now();
    const delay = Math.min(220, Math.max(90, (snapInterval || 66) * 1.5 + 20));
    const span = (s1.rt - s0.rt) || (snapInterval || 66);
    const k = Math.min(1.25, Math.max(0, (nowT - delay - s0.rt) / span));

    if (!bgPainted) paintBg();
    cx.drawImage(bg, 0, 0);

    // rung màn hình khi bị đụng
    cx.save();
    if (shakeT > 0) {
      shakeT -= 1 / 60;
      cx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
    }

    // nước động
    const wf = Math.floor(t / 420) % 2;
    for (let row = 0; row < CFG.MAP_H; row++) {
      for (let col = 0; col < CFG.MAP_W; col++) {
        if (CFG.MAP[row][col] === 'w') cx.drawImage(wf ? SPR.tiles.water1 : SPR.tiles.water2, col * 16, row * 16);
      }
    }

    // cổng đích
    const meEnt = s1.d.ps.find(p => p[8] === mySid);
    const myProgress = meEnt ? meEnt[5] : 0;
    Sprites.drawGate(cx, CFG.GATE.x - 10, CFG.GATE.y - 26, myProgress >= CFG.RULES.TARGET_LANTERNS, t);

    // đồ vật (kênh riêng 'items' — event-driven)
    for (const it of items) {
      const type = CFG.ITEM_TYPES[it[1]];
      const spr = SPR.items[type];
      if (!spr) continue;
      const bob = Math.sin(t / 260 + it[0] * 1.7) * 1.6;
      const x = Math.round(it[2] - spr.width / 2);
      const y = Math.round(it[3] - spr.height / 2 + bob);
      if (type === 'star' || type === 'drum') {
        cx.fillStyle = type === 'star' ? 'rgba(255,210,59,0.16)' : 'rgba(255,90,78,0.14)';
        cx.beginPath(); cx.arc(it[2], it[3], 9, 0, 7); cx.fill();
      }
      cx.drawImage(spr, x, y);
    }

    // hiệu ứng fx
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      const age = t - f.t;
      if (age > 700) { fx.splice(i, 1); continue; }
      if (f.type === 'spark') {
        cx.fillStyle = f.color;
        const rr = age / 90;
        for (let a = 0; a < 6; a++) {
          const ang = a * Math.PI / 3;
          cx.fillRect(Math.round(f.x + Math.cos(ang) * rr * 8) - 1, Math.round(f.y + Math.sin(ang) * rr * 8) - 1, 2, 2);
        }
      } else if (f.type === 'ring') {
        cx.strokeStyle = `rgba(255,210,59,${1 - age / 700})`;
        cx.beginPath(); cx.arc(f.x, f.y, 6 + age / 40, 0, 7); cx.stroke();
      } else if (f.type === 'burst') {
        cx.fillStyle = `rgba(232,69,69,${1 - age / 700})`;
        const rr = age / 60;
        for (let a = 0; a < 8; a++) {
          const ang = a * Math.PI / 4;
          cx.fillRect(Math.round(f.x + Math.cos(ang) * rr * 10) - 1, Math.round(f.y + Math.sin(ang) * rr * 10) - 1, 3, 3);
        }
      } else if (f.type === 'excl') {
        cx.fillStyle = age % 180 < 90 ? '#fff' : '#ffd23b';
        cx.font = '700 11px "Pixelify Sans", monospace';
        cx.textAlign = 'center';
        cx.fillText('❗', Math.round(f.x), Math.round(f.y));
      }
    }

    // người chơi (nội suy) — cache map nội suy theo cặp snapshot để giảm GC
    if (interCache.key !== s0.rt + ':' + s1.rt) {
      interCache.p0 = new Map(s0.d.ps.map(p => [p[0], p]));
      interCache.l0 = new Map(s0.d.ls.map(l => [l[0], l]));
      interCache.key = s0.rt + ':' + s1.rt;
    }
    const p0map = interCache.p0;
    // --- (v3) MÔ PHỎNG LOCAL 60FPS cho chính mình: điều khiển tức thì, không chờ mạng ---
    const inp = readInput();
    const stunnedNow = performance.now() < selfStunUntil;
    if (ghost.have && !stunnedNow && (inp.dx || inp.dy)) {
      const G = CFG.RULES;
      const boosting = performance.now() < selfBoostUntil;
      const speed = G.PLAYER_SPEED * (boosting ? G.BOOST_MULT : 1);
      const m = Math.hypot(inp.dx, inp.dy) || 1;
      const fdt = Math.min(0.05, (t - lastFrameT) / 1000) || 0.016;
      ghostMove((inp.dx / m) * speed * fdt, (inp.dy / m) * speed * fdt);
      if (inp.dx !== 0) ghost.dir = inp.dx > 0 ? 1 : -1;
      ghost.moving = true;
      lastMoveT = performance.now();
    } else {
      ghost.moving = false;
    }
    lastFrameT = t;

    for (const p of s1.d.ps) {
      const [id, x1, y1, dir, fl, prog, score, name] = p;
      const boosting = fl & 8;
      const prev = p0map.get(id);
      let x = prev ? lerp(prev[1], x1, k) : x1;
      let y = prev ? lerp(prev[2], y1, k) : y1;

      const isMe = p[8] === mySid;
      if (isMe && ghost.have) {
        // vị trí của chính mình = mô phỏng local — KHÔNG còn bị kéo về vị trí server (hết rubber-band)
        x = ghost.x; y = ghost.y;
      }

      const stunned = fl & 2, invuln = fl & 4, fin = fl & 16, champ = fl & 32;
      if (invuln && Math.floor(t / 90) % 2) continue; // nhấp nháy bất tử

      const moving = fl & 1;
      const frame = moving ? Math.floor(t / 130) % 2 : 0;
      const spr = (dir < 0 ? SPR.playerFlip : SPR.player)[frame];
      const px = Math.round(x - 5), py = Math.round(y - 9);

      if (fin) {
        // cắm cờ ở cổng
        cx.fillStyle = '#fff3d9';
        cx.fillRect(px + 4, py - 10, 1, 10);
        cx.fillStyle = champ ? '#ffd23b' : '#5ad6c8';
        cx.fillRect(px + 5, py - 10, 6, 5);
      }
      if (stunned) {
        cx.fillStyle = '#ffd23b';
        const ang = t / 120;
        for (let a = 0; a < 3; a++) {
          cx.fillRect(Math.round(x + Math.cos(ang + a * 2.1) * 7) - 1, Math.round(y - 12 + Math.sin(ang + a * 2.1) * 2) - 1, 2, 2);
        }
      }
      if (boosting) {
        cx.fillStyle = 'rgba(255,122,60,0.5)';
        cx.fillRect(px - (dir > 0 ? 3 : -9), py + 8, 3, 2);
        cx.fillRect(px - (dir > 0 ? 5 : -11), py + 10, 3, 2);
      }
      cx.drawImage(spr, px, py);

      // tên
      cx.font = '700 8px "Pixelify Sans", monospace';
      cx.textAlign = 'center';
      cx.lineWidth = 2;
      cx.strokeStyle = 'rgba(10,6,26,0.9)';
      cx.strokeText(name, Math.round(x), py - 3);
      cx.fillStyle = champ ? '#ffd23b' : isMe ? '#5ad6c8' : '#fff3d9';
      cx.fillText(name, Math.round(x), py - 3);
      if (champ) { cx.font = '8px monospace'; cx.fillText('👑', Math.round(x) + 12, py - 3); }
    }

    // lân (nội suy)
    const l0map = interCache.l0;
    for (const l of s1.d.ls) {
      const [id, x1, y1, dir, state] = l;
      const prev = l0map.get(id);
      const x = prev ? lerp(prev[1], x1, k) : x1;
      const y = prev ? lerp(prev[2], y1, k) : y1;
      const frame = Math.floor(t / (state === 'dash' ? 70 : 160)) % 2;
      const spr = (dir < 0 ? SPR.lionFlip : SPR.lion)[frame];
      const px = Math.round(x - spr.width / 2), py = Math.round(y - spr.height / 2);

      if (state === 'dash') {
        cx.fillStyle = 'rgba(255,90,78,0.3)';
        cx.fillRect(px - dir * 8, py + 2, spr.width, spr.height - 6);
      }
      if (state === 'telegraph' && Math.floor(t / 120) % 2) {
        cx.fillStyle = 'rgba(255,255,255,0.35)';
        cx.fillRect(px, py, spr.width, spr.height);
      }
      cx.drawImage(spr, px, py);
      if (state === 'flee') {
        cx.font = '700 9px "Pixelify Sans", monospace';
        cx.textAlign = 'center';
        cx.fillStyle = '#5ad6c8';
        cx.fillText('chạy rồi! 💨', Math.round(x), py + spr.height / 2 + 12);
      }
      // 🔔 NHÃN "LÂN" ghi rõ trên đầu — người chơi không thể nhầm với nhân vật
      cx.font = '700 8px "Pixelify Sans", monospace';
      cx.textAlign = 'center';
      cx.lineWidth = 2.5;
      cx.strokeStyle = 'rgba(10,6,26,0.92)';
      const label = state === 'dash' ? 'LÂN!!' : state === 'telegraph' ? 'LÂN !' : 'LÂN';
      cx.strokeText(label, Math.round(x), py - 5);
      cx.fillStyle = state === 'dash' ? '#ff5a4e' : state === 'telegraph' ? '#ffd23b' : '#ffb39f';
      cx.fillText(label, Math.round(x), py - 5);
    }

    // đom đóm trang trí
    cx.fillStyle = 'rgba(255,243,176,0.8)';
    for (let i = 0; i < 10; i++) {
      const fxp = (Math.sin(t / 1300 + i * 2.4) * 0.5 + 0.5) * 480;
      const fyp = 40 + (Math.cos(t / 1700 + i * 1.8) * 0.5 + 0.5) * 200;
      if (Math.floor(t / 300 + i) % 3 === 0) cx.fillRect(Math.round(fxp), Math.round(fyp), 1, 1);
    }

    cx.restore();
  }

  let lastScale = 0;
  function fitCanvas() {
    const vw = innerWidth - 6, vh = innerHeight - 6;
    let s = Math.min(vw / CFG.W, vh / CFG.H);
    if (s >= 1) s = Math.floor(s);
    s = Math.max(s, 0.5);
    if (s !== lastScale) {
      lastScale = s;
      cv.style.width = Math.floor(CFG.W * s) + 'px';
      cv.style.height = Math.floor(CFG.H * s) + 'px';
    }
  }

  // gợi ý xoay ngang
  function checkRotate() {
    const portrait = innerHeight > innerWidth && innerWidth < 560;
    const dismissed = sessionStorage.getItem('tt_rotate_ok') === '1';
    $('#rotate-hint').hidden = !(portrait && dismissed === false && running);
  }
  $('#btn-rotate-ok').addEventListener('click', () => {
    sessionStorage.setItem('tt_rotate_ok', '1');
    $('#rotate-hint').hidden = true;
  });
  addEventListener('resize', checkRotate);

  // ============ KHỞI ĐỘNG ============
  async function boot() {
    try {
      CFG = await (await fetch('/api/config')).json();
    } catch {
      $('#overlay-error').hidden = false;
      return;
    }
    SPR = Sprites.build();
    // vẽ mini sprite trong phần hướng dẫn
    document.querySelectorAll('.mini').forEach((m) => {
      const kind = m.dataset.sprite;
      const g = m.getContext('2d');
      g.imageSmoothingEnabled = false;
      if (kind === 'gate') {
        m.width = 60; m.height = 40; m.style.height = '34px';
        Sprites.drawGate(g, 0, 0, true, 0);
      } else if (kind === 'lion') {
        g.drawImage(SPR.lion[0], 0, 0, SPR.lion[0].width * 1.5, SPR.lion[0].height * 1.5);
      } else {
        const spr = SPR.items[kind];
        if (spr) g.drawImage(spr, 0, 0, spr.width * 2, spr.height * 2);
      }
    });
    requestAnimationFrame(skyLoop);
    // đã có token (refresh giữa chừng) → vào lại ngay
    if (token) {
      $('#screen-login').hidden = true;
      $('#screen-game').hidden = false;
      $('#overlay-loading').hidden = false;
      startGame();
    }
  }

  function startGame() {
    skyRunning = false;
    $('#screen-login').hidden = true;
    $('#screen-game').hidden = false;
    $('#overlay-loading').hidden = false;
    AudioManager.startMusic();
    checkRotate();
    connect();
  }

  boot();
})();
