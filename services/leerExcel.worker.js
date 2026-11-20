// Lee el Excel en un hilo aparte: si el archivo está dañado y la librería se
// cuelga, el servidor principal sigue respondiendo y este hilo se corta.
import { parentPort, workerData } from 'worker_threads';
import { leerExcel } from './excel.js';

try {
    const filas = leerExcel(Buffer.from(workerData.buffer));
    parentPort.postMessage({ ok: true, filas });
} catch (e) {
    parentPort.postMessage({ ok: false, error: e.message });
}
