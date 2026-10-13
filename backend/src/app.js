// Construye la aplicación Express. NO abre ningún puerto: eso lo hace server.js.
// Separarlos permite probar la aplicación sin levantar un servidor real, y
// recibe la base de datos como parámetro (así las pruebas usan una falsa).
import express from 'express';
import { rutaSalud } from './rutas/salud.js';
import { manejadorErrores, rutaNoEncontrada } from './errores.js';

export function crearApp({ db }) {
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

  // Rutas. Aquí se irán montando los módulos: /usuarios, /mesas, /pedidos...
  app.use('/api/v1/salud', rutaSalud(db));

  // El ORDEN importa: primero las rutas, luego "no encontrado", al final los errores.
  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}
