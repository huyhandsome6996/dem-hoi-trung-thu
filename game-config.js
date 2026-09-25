// ============================================================
//  ĐÊM HỘI TRUNG THU — Cấu hình thế giới chung (server + client)
//  Bản đồ 30x17 ô (16px) = 480x272 px — một màn hình, cùng nhau đua
// ============================================================
'use strict';

const TILE = 16;
const MAP_W = 30, MAP_H = 17;
const W = MAP_W * TILE;   // 480
const H = MAP_H * TILE;   // 272

// # = hàng rào, . = cỏ, p = đường, w = nước, c = thùng gỗ, t = cây, s = sân khấu
const MAP = [
  '##############################',
  '#t..........ssssss..........t#',
  '#...c.......ssssss.......c...#',
  '#............................#',
  '#....t........pp.....t.......#',
  '#............................#',
  '#.............pp.............#',
  '#....c........pp........c....#',
  '#pppppppppppppppppppppppppppp#',
  '#...t.........pp..........t..#',
  '#.............pp.............#',
  '#.....c.......pp.........c...#',
  '#.............pp....wwwwww...#',
  '#.............pp...wwwwwwww..#',
  '#..t..........pp...wwwwwwww.t#',
  '#.............pp....wwwwww...#',
  '##############################',
];

const SOLID = new Set(['#', 'w', 'c', 't', 's']);

// Cổng ĐÍCH — đứng trước sân khấu (giữa trên). Player đủ đèn chạm vào là về đích.
const GATE = { x: 194, y: 46, w: 60, h: 22 };

// Luật chơi
const RULES = {
  TARGET_LANTERNS: 10,      // cần thu đủ đèn để mở cổng
  MAX_ITEMS_ON_MAP: 9,
  ITEM_RESPAWN_MS: 2600,
  PLAYER_SPEED: 86,          // px/s
  BOOST_MULT: 1.55,
  BOOST_MS: 5000,
  PICKUP_RADIUS: 10,
  HIT_RADIUS: 10,
  STUN_MS: 1000,
  INVULN_MS: 2600,
  SPAWN_INVULN_MS: 3000,
  DROP_ON_HIT: 1,            // bị Lân đụng rớt mấy đèn (giảm từ 2 xuống 1 — bớt nặng nề)
  FINISH_BONUS: [200, 100, 50], // điểm thưởng hạng 1/2/3
  LION_COUNT: 2,
  // --- Lân đã NERF (giảm ~35-45% độ mạnh nhưng vẫn phải né) ---
  LION_PATROL_SPEED: 34,     // 40 → 34 đi tuần chậm hơn
  LION_DASH_SPEED: 150,      // 238 → 150 (người chơi thường 86, boost 133 — giờ có thể né/thoát)
  LION_FLEE_SPEED: 78,       // 92 → 78
  LION_DETECT: 96,           // 120 → 96 phát hiện hẹp hơn
  LION_TELEGRAPH_MS: 750,    // 550 → 750 báo hiệu lâu hơn → dễ né hơn
  LION_DASH_MS: 620,         // 850 → 620 lao ngắn lại
  LION_RECOVER_MS: 1100,     // 900 → 1100 nghỉ lâu hơn sau khi lao
  LION_COOLDOWN_MS: 3000,    // 2100 → 3000 giữa 2 lần lao
  DRUM_FLEE_MS: 4200,
};

// Điểm số
const SCORE = { lantern: 10, star: 35, mooncake: 15, drum: 15 };

// Loại đồ vật: lantern=đèn lồng (đếm tiến độ), star=đèn ông sao (đếm + điểm lớn),
// mooncake=bánh trung thu (tăng tốc), drum=trống (dọa Lân bỏ chạy)
const ITEM_TYPES = ['lantern', 'star', 'mooncake', 'drum'];
const ITEM_WEIGHTS = [58, 14, 14, 14];

// Điểm rơi đồ (ô cỏ/đường, không trùng vật cản) — (col,row)
const ITEM_SPOTS = [
  [2, 4], [6, 2], [10, 5], [19, 4], [24, 5], [27, 6], [16, 6], [7, 7],
  [9, 9], [4, 11], [20, 9], [26, 10], [12, 12], [2, 14], [18, 15],
  [27, 13], [12, 3], [25, 3], [22, 8], [6, 15],
];

// Vị trí xuất phát người chơi (để chọn ngẫu nhiên, xa Lân)
const PLAYER_SPAWNS = [
  [40, 136], [440, 136], [40, 248], [440, 248], [232, 248], [88, 88], [392, 88],
];

// Lân xuất phát
const LION_SPAWNS = [
  [120, 72], [368, 184],
];

// Tiện ích
function isSolidAt(px, py) {
  const cx = Math.floor(px / TILE), cy = Math.floor(py / TILE);
  if (cx < 0 || cy < 0 || cx >= MAP_W || cy >= MAP_H) return true;
  return SOLID.has(MAP[cy][cx]);
}

function spotCenter(col, row) {
  return [col * TILE + TILE / 2, row * TILE + TILE / 2];
}

// Client config (không chứa gì nhạy cảm)
function clientConfig() {
  return {
    W, H, TILE, MAP_W, MAP_H, MAP, GATE, RULES, SCORE, ITEM_TYPES,
    ITEM_SPOTS: ITEM_SPOTS.map(([c, r]) => spotCenter(c, r)),
    PLAYER_SPAWNS, LION_SPAWNS,
  };
}

module.exports = { TILE, MAP_W, MAP_H, W, H, MAP, SOLID, GATE, RULES, SCORE, ITEM_TYPES, ITEM_WEIGHTS, ITEM_SPOTS, PLAYER_SPAWNS, LION_SPAWNS, isSolidAt, spotCenter, clientConfig };
