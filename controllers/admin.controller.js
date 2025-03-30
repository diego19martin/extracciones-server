// controllers/admin.controller.js - Versión corregida
import { pool } from "../db.js";
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Definir __dirname para módulos ECMAScript
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Obtiene las estadísticas generales para el dashboard de administrador
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getStats = async (req, res) => {
  try {
    // Obtener total de máquinas
    const [totalMaquinas] = await pool.query('SELECT COUNT(*) as total FROM listado');
    
    // Obtener máquinas conciliadas y pendientes
    const [conciliacionStats] = await pool.query(`
      SELECT 
        SUM(CASE WHEN finalizado = 'Completa' THEN 1 ELSE 0 END) as conciliadas,
        SUM(CASE WHEN finalizado = 'Pendiente' OR finalizado IS NULL THEN 1 ELSE 0 END) as pendientes
      FROM listado_filtrado
    `);
    
    // Obtener total de empleados
    const [totalEmpleados] = await pool.query('SELECT COUNT(*) as total FROM empleados');
    
    // Obtener datos de extracciones (en lugar de zonas)
    const [extraccionesStats] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN confirmada = 1 THEN 1 ELSE 0 END) as conciliadas,
        SUM(CASE WHEN confirmada = 0 OR confirmada IS NULL THEN 1 ELSE 0 END) as pendientes
      FROM zona_conciliacion
    `);
    
    // Obtener monto total y diferencia
    const [montoStats] = await pool.query(`
      SELECT 
        SUM(valor_contado) as montoTotal,
        SUM(valor_contado - valor_esperado) as diferenciaTotal
      FROM zona_conciliacion_detalle
    `);
    
    // Calcular porcentaje de conciliación
    const maquinasConciliadas = conciliacionStats[0].conciliadas || 0;
    const totalMaquinasFiltradas = maquinasConciliadas + (conciliacionStats[0].pendientes || 0);
    const porcentajeConciliacion = totalMaquinasFiltradas > 0 
      ? Math.round((maquinasConciliadas / totalMaquinasFiltradas) * 100) 
      : 0;
    
    // Preparar respuesta
    const stats = {
      totalMaquinas: totalMaquinas[0].total || 0,
      maquinasExtraccion: totalMaquinasFiltradas || 0,
      maquinasConciliadas: maquinasConciliadas || 0,
      maquinasPendientes: conciliacionStats[0].pendientes || 0,
      totalEmpleados: totalEmpleados[0].total || 0,
      totalZonas: extraccionesStats[0].total || 0,
      zonasConciliadas: extraccionesStats[0].conciliadas || 0,
      zonasPendientes: extraccionesStats[0].pendientes || 0,
      montoTotal: montoStats[0].montoTotal || 0,
      diferenciaTotal: montoStats[0].diferenciaTotal || 0,
      porcentajeConciliacion
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ 
      error: 'Error al obtener estadísticas', 
      details: error.message 
    });
  }
};

/**
 * Obtiene estadísticas de conciliaciones por zona
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getConciliacionesPorZona = async (req, res) => {
  try {
    // Usando la columna 'zona' desde la tabla zona_conciliacion
    const [results] = await pool.query(`
      SELECT 
        z.zona,
        COUNT(CASE WHEN d.estado = 'match' THEN 1 END) as conciliadas,
        COUNT(CASE WHEN d.estado != 'match' OR d.estado IS NULL THEN 1 END) as pendientes
      FROM 
        zona_conciliacion z
      LEFT JOIN 
        zona_conciliacion_detalle d ON z.id = d.conciliacion_id
      GROUP BY 
        z.zona
      ORDER BY 
        z.zona
    `);
    
    res.json(results);
  } catch (error) {
    console.error('Error al obtener conciliaciones por zona:', error);
    res.status(500).json({ 
      error: 'Error al obtener conciliaciones por zona', 
      details: error.message 
    });
  }
};

/**
 * Obtiene el resumen mensual para el dashboard
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getResumenMensual = async (req, res) => {
  try {
    const [results] = await pool.query(`
      SELECT 
        DATE_FORMAT(fecha, '%d/%m/%Y') as fecha,
        SUM(total_contado) as total
      FROM zona_conciliacion
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(fecha)
      ORDER BY fecha
    `);
    
    res.json(results);
  } catch (error) {
    console.error('Error al obtener resumen mensual:', error);
    res.status(500).json({ 
      error: 'Error al obtener resumen mensual', 
      details: error.message 
    });
  }
};

/**
 * Obtiene las últimas conciliaciones para el dashboard
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getUltimasConciliaciones = async (req, res) => {
  try {
    const [results] = await pool.query(`
      SELECT 
        z.id,
        z.zona,
        z.fecha,
        z.usuario,
        z.total_contado as monto,
        z.confirmada
      FROM zona_conciliacion z
      ORDER BY z.fecha DESC
      LIMIT 10
    `);
    
    res.json(results);
  } catch (error) {
    console.error('Error al obtener últimas conciliaciones:', error);
    res.status(500).json({ 
      error: 'Error al obtener últimas conciliaciones', 
      details: error.message 
    });
  }
};

/**
 * Obtiene alertas y notificaciones para el dashboard
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getAlertas = async (req, res) => {
  try {
    const alertas = [];
    
    // Buscar máquinas con grandes diferencias (más de 5000)
    const [diferenciasMaquinas] = await pool.query(`
      SELECT COUNT(*) as count
      FROM zona_conciliacion_detalle
      WHERE ABS(valor_contado - valor_esperado) > 5000
    `);
    
    if (diferenciasMaquinas[0].count > 0) {
      alertas.push({
        tipo: 'warning',
        titulo: 'Diferencias significativas',
        mensaje: `Se detectaron ${diferenciasMaquinas[0].count} máquinas con diferencias mayores a $5.000`
      });
    }
    
    // Buscar zonas pendientes por más de 24 horas
    const [zonasPendientes] = await pool.query(`
      SELECT COUNT(*) as count
      FROM zona_conciliacion
      WHERE confirmada = 0 AND fecha < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    
    if (zonasPendientes[0].count > 0) {
      alertas.push({
        tipo: 'error',
        titulo: 'Zonas pendientes',
        mensaje: `Hay ${zonasPendientes[0].count} zonas sin confirmar por más de 24 horas`
      });
    }
    
    // Verificar máquinas con mismatch
    const [mismatchMaquinas] = await pool.query(`
      SELECT COUNT(*) as count
      FROM zona_conciliacion_detalle
      WHERE estado = 'mismatch'
    `);
    
    if (mismatchMaquinas[0].count > 0) {
      alertas.push({
        tipo: 'error',
        titulo: 'Conciliaciones con error',
        mensaje: `Hay ${mismatchMaquinas[0].count} máquinas con errores de conciliación`
      });
    }
    
    // Alerta de recordatorio si hay menos del 60% de maquinas conciliadas
    const [porcentajeConciliado] = await pool.query(`
      SELECT 
        (SUM(CASE WHEN estado = 'match' THEN 1 ELSE 0 END) / COUNT(*)) * 100 as porcentaje
      FROM zona_conciliacion_detalle
    `);
    
    if (porcentajeConciliado[0].porcentaje < 60) {
      alertas.push({
        tipo: 'info',
        titulo: 'Progreso de conciliación',
        mensaje: `Solo el ${Math.round(porcentajeConciliado[0].porcentaje)}% de las máquinas han sido conciliadas`
      });
    }
    
    // También podemos agregar alertas fijas o informativas
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // Alerta para el día de cierre (por ejemplo, los viernes)
    if (dayOfWeek === 5) { // 5 es viernes
      alertas.push({
        tipo: 'info',
        titulo: 'Día de cierre',
        mensaje: 'Hoy es día de cierre semanal. Asegúrese de que todas las zonas estén conciliadas.'
      });
    }
    
    res.json(alertas);
  } catch (error) {
    console.error('Error al obtener alertas:', error);
    res.status(500).json({
      error: 'Error al obtener alertas',
      details: error.message
    });
  }
};

/**
 * Obtiene los empleados más activos para el dashboard
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getTopEmpleados = async (req, res) => {
  try {
    // Obtener los empleados por participación en conciliaciones y extracciones
    const [results] = await pool.query(`
      SELECT 
        e.nombre,
        COUNT(DISTINCT zc.id) as conciliaciones,
        COUNT(DISTINCT CASE WHEN lf.asistente1 = e.nombre OR lf.asistente2 = e.nombre THEN lf.id END) as extracciones,
        SUM(IFNULL(zc.total_contado, 0)) as monto
      FROM 
        empleados e
      LEFT JOIN 
        zona_conciliacion zc ON zc.usuario = e.nombre
      LEFT JOIN 
        listado_filtrado lf ON lf.asistente1 = e.nombre OR lf.asistente2 = e.nombre
      GROUP BY 
        e.nombre
      ORDER BY 
        conciliaciones DESC, extracciones DESC
      LIMIT 5
    `);
    
    res.json(results.map(row => ({
      ...row,
      monto: Number(row.monto) || 0,
      conciliaciones: Number(row.conciliaciones) || 0,
      extracciones: Number(row.extracciones) || 0
    })));
  } catch (error) {
    console.error('Error al obtener top empleados:', error);
    res.status(500).json({
      error: 'Error al obtener top empleados',
      details: error.message
    });
  }
};

/**
 * Obtiene el resumen por zonas para el dashboard
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getResumenPorZonas = async (req, res) => {
  try {
    const [results] = await pool.query(`
      SELECT 
        zc.zona,
        COUNT(*) as total_maquinas,
        SUM(zcd.valor_contado) as total_contado,
        SUM(zcd.valor_esperado) as total_esperado,
        SUM(zcd.valor_contado - zcd.valor_esperado) as diferencia
      FROM 
        zona_conciliacion zc
      JOIN 
        zona_conciliacion_detalle zcd ON zc.id = zcd.conciliacion_id
      GROUP BY 
        zc.zona
      ORDER BY 
        zc.zona
    `);
    
    res.json(results);
  } catch (error) {
    console.error('Error al obtener resumen por zonas:', error);
    res.status(500).json({
      error: 'Error al obtener resumen por zonas',
      details: error.message
    });
  }
};

/**
 * Genera un reporte completo de la operación
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const generarReporte = async (req, res) => {
  try {
    // Crear directorio para reportes si no existe
    const reportDir = path.join(__dirname, '../reportes');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    // Nombre del archivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `reporte_gerencial_${timestamp}.xlsx`;
    const filePath = path.join(reportDir, filename);
    
    // Crear un nuevo libro de Excel
    const workbook = new ExcelJS.Workbook();
    
    // 1. Resumen general (primera hoja)
    const statsSheet = workbook.addWorksheet('Resumen General');
    
    // Obtener estadísticas generales
    const [totalMaquinas] = await pool.query('SELECT COUNT(*) as total FROM listado');
    const [conciliacionStats] = await pool.query(`
      SELECT 
        SUM(CASE WHEN finalizado = 'Completa' THEN 1 ELSE 0 END) as conciliadas,
        SUM(CASE WHEN finalizado = 'Pendiente' OR finalizado IS NULL THEN 1 ELSE 0 END) as pendientes
      FROM listado_filtrado
    `);
    const [totalEmpleados] = await pool.query('SELECT COUNT(*) as total FROM empleados');
    const [zonasStats] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN confirmada = 1 THEN 1 ELSE 0 END) as conciliadas,
        SUM(CASE WHEN confirmada = 0 OR confirmada IS NULL THEN 1 ELSE 0 END) as pendientes
      FROM zona_conciliacion
    `);
    const [montoStats] = await pool.query(`
      SELECT 
        SUM(valor_contado) as montoTotal,
        SUM(valor_contado - valor_esperado) as diferenciaTotal
      FROM zona_conciliacion_detalle
    `);
    
    // Formatear la hoja de resumen
    statsSheet.columns = [
      { header: 'Métrica', key: 'metrica', width: 30 },
      { header: 'Valor', key: 'valor', width: 20 }
    ];
    
    // Agregar filas de resumen
    statsSheet.addRow({ metrica: 'Total Máquinas', valor: totalMaquinas[0].total || 0 });
    statsSheet.addRow({ metrica: 'Máquinas Conciliadas', valor: conciliacionStats[0].conciliadas || 0 });
    statsSheet.addRow({ metrica: 'Máquinas Pendientes', valor: conciliacionStats[0].pendientes || 0 });
    statsSheet.addRow({ metrica: 'Total Empleados', valor: totalEmpleados[0].total || 0 });
    statsSheet.addRow({ metrica: 'Total Zonas', valor: zonasStats[0].total || 0 });
    statsSheet.addRow({ metrica: 'Zonas Conciliadas', valor: zonasStats[0].conciliadas || 0 });
    statsSheet.addRow({ metrica: 'Zonas Pendientes', valor: zonasStats[0].pendientes || 0 });
    statsSheet.addRow({ metrica: 'Monto Total Contado', valor: montoStats[0].montoTotal || 0 });
    statsSheet.addRow({ metrica: 'Diferencia Total', valor: montoStats[0].diferenciaTotal || 0 });
    
    // 2. Detalle por zonas (segunda hoja)
    const zonasSheet = workbook.addWorksheet('Detalle por Zonas');
    
    // Obtener datos de zonas
    const [zonasDetalle] = await pool.query(`
      SELECT 
        zc.zona,
        COUNT(*) as total_maquinas,
        SUM(zcd.valor_contado) as total_contado,
        SUM(zcd.valor_esperado) as total_esperado,
        SUM(zcd.valor_contado - zcd.valor_esperado) as diferencia
      FROM 
        zona_conciliacion zc
      JOIN 
        zona_conciliacion_detalle zcd ON zc.id = zcd.conciliacion_id
      GROUP BY 
        zc.zona
      ORDER BY 
        zc.zona
    `);
    
    // Formatear hoja de zonas
    zonasSheet.columns = [
      { header: 'Zona', key: 'zona', width: 15 },
      { header: 'Máquinas', key: 'maquinas', width: 15 },
      { header: 'Total Contado', key: 'contado', width: 20 },
      { header: 'Total Esperado', key: 'esperado', width: 20 },
      { header: 'Diferencia', key: 'diferencia', width: 20 }
    ];
    
    // Agregar filas de detalle de zonas
    zonasDetalle.forEach(zona => {
      zonasSheet.addRow({
        zona: zona.zona,
        maquinas: zona.total_maquinas,
        contado: zona.total_contado,
        esperado: zona.total_esperado,
        diferencia: zona.diferencia
      });
    });
    
    // 3. Top empleados (tercera hoja)
    const empleadosSheet = workbook.addWorksheet('Top Empleados');
    
    // Obtener datos de empleados
    const [topEmpleados] = await pool.query(`
      SELECT 
        e.nombre,
        COUNT(DISTINCT zc.id) as conciliaciones,
        COUNT(DISTINCT CASE WHEN lf.asistente1 = e.nombre OR lf.asistente2 = e.nombre THEN lf.id END) as extracciones,
        SUM(IFNULL(zc.total_contado, 0)) as monto
      FROM 
        empleados e
      LEFT JOIN 
        zona_conciliacion zc ON zc.usuario = e.nombre
      LEFT JOIN 
        listado_filtrado lf ON lf.asistente1 = e.nombre OR lf.asistente2 = e.nombre
      GROUP BY 
        e.nombre
      ORDER BY 
        conciliaciones DESC, extracciones DESC
      LIMIT 10
    `);
    
    // Formatear hoja de empleados
    empleadosSheet.columns = [
      { header: 'Empleado', key: 'nombre', width: 30 },
      { header: 'Conciliaciones', key: 'conciliaciones', width: 20 },
      { header: 'Extracciones', key: 'extracciones', width: 20 },
      { header: 'Monto Total', key: 'monto', width: 20 }
    ];
    
    // Agregar filas de empleados
    topEmpleados.forEach(empleado => {
      empleadosSheet.addRow({
        nombre: empleado.nombre,
        conciliaciones: empleado.conciliaciones || 0,
        extracciones: empleado.extracciones || 0,
        monto: empleado.monto || 0
      });
    });
    
    // 4. Últimas conciliaciones (cuarta hoja)
    const conciliacionesSheet = workbook.addWorksheet('Últimas Conciliaciones');
    
    // Obtener últimas conciliaciones
    const [ultimasConciliaciones] = await pool.query(`
      SELECT 
        z.id,
        z.zona,
        z.fecha,
        z.usuario,
        z.total_contado as monto,
        z.confirmada
      FROM zona_conciliacion z
      ORDER BY z.fecha DESC
      LIMIT 20
    `);
    
    // Formatear hoja de conciliaciones
    conciliacionesSheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Zona', key: 'zona', width: 15 },
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Usuario', key: 'usuario', width: 20 },
      { header: 'Monto', key: 'monto', width: 20 },
      { header: 'Confirmada', key: 'confirmada', width: 15 }
    ];
    
    // Agregar filas de conciliaciones
    ultimasConciliaciones.forEach(conciliacion => {
      conciliacionesSheet.addRow({
        id: conciliacion.id,
        zona: conciliacion.zona,
        fecha: conciliacion.fecha,
        usuario: conciliacion.usuario,
        monto: conciliacion.monto,
        confirmada: conciliacion.confirmada ? 'Sí' : 'No'
      });
    });
    
    // Guardar el archivo
    await workbook.xlsx.writeFile(filePath);
    
    // Enviar respuesta con la ruta del archivo
    res.json({
      success: true,
      message: 'Reporte generado correctamente',
      filepath: `/reportes/${filename}`
    });
  } catch (error) {
    console.error('Error al generar reporte:', error);
    res.status(500).json({
      error: 'Error al generar reporte',
      details: error.message
    });
  }
};

/**
 * Obtiene datos de maquinas para visualización en mapa de calor
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getMaquinasHeatmap = async (req, res) => {
  try {
    const [results] = await pool.query(`
      SELECT 
        zc.zona,
        zcd.location,
        zcd.maquina,
        zcd.valor_contado,
        zcd.valor_esperado,
        (zcd.valor_contado - zcd.valor_esperado) as diferencia,
        zcd.estado
      FROM 
        zona_conciliacion zc
      JOIN 
        zona_conciliacion_detalle zcd ON zc.id = zcd.conciliacion_id
      ORDER BY 
        zc.zona, zcd.location
    `);
    
    // Agrupar por zona y calcular intensidad
    const heatmapData = results.reduce((acc, machine) => {
      const zona = machine.zona || 'Sin zona';
      
      if (!acc[zona]) {
        acc[zona] = [];
      }
      
      // Calcular una intensidad basada en la diferencia relativa
      const diferencia = machine.diferencia || 0;
      const expected = machine.valor_esperado || 1; // Evitar división por cero
      const intensity = Math.min(Math.abs(diferencia / expected) * 100, 100);
      
      acc[zona].push({
        id: machine.maquina,
        location: machine.location,
        value: diferencia,
        intensity: intensity,
        estado: machine.estado,
        valor_contado: machine.valor_contado,
        valor_esperado: machine.valor_esperado
      });
      
      return acc;
    }, {});
    
    res.json(heatmapData);
  } catch (error) {
    console.error('Error al obtener datos para heatmap:', error);
    res.status(500).json({
      error: 'Error al obtener datos para heatmap',
      details: error.message
    });
  }
};

/**
 * Obtiene estadísticas de rendimiento para el gerente
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 */
export const getRendimientoStats = async (req, res) => {
  try {
    // Obtener estadísticas de eficiencia de conciliación
    const [eficiencia] = await pool.query(`
      SELECT 
        AVG(CASE WHEN estado = 'match' THEN 1 ELSE 0 END) * 100 as tasa_match,
        AVG(CASE WHEN diferencia = 0 THEN 1 ELSE 0 END) * 100 as tasa_precision,
        AVG(ABS(valor_contado - valor_esperado)) as diferencia_promedio
      FROM (
        SELECT 
          estado,
          (valor_contado - valor_esperado) as diferencia,
          valor_contado,
          valor_esperado
        FROM 
          zona_conciliacion_detalle
      ) as stats
    `);
    
    // Obtener eficiencia por zonas
    const [eficienciaZonas] = await pool.query(`
      SELECT 
        zc.zona,
        COUNT(*) as total,
        SUM(CASE WHEN zcd.estado = 'match' THEN 1 ELSE 0 END) as matches,
        (SUM(CASE WHEN zcd.estado = 'match' THEN 1 ELSE 0 END) / COUNT(*)) * 100 as tasa_exito
      FROM 
        zona_conciliacion zc
      JOIN 
        zona_conciliacion_detalle zcd ON zc.id = zcd.conciliacion_id
      GROUP BY 
        zc.zona
      ORDER BY 
        tasa_exito DESC
    `);
    
    // Obtener velocidad de conciliación
    const [velocidad] = await pool.query(`
      SELECT 
        DATE_FORMAT(fecha, '%Y-%m-%d') as dia,
        COUNT(*) as conciliaciones,
        AVG(TIMESTAMPDIFF(MINUTE, fecha, fecha_confirmacion)) as tiempo_promedio
      FROM 
        zona_conciliacion
      WHERE 
        fecha > DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND fecha_confirmacion IS NOT NULL
      GROUP BY 
        DATE_FORMAT(fecha, '%Y-%m-%d')
      ORDER BY 
        dia DESC
      LIMIT 10
    `);
    
    // Preparar respuesta consolidada
    const stats = {
      eficiencia: {
        tasa_match: eficiencia[0]?.tasa_match || 0,
        tasa_precision: eficiencia[0]?.tasa_precision || 0,
        diferencia_promedio: eficiencia[0]?.diferencia_promedio || 0
      },
      eficiencia_zonas: eficienciaZonas || [],
      velocidad_conciliacion: velocidad || []
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error al obtener estadísticas de rendimiento:', error);
    res.status(500).json({
      error: 'Error al obtener estadísticas de rendimiento',
      details: error.message
    });
  }
};

