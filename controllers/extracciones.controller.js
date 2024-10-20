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

        // Filtrar las máquinas según los límites proporcionados
        const filteredMachines = machines.filter(machine => 
            (machine.moneda === 'pesos' && machine.bill >= valuePesos) ||
            (machine.moneda === 'dolares' && machine.bill >= valueDolares)
        );

        if (filteredMachines.length === 0) {
            return res.status(400).json({ error: 'No hay máquinas que cumplan con los límites seleccionados' });
        }

        // Limpiar la tabla de configuración anterior
        const [truncate] = await pool.query('TRUNCATE listado');

        const insertValues = filteredMachines.map(({ machine, location, bill, zona, moneda }) =>
            `('${machine}', '${location}', '${bill}', NOW(), '${zona}', '${moneda}')`
        ).join(',');

        const query = `INSERT INTO listado (maquina, location, bill, fecha, zona, moneda) VALUES ${insertValues}`;
        await pool.query(query);

        console.log('Máquinas filtradas insertadas');

        // Emitir la tabla actualizada al frontend
        const [updatedTable] = await pool.query('SELECT * FROM `listado` ORDER BY location ASC');
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

    console.log('getinfo');
    

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
            res.json('N');
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
            'UPDATE listado SET `finalizado`=?, `asistente1`=?, `asistente2`=?, `comentario`=? WHERE `maquina` = ?',
            [finalizado, asistente1, asistente2, comentario, maquina]
        );

        // Emitir la tabla actualizada a los clientes conectados
        const [updatedTable] = await pool.query('SELECT * FROM `listado` ORDER BY location ASC');
        io.emit('tableUpdate', updatedTable);

        // Verificar si todas las máquinas en la zona han sido extraídas o marcadas como pendientes
        const [result] = await pool.query(
            'SELECT COUNT(*) AS maquinasPendientes FROM listado WHERE zona = ? AND (finalizado IS NULL OR finalizado != "Completa" AND finalizado != "Pendiente")',
            [zona]
        );

        if (result[0].maquinasPendientes === 0) {
            console.log(`Todas las máquinas en la zona ${zona} han sido extraídas o marcadas como pendientes. Generando reporte para el tesorero.`);
            await generarYEnviarReporteZona(zona);

             // Verificar si todas las máquinas han sido extraídas o marcadas como pendientes (para el reporte general a técnicos)
        const [generalResult] = await pool.query(
            'SELECT COUNT(*) AS maquinasPendientes FROM listado WHERE finalizado IS NULL OR finalizado NOT IN ("Completa", "Pendiente")'
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
        const [result] = await pool.query('SELECT fecha, maquina, location, bill FROM listado WHERE zona = ? AND finalizado = "Completa"', [zona]);

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
        let [result] = await pool.query('SELECT fecha, maquina, location, comentario, finalizado FROM `listado` WHERE comentario IS NOT NULL AND comentario != ""');

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

        res.json({ message: 'Reporte generado correctamente' }); // Asegúrate de enviar una respuesta

        // Enviar el correo con el reporte adjunto
        await enviarCorreoReporte(reportFilePath, 'tecnica');

       

    } catch (error) {
        console.error('Error al generar y enviar el reporte:', error);
    }

};


const enviarCorreoReporte = async (filePath, tipoReporte) => {
    try {

        // Configurar el asunto dependiendo del tipo de reporte
        const asunto = tipoReporte === 'zona' ? 'Reporte de Extracciones por Zona' : 'Reporte de Extracciones de Máquinas Técnica';
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

        // Configurar los detalles del correo
        const mailOptions = {
            from: 'reportes@dadesarrollos.com', // Dirección de correo de origen
            to: 'dargonz@palermo.com.ar, jzuazo@palermo.com.ar', // Destinatario del correo
            subject: asunto,
            text: 'Adjunto encontrarás el reporte extracciones.',
            attachments: [
                {
                    filename: path.basename(filePath),
                    path: filePath,
                },
            ],
        };

        // Enviar el correo
        await transporter.sendMail(mailOptions);
        console.log('Correo enviado exitosamente.');
    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
};