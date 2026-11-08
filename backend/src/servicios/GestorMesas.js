import { ErrorNegocio } from '../errores.js';

/**
 * GestorMesas: Clase de dominio encargada de la lógica de negocio,
 * cálculo de estados dinámicos y validaciones de mesas (RF2, RF13 · CU7, CU8).
 */
export class GestorMesas {
  /**
   * Estados operativos definidos para una mesa (RF13).
   */
  static ESTADOS = Object.freeze({
    DISPONIBLE: 'DISPONIBLE',
    OCUPADA: 'OCUPADA',
    CON_PEDIDOS_PENDIENTES: 'CON_PEDIDOS_PENDIENTES',
    EN_PROCESO_DE_PAGO: 'EN_PROCESO_DE_PAGO',
  });

  constructor(almacen = null) {
    this.almacen = almacen;
  }

  /**
   * Valida que el identificador de mesa sea un número entero positivo.
   */
  validarId(mesaId) {
    if (mesaId === null || mesaId === undefined || mesaId === '') {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El identificador de mesa es obligatorio', 400);
    }
    const id = Number(mesaId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El identificador de mesa debe ser un entero positivo', 400);
    }
    return id;
  }

  /**
   * Calcula el estado operativo de una mesa evaluando cuentas vivas y comandas activas (RF13).
   * Prioridad de cálculo:
   * 1. CON_PEDIDOS_PENDIENTES : comandas activas no LISTA ni CANCELADA.
   * 2. OCUPADA                : al menos una cuenta en estado ABIERTA.
   * 3. EN_PROCESO_DE_PAGO     : solo cuentas en estado PENDIENTE.
   * 4. DISPONIBLE             : sin cuentas vivas (o solo cuentas PAGADAS).
   */
  calcularEstado(mesaId, snapshotEstado) {
    const id = this.validarId(mesaId);
    const estado = snapshotEstado || this.almacen;
    if (!estado) {
      throw new ErrorNegocio('ESTADO_NO_DISPONIBLE', 'No se proporcionó el estado de datos', 500);
    }

    const cuentasVivas = (estado.cuentas || []).filter(
      (c) => c.mesa_id === id && c.estado !== 'PAGADA'
    );
    if (cuentasVivas.length === 0) {
      return GestorMesas.ESTADOS.DISPONIBLE;
    }

    const cuentasIds = new Set(cuentasVivas.map((c) => c.id));
    const pedidosVivos = (estado.pedidos || []).filter(
      (p) => cuentasIds.has(p.cuenta_id) && !p.cancelado
    );
    const pedidosIds = new Set(pedidosVivos.map((p) => p.id));

    const comandasPendientes = (estado.comandas || []).filter(
      (k) => pedidosIds.has(k.pedido_id) && !['LISTA', 'CANCELADA'].includes(k.estado)
    );
    if (comandasPendientes.length > 0) {
      return GestorMesas.ESTADOS.CON_PEDIDOS_PENDIENTES;
    }

    if (cuentasVivas.some((c) => c.estado === 'ABIERTA')) {
      return GestorMesas.ESTADOS.OCUPADA;
    }

    if (cuentasVivas.some((c) => c.estado === 'PENDIENTE')) {
      return GestorMesas.ESTADOS.EN_PROCESO_DE_PAGO;
    }

    return GestorMesas.ESTADOS.DISPONIBLE;
  }

  /**
   * Valida los parámetros requeridos para reasignar temporalmente una mesa a otro mesero (RF2 / CU7).
   */
  validarReasignacion({ mesaId, meseroId, motivo }) {
    const idMesa = this.validarId(mesaId);

    if (meseroId === null || meseroId === undefined || meseroId === '') {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El identificador de mesero es obligatorio', 400);
    }
    const idMesero = Number(meseroId);
    if (!Number.isInteger(idMesero) || idMesero <= 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de mesero inválido', 400);
    }

    if (!motivo || typeof motivo !== 'string' || motivo.trim().length === 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El motivo de reasignación es obligatorio', 400);
    }

    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length > 200) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El motivo no puede exceder 200 caracteres', 400);
    }

    return {
      mesaId: idMesa,
      meseroId: idMesero,
      motivo: motivoLimpio,
    };
  }

  /**
   * Verifica si una mesa admite apertura de cuentas nuevas según su estado.
   */
  puedeAbrirCuenta(mesaId, snapshotEstado) {
    const estado = this.calcularEstado(mesaId, snapshotEstado);
    if (estado === GestorMesas.ESTADOS.EN_PROCESO_DE_PAGO) {
      throw new ErrorNegocio(
        'MESA_EN_PAGO',
        'La mesa se encuentra en proceso de liquidación de pago y no admite nuevas aperturas',
        409
      );
    }
    return true;
  }
}
