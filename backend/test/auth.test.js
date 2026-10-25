import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';
import { crearMiddlewareAuth } from '../src/middleware/auth.js';

const SECRETO_TEST = 'secreto_super_secreto_para_pruebas_123';

async function conServidorAuth(db, prueba) {
  const routerAdicional = http.createServer(); // dummy
  const expressRouter = (await import('express')).default.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(SECRETO_TEST);

  expressRouter.get('/solo-admin', autenticar, exigirRol('ADMIN'), (req, res) => {
    res.json({ ok: true, usuario: req.usuario });
  });

  const app = crearApp({
    db,
    configAuth: { secreto: SECRETO_TEST, expiracion: '1h' },
    rutasAdicionales: expressRouter,
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

test('POST /auth/login responde 400 cuando falta usuario o contraseña', async () => {
  const fakeDb = { query: async () => ({ rows: [] }) };
  await conServidorAuth(fakeDb, async (base) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario: 'admin' }), // falta contrasena
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.codigo, 'DATOS_INVALIDOS');
  });
});

test('POST /auth/login responde 401 si el usuario no existe', async () => {
  const fakeDb = { query: async () => ({ rows: [] }) };
  await conServidorAuth(fakeDb, async (base) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario: 'usuario_fantasma', contrasena: '123456' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.codigo, 'CREDENCIALES_INVALIDAS');
  });
});

test('POST /auth/login responde 401 si la contraseña es incorrecta', async () => {
  const hashValido = await bcrypt.hash('clave_correcta', 6);
  const fakeDb = {
    query: async () => ({
      rows: [
        {
          id: 10,
          nombre_usuario: 'carlos',
          nombre_completo: 'Carlos Test',
          contrasena_hash: hashValido,
          activo: true,
          rol: 'MESERO',
        },
      ],
    }),
  };

  await conServidorAuth(fakeDb, async (base) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario: 'carlos', contrasena: 'clave_equivocada' }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.codigo, 'CREDENCIALES_INVALIDAS');
  });
});

test('POST /auth/login responde 403 si el usuario está inactivo', async () => {
  const hashValido = await bcrypt.hash('123456', 6);
  const fakeDb = {
    query: async () => ({
      rows: [
        {
          id: 11,
          nombre_usuario: 'inactivo',
          nombre_completo: 'Inactivo Test',
          contrasena_hash: hashValido,
          activo: false,
          rol: 'MESERO',
        },
      ],
    }),
  };

  await conServidorAuth(fakeDb, async (base) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario: 'inactivo', contrasena: '123456' }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.codigo, 'USUARIO_INACTIVO');
  });
});

test('POST /auth/login responde 200 con token y usuario al autenticar con éxito', async () => {
  const hashValido = await bcrypt.hash('secreto123', 6);
  const fakeDb = {
    query: async () => ({
      rows: [
        {
          id: 42,
          nombre_usuario: 'admin_test',
          nombre_completo: 'Administrador Principal',
          contrasena_hash: hashValido,
          activo: true,
          rol: 'ADMIN',
        },
      ],
    }),
  };

  await conServidorAuth(fakeDb, async (base) => {
    const res = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre_usuario: 'admin_test', contrasena: 'secreto123' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.usuario.nombre_usuario, 'admin_test');
    assert.equal(body.usuario.rol, 'ADMIN');

    // Validar token emitido
    const verificado = jwt.verify(body.token, SECRETO_TEST);
    assert.equal(verificado.id, 42);
    assert.equal(verificado.rol, 'ADMIN');
  });
});

test('GET /auth/yo responde 401 si no hay token o es inválido', async () => {
  const fakeDb = { query: async () => ({ rows: [] }) };
  await conServidorAuth(fakeDb, async (base) => {
    // Sin cabecera
    const resSinToken = await fetch(`${base}/api/v1/auth/yo`);
    assert.equal(resSinToken.status, 401);

    // Con token dañado
    const resTokenMalo = await fetch(`${base}/api/v1/auth/yo`, {
      headers: { Authorization: 'Bearer token_invalido_xyz' },
    });
    assert.equal(resTokenMalo.status, 401);
  });
});

test('GET /auth/yo y POST /auth/logout funcionan con token Bearer válido', async () => {
  const fakeDb = { query: async () => ({ rows: [] }) };
  const token = jwt.sign(
    { id: 7, nombre_usuario: 'mesero1', nombre_completo: 'Mesero Uno', rol: 'MESERO' },
    SECRETO_TEST
  );

  await conServidorAuth(fakeDb, async (base) => {
    // GET /yo
    const resYo = await fetch(`${base}/api/v1/auth/yo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resYo.status, 200);
    const bodyYo = await resYo.json();
    assert.equal(bodyYo.usuario.nombre_usuario, 'mesero1');
    assert.equal(bodyYo.usuario.rol, 'MESERO');

    // POST /logout
    const resLogout = await fetch(`${base}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resLogout.status, 200);
    const bodyLogout = await resLogout.json();
    assert.equal(bodyLogout.ok, true);
  });
});

test('Middleware exigirRol permite el rol indicado y bloquea roles no autorizados con 403', async () => {
  const fakeDb = { query: async () => ({ rows: [] }) };
  const tokenAdmin = jwt.sign({ id: 1, rol: 'ADMIN' }, SECRETO_TEST);
  const tokenMesero = jwt.sign({ id: 2, rol: 'MESERO' }, SECRETO_TEST);

  await conServidorAuth(fakeDb, async (base) => {
    // Mesero intentando entrar a ruta de ADMIN -> 403
    const resMesero = await fetch(`${base}/api/v1/solo-admin`, {
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resMesero.status, 403);
    const body403 = await resMesero.json();
    assert.equal(body403.codigo, 'ACCESO_DENEGADO');

    // Admin entrando a ruta de ADMIN -> 200
    const resAdmin = await fetch(`${base}/api/v1/solo-admin`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resAdmin.status, 200);
    const body200 = await resAdmin.json();
    assert.equal(body200.ok, true);
  });
});
