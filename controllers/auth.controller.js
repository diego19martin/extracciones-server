// controllers/auth.controller.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import authService from '../services/auth.service.js';
import { pool } from '../db.js';

export const register = async (req, res) => {
    console.log('Datos recibidos:', JSON.stringify(req.body, null, 2));
    
    try {
      const { nombre, apellido, email, password, roles, username: providedUsername } = req.body;
  
      // Validación mejorada
      const validationErrors = [];
      if (!nombre) validationErrors.push('El nombre es requerido');
      if (!apellido) validationErrors.push('El apellido es requerido');
      if (!email) validationErrors.push('El email es requerido');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        validationErrors.push('El formato del email es inválido');
      }
      if (!password) validationErrors.push('La contraseña es requerida');
      else if (password.length < 6) {
        validationErrors.push('La contraseña debe tener al menos 6 caracteres');
      }
      if (!roles || !Array.isArray(roles) || roles.length === 0) {
        validationErrors.push('Debe seleccionar al menos un rol válido');
      }
  
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: validationErrors.join('. ')
        });
      }
  
      // Verificar email duplicado
      const [existingEmails] = await pool.query(
        'SELECT * FROM users WHERE email = ?',
        [email]
      );
  
      if (existingEmails.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'El correo electrónico ya está registrado'
        });
      }
  
      // Generar username normalizado (sin acentos ni caracteres especiales)
      let username = providedUsername || 
                    (nombre.charAt(0) + apellido).toLowerCase()
                      .replace(/\s+/g, '')
                      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      
      console.log('Username generado:', username);
      
      // Verificar si el username ya existe
      const [existingUsernames] = await pool.query(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );
  
      if (existingUsernames.length > 0) {
        // Si ya existe, añadir un número aleatorio
        username = `${username}${Math.floor(Math.random() * 1000)}`;
        console.log('Username modificado:', username);
      }
  
      // Validar roles
      let roleIds = [];
      if (Array.isArray(roles)) {
        // Verificar que sean números válidos
        roleIds = roles.map(role => 
          typeof role === 'string' ? parseInt(role, 10) : role
        ).filter(id => !isNaN(id) && id > 0);
        
        // Verificar que los roles existan en la base de datos
        const roleIdsString = roleIds.join(',');
        const [validRoles] = await pool.query(
          `SELECT role_id FROM roles WHERE role_id IN (${roleIdsString})`
        );
        
        if (validRoles.length !== roleIds.length) {
          return res.status(400).json({
            success: false,
            message: 'Algunos roles seleccionados no son válidos'
          });
        }
      }
  
      if (roleIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar al menos un rol válido'
        });
      }
  
      // Hashear contraseña
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Iniciar transacción
      await pool.query('START TRANSACTION');
  
      try {
        // Insertar usuario
        const [result] = await pool.query(
          `INSERT INTO users (username, password, email, nombre, apellido, status, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, 'activo', NOW(), NOW())`,
          [username, hashedPassword, email, nombre, apellido]
        );
        
        const userId = result.insertId;
        console.log('Usuario creado con ID:', userId);
  
        // Insertar roles del usuario
        for (const roleId of roleIds) {
          await pool.query(
            'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW())',
            [userId, roleId]
          );
        }
  
        // Confirmar transacción
        await pool.query('COMMIT');
  
        // Responder con éxito
        return res.status(201).json({
          success: true,
          message: 'Usuario registrado exitosamente',
          data: {
            id: userId,
            username,
            email,
            nombre,
            apellido,
            roles: roleIds
          }
        });
      } catch (err) {
        // Revertir transacción en caso de error
        await pool.query('ROLLBACK');
        console.error('Error en transacción:', err);
        throw err;
      }
    } catch (error) {
      console.error('Error en register:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Usuario y contraseña son requeridos' 
      });
    }

    // Buscar usuario por username o email
    const [users] = await pool.query(
      `SELECT u.user_id, u.username, u.password, u.nombre, u.apellido, u.email, u.status
       FROM users u
       WHERE (u.username = ? OR u.email = ?) AND u.status = 'activo'`,
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas' 
      });
    }

    const user = users[0];

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Credenciales inválidas' 
      });
    }

    // Obtener roles y módulos del usuario
    const [userRoles] = await pool.query(
      `SELECT r.role_id, r.nombre as role_nombre
       FROM roles r
       JOIN user_roles ur ON r.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.user_id]
    );

    const [modules] = await pool.query(
      `SELECT DISTINCT m.module_id, m.nombre, m.ruta, m.icono, m.orden, m.descripcion
       FROM modules m
       JOIN role_modules rm ON m.module_id = rm.module_id
       JOIN user_roles ur ON rm.role_id = ur.role_id
       WHERE ur.user_id = ?
       ORDER BY m.orden ASC`,
      [user.user_id]
    );

    // Actualizar último login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE user_id = ?',
      [user.user_id]
    );

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user.user_id, 
        username: user.username,
        roles: userRoles.map(r => r.role_nombre)
      },
      process.env.JWT_SECRET || 'palermo_extracciones_2024',
      { expiresIn: '24h' }
    );

    // Responder con datos del usuario y token
    return res.status(200).json({
      success: true,
      message: 'Login exitoso',
      data: {
        user: {
          id: user.user_id,
          username: user.username,
          nombre: user.nombre,
          apellido: user.apellido,
          email: user.email
        },
        roles: userRoles,
        modules: modules,
        token
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor' 
    });
  }
};

export const getRoles = async (req, res) => {
  try {
    const [roles] = await pool.query('SELECT * FROM roles');
    
    return res.status(200).json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error al obtener roles:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error al obtener roles' 
    });
  }
};

/**
 * Obtiene la lista de nombres de usuario existentes para validación
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getUsernames = async (req, res) => {
    try {
      // Consultar todos los nombres de usuario de la tabla users
      const [users] = await pool.query('SELECT username FROM users');
      
      // Enviar solo los nombres de usuario como respuesta
      res.json(users);
    } catch (error) {
      console.error('Error al obtener nombres de usuario:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error al obtener nombres de usuario',
        error: error.message
      });
    }
  };

// Puedes agregar más funciones según sea necesario

export default {
  register,
  login,
  getRoles
};