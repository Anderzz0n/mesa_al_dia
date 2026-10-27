import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { estadoMemoria } from '../src/db/memoria.js';

const SECRETO_TEST = 'secreto_super_secreto_para_pruebas_123';

function generarToken(payload) {
  return jwt.sign(payload, SECRETO_TEST, { expiresIn: '1h' });
}

async function conServidor(db, prueba) {
  const app = crearApp({
    db,
    configAuth: { secreto: SECRETO_TEST, expiracion: '1h' },
  });

  const servidor = http.createServer(app);
  await new Promise((ok) => servidor.listen(0, ok));
  const base = `http://localhost:${servidor.address().port}`;
  try {
    await prueba(base);
  } finally {
    await new Promise((ok) => servidor.close(ok));
  }
}

// Simulador de base de datos caída/apagada para probar el motor en memoria
const fakeDbOffline = {
  query: async () => {
    throw new Error('Conexión con PostgreSQL fallida (simulada)');
  },
};

test('RF1: GET /api/v1/usuarios exige autenticación y rol ADMIN', async () => {
  await conServidor(fakeDbOffline, async (base) => {
    // Sin token -> 401
    const resSinToken = await fetch(`${base}/api/v1/usuarios`);
    assert.equal(resSinToken.status, 401);

    // Con token de MESERO -> 403
    const tokenMesero = generarToken({ id: 3, nombre_usuario: 'miguel', rol: 'MESERO' });
    const resMesero = await fetch(`${base}/api/v1/usuarios`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resMesero.status, 403);

    // Con token de ADMIN -> 200
    const tokenAdmin = generarToken({ id: 1, nombre_usuario: 'admin', rol: 'ADMIN' });
    const resAdmin = await fetch(`${base}/api/v1/usuarios`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resAdmin.status, 200);
    const usuarios = await resAdmin.json();
    assert.ok(Array.isArray(usuarios));
    assert.ok(usuarios.length > 0);
    // Verificar que nunca exponga el hash de la contraseña
    for (const u of usuarios) {
      assert.equal(u.contrasena_hash, undefined);
      assert.ok(u.id);
      assert.ok(u.nombre_usuario);
      assert.ok(u.rol);
    }
  });
});

test('RF1: GET /api/v1/usuarios permite filtrar por rol y estado activo', async () => {
  await conServidor(fakeDbOffline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, nombre_usuario: 'admin', rol: 'ADMIN' });

    // Filtrar solo meseros
    const resMeseros = await fetch(`${base}/api/v1/usuarios?rol=MESERO`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resMeseros.status, 200);
    const meseros = await resMeseros.json();
    for (const m of meseros) {
      assert.equal(m.rol, 'MESERO');
    }

    // Filtrar inactivos
    const resInactivos = await fetch(`${base}/api/v1/usuarios?activo=false`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resInactivos.status, 200);
    const inactivos = await resInactivos.json();
    for (const inact of inactivos) {
      assert.equal(inact.activo, false);
    }
  });
});

test('RF1: POST /api/v1/usuarios valida campos obligatorios y formato', async () => {
  await conServidor(fakeDbOffline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, nombre_usuario: 'admin', rol: 'ADMIN' });

    // Faltan campos
    const resVacio = await fetch(`${base}/api/v1/usuarios`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    assert.equal(resVacio.status, 400);

    // Contraseña menor a 6 caracteres
    const resContrasenaCorta = await fetch(`${base}/api/v1/usuarios`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre_usuario: 'nuevo_usuario',
        nombre_completo: 'Nuevo Empleado',
        rol: 'MESERO',
        contrasena: '123',
      }),
    });
    assert.equal(resContrasenaCorta.status, 400);

    // Rol inválido
    const resRolInvalido = await fetch(`${base}/api/v1/usuarios`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre_usuario: 'nuevo_usuario',
        nombre_completo: 'Nuevo Empleado',
        rol: 'GERENTE_FANTASMA',
        contrasena: '123456',
      }),
    });
    assert.equal(resRolInvalido.status, 400);
  });
});

test('RF1: POST /api/v1/usuarios crea usuario exitosamente y rechaza duplicados con 409', async () => {
  await conServidor(fakeDbOffline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, nombre_usuario: 'admin', rol: 'ADMIN' });

    // Intentar crear usuario con nombre ya existente (admin)
    const resDuplicado = await fetch(`${base}/api/v1/usuarios`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre_usuario: 'admin',
        nombre_completo: 'Otro Admin',
        rol: 'ADMIN',
        contrasena: 'clave123',
      }),
    });
    assert.equal(resDuplicado.status, 409);
    const bodyDuplicado = await resDuplicado.json();
    assert.equal(bodyDuplicado.codigo, 'USUARIO_DUPLICADO');

    // Crear un usuario válido nuevo
    const usuarioNuevo = `empleado_${Date.now()}`;
    const resCrear = await fetch(`${base}/api/v1/usuarios`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre_usuario: usuarioNuevo,
        nombre_completo: 'Camila Reyes',
        rol: 'CAJA',
        contrasena: 'claveSegura2026',
      }),
    });
    assert.equal(resCrear.status, 201);
    const creado = await resCrear.json();
    assert.ok(creado.id);
    assert.equal(creado.nombre_usuario, usuarioNuevo);
    assert.equal(creado.nombre_completo, 'Camila Reyes');
    assert.equal(creado.rol, 'CAJA');
    assert.equal(creado.activo, true);
    assert.equal(creado.contrasena_hash, undefined);

    // Comprobar que el nuevo usuario puede iniciar sesión
    const resLogin = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre_usuario: usuarioNuevo,
        contrasena: 'claveSegura2026',
      }),
    });
    assert.equal(resLogin.status, 200);
    const bodyLogin = await resLogin.json();
    assert.ok(bodyLogin.token);
    assert.equal(bodyLogin.usuario.rol, 'CAJA');
  });
});

test('RF1: PATCH /api/v1/usuarios/:id actualiza usuario y protege cuenta propia del admin', async () => {
  await conServidor(fakeDbOffline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, nombre_usuario: 'admin', rol: 'ADMIN' });

    // Intento de desactivar la cuenta del propio admin logueado -> 422
    const resAutoDesactivar = await fetch(`${base}/api/v1/usuarios/1`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ activo: false }),
    });
    assert.equal(resAutoDesactivar.status, 422);

    // Intento de cambiarse el rol a MESERO el propio admin -> 422
    const resAutoQuitarAdmin = await fetch(`${base}/api/v1/usuarios/1`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rol: 'MESERO' }),
    });
    assert.equal(resAutoQuitarAdmin.status, 422);

    // Usuario inexistente -> 404
    const resNoExiste = await fetch(`${base}/api/v1/usuarios/99999`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nombre_completo: 'Prueba' }),
    });
    assert.equal(resNoExiste.status, 404);

    // Actualización legítima de otro usuario (ej. id: 2, simon)
    const resActualizar = await fetch(`${base}/api/v1/usuarios/2`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre_completo: 'Simón Actualizado',
        activo: false,
      }),
    });
    assert.equal(resActualizar.status, 200);
    const actualizado = await resActualizar.json();
    assert.equal(actualizado.nombre_completo, 'Simón Actualizado');
    assert.equal(actualizado.activo, false);

    // Reactivarlo para no romper otros tests
    await fetch(`${base}/api/v1/usuarios/2`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nombre_completo: 'Simón Ruedas (Caja)',
        activo: true,
      }),
    });
  });
});

test('RF1: POST /api/v1/usuarios/:id/restablecer-contrasena actualiza la clave y permite login', async () => {
  await conServidor(fakeDbOffline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, nombre_usuario: 'admin', rol: 'ADMIN' });

    // Contraseña demasiado corta
    const resCorta = await fetch(`${base}/api/v1/usuarios/3/restablecer-contrasena`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nueva_contrasena: '123' }),
    });
    assert.equal(resCorta.status, 400);

    // Usuario no encontrado
    const resNoExiste = await fetch(`${base}/api/v1/usuarios/8888/restablecer-contrasena`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nueva_contrasena: 'nuevaClave123' }),
    });
    assert.equal(resNoExiste.status, 404);

    // Restablecer contraseña a usuario 3 (miguel)
    const resOk = await fetch(`${base}/api/v1/usuarios/3/restablecer-contrasena`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nueva_contrasena: 'miguelNuevaClave2026' }),
    });
    assert.equal(resOk.status, 200);
    const bodyOk = await resOk.json();
    assert.equal(bodyOk.ok, true);

    // Iniciar sesión con la nueva contraseña
    const resLogin = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre_usuario: 'miguel',
        contrasena: 'miguelNuevaClave2026',
      }),
    });
    assert.equal(resLogin.status, 200);

    // Restaurar clave anterior para mantener idempotencia
    await fetch(`${base}/api/v1/usuarios/3/restablecer-contrasena`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenAdmin}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nueva_contrasena: '123456' }),
    });
  });
});

test('RF1: simulación con base de datos PostgreSQL activa', async () => {
  const fakeDbOnline = {
    query: async (sql, params = []) => {
      if (sql.includes('SELECT u.id, u.nombre_usuario')) {
        return {
          rows: [
            {
              id: 10,
              nombre_usuario: 'cajera1',
              nombre_completo: 'Lucía Peña',
              rol: 'CAJA',
              activo: true,
              creado_en: new Date().toISOString(),
            },
          ],
        };
      }
      if (sql.includes('SELECT id FROM rol WHERE UPPER(nombre)')) {
        return { rows: [{ id: 5 }] };
      }
      if (sql.includes('INSERT INTO usuario')) {
        return {
          rows: [
            {
              id: 11,
              nombre_usuario: params[0],
              nombre_completo: params[1],
              creado_en: new Date().toISOString(),
              activo: true,
            },
          ],
        };
      }
      if (sql.includes('UPDATE usuario')) {
        return {
          rows: [
            {
              id: 10,
              nombre_usuario: 'cajera1',
              nombre_completo: params[0] || 'Lucía Peña',
              rol: 'CAJA',
              activo: true,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  await conServidor(fakeDbOnline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, nombre_usuario: 'admin', rol: 'ADMIN' });
    const res = await fetch(`${base}/api/v1/usuarios`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(res.status, 200);
    const lista = await res.json();
    assert.equal(lista.length, 1);
    assert.equal(lista[0].nombre_usuario, 'cajera1');
  });
});
