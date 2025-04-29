import { pool } from "../db.js";
import { io } from "../index.js";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const guardarConciliacionZona = async (req, res) => {
    console.log('guardarConciliacionZona llamado');

    const contentType = req.headers['content-type'] || '';
    let conciliacionData;

    if (contentType.includes('multipart/form-data')) {
        if (req.body.data) {
            try {
                conciliacionData = JSON.parse(req.body.data);
            } catch (error) {
                return res.status(400).json({ success: false, message: 'Datos JSON inválidos', error: error.message });
            }
        } else {
            return res.status(400).json({ success: false, message: 'Campo "data" faltante' });
        }
    } else {
        conciliacionData = req.body;
    }

    const {
        zona,
        usuario,
        totalEsperado,
        totalContado,
        maquinasTotales,
        maquinasCoincidentes,
        maquinasDiscrepancia,
        maquinasFaltantes,
        maquinasExtra,
        comentarios,
        resultados,
        confirmada = false
    } = conciliacionData;

    if (!zona || !usuario) {
        return res.status(400).json({ success: false, message: 'Faltan zona o usuario' });
    }

    if (!Array.isArray(resultados)) {
        return res.status(400).json({ success: false, message: '"resultados" debe ser un array' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        let archivoDat = null;
        let archivoXls = null;

        if (req.files) {
            const uploadDir = path.join(__dirname, '../uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            if (req.files.archivoDat) {
                const datFile = req.files.archivoDat;
                const datFileName = `${zona}_${Date.now()}.dat`;
                await datFile.mv(path.join(uploadDir, datFileName));
                archivoDat = datFileName;
            }

            if (req.files.archivoXls) {
                const xlsFile = req.files.archivoXls;
                const xlsFileName = `${zona}_${Date.now()}.xlsx`;
                await xlsFile.mv(path.join(uploadDir, xlsFileName));
                archivoXls = xlsFileName;
            }
        }

        const diferencia = (totalContado || 0) - (totalEsperado || 0);

        const [result] = await connection.execute(
            `INSERT INTO zona_conciliacion 
            (fecha, hora, zona, usuario, confirmada, usuario_confirmacion, fecha_confirmacion, 
            total_esperado, total_contado, diferencia, maquinas_totales, 
            maquinas_coincidentes, maquinas_discrepancia, maquinas_faltantes, 
            maquinas_extra, comentarios, archivo_dat, archivo_xls) 
            VALUES (CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                zona,
                usuario,
                confirmada ? 1 : 0,
                null, // usuario_confirmacion (se completa al confirmar)
                confirmada ? new Date() : null,
                totalEsperado || 0,
                totalContado || 0,
                diferencia,
                maquinasTotales || 0,
                maquinasCoincidentes || 0,
                maquinasDiscrepancia || 0,
                maquinasFaltantes || 0,
                maquinasExtra || 0,
                comentarios || '',
                archivoDat || null,
                archivoXls || null
            ]
        );

        // Agregado: asegurarse de que resultados tenga las columnas necesarias
        if (resultados.length > 0) {
            const insertBatch = [];
            const insertParams = [];

            for (const machine of resultados) {
                const diferenciaMaquina = (machine.countedAmount || 0) - (machine.expectedAmount || 0);
                const tieneNovedad = machine.status === 'DISCREPANCY' || Math.abs(diferenciaMaquina) > 0.01;

                const fechaConciliacion = new Date(); // o podés usar moment o dayjs

                insertBatch.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                insertParams.push(
                    machine.machineId,
                    machine.headercard || null,
                    machine.location || null,
                    zona,
                    machine.expectedAmount || 0,
                    machine.countedAmount || 0,
                    diferenciaMaquina,
                    machine.status || 'UNKNOWN',
                    fechaConciliacion, // ✅ acá va
                    confirmada ? 1 : 0,
                    usuario,
                    tieneNovedad ? 1 : 0
                );

            }

            const insertQuery = `
              INSERT INTO maquinas_tesorero 
              (maquina, headercard, location, zona, valor_esperado, valor_contado, diferencia, 
              estado, fecha_conciliacion, conciliado, usuario_conciliacion, tiene_novedad)
              VALUES ${insertBatch.join(',')}
              ON DUPLICATE KEY UPDATE
              headercard = VALUES(headercard),
              location = VALUES(location),
              zona = VALUES(zona),
              valor_esperado = VALUES(valor_esperado),
              valor_contado = VALUES(valor_contado),
              diferencia = VALUES(diferencia),
              estado = VALUES(estado),
              fecha_conciliacion = NOW(),
              conciliado = VALUES(conciliado),
              usuario_conciliacion = VALUES(usuario_conciliacion),
              tiene_novedad = VALUES(tiene_novedad)
            `;

            await connection.query(insertQuery, insertParams);
        }


        await connection.commit();
        return res.status(201).json({ success: true, message: 'Conciliación guardada correctamente', id: result.insertId });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error al guardar conciliación:', error);
        return res.status(500).json({ success: false, message: 'Error al guardar la conciliación', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};



/**
 * Confirmar una conciliación de zona existente
 */
export const confirmarConciliacionZona = async (req, res) => {
    console.log('confirmarConciliacionZona llamado');
    console.log('req.body:', req.body);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const { id, usuario, comentarios } = req.body;

        if (!id || !usuario) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: id y usuario son obligatorios'
            });
        }

        // Verificar que la conciliación existe y no está ya confirmada
        const [conciliacion] = await connection.query(
            'SELECT id, zona, confirmada FROM zona_conciliacion WHERE id = ?',
            [id]
        );

        if (conciliacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conciliación no encontrada'
            });
        }

        // Verificar si ya está confirmada
        if (conciliacion[0].confirmada) {
            return res.status(400).json({
                success: false,
                message: 'Esta conciliación ya ha sido confirmada previamente'
            });
        }

        // Actualizar estado a confirmada - Incluir comentarios si están presentes
        const updateQuery = comentarios 
            ? 'UPDATE zona_conciliacion SET confirmada = TRUE, fecha_confirmacion = NOW(), usuario_confirmacion = ?, comentarios = ? WHERE id = ?'
            : 'UPDATE zona_conciliacion SET confirmada = TRUE, fecha_confirmacion = NOW(), usuario_confirmacion = ? WHERE id = ?';
        
        const updateParams = comentarios 
            ? [usuario, comentarios, id]
            : [usuario, id];
            
        await connection.query(updateQuery, updateParams);
        
        console.log(`Conciliación ${id} marcada como confirmada por ${usuario}`);

        // Obtener detalles de las máquinas de esta conciliación
        const [detalles] = await connection.query(
            'SELECT * FROM zona_conciliacion_detalle WHERE conciliacion_id = ?',
            [id]
        );

        console.log(`Actualizando ${detalles.length} máquinas en maquinas_tesorero`);

        // Actualizar tabla de máquinas del tesorero de manera optimizada
        if (detalles.length > 0) {
            // Preparar para actualización masiva
            const maquinasToUpdate = [];
            const updateParams = [];
            
            for (const detalle of detalles) {
                maquinasToUpdate.push('?');
                updateParams.push(detalle.maquina);
            }
            
            // Actualizar todas las máquinas de una vez
            const updateTesoreroQuery = `
                UPDATE maquinas_tesorero SET 
                conciliado = 1,
                usuario_conciliacion = ?,
                fecha_conciliacion = NOW()
                WHERE maquina IN (${maquinasToUpdate.join(',')})
            `;
            
            await connection.query(updateTesoreroQuery, [usuario, ...updateParams]);
            console.log(`Actualizadas ${detalles.length} máquinas en la tabla maquinas_tesorero`);
        }

        // Obtener datos actualizados para la respuesta
        const [conciliacionActualizada] = await connection.query(
            'SELECT * FROM zona_conciliacion WHERE id = ?',
            [id]
        );

        await connection.commit();
        console.log(`Transacción completada con éxito para conciliación ${id}`);

        // Emitir evento de actualización
        io.emit('conciliacionConfirmada', {
            id,
            zona: conciliacion[0].zona,
            usuario,
            fecha: new Date()
        });

        // Emitir evento para actualización de dashboard del tesorero
        io.emit('actualizacionMaquinasTesorero', {
            zona: conciliacion[0].zona,
            confirmada: true,
            cantidadMaquinas: detalles.length
        });

        return res.json({
            success: true,
            message: 'Conciliación confirmada correctamente',
            data: conciliacionActualizada[0]
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error('Error al confirmar conciliación:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al confirmar la conciliación',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Obtener todas las conciliaciones de zona
 */
export const obtenerConciliaciones = async (req, res) => {
    console.log('obtenerConciliaciones llamado');
    console.log('Query params:', req.query);

    try {
        // Opciones de filtrado
        const { zona, fecha, confirmada } = req.query;

        let query = 'SELECT * FROM zona_conciliacion';
        const params = [];
        const conditions = [];

        if (zona) {
            conditions.push('zona = ?');
            params.push(zona);
        }

        if (fecha) {
            conditions.push('fecha = ?');
            params.push(fecha);
        }

        if (confirmada !== undefined) {
            conditions.push('confirmada = ?');
            params.push(confirmada === 'true' || confirmada === '1' ? 1 : 0);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY fecha DESC, hora DESC';

        const [result] = await pool.query(query, params);
        console.log(`Encontradas ${result.length} conciliaciones`);

        return res.json(result);

    } catch (error) {
        console.error('Error al obtener conciliaciones:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener las conciliaciones',
            error: error.message
        });
    }
};

/**
 * Obtener una conciliación específica con sus detalles
 */
export const obtenerConciliacionDetalle = async (req, res) => {
    console.log('obtenerConciliacionDetalle llamado');
    console.log('Params:', req.params);

    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Falta el parámetro requerido: id'
            });
        }

        // Obtener la conciliación principal
        const [conciliacion] = await pool.query(
            'SELECT * FROM zona_conciliacion WHERE id = ?',
            [id]
        );

        if (conciliacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conciliación no encontrada'
            });
        }

        // Obtener los detalles de máquinas
        const [detalles] = await pool.query(
            'SELECT * FROM zona_conciliacion_detalle WHERE conciliacion_id = ?',
            [id]
        );

        console.log(`Encontrada conciliación con ${detalles.length} detalles de máquinas`);

        // Procesar los detalles para convertir JSON a objeto
        const detallesProcesados = detalles.map(detalle => {
            let detalles_billetes;
            try {
                detalles_billetes = typeof detalle.detalles_billetes === 'string'
                    ? JSON.parse(detalle.detalles_billetes)
                    : detalle.detalles_billetes;
            } catch (error) {
                console.error('Error al parsear detalles_billetes JSON:', error);
                detalles_billetes = {};
            }

            return {
                ...detalle,
                detalles_billetes
            };
        });

        return res.json({
            ...conciliacion[0],
            detalles: detallesProcesados
        });

    } catch (error) {
        console.error('Error al obtener detalle de conciliación:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener los detalles de la conciliación',
            error: error.message
        });
    }
};

/**
 * Obtener estadísticas de conciliaciones
 */
export const obtenerEstadisticas = async (req, res) => {
    console.log('obtenerEstadisticas llamado');

    try {
        // Estadísticas generales
        const [totalConciliaciones] = await pool.query(
            'SELECT COUNT(*) as total FROM zona_conciliacion'
        );

        const [conciliacionesPorZona] = await pool.query(
            'SELECT zona, COUNT(*) as cantidad FROM zona_conciliacion GROUP BY zona'
        );

        const [conciliacionesPorDia] = await pool.query(
            'SELECT fecha, COUNT(*) as cantidad FROM zona_conciliacion GROUP BY fecha ORDER BY fecha DESC LIMIT 30'
        );

        const [discrepanciasPorZona] = await pool.query(
            'SELECT zona, SUM(maquinas_discrepancia) as discrepancias, SUM(maquinas_totales) as total FROM zona_conciliacion GROUP BY zona'
        );

        // Calcular porcentajes de discrepancia
        const discrepanciasCalculadas = discrepanciasPorZona.map(item => ({
            zona: item.zona,
            discrepancias: item.discrepancias || 0,
            total: item.total || 0,
            porcentaje: item.total > 0 ? Math.round((item.discrepancias / item.total) * 100 * 100) / 100 : 0
        }));

        console.log('Estadísticas generadas correctamente');

        return res.json({
            totalConciliaciones: totalConciliaciones[0].total,
            conciliacionesPorZona,
            conciliacionesPorDia,
            discrepanciasPorZona: discrepanciasCalculadas
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener las estadísticas',
            error: error.message
        });
    }
};

/**
 * Obtener máquinas del tesorero con filtros opcionales
 */
// Ejemplo de implementación para el controlador que maneja /api/tesorero/maquinas
export const obtenerMaquinasTesorero = async (req, res) => {
    try {
        console.log('obtenerMaquinasTesorero llamado');
        console.log('Query params:', req.query);

        const {
            fecha,
            fecha_confirmacion,
            zona,
            estado,
            conciliado,
            tiene_novedad,
            pagina = 1,
            limite = 20
        } = req.query;

        // Construir cláusula WHERE
        let whereClause = '1=1';
        let params = [];

        // SI SE PROPORCIONA fecha_confirmacion, filtrar máquinas relacionadas con zonas confirmadas en esa fecha
        if (fecha_confirmacion) {
            // Obtener IDs de zonas confirmadas en esta fecha
            const [zonasConfirmadas] = await pool.query(`
            SELECT id, zona FROM zona_conciliacion 
            WHERE confirmada = 1 
            AND DATE(fecha_confirmacion) = ?
          `, [fecha_confirmacion]); // ✅ SOLO UN PARÁMETRO



            if (zonasConfirmadas.length > 0) {
                // Si hay zonas confirmadas en esta fecha, filtrar por ellas
                const zonasIds = zonasConfirmadas.map(z => z.zona);
                const placeholders = zonasIds.map(() => '?').join(', ');
                whereClause += ` AND m.zona IN (${placeholders})`;
                params.push(...zonasIds); // ✅ USAR SPREAD OPERATOR PARA AÑADIR VARIOS PARÁMETROS

            } else {
                // Si no hay zonas confirmadas en esta fecha, asegurar que no se devuelvan resultados
                // Este es el cambio clave: no devolver máquinas si no hay zonas confirmadas
                whereClause += ` AND FALSE`;
            }
        }
        // Si no hay fecha_confirmacion pero hay fecha, filtrar por la fecha de conciliación
        else if (fecha) {
            whereClause += ` AND DATE(m.fecha_conciliacion) = ?`;
            params.push(fecha);
        }

        // Añadir otros filtros si están presentes
        if (zona) {
            whereClause += ` AND m.zona = ?`;
            params.push(zona);
        }

        if (estado) {
            whereClause += ` AND m.estado = ?`;
            params.push(estado);
        }

        if (conciliado !== undefined) {
            whereClause += ` AND m.conciliado = ?`;
            params.push(conciliado);
        }

        if (tiene_novedad !== undefined) {
            whereClause += ` AND m.tiene_novedad = ?`;
            params.push(tiene_novedad);
        }

        // Obtener el total de registros para paginación
        const [countResult] = await pool.query(`
        SELECT COUNT(*) as total 
        FROM maquinas_tesorero m
        WHERE ${whereClause}
      `, params);

        const total = countResult[0].total || 0;

        // Si no hay resultados, devolver array vacío
        if (total === 0) {
            return res.status(200).json({
                total: 0,
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                data: []
            });
        }

        // Calcular offset para paginación
        const offset = (parseInt(pagina) - 1) * parseInt(limite);

        // Obtener los registros paginados
        const [maquinas] = await pool.query(`
        SELECT * 
        FROM maquinas_tesorero m
        WHERE ${whereClause}
        ORDER BY m.zona, m.maquina
        LIMIT ?, ?
      `, [...params, offset, parseInt(limite)]);

        console.log(`Encontradas ${maquinas.length} máquinas del tesorero`);

        // Devolver resultados con metadata de paginación
        return res.status(200).json({
            total,
            pagina: parseInt(pagina),
            limite: parseInt(limite),
            data: maquinas
        });

    } catch (error) {
        console.error('Error al obtener máquinas del tesorero:', error);
        res.status(500).json({
            error: 'Error interno del servidor',
            message: 'Ocurrió un error al obtener las máquinas.'
        });
    }
};

/**
 * Sincronizar máquinas desde listado/listado_filtrado a maquinas_tesorero
 */
export const sincronizarMaquinasTesorero = async (req, res) => {
    console.log('sincronizarMaquinasTesorero llamado');

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Obtener máquinas de listado/listado_filtrado con sus datos actuales
        const [maquinasExistentes] = await connection.query(`
            SELECT l.maquina, l.location, l.bill, l.zona, l.moneda, l.finalizado, 
                   l.asistente1, l.asistente2, l.fecha, l.comentario
            FROM listado l
        `);

        console.log(`Encontradas ${maquinasExistentes.length} máquinas en listado`);

        // 2. Actualizar o insertar en maquinas_tesorero
        let actualizadas = 0;
        let nuevas = 0;

        for (const maquina of maquinasExistentes) {
            // Comprobar si ya existe
            const [existente] = await connection.query(
                'SELECT id FROM maquinas_tesorero WHERE maquina = ?',
                [maquina.maquina]
            );

            const tieneNovedad = maquina.comentario ? 1 : 0;

            if (existente.length > 0) {
                // Actualizar registro existente
                await connection.query(`
                    UPDATE maquinas_tesorero SET
                    location = ?,
                    zona = ?,
                    bill = ?,
                    moneda = ?,
                    estado = ?,
                    finalizado = ?,
                    asistente1 = ?,
                    asistente2 = ?,
                    fecha_extraccion = ?,
                    comentario = ?,
                    tiene_novedad = ?
                    WHERE maquina = ?
                `, [
                    maquina.location,
                    maquina.zona,
                    maquina.bill || 0,
                    maquina.moneda || 'pesos',
                    maquina.finalizado || 'No iniciado',
                    maquina.finalizado,
                    maquina.asistente1,
                    maquina.asistente2,
                    maquina.fecha,
                    maquina.comentario,
                    tieneNovedad,
                    maquina.maquina
                ]);

                actualizadas++;
            } else {
                // Insertar nuevo registro
                await connection.query(`
                    INSERT INTO maquinas_tesorero
                    (maquina, location, zona, bill, moneda, estado, finalizado, 
                     asistente1, asistente2, fecha_extraccion, comentario, tiene_novedad)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    maquina.maquina,
                    maquina.location,
                    maquina.zona,
                    maquina.bill || 0,
                    maquina.moneda || 'pesos',
                    maquina.finalizado || 'No iniciado',
                    maquina.finalizado,
                    maquina.asistente1,
                    maquina.asistente2,
                    maquina.fecha,
                    maquina.comentario,
                    tieneNovedad
                ]);

                nuevas++;
            }
        }

        await connection.commit();

        // Emitir evento para actualización de dashboard del tesorero
        io.emit('sincronizacionMaquinasTesorero', {
            total: maquinasExistentes.length,
            actualizadas,
            nuevas
        });

        return res.json({
            success: true,
            message: 'Sincronización completada',
            total: maquinasExistentes.length,
            actualizadas,
            nuevas
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error('Error al sincronizar máquinas del tesorero:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al sincronizar máquinas del tesorero',
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

/**
 * Guardar una nueva conciliación de zona (solo datos, sin archivos) - VERSIÓN OPTIMIZADA
 */
export const guardarConciliacionData = async (req, res) => {
    console.log('guardarConciliacionData llamado - VERSIÓN OPTIMIZADA');
    
    // Obtener una conexión desde el pool
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        
        // Obtener datos directamente del cuerpo de la solicitud
        const conciliacionData = req.body;
        
        // Comprobar si debemos forzar la actualización (sobreescribir registros existentes)
        const forceUpdate = conciliacionData.forceUpdate === true;
        console.log(`Modo de actualización forzada: ${forceUpdate ? 'ACTIVADO' : 'DESACTIVADO'}`);
        
        // Validar datos requeridos
        const {
            zona,
            usuario,
            totalEsperado,
            totalContado,
            maquinasTotales,
            maquinasCoincidentes,
            maquinasDiscrepancia,
            maquinasFaltantes,
            maquinasExtra,
            comentarios,
            resultados,
            confirmada = false
        } = conciliacionData;
        
        if (!zona || !usuario) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: zona y usuario son obligatorios'
            });
        }
        
        // Validar que resultados sea un array
        if (!Array.isArray(resultados) || resultados.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'El campo "resultados" debe ser un array no vacío'
            });
        }
        
        console.log(`Procesando ${resultados.length} máquinas en modo optimizado`);
        
        // Verificar si hay máquinas que ya han sido conciliadas hoy
        const machineIds = resultados.map(m => m.machineId).filter(Boolean);
        
        if (machineIds.length > 0 && !forceUpdate) {
            const today = new Date().toISOString().split('T')[0]; // formato YYYY-MM-DD
            
            const queryExistentesToday = `
                SELECT maquina 
                FROM maquinas_tesorero 
                WHERE maquina IN (${machineIds.map(() => '?').join(',')})
                AND DATE(fecha_conciliacion) = ?
            `;
            
            const [existingMachinesToday] = await connection.query(
                queryExistentesToday, 
                [...machineIds, today]
            );
            
            if (existingMachinesToday.length > 0) {
                // Hay máquinas que ya han sido conciliadas hoy
                const existingMachineIds = existingMachinesToday.map(m => m.maquina);
                
                console.log(`Se encontraron ${existingMachinesToday.length} máquinas ya conciliadas hoy`);
                
                return res.status(409).json({
                    success: false,
                    message: 'Algunas máquinas ya han sido conciliadas hoy',
                    needsConfirmation: true,
                    existingMachines: existingMachineIds,
                    totalExisting: existingMachinesToday.length
                });
            }
        }
        
        // Calcular diferencia
        const diferencia = (parseFloat(totalContado) || 0) - (parseFloat(totalEsperado) || 0);
        
        // 1. INSERTAR EN LA TABLA PRINCIPAL
        // Aseguramos que cada campo tiene el tipo correcto y no es undefined
        const [result] = await connection.execute(
            `INSERT INTO zona_conciliacion 
            (fecha, hora, zona, usuario, confirmada, usuario_confirmacion, fecha_confirmacion, 
            total_esperado, total_contado, diferencia, maquinas_totales, 
            maquinas_coincidentes, maquinas_discrepancia, maquinas_faltantes, 
            maquinas_extra, comentarios, archivo_dat, archivo_xls) 
            VALUES (CURDATE(), CURTIME(), ?, ?, ?, ?, 
            ${confirmada ? 'NOW()' : 'NULL'}, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
            [
                zona, 
                usuario, 
                confirmada ? 1 : 0,
                confirmada ? usuario : null, // Usuario de confirmación
                parseFloat(totalEsperado) || 0,
                parseFloat(totalContado) || 0,
                diferencia,
                parseInt(maquinasTotales) || 0, 
                parseInt(maquinasCoincidentes) || 0,
                parseInt(maquinasDiscrepancia) || 0, 
                parseInt(maquinasFaltantes) || 0, 
                parseInt(maquinasExtra) || 0,
                comentarios || ''
            ]
        );
        
        const conciliacionId = result.insertId;
        console.log('Conciliación guardada con ID:', conciliacionId);
        
        // 2. INSERTAR DETALLES DE MÁQUINAS - USANDO INSERCIÓN MASIVA (BULK INSERT)
        if (resultados.length > 0) {
            // Preparar valores para la inserción masiva en zona_conciliacion_detalle
            const detallesValues = [];
            const detallesParams = [];
            
            resultados.forEach(machine => {
                if (!machine.machineId) return; // Saltar máquinas sin ID
                
                detallesValues.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                detallesParams.push(
                    conciliacionId,
                    machine.machineId || '',
                    machine.headercard || null,
                    machine.location || null,
                    parseFloat(machine.expectedAmount) || 0,
                    parseFloat(machine.countedAmount) || 0,
                    parseFloat(machine.countedPhysical) || 0,
                    parseFloat(machine.countedVirtual) || 0,
                    machine.status || 'UNKNOWN',
                    // Convertir los objetos de billetes a JSON
                    JSON.stringify({
                      billetesFisicos: machine.billetesFisicos || {},
                      billetesVirtuales: machine.billetesVirtuales || {}
                    })
                );
            });
            
            if (detallesValues.length > 0) {
                // Ejecutar inserción masiva de detalles
                const detallesQuery = `
                    INSERT INTO zona_conciliacion_detalle 
                    (conciliacion_id, maquina, headercard, location, 
                    valor_esperado, valor_contado, valor_fisico, valor_virtual, 
                    estado, detalles_billetes) 
                    VALUES ${detallesValues.join(',')}
                `;
                
                console.log(`Ejecutando inserción masiva de ${detallesValues.length} detalles...`);
                await connection.query(detallesQuery, detallesParams);
                console.log('Inserción masiva de detalles completada');
            }
            
            // 3. ACTUALIZAR/INSERTAR EN TABLA MAQUINAS_TESORERO
            // Primero, obtener todas las máquinas existentes en una sola consulta para optimizar
            if (machineIds.length === 0) {
                await connection.commit();
                return res.status(201).json({ 
                    success: true, 
                    message: 'Conciliación guardada correctamente (sin máquinas válidas)', 
                    id: conciliacionId 
                });
            }
            
            const queryExistentes = `SELECT maquina FROM maquinas_tesorero WHERE maquina IN (${machineIds.map(() => '?').join(',')})`;
            
            const [existingMachines] = await connection.query(queryExistentes, machineIds);
            const existingMachineIds = new Set(existingMachines.map(m => m.maquina));
            
            console.log(`De ${machineIds.length} máquinas, ${existingMachines.length} ya existen en la tabla`);
            
            // Si estamos en modo forzado y es el mismo día, primero eliminamos los registros existentes
            if (forceUpdate) {
                const today = new Date().toISOString().split('T')[0]; // formato YYYY-MM-DD
                
                // Eliminar registros de hoy para estas máquinas
                for (const machineId of existingMachineIds) {
                    await connection.query(
                        `DELETE FROM maquinas_tesorero 
                         WHERE maquina = ? AND DATE(fecha_conciliacion) = ?`,
                        [machineId, today]
                    );
                }
                
                console.log(`Se eliminaron los registros de hoy para ${existingMachineIds.size} máquinas`);
            }
            
            // Ahora todas son inserciones nuevas
            const insertBatch = [];
            const insertParams = [];
            
            resultados.forEach(machine => {
                if (!machine.machineId) return;
                
                const diferencia = (parseFloat(machine.countedAmount) || 0) - (parseFloat(machine.expectedAmount) || 0);
                const tieneNovedad = machine.status === 'DISCREPANCY' || Math.abs(diferencia) > 0.01;
                
                // Todas son nuevas inserciones ahora
                insertBatch.push('(?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)');
                insertParams.push(
                    machine.machineId,
                    machine.headercard || null,
                    machine.location || null,
                    zona,
                    parseFloat(machine.expectedAmount) || 0,
                    parseFloat(machine.countedAmount) || 0,
                    diferencia,
                    machine.status || 'UNKNOWN',
                    confirmada ? 1 : 0,
                    usuario,
                    tieneNovedad ? 1 : 0
                );
            });
            
            // Ejecutar inserciones si hay registros a insertar
            if (insertBatch.length > 0) {
                const insertQuery = `
                    INSERT INTO maquinas_tesorero 
                    (maquina, headercard, location, zona, valor_esperado, valor_contado, diferencia, 
                    estado, fecha_conciliacion, conciliado, usuario_conciliacion, tiene_novedad)
                    VALUES ${insertBatch.join(',')}
                `;
                
                console.log(`Ejecutando inserción de ${insertBatch.length} máquinas...`);
                await connection.query(insertQuery, insertParams);
                console.log('Inserción de máquinas completada');
            }
        }
        
        // Commit de la transacción
        await connection.commit();
        
        // Emitir eventos
        io.emit('nuevaConciliacion', { 
            id: conciliacionId, 
            zona, 
            fecha: new Date(), 
            confirmada 
        });
        
        io.emit('actualizacionMaquinasTesorero', {
            zona,
            cantidadActualizada: resultados.length
        });
        
        return res.status(201).json({ 
            success: true, 
            message: 'Conciliación guardada correctamente (optimizado)', 
            id: conciliacionId 
        });
        
    } catch (error) {
        // Rollback en caso de error
        if (connection) {
            await connection.rollback();
        }
        
        console.error('Error al guardar conciliación de zona (optimizado):', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Error al guardar la conciliación', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    } finally {
        // Liberar la conexión
        if (connection) {
            connection.release();
        }
    }
};


/**
 * Obtener resumen por zonas para el dashboard del tesorero
 */
export const obtenerResumenPorZonas = async (req, res) => {
    console.log('obtenerResumenPorZonas llamado');

    try {
        // Obtener resumen de la tabla zona_conciliacion agrupado por zona
        const query = `
            SELECT 
                zona,
                SUM(total_esperado) as total_esperado,
                SUM(total_contado) as total_contado,
                SUM(total_contado) - SUM(total_esperado) as diferencia,
                SUM(maquinas_totales) as total_maquinas,
                SUM(maquinas_coincidentes) as maquinas_coincidentes,
                SUM(maquinas_discrepancia) as maquinas_discrepancia,
                SUM(maquinas_faltantes) as maquinas_faltantes,
                SUM(maquinas_extra) as maquinas_extra,
                MAX(fecha) as ultima_fecha,
                COUNT(*) as total_conciliaciones
            FROM 
                zona_conciliacion
            GROUP BY 
                zona
            ORDER BY 
                MAX(fecha) DESC, MAX(hora) DESC
        `;

        const [result] = await pool.query(query);

        return res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error al obtener resumen por zonas:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener resumen por zonas',
            error: error.message
        });
    }
};