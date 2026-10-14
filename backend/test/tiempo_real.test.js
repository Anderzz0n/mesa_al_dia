// Pruebas de los eventos en tiempo real. Se ejecutan con:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { io as clienteSocket } from 'socket.io-client';
import { crearTiempoReal } from '../src/tiempo_real.js';

// Levanta un servidor con WebSocket en un puerto libre, ejecuta la prueba
// y lo apaga todo al final (aunque la prueba falle).
async function conTiempoReal(prueba) {
  const servidor = http.createServer();
  const tiempoReal = crearTiempoReal(servidor);
  await new Promise((ok) => servidor.listen(0, ok));
  const url = `http://localhost:${servidor.address().port}`;
  const clientes = [];

  // Conecta un cliente que pide entrar a ciertas salas y espera a que esté listo.
  const conectar = async (salas) => {
    const cliente = clienteSocket(url, { auth: { salas }, transports: ['websocket'] });
    clientes.push(cliente);
    await new Promise((ok, fallo) => {
      cliente.on('connect', ok);
      cliente.on('connect_error', fallo);
    });
    return cliente;
  };

  try {
    await prueba({ tiempoReal, conectar });
  } finally {
    clientes.forEach((c) => c.close());
    await tiempoReal.cerrar();
  }
}

// Espera un evento, pero falla si no llega a tiempo (para no colgar la prueba).
function esperarEvento(cliente, evento, ms = 1000) {
  return new Promise((ok, fallo) => {
    const reloj = setTimeout(() => fallo(new Error(`no llegó ${evento}`)), ms);
    cliente.once(evento, (datos) => {
      clearTimeout(reloj);
      ok(datos);
    });
  });
}

test('un cliente en la sala "cocina" recibe el evento emitido a esa sala', async () => {
  await conTiempoReal(async ({ tiempoReal, conectar }) => {
    const cocina = await conectar(['cocina']);
    const llegada = esperarEvento(cocina, 'comanda.nueva');
    tiempoReal.emitir('cocina', 'comanda.nueva', { comanda_id: 7 });
    assert.deepEqual(await llegada, { comanda_id: 7 });
  });
});

test('un cliente de otra sala NO recibe el evento', async () => {
  await conTiempoReal(async ({ tiempoReal, conectar }) => {
    const cocina = await conectar(['cocina']);
    const bar = await conectar(['bar']);
    const aCocina = esperarEvento(cocina, 'comanda.nueva');
    // Si el bar recibiera el evento, esta promesa se resolvería y fallaría la prueba.
    const aBar = esperarEvento(bar, 'comanda.nueva', 300).then(
      () => 'recibido',
      () => 'nada',
    );
    tiempoReal.emitir('cocina', 'comanda.nueva', { comanda_id: 8 });
    await aCocina;
    assert.equal(await aBar, 'nada');
  });
});

test('un cliente sin salas conecta pero no recibe eventos', async () => {
  await conTiempoReal(async ({ tiempoReal, conectar }) => {
    const solitario = await conectar([]);
    const aSolitario = esperarEvento(solitario, 'mesa.estado', 300).then(
      () => 'recibido',
      () => 'nada',
    );
    tiempoReal.emitir('meseros', 'mesa.estado', { mesa_id: 1 });
    assert.equal(await aSolitario, 'nada');
  });
});
