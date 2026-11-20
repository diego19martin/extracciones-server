// extracciones.routes.js actualizado
import { Router } from "express";
import { 
    generarYEnviarReporte, 
    generarReporteResumen,
    getInfo, 
    getResumen, 
    postConfig, 
    postList, 
    postSelect,
    // Nuevas funciones para empleados
    getEmployees,
    addEmployee,
    removeEmployee,
    uploadEmployees,
    getListadoFiltrado,
    getConfig,
    generateExcelExport
} from "../controllers/extracciones.controller.js";
import { postArchivoAutomatico, getUltimaCarga } from "../controllers/carga.controller.js";

const router = Router();

// Carga automática del "Archivo para App" (Power Automate)
router.post('/archivoAutomatico', postArchivoAutomatico);
router.get('/ultimaCarga', getUltimaCarga);

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
router.post('/employees/upload', uploadEmployees)



// Nueva ruta para exportar a Excel
router.get('/exportExcel', generateExcelExport);


export default router;