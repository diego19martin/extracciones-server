// routes/zonaTesorero.routes.js
import { Router } from "express";
import { 
  confirmarZonaTesorero,
  getZonasTesorero
} from "../controllers/zonaTesorero.controller.js";

const router = Router();

// Rutas para la gestión de zonas del tesorero
router.get('/zonas-tesorero', getZonasTesorero);
router.post('/confirmar-zona', confirmarZonaTesorero);

export default router;