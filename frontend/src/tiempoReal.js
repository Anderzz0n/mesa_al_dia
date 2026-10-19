// Conexión en vivo (WebSocket) con el backend, usando Socket.IO.
import { io } from 'socket.io-client'

// Abre la conexión pidiendo entrar a ciertas salas (cocina, bar, mesero:7...).
// PROVISIONAL: hoy el backend acepta lo que pida el cliente; con el login
// (RF1) las salas saldrán del rol del token. Sin dirección, Socket.IO usa la
// misma de la página, y el proxy de Vite la reenvía al backend.
export function conectarTiempoReal(salas = []) {
  return io({ auth: { salas } })
}
