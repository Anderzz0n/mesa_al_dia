import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  leerArchivosMigracion,
  asegurarTablaMigraciones,
  obtenerMigracionesAplicadas,
  ejecutarMigraciones,
} from '../src/db/migrador.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirMigraciones = path.join(__dirname, '../src/db/migraciones');

test('leerArchivosMigracion devuelve los archivos en orden secuencial', async () => {
  const archivos = await leerArchivosMigracion(dirMigraciones);
  assert.ok(archivos.length >= 5);
  assert.equal(archivos[0], '001_seguridad_y_sectores.sql');
  assert.equal(archivos[1], '002_menu_stock_personalizacion.sql');
  assert.equal(archivos[2], '003_cuentas_y_pedidos.sql');
  assert.equal(archivos[3], '004_comandas_cancelaciones_preparados.sql');
  assert.equal(archivos[4], '005_semillas_iniciales.sql');
});

test('asegurarTablaMigraciones ejecuta CREATE TABLE IF NOT EXISTS migracion', async () => {
  const consultas = [];
  const fakeDb = {
    query: async (sql) => {
      consultas.push(sql);
      return { rows: [] };
    },
  };

  await asegurarTablaMigraciones(fakeDb);
  assert.equal(consultas.length, 1);
  assert.match(consultas[0], /CREATE TABLE IF NOT EXISTS migracion/);
});

test('obtenerMigracionesAplicadas lee los nombres existentes en la tabla', async () => {
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('SELECT nombre FROM migracion')) {
        return { rows: [{ nombre: '001_seguridad_y_sectores.sql' }] };
      }
      return { rows: [] };
    },
  };

  const aplicadas = await obtenerMigracionesAplicadas(fakeDb);
  assert.ok(aplicadas.has('001_seguridad_y_sectores.sql'));
  assert.ok(!aplicadas.has('002_menu_stock_personalizacion.sql'));
});

test('ejecutarMigraciones aplica solo las migraciones pendientes en transacciones', async () => {
  const aplicadasEnBd = new Set(['001_seguridad_y_sectores.sql']);
  const transaccionesEjecutadas = [];

  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('SELECT nombre FROM migracion')) {
        return { rows: Array.from(aplicadasEnBd).map((nombre) => ({ nombre })) };
      }
      return { rows: [] };
    },
    transaccion: async (trabajo) => {
      const clienteTransaccion = {
        query: async (sql, params) => {
          transaccionesEjecutadas.push({ sql, params });
          if (sql.includes('INSERT INTO migracion')) {
            aplicadasEnBd.add(params[0]);
          }
          return { rows: [] };
        },
      };
      return trabajo(clienteTransaccion);
    },
  };

  const logs = [];
  const resultado = await ejecutarMigraciones({
    db: fakeDb,
    dirMigraciones,
    logger: (msg) => logs.push(msg),
  });

  // No debe haber aplicado 001 porque ya estaba en aplicadasEnBd
  assert.ok(!resultado.ejecutadas.includes('001_seguridad_y_sectores.sql'));
  assert.ok(resultado.ejecutadas.includes('002_menu_stock_personalizacion.sql'));
  assert.ok(resultado.ejecutadas.includes('003_cuentas_y_pedidos.sql'));
  assert.ok(resultado.ejecutadas.includes('004_comandas_cancelaciones_preparados.sql'));
  assert.ok(resultado.ejecutadas.includes('005_semillas_iniciales.sql'));
  assert.equal(resultado.ejecutadas.length, 4);
});

test('ejecutarMigraciones informa cuando no hay migraciones pendientes', async () => {
  const archivos = await leerArchivosMigracion(dirMigraciones);
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('SELECT nombre FROM migracion')) {
        return { rows: archivos.map((nombre) => ({ nombre })) };
      }
      return { rows: [] };
    },
  };

  const logs = [];
  const resultado = await ejecutarMigraciones({
    db: fakeDb,
    dirMigraciones,
    logger: (msg) => logs.push(msg),
  });

  assert.equal(resultado.ejecutadas.length, 0);
  assert.ok(logs.some((l) => l.includes('Base de datos al día')));
});
