import { ErrorNegocio } from '../errores.js';
import { estadoMemoria, calcularEstadoMesa, calcularTotalCuenta } from '../db/memoria.js';

/**
 * Servicio de cancelaciones de pedidos (RF8 · CU17, CU18, CU19).
 */

export async function procesarCancelacionPedido({
  pedidoId,
  motivo,
  usuarioAutenticado,
  preparados = [],
  db,
  tiempoReal = null,
}) {
  const pId = Number(pedidoId);
  if (isNaN(pId) || pId <= 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de pedido inválido', 400);
  }

  const motivoLimpio = (motivo || '').trim();
  if (!motivoLimpio) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El motivo de cancelación es obligatorio', 400);
  }

  if (motivoLimpio.length > 200) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El motivo no puede exceder 200 caracteres', 400);
  }

  const horaServidor = new Date().toISOString();
  const esCaja = usuarioAutenticado.rol === 'CAJA' || usuarioAutenticado.rol === 'ADMIN';

  try {
    // 1. Consultar pedido y estado de cuenta en PostgreSQL
    const resPedido = await db.query(
      `SELECT p.id, p.cuenta_id, p.mesero_id, p.creado_en, c.estado AS cuenta_estado,
              c.mesa_id, m.numero AS mesa_numero, c.etiqueta AS cuenta_etiqueta,
              u.nombre_completo AS mesero_nombre
       FROM pedido p
       JOIN cuenta c ON c.id = p.cuenta_id
       JOIN mesa m ON m.id = c.mesa_id
       JOIN usuario u ON u.id = p.mesero_id
       WHERE p.id = $1`,
      [pId]
    );

    if (resPedido.rows.length === 0) {
      throw new ErrorNegocio('PEDIDO_NO_ENCONTRADO', 'Pedido no encontrado', 404);
    }
    const pedido = resPedido.rows[0];

    if (pedido.cuenta_estado === 'PAGADA') {
      throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
    }

    // Verificar si ya existe cancelación activa (no rechazada)
    const resCancActiva = await db.query(
      `SELECT id, estado FROM cancelacion WHERE pedido_id = $1 AND estado <> 'RECHAZADA'`,
      [pId]
    );
    if (resCancActiva.rows.length > 0) {
      throw new ErrorNegocio('CANCELACION_YA_EXISTE', 'Este pedido ya tiene una cancelación en curso o aprobada', 409);
    }

    // Obtener ventana de cancelación
    const resParam = await db.query(
      `SELECT valor FROM parametro WHERE clave = 'VENTANA_CANCELACION_MINUTOS'`
    );
    const ventanaMinutos = Number(resParam.rows[0]?.valor || 3);
    const diffMinutos = (new Date(horaServidor).getTime() - new Date(pedido.creado_en).getTime()) / 60000;
    const dentroDeVentana = diffMinutos <= ventanaMinutos;

    // Decisión de estado
    const apruebaAlInstante = esCaja || dentroDeVentana;
    const nuevoEstado = apruebaAlInstante ? 'APROBADA' : 'SOLICITADA';
    const resueltaPor = apruebaAlInstante ? usuarioAutenticado.id : null;
    const resueltaEn = apruebaAlInstante ? horaServidor : null;

    await db.query('BEGIN');
    try {
      const resIns = await db.query(
        `INSERT INTO cancelacion (pedido_id, motivo, solicitada_por, solicitada_en, estado, resuelta_por, resuelta_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, pedido_id, motivo, solicitada_por, solicitada_en, estado, resuelta_por, resuelta_en`,
        [pId, motivoLimpio, usuarioAutenticado.id, horaServidor, nuevoEstado, resueltaPor, resueltaEn]
      );
      const cancelacion = resIns.rows[0];

      if (nuevoEstado === 'APROBADA') {
        // Obtener estado anterior de las comandas
        const resComandasAnt = await db.query(
          `SELECT id, destino, estado FROM comanda WHERE pedido_id = $1`,
          [pId]
        );
        const comandasAfectadas = resComandasAnt.rows.map((c) => ({
          comanda_id: c.id,
          destino: c.destino,
          estado_anterior: c.estado,
        }));

        // Actualizar comandas a CANCELADA
        await db.query(`UPDATE comanda SET estado = 'CANCELADA' WHERE pedido_id = $1`, [pId]);

        // Restaurar stock de los productos con control de stock
        const resItems = await db.query(
          `SELECT ip.producto_id, ip.cantidad, p.stock_cantidad
           FROM item_pedido ip
           JOIN producto p ON p.id = ip.producto_id
           WHERE ip.pedido_id = $1 AND p.stock_cantidad IS NOT NULL`,
          [pId]
        );
        for (const item of resItems.rows) {
          const nuevoStock = Number(item.stock_cantidad) + Number(item.cantidad);
          await db.query(
            `UPDATE producto SET stock_cantidad = $1, disponible = true WHERE id = $2`,
            [nuevoStock, item.producto_id]
          );
        }

        await db.query('COMMIT');

        // Emitir evento pedido.cancelado a áreas correspondientes, mesero responsable y caja
        const destinosAfectados = [...new Set(comandasAfectadas.map((c) => c.destino.toLowerCase()))];
        const salasNotificacion = [...destinosAfectados, `mesero:${pedido.mesero_id}`, 'caja'];

        tiempoReal?.emitir(salasNotificacion, 'pedido.cancelado', {
          cancelacion_id: cancelacion.id,
          pedido_id: pId,
          cuenta_id: pedido.cuenta_id,
          mesa_id: pedido.mesa_id,
          mesa_numero: pedido.mesa_numero,
          cuenta_etiqueta: pedido.cuenta_etiqueta,
          comandas_afectadas: comandasAfectadas,
        });

        // Actualizar estado de mesa y cuenta
        const resMesa = await db.query(
          `SELECT m.id, m.numero, COALESCE(em.estado, 'DISPONIBLE') AS estado
           FROM mesa m
           LEFT JOIN v_estado_mesa em ON em.mesa_id = m.id
           WHERE m.id = $1`,
          [pedido.mesa_id]
        );
        const mesaInfo = resMesa.rows[0];

        tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
          mesa_id: pedido.mesa_id,
          numero: pedido.mesa_numero,
          estado: mesaInfo ? mesaInfo.estado : 'DISPONIBLE',
        });

        tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
          cuenta_id: pedido.cuenta_id,
          mesa_id: pedido.mesa_id,
          estado: pedido.cuenta_estado,
        });
      } else {
        // Estado SOLICITADA -> Comit y notificar a Caja
        await db.query('COMMIT');

        tiempoReal?.emitir('caja', 'cancelacion.solicitada', {
          cancelacion_id: cancelacion.id,
          pedido_id: pId,
          cuenta_id: pedido.cuenta_id,
          mesa_id: pedido.mesa_id,
          mesa_numero: pedido.mesa_numero,
          cuenta_etiqueta: pedido.cuenta_etiqueta,
          solicitada_por: usuarioAutenticado.nombre_completo || usuarioAutenticado.nombre_usuario,
          solicitada_en: horaServidor,
          motivo: motivoLimpio,
        });
      }

      return cancelacion;
    } catch (txErr) {
      await db.query('ROLLBACK');
      throw txErr;
    }
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // ==============================================================
    // FALLBACK EN MEMORIA
    // ==============================================================
    const pedido = (estadoMemoria.pedidos || []).find((p) => p.id === pId);
    if (!pedido) {
      throw new ErrorNegocio('PEDIDO_NO_ENCONTRADO', 'Pedido no encontrado', 404);
    }

    const cuenta = (estadoMemoria.cuentas || []).find((c) => c.id === pedido.cuenta_id);
    if (!cuenta) {
      throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
    }

    if (cuenta.estado === 'PAGADA') {
      throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
    }

    const cancExistente = (estadoMemoria.cancelaciones || []).find(
      (x) => x.pedido_id === pId && x.estado !== 'RECHAZADA'
    );
    if (cancExistente) {
      throw new ErrorNegocio('CANCELACION_YA_EXISTE', 'Este pedido ya tiene una cancelación en curso o aprobada', 409);
    }

    const ventanaMinutos = Number(estadoMemoria.parametros?.VENTANA_CANCELACION_MINUTOS || 3);
    const diffMinutos = (new Date(horaServidor).getTime() - new Date(pedido.creado_en).getTime()) / 60000;
    const dentroDeVentana = diffMinutos <= ventanaMinutos;

    const apruebaAlInstante = esCaja || dentroDeVentana;
    const nuevoEstado = apruebaAlInstante ? 'APROBADA' : 'SOLICITADA';
    const resueltaPor = apruebaAlInstante ? usuarioAutenticado.id : null;
    const resueltaEn = apruebaAlInstante ? horaServidor : null;

    const nuevoId = ((estadoMemoria.cancelaciones || []).reduce((max, x) => Math.max(max, x.id), 0) || 0) + 1;
    const nuevaCancelacion = {
      id: nuevoId,
      pedido_id: pId,
      motivo: motivoLimpio,
      solicitada_por: usuarioAutenticado.id,
      solicitada_por_nombre: usuarioAutenticado.nombre_completo || usuarioAutenticado.nombre_usuario,
      solicitada_en: horaServidor,
      estado: nuevoEstado,
      resuelta_por: resueltaPor,
      resuelta_en: resueltaEn,
    };

    if (!estadoMemoria.cancelaciones) estadoMemoria.cancelaciones = [];
    estadoMemoria.cancelaciones.push(nuevaCancelacion);

    const mesa = estadoMemoria.mesas.find((m) => m.id === cuenta.mesa_id) || { id: cuenta.mesa_id, numero: cuenta.mesa_id };

    if (nuevoEstado === 'APROBADA') {
      pedido.cancelado = true;

      // Actualizar comandas a CANCELADA y guardar estado anterior
      const comandasPedido = (estadoMemoria.comandas || []).filter((k) => k.pedido_id === pId);
      const comandasAfectadas = comandasPedido.map((k) => {
        const estAnt = k.estado;
        k.estado = 'CANCELADA';
        return {
          comanda_id: k.id,
          destino: k.destino,
          estado_anterior: estAnt,
        };
      });

      // Restaurar stock
      const itemsPedido = (estadoMemoria.itemsPedido || []).filter((i) => i.pedido_id === pId);
      for (const item of itemsPedido) {
        const prod = (estadoMemoria.productos || []).find((p) => p.id === item.producto_id);
        if (prod && prod.stock_cantidad !== null && prod.stock_cantidad !== undefined) {
          prod.stock_cantidad = Number(prod.stock_cantidad) + Number(item.cantidad);
          prod.disponible = true;
          tiempoReal?.emitir(['meseros', prod.destino?.toLowerCase() || 'cocina'], 'producto.disponibilidad', {
            producto_id: prod.id,
            disponible: true,
            stock_cantidad: prod.stock_cantidad,
          });
        }
      }

      // Notificar cancelación aprobada
      const destinosAfectados = [...new Set(comandasAfectadas.map((c) => c.destino.toLowerCase()))];
      const salasNotificacion = [...destinosAfectados, `mesero:${pedido.mesero_id}`, 'caja'];

      tiempoReal?.emitir(salasNotificacion, 'pedido.cancelado', {
        cancelacion_id: nuevoId,
        pedido_id: pId,
        cuenta_id: cuenta.id,
        mesa_id: mesa.id,
        mesa_numero: mesa.numero,
        cuenta_etiqueta: cuenta.etiqueta,
        comandas_afectadas: comandasAfectadas,
      });

      const nuevoEstadoMesa = calcularEstadoMesa(cuenta.mesa_id);
      mesa.estado = nuevoEstadoMesa;

      tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
        mesa_id: mesa.id,
        numero: mesa.numero,
        estado: nuevoEstadoMesa,
      });

      tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
        cuenta_id: cuenta.id,
        mesa_id: mesa.id,
        estado: cuenta.estado,
      });
    } else {
      // Notificar solicitud a Caja
      tiempoReal?.emitir('caja', 'cancelacion.solicitada', {
        cancelacion_id: nuevoId,
        pedido_id: pId,
        cuenta_id: cuenta.id,
        mesa_id: mesa.id,
        mesa_numero: mesa.numero,
        cuenta_etiqueta: cuenta.etiqueta,
        solicitada_por: usuarioAutenticado.nombre_completo || usuarioAutenticado.nombre_usuario,
        solicitada_en: horaServidor,
        motivo: motivoLimpio,
      });
    }

    return nuevaCancelacion;
  }
}
