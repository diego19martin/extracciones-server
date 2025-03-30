import { pool } from "../db.js";
import { io } from "../index.js";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Define __dirname in modules ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Guardar una nueva conciliación de zona
 */
export const guardarConciliacionZona = async (req, res) => {
    console.log('guardarConciliacionZona llamado');
    console.log('Headers:', req.headers);

    // Log del cuerpo dependiendo del content-type
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        console.log('Recibido como multipart/form-data');
        console.log('req.body:', req.body);
        console.log('req.files:', req.files ? Object.keys(req.files) : 'No hay archivos');
    } else {
        console.log('Recibido como application/json');
        console.log('req.body:', req.body);
    }

    // Obtener una conexión desde el pool
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Parsear los datos según el tipo de contenido
        let conciliacionData;

        if (contentType.includes('multipart/form-data')) {
            // Si los datos se enviaron como parte de un FormData
            if (req.body.data) {
                try {
                    conciliacionData = JSON.parse(req.body.data);
                } catch (error) {
                    console.error('Error al parsear JSON en req.body.data:', error);
                    return res.status(400).json({
                        success: false,
                        message: 'Datos JSON inválidos en el campo "data"',
                        error: error.message
                    });
                }
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'No se encontró el campo "data" en el FormData'
                });
            }
        } else {
            // Si los datos se enviaron directamente como JSON
            conciliacionData = req.body;
        }

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
        if (!Array.isArray(resultados)) {
            return res.status(400).json({
                success: false,
                message: 'El campo "resultados" debe ser un array'
            });
        }

        // Variables para almacenar referencias a los archivos
        let archivoDat = null;
        let archivoXls = null;

        // Procesar archivos si existen
        if (req.files) {
            const uploadDir = path.join(__dirname, '../uploads');
            // Asegurarse de que exista el directorio de uploads
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            if (req.files.archivoDat) {
                const datFile = req.files.archivoDat;
                const datFileName = `${zona}_${Date.now()}.dat`;
                const uploadPath = path.join(uploadDir, datFileName);

                try {
                    await datFile.mv(uploadPath);
                    archivoDat = datFileName;
                    console.log('Archivo DAT guardado en:', uploadPath);
                } catch (error) {
                    console.error('Error al guardar el archivo DAT:', error);
                    throw error;
                }
            }

            if (req.files.archivoXls) {
                const xlsFile = req.files.archivoXls;
                const xlsFileName = `${zona}_${Date.now()}.xlsx`;
                const uploadPath = path.join(uploadDir, xlsFileName);

                try {
                    await xlsFile.mv(uploadPath);
                    archivoXls = xlsFileName;
                    console.log('Archivo XLS guardado en:', uploadPath);
                } catch (error) {
                    console.error('Error al guardar el archivo XLS:', error);
                    throw error;
                }
            }
        }

        // Insertar en la tabla principal utilizando valores por defecto si faltan
        const [result] = await connection.execute(
            `INSERT INTO zona_conciliacion 
            (fecha, hora, zona, usuario, confirmada, fecha_confirmacion, 
            total_esperado, total_contado, maquinas_totales, 
            maquinas_coincidentes, maquinas_discrepancia, maquinas_faltantes, 
            maquinas_extra, comentarios, archivo_dat, archivo_xls) 
            VALUES (CURDATE(), CURTIME(), ?, ?, ?, 
            ${confirmada ? 'NOW()' : 'NULL'}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                zona,
                usuario,
                confirmada ? 1 : 0,
                totalEsperado || 0,
                totalContado || 0,
                maquinasTotales || 0,
                maquinasCoincidentes || 0,
                maquinasDiscrepancia || 0,
                maquinasFaltantes || 0,
                maquinasExtra || 0,
                comentarios || '',
                archivoDat,
                archivoXls
            ]
        );

        const conciliacionId = result.insertId;
        console.log('Conciliación guardada con ID:', conciliacionId);

        // Insertar detalles de máquinas si hay resultados y actualizar la tabla del tesorero
        if (resultados.length > 0) {
            console.log(`Procesando ${resultados.length} registros de máquinas`);

            // Modificar esta sección en el método guardarConciliacionZona en zona-conciliacion.controller.js

            // Dentro del bucle de procesamiento de máquinas
            for (const machine of resultados) {
                try {
                    // Validar datos mínimos para cada máquina
                    if (!machine.machineId) {
                        console.warn('Máquina sin ID, omitiendo:', machine);
                        continue;
                    }

                    console.log('Procesando máquina:', JSON.stringify(machine, null, 2));

                    // Convertir objetos de billetes a JSON
                    const detallesBilletes = JSON.stringify({
                        billetesFisicos: machine.billetesFisicos || {},
                        billetesVirtuales: machine.billetesVirtuales || {}
                    });

                    // 1. Insertar en la tabla de detalles de conciliación
                    await connection.execute(
                        `INSERT INTO zona_conciliacion_detalle 
            (conciliacion_id, maquina, headercard, location, 
            valor_esperado, valor_contado, valor_fisico, valor_virtual, 
            estado, detalles_billetes) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            conciliacionId,
                            machine.machineId,
                            machine.headercard || null,
                            machine.location || null,
                            machine.expectedAmount || 0,
                            machine.countedAmount || 0,
                            machine.countedPhysical || 0,
                            machine.countedVirtual || 0,
                            machine.status || 'UNKNOWN',
                            detallesBilletes
                        ]
                    );

                    // 2. Actualizar la tabla maquinas_tesorero (insertar o actualizar)
                    const diferencia = (machine.countedAmount || 0) - (machine.expectedAmount || 0);
                    const tieneNovedad = machine.status === 'DISCREPANCY' || Math.abs(diferencia) > 0.01;

                    // Comprobar si la máquina ya existe en la tabla
                    const [existingMachine] = await connection.execute(
                        'SELECT id FROM maquinas_tesorero WHERE maquina = ?',
                        [machine.machineId]
                    );

                    console.log(`Máquina ${machine.machineId}: ${existingMachine.length > 0 ? 'Actualizando' : 'Insertando nuevo'} registro`);

                    if (existingMachine.length > 0) {
                        // Actualizar registro existente
                        const updateQuery = `
                UPDATE maquinas_tesorero SET 
                headercard = ?,
                location = ?,
                zona = ?,
                valor_esperado = ?,
                valor_contado = ?,
                diferencia = ?,
                estado = ?,
                fecha_conciliacion = NOW(),
                conciliado = ?,
                usuario_conciliacion = ?,
                tiene_novedad = ?
                WHERE maquina = ?
            `;
                        const updateParams = [
                            machine.headercard || null,
                            machine.location || null,
                            zona,
                            machine.expectedAmount || 0,
                            machine.countedAmount || 0,
                            diferencia,
                            machine.status || 'UNKNOWN',
                            confirmada ? 1 : 0,
                            usuario,
                            tieneNovedad ? 1 : 0,
                            machine.machineId
                        ];

                        console.log('Ejecutando update con parámetros:', updateParams);

                        try {
                            await connection.execute(updateQuery, updateParams);
                            console.log(`Máquina ${machine.machineId} actualizada correctamente`);
                        } catch (updateError) {
                            console.error(`Error al actualizar máquina ${machine.machineId}:`, updateError);
                            throw updateError;
                        }
                    } else {
                        // Insertar nuevo registro
                        const insertQuery = `
                INSERT INTO maquinas_tesorero 
                (maquina, headercard, location, zona, valor_esperado, valor_contado, diferencia, 
                estado, fecha_conciliacion, conciliado, usuario_conciliacion, tiene_novedad)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
            `;
                        const insertParams = [
                            machine.machineId,
                            machine.headercard || null,
                            machine.location || null,
                            zona,
                            machine.expectedAmount || 0,
                            machine.countedAmount || 0,
                            diferencia,
                            machine.status || 'UNKNOWN',
                            confirmada ? 1 : 0,
                            usuario,
                            tieneNovedad ? 1 : 0
                        ];

                        console.log('Ejecutando insert con parámetros:', insertParams);

                        try {
                            await connection.execute(insertQuery, insertParams);
                            console.log(`Máquina ${machine.machineId} insertada correctamente`);
                        } catch (insertError) {
                            console.error(`Error al insertar máquina ${machine.machineId}:`, insertError);
                            throw insertError;
                        }
                    }
                } catch (error) {
                    console.error('Error al procesar máquina:', error);
                    console.error('Detalles de la máquina con error:', JSON.stringify(machine, null, 2));
                    throw error;
                }
            }
        }

        // Commit de la transacción
        await connection.commit();

        // Emitir evento de Socket.IO para actualizar en tiempo real
        io.emit('nuevaConciliacion', {
            id: conciliacionId,
            zona,
            fecha: new Date(),
            confirmada
        });

        // Emitir evento para actualización de dashboard del tesorero
        io.emit('actualizacionMaquinasTesorero', {
            zona,
            cantidadActualizada: resultados.length
        });

        return res.status(201).json({
            success: true,
            message: 'Conciliación guardada correctamente',
            id: conciliacionId
        });

    } catch (error) {
        // Rollback en caso de error
        if (connection) {
            await connection.rollback();
        }

        console.error('Error al guardar conciliación de zona:', error);
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
 * Confirmar una conciliación de zona existente
 */
export const confirmarConciliacionZona = async (req, res) => {
    console.log('confirmarConciliacionZona llamado');
    console.log('req.body:', req.body);

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const { id, usuario } = req.body;

        if (!id || !usuario) {
            return res.status(400).json({
                success: false,
                message: 'Faltan campos requeridos: id y usuario son obligatorios'
            });
        }

        // Verificar que la conciliación existe
        const [conciliacion] = await connection.query(
            'SELECT id, zona FROM zona_conciliacion WHERE id = ?',
            [id]
        );

        if (conciliacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Conciliación no encontrada'
            });
        }

        // Actualizar estado a confirmada
        await connection.query(
            'UPDATE zona_conciliacion SET confirmada = TRUE, fecha_confirmacion = NOW(), usuario_confirmacion = ? WHERE id = ?',
            [usuario, id]
        );

        // Obtener detalles de las máquinas de esta conciliación
        const [detalles] = await connection.query(
            'SELECT * FROM zona_conciliacion_detalle WHERE conciliacion_id = ?',
            [id]
        );

        // Actualizar tabla de máquinas del tesorero
        for (const detalle of detalles) {
            await connection.query(
                `UPDATE maquinas_tesorero SET 
                conciliado = 1,
                usuario_conciliacion = ?,
                fecha_conciliacion = NOW()
                WHERE maquina = ?`,
                [usuario, detalle.maquina]
            );
        }

        await connection.commit();

        // Emitir evento de actualización
        io.emit('conciliacionConfirmada', {
            id,
            zona: conciliacion[0].zona
        });

        // Emitir evento para actualización de dashboard del tesorero
        io.emit('actualizacionMaquinasTesorero', {
            zona: conciliacion[0].zona,
            confirmada: true
        });

        return res.json({
            success: true,
            message: 'Conciliación confirmada correctamente'
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }

        console.error('Error al confirmar conciliación:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al confirmar la conciliación',
            error: error.message
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
export const obtenerMaquinasTesorero = async (req, res) => {
    console.log('obtenerMaquinasTesorero llamado');
    console.log('Query params:', req.query);

    try {
        // Opciones de filtrado
        const {
            zona,
            fecha_inicio,
            fecha_fin,
            conciliado,
            tiene_novedad,
            estado,
            limite,
            pagina
        } = req.query;

        let query = 'SELECT * FROM maquinas_tesorero';
        const params = [];
        const conditions = [];

        if (zona) {
            conditions.push('zona = ?');
            params.push(zona);
        }

        if (fecha_inicio) {
            conditions.push('fecha_conciliacion >= ?');
            params.push(fecha_inicio);
        }

        if (fecha_fin) {
            conditions.push('fecha_conciliacion <= ?');
            params.push(fecha_fin);
        }

        if (conciliado !== undefined) {
            conditions.push('conciliado = ?');
            params.push(conciliado === 'true' || conciliado === '1' ? 1 : 0);
        }

        if (tiene_novedad !== undefined) {
            conditions.push('tiene_novedad = ?');
            params.push(tiene_novedad === 'true' || tiene_novedad === '1' ? 1 : 0);
        }

        if (estado) {
            conditions.push('estado = ?');
            params.push(estado);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        // Contar total de registros para paginación
        const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await pool.query(countQuery, params);
        const totalRegistros = countResult[0].total;

        // Ordenar y aplicar paginación
        query += ' ORDER BY ultima_actualizacion DESC';

        // Aplicar límite y paginación si se solicitan
        if (limite) {
            const limiteNum = parseInt(limite);
            query += ' LIMIT ?';
            params.push(limiteNum);

            if (pagina) {
                const paginaNum = parseInt(pagina);
                const offset = (paginaNum - 1) * limiteNum;
                query += ' OFFSET ?';
                params.push(offset);
            }
        }

        const [result] = await pool.query(query, params);
        console.log(`Encontradas ${result.length} máquinas del tesorero`);

        return res.json({
            total: totalRegistros,
            pagina: pagina ? parseInt(pagina) : 1,
            limite: limite ? parseInt(limite) : totalRegistros,
            data: result
        });

    } catch (error) {
        console.error('Error al obtener máquinas del tesorero:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al obtener las máquinas del tesorero',
            error: error.message
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
        
        // 1. INSERTAR EN LA TABLA PRINCIPAL
        const [result] = await connection.execute(
            `INSERT INTO zona_conciliacion 
            (fecha, hora, zona, usuario, confirmada, fecha_confirmacion, 
            total_esperado, total_contado, maquinas_totales, 
            maquinas_coincidentes, maquinas_discrepancia, maquinas_faltantes, 
            maquinas_extra, comentarios, archivo_dat, archivo_xls) 
            VALUES (CURDATE(), CURTIME(), ?, ?, ?, 
            ${confirmada ? 'NOW()' : 'NULL'}, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
            [
                zona, 
                usuario, 
                confirmada ? 1 : 0,
                totalEsperado || 0, 
                totalContado || 0, 
                maquinasTotales || 0, 
                maquinasCoincidentes || 0,
                maquinasDiscrepancia || 0, 
                maquinasFaltantes || 0, 
                maquinasExtra || 0,
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
                    machine.machineId,
                    machine.headercard || null,
                    machine.location || null,
                    machine.expectedAmount || 0,
                    machine.countedAmount || 0,
                    machine.countedPhysical || 0,
                    machine.countedVirtual || 0,
                    machine.status || 'UNKNOWN',
                    '{}'
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
            const machineIds = resultados.map(m => m.machineId).filter(Boolean);
            const queryExistentes = `SELECT maquina FROM maquinas_tesorero WHERE maquina IN (${machineIds.map(() => '?').join(',')})`;
            
            const [existingMachines] = await connection.query(queryExistentes, machineIds);
            const existingMachineIds = new Set(existingMachines.map(m => m.maquina));
            
            console.log(`De ${machineIds.length} máquinas, ${existingMachines.length} ya existen en la tabla`);
            
            // Preparar lotes para actualización e inserción
            const updateBatch = [];
            const updateParams = [];
            const insertBatch = [];
            const insertParams = [];
            
            resultados.forEach(machine => {
                if (!machine.machineId) return;
                
                const diferencia = (machine.countedAmount || 0) - (machine.expectedAmount || 0);
                const tieneNovedad = machine.status === 'DISCREPANCY' || Math.abs(diferencia) > 0.01;
                
                if (existingMachineIds.has(machine.machineId)) {
                    // Para actualizar
                    updateBatch.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                    updateParams.push(
                        machine.machineId,
                        machine.headercard || null,
                        machine.location || null,
                        zona,
                        machine.expectedAmount || 0,
                        machine.countedAmount || 0,
                        diferencia,
                        machine.status || 'UNKNOWN',
                        confirmada ? 1 : 0,
                        usuario,
                        tieneNovedad ? 1 : 0
                    );
                } else {
                    // Para insertar
                    insertBatch.push('(?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)');
                    insertParams.push(
                        machine.machineId,
                        machine.headercard || null,
                        machine.location || null,
                        zona,
                        machine.expectedAmount || 0,
                        machine.countedAmount || 0,
                        diferencia,
                        machine.status || 'UNKNOWN',
                        confirmada ? 1 : 0,
                        usuario,
                        tieneNovedad ? 1 : 0
                    );
                }
            });
            
            // Ejecutar actualizaciones masivas si hay registros a actualizar
            if (updateBatch.length > 0) {
                // Usamos una consulta más avanzada que actualiza múltiples registros a la vez
                const updateQuery = `
                    INSERT INTO maquinas_tesorero 
                    (maquina, headercard, location, zona, valor_esperado, valor_contado, diferencia, 
                    estado, fecha_conciliacion, conciliado, usuario_conciliacion, tiene_novedad)
                    VALUES ${updateBatch.join(',')}
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
                
                console.log(`Ejecutando actualización masiva de ${updateBatch.length} máquinas...`);
                await connection.query(updateQuery, updateParams);
                console.log('Actualización masiva completada');
            }
            
            // Ejecutar inserciones masivas si hay registros a insertar
            if (insertBatch.length > 0) {
                const insertQuery = `
                    INSERT INTO maquinas_tesorero 
                    (maquina, headercard, location, zona, valor_esperado, valor_contado, diferencia, 
                    estado, fecha_conciliacion, conciliado, usuario_conciliacion, tiene_novedad)
                    VALUES ${insertBatch.join(',')}
                `;
                
                console.log(`Ejecutando inserción masiva de ${insertBatch.length} nuevas máquinas...`);
                await connection.query(insertQuery, insertParams);
                console.log('Inserción masiva de nuevas máquinas completada');
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