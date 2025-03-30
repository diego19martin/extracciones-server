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

// Obtener todas las zonas con su estado de confirmación
export const getZonasTesorero = async (req, res) => {
  try {
    // Consulta para obtener las zonas con sus estados de confirmación
    const [zonas] = await pool.query(`
      SELECT 
        zc.*,
        CASE 
          WHEN zc.confirmada = 1 THEN 'Confirmada'
          ELSE 'Pendiente'
        END AS estado_confirmacion
      FROM 
        zona_conciliacion zc
      ORDER BY 
        zc.fecha DESC, zc.zona ASC
    `);

    return res.status(200).json(zonas);
  } catch (error) {
    console.error('Error al obtener zonas del tesorero:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'Ocurrió un error al obtener las zonas.'
    });
  }
};
