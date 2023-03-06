import { pool } from "../db.js";

export const postList = async (req, res) => {

    // console.log(req.body);

    var fecha = new Date();

    var i = 0;

        const [truncate] = await pool.query('TRUNCATE listado');

        for (i=0; i<req.body.length; i++) {

    
        const [result] = await pool.query('INSERT into listado (maquina, location, bill, fecha) VALUES (?, ?, ?, ?)',[req.body[i].maquina, req.body[i].location, req.body[i].bill, fecha])
        
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
        
        console.log(result);

        res.json (result)

}

export const getResumen = async (req, res) => {

        const [result] = await pool.query('SELECT * FROM `listado`')

        console.log(result);
    
    res.json(result)

}

export const getInfo = async (req, res) => {

    const [result] = await pool.query('SELECT * FROM `listado` WHERE maquina = ?', [req.params.maquina]);
    const [limite] = await pool.query ('SELECT * FROM `config`')

    var i = 0;
    var loc = result[0].location;
    var location = loc.slice(0,4);
    var limit = limite[0].limite;
    var listadoExtraer = [];
    var listadoFinal = [];

    const [listado] = await pool.query('SELECT * FROM `listado` WHERE LEFT(`location`, 4) = ?', [location])
  

    console.log(listado);

    for(i=0; i < listado.length; i++) {

        // console.log(listado.length);

        if( listado[i].bill >= limit ) {
            console.log(limit, listado[i].maquina);
            // listadoExtraer.push()
            listadoExtraer = {
                fecha : listado[i].fecha,
                maquina : listado[i].maquina,
                location : listado[i].location,
                id: listado[i].idlistado
            } 
            listadoFinal.unshift(listadoExtraer)
        }
        
    }
    
    console.log(listadoFinal);

    res.json(
        listadoFinal
    )

}

export const postSelect = async (req, res) => {

    // console.log(req.body[0].maquina.maquina);

    var validacion = '';
    var i = 0;

    i = req.body.length - 1;

    if(req.body[i].finalizado === false) {
        validacion='Pendiente'
    } else {
        validacion='Extraida'
    }

    console.log(i);
    console.log(validacion);

    if (validacion === 'false' ) {
        req.body[i].asistente1 = '';
        req.body[i].asistente2 = '';
    }

    
        const [result] = await pool.query('UPDATE listado SET `finalizado`=?, `asistente1`=?, `asistente2`=? WHERE `maquina` = ?', [validacion, req.body[i].asistente1, req.body[i].asistente2, req.body[i].maquina.maquina])
        
        console.log(result);


        return res.json('ok')

}
        

    
