// routes/admin.routes.js
import { Router } from "express";
import {
  getStats,
  getConciliacionesPorZona,
  getResumenMensual,
  getUltimasConciliaciones,
  getAlertas,
  getTopEmpleados,
  getResumenPorZonas,
  generarReporte,
  getMaquinasHeatmap,
  getRendimientoStats
} from "../controllers/admin.controller.js";
import { verifyToken, isAdmin } from "../middleware/auth.middleware.js";

const router = Router();

// Todas las rutas requieren autenticación y rol de administrador o jefe de juego
router.use(verifyToken);
router.use(isAdmin);

// Rutas para el dashboard de administrador
router.get('/stats', getStats);
router.get('/conciliaciones-por-zona', getConciliacionesPorZona);
router.get('/resumen-mensual', getResumenMensual);
router.get('/ultimas-conciliaciones', getUltimasConciliaciones);
router.get('/alertas', getAlertas);
router.get('/top-empleados', getTopEmpleados);
router.get('/resumen-zonas', getResumenPorZonas);
router.get('/heatmap', getMaquinasHeatmap);
router.get('/rendimiento', getRendimientoStats);
router.post('/generar-reporte', generarReporte);

export default router;