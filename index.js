import express from "express";
import cors from "cors";
import dotenv from 'dotenv';
import { createServer } from "http";
import { Server } from "socket.io";
import extraccionesRoutes from "./routes/extracciones.routes.js";
import cron from 'node-cron';
import { generarReporteResumen, generarYEnviarReporte } from './controllers/extracciones.controller.js';
import bodyParser from 'body-parser';

dotenv.config();  // Cargar las variables de entorno desde el archivo .env

const app = express();
const server = createServer(app);  // Usar http.createServer para socket.io
const io = new Server(server, {
  cors: {
    origin: '*',  // Permitir todas las conexiones de origen por ahora
    methods: ["GET", "POST"]
  }
});

// Escuchar en el puerto especificado por Heroku o por defecto en 4000
server.listen(process.env.PORT || 4000, () => {
  console.log(`Server running on port ${process.env.PORT || 4000}`);
});

// Definir el origen según el entorno
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? process.env.API_URL_HEROKU  // En producción (Heroku)
  : process.env.API_URL_LOCAL;  // En desarrollo local

// Configurar CORS para permitir localhost:3000
app.use(cors({  
  origin: '*', // Permitir el origen especificado
  methods: ["GET", "POST"],
  credentials: true  // Permitir el envío de cookies
  }));
  
// Increase payload size limit
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use('/api', extraccionesRoutes);


// Exportar el objeto io para su uso en otros módulos
export { io };

// Programar cron jobs

cron.schedule('50 12 * * *', () => {
  console.log('wakeup');
});

cron.schedule('15 13 * * *', () => {
  console.log('Generando y enviando reporte diario a las 11 AM Buenos Aires (13:00 UTC)');
  generarReporteResumen();
});

cron.schedule('15 13 * * *', () => {
  console.log('Generando y enviando reporte técnico a las 11 AM Buenos Aires (14:00 UTC)');
  generarYEnviarReporte('tecnica');
});

// pruebas

cron.schedule('05 15 * * *', () => {
  console.log('Generando y enviando reporte diario a las 10 AM Buenos Aires (13:00 UTC)');
  generarReporteResumen();
});

cron.schedule('05 15 * * *', () => {
  console.log('Generando y enviando reporte técnico a las 11 AM Buenos Aires (14:00 UTC)');
  generarYEnviarReporte('tecnica');
});
