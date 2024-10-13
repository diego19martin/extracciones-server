// extracciones.routes.js actualizado
import { Router } from "express";
import { getInfo, getResumen, postConfig, postList, postSelect } from "../controllers/extracciones.controller.js";
import cors from "cors";

const router = Router();

router.use(cors());

router.post('/postmaquinas', postList);
router.post('/postconfig', postConfig);
router.post('/postSelect', postSelect);
router.get('/getResumen', getResumen);
router.get('/getInfo/:maquina', getInfo);

export default router;