import { pool } from "../db.js";

export const postList = async (req, res) => {
    console.log(req.body);

    var fecha = new Date();

    var i = 0;

    const [truncate] = await pool.query('TRUNCATE listado');

    for (i=0; i<req.body.length; i++) {
        const [result] = await pool.query('INSERT into listado (maquina, location, bill, fecha, zona, moneda) VALUES (?, ?, ?, ?, ?, ?)',
          [req.body[i].machine, req.body[i].location, req.body[i].bill, fecha, req.body[i].zona, req.body[i].moneda]);
    }

    return res.json('ok');
}

export const postConfig = async (req, res) => {
    try {
        
        console.log(req.body);
        
        const { limitePesos, limiteDolares } = req.body; // Recibir los límites del cuerpo de la solicitud
        var fecha = new Date();

        // Limpiar la tabla de configuración anterior
        const [truncate] = await pool.query('TRUNCATE config');

        // Insertar los nuevos valores en la tabla config
        const [result] = await pool.query('INSERT INTO config (fecha, limite_pesos, limite_dolares) VALUES (?, ?, ?)', [fecha, limitePesos, limiteDolares]);
        
        res.json({ message: 'Configuración actualizada correctamente', data: result });
    } catch (error) {
        console.error('Error al actualizar la configuración:', error);
        res.status(500).json({ error: 'Error al actualizar la configuración' });
    }
};

export const getResumen = async (req, res) => {
    try {
        let result;
        try {
            [result] = await pool.query('SELECT * FROM `listado` ORDER BY location ASC');
            console.log('Query de listado ejecutada correctamente:', result);
        } catch (error) {
            console.error('Error ejecutando la query de listado:', error);
            throw error;
        }
        if (result.length === 0) {
            result = [{ fecha: 'Sin datos', maquina: 0 }];
        }
        console.log('Resultado de la consulta getResumen:', result);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener el resumen:', error);
        res.status(500).json({ error: 'Error al obtener el resumen' });
    }
};

export const getInfo = async (req, res) => {
    const [result] = await pool.query('SELECT * FROM `listado` WHERE maquina = ?', [req.params.maquina]);
    const [limite] = await pool.query ('SELECT * FROM `config`');

    console.log('Resultado de getInfo (máquina y límite):', result, limite);

    if (result.length > 0) {
        var i = 0;
        var loc = result[0].location;
        console.log(loc);
        var location = loc.slice(0,4);
        var limitPesos = limite[0].limite_pesos;
        var limitDolares = limite[0].limite_dolares;
        var listadoExtraer = [];
        var listadoFinal = [];

        let listado;
        try {
            [listado] = await pool.query('SELECT * FROM `listado` WHERE LEFT(`location`, 4) = ? ORDER BY (`location`) DESC', [location]);
            console.log('Query de listado filtrada por location ejecutada correctamente:', listado);
        } catch (error) {
            console.error('Error ejecutando la query de listado filtrada por location:', error);
            throw error;
        }

        for(i = 0; i < listado.length; i++) {
            if ((listado[i].moneda === 'pesos' && listado[i].bill >= limitPesos) ||
                (listado[i].moneda === 'dolares' && listado[i].bill >= limitDolares)) {
                listadoExtraer = {
                    fecha : listado[i].fecha,
                    maquina : listado[i].maquina,
                    location : listado[i].location,
                    finalizado : listado[i].finalizado,
                    id: listado[i].idlistado,
                    zona: listado[i].zona,
                };
                listadoFinal.unshift(listadoExtraer);
            }
        }
        res.json(listadoFinal);
    } else {
        res.json('N');
    }
};

export const postSelect = async (req, res) => {
    const finalizado = req.body.finalizado;
    var validacion = '';
    var i = 0;

    i = req.body.length - 1;

    if (validacion === 'Pendiente' ) {
        req.body.asistente1 = '';
        req.body.asistente2 = '';
    }

    const [result] = await pool.query('UPDATE listado SET `finalizado`=?, `asistente1`=?, `asistente2`=?, `comentario`=? WHERE `maquina` = ?', [finalizado, req.body.asistente1, req.body.asistente2, req.body.comentario ,req.body.maquina.maquina]);

    return res.json('ok');
};