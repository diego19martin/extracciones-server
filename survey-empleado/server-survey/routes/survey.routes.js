import { Router } from "express";
import { createSurvey, getSurveys, getSurveysMonth, getComments, getCommentsProm, getCommentsPas } from "../controllers/survey.controllers.js";

const router = Router();

router.get('/surveys', getSurveys);
router.get('/surveysmonth', getSurveysMonth);
router.get('/comments', getComments);
router.get('/commentsprom', getCommentsProm);
router.get('/commentspas', getCommentsPas);
router.post('/newsurvey', createSurvey);


export default router;