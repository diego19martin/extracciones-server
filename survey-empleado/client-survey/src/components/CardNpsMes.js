import { useState, useEffect } from 'react';
import Card from 'react-bootstrap/Card';
import { getNpsMes } from '../api/survey.api.js';

const CardNpsMes = () => {

const [NpsMes, SetNpsMes] = useState([0]);

useEffect(() => {
  
  let interval = setInterval(() => {

    async function npsTotalMes() {
      const respuestaMes = await getNpsMes();
      // console.log(respuestaMes.data);
      SetNpsMes(respuestaMes.data);
      // console.log('holames');
    }

    npsTotalMes()

  }, 2000)

}, [])

var i = 0;
var npsSuma = 0;
var detractores=0;
var pasivos=0;
var promotores=0;
for(i=0;i<NpsMes.length;i++){
  var npsSuma = npsSuma + NpsMes[i].score;
  if (NpsMes[i].score <= 6) {
      detractores ++;
  }else if(NpsMes[i].score >=7 && NpsMes[i].score <=8 ){
      pasivos ++;
  }else{
      promotores++;
  }
}

// console.log(promotores, pasivos,detractores);

var porcentajeDetractores = (detractores * 100) / NpsMes.length;
var porcentajePromotores = (promotores * 100) / NpsMes.length;

var NpsTotal = porcentajePromotores - porcentajeDetractores;

NpsTotal = NpsTotal.toFixed(1)

// console.log(NpsTotal);

  return (
    <Card className='npsCard' bg={'info'} style={{ margin:'20px auto', textAlign:'center', color:'white', color:'white', fontSize:'50px' }}>
      <Card.Header>NPS este mes</Card.Header>
      <Card.Body>
      <Card.Title style={{fontSize:'15px'}}>% Promotores - % Detractores</Card.Title>
        <Card.Text>
          {NpsTotal}
        </Card.Text>
      </Card.Body>
    </Card>
  );
}

export default CardNpsMes;