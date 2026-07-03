const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const KEY_FILE = path.join(__dirname, 'key.json');

// Đọc và Ghi file key.json an toàn
function readKeys() {
    try {
        if (!fs.existsSync(KEY_FILE)) return {};
        return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8'));
    } catch (e) { return {}; }
}
function writeKeys(data) {
    fs.writeFileSync(KEY_FILE, JSON.stringify(data, null, 4), 'utf8');
}

// Xóa key hết hạn (> 8 tiếng) tự động
function cleanExpiredKeys() {
    let keys = readKeys();
    let now = Date.now();
    let changed = false;
    for (let k in keys) {
        if (now > keys[k].expiresAt) {
            delete keys[k];
            changed = true;
        }
    }
    if (changed) writeKeys(keys);
}

// API 1: Xử lý Endpoint trung gian nhận diện HWID trước khi chuyển sang Link4M
// Người dùng từ game sẽ mở link: http://your-domain/getkey?hwid=MÃ_THIẾT_BỊ
app.get('/getkey', (req, res) => {
    const hwid = req.query.hwid;
    if (!hwid) {
        return res.status(400).send('<h1>Lỗi: Thiếu tham số HWID hợp lệ!</h1>');
    }
    
    // API v2 Link4M của bạn
    const LINK4M_API = "https://link4m.com/api-shorten/v2?api=6a468a248ac8462dd2051fc3&url=";
    
    // URL đích sau khi người dùng vượt link thành công (Truyền kèm HWID để xử lý khóa tại bước cuối)
    // Thay thế địa chỉ 'https://rug-drawing-antivirus-cumulative.trycloudflare.com' bằng URL tunnel hiện tại của bạn
    const destinationUrl = `https://rug-drawing-antivirus-cumulative.trycloudflare.com/generate-key?status=success&hwid=${encodeURIComponent(hwid)}`;
    
    // Chuyển hướng người chơi trực tiếp sang trang vượt link Link4M
    res.redirect(LINK4M_API + encodeURIComponent(destinationUrl));
});

// API 2: Tạo Key ngẫu nhiên sau khi vượt Link4M thành công
app.get('/generate-key', (req, res) => {
    cleanExpiredKeys();
    const status = req.query.status;
    const hwid = req.query.hwid;
    
    // Bảo mật nâng cao: Kiểm tra trạng thái và sự hiện diện của phần cứng thiết bị
    if (status !== 'success' || !hwid) {
        return res.status(403).send('<h1>Lỗi: Bạn chưa vượt link xác thực hợp lệ hoặc thiếu thông tin thiết bị!</h1>');
    }

    let keys = readKeys();
    let newKey;
    
    // Kiểm tra xem thiết bị này đã lấy key trong 8 tiếng gần đây chưa để trả lại key cũ, tránh spam sinh file rác
    for (let k in keys) {
        if (keys[k].hwid === hwid && Date.now() < keys[k].expiresAt) {
            newKey = k;
            break;
        }
    }

    // Nếu chưa có key hợp lệ hoặc đã hết hạn, tạo một key mới hoàn toàn
    if (!newKey) {
        do {
            newKey = "VND_" + crypto.randomBytes(6).toString('hex').toUpperCase();
        } while (keys[newKey]);

        const duration = 8 * 60 * 60 * 1000; // Thời hạn hiệu lực: 8 Tiếng
        keys[newKey] = {
            hwid: hwid, // Khóa cố định luôn HWID của người chơi tại đây
            createdAt: Date.now(),
            expiresAt: Date.now() + duration
        };
        writeKeys(keys);
    }

    // Trả về giao diện Web hiển thị chúc mừng và sao chép Key
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>VND HUB - GET KEY SUCCESS</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { background: #0c0c12; color: #fff; font-family: sans-serif; text-align: center; padding-top: 50px; }
                .card { background: #12121c; border: 2px solid #a050fa; border-radius: 12px; padding: 30px; display: inline-block; width: 90%; max-width: 400px; box-shadow: 0 0 20px rgba(160,80,250,0.3); }
                h2 { color: #00ff66; margin-bottom: 20px; }
                .key-box { background: #1a1a26; padding: 15px; font-size: 20px; font-weight: bold; border-radius: 6px; border: 1px dashed #fff; margin-bottom: 20px; color: #ffeb3b; word-break: break-all; }
                button { background: #a050fa; border: none; color: white; padding: 12px 24px; font-weight: bold; border-radius: 6px; cursor: pointer; transition: 0.3s; }
                button:hover { background: #bd7eff; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>LẤY KEY THÀNH CÔNG!</h2>
                <p>Key có thời hạn sử dụng trong <b>8 giờ</b> và đã được kích hoạt cố định cho thiết bị của bạn.</p>
                <div class="key-box" id="keyText">${newKey}</div>
                <button onclick="navigator.clipboard.writeText('${newKey}'); alert('Đã sao chép Key!')">SAO CHÉP KEY</button>
            </div>
        </body>
        </html>
    `);
});

// API 3: Cho Script Roblox gọi để kiểm tra và đối chiếu dữ liệu mạng
app.post('/api/verify', (req, res) => {
    cleanExpiredKeys();
    const { key, hwid } = req.body;
    let keys = readKeys();

    if (!key || !keys[key]) {
        return res.json({ success: false, message: "Key không tồn tại hoặc đã hết hạn sử dụng!" });
    }

    let keyData = keys[key];

    // Đối chiếu trùng khớp dữ liệu thiết bị đã đăng ký lúc vượt link
    if (keyData.hwid !== hwid) {
        return res.json({ success: false, message: "Sai mã định danh thiết bị phần cứng (HWID)! Hãy thực hiện Get Key trên chính máy này." });
    }

    return res.json({ success: true, message: "Xác thực danh tính thành công!" });
});

// Giao diện trang chủ (Index)
app.get('/', (req, res) => {
    res.send('<h1>VND HUB API Server Active</h1>');
});

app.listen(PORT, () => console.log(`Server đang chạy tại port ${PORT}`));
