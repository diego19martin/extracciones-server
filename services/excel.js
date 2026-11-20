// Lectura y normalización del Excel (sin acceso a base de datos)
import XLSX from 'xlsx';

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

const esZip = (buf) => buf && buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b; // "PK": .xlsx
const esOle = (buf) => buf && buf.length > 8 && buf[0] === 0xd0 && buf[1] === 0xcf; // .xls viejo
const pareceBase64 = (s) => typeof s === 'string' && s.length > 100 && /^[A-Za-z0-9+/=\r\n_-]+$/.test(s.slice(0, 2000));

// Power Automate puede mandar el adjunto de distintas formas según cómo se
// arme la expresión: base64 directo, objeto {"$content-type","$content"},
// ese objeto serializado como texto, o base64 de un base64. Devuelve el Buffer
// del Excel o lanza un error descriptivo.
export const decodificarAdjunto = (valor) => {
    let v = valor;
    if (typeof v === 'string' && v.trim().startsWith('{')) {
        try { v = JSON.parse(v); } catch (_) { /* no era JSON */ }
    }
    if (v && typeof v === 'object' && v.$content) v = v.$content;
    if (typeof v !== 'string') throw new Error(`Formato de adjunto no reconocido (${typeof v})`);

    let actual = v.trim();
    for (let i = 0; i < 3; i++) {
        if (!pareceBase64(actual)) break;
        const buf = Buffer.from(actual, 'base64');
        if (esOle(buf) || (esZip(buf) && zipCompleto(buf))) return buf;
        actual = buf.toString('utf8').trim(); // ¿base64 de un base64?
    }
    if (v.includes('�')) {
        // Los bytes del Excel llegaron convertidos a texto y se perdieron datos
        throw new Error('El adjunto llegó como texto y está dañado: en Power Automate usar base64(...) sobre contentBytes');
    }
    const crudo = Buffer.from(v, 'latin1'); // bytes enviados como texto (sin pérdida)
    if (esOle(crudo) || (esZip(crudo) && zipCompleto(crudo))) return crudo;
    throw new Error('El adjunto no es un Excel válido');
};

// Un .xlsx sano termina con el registro "fin de directorio" del zip (PK\x05\x06)
const zipCompleto = (buf) => {
    const desde = Math.max(0, buf.length - 65557);
    return buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]), buf.length, 'binary') >= desde;
};

// Descripción corta (sin datos sensibles) de lo recibido, para diagnóstico
export const describirAdjunto = (valor) => {
    if (valor && typeof valor === 'object') return `objeto con claves [${Object.keys(valor).join(', ')}]`;
    const s = String(valor ?? '');
    return `${typeof valor}, ${s.length} caracteres, empieza con "${s.slice(0, 24).replace(/[^\x20-\x7e]/g, '?')}"`;
};

// Lee un Excel (Buffer) y devuelve las filas normalizadas de la primera hoja.
export const leerExcel = (buffer) => {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return normalizarFilas(XLSX.utils.sheet_to_json(ws, { defval: '' }));
};
