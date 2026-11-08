import { ErrorNegocio } from '../errores.js';

/**
 * GestorCuentasPedidos: Clase de dominio encargada de la lógica de negocio,
 * cálculo de subtotales/propinas y validaciones de pedidos y cuentas (RF4, RF12, RF14 · CU9, CU16).
 */
export class GestorCuentasPedidos {
  static ESTADOS_CUENTA = Object.freeze({
    ABIERTA: 'ABIERTA',
    PENDIENTE: 'PENDIENTE',
    PAGADA: 'PAGADA',
  });

  static METODOS_PAGO = Object.freeze(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA']);

  constructor(almacen = null) {
    this.almacen = almacen;
  }

  /**
   * Valida la apertura de una nueva cuenta en una mesa (RF4).
   */
  validarApertura({ mesaId, etiqueta, cuentasExistentes = [] }) {
    if (mesaId === null || mesaId === undefined || mesaId === '') {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El identificador de mesa es obligatorio', 400);
    }
    const mId = Number(mesaId);
    if (!Number.isInteger(mId) || mId <= 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de mesa inválido', 400);
    }

    if (!etiqueta || typeof etiqueta !== 'string' || etiqueta.trim().length === 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'La etiqueta de la cuenta es obligatoria', 400);
    }

    const etiquetaLimpia = etiqueta.trim();
    if (etiquetaLimpia.length > 50) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'La etiqueta de la cuenta no puede superar los 50 caracteres', 400);
    }

    // Comprobar etiquetas duplicadas vivas en la misma mesa (RF4)
    const duplicada = (cuentasExistentes || []).some(
      (c) =>
        Number(c.mesa_id) === mId &&
        c.estado !== GestorCuentasPedidos.ESTADOS_CUENTA.PAGADA &&
        String(c.etiqueta || '').trim().toLowerCase() === etiquetaLimpia.toLowerCase()
    );

    if (duplicada) {
      throw new ErrorNegocio(
        'ETIQUETA_DUPLICADA',
        `Ya existe una cuenta activa con la etiqueta "${etiquetaLimpia}" en esta mesa`,
        409
      );
    }

    return {
      mesaId: mId,
      etiqueta: etiquetaLimpia,
    };
  }

  /**
   * Valida los ítems de un pedido antes de registrarlo (RF12 · CU9, CU10).
   */
  validarItemsPedido(items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El pedido debe incluir al menos un ítem', 400);
    }

    const itemsValidados = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== 'object') {
        throw new ErrorNegocio('DATOS_INVALIDOS', `Ítem en posición ${i + 1} inválido`, 400);
      }

      const prodId = Number(item.producto_id);
      if (!Number.isInteger(prodId) || prodId <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', `El producto en la posición ${i + 1} tiene un identificador inválido`, 400);
      }

      const cantidad = Number(item.cantidad ?? 1);
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', `La cantidad del producto ${prodId} debe ser un entero mayor o igual a 1`, 400);
      }

      if (cantidad > 100) {
        throw new ErrorNegocio('DATOS_INVALIDOS', `La cantidad máxima permitida por ítem es de 100 unidades`, 400);
      }

      const modalidad = (item.modalidad || 'MESA').toUpperCase();
      if (!['MESA', 'LLEVAR'].includes(modalidad)) {
        throw new ErrorNegocio('DATOS_INVALIDOS', `Modalidad inválida: "${item.modalidad}". Debe ser MESA o LLEVAR`, 400);
      }

      const observacion = item.observacion ? String(item.observacion).trim() : null;
      if (observacion && observacion.length > 200) {
        throw new ErrorNegocio('DATOS_INVALIDOS', `La observación del ítem no puede exceder 200 caracteres`, 400);
      }

      itemsValidados.push({
        producto_id: prodId,
        cantidad,
        modalidad,
        observacion,
        opciones: Array.isArray(item.opciones) ? item.opciones : [],
      });
    }

    return itemsValidados;
  }

  /**
   * Calcula el total de una cuenta sumando ítems, cantidades y adiciones/opciones extra (RF4).
   */
  calcularTotalCuenta(cuentaId, snapshotEstado) {
    const cId = Number(cuentaId);
    if (!Number.isInteger(cId) || cId <= 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de cuenta inválido', 400);
    }

    const estado = snapshotEstado || this.almacen;
    if (!estado) return 0;

    const pedidos = (estado.pedidos || []).filter((p) => p.cuenta_id === cId && !p.cancelado);
    let subtotal = 0;

    for (const pedido of pedidos) {
      const items = (estado.itemsPedido || []).filter((i) => i.pedido_id === pedido.id);
      for (const item of items) {
        const opciones = (estado.itemOpciones || []).filter((o) => o.item_id === item.id);
        const extraOpciones = opciones.reduce((acc, o) => acc + Number(o.precio_extra || 0), 0);
        const precioTotalUnitario = Number(item.precio_unitario || 0) + extraOpciones;
        subtotal += Number(item.cantidad || 0) * precioTotalUnitario;
      }
    }

    return subtotal;
  }

  /**
   * Valida la liquidación y cobro de una cuenta en Caja (RF14 / CU16).
   */
  validarLiquidacion({ estadoCuenta, metodoPago, propina = 0, subtotal = 0 }) {
    if (estadoCuenta === GestorCuentasPedidos.ESTADOS_CUENTA.PAGADA) {
      throw new ErrorNegocio('CUENTA_YA_PAGADA', 'La cuenta ya fue pagada previamente', 409);
    }

    if (!metodoPago || !GestorCuentasPedidos.METODOS_PAGO.includes(metodoPago.toUpperCase())) {
      throw new ErrorNegocio(
        'DATOS_INVALIDOS',
        `Método de pago inválido. Permitidos: ${GestorCuentasPedidos.METODOS_PAGO.join(', ')}`,
        400
      );
    }

    const propinaNum = Number(propina);
    if (isNaN(propinaNum) || propinaNum < 0) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El valor de propina no puede ser negativo', 400);
    }

    if (propinaNum > 500000) {
      throw new ErrorNegocio('DATOS_INVALIDOS', 'El valor de propina excede el límite máximo permitido ($500.000)', 400);
    }

    const totalFinal = subtotal + propinaNum;

    return {
      metodoPago: metodoPago.toUpperCase(),
      propina: propinaNum,
      subtotal,
      totalFinal,
    };
  }
}
