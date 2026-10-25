// Motor de migraciones de base de datos (PostgreSQL).
// Ejecuta scripts SQL en orden secuencial dentro de transacciones seguras
// y lleva el registro en la tabla 'migracion' para no repetir ninguna.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function asegurarTablaMigraciones(clienteOdb) {
  await clienteOdb.query(`
    CREATE TABLE IF NOT EXISTS migracion (
      id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      nombre        VARCHAR(255) NOT NULL UNIQUE,
      ejecutada_en  TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
  `);
}

export async function obtenerMigracionesAplicadas(clienteOdb) {
  await asegurarTablaMigraciones(clienteOdb);
  const resultado = await clienteOdb.query('SELECT nombre FROM migracion ORDER BY id ASC');
  return new Set(resultado.rows.map((f) => f.nombre));
}

export async function leerArchivosMigracion(directorio) {
  const archivos = await fs.readdir(directorio);
  return archivos
    .filter((a) => a.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function ejecutarMigraciones({ db, dirMigraciones, logger = console.log }) {
  const archivos = await leerArchivosMigracion(dirMigraciones);
  const aplicadas = await obtenerMigracionesAplicadas(db);
  const pendientes = archivos.filter((a) => !aplicadas.has(a));

  if (pendientes.length === 0) {
    logger('Base de datos al día. No hay migraciones pendientes.');
    return { ejecutadas: [], total: archivos.length };
  }

  logger(`Encontradas ${pendientes.length} migraciones pendientes.`);

  const ejecutadas = [];
  for (const archivo of pendientes) {
    const rutaCompleta = path.join(dirMigraciones, archivo);
    const contenidoSql = await fs.readFile(rutaCompleta, 'utf-8');

    logger(`Aplicando: ${archivo}...`);

    await db.transaccion(async (cliente) => {
      await cliente.query(contenidoSql);
      await cliente.query('INSERT INTO migracion (nombre) VALUES ($1)', [archivo]);
    });

    logger(`✓ Aplicada con éxito: ${archivo}`);
    ejecutadas.push(archivo);
  }

  logger(`Migración finalizada: ${ejecutadas.length} scripts ejecutados.`);
  return { ejecutadas, total: archivos.length };
}
