// Lógica compartida para cargar el listado de máquinas, tanto desde la carga
// manual (pantalla /conversion) como desde la carga automática (mail
// "Archivo para App" de Tesorería, recibido vía Power Automate).
import XLSX from 'xlsx';
import { pool } from '../db.js';

// Encabezados aceptados para cada campo (el archivo de Tesorería viene en
// castellano; el formato histórico de la app usa machine/location/bill/...)
const ALIAS = {
    machine: ['machine', 'maquina', 'máquina', 'nro maquina', 'nro máquina'],
    location: ['location', 'ubicacion', 'ubicación'],
    bill: ['bill', 'importe', 'monto', 'stacker'],
    zona: ['zona'],
    moneda: ['moneda'],
};

const normalizarClave = (k) => String(k || '').trim().toLowerCase();

const buscarValor = (fila, campo) => {
    const claves = Object.keys(fila);
    const clave = claves.find((k) => ALIAS[campo].includes(normalizarClave(k)));
    return clave === undefined ? undefined : fila[clave];
};

const normalizarMoneda = (valor) => {
    const m = normalizarClave(valor);
    if (m.startsWith('dol') || m.startsWith('dól') || m === 'usd' || m === 'u$s') return 'dolares';
    return 'pesos';
};

// Convierte filas crudas (de un Excel o del front) al formato interno.
// Descarta filas vacías o sin número de máquina (el archivo de Tesorería
// trae filas de ceros al final) y máquinas repetidas.
export const normalizarFilas = (filas) => {
    const vistas = new Set();
    const resultado = [];
    for (const fila of filas || []) {
        if (!fila || typeof fila !== 'object') continue;
        const machine = String(buscarValor(fila, 'machine') ?? '').trim();
        if (!machine || machine === '0' || vistas.has(machine)) continue;
        vistas.add(machine);
        resultado.push({
            machine,
            location: String(buscarValor(fila, 'location') ?? '').trim(),
            bill: parseFloat(buscarValor(fila, 'bill')) || 0,
            zona: String(buscarValor(fila, 'zona') ?? '').trim(),
            moneda: normalizarMoneda(buscarValor(fila, 'moneda')),
        });
    }
    return resultado;
};

// Lee un Excel (Buffer) y devuelve las filas normalizadas de la primera hoja.
export const leerExcel = (buffer) => {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return normalizarFilas(XLSX.utils.sheet_to_json(ws, { defval: '' }));
};

export const obtenerLimites = async () => {
    const [rows] = await pool.query('SELECT * FROM `config` ORDER BY id DESC LIMIT 1');
    const pesos = parseFloat(rows[0]?.limite);
    const dolares = parseFloat(rows[0]?.limiteDolar);
    return {
        pesoLimit: !isNaN(pesos) && pesos >= 0 ? pesos : 0,
        dolarLimit: !isNaN(dolares) && dolares >= 1 ? dolares : 1,
    };
};

export const pasaLimite = (m, pesoLimit, dolarLimit) =>
    m.moneda === 'dolares' ? m.bill >= dolarLimit : m.bill >= pesoLimit;

// Reemplaza el listado completo y el filtrado según los límites indicados.
export const procesarListado = async (machines, pesoLimit, dolarLimit) => {
    const fecha = new Date();
    const aFila = (m) => [m.machine, m.location, m.bill, fecha, m.zona, m.moneda];
    const filtradas = machines.filter((m) => pasaLimite(m, pesoLimit, dolarLimit));

    await pool.query('TRUNCATE listado');
    await pool.query('TRUNCATE listado_filtrado');
    await pool.query(
        'INSERT INTO listado (maquina, location, bill, fecha, zona, moneda) VALUES ?',
        [machines.map(aFila)]
    );
    if (filtradas.length > 0) {
        await pool.query(
            'INSERT INTO listado_filtrado (maquina, location, bill, fecha, zona, moneda) VALUES ?',
            [filtradas.map(aFila)]
        );
    }
    return { total: machines.length, filtradas: filtradas.length };
};

// Registro de cargas (para mostrar en pantalla de dónde salió el listado actual)
let tablaCargasLista = false;
const asegurarTablaCargas = async () => {
    if (tablaCargasLista) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS carga_archivo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha DATETIME NOT NULL,
        origen VARCHAR(20) NOT NULL,
        nombre_archivo VARCHAR(255) NULL,
        maquinas INT NOT NULL,
        a_extraer INT NOT NULL,
        limite DECIMAL(15,2) NOT NULL,
        limite_dolar DECIMAL(15,2) NOT NULL
    )`);
    tablaCargasLista = true;
};

export const registrarCarga = async ({ origen, nombreArchivo, maquinas, aExtraer, pesoLimit, dolarLimit }) => {
    try {
        await asegurarTablaCargas();
        await pool.query(
            'INSERT INTO carga_archivo (fecha, origen, nombre_archivo, maquinas, a_extraer, limite, limite_dolar) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [new Date(), origen, nombreArchivo || null, maquinas, aExtraer, pesoLimit, dolarLimit]
        );
    } catch (error) {
        // El registro es informativo: si falla no debe frenar la carga
        console.error('No se pudo registrar la carga:', error.message);
    }
};

export const ultimaCarga = async () => {
    await asegurarTablaCargas();
    const [rows] = await pool.query('SELECT * FROM carga_archivo ORDER BY id DESC LIMIT 1');
    return rows[0] || null;
};
