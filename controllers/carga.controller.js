// Carga automática del "Archivo para App" que envía Tesorería por mail.
// Power Automate detecta el mail, toma el adjunto y lo envía a
// POST /api/archivoAutomatico. El servidor lo lee, aplica el último límite
// confirmado y deja listo el listado para la app de extracciones.
import crypto from 'crypto';
import { pool } from '../db.js';
import { io } from '../index.js';
import {
    leerExcel,
    normalizarFilas,
    obtenerLimites,
    procesarListado,
    registrarCarga,
    ultimaCarga,
} from '../services/cargaListado.service.js';

// El token se configura como variable de entorno en Heroku
// (AUTO_UPLOAD_TOKEN). Nunca debe quedar escrito en el repositorio.
const tokenValido = (recibido) => {
    const esperado = process.env.AUTO_UPLOAD_TOKEN;
    if (!esperado || !recibido) return false;
    const a = Buffer.from(String(recibido));
    const b = Buffer.from(esperado);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const postArchivoAutomatico = async (req, res) => {
    if (!process.env.AUTO_UPLOAD_TOKEN) {
        return res.status(503).json({ error: 'Carga automática no configurada (falta AUTO_UPLOAD_TOKEN)' });
    }
    if (!tokenValido(req.get('x-api-key'))) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const { nombreArchivo, contenidoBase64, filas } = req.body || {};

        let machines;
        if (contenidoBase64) {
            machines = leerExcel(Buffer.from(String(contenidoBase64), 'base64'));
        } else if (Array.isArray(filas)) {
            machines = normalizarFilas(filas);
        } else {
            return res.status(400).json({ error: 'Falta contenidoBase64 (Excel) o filas' });
        }

        if (machines.length === 0) {
            return res.status(400).json({ error: 'El archivo no tiene máquinas válidas' });
        }

        // Protección: si hay una extracción en curso (listado cargado hace menos
        // de 12 hs con máquinas ya trabajadas), no la pisamos. Se puede forzar
        // enviando "forzar": true.
        if (req.body.forzar !== true) {
            const [[enCurso]] = await pool.query(
                `SELECT COUNT(*) AS trabajadas, MAX(fecha) AS fecha FROM listado_filtrado
                 WHERE finalizado IS NOT NULL AND finalizado <> '' AND finalizado <> 'No iniciado'`
            );
            const horas = enCurso.fecha ? (Date.now() - new Date(enCurso.fecha).getTime()) / 36e5 : Infinity;
            if (enCurso.trabajadas > 0 && horas < 12) {
                console.warn(`Carga automática omitida: extracción en curso (${enCurso.trabajadas} máquinas trabajadas)`);
                return res.status(409).json({
                    error: 'Hay una extracción en curso; no se reemplazó el listado',
                    maquinasTrabajadas: enCurso.trabajadas,
                });
            }
        }

        const { pesoLimit, dolarLimit } = await obtenerLimites();
        const { total, filtradas } = await procesarListado(machines, pesoLimit, dolarLimit);

        await registrarCarga({
            origen: 'automatica',
            nombreArchivo,
            maquinas: total,
            aExtraer: filtradas,
            pesoLimit,
            dolarLimit,
        });

        // Avisar a las pantallas abiertas que hay listado nuevo
        const [tabla] = await pool.query('SELECT * FROM listado_filtrado ORDER BY location ASC');
        io.emit('tableUpdate', tabla);
        io.emit('listadoCargado', { origen: 'automatica', maquinas: total, aExtraer: filtradas });

        console.log(`Carga automática OK: ${nombreArchivo || '(sin nombre)'} - ${total} máquinas, ${filtradas} a extraer (límite $${pesoLimit} / U$S ${dolarLimit})`);

        return res.json({
            status: 'success',
            maquinas: total,
            aExtraer: filtradas,
            limitePesos: pesoLimit,
            limiteDolares: dolarLimit,
        });
    } catch (error) {
        console.error('Error en la carga automática:', error);
        return res.status(500).json({ error: 'Error al procesar el archivo', details: error.message });
    }
};

export const getUltimaCarga = async (req, res) => {
    try {
        res.json(await ultimaCarga());
    } catch (error) {
        console.error('Error al obtener la última carga:', error);
        res.status(500).json({ error: 'Error al obtener la última carga' });
    }
};
