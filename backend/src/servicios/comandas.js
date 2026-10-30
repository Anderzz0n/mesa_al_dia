import { ErrorNegocio } from '../errores.js';
import { estadoMemoria, calcularEstadoMesa } from '../db/memoria.js';

/**
 * Servicio de comandas para Cocina y Bar (RF7 · CU15, RF6, RF8).
 */

/**
 * Lista las comandas según filtros de área, estado, fecha y acuse pendiente.
 */
export async function listarComandas({ destino, estado, fecha, acuse, usuarioAutenticado, db }) {
  const rol = usuarioAutenticado.rol;
  let destinoFiltro = destino ? String(destino).toUpperCase() : null;

  // Validación de área estricta (RF7, RF8)
  if (rol === 'COCINA') {
    if (destinoFiltro && destinoFiltro !== 'COCINA') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    destinoFiltro = 'COCINA';
  } else if (rol === 'BAR') {
    if (destinoFiltro && destinoFiltro !== 'BAR') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    destinoFiltro = 'BAR';
  }

  const horaServidor = new Date().toISOString();
  const fechaHoy = horaServidor.slice(0, 10);
  const fechaFiltro = fecha === 'hoy' ? fechaHoy : fecha || null;

  try {
    let sql = `
      SELECT k.id, k.pedido_id, k.destino, k.es_anticipada, k.estado,
             k.enviada_en, k.confirmada_en, k.confirmada_por, k.items_confirmados,
             k.lista_en, k.cancelacion_acuse_en,
             p.creado_en AS pedido_creado_en, p.cuenta_id, p.mesero_id,
             u.nombre_completo AS mesero_nombre,
             c.etiqueta AS cuenta_etiqueta,
             m.numero AS mesa_numero
      FROM comanda k
      JOIN pedido p ON p.id = k.pedido_id
      JOIN usuario u ON u.id = p.mesero_id
      JOIN cuenta c ON c.id = p.cuenta_id
      JOIN mesa m ON m.id = c.mesa_id
      WHERE 1=1
    `;
    const params = [];

    if (destinoFiltro) {
      params.push(destinoFiltro);
      sql += ` AND k.destino = $${params.length}`;
    }

    if (acuse === 'pendiente') {
      sql += ` AND k.estado = 'CANCELADA' AND k.cancelacion_acuse_en IS NULL`;
    } else {
      if (estado) {
        const estadosArr = estado.split(',').map((s) => s.trim().toUpperCase());
        params.push(estadosArr);
        sql += ` AND k.estado = ANY($${params.length})`;
      } else {
        sql += ` AND k.estado IN ('ENVIADA', 'RECIBIDA', 'EN_PREPARACION')`;
      }
    }

    if (fechaFiltro) {
      params.push(`${fechaFiltro}%`);
      sql += ` AND k.enviada_en::text LIKE $${params.length}`;
    }

    // Orden: anticipadas primero (DESC), y más antiguas primero (enviada_en ASC)
    sql += ` ORDER BY k.es_anticipada DESC, k.enviada_en ASC`;

    const resComandas = await db.query(sql, params);

    // Cargar ítems por comanda
    const comandas = [];
    for (const row of resComandas.rows) {
      const resItems = await db.query(
        `SELECT ip.id, ip.cantidad, ip.precio_unitario, ip.modalidad, ip.observacion,
                ip.item_padre_id, pr.id AS producto_id, pr.nombre AS producto_nombre,
                pr.es_combo,
                EXISTS(SELECT 1 FROM producto_preparado pp WHERE pp.item_asignado_id = ip.id) AS es_preparado
         FROM item_pedido ip
         JOIN producto pr ON pr.id = ip.producto_id
         WHERE ip.comanda_id = $1`,
        [row.id]
      );

      const items = [];
      for (const it of resItems.rows) {
        const resOps = await db.query(
          `SELECT op.nombre
           FROM item_opcion io
           JOIN opcion_personalizacion op ON op.id = io.opcion_id
           WHERE io.item_id = $1`,
          [it.id]
        );
        const opciones = resOps.rows.map((o) => o.nombre);

        items.push({
          id: it.id,
          producto: it.producto_nombre,
          cantidad: Number(it.cantidad),
          modalidad: it.modalidad,
          opciones,
          observacion: it.observacion || null,
          es_preparado: Boolean(it.es_preparado),
          item_padre_id: it.item_padre_id,
        });
      }

      comandas.push({
        id: row.id,
        pedido_id: row.pedido_id,
        destino: row.destino,
        es_anticipada: row.es_anticipada,
        estado: row.estado,
        mesa: row.mesa_numero,
        cuenta: row.cuenta_etiqueta,
        mesero: {
          id: row.mesero_id,
          nombre: row.mesero_nombre,
        },
        enviada_en: row.enviada_en,
        confirmada_en: row.confirmada_en,
        confirmada_por: row.confirmada_por,
        items_confirmados: row.items_confirmados !== null ? Number(row.items_confirmados) : null,
        lista_en: row.lista_en,
        cancelacion_acuse_en: row.cancelacion_acuse_en,
        total_items: items.length,
        items,
      });
    }

    return {
      hora_servidor: horaServidor,
      comandas,
    };
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // ==============================================================
    // FALLBACK EN MEMORIA
    // ==============================================================
    let comandasMem = (estadoMemoria.comandas || []).slice();

    if (destinoFiltro) {
      comandasMem = comandasMem.filter((k) => k.destino === destinoFiltro);
    }

    if (acuse === 'pendiente') {
      comandasMem = comandasMem.filter((k) => k.estado === 'CANCELADA' && !k.cancelacion_acuse_en);
    } else {
      if (estado) {
        const estadosArr = estado.split(',').map((s) => s.trim().toUpperCase());
        comandasMem = comandasMem.filter((k) => estadosArr.includes(k.estado));
      } else {
        comandasMem = comandasMem.filter((k) => ['ENVIADA', 'RECIBIDA', 'EN_PREPARACION'].includes(k.estado));
      }
    }

    if (fechaFiltro) {
      comandasMem = comandasMem.filter((k) => (k.enviada_en || '').startsWith(fechaFiltro));
    }

    // Ordenar: es_anticipada DESC, enviada_en ASC
    comandasMem.sort((a, b) => {
      if (a.es_anticipada !== b.es_anticipada) {
        return a.es_anticipada ? -1 : 1;
      }
      return new Date(a.enviada_en).getTime() - new Date(b.enviada_en).getTime();
    });

    const resultado = comandasMem.map((k) => {
      const pedido = (estadoMemoria.pedidos || []).find((p) => p.id === k.pedido_id) || {};
      const cuenta = (estadoMemoria.cuentas || []).find((c) => c.id === pedido.cuenta_id) || {};
      const mesa = (estadoMemoria.mesas || []).find((m) => m.id === cuenta.mesa_id) || {};
      const mesero = (estadoMemoria.usuarios || []).find((u) => u.id === pedido.mesero_id) || {
        id: pedido.mesero_id,
        nombre_completo: 'Mesero',
      };

      const itemsAsociados = (estadoMemoria.itemsPedido || []).filter((i) => i.comanda_id === k.id);
      const items = itemsAsociados.map((it) => {
        const prod = (estadoMemoria.productos || []).find((p) => p.id === it.producto_id);
        const opsRel = (estadoMemoria.itemOpciones || []).filter((o) => o.item_id === it.id);
        const opciones = opsRel.map((o) => {
          const def = (estadoMemoria.opciones || []).find((op) => op.id === o.opcion_id);
          return def ? def.nombre : 'Opción';
        });

        return {
          id: it.id,
          producto: prod ? prod.nombre : 'Producto',
          cantidad: Number(it.cantidad),
          modalidad: it.modalidad,
          opciones,
          observacion: it.observacion || null,
          es_preparado: Boolean(it.es_preparado || it.preparado_id),
          item_padre_id: it.item_padre_id,
        };
      });

      return {
        id: k.id,
        pedido_id: k.pedido_id,
        destino: k.destino,
        es_anticipada: k.es_anticipada,
        estado: k.estado,
        mesa: mesa.numero || null,
        cuenta: cuenta.etiqueta || null,
        mesero: {
          id: mesero.id,
          nombre: mesero.nombre_completo,
        },
        enviada_en: k.enviada_en,
        confirmada_en: k.confirmada_en || null,
        confirmada_por: k.confirmada_por || null,
        items_confirmados: k.items_confirmados !== null && k.items_confirmados !== undefined ? Number(k.items_confirmados) : null,
        lista_en: k.lista_en || null,
        cancelacion_acuse_en: k.cancelacion_acuse_en || null,
        total_items: items.length,
        items,
      };
    });

    return {
      hora_servidor: horaServidor,
      comandas: resultado,
    };
  }
}

/**
 * Confirma la recepción de una comanda (RF7 · CU15).
 * Permite corregir el recuento mientras la comanda siga en 'RECIBIDA'.
 */
export async function confirmarRecepcionComanda({ comandaId, itemsConfirmados, usuarioAutenticado, db, tiempoReal }) {
  const cId = Number(comandaId);
  if (isNaN(cId) || cId <= 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de comanda inválido', 400);
  }

  const cantConfirmada = Number(itemsConfirmados);
  if (isNaN(cantConfirmada) || !Number.isInteger(cantConfirmada) || cantConfirmada < 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'La cantidad de ítems confirmados debe ser un entero mayor o igual a 0', 400);
  }

  const horaServidor = new Date().toISOString();

  try {
    const resComanda = await db.query(
      `SELECT k.id, k.pedido_id, k.destino, k.es_anticipada, k.estado,
              p.mesero_id, c.mesa_id, m.numero AS mesa_numero, c.etiqueta AS cuenta_etiqueta
       FROM comanda k
       JOIN pedido p ON p.id = k.pedido_id
       JOIN cuenta c ON c.id = p.cuenta_id
       JOIN mesa m ON m.id = c.mesa_id
       WHERE k.id = $1`,
      [cId]
    );

    if (resComanda.rows.length === 0) {
      throw new ErrorNegocio('COMANDA_NO_ENCONTRADA', 'Comanda no encontrada', 404);
    }
    const comanda = resComanda.rows[0];

    // Validar área de destino
    if (usuarioAutenticado.rol === 'COCINA' && comanda.destino !== 'COCINA') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    if (usuarioAutenticado.rol === 'BAR' && comanda.destino !== 'BAR') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }

    // Regla CU15: Solo confirmable en ENVIADA o RECIBIDA (corrección)
    if (['EN_PREPARACION', 'LISTA', 'CANCELADA'].includes(comanda.estado)) {
      throw new ErrorNegocio('COMANDA_NO_CONFIRMABLE', 'La comanda ya no admite confirmación', 409);
    }

    // Contar total de ítems enviados en la comanda
    const resTotal = await db.query(`SELECT COUNT(*)::int AS total FROM item_pedido WHERE comanda_id = $1`, [cId]);
    const itemsEnviados = resTotal.rows[0]?.total || 0;
    const coincide = cantConfirmada === itemsEnviados;

    await db.query(
      `UPDATE comanda
       SET estado = 'RECIBIDA',
           confirmada_en = $1,
           confirmada_por = $2,
           items_confirmados = $3
       WHERE id = $4`,
      [horaServidor, usuarioAutenticado.id, cantConfirmada, cId]
    );

    // Emitir evento comanda.recibida al mesero responsable
    tiempoReal?.emitir(`mesero:${comanda.mesero_id}`, 'comanda.recibida', {
      comanda_id: comanda.id,
      pedido_id: comanda.pedido_id,
      destino: comanda.destino,
      es_anticipada: comanda.es_anticipada,
      mesa_numero: comanda.mesa_numero,
      cuenta_etiqueta: comanda.cuenta_etiqueta,
      items_enviados: itemsEnviados,
      items_confirmados: cantConfirmada,
      coincide,
      hora_servidor: horaServidor,
    });

    return {
      items_enviados: itemsEnviados,
      items_confirmados: cantConfirmada,
      coincide,
    };
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // Fallback memoria
    const comanda = (estadoMemoria.comandas || []).find((k) => k.id === cId);
    if (!comanda) {
      throw new ErrorNegocio('COMANDA_NO_ENCONTRADA', 'Comanda no encontrada', 404);
    }

    if (usuarioAutenticado.rol === 'COCINA' && comanda.destino !== 'COCINA') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    if (usuarioAutenticado.rol === 'BAR' && comanda.destino !== 'BAR') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }

    if (['EN_PREPARACION', 'LISTA', 'CANCELADA'].includes(comanda.estado)) {
      throw new ErrorNegocio('COMANDA_NO_CONFIRMABLE', 'La comanda ya no admite confirmación', 409);
    }

    const itemsEnviados = (estadoMemoria.itemsPedido || []).filter((i) => i.comanda_id === cId).length;
    const coincide = cantConfirmada === itemsEnviados;

    comanda.estado = 'RECIBIDA';
    comanda.confirmada_en = horaServidor;
    comanda.confirmada_por = usuarioAutenticado.id;
    comanda.items_confirmados = cantConfirmada;

    const pedido = (estadoMemoria.pedidos || []).find((p) => p.id === comanda.pedido_id) || {};
    const cuenta = (estadoMemoria.cuentas || []).find((c) => c.id === pedido.cuenta_id) || {};
    const mesa = (estadoMemoria.mesas || []).find((m) => m.id === cuenta.mesa_id) || {};

    tiempoReal?.emitir(`mesero:${pedido.mesero_id}`, 'comanda.recibida', {
      comanda_id: comanda.id,
      pedido_id: comanda.pedido_id,
      destino: comanda.destino,
      es_anticipada: comanda.es_anticipada,
      mesa_numero: mesa.numero,
      cuenta_etiqueta: cuenta.etiqueta,
      items_enviados: itemsEnviados,
      items_confirmados: cantConfirmada,
      coincide,
      hora_servidor: horaServidor,
    });

    return {
      items_enviados: itemsEnviados,
      items_confirmados: cantConfirmada,
      coincide,
    };
  }
}

/**
 * Cambia el estado de una comanda (EN_PREPARACION o LISTA).
 */
export async function cambiarEstadoComanda({ comandaId, nuevoEstado, usuarioAutenticado, db, tiempoReal }) {
  const cId = Number(comandaId);
  if (isNaN(cId) || cId <= 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de comanda inválido', 400);
  }

  const estadoLimpio = String(nuevoEstado || '').trim().toUpperCase();
  if (!['EN_PREPARACION', 'LISTA'].includes(estadoLimpio)) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El estado debe ser EN_PREPARACION o LISTA', 400);
  }

  const horaServidor = new Date().toISOString();

  try {
    const resComanda = await db.query(
      `SELECT k.id, k.pedido_id, k.destino, k.es_anticipada, k.estado,
              p.mesero_id, c.mesa_id, m.numero AS mesa_numero, c.etiqueta AS cuenta_etiqueta
       FROM comanda k
       JOIN pedido p ON p.id = k.pedido_id
       JOIN cuenta c ON c.id = p.cuenta_id
       JOIN mesa m ON m.id = c.mesa_id
       WHERE k.id = $1`,
      [cId]
    );

    if (resComanda.rows.length === 0) {
      throw new ErrorNegocio('COMANDA_NO_ENCONTRADA', 'Comanda no encontrada', 404);
    }
    const comanda = resComanda.rows[0];

    // Validar área de destino
    if (usuarioAutenticado.rol === 'COCINA' && comanda.destino !== 'COCINA') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    if (usuarioAutenticado.rol === 'BAR' && comanda.destino !== 'BAR') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }

    if (comanda.estado === 'CANCELADA') {
      throw new ErrorNegocio('COMANDA_NO_EDITABLE', 'No se puede modificar una comanda cancelada', 409);
    }

    if (comanda.estado === 'LISTA') {
      throw new ErrorNegocio('COMANDA_NO_EDITABLE', 'La comanda ya fue completada', 409);
    }

    let listaEn = null;
    if (estadoLimpio === 'LISTA') {
      listaEn = horaServidor;
      await db.query(
        `UPDATE comanda SET estado = $1, lista_en = $2 WHERE id = $3`,
        [estadoLimpio, listaEn, cId]
      );
    } else {
      await db.query(
        `UPDATE comanda SET estado = $1 WHERE id = $2`,
        [estadoLimpio, cId]
      );
    }

    // Emitir comanda.estado a la sala del mesero
    tiempoReal?.emitir(`mesero:${comanda.mesero_id}`, 'comanda.estado', {
      comanda_id: comanda.id,
      pedido_id: comanda.pedido_id,
      destino: comanda.destino,
      es_anticipada: comanda.es_anticipada,
      estado: estadoLimpio,
      mesa_numero: comanda.mesa_numero,
      cuenta_etiqueta: comanda.cuenta_etiqueta,
      lista_en: listaEn,
      hora_servidor: horaServidor,
    });

    // Si pasó a LISTA, actualizar estado vivo de la mesa
    if (estadoLimpio === 'LISTA') {
      const resMesa = await db.query(
        `SELECT m.id, m.numero, COALESCE(em.estado, 'DISPONIBLE') AS estado
         FROM mesa m
         LEFT JOIN v_estado_mesa em ON em.mesa_id = m.id
         WHERE m.id = $1`,
        [comanda.mesa_id]
      );
      const mesaInfo = resMesa.rows[0];
      tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
        mesa_id: comanda.mesa_id,
        numero: comanda.mesa_numero,
        estado: mesaInfo ? mesaInfo.estado : 'DISPONIBLE',
      });
    }

    return {
      id: comanda.id,
      pedido_id: comanda.pedido_id,
      destino: comanda.destino,
      es_anticipada: comanda.es_anticipada,
      estado: estadoLimpio,
      lista_en: listaEn,
      hora_servidor: horaServidor,
    };
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // Fallback memoria
    const comanda = (estadoMemoria.comandas || []).find((k) => k.id === cId);
    if (!comanda) {
      throw new ErrorNegocio('COMANDA_NO_ENCONTRADA', 'Comanda no encontrada', 404);
    }

    if (usuarioAutenticado.rol === 'COCINA' && comanda.destino !== 'COCINA') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    if (usuarioAutenticado.rol === 'BAR' && comanda.destino !== 'BAR') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }

    if (comanda.estado === 'CANCELADA') {
      throw new ErrorNegocio('COMANDA_NO_EDITABLE', 'No se puede modificar una comanda cancelada', 409);
    }

    if (comanda.estado === 'LISTA') {
      throw new ErrorNegocio('COMANDA_NO_EDITABLE', 'La comanda ya fue completada', 409);
    }

    comanda.estado = estadoLimpio;
    if (estadoLimpio === 'LISTA') {
      comanda.lista_en = horaServidor;
    }

    const pedido = (estadoMemoria.pedidos || []).find((p) => p.id === comanda.pedido_id) || {};
    const cuenta = (estadoMemoria.cuentas || []).find((c) => c.id === pedido.cuenta_id) || {};
    const mesa = (estadoMemoria.mesas || []).find((m) => m.id === cuenta.mesa_id) || {};

    tiempoReal?.emitir(`mesero:${pedido.mesero_id}`, 'comanda.estado', {
      comanda_id: comanda.id,
      pedido_id: comanda.pedido_id,
      destino: comanda.destino,
      es_anticipada: comanda.es_anticipada,
      estado: estadoLimpio,
      mesa_numero: mesa.numero,
      cuenta_etiqueta: cuenta.etiqueta,
      lista_en: comanda.lista_en || null,
      hora_servidor: horaServidor,
    });

    if (estadoLimpio === 'LISTA') {
      const nuevoEstadoMesa = calcularEstadoMesa(cuenta.mesa_id);
      mesa.estado = nuevoEstadoMesa;
      tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
        mesa_id: cuenta.mesa_id,
        numero: mesa.numero,
        estado: nuevoEstadoMesa,
      });
    }

    return {
      id: comanda.id,
      pedido_id: comanda.pedido_id,
      destino: comanda.destino,
      es_anticipada: comanda.es_anticipada,
      estado: estadoLimpio,
      lista_en: comanda.lista_en || null,
      hora_servidor: horaServidor,
    };
  }
}

/**
 * Acusa recibo de una comanda cancelada (RF8).
 * Retira la comanda de la franja "Cancelaciones por acusar" del tablero.
 */
export async function acusarCancelacionComanda({ comandaId, usuarioAutenticado, db }) {
  const cId = Number(comandaId);
  if (isNaN(cId) || cId <= 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de comanda inválido', 400);
  }

  const horaServidor = new Date().toISOString();

  try {
    const resComanda = await db.query(
      `SELECT id, destino, estado, cancelacion_acuse_en FROM comanda WHERE id = $1`,
      [cId]
    );

    if (resComanda.rows.length === 0) {
      throw new ErrorNegocio('COMANDA_NO_ENCONTRADA', 'Comanda no encontrada', 404);
    }
    const comanda = resComanda.rows[0];

    // Validar área de destino
    if (usuarioAutenticado.rol === 'COCINA' && comanda.destino !== 'COCINA') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    if (usuarioAutenticado.rol === 'BAR' && comanda.destino !== 'BAR') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }

    if (comanda.estado !== 'CANCELADA') {
      throw new ErrorNegocio('ACCION_NO_PERMITIDA', 'Solo se puede acusar recibo de comandas canceladas', 422);
    }

    await db.query(
      `UPDATE comanda SET cancelacion_acuse_en = $1 WHERE id = $2`,
      [horaServidor, cId]
    );

    return {
      comanda_id: comanda.id,
      cancelacion_acuse_en: horaServidor,
    };
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // Fallback memoria
    const comanda = (estadoMemoria.comandas || []).find((k) => k.id === cId);
    if (!comanda) {
      throw new ErrorNegocio('COMANDA_NO_ENCONTRADA', 'Comanda no encontrada', 404);
    }

    if (usuarioAutenticado.rol === 'COCINA' && comanda.destino !== 'COCINA') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }
    if (usuarioAutenticado.rol === 'BAR' && comanda.destino !== 'BAR') {
      throw new ErrorNegocio('DESTINO_NO_PERMITIDO', 'Esto no es de su área', 403);
    }

    if (comanda.estado !== 'CANCELADA') {
      throw new ErrorNegocio('ACCION_NO_PERMITIDA', 'Solo se puede acusar recibo de comandas canceladas', 422);
    }

    comanda.cancelacion_acuse_en = horaServidor;

    return {
      comanda_id: comanda.id,
      cancelacion_acuse_en: horaServidor,
    };
  }
}
