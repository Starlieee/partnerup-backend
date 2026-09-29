const jwt = require("jsonwebtoken");
const pool = require("../config/db");
require("dotenv").config();

// In-memory cache agar update status aktif tidak membebani database (cukup 1x per 30 detik per user)
const lastActivityMap = new Map();

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token tidak ditemukan. Silakan login kembali." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { user_id: decoded.user_id, email: decoded.email, name: decoded.name };

    // Otomatis tandai pengguna sedang AKTIF/ONLINE setiap kali berinteraksi di aplikasi
    const now = Date.now();
    const lastUpdate = lastActivityMap.get(decoded.user_id) || 0;
    if (now - lastUpdate > 25000) {
      lastActivityMap.set(decoded.user_id, now);
      pool
        .query("UPDATE USERS SET last_active = NOW() WHERE user_id = ?", [decoded.user_id])
        .catch(() => {});
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Token tidak valid atau sudah kedaluwarsa." });
  }
};

module.exports = authMiddleware;