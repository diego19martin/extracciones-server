// routes/auth.routes.js
import { Router } from 'express';
import { register, login, getRoles, getUsernames } from '../controllers/auth.controller.js';
import { verifyToken } from '../middleware/auth.middleware.js';

const router = Router();

// Rutas públicas
router.post('/register', register);
router.post('/login', login);
router.get('/usernames', getUsernames); // Nueva ruta para obtener usernames

// Rutas protegidas
router.get('/roles', verifyToken, getRoles);

export default router;