import { Router } from "express";
import { getInfo, getResumen, postConfig, postList, postSelect } from "../controllers/extracciones.controller.js";

const router = Router();

router.post('/postmaquinas', postList);
router.post('/postconfig/:limite', postConfig);
router.post('/postSelect', postSelect);
router.get('/getResumen', getResumen);
router.get('/getInfo/:maquina', getInfo);


export default router;