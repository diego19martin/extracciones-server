import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import extraccionesRoutes from "./routes/extracciones.routes.js";
import cron from 'node-cron';
import { generarReporteResumen, generarYEnviarReporte } from './controllers/extracciones.controller.js'; // Importa tu función


const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://extracciones-client-conversion.vercel.app",
    methods: ["GET", "POST"]
  }
});

// const io = new Server(server, {
//   cors: {
//     origin: ["http://localhost:3000", "http://localhost:4000"],
//     methods: ["GET", "POST"]
//   }
// });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use(extraccionesRoutes);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Our app is running on port ${PORT}`);
});

// Programa la tarea para las 10 AM todos los días
cron.schedule('0 13 * * *', () => {
  console.log('Generando y enviando reporte diario a las 10 AM');
  generarReporteResumen(); // Llama a la función que genera y envía el reporte
});

// Programa la tarea para las 14:00 UTC (que es 11:00 AM en Buenos Aires)
cron.schedule('25 15 * * *', () => {
  console.log('Generando y enviando reporte técnico a las 11:00 AM Buenos Aires (14:00 UTC)');
  generarYEnviarReporte('tecnica'); // Asegúrate de pasar el tipo de reporte correcto
});

export { io };