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
        const { machines, valuePesos, valueDolares } = req.body; // Recibir máquinas y límites desde el cuerpo de la solicitud

        // Limpiar la tabla de configuración anterior
        await pool.query('TRUNCATE listado');
        await pool.query('TRUNCATE listado_filtrado');

        // Insertar todas las máquinas en la tabla "listado"
        const insertValues = machines.map(({ machine, location, bill, zona, moneda }) =>
            `('${machine}', '${location}', '${bill}', NOW(), '${zona}', '${moneda}')`
        ).join(',');

        const queryListado = `INSERT INTO listado (maquina, location, bill, fecha, zona, moneda) VALUES ${insertValues}`;
        await pool.query(queryListado);
        
        // Filtrar las máquinas que cumplen con las condiciones y guardar en "listado_filtrado"
        const filteredMachines = machines.filter(machine =>
            (machine.moneda === 'pesos' && machine.bill >= valuePesos) ||
            (machine.moneda === 'dolares' && machine.bill >= valueDolares)
        );

        if (filteredMachines.length > 0) {
            const insertFilteredValues = filteredMachines.map(({ machine, location, bill, zona, moneda }) =>
                `('${machine}', '${location}', '${bill}', NOW(), '${zona}', '${moneda}')`
            ).join(',');

            const queryFiltrado = `INSERT INTO listado_filtrado (maquina, location, bill, fecha, zona, moneda) VALUES ${insertFilteredValues}`;
            await pool.query(queryFiltrado);
        }

        console.log('Lista completa de máquinas insertada y máquinas filtradas guardadas');

        // Emitir la tabla actualizada al frontend
        const [updatedTable] = await pool.query('SELECT * FROM listado ORDER BY location ASC');
        io.emit('tableUpdate', updatedTable);

        return res.json('ok');
    } catch (error) {
        console.error('Error al insertar la lista de máquinas:', error);
        res.status(500).json({ error: 'Error al insertar la lista de máquinas' });
    }
};




export const postConfig = async (req, res) => {

    try {
        
        // console.log(req.body);
        
        const { valuePesos, valueDolares } = req.body; // Recibir los límites del cuerpo de la solicitud

        // console.log(valuePesos, valueDolares);

        
        var fecha = new Date();

        // Limpiar la tabla de configuración anterior
        const [truncate] = await pool.query('TRUNCATE config');

        // Insertar los nuevos valores en la tabla config
        const [result] = await pool.query('INSERT INTO config (fecha, limite, limiteDolar) VALUES (?, ?, ?)', [fecha, valuePesos, valueDolares]);
        
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

// Modificación en la función generarYEnviarReporteZona
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

        worksheet.addRow([]);
        worksheet.addRow([]);

        // Agregar encabezado
        const headerRow = worksheet.addRow(['Fecha', 'Máquina', 'Ubicación', 'Dinero Extraído']);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4682B4' } // Color azul para encabezados
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Aplicar bordes a la fila del encabezado
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
                cell.alignment = { vertical: 'middle', horizontal: 'center' }; // Centrar contenido
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            });
        });

        // Agregar un resumen al final del reporte
        worksheet.addRow([]);

        const totalExtraido = result.reduce((total, item) => total + item.bill, 0);
        const summaryRow = worksheet.addRow(['Total Extraído', '', '', totalExtraido]);
        summaryRow.getCell(1).font = { bold: true };
        summaryRow.getCell(4).font = { bold: true };
        summaryRow.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' },
            };
        });

        // Aplicar formato a las columnas (fijar ancho)
        worksheet.columns.forEach((column, index) => {
            if (index === 3) { // Columna "Dinero Extraído"
                column.width = 18; // Más ancho para el monto
            } else {
                column.width = 22; // Ancho para otras columnas
            }
        });

        // Guardar el archivo con un nombre específico para la zona
        const reportDir = path.join(__dirname, '../reportes');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        const reportFilePath = path.join(reportDir, `reporte_zona_${zona}_Tesorería.xlsx`);

        await workbook.xlsx.writeFile(reportFilePath);

        console.log('Reporte de zona generado exitosamente:', reportFilePath);

        // Enviar el correo con el reporte adjunto
        enviarCorreoReporte(reportFilePath, 'zona');

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
        await enviarCorreoReporte(reportFilePath, 'tecnica');

        if (res) {
            res.json({ message: 'Reporte generado correctamente' }); // Solo enviar la respuesta si existe `res`
        }

    } catch (error) {
        console.error('Error al generar y enviar el reporte:', error);
        if (res) {
            res.status(500).json({ error: 'Error al generar el reporte' });
        }
    }
};


export const generarReporteResumen = async () => {
    console.log('Generando reporte diario...');

    try {
        const [result] = await pool.query('SELECT * FROM `listado_filtrado`');

        if (result.length === 0) {
            console.log('No hay datos en listado_filtrado.');
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
        await enviarCorreoReporte(reportPath, 'diario');

    } catch (error) {
        console.error('Error al generar o enviar el reporte diario:', error);
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
            'fdotti@palermo.com.ar'
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

export const getEmpleados = async (req, res) => {
    try {
        const [empleados] = await pool.query('SELECT nombre FROM empleados');
        res.json(empleados);
    } catch (error) {
        console.error('Error al obtener empleados:', error);
        res.status(500).json({ error: 'Error al obtener empleados' });
    }
};