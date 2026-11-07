import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crearApp } from '../src/app.js';
import { obtenerIpsLocales, obtenerInformacionRed } from '../src/red.js';

async function conServidor(prueba) {
  const db = { query: async () => ({ rows: [] }) };
  const servidor = http.createServer(crearApp({ db, puerto: 3000 }));
  await new Promise((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${servidor.address().port}`;
  try {
    await prueba(base);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
}

test('obtenerIpsLocales retorna una lista de interfaces no internas', () => {
  const ips = obtenerIpsLocales();
  assert.ok(Array.isArray(ips));
});

test('obtenerInformacionRed retorna ip, urls y codigo QR en base64', async () => {
  const info = await obtenerInformacionRed(3000);
  assert.equal(info.puerto, 3000);
  assert.ok(typeof info.ipPrimaria === 'string');
  assert.ok(info.urlRed.startsWith('http://'));
  assert.ok(info.urlLocal === 'http://localhost:3000');
  assert.ok(info.qrDataUrl.startsWith('data:image/png;base64,'));
});

test('GET /api/v1/info-red responde con datos de red y QR', async () => {
  await conServidor(async (base) => {
    const res = await fetch(`${base}/api/v1/info-red`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.datos);
    assert.ok(body.datos.urlRed);
    assert.ok(body.datos.qrDataUrl.startsWith('data:image/png;base64,'));
  });
});

test('GET /api/v1/info-red/qr genera QR dinamico para una URL dada', async () => {
  await conServidor(async (base) => {
    const res = await fetch(`${base}/api/v1/info-red/qr?url=http://192.168.1.100:3000`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.datos.url, 'http://192.168.1.100:3000');
    assert.ok(body.datos.qrDataUrl.startsWith('data:image/png;base64,'));
  });
});
