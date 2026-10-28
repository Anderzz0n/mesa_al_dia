import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { estadoMemoria } from '../src/db/memoria.js';

const SECRETO = 'clave-secreta-para-pruebas-de-cuentas-rf4';

function generarToken(payload) {
  return jwt.sign(payload, SECRETO, { expiresIn: '1h' });
}

function conServidorRF4(fakeDb, fn) {
  const app = crearApp({ db: fakeDb, configAuth: { secreto: SECRETO } });
  const servidor = http.createServer(app);

  return new Promise((resolver, rechazar) => {
    servidor.listen(0, async () => {
      const puerto = servidor.address().port;
      const base = `http://localhost:${puerto}`;
      try {
        await fn(base);
        servidor.close(resolver);
      } catch (err) {
        servidor.close(() => rechazar(err));
      }
    });
  });
}

const fakeDbOffline = {
  query: async () => {
    throw new Error('PostgreSQL desconectado');
  },
};

test('RF4: GET /api/v1/mesas/:id/cuentas lista cuentas vivas de la mesa con totales', async () => {
  await conServidorRF4(fakeDbOffline, async (base) => {
    // 1. Sin autenticación -> 401
    const resSinAuth = await fetch(`${base}/api/v1/mesas/4/cuentas`);
    assert.equal(resSinAuth.status, 401);

    // 2. Mesa inexistente -> 404
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });
    const resNoExiste = await fetch(`${base}/api/v1/mesas/99999/cuentas`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resNoExiste.status, 404);
    const errNoExiste = await resNoExiste.json();
    assert.equal(errNoExiste.codigo, 'MESA_NO_ENCONTRADA');

    // 3. Mesa 4 con cuentas vivas -> 200
    const resOk = await fetch(`${base}/api/v1/mesas/4/cuentas`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resOk.status, 200);
    const datos = await resOk.json();
    assert.ok(datos.mesa);
    assert.equal(datos.mesa.id, 4);
    assert.ok(Array.isArray(datos.cuentas));
    assert.ok(datos.cuentas.length >= 1);
    const cuenta1 = datos.cuentas.find((c) => c.id === 1);
    assert.ok(cuenta1);
    assert.equal(cuenta1.etiqueta, 'Cuenta 1');
    assert.equal(cuenta1.estado, 'ABIERTA');
    assert.ok(cuenta1.total >= 0);
  });
});

test('RF4: POST /api/v1/mesas/:id/cuentas abre nueva cuenta y valida duplicados de etiqueta', async () => {
  await conServidorRF4(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Rol no permitido (COCINA) -> 403
    const res403 = await fetch(`${base}/api/v1/mesas/4/cuentas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ etiqueta: 'Cuenta Extra' }),
    });
    assert.equal(res403.status, 403);

    // 2. Etiqueta repetida en cuentas vivas de la misma mesa -> 409
    const resRepetida = await fetch(`${base}/api/v1/mesas/4/cuentas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ etiqueta: 'Cuenta 1' }),
    });
    assert.equal(resRepetida.status, 409);
    const errRepetida = await resRepetida.json();
    assert.equal(errRepetida.codigo, 'CUENTA_ETIQUETA_REPETIDA');

    // 3. Creación exitosa en mesa 2 (estaba disponible) -> 201
    const resCrear = await fetch(`${base}/api/v1/mesas/2/cuentas`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ etiqueta: 'Mesa 2 - Pareja' }),
    });
    assert.equal(resCrear.status, 201);
    const nueva = await resCrear.json();
    assert.equal(nueva.mesa_id, 2);
    assert.equal(nueva.etiqueta, 'Mesa 2 - Pareja');
    assert.equal(nueva.estado, 'ABIERTA');
    assert.equal(nueva.total, 0);

    // Verificar que la mesa 2 ahora figura como OCUPADA
    const resMesa2 = await fetch(`${base}/api/v1/mesas/2/cuentas`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    const dataMesa2 = await resMesa2.json();
    assert.equal(dataMesa2.mesa.estado, 'OCUPADA');
  });
});

test('RF4: GET /api/v1/cuentas/:id obtiene detalle completo de pedidos y opciones', async () => {
  await conServidorRF4(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Cuenta inexistente -> 404
    const resNoExiste = await fetch(`${base}/api/v1/cuentas/99999`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resNoExiste.status, 404);
    const errNoExiste = await resNoExiste.json();
    assert.equal(errNoExiste.codigo, 'CUENTA_NO_ENCONTRADA');

    // 2. Cuenta 1 existente -> 200
    const resOk = await fetch(`${base}/api/v1/cuentas/1`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resOk.status, 200);
    const datos = await resOk.json();
    assert.ok(datos.hora_servidor);
    assert.ok(datos.cuenta);
    assert.equal(datos.cuenta.id, 1);
    assert.equal(datos.cuenta.etiqueta, 'Cuenta 1');
    assert.ok(Array.isArray(datos.cuenta.pedidos));
    assert.ok(datos.cuenta.pedidos.length >= 1);
    const ped1 = datos.cuenta.pedidos[0];
    assert.ok(ped1.mesero);
    assert.ok(Array.isArray(ped1.items));
    assert.ok(ped1.items.length >= 1);
    const item1 = ped1.items[0];
    assert.equal(item1.producto_id, 1);
    assert.ok(item1.subtotal >= 22000);
  });
});

test('RF4: PATCH /api/v1/cuentas/:id realiza transiciones de estado y valida cuenta pagada', async () => {
  await conServidorRF4(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Estado inválido -> 400
    const resInvalido = await fetch(`${base}/api/v1/cuentas/1`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'CERRADA_INVENTADA' }),
    });
    assert.equal(resInvalido.status, 400);

    // 2. Transición a PENDIENTE (en proceso de pago) -> 200
    const resPendiente = await fetch(`${base}/api/v1/cuentas/1`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'PENDIENTE' }),
    });
    assert.equal(resPendiente.status, 200);
    const dataPendiente = await resPendiente.json();
    assert.equal(dataPendiente.estado, 'PENDIENTE');

    // 3. Reabrir a ABIERTA -> 200
    const resAbierta = await fetch(`${base}/api/v1/cuentas/1`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'ABIERTA' }),
    });
    assert.equal(resAbierta.status, 200);
    const dataAbierta = await resAbierta.json();
    assert.equal(dataAbierta.estado, 'ABIERTA');

    // 4. Intentar modificar una cuenta ya PAGADA -> 409 CUENTA_PAGADA
    // Simulamos cuenta pagada
    const cuentaPagadaId = 9876;
    estadoMemoria.cuentas.push({
      id: cuentaPagadaId,
      mesa_id: 4,
      etiqueta: 'Cuenta Pagada Test',
      estado: 'PAGADA',
      abierta_en: new Date().toISOString(),
      cerrada_en: new Date().toISOString(),
      cerrada_por: 1,
    });

    const resPagada = await fetch(`${base}/api/v1/cuentas/${cuentaPagadaId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'PENDIENTE' }),
    });
    assert.equal(resPagada.status, 409);
    const errPagada = await resPagada.json();
    assert.equal(errPagada.codigo, 'CUENTA_PAGADA');
  });
});

test('RF4 / RF14: GET /api/v1/cuentas lista para Caja y Admin con filtros', async () => {
  await conServidorRF4(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });
    const tokenCaja = generarToken({ id: 2, rol: 'CAJA' });

    // 1. Mesero no autorizado -> 403
    const res403 = await fetch(`${base}/api/v1/cuentas`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(res403.status, 403);

    // 2. Caja autorizado -> 200
    const resOk = await fetch(`${base}/api/v1/cuentas`, {
      headers: { Authorization: `Bearer ${tokenCaja}` },
    });
    assert.equal(resOk.status, 200);
    const datos = await resOk.json();
    assert.ok(datos.hora_servidor);
    assert.ok(Array.isArray(datos.cuentas));
    assert.ok(datos.cuentas.length >= 1);

    // 3. Filtro por estado
    const resFiltro = await fetch(`${base}/api/v1/cuentas?estado=ABIERTA`, {
      headers: { Authorization: `Bearer ${tokenCaja}` },
    });
    assert.equal(resFiltro.status, 200);
    const datosFiltro = await resFiltro.json();
    assert.ok(datosFiltro.cuentas.every((c) => c.estado === 'ABIERTA'));
  });
});
