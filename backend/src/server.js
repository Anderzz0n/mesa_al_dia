// Punto de entrada: aquí se ensamblan las piezas y se enciende el servidor.
import http from 'node:http';
import { config } from './config.js';
import { crearBaseDatos } from './db.js';
import { crearApp } from './app.js';
import { crearTiempoReal } from './tiempo_real.js';

const db = crearBaseDatos(config.urlBaseDatos);

let tiempoReal = null;
const emisorTiempoReal = {
  emitir: (sala, evento, datos) => tiempoReal?.emitir(sala, evento, datos),
};

const app = crearApp({ db, tiempoReal: emisorTiempoReal });

// Se crea el servidor HTTP "a mano" (y no con app.listen) para conectarle el
// WebSocket al MISMO servidor: una sola entrada para la API y los eventos.
const servidor = http.createServer(app);
tiempoReal = crearTiempoReal(servidor);

servidor.listen(config.puerto, () => {
  console.log(`Mesa al día escuchando en http://localhost:${config.puerto}`);
});

// Apagado ordenado (Ctrl+C o cuando el sistema pide detener el programa):
// deja de aceptar peticiones y cierra las conexiones a la base de datos.
function apagar() {
  console.log('Apagando...');
  // io.close() también cierra el servidor HTTP; las conexiones WebSocket
  // abiertas impedirían que servidor.close() termine.
  tiempoReal.cerrar().then(async () => {
    await db.cerrar();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
