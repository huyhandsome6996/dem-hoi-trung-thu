// ============================================================
//  ĐÊM HỘI TRUNG THU — Arena: mô phỏng game (server-authoritative)
//  Người chơi di chuyển, nhặt đèn, né Lân, về đích. Server là "trọng tài".
// ============================================================
'use strict';

const C = require('./game-config');
const { RULES, SCORE, ITEM_TYPES, ITEM_WEIGHTS, GATE } = C;

const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const now = () => Date.now();

function pickItemType() {
  const total = ITEM_WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ITEM_WEIGHTS.length; i++) {
    r -= ITEM_WEIGHTS[i];
    if (r <= 0) return ITEM_TYPES[i];
  }
  return 'lantern';
}

// Va chạm tròn với ô tĩnh: thử di chuyển từng trục
function moveWithCollision(ent, dx, dy, r) {
  // trục X
  let nx = ent.x + dx;
  if (!C.isSolidAt(nx - r, ent.y - r * 0.5) && !C.isSolidAt(nx + r, ent.y - r * 0.5) &&
      !C.isSolidAt(nx - r, ent.y + r * 0.5) && !C.isSolidAt(nx + r, ent.y + r * 0.5)) {
    ent.x = Math.max(r + 1, Math.min(C.W - r - 1, nx));
  }
  // trục Y
  let ny = ent.y + dy;
  if (!C.isSolidAt(ent.x - r, ny - r * 0.5) && !C.isSolidAt(ent.x + r, ny - r * 0.5) &&
      !C.isSolidAt(ent.x - r, ny + r * 0.5) && !C.isSolidAt(ent.x + r, ny + r * 0.5)) {
    ent.y = Math.max(r + 1, Math.min(C.H - r - 1, ny));
  }
}

class Item {
  constructor(id, type, x, y) {
    this.id = id; this.type = type; this.x = x; this.y = y;
    this.active = true; this.respawnAt = 0;
  }
}

class Lion {
  constructor(id, x, y) {
    this.id = id; this.x = x; this.y = y;
    this.dir = 1;
    this.state = 'patrol';       // patrol | telegraph | dash | recover | flee
    this.tx = x; this.ty = y;    // điểm đến hiện tại / điểm lao tới
    this.targetSid = null;
    this.stateUntil = 0;
    this.cooldownUntil = 0;
    this.fleeFrom = null;
    this.pickWaypoint();
  }

  pickWaypoint() {
    for (let i = 0; i < 24; i++) {
      const col = 1 + Math.floor(Math.random() * (C.MAP_W - 2));
      const row = 1 + Math.floor(Math.random() * (C.MAP_H - 2));
      const x = col * C.TILE + 8, y = row * C.TILE + 8;
      if (!C.isSolidAt(x, y)) { this.tx = x; this.ty = y; return; }
    }
  }

  setState(s, ms) {
    this.state = s;
    this.stateUntil = now() + ms;
  }
}

class Arena {
  constructor(roundId, onEvent) {
    this.roundId = roundId;
    this.onEvent = onEvent;           // (ev) => void  — server sẽ broadcast
    this.players = new Map();         // playerId -> entity
    this.items = [];
    this.lions = [];
    this.nextItemId = 1;
    this.finishCount = 0;
    this.champion = null;             // entity đã về đích đầu tiên
    this.reset(roundId);
  }

  reset(roundId) {
    this.roundId = roundId;
    this.finishCount = 0;
    this.champion = null;
    this.items = [];
    for (let i = 0; i < RULES.MAX_ITEMS_ON_MAP; i++) this.spawnItem(true);
    this.lions = C.LION_SPAWNS.map(([x, y], i) => new Lion(i, x, y));
    //-reset người chơi đang kết nối
    for (const p of this.players.values()) {
      const sp = this.pickSpawn();
      p.x = sp[0]; p.y = sp[1];
      p.progress = 0; p.score = 0; p.hits = 0;
      p.stunnedUntil = 0; p.invulnUntil = now() + RULES.SPAWN_INVULN_MS;
      p.boostUntil = 0; p.finishedRank = 0; p.champion = false;
      p.roundId = roundId;
    }
  }

  pickSpawn() {
    // chọn điểm spawn xa Lân nhất trong vài lựa chọn ngẫu nhiên
    let best = C.PLAYER_SPAWNS[0], bestD = -1;
    for (let i = 0; i < 4; i++) {
      const sp = C.PLAYER_SPAWNS[Math.floor(Math.random() * C.PLAYER_SPAWNS.length)];
      let d = Infinity;
      for (const l of this.lions) d = Math.min(d, dist2(sp[0], sp[1], l.x, l.y));
      if (d > bestD) { bestD = d; best = sp; }
    }
    return best;
  }

  spawnItem(initial = false) {
    if (this.items.filter(it => it.active).length >= RULES.MAX_ITEMS_ON_MAP) return;
    const used = new Set(this.items.filter(it => it.active).map(it => it.spot));
    for (let i = 0; i < 40; i++) {
      const idx = Math.floor(Math.random() * C.ITEM_SPOTS.length);
      if (used.has(idx)) continue;
      const [x, y] = C.spotCenter(C.ITEM_SPOTS[idx][0], C.ITEM_SPOTS[idx][1]);
      // không sinh đè lên người chơi
      let occupied = false;
      for (const p of this.players.values()) {
        if (dist2(p.x, p.y, x, y) < 18 * 18) { occupied = true; break; }
      }
      if (occupied) continue;
      const item = new Item(this.nextItemId++, pickItemType(), x, y);
      item.spot = idx;
      this.items.push(item);
      return item;
    }
  }

  /** Thêm người chơi (đã có hàng DB). Trả về entity */
  addPlayer(row, sid) {
    // nếu đang có entity cũ của player này (refresh trang) → tái sử dụng tiến độ
    const old = this.players.get(row.id);
    if (old) { old.sid = sid; old.lastSeen = now(); return old; }
    const sp = this.pickSpawn();
    const p = {
      id: row.id, sid, roundId: this.roundId,
      name: row.name, studentId: row.student_id,
      x: sp[0], y: sp[1], dir: 1, moving: false, animT: 0,
      progress: row.lanterns || 0,
      score: row.score || 0,
      hits: row.hits || 0,
      finishedRank: row.finish_rank || 0,
      champion: !!row.is_champion,
      stunnedUntil: 0,
      invulnUntil: now() + RULES.SPAWN_INVULN_MS,
      boostUntil: 0,
      input: { dx: 0, dy: 0 },
      lastSeen: now(),
    };
    if (p.finishedRank) p.finishedRank = row.finish_rank; // về đích rồi → đứng cổng cổ vũ
    this.players.set(p.id, p);
    return p;
  }

  removePlayer(playerId) { this.players.delete(playerId); }

  setPlayerInput(playerId, dx, dy) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.input.dx = Math.max(-1, Math.min(1, dx));
    p.input.dy = Math.max(-1, Math.min(1, dy));
  }

  // ================= TICK CHÍNH =================
  tick(dt) {
    const t = now();
    const events = [];

    // --- Người chơi ---
    for (const p of this.players.values()) {
      if (p.finishedRank) { p.moving = false; continue; }
      const stunned = t < p.stunnedUntil;
      const boosting = t < p.boostUntil;
      if (!stunned && (p.input.dx || p.input.dy)) {
        let mag = Math.hypot(p.input.dx, p.input.dy) || 1;
        const speed = RULES.PLAYER_SPEED * (boosting ? RULES.BOOST_MULT : 1);
        const dx = (p.input.dx / mag) * speed * dt;
        const dy = (p.input.dy / mag) * speed * dt;
        moveWithCollision(p, dx, dy, 5);
        if (p.input.dx !== 0) p.dir = p.input.dx > 0 ? 1 : -1;
        p.moving = true;
        p.animT += dt;
      } else {
        p.moving = false;
      }

      // nhặt đồ
      for (const it of this.items) {
        if (!it.active) continue;
        if (dist2(p.x, p.y, it.x, it.y) <= RULES.PICKUP_RADIUS ** 2) {
          it.active = false;
          it.respawnAt = t + RULES.ITEM_RESPAWN_MS;
          if (it.type === 'lantern' || it.type === 'star') {
            p.progress += 1;
            p.score += SCORE[it.type];
            events.push({ k: 'collect', sid: p.sid, pid: p.id, name: p.name, type: it.type, x: it.x, y: it.y, progress: p.progress, target: RULES.TARGET_LANTERNS });
            if (p.progress === RULES.TARGET_LANTERNS) {
              events.push({ k: 'ready', sid: p.sid, name: p.name });
            }
          } else if (it.type === 'mooncake') {
            p.boostUntil = t + RULES.BOOST_MS;
            p.score += SCORE.mooncake;
            events.push({ k: 'power', sid: p.sid, pid: p.id, name: p.name, type: 'mooncake', x: it.x, y: it.y });
          } else if (it.type === 'drum') {
            p.score += SCORE.drum;
            for (const l of this.lions) {
              l.state = 'flee'; l.stateUntil = t + RULES.DRUM_FLEE_MS; l.fleeFrom = { x: p.x, y: p.y };
            }
            events.push({ k: 'drum', sid: p.sid, pid: p.id, name: p.name, x: it.x, y: it.y });
          }
        }
      }

      // về đích?
      if (p.progress >= RULES.TARGET_LANTERNS &&
          p.x > GATE.x && p.x < GATE.x + GATE.w && p.y > GATE.y && p.y < GATE.y + GATE.h) {
        this.finishCount += 1;
        p.finishedRank = this.finishCount;
        p.champion = this.finishCount === 1;
        if (p.champion) this.champion = p;
        const bonus = RULES.FINISH_BONUS[Math.min(this.finishCount - 1, RULES.FINISH_BONUS.length - 1)];
        p.score += bonus;
        events.push({ k: 'finish', sid: p.sid, pid: p.id, name: p.name, rankN: p.finishedRank, champion: p.champion, score: p.score, lanterns: p.progress, hits: p.hits });
      }
    }

    // --- Lân ---
    for (const l of this.lions) {
      // tìm người chơi gần nhất (bỏ người đã về đích)
      let nearest = null, nd = Infinity;
      for (const p of this.players.values()) {
        if (p.finishedRank) continue;
        const d = dist2(p.x, p.y, l.x, l.y);
        if (d < nd) { nd = d; nearest = p; }
      }
      const t = now();

      switch (l.state) {
        case 'patrol': {
          this.lionWalk(l, RULES.LION_PATROL_SPEED, dt);
          if (Math.hypot(l.tx - l.x, l.ty - l.y) < 6) l.pickWaypoint();
          if (t > l.cooldownUntil && nearest && nd < RULES.LION_DETECT ** 2) {
            l.setState('telegraph', RULES.LION_TELEGRAPH_MS);
            l.targetSid = nearest.sid;
            events.push({ k: 'lionTelegraph', x: l.x, y: l.y, target: nearest.name });
          }
          break;
        }
        case 'telegraph': {
          if (nearest) { l.dir = nearest.x >= l.x ? 1 : -1; }
          if (t > l.stateUntil) {
            // khoá điểm lao tới (dự đoán nhẹ theo vận tốc nạn nhân)
            const victim = [...this.players.values()].find(p => p.sid === l.targetSid && !p.finishedRank);
            if (victim) {
              l.tx = victim.x + victim.input.dx * 18;
              l.ty = victim.y + victim.input.dy * 18;
              l.setState('dash', RULES.LION_DASH_MS);
              events.push({ k: 'lionDash', x: l.x, y: l.y });
            } else {
              l.setState('recover', RULES.LION_RECOVER_MS);
            }
          }
          break;
        }
        case 'dash': {
          this.lionWalk(l, RULES.LION_DASH_SPEED, dt);
          // va vào người chơi?
          for (const p of this.players.values()) {
            if (p.finishedRank) continue;
            if (t < p.invulnUntil) continue;
            if (dist2(p.x, p.y, l.x, l.y) <= RULES.HIT_RADIUS ** 2) {
              this.hitPlayer(p, l, events);
            }
          }
          if (t > l.stateUntil || Math.hypot(l.tx - l.x, l.ty - l.y) < 6) {
            l.setState('recover', RULES.LION_RECOVER_MS);
            l.cooldownUntil = t + RULES.LION_COOLDOWN_MS;
          }
          break;
        }
        case 'recover': {
          if (t > l.stateUntil) { l.state = 'patrol'; l.pickWaypoint(); }
          break;
        }
        case 'flee': {
          if (l.fleeFrom) {
            const ang = Math.atan2(l.y - l.fleeFrom.y, l.x - l.fleeFrom.x);
            moveWithCollision(l, Math.cos(ang) * RULES.LION_FLEE_SPEED * dt, Math.sin(ang) * RULES.LION_FLEE_SPEED * dt, 6);
            l.dir = Math.cos(ang) >= 0 ? 1 : -1;
          }
          if (t > l.stateUntil) { l.state = 'patrol'; l.pickWaypoint(); l.cooldownUntil = t + 800; }
          break;
        }
      }
      // Lân luôn đi được trong world (đã có moveWithCollision)
    }

    // --- hồi sinh đồ ---
    for (const it of this.items) {
      if (!it.active && it.respawnAt && t > it.respawnAt) {
        // sinh lại ở chỗ trống khác
        it.dead = true;
      }
    }
    this.items = this.items.filter(it => !it.dead);
    const activeCount = this.items.filter(it => it.active).length;
    if (activeCount < RULES.MAX_ITEMS_ON_MAP && Math.random() < 0.35) this.spawnItem();

    return events;
  }

  lionWalk(l, speed, dt) {
    const ang = Math.atan2(l.ty - l.y, l.tx - l.x);
    moveWithCollision(l, Math.cos(ang) * speed * dt, Math.sin(ang) * speed * dt, 6);
    if (Math.abs(Math.cos(ang)) > 0.15) l.dir = Math.cos(ang) >= 0 ? 1 : -1;
    // nếu bị kẹt quá lâu thì đổi điểm đến
    if (Math.hypot(l.tx - l.x, l.ty - l.y) < 6) { if (l.state === 'patrol') l.pickWaypoint(); }
  }

  hitPlayer(p, l, events) {
    const t = now();
    p.invulnUntil = t + RULES.INVULN_MS;
    p.stunnedUntil = t + RULES.STUN_MS;
    p.hits += 1;
    // rớt đèn → đèn rơi trở lại bản đồ
    const drop = Math.min(RULES.DROP_ON_HIT, p.progress);
    p.progress -= drop;
    for (let i = 0; i < drop; i++) {
      const it = this.spawnItem();
      if (it) { it.type = 'lantern'; }
    }
    // bật lùi nhẹ
    const ang = Math.atan2(p.y - l.y, p.x - l.x);
    moveWithCollision(p, Math.cos(ang) * 14, Math.sin(ang) * 14, 5);
    events.push({ k: 'hit', sid: p.sid, pid: p.id, name: p.name, x: p.x, y: p.y, progress: p.progress, hits: p.hits, drop });
  }

  // ================= SNAPSHOT =================
  snapshot() {
    const ps = [];
    for (const p of this.players.values()) {
      const flags =
        (p.moving ? 1 : 0) |
        (now() < p.stunnedUntil ? 2 : 0) |
        (now() < p.invulnUntil ? 4 : 0) |
        (now() < p.boostUntil ? 8 : 0) |
        (p.finishedRank ? 16 : 0) |
        (p.champion ? 32 : 0);
      ps.push([p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.dir, flags, p.progress, p.score, p.name, p.sid]);
    }
    const ls = this.lions.map(l => [l.id, Math.round(l.x * 10) / 10, Math.round(l.y * 10) / 10, l.dir, l.state]);
    const its = [];
    for (const it of this.items) {
      if (it.active) its.push([it.id, ITEM_TYPES.indexOf(it.type), it.x, it.y]);
    }
    return {
      t: Date.now(), round: this.roundId, ps, ls, its,
      fin: this.finishCount, champ: this.champion ? this.champion.sid : null,
      target: RULES.TARGET_LANTERNS,
    };
  }
}

module.exports = { Arena };
