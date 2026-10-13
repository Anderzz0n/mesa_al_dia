// Pruebas automáticas del esqueleto. Se ejecutan con:  npm test
// Usan el ejecutor de pruebas que ya trae Node (node:test): no hay que instalar nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crearApp } from '../src/app.js';

// Levanta la app en un puerto libre (el 0 significa "elige uno disponible"),
// ejecuta la prueba y la apaga. Usa una base de datos FALSA, así las pruebas
// no necesitan PostgreSQL y son rápidas.
async function conServidor(db, prueba) {
  const servidor = http.createServer(crearApp({ db }));
  await new Promise((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${servidor.address().port}`;
  try {
    await prueba(base);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
}

const dbSana = { query: async () => ({ rows: [{ '?column?': 1 }] }) };
const dbCaida = { query: async () => { throw new Error('sin conexión'); } };

test('GET /salud responde 200 cuando la base de datos funciona', async () => {
  await conServidor(dbSana, async (base) => {
    const res = await fetch(`${base}/api/v1/salud`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { estado: 'ok', base_de_datos: 'ok' });
  });
});

test('GET /salud responde 503 cuando la base de datos falla', async () => {
  await conServidor(dbCaida, async (base) => {
    const res = await fetch(`${base}/api/v1/salud`);
    assert.equal(res.status, 503);
    assert.equal((await res.json()).base_de_datos, 'error');
  });
});

test('una ruta inexistente devuelve el formato de error del proyecto', async () => {
  await conServidor(dbSana, async (base) => {
    const res = await fetch(`${base}/api/v1/no-existe`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' });
  });
});

test('un JSON mal formado devuelve DATOS_INVALIDOS', async () => {
  await conServidor(dbSana, async (base) => {
    const res = await fetch(`${base}/api/v1/salud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{esto no es json',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).codigo, 'DATOS_INVALIDOS');
  });
});
