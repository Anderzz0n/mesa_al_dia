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

  parametros: {
    ANTICIPADA_ACTIVA_COCINA: 'true',
    ANTICIPADA_ACTIVA_BAR: 'true',
    VENTANA_CANCELACION_MINUTOS: '3',
    UMBRAL_DEMORA_COCINA_MINUTOS: '20',
    UMBRAL_DEMORA_BAR_MINUTOS: '7',
  },

  categorias: [
    { id: 1, nombre: 'Entradas', orden: 1 },
    { id: 2, nombre: 'Platos Fuertes', orden: 2 },
    { id: 3, nombre: 'Bebidas', orden: 3 },
    { id: 4, nombre: 'Postres', orden: 4 },
    { id: 5, nombre: 'Combos', orden: 5 },
  ],

  productos: [
    {
      id: 1,
      nombre: 'Hamburguesa Clásica',
      descripcion: 'Carne de res 150g con queso cheddar, lechuga y tomate',
      categoria_id: 2,
      precio: 22000,
      es_combo: false,
      destino: 'COCINA',
      permite_llevar: true,
      permite_anticipada: true,
      disponible: true,
      stock_cantidad: 50,
    },
    {
      id: 2,
      nombre: 'Papas Francesas Medianas',
      descripcion: 'Porción de papas crujientes con sal marina',
      categoria_id: 1,
      precio: 8000,
      es_combo: false,
      destino: 'COCINA',
      permite_llevar: true,
      permite_anticipada: true,
      disponible: true,
      stock_cantidad: 100,
    },
    {
      id: 3,
      nombre: 'Cerveza Artesanal IPA',
      descripcion: 'Botella 330ml estilo Indian Pale Ale',
      categoria_id: 3,
      precio: 12000,
      es_combo: false,
      destino: 'BAR',
      permite_llevar: false,
      permite_anticipada: true,
      disponible: true,
      stock_cantidad: 48,
    },
    {
      id: 4,
      nombre: 'Limonada Natural',
      descripcion: 'Vaso 400ml preparado con limón fresco',
      categoria_id: 3,
      precio: 7000,
      es_combo: false,
      destino: 'BAR',
      permite_llevar: true,
      permite_anticipada: true,
      disponible: true,
      stock_cantidad: null,
    },
    {
      id: 5,
      nombre: 'Combo Almuerzo Ejecutivo',
      descripcion: 'Hamburguesa Clásica + Papas Francesas + Gaseosa o Bebida',
      categoria_id: 5,
      precio: 28000,
      es_combo: true,
      destino: null,
      permite_llevar: true,
      permite_anticipada: false,
      disponible: true,
      stock_cantidad: null,
    },
  ],

  comboComponentes: [
    { combo_id: 5, producto_id: 1, cantidad: 1, removible: false },
    { combo_id: 5, producto_id: 2, cantidad: 1, removible: true },
    { combo_id: 5, producto_id: 4, cantidad: 1, removible: true },
  ],

  opciones: [
    { id: 1, nombre: 'Término Medio', tipo: 'PREFERENCIA', precio_extra: 0, disponible: true },
    { id: 2, nombre: 'Término Tres Cuartos', tipo: 'PREFERENCIA', precio_extra: 0, disponible: true },
    { id: 3, nombre: 'Término Bien Cocido', tipo: 'PREFERENCIA', precio_extra: 0, disponible: true },
    { id: 4, nombre: 'Adición de Tocineta Ahumada', tipo: 'ADICIONAL', precio_extra: 4000, disponible: true },
    { id: 5, nombre: 'Hierbabuena Fresca', tipo: 'ADICIONAL', precio_extra: 0, disponible: true },
    { id: 6, nombre: 'Sin Sal', tipo: 'EXCLUSION', precio_extra: 0, disponible: true },
  ],

  productoOpciones: [
    { producto_id: 1, opcion_id: 1 },
    { producto_id: 1, opcion_id: 2 },
    { producto_id: 1, opcion_id: 3 },
    { producto_id: 1, opcion_id: 4 },
    { producto_id: 1, opcion_id: 6 },
    { producto_id: 2, opcion_id: 6 },
    { producto_id: 4, opcion_id: 5 },
  ],

  restriccionesOpciones: [
    { id: 1, opcion_a_id: 1, opcion_b_id: 2, motivo: 'Términos de cocción mutuamente excluyentes' },
    { id: 2, opcion_a_id: 1, opcion_b_id: 3, motivo: 'Términos de cocción mutuamente excluyentes' },
    { id: 3, opcion_a_id: 2, opcion_b_id: 3, motivo: 'Términos de cocción mutuamente excluyentes' },
  ],

  cuentas: [
    {
      id: 1,
      mesa_id: 4,
      etiqueta: 'Cuenta 1',
      estado: 'ABIERTA',
      abierta_en: new Date().toISOString(),
      cerrada_en: null,
      cerrada_por: null,
      metodo_pago: null,
      propina: 0,
    },
  ],

  itemsPedido: [
    {
      id: 1,
      pedido_id: 1,
      producto_id: 1,
      cantidad: 1,
      precio_unitario: 22000,
      modalidad: 'MESA',
      observacion: null,
      item_padre_id: null,
    },
  ],

  itemOpciones: [
    {
      item_id: 1,
      opcion_id: 1,
      precio_extra: 0,
    },
  ],

  comandas: [],

  cancelaciones: [],

  productosPreparados: [
    {
      id: 1,
      producto_id: 2,
      origen: 'REGISTRO_DIRECTO',
      cancelacion_id: null,
      registrado_por: 4,
      registrado_en: new Date(Date.now() - 12 * 60000).toISOString(),
      estado: 'DISPONIBLE',
      item_asignado_id: null,
      asignado_en: null,
    },
    {
      id: 2,
      producto_id: 2,
      origen: 'REGISTRO_DIRECTO',
      cancelacion_id: null,
      registrado_por: 4,
      registrado_en: new Date(Date.now() - 4 * 60000).toISOString(),
      estado: 'DISPONIBLE',
      item_asignado_id: null,
      asignado_en: null,
    },
    {
      id: 3,
      producto_id: 3,
      origen: 'REGISTRO_DIRECTO',
      cancelacion_id: null,
      registrado_por: 5,
      registrado_en: new Date(Date.now() - 20 * 60000).toISOString(),
      estado: 'DISPONIBLE',
      item_asignado_id: null,
      asignado_en: null,
    },
  ],
};

/**
 * Calcula el estado en vivo de una mesa según sus cuentas y comandas activas.
 * Prioridad (RF13):
 * 1. CON_PEDIDOS_PENDIENTES : comandas sin terminar (no LISTA ni CANCELADA)
 * 2. OCUPADA                : cuenta en estado ABIERTA
 * 3. EN_PROCESO_DE_PAGO     : solo cuentas en estado PENDIENTE
 * 4. DISPONIBLE             : sin cuentas vivas
 */
export function calcularEstadoMesa(mesaId, estado = estadoMemoria) {
  const mId = Number(mesaId);
  const cuentasVivas = (estado.cuentas || []).filter(
    (c) => c.mesa_id === mId && c.estado !== 'PAGADA'
  );
  if (cuentasVivas.length === 0) return 'DISPONIBLE';

  const cuentasIds = new Set(cuentasVivas.map((c) => c.id));
  const pedidosVivos = (estado.pedidos || []).filter(
    (p) => cuentasIds.has(p.cuenta_id) && !p.cancelado
  );
  const pedidosIds = new Set(pedidosVivos.map((p) => p.id));

  const comandasPendientes = (estado.comandas || []).filter(
    (k) => pedidosIds.has(k.pedido_id) && !['LISTA', 'CANCELADA'].includes(k.estado)
  );
  if (comandasPendientes.length > 0) return 'CON_PEDIDOS_PENDIENTES';

  if (cuentasVivas.some((c) => c.estado === 'ABIERTA')) return 'OCUPADA';
  if (cuentasVivas.some((c) => c.estado === 'PENDIENTE')) return 'EN_PROCESO_DE_PAGO';

  return 'DISPONIBLE';
}

/**
 * Calcula el total en pesos de una cuenta sumando los ítems de sus pedidos no cancelados
 * más las adiciones/opciones de personalización.
 */
export function calcularTotalCuenta(cuentaId, estado = estadoMemoria) {
  const cId = Number(cuentaId);
  const pedidos = (estado.pedidos || []).filter((p) => p.cuenta_id === cId && !p.cancelado);
  let total = 0;

  for (const pedido of pedidos) {
    const items = (estado.itemsPedido || []).filter((i) => i.pedido_id === pedido.id);
    for (const item of items) {
      const opciones = (estado.itemOpciones || []).filter((o) => o.item_id === item.id);
      const extraOpciones = opciones.reduce((acc, o) => acc + Number(o.precio_extra || 0), 0);
      total += Number(item.cantidad) * (Number(item.precio_unitario) + extraOpciones);
    }
  }

  return total;
}

