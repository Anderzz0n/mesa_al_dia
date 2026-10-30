import express from 'express';
import { ErrorNegocio } from '../errores.js';
import { crearMiddlewareAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoMemoria, calcularEstadoMesa, calcularTotalCuenta } from '../db/memoria.js';
import { registrarPedidoEnCuenta } from '../servicios/pedidos.js';

/**
 * Rutas de Cuentas (RF4, RF12, RF14 / CU9, CU13, CU14, CU16).
 * Base: /api/v1/cuentas
 */
export function rutaCuentas(db, { tiempoReal = null, secreto = config.jwtSecreto } = {}) {
  const router = express.Router();
  const { autenticar, exigirRol } = crearMiddlewareAuth(secreto);

  // GET / : Lista general de cuentas para Caja y Admin (CU16)
  // Query params: estado, mesa_id, fecha
  router.get('/', autenticar, exigirRol('CAJA', 'ADMIN'), async (req, res, next) => {
    try {
      const { estado, mesa_id, fecha } = req.query || {};
      const horaServidor = new Date().toISOString();

      try {
        let sql = `
          SELECT 
            c.id,
            c.mesa_id,
            m.numero AS mesa_numero,
            s.nombre AS sector_nombre,
            c.etiqueta,
            c.estado,
            c.abierta_en,
            c.cerrada_en,
            u_cierre.nombre_completo AS cerrada_por_nombre,
            COALESCE(vt.total, 0) AS total,
            (SELECT COUNT(*) FROM pedido p WHERE p.cuenta_id = c.id) AS pedidos_cantidad,
            (
              SELECT COUNT(*) 
              FROM pedido p 
              JOIN comanda k ON k.pedido_id = p.id 
              WHERE p.cuenta_id = c.id AND k.estado NOT IN ('LISTA', 'CANCELADA')
            ) AS comandas_sin_terminar,
            (
              SELECT COUNT(*) 
              FROM pedido p 
              JOIN cancelacion x ON x.pedido_id = p.id 
              WHERE p.cuenta_id = c.id AND x.estado IN ('SOLICITADA', 'PENDIENTE')
            ) AS cancelaciones_por_resolver
          FROM cuenta c
          JOIN mesa m ON m.id = c.mesa_id
          LEFT JOIN sector s ON s.id = m.sector_id
          LEFT JOIN v_total_cuenta vt ON vt.cuenta_id = c.id
          LEFT JOIN usuario u_cierre ON u_cierre.id = c.cerrada_por
          WHERE 1=1
        `;

        const params = [];
        let contador = 1;

        if (estado) {
          const estados = estado.split(',').map((e) => e.trim().toUpperCase());
          sql += ` AND c.estado = ANY($${contador++})`;
          params.push(estados);
        }

        if (mesa_id) {
          sql += ` AND c.mesa_id = $${contador++}`;
          params.push(Number(mesa_id));
        }

        if (fecha) {
          if (fecha.toLowerCase() === 'hoy') {
            sql += ` AND (
              (c.estado = 'PAGADA' AND c.cerrada_en::date = CURRENT_DATE)
              OR (c.estado <> 'PAGADA' AND c.abierta_en::date = CURRENT_DATE)
            )`;
          } else {
            sql += ` AND (
              (c.estado = 'PAGADA' AND c.cerrada_en::date = $${contador}::date)
              OR (c.estado <> 'PAGADA' AND c.abierta_en::date = $${contador}::date)
            )`;
            params.push(fecha);
            contador++;
          }
        }

        sql += ` ORDER BY c.abierta_en ASC`;

        const resultado = await db.query(sql, params);
        const cuentas = resultado.rows.map((row) => ({
          id: row.id,
          mesa: {
            id: row.mesa_id,
            numero: row.mesa_numero,
            sector_nombre: row.sector_nombre,
          },
          etiqueta: row.etiqueta,
          estado: row.estado,
          abierta_en: row.abierta_en,
          cerrada_en: row.cerrada_en,
          cerrada_por: row.cerrada_por_nombre,
          metodo_pago: null,
          propina: 0,
          total: Number(row.total),
          pedidos: Number(row.pedidos_cantidad),
          comandas_sin_terminar: Number(row.comandas_sin_terminar),
          cancelaciones_por_resolver: Number(row.cancelaciones_por_resolver),
        }));

        return res.json({
          hora_servidor: horaServidor,
          cuentas,
        });
      } catch (dbError) {
        // Fallback en memoria
        let filtradas = [...estadoMemoria.cuentas];

        if (estado) {
          const estados = estado.split(',').map((e) => e.trim().toUpperCase());
          filtradas = filtradas.filter((c) => estados.includes(c.estado));
        }

        if (mesa_id) {
          filtradas = filtradas.filter((c) => c.mesa_id === Number(mesa_id));
        }

        if (fecha) {
          const hoyStr = new Date().toISOString().slice(0, 10);
          const fechaFiltro = fecha.toLowerCase() === 'hoy' ? hoyStr : fecha;
          filtradas = filtradas.filter((c) => {
            const fechaRef = (c.cerrada_en || c.abierta_en || '').slice(0, 10);
            return fechaRef === fechaFiltro;
          });
        }

        filtradas.sort((a, b) => new Date(a.abierta_en) - new Date(b.abierta_en));

        const cuentas = filtradas.map((c) => {
          const mesa = estadoMemoria.mesas.find((m) => m.id === c.mesa_id) || { id: c.mesa_id, numero: c.mesa_id };
          const sector = estadoMemoria.sectores.find((s) => s.id === mesa.sector_id);
          const pedidosCuenta = estadoMemoria.pedidos.filter((p) => p.cuenta_id === c.id);
          const pedidosIds = new Set(pedidosCuenta.map((p) => p.id));
          const comandasSinTerminar = (estadoMemoria.comandas || []).filter(
            (k) => pedidosIds.has(k.pedido_id) && !['LISTA', 'CANCELADA'].includes(k.estado)
          ).length;
          const cancelacionesPorResolver = (estadoMemoria.cancelaciones || []).filter(
            (x) => pedidosIds.has(x.pedido_id) && ['SOLICITADA', 'PENDIENTE'].includes(x.estado)
          ).length;

          return {
            id: c.id,
            mesa: {
              id: mesa.id,
              numero: mesa.numero,
              sector_nombre: sector ? sector.nombre : null,
            },
            etiqueta: c.etiqueta,
            estado: c.estado,
            abierta_en: c.abierta_en,
            cerrada_en: c.cerrada_en,
            cerrada_por: c.cerrada_por,
            metodo_pago: c.metodo_pago || null,
            propina: c.propina || 0,
            total: calcularTotalCuenta(c.id),
            pedidos: pedidosCuenta.length,
            comandas_sin_terminar: comandasSinTerminar,
            cancelaciones_por_resolver: cancelacionesPorResolver,
          };
        });

        return res.json({
          hora_servidor: horaServidor,
          cuentas,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // GET /:id : Detalle completo de una cuenta (RF4 / CU9, CU13)
  router.get('/:id', autenticar, exigirRol('MESERO', 'CAJA', 'ADMIN'), async (req, res, next) => {
    try {
      const cuentaId = Number(req.params.id);
      if (isNaN(cuentaId) || cuentaId <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de cuenta inválido', 400);
      }

      const horaServidor = new Date().toISOString();

      try {
        const sqlCuenta = `
          SELECT 
            c.id,
            c.mesa_id,
            m.numero AS mesa_numero,
            s.nombre AS sector_nombre,
            c.etiqueta,
            c.estado,
            c.abierta_en,
            c.cerrada_en,
            u_cierre.nombre_completo AS cerrada_por_nombre,
            COALESCE(vt.total, 0) AS total
          FROM cuenta c
          JOIN mesa m ON m.id = c.mesa_id
          LEFT JOIN sector s ON s.id = m.sector_id
          LEFT JOIN v_total_cuenta vt ON vt.cuenta_id = c.id
          LEFT JOIN usuario u_cierre ON u_cierre.id = c.cerrada_por
          WHERE c.id = $1
        `;
        const resCuenta = await db.query(sqlCuenta, [cuentaId]);
        if (resCuenta.rows.length === 0) {
          throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
        }

        const cuenta = resCuenta.rows[0];

        // Pedidos de la cuenta
        const sqlPedidos = `
          SELECT 
            p.id,
            p.creado_en,
            p.mesero_id,
            u.nombre_completo AS mesero_nombre,
            EXISTS (
              SELECT 1 FROM cancelacion x WHERE x.pedido_id = p.id AND x.estado = 'APROBADA'
            ) AS cancelado
          FROM pedido p
          JOIN usuario u ON u.id = p.mesero_id
          WHERE p.cuenta_id = $1
          ORDER BY p.creado_en ASC
        `;
        const resPedidos = await db.query(sqlPedidos, [cuentaId]);

        const pedidos = [];
        for (const ped of resPedidos.rows) {
          const sqlItems = `
            SELECT 
              i.id,
              i.producto_id,
              pr.nombre AS producto_nombre,
              i.cantidad,
              i.precio_unitario,
              i.modalidad,
              i.observacion,
              i.item_padre_id
            FROM item_pedido i
            JOIN producto pr ON pr.id = i.producto_id
            WHERE i.pedido_id = $1
            ORDER BY i.id ASC
          `;
          const resItems = await db.query(sqlItems, [ped.id]);

          let totalPedido = 0;
          const itemsMap = new Map();
          const itemsRaiz = [];

          for (const itemRow of resItems.rows) {
            const sqlOpciones = `
              SELECT o.id, o.nombre, io.precio_extra
              FROM item_opcion io
              JOIN opcion_personalizacion o ON o.id = io.opcion_id
              WHERE io.item_id = $1
            `;
            const resOpciones = await db.query(sqlOpciones, [itemRow.id]);
            const opciones = resOpciones.rows.map((op) => ({
              id: op.id,
              nombre: op.nombre,
              precio_extra: Number(op.precio_extra),
            }));

            const extraTotal = opciones.reduce((acc, o) => acc + o.precio_extra, 0);
            const subtotal = Number(itemRow.cantidad) * (Number(itemRow.precio_unitario) + extraTotal);
            if (!ped.cancelado) {
              totalPedido += subtotal;
            }

            const itemObj = {
              id: itemRow.id,
              producto_id: itemRow.producto_id,
              producto_nombre: itemRow.producto_nombre,
              cantidad: Number(itemRow.cantidad),
              precio_unitario: Number(itemRow.precio_unitario),
              modalidad: itemRow.modalidad,
              observacion: itemRow.observacion,
              subtotal,
              opciones,
              componentes: [],
            };

            itemsMap.set(itemRow.id, itemObj);
            if (itemRow.item_padre_id) {
              const padre = itemsMap.get(itemRow.item_padre_id);
              if (padre) padre.componentes.push(itemObj);
            } else {
              itemsRaiz.push(itemObj);
            }
          }

          // Comandas del pedido
          const sqlComandas = `
            SELECT id, destino, es_anticipada, estado, confirmada_en, items_confirmados, lista_en
            FROM comanda WHERE pedido_id = $1
            ORDER BY id ASC
          `;
          const resComandas = await db.query(sqlComandas, [ped.id]);

          // Cancelación del pedido si existe
          const sqlCanc = `
            SELECT id, estado, motivo, solicitada_en, resuelta_en
            FROM cancelacion WHERE pedido_id = $1
            ORDER BY id DESC LIMIT 1
          `;
          const resCanc = await db.query(sqlCanc, [ped.id]);
          const cancelacionInfo = resCanc.rows.length > 0 ? resCanc.rows[0] : null;

          pedidos.push({
            id: ped.id,
            creado_en: ped.creado_en,
            mesero: {
              id: ped.mesero_id,
              nombre_completo: ped.mesero_nombre,
            },
            cancelado: ped.cancelado,
            cancelacion: cancelacionInfo,
            comandas: resComandas.rows,
            total: totalPedido,
            items: itemsRaiz,
          });
        }

        return res.json({
          hora_servidor: horaServidor,
          cuenta: {
            id: cuenta.id,
            mesa_id: cuenta.mesa_id,
            mesa_numero: cuenta.mesa_numero,
            sector_nombre: cuenta.sector_nombre,
            etiqueta: cuenta.etiqueta,
            estado: cuenta.estado,
            abierta_en: cuenta.abierta_en,
            cerrada_en: cuenta.cerrada_en,
            cerrada_por: cuenta.cerrada_por_nombre,
            metodo_pago: null,
            propina: 0,
            total: Number(cuenta.total),
            pedidos,
          },
        });
      } catch (dbError) {
        if (dbError instanceof ErrorNegocio) throw dbError;

        // Fallback en memoria
        const c = estadoMemoria.cuentas.find((item) => item.id === cuentaId);
        if (!c) {
          throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
        }

        const mesa = estadoMemoria.mesas.find((m) => m.id === c.mesa_id) || { id: c.mesa_id, numero: c.mesa_id };
        const sector = estadoMemoria.sectores.find((s) => s.id === mesa.sector_id);
        const pedidosCuenta = estadoMemoria.pedidos.filter((p) => p.cuenta_id === c.id);

        const pedidos = pedidosCuenta.map((ped) => {
          const itemsRaw = (estadoMemoria.itemsPedido || []).filter((i) => i.pedido_id === ped.id);
          let totalPedido = 0;
          const itemsMap = new Map();
          const itemsRaiz = [];

          for (const item of itemsRaw) {
            const prod = estadoMemoria.productos.find((p) => p.id === item.producto_id);
            const opsRel = (estadoMemoria.itemOpciones || []).filter((o) => o.item_id === item.id);
            const opciones = opsRel.map((o) => {
              const opDef = estadoMemoria.opciones.find((op) => op.id === o.opcion_id);
              return {
                id: o.opcion_id,
                nombre: opDef ? opDef.nombre : 'Opción',
                precio_extra: Number(o.precio_extra || 0),
              };
            });

            const extra = opciones.reduce((acc, o) => acc + o.precio_extra, 0);
            const subtotal = Number(item.cantidad) * (Number(item.precio_unitario) + extra);
            if (!ped.cancelado) {
              totalPedido += subtotal;
            }

            const itemObj = {
              id: item.id,
              producto_id: item.producto_id,
              producto_nombre: prod ? prod.nombre : 'Producto',
              cantidad: Number(item.cantidad),
              precio_unitario: Number(item.precio_unitario),
              modalidad: item.modalidad || 'MESA',
              observacion: item.observacion || null,
              subtotal,
              opciones,
              componentes: [],
            };

            itemsMap.set(item.id, itemObj);
            if (item.item_padre_id) {
              const padre = itemsMap.get(item.item_padre_id);
              if (padre) padre.componentes.push(itemObj);
            } else {
              itemsRaiz.push(itemObj);
            }
          }

          const mesero = estadoMemoria.usuarios.find((u) => u.id === ped.mesero_id) || {
            id: ped.mesero_id,
            nombre_completo: 'Mesero',
          };

          const comandasPed = (estadoMemoria.comandas || []).filter((k) => k.pedido_id === ped.id);
          const cancPed = (estadoMemoria.cancelaciones || []).filter((x) => x.pedido_id === ped.id).slice(-1)[0] || null;

          return {
            id: ped.id,
            creado_en: ped.creado_en,
            mesero: {
              id: mesero.id,
              nombre_completo: mesero.nombre_completo,
            },
            cancelado: !!ped.cancelado,
            cancelacion: cancPed ? {
              id: cancPed.id,
              estado: cancPed.estado,
              motivo: cancPed.motivo,
              solicitada_en: cancPed.solicitada_en,
              resuelta_en: cancPed.resuelta_en,
            } : null,
            comandas: comandasPed,
            total: totalPedido,
            items: itemsRaiz,
          };
        });

        return res.json({
          hora_servidor: horaServidor,
          cuenta: {
            id: c.id,
            mesa_id: c.mesa_id,
            mesa_numero: mesa.numero,
            sector_nombre: sector ? sector.nombre : null,
            etiqueta: c.etiqueta,
            estado: c.estado,
            abierta_en: c.abierta_en,
            cerrada_en: c.cerrada_en,
            cerrada_por: c.cerrada_por,
            metodo_pago: c.metodo_pago || null,
            propina: c.propina || 0,
            total: calcularTotalCuenta(c.id),
            pedidos,
          },
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // PATCH /:id : Transición de estado de la cuenta (RF4 · CU9, CU16)
  // Cuerpo: { "estado": "PENDIENTE" | "ABIERTA" }
  router.patch('/:id', autenticar, exigirRol('MESERO', 'CAJA', 'ADMIN'), async (req, res, next) => {
    try {
      const cuentaId = Number(req.params.id);
      const { estado: nuevoEstado } = req.body || {};

      if (!['ABIERTA', 'PENDIENTE'].includes(nuevoEstado)) {
        throw new ErrorNegocio(
          'DATOS_INVALIDOS',
          'El estado debe ser ABIERTA o PENDIENTE',
          400
        );
      }

      try {
        // Verificar estado actual
        const resActual = await db.query('SELECT id, mesa_id, etiqueta, estado FROM cuenta WHERE id = $1', [cuentaId]);
        if (resActual.rows.length === 0) {
          throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
        }

        const cuentaActual = resActual.rows[0];
        if (cuentaActual.estado === 'PAGADA') {
          throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
        }

        await db.query('UPDATE cuenta SET estado = $1 WHERE id = $2', [nuevoEstado, cuentaId]);

        // Consultar nuevo estado de la mesa
        const resMesa = await db.query(
          'SELECT m.id, m.numero, COALESCE(em.estado, \'DISPONIBLE\') AS estado FROM mesa m LEFT JOIN v_estado_mesa em ON em.mesa_id = m.id WHERE m.id = $1',
          [cuentaActual.mesa_id]
        );
        const mesaInfo = resMesa.rows[0];

        // Emitir eventos en tiempo real
        tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
          cuenta_id: cuentaId,
          mesa_id: cuentaActual.mesa_id,
          etiqueta: cuentaActual.etiqueta,
          estado: nuevoEstado,
        });

        if (mesaInfo) {
          tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
            mesa_id: mesaInfo.id,
            numero: mesaInfo.numero,
            estado: mesaInfo.estado,
          });
        }

        return res.json({
          id: cuentaId,
          mesa_id: cuentaActual.mesa_id,
          etiqueta: cuentaActual.etiqueta,
          estado: nuevoEstado,
        });
      } catch (dbError) {
        if (dbError instanceof ErrorNegocio) throw dbError;

        // Fallback en memoria
        const c = estadoMemoria.cuentas.find((item) => item.id === cuentaId);
        if (!c) {
          throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
        }

        if (c.estado === 'PAGADA') {
          throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
        }

        c.estado = nuevoEstado;
        const nuevoEstadoMesa = calcularEstadoMesa(c.mesa_id);
        const mesa = estadoMemoria.mesas.find((m) => m.id === c.mesa_id);

        tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
          cuenta_id: c.id,
          mesa_id: c.mesa_id,
          etiqueta: c.etiqueta,
          estado: nuevoEstado,
        });

        if (mesa) {
          mesa.estado = nuevoEstadoMesa;
          tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
            mesa_id: mesa.id,
            numero: mesa.numero,
            estado: nuevoEstadoMesa,
          });
        }

        return res.json({
          id: c.id,
          mesa_id: c.mesa_id,
          etiqueta: c.etiqueta,
          estado: c.estado,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/pedidos : Envía un pedido en una cuenta abierta (RF12 / CU10, CU11, CU13, CU25)
  router.post('/:id/pedidos', autenticar, exigirRol('MESERO', 'ADMIN'), async (req, res, next) => {
    try {
      const cuentaId = req.params.id;
      const { items } = req.body || {};

      const resultado = await registrarPedidoEnCuenta({
        cuentaId,
        items,
        usuarioAutenticado: req.usuario,
        db,
        tiempoReal,
      });

      return res.status(201).json(resultado);
    } catch (err) {
      next(err);
    }
  });

  // POST /:id/liquidacion : Liquidación y cobro de una cuenta en proceso de pago (RF14 · CU16)
  router.post('/:id/liquidacion', autenticar, exigirRol('CAJA', 'ADMIN'), async (req, res, next) => {
    try {
      const cuentaId = Number(req.params.id);
      if (isNaN(cuentaId) || cuentaId <= 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'Identificador de cuenta inválido', 400);
      }

      const { metodo_pago, propina = 0 } = req.body || {};
      const metodoLimpio = String(metodo_pago || '').trim().toUpperCase();
      if (!metodoLimpio) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'El método de pago es obligatorio', 400);
      }

      const propinaNum = Number(propina);
      if (isNaN(propinaNum) || !Number.isInteger(propinaNum) || propinaNum < 0) {
        throw new ErrorNegocio('DATOS_INVALIDOS', 'La propina debe ser un número entero mayor o igual a 0', 400);
      }

      const horaServidor = new Date().toISOString();

      try {
        // Consultar cuenta y mesa
        const resCuenta = await db.query(
          `SELECT c.id, c.mesa_id, c.etiqueta, c.estado, c.abierta_en, m.numero AS mesa_numero
           FROM cuenta c
           JOIN mesa m ON m.id = c.mesa_id
           WHERE c.id = $1`,
          [cuentaId]
        );

        if (resCuenta.rows.length === 0) {
          throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
        }
        const cuenta = resCuenta.rows[0];

        if (cuenta.estado === 'ABIERTA') {
          throw new ErrorNegocio('CUENTA_NO_PENDIENTE', 'Solo se puede liquidar una cuenta en proceso de pago', 409);
        }

        if (cuenta.estado === 'PAGADA') {
          throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
        }

        // Verificar cancelaciones pendientes por resolver
        const resCancPend = await db.query(
          `SELECT x.id FROM cancelacion x
           JOIN pedido p ON p.id = x.pedido_id
           WHERE p.cuenta_id = $1 AND x.estado = 'SOLICITADA'`,
          [cuentaId]
        );
        if (resCancPend.rows.length > 0) {
          throw new ErrorNegocio('CANCELACIONES_POR_RESOLVER', 'La cuenta tiene cancelaciones sin resolver', 409);
        }

        // Actualizar cuenta a PAGADA
        await db.query(
          `UPDATE cuenta
           SET estado = 'PAGADA', cerrada_en = $1, cerrada_por = $2, metodo_pago = $3, propina = $4
           WHERE id = $5`,
          [horaServidor, req.usuario.id, metodoLimpio, propinaNum, cuentaId]
        );

        // Obtener total de la cuenta
        const resTotal = await db.query(
          `SELECT COALESCE(total, 0) AS total FROM v_total_cuenta WHERE cuenta_id = $1`,
          [cuentaId]
        );
        const total = Number(resTotal.rows[0]?.total || 0);

        // Derivar estado resultante de la mesa
        const resMesaEstado = await db.query(
          `SELECT COALESCE(estado, 'DISPONIBLE') AS estado FROM v_estado_mesa WHERE mesa_id = $1`,
          [cuenta.mesa_id]
        );
        const mesaEstado = resMesaEstado.rows[0]?.estado || 'DISPONIBLE';

        // Emitir eventos
        tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
          cuenta_id: cuentaId,
          mesa_id: cuenta.mesa_id,
          estado: 'PAGADA',
          metodo_pago: metodoLimpio,
          propina: propinaNum,
          total,
        });

        tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
          mesa_id: cuenta.mesa_id,
          numero: cuenta.mesa_numero,
          estado: mesaEstado,
        });

        return res.json({
          cuenta: {
            id: cuenta.id,
            mesa_id: cuenta.mesa_id,
            mesa_numero: cuenta.mesa_numero,
            etiqueta: cuenta.etiqueta,
            estado: 'PAGADA',
            abierta_en: cuenta.abierta_en,
            cerrada_en: horaServidor,
            cerrada_por: req.usuario.nombre_completo || req.usuario.nombre_usuario,
            metodo_pago: metodoLimpio,
            propina: propinaNum,
            total,
          },
          mesa_estado: mesaEstado,
          hora_servidor: horaServidor,
        });
      } catch (dbError) {
        if (dbError instanceof ErrorNegocio) throw dbError;

        // Fallback en memoria
        const c = (estadoMemoria.cuentas || []).find((item) => item.id === cuentaId);
        if (!c) {
          throw new ErrorNegocio('CUENTA_NO_ENCONTRADA', 'Cuenta no encontrada', 404);
        }

        if (c.estado === 'ABIERTA') {
          throw new ErrorNegocio('CUENTA_NO_PENDIENTE', 'Solo se puede liquidar una cuenta en proceso de pago', 409);
        }

        if (c.estado === 'PAGADA') {
          throw new ErrorNegocio('CUENTA_PAGADA', 'La cuenta ya fue liquidada', 409);
        }

        // Cancelaciones pendientes de resolver
        const pedidosCuenta = (estadoMemoria.pedidos || []).filter((p) => p.cuenta_id === cuentaId);
        const pedidosIds = new Set(pedidosCuenta.map((p) => p.id));
        const tieneCancPorResolver = (estadoMemoria.cancelaciones || []).some(
          (x) => pedidosIds.has(x.pedido_id) && ['SOLICITADA', 'PENDIENTE'].includes(x.estado)
        );
        if (tieneCancPorResolver) {
          throw new ErrorNegocio('CANCELACIONES_POR_RESOLVER', 'La cuenta tiene cancelaciones sin resolver', 409);
        }

        c.estado = 'PAGADA';
        c.cerrada_en = horaServidor;
        c.cerrada_por = req.usuario.id;
        c.metodo_pago = metodoLimpio;
        c.propina = propinaNum;

        const total = calcularTotalCuenta(cuentaId);
        const nuevoEstadoMesa = calcularEstadoMesa(c.mesa_id);
        const mesa = (estadoMemoria.mesas || []).find((m) => m.id === c.mesa_id);
        if (mesa) mesa.estado = nuevoEstadoMesa;

        tiempoReal?.emitir(['caja', 'meseros'], 'cuenta.estado', {
          cuenta_id: c.id,
          mesa_id: c.mesa_id,
          estado: 'PAGADA',
          metodo_pago: metodoLimpio,
          propina: propinaNum,
          total,
        });

        if (mesa) {
          tiempoReal?.emitir(['meseros', 'caja'], 'mesa.estado', {
            mesa_id: mesa.id,
            numero: mesa.numero,
            estado: nuevoEstadoMesa,
          });
        }

        return res.json({
          cuenta: {
            id: c.id,
            mesa_id: c.mesa_id,
            mesa_numero: mesa ? mesa.numero : c.mesa_id,
            etiqueta: c.etiqueta,
            estado: 'PAGADA',
            abierta_en: c.abierta_en,
            cerrada_en: horaServidor,
            cerrada_por: req.usuario.nombre_completo || req.usuario.nombre_usuario,
            metodo_pago: metodoLimpio,
            propina: propinaNum,
            total,
          },
          mesa_estado: nuevoEstadoMesa,
          hora_servidor: horaServidor,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}

