import { useState, useEffect } from 'react';
import BootstrapTable from 'react-bootstrap-table-next';
import paginationFactory from 'react-bootstrap-table2-paginator';
import 'react-bootstrap-table-next/dist/react-bootstrap-table2.min.css';
import { getCommentsProm } from '../api/survey.api.js';
import moment from 'moment';
import 'moment/locale/es';



function TableComProm() {

  const [TableComentProm, SetTableComentProm] = useState([])

  useEffect(() => {

    let interval = setInterval(() => {
  
        async function comments() {
        const respuesta = await getCommentsProm();

        // console.log(respuesta.data);
    
        SetTableComentProm(respuesta.data)
        
      }
  
      comments()
    }, 2000) 
  }, [])

  function dateFormatter (cell, row) {
    moment.locale('es')
    var d = moment(cell).format('dddd, DD/MM/YY - h.mm a')

    console.log(d);
    
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
      backgroundColor: '#c8e6c9',
      textAlign:'center'
    }
    
  }, {
    dataField: 'score',
    text: 'Puntuación',
    style: {
      backgroundColor: 'white',
      textAlign:'center'
    },
    headerStyle: {
      backgroundColor: '#c8e6c9',
      textAlign:'center'
    }
  }, {
    dataField: 'promExperience',
    text: 'Comentario',
    style: {
      backgroundColor: 'white',
      textAlign:'center'
    },
    headerStyle: {
      backgroundColor: '#c8e6c9',
      textAlign:'center'
    }
  }];

  
  return (

    <BootstrapTable
      keyField="idnps"
      data={ TableComentProm }
      columns={ columns }
      pagination={ paginationFactory()}  
    />

  );
}

export default TableComProm;
