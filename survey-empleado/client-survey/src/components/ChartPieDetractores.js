
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import Card from 'react-bootstrap/Card';
import {useState, useEffect } from 'react';
import { getNPS } from '../api/survey.api.js';


ChartJS.register(ArcElement, Tooltip, Legend);
   

export default function ChartPieDetractores() {

  const [NpsPie, SetNpsPie] = useState([])

  useEffect(() => {

  let interval = setInterval(() => {

      async function npsTotal() {
      const respuesta = await getNPS();
  
      // console.log(respuesta.data);
      SetNpsPie(respuesta.data)

    }

    npsTotal()
  }, 2000) 
}, [])


var i = 0;
var gastro=0;
var estac=0;
var maq=0;
var otros=0;
var lim=0;
var seg=0; 


for(i=0;i<NpsPie.length;i++){
    
    if(NpsPie[i].disapFeature.includes('Estacionamiento')){
      estac++;
    } 
    
    if (NpsPie[i].disapFeature.includes('Gastronomía')){
      gastro++;
    } 
    
    if (NpsPie[i].disapFeature.includes('Máquinas de Slots')){
      maq++;}

    if (NpsPie[i].disapFeature.includes('Otros')){
      otros++;}

    if (NpsPie[i].disapFeature.includes('Limpieza')){
      lim++;}

    if (NpsPie[i].disapFeature.includes('Seguridad')){
      seg++;}
}


  return (

    <Card className='npsCard' bg={'light'} style={{ margin:'20px auto', textAlign:'center', color:'black', fontSize:'30px'  }}>
      <Card.Header>Valoraciones Detractores</Card.Header>
      <Card.Body>
      <Card.Title style={{fontSize:'15px'}}>Cantidad de valoraciones por Detractores</Card.Title>
        <Card.Text>
        <Pie data={{
          labels: ['Maquinas Slots', 'Gastronomía', 'Estacionamiento', 'Otros', 'Limpieza', 'Seguridad'],
          datasets: [
            {
              label: 'Cantidad votos Detractores',
              data: [maq, gastro, estac, otros, lim, seg],
              backgroundColor: [
                'rgba(255, 99, 132, 0.2)',
                'rgba(54, 162, 235, 0.2)',
                'rgba(255, 206, 86, 0.2)',
                'rgba(75, 192, 192, 0.2)',
                'rgba(153, 102, 255, 0.2)',
                'rgba(255, 159, 64, 0.2)',
              ],
              borderColor: [
                'rgba(255, 99, 132, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)',
                'rgba(255, 159, 64, 1)',
              ],
              borderWidth: 1,
            },
          ],
        }} />
        </Card.Text>
      </Card.Body>
    </Card>
 
  )}




