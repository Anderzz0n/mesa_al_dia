import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { estadoMemoria } from '../src/db/memoria.js';

const SECRETO = 'clave-secreta-para-pruebas-de-comandas-rf7';

function generarToken(payload) {
  return jwt.sign(payload, SECRETO, { expiresIn: '1h' });
}

function conServidorRF7(fakeDb, fn, tiempoReal = null) {
  const app = crearApp({ db: fakeDb, tiempoReal, configAuth: { secreto: SECRETO } });
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

test('RF7: Tablero de comandas con filtros de área, estado, fecha y acuse (CU12)', async () => {
  // Inicializamos datos en memoria para pruebas
  estadoMemoria.comandas = [
    {
      id: 101,
      pedido_id: 1,
      destino: 'COCINA',
      es_anticipada: false,
      estado: 'ENVIADA',
      enviada_en: '2026-10-29T10:00:00.000Z',
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
    {
      id: 102,
      pedido_id: 1,
      destino: 'COCINA',
      es_anticipada: true,
      estado: 'ENVIADA',
      enviada_en: '2026-10-29T10:05:00.000Z',
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
    {
      id: 103,
      pedido_id: 1,
      destino: 'BAR',
      es_anticipada: false,
      estado: 'ENVIADA',
      enviada_en: '2026-10-29T10:02:00.000Z',
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
    {
      id: 104,
      pedido_id: 1,
      destino: 'COCINA',
      es_anticipada: false,
      estado: 'CANCELADA',
      enviada_en: '2026-10-29T09:30:00.000Z',
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
  ];

  // Asociar algunos ítems a comandas
  estadoMemoria.itemsPedido = [
    {
      id: 1,
      pedido_id: 1,
      producto_id: 1, // Hamburguesa Clásica (COCINA)
      cantidad: 2,
      precio_unitario: 22000,
      modalidad: 'MESA',
      observacion: 'Término medio',
      item_padre_id: null,
      comanda_id: 101,
      es_preparado: false,
    },
    {
      id: 2,
      pedido_id: 1,
      producto_id: 2, // Papas Francesas (COCINA)
      cantidad: 1,
      precio_unitario: 8000,
      modalidad: 'ANTICIPADA',
      observacion: null,
      item_padre_id: null,
      comanda_id: 102,
      es_preparado: false,
    },
  ];

  await conServidorRF7(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenBar = generarToken({ id: 5, rol: 'BAR' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. Rol no permitido (MESERO -> 403)
    const resMesero = await fetch(`${base}/api/v1/comandas`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resMesero.status, 403);

    // 2. Control de área: COCINA intentando consultar BAR -> 403 DESTINO_NO_PERMITIDO
    const resCocinaPideBar = await fetch(`${base}/api/v1/comandas?destino=BAR`, {
      headers: { Authorization: `Bearer ${tokenCocina}` },
    });
    assert.equal(resCocinaPideBar.status, 403);
    const dataErr = await resCocinaPideBar.json();
    assert.equal(dataErr.codigo, 'DESTINO_NO_PERMITIDO');

    // 3. Consulta de COCINA por defecto (filtra su destino y ordena anticipadas primero)
    const resCocina = await fetch(`${base}/api/v1/comandas`, {
      headers: { Authorization: `Bearer ${tokenCocina}` },
    });
    assert.equal(resCocina.status, 200);
    const dataCocina = await resCocina.json();
    assert.ok(dataCocina.hora_servidor);
    assert.ok(Array.isArray(dataCocina.comandas));
    // Debe excluir la de BAR y la CANCELADA (por defecto solo ENVIADA, RECIBIDA, EN_PREPARACION)
    assert.equal(dataCocina.comandas.length, 2);
    // Primera comanda debe ser la anticipada (id 102)
    assert.equal(dataCocina.comandas[0].id, 102);
    assert.equal(dataCocina.comandas[0].es_anticipada, true);
    assert.equal(dataCocina.comandas[1].id, 101);
    assert.equal(dataCocina.comandas[1].es_anticipada, false);
    // Verificar campos de la comanda
    assert.equal(dataCocina.comandas[1].total_items, 1);
    assert.equal(dataCocina.comandas[1].items[0].producto, 'Hamburguesa Clásica');

    // 4. Franja de cancelaciones por acusar: acuse=pendiente
    const resAcuse = await fetch(`${base}/api/v1/comandas?acuse=pendiente`, {
      headers: { Authorization: `Bearer ${tokenCocina}` },
    });
    assert.equal(resAcuse.status, 200);
    const dataAcuse = await resAcuse.json();
    assert.equal(dataAcuse.comandas.length, 1);
    assert.equal(dataAcuse.comandas[0].id, 104);
    assert.equal(dataAcuse.comandas[0].estado, 'CANCELADA');

    // 5. Consulta de ADMIN puede ver BAR
    const resAdmin = await fetch(`${base}/api/v1/comandas?destino=BAR`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resAdmin.status, 200);
    const dataAdmin = await resAdmin.json();
    assert.equal(dataAdmin.comandas.length, 1);
    assert.equal(dataAdmin.comandas[0].id, 103);
    assert.equal(dataAdmin.comandas[0].destino, 'BAR');
  });
});

test('RF7: Confirmación de recepción con verificación de discrepancia y corrección (CU15)', async () => {
  const eventosEmitidos = [];
  const mockTiempoReal = {
    emitir: (salas, evento, carga) => {
      eventosEmitidos.push({ salas, evento, carga });
    },
  };

  estadoMemoria.comandas = [
    {
      id: 201,
      pedido_id: 1,
      destino: 'COCINA',
      es_anticipada: false,
      estado: 'ENVIADA',
      enviada_en: new Date().toISOString(),
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
    {
      id: 202,
      pedido_id: 1,
      destino: 'BAR',
      es_anticipada: false,
      estado: 'ENVIADA',
      enviada_en: new Date().toISOString(),
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
  ];

  // Comanda 201 tiene 2 ítems
  estadoMemoria.itemsPedido = [
    {
      id: 21,
      pedido_id: 1,
      producto_id: 1,
      cantidad: 1,
      precio_unitario: 22000,
      modalidad: 'MESA',
      comanda_id: 201,
    },
    {
      id: 22,
      pedido_id: 1,
      producto_id: 2,
      cantidad: 1,
      precio_unitario: 8000,
      modalidad: 'MESA',
      comanda_id: 201,
    },
  ];

  await conServidorRF7(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenBar = generarToken({ id: 5, rol: 'BAR' });

    // 1. Control de área: Bar intentando confirmar comanda de cocina -> 403
    const resCrossArea = await fetch(`${base}/api/v1/comandas/201/confirmacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenBar}`,
      },
      body: JSON.stringify({ items_confirmados: 2 }),
    });
    assert.equal(resCrossArea.status, 403);

    // 2. Confirmación con discrepancia (envía 1 cuando hay 2 ítems): responde coincide = false
    const resDiscrepancia = await fetch(`${base}/api/v1/comandas/201/confirmacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCocina}`,
      },
      body: JSON.stringify({ items_confirmados: 1 }),
    });
    assert.equal(resDiscrepancia.status, 200);
    const dataDisc = await resDiscrepancia.json();
    assert.equal(dataDisc.items_enviados, 2);
    assert.equal(dataDisc.items_confirmados, 1);
    assert.equal(dataDisc.coincide, false);

    // Debe emitir comanda.recibida al mesero
    const ev1 = eventosEmitidos.find((e) => e.evento === 'comanda.recibida');
    assert.ok(ev1);
    assert.equal(ev1.carga.coincide, false);
    assert.equal(ev1.carga.items_confirmados, 1);

    // Comanda queda en estado RECIBIDA
    const cMem = estadoMemoria.comandas.find((k) => k.id === 201);
    assert.equal(cMem.estado, 'RECIBIDA');

    // 3. Corrección de recuento mientras sigue en RECIBIDA (ahora confirma 2)
    const resCorreccion = await fetch(`${base}/api/v1/comandas/201/confirmacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCocina}`,
      },
      body: JSON.stringify({ items_confirmados: 2 }),
    });
    assert.equal(resCorreccion.status, 200);
    const dataCorr = await resCorreccion.json();
    assert.equal(dataCorr.items_enviados, 2);
    assert.equal(dataCorr.items_confirmados, 2);
    assert.equal(dataCorr.coincide, true);

    // 4. Pasar a EN_PREPARACION y luego intentar confirmar de nuevo -> 409 COMANDA_NO_CONFIRMABLE
    cMem.estado = 'EN_PREPARACION';
    const resBloqueada = await fetch(`${base}/api/v1/comandas/201/confirmacion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCocina}`,
      },
      body: JSON.stringify({ items_confirmados: 2 }),
    });
    assert.equal(resBloqueada.status, 409);
    const dataBloq = await resBloqueada.json();
    assert.equal(dataBloq.codigo, 'COMANDA_NO_CONFIRMABLE');
  }, mockTiempoReal);
});

test('RF7: Transición de estados de comanda a EN_PREPARACION y LISTA', async () => {
  const eventosEmitidos = [];
  const mockTiempoReal = {
    emitir: (salas, evento, carga) => {
      eventosEmitidos.push({ salas, evento, carga });
    },
  };

  estadoMemoria.comandas = [
    {
      id: 301,
      pedido_id: 1,
      destino: 'COCINA',
      es_anticipada: false,
      estado: 'RECIBIDA',
      enviada_en: new Date().toISOString(),
      confirmada_en: new Date().toISOString(),
      confirmada_por: 4,
      items_confirmados: 1,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
  ];

  await conServidorRF7(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });

    // 1. Transición a EN_PREPARACION
    const resPrep = await fetch(`${base}/api/v1/comandas/301`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCocina}`,
      },
      body: JSON.stringify({ estado: 'EN_PREPARACION' }),
    });
    assert.equal(resPrep.status, 200);
    const dataPrep = await resPrep.json();
    assert.equal(dataPrep.estado, 'EN_PREPARACION');

    const evPrep = eventosEmitidos.find((e) => e.evento === 'comanda.estado' && e.carga.estado === 'EN_PREPARACION');
    assert.ok(evPrep);

    // 2. Transición a LISTA
    const resLista = await fetch(`${base}/api/v1/comandas/301`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenCocina}`,
      },
      body: JSON.stringify({ estado: 'LISTA' }),
    });
    assert.equal(resLista.status, 200);
    const dataLista = await resLista.json();
    assert.equal(dataLista.estado, 'LISTA');
    assert.ok(dataLista.lista_en);

    const evLista = eventosEmitidos.find((e) => e.evento === 'comanda.estado' && e.carga.estado === 'LISTA');
    assert.ok(evLista);
  }, mockTiempoReal);
});

test('RF8: Acuse de recibo de comanda cancelada', async () => {
  estadoMemoria.comandas = [
    {
      id: 401,
      pedido_id: 1,
      destino: 'COCINA',
      es_anticipada: false,
      estado: 'CANCELADA',
      enviada_en: new Date().toISOString(),
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
    {
      id: 402,
      pedido_id: 1,
      destino: 'COCINA',
      es_anticipada: false,
      estado: 'ENVIADA',
      enviada_en: new Date().toISOString(),
      confirmada_en: null,
      confirmada_por: null,
      items_confirmados: null,
      lista_en: null,
      cancelacion_acuse_en: null,
    },
  ];

  await conServidorRF7(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });

    // 1. Acusar comanda que no está cancelada -> 422
    const resNoCanc = await fetch(`${base}/api/v1/comandas/402/acuse-cancelacion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCocina}` },
    });
    assert.equal(resNoCanc.status, 422);

    // 2. Acusar comanda cancelada -> 200
    const resAcuse = await fetch(`${base}/api/v1/comandas/401/acuse-cancelacion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenCocina}` },
    });
    assert.equal(resAcuse.status, 200);
    const dataAcuse = await resAcuse.json();
    assert.equal(dataAcuse.comanda_id, 401);
    assert.ok(dataAcuse.cancelacion_acuse_en);

    const cMem = estadoMemoria.comandas.find((k) => k.id === 401);
    assert.ok(cMem.cancelacion_acuse_en);
  });
});
