// Pruebas de los eventos en tiempo real. Se ejecutan con:  npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { io as clienteSocket } from 'socket.io-client';
import { crearTiempoReal, resolverSalasSegunUsuario } from '../src/tiempo_real.js';

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

test('resolverSalasSegunUsuario mapea cada rol a las salas definidas en docs/02', () => {
  assert.deepEqual(resolverSalasSegunUsuario({ rol: 'ADMIN' }), ['admin']);
  assert.deepEqual(resolverSalasSegunUsuario({ rol: 'COCINA' }), ['cocina']);
  assert.deepEqual(resolverSalasSegunUsuario({ rol: 'BAR' }), ['bar']);
  assert.deepEqual(resolverSalasSegunUsuario({ rol: 'CAJA' }), ['caja']);
  assert.deepEqual(resolverSalasSegunUsuario({ id: 5, rol: 'MESERO' }), ['meseros', 'mesero:5']);
});

test('un cliente con token JWT entra a las salas de su rol y recibe sus eventos', async () => {
  const secreto = 'secreto_socket_test';
  const servidor = http.createServer();
  const tiempoReal = crearTiempoReal(servidor, { secreto });
  await new Promise((ok) => servidor.listen(0, ok));
  const url = `http://localhost:${servidor.address().port}`;

  const tokenMesero = jwt.sign({ id: 9, rol: 'MESERO' }, secreto);
  const clienteMesero = clienteSocket(url, { auth: { token: tokenMesero }, transports: ['websocket'] });

  try {
    await new Promise((ok, fallo) => {
      clienteMesero.on('connect', ok);
      clienteMesero.on('connect_error', fallo);
    });

    // Debe recibir eventos dirigidos a "meseros"
    const eventoGeneral = esperarEvento(clienteMesero, 'mesa.estado');
    tiempoReal.emitir('meseros', 'mesa.estado', { mesa_id: 4, estado: 'OCUPADA' });
    assert.deepEqual(await eventoGeneral, { mesa_id: 4, estado: 'OCUPADA' });

    // Debe recibir eventos dirigidos a su sala personal "mesero:9"
    const eventoPersonal = esperarEvento(clienteMesero, 'comanda.estado');
    tiempoReal.emitir('mesero:9', 'comanda.estado', { comanda_id: 15, estado: 'LISTA' });
    assert.deepEqual(await eventoPersonal, { comanda_id: 15, estado: 'LISTA' });

    // NO debe recibir eventos de "cocina"
    const eventoCocina = esperarEvento(clienteMesero, 'comanda.nueva', 250).then(
      () => 'recibido',
      () => 'nada'
    );
    tiempoReal.emitir('cocina', 'comanda.nueva', { comanda_id: 20 });
    assert.equal(await eventoCocina, 'nada');
  } finally {
    clienteMesero.close();
    await tiempoReal.cerrar();
  }
});

test('un cliente con token JWT inválido es rechazado por el servidor', async () => {
  const secreto = 'secreto_socket_test';
  const servidor = http.createServer();
  const tiempoReal = crearTiempoReal(servidor, { secreto });
  await new Promise((ok) => servidor.listen(0, ok));
  const url = `http://localhost:${servidor.address().port}`;

  const clienteInvalido = clienteSocket(url, { auth: { token: 'token_falso_malo' }, transports: ['websocket'] });

  try {
    const errorConexion = await new Promise((ok) => {
      clienteInvalido.on('connect_error', (err) => ok(err.message));
      clienteInvalido.on('connect', () => ok(null));
    });
    assert.equal(errorConexion, 'NO_AUTENTICADO');
  } finally {
    clienteInvalido.close();
    await tiempoReal.cerrar();
  }
});

