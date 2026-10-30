import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { estadoMemoria } from '../src/db/memoria.js';

const SECRETO = 'clave-secreta-para-pruebas-de-cancelaciones-rf8';

function generarToken(payload) {
  return jwt.sign(payload, SECRETO, { expiresIn: '1h' });
}

function conServidorRF8(fakeDb, fn, tiempoReal = null) {
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

test('RF8: Validar datos requeridos, pedidos inexistentes y cuenta liquidada', async () => {
  await conServidorRF8(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Pedido inexistente -> 404
    const resNoExiste = await fetch(`${base}/api/v1/pedidos/99999/cancelaciones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: 'Cliente se fue' }),
    });
    assert.equal(resNoExiste.status, 404);
    const errNoExiste = await resNoExiste.json();
    assert.equal(errNoExiste.codigo, 'PEDIDO_NO_ENCONTRADO');

    // 2. Motivo vacío -> 400
    const resVacio = await fetch(`${base}/api/v1/pedidos/1/cancelaciones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: '   ' }),
    });
    assert.equal(resVacio.status, 400);
    const errVacio = await resVacio.json();
    assert.equal(errVacio.codigo, 'DATOS_INVALIDOS');

    // 3. Cuenta pagada -> 409
    const cuentaPagada = {
      id: 888,
      mesa_id: 4,
      etiqueta: 'Cuenta Pagada',
      estado: 'PAGADA',
      abierta_en: new Date().toISOString(),
      cerrada_en: new Date().toISOString(),
    };
    const pedidoCuentaPagada = {
      id: 888,
      cuenta_id: 888,
      mesero_id: 3,
      creado_en: new Date().toISOString(),
      cancelado: false,
    };
    estadoMemoria.cuentas.push(cuentaPagada);
    estadoMemoria.pedidos.push(pedidoCuentaPagada);

    const resPagada = await fetch(`${base}/api/v1/pedidos/888/cancelaciones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: 'Error al facturar' }),
    });
    assert.equal(resPagada.status, 409);
    const errPagada = await resPagada.json();
    assert.equal(errPagada.codigo, 'CUENTA_PAGADA');
  });
});

test('RF8: Cancelación directa por mesero dentro de los 3 minutos (APROBADA al instante, restaura stock y cancela comanda)', async () => {
  const eventosEmitidos = [];
  const fakeTiempoReal = {
    emitir: (salas, evento, payload) => {
      eventosEmitidos.push({ salas, evento, payload });
    },
  };

  await conServidorRF8(
    fakeDbOffline,
    async (base) => {
      const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

      // Crear un pedido recién registrado (< 3 minutos)
      const pedidoNuevoId = 701;
      const cuentaId = 1;
      estadoMemoria.pedidos.push({
        id: pedidoNuevoId,
        cuenta_id: cuentaId,
        mesero_id: 3,
        mesa_numero: 4,
        creado_en: new Date().toISOString(), // Justo ahora
        cancelado: false,
      });

      // Crear comanda asociada
      const comandaId = 701;
      estadoMemoria.comandas.push({
        id: comandaId,
        pedido_id: pedidoNuevoId,
        destino: 'COCINA',
        es_anticipada: false,
        estado: 'ENVIADA',
      });

      // Producto con stock para verificar devolución
      const prodHamburguesa = estadoMemoria.productos.find((p) => p.id === 1);
      const stockAntes = prodHamburguesa.stock_cantidad || 50;

      estadoMemoria.itemsPedido.push({
        id: 701,
        pedido_id: pedidoNuevoId,
        producto_id: 1,
        cantidad: 2,
        precio_unitario: 22000,
        modalidad: 'MESA',
      });

      // Ejecutar cancelación
      const res = await fetch(`${base}/api/v1/pedidos/${pedidoNuevoId}/cancelaciones`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenMesero}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo: 'Cliente cambió de idea' }),
      });

      assert.equal(res.status, 201);
      const datos = await res.json();
      assert.ok(datos.cancelacion);
      assert.equal(datos.cancelacion.estado, 'APROBADA');
      assert.equal(datos.cancelacion.pedido_id, pedidoNuevoId);

      // Comanda debe estar CANCELADA
      const comandaActual = estadoMemoria.comandas.find((k) => k.id === comandaId);
      assert.equal(comandaActual.estado, 'CANCELADA');

      // Stock debe haberse restituido (+2)
      assert.equal(prodHamburguesa.stock_cantidad, stockAntes + 2);

      // Evento pedido.cancelado emitido
      const evCancelado = eventosEmitidos.find(
        (e) => e.evento === 'pedido.cancelado' && e.payload.pedido_id === pedidoNuevoId
      );
      assert.ok(evCancelado);
      assert.ok(evCancelado.payload.comandas_afectadas.length >= 1);

      // Intento de volver a cancelar el mismo pedido -> 409 CANCELACION_YA_EXISTE
      const resRepetida = await fetch(`${base}/api/v1/pedidos/${pedidoNuevoId}/cancelaciones`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenMesero}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo: 'Reintento' }),
      });
      assert.equal(resRepetida.status, 409);
      const errRepetida = await resRepetida.json();
      assert.equal(errRepetida.codigo, 'CANCELACION_YA_EXISTE');
    },
    fakeTiempoReal
  );
});

test('RF8: Solicitud de cancelación por mesero pasados los 3 minutos (SOLICITADA a Caja)', async () => {
  const eventosEmitidos = [];
  const fakeTiempoReal = {
    emitir: (salas, evento, payload) => {
      eventosEmitidos.push({ salas, evento, payload });
    },
  };

  await conServidorRF8(
    fakeDbOffline,
    async (base) => {
      const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

      // Pedido registrado hace 15 minutos (> 3 minutos)
      const hace15Min = new Date(Date.now() - 15 * 60000).toISOString();
      const pedidoAntiguoId = 702;
      estadoMemoria.pedidos.push({
        id: pedidoAntiguoId,
        cuenta_id: 1,
        mesero_id: 3,
        mesa_numero: 4,
        creado_en: hace15Min,
        cancelado: false,
      });

      const comandaAntiguaId = 702;
      estadoMemoria.comandas.push({
        id: comandaAntiguaId,
        pedido_id: pedidoAntiguoId,
        destino: 'BAR',
        es_anticipada: false,
        estado: 'EN_PREPARACION',
      });

      const res = await fetch(`${base}/api/v1/pedidos/${pedidoAntiguoId}/cancelaciones`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenMesero}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ motivo: 'Demora excesiva en preparación' }),
      });

      assert.equal(res.status, 201);
      const datos = await res.json();
      assert.ok(datos.cancelacion);
      // Debe quedar SOLICITADA esperando decisión de caja
      assert.equal(datos.cancelacion.estado, 'SOLICITADA');

      // Comanda NO se cancela aún
      const comanda = estadoMemoria.comandas.find((k) => k.id === comandaAntiguaId);
      assert.equal(comanda.estado, 'EN_PREPARACION');

      // Evento cancelacion.solicitada emitido a sala 'caja'
      const evSolicitud = eventosEmitidos.find(
        (e) => e.evento === 'cancelacion.solicitada' && e.payload.pedido_id === pedidoAntiguoId
      );
      assert.ok(evSolicitud);
      assert.equal(evSolicitud.salas, 'caja');
    },
    fakeTiempoReal
  );
});

test('RF8: Cancelación directa por Caja en cualquier momento (siempre APROBADA)', async () => {
  await conServidorRF8(fakeDbOffline, async (base) => {
    const tokenCaja = generarToken({ id: 2, rol: 'CAJA' });

    // Pedido registrado hace 30 minutos
    const hace30Min = new Date(Date.now() - 30 * 60000).toISOString();
    const pedidoCajaId = 703;
    estadoMemoria.pedidos.push({
      id: pedidoCajaId,
      cuenta_id: 1,
      mesero_id: 3,
      mesa_numero: 4,
      creado_en: hace30Min,
      cancelado: false,
    });

    const res = await fetch(`${base}/api/v1/pedidos/${pedidoCajaId}/cancelaciones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCaja}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: 'Autorizado por administrador de turno' }),
    });

    assert.equal(res.status, 201);
    const datos = await res.json();
    assert.ok(datos.cancelacion);
    assert.equal(datos.cancelacion.estado, 'APROBADA');
  });
});

test('RF8 / CU18: Listar cancelaciones para Caja y Admin con filtros', async () => {
  await conServidorRF8(fakeDbOffline, async (base) => {
    const tokenCaja = generarToken({ id: 2, rol: 'CAJA' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // Mesero no tiene permiso para consultar la lista de cancelaciones de caja -> 403
    const resMesero = await fetch(`${base}/api/v1/cancelaciones`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resMesero.status, 403);

    // Caja consulta cancelaciones por resolver (SOLICITADA por defecto)
    const resCaja = await fetch(`${base}/api/v1/cancelaciones`, {
      headers: { Authorization: `Bearer ${tokenCaja}` },
    });
    assert.equal(resCaja.status, 200);
    const data = await resCaja.json();
    assert.ok(data.hora_servidor);
    assert.ok(Array.isArray(data.cancelaciones));
  });
});

test('RF8 / CU18, CU19: Resolución de cancelaciones por Caja (RECHAZAR y APROBAR con preparados)', async () => {
  const eventosEmitidos = [];
  const fakeTiempoReal = {
    emitir: (salas, evento, payload) => {
      eventosEmitidos.push({ salas, evento, payload });
    },
  };

  await conServidorRF8(
    fakeDbOffline,
    async (base) => {
      const tokenCaja = generarToken({ id: 2, rol: 'CAJA' });

      // 1. Preparar un pedido y solicitud de cancelación
      const pId = 801;
      estadoMemoria.pedidos.push({
        id: pId,
        cuenta_id: 1,
        mesero_id: 3,
        mesa_numero: 4,
        creado_en: new Date().toISOString(),
        cancelado: false,
      });

      estadoMemoria.itemsPedido.push({
        id: 81,
        pedido_id: pId,
        producto_id: 1, // Hamburguesa Clásica (stock 50)
        cantidad: 2,
        precio_unitario: 22000,
        modalidad: 'MESA',
        es_preparado: false,
      });

      const cId = 801;
      estadoMemoria.comandas.push({
        id: cId,
        pedido_id: pId,
        destino: 'COCINA',
        estado: 'EN_PREPARACION',
        es_anticipada: false,
      });

      const cancId = 801;
      estadoMemoria.cancelaciones.push({
        id: cancId,
        pedido_id: pId,
        motivo: 'Demora en preparación',
        solicitada_por: 3,
        solicitada_en: new Date().toISOString(),
        estado: 'SOLICITADA',
        resuelta_por: null,
        resuelta_en: null,
      });

      // 2. Rechazar cancelación
      const resRechazar = await fetch(`${base}/api/v1/cancelaciones/${cancId}/resolucion`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenCaja}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'RECHAZAR' }),
      });
      assert.equal(resRechazar.status, 200);
      const dataRech = await resRechazar.json();
      assert.equal(dataRech.cancelacion.estado, 'RECHAZADA');

      const evRech = eventosEmitidos.find((e) => e.evento === 'cancelacion.rechazada');
      assert.ok(evRech);

      // Intentar resolver de nuevo -> 409 CANCELACION_YA_RESUELTA
      const resYaRes = await fetch(`${base}/api/v1/cancelaciones/${cancId}/resolucion`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenCaja}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'APROBAR' }),
      });
      assert.equal(resYaRes.status, 409);

      // 3. Crear otra solicitud para probar APROBAR con declaración de preparado (CU19)
      const pId2 = 802;
      estadoMemoria.pedidos.push({
        id: pId2,
        cuenta_id: 1,
        mesero_id: 3,
        mesa_numero: 4,
        creado_en: new Date().toISOString(),
        cancelado: false,
      });

      estadoMemoria.itemsPedido.push({
        id: 82,
        pedido_id: pId2,
        producto_id: 1,
        cantidad: 2,
        precio_unitario: 22000,
        modalidad: 'MESA',
        es_preparado: false,
      });

      const cancId2 = 802;
      estadoMemoria.cancelaciones.push({
        id: cancId2,
        pedido_id: pId2,
        motivo: 'Mesa se retira',
        solicitada_por: 3,
        solicitada_en: new Date().toISOString(),
        estado: 'SOLICITADA',
        resuelta_por: null,
        resuelta_en: null,
      });

      // Validar cantidad inválida de preparado (> cantidad en pedido)
      const resPrepInvalido = await fetch(`${base}/api/v1/cancelaciones/${cancId2}/resolucion`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenCaja}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'APROBAR',
          preparados: [{ item_id: 82, cantidad: 5 }],
        }),
      });
      assert.equal(resPrepInvalido.status, 422);

      // Aprobar declarando 1 unidad preparada (queda 1 como preparado físico y 1 restaura inventario)
      const resAprobar = await fetch(`${base}/api/v1/cancelaciones/${cancId2}/resolucion`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenCaja}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision: 'APROBAR',
          preparados: [{ item_id: 82, cantidad: 1 }],
        }),
      });
      assert.equal(resAprobar.status, 200);
      const dataApr = await resAprobar.json();
      assert.equal(dataApr.cancelacion.estado, 'APROBADA');
      assert.equal(dataApr.cancelacion.crear_preparado, true);

      // Debe emitir preparado.nuevo y pedido.cancelado
      const evPrep = eventosEmitidos.find((e) => e.evento === 'preparado.nuevo' && e.payload.producto_id === 1);
      assert.ok(evPrep);
      const evCanc = eventosEmitidos.find((e) => e.evento === 'pedido.cancelado' && e.payload.pedido_id === pId2);
      assert.ok(evCanc);
    },
    fakeTiempoReal
  );
});

