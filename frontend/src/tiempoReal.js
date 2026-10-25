// Conexión en vivo (WebSocket) con el backend usando Socket.IO y JWT.
import { io } from 'socket.io-client';
import { obtenerToken } from './api.js';

/**
 * Abre la conexión WebSocket enviando el token JWT en el handshake.
 * El servidor asigna automáticamente las salas que corresponden al rol del usuario.
 * @param {string} [tokenPersonalizado] - Token opcional (si no se pasa, toma el de la sesión activa).
 */
export function conectarTiempoReal(tokenPersonalizado) {
  const token = tokenPersonalizado || obtenerToken();
  if (token) {
    return io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });
  }
  return io({
    transports: ['websocket', 'polling'],
  });
}
