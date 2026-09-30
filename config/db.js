const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 4000,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool
  .getConnection()
  .then((conn) => {
    console.log(`[db] Terhubung ke MySQL database "${process.env.DB_NAME}"`);
    conn.release();
  })
  .catch((err) => {
    console.error("[db] Gagal terhubung ke MySQL. Detail lengkap:");
    console.error(err);
  });

module.exports = pool;