import axios from "axios";

const host = process.env.REACT_APP_HOST;

axios.defaults.headers.post['Content-Type'] ='application/x-www-form-urlencoded';

export const createSurveyRequest = async(survey) => {

const customConfig = {
    headers: {
    'Content-Type': 'application/json'
    }
};

const result =  await axios.post(`${host}/newsurvey`,survey, customConfig);

setTimeout("location.reload()" ,3000);

    console.log(result.data.headers['Content-Type']);

}

export const getNPS = async()=>
    await axios.get(`${host}/surveys`);

export const getNpsMes = async()=>
    await axios.get(`${host}/surveysmonth`);

export const getComments = async()=>
    await axios.get(`${host}/comments`);

export const getCommentsProm = async()=>
    await axios.get(`${host}/commentsprom`);

export const getCommentsPas = async()=>
    await axios.get(`${host}/commentspas`);


