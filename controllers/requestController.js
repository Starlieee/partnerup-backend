const pool = require("../config/db");

// Pembuatan tabel MESSAGES yang tahan benturan dan mendukung penanda status dibaca (is_read)
const ensureMessagesTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS MESSAGES (
        message_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        sender_id INT NOT NULL,
        message TEXT NOT NULL,
        is_read TINYINT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Tambahkan kolom is_read jika tabel sebelumnya sudah ada tanpa kolom is_read
    try {
      await pool.query(`ALTER TABLE MESSAGES ADD COLUMN is_read TINYINT DEFAULT 0`);
    } catch (e) {
      // Abaikan jika kolom is_read sudah ada
    }
    console.log("[db] Tabel MESSAGES siap digunakan dengan dukungan notifikasi.");
  } catch (err) {
    console.error("[db] Catatan inisialisasi tabel MESSAGES:", err.message);
  }
};
ensureMessagesTable();

exports.sendRequest = async (req, res) => {
  const sender_id = req.user.user_id;
  const { receiver_id } = req.body;

  if (!receiver_id) {
    return res.status(400).json({ message: "receiver_id wajib diisi." });
  }
  if (Number(receiver_id) === Number(sender_id)) {
    return res.status(400).json({ message: "Kamu tidak bisa mengirim ajakan ke dirimu sendiri." });
  }

  try {
    const [existing] = await pool.query(
      `SELECT request_id, status FROM PARTNERSHIP_REQUESTS
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)`,
      [sender_id, receiver_id, receiver_id, sender_id]
    );

    const pendingOrAccepted = existing.find(
      (r) => r.status === "pending" || r.status === "accepted"
    );

    if (pendingOrAccepted) {
      return res.status(409).json({
        message:
          pendingOrAccepted.status === "accepted"
            ? "Kamu sudah berteman/berkolaborasi dengan partner ini."
            : "Ajakan ke partner ini masih menunggu respon (pending).",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO PARTNERSHIP_REQUESTS (sender_id, receiver_id, status, created_at, updated_at)
       VALUES (?, ?, 'pending', NOW(), NOW())`,
      [sender_id, receiver_id]
    );

    res.status(201).json({ message: "Ajakan kolaborasi berhasil dikirim!", request_id: result.insertId });
  } catch (err) {
    console.error("[sendRequest error]:", err);
    res.status(500).json({ message: "Gagal mengirim ajakan." });
  }
};

exports.getRequests = async (req, res) => {
  const { user_id } = req.user;

  try {
    const [incoming] = await pool.query(
      `SELECT R.request_id, R.status, R.created_at, R.updated_at,
              U.user_id AS sender_id, U.name AS sender_name, U.email AS sender_email,
              U.last_active,
              CASE WHEN U.last_active >= NOW() - INTERVAL 3 MINUTE THEN 1 ELSE 0 END AS is_online
       FROM PARTNERSHIP_REQUESTS R
       JOIN USERS U ON R.sender_id = U.user_id
       WHERE R.receiver_id = ?
       ORDER BY R.created_at DESC`,
      [user_id]
    );

    const [outgoing] = await pool.query(
      `SELECT R.request_id, R.status, R.created_at, R.updated_at,
              U.user_id AS receiver_id, U.name AS receiver_name, U.email AS receiver_email,
              U.last_active,
              CASE WHEN U.last_active >= NOW() - INTERVAL 3 MINUTE THEN 1 ELSE 0 END AS is_online
       FROM PARTNERSHIP_REQUESTS R
       JOIN USERS U ON R.receiver_id = U.user_id
       WHERE R.sender_id = ?
       ORDER BY R.created_at DESC`,
      [user_id]
    );

    res.json({ incoming, outgoing });
  } catch (err) {
    console.error("[getRequests error]:", err);
    res.status(500).json({ message: "Gagal mengambil daftar ajakan." });
  }
};

const updateStatus = async (req, res, status) => {
  const { user_id } = req.user;
  const { id } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT * FROM PARTNERSHIP_REQUESTS WHERE request_id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "Ajakan tidak ditemukan." });
    }
    if (Number(rows[0].receiver_id) !== Number(user_id)) {
      return res.status(403).json({ message: "Kamu tidak berhak mengubah ajakan ini." });
    }
    if (rows[0].status !== "pending") {
      return res.status(400).json({ message: "Ajakan ini sudah direspon sebelumnya." });
    }

    await pool.query(
      "UPDATE PARTNERSHIP_REQUESTS SET status = ?, updated_at = NOW() WHERE request_id = ?",
      [status, id]
    );

    res.json({ message: status === "accepted" ? "Ajakan diterima! Silakan buka Private Chat." : "Ajakan ditolak." });
  } catch (err) {
    console.error("[updateStatus error]:", err);
    res.status(500).json({ message: "Gagal memproses status ajakan." });
  }
};

exports.acceptRequest = (req, res) => updateStatus(req, res, "accepted");
exports.rejectRequest = (req, res) => updateStatus(req, res, "rejected");

// ================= PRIVATE CHAT SINKRONISASI =================
exports.getMessages = async (req, res) => {
  const { user_id } = req.user;
  const { id } = req.params;

  try {
    const [requests] = await pool.query(
      "SELECT * FROM PARTNERSHIP_REQUESTS WHERE request_id = ? AND (sender_id = ? OR receiver_id = ?)",
      [id, user_id, user_id]
    );

    if (requests.length === 0) {
      return res.status(403).json({ message: "Kamu tidak memiliki izin mengakses percakapan ini." });
    }

    const { sender_id, receiver_id } = requests[0];

    const [messages] = await pool.query(
      `SELECT M.message_id, M.request_id, M.sender_id, M.message, M.is_read, M.created_at, U.name AS sender_name
       FROM MESSAGES M
       LEFT JOIN USERS U ON M.sender_id = U.user_id
       WHERE M.request_id IN (
         SELECT request_id FROM PARTNERSHIP_REQUESTS
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       )
       ORDER BY M.created_at ASC`,
      [sender_id, receiver_id, receiver_id, sender_id]
    );

    res.json(messages);
  } catch (err) {
    console.error("[getMessages error]:", err);
    res.status(500).json({ message: "Gagal mengambil pesan chat dari database." });
  }
};

exports.sendMessage = async (req, res) => {
  const { user_id } = req.user;
  const { id } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ message: "Pesan tidak boleh kosong." });
  }

  try {
    const [requests] = await pool.query(
      "SELECT * FROM PARTNERSHIP_REQUESTS WHERE request_id = ? AND (sender_id = ? OR receiver_id = ?)",
      [id, user_id, user_id]
    );

    if (requests.length === 0) {
      return res.status(403).json({ message: "Kamu tidak memiliki izin mengirim pesan di percakapan ini." });
    }

    const [result] = await pool.query(
      "INSERT INTO MESSAGES (request_id, sender_id, message, is_read, created_at) VALUES (?, ?, ?, 0, NOW())",
      [id, user_id, message.trim()]
    );

    res.status(201).json({
      message_id: result.insertId,
      request_id: Number(id),
      sender_id: user_id,
      message: message.trim(),
      is_read: 0,
      created_at: new Date(),
    });
  } catch (err) {
    console.error("[sendMessage error]:", err);
    res.status(500).json({ message: "Gagal mengirim pesan chat." });
  }
};

// ================= NOTIFIKASI LONCENG =================
exports.getNotifications = async (req, res) => {
  const { user_id } = req.user;

  try {
    // 1. Pesan belum dibaca dari partner (M.sender_id != user_id dan is_read = 0)
    const [unreadMessages] = await pool.query(
      `SELECT M.message_id, M.request_id, M.sender_id, M.message, M.created_at,
              U.name AS sender_name, 'message' AS type
       FROM MESSAGES M
       JOIN USERS U ON M.sender_id = U.user_id
       WHERE M.sender_id != ? 
         AND (M.is_read = 0 OR M.is_read IS NULL)
         AND M.request_id IN (
           SELECT request_id FROM PARTNERSHIP_REQUESTS
           WHERE sender_id = ? OR receiver_id = ?
         )
       ORDER BY M.created_at DESC
       LIMIT 10`,
      [user_id, user_id, user_id]
    );

    // 2. Ajakan sparring baru yang masuk (status pending)
    const [pendingRequests] = await pool.query(
      `SELECT R.request_id, R.sender_id, R.created_at,
              U.name AS sender_name, 'request' AS type,
              'Mengajak kamu berkolaborasi / sparring' AS message
       FROM PARTNERSHIP_REQUESTS R
       JOIN USERS U ON R.sender_id = U.user_id
       WHERE R.receiver_id = ? AND R.status = 'pending'
       ORDER BY R.created_at DESC
       LIMIT 5`,
      [user_id]
    );

    // Gabungkan notifikasi
    const allNotifications = [...unreadMessages, ...pendingRequests].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    res.json({
      unreadCount: allNotifications.length,
      notifications: allNotifications,
    });
  } catch (err) {
    console.error("[getNotifications error]:", err);
    res.status(500).json({ message: "Gagal mengambil notifikasi lonceng." });
  }
};

exports.markAsRead = async (req, res) => {
  const { user_id } = req.user;
  const { id } = req.params; // request_id

  try {
    // Cari pasangan partner untuk request_id ini agar semua pesan pasangan ini ditandai dibaca
    const [requests] = await pool.query(
      "SELECT sender_id, receiver_id FROM PARTNERSHIP_REQUESTS WHERE request_id = ?",
      [id]
    );

    if (requests.length > 0) {
      const { sender_id, receiver_id } = requests[0];
      await pool.query(
        `UPDATE MESSAGES SET is_read = 1
         WHERE sender_id != ? AND request_id IN (
           SELECT request_id FROM PARTNERSHIP_REQUESTS
           WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         )`,
        [user_id, sender_id, receiver_id, receiver_id, sender_id]
      );
    } else {
      await pool.query(
        "UPDATE MESSAGES SET is_read = 1 WHERE request_id = ? AND sender_id != ?",
        [id, user_id]
      );
    }

    res.json({ message: "Pesan telah ditandai sebagai dibaca." });
  } catch (err) {
    console.error("[markAsRead error]:", err);
    res.status(500).json({ message: "Gagal memperbarui status baca." });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  const { user_id } = req.user;

  try {
    await pool.query(
      `UPDATE MESSAGES SET is_read = 1
       WHERE sender_id != ? AND request_id IN (
         SELECT request_id FROM PARTNERSHIP_REQUESTS
         WHERE sender_id = ? OR receiver_id = ?
       )`,
      [user_id, user_id, user_id]
    );

    res.json({ message: "Semua pesan telah ditandai telah dibaca." });
  } catch (err) {
    console.error("[markAllNotificationsRead error]:", err);
    res.status(500).json({ message: "Gagal memperbarui notifikasi." });
  }
};