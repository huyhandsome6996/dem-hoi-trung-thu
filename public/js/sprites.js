// ============================================================
//  ĐÊM HỘI TRUNG THU — Pixel art vẽ tay bằng code (không dùng ảnh)
//  Mỗi sprite = mảng chuỗi ký tự + bảng màu → vẽ ra canvas nhỏ
// ============================================================
'use strict';

const Sprites = (() => {
  // ---------- helper ----------
  function makeSprite(rows, palette, scale = 1) {
    const w = rows[0].length, h = rows.length;
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const col = palette[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    return c;
  }

  function flipH(canvas) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d');
    g.translate(canvas.width, 0);
    g.scale(-1, 1);
    g.drawImage(canvas, 0, 0);
    return c;
  }

  // ---------- BẢNG MÀU CHUNG ----------
  const P = {
    h: '#3a2a1e', f: '#f4c39a', e: '#2b1a12',           // tóc, da, mắt
    r: '#e84545', R: '#ff6a5e', g: '#ffd23b',           // áo đỏ, đỏ sáng, vàng gold
    d: '#3a2a5e', b: '#1a1030',                          // quần, giày
    s: '#f4c39a',
    G: '#3fae5a', g2: '#2c8a44', W: '#fff3e0', w: '#ffffff',
    o: '#8a5a2a', m: '#b5793a', M: '#d9a05b', N: '#8a5a2a',
    y: '#ffd23b', Y: '#fff3b0',
    t: '#2c8a44', T: '#3fae5a', k: '#1e5c30',
    u: '#7a4a2a',
  };

  // ---------- NGƯỜI CHƠI (10x14, hướng phải) ----------
  const kidRows = [
    '...hhhh...',
    '..hhhhhh..',
    '..hffffh..',
    '..feffef..',
    '..ffffff..',
    '...ffff...',
    '..rrrrrr..',
    '.rrrrrrrr.',
    '.srrrrrrs.',
    '..rrrrrr..',
    '..gggggg..',
    '...dddd...',
    '...d..d...',
    '..bb..bb..',
  ];
  const kidRows2 = [
    '...hhhh...',
    '..hhhhhh..',
    '..hffffh..',
    '..feffef..',
    '..ffffff..',
    '...ffff...',
    '..rrrrrr..',
    '.rrrrrrrr.',
    '.srrrrrrs.',
    '..rrrrrr..',
    '..gggggg..',
    '...dddd...',
    '..d....d..',
    '.bb....bb.',
  ];

  // ---------- LÂN (22x15, hướng phải) ----------
  const lionRows = [
    '.............ggg......',
    '............gGGg......',
    '...gggggg..gGGGg......',
    '..ggGGGGgggGGGGgg.....',
    '.gGGGGGGGGGGGGGGGg....',
    '.gGGwwGGGGGGGGGGGg....',
    'gGGGwweGGGGGGGGGGGg...',
    'gGGGwweGGGGGGGGRRRg...',
    'gGGGGGGGGGGGGGRRRRRg..',
    '.gGGGGGGGGGGGRRRRRRg..',
    '.gGGGGGGGGGGGGGRRg....',
    '.wGGGGGGGGGGGGGGGg....',
    '..wwGGGGGGGGGGGww.....',
    '...wwwwwwwwwwwww......',
    '....bb..bb..bb........',
  ];
  const lionRows2 = [
    '.............ggg......',
    '............gGGg......',
    '...gggggg..gGGGg......',
    '..ggGGGGgggGGGGgg.....',
    '.gGGGGGGGGGGGGGGGg....',
    '.gGGwwGGGGGGGGGGGg....',
    'gGGGwweGGGGGGGGGGGg...',
    'gGGGwweGGGGGGGGRRRg...',
    'gGGGGGGGGGGGGGRRRRRg..',
    '.gGGGGGGGGGGGRRRRRRg..',
    '.gGGGGGGGGGGGGGRRg....',
    '.wGGGGGGGGGGGGGGGg....',
    '..wwGGGGGGGGGGGww.....',
    '...wwwwwwwwwwwww......',
    '......bb..bb....bb....',
  ];
  const lionPal = { ...P, G: '#3fae5a', g: '#ffd23b', w: '#fff3e0', e: '#1a1030', R: '#e84545', b: '#1e5c30' };

  // ---------- ĐỒ VẬT ----------
  const lanternRows = [
    '...gg...',
    '..gggg..',
    '.rRRRRr.',
    'rRwRRRRr',
    'rRwRRRRr',
    'rRRRRRRr',
    '.rRRRRr.',
    '..gggg..',
    '...yy...',
    '...yy...',
  ];
  const lanternPal = { g: '#ffd23b', r: '#d8383e', R: '#ff5a4e', w: '#ffd9d0', y: '#ff7a3c' };

  const starRows = [
    '.....yy.....',
    '.....yy.....',
    '....yYYy....',
    'yyyyyYYyyyyy',
    '.yyYYYYYYyy.',
    '..yYYYYYYy..',
    '...yYYYYy...',
    '...yYYYYy...',
    '..yYy..yYy..',
    '.yYy....yYy.',
    '....o..o....',
    '.....oo.....',
  ];
  const starPal = { y: '#ffd23b', Y: '#fff3b0', o: '#8a5a2a' };

  const mooncakeRows = [
    '..mmmm..',
    '.mMMMMm.',
    'mMNNNNMm',
    'mMNMMNMm',
    'mMNMMNMm',
    'mMNNNNMm',
    '.mMMMMm.',
    '..mmmm..',
  ];
  const mooncakePal = { m: '#b5793a', M: '#d9a05b', N: '#8a5a2a' };

  const drumRows = [
    '.ggggggg.',
    '.gRRRRRg.',
    'gRRRRRRRg',
    'gRwRRRwRg',
    'gRRRRRRRg',
    'gRRRRRRRg',
    '.gRRRRRg.',
    '.ggggggg.',
    '..d...d..',
  ];
  const drumPal = { g: '#ffd23b', R: '#e84545', w: '#fff3e0', d: '#8a5a2a' };

  // ---------- CẢNH VẬT ----------
  const treeRows = [
    '....kkkkk.....',
    '..kkTTTTTkk...',
    '.kTTTTTTTTTk..',
    '.kTTTkkTTTTk..',
    'kTTTTkkTTTTTk.',
    'kTTTTTTTTTTTk.',
    '.kTTTTTTTTTk..',
    '.kTTTTTTTTTk..',
    '..kkTTTTTkk...',
    '....kkkkk.....',
    '.....uuu......',
    '.....uuu......',
    '.....uuu......',
    '....uuuuu.....',
  ];
  const treePal = { k: '#1e5c30', T: '#3fae5a', u: '#7a4a2a' };

  const crateRows = [
    'uuuuuuuuuuuu',
    'uMMMMMMMMMMu',
    'uMmmmmmmmmMu',
    'uMmMMMMMMmMu',
    'uMmMmmmmMmMu',
    'uMmMmMMmMmMu',
    'uMmMmmmmMmMu',
    'uMmMMMMMMmMu',
    'uMmmmmmmmmMu',
    'uuuuuuuuuuuu',
  ];
  const cratePal = { u: '#5a3a1e', M: '#8a5a2a', m: '#6e4522' };

  // ---------- Ô NỀN ----------
  function makeTile(draw) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d');
    draw(g);
    return c;
  }

  const tiles = {
    grass1: makeTile((g) => {
      g.fillStyle = '#23402e'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#2b4f38';
      g.fillRect(2, 3, 2, 1); g.fillRect(9, 2, 2, 1); g.fillRect(5, 9, 2, 1); g.fillRect(12, 11, 2, 1);
      g.fillStyle = '#1a3424';
      g.fillRect(6, 5, 1, 1); g.fillRect(13, 6, 1, 1); g.fillRect(1, 12, 1, 1); g.fillRect(9, 14, 1, 1);
    }),
    grass2: makeTile((g) => {
      g.fillStyle = '#25452f'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#2d5339';
      g.fillRect(4, 2, 2, 1); g.fillRect(11, 5, 2, 1); g.fillRect(2, 11, 2, 1); g.fillRect(8, 13, 2, 1);
      g.fillStyle = '#1a3424';
      g.fillRect(7, 7, 1, 1); g.fillRect(14, 9, 1, 1); g.fillRect(3, 6, 1, 1);
    }),
    path: makeTile((g) => {
      g.fillStyle = '#7a5c3e'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#8a6a48';
      g.fillRect(1, 1, 3, 1); g.fillRect(9, 3, 3, 1); g.fillRect(4, 8, 2, 1); g.fillRect(12, 12, 3, 1);
      g.fillStyle = '#684c32';
      g.fillRect(6, 5, 1, 1); g.fillRect(13, 7, 1, 1); g.fillRect(2, 13, 1, 1); g.fillRect(8, 14, 2, 1);
    }),
    hedge: makeTile((g) => {
      g.fillStyle = '#14301e'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#1e4a2c';
      g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
      g.fillStyle = '#2c6a3c';
      g.fillRect(2, 1, 3, 2); g.fillRect(10, 9, 3, 2); g.fillRect(6, 5, 2, 1);
      g.fillStyle = '#0d2014';
      g.fillRect(0, 14, 16, 2);
    }),
    stage: makeTile((g) => {
      g.fillStyle = '#8a3030'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#a03c3c';
      g.fillRect(0, 2, 16, 1); g.fillRect(0, 7, 16, 1); g.fillRect(0, 12, 16, 1);
      g.fillStyle = '#6e2424';
      g.fillRect(0, 5, 16, 1); g.fillRect(0, 10, 16, 1); g.fillRect(0, 15, 16, 1);
      g.fillStyle = '#ffd23b';
      g.fillRect(7, 0, 2, 16);
    }),
    water1: makeTile((g) => {
      g.fillStyle = '#1d3a6e'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#2a5590';
      g.fillRect(1, 3, 5, 1); g.fillRect(9, 7, 5, 1); g.fillRect(3, 12, 4, 1);
      g.fillStyle = '#4a7ab8';
      g.fillRect(4, 3, 1, 1); g.fillRect(12, 7, 1, 1); g.fillRect(6, 12, 1, 1);
    }),
    water2: makeTile((g) => {
      g.fillStyle = '#1d3a6e'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#2a5590';
      g.fillRect(3, 4, 5, 1); g.fillRect(8, 9, 5, 1); g.fillRect(6, 14, 4, 1);
      g.fillStyle = '#4a7ab8';
      g.fillRect(6, 4, 1, 1); g.fillRect(11, 9, 1, 1); g.fillRect(9, 14, 1, 1);
    }),
  };

  // ---------- BUILD ALL ----------
  function build() {
    const player = [makeSprite(kidRows, P), makeSprite(kidRows2, P)];
    const lion = [makeSprite(lionRows, lionPal), makeSprite(lionRows2, lionPal)];
    return {
      player,
      playerFlip: player.map(flipH),
      lion,
      lionFlip: lion.map(flipH),
      items: {
        lantern: makeSprite(lanternRows, lanternPal),
        star: makeSprite(starRows, starPal),
        mooncake: makeSprite(mooncakeRows, mooncakePal),
        drum: makeSprite(drumRows, drumPal),
      },
      tree: makeSprite(treeRows, treePal),
      crate: makeSprite(crateRows, cratePal),
      tiles,
    };
  }

  // ---------- CỔNG ĐÍCH (vẽ tay mỗi frame để có glow) ----------
  function drawGate(g, x, y, active, t) {
    const w = 60, h = 34;
    const glow = active ? 0.5 + 0.3 * Math.sin(t / 180) : 0;
    // cột
    g.fillStyle = '#a03c3c';
    g.fillRect(x + 4, y + 8, 7, h - 8);
    g.fillRect(x + w - 11, y + 8, 7, h - 8);
    g.fillStyle = '#6e2424';
    g.fillRect(x + 9, y + 8, 2, h - 8);
    g.fillRect(x + w - 13, y + 8, 2, h - 8);
    // mái vàng 2 tầng
    g.fillStyle = '#ffd23b';
    g.fillRect(x, y + 2, w, 4);
    g.fillRect(x + 6, y + 6, w - 12, 3);
    g.fillStyle = '#ff7a3c';
    g.fillRect(x, y, w, 2);
    // đèn lồng treo 2 bên
    g.fillStyle = active ? '#ff5a4e' : '#8a3030';
    g.fillRect(x + 5, y + 12, 5, 6);
    g.fillRect(x + w - 10, y + 12, 5, 6);
    // banner ĐÍCH
    g.fillStyle = '#c22828';
    g.fillRect(x + 14, y + 11, w - 28, 15);
    if (active) {
      g.fillStyle = `rgba(255, 210, 59, ${glow})`;
      g.fillRect(x + 12, y + 9, w - 24, 19);
    }
    g.fillStyle = active ? '#fff3b0' : '#ffd23b';
    g.font = '700 11px "Pixelify Sans", monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('ĐÍCH', x + w / 2, y + 19);
    // mặt đất trước cổng (vạch đích)
    g.fillStyle = active ? '#ffd23b' : '#4a3a7a';
    for (let i = 0; i < 6; i++) g.fillRect(x + 2 + i * 10, y + h - 2, 6, 2);
  }

  // ---------- TRỜI ĐÊM (màn đăng nhập + nền trang trí) ----------
  function drawSky(g, w, h, t, lanternCvs) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0b0820');
    grad.addColorStop(0.55, '#1a1233');
    grad.addColorStop(1, '#2b1d52');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // sao (nền giả lập cố định theo toạ độ)
    g.fillStyle = '#fff7d6';
    for (let i = 0; i < 90; i++) {
      const sx = (i * 9301 + 49297) % w;
      const sy = (i * 2339 + 7) % (h * 0.72);
      const tw = Math.sin(t / 500 + i * 1.7) > 0.55 ? 2 : 1;
      g.fillRect(Math.floor(sx), Math.floor(sy), tw, tw);
    }

    // trăng rằm + vành sáng
    const mx = w - Math.max(70, w * 0.12), my = h * 0.14, mr = Math.max(26, Math.min(w, h) * 0.055);
    g.fillStyle = 'rgba(255, 233, 163, 0.12)';
    g.beginPath(); g.arc(mx, my, mr * 1.9, 0, 7); g.fill();
    g.fillStyle = 'rgba(255, 233, 163, 0.2)';
    g.beginPath(); g.arc(mx, my, mr * 1.45, 0, 7); g.fill();
    g.fillStyle = '#ffe9a3';
    g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill();
    g.fillStyle = '#f5c96b';
    g.fillRect(mx - mr * 0.4, my - mr * 0.3, mr * 0.25, mr * 0.25);
    g.fillRect(mx + mr * 0.15, my + mr * 0.2, mr * 0.3, mr * 0.22);
    g.fillRect(mx - mr * 0.1, my + mr * 0.45, mr * 0.2, mr * 0.18);

    // lồng đèn trời bay lên
    if (lanternCvs) {
      for (let i = 0; i < 7; i++) {
        const period = 14000 + i * 2600;
        const ph = ((t % period) / period);
        const lx = (w * (0.08 + 0.13 * i) + Math.sin(t / 900 + i * 2.2) * 26) % w;
        const ly = h + 30 - ph * (h + 80);
        const s = i % 2 ? 1 : 0.7;
        g.globalAlpha = Math.min(1, ph * 6) * (i % 2 ? 0.9 : 0.55);
        g.drawImage(lanternCvs, Math.floor(lx), Math.floor(ly), Math.floor(lanternCvs.width * s), Math.floor(lanternCvs.height * s));
        g.globalAlpha = 1;
      }
    }
  }

  return { build, drawGate, drawSky, makeSprite };
})();
