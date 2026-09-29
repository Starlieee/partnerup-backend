const pool = require("../config/db");

exports.getProfile = async (req, res) => {
  const { user_id } = req.user;

  try {
    const [userRows] = await pool.query(
      "SELECT user_id, name, email FROM USERS WHERE user_id = ?",
      [user_id]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    const [profileRows] = await pool.query(
      "SELECT profile_id, location, description FROM PROFILES WHERE user_id = ?",
      [user_id]
    );

    const [interestRows] = await pool.query(
      `SELECT I.interest_id, I.name, I.category
       FROM USER_INTERESTS UI
       JOIN INTERESTS I ON UI.interest_id = I.interest_id
       WHERE UI.user_id = ?`,
      [user_id]
    );

    res.json({
      ...userRows[0],
      profile: profileRows[0] || { location: "", description: "" },
      interests: interestRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal mengambil data profil." });
  }
};

exports.updateProfile = async (req, res) => {
  const { user_id } = req.user;
  const { location, description, interest_ids, sports } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query("SELECT profile_id FROM PROFILES WHERE user_id = ?", [
      user_id,
    ]);

    if (existing.length > 0) {
      await conn.query(
        "UPDATE PROFILES SET location = ?, description = ? WHERE user_id = ?",
        [location || "", description || "", user_id]
      );
    } else {
      await conn.query(
        "INSERT INTO PROFILES (user_id, location, description) VALUES (?, ?, ?)",
        [user_id, location || "", description || ""]
      );
    }

    // Otomatis sinkronkan cabang hobi yang dipilih ke tabel USER_INTERESTS di database
    let finalInterestIds = Array.isArray(interest_ids) ? [...interest_ids] : [];

    if (Array.isArray(sports) && sports.length > 0) {
      for (const sportName of sports) {
        const cleanName = sportName.split("/")[0].split("&")[0].trim();
        const [rows] = await conn.query(
          "SELECT interest_id FROM INTERESTS WHERE name LIKE ? LIMIT 1",
          [`%${cleanName}%`]
        );
        if (rows.length > 0) {
          if (!finalInterestIds.includes(rows[0].interest_id)) {
            finalInterestIds.push(rows[0].interest_id);
          }
        }
      }
    }

    if (finalInterestIds.length > 0 || Array.isArray(interest_ids)) {
      await conn.query("DELETE FROM USER_INTERESTS WHERE user_id = ?", [user_id]);
      if (finalInterestIds.length > 0) {
        const values = finalInterestIds.map((id) => [user_id, id]);
        await conn.query("INSERT INTO USER_INTERESTS (user_id, interest_id) VALUES ?", [values]);
      }
    }

    await conn.commit();
    res.json({ message: "Profil berhasil diperbarui." });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: "Gagal memperbarui profil." });
  } finally {
    conn.release();
  }
};