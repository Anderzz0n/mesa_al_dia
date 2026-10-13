// Punto de entrada: aquí se ensamblan las piezas y se enciende el servidor.
import http from 'node:http';
import { config } from './config.js';
import { crearBaseDatos } from './db.js';
import { crearApp } from './app.js';

const db = crearBaseDatos(config.urlBaseDatos);
const app = crearApp({ db });

// Se crea el servidor HTTP "a mano" (y no con app.listen) porque en el
// siguiente paso le conectaremos el WebSocket al MISMO servidor:
// una sola entrada para la API y para los eventos en tiempo real.
const servidor = http.createServer(app);

servidor.listen(config.puerto, () => {
  console.log(`Mesa al día escuchando en http://localhost:${config.puerto}`);
});

// Apagado ordenado (Ctrl+C o cuando el sistema pide detener el programa):
// deja de aceptar peticiones y cierra las conexiones a la base de datos.
function apagar() {
  console.log('Apagando...');
  servidor.close(async () => {
    await db.cerrar();
    process.exit(0);
  });
}
process.on('SIGINT', apagar);
process.on('SIGTERM', apagar);
