import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { estadoMemoria } from '../src/db/memoria.js';

const SECRETO = 'clave-secreta-para-pruebas-de-preparados-rf10';

function generarToken(payload) {
  return jwt.sign(payload, SECRETO, { expiresIn: '1h' });
}

function conServidorRF10(fakeDb, fn, tiempoReal = null) {
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

test('RF10: Consulta de productos preparados disponibles y filtros (CU20)', async () => {
  await conServidorRF10(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Consulta general
    const res = await fetch(`${base}/api/v1/preparados`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.preparados));
    assert.ok(data.hora_servidor);
    assert.equal(typeof data.total, 'number');

    // 2. Filtro por producto_id existente
    const resProd2 = await fetch(`${base}/api/v1/preparados?producto_id=2`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resProd2.status, 200);
    const dataProd2 = await resProd2.json();
    assert.ok(dataProd2.preparados.every((p) => p.producto_id === 2));

    // 3. Filtro por destino BAR
    const resBar = await fetch(`${base}/api/v1/preparados?destino=BAR`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resBar.status, 200);
    const dataBar = await resBar.json();
    assert.ok(dataBar.preparados.every((p) => p.destino === 'BAR'));

    // 4. Filtro por producto sin unidades preparadas
    const resVacio = await fetch(`${base}/api/v1/preparados?producto_id=999`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resVacio.status, 200);
    const dataVacio = await resVacio.json();
    assert.equal(dataVacio.total, 0);
    assert.equal(dataVacio.preparados.length, 0);
  });
});

test('RF10: Registro de unidades preparadas por Cocina y Bar con control de área (CU19)', async () => {
  await conServidorRF10(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenBar = generarToken({ id: 5, rol: 'BAR' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Mesero no puede registrar preparados -> 403
    const resMesero = await fetch(`${base}/api/v1/preparados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ producto_id: 1, cantidad: 1 }),
    });
    assert.equal(resMesero.status, 403);

    // 2. Cocina intentando registrar producto de BAR -> 403 DESTINO_NO_PERMITIDO
    const resCocinaBar = await fetch(`${base}/api/v1/preparados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ producto_id: 3, cantidad: 1 }), // Producto 3 es BAR
    });
    assert.equal(resCocinaBar.status, 403);
    const errCocinaBar = await resCocinaBar.json();
    assert.equal(errCocinaBar.codigo, 'DESTINO_NO_PERMITIDO');

    // 3. Bar intentando registrar producto de COCINA -> 403 DESTINO_NO_PERMITIDO
    const resBarCocina = await fetch(`${base}/api/v1/preparados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenBar}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ producto_id: 1, cantidad: 1 }), // Producto 1 es COCINA
    });
    assert.equal(resBarCocina.status, 403);
    const errBarCocina = await resBarCocina.json();
    assert.equal(errBarCocina.codigo, 'DESTINO_NO_PERMITIDO');

    // 4. Registro exitoso por Cocina (Producto 1, 2 unidades)
    const resOk = await fetch(`${base}/api/v1/preparados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ producto_id: 1, cantidad: 2 }),
    });
    assert.equal(resOk.status, 201);
    const dataOk = await resOk.json();
    assert.equal(dataOk.cantidad, 2);
    assert.equal(dataOk.unidades.length, 2);
    assert.ok(dataOk.unidades[0].id > 0);
  });
});

test('RF10: Asignación atómica de producto preparado en pedidos y colisión concurrente (CU21)', async () => {
  await conServidorRF10(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Cocina prepara una unidad del Producto 2 (Papas)
    const resReg = await fetch(`${base}/api/v1/preparados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ producto_id: 2, cantidad: 1 }),
    });
    assert.equal(resReg.status, 201);
    const dataReg = await resReg.json();
    const unidadPreparada = dataReg.unidades[0];
    assert.ok(unidadPreparada.id);

    // Guardar stock actual del producto 2 para verificar que NO se descuenta
    const prod2 = estadoMemoria.productos.find((p) => p.id === 2);
    const stockAntes = prod2.stock_cantidad;

    // 2. Mesero A asigna la unidad preparada en un pedido
    const resPedido = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            producto_id: 2,
            cantidad: 1,
            preparado_id: unidadPreparada.id,
          },
        ],
      }),
    });
    assert.equal(resPedido.status, 201);
    const dataPedido = await resPedido.json();
    assert.ok(dataPedido.id);

    // Verificar que stock_cantidad NO disminuyó (porque ya estaba cocinado físicamente)
    assert.equal(prod2.stock_cantidad, stockAntes);

    // 3. Mesero B intenta usar la misma unidad preparada -> 409 PREPARADO_NO_DISPONIBLE
    const resColision = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            producto_id: 2,
            cantidad: 1,
            preparado_id: unidadPreparada.id,
          },
        ],
      }),
    });
    assert.equal(resColision.status, 409);
    const errColision = await resColision.json();
    assert.equal(errColision.codigo, 'PREPARADO_NO_DISPONIBLE');
  });
});

test('RF10: Restitución de producto preparado a DISPONIBLE al cancelar pedido (RF8 / CU17, CU21)', async () => {
  await conServidorRF10(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Crear preparado fresco
    const resReg = await fetch(`${base}/api/v1/preparados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ producto_id: 1, cantidad: 1 }),
    });
    assert.equal(resReg.status, 201);
    const unidadPrep = (await resReg.json()).unidades[0];

    // 2. Mesero crea pedido usando la unidad preparada
    const resPedido = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            producto_id: 1,
            cantidad: 1,
            preparado_id: unidadPrep.id,
          },
        ],
      }),
    });
    assert.equal(resPedido.status, 201);
    const pedidoCreado = await resPedido.json();

    // 3. Cancelar el pedido de inmediato (dentro de la ventana de 3 min -> queda APROBADA)
    const resCanc = await fetch(`${base}/api/v1/pedidos/${pedidoCreado.id}/cancelaciones`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: 'Mesa equivocada' }),
    });
    assert.equal(resCanc.status, 201);
    const dataCanc = await resCanc.json();
    assert.equal(dataCanc.cancelacion.estado, 'APROBADA');

    // 4. Verificar que la unidad preparada volvió a estar DISPONIBLE
    const prepEnMemoria = estadoMemoria.productosPreparados.find((p) => p.id === unidadPrep.id);
    assert.equal(prepEnMemoria.estado, 'DISPONIBLE');
    assert.equal(prepEnMemoria.item_asignado_id, null);

    // 5. Verificar que otro mesero puede volver a asignarla exitosamente
    const resReasignar = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            producto_id: 1,
            cantidad: 1,
            preparado_id: unidadPrep.id,
          },
        ],
      }),
    });
    assert.equal(resReasignar.status, 201);
  });
});

test('RF10: Dar de baja o descartar una unidad preparada echada a perder (Hueco 3 / Cocina, Bar, Admin)', async () => {
  await conServidorRF10(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenBar = generarToken({ id: 5, rol: 'BAR' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Crear preparado de cocina
    const resReg = await fetch(`${base}/api/v1/preparados`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ producto_id: 1, cantidad: 1 }),
    });
    assert.equal(resReg.status, 201);
    const unidad = (await resReg.json()).unidades[0];

    // 2. Mesero intenta darlo de baja -> 403
    const resBajaMesero = await fetch(`${base}/api/v1/preparados/${unidad.id}/baja`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: 'Se enfrió' }),
    });
    assert.equal(resBajaMesero.status, 403);

    // 3. Bar intenta dar de baja un producto de Cocina -> 403 DESTINO_NO_PERMITIDO
    const resBajaBar = await fetch(`${base}/api/v1/preparados/${unidad.id}/baja`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenBar}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: 'No es de bar' }),
    });
    assert.equal(resBajaBar.status, 403);

    // 4. Cocina da de baja su unidad -> 200
    const resBajaOk = await fetch(`${base}/api/v1/preparados/${unidad.id}/baja`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ motivo: 'Se enfrió en la barra' }),
    });
    assert.equal(resBajaOk.status, 200);
    const dataBaja = await resBajaOk.json();
    assert.equal(dataBaja.estado, 'DESCARTADO');

    // 5. Verificar que ya no aparece en GET /preparados disponibles
    const resListar = await fetch(`${base}/api/v1/preparados?producto_id=1`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resListar.status, 200);
    const dataListar = await resListar.json();
    assert.ok(!dataListar.preparados.some((p) => p.id === unidad.id));

    // 6. Intentar dar de baja nuevamente -> 409 PREPARADO_NO_DISPONIBLE
    const resRebaja = await fetch(`${base}/api/v1/preparados/${unidad.id}/baja`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenCocina}`,
        'Content-Type': 'application/json',
      },
    });
    assert.equal(resRebaja.status, 409);
  });
});
