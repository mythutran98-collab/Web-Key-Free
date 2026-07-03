const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'key.json');

// URL Tunnel Cloudflare hiện tại của bạn
const BASE_URL = "https://rug-drawing-antivirus-cumulative.trycloudflare.com";
// API Token Link4M của bạn
const LINK4M_TOKEN = "6a468a248ac8462dd2051fc3"; 

// Hàm đọc database từ file JSON
function readDatabase() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({}));
    }
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return {};
    }
}

// Hàm ghi database vào file JSON
function writeDatabase(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// -------------------------------------------------------------
// BƯỚC CHUYỂN HƯỚNG: Khi người dùng bấm vào link lấy key từ trong Game
// -------------------------------------------------------------
app.get('/getkey', async (req, res) => {
    const hwid = req.query.hwid;
    if (!hwid) {
        return res.status(400).send('<h1 style="color:red; text-align:center; font-family:sans-serif; margin-top:50px;">Lỗi: Thiếu tham số HWID hợp lệ!</h1>');
    }

    // URL đích mà Link4M sẽ dẫn về sau khi người dùng vượt link xong thành công
    const destinationUrl = `${BASE_URL}/generate-key?status=success&hwid=${encodeURIComponent(hwid)}`;

    try {
        // Gọi API của Link4M để lấy link rút gọn mã hóa điểm đích
        const response = await axios.get(`https://link4m.com/api-shorten/v2?api=${LINK4M_TOKEN}&url=${encodeURIComponent(destinationUrl)}`);
        
        if (response.data && response.data.shortenedUrl) {
            // Đẩy trình duyệt của người chơi sang link vượt nhiệm vụ của Link4M
            res.redirect(response.data.shortenedUrl);
        } else {
            // Dự phòng nếu Link4M lỗi API thì chuyển thẳng sang trang nhận key luôn
            res.redirect(destinationUrl);
        }
    } catch (error) {
        console.error("Lỗi kết nối Link4M API, chuyển hướng thẳng:", error.message);
        res.redirect(destinationUrl);
    }
});

// -------------------------------------------------------------
// BƯỚC TẠO KEY: Trang hiển thị key cho người chơi sau khi vượt link
// -------------------------------------------------------------
app.get('/generate-key', (req, res) => {
    const { status, hwid } = req.query;

    if (status !== 'success' || !hwid) {
        return res.status(403).send('<h1 style="color:red; text-align:center; font-family:sans-serif; margin-top:50px;">Bạn chưa hoàn thành vượt link lấy key hợp lệ!</h1>');
    }

    const db = readDatabase();
    const currentTime = Date.now();
    let finalKey = "";

    // Kiểm tra xem HWID này đã có key hợp lệ và còn hạn trong vòng 8 tiếng chưa
    if (db[hwid] && db[hwid].expiresAt > currentTime) {
        finalKey = db[hwid].key;
    } else {
        // Nếu chưa có hoặc hết hạn -> Tạo Key ngẫu nhiên mới (Định dạng VND_ + 12 ký tự ngẫu nhiên)
        const randomString = crypto.randomBytes(6).toString('hex').toUpperCase();
        finalKey = `VND_${randomString}`;
        
        // Lưu vào database với thời gian hết hạn là 8 tiếng (8 * 60 * 60 * 1000 ms)
        db[hwid] = {
            key: finalKey,
            expiresAt: currentTime + (8 * 60 * 60 * 1000)
        };
        writeDatabase(db);
    }

    // Giao diện HTML hiển thị Key cực đẹp mắt cho người chơi sao chép
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Hệ Thống Lấy Key Thành Công</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { font-family: 'Segoe UI', sans-serif; background-color: #121212; color: #ffffff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: #1e1e1e; padding: 30px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); text-align: center; max-width: 400px; width: 90%; border: 1px solid #333; }
                h1 { color: #4CAF50; font-size: 24px; margin-bottom: 10px; }
                p { color: #aaa; font-size: 14px; }
                .key-box { background: #2d2d2d; border: 2px dashed #4CAF50; padding: 15px; font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #fff; margin: 20px 0; border-radius: 6px; cursor: pointer; position: relative; }
                .footer { font-size: 11px; color: #666; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>VƯỢT LINK THÀNH CÔNG 🎉</h1>
                <p>Hãy sao chép đoạn mã Key bên dưới và dán vào bảng menu trong game Roblox của bạn.</p>
                <div class="key-box" onclick="navigator.clipboard.writeText('${finalKey}'); alert('Đã sao chép Key thành công!');">${finalKey}</div>
                <p style="font-size: 12px; color: #ff9800;">💡 Nhấp vào ô trên để tự động sao chép mã Key.</p>
                <div class="footer">Key có giá trị sử dụng trong 8 giờ kể từ lúc tạo.</div>
            </div>
        </body>
        </html>
    `);
});

// -------------------------------------------------------------
// API ĐỂ GAME CHECK KEY: Script Roblox sẽ gửi Request lên đây kiểm tra
// -------------------------------------------------------------
app.get('/verify-key', (req, res) => {
    const { hwid, key } = req.query;

    if (!hwid || !key) {
        return res.json({ status: "error", message: "Missing Parameters" });
    }

    const db = readDatabase();
    const currentTime = Date.now();

    // Kiểm tra tính hợp lệ của Key đi kèm với đúng HWID đó
    if (db[hwid]) {
        if (db[hwid].key === key) {
            if (db[hwid].expiresAt > currentTime) {
                return res.json({ status: "success", message: "Key Valid" });
            } else {
                return res.json({ status: "expired", message: "Key Expired" });
            }
        }
    }
    
    return res.json({ status: "invalid", message: "Key Incorrect" });
});

app.listen(PORT, () => {
    console.log(`Server đang chạy ổn định tại: http://localhost:${PORT}`);
});
