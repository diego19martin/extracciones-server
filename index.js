import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import { createServer } from "http";
import { Server } from "socket.io";
import extraccionesRoutes from "./routes/extracciones.routes.js";
import zonaConciliacionRoutes from "./routes/zona-conciliacion.routes.js";
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js"; // Nueva importación para rutas administrativas
import cron from 'node-cron';
import { generarReporteResumen, generarYEnviarReporte } from './controllers/extracciones.controller.js';
import bodyParser from 'body-parser';
import helmet from 'helmet'; // Para seguridad de headers HTTP
import rateLimit from 'express-rate-limit'; // Limitar intentos de login

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"]
  }
});

// Configuraciones de seguridad básicas
app.use(helmet({
  contentSecurityPolicy: false, // Deshabilitar para aplicaciones con interfaz de usuario React
}));

// Limitar intentos de login (20 por 15 minutos)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Demasiados intentos desde esta IP, intente más tarde' }
});

// Aplicar el limitador sólo a la ruta de login
app.use('/api/auth/login', loginLimiter);

// Definir el origen según el entorno
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? process.env.API_URL_HEROKU  // En producción (Heroku)
  : process.env.API_URL_LOCAL;  // En desarrollo local

// Configurar CORS
app.use(cors({  
  origin: '*',
  methods: ["GET", "POST", "PUT", "DELETE"], // Añadido PUT y DELETE para operaciones CRUD en el panel admin
  credentials: true
}));

// Aumentar límite de payload
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Carpeta estática para reportes generados
app.use('/reportes', express.static('reportes'));

// Rutas
app.use('/api', extraccionesRoutes);
app.use('/api', zonaConciliacionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // Nuevas rutas de administración

// Escuchar en el puerto especificado
server.listen(process.env.PORT || 4000, () => {
  console.log(`Server running on port ${process.env.PORT || 4000}`);
});

// Exportar el objeto io para su uso en otros módulos
export { io };