// Updated db.js
import { createPool } from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in root directory first
dotenv.config();

// Then, for backward compatibility, try loading from env/.env if it exists
// This allows the app to use either .env or env/.env
try {
  dotenv.config({ path: path.join(__dirname, 'env', '.env') });
} catch (error) {
  console.log("No env/.env file found, using root .env");
}

// Log connection info for debugging (remove in production)
console.log("Database connection info:");
console.log("Host:", process.env.DB_HOST);
console.log("User:", process.env.DB_USER);
console.log("Database:", process.env.DB_DATABASE);

// Create MySQL connection pool
export const pool = createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection and log result
pool.getConnection()
  .then(connection => {
    console.log('Database connection established successfully');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to database:', err.message);
    // Don't exit the process, let the application handle the error
  });