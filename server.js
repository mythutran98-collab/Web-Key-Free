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

// API 1: Tạo Key ngẫu nhiên sau khi vượt Link4M thành công
// Bạn hãy cấu hình Link4M chuyển hướng về: http://your-domain:3000/generate-key?status=success
app.get('/generate-key', (req, res) => {
    cleanExpiredKeys();
    const status = req.query.status;
    
    // Bảo mật: Kiểm tra xem có đúng từ link4m chuyển hướng qua không
    if (status !== 'success') {
        return res.status(403).send('<h1>Lỗi: Bạn chưa vượt link xác thực hợp lệ!</h1>');
    }

    let keys = readKeys();
    let newKey;
    
    // Vòng lặp đảm bảo không tạo key trùng với các key đang hoạt động
    do {
        newKey = "VND_" + crypto.randomBytes(6).toString('hex').toUpperCase();
    } while (keys[newKey]);

    const duration = 8 * 60 * 60 * 1000; // 8 Tiếng tính bằng mili-giây
    keys[newKey] = {
        hwid: null,
        createdAt: Date.now(),
        expiresAt: Date.now() + duration
    };
    
    writeKeys(keys);

    // Trả về giao diện Web đẹp mắt hiển thị Key vừa tạo
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
                <p>Key có thời hạn sử dụng trong <b>8 giờ</b> và sẽ tự khóa theo HWID thiết bị chạy đầu tiên.</p>
                <div class="key-box" id="keyText">${newKey}</div>
                <button onclick="navigator.clipboard.writeText('${newKey}'); alert('Đã sao chép Key!')">SAO CHÉP KEY</button>
            </div>
        </body>
        </html>
    `);
});

// API 2: Cho Script Roblox gọi để kiểm tra và khóa HWID
app.post('/api/verify', (req, res) => {
    cleanExpiredKeys();
    const { key, hwid } = req.body;
    let keys = readKeys();

    if (!key || !keys[key]) {
        return res.json({ success: false, message: "Key không tồn tại hoặc đã hết hạn!" });
    }

    let keyData = keys[key];

    // Gán HWID nếu key chưa có thiết bị nào kích hoạt
    if (!keyData.hwid) {
        keyData.hwid = hwid;
        writeKeys(keys);
        return res.json({ success: true, message: "Kích hoạt thiết bị (HWID) mới thành công!" });
    }

    // Kiểm tra HWID trùng khớp tránh share key trái phép
    if (keyData.hwid !== hwid) {
        return res.json({ success: false, message: "Sai thiết bị phần cứng (HWID)! Vui lòng get key mới." });
    }

    return res.json({ success: true, message: "Xác thực thành công!" });
});

// Giao diện trang chủ (Index)
app.get('/', (req, res) => {
    res.send('<h1>VND HUB API Server Active</h1>');
});

app.listen(PORT, () => console.log(`Server đang chạy tại port ${PORT}`));
