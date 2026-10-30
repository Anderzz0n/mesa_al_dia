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

        // Devolver unidades preparadas asignadas al pedido a estado DISPONIBLE (RF10 / CU21)
        const resPreps = await db.query(
          `UPDATE producto_preparado
           SET estado = 'DISPONIBLE', item_asignado_id = NULL, asignado_en = NULL
           WHERE item_asignado_id IN (SELECT id FROM item_pedido WHERE pedido_id = $1)
           RETURNING id, producto_id`,
          [pId]
        );

        // Restaurar stock de los productos con control de stock (excluyendo los que ya estaban preparados)
        const resItems = await db.query(
          `SELECT ip.producto_id, ip.cantidad, p.stock_cantidad
           FROM item_pedido ip
           JOIN producto p ON p.id = ip.producto_id
           WHERE ip.pedido_id = $1 AND p.stock_cantidad IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM producto_preparado pp WHERE pp.item_asignado_id = ip.id)`,
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

        // Notificar unidades preparadas restituidas a meseros y áreas
        for (const prepRest of resPreps.rows) {
          const resP = await db.query(`SELECT nombre, destino FROM producto WHERE id = $1`, [prepRest.producto_id]);
          const pInfo = resP.rows[0];
          tiempoReal?.emitir(['meseros', pInfo?.destino?.toLowerCase() || 'cocina'], 'preparado.nuevo', {
            producto_id: prepRest.producto_id,
            producto_nombre: pInfo?.nombre,
            destino: pInfo?.destino,
            cantidad: 1,
            preparados: [{ id: prepRest.id, producto_id: prepRest.producto_id, estado: 'DISPONIBLE' }],
            registrado_en: horaServidor,
          });
        }

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

      // Devolver unidades preparadas asignadas al pedido a estado DISPONIBLE (RF10 / CU21)
      const itemsPedido = (estadoMemoria.itemsPedido || []).filter((i) => i.pedido_id === pId);
      const itemsIds = new Set(itemsPedido.map((i) => i.id));
      const prepsAsignados = (estadoMemoria.productosPreparados || []).filter(
        (pp) => pp.item_asignado_id && itemsIds.has(pp.item_asignado_id)
      );

      for (const prep of prepsAsignados) {
        prep.estado = 'DISPONIBLE';
        prep.item_asignado_id = null;
        prep.asignado_en = null;

        const prodInfo = (estadoMemoria.productos || []).find((p) => p.id === prep.producto_id);
        tiempoReal?.emitir(['meseros', prodInfo?.destino?.toLowerCase() || 'cocina'], 'preparado.nuevo', {
          producto_id: prep.producto_id,
          producto_nombre: prodInfo?.nombre,
          destino: prodInfo?.destino,
          cantidad: 1,
          preparados: [{ id: prep.id, producto_id: prep.producto_id, estado: 'DISPONIBLE' }],
          registrado_en: horaServidor,
        });
      }

      // Restaurar stock (excluyendo los que ya estaban preparados)
      const prepItemIds = new Set(prepsAsignados.map((p) => p.item_asignado_id));
      for (const item of itemsPedido) {
        if (prepItemIds.has(item.id)) continue;
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

/**
 * Consulta cancelaciones filtradas por estado y fecha para Caja y Admin (RF8 · CU18).
 */
export async function listarCancelaciones({ estado, fecha, db }) {
  const horaServidor = new Date().toISOString();
  const fechaHoy = horaServidor.slice(0, 10);
  const fechaFiltro = fecha === 'hoy' ? fechaHoy : fecha || null;

  const estadosArr = estado
    ? estado.split(',').map((s) => s.trim().toUpperCase())
    : ['SOLICITADA'];

  const esHistorico = estadosArr.some((e) => ['APROBADA', 'RECHAZADA'].includes(e));

  try {
    let sql = `
      SELECT c.id, c.pedido_id, c.motivo, c.solicitada_por, c.solicitada_en,
             c.estado, c.resuelta_por, c.resuelta_en, c.crear_preparado,
             us.nombre_completo AS solicitada_por_nombre,
             ur.nombre_completo AS resuelta_por_nombre,
             p.creado_en AS pedido_creado_en, p.mesero_id, p.cuenta_id,
             cu.etiqueta AS cuenta_etiqueta, cu.estado AS cuenta_estado,
             m.numero AS mesa_numero
      FROM cancelacion c
      JOIN usuario us ON us.id = c.solicitada_por
      LEFT JOIN usuario ur ON ur.id = c.resuelta_por
      JOIN pedido p ON p.id = c.pedido_id
      JOIN cuenta cu ON cu.id = p.cuenta_id
      JOIN mesa m ON m.id = cu.mesa_id
      WHERE c.estado = ANY($1)
    `;
    const params = [estadosArr];

    if (fechaFiltro) {
      params.push(`${fechaFiltro}%`);
      const colFecha = esHistorico ? 'c.resuelta_en' : 'c.solicitada_en';
      sql += ` AND ${colFecha}::text LIKE $${params.length}`;
    }

    // Más recientes primero para resueltas (K5c), más antiguas primero para pendientes (K5a)
    sql += esHistorico ? ` ORDER BY c.resuelta_en DESC` : ` ORDER BY c.solicitada_en ASC`;

    const resCanc = await db.query(sql, params);
    const cancelaciones = [];

    for (const row of resCanc.rows) {
      // Cargar ítems del pedido
      const resItems = await db.query(
        `SELECT ip.id, ip.cantidad, ip.precio_unitario, ip.modalidad, ip.observacion,
                ip.item_padre_id, pr.id AS producto_id, pr.nombre AS producto_nombre,
                pr.es_combo,
                EXISTS(SELECT 1 FROM producto_preparado pp WHERE pp.item_asignado_id = ip.id) AS es_preparado
         FROM item_pedido ip
         JOIN producto pr ON pr.id = ip.producto_id
         WHERE ip.pedido_id = $1`,
        [row.pedido_id]
      );

      let totalPedido = 0;
      const items = [];
      for (const it of resItems.rows) {
        const resOps = await db.query(
          `SELECT op.nombre, io.precio_extra
           FROM item_opcion io
           JOIN opcion_personalizacion op ON op.id = io.opcion_id
           WHERE io.item_id = $1`,
          [it.id]
        );
        const opciones = resOps.rows.map((o) => o.nombre);
        const extra = resOps.rows.reduce((sum, o) => sum + Number(o.precio_extra || 0), 0);
        const subtotal = Number(it.cantidad) * (Number(it.precio_unitario) + extra);
        totalPedido += subtotal;

        items.push({
          id: it.id,
          producto: it.producto_nombre,
          producto_id: it.producto_id,
          cantidad: Number(it.cantidad),
          modalidad: it.modalidad,
          opciones,
          observacion: it.observacion || null,
          es_preparado: Boolean(it.es_preparado),
          es_combo: Boolean(it.es_combo),
          subtotal,
          item_padre_id: it.item_padre_id,
        });
      }

      // Cargar comandas del pedido
      const resComandas = await db.query(
        `SELECT id, destino, estado, es_anticipada FROM comanda WHERE pedido_id = $1`,
        [row.pedido_id]
      );

      cancelaciones.push({
        id: row.id,
        motivo: row.motivo,
        solicitada_por: row.solicitada_por_nombre,
        solicitada_en: row.solicitada_en,
        resuelta_por: row.resuelta_por_nombre,
        resuelta_en: row.resuelta_en,
        estado: row.estado,
        crear_preparado: Boolean(row.crear_preparado),
        pedido: {
          id: row.pedido_id,
          registrado_en: row.pedido_creado_en,
          total: totalPedido,
          items,
        },
        mesa: row.mesa_numero,
        cuenta: {
          id: row.cuenta_id,
          etiqueta: row.cuenta_etiqueta,
          estado: row.cuenta_estado,
        },
        comandas: resComandas.rows,
      });
    }

    return {
      hora_servidor: horaServidor,
      cancelaciones,
    };
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // Fallback memoria
    let cancelacionesMem = (estadoMemoria.cancelaciones || []).filter((c) =>
      estadosArr.includes(c.estado)
    );

    if (fechaFiltro) {
      cancelacionesMem = cancelacionesMem.filter((c) => {
        const campo = esHistorico ? c.resuelta_en : c.solicitada_en;
        return (campo || '').startsWith(fechaFiltro);
      });
    }

    cancelacionesMem.sort((a, b) => {
      const timeA = new Date(esHistorico ? a.resuelta_en : a.solicitada_en).getTime();
      const timeB = new Date(esHistorico ? b.resuelta_en : b.solicitada_en).getTime();
      return esHistorico ? timeB - timeA : timeA - timeB;
    });

    const resultado = cancelacionesMem.map((c) => {
      const pedido = (estadoMemoria.pedidos || []).find((p) => p.id === c.pedido_id) || {};
      const cuenta = (estadoMemoria.cuentas || []).find((cu) => cu.id === pedido.cuenta_id) || {};
      const mesa = (estadoMemoria.mesas || []).find((m) => m.id === cuenta.mesa_id) || {};
      const solicitante = (estadoMemoria.usuarios || []).find((u) => u.id === c.solicitada_por);
      const resolutor = (estadoMemoria.usuarios || []).find((u) => u.id === c.resuelta_por);

      const itemsAsociados = (estadoMemoria.itemsPedido || []).filter((i) => i.pedido_id === pedido.id);
      let total = 0;
      const items = itemsAsociados.map((it) => {
        const prod = (estadoMemoria.productos || []).find((p) => p.id === it.producto_id);
        const opsRel = (estadoMemoria.itemOpciones || []).filter((o) => o.item_id === it.id);
        const opciones = opsRel.map((o) => {
          const def = (estadoMemoria.opciones || []).find((op) => op.id === o.opcion_id);
          return def ? def.nombre : 'Opción';
        });
        const extra = opsRel.reduce((acc, o) => acc + Number(o.precio_extra || 0), 0);
        const subtotal = Number(it.cantidad) * (Number(it.precio_unitario) + extra);
        total += subtotal;

        return {
          id: it.id,
          producto: prod ? prod.nombre : 'Producto',
          producto_id: it.producto_id,
          cantidad: Number(it.cantidad),
          modalidad: it.modalidad,
          opciones,
          observacion: it.observacion || null,
          es_preparado: Boolean(it.es_preparado || it.preparado_id),
          es_combo: prod ? Boolean(prod.es_combo) : false,
          subtotal,
          item_padre_id: it.item_padre_id,
        };
      });

      const comandas = (estadoMemoria.comandas || [])
        .filter((k) => k.pedido_id === pedido.id)
        .map((k) => ({
          id: k.id,
          destino: k.destino,
          estado: k.estado,
          es_anticipada: k.es_anticipada,
        }));

      return {
        id: c.id,
        motivo: c.motivo,
        solicitada_por: solicitante ? solicitante.nombre_completo : c.solicitada_por_nombre || 'Mesero',
        solicitada_en: c.solicitada_en,
        resuelta_por: resolutor ? resolutor.nombre_completo : null,
        resuelta_en: c.resuelta_en || null,
        estado: c.estado,
        crear_preparado: Boolean(c.crear_preparado),
        pedido: {
          id: pedido.id,
          registrado_en: pedido.creado_en,
          total,
          items,
        },
        mesa: mesa.numero || null,
        cuenta: {
          id: cuenta.id,
          etiqueta: cuenta.etiqueta || null,
          estado: cuenta.estado || null,
        },
        comandas,
      };
    });

    return {
      hora_servidor: horaServidor,
      cancelaciones: resultado,
    };
  }
}

/**
 * Resuelve una solicitud de cancelación (APROBAR o RECHAZAR) por Caja o Admin (RF8 · CU18, CU19).
 */
export async function resolverCancelacion({
  cancelacionId,
  decision,
  preparados = [],
  usuarioAutenticado,
  db,
  tiempoReal = null,
}) {
  const cId = Number(cancelacionId);
  if (isNaN(cId) || cId <= 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de cancelación inválido', 400);
  }

  const decLimpia = String(decision || '').trim().toUpperCase();
  if (!['APROBAR', 'RECHAZAR'].includes(decLimpia)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La decisión debe ser APROBAR o RECHAZAR', 400);
  }

  const horaServidor = new Date().toISOString();

  try {
    const resCanc = await db.query(
      `SELECT c.id, c.pedido_id, c.estado, c.solicitada_por,
              p.mesero_id, p.cuenta_id, cu.estado AS cuenta_estado,
              cu.mesa_id, m.numero AS mesa_numero, cu.etiqueta AS cuenta_etiqueta
       FROM cancelacion c
       JOIN pedido p ON p.id = c.pedido_id
       JOIN cuenta cu ON cu.id = p.cuenta_id
       JOIN mesa m ON m.id = cu.mesa_id
       WHERE c.id = $1`,
      [cId]
    );

    if (resCanc.rows.length === 0) {
      throw new ErrorNegocio('CANCELACION_NO_ENCONTRADA', 'Cancelación no encontrada', 404);
    }
    const cancelacion = resCanc.rows[0];

    if (cancelacion.estado !== 'SOLICITADA') {
      throw new ErrorNegocio('CANCELACION_YA_RESUELTA', 'Esta cancelación ya fue resuelta', 409);
    }

    if (cancelacion.cuenta_estado === 'PAGADA') {
      throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
    }

    await db.query('BEGIN');
    try {
      if (decLimpia === 'RECHAZAR') {
        await db.query(
          `UPDATE cancelacion
           SET estado = 'RECHAZADA', resuelta_por = $1, resuelta_en = $2
           WHERE id = $3`,
          [usuarioAutenticado.id, horaServidor, cId]
        );
        await db.query('COMMIT');

        // Notificar rechazo
        tiempoReal?.emitir([`mesero:${cancelacion.mesero_id}`, 'caja'], 'cancelacion.rechazada', {
          cancelacion_id: cId,
          pedido_id: cancelacion.pedido_id,
          resuelta_por: usuarioAutenticado.nombre_completo || usuarioAutenticado.nombre_usuario,
          resuelta_en: horaServidor,
        });

        return {
          cancelacion: {
            id: cId,
            pedido_id: cancelacion.pedido_id,
            estado: 'RECHAZADA',
            resuelta_por: usuarioAutenticado.id,
            resuelta_en: horaServidor,
          },
          hora_servidor: horaServidor,
        };
      }

      // -------------------------------------------------------------
      // DECISIÓN: APROBAR (CU18, CU19)
      // -------------------------------------------------------------
      const resItemsPedido = await db.query(
        `SELECT ip.id, ip.producto_id, ip.cantidad, ip.item_padre_id,
                pr.nombre AS producto_nombre, pr.es_combo, pr.stock_cantidad, pr.destino,
                EXISTS(SELECT 1 FROM producto_preparado pp WHERE pp.item_asignado_id = ip.id) AS era_preparado,
                (SELECT id FROM producto_preparado pp WHERE pp.item_asignado_id = ip.id) AS preparado_id
         FROM item_pedido ip
         JOIN producto pr ON pr.id = ip.producto_id
         WHERE ip.pedido_id = $1`,
        [cancelacion.pedido_id]
      );
      const itemsPedido = resItemsPedido.rows;

      // Validar declaración de preparados
      const preparadosPorItem = new Map();
      if (Array.isArray(preparados) && preparados.length > 0) {
        for (const pIn of preparados) {
          const itId = Number(pIn.item_id);
          const cant = Number(pIn.cantidad);
          if (isNaN(itId) || isNaN(cant) || cant <= 0 || !Number.isInteger(cant)) {
            throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Los productos preparados indicados no corresponden al pedido', 422);
          }
          const item = itemsPedido.find((i) => i.id === itId);
          if (!item) {
            throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Los productos preparados indicados no corresponden al pedido', 422);
          }
          if (item.es_combo) {
            throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Los combos no se pueden declarar como preparados directos', 422);
          }
          if (item.era_preparado) {
            throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Un ítem que ya usaba un preparado no puede declararse como nuevo preparado', 422);
          }
          if (cant > Number(item.cantidad)) {
            throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'La cantidad declarada excede la cantidad del ítem en el pedido', 422);
          }
          preparadosPorItem.set(itId, { item, cantidad: cant });
        }
      }

      const tienePreparados = preparadosPorItem.size > 0;
      await db.query(
        `UPDATE cancelacion
         SET estado = 'APROBADA', resuelta_por = $1, resuelta_en = $2, crear_preparado = $3
         WHERE id = $4`,
        [usuarioAutenticado.id, horaServidor, tienePreparados, cId]
      );

      // Marcar pedido cancelado
      await db.query(`UPDATE pedido SET cancelado = true WHERE id = $1`, [cancelacion.pedido_id]);

      // Consultar estado anterior de las comandas y cancelarlas
      const resComandasAnt = await db.query(
        `SELECT id, destino, estado FROM comanda WHERE pedido_id = $1`,
        [cancelacion.pedido_id]
      );
      const comandasAfectadas = resComandasAnt.rows.map((c) => ({
        comanda_id: c.id,
        destino: c.destino,
        estado_anterior: c.estado,
      }));

      await db.query(
        `UPDATE comanda SET estado = 'CANCELADA' WHERE pedido_id = $1`,
        [cancelacion.pedido_id]
      );

      // Crear filas en producto_preparado para los declarados
      const nuevosPreparados = [];
      for (const { item, cantidad } of preparadosPorItem.values()) {
        for (let k = 0; k < cantidad; k++) {
          const resPrep = await db.query(
            `INSERT INTO producto_preparado (producto_id, origen, cancelacion_id, registrado_por, registrado_en, estado)
             VALUES ($1, 'CANCELACION', $2, $3, $4, 'DISPONIBLE')
             RETURNING id, producto_id, origen, cancelacion_id, registrado_por, registrado_en, estado`,
            [item.producto_id, cId, usuarioAutenticado.id, horaServidor]
          );
          const prepGuardado = resPrep.rows[0];
          nuevosPreparados.push(prepGuardado);

          tiempoReal?.emitir(['meseros', item.destino.toLowerCase()], 'preparado.nuevo', {
            producto_id: item.producto_id,
            producto_nombre: item.producto_nombre,
            destino: item.destino,
            cantidad: 1,
            preparados: [{ id: prepGuardado.id, producto_id: prepGuardado.producto_id, estado: 'DISPONIBLE' }],
            registrado_en: horaServidor,
          });
        }
      }

      // Restituir preparados que ya se habían tomado en el pedido
      for (const it of itemsPedido) {
        if (it.era_preparado && it.preparado_id) {
          await db.query(
            `UPDATE producto_preparado
             SET estado = 'DISPONIBLE', item_asignado_id = NULL, asignado_en = NULL
             WHERE id = $1`,
            [it.preparado_id]
          );
          tiempoReal?.emitir(['meseros', it.destino.toLowerCase()], 'preparado.nuevo', {
            producto_id: it.producto_id,
            producto_nombre: it.producto_nombre,
            destino: it.destino,
            cantidad: 1,
            preparados: [{ id: it.preparado_id, producto_id: it.producto_id, estado: 'DISPONIBLE' }],
            registrado_en: horaServidor,
          });
        }
      }

      // Restituir inventario de productos (restando los preparados declarados)
      for (const it of itemsPedido) {
        if (!it.era_preparado && it.stock_cantidad !== null && it.stock_cantidad !== undefined) {
          const cantDeclarada = preparadosPorItem.get(it.id)?.cantidad || 0;
          const aRestituir = Number(it.cantidad) - cantDeclarada;
          if (aRestituir > 0) {
            const nuevoStock = Number(it.stock_cantidad) + aRestituir;
            await db.query(
              `UPDATE producto SET stock_cantidad = $1, disponible = true WHERE id = $2`,
              [nuevoStock, it.producto_id]
            );
            tiempoReal?.emitir(['meseros', it.destino.toLowerCase()], 'producto.disponibilidad', {
              producto_id: it.producto_id,
              disponible: true,
              stock_cantidad: nuevoStock,
            });
          }
        }
      }

      await db.query('COMMIT');

      // Notificar eventos de cancelación aprobada
      const destinosAfectados = [...new Set(comandasAfectadas.map((c) => c.destino.toLowerCase()))];
      const salasNotificacion = [...destinosAfectados, `mesero:${cancelacion.mesero_id}`, 'caja'];

      tiempoReal?.emitir(salasNotificacion, 'pedido.cancelado', {
        cancelacion_id: cId,
        pedido_id: cancelacion.pedido_id,
        cuenta_id: cancelacion.cuenta_id,
        mesa_id: cancelacion.mesa_id,
        mesa_numero: cancelacion.mesa_numero,
        cuenta_etiqueta: cancelacion.cuenta_etiqueta,
        comandas_afectadas: comandasAfectadas,
      });

      const resMesa = await db.query(
        `SELECT m.id, m.numero, COALESCE(em.estado, 'DISPONIBLE') AS estado
         FROM mesa m
         LEFT JOIN v_estado_mesa em ON em.mesa_id = m.id
         WHERE m.id = $1`,
        [cancelacion.mesa_id]
      );
      const mesaInfo = resMesa.rows[0];

      tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
        mesa_id: cancelacion.mesa_id,
        numero: cancelacion.mesa_numero,
        estado: mesaInfo ? mesaInfo.estado : 'DISPONIBLE',
      });

      tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
        cuenta_id: cancelacion.cuenta_id,
        mesa_id: cancelacion.mesa_id,
        estado: cancelacion.cuenta_estado,
      });

      return {
        cancelacion: {
          id: cId,
          pedido_id: cancelacion.pedido_id,
          estado: 'APROBADA',
          resuelta_por: usuarioAutenticado.id,
          resuelta_en: horaServidor,
          crear_preparado: tienePreparados,
        },
        hora_servidor: horaServidor,
      };
    } catch (txErr) {
      await db.query('ROLLBACK');
      throw txErr;
    }
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // Fallback memoria
    const cancelacion = (estadoMemoria.cancelaciones || []).find((c) => c.id === cId);
    if (!cancelacion) {
      throw new ErrorNegocio('CANCELACION_NO_ENCONTRADA', 'Cancelación no encontrada', 404);
    }

    if (cancelacion.estado !== 'SOLICITADA') {
      throw new ErrorNegocio('CANCELACION_YA_RESUELTA', 'Esta cancelación ya fue resuelta', 409);
    }

    const pedido = (estadoMemoria.pedidos || []).find((p) => p.id === cancelacion.pedido_id) || {};
    const cuenta = (estadoMemoria.cuentas || []).find((c) => c.id === pedido.cuenta_id) || {};
    const mesa = (estadoMemoria.mesas || []).find((m) => m.id === cuenta.mesa_id) || {};

    if (cuenta.estado === 'PAGADA') {
      throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
    }

    if (decLimpia === 'RECHAZAR') {
      cancelacion.estado = 'RECHAZADA';
      cancelacion.resuelta_por = usuarioAutenticado.id;
      cancelacion.resuelta_en = horaServidor;

      tiempoReal?.emitir([`mesero:${pedido.mesero_id}`, 'caja'], 'cancelacion.rechazada', {
        cancelacion_id: cId,
        pedido_id: pedido.id,
        resuelta_por: usuarioAutenticado.nombre_completo || usuarioAutenticado.nombre_usuario,
        resuelta_en: horaServidor,
      });

      return {
        cancelacion: {
          id: cId,
          pedido_id: pedido.id,
          estado: 'RECHAZADA',
          resuelta_por: usuarioAutenticado.id,
          resuelta_en: horaServidor,
        },
        hora_servidor: horaServidor,
      };
    }

    // APROBAR en memoria
    const itemsPedido = (estadoMemoria.itemsPedido || []).filter((i) => i.pedido_id === pedido.id);
    const preparadosPorItem = new Map();
    if (Array.isArray(preparados) && preparados.length > 0) {
      for (const pIn of preparados) {
        const itId = Number(pIn.item_id);
        const cant = Number(pIn.cantidad);
        if (isNaN(itId) || isNaN(cant) || cant <= 0 || !Number.isInteger(cant)) {
          throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Los productos preparados indicados no corresponden al pedido', 422);
        }
        const item = itemsPedido.find((i) => i.id === itId);
        if (!item) {
          throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Los productos preparados indicados no corresponden al pedido', 422);
        }
        const prod = (estadoMemoria.productos || []).find((p) => p.id === item.producto_id);
        if (prod?.es_combo) {
          throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Los combos no se pueden declarar como preparados directos', 422);
        }
        if (item.es_preparado || item.preparado_id) {
          throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'Un ítem que ya usaba un preparado no puede declararse como nuevo preparado', 422);
        }
        if (cant > Number(item.cantidad)) {
          throw new ErrorNegocio('PREPARADOS_INVALIDOS', 'La cantidad declarada excede la cantidad del ítem en el pedido', 422);
        }
        preparadosPorItem.set(itId, { item, cantidad: cant });
      }
    }

    const tienePreparados = preparadosPorItem.size > 0;
    cancelacion.estado = 'APROBADA';
    cancelacion.resuelta_por = usuarioAutenticado.id;
    cancelacion.resuelta_en = horaServidor;
    cancelacion.crear_preparado = tienePreparados;

    pedido.cancelado = true;

    // Comandas afectadas
    const comandasAfectadas = [];
    for (const k of estadoMemoria.comandas || []) {
      if (k.pedido_id === pedido.id) {
        comandasAfectadas.push({
          comanda_id: k.id,
          destino: k.destino,
          estado_anterior: k.estado,
        });
        k.estado = 'CANCELADA';
      }
    }

    // Crear preparados declarados en memoria
    if (!estadoMemoria.productosPreparados) estadoMemoria.productosPreparados = [];
    for (const { item, cantidad } of preparadosPorItem.values()) {
      const prod = (estadoMemoria.productos || []).find((p) => p.id === item.producto_id);
      for (let k = 0; k < cantidad; k++) {
        const nextId = (estadoMemoria.productosPreparados.reduce((max, p) => Math.max(max, p.id), 0) || 0) + 1;
        const nuevoPrep = {
          id: nextId,
          producto_id: item.producto_id,
          origen: 'CANCELACION',
          cancelacion_id: cId,
          registrado_por: usuarioAutenticado.id,
          registrado_en: horaServidor,
          estado: 'DISPONIBLE',
          item_asignado_id: null,
          asignado_en: null,
        };
        estadoMemoria.productosPreparados.push(nuevoPrep);

        tiempoReal?.emitir(['meseros', prod?.destino?.toLowerCase() || 'cocina'], 'preparado.nuevo', {
          producto_id: item.producto_id,
          producto_nombre: prod?.nombre,
          destino: prod?.destino,
          cantidad: 1,
          preparados: [{ id: nuevoPrep.id, producto_id: nuevoPrep.producto_id, estado: 'DISPONIBLE' }],
          registrado_en: horaServidor,
        });
      }
    }

    // Restituir preparados que ya se habían tomado
    for (const it of itemsPedido) {
      if (it.es_preparado || it.preparado_id) {
        const prep = (estadoMemoria.productosPreparados || []).find(
          (p) => p.id === it.preparado_id || p.item_asignado_id === it.id
        );
        if (prep) {
          prep.estado = 'DISPONIBLE';
          prep.item_asignado_id = null;
          prep.asignado_en = null;

          const prod = (estadoMemoria.productos || []).find((p) => p.id === prep.producto_id);
          tiempoReal?.emitir(['meseros', prod?.destino?.toLowerCase() || 'cocina'], 'preparado.nuevo', {
            producto_id: prep.producto_id,
            producto_nombre: prod?.nombre,
            destino: prod?.destino,
            cantidad: 1,
            preparados: [{ id: prep.id, producto_id: prep.producto_id, estado: 'DISPONIBLE' }],
            registrado_en: horaServidor,
          });
        }
      }
    }

    // Restituir stock (descontando preparados declarados)
    for (const it of itemsPedido) {
      if (!it.es_preparado && !it.preparado_id) {
        const prod = (estadoMemoria.productos || []).find((p) => p.id === it.producto_id);
        if (prod && prod.stock_cantidad !== null && prod.stock_cantidad !== undefined) {
          const cantDeclarada = preparadosPorItem.get(it.id)?.cantidad || 0;
          const aRestituir = Number(it.cantidad) - cantDeclarada;
          if (aRestituir > 0) {
            prod.stock_cantidad = Number(prod.stock_cantidad) + aRestituir;
            prod.disponible = true;
            tiempoReal?.emitir(['meseros', prod.destino?.toLowerCase() || 'cocina'], 'producto.disponibilidad', {
              producto_id: prod.id,
              disponible: true,
              stock_cantidad: prod.stock_cantidad,
            });
          }
        }
      }
    }

    // Notificar eventos
    const destinosAfectados = [...new Set(comandasAfectadas.map((c) => c.destino.toLowerCase()))];
    const salasNotificacion = [...destinosAfectados, `mesero:${pedido.mesero_id}`, 'caja'];

    tiempoReal?.emitir(salasNotificacion, 'pedido.cancelado', {
      cancelacion_id: cId,
      pedido_id: pedido.id,
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

    return {
      cancelacion: {
        id: cId,
        pedido_id: pedido.id,
        estado: 'APROBADA',
        resuelta_por: usuarioAutenticado.id,
        resuelta_en: horaServidor,
        crear_preparado: tienePreparados,
      },
      hora_servidor: horaServidor,
    };
  }
}

