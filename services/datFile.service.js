import { pool } from "../db.js";

/**
 * Servicio para procesar archivos DAT y validar máquinas
 */
class DatFileParser {
  /**
   * Procesa un archivo DAT y verifica qué máquinas están registradas en el sistema
   * @param {String} datContent - Contenido del archivo DAT
   * @returns {Object} - Objeto con máquinas válidas e inválidas
   */
  static async processAndValidate(datContent) {
    try {
      // Dividir el contenido en líneas
      const lines = datContent.split('\n');
      
      // La primera línea es la cabecera
      const headerLine = lines[0];
      
      // Extraer nombres de columnas de la cabecera
      const headerColumns = headerLine.split(';');
      
      // Crear mapa de índices para saber qué posición tiene cada campo
      const columnMap = {};
      headerColumns.forEach((col, index) => {
        columnMap[col] = index;
      });
      
      // Determinar índice de la columna de máquina
      // Asumimos que está en la tercera columna (índice 2) después de D; y el número de serie
      
      // Procesar líneas de datos (todas las que empiezan con D;)
      const machineRecords = [];
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('D;')) {
          const parts = line.split(';');
          
          // Verificar que haya suficientes partes en la línea
          if (parts.length < 3) continue;
          
          // El ID de máquina está típicamente en la tercera columna (índice 2)
          const machineId = parts[2];
          
          // Calcular los valores monetarios
          // Suponemos que empiezan en la columna 5 (índice 4) y hay 8 denominaciones
          const denominations = [50, 100, 200, 500, 1000, 2000, 10000, 20000];
          let totalAmount = 0;
          
          // Crear objeto de desglose de billetes
          const billBreakdown = {};
          
          for (let d = 0; d < denominations.length; d++) {
            const count = parseInt(parts[d + 5] || 0, 10) || 0;
            const value = count * denominations[d];
            totalAmount += value;
            
            if (count > 0) {
              billBreakdown[denominations[d]] = count;
            }
          }
          
          // Agregar la máquina a la lista de registros
          machineRecords.push({
            machineId,
            serialNumber: parts[1],
            totalAmount,
            billBreakdown
          });
        }
      }
      
      // Ahora verificamos cuáles de estas máquinas existen en listado_filtrado
      if (machineRecords.length === 0) {
        return {
          validMachines: [],
          invalidMachines: []
        };
      }
      
      // Extraer IDs de máquinas para consultar
      const machineIds = machineRecords.map(record => record.machineId);
      
      // Consultar base de datos para verificar qué máquinas existen
      const connection = await pool.getConnection();
      try {
        const query = `
          SELECT maquina 
          FROM listado_filtrado 
          WHERE maquina IN (${machineIds.map(() => '?').join(',')})
        `;
        
        const [rows] = await connection.query(query, machineIds);
        
        // Crear conjunto de IDs válidos para búsqueda rápida
        const validMachineIds = new Set(rows.map(row => row.maquina));
        
        // Separar máquinas válidas e inválidas
        const validMachines = [];
        const invalidMachines = [];
        
        machineRecords.forEach(record => {
          if (validMachineIds.has(record.machineId)) {
            validMachines.push(record);
          } else {
            invalidMachines.push(record);
          }
        });
        
        return {
          validMachines,
          invalidMachines,
          totalProcessed: machineRecords.length
        };
      } finally {
        connection.release();
      }
      
    } catch (error) {
      console.error('Error procesando archivo DAT:', error);
      throw new Error(`Error procesando archivo DAT: ${error.message}`);
    }
  }
  
  /**
   * Convierte los registros de máquinas a formato para conciliación
   * @param {Array} machineRecords - Registros de máquinas validados
   * @returns {Array} - Máquinas en formato para conciliación
   */
  static formatForConciliation(machineRecords) {
    return machineRecords.map(record => ({
      machineId: record.machineId,
      headercard: record.serialNumber,
      location: null,
      expectedAmount: 0, // Por defecto es 0 porque no sabemos el valor esperado
      countedAmount: record.totalAmount,
      countedPhysical: record.totalAmount, // Asumimos que todo es físico
      countedVirtual: 0,
      status: 'UNKNOWN', // Se determinará al comparar con lo esperado
      billetesFisicos: record.billBreakdown,
      billetesVirtuales: {}
    }));
  }
  
  /**
   * Calcula el resumen de la conciliación
   * @param {Array} formattedRecords - Registros formateados para conciliación
   * @returns {Object} - Resumen de conciliación
   */
  static calculateSummary(formattedRecords) {
    let totalCounted = 0;
    let totalExpected = 0;
    let matchingMachines = 0;
    let nonMatchingMachines = 0;
    
    formattedRecords.forEach(record => {
      totalCounted += record.countedAmount;
      totalExpected += record.expectedAmount;
      
      // Una máquina coincide si la diferencia es menor que 0.01
      if (Math.abs(record.countedAmount - record.expectedAmount) < 0.01) {
        matchingMachines++;
        record.status = 'MATCH';
      } else {
        nonMatchingMachines++;
        record.status = 'DISCREPANCY';
      }
    });
    
    return {
      totalMachines: formattedRecords.length,
      totalCounted,
      totalExpected,
      matchingMachines,
      nonMatchingMachines,
      missingMachines: 0, // Esto se determinaría comparando con una lista completa
      extraMachines: 0 // Igual que missingMachines
    };
  }
}

export default DatFileParser;