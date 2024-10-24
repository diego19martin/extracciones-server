// extracciones.routes.js actualizado
import { Router } from "express";
import { 
    generarYEnviarReporte, 
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
    getEmpleados
} from "../controllers/extracciones.controller.js";

const router = Router();

router.post('/postmaquinas', postList);
router.post('/postconfig', postConfig);
router.post('/postSelect', postSelect);
router.post('/generarReporte', generarYEnviarReporte);
router.get('/getResumen', getResumen);
router.get('/getInfo/:maquina', getInfo);

router.get('/employees', getEmployees);
router.post('/employees', addEmployee);
router.delete('/employees/:id', removeEmployee);
router.post('/employees/upload', uploadEmployees)
router.get('/empleados', getEmpleados);


export default router;