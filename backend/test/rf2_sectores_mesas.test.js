import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';

const SECRETO_TEST = 'secreto_super_secreto_para_pruebas_rf2';

function generarToken(usuario) {
  return jwt.sign(usuario, SECRETO_TEST, { expiresIn: '1h' });
}

async function conServidorRF2(db, prueba, { eventosEmitidos = [] } = {}) {
  const tiempoRealMock = {
    emitir(sala, evento, datos) {
      eventosEmitidos.push({ sala, evento, datos });
    },
  };

  const app = crearApp({
    db,
    tiempoReal: tiempoRealMock,
    configAuth: { secreto: SECRETO_TEST, expiracion: '1h' },
  });

  const servidor = http.createServer(app);
  await new Promise((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${servidor.address().port}`;
  try {
    await prueba(base, eventosEmitidos);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
}

test('RF2: GET /api/v1/mesas exige autenticación y devuelve mesas con estado y responsable', async () => {
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('FROM mesa m')) {
        return {
          rows: [
            {
              id: 1,
              numero: 1,
              sector_id: 1,
              sector_nombre: 'Salón Principal',
              estado: 'DISPONIBLE',
              mesero_titular_id: 3,
              mesero_titular_nombre: 'Miguel Mesero',
              reasignacion_id: null,
              reasignacion_mesero_id: null,
              reasignacion_mesero_nombre: null,
              reasignacion_motivo: null,
              reasignacion_desde: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  await conServidorRF2(fakeDb, async (base) => {
    // 1. Sin token -> 401
    const resSinToken = await fetch(`${base}/api/v1/mesas`);
    assert.equal(resSinToken.status, 401);

    // 2. Con token -> 200
    const token = generarToken({ id: 3, rol: 'MESERO', nombre_usuario: 'miguel' });
    const resConToken = await fetch(`${base}/api/v1/mesas`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resConToken.status, 200);
    const body = await resConToken.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].numero, 1);
    assert.equal(body[0].estado, 'DISPONIBLE');
    assert.equal(body[0].mesero_titular.id, 3);
    assert.equal(body[0].mesero_actual.id, 3);
  });
});

test('RF2: POST /api/v1/mesas exige rol ADMIN, valida datos y número duplicado', async () => {
  const fakeDb = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO mesa')) {
        if (params[0] === 99) {
          const err = new Error('duplicate key');
          err.code = '23505';
          throw err;
        }
        return { rows: [{ id: 50, numero: params[0], sector_id: params[1] }] };
      }
      return { rows: [] };
    },
  };

  await conServidorRF2(fakeDb, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. Rol MESERO -> 403
    const resMesero = await fetch(`${base}/api/v1/mesas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMesero}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: 20 }),
    });
    assert.equal(resMesero.status, 403);

    // 2. Admin con número inválido -> 400 DATOS_INVALIDOS
    const resInvalido = await fetch(`${base}/api/v1/mesas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: -5 }),
    });
    assert.equal(resInvalido.status, 400);
    const bodyInvalido = await resInvalido.json();
    assert.equal(bodyInvalido.codigo, 'DATOS_INVALIDOS');

    // 3. Admin con número duplicado -> 409 MESA_NUMERO_REPETIDO
    const resDuplicado = await fetch(`${base}/api/v1/mesas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: 99 }),
    });
    assert.equal(resDuplicado.status, 409);
    const bodyDuplicado = await resDuplicado.json();
    assert.equal(bodyDuplicado.codigo, 'MESA_NUMERO_REPETIDO');

    // 4. Admin creación exitosa -> 201
    const resOk = await fetch(`${base}/api/v1/mesas`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numero: 25, sector_id: 1 }),
    });
    assert.equal(resOk.status, 201);
    const bodyOk = await resOk.json();
    assert.equal(bodyOk.numero, 25);
  });
});

test('RF2: GET /api/v1/sectores lista sectores con sus mesas y responsable vigente', async () => {
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('FROM sector s')) {
        return {
          rows: [
            {
              id: 1,
              nombre: 'Salón Principal',
              responsable_id: 3,
              responsable_nombre: 'Miguel Mesero',
              responsable_desde: '2026-10-24T12:00:00Z',
              mesas: [
                { id: 1, numero: 1, estado: 'DISPONIBLE', mesero_actual: 'Miguel Mesero', reasignada: false },
                { id: 2, numero: 2, estado: 'OCUPADA', mesero_actual: 'Miguel Mesero', reasignada: false },
              ],
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  await conServidorRF2(fakeDb, async (base) => {
    const token = generarToken({ id: 3, rol: 'MESERO' });
    const res = await fetch(`${base}/api/v1/sectores`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].nombre, 'Salón Principal');
    assert.equal(body[0].total_mesas, 2);
    assert.equal(body[0].responsable_vigente.id, 3);
  });
});

test('RF2: POST /api/v1/sectores valida SECTOR_SIN_MESAS y SECTOR_NOMBRE_REPETIDO', async () => {
  const fakeDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id FROM sector WHERE LOWER(nombre)')) {
        if (params[0].toLowerCase() === 'terraza') {
          return { rows: [{ id: 2 }] };
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
    transaccion: async (callback) => {
      return callback({
        query: async (sql, params) => {
          if (sql.includes('INSERT INTO sector')) {
            return { rows: [{ id: 10, nombre: params[0] }] };
          }
          return { rows: [] };
        },
      });
    },
  };

  await conServidorRF2(fakeDb, async (base) => {
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. Sin mesas -> 422 SECTOR_SIN_MESAS
    const resSinMesas = await fetch(`${base}/api/v1/sectores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Zona VIP', mesas: [] }),
    });
    assert.equal(resSinMesas.status, 422);
    const bodySinMesas = await resSinMesas.json();
    assert.equal(bodySinMesas.codigo, 'SECTOR_SIN_MESAS');

    // 2. Nombre repetido -> 409 SECTOR_NOMBRE_REPETIDO
    const resRepetido = await fetch(`${base}/api/v1/sectores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Terraza', mesas: [1, 2] }),
    });
    assert.equal(resRepetido.status, 409);
    const bodyRepetido = await resRepetido.json();
    assert.equal(bodyRepetido.codigo, 'SECTOR_NOMBRE_REPETIDO');

    // 3. Creación correcta -> 201
    const resOk = await fetch(`${base}/api/v1/sectores`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Zona VIP', mesas: [5, 6] }),
    });
    assert.equal(resOk.status, 201);
    const bodyOk = await resOk.json();
    assert.equal(bodyOk.nombre, 'Zona VIP');
    assert.deepEqual(bodyOk.mesas, [5, 6]);
  });
});

test('RF2: PUT /api/v1/sectores/:id/asignacion asigna mesero y emite evento sector.asignacion', async () => {
  const eventos = [];
  const fakeDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, nombre FROM sector')) {
        return { rows: [{ id: 1, nombre: 'Salón Principal' }] };
      }
      if (sql.includes('FROM usuario u')) {
        return { rows: [{ id: 7, nombre_completo: 'Laura Gómez' }] };
      }
      return { rows: [] };
    },
    transaccion: async (callback) => {
      return callback({
        query: async (sql) => {
          if (sql.includes('UPDATE asignacion_sector')) {
            return { rows: [{ mesero_id: 3 }] }; // mesero previo
          }
          if (sql.includes('INSERT INTO asignacion_sector')) {
            return { rows: [{ id: 9 }] };
          }
          return { rows: [] };
        },
      });
    },
  };

  await conServidorRF2(fakeDb, async (base) => {
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    const res = await fetch(`${base}/api/v1/sectores/1/asignacion`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesero_id: 7 }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.sector_id, 1);
    assert.equal(body.mesero_id, 7);

    // Verificar que se emitió sector.asignacion a las salas adecuadas
    assert.ok(eventos.length >= 2);
    const eventoAdmin = eventos.find((e) => e.sala === 'admin' && e.evento === 'sector.asignacion');
    assert.ok(eventoAdmin);
    assert.equal(eventoAdmin.datos.sector_id, 1);
    assert.equal(eventoAdmin.datos.mesero_id, 7);
  }, { eventosEmitidos: eventos });
});

test('RF2: POST /api/v1/mesas/:id/reasignaciones asigna mesero temporal o da SIN_MESEROS_DISPONIBLES', async () => {
  // Caso 1: con mesero disponible
  const eventos = [];
  const fakeDbConMesero = {
    query: async (sql, params) => {
      if (sql.includes('FROM mesa m')) {
        return { rows: [{ id: 4, numero: 4, sector_id: 1, titular_id: 3, reasignado_id: null }] };
      }
      if (sql.includes('FROM usuario u')) {
        // Devuelve a Laura (id 7) como mesero disponible
        return { rows: [{ id: 7, nombre_completo: 'Laura Gómez' }] };
      }
      return { rows: [] };
    },
    transaccion: async (callback) => {
      return callback({
        query: async (sql, params) => {
          if (sql.includes('INSERT INTO reasignacion_mesa')) {
            return { rows: [{ id: 22, mesa_id: 4, mesero_id: 7, motivo: params[2], vigente_desde: new Date().toISOString() }] };
          }
          return { rows: [] };
        },
      });
    },
  };

  await conServidorRF2(fakeDbConMesero, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    const res = await fetch(`${base}/api/v1/mesas/4/reasignaciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMesero}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Apoyo temporal' }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.reasignacion.mesa_id, 4);
    assert.equal(body.reasignacion.mesero_id, 7);

    // Verificar evento WebSocket emitido a la sala admin y meseros
    const eventoAdmin = eventos.find((e) => e.sala === 'admin' && e.evento === 'sector.asignacion');
    assert.ok(eventoAdmin);
    assert.equal(eventoAdmin.datos.tipo, 'reasignacion_mesa');
    assert.equal(eventoAdmin.datos.mesa_id, 4);
  }, { eventosEmitidos: eventos });

  // Caso 2: Sin meseros disponibles -> 409 SIN_MESEROS_DISPONIBLES
  const fakeDbSinMeseros = {
    query: async (sql) => {
      if (sql.includes('FROM mesa m')) {
        return { rows: [{ id: 4, numero: 4, sector_id: 1, titular_id: 3, reasignado_id: null }] };
      }
      if (sql.includes('FROM usuario u')) {
        return { rows: [] }; // Ningún mesero disponible
      }
      return { rows: [] };
    },
  };

  await conServidorRF2(fakeDbSinMeseros, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    const res = await fetch(`${base}/api/v1/mesas/4/reasignaciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMesero}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo: 'Apoyo' }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.codigo, 'SIN_MESEROS_DISPONIBLES');
  });
});

test('RF2: DELETE /api/v1/mesas/:id/reasignaciones/vigente termina la reasignación', async () => {
  const eventos = [];
  const fakeDb = {
    query: async (sql) => {
      if (sql.includes('UPDATE reasignacion_mesa')) {
        return { rows: [{ id: 22, mesero_id: 7 }] };
      }
      return { rows: [] };
    },
  };

  await conServidorRF2(fakeDb, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    const res = await fetch(`${base}/api/v1/mesas/4/reasignaciones/vigente`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);

    const eventoTermino = eventos.find((e) => e.evento === 'sector.asignacion' && e.datos.tipo === 'termino_reasignacion');
    assert.ok(eventoTermino);
    assert.equal(eventoTermino.datos.mesa_id, 4);
  }, { eventosEmitidos: eventos });
});

test('RF2 / RF15: GET /api/v1/meseros/:id/actividad valida permisos y devuelve pedidos del día', async () => {
  const fakeDb = {
    query: async (sql, params) => {
      if (sql.includes('FROM pedido p')) {
        return {
          rows: [
            {
              pedido_id: 101,
              cuenta_id: 1,
              cuenta_etiqueta: 'Cuenta 1',
              mesa_id: 4,
              mesa_numero: 4,
              sector_nombre: 'Salón Principal',
              creado_en: '2026-10-24T14:10:00Z',
            },
            {
              pedido_id: 102,
              cuenta_id: 2,
              cuenta_etiqueta: 'Cuenta 2',
              mesa_id: 4,
              mesa_numero: 4,
              sector_nombre: 'Salón Principal',
              creado_en: '2026-10-24T14:35:00Z',
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  await conServidorRF2(fakeDb, async (base) => {
    const tokenMiguel = generarToken({ id: 3, rol: 'MESERO' });
    const tokenLaura = generarToken({ id: 7, rol: 'MESERO' });
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. Laura intentando ver actividad de Miguel -> 403 ACCESO_DENEGADO
    const resDenegado = await fetch(`${base}/api/v1/meseros/3/actividad`, {
      headers: { Authorization: `Bearer ${tokenLaura}` },
    });
    assert.equal(resDenegado.status, 403);
    const bodyDenegado = await resDenegado.json();
    assert.equal(bodyDenegado.codigo, 'ACCESO_DENEGADO');

    // 2. Miguel viendo su propia actividad -> 200
    const resMiguel = await fetch(`${base}/api/v1/meseros/3/actividad`, {
      headers: { Authorization: `Bearer ${tokenMiguel}` },
    });
    assert.equal(resMiguel.status, 200);
    const bodyMiguel = await resMiguel.json();
    assert.equal(bodyMiguel.mesero_id, 3);
    assert.equal(bodyMiguel.total_pedidos, 2);
    assert.equal(bodyMiguel.pedidos_por_mesa.length, 1);
    assert.equal(bodyMiguel.pedidos_por_mesa[0].mesa, 4);
    assert.equal(bodyMiguel.pedidos_por_mesa[0].pedidos, 2);

    // 3. Admin consultando la actividad de Miguel -> 200
    const resAdmin = await fetch(`${base}/api/v1/meseros/3/actividad`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resAdmin.status, 200);
    const bodyAdmin = await resAdmin.json();
    assert.equal(bodyAdmin.total_pedidos, 2);
  });
});
