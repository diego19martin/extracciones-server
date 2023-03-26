import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import CardNps from '../components/CardNps';
import CardNpsMes from '../components/CardNpsMes';
import ChartPieDetractores from '../components/ChartPieDetractores.js';
import ChartPiePromotores from '../components/ChartPiePromotores';
import Table from '../components/TableCom';
import TableProm from "../components/TableComProm";
import TablePas from "../components/TableComPasivo";

export const Dashboard = ()=> {
  return (
    <>
      <div className='dashboardBody'>

        <Row>
          <Col><CardNps className='div'/></Col>
          <Col><CardNpsMes className='div'/></Col>
        </Row>

        <h1 className='titulotablaDet'>Detractores</h1>
        <Row>
        <Col className='chartProm' xs lg="4"><ChartPieDetractores /></Col>
        <Col><h1 className='titulotablaDet' xs lg="1">Comentarios</h1><Table /></Col>
        </Row>

          <Col><h1 className='titulotablaPas'>Comentarios Pasivos</h1><TablePas /></Col>
        <Row>

        </Row>
        <h1 className='titulotablaProm'>Promotores</h1>
        <Row>
          <Col className='chartProm' xs lg="4"><ChartPiePromotores /></Col>
          <Col><h1 className='titulotablaProm' xs lg="1">Comentarios</h1><TableProm /></Col>
        </Row>
      </div>
    </>
  );
}

export default Dashboard;