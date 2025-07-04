import { pool } from "../db.js";
import { io } from "../index.js";
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';


// Definir __dirname para módulos ECMAScript
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


export const postList = async (req, res) => {
    try {
        const { machines, valuePesos, valueDolares } = req.body;

        // Convertir a número y validar
        const pesoLimit = parseFloat(valuePesos);
        const dolarLimit = parseFloat(valueDolares);

        console.log('Límites recibidos - Pesos:', pesoLimit, 'Dólares:', dolarLimit);
        console.log('Cantidad de máquinas recibidas:', machines?.length || 0);

        // Validar datos de entrada
        if (!Array.isArray(machines) || machines.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron máquinas válidas' });
        }

        // Limpiar tablas
        await pool.query('TRUNCATE listado');
        await pool.query('TRUNCATE listado_filtrado');

        // Prepara los datos para inserción
        const insertValues = machines.map(machine => {
            // Asegurar que todos los campos estén presentes y sean válidos
            const billValue = parseFloat(machine.bill || 0);
            return `('${machine.machine || ""}', '${machine.location || ""}', ${billValue}, NOW(), '${machine.zona || ""}', '${machine.moneda || "pesos"}')`
        }).join(',');

        // Insertar en listado general
        const queryListado = `INSERT INTO listado (maquina, location, bill, fecha, zona, moneda) VALUES ${insertValues}`;
        await pool.query(queryListado);
        console.log('Máquinas insertadas en listado general');

        // Filtrar máquinas según los límites
        const filteredMachines = machines.filter(machine => {
            const billValue = parseFloat(machine.bill || 0);

            if (machine.moneda === 'pesos') {
                return billValue >= pesoLimit;
            } else if (machine.moneda === 'dolares') {
                return billValue >= dolarLimit;
            }

            return false; // Si no tiene moneda definida, no pasa el filtro
        });

        console.log('Máquinas que pasan el filtro:', filteredMachines.length);

        // Insertar máquinas filtradas
        if (filteredMachines.length > 0) {
            const insertFilteredValues = filteredMachines.map(machine => {
                const billValue = parseFloat(machine.bill || 0);
                return `('${machine.machine || ""}', '${machine.location || ""}', ${billValue}, NOW(), '${machine.zona || ""}', '${machine.moneda || "pesos"}')`
            }).join(',');

            const queryFiltrado = `INSERT INTO listado_filtrado (maquina, location, bill, fecha, zona, moneda) VALUES ${insertFilteredValues}`;
            await pool.query(queryFiltrado);
            console.log('Máquinas filtradas insertadas correctamente');
        }

        // Obtener la tabla actualizada
        const [updatedTable] = await pool.query('SELECT * FROM listado_filtrado ORDER BY location ASC');
        console.log('Registros en listado_filtrado:', updatedTable.length);

        return res.json({
            status: 'success',
            message: 'Lista de máquinas procesada correctamente',
            filtered: filteredMachines.length,
            total: machines.length
        });
    } catch (error) {
        console.error('Error al insertar la lista de máquinas:', error);
        res.status(500).json({ error: 'Error al insertar la lista de máquinas', details: error.message });
    }
};


export const postConfig = async (req, res) => {
    try {
        // Obtener los valores del cuerpo de la solicitud
        const { valuePesos, valueDolares } = req.body;

       console.log('Valores recibidos:', valuePesos, valueDolares);

        // Asegurarnos que los valores sean numéricos
        const pesoLimit = parseFloat(valuePesos);
        const dolarLimit = parseFloat(valueDolares);

        console.log('Valores recibidos:', valuePesos, valueDolares);
        console.log('Valores convertidos:', pesoLimit, dolarLimit);

        const fecha = new Date();

        // Verificar si hay registros en la tabla config
        const [configCheck] = await pool.query('SELECT COUNT(*) as count FROM config');

        let result;
        if (configCheck[0].count > 0) {
            // Actualizar el registro existente
            [result] = await pool.query(
                'UPDATE config SET fecha = ?, limite = ?, limiteDolar = ?',
                [fecha, pesoLimit, dolarLimit]
            );
            console.log('Configuración actualizada');
        } else {
            // Crear nuevo registro
            [result] = await pool.query(
                'INSERT INTO config (fecha, limite, limiteDolar) VALUES (?, ?, ?)',
                [fecha, pesoLimit, dolarLimit]
            );
            console.log('Nueva configuración creada');
        }

        // Verificar que se haya actualizado/insertado correctamente
        const [updatedConfig] = await pool.query('SELECT * FROM config');
        console.log('Configuración actual:', updatedConfig);

        res.json({
            message: 'Configuración actualizada correctamente',
            data: { limite: pesoLimit, limiteDolar: dolarLimit }
        });
    } catch (error) {
        console.error('Error al actualizar la configuración:', error);
        res.status(500).json({ error: 'Error al actualizar la configuración', details: error.message });
    }
};

export const getResumen = async (req, res) => {
    try {
        let result;
        try {
            [result] = await pool.query('SELECT * FROM `listado` ORDER BY location ASC');
            // console.log('Query de listado ejecutada correctamente:', result);
        } catch (error) {
            console.error('Error ejecutando la query de listado:', error);
            throw error;
        }
        if (result.length === 0) {
            result = [{ fecha: 'Sin datos', maquina: 0 }];
        }
        // console.log('Resultado de la consulta getResumen:', result);
        res.json(result);
    } catch (error) {
        console.error('Error al obtener el resumen:', error);
        res.status(500).json({ error: 'Error al obtener el resumen' });
    }
};

export const getInfo = async (req, res) => {

    const { maquina } = req.params;

    // console.log(maquina);


    try {
        const [result] = await pool.query('SELECT * FROM `listado` WHERE maquina = ?', [maquina]);
        const [limite] = await pool.query('SELECT * FROM `config`');

        console.log('result', result);


        if (result.length > 0) {
            const loc = result[0].location;
            const location = loc.slice(0, 4);
            const limitPesos = limite[0].limite;
            const limitDolares = limite[0].limiteDolar;
            let listadoFinal = [];

            let listado;
            try {
                [listado] = await pool.query('SELECT * FROM `listado` WHERE LEFT(`location`, 4) = ? ORDER BY (`location`) DESC', [location]);
            } catch (error) {
                console.error('Error ejecutando la query de listado filtrada por location:', error);
                throw error;
            }

            console.log('listado', listado);


            // Filtrar las máquinas según los límites
            for (let i = 0; i < listado.length; i++) {
                if ((listado[i].moneda === 'pesos' && listado[i].bill >= limitPesos) ||
                    (listado[i].moneda === 'dolares' && listado[i].bill >= limitDolares)) {

                    // Validar que los valores sean correctos antes de agregar al listado
                    if (listado[i].maquina && listado[i].location && listado[i].bill) {
                        const listadoExtraer = {
                            fecha: listado[i].fecha,
                            maquina: listado[i].maquina,
                            location: listado[i].location,
                            finalizado: listado[i].finalizado,
                            id: listado[i].idlistado,
                            zona: listado[i].zona,
                        };
                        listadoFinal.push(listadoExtraer);
                        console.log(listadoExtraer);

                    }
                }
            }

            console.log(limitPesos, limitDolares);
            console.log(listadoFinal);



            // Devolver el listado filtrado
            res.json(listadoFinal);
        } else {
            res.json([]); // Devolver un array vacío
        }
    } catch (error) {
        console.error('Error al obtener la información:', error);
        res.status(500).json({ error: 'Error al obtener la información' });
    }
};


export const postSelect = async (req, res) => {
    try {
        const { finalizado, asistente1, asistente2, comentario, maquina, zona } = req.body;

        // Actualizar la base de datos con la información de la extracción
        await pool.query(
            'UPDATE listado_filtrado SET `finalizado`=?, `asistente1`=?, `asistente2`=?, `comentario`=? WHERE `maquina` = ?',
            [finalizado, asistente1, asistente2, comentario, maquina]
        );

        // Emitir la tabla actualizada a los clientes conectados
        const [updatedTable] = await pool.query('SELECT * FROM `listado_filtrado` ORDER BY location ASC');
        io.emit('tableUpdate', updatedTable);

        // Actualizar la tabla listado con el estado de la extracción
        await pool.query(
            'UPDATE listado SET `finalizado`=? WHERE `maquina` = ?',
            [finalizado, maquina]
        );


        // Verificar si todas las máquinas en la zona han sido extraídas o marcadas como pendientes
        const [result] = await pool.query(
            'SELECT COUNT(*) AS maquinasPendientes FROM listado_filtrado WHERE zona = ? AND (finalizado IS NULL OR finalizado != "Completa" AND finalizado != "Pendiente")',
            [zona]
        );

        if (result[0].maquinasPendientes === 0) {
            console.log(`Todas las máquinas en la zona ${zona} han sido extraídas o marcadas como pendientes. Generando reporte para el tesorero.`);
            await generarYEnviarReporteZona(zona);

            // Verificar si todas las máquinas han sido extraídas o marcadas como pendientes (para el reporte general a técnicos)
            const [generalResult] = await pool.query(
                'SELECT COUNT(*) AS maquinasPendientes FROM listado_filtrado WHERE finalizado IS NULL OR finalizado NOT IN ("Completa", "Pendiente")'
            );

            if (generalResult[0].maquinasPendientes === 0) {
                console.log('Todas las máquinas han sido extraídas o marcadas como pendientes. Generando reporte para los técnicos.');
                await generarYEnviarReporte();
            }
        }

        return res.json('ok');
    } catch (error) {
        console.error('Error al actualizar el registro:', error);
        return res.status(500).json({ error: 'Error al actualizar el registro' });
    }
};

export const getListadoFiltrado = async (req, res) => {
    try {
        const [result] = await pool.query('SELECT * FROM `listado_filtrado` ORDER BY location ASC');
        console.log('Listado filtrado:', result);

        res.json(result);
    } catch (error) {
        console.error('Error al obtener el listado filtrado:', error);
        res.status(500).json({ error: 'Error al obtener el listado filtrado' });
    }
};

export const getConfig = async (req, res) => {
    try {
        const [result] = await pool.query('SELECT * FROM `config` ORDER BY id DESC LIMIT 1');
        if (result.length > 0) {
            res.json(result[0]);
        } else {
            res.json({ limite: 0, limiteDolar: 1 });
        }
    } catch (error) {
        console.error('Error al obtener la configuración:', error);
        res.status(500).json({ error: 'Error al obtener la configuración' });
    }
};


const generarYEnviarReporteZona = async (zona) => {
    console.log('Generando reporte para la zona', zona);

    try {
        // Obtener todas las máquinas COMPLETAS de la zona con su detalle
        const [result] = await pool.query('SELECT fecha, maquina, location, bill FROM listado_filtrado WHERE zona = ? AND finalizado = "Completa"', [zona]);

        if (result.length === 0) {
            console.log('No hay máquinas completas en la zona especificada.');
            return;
        }

        // Crear un workbook y agregar los datos
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet(`Reporte Zona ${zona}`);

        // Agregar título al reporte
        worksheet.mergeCells('A1:F1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `Reporte de Novedades de Máquinas en Extracciones de Dinero - Zona ${zona}`;
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFB6C1' } // Color de fondo del título
        };

        worksheet.addRow([]); // Fila vacía
        worksheet.addRow([]); // Otra fila vacía

        // Agregar encabezado
        const headerRow = worksheet.addRow(['Fecha', 'Máquina', 'Ubicación', 'Dinero Extraído']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4682B4' } // Color azul para encabezados
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' },
            };
        });

        // Agregar los datos de cada máquina
        result.forEach((item) => {
            const row = worksheet.addRow([item.fecha, item.maquina, item.location, item.bill]);
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            });

            // Aplicar formato de moneda a la columna de "Dinero Extraído"
            row.getCell(4).numFmt = '"$"#,##0.00'; // Formato monetario
        });

        // Agregar un resumen al final del reporte
        worksheet.addRow([]); // Fila vacía

        const totalExtraido = result.reduce((total, item) => total + item.bill, 0);
        const summaryRow = worksheet.addRow(['Total Extraído', '', '', totalExtraido]);
        summaryRow.getCell(1).font = { bold: true };
        summaryRow.getCell(4).font = { bold: true };
        summaryRow.getCell(4).numFmt = '"$"#,##0.00'; // Aplicar formato de moneda al total
        summaryRow.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' },
            };
        });

        // Ajustar ancho de las columnas
        worksheet.columns.forEach((column, index) => {
            if (index === 3) {
                column.width = 18; // Más ancho para el monto
            } else {
                column.width = 22; // Ancho para otras columnas
            }
        });

        // Guardar el archivo Excel
        const reportDir = path.join(__dirname, '../reportes');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        const reportFilePath = path.join(reportDir, `reporte_zona_${zona}_Tesorería.xlsx`);

        await workbook.xlsx.writeFile(reportFilePath);

        console.log('Reporte de zona generado exitosamente:', reportFilePath);

        // // Enviar el correo con el reporte adjunto
        // enviarCorreoReporte(reportFilePath, 'zona');

    } catch (error) {
        console.error('Error al generar y enviar el reporte de zona:', error);
    }
};


export const generarYEnviarReporte = async (req, res) => {
    console.log('generar reporte');

    try {
        // Obtener las máquinas con comentarios desde la base de datos
        let [result] = await pool.query('SELECT fecha, maquina, location, comentario, finalizado FROM `listado_filtrado` WHERE comentario IS NOT NULL AND comentario != ""');

        if (result.length === 0) {
            console.log('No hay máquinas con comentarios para generar el reporte.');
            if (res) {
                return res.json({ message: 'No hay datos para generar el reporte', status: 'warning' });
            }
            return;
        }

        // Filtrar los datos para eliminar valores undefined o nulos y ajustar el estado de extracción
        result = result.map(item => ({
            fecha: item.fecha || '',
            maquina: item.maquina || '',
            location: item.location || '',
            comentario: item.comentario || '',
            estado: item.finalizado === "Completa" ? "Extraída" : "Pendiente"
        }));

        // Crear un workbook usando ExcelJS
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Extracciones');

        // Agregar un título al reporte
        worksheet.mergeCells('A1:E1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = "Reporte de novedades de máquinas en extracciones de dinero";
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.addRow([]);
        worksheet.addRow([]);

        // Añadir encabezados y definir columnas
        const headerRow = worksheet.addRow(['Fecha', 'Máquina', 'Ubicación', 'Comentario', 'Estado de Extracción']);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFCC' } // Color de fondo amarillo claro
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        // Agregar los datos a la hoja
        result.forEach(row => {
            const newRow = worksheet.addRow(Object.values(row));
            // Colorear de rojo las filas que no fueron extraídas (Pendiente)
            if (row.estado === "Pendiente") {
                newRow.eachCell(cell => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF0000' } // Color rojo
                    };
                    cell.font = { color: { argb: 'FFFFFF' } }; // Texto blanco
                });
            }
        });

        // Ajustar la altura de la fila del título
        worksheet.getRow(1).height = 30;

        // Asignar el ancho de las columnas
        worksheet.columns = [
            { width: 22 },  // Columna "Fecha"
            { width: 22 },  // Columna "Máquina"
            { width: 22 },  // Columna "Ubicación"
            { width: 35 },  // Columna "Comentario"
            { width: 22 }   // Columna "Estado de Extracción"
        ];

        // Guardar el archivo Excel con un nombre fijo para sobrescribir
        const reportDir = path.join(__dirname, '../reportes');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const reportFilePath = path.join(reportDir, `reporte_extracciones_Técnica.xlsx`);

        await workbook.xlsx.writeFile(reportFilePath);
        console.log('Reporte generado exitosamente:', reportFilePath);

        // Enviar el correo con el reporte adjunto
        const emailEnviado = await enviarCorreoReporte(reportFilePath, 'tecnica');

        if (res) {
            if (emailEnviado) {
                res.json({ message: 'Reporte generado y enviado correctamente', status: 'success' });
            } else {
                res.json({ message: 'Reporte generado correctamente pero hubo problemas al enviar el correo. El administrador revisará esta situación.', status: 'warning' });
            }
        }

    } catch (error) {
        console.error('Error al generar y enviar el reporte:', error);
        if (res) {
            res.status(500).json({
                error: 'Error al generar el reporte',
                message: 'Ocurrió un problema al generar el reporte. Por favor intente más tarde o contacte al administrador.',
                status: 'error'
            });
        }
    }
};

export const generarReporteResumen = async (req, res) => {
    console.log('Generando reporte diario...');

    try {
        const [result] = await pool.query('SELECT * FROM `listado_filtrado`');

        if (result.length === 0) {
            console.log('No hay datos en listado_filtrado.');
            if (res) {
                return res.json({ message: 'No hay datos para generar el reporte', status: 'warning' });
            }
            return;
        }

        const maquinasFinalizadas = result.filter(row => row.finalizado === 'Completa');
        const maquinasPendientes = result.filter(row => row.finalizado === 'Pendiente');
        const maquinasNoEscaneadas = result.filter(row => row.finalizado === null);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Reporte Diario');

        // 1. Título
        worksheet.mergeCells('A1:H1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = "Reporte Diario de Extracciones - " + new Date().toLocaleDateString();
        titleCell.font = { size: 18, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCFF' } };

        worksheet.addRow([]); // Fila vacía para separación

        let currentRow = worksheet.lastRow.number + 1; // Control de filas dinámico

        // 2. Sección para Máquinas Finalizadas
        worksheet.addRow(['Máquinas Finalizadas']);
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        const subTitleFinalizadas = worksheet.getCell(`A${currentRow}`);
        subTitleFinalizadas.font = { size: 14, bold: true, color: { argb: 'FF006400' } }; // Verde oscuro
        currentRow++;

        worksheet.addRow(['ID', 'Máquina', 'Location', 'Dinero', 'Fecha', 'Zona', 'Moneda', 'Estado', 'Asistente 1', 'Asistente 2']);
        let headerFinalizadas = worksheet.getRow(currentRow);
        headerFinalizadas.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D3D3D3' } }; // Gris claro
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        currentRow++;

        maquinasFinalizadas.forEach(row => {
            const newRow = worksheet.addRow([row.id, row.maquina, row.location, row.bill, row.fecha, row.zona, row.moneda, row.finalizado, row.asistente1, row.asistente2]);
            newRow.eachCell((cell, colNumber) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFFFD4' } }; // Verde claro
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            currentRow++;
        });

        worksheet.addRow([]); // Fila vacía para separación
        currentRow++;

        // 3. Sección para Máquinas Pendientes
        worksheet.addRow(['Máquinas Pendientes']);
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        const subTitlePendientes = worksheet.getCell(`A${currentRow}`);
        subTitlePendientes.font = { size: 14, bold: true, color: { argb: 'FFFFA500' } }; // Naranja
        currentRow++;

        worksheet.addRow(['ID', 'Máquina', 'Location', 'Dinero', 'Fecha', 'Zona', 'Moneda', 'Estado', 'asistente 1', 'asistente 2']);
        let headerPendientes = worksheet.getRow(currentRow);
        headerPendientes.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D3D3D3' } }; // Gris claro
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        currentRow++;

        maquinasPendientes.forEach(row => {
            const newRow = worksheet.addRow([row.id, row.maquina, row.location, row.bill, row.fecha, row.zona, row.moneda, row.finalizado, row.asistente1, row.asistente2]);
            newRow.eachCell((cell, colNumber) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFE0' } }; // Amarillo claro
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            currentRow++;
        });

        worksheet.addRow([]); // Fila vacía para separación
        currentRow++;

        // 4. Sección para Máquinas No Escaneadas
        worksheet.addRow(['Máquinas No Escaneadas']);
        worksheet.mergeCells(`A${currentRow}:H${currentRow}`);
        const subTitleNoEscaneadas = worksheet.getCell(`A${currentRow}`);
        subTitleNoEscaneadas.font = { size: 14, bold: true, color: { argb: 'FFFF0000' } }; // Rojo
        currentRow++;

        worksheet.addRow(['ID', 'Máquina', 'Location', 'Dinero', 'Fecha', 'Zona', 'Moneda', 'Estado']);
        let headerNoEscaneadas = worksheet.getRow(currentRow);
        headerNoEscaneadas.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D3D3D3' } }; // Gris claro
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        currentRow++;

        maquinasNoEscaneadas.forEach(row => {
            const newRow = worksheet.addRow([row.id, row.maquina, row.location, row.bill, row.fecha, row.zona, row.moneda, row.finalizado || 'No escaneada']);
            newRow.eachCell((cell, colNumber) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC0CB' } }; // Rojo claro
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });
            currentRow++;
        });

        // Ajustar el ancho de las columnas
        worksheet.columns.forEach(column => {
            column.width = 20;
        });

        // Guardar el archivo Excel
        const reportPath = path.join(__dirname, '../reportes', `reporte_diario_${new Date().toISOString().split('T')[0]}.xlsx`);
        await workbook.xlsx.writeFile(reportPath);
        console.log('Reporte generado:', reportPath);

        // Enviar el reporte por correo
        const emailEnviado = await enviarCorreoReporte(reportPath, 'diario');

        // Responder al cliente si existe una respuesta HTTP
        if (res) {
            if (emailEnviado) {
                res.json({ message: 'Reporte diario generado y enviado correctamente', status: 'success' });
            } else {
                res.json({ message: 'Reporte diario generado correctamente pero hubo problemas al enviar el correo. El administrador revisará esta situación.', status: 'warning' });
            }
        }

    } catch (error) {
        console.error('Error al generar o enviar el reporte diario:', error);
        if (res) {
            res.status(500).json({
                error: 'Error al generar el reporte diario',
                message: 'Ocurrió un problema al generar el reporte diario. Por favor intente más tarde o contacte al administrador.',
                status: 'error'
            });
        }
    }
};


const enviarCorreoReporte = async (filePath, tipoReporte) => {
    try {
        // Listas de destinatarios
        const destinatariosTecnica = [
            'dargonz@palermo.com.ar',
            'mholley@palermo.com.ar',
            'sespinoza@palermo.com.ar',
            'jmaldonado@palermo.com.ar',
            'jzuazo@palermo.com.ar',
            'gaguiar@palermo.com.ar',
            'fbernardo@palermo.com.ar',
            'fdotti@palermo.com.ar',
            'jefesjuego@palermo.com.ar',
            'edariozzi@betfun.com.ar'
        ];

        const destinatariosZonas = [
            'dargonz@palermo.com.ar',
            'mfernandez@palermo.com.ar',
            'lvega@palermo.com.ar',
            'vbove@palermo.com.ar',
            'gcarmona@palermo.com.ar'
        ];

        const destinatariosDiario = [
            'dargonz@palermo.com.ar',
            'jzuazo@palermo.com.ar',
            'gaguiar@palermo.com.ar',
            'fbernardo@palermo.com.ar',
            'fdotti@palermo.com.ar',
            'crodriguez@palermo.com.ar',
            'edariozzi@palermo.com.ar',
        ];

        // Seleccionar los destinatarios según el tipo de reporte
        let destinatarios;
        if (tipoReporte === 'tecnica') {
            destinatarios = destinatariosTecnica;
        } else if (tipoReporte === 'zona') {
            destinatarios = destinatariosZonas;
        } else if (tipoReporte === 'diario') {
            destinatarios = destinatariosDiario;
        } else {
            console.error('Tipo de reporte no válido:', tipoReporte);
            return; // Salir de la función si el tipo de reporte no es válido
        }

        // Pruebas
        // destinatarios = ['dargonz@palermo.com.ar', 'diegoargomnz@gmail.com']

        // Configurar el transporte del correo usando Hostinger
        const transporter = nodemailer.createTransport({
            host: 'smtp.hostinger.com', // Servidor SMTP de Hostinger
            port: 587, // Puerto SMTP (normalmente 587 o 465 para SSL)
            secure: false, // true si se usa el puerto 465 para SSL
            auth: {
                user: 'reportes@dadesarrollos.com', // Tu email de Hostinger
                pass: 'Palermo2024**' // Tu contraseña o contraseña de aplicación
            },
        });

        // Configurar el asunto dependiendo del tipo de reporte
        const asunto = tipoReporte === 'zona'
            ? 'Reporte de Extracciones por Zona'
            : tipoReporte === 'tecnica'
                ? 'Reporte de Extracciones Técnica'
                : 'Reporte Diario de Extracciones';

        // Configurar los detalles del correo
        const mailOptions = {
            from: 'reportes@dadesarrollos.com', // Dirección de correo de origen
            to: destinatarios.join(','), // Convertir la lista de destinatarios a una cadena separada por comas
            subject: asunto,
            text: 'Adjunto encontrarás el reporte de extracciones.',
            attachments: [
                {
                    filename: path.basename(filePath),
                    path: filePath,
                },
            ],
        };

        // Enviar el correo
        await transporter.sendMail(mailOptions);
        console.log(`Correo enviado a: ${destinatarios.join(', ')}`);
    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
};


export const getEmployees = async (req, res) => {
    console.log('getEmployees');
    
    try {
        const [employees] = await pool.query('SELECT * FROM empleados ORDER BY nombre ASC');
        res.json(employees);
    } catch (error) {
        console.error('Error al obtener empleados:', error);
        res.status(500).json({ error: 'Error al obtener empleados' });
    }
};

export const addEmployee = async (req, res) => {
    try {
        const { nombre } = req.body
        const [result] = await pool.query('INSERT INTO empleados (nombre) VALUES (?)', [nombre]);
        res.json({ id: result.insertId, nombre });
    } catch (error) {
        console.error('Error al agregar empleado:', error);
        res.status(500).json({ error: 'Error al agregar empleado' });
    }
};

export const removeEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM empleados WHERE empleado_id = ?', [id]);
        res.json({ message: 'Empleado eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar empleado:', error);
        res.status(500).json({ error: 'Error al eliminar empleado' });
    }
};

export const uploadEmployees = async (req, res) => {
    try {

        // Limpiar la tabla de configuración anterior
        const [truncate] = await pool.query('TRUNCATE empleados');

        const { employees } = req.body;
        for (let employee of employees) {
            await pool.query('INSERT INTO empleados (nombre) VALUES (?)', [employee.nombre]);
        }
        res.json({ message: 'Empleados cargados correctamente' });
    } catch (error) {
        console.error('Error al cargar empleados:', error);
        res.status(500).json({ error: 'Error al cargar empleados' });
    }
};


// Función final para generar Excel en el servidor con título correcto
export const generateExcelExport = async (req, res) => {
    try {
        const { filter } = req.query; // Parámetro opcional de filtro

        // Construir la consulta SQL para filtrar las máquinas según el filtro
        let query = 'SELECT * FROM listado_filtrado';
        if (filter && filter !== 'Todos') {
            if (filter === 'No iniciado') {
                query += ' WHERE finalizado IS NULL OR finalizado = "No iniciado"';
            } else if (filter === 'Con novedad') {
                query += ' WHERE comentario IS NOT NULL AND comentario != ""';
            } else {
                query += ' WHERE finalizado = ?';
            }
        }

        // Ejecutar la consulta con o sin parámetro según corresponda
        let result;
        if (filter && filter !== 'Todos' && filter !== 'No iniciado' && filter !== 'Con novedad') {
            [result] = await pool.query(query, [filter]);
        } else {
            [result] = await pool.query(query);
        }

        if (result.length === 0) {
            return res.status(404).json({ message: 'No hay datos para exportar' });
        }

        // Crear un nuevo libro de Excel
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Listado de Máquinas');

        // Determinar el título correcto basado en el filtro recibido
        let title = '';

        // Si el filtro es "Con novedad", usar "Comentario" como título
        if (filter === 'Con novedad') {
            title = 'Comentario';
        }
        // Para otros filtros, usar el nombre directamente
        else {
            title = filter || 'Todos';
        }

        console.log('Filtro recibido:', filter);
        console.log('Título a usar:', title);

        // Agregar título principal
        worksheet.mergeCells('A1:G1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = title;
        titleCell.font = { size: 16, bold: true };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        titleCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'E2EFDA' } // Color verde claro para el encabezado
        };
        titleCell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };

        // Definir columnas con títulos correctos
        const columns = [
            { header: '#', key: 'index', width: 5 },
            { header: 'Máquina', key: 'maquina', width: 15 },
            { header: 'Location', key: 'location', width: 12 },
            { header: 'Asistente 1', key: 'asistente1', width: 20 },
            { header: 'Asistente 2', key: 'asistente2', width: 20 },
            { header: 'Estado', key: 'estado', width: 15 },
            { header: 'Comentario', key: 'comentario', width: 35 }
        ];

        // Asignar columnas explícitamente
        worksheet.columns = columns;

        // Agregar fila con los encabezados de columna explícitamente
        const headers = columns.map(col => col.header);
        worksheet.addRow(headers);

        // Estilizar la fila de encabezado para que sea clara y visible
        const headerRow = worksheet.getRow(2); // La fila 2 contiene los encabezados de columna
        headerRow.eachCell((cell) => {
            cell.font = { bold: true };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            // Color de fondo para los encabezados de columna
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'F2F2F2' } // Color gris claro para los encabezados de columna
            };
        });

        // Agregar filas con datos pero sin aplicar colores de fondo
        result.forEach((item, index) => {
            const rowData = [
                index + 1,
                item.maquina || '',
                item.location || '',
                item.asistente1 || '',
                item.asistente2 || '',
                item.finalizado || 'No iniciado',
                item.comentario || ''
            ];

            const row = worksheet.addRow(rowData);

            // Agregar bordes a cada celda pero sin color de fondo
            row.eachCell({ includeEmpty: true }, (cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.alignment = { vertical: 'middle' };
            });
        });

        // Ajustar el nombre del archivo basado en el filtro
        const exportFileName = `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Configurar las cabeceras de respuesta para la descarga del archivo
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${exportFileName}`);

        // Escribir el archivo al stream de respuesta
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error al generar Excel:', error);
        res.status(500).json({
            error: 'Error al generar Excel',
            message: 'Ocurrió un problema al generar el archivo Excel. Por favor intente más tarde.'
        });
    }
};