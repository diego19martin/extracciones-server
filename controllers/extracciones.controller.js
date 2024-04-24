import { pool } from "../db.js";

export const postList = async (req, res) => {

    console.log(req.body);

    var fecha = new Date();

    var i = 0;

        const [truncate] = await pool.query('TRUNCATE listado');

        for (i=0; i<req.body.length; i++) {

    
        const [result] = await pool.query('INSERT into listado (maquina, location, bill, fecha, zona) VALUES (?, ?, ?, ?, ?)',[req.body[i].machine, req.body[i].location, req.body[i].bill, fecha, req.body[i].zona])
        
        // console.log(result);

        }

        return res.json('ok')

}

export const postConfig = async (req, res) => {

        // console.log(req.params.limite);
        
        var limite = req.params.limite;

        var fecha = new Date();

        const [truncate] = await pool.query('TRUNCATE config');

        const [result] = await pool.query('INSERT into config (fecha, limite) VALUES (?, ?)',[fecha, limite])
        
        // console.log(result);

        res.json (result)

}

export const getResumen = async (req, res) => {

        var [result] = await pool.query('SELECT * FROM `listado`')

        // console.log(result);

        if(result.length===0){

            result = [{fecha: 'Sin datos', maquina: 0}]
            
        }
    
    res.json(result)

}

export const getInfo = async (req, res) => {

    const [result] = await pool.query('SELECT * FROM `listado` WHERE maquina = ?', [req.params.maquina]);
    const [limite] = await pool.query ('SELECT * FROM `config`')

    // console.log(result);

    if (result.length>0) {
        
    var i = 0;
    var loc = result[0].location;
    console.log(loc);
    var location = loc.slice(0,4);
    var limit = limite[0].limite;
    var listadoExtraer = [];
    var listadoFinal = [];

    const [listado] = await pool.query('SELECT * FROM `listado` WHERE LEFT(`location`, 4) = ? ORDER BY (`location`) DESC', [location])
  

    // console.log(listado);

    for(i=0; i < listado.length; i++) {

        // console.log(listado.length);

        if( listado[i].bill >= limit ) {
            // console.log(limit, listado[i].maquina);
            // listadoExtraer.push()
            console.log(listado[i]);
            listadoExtraer = {
                fecha : listado[i].fecha,
                maquina : listado[i].maquina,
                location : listado[i].location,
                finalizado : listado[i].finalizado,
                id: listado[i].idlistado,
                zona: listado[i].zona,
            } 
            listadoFinal.unshift(listadoExtraer)
        }
        
    }
    
    console.log(listadoFinal);

    res.json(
        listadoFinal
    )

}else{
    res.json('N')
}
}

export const postSelect = async (req, res) => {

    // console.log(req.body);

    const finalizado = req.body.finalizado;

    // console.log(finalizado);

    var validacion = '';
    var i = 0;

    i = req.body.length - 1;


    if (validacion === 'Pendiente' ) {
        req.body.asistente1 = '';
        req.body.asistente2 = '';
    }

    
        const [result] = await pool.query('UPDATE listado SET `finalizado`=?, `asistente1`=?, `asistente2`=?, `comentario`=? WHERE `maquina` = ?', [finalizado, req.body.asistente1, req.body.asistente2, req.body.comentario ,req.body.maquina.maquina])
        
        // console.log(result);


        return res.json('ok')

}
        

    
