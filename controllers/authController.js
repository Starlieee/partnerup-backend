const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
require("dotenv").config();

const generateToken = (user) => {
  return jwt.sign(
    { user_id: user.user_id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
};

exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi." });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: "Password minimal 6 karakter." });
  }

  try {
    const [existing] = await pool.query("SELECT user_id FROM USERS WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: "Email sudah terdaftar. Gunakan email lain." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO USERS (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );

    // Buat baris profil kosong secara otomatis agar user langsung bisa melengkapi profil
    await pool.query(
      "INSERT INTO PROFILES (user_id, location, description) VALUES (?, ?, ?)",
      [result.insertId, "", ""]
    );

    const user = { user_id: result.insertId, name, email };
    const token = generateToken(user);

    res.status(201).json({
      message: "Registrasi berhasil. Selamat datang di PartnerUp!",
      token,
      user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan pada server saat registrasi." });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email dan password wajib diisi." });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM USERS WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    const token = generateToken(user);

    res.json({
      message: `Selamat datang kembali, ${user.name}!`,
      token,
      user: { user_id: user.user_id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan pada server saat login." });
  }
};

exports.resetPassword = async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: "Email dan password baru wajib diisi." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Password baru minimal 6 karakter." });
  }

  try {
    const [rows] = await pool.query("SELECT user_id, name FROM USERS WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Email tidak terdaftar dalam sistem." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query("UPDATE USERS SET password = ? WHERE email = ?", [hashedPassword, email]);

    res.json({ message: "Password berhasil diperbarui! Silakan masuk dengan password baru Anda." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan saat mereset password." });
  }
};

exports.heartbeat = async (req, res) => {
  const { user_id } = req.user;
  try {
    await pool.query("UPDATE USERS SET last_active = NOW() WHERE user_id = ?", [user_id]);
    res.json({ status: "ok", last_active: new Date() });
  } catch (err) {
    res.status(500).json({ message: "Gagal memperbarui status aktif." });
  }
};