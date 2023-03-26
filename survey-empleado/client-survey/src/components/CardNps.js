import Card from 'react-bootstrap/Card';
import { useState, useEffect } from "react";
import { getNPS } from '../api/survey.api.js';
import ChartPieDetractores from './ChartPieDetractores.js';

export const CardNps = () => {

const [Nps, SetNps] = useState([])

useEffect(() => {

  let interval = setInterval(() => {

      async function npsTotal() {
      const respuesta = await getNPS();
  
      // console.log(respuesta.data);
      SetNps(respuesta.data)
      
    }

    npsTotal()
  }, 2000) 
}, [])

var i = 0;
var e = 0;
var npsSuma = 0;
var detractores=0;
var pasivos=0;
var promotores=0;
var gastro=0;
var estac=0;
var maq=0;
var otros=0;
var lim=0;
var seg=0;

for(i=0;i<Nps.length;i++){
  var npsSuma = npsSuma + Nps[i].score;
  if (Nps[i].score <= 6) {
      detractores ++;
  }else if(Nps[i].score >=7 && Nps[i].score <=8 ){
      pasivos ++;
  }else{
      promotores++;
  }
  
    if(Nps[i].disapFeature.includes('Estacionamiento')){
      estac++;
    } 
    
    if (Nps[i].disapFeature.includes('Gastronomía')){
      gastro++;
    } 
    
    if (Nps[i].disapFeature.includes('Máquinas de Slots')){
      maq++;}

    if (Nps[i].disapFeature.includes('Otros')){
      otros++;}

    if (Nps[i].disapFeature.includes('Limpieza')){
      lim++;}

    if (Nps[i].disapFeature.includes('Seguridad')){
      seg++;}
}

// console.log(estac, gastro, maq, ubi, lim, seg);
  
// console.log(detractores, pasivos, promotores);

var porcentajeDetractores = (detractores * 100) / Nps.length;
var porcentajePromotores = (promotores * 100) / Nps.length;

var NpsTotal = porcentajePromotores - porcentajeDetractores;

NpsTotal = NpsTotal.toFixed(1)

// console.log(NpsTotal);

ChartPieDetractores(estac, gastro, maq, otros, lim, seg)


  return (

    <Card className='npsCard' bg={'primary'} style={{ margin:'20px auto', textAlign:'center', color:'white', color:'white', fontSize:'60px'  }}>
      <Card.Header>NPS de Sala</Card.Header>
      <Card.Body>
      <Card.Title style={{fontSize:'15px'}}>% Promotores - % Detractores</Card.Title>
        <Card.Text>
          {NpsTotal}
        </Card.Text>
      </Card.Body>
    </Card>
  );
}

export default CardNps;
