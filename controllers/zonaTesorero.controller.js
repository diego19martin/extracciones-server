// controllers/zonaTesorero.controller.js
import { pool } from "../db.js";
import { io } from "../index.js";

// Confirmar la recepción de una zona por el tesorero
export const confirmarZonaTesorero = async (req, res) => {
  try {
    const { 
      zona_id, 
      usuario, 
      comentario, 
      fecha_confirmacion 
    } = req.body;

    // Verificar que la zona exista
    const [zonaExists] = await pool.query('SELECT * FROM zona_conciliacion WHERE id = ?', [zona_id]);
    
    if (zonaExists.length === 0) {
      return res.status(404).json({ 
        error: 'Zona no encontrada',
        message: 'La zona que intentas confirmar no existe en el sistema.'
      });
    }

    // Actualizar el estado de confirmación de la zona
    // Nota: No usamos usuario_confirmacion ya que no existe la columna
    const [result] = await pool.query(
      'UPDATE zona_conciliacion SET confirmada = 1, comentarios = ?, fecha_confirmacion = ? WHERE id = ?',
      [comentario, fecha_confirmacion, zona_id]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({ 
        error: 'Error al confirmar zona',
        message: 'No se pudo actualizar la información en la base de datos.'
      });
    }

    // Opcionalmente, guarda la información del usuario en un log o en otra tabla
    console.log(`Zona ${zona_id} confirmada por usuario: ${usuario}`);

    // Obtener la zona actualizada para enviarla en la respuesta
    const [updatedZona] = await pool.query('SELECT * FROM zona_conciliacion WHERE id = ?', [zona_id]);

    // Notificar a todos los clientes conectados sobre la confirmación
    io.emit('zonaConfirmada', updatedZona[0]);

    return res.status(200).json({
      success: true,
      message: 'Zona confirmada con éxito',
      data: updatedZona[0]
    });
    
  } catch (error) {
    console.error('Error al confirmar zona del tesorero:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'Ocurrió un error al procesar la solicitud.'
    });
  }
};


export const getZonasTesorero = async (req, res) => {
  try {
    // Extraer explícitamente los parámetros de la consulta
    const { fecha, fecha_confirmacion } = req.query;
    
    console.log('Filtros recibidos en getZonasTesorero:', { fecha, fecha_confirmacion });

    // Inicializar la consulta básica
    let query = `
  SELECT zc.*, 
         CASE WHEN zc.confirmada = 1 THEN 'Confirmada' ELSE 'Pendiente' END AS estado_confirmacion
  FROM zona_conciliacion zc
  WHERE 1=1
`;

const params = [];
if (fecha_confirmacion) {
  // sólo traer registros cuya fecha_confirmacion coincida
  query += ` AND DATE(zc.fecha_confirmacion) = ?`;
  params.push(fecha_confirmacion);
} else if (fecha) {
  // o, si no hay fecha_confirmacion, filtrar por la fecha del registro
  query += ` AND DATE(zc.fecha) = ?`;
  params.push(fecha);
}

query += ` ORDER BY zc.fecha DESC, zc.zona ASC`;

const [zonas] = await pool.query(query, params);

    
    console.log(`Encontradas ${zonas.length} zonas con los filtros aplicados`);
    
    return res.status(200).json(zonas);
  } catch (error) {
    console.error('Error al obtener zonas del tesorero:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'Ocurrió un error al obtener las zonas.'
    });
  }
};

// Método mejorado para obtener el resumen del tesorero
export const obtenerResumenTesorero = async (req, res) => {
  try {
    const { fecha_confirmacion } = req.query;
    
    console.log('Filtros recibidos en obtenerResumenTesorero:', { fecha_confirmacion });

    // Primero verificar si hay zonas confirmadas para esta fecha
    let queryZonasConfirmadas = `
      SELECT COUNT(*) as total
      FROM zona_conciliacion
      WHERE confirmada = 1
    `;
    
    let params = [];
    
    if (fecha_confirmacion) {
      queryZonasConfirmadas += ` AND DATE(fecha_confirmacion) = ?`;
      params.push(fecha_confirmacion);
    }
    
    const [zonasConfirmadas] = await pool.query(queryZonasConfirmadas, params);
    const totalZonasConfirmadas = zonasConfirmadas[0].total;
    
    // Si no hay zonas confirmadas para esta fecha y se proporcionó un filtro de fecha,
    // devolver resumen con ceros
    if (totalZonasConfirmadas === 0 && fecha_confirmacion) {
      return res.status(200).json({
        zonas_confirmadas: 0,
        total: 0,
        conciliadas: 0,
        ultima_actualizacion: new Date().toLocaleString()
      });
    }
    
    // Si hay zonas confirmadas o no se especificó fecha, continuar con la consulta normal
    let queryMaquinas = `
      SELECT COUNT(*) as total
      FROM maquinas_tesorero
    `;
    
    let queryMaquinasConciliadas = `
      SELECT COUNT(*) as total
      FROM maquinas_tesorero
      WHERE conciliado = 1
    `;
    
    // Si hay fecha de confirmación, aplicar filtro
    if (fecha_confirmacion) {
      const [zonasIds] = await pool.query(`
        SELECT zona FROM zona_conciliacion 
        WHERE confirmada = 1 
        AND DATE(fecha_confirmacion) = ?
      `, [fecha_confirmacion]);
      
      if (zonasIds.length > 0) {
        const zonas = zonasIds.map(z => z.zona);
        const zonasPlaceholder = zonas.map(() => '?').join(',');
        
        queryMaquinas += ` WHERE zona IN (${zonasPlaceholder})`;
        queryMaquinasConciliadas += ` AND zona IN (${zonasPlaceholder})`;
        
        // Agregar los parámetros para cada consulta
        const [maquinas] = await pool.query(queryMaquinas, zonas);
        const [maquinasConciliadas] = await pool.query(queryMaquinasConciliadas, zonas);
        
        return res.status(200).json({
          zonas_confirmadas: totalZonasConfirmadas,
          total: maquinas[0].total,
          conciliadas: maquinasConciliadas[0].total,
          ultima_actualizacion: new Date().toLocaleString()
        });
      } else {
        // Si no hay zonas confirmadas para esta fecha, devolver ceros
        return res.status(200).json({
          zonas_confirmadas: 0,
          total: 0,
          conciliadas: 0,
          ultima_actualizacion: new Date().toLocaleString()
        });
      }
    }
    
    // Si no hay filtro de fecha, devolver totales generales
    const [maquinas] = await pool.query(queryMaquinas);
    const [maquinasConciliadas] = await pool.query(queryMaquinasConciliadas);
    
    return res.status(200).json({
      zonas_confirmadas: totalZonasConfirmadas,
      total: maquinas[0].total,
      conciliadas: maquinasConciliadas[0].total,
      ultima_actualizacion: new Date().toLocaleString()
    });
    
  } catch (error) {
    console.error('Error al obtener resumen del tesorero:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'Ocurrió un error al obtener el resumen.'
    });
  }
};