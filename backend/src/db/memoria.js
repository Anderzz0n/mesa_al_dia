// Almacén en memoria compartido para desarrollo y preview cuando PostgreSQL no está activo.
// Mantiene consistencia entre rutas (mesas, sectores, usuarios, auth) en tiempo real.

export const estadoMemoria = {
  usuarios: [
    {
      id: 1,
      nombre_usuario: 'admin',
      nombre_completo: 'Anderson Rincón (Admin)',
      contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6', // '123456'
      rol: 'ADMIN',
      activo: true,
    },
    {
      id: 2,
      nombre_usuario: 'simon',
      nombre_completo: 'Simón Ruedas (Caja)',
      contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
      rol: 'CAJA',
      activo: true,
    },
    {
      id: 3,
      nombre_usuario: 'miguel',
      nombre_completo: 'Miguel Angulo (Mesero)',
      contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
      rol: 'MESERO',
      activo: true,
    },
    {
      id: 4,
      nombre_usuario: 'cocina',
      nombre_completo: 'Carlos Chef (Cocina)',
      contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
      rol: 'COCINA',
      activo: true,
    },
    {
      id: 5,
      nombre_usuario: 'bar',
      nombre_completo: 'Diana Bartender (Bar)',
      contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
      rol: 'BAR',
      activo: true,
    },
    {
      id: 6,
      nombre_usuario: 'inactivo',
      nombre_completo: 'Usuario Desactivado',
      contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
      rol: 'MESERO',
      activo: false,
    },
    {
      id: 7,
      nombre_usuario: 'laura',
      nombre_completo: 'Laura Gómez (Mesero)',
      contrasena_hash: '$2b$10$X2j0AFxpNZwwG03qxROQ7.QExzcSDDb42yIInAgaGbvVbul2gpcq6',
      rol: 'MESERO',
      activo: true,
    },
  ],

  sectores: [
    { id: 1, nombre: 'Salón Principal' },
    { id: 2, nombre: 'Terraza Exterior' },
    { id: 3, nombre: 'Barra de Coctelería' },
  ],

  mesas: Array.from({ length: 12 }, (_, i) => {
    const numero = i + 1;
    const sector_id = numero <= 6 ? 1 : numero <= 10 ? 2 : 3;
    return { id: numero, numero, sector_id, estado: 'DISPONIBLE' };
  }),

  asignacionesSector: [
    {
      id: 1,
      sector_id: 1,
      mesero_id: 3,
      mesero_nombre: 'Miguel Angulo (Mesero)',
      vigente_desde: new Date().toISOString(),
      vigente_hasta: null,
    },
  ],

  reasignacionesMesa: [],

  pedidos: [
    {
      id: 1,
      cuenta_id: 1,
      mesero_id: 3,
      mesa_numero: 4,
      sector_nombre: 'Salón Principal',
      creado_en: new Date().toISOString(),
      cancelado: false,
    },
  ],
};
