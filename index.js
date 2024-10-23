import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import extraccionesRoutes from "./routes/extracciones.routes.js";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Adjust this to match your frontend URL
    methods: ["GET", "POST"]
  }
});

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

export { io };