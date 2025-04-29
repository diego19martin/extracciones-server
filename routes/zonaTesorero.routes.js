// routes/zonaTesorero.routes.js
import { Router } from "express";
import { 
  confirmarZonaTesorero,
  getZonasTesorero,
  obtenerResumenTesorero
} from "../controllers/zonaTesorero.controller.js";

const router = Router();

// Rutas para la gestión de zonas del tesorero
router.get('/zonas-tesorero', getZonasTesorero);
router.post('/confirmar-zona', confirmarZonaTesorero);
router.get('/tesorero/resumen', obtenerResumenTesorero);

export default router;