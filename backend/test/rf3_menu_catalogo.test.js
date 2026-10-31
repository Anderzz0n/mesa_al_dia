import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { crearApp } from '../src/app.js';

const SECRETO = 'clave-secreta-para-pruebas-de-menu-rf3';

function generarToken(payload) {
  return jwt.sign(payload, SECRETO, { expiresIn: '1h' });
}

function conServidorRF3(fakeDb, fn) {
  const app = crearApp({ db: fakeDb, configAuth: { secreto: SECRETO } });
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

test('RF3: GET /api/v1/categorias exige autenticacion y devuelve lista ordenada', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    // 1. Sin token -> 401
    const resSinToken = await fetch(`${base}/api/v1/categorias`);
    assert.equal(resSinToken.status, 401);

    // 2. Con token -> 200
    const token = generarToken({ id: 3, rol: 'MESERO' });
    const res = await fetch(`${base}/api/v1/categorias`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const categorias = await res.json();
    assert.ok(Array.isArray(categorias));
    assert.ok(categorias.length >= 3);
    // Orden ascendente
    for (let i = 0; i < categorias.length - 1; i++) {
      assert.ok(categorias[i].orden <= categorias[i + 1].orden);
    }
  });
});

test('RF3: GET /api/v1/productos devuelve catalogo con opciones y componentes de combo', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const token = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. Catálogo completo
    const res = await fetch(`${base}/api/v1/productos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const productos = await res.json();
    assert.ok(Array.isArray(productos));
    assert.ok(productos.length >= 4);

    // Verificar estructura de un producto regular
    const hamburguesa = productos.find((p) => p.nombre === 'Hamburguesa Clásica');
    assert.ok(hamburguesa);
    assert.equal(hamburguesa.destino, 'COCINA');
    assert.equal(hamburguesa.es_combo, false);
    assert.ok(Array.isArray(hamburguesa.opciones));
    assert.ok(hamburguesa.opciones.length > 0);

    // Verificar estructura de un combo
    const combo = productos.find((p) => p.nombre === 'Combo Almuerzo Ejecutivo');
    assert.ok(combo);
    assert.equal(combo.es_combo, true);
    assert.equal(combo.destino, null);
    assert.ok(Array.isArray(combo.componentes));
    assert.equal(combo.componentes.length, 3);

    // 2. Filtro por categoría (ID 3 = Bebidas)
    const resCat = await fetch(`${base}/api/v1/productos?categoria=3`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bebidas = await resCat.json();
    assert.ok(bebidas.every((b) => b.categoria_id === 3));

    // 3. Filtro por destino COCINA (excluye bar y combos sin destino directo)
    const resCocina = await fetch(`${base}/api/v1/productos?destino=COCINA`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cocinaProds = await resCocina.json();
    assert.ok(cocinaProds.length > 0);
    assert.ok(cocinaProds.every((p) => p.destino === 'COCINA'));
    assert.ok(!cocinaProds.some((p) => p.es_combo));
  });
});

test('RF3: calculo de disponibilidad de combo segun componentes no removibles', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const token = generarToken({ id: 3, rol: 'MESERO' });
    const res = await fetch(`${base}/api/v1/productos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const productos = await res.json();
    const combo = productos.find((p) => p.nombre === 'Combo Almuerzo Ejecutivo');

    // Inicialmente disponible
    assert.equal(combo.disponible_calculado, true);
  });
});

test('RF3: GET /api/v1/opciones devuelve opciones con restricciones y usada_en', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const token = generarToken({ id: 3, rol: 'MESERO' });

    // 1. Todas las opciones
    const res = await fetch(`${base}/api/v1/opciones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const opciones = await res.json();
    assert.ok(Array.isArray(opciones));
    assert.ok(opciones.length >= 4);

    const terminoMedio = opciones.find((o) => o.nombre === 'Término Medio');
    assert.ok(terminoMedio);
    assert.equal(terminoMedio.tipo, 'PREFERENCIA');
    assert.ok(Array.isArray(terminoMedio.restricciones));
    assert.ok(terminoMedio.restricciones.length >= 2); // Incompatible con 3/4 y Bien Cocido
    assert.ok(Array.isArray(terminoMedio.usada_en));
    assert.ok(terminoMedio.usada_en.some((p) => p.nombre === 'Hamburguesa Clásica'));

    // 2. Filtro por destino BAR
    const resBar = await fetch(`${base}/api/v1/opciones?destino=BAR`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resBar.status, 200);
    const opcionesBar = await resBar.json();
    assert.ok(opcionesBar.some((o) => o.nombre === 'Hierbabuena Fresca'));
    assert.ok(!opcionesBar.some((o) => o.nombre === 'Término Medio'));
  });
});

test('RF3: simulacion con base de datos PostgreSQL activa', async () => {
  const fakeDbOnline = {
    query: async (sql, params = []) => {
      if (sql.includes('FROM categoria')) {
        return {
          rows: [
            { id: 1, nombre: 'Entradas', orden: 1 },
            { id: 2, nombre: 'Platos Fuertes', orden: 2 },
          ],
        };
      }
      if (sql.includes('FROM producto p')) {
        return {
          rows: [
            {
              id: 1,
              nombre: 'Hamburguesa Clásica',
              descripcion: 'Carne 150g',
              categoria_id: 2,
              categoria_nombre: 'Platos Fuertes',
              precio: 22000,
              es_combo: false,
              destino: 'COCINA',
              permite_llevar: true,
              permite_anticipada: true,
              disponible: true,
              stock_cantidad: 50,
            },
          ],
        };
      }
      if (sql.includes('FROM producto_opcion po')) {
        return {
          rows: [
            {
              producto_id: 1,
              id: 1,
              nombre: 'Término Medio',
              tipo: 'PREFERENCIA',
              precio_extra: 0,
              disponible: true,
            },
          ],
        };
      }
      if (sql.includes('FROM combo_componente cc')) {
        return { rows: [] };
      }
      if (sql.includes('FROM opcion')) {
        return {
          rows: [
            { id: 1, nombre: 'Término Medio', tipo: 'PREFERENCIA', precio_extra: 0, disponible: true },
          ],
        };
      }
      if (sql.includes('FROM restriccion_opcion')) {
        return { rows: [] };
      }
      if (sql.includes('FROM producto_opcion po JOIN producto p')) {
        return {
          rows: [
            { opcion_id: 1, producto_id: 1, producto_nombre: 'Hamburguesa Clásica', destino: 'COCINA' },
          ],
        };
      }
      return { rows: [] };
    },
  };

  await conServidorRF3(fakeDbOnline, async (base) => {
    const token = generarToken({ id: 1, rol: 'ADMIN' });

    const resCat = await fetch(`${base}/api/v1/categorias`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resCat.status, 200);
    const categorias = await resCat.json();
    assert.equal(categorias.length, 2);

    const resProd = await fetch(`${base}/api/v1/productos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(resProd.status, 200);
    const productos = await resProd.json();
    assert.equal(productos.length, 1);
    assert.equal(productos[0].opciones.length, 1);
  });
});

test('RF3: POST /api/v1/productos valida rol ADMIN, datos requeridos y reglas de combos', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. Rol no autorizado -> 403
    const resNoAuth = await fetch(`${base}/api/v1/productos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMesero}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Nuevo Plato', precio: 10000, categoria_id: 1, destino: 'COCINA' }),
    });
    assert.equal(resNoAuth.status, 403);

    // 2. Datos inválidos (precio negativo) -> 400 DATOS_INVALIDOS
    const resInvalido = await fetch(`${base}/api/v1/productos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Plato Malo', precio: -500, categoria_id: 1, destino: 'COCINA' }),
    });
    assert.equal(resInvalido.status, 400);
    const bodyInvalido = await resInvalido.json();
    assert.equal(bodyInvalido.codigo, 'DATOS_INVALIDOS');

    // 3. Regla combo inválida (combo con destino directo o sin componentes) -> 400
    const resComboMal = await fetch(`${base}/api/v1/productos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Combo Invalido',
        precio: 25000,
        categoria_id: 5,
        es_combo: true,
        destino: 'COCINA', // Prohibido en combos
        componentes: [],
      }),
    });
    assert.equal(resComboMal.status, 400);

    // 4. Nombre duplicado -> 409 PRODUCTO_NOMBRE_REPETIDO
    const resDuplicado = await fetch(`${base}/api/v1/productos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Hamburguesa Clásica',
        precio: 25000,
        categoria_id: 2,
        destino: 'COCINA',
      }),
    });
    assert.equal(resDuplicado.status, 409);
    const bodyDuplicado = await resDuplicado.json();
    assert.equal(bodyDuplicado.codigo, 'PRODUCTO_NOMBRE_REPETIDO');

    // 5. Creación exitosa de producto individual -> 201
    const resOk = await fetch(`${base}/api/v1/productos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Sandwich de Pollo Crispy',
        descripcion: 'Pechuga apanada con salsa tártara',
        categoria_id: 2,
        precio: 24000,
        destino: 'COCINA',
        permite_llevar: true,
        stock_cantidad: 40,
        opciones: [6],
      }),
    });
    assert.equal(resOk.status, 201);
    const nuevo = await resOk.json();
    assert.ok(nuevo.id);
    assert.equal(nuevo.nombre, 'Sandwich de Pollo Crispy');
    assert.equal(nuevo.precio, 24000);

    // 6. Creación exitosa de combo -> 201
    const resComboOk = await fetch(`${base}/api/v1/productos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Super Combo Familiar',
        descripcion: '2 Hamburguesas + 2 Papas + 2 Bebidas',
        categoria_id: 5,
        precio: 52000,
        es_combo: true,
        componentes: [
          { producto_id: 1, cantidad: 2, removible: false },
          { producto_id: 2, cantidad: 2, removible: true },
        ],
      }),
    });
    assert.equal(resComboOk.status, 201);
    const nuevoCombo = await resComboOk.json();
    assert.equal(nuevoCombo.es_combo, true);
    assert.equal(nuevoCombo.destino, null);
    assert.equal(nuevoCombo.componentes.length, 2);
  });
});

test('RF3: PATCH /api/v1/productos/:id actualiza producto y valida existencia', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. Producto inexistente -> 404
    const res404 = await fetch(`${base}/api/v1/productos/99999`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio: 30000 }),
    });
    assert.equal(res404.status, 404);

    // 2. Actualización exitosa -> 200
    const resOk = await fetch(`${base}/api/v1/productos/1`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ precio: 23500, stock_cantidad: 45 }),
    });
    assert.equal(resOk.status, 200);
    const actualizado = await resOk.json();
    assert.equal(actualizado.id, 1);
    assert.equal(actualizado.precio, 23500);
    assert.equal(actualizado.stock_cantidad, 45);
  });
});

test('RF3: PATCH /api/v1/opciones/:id valida DESTINO_NO_PERMITIDO para cocina/bar', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const tokenBar = generarToken({ id: 5, rol: 'BAR' });
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // Opción 1 (Término Medio) solo pertenece a Hamburguesa Clásica (COCINA).
    // 1. Usuario de BAR intentando modificar Término Medio -> 403 DESTINO_NO_PERMITIDO
    const resBar = await fetch(`${base}/api/v1/opciones/1`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenBar}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: false }),
    });
    assert.equal(resBar.status, 403);
    const bodyBar = await resBar.json();
    assert.equal(bodyBar.codigo, 'DESTINO_NO_PERMITIDO');

    // 2. Usuario de COCINA modificando Término Medio -> 200
    const resCocina = await fetch(`${base}/api/v1/opciones/1`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenCocina}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: false }),
    });
    assert.equal(resCocina.status, 200);
    const opCocina = await resCocina.json();
    assert.equal(opCocina.disponible, false);

    // 3. Admin reactivando la opción -> 200
    const resAdmin = await fetch(`${base}/api/v1/opciones/1`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: true }),
    });
    assert.equal(resAdmin.status, 200);
    const opAdmin = await resAdmin.json();
    assert.equal(opAdmin.disponible, true);
  });
});

test('RF9: PATCH /api/v1/productos/:id/stock con corrección silenciosa (CU22) y control por área', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenBar = generarToken({ id: 5, rol: 'BAR' });

    // Producto 3 (Cerveza Artesanal IPA) es de BAR.
    // 1. Cocina intentando modificar stock de BAR -> 403 DESTINO_NO_PERMITIDO
    const resNoArea = await fetch(`${base}/api/v1/productos/3/stock`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenCocina}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: 20 }),
    });
    assert.equal(resNoArea.status, 403);
    const bodyNoArea = await resNoArea.json();
    assert.equal(bodyNoArea.codigo, 'DESTINO_NO_PERMITIDO');

    // 2. Bar enviando cantidad negativa y decimal (ej. -4.8) -> corrección silenciosa a 0
    const resNegativo = await fetch(`${base}/api/v1/productos/3/stock`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenBar}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: -4.8 }),
    });
    assert.equal(resNegativo.status, 200);
    const bodyNegativo = await resNegativo.json();
    assert.equal(bodyNegativo.stock_cantidad, 0);
    assert.equal(bodyNegativo.disponible, false); // Pasa automáticamente a false al quedar en 0

    // 3. Bar enviando cantidad decimal válida (ej. 15.6) -> corrección silenciosa redondeada a 16
    const resDecimal = await fetch(`${base}/api/v1/productos/3/stock`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenBar}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: 15.6 }),
    });
    assert.equal(resDecimal.status, 200);
    const bodyDecimal = await resDecimal.json();
    assert.equal(bodyDecimal.stock_cantidad, 16);
    assert.equal(bodyDecimal.disponible, true); // Se reactiva

    // 4. Bar enviando ajuste relativo (ej. ajuste: -5)
    const resAjuste = await fetch(`${base}/api/v1/productos/3/stock`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenBar}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ajuste: -5 }),
    });
    assert.equal(resAjuste.status, 200);
    const bodyAjuste = await resAjuste.json();
    assert.equal(bodyAjuste.stock_cantidad, 11);
  });
});

test('RF9: PATCH /api/v1/productos/:id/disponibilidad y restriccion con stock en cero', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const tokenBar = generarToken({ id: 5, rol: 'BAR' });

    // 1. Dejar stock en 0
    await fetch(`${base}/api/v1/productos/3/stock`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenBar}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cantidad: 0 }),
    });

    // 2. Intentar habilitar disponible = true con stock en 0 -> 422
    const resForzar = await fetch(`${base}/api/v1/productos/3/disponibilidad`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenBar}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: true }),
    });
    assert.equal(resForzar.status, 422);

    // 3. Deshabilitar producto 1 de Cocina con token de cocina -> 200
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const resBloquear = await fetch(`${base}/api/v1/productos/1/disponibilidad`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenCocina}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ disponible: false }),
    });
    assert.equal(resBloquear.status, 200);
    const bodyBloquear = await resBloquear.json();
    assert.equal(bodyBloquear.disponible, false);
  });
});

test('RF6: Parametros operativos y preparacion anticipada por area', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const tokenCocina = generarToken({ id: 4, rol: 'COCINA' });
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });

    // 1. GET /parametros devuelve estado actual
    const resParams = await fetch(`${base}/api/v1/parametros`, {
      headers: { Authorization: `Bearer ${tokenCocina}` },
    });
    assert.equal(resParams.status, 200);
    const params = await resParams.json();
    assert.equal(typeof params.ANTICIPADA_ACTIVA_COCINA, 'boolean');
    assert.equal(typeof params.VENTANA_CANCELACION_MINUTOS, 'number');

    // 2. Cocina cambiando su interruptor de anticipada -> 200
    const resAnticipada = await fetch(`${base}/api/v1/parametros/anticipada`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenCocina}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ destino: 'COCINA', activa: false }),
    });
    assert.equal(resAnticipada.status, 200);
    const bodyAnticipada = await resAnticipada.json();
    assert.equal(bodyAnticipada.destino, 'COCINA');
    assert.equal(bodyAnticipada.activa, false);

    // 3. Cocina intentando cambiar el interruptor de BAR -> 403 DESTINO_NO_PERMITIDO
    const resAntBar = await fetch(`${base}/api/v1/parametros/anticipada`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenCocina}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ destino: 'BAR', activa: false }),
    });
    assert.equal(resAntBar.status, 403);

    // 4. Admin cambiando parámetro operativo (ej. VENTANA_CANCELACION_MINUTOS) -> 200
    const resAdminParam = await fetch(`${base}/api/v1/parametros/VENTANA_CANCELACION_MINUTOS`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: 5 }),
    });
    assert.equal(resAdminParam.status, 200);
    const bodyAdminParam = await resAdminParam.json();
    assert.equal(bodyAdminParam.valor, 5);

    // 5. Admin con valor inválido (ej. negativo o texto) -> 400 DATOS_INVALIDOS
    const resParamInvalido = await fetch(`${base}/api/v1/parametros/VENTANA_CANCELACION_MINUTOS`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: -2 }),
    });
    assert.equal(resParamInvalido.status, 400);

    // 6. Admin actualizando umbrales de demora de Cocina y Bar -> 200
    const resUmbralCocina = await fetch(`${base}/api/v1/parametros/UMBRAL_DEMORA_COCINA_MINUTOS`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: 25 }),
    });
    assert.equal(resUmbralCocina.status, 200);
    const bodyCocina = await resUmbralCocina.json();
    assert.equal(bodyCocina.valor, 25);

    const resUmbralBar = await fetch(`${base}/api/v1/parametros/UMBRAL_DEMORA_BAR_MINUTOS`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: 10 }),
    });
    assert.equal(resUmbralBar.status, 200);
    const bodyBar = await resUmbralBar.json();
    assert.equal(bodyBar.valor, 10);

    // 7. Mesero intentando modificar parámetros del sistema -> 403
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });
    const resMeseroParam = await fetch(`${base}/api/v1/parametros/VENTANA_CANCELACION_MINUTOS`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenMesero}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: 10 }),
    });
    assert.equal(resMeseroParam.status, 403);
  });
});

test('RF3 / A3c: gestion integral de restricciones de personalizacion de opciones', async () => {
  await conServidorRF3(fakeDbOffline, async (base) => {
    const tokenAdmin = generarToken({ id: 1, rol: 'ADMIN' });
    const tokenMesero = generarToken({ id: 3, rol: 'MESERO' });

    // 1. GET /api/v1/opciones/restricciones devuelve lista con nombres
    const resGet = await fetch(`${base}/api/v1/opciones/restricciones`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resGet.status, 200);
    const restricciones = await resGet.json();
    assert.ok(Array.isArray(restricciones));
    assert.ok(restricciones.length >= 2);
    const primera = restricciones[0];
    assert.ok(primera.opcion_a_id);
    assert.ok(primera.opcion_b_id);
    assert.ok(primera.opcion_a_nombre);
    assert.ok(primera.opcion_b_nombre);
    assert.ok(primera.motivo);

    // 2. Mesero intentando crear una restriccion -> 403
    const resMeseroPost = await fetch(`${base}/api/v1/opciones/restricciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenMesero}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ opcion_a_id: 4, opcion_b_id: 6, motivo: 'Incompatible' }),
    });
    assert.equal(resMeseroPost.status, 403);

    // 3. Admin intentando restringir opcion consigo misma -> 400
    const resMisma = await fetch(`${base}/api/v1/opciones/restricciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ opcion_a_id: 4, opcion_b_id: 4 }),
    });
    assert.equal(resMisma.status, 400);

    // 4. Admin creando nueva restriccion valida (4 y 6)
    const resCrear = await fetch(`${base}/api/v1/opciones/restricciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opcion_a_id: 4,
        opcion_b_id: 6,
        motivo: 'Grasa incompatible con restriccion dietaria',
      }),
    });
    assert.equal(resCrear.status, 201);
    const nueva = await resCrear.json();
    assert.equal(nueva.opcion_a_id, 4);
    assert.equal(nueva.opcion_b_id, 6);
    assert.equal(nueva.motivo, 'Grasa incompatible con restriccion dietaria');

    // 5. Intentar crear duplicado (mismo par aunque invertido 6 y 4) -> 409
    const resDup = await fetch(`${base}/api/v1/opciones/restricciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ opcion_a_id: 6, opcion_b_id: 4 }),
    });
    assert.equal(resDup.status, 409);

    // 6. Mesero intentando eliminar restriccion -> 403
    const resMeseroDel = await fetch(`${base}/api/v1/opciones/restricciones/4/6`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenMesero}` },
    });
    assert.equal(resMeseroDel.status, 403);

    // 7. Admin eliminando restriccion -> 200
    const resAdminDel = await fetch(`${base}/api/v1/opciones/restricciones/4/6`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    assert.equal(resAdminDel.status, 200);

    // 8. Admin creando nueva opcion general en el catalogo
    const resNuevaOp = await fetch(`${base}/api/v1/opciones`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenAdmin}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Salsa Picante Habanero',
        tipo: 'ADICIONAL',
        precio_extra: 2500,
      }),
    });
    assert.equal(resNuevaOp.status, 201);
    const opCreada = await resNuevaOp.json();
    assert.equal(opCreada.nombre, 'Salsa Picante Habanero');
    assert.equal(opCreada.precio_extra, 2500);
  });
});



