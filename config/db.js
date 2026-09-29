const mysql = require("mysql2/promise");
require("dotenv").config();

const poolConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// TiDB Cloud dan database cloud mewajibkan koneksi SSL
if (process.env.DB_HOST && process.env.DB_HOST !== "localhost") {
  poolConfig.ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
}

const pool = mysql.createPool(poolConfig);

pool
  .getConnection()
  .then((conn) => {
    console.log(`[db] Terhubung ke MySQL database "${process.env.DB_NAME}"`);
    conn.release();
  })
  .catch((err) => {
    console.error("[db] Gagal terhubung ke MySQL:", err.message);
  });

module.exports = pool;