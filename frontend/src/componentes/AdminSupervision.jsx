import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  obtenerActividadMesero,
  obtenerCuentas,
  obtenerCancelaciones,
  obtenerPedidos,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

function obtenerFechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminSupervision({ meseros = [] }) {
  // Subpestañas estilo Wireframe A4a / A4b
  const [subtab, setSubtab] = useState('actividad'); // 'actividad' (A4a) | 'resumen' (A4b)

  // Estados para A4a: Actividad del mesero
  const [meseroSeleccionado, setMeseroSeleccionado] = useState('');
  const [fechaActividad, setFechaActividad] = useState(obtenerFechaHoy);
  const [actividad, setActividad] = useState(null);
  const [cargandoActividad, setCargandoActividad] = useState(false);
  const [errorActividad, setErrorActividad] = useState(null);

  // Estados para A4b: Resumen del día (Obj. 6)
  const [fechaResumen, setFechaResumen] = useState(obtenerFechaHoy);
  const [cuentasResumen, setCuentasResumen] = useState([]);
  const [cancelacionesResumen, setCancelacionesResumen] = useState([]);
  const [pedidosResumen, setPedidosResumen] = useState([]);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [errorResumen, setErrorResumen] = useState(null);

  const meseroIdEfectivo = meseroSeleccionado || (meseros[0]?.id ? String(meseros[0].id) : '');

  // ---------------------------------------------------------------------------
  // CARGA: Actividad del mesero (A4a)
  // ---------------------------------------------------------------------------
  const recargarActividad = useCallback(async () => {
    if (!meseroIdEfectivo) return;
    setCargandoActividad(true);
    setErrorActividad(null);
    try {
      const data = await obtenerActividadMesero(meseroIdEfectivo, fechaActividad);
      setActividad(data);
    } catch (err) {
      setErrorActividad(err.message || 'Error al obtener la actividad del mesero');
    } finally {
      setCargandoActividad(false);
    }
  }, [meseroIdEfectivo, fechaActividad]);

  useEffect(() => {
    let activo = true;
    if (subtab === 'actividad' && meseroIdEfectivo) {
      (async () => {
        try {
          const data = await obtenerActividadMesero(meseroIdEfectivo, fechaActividad);
          if (activo) {
            setActividad(data);
            setErrorActividad(null);
          }
        } catch (err) {
          if (activo) {
            setErrorActividad(err.message || 'Error al obtener la actividad del mesero');
          }
        }
      })();
    }
    return () => {
      activo = false;
    };
  }, [subtab, meseroIdEfectivo, fechaActividad]);

  // ---------------------------------------------------------------------------
  // CARGA: Resumen del día (A4b / Obj 6)
  // ---------------------------------------------------------------------------
  const cargarResumenDiario = useCallback(async () => {
    setCargandoResumen(true);
    setErrorResumen(null);
    try {
      const [resCuentas, resCanc, resPeds] = await Promise.all([
        obtenerCuentas({ fecha: fechaResumen }),
        obtenerCancelaciones({ fecha: fechaResumen }).catch(() => ({ cancelaciones: [] })),
        obtenerPedidos({ fecha: fechaResumen }).catch(() => ({ pedidos: [] })),
      ]);
      setCuentasResumen(resCuentas.cuentas || []);
      setCancelacionesResumen(resCanc.cancelaciones || []);
      setPedidosResumen(resPeds.pedidos || []);
    } catch (err) {
      setErrorResumen(err.message || 'Error al sincronizar el resumen diario de la jornada');
    } finally {
      setCargandoResumen(false);
    }
  }, [fechaResumen]);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (subtab === 'resumen' && activo) {
        await cargarResumenDiario();
      }
    })();
    return () => {
      activo = false;
    };
  }, [subtab, cargarResumenDiario]);

  // Escucha en tiempo real para mantener actualizado el resumen
  useEffect(() => {
    const socket = conectarTiempoReal();
    const actualizar = () => {
      if (subtab === 'resumen') cargarResumenDiario();
      if (subtab === 'actividad') recargarActividad();
    };

    socket.on('cuenta.estado', actualizar);
    socket.on('pedido.creado', actualizar);
    socket.on('pedido.cancelado', actualizar);
    socket.on('cancelacion.solicitada', actualizar);
    socket.on('cancelacion.resuelta', actualizar);

    return () => {
      socket.off('cuenta.estado', actualizar);
      socket.off('pedido.creado', actualizar);
      socket.off('pedido.cancelado', actualizar);
      socket.off('cancelacion.solicitada', actualizar);
      socket.off('cancelacion.resuelta', actualizar);
    };
  }, [subtab, cargarResumenDiario, recargarActividad]);

  // ---------------------------------------------------------------------------
  // CÁLCULOS KPI DEL RESUMEN DIARIO (K6 / A4b)
  // ---------------------------------------------------------------------------
  const esFechaHoy = fechaResumen === obtenerFechaHoy();

  const kpisResumen = useMemo(() => {
    const cuentasPagadas = cuentasResumen.filter((c) => c.estado === 'PAGADA');
    const cuentasPorCobrar = cuentasResumen.filter((c) => c.estado === 'PENDIENTE');
    const cuentasAbiertas = cuentasResumen.filter((c) => c.estado === 'ABIERTA');

    const totalCobrado = cuentasPagadas.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const totalPropinas = cuentasPagadas.reduce((acc, c) => acc + Number(c.propina || 0), 0);

    const desgloseMetodos = { EFECTIVO: 0, TARJETA: 0, OTRO: 0 };
    for (const c of cuentasPagadas) {
      const met = (c.metodo_pago || 'EFECTIVO').toUpperCase();
      if (met.includes('TARJETA')) desgloseMetodos.TARJETA += Number(c.total || 0);
      else if (met.includes('EFECTIVO')) desgloseMetodos.EFECTIVO += Number(c.total || 0);
      else desgloseMetodos.OTRO += Number(c.total || 0);
    }

    const totalPorCobrar = cuentasPorCobrar.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const totalAbierto = cuentasAbiertas.reduce((acc, c) => acc + Number(c.total || 0), 0);

    const pedidosRegistrados = pedidosResumen.length;
    const pedidosActivos = pedidosResumen.filter((p) => !p.cancelado).length;
    const pedidosCancelados = pedidosResumen.filter((p) => p.cancelado).length;
    const valorCancelado = pedidosResumen
      .filter((p) => p.cancelado)
      .reduce((acc, p) => acc + Number(p.total || 0), 0);

    const cancelacionesTotal = cancelacionesResumen.length;
    const cancelacionesAprobadas = cancelacionesResumen.filter((x) => x.estado === 'APROBADA').length;
    const cancelacionesRechazadas = cancelacionesResumen.filter((x) => x.estado === 'RECHAZADA').length;
    const cancelacionesPendientes = cancelacionesResumen.filter(
      (x) => x.estado === 'SOLICITADA' || x.estado === 'PENDIENTE'
    ).length;

    return {
      totalCobrado,
      totalPropinas,
      cuentasPagadasCantidad: cuentasPagadas.length,
      desgloseMetodos,
      totalPorCobrar,
      totalAbierto,
      cuentasPorCobrarCantidad: cuentasPorCobrar.length,
      cuentasAbiertasCantidad: cuentasAbiertas.length,
      pedidosRegistrados,
      pedidosActivos,
      pedidosCancelados,
      valorCancelado,
      cancelacionesTotal,
      cancelacionesAprobadas,
      cancelacionesRechazadas,
      cancelacionesPendientes,
    };
  }, [cuentasResumen, pedidosResumen, cancelacionesResumen]);

  // Formateadores auxiliares
  const formatearDinero = (val) => `$ ${Number(val || 0).toLocaleString('es-CO')}`;
  const formatearHora = (isoStr) => {
    if (!isoStr) return '--:--';
    const date = new Date(isoStr);
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const meseroActual = meseros.find((m) => String(m.id) === String(meseroIdEfectivo));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Cabecera y Selector de Subpestañas (A4a & A4b) */}
      <div
        style={{
          background: '#fff',
          padding: '1.25rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#1a202c', fontWeight: 700 }}>
              Supervisión operativa (RF15, Obj. 6)
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#718096', marginTop: '0.2rem' }}>
              Auditoría y conciliación de actividades del personal y recaudación diaria
            </div>
          </div>

          {/* Subpestañas A4a vs A4b */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #edf2f7' }}>
            <button
              type="button"
              onClick={() => setSubtab('actividad')}
              style={{
                padding: '0.5rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: subtab === 'actividad' ? '3px solid #3182ce' : '3px solid transparent',
                fontWeight: subtab === 'actividad' ? 700 : 500,
                color: subtab === 'actividad' ? '#2b6cb0' : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Actividad del mesero (RF15)
            </button>
            <button
              type="button"
              onClick={() => setSubtab('resumen')}
              style={{
                padding: '0.5rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: subtab === 'resumen' ? '3px solid #3182ce' : '3px solid transparent',
                fontWeight: subtab === 'resumen' ? 700 : 500,
                color: subtab === 'resumen' ? '#2b6cb0' : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Resumen del día (Obj. 6)
            </button>
          </div>
        </div>

        {/* Filtros específicos según subtab */}
        {subtab === 'actividad' ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '1rem',
              background: '#f7fafc',
              padding: '0.85rem 1rem',
              borderRadius: '6px',
            }}
          >
            <div>
              <label
                htmlFor="filtro-mesero"
                style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}
              >
                Mesero responsable:
              </label>
              <select
                id="filtro-mesero"
                value={meseroIdEfectivo}
                onChange={(e) => setMeseroSeleccionado(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  background: '#fff',
                  minWidth: '220px',
                }}
              >
                {meseros.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre_completo || m.nombre_usuario} {m.activo ? '' : '(Inactivo)'}
                  </option>
                ))}
                {meseros.length === 0 && <option value="">Sin meseros registrados</option>}
              </select>
            </div>

            <div>
              <label
                htmlFor="filtro-fecha-actividad"
                style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}
              >
                Fecha de consulta:
              </label>
              <input
                id="filtro-fecha-actividad"
                type="date"
                value={fechaActividad}
                onChange={(e) => setFechaActividad(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  background: '#fff',
                }}
              />
            </div>

            <button
              onClick={recargarActividad}
              disabled={cargandoActividad}
              style={{
                marginTop: 'auto',
                padding: '0.5rem 1.1rem',
                background: '#2b6cb0',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: cargandoActividad ? 'not-allowed' : 'pointer',
                opacity: cargandoActividad ? 0.7 : 1,
              }}
            >
              {cargandoActividad ? 'Consultando...' : 'Actualizar'}
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              background: '#f7fafc',
              padding: '0.85rem 1rem',
              borderRadius: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div>
                <label
                  htmlFor="filtro-fecha-resumen"
                  style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}
                >
                  Fecha del reporte diario:
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    id="filtro-fecha-resumen"
                    type="date"
                    value={fechaResumen}
                    onChange={(e) => setFechaResumen(e.target.value)}
                    style={{
                      padding: '0.45rem 0.75rem',
                      border: '1px solid #cbd5e0',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      background: '#fff',
                    }}
                  />
                  {esFechaHoy && (
                    <span style={{ fontSize: '0.78rem', background: '#c6f6d5', color: '#22543d', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                      Jornada en curso (Hoy)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={cargarResumenDiario}
              disabled={cargandoResumen}
              style={{
                padding: '0.5rem 1.1rem',
                background: '#2b6cb0',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: cargandoResumen ? 'not-allowed' : 'pointer',
                opacity: cargandoResumen ? 0.7 : 1,
              }}
            >
              {cargandoResumen ? 'Sincronizando...' : '↻ Actualizar datos'}
            </button>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* VISTA 1: ACTIVIDAD DEL MESERO (Wireframe A4a / RF15) */}
      {/* ===================================================================== */}
      {subtab === 'actividad' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorActividad && (
            <div
              role="alert"
              style={{
                background: '#fff5f5',
                border: '1px solid #feb2b2',
                color: '#c53030',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            >
              {errorActividad}
            </div>
          )}

          {/* Tarjetas KPI (A4a · Bloque 6) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                padding: '1.1rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#718096' }}>
                Pedidos despachados
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2d3748', marginTop: '0.25rem' }}>
                {actividad?.total_pedidos || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
                Sin pedidos cancelados
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                padding: '1.1rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#718096' }}>
                Total facturado
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#22543d', marginTop: '0.25rem' }}>
                {formatearDinero(actividad?.total_facturado || 0)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
                Valor neto de pedidos activos
              </div>
            </div>

            <div
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                padding: '1.1rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#718096' }}>
                Mesas atendidas
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2b6cb0', marginTop: '0.25rem' }}>
                {actividad?.mesas_atendidas || actividad?.pedidos_por_mesa?.length || 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
                {actividad?.pedidos_por_mesa && actividad.pedidos_por_mesa.length > 0
                  ? actividad.pedidos_por_mesa.map((m) => `Mesa ${m.mesa}`).join(', ')
                  : 'Sin mesas activas'}
              </div>
            </div>

            <div
              style={{
                background: '#fff5f5',
                border: '1px solid #fed7d7',
                padding: '1.1rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#c53030' }}>
                Cancelaciones excluidas
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#c53030', marginTop: '0.25rem' }}>
                {actividad?.cancelaciones_excluidas ?? 0}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9b2c2c', marginTop: '0.2rem' }}>
                Excluidas de la liquidación (CU24)
              </div>
            </div>
          </div>

          {/* Tabla de pedidos despachados por el mesero */}
          <div
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <div
              style={{
                padding: '0.85rem 1.25rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#2d3748', textTransform: 'uppercase' }}>
                Pedidos despachados por {meseroActual?.nombre_completo || meseroActual?.nombre_usuario || 'el mesero'}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                Ordenados por hora de registro (más recientes primero)
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#edf2f7', borderBottom: '1px solid #cbd5e0', color: '#4a5568' }}>
                    <th style={{ padding: '0.6rem 1rem' }}>Hora</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Mesa</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Sector</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Cuenta</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Ítems del pedido</th>
                    <th style={{ padding: '0.6rem 1rem' }}>Estado comanda</th>
                    <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Total pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {actividad?.pedidos && actividad.pedidos.length > 0 ? (
                    actividad.pedidos.map((ped, idx) => (
                      <tr
                        key={ped.pedido_id || idx}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: idx % 2 === 0 ? '#fff' : '#fafafa',
                        }}
                      >
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 600, color: '#4a5568' }}>
                          {formatearHora(ped.creado_en)}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#1a202c' }}>
                          Mesa {ped.mesa_numero}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', color: '#4a5568' }}>
                          {ped.sector_nombre || 'General'}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', color: '#718096' }}>
                          {ped.cuenta_etiqueta || `Cuenta ${ped.cuenta_id || 1}`}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', color: '#2d3748' }}>
                          {ped.items_resumen || 'Detalle no disponible'}
                        </td>
                        <td style={{ padding: '0.6rem 1rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              background: ped.estado_comanda === 'LISTA' ? '#c6f6d5' : '#e2e8f0',
                              color: ped.estado_comanda === 'LISTA' ? '#22543d' : '#4a5568',
                            }}
                          >
                            {ped.estado_comanda || 'RECIBIDA'}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700, color: '#2d3748' }}>
                          {ped.total ? formatearDinero(ped.total) : '--'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: '2rem 1rem', textAlign: 'center', color: '#a0aec0' }}>
                        {cargandoActividad
                          ? 'Cargando pedidos...'
                          : 'No se registraron pedidos despachados para este mesero en la fecha seleccionada.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VISTA 2: RESUMEN DEL DÍA (Wireframe A4b / Objetivo 6) */}
      {/* ===================================================================== */}
      {subtab === 'resumen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorResumen && (
            <div
              role="alert"
              style={{
                background: '#fff5f5',
                border: '1px solid #feb2b2',
                color: '#c53030',
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            >
              {errorResumen}
            </div>
          )}

          {/* 4 Bloques de recaudación (idéntico a K6 / Wireframe A4b) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '1rem',
            }}
          >
            {/* Bloque 1: Cobrado */}
            <div
              style={{
                background: '#fff',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 700 }}>
                Cobrado en la jornada
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#22543d', margin: '0.35rem 0 0.1rem 0' }}>
                {formatearDinero(kpisResumen.totalCobrado)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                {kpisResumen.cuentasPagadasCantidad} cuentas liquidadas
              </div>

              <div style={{ borderTop: '1px solid #edf2f7', marginTop: '0.75rem', paddingTop: '0.6rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#4a5568', fontWeight: 700, marginBottom: '0.3rem' }}>
                  Desglose por método de pago:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                    <span>Efectivo:</span>
                    <b>{formatearDinero(kpisResumen.desgloseMetodos.EFECTIVO)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                    <span>Tarjeta:</span>
                    <b>{formatearDinero(kpisResumen.desgloseMetodos.TARJETA)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                    <span>Transferencia / Otro:</span>
                    <b>{formatearDinero(kpisResumen.desgloseMetodos.OTRO)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e0', paddingTop: '0.35rem', marginTop: '0.3rem' }}>
                    <span style={{ color: '#2d3748', fontWeight: 600 }}>Propinas recibidas:</span>
                    <strong style={{ color: '#22543d' }}>{formatearDinero(kpisResumen.totalPropinas)}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque 2: Por cobrar ahora */}
            <div
              style={{
                background: '#fff',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 700 }}>
                Por cobrar (Cuentas en curso)
              </div>
              {esFechaHoy ? (
                <>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2b6cb0', margin: '0.35rem 0 0.1rem 0' }}>
                    {formatearDinero(kpisResumen.totalPorCobrar)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                    {kpisResumen.cuentasPorCobrarCantidad} cuentas pendientes de pago
                  </div>
                  <div style={{ borderTop: '1px solid #edf2f7', marginTop: '0.75rem', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                      <span>Pendientes pago:</span>
                      <b>{kpisResumen.cuentasPorCobrarCantidad} · {formatearDinero(kpisResumen.totalPorCobrar)}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                      <span>Abiertas consumiendo:</span>
                      <b>{kpisResumen.cuentasAbiertasCantidad} · {formatearDinero(kpisResumen.totalAbierto)}</b>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ marginTop: '0.5rem' }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a0aec0' }}>N/A</span>
                  <p style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.3rem', lineHeight: '1.4' }}>
                    Histórico cerrado. Las cuentas vivas solo aplican para la jornada en tiempo real.
                  </p>
                </div>
              )}
            </div>

            {/* Bloque 3: Pedidos del día */}
            <div
              style={{
                background: '#fff',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 700 }}>
                Pedidos registrados
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2d3748', margin: '0.35rem 0 0.1rem 0' }}>
                {kpisResumen.pedidosRegistrados}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                en la fecha consultada
              </div>
              <div style={{ borderTop: '1px solid #edf2f7', marginTop: '0.75rem', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                  <span>Activos procesados:</span>
                  <b>{kpisResumen.pedidosActivos}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                  <span>Cancelados:</span>
                  <b style={{ color: kpisResumen.pedidosCancelados > 0 ? '#c53030' : '#4a5568' }}>
                    {kpisResumen.pedidosCancelados}
                  </b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c53030' }}>
                  <span>Valor anulado:</span>
                  <b>{formatearDinero(kpisResumen.valorCancelado)}</b>
                </div>
              </div>
            </div>

            {/* Bloque 4: Cancelaciones */}
            <div
              style={{
                background: '#fff',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#718096', textTransform: 'uppercase', fontWeight: 700 }}>
                Cancelaciones tramitadas
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#c05621', margin: '0.35rem 0 0.1rem 0' }}>
                {kpisResumen.cancelacionesTotal}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                solicitudes registradas
              </div>
              <div style={{ borderTop: '1px solid #edf2f7', marginTop: '0.75rem', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                  <span>Aprobadas por Caja:</span>
                  <b>{kpisResumen.cancelacionesAprobadas}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                  <span>Rechazadas:</span>
                  <b>{kpisResumen.cancelacionesRechazadas}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                  <span>Por resolver:</span>
                  <b style={{ color: kpisResumen.cancelacionesPendientes > 0 ? '#e53e3e' : '#4a5568' }}>
                    {kpisResumen.cancelacionesPendientes}
                  </b>
                </div>
              </div>
            </div>
          </div>

          {/* TABLA: Registro de Pedidos del Día (Wireframe A4b · ordenados del más reciente al más antiguo) */}
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '0.85rem 1.25rem',
                background: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <strong style={{ fontSize: '0.95rem', color: '#1a202c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Registro de pedidos del día (A4b · Obj. 6)
              </strong>
              <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                {pedidosResumen.length} pedidos registrados · Ordenados del más reciente al más antiguo
              </span>
            </div>

            {pedidosResumen.length === 0 ? (
              <div style={{ padding: '3rem 1.5rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.9rem' }}>
                {cargandoResumen ? 'Consultando pedidos...' : 'No se encontraron pedidos registrados para la fecha seleccionada.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#edf2f7', borderBottom: '1px solid #cbd5e0', color: '#4a5568' }}>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase' }}>Hora</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesa</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cuenta</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesero responsable</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                      <th style={{ padding: '0.65rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosResumen.map((p, idx) => (
                      <tr
                        key={p.id || idx}
                        style={{
                          borderBottom: '1px solid #edf2f7',
                          background: p.cancelado ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#fafafa',
                          opacity: p.cancelado ? 0.75 : 1,
                        }}
                      >
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#4a5568' }}>
                          {formatearHora(p.creado_en)}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#1a202c' }}>
                          Mesa {p.mesa_numero || p.mesa_id || '-'}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', color: '#718096' }}>
                          {p.cuenta_etiqueta || `Cuenta ${p.cuenta_id || 1}`}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', color: '#2d3748' }}>
                          {p.mesero_nombre || 'Mesero'}
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              background: p.cancelado ? '#fed7d7' : '#c6f6d5',
                              color: p.cancelado ? '#742a2a' : '#22543d',
                            }}
                          >
                            {p.cancelado ? 'CANCELADO' : 'ACTIVO'}
                          </span>
                        </td>
                        <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                          <span
                            style={{
                              color: p.cancelado ? '#a0aec0' : '#1a202c',
                              textDecoration: p.cancelado ? 'line-through' : 'none',
                            }}
                          >
                            {formatearDinero(p.total)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
