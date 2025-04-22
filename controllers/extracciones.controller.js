import { pool } from "../db.js";
import { io } from "../index.js";
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

// Definir __dirname para módulos ECMAScript
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


export const postList = async (req, res) => {
  try {
      const { machines, valuePesos, valueDolares } = req.body;

      // Convertir a números para comparaciones
      const numValuePesos = Number(valuePesos);
      const numValueDolares = Number(valueDolares);

      // Limpiar tablas
      await pool.query('TRUNCATE listado');
      await pool.query('TRUNCATE listado_filtrado');

      console.log("Datos recibidos:", { 
        machinesCount: machines.length,
        valuePesos: numValuePesos,
        valueDolares: numValueDolares 
      });

      // Formatear e insertar todas las máquinas en "listado"
      if (machines.length > 0) {
          const insertValues = machines.map(({ machine, location, bill, zona, moneda }) =>
              `('${machine}', '${location}', '${Number(bill)}', NOW(), '${zona || '0'}', '${moneda || 'pesos'}')`
          ).join(',');

          const queryListado = `INSERT INTO listado (maquina, location, bill, fecha, zona, moneda) VALUES ${insertValues}`;
          await pool.query(queryListado);
          
          // Filtrar máquinas que cumplen con los límites
          const filteredMachines = machines.filter(machine => {
              const billValue = Number(machine.bill);
              const mType = machine.moneda || 'pesos';
              
              return (mType === 'pesos' && billValue >= numValuePesos) ||
                     (mType === 'dolares' && billValue >= numValueDolares);
          });

          console.log(`Máquinas filtradas: ${filteredMachines.length} de ${machines.length}`);

          // Insertar máquinas filtradas en "listado_filtrado"
          if (filteredMachines.length > 0) {
              const insertFilteredValues = filteredMachines.map(({ machine, location, bill, zona, moneda }) =>
                  `('${machine}', '${location}', '${Number(bill)}', NOW(), '${zona || '0'}', '${moneda || 'pesos'}')`
              ).join(',');

              const queryFiltrado = `INSERT INTO listado_filtrado (maquina, location, bill, fecha, zona, moneda) VALUES ${insertFilteredValues}`;
              await pool.query(queryFiltrado);
          }

          // Emitir la tabla actualizada al frontend
          const [updatedTable] = await pool.query('SELECT * FROM listado_filtrado ORDER BY location ASC');
          io.emit('tableUpdate', updatedTable);
      }

      return res.json({ success: true, message: 'Listado procesado correctamente' });
  } catch (error) {
      console.error('Error al insertar la lista de máquinas:', error);
      res.status(500).json({ success: false, error: 'Error al insertar la lista de máquinas' });
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

  try {
    // Buscar la máquina específica
    const [result] = await pool.query('SELECT * FROM `listado` WHERE maquina = ?', [maquina]);
    const [limite] = await pool.query('SELECT * FROM `config`');

    if (result.length > 0) {
      const loc = result[0].location || '';
      
      // Extraer el identificador de isla (primeros 4 caracteres)
      const islaId = loc.length >= 4 ? loc.slice(0, 4) : loc;
      
      console.log(`Máquina: ${maquina}, Location: ${loc}, Isla ID: ${islaId}`);
      
      const limitPesos = limite[0]?.limite || 0;
      const limitDolares = limite[0]?.limiteDolar || 1;
      let listadoFinal = [];

      // Buscar todas las máquinas de la misma isla
      let listado;
      try {
        // Mejorado para manejar casos donde location podría ser NULL o vacío
        if (islaId) {
          [listado] = await pool.query(
            'SELECT * FROM `listado` WHERE LEFT(`location`, 4) = ? ORDER BY (`location`) DESC', 
            [islaId]
          );
        } else {
          // Si no hay un ID de isla válido, devolver solo la máquina original
          listado = [result[0]];
        }
      } catch (error) {
        console.error('Error ejecutando la query de listado filtrada por location:', error);
        throw error;
      }

      console.log(`Encontradas ${listado.length} máquinas en la isla ${islaId}`);

      // Filtrar las máquinas según los límites
      for (let i = 0; i < listado.length; i++) {
        const machine = listado[i];
        if ((machine.moneda === 'pesos' && machine.bill >= limitPesos) ||
            (machine.moneda === 'dolares' && machine.bill >= limitDolares)) {
          
          // Validar que los valores sean correctos antes de agregar al listado
          if (machine.maquina && machine.location) {
            const listadoExtraer = {
              fecha: machine.fecha,
              maquina: machine.maquina,
              location: machine.location,
              finalizado: machine.finalizado,
              id: machine.idlistado,
              zona: machine.zona,
              isla: islaId // Agregamos explícitamente el identificador de isla
            };
            listadoFinal.push(listadoExtraer);
          }
        }
      }

      console.log(`Filtradas ${listadoFinal.length} máquinas que cumplen los límites (Pesos: ${limitPesos}, Dólares: ${limitDolares})`);

      // Devolver el listado filtrado con información de la isla
      res.json(listadoFinal);
    } else {
      res.json([]); // Devolver un array vacío si no se encuentra la máquina
    }
  } catch (error) {
    console.error('Error al obtener la información:', error);
    res.status(500).json({ error: 'Error al obtener la información' });
  }
};


export const postSelect = async (req, res) => {
  try {
      // Extraer todos los campos del body
      const { finalizado, asistente1, asistente2, comentario, maquina, zona, headercard } = req.body;

      console.log('Datos recibidos en postSelect:', {
          finalizado, 
          asistente1: asistente1 || "No especificado", 
          asistente2: asistente2 || "No especificado", 
          comentario: comentario || "Sin comentario", 
          maquina, 
          zona, 
          headercard: headercard || "No especificado"
      });

      // Verificar que maquina existe
      if (!maquina) {
          return res.status(400).json({
              success: false,
              error: 'Parámetros incompletos',
              message: 'El número de máquina es obligatorio'
          });
      }

      // Consultar si la máquina existe en la base de datos
      const [existingMachine] = await pool.query(
          'SELECT * FROM listado_filtrado WHERE maquina = ?',
          [maquina]
      );

      if (existingMachine.length === 0) {
          return res.status(404).json({
              success: false,
              error: 'Máquina no encontrada',
              message: `La máquina ${maquina} no existe en el listado filtrado`
          });
      }

      // Actualizar la tabla listado_filtrado (única tabla a actualizar)
      let updateFields = [];
      let updateValues = [];

      // Verificar y agregar cada campo para listado_filtrado
      if (finalizado !== undefined) {
          updateFields.push('`finalizado`=?');
          updateValues.push(finalizado);
      }

      if (asistente1 !== undefined) {
          updateFields.push('`asistente1`=?');
          updateValues.push(asistente1);
      }

      if (asistente2 !== undefined) {
          updateFields.push('`asistente2`=?');
          updateValues.push(asistente2);
      }

      if (comentario !== undefined) {
          updateFields.push('`comentario`=?');
          updateValues.push(comentario);
      }

      if (headercard !== undefined) {
          updateFields.push('`headercard`=?');
          updateValues.push(headercard);
      }

      // Agregar el ID de máquina al final de los valores
      updateValues.push(maquina);

      // Ejecutar la consulta de actualización para listado_filtrado
      if (updateFields.length > 0) {
          const updateQuery = `UPDATE listado_filtrado SET ${updateFields.join(', ')} WHERE maquina = ?`;
          console.log('Consulta para listado_filtrado:', updateQuery);
          console.log('Valores:', updateValues);

          await pool.query(updateQuery, updateValues);
      }

      // Emitir la tabla actualizada a los clientes conectados
      const [updatedTable] = await pool.query('SELECT * FROM listado_filtrado ORDER BY location ASC');
      io.emit('tableUpdate', updatedTable);

      // Verificar si todas las máquinas en la zona han sido extraídas o marcadas como pendientes
      if (zona) {
          const [result] = await pool.query(
              'SELECT COUNT(*) AS maquinasPendientes FROM listado_filtrado WHERE zona = ? AND (finalizado IS NULL OR finalizado != "Completa" AND finalizado != "Pendiente")',
              [zona]
          );

          if (result[0].maquinasPendientes === 0) {
              console.log(`Todas las máquinas en la zona ${zona} han sido extraídas o marcadas como pendientes.`);
              try {
                  await generarYEnviarReporteZona(zona);
              } catch (reportError) {
                  console.error('Error al generar reporte de zona:', reportError);
              }

              const [generalResult] = await pool.query(
                  'SELECT COUNT(*) AS maquinasPendientes FROM listado_filtrado WHERE finalizado IS NULL OR finalizado NOT IN ("Completa", "Pendiente")'
              );

              if (generalResult[0].maquinasPendientes === 0) {
                  console.log('Todas las máquinas han sido extraídas o marcadas como pendientes.');
                  try {
                      await generarYEnviarReporte();
                  } catch (reportError) {
                      console.error('Error al generar reporte general:', reportError);
                  }
              }
          }
      }

      // Respuesta exitosa
      return res.json({
          success: true,
          message: 'Registro actualizado correctamente',
          maquina: maquina,
          finalizado: finalizado,
          headercard: headercard || null,
          asistente1: asistente1 || null,
          asistente2: asistente2 || null
      });

  } catch (error) {
      console.error('Error al actualizar el registro:', error);
      return res.status(500).json({ 
          success: false,
          error: 'Error al actualizar el registro',
          message: error.message || 'Ocurrió un error interno del servidor',
          details: error.toString()
      });
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
      // Cambiado: usamos ORDER BY fecha en lugar de id
      const [result] = await pool.query('SELECT * FROM `config` ORDER BY fecha DESC LIMIT 1');
      
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

// Nuevas funciones para integración con Dashboard

export const getBulkMachinesExtraction = async (req, res) => {
  try {
    const { machines } = req.body;
    
    if (!machines || !Array.isArray(machines) || machines.length === 0) {
      return res.status(400).json({ 
        error: 'Formato de solicitud inválido',
        message: 'Se requiere un array de IDs de máquinas'
      });
    }
    
    // Crear consulta para múltiples máquinas
    const placeholders = machines.map(() => '?').join(',');
    const query = `SELECT * FROM listado_filtrado WHERE maquina IN (${placeholders})`;
    
    const [result] = await pool.query(query, machines);
    
    // Crear un mapa para acceso más rápido
    const machineMap = {};
    result.forEach(machine => {
      machineMap[machine.maquina] = machine;
    });
    
    res.json(machineMap);
  } catch (error) {
    console.error('Error al buscar datos de extracción en bloque:', error);
    res.status(500).json({ error: 'Error al buscar datos de extracción en bloque' });
  }
};

export const uploadAndProcessFiles = async (req, res) => {
  try {
    // Verificar que ambos archivos estén presentes
    if (!req.files || !req.files.datFile || !req.files.xlsFile) {
      return res.status(400).json({ 
        success: false, 
        message: 'Faltan archivos necesarios (DAT y/o XLS)' 
      });
    }

    const datFile = req.files.datFile;
    const xlsFile = req.files.xlsFile;
    
    // Crear directorio para archivos temporales si no existe
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Guardar archivos localmente para procesamiento
    const datFilePath = path.join(tempDir, datFile.name);
    const xlsFilePath = path.join(tempDir, xlsFile.name);
    
    await fsPromises.writeFile(datFilePath, datFile.data);
    await fsPromises.writeFile(xlsFilePath, xlsFile.data);
    
    // Procesar el archivo DAT
    const datContent = await fsPromises.readFile(datFilePath, 'utf8');
    const datData = processDatFile(datContent);
    
    // Procesar el archivo XLS
    const xlsBuffer = await fsPromises.readFile(xlsFilePath);
    const xlsData = processXlsFile(xlsBuffer);
    
    // Comparar datos y obtener resultados
    const comparisonResults = await compareData(datData, xlsData);
    
    // Limpiar archivos temporales
    await fsPromises.unlink(datFilePath);
    await fsPromises.unlink(xlsFilePath);
    
    // Devolver resultados al cliente
    res.json({
      success: true,
      data: comparisonResults
    });
    
  } catch (error) {
    console.error('Error al procesar archivos:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al procesar los archivos',
      error: error.message
    });
  }
};

// Función para procesar el archivo DAT
function processDatFile(content) {
  const lines = content.split('\n');
  
  // Extraer los encabezados (primera línea que comienza con H)
  const headerLine = lines.find(line => line.startsWith('H;'));
  if (!headerLine) {
    throw new Error('No se encontró la línea de encabezado (H) en el archivo DAT');
  }
  
  const headerParts = headerLine.split(';');
  
  // Denominaciones de billetes según el encabezado
  const denominaciones = [
    parseInt(headerParts[5]) || 20,
    parseInt(headerParts[6]) || 50,
    parseInt(headerParts[7]) || 100,
    parseInt(headerParts[8]) || 200,
    parseInt(headerParts[9]) || 500,
    parseInt(headerParts[10]) || 1000,
    parseInt(headerParts[11]) || 2000,
    parseInt(headerParts[12]) || 10000
  ];
  
  // Extraer los datos de las líneas que comienzan con 'D;'
  const machineData = lines
    .filter(line => line.startsWith('D;'))
    .map(line => {
      const parts = line.split(';');
      if (parts.length < 21) return null; // Verificar que haya suficientes datos
      
      // Billetes físicos (columnas 5-12)
      let totalFisico = 0;
      const billetesFisicos = {};
      for (let i = 0; i < 8; i++) {
        const cantidad = parseInt(parts[i + 5]) || 0;
        const valor = denominaciones[i];
        billetesFisicos[`B${valor}`] = cantidad;
        totalFisico += cantidad * valor;
      }
      
      // Billetes virtuales (columnas 13-20)
      let totalVirtual = 0;
      const billetesVirtuales = {};
      for (let i = 0; i < 8; i++) {
        const cantidad = parseInt(parts[i + 13]) || 0;
        const valor = denominaciones[i];
        billetesVirtuales[`IM${valor}`] = cantidad;
        totalVirtual += cantidad * valor;
      }
      
      return {
        headercard: parts[1],
        machineId: parts[2],
        date: parts[3],
        time: parts[4],
        billetesFisicos,
        billetesVirtuales,
        totalFisico,
        totalVirtual,
        totalCounted: totalFisico + totalVirtual
      };
    })
    .filter(item => item !== null);
    
  return machineData;
}

// Función para procesar el archivo XLS
function processXlsFile(buffer) {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);
  
  // Intentar detectar las columnas automáticamente
  let machineIdField = '';
  let valueField = '';
  let locationField = '';
  let zoneField = '';
  let headerCardField = '';
  
  // Si hay al menos una fila, examinar sus propiedades
  if (jsonData.length > 0) {
    const firstRow = jsonData[0];
    const headers = Object.keys(firstRow);
    
    // Buscar encabezados comunes
    for (const header of headers) {
      const headerLower = header.toLowerCase();
      
      if (headerLower.includes('maq') || headerLower.includes('machine') || headerLower.includes('id')) {
        machineIdField = header;
      } else if (headerLower.includes('val') || headerLower.includes('monto') || headerLower.includes('amount') || headerLower.includes('total')) {
        valueField = header;
      } else if (headerLower.includes('loc') || headerLower.includes('ubic')) {
        locationField = header;
      } else if (headerLower.includes('zona') || headerLower.includes('zone') || headerLower.includes('area')) {
        zoneField = header;
      } else if (headerLower.includes('serie') || headerLower.includes('header') || headerLower.includes('card')) {
        headerCardField = header;
      }
    }
    
    // Si no se detectaron automáticamente, usar los primeros campos disponibles
    if (!machineIdField && headers.length > 0) machineIdField = headers[0];
    if (!valueField && headers.length > 1) valueField = headers[1];
    if (!locationField && headers.length > 2) locationField = headers[2];
    if (!zoneField && headers.length > 3) zoneField = headers[3];
  }
  
  // Procesar y normalizar los datos
  return jsonData.map(row => {
    // Intentar obtener el ID de la máquina
    let machineId = '';
    if (machineIdField && row[machineIdField] !== undefined) {
      machineId = row[machineIdField].toString().trim();
    } else {
      // Buscar cualquier campo que pueda contener un ID de máquina
      for (const field in row) {
        if (field.toLowerCase().includes('maq') || field.toLowerCase().includes('machine') || field.toLowerCase().includes('id')) {
          machineId = row[field].toString().trim();
          break;
        }
      }
      
      // Si aún no hay ID, probar con la primera propiedad
      if (!machineId && Object.keys(row).length > 0) {
        machineId = row[Object.keys(row)[0]].toString().trim();
      }
    }
    
    // Obtener el número de serie si está disponible
    let headercard = '';
    if (headerCardField && row[headerCardField] !== undefined) {
      headercard = row[headerCardField].toString().trim();
    } else {
      // Buscar cualquier campo que pueda contener un número de serie
      for (const field in row) {
        if (field.toLowerCase().includes('serie') || field.toLowerCase().includes('header') || field.toLowerCase().includes('card')) {
          headercard = row[field].toString().trim();
          break;
        }
      }
    }
    
    // Obtener el valor esperado
    let expectedAmount = 0;
    if (valueField && row[valueField] !== undefined) {
      expectedAmount = parseFloat(row[valueField]) || 0;
    } else {
      // Buscar cualquier campo que parezca ser un valor monetario
      for (const field in row) {
        if (field.toLowerCase().includes('val') || field.toLowerCase().includes('monto') || 
            field.toLowerCase().includes('amount') || field.toLowerCase().includes('total')) {
          expectedAmount = parseFloat(row[field]) || 0;
          break;
        }
      }
      
      // Si aún no hay valor y hay al menos dos campos, probar con el segundo
      if (expectedAmount === 0 && Object.keys(row).length > 1) {
        expectedAmount = parseFloat(row[Object.keys(row)[1]]) || 0;
      }
    }
    
    // Obtener ubicación y zona
    let location = '';
    if (locationField && row[locationField] !== undefined) {
      location = row[locationField].toString().trim();
    }
    
    let zona = '';
    if (zoneField && row[zoneField] !== undefined) {
      zona = row[zoneField].toString().trim();
    }
    
    return {
      machineId,
      headercard,
      expectedAmount,
      location,
      zona
    };
  }).filter(item => item.machineId); // Filtrar elementos sin ID de máquina
}

// Función para comparar datos y obtener los datos de la BD
async function compareData(datData, xlsData) {
  // Mapeo para hacer seguimiento de las máquinas del archivo XLS
  const xlsMachineMap = {};
  const results = [];
  let totalExpected = 0;
  let totalCounted = 0;
  let matchingCount = 0;
  let nonMatchingCount = 0;
  let missingCount = 0;
  let extraCount = 0;
  
  // Primero procesamos los datos de los archivos XLS
  xlsData.forEach(item => {
    const normalizedId = item.machineId.toString().trim();
    xlsMachineMap[normalizedId] = {
      ...item,
      found: false
    };
    totalExpected += item.expectedAmount || 0;
  });
  
  // Obtener todos los IDs de las máquinas para buscar en la base de datos
  const allMachineIds = [...new Set([
    ...datData.map(item => item.machineId.toString().trim()),
    ...xlsData.map(item => item.machineId.toString().trim())
  ])];
  
  // Consultar la base de datos para todas las máquinas de una sola vez
  const placeholders = allMachineIds.map(() => '?').join(',');
  const query = `SELECT * FROM listado_filtrado WHERE maquina IN (${placeholders})`;
  const [dbMachines] = await pool.query(query, allMachineIds);
  
  // Crear un mapa para acceso más rápido a los datos de la BD
  const dbMachineMap = {};
  dbMachines.forEach(machine => {
    dbMachineMap[machine.maquina] = machine;
  });
  
  // Comparamos cada máquina del archivo DAT con las del XLS
  datData.forEach(datItem => {
    const normalizedId = datItem.machineId.toString().trim();
    const xlsItem = xlsMachineMap[normalizedId];
    const dbItem = dbMachineMap[normalizedId];
    
    if (xlsItem) {
      // Máquina encontrada en ambos archivos
      xlsItem.found = true;
      const difference = datItem.totalCounted - xlsItem.expectedAmount;
      const match = Math.abs(difference) < 1; // Tolerancia de 1 peso
      
      if (match) {
        matchingCount++;
      } else {
        nonMatchingCount++;
      }
      
      results.push({
        machineId: normalizedId,
        headercard: datItem.headercard,
        location: xlsItem.location || 'Sin ubicación',
        zona: xlsItem.zona || '',
        expectedAmount: xlsItem.expectedAmount || 0,
        countedAmount: datItem.totalCounted || 0,
        countedPhysical: datItem.totalFisico || 0,
        countedVirtual: datItem.totalVirtual || 0,
        difference,
        match,
        status: match ? 'match' : 'mismatch',
        date: datItem.date,
        time: datItem.time,
        billetesFisicos: datItem.billetesFisicos,
        billetesVirtuales: datItem.billetesVirtuales,
        dbData: dbItem || null
      });
      
      totalCounted += datItem.totalCounted || 0;
    } else {
      // Máquina en DAT pero no en XLS
      extraCount++;
      results.push({
        machineId: normalizedId,
        headercard: datItem.headercard,
        location: 'Desconocida',
        zona: 'Desconocida',
        expectedAmount: 0,
        countedAmount: datItem.totalCounted || 0,
        countedPhysical: datItem.totalFisico || 0,
        countedVirtual: datItem.totalVirtual || 0,
        difference: datItem.totalCounted,
        match: false,
        status: 'extra',
        date: datItem.date,
        time: datItem.time,
        billetesFisicos: datItem.billetesFisicos,
        billetesVirtuales: datItem.billetesVirtuales,
        dbData: dbItem || null
      });
      
      totalCounted += datItem.totalCounted || 0;
    }
  });
  
  // Revisar máquinas que están en XLS pero no en DAT
  Object.entries(xlsMachineMap).forEach(([key, item]) => {
    if (!item.found) {
      // Máquina en XLS pero no en DAT
      missingCount++;
      const dbItem = dbMachineMap[key];
      
      results.push({
        machineId: item.machineId,
        headercard: item.headercard || '',
        location: item.location || 'Sin ubicación',
        zona: item.zona || '',
        expectedAmount: item.expectedAmount || 0,
        countedAmount: 0,
        countedPhysical: 0,
        countedVirtual: 0,
        difference: -item.expectedAmount,
        match: false,
        status: 'missing',
        date: '',
        time: '',
        billetesFisicos: {},
        billetesVirtuales: {},
        dbData: dbItem || null
      });
    }
  });
  
  // Ordenar los resultados
  const sortedResults = results.sort((a, b) => {
    // Primero las discrepancias, luego las faltantes, luego las extra, finalmente las que coinciden
    if (a.status !== b.status) {
      if (a.status === 'mismatch') return -1;
      if (b.status === 'mismatch') return 1;
      if (a.status === 'missing') return -1;
      if (b.status === 'missing') return 1;
      if (a.status === 'extra') return -1;
      if (b.status === 'extra') return 1;
    }
    return a.machineId.localeCompare(b.machineId);
  });
  
  return {
    results: sortedResults,
    summary: {
      totalExpected,
      totalCounted,
      matchingMachines: matchingCount,
      nonMatchingMachines: nonMatchingCount,
      missingMachines: missingCount,
      extraMachines: extraCount
    }
  };
}

// Función para generar y guardar un reporte Excel
export const generateComparisonReport = async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data || !data.results || !data.summary) {
      return res.status(400).json({
        success: false,
        message: 'Datos insuficientes para generar el reporte'
      });
    }
    
    // Crear directorio para reportes si no existe
    const reportDir = path.join(__dirname, '../reportes');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    // Crear un nuevo workbook
    const workbook = new ExcelJS.Workbook();
    
    // Añadir hoja de resultados detallados
    const worksheet = workbook.addWorksheet('Resultados');
    
    // Definir encabezados
    worksheet.columns = [
      { header: 'Máquina', key: 'machineId', width: 12 },
      { header: 'Headercard', key: 'headercard', width: 15 },
      { header: 'Ubicación', key: 'location', width: 15 },
      { header: 'Zona', key: 'zona', width: 10 },
      { header: 'Esperado ($)', key: 'expectedAmount', width: 15 },
      { header: 'Contado Físico ($)', key: 'countedPhysical', width: 18 },
      { header: 'Contado Virtual ($)', key: 'countedVirtual', width: 18 },
      { header: 'Total Contado ($)', key: 'countedAmount', width: 18 },
      { header: 'Diferencia ($)', key: 'difference', width: 15 },
      { header: 'Estado', key: 'status', width: 15 },
      { header: 'Registrado en BD', key: 'inDb', width: 15 },
      { header: 'Bill en BD ($)', key: 'dbBill', width: 15 },
      { header: 'Estado en BD', key: 'dbStatus', width: 15 }
    ];
    
    // Añadir datos a la hoja de resultados
    data.results.forEach(row => {
      const dbData = row.dbData || {};
      
      worksheet.addRow({
        machineId: row.machineId,
        headercard: row.headercard || '',
        location: row.location || '',
        zona: row.zona || '',
        expectedAmount: row.expectedAmount || 0,
        countedPhysical: row.countedPhysical || 0,
        countedVirtual: row.countedVirtual || 0,
        countedAmount: row.countedAmount || 0,
        difference: row.difference || 0,
        status: row.status === 'match' ? 'Coincide' : 
                row.status === 'mismatch' ? 'No coincide' : 
                row.status === 'missing' ? 'Faltante' : 'Extra',
        inDb: dbData.id ? 'Sí' : 'No',
        dbBill: dbData.bill || 0,
        dbStatus: dbData.finalizado || 'No registrado'
      });
    });
    
    // Formatear la hoja de resultados
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Añadir hoja de resumen
    const summarySheet = workbook.addWorksheet('Resumen');
    
    // Añadir encabezados y datos de resumen
    summarySheet.columns = [
      { header: 'Concepto', key: 'concepto', width: 25 },
      { header: 'Valor', key: 'valor', width: 15 }
    ];
    
    summarySheet.addRow({ concepto: 'Total Esperado', valor: data.summary.totalExpected });
    summarySheet.addRow({ concepto: 'Total Contado', valor: data.summary.totalCounted });
    summarySheet.addRow({ concepto: 'Diferencia', valor: data.summary.totalCounted - data.summary.totalExpected });
    summarySheet.addRow({ concepto: 'Máquinas Coincidentes', valor: data.summary.matchingMachines });
    summarySheet.addRow({ concepto: 'Máquinas No Coincidentes', valor: data.summary.nonMatchingMachines });
    summarySheet.addRow({ concepto: 'Máquinas Faltantes', valor: data.summary.missingMachines });
    summarySheet.addRow({ concepto: 'Máquinas Extra', valor: data.summary.extraMachines });
    summarySheet.addRow({ concepto: 'Total Máquinas', valor: data.summary.matchingMachines + data.summary.nonMatchingMachines + data.summary.missingMachines + data.summary.extraMachines });
    
    // Formatear la hoja de resumen
    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Guardar el archivo Excel
    const date = new Date().toISOString().slice(0, 10);
    const reportPath = path.join(reportDir, `Reporte_Comparacion_${date}.xlsx`);
    
    await workbook.xlsx.writeFile(reportPath);
    
    // Retornar la ubicación del reporte generado
    res.json({
      success: true,
      reportPath: reportPath,
      message: 'Reporte generado exitosamente'
    });
    
  } catch (error) {
    console.error('Error al generar el reporte:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar el reporte',
      error: error.message
    });
  }
};