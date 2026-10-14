// Lista única de roles de la aplicación. La pantalla de inicio y las rutas
// salen de aquí, así que agregar o renombrar un rol se hace en un solo lugar.
// Provisional: cuando exista el login (RF1) cada usuario verá solo su rol.
export const roles = [
  { ruta: '/mesero', nombre: 'Mesero', descripcion: 'Mesas, cuentas y pedidos' },
  { ruta: '/cocina', nombre: 'Cocina', descripcion: 'Comandas de cocina' },
  { ruta: '/bar', nombre: 'Bar', descripcion: 'Comandas de bebidas' },
  { ruta: '/caja', nombre: 'Caja', descripcion: 'Cobro y cancelaciones' },
  { ruta: '/admin', nombre: 'Administrador', descripcion: 'Menú, sectores y personal' },
]
