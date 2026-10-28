import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './backend/src/config.js';
import { crearBaseDatos } from './backend/src/db.js';
import { crearApp } from './backend/src/app.js';
import { crearTiempoReal } from './backend/src/tiempo_real.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = crearBaseDatos(config.urlBaseDatos);

let tiempoReal = null;
const emisorTiempoReal = {
  emitir: (sala, evento, datos) => tiempoReal?.emitir(sala, evento, datos),
};

const app = crearApp({ db, tiempoReal: emisorTiempoReal });

const servidor = http.createServer(app);
tiempoReal = crearTiempoReal(servidor);

function obtenerArgumento(nombre) {
  const idx = process.argv.indexOf(nombre);
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  return null;
}

const puertoArg = obtenerArgumento('--port') || obtenerArgumento('-p');
const hostArg = obtenerArgumento('--host') || obtenerArgumento('-h');
const PUERTO = Number(puertoArg || process.env.PORT || process.env.PUERTO || config.puerto || 3000);
const HOST = hostArg || process.env.HOST || '0.0.0.0';

const isProduction = process.env.NODE_ENV === 'production';

// Servir la documentación y los wireframes estáticos directamente en el navegador
app.use('/docs', express.static(path.resolve(__dirname, 'docs')));

if (isProduction) {
  const distPath = path.resolve(__dirname, 'frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: path.resolve(__dirname, 'frontend'),
    configFile: path.resolve(__dirname, 'frontend/vite.config.js'),
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

servidor.listen(PUERTO, HOST, () => {
  console.log(`Mesa al día escuchando en http://${HOST}:${PUERTO}`);
});

function apagar() {
  console.log('Apagando...');
  if (tiempoReal?.cerrar) {
    try {
      tiempoReal.cerrar();
    } catch (_) {}
  }
  if (db?.cerrar) {
    try {
      db.cerrar();
    } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
