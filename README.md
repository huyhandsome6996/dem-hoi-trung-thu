# 🏮 ĐÊM HỘI TRUNG THU — Pixel Race

Game pixel phong cách Trung thu Việt Nam, **chơi online nhiều người cùng lúc** trên máy tính và điện thoại. Thu thập lồng đèn, né con Lân, ai đủ 10 đèn và về đích **đầu tiên** sẽ trở thành NGƯỜI CHIẾN THẮNG và được vào khu vực Ban Tổ chức nhận quà!

## 🎮 Cách chơi

| Hành động | Máy tính | Điện thoại |
|---|---|---|
| Di chuyển | `WASD` / phím mũi tên | Chạm màn hình → joystick |
| Nhặt đèn / đồ | Đi ngang qua | Đi ngang qua |
| Bật/tắt nhạc | Nút 🔊 | Nút 🔊 |

- 🏮 **Lồng đèn** — +1 tiến độ (cần **10** để mở cổng) +10 điểm
- ⭐ **Đèn ông sao** — +1 tiến độ, +35 điểm (cao hơn!)
- 🥮 **Bánh trung thu** — chạy nhanh hơn trong 5 giây
- 🥁 **Cái trống** — Lân sợ, bỏ chạy 4 giây
- 🦁 **Con Lân** — đủ gần là **lao tới tấn công**! (đã nhẹ hơn: báo hiệu lâu hơn, lao ngắn hơn, nghỉ lâu hơn — né được) Bị đụng → choáng + **rớt 1 đèn** ra đất. Nhìn chữ **LÂN** trên đầu để nhận biết nha!
- 🏯 **Cổng ĐÍCH** — đủ 10 đèn thì cổng sáng lên, chạy vào để về đích

Có **bánh trung thu và cái trống** thì đừng bỏ phí — cứu mạng đấy!

## 🔐 Trang Admin (Ban Tổ chức)

Vào `/admin`, đăng nhập:
- **Tài khoản:** `Admin`
- **Mật khẩu:** `@Huyhandsome2006` (hoặc `@Huyhandsome`)

> 💡 Ở **màn hình đăng nhập game**, BTC cũng có thể điền tên `Admin` + mật khẩu vào ô "Mã sinh viên" → tự động vào thẳng trang quản trị.

Tính năng: bảng người chơi **tự cập nhật 2 giây/lần**, cột 🎁 **đánh dấu đã trao quà**, **⬇️ Tải CSV** về máy, **🔄 Bắt đầu lượt mới** (reset tiến độ), cảnh báo **⚠ trùng MSSV** (2 người khác tên dùng chung 1 MSSV), thống kê tổng.

> Người chơi nhập sai MSSV vẫn chơi được bình thường — nhưng BTC sẽ chỉ trao quà cho MSSV đúng (xác minh bằng mắt ở bảng admin nha 😆).

## 🗄️ Database

SQLite (file `data/trung-thu.db` qua `node:sqlite` tích hợp sẵn của Node) — 2 bảng:
- `rounds` — các lượt đấu
- `players` — tên, MSSV, giờ vào, tiến độ, điểm, số lần bị Lân đụng, giờ về đích, hạng, cờ champion, quà

**Lưu ý quan trọng trên Render free:** ổ đĩa là tạm thời (ephemeral) — mỗi khi service tự động redeploy hoặc ngủ dậy thì database trả về rỗng. Trong bữa tiệc chạy liên tục thì không sao (có người truy cập là không ngủ), nhưng **nên tải CSV định kỳ để giữ danh sách**.

## 🚀 Chạy locally

```bash
npm install
node server.js
# → mở http://localhost:3000
```

## ☁️ Deploy lên Render

1. Push repo này lên GitHub
2. Render Dashboard → **New +** → **Blueprint** → chọn repo → Apply (đã có sẵn `render.yaml`)
3. Hoặc bấm nút: sau khi repo trên GitHub, mở `https://render.com/deploy?repo=<URL-repo>`

## 🎵 Nhạc nền

Game phát **bản thu bài "Chiếc Đèn Ông Sao" (Nhạc Tết Trung Thu)** từ file `public/audio/den-ong-sao.mp3` (BTC gửi, đã đặt sẵn trong repo) — tự lặp liên tục. Nếu file bị thiếu, game tự fallback sang giai điệu 8-bit cùng bài (Phạm Tuyên) hòa thanh theo hợp âm gốc (G–E7–Am–Em–D–G7–C) để không bao giờ im lặng.

## 🛠️ Kỹ thuật (v3 — tối ưu độ mượt bằng DSA)

- HTML + CSS + JavaScript thuần (Canvas API, Web Audio API) — đúng phong cách pixel, không framework
- Node.js + Express + Socket.IO + SQLite qua `node:sqlite` (không cần compile native)
- **Client-authoritative movement**: người chơi di chuyển ngay tại máy mình 60FPS (độ trễ phím ≈ 0), chỉ gửi vị trí lên server 12 lần/s; server vẫn kẹp biên + chống dịch chuyển bất hợp lệ
- **DSA — Spatial Hash Grid** (server): tra cứu đồ vật quanh người chơi O(1) thay vì quét toàn bản đồ — tải 16 người chơi × 12Hz server vẫn xử lý ~1ms/request
- **DSA — Ring Buffer O(1)** (client): chứa snapshot, không dùng array.shift() gây GC
- **DSA — Nội suy thích nghi (EMA)** (client): delay nội suy tự co giãn 90–220ms theo độ trễ mạng thật → Lân và bạn bè di chuyển mượt dù mạng gợn sóng
- **Event-driven items**: đồ vật chỉ gửi qua mạng khi nhặt/hồi sinh (không kèm mỗi snapshot) → gói tin nhẹ hơn ~40%

Made with 🏮 cho đêm Trung thu.
