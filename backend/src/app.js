// Construye la aplicación Express. NO abre ningún puerto: eso lo hace server.js.
// Separarlos permite probar la aplicación sin levantar un servidor real, y
// recibe la base de datos como parámetro (así las pruebas usan una falsa).
import express from 'express';
import { rutaSalud } from './rutas/salud.js';
import { rutaAuth } from './rutas/auth.js';
import { rutaMesas } from './rutas/mesas.js';
import { rutaSectores } from './rutas/sectores.js';
import { rutaMeseros } from './rutas/meseros.js';
import { rutaUsuarios } from './rutas/usuarios.js';
import { rutaCategorias } from './rutas/categorias.js';
import { rutaProductos } from './rutas/productos.js';
import { rutaOpciones } from './rutas/opciones.js';
import { rutaParametros } from './rutas/parametros.js';
import { rutaCuentas } from './rutas/cuentas.js';
import { rutaPedidos } from './rutas/pedidos.js';
import { manejadorErrores, rutaNoEncontrada } from './errores.js';

export function crearApp({ db, tiempoReal = null, configAuth = {}, rutasAdicionales = null } = {}) {
  const app = express();

  // Convierte el cuerpo JSON de cada petición en un objeto: req.body
  app.use(express.json());

  // Registro simple de cada petición (método, ruta, estado y duración)
  app.use((req, res, siguiente) => {
    const inicio = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio} ms)`);
    });
    siguiente();
  });

  // Rutas REST (RF1, RF2, RF15, RF3 / Menú, RF6 / Parámetros, RF12 / Pedidos)
  app.use('/api/v1/salud', rutaSalud(db));
  app.use('/api/v1/auth', rutaAuth(db, configAuth));
  app.use('/api/v1/usuarios', rutaUsuarios(db, { secreto: configAuth.secreto }));
  app.use('/api/v1/mesas', rutaMesas(db, { tiempoReal, secreto: configAuth.secreto }));
  app.use('/api/v1/sectores', rutaSectores(db, { tiempoReal, secreto: configAuth.secreto }));
  app.use('/api/v1/meseros', rutaMeseros(db, { secreto: configAuth.secreto }));
  app.use('/api/v1/categorias', rutaCategorias(db, { secreto: configAuth.secreto }));
  app.use('/api/v1/productos', rutaProductos(db, { tiempoReal, secreto: configAuth.secreto }));
  app.use('/api/v1/opciones', rutaOpciones(db, { tiempoReal, secreto: configAuth.secreto }));
  app.use('/api/v1/parametros', rutaParametros(db, { tiempoReal, secreto: configAuth.secreto }));
  app.use('/api/v1/cuentas', rutaCuentas(db, { tiempoReal, secreto: configAuth.secreto }));
  app.use('/api/v1/pedidos', rutaPedidos(db, { tiempoReal, secreto: configAuth.secreto }));

  if (rutasAdicionales) {
    app.use('/api/v1', rutasAdicionales);
  }

  // El ORDEN importa: primero las rutas, luego "no encontrado" de la API, al final los errores.
  app.use('/api', rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
