const pool = require("../config/db");

const SPORT_LIST = [
  "Badminton",
  "Futsal",
  "Lari",
  "Gym",
  "Basket",
  "Sepeda",
  "Tenis",
  "Renang",
  "Outdoor",
  "Esports",
  "Voli",
  "Tenis Meja",
];

const attachInterests = async (users) => {
  if (users.length === 0) return users;
  const ids = users.map((u) => u.user_id);
  const [rows] = await pool.query(
    `SELECT UI.user_id, I.interest_id, I.name, I.category
     FROM USER_INTERESTS UI
     JOIN INTERESTS I ON UI.interest_id = I.interest_id
     WHERE UI.user_id IN (?)`,
    [ids]
  );

  return users.map((u) => {
    let list = rows.filter((r) => r.user_id === u.user_id);

    // Otomatis hubungkan hobi yang ada di deskripsi profil pengguna ke dalam tag minat
    if (u.description) {
      SPORT_LIST.forEach((sport, idx) => {
        if (
          u.description.toLowerCase().includes(sport.toLowerCase()) &&
          !list.some((item) => item.name.toLowerCase() === sport.toLowerCase())
        ) {
          list.push({
            interest_id: 1000 + idx,
            name: sport,
            category: "Sport & Hobby",
          });
        }
      });
    }

    return {
      ...u,
      interests: list,
    };
  });
};

exports.getPartners = async (req, res) => {
  const { user_id } = req.user;

  try {
    const [users] = await pool.query(
      `SELECT U.user_id, U.name, U.email, U.last_active,
              CASE WHEN U.last_active >= NOW() - INTERVAL 3 MINUTE THEN 1 ELSE 0 END AS is_online,
              P.location, P.description
       FROM USERS U
       LEFT JOIN PROFILES P ON U.user_id = P.user_id
       WHERE U.user_id != ?
       ORDER BY is_online DESC, U.user_id DESC`,
      [user_id]
    );

    const result = await attachInterests(users);
    res.json(result);
  } catch (err) {
    console.error("[getPartners error]:", err);
    res.status(500).json({ message: "Gagal mengambil daftar partner." });
  }
};

exports.searchByInterest = async (req, res) => {
  const { user_id } = req.user;
  const { interest } = req.query;

  if (!interest) {
    return res.status(400).json({ message: "Parameter interest wajib diisi." });
  }

  try {
    // Pencarian menyeluruh dengan status online pengguna
    const [users] = await pool.query(
      `SELECT DISTINCT U.user_id, U.name, U.email, U.last_active,
              CASE WHEN U.last_active >= NOW() - INTERVAL 3 MINUTE THEN 1 ELSE 0 END AS is_online,
              P.location, P.description
       FROM USERS U
       LEFT JOIN PROFILES P ON U.user_id = P.user_id
       LEFT JOIN USER_INTERESTS UI ON UI.user_id = U.user_id
       LEFT JOIN INTERESTS I ON I.interest_id = UI.interest_id
       WHERE U.user_id != ? AND (
         I.name LIKE ? OR
         P.description LIKE ? OR
         P.location LIKE ? OR
         U.name LIKE ?
       )
       ORDER BY is_online DESC, U.user_id DESC`,
      [user_id, `%${interest}%`, `%${interest}%`, `%${interest}%`, `%${interest}%`]
    );

    const result = await attachInterests(users);
    res.json(result);
  } catch (err) {
    console.error("[searchByInterest error]:", err);
    res.status(500).json({ message: "Gagal mencari partner berdasarkan minat." });
  }
};