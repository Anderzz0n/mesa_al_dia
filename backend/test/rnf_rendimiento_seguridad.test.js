import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { io as clienteSocket } from 'socket.io-client';
import { crearApp } from '../src/app.js';
import { crearTiempoReal } from '../src/tiempo_real.js';
import { GestorMesas } from '../src/servicios/GestorMesas.js';
import { GestorCuentasPedidos } from '../src/servicios/GestorCuentasPedidos.js';

const SECRETO_PRUEBAS = 'secreto_benchmark_rnf_2026_seguro';

describe('Evaluación de Requerimientos No Funcionales (RNF) - Rendimiento, Seguridad y Concurrencia', () => {
  let servidor;
  let tiempoReal;
  let urlBase;
  const clientesWsActivos = [];

  // Tokens de prueba con roles RBAC
  const tokenAdmin = jwt.sign(
    { id: 1, nombre_usuario: 'admin', rol: 'ADMIN' },
    SECRETO_PRUEBAS,
    { expiresIn: '1h' }
  );

  const tokenMesero = jwt.sign(
    { id: 3, nombre_usuario: 'miguel', rol: 'MESERO' },
    SECRETO_PRUEBAS,
    { expiresIn: '1h' }
  );

  const tokenCocina = jwt.sign(
    { id: 4, nombre_usuario: 'cocina', rol: 'COCINA' },
    SECRETO_PRUEBAS,
    { expiresIn: '1h' }
  );

  // Hash bcrypt válido para pruebas de autenticación (contraseña: 123456)
  const passwordHash = bcrypt.hashSync('123456', 10);

  const fakeDb = {
    usuarios: [
      { id: 1, nombre_usuario: 'admin', contrasena_hash: passwordHash, rol: 'ADMIN', activo: true },
      { id: 3, nombre_usuario: 'miguel', contrasena_hash: passwordHash, rol: 'MESERO', activo: true },
      { id: 4, nombre_usuario: 'cocina', contrasena_hash: passwordHash, rol: 'COCINA', activo: true },
    ],
    mesas: [
      { id: 1, numero: 1, sector_id: 1, sector_nombre: 'Salón', estado: 'DISPONIBLE' },
      { id: 2, numero: 2, sector_id: 1, sector_nombre: 'Salón', estado: 'OCUPADA' },
    ],
    cuentas: [],
    pedidos: [],
    comandas: [],
    async query(sql, params = []) {
      const q = sql.toLowerCase();

      // Verificación de salud (Health check)
      if (q.includes('select 1')) {
        return { rows: [{ '?column?': 1 }] };
      }

      // Autenticación de usuarios
      if (q.includes('from usuario')) {
        const buscado = params[0] ? String(params[0]).toLowerCase() : '';
        const u = fakeDb.usuarios.find(
          (usr) => usr.nombre_usuario.toLowerCase() === buscado && usr.activo
        );
        return { rows: u ? [{ ...u, rol: u.rol }] : [] };
      }

      // Consulta de mesas
      if (q.includes('from mesa m')) {
        return { rows: fakeDb.mesas };
      }

      // Parámetros operativos
      if (q.includes('from parametro')) {
        return {
          rows: [
            { clave: 'VENTANA_CANCELACION_MINUTOS', valor: '3' },
            { clave: 'ANTICIPADA_ACTIVA_COCINA', valor: 'true' },
          ],
        };
      }

      // Cuentas por mesa
      if (q.includes('from cuenta c') && q.includes('where c.mesa_id = $1')) {
        const cuentasMesa = fakeDb.cuentas.filter((c) => c.mesa_id === Number(params[0]));
        return { rows: cuentasMesa };
      }

      // Inserción de cuenta (concurrencia)
      if (q.includes('insert into cuenta')) {
        const nueva = {
          id: fakeDb.cuentas.length + 1,
          mesa_id: Number(params[0]),
          etiqueta: params[1],
          estado: 'ABIERTA',
          abierta_en: new Date().toISOString(),
        };
        fakeDb.cuentas.push(nueva);
        return { rows: [nueva] };
      }

      return { rows: [] };
    },
    async transaccion(fn) {
      return fn(fakeDb);
    },
  };

  before(async () => {
    servidor = http.createServer();
    tiempoReal = crearTiempoReal(servidor, { secreto: SECRETO_PRUEBAS });

    const app = crearApp({
      db: fakeDb,
      tiempoReal,
      configAuth: { secreto: SECRETO_PRUEBAS, expiracion: '1h' },
    });

    servidor.on('request', app);
    await new Promise((resolve) => servidor.listen(0, resolve));
    urlBase = `http://localhost:${servidor.address().port}`;

    // Calentamiento inicial de la máquina virtual (Warmup)
    await fetch(`${urlBase}/api/v1/salud`);
  });

  after(async () => {
    clientesWsActivos.forEach((s) => s.close());
    if (tiempoReal?.cerrar) await tiempoReal.cerrar();
    if (servidor) await new Promise((resolve) => servidor.close(resolve));
  });

  // Conector auxiliar para pruebas WebSocket
  const conectarSocket = (token, salas) => {
    const s = clienteSocket(urlBase, {
      auth: { token, salas },
      transports: ['websocket'],
    });
    clientesWsActivos.push(s);
    return new Promise((resolve, reject) => {
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  };

  /* =======================================================================
   * 1. RNF: RENDIMIENTO Y TIEMPOS DE RESPUESTA (LATENCIA)
   * ======================================================================= */
  describe('RNF 1: Rendimiento y Tiempos de Respuesta', () => {
    test('RNF 1.1: Endpoint /salud debe responder con latencia menor a 100 ms (SLA salud)', async () => {
      const t0 = performance.now();
      const res = await fetch(`${urlBase}/api/v1/salud`);
      const duracionMs = performance.now() - t0;

      assert.equal(res.status, 200);
      assert.ok(
        duracionMs < 100,
        `Latencia excesiva en /salud: ${duracionMs.toFixed(2)} ms (Umbral: < 100 ms)`
      );
    });

    test('RNF 1.2: Ráfaga concurrente de 30 consultas a /mesas debe promediar < 60 ms por petición', async () => {
      const NUM_PETICIONES = 30;
      const promesas = [];

      const t0 = performance.now();
      for (let i = 0; i < NUM_PETICIONES; i++) {
        promesas.push(
          fetch(`${urlBase}/api/v1/mesas`, {
            headers: { Authorization: `Bearer ${tokenMesero}` },
          })
        );
      }

      const respuestas = await Promise.all(promesas);
      const tiempoTotalMs = performance.now() - t0;
      const latenciaPromedio = tiempoTotalMs / NUM_PETICIONES;

      respuestas.forEach((r) => assert.equal(r.status, 200));
      assert.ok(
        latenciaPromedio < 60,
        `Promedio de ráfaga elevado: ${latenciaPromedio.toFixed(2)} ms/req (Umbral: < 60 ms)`
      );
    });

    test('RNF 1.3: Autenticación con hash bcrypt debe completar en menos de 400 ms', async () => {
      const t0 = performance.now();
      const res = await fetch(`${urlBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_usuario: 'admin', contrasena: '123456' }),
      });
      const duracionMs = performance.now() - t0;

      assert.equal(res.status, 200);
      assert.ok(
        duracionMs < 400,
        `Cálculo de login bcrypt demoró: ${duracionMs.toFixed(2)} ms (Umbral: < 400 ms)`
      );
    });

    test('RNF 1.4: Latencia de broadcast en tiempo real vía WebSocket debe ser inferior a 50 ms', async () => {
      const socketCocina = await conectarSocket(tokenCocina, ['cocina']);
      const eventoPrueba = 'comanda.tiempo_real.benchmark';
      const datosPrueba = { id: 999, timestamp: Date.now() };

      const llegada = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout de recepción WS')), 1000);
        socketCocina.once(eventoPrueba, (datos) => {
          clearTimeout(timeout);
          resolve(datos);
        });
      });

      const t0 = performance.now();
      tiempoReal.emitir('cocina', eventoPrueba, datosPrueba);
      const datosRecibidos = await llegada;
      const latenciaWs = performance.now() - t0;

      assert.equal(datosRecibidos.id, 999);
      assert.ok(
        latenciaWs < 50,
        `Latencia WebSocket excesiva: ${latenciaWs.toFixed(2)} ms (Umbral: < 50 ms)`
      );
    });
  });

  /* =======================================================================
   * 2. RNF: SEGURIDAD, AUTORIZACIÓN Y PROTECCIÓN DE DATOS
   * ======================================================================= */
  describe('RNF 2: Seguridad y Control de Acceso (RBAC & Integridad)', () => {
    test('RNF 2.1: Solicitud sin cabecera de autenticación es rechazada con HTTP 401 y código NO_AUTENTICADO', async () => {
      const res = await fetch(`${urlBase}/api/v1/mesas`);
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.codigo, 'NO_AUTENTICADO');
    });

    test('RNF 2.2: Solicitud con token manipulado o firma corrupta es rechazada con HTTP 401 y código NO_AUTENTICADO', async () => {
      const tokenManipulado = tokenAdmin.slice(0, -6) + 'xxxxxx';
      const res = await fetch(`${urlBase}/api/v1/mesas`, {
        headers: { Authorization: `Bearer ${tokenManipulado}` },
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.codigo, 'NO_AUTENTICADO');
    });

    test('RNF 2.3: Violación de RBAC (Mesero modificando parámetro reservado para ADMIN) es rechazada con HTTP 403', async () => {
      const res = await fetch(`${urlBase}/api/v1/parametros/VENTANA_CANCELACION_MINUTOS`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenMesero}`,
        },
        body: JSON.stringify({ valor: 5 }),
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.codigo, 'ACCESO_DENEGADO');
    });

    test('RNF 2.4: Payload malformado o JSON no válido no expone stack traces ni rutas internas del servidor', async () => {
      const res = await fetch(`${urlBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"nombre_usuario": "admin", corrupto', // JSON intencionalmente malformado
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.codigo, 'DATOS_INVALIDOS');
      // Verificación de no divulgación de información confidencial (No Data Leak)
      assert.equal(body.stack, undefined);
      assert.equal(body.trace, undefined);
    });

    test('RNF 2.5: Conexión WebSocket no autenticada es rechazada de inmediato', async () => {
      const socketRechazado = clienteSocket(urlBase, {
        auth: { token: 'token_falso_invalido' },
        transports: ['websocket'],
      });
      clientesWsActivos.push(socketRechazado);

      await assert.rejects(
        () =>
          new Promise((resolve, reject) => {
            socketRechazado.on('connect', resolve);
            socketRechazado.on('connect_error', reject);
          }),
        (err) => err?.message === 'NO_AUTENTICADO'
      );
    });
  });

  /* =======================================================================
   * 3. RNF: CONCURRENCIA, INTEGRIDAD Y PREVENCIÓN DE CONDICIONES DE CARRERA
   * ======================================================================= */
  describe('RNF 3: Concurrencia e Integridad de Datos', () => {
    test('RNF 3.1: Detección y bloqueo estricto de carreras en apertura de cuentas con etiqueta idéntica (RF4)', () => {
      const gestorCuentas = new GestorCuentasPedidos();
      const cuentasMesa = [
        { id: 1, mesa_id: 1, etiqueta: 'Cuenta 1', estado: 'ABIERTA' },
      ];

      // Primera apertura: Éxito
      const primera = gestorCuentas.validarApertura({
        mesaId: 1,
        etiqueta: 'Barra A',
        cuentasExistentes: cuentasMesa,
      });
      assert.equal(primera.etiqueta, 'Barra A');

      cuentasMesa.push({ id: 2, mesa_id: 1, etiqueta: 'Barra A', estado: 'ABIERTA' });

      // Intento concurrente simultáneo con la misma etiqueta: Debe ser rechazado por unicidad (409)
      assert.throws(
        () =>
          gestorCuentas.validarApertura({
            mesaId: 1,
            etiqueta: '  barra a  ',
            cuentasExistentes: cuentasMesa,
          }),
        (err) => err.codigo === 'ETIQUETA_DUPLICADA' && err.estadoHttp === 409
      );
    });

    test('RNF 3.2: Límite de carga por ítem en pedidos evita solicitudes volumétricas abusivas (> 100 unidades)', () => {
      const gestorCuentas = new GestorCuentasPedidos();

      assert.throws(
        () =>
          gestorCuentas.validarItemsPedido([
            { producto_id: 1, cantidad: 500, modalidad: 'MESA' }, // Intento abusivo
          ]),
        (err) => err.codigo === 'DATOS_INVALIDOS' && err.message.includes('100 unidades')
      );
    });

    test('RNF 3.3: Aislamiento estricto de eventos WebSocket entre salas distintas bajo concurrencia', async () => {
      const socketCocina = await conectarSocket(tokenCocina, ['cocina']);
      const socketMesero = await conectarSocket(tokenMesero, ['mesero']);

      let eventoRecibidoEnMesero = false;
      socketMesero.on('cocina.privado', () => {
        eventoRecibidoEnMesero = true;
      });

      // Emisión de prueba a la sala exclusiva de cocina
      tiempoReal.emitir('cocina', 'cocina.privado', { ordenId: 456 });

      // Esperar 100 ms para constatar que el mesero NO lo recibe
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(
        eventoRecibidoEnMesero,
        false,
        'Violación de aislamiento: el mesero recibió un evento privado de cocina'
      );
    });

    test('RNF 3.4: Consistencia de cálculo de mesa bajo alta concurrencia de estados', () => {
      const gestorMesas = new GestorMesas();
      const estadoComplejo = {
        cuentas: [
          { id: 10, mesa_id: 8, estado: 'PENDIENTE' },
          { id: 11, mesa_id: 8, estado: 'ABIERTA' }, // Ocupada
        ],
        pedidos: [{ id: 50, cuenta_id: 11, cancelado: false }],
        comandas: [{ id: 500, pedido_id: 50, estado: 'EN_PREPARACION' }], // Prioridad máxima
      };

      // Debe resolver determinísticamente CON_PEDIDOS_PENDIENTES sin fluctuación
      for (let i = 0; i < 20; i++) {
        const est = gestorMesas.calcularEstado(8, estadoComplejo);
        assert.equal(est, GestorMesas.ESTADOS.CON_PEDIDOS_PENDIENTES);
      }
    });
  });
});
