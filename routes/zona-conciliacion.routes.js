import { Router } from "express";
import {
    guardarConciliacionZona,
    confirmarConciliacionZona,
    obtenerConciliaciones,
    obtenerConciliacionDetalle,
    obtenerEstadisticas,
    obtenerMaquinasTesorero,
    sincronizarMaquinasTesorero,
    guardarConciliacionData,
    obtenerResumenPorZonas
} from "../controllers/zona-conciliacion.controller.js";

const router = Router();

// Rutas para conciliación de zonas
router.post('/zonas/conciliacion', guardarConciliacionZona);
router.post('/zonas/conciliacion/confirmar', confirmarConciliacionZona);
router.get('/zonas/conciliaciones', obtenerConciliaciones);
router.get('/zonas/conciliacion/:id', obtenerConciliacionDetalle);
router.get('/zonas/estadisticas', obtenerEstadisticas);
router.post('/zonas/conciliacion-data', guardarConciliacionData);
router.get('/tesorero/resumen-zonas', obtenerResumenPorZonas);

// Nuevas rutas para el dashboard del tesorero
router.get('/tesorero/maquinas', obtenerMaquinasTesorero);
router.post('/tesorero/sincronizar', sincronizarMaquinasTesorero);


export default router;