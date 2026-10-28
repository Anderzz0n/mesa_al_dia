import { ErrorNegocio } from '../errores.js';
import { estadoMemoria, calcularEstadoMesa, calcularTotalCuenta } from '../db/memoria.js';

/**
 * Servicio de creación y consulta de pedidos (RF4, RF5, RF6, RF10, RF12 · CU9, CU10, CU11, CU13, CU25).
 */

export async function registrarPedidoEnCuenta({
  cuentaId,
  items,
  usuarioAutenticado,
  db,
  tiempoReal = null,
}) {
  const cId = Number(cuentaId);
  if (isNaN(cId) || cId <= 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de cuenta inválido', 400);
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'El pedido debe incluir al menos un ítem', 400);
  }

  const horaServidor = new Date().toISOString();

  try {
    // 1. Validar cuenta en PostgreSQL
    const resCuenta = await db.query(
      `SELECT c.id, c.mesa_id, c.etiqueta, c.estado, m.numero AS mesa_numero, m.sector_id, s.nombre AS sector_nombre
       FROM cuenta c
       JOIN mesa m ON m.id = c.mesa_id
       LEFT JOIN sector s ON s.id = m.sector_id
       WHERE c.id = $1`,
      [cId]
    );

    if (resCuenta.rows.length === 0) {
      throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
    }

    const cuenta = resCuenta.rows[0];
    if (cuenta.estado !== 'ABIERTA') {
      throw new ErrorNegocio(
        'CUENTA_NO_ABIERTA',
        'La cuenta ya no admite pedidos nuevos (en proceso de pago o pagada)',
        409
      );
    }

    // 2. Resolver mesero responsable en este momento (RF2 / CU25)
    let meseroId = usuarioAutenticado.id;
    const resReas = await db.query(
      `SELECT mesero_id FROM reasignacion_mesa WHERE mesa_id = $1 AND vigente_hasta IS NULL`,
      [cuenta.mesa_id]
    );
    if (resReas.rows.length > 0) {
      meseroId = resReas.rows[0].mesero_id;
    } else {
      const resAsig = await db.query(
        `SELECT mesero_id FROM asignacion_sector WHERE sector_id = $1 AND vigente_hasta IS NULL`,
        [cuenta.sector_id]
      );
      if (resAsig.rows.length > 0) {
        meseroId = resAsig.rows[0].mesero_id;
      }
    }

    // 3. Parámetros de anticipada
    const resParams = await db.query(`SELECT clave, valor FROM parametro`);
    const paramsMap = {};
    for (const r of resParams.rows) paramsMap[r.clave] = r.valor;
    const anticipadaCocina = paramsMap['ANTICIPADA_ACTIVA_COCINA'] === 'true';
    const anticipadaBar = paramsMap['ANTICIPADA_ACTIVA_BAR'] === 'true';

    // 4. Iniciar transacción en PostgreSQL
    await db.query('BEGIN');

    try {
      // Crear pedido
      const resPedido = await db.query(
        `INSERT INTO pedido (cuenta_id, mesero_id, creado_en)
         VALUES ($1, $2, $3)
         RETURNING id, cuenta_id, mesero_id, creado_en`,
        [cId, meseroId, horaServidor]
      );
      const pedidoId = resPedido.rows[0].id;

      // Estructura para acumular ítems físicos y comandas
      const itemsComanda = []; // { destino, es_anticipada, itemObj }
      const itemsGuardados = [];

      for (const itemIn of items) {
        const prodId = Number(itemIn.producto_id);
        const cantidad = Number(itemIn.cantidad || 1);
        const modalidad = (itemIn.modalidad || 'MESA').toUpperCase();
        const observacion = itemIn.observacion ? itemIn.observacion.slice(0, 200) : null;

        if (isNaN(cantidad) || cantidad < 1) {
          throw new ErrorNegocio('DATOS_INVALIDOS', 'La cantidad del producto debe ser al menos 1', 400);
        }

        // Consultar producto
        const resProd = await db.query(
          `SELECT id, nombre, precio, es_combo, destino, permite_llevar, permite_anticipada, disponible, stock_cantidad
           FROM producto WHERE id = $1`,
          [prodId]
        );
        if (resProd.rows.length === 0) {
          throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', 'El producto no existe', 409);
        }
        const prod = resProd.rows[0];

        if (!prod.disponible) {
          throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', `El producto ${prod.nombre} no está disponible`, 409);
        }

        // Validar modalidad del producto
        if (modalidad === 'LLEVAR' && !prod.permite_llevar) {
          throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
        }

        if (modalidad === 'ANTICIPADA') {
          if (!prod.permite_anticipada) {
            throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
          }
          if (prod.destino === 'COCINA' && !anticipadaCocina) {
            throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
          }
          if (prod.destino === 'BAR' && !anticipadaBar) {
            throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
          }
        }

        // Validar opciones y restricciones
        const opcionesIds = Array.isArray(itemIn.opciones) ? itemIn.opciones.map(Number) : [];
        if (opcionesIds.length > 0) {
          // Validar que las opciones pertenezcan al producto y estén disponibles
          for (const opId of opcionesIds) {
            const resOp = await db.query(
              `SELECT op.id, op.nombre, op.precio_extra, op.disponible,
                      EXISTS(SELECT 1 FROM producto_opcion po WHERE po.producto_id = $1 AND po.opcion_id = op.id) AS pertenece
               FROM opcion_personalizacion op WHERE op.id = $2`,
              [prod.id, opId]
            );
            if (resOp.rows.length === 0 || !resOp.rows[0].pertenece) {
              throw new ErrorNegocio('OPCION_NO_PERMITIDA', 'La modificación solicitada no está habilitada', 422);
            }
            if (!resOp.rows[0].disponible) {
              throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', `La opción ${resOp.rows[0].nombre} no está disponible`, 409);
            }
          }

          // Validar combinaciones prohibidas
          const resRestr = await db.query(
            `SELECT opcion_a_id, opcion_b_id FROM restriccion_opcion
             WHERE (opcion_a_id = ANY($1) AND opcion_b_id = ANY($1))`,
            [opcionesIds]
          );
          if (resRestr.rows.length > 0) {
            throw new ErrorNegocio('COMBINACION_NO_PERMITIDA', 'La combinación de opciones no está permitida', 422);
          }
        }

        // Si es producto individual
        if (!prod.es_combo) {
          // Descontar stock
          if (prod.stock_cantidad !== null && prod.stock_cantidad !== undefined) {
            const nuevoStock = Math.max(0, Number(prod.stock_cantidad) - cantidad);
            const nuevoDisponible = nuevoStock > 0;
            await db.query(
              `UPDATE producto SET stock_cantidad = $1, disponible = $2 WHERE id = $3`,
              [nuevoStock, nuevoDisponible, prod.id]
            );
            if (nuevoStock === 0) {
              tiempoReal?.emitir(['meseros', prod.destino.toLowerCase()], 'producto.disponibilidad', {
                producto_id: prod.id,
                disponible: false,
                stock_cantidad: 0,
              });
            }
          }

          // Insertar ítem
          const resItem = await db.query(
            `INSERT INTO item_pedido (pedido_id, producto_id, cantidad, precio_unitario, modalidad, observacion)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, pedido_id, producto_id, cantidad, precio_unitario, modalidad, observacion`,
            [pedidoId, prod.id, cantidad, prod.precio, modalidad, observacion]
          );
          const itemGuardado = resItem.rows[0];

          // Insertar opciones elegidas
          for (const opId of opcionesIds) {
            const resOpData = await db.query(`SELECT precio_extra FROM opcion_personalizacion WHERE id = $1`, [opId]);
            const precioExtra = Number(resOpData.rows[0]?.precio_extra || 0);
            await db.query(
              `INSERT INTO item_opcion (item_id, opcion_id, precio_extra) VALUES ($1, $2, $3)`,
              [itemGuardado.id, opId, precioExtra]
            );
          }

          itemsGuardados.push(itemGuardado);
          itemsComanda.push({
            destino: prod.destino,
            es_anticipada: modalidad === 'ANTICIPADA',
            itemId: itemGuardado.id,
            nombre: prod.nombre,
            cantidad,
            modalidad,
            observacion,
          });
        } else {
          // COMBO COMPUESTO (CU11)
          if (modalidad === 'LLEVAR' && (itemIn.componentes_anticipados || []).length > 0) {
            throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'No se permiten componentes anticipados en pedidos para llevar', 422);
          }

          const quitados = (itemIn.componentes_quitados || []).map(Number);
          const anticipados = (itemIn.componentes_anticipados || []).map(Number);

          // Consultar componentes del combo
          const resComp = await db.query(
            `SELECT cc.producto_id, cc.cantidad, cc.removible, p.nombre, p.destino, p.disponible, p.permite_anticipada, p.stock_cantidad
             FROM combo_componente cc
             JOIN producto p ON p.id = cc.producto_id
             WHERE cc.combo_id = $1`,
            [prod.id]
          );

          for (const c of resComp.rows) {
            const estaQuitado = quitados.includes(c.producto_id);
            if (!c.removible && estaQuitado) {
              throw new ErrorNegocio('DATOS_INVALIDOS', `El componente ${c.nombre} no se puede quitar`, 400);
            }
            if (!c.disponible) {
              if (!c.removible || !estaQuitado) {
                throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', `El componente ${c.nombre} no está disponible`, 409);
              }
            }
          }

          // Insertar ítem padre (el combo)
          const resPadre = await db.query(
            `INSERT INTO item_pedido (pedido_id, producto_id, cantidad, precio_unitario, modalidad, observacion)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, pedido_id, producto_id, cantidad, precio_unitario, modalidad, observacion`,
            [pedidoId, prod.id, cantidad, prod.precio, modalidad, observacion]
          );
          const padreGuardado = resPadre.rows[0];
          itemsGuardados.push(padreGuardado);

          // Insertar componentes incluidos (hijos)
          for (const c of resComp.rows) {
            const estaQuitado = quitados.includes(c.producto_id);
            if (estaQuitado) continue;

            const esAnticipado = anticipados.includes(c.producto_id);
            if (esAnticipado) {
              if (!c.permite_anticipada) {
                throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', `El componente ${c.nombre} no permite anticipada`, 422);
              }
              if (c.destino === 'COCINA' && !anticipadaCocina) {
                throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'Anticipada de Cocina no está activa', 422);
              }
              if (c.destino === 'BAR' && !anticipadaBar) {
                throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'Anticipada de Bar no está activa', 422);
              }
            }

            const modHijo = esAnticipado ? 'ANTICIPADA' : modalidad;

            // Descontar stock de componente si aplica
            if (c.stock_cantidad !== null && c.stock_cantidad !== undefined) {
              const cantComp = Number(c.cantidad) * cantidad;
              const stockRestante = Math.max(0, Number(c.stock_cantidad) - cantComp);
              await db.query(`UPDATE producto SET stock_cantidad = $1, disponible = $2 WHERE id = $3`, [
                stockRestante,
                stockRestante > 0,
                c.producto_id,
              ]);
            }

            const resHijo = await db.query(
              `INSERT INTO item_pedido (pedido_id, producto_id, cantidad, precio_unitario, modalidad, item_padre_id)
               VALUES ($1, $2, $3, 0, $4, $5)
               RETURNING id, pedido_id, producto_id, cantidad, precio_unitario, modalidad, item_padre_id`,
              [pedidoId, c.producto_id, Number(c.cantidad) * cantidad, modHijo, padreGuardado.id]
            );
            const hijoGuardado = resHijo.rows[0];
            itemsGuardados.push(hijoGuardado);

            itemsComanda.push({
              destino: c.destino,
              es_anticipada: esAnticipado,
              itemId: hijoGuardado.id,
              nombre: c.nombre,
              cantidad: Number(c.cantidad) * cantidad,
              modalidad: modHijo,
              comboPadreNombre: prod.nombre,
            });
          }

          // Extras agregados al combo
          if (Array.isArray(itemIn.extras)) {
            for (const extra of itemIn.extras) {
              const resExtra = await db.query(
                `SELECT id, nombre, precio, destino, disponible, stock_cantidad FROM producto WHERE id = $1`,
                [Number(extra.producto_id)]
              );
              if (resExtra.rows.length === 0 || !resExtra.rows[0].disponible) {
                throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', 'Producto extra no disponible', 409);
              }
              const pExtra = resExtra.rows[0];
              const cantExtra = Number(extra.cantidad || 1);

              const resItemExtra = await db.query(
                `INSERT INTO item_pedido (pedido_id, producto_id, cantidad, precio_unitario, modalidad, item_padre_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, pedido_id, producto_id, cantidad, precio_unitario, modalidad, item_padre_id`,
                [pedidoId, pExtra.id, cantExtra, pExtra.precio, modalidad, padreGuardado.id]
              );
              const extraGuardado = resItemExtra.rows[0];
              itemsGuardados.push(extraGuardado);

              itemsComanda.push({
                destino: pExtra.destino,
                es_anticipada: false,
                itemId: extraGuardado.id,
                nombre: `${pExtra.nombre} (Extra de combo)`,
                cantidad: cantExtra,
                modalidad,
                comboPadreNombre: prod.nombre,
              });
            }
          }
        }
      }

      // 5. Agrupar y crear COMANDAS por (destino, es_anticipada)
      const gruposComanda = new Map();
      for (const itemC of itemsComanda) {
        const key = `${itemC.destino}_${itemC.es_anticipada ? 'ANT' : 'NORM'}`;
        if (!gruposComanda.has(key)) {
          gruposComanda.set(key, {
            destino: itemC.destino,
            es_anticipada: itemC.es_anticipada,
            items: [],
          });
        }
        gruposComanda.get(key).items.push(itemC);
      }

      const comandasCreadas = [];
      for (const grupo of gruposComanda.values()) {
        const resComanda = await db.query(
          `INSERT INTO comanda (pedido_id, destino, es_anticipada, estado, enviada_en)
           VALUES ($1, $2, $3, 'ENVIADA', $4)
           RETURNING id, pedido_id, destino, es_anticipada, estado, enviada_en`,
          [pedidoId, grupo.destino, grupo.es_anticipada, horaServidor]
        );
        const comanda = resComanda.rows[0];
        comandasCreadas.push({
          ...comanda,
          total_items: grupo.items.length,
          items: grupo.items,
        });

        // Asociar cada ítem a su comanda
        for (const it of grupo.items) {
          await db.query(`UPDATE item_pedido SET comanda_id = $1 WHERE id = $2`, [comanda.id, it.itemId]);
        }

        // Emitir evento comanda.nueva a la sala correspondiente (cocina o bar)
        tiempoReal?.emitir(grupo.destino.toLowerCase(), 'comanda.nueva', {
          comanda_id: comanda.id,
          pedido_id: pedidoId,
          destino: grupo.destino,
          es_anticipada: grupo.es_anticipada,
          mesa_numero: cuenta.mesa_numero,
          cuenta_etiqueta: cuenta.etiqueta,
          mesero_id: meseroId,
          total_items: grupo.items.length,
          enviada_en: horaServidor,
        });
      }

      // Commit de la transacción
      await db.query('COMMIT');

      // Actualizar y emitir nuevo estado de la mesa
      const resMesaEstado = await db.query(
        `SELECT COALESCE(em.estado, 'CON_PEDIDOS_PENDIENTES') AS estado FROM v_estado_mesa em WHERE em.mesa_id = $1`,
        [cuenta.mesa_id]
      );
      const estadoMesaActual = resMesaEstado.rows[0]?.estado || 'CON_PEDIDOS_PENDIENTES';

      tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
        mesa_id: cuenta.mesa_id,
        numero: cuenta.mesa_numero,
        estado: estadoMesaActual,
      });

      tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
        cuenta_id: cId,
        mesa_id: cuenta.mesa_id,
        estado: cuenta.estado,
        nuevo_pedido_id: pedidoId,
      });

      return {
        id: pedidoId,
        cuenta_id: cId,
        mesero_id: meseroId,
        creado_en: horaServidor,
        comandas: comandasCreadas,
        total_items: itemsGuardados.length,
      };
    } catch (txError) {
      await db.query('ROLLBACK');
      throw txError;
    }
  } catch (errorDb) {
    if (errorDb instanceof ErrorNegocio) throw errorDb;

    // ==============================================================
    // FALLBACK EN MEMORIA (sin conexión activa a BD)
    // ==============================================================
    const cuenta = estadoMemoria.cuentas.find((c) => c.id === cId);
    if (!cuenta) {
      throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
    }
    if (cuenta.estado !== 'ABIERTA') {
      throw new ErrorNegocio(
        'CUENTA_NO_ABIERTA',
        'La cuenta ya no admite pedidos nuevos (en proceso de pago o pagada)',
        409
      );
    }

    const mesa = estadoMemoria.mesas.find((m) => m.id === cuenta.mesa_id) || { id: cuenta.mesa_id, numero: cuenta.mesa_id };
    const reas = estadoMemoria.reasignacionesMesa.find((r) => r.mesa_id === mesa.id && !r.vigente_hasta);
    const asig = estadoMemoria.asignacionesSector.find((a) => a.sector_id === mesa.sector_id && !a.vigente_hasta);
    const meseroId = reas ? reas.mesero_id : asig ? asig.mesero_id : usuarioAutenticado.id;

    const anticipadaCocina = estadoMemoria.parametros?.ANTICIPADA_ACTIVA_COCINA === 'true';
    const anticipadaBar = estadoMemoria.parametros?.ANTICIPADA_ACTIVA_BAR === 'true';

    const nuevoPedidoId = ((estadoMemoria.pedidos || []).reduce((max, p) => Math.max(max, p.id), 0) || 0) + 1;
    const itemsGuardados = [];
    const itemsComanda = [];

    for (const itemIn of items) {
      const prodId = Number(itemIn.producto_id);
      const cantidad = Number(itemIn.cantidad || 1);
      const modalidad = (itemIn.modalidad || 'MESA').toUpperCase();
      const observacion = itemIn.observacion ? itemIn.observacion.slice(0, 200) : null;

      if (isNaN(cantidad) || cantidad < 1) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'La cantidad del producto debe ser al menos 1', 400);
      }

      const prod = estadoMemoria.productos.find((p) => p.id === prodId);
      if (!prod || !prod.disponible) {
        throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', 'El producto no está disponible', 409);
      }

      if (modalidad === 'LLEVAR' && !prod.permite_llevar) {
        throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
      }

      if (modalidad === 'ANTICIPADA') {
        if (!prod.permite_anticipada) {
          throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
        }
        if (prod.destino === 'COCINA' && !anticipadaCocina) {
          throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
        }
        if (prod.destino === 'BAR' && !anticipadaBar) {
          throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'El producto no permite la modalidad seleccionada', 422);
        }
      }

      // Opciones
      const opcionesIds = Array.isArray(itemIn.opciones) ? itemIn.opciones.map(Number) : [];
      if (opcionesIds.length > 0) {
        for (const opId of opcionesIds) {
          const op = estadoMemoria.opciones.find((o) => o.id === opId);
          if (!op || !op.disponible) {
            throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', 'La modificación solicitada no está habilitada', 409);
          }
        }
        const restricciones = (estadoMemoria.restriccionesOpciones || []).filter(
          (r) => opcionesIds.includes(r.opcion_a_id) && opcionesIds.includes(r.opcion_b_id)
        );
        if (restricciones.length > 0) {
          throw new ErrorNegocio('COMBINACION_NO_PERMITIDA', 'La combinación de opciones no está permitida', 422);
        }
      }

      if (!prod.es_combo) {
        // Descontar stock
        if (prod.stock_cantidad !== null && prod.stock_cantidad !== undefined) {
          prod.stock_cantidad = Math.max(0, prod.stock_cantidad - cantidad);
          if (prod.stock_cantidad === 0) {
            prod.disponible = false;
            tiempoReal?.emitir(['meseros', prod.destino.toLowerCase()], 'producto.disponibilidad', {
              producto_id: prod.id,
              disponible: false,
              stock_cantidad: 0,
            });
          }
        }

        const nuevoItemId = ((estadoMemoria.itemsPedido || []).reduce((max, i) => Math.max(max, i.id), 0) || 0) + 1;
        const itemObj = {
          id: nuevoItemId,
          pedido_id: nuevoPedidoId,
          producto_id: prod.id,
          cantidad,
          precio_unitario: prod.precio,
          modalidad,
          observacion,
          item_padre_id: null,
          comanda_id: null,
        };
        estadoMemoria.itemsPedido.push(itemObj);

        for (const opId of opcionesIds) {
          const op = estadoMemoria.opciones.find((o) => o.id === opId);
          estadoMemoria.itemOpciones.push({
            item_id: nuevoItemId,
            opcion_id: opId,
            precio_extra: op?.precio_extra || 0,
          });
        }

        itemsGuardados.push(itemObj);
        itemsComanda.push({
          destino: prod.destino,
          es_anticipada: modalidad === 'ANTICIPADA',
          itemId: nuevoItemId,
          nombre: prod.nombre,
          cantidad,
        });
      } else {
        // COMBO
        if (modalidad === 'LLEVAR' && (itemIn.componentes_anticipados || []).length > 0) {
          throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'No se permiten componentes anticipados en pedidos para llevar', 422);
        }

        const quitados = (itemIn.componentes_quitados || []).map(Number);
        const anticipados = (itemIn.componentes_anticipados || []).map(Number);
        const componentes = (estadoMemoria.comboComponentes || []).filter((c) => c.combo_id === prod.id);

        for (const c of componentes) {
          const prodComp = estadoMemoria.productos.find((p) => p.id === c.producto_id);
          const estaQuitado = quitados.includes(c.producto_id);
          if (!c.removible && estaQuitado) {
            throw new ErrorNegocio('DATOS_INVALIDOS', `El componente no se puede quitar`, 400);
          }
          if (prodComp && !prodComp.disponible) {
            if (!c.removible || !estaQuitado) {
              throw new ErrorNegocio('PRODUCTO_NO_DISPONIBLE', `Componente no disponible`, 409);
            }
          }
        }

        const padreId = ((estadoMemoria.itemsPedido || []).reduce((max, i) => Math.max(max, i.id), 0) || 0) + 1;
        const padreObj = {
          id: padreId,
          pedido_id: nuevoPedidoId,
          producto_id: prod.id,
          cantidad,
          precio_unitario: prod.precio,
          modalidad,
          observacion,
          item_padre_id: null,
          comanda_id: null,
        };
        estadoMemoria.itemsPedido.push(padreObj);
        itemsGuardados.push(padreObj);

        for (const c of componentes) {
          if (quitados.includes(c.producto_id)) continue;
          const prodComp = estadoMemoria.productos.find((p) => p.id === c.producto_id);
          const esAnticipado = anticipados.includes(c.producto_id);

          if (esAnticipado) {
            if (!prodComp?.permite_anticipada) {
              throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'Componente no permite anticipada', 422);
            }
            if (prodComp.destino === 'COCINA' && !anticipadaCocina) {
              throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'Anticipada de Cocina no está activa', 422);
            }
            if (prodComp.destino === 'BAR' && !anticipadaBar) {
              throw new ErrorNegocio('MODALIDAD_NO_PERMITIDA', 'Anticipada de Bar no está activa', 422);
            }
          }

          if (prodComp && prodComp.stock_cantidad !== null && prodComp.stock_cantidad !== undefined) {
            prodComp.stock_cantidad = Math.max(0, prodComp.stock_cantidad - (c.cantidad * cantidad));
          }

          const hijoId = ((estadoMemoria.itemsPedido || []).reduce((max, i) => Math.max(max, i.id), 0) || 0) + 1;
          const hijoObj = {
            id: hijoId,
            pedido_id: nuevoPedidoId,
            producto_id: c.producto_id,
            cantidad: c.cantidad * cantidad,
            precio_unitario: 0,
            modalidad: esAnticipado ? 'ANTICIPADA' : modalidad,
            item_padre_id: padreId,
            comanda_id: null,
          };
          estadoMemoria.itemsPedido.push(hijoObj);
          itemsGuardados.push(hijoObj);

          itemsComanda.push({
            destino: prodComp.destino,
            es_anticipada: esAnticipado,
            itemId: hijoId,
            nombre: prodComp.nombre,
            cantidad: c.cantidad * cantidad,
          });
        }
      }
    }

    // Guardar Pedido en memoria
    const nuevoPedido = {
      id: nuevoPedidoId,
      cuenta_id: cId,
      mesero_id: meseroId,
      mesa_numero: mesa.numero,
      sector_nombre: estadoMemoria.sectores.find((s) => s.id === mesa.sector_id)?.nombre || null,
      creado_en: horaServidor,
      cancelado: false,
    };
    estadoMemoria.pedidos.push(nuevoPedido);

    // Crear comandas en memoria
    const grupos = new Map();
    for (const it of itemsComanda) {
      const k = `${it.destino}_${it.es_anticipada ? 'ANT' : 'NORM'}`;
      if (!grupos.has(k)) {
        grupos.set(k, { destino: it.destino, es_anticipada: it.es_anticipada, items: [] });
      }
      grupos.get(k).items.push(it);
    }

    const comandasCreadas = [];
    for (const g of grupos.values()) {
      const cIdComanda = ((estadoMemoria.comandas || []).reduce((max, k) => Math.max(max, k.id), 0) || 0) + 1;
      const comandaObj = {
        id: cIdComanda,
        pedido_id: nuevoPedidoId,
        destino: g.destino,
        es_anticipada: g.es_anticipada,
        estado: 'ENVIADA',
        enviada_en: horaServidor,
        confirmada_en: null,
        confirmada_por: null,
        items_confirmados: null,
        lista_en: null,
      };
      if (!estadoMemoria.comandas) estadoMemoria.comandas = [];
      estadoMemoria.comandas.push(comandaObj);

      comandasCreadas.push({
        ...comandaObj,
        total_items: g.items.length,
        items: g.items,
      });

      for (const it of g.items) {
        const itemObj = estadoMemoria.itemsPedido.find((i) => i.id === it.itemId);
        if (itemObj) itemObj.comanda_id = cIdComanda;
      }

      tiempoReal?.emitir(g.destino.toLowerCase(), 'comanda.nueva', {
        comanda_id: comandaObj.id,
        pedido_id: nuevoPedidoId,
        destino: g.destino,
        es_anticipada: g.es_anticipada,
        mesa_numero: mesa.numero,
        cuenta_etiqueta: cuenta.etiqueta,
        mesero_id: meseroId,
        total_items: g.items.length,
        enviada_en: horaServidor,
      });
    }

    const nuevoEstadoMesa = calcularEstadoMesa(cuenta.mesa_id);
    mesa.estado = nuevoEstadoMesa;

    tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
      mesa_id: cuenta.mesa_id,
      numero: mesa.numero,
      estado: nuevoEstadoMesa,
    });

    tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
      cuenta_id: cId,
      mesa_id: cuenta.mesa_id,
      estado: cuenta.estado,
      nuevo_pedido_id: nuevoPedidoId,
    });

    return {
      id: nuevoPedidoId,
      cuenta_id: cId,
      mesero_id: meseroId,
      creado_en: horaServidor,
      comandas: comandasCreadas,
      total_items: itemsGuardados.length,
    };
  }
}

/**
 * Consulta del detalle de un pedido (RF12 / CU13).
 */
export async function obtenerPedidoPorId(pedidoId, db) {
  const pId = Number(pedidoId);
  if (isNaN(pId) || pId <= 0) {
    throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de pedido inválido', 400);
  }

  try {
    const resPedido = await db.query(
      `SELECT p.id, p.cuenta_id, p.mesero_id, u.nombre_completo AS mesero_nombre,
              p.creado_en, c.mesa_id, m.numero AS mesa_numero, c.etiqueta AS cuenta_etiqueta,
              EXISTS (SELECT 1 FROM cancelacion x WHERE x.pedido_id = p.id AND x.estado = 'APROBADA') AS cancelado
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
    const ped = resPedido.rows[0];

    // Ítems y opciones
    const resItems = await db.query(
      `SELECT i.id, i.producto_id, pr.nombre AS producto_nombre, i.cantidad,
              i.precio_unitario, i.modalidad, i.observacion, i.item_padre_id, i.comanda_id
       FROM item_pedido i
       JOIN producto pr ON pr.id = i.producto_id
       WHERE i.pedido_id = $1
       ORDER BY i.id ASC`,
      [pId]
    );

    const items = [];
    let totalPedido = 0;

    for (const row of resItems.rows) {
      const resOps = await db.query(
        `SELECT op.id, op.nombre, io.precio_extra
         FROM item_opcion io
         JOIN opcion_personalizacion op ON op.id = io.opcion_id
         WHERE io.item_id = $1`,
        [row.id]
      );
      const opciones = resOps.rows.map((o) => ({
        id: o.id,
        nombre: o.nombre,
        precio_extra: Number(o.precio_extra),
      }));

      const extraTotal = opciones.reduce((acc, o) => acc + o.precio_extra, 0);
      const subtotal = Number(row.cantidad) * (Number(row.precio_unitario) + extraTotal);
      if (!ped.cancelado) {
        totalPedido += subtotal;
      }

      items.push({
        id: row.id,
        producto_id: row.producto_id,
        producto_nombre: row.producto_nombre,
        cantidad: Number(row.cantidad),
        precio_unitario: Number(row.precio_unitario),
        modalidad: row.modalidad,
        observacion: row.observacion,
        subtotal,
        item_padre_id: row.item_padre_id,
        comanda_id: row.comanda_id,
        opciones,
      });
    }

    // Comandas
    const resComandas = await db.query(
      `SELECT id, destino, es_anticipada, estado, enviada_en, confirmada_en, items_confirmados, lista_en
       FROM comanda WHERE pedido_id = $1`,
      [pId]
    );

    return {
      id: ped.id,
      cuenta_id: ped.cuenta_id,
      mesa_id: ped.mesa_id,
      mesa_numero: ped.mesa_numero,
      cuenta_etiqueta: ped.cuenta_etiqueta,
      mesero: {
        id: ped.mesero_id,
        nombre_completo: ped.mesero_nombre,
      },
      creado_en: ped.creado_en,
      cancelado: ped.cancelado,
      total: totalPedido,
      items,
      comandas: resComandas.rows,
    };
  } catch (dbError) {
    if (dbError instanceof ErrorNegocio) throw dbError;

    // Fallback memoria
    const ped = (estadoMemoria.pedidos || []).find((p) => p.id === pId);
    if (!ped) {
      throw new ErrorNegocio('PEDIDO_NO_ENCONTRADO', 'Pedido no encontrado', 404);
    }

    const cuenta = estadoMemoria.cuentas.find((c) => c.id === ped.cuenta_id) || {};
    const mesa = estadoMemoria.mesas.find((m) => m.id === cuenta.mesa_id) || {};
    const mesero = estadoMemoria.usuarios.find((u) => u.id === ped.mesero_id) || {
      id: ped.mesero_id,
      nombre_completo: 'Mesero',
    };

    const itemsRaw = (estadoMemoria.itemsPedido || []).filter((i) => i.pedido_id === pId);
    let total = 0;
    const items = itemsRaw.map((it) => {
      const prod = estadoMemoria.productos.find((p) => p.id === it.producto_id);
      const opsRel = (estadoMemoria.itemOpciones || []).filter((o) => o.item_id === it.id);
      const opciones = opsRel.map((o) => {
        const def = estadoMemoria.opciones.find((op) => op.id === o.opcion_id);
        return {
          id: o.opcion_id,
          nombre: def ? def.nombre : 'Opción',
          precio_extra: Number(o.precio_extra || 0),
        };
      });
      const extra = opciones.reduce((acc, o) => acc + o.precio_extra, 0);
      const subtotal = Number(it.cantidad) * (Number(it.precio_unitario) + extra);
      if (!ped.cancelado) total += subtotal;

      return {
        id: it.id,
        producto_id: it.producto_id,
        producto_nombre: prod ? prod.nombre : 'Producto',
        cantidad: Number(it.cantidad),
        precio_unitario: Number(it.precio_unitario),
        modalidad: it.modalidad,
        observacion: it.observacion,
        subtotal,
        item_padre_id: it.item_padre_id,
        comanda_id: it.comanda_id,
        opciones,
      };
    });

    const comandas = (estadoMemoria.comandas || []).filter((k) => k.pedido_id === pId);

    return {
      id: ped.id,
      cuenta_id: ped.cuenta_id,
      mesa_id: cuenta.mesa_id,
      mesa_numero: mesa.numero,
      cuenta_etiqueta: cuenta.etiqueta,
      mesero: {
        id: mesero.id,
        nombre_completo: mesero.nombre_completo,
      },
      creado_en: ped.creado_en,
      cancelado: Boolean(ped.cancelado),
      total,
      items,
      comandas,
    };
  }
}
