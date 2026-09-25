// ============================================================
//  ĐÊM HỘI TRUNG THU — Âm thanh
//  Nhạc nền: ưu tiên file /audio/den-ong-sao.mp3 (nếu có)
//  Không có file → tự chơi chiptune 8-bit lấy cảm hứng "Chiếc Đèn Ông Sao"
//  SFX: tổng hợp bằng WebAudio (không cần file)
// ============================================================
'use strict';

const AudioManager = (() => {
  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let muted = localStorage.getItem('tt_mute') === '1';
  let started = false, chipTimer = null, chipStep = 0;

  // ---------- ghi chú nhạc ----------
  const NOTES = {};
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  for (let oct = 2; oct <= 6; oct++) {
    for (let i = 0; i < 12; i++) {
      const midi = (oct + 1) * 12 + i;
      NOTES[NAMES[i] + oct] = 440 * Math.pow(2, (midi - 69) / 12);
    }
  }

  // Giai điệu 8-bit vui tươi, phóng khoáng theo phong cách đèn ông sao (nhịp 6/8)
  // Bước = 0.16s. null = nghỉ.
  const LEAD = [
    'E5', 'G5', 'C6', 'G5', 'E5', 'G5', null, 'E5',
    'D5', 'E5', 'G5', 'E5', 'C5', null, 'C5', null,
    'E5', 'G5', 'A5', 'G5', 'E5', 'G5', 'A5', null,
    'G5', 'E5', 'D5', 'E5', 'C5', null, null, null,
    'C6', 'C6', 'A5', 'G5', 'A5', 'C6', null, 'A5',
    'G5', 'E5', 'G5', 'A5', 'G5', 'E5', 'D5', null,
    'E5', 'D5', 'C5', 'D5', 'E5', 'G5', 'E5', 'D5',
    'C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'C5', null,
  ];
  const BASS = [
    'C3', null, 'C3', null, 'A2', null, 'A2', null,
    'F2', null, 'F2', null, 'G2', null, 'G2', null,
    'C3', null, 'C3', null, 'A2', null, 'A2', null,
    'F2', null, 'G2', null, 'C3', null, null, null,
    'A2', null, 'A2', null, 'F2', null, 'F2', null,
    'C3', null, 'C3', null, 'G2', null, 'G2', null,
    'A2', null, 'A2', null, 'F2', null, 'F2', null,
    'C3', null, 'G2', null, 'C3', null, null, null,
  ];
  const STEP = 0.16;

  // ---------- khởi tạo ----------
  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.32;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.5;
      sfxGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  // ---------- nhạc nền ----------
  async function startMusic() {
    if (started) return;
    started = true;
    ensureCtx();
    // thử MP3 trước
    try {
      const res = await fetch('/audio/den-ong-sao.mp3', { cache: 'force-cache' });
      if (res.ok) {
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(musicGain);
        src.start();
        return; // thành công → không cần chiptune
      }
    } catch (e) { /* rơi xuống chiptune */ }
    startChiptune();
  }

  function startChiptune() {
    const lookahead = 0.35;
    let nextTime = ctx.currentTime + 0.1;
    const leadOsc = (t, note, dur) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = NOTES[note];
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur);
    };
    const bassOsc = (t, note, dur) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = NOTES[note];
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur);
    };
    const hat = (t) => {
      const len = 0.03, buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const g = ctx.createGain(); g.gain.value = 0.05;
      s.connect(g); g.connect(musicGain);
      s.start(t);
    };
    chipTimer = setInterval(() => {
      while (nextTime < ctx.currentTime + lookahead) {
        const i = chipStep % LEAD.length;
        if (LEAD[i]) leadOsc(nextTime, LEAD[i], STEP * 1.7);
        if (BASS[i]) bassOsc(nextTime, BASS[i], STEP * 1.9);
        if (i % 2 === 0) hat(nextTime);
        nextTime += STEP;
        chipStep++;
      }
    }, 150);
  }

  // ---------- SFX ----------
  function tone(f0, f1, dur, type = 'square', vol = 0.2, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur = 0.15, vol = 0.25, low = false) {
    if (!ctx || muted) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = low ? 'lowpass' : 'highpass';
    f.frequency.value = low ? 700 : 2200;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(sfxGain);
    s.start();
  }

  function play(name) {
    if (!ctx || muted) return;
    switch (name) {
      case 'collect': tone(660, 990, 0.09, 'square', 0.18); tone(990, 1320, 0.08, 'square', 0.12, 0.07); break;
      case 'star':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.16, i * 0.06));
        break;
      case 'power': tone(300, 900, 0.28, 'sawtooth', 0.14); break;
      case 'drum':
        tone(130, 55, 0.3, 'sine', 0.5); noise(0.12, 0.2, true);
        tone(110, 50, 0.25, 'sine', 0.4, 0.14);
        break;
      case 'hit': tone(240, 90, 0.25, 'sawtooth', 0.3); noise(0.2, 0.25, true); break;
      case 'ready': [523, 659, 784].forEach((f, i) => tone(f, f, 0.09, 'triangle', 0.2, i * 0.07)); break;
      case 'finish':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, f, 0.14, 'square', 0.2, i * 0.11));
        break;
      case 'champion':
        [523, 523, 523, 659, 784, 784, 1047].forEach((f, i) => tone(f, f, 0.16, 'square', 0.22, i * 0.13));
        [262, 262, 392, 523].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.18, i * 0.26));
        break;
      case 'join': tone(440, 660, 0.08, 'triangle', 0.12); break;
      case 'click': tone(880, 880, 0.05, 'square', 0.1); break;
    }
  }

  function setMuted(m) {
    muted = m;
    localStorage.setItem('tt_mute', m ? '1' : '0');
    if (master) master.gain.value = m ? 0 : 1;
  }
  function isMuted() { return muted; }

  return { startMusic, play, setMuted, isMuted, ensureCtx };
})();
