import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { estadoMemoria } from '../src/db/memoria.js';

const SECRETO = 'clave-secreta-para-pruebas-de-pedidos-rf12';

function generarToken(payload) {
  return jwt.sign(payload, SECRETO, { expiresIn: '1h' });
}

function conServidorRF12(fakeDb, fn, tiempoReal = null) {
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

test('RF12: Rechazar pedidos en cuentas inexistentes o no abiertas (409 CUENTA_NO_ABIERTA)', async () => {
  await conServidorRF12(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Cuenta inexistente -> 404
    const resNoExiste = await fetch(`${base}/api/v1/cuentas/99999/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ producto_id: 1, cantidad: 1 }] }),
    });
    assert.equal(resNoExiste.status, 404);
    const errNoExiste = await resNoExiste.json();
    assert.equal(errNoExiste.codigo, 'CUENTA_NO_ENCONTRADA');

    // 2. Cuenta pagada o en proceso de pago -> 409
    const cuentaPagada = {
      id: 998,
      mesa_id: 4,
      etiqueta: 'Cuenta Pagada Test',
      estado: 'PAGADA',
      abierta_en: new Date().toISOString(),
      cerrada_en: new Date().toISOString(),
    };
    estadoMemoria.cuentas.push(cuentaPagada);

    const resPagada = await fetch(`${base}/api/v1/cuentas/998/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ producto_id: 1, cantidad: 1 }] }),
    });
    assert.equal(resPagada.status, 409);
    const errPagada = await resPagada.json();
    assert.equal(errPagada.codigo, 'CUENTA_NO_ABIERTA');
  });
});

test('RF12: Validar disponibilidad de productos y combinaciones de opciones prohibidas', async () => {
  await conServidorRF12(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Producto no disponible -> 409
    const prodLimonada = estadoMemoria.productos.find((p) => p.id === 4);
    prodLimonada.disponible = false;

    const resAgotado = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ producto_id: 4, cantidad: 1 }] }),
    });
    assert.equal(resAgotado.status, 409);
    const errAgotado = await resAgotado.json();
    assert.equal(errAgotado.codigo, 'PRODUCTO_NO_DISPONIBLE');

    // Restaurar
    prodLimonada.disponible = true;

    // 2. Opciones incompatibles / mutuamente excluyentes (Término Medio 1 y Tres Cuartos 2) -> 422
    const resIncompatible = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            producto_id: 1, // Hamburguesa Clásica
            cantidad: 1,
            opciones: [1, 2], // Término Medio y Tres Cuartos tienen restricción mutua
          },
        ],
      }),
    });
    assert.equal(resIncompatible.status, 422);
    const errIncompatible = await resIncompatible.json();
    assert.equal(errIncompatible.codigo, 'COMBINACION_NO_PERMITIDA');
  });
});

test('RF12: Validación de modalidades (LLEVAR y ANTICIPADA)', async () => {
  await conServidorRF12(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // Producto 3 (Cerveza) tiene permite_llevar = false
    const resNoLlevar = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ producto_id: 3, cantidad: 1, modalidad: 'LLEVAR' }],
      }),
    });
    assert.equal(resNoLlevar.status, 422);
    const errNoLlevar = await resNoLlevar.json();
    assert.equal(errNoLlevar.codigo, 'MODALIDAD_NO_PERMITIDA');

    // Probar anticipada cuando switch de área está apagado
    estadoMemoria.parametros.ANTICIPADA_ACTIVA_COCINA = 'false';
    const resAnticipadaApagada = await fetch(`${base}/api/v1/cuentas/1/pedidos`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMesero}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ producto_id: 1, cantidad: 1, modalidad: 'ANTICIPADA' }],
      }),
    });
    assert.equal(resAnticipadaApagada.status, 422);

    // Restaurar
    estadoMemoria.parametros.ANTICIPADA_ACTIVA_COCINA = 'true';
  });
});

test('RF12: Registro exitoso de pedido, división de comandas y consulta por GET /pedidos/:id', async () => {
  const eventosEmitidos = [];
  const fakeTiempoReal = {
    emitir: (salas, evento, payload) => {
      eventosEmitidos.push({ salas, evento, payload });
    },
  };

  await conServidorRF12(
    fakeDbOffline,
    async (base) => {
      const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

      // Preparar producto con stock para verificar descuento
      const prodCerveza = estadoMemoria.productos.find((p) => p.id === 3);
      prodCerveza.stock_cantidad = 10;
      prodCerveza.disponible = true;

      // Pedido con:
      // - 1 Hamburguesa Clásica (Cocina, Normal, con opción Tocineta Ahumada opId 4)
      // - 2 Cervezas (Bar, Anticipada)
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
              modalidad: 'MESA',
              observacion: 'Sin cebolla por favor',
              opciones: [4],
            },
            {
              producto_id: 3,
              cantidad: 2,
              modalidad: 'ANTICIPADA',
            },
          ],
        }),
      });

      assert.equal(resPedido.status, 201);
      const datosPedido = await resPedido.json();
      assert.ok(datosPedido.id);
      assert.equal(datosPedido.cuenta_id, 1);
      assert.equal(datosPedido.total_items, 2);

      // Comprobar división en 2 comandas:
      // 1 comanda Cocina Normal
      // 1 comanda Bar Anticipada
      assert.equal(datosPedido.comandas.length, 2);
      const comandaCocina = datosPedido.comandas.find((c) => c.destino === 'COCINA');
      const comandaBar = datosPedido.comandas.find((c) => c.destino === 'BAR');
      assert.ok(comandaCocina);
      assert.equal(comandaCocina.es_anticipada, false);
      assert.ok(comandaBar);
      assert.equal(comandaBar.es_anticipada, true);

      // Verificar descuento de stock en Cerveza: 10 - 2 = 8
      assert.equal(prodCerveza.stock_cantidad, 8);

      // Verificar eventos emitidos en tiempo real
      const evComandaCocina = eventosEmitidos.find((e) => e.evento === 'comanda.nueva' && e.payload.destino === 'COCINA');
      const evComandaBar = eventosEmitidos.find((e) => e.evento === 'comanda.nueva' && e.payload.destino === 'BAR');
      assert.ok(evComandaCocina);
      assert.ok(evComandaBar);

      // Consultar pedido por ID: GET /api/v1/pedidos/:id
      const resDetalle = await fetch(`${base}/api/v1/pedidos/${datosPedido.id}`, {
        headers: { Authorization: `Bearer ${tokenMesero}` },
      });
      assert.equal(resDetalle.status, 200);
      const detalle = await resDetalle.json();
      assert.ok(detalle.pedido);
      assert.equal(detalle.pedido.id, datosPedido.id);
      assert.equal(detalle.pedido.items.length, 2);
      assert.ok(detalle.pedido.total > 0);
    },
    fakeTiempoReal
  );
});
