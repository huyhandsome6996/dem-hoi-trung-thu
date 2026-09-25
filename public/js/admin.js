// ============================================================
//  ĐÊM HỘI TRUNG THU — Trang Admin
//  Đăng nhập Admin + bảng người chơi live + trao quà + lượt mới
// ============================================================
'use strict';

(() => {
  const $ = (sel) => document.querySelector(sel);
  let adminToken = sessionStorage.getItem('tt_admin') || null;
  let timer = null;

  // nền trời trang trí (dùng chung sprites)
  const bgCv = $('#bg-canvas');
  const bgCx = bgCv.getContext('2d');
  let skyOn = true;
  function skyLoop(t) {
    if (!skyOn) return;
    if (bgCv.width !== innerWidth || bgCv.height !== innerHeight) {
      bgCv.width = innerWidth; bgCv.height = innerHeight;
    }
    Sprites.drawSky(bgCx, bgCv.width, bgCv.height, t, null);
    requestAnimationFrame(skyLoop);
  }
  requestAnimationFrame(skyLoop);

  // ---------- đăng nhập ----------
  $('#ad-login').addEventListener('click', async () => {
    const username = $('#ad-user').value.trim();
    const password = $('#ad-pass').value;
    const err = $('#ad-err');
    err.hidden = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Đăng nhập thất bại');
      adminToken = data.token;
      sessionStorage.setItem('tt_admin', adminToken);
      enterDashboard();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    }
  });
  $('#ad-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#ad-login').click(); });

  $('#logout').addEventListener('click', () => {
    sessionStorage.removeItem('tt_admin');
    location.reload();
  });

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken, ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      sessionStorage.removeItem('tt_admin');
      location.reload();
      throw new Error('Hết phiên đăng nhập');
    }
    return res;
  }

  function enterDashboard() {
    $('#login-card').hidden = true;
    $('#dashboard').hidden = false;
    $('#logout').hidden = false;
    refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 2000);
  }

  // ---------- tải dữ liệu ----------
  async function refresh() {
    let data;
    try {
      const res = await api('/api/admin/state');
      data = await res.json();
    } catch { return; }

    const r = data.round || {};
    $('#st-online').textContent = data.online ?? 0;
    $('#st-players').textContent = r.player_count ?? 0;
    $('#st-fin').textContent = r.finisher_count ?? 0;
    $('#st-gifts').textContent = data.stats?.total_gifts ?? 0;
    $('#st-total').textContent = data.stats?.total_players ?? 0;

    const cb = $('#champ-banner');
    if (data.championNow) {
      cb.textContent = `👑 NGƯỜI CHIẾN THẮNG ĐẦU TIÊN: ${data.championNow.name} (${data.championNow.studentId})`;
      cb.classList.remove('none');
    } else {
      cb.textContent = `⏳ Lượt #${r.id ?? '?'} — chưa có ai về đích...`;
      cb.classList.add('none');
    }

    $('#btn-csv').href = '/api/admin/csv'; // token qua header? dùng link kèm token query

    const dupMap = {};
    for (const d of data.duplicates || []) dupMap[d.student_id] = d.names;

    const tb = $('#tbl-body');
    tb.innerHTML = '';
    const players = data.players || [];
    players.forEach((p, i) => {
      const tr = document.createElement('tr');
      if (p.is_champion) tr.className = 'champ-row';
      const fin = !!p.finished_at;
      const dup = dupMap[p.student_id] ? ' <span class="tag tag-dup" title="' + esc(dupMap[p.student_id]) + '">⚠ trùng MSSV</span>' : '';
      const status = p.is_champion
        ? '<span class="tag tag-fin">👑 CHÍNH</span>'
        : fin ? '<span class="tag tag-fin">🏁 Hạng ' + (p.finish_rank ?? '') + '</span>'
              : '<span class="tag tag-play">🏮 ' + p.lanterns + '/10</span>';
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${esc(p.name)}${p.is_champion ? ' 👑' : ''}</td>
        <td class="${dupMap[p.student_id] ? 'mssv-dup' : ''}">${esc(p.student_id)}</td>
        <td>${p.lanterns}</td>
        <td>${p.score}</td>
        <td>${p.hits}</td>
        <td>${fmtTime(p.joined_at)}</td>
        <td>${p.finished_at ? fmtTime(p.finished_at) : '—'}</td>
        <td>${status}${dup}</td>
        <td><button class="gift-btn ${p.gift_given ? 'on' : ''}" data-id="${p.id}">${p.gift_given ? '🎁 ĐÃ TRAO' : 'CHƯA'}</button></td>
      `;
      tr.querySelector('.gift-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const nv = !btn.classList.contains('on');
        await api('/api/admin/gift', { method: 'PATCH', body: JSON.stringify({ playerId: Number(btn.dataset.id), gift: nv }) });
        refresh();
      });
      tb.appendChild(tr);
    });
    if (!players.length) {
      tb.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--ink-dim)">Chưa có người chơi nào ở lượt này — gửi link cho mọi người thôi! 🏮</td></tr>';
    }
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
  };

  // ---------- nút điều khiển ----------
  $('#btn-round').addEventListener('click', async () => {
    if (!confirm('Bắt đầu LƯỢT MỚI? Tiến độ mọi người sẽ đặt lại về 0.')) return;
    await api('/api/admin/round', { method: 'POST', body: '{}' });
    refresh();
  });

  // CSV tải kèm token (header không dùng được cho <a download>)
  $('#btn-csv').addEventListener('click', async (e) => {
    e.preventDefault();
    const res = await api('/api/admin/csv');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'trung-thu-players.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btn-clear').addEventListener('click', async () => {
    if (!confirm('XOÁ TOÀN BỘ dữ liệu người chơi + mọi lượt đấu? KHÔNG thể hoàn tác!')) return;
    if (!confirm('Chắc chắn chứ? Đây là lần xác nhận cuối!')) return;
    await api('/api/admin/clear', { method: 'POST', body: '{}' });
    refresh();
  });

  // vào dashboard ngay nếu còn phiên
  if (adminToken) enterDashboard();
})();
