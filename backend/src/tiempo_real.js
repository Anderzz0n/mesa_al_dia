// Eventos en tiempo real (WebSocket) con Socket.IO.
// Regla del diseño (docs/02_api_y_eventos.md): el WebSocket SOLO AVISA.
// Las acciones llegan por REST; después el servidor llama a emitir(...) para
// avisar a quien corresponda. Los clientes no envían órdenes por aquí.
import { Server } from 'socket.io';

// Una "sala" (room) es un grupo con nombre. Un cliente puede estar en varias.
// Emitir a una sala la reciben solo los que están dentro. Salas del diseño:
//   cocina, bar, caja, admin, meseros (todos) y mesero:{id} (uno solo).

// PROVISIONAL (hasta RF1, Sprint 2): todavía no hay login, así que el cliente
// dice a qué salas quiere entrar:  io(url, { auth: { salas: ['cocina'] } }).
// Esto NO es seguro: cualquiera podría escuchar cualquier sala. Cuando exista
// el token Bearer se reemplaza esta función por una que lea el rol del token.
export function salasPorDefecto(socket) {
  const salas = socket.handshake.auth?.salas;
  return Array.isArray(salas) ? salas.filter((s) => typeof s === 'string') : [];
}

// servidorHttp: el MISMO servidor de la API (así hay un solo puerto).
// resolverSalas: función que decide a qué salas entra cada conexión.
export function crearTiempoReal(servidorHttp, { resolverSalas = salasPorDefecto } = {}) {
  const io = new Server(servidorHttp);

  // 'connection' se dispara cada vez que un cliente abre el WebSocket.
  io.on('connection', (socket) => {
    for (const sala of resolverSalas(socket)) {
      socket.join(sala);
    }
  });

  return {
    // emitir('cocina', 'comanda.nueva', { comanda_id: 7 })
    emitir(sala, evento, datos) {
      io.to(sala).emit(evento, datos);
    },
    // Cierra todas las conexiones y el servidor de WebSocket.
    cerrar: () => io.close(),
  };
}
