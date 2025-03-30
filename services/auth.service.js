// services/auth.service.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'palermo_extracciones_2024';
const JWT_EXPIRATION = '24h';

// Hashear contraseña
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Comprobar contraseña
const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

// Generar token JWT
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });
};

// Verificar token JWT
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

// Verificar si un usuario tiene el rol especificado
const hasRole = async (userId, requiredRoles) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.nombre
       FROM roles r
       JOIN user_roles ur ON r.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId]
    );

    const userRoles = rows.map(row => row.nombre);
    return requiredRoles.some(role => userRoles.includes(role));
  } catch (error) {
    console.error('Error en hasRole:', error);
    return false;
  }
};

export default {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  hasRole
};