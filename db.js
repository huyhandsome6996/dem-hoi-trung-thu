// ============================================================
//  ĐÊM HỘI TRUNG THU — Database (SQLite qua node:sqlite)
//  Bảng: rounds (lượt đấu), players (người chơi + thành tích)
// ============================================================
'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'trung-thu.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS rounds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS players (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id     INTEGER NOT NULL,
  name         TEXT NOT NULL,
  student_id   TEXT NOT NULL,
  joined_at    TEXT NOT NULL,
  finished_at  TEXT,
  finish_rank  INTEGER,
  is_champion  INTEGER NOT NULL DEFAULT 0,
  lanterns     INTEGER NOT NULL DEFAULT 0,
  score        INTEGER NOT NULL DEFAULT 0,
  hits         INTEGER NOT NULL DEFAULT 0,
  gift_given   INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_round_ident
  ON players(round_id, name, student_id);
CREATE INDEX IF NOT EXISTS idx_player_round ON players(round_id);
`);

// ----- Lượt đấu -----

/** Lấy lượt đang active; nếu chưa có thì tạo lượt mới */
function ensureActiveRound() {
  let r = db.prepare('SELECT id FROM rounds WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  if (r) return r.id;
  db.prepare('INSERT INTO rounds (started_at, active) VALUES (?, 1)').run(new Date().toISOString());
  r = db.prepare('SELECT id FROM rounds WHERE active = 1 ORDER BY id DESC LIMIT 1').get();
  return r.id;
}

/** Bắt đầu lượt mới: đóng lượt cũ, tạo lượt mới, trả về id */
function startNewRound() {
  db.prepare('UPDATE rounds SET active = 0 WHERE active = 1').run();
  db.prepare('INSERT INTO rounds (started_at, active) VALUES (?, 1)').run(new Date().toISOString());
  return ensureActiveRound();
}

function roundInfo() {
  return db.prepare(`
    SELECT r.id, r.started_at,
           (SELECT COUNT(*) FROM players p WHERE p.round_id = r.id) AS player_count,
           (SELECT COUNT(*) FROM players p WHERE p.round_id = r.id AND p.finished_at IS NOT NULL) AS finisher_count
    FROM rounds r WHERE r.active = 1 ORDER BY r.id DESC LIMIT 1
  `).get();
}

// ----- Người chơi -----

/** Đăng nhập: tạo mới hoặc tái sử dụng hàng (round, name, mssv). Trả về {id, row} */
function upsertPlayer(roundId, name, studentId) {
  const now = new Date().toISOString();
  const existing = db.prepare(
    'SELECT * FROM players WHERE round_id = ? AND name = ? AND student_id = ?'
  ).get(roundId, name, studentId);
  if (existing) return existing;
  db.prepare(`
    INSERT INTO players (round_id, name, student_id, joined_at)
    VALUES (?, ?, ?, ?)
  `).run(roundId, name, studentId, now);
  return db.prepare(
    'SELECT * FROM players WHERE round_id = ? AND name = ? AND student_id = ?'
  ).get(roundId, name, studentId);
}

function updateProgress(playerId, lanterns, score, hits) {
  db.prepare('UPDATE players SET lanterns = ?, score = ?, hits = ? WHERE id = ?')
    .run(lanterns, score, hits, playerId);
}

function finishPlayer(playerId, rank, isChampion, lanterns, score, hits) {
  db.prepare(`
    UPDATE players SET finished_at = ?, finish_rank = ?, is_champion = ?,
      lanterns = ?, score = ?, hits = ?
    WHERE id = ?
  `).run(new Date().toISOString(), rank, isChampion ? 1 : 0, lanterns, score, hits, playerId);
}

// ----- Admin -----

function adminCurrentRound() {
  const r = roundInfo() || {};
  const players = db.prepare(`
    SELECT id, name, student_id, joined_at, finished_at, finish_rank,
           is_champion, lanterns, score, hits, gift_given
    FROM players WHERE round_id = ? ORDER BY
      (finished_at IS NULL) ASC, finished_at ASC, score DESC, joined_at ASC
  `).all(r.id || 0);
  // MSSV trùng (dùng chung 1 MSSV nhưng khác tên) → cảnh báo
  const dupRows = db.prepare(`
    SELECT student_id, COUNT(DISTINCT name) AS n, GROUP_CONCAT(name, ', ') AS names
    FROM players WHERE round_id = ? GROUP BY student_id HAVING n > 1
  `).all(r.id || 0);
  const stats = db.prepare(`
    SELECT (SELECT COUNT(*) FROM players) AS total_players,
           (SELECT COUNT(*) FROM rounds) AS total_rounds,
           (SELECT COUNT(*) FROM players WHERE is_champion = 1) AS total_champions,
           (SELECT COUNT(*) FROM players WHERE gift_given = 1) AS total_gifts
  `).get();
  return { round: r, players, duplicates: dupRows, stats, serverTime: new Date().toISOString() };
}

function setGift(playerId, gift) {
  db.prepare('UPDATE players SET gift_given = ? WHERE id = ?').run(gift ? 1 : 0, playerId);
}

function clearAllData() {
  db.exec('DELETE FROM players; DELETE FROM rounds; DELETE FROM sqlite_sequence WHERE name IN (\'players\',\'rounds\');');
  return ensureActiveRound();
}

function csvRows() {
  return db.prepare(`
    SELECT p.*, p.round_id AS round, r.started_at AS round_started
    FROM players p JOIN rounds r ON r.id = p.round_id
    ORDER BY p.round_id DESC, (p.finished_at IS NULL) ASC, p.finished_at ASC
  `).all();
}

module.exports = { db, ensureActiveRound, startNewRound, roundInfo, upsertPlayer, updateProgress, finishPlayer, adminCurrentRound, setGift, clearAllData, csvRows };
