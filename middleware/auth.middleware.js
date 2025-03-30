// middleware/auth.middleware.js
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'palermo_extracciones_2024';

export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No se proporcionó token de autenticación'
      });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          success: false,
          message: 'Token inválido o expirado'
        });
      }
      
      // Guardar información del usuario en la solicitud
      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('Error en verifyToken:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en la verificación del token'
    });
  }
};

// Middleware para verificar que el usuario tenga uno de los roles especificados
export const hasRole = (roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'No autenticado'
        });
      }
      
      const userId = req.user.id;
      
      // Obtener roles del usuario
      const [userRoles] = await pool.query(
        `SELECT r.nombre
         FROM roles r
         JOIN user_roles ur ON r.role_id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId]
      );
      
      const userRoleNames = userRoles.map(role => role.nombre);
      
      // Verificar si el usuario tiene alguno de los roles requeridos
      const hasRequiredRole = roles.some(role => userRoleNames.includes(role));
      
      if (!hasRequiredRole) {
        return res.status(403).json({
          success: false,
          message: 'No tiene permisos para acceder a este recurso'
        });
      }
      
      next();
    } catch (error) {
      console.error('Error en hasRole middleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en la verificación de roles'
      });
    }
  };
};

// Middleware específico para roles administrativos
export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado'
      });
    }
    
    const userId = req.user.id;
    
    // Obtener roles del usuario
    const [userRoles] = await pool.query(
      `SELECT r.nombre
       FROM roles r
       JOIN user_roles ur ON r.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [userId]
    );
    
    const userRoleNames = userRoles.map(role => role.nombre);
    
    // Verificar si el usuario tiene rol de admin o jefe_juego
    if (!userRoleNames.includes('admin') && !userRoleNames.includes('jefe_juego')) {
      return res.status(403).json({
        success: false,
        message: 'Acceso denegado: Se requiere rol de administrador o jefe de juego'
      });
    }
    
    next();
  } catch (error) {
    console.error('Error en isAdmin middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en la verificación de roles administrativos'
    });
  }
};