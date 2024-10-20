// extracciones.routes.js actualizado
import { Router } from "express";
import { generarYEnviarReporte, getInfo, getResumen, postConfig, postList, postSelect } from "../controllers/extracciones.controller.js";

const router = Router();

router.post('/postmaquinas', postList);
router.post('/postconfig', postConfig);
router.post('/postSelect', postSelect);
router.post('/generarReporte', generarYEnviarReporte);
router.get('/getResumen', getResumen);
router.get('/getInfo/:maquina', getInfo);


export default router;