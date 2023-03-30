import { Router } from "express";
import { getInfo, getResumen, postConfig, postList, postSelect } from "../controllers/extracciones.controller.js";
import cors from "cors";

const router = Router();


const corsOption = {
    credentials: true,
    origin: '*'
}


router.post('/postmaquinas', postList);
router.post('/postconfig/:limite', postConfig);
router.post('/postSelect', postSelect);
router.get('/getResumen', getResumen, cors(corsOption));
router.get('/getInfo/:maquina', getInfo, cors(corsOption));



export default router;