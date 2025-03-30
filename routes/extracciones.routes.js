// routes/extracciones.routes.js
import { Router } from "express";
import { 
    generarYEnviarReporte, 
    generarReporteResumen,
    getInfo, 
    getResumen, 
    postConfig, 
    postList, 
    postSelect,
    getEmployees,
    addEmployee,
    removeEmployee,
    uploadEmployees,
    getEmpleados,
    getListadoFiltrado,
    getConfig,
    generateExcelExport
} from "../controllers/extracciones.controller.js";

// Importar las nuevas rutas del tesorero
import zonaTesoreroRoutes from "./zonaTesorero.routes.js";

const router = Router();

// Rutas existentes
router.post('/postmaquinas', postList);
router.post('/postconfig', postConfig);
router.post('/postSelect', postSelect);
router.post('/generarReporte', generarYEnviarReporte);
router.post('/generarReporteDiario', generarReporteResumen);
router.get('/getResumen', getResumen);
router.get('/getInfo/:maquina', getInfo);
router.get('/getListadoFiltrado', getListadoFiltrado);
router.get('/getConfig', getConfig);
router.get('/employees', getEmployees);
router.post('/employees', addEmployee);
router.delete('/employees/:id', removeEmployee);
router.post('/employees/upload', uploadEmployees);
router.get('/empleados', getEmpleados);
router.get('/exportExcel', generateExcelExport);

// Agregar las nuevas rutas del tesorero
router.use('/', zonaTesoreroRoutes);

export default router;