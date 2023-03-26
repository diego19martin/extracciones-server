import { useState, useEffect } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import paginationFactory from 'react-bootstrap-table2-paginator';
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.min.css';
import { getComments } from '../api/survey.api.js';
import moment from 'moment';
import 'moment/locale/es';



function TableCom() {

  const [TableComent, SetTableComent] = useState([])

  useEffect(() => {

    let interval = setInterval(() => {
  
        async function comments() {
        const respuesta = await getComments();
    
        SetTableComent(respuesta.data)
        
      }
  
      comments()
    }, 2000) 
  }, [])

  function dateFormatter (cell, row) {
    moment.locale('es')
    moment().zone("-03:00");
    var d = moment(cell).format('dddd, DD/MM/YY - h.mm a')

    // console.log(d);
    
    return d;
  }

  const columns = [{
    dataField: 'date',
    text: 'Fecha',
    formatter: dateFormatter,
    style: {
      backgroundColor: 'white',
      textAlign:'center'
    },
    headerStyle: {
      backgroundColor: 'brown',
      color: 'white',
      textAlign:'center'
    }
    
  }, {
    dataField: 'score',
    text: 'Puntuación',
    style: {
      backgroundColor: 'white',
      textAlign:'center',
    },
    headerStyle: {
      backgroundColor: 'brown',
      color: 'white',
      textAlign:'center'
    }
  }, {
    dataField: 'disapExper',
    text: 'Comentario',
    style: {
      backgroundColor: 'white',
      textAlign:'center'
    },
    headerStyle: {
      backgroundColor: 'brown',
      color: 'white',
      textAlign:'center'
    }
  }];

  
  return (

    <BootstrapTable
      keyField="idnps"
      data={ TableComent }
      columns={ columns }
      pagination={ paginationFactory()}
    />

  );
}

export default TableCom;
