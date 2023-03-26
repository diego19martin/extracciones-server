import {pool} from '../db.js'

export const getSurveys = async(req, res)=> {
    const [result] = await pool.query('SELECT * from nps')
    res.json(result)
}

export const createSurvey = async(req, res)=> {

    console.log(req.body);

    var {nps_score, disappointing_features, promoter_features, disappointing_experience, passive_experience, prom_experience} = req.body;
    
    console.log(nps_score, disappointing_features, promoter_features, disappointing_experience, passive_experience, prom_experience);

    const result = await pool.query("INSERT INTO nps(score, disapFeature, promFeature, disapExper, pasExper, promExperience) VALUES (?,JSON_ARRAY(?),JSON_ARRAY(?),?,?,?)",[nps_score, disappointing_features, promoter_features, disappointing_experience, passive_experience, prom_experience]);

    res.json(result)

    
}

export const getSurveysMonth = async(req, res) => {

    var date = new Date();
    var month = date.getMonth();
    month++;

    const [result] = await pool.query('SELECT * from nps WHERE MONTH(date) = ?',[month]);
    res.json(result);
    
}

export const getComments = async(req, res) => {

    // ORDER BY idnps DESC LIMIT 5

    const [result] = await pool.query('SELECT * from nps WHERE score > ? and score < ? ORDER BY idnps DESC',['0', '7']);
    res.json(result);
    
}

export const getCommentsProm = async(req, res) => {

    const [result] = await pool.query('SELECT * from nps WHERE score > ? and score < ? ORDER BY idnps DESC',['8', '11']);
    res.json(result);
    
}

export const getCommentsPas = async(req, res) => {

    const [result] = await pool.query('SELECT * from nps WHERE score > ? and score < ? ORDER BY idnps DESC',['6', '9']);
    res.json(result);
    
}
