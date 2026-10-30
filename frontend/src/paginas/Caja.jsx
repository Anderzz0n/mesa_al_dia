import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  obtenerUsuario,
  cerrarSesion,
  obtenerCuentas,
  obtenerDetalleCuenta,
  liquidarCuenta,
  obtenerCancelaciones,
  resolverCancelacion,
  solicitarOCancelarPedido,
  obtenerPedidos,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

/**
 * Vista Operativa de Caja (RF14, RF8 / CU16, CU18, CU19 / Wireframes K0–K8).
 * Gestiona el cobro y liquidación de cuentas vivas (PENDIENTE/ABIERTA/PAGADA)
 * y la resolución de solicitudes de cancelación con declaración de productos preparados.
 */
export default function Caja() {
  const usuario = obtenerUsuario();
  const navigate = useNavigate();

  // Pestañas principales: 'cuentas' | 'cancelaciones' | 'resumen'
  const [tab, setTab] = useState('cuentas');
  // Subpestaña de cuentas: 'por_cobrar' (K1a) | 'abiertas' (K1b) | 'pagadas' (K1c)
  const [subtabCuentas, setSubtabCuentas] = useState('por_cobrar');
  // Subpestaña de cancelaciones: 'por_resolver' (K5a) | 'resueltas' (K5c)
  const [subtabCanc, setSubtabCanc] = useState('por_resolver');

  // Estados de datos
  const [cuentas, setCuentas] = useState([]);
  const [cancelaciones, setCancelaciones] = useState([]);
  const [pedidosDia, setPedidosDia] = useState([]);
  const [horaConsultaResumen, setHoraConsultaResumen] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [enLinea, setEnLinea] = useState(true);

  // Modal K2: Detalle de cuenta
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState(null);
  const [detalleCuenta, setDetalleCuenta] = useState(null);

  // Modal K3: Cobro y liquidación
  const [modalCobro, setModalCobro] = useState(null); // objeto cuenta a cobrar
  const [metodoPago, setMetodoPago] = useState('EFECTIVO');
  const [propinaInput, setPropinaInput] = useState('');
  const [numDivision, setNumDivision] = useState(1);
  const [procesandoCobro, setProcesandoCobro] = useState(false);

  // Modal K4: Cancelar pedido directo desde Caja
  const [modalCancelarPedido, setModalCancelarPedido] = useState(null); // pedido a cancelar
  const [motivoCancelacionDirecta, setMotivoCancelacionDirecta] = useState('');
  const [preparadosDirectos, setPreparadosDirectos] = useState({});
  const [procesandoCancelacionDirecta, setProcesandoCancelacionDirecta] = useState(false);

  // Modal K5b: Resolver solicitud de mesero
  const [modalResolver, setModalResolver] = useState(null); // objeto cancelación
  const [preparadosResolucion, setPreparadosResolucion] = useState({});
  const [procesandoResolucion, setProcesandoResolucion] = useState(false);

  const mostrarMensaje = (texto) => {
    setMensajeExito(texto);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const salir = async () => {
    await cerrarSesion();
    navigate('/login');
  };

  // Carga general de datos
  const cargarDatos = useCallback(async () => {
    try {
      setError(null);
      const [resCuentas, resCanc, resPeds] = await Promise.all([
        obtenerCuentas(),
        obtenerCancelaciones(),
        obtenerPedidos({ fecha: 'hoy' }),
      ]);
      setCuentas(resCuentas.cuentas || []);
      setCancelaciones(resCanc.cancelaciones || []);
      setPedidosDia(resPeds.pedidos || []);
      setHoraConsultaResumen(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError(err.message || 'Error al sincronizar datos de caja');
    } finally {
      setCargando(false);
    }
  }, []);

  // Cargar detalle de cuenta al abrir modal K2
  const abrirDetalleCuenta = async (cuentaId) => {
    setCuentaSeleccionadaId(cuentaId);
    try {
      const data = await obtenerDetalleCuenta(cuentaId);
      setDetalleCuenta(data);
    } catch (err) {
      setError(err.message || 'Error al obtener detalle de la cuenta');
      setCuentaSeleccionadaId(null);
    }
  };

  const cerrarDetalleCuenta = () => {
    setCuentaSeleccionadaId(null);
    setDetalleCuenta(null);
  };

  // Conexión tiempo real
  useEffect(() => {
    let activo = true;
    (async () => {
      if (activo) await cargarDatos();
    })();

    const socket = conectarTiempoReal();
    socket.on('connect', () => setEnLinea(true));
    socket.on('disconnect', () => setEnLinea(false));

    const recargar = () => {
      cargarDatos();
      if (cuentaSeleccionadaId) {
        obtenerDetalleCuenta(cuentaSeleccionadaId)
          .then((d) => setDetalleCuenta(d))
          .catch(() => {});
      }
    };

    socket.on('cuenta.estado', recargar);
    socket.on('mesa.estado', recargar);
    socket.on('pedido.creado', recargar);
    socket.on('pedido.cancelado', (data) => {
      mostrarMensaje(`⚠️ Pedido #${data?.pedido_id || ''} cancelado`);
      recargar();
    });
    socket.on('cancelacion.solicitada', (data) => {
      mostrarMensaje(`🔔 Nueva solicitud de cancelación en Mesa #${data?.mesa_numero || ''}`);
      recargar();
    });
    socket.on('cancelacion.resuelta', recargar);

    return () => {
      activo = false;
      socket.off('connect');
      socket.off('disconnect');
      socket.off('cuenta.estado', recargar);
      socket.off('mesa.estado', recargar);
      socket.off('pedido.creado', recargar);
      socket.off('pedido.cancelado');
      socket.off('cancelacion.solicitada');
      socket.off('cancelacion.resuelta', recargar);
    };
  }, [cargarDatos, cuentaSeleccionadaId]);

  // Filtros de cuentas
  const cuentasPorCobrar = useMemo(
    () => cuentas.filter((c) => c.estado === 'PENDIENTE'),
    [cuentas]
  );
  const cuentasAbiertas = useMemo(
    () => cuentas.filter((c) => c.estado === 'ABIERTA'),
    [cuentas]
  );
  const cuentasPagadasHoy = useMemo(
    () => cuentas.filter((c) => c.estado === 'PAGADA'),
    [cuentas]
  );

  // Filtros de cancelaciones
  const cancelacionesPorResolver = useMemo(
    () => cancelaciones.filter((x) => x.estado === 'SOLICITADA'),
    [cancelaciones]
  );
  const cancelacionesResueltas = useMemo(
    () => cancelaciones.filter((x) => ['APROBADA', 'RECHAZADA'].includes(x.estado)),
    [cancelaciones]
  );

  // Iniciar modal de cobro (K3)
  const iniciarCobro = (cuenta) => {
    // D3: Bloquear cobro si hay cancelaciones sin resolver en esa cuenta
    if (cuenta.cancelaciones_por_resolver > 0) {
      setError(`La cuenta "${cuenta.etiqueta}" tiene cancelaciones pendientes por resolver. Resuélvelas primero en la pestaña Cancelaciones.`);
      return;
    }
    setModalCobro(cuenta);
    setMetodoPago('EFECTIVO');
    setPropinaInput('');
    setNumDivision(1);
  };

  // Ejecutar liquidación (K3)
  const ejecutarLiquidacion = async (e) => {
    e.preventDefault();
    if (!modalCobro) return;

    setProcesandoCobro(true);
    setError(null);
    try {
      const propinaValor = parseInt(propinaInput, 10) || 0;
      await liquidarCuenta(modalCobro.id, {
        metodo_pago: metodoPago,
        propina: propinaValor,
      });

      mostrarMensaje(`Cuenta "${modalCobro.etiqueta}" liquidada exitosamente. Total cobrado: $${(Number(modalCobro.total) + propinaValor).toLocaleString('es-CO')}`);
      setModalCobro(null);
      if (cuentaSeleccionadaId === modalCobro.id) {
        cerrarDetalleCuenta();
      }
      await cargarDatos();
    } catch (err) {
      setError(err.message || 'Error al liquidar la cuenta');
    } finally {
      setProcesandoCobro(false);
    }
  };

  // Abrir modal de cancelación directa (K4)
  const iniciarCancelacionDirecta = (pedido) => {
    setModalCancelarPedido(pedido);
    setMotivoCancelacionDirecta('');
    setPreparadosDirectos({});
  };

  // Ejecutar cancelación directa de un pedido desde Caja (K4)
  const ejecutarCancelacionDirecta = async (e) => {
    e.preventDefault();
    if (!modalCancelarPedido) return;

    if (!motivoCancelacionDirecta.trim()) {
      setError('Debes especificar el motivo de la cancelación');
      return;
    }

    setProcesandoCancelacionDirecta(true);
    setError(null);
    try {
      // Formatear array de preparados declarados
      const preparadosArray = Object.entries(preparadosDirectos)
        .filter(([, cant]) => cant > 0)
        .map(([itemId, cant]) => ({ item_id: Number(itemId), cantidad: Number(cant) }));

      await solicitarOCancelarPedido(modalCancelarPedido.id, {
        motivo: motivoCancelacionDirecta.trim(),
        preparados: preparadosArray,
      });

      mostrarMensaje(`Pedido #${modalCancelarPedido.id} cancelado correctamente por Caja`);
      setModalCancelarPedido(null);
      await cargarDatos();
      if (cuentaSeleccionadaId) {
        abrirDetalleCuenta(cuentaSeleccionadaId);
      }
    } catch (err) {
      setError(err.message || 'Error al cancelar el pedido');
    } finally {
      setProcesandoCancelacionDirecta(false);
    }
  };

  // Abrir modal para resolver solicitud de mesero (K5b)
  const iniciarResolucion = (canc) => {
    setModalResolver(canc);
    setPreparadosResolucion({});
  };

  // Resolver solicitud (Aprobar / Rechazar) (K5b)
  const ejecutarResolucion = async (decision) => {
    if (!modalResolver) return;

    setProcesandoResolucion(true);
    setError(null);
    try {
      const preparadosArray = Object.entries(preparadosResolucion)
        .filter(([, cant]) => cant > 0)
        .map(([itemId, cant]) => ({ item_id: Number(itemId), cantidad: Number(cant) }));

      await resolverCancelacion(modalResolver.id, {
        decision,
        preparados: preparadosArray,
      });

      mostrarMensaje(
        decision === 'APROBAR'
          ? `Solicitud de cancelación #${modalResolver.id} APROBADA`
          : `Solicitud de cancelación #${modalResolver.id} RECHAZADA`
      );
      setModalResolver(null);
      await cargarDatos();
    } catch (err) {
      setError(err.message || 'Error al resolver la solicitud de cancelación');
    } finally {
      setProcesandoResolucion(false);
    }
  };

  // KPIs de Resumen del Día (K6)
  const kpis = useMemo(() => {
    const totalCobrado = cuentasPagadasHoy.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const totalPropinas = cuentasPagadasHoy.reduce((acc, c) => acc + Number(c.propina || 0), 0);
    const totalPorCobrar = cuentasPorCobrar.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const totalAbierto = cuentasAbiertas.reduce((acc, c) => acc + Number(c.total || 0), 0);

    const desgloseMetodos = cuentasPagadasHoy.reduce((acc, c) => {
      const met = c.metodo_pago || 'OTRO';
      acc[met] = (acc[met] || 0) + Number(c.total || 0);
      return acc;
    }, {});

    const pedidosActivos = pedidosDia.filter((p) => p.estado === 'ACTIVO').length;
    const pedidosCancelados = pedidosDia.filter((p) => p.estado === 'CANCELADO').length;
    const valorCancelado = pedidosDia
      .filter((p) => p.estado === 'CANCELADO')
      .reduce((acc, p) => acc + Number(p.total || 0), 0);

    return {
      totalCobrado,
      totalPropinas,
      totalPorCobrar,
      totalAbierto,
      desgloseMetodos,
      cuentasPagadasCantidad: cuentasPagadasHoy.length,
      pedidosRegistrados: pedidosDia.length,
      pedidosActivos,
      pedidosCancelados,
      valorCancelado,
      cancelacionesTotal: cancelaciones.length,
      cancelacionesAprobadas: cancelaciones.filter((x) => x.estado === 'APROBADA').length,
      cancelacionesRechazadas: cancelaciones.filter((x) => x.estado === 'RECHAZADA').length,
      cancelacionesPendientes: cancelacionesPorResolver.length,
    };
  }, [cuentasPagadasHoy, cuentasPorCobrar, cuentasAbiertas, cancelaciones, cancelacionesPorResolver, pedidosDia]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f7fafc',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Barra superior de Caja */}
      <header
        style={{
          background: '#1a365d', // Azul oscuro institucional para Caja
          color: '#fff',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            Mesa al día · Caja
          </h1>
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            Cajero: {usuario?.nombre_completo || usuario?.nombre_usuario || 'Operador'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: enLinea ? 'rgba(0,0,0,0.2)' : '#742a2a',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
            }}
          >
            ● {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
          <button
            onClick={salir}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              padding: '0.35rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Contenedor Principal */}
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '1.25rem 1rem', flex: 1 }}>
        {/* Notificaciones */}
        {error && (
          <div
            role="alert"
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: '#c53030', fontWeight: 700, cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {mensajeExito && (
          <div
            role="status"
            style={{
              background: '#f0fff4',
              border: '1px solid #9ae6b4',
              color: '#22543d',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              fontSize: '0.9rem',
              marginBottom: '1rem',
            }}
          >
            {mensajeExito}
          </div>
        )}

        {/* Pestañas Principales de Caja */}
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '2px solid #edf2f7', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setTab('cuentas')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: tab === 'cuentas' ? '#2b6cb0' : '#edf2f7',
                color: tab === 'cuentas' ? '#fff' : '#2d3748',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              💰 Cuentas
              {cuentasPorCobrar.length > 0 && (
                <span
                  style={{
                    background: tab === 'cuentas' ? '#fff' : '#e53e3e',
                    color: tab === 'cuentas' ? '#2b6cb0' : '#fff',
                    borderRadius: '999px',
                    padding: '0.1rem 0.5rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  {cuentasPorCobrar.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab('cancelaciones')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: tab === 'cancelaciones' ? '#2b6cb0' : '#edf2f7',
                color: tab === 'cancelaciones' ? '#fff' : '#2d3748',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              ⚠️ Cancelaciones
              {cancelacionesPorResolver.length > 0 && (
                <span
                  style={{
                    background: tab === 'cancelaciones' ? '#fff' : '#dd6b20',
                    color: tab === 'cancelaciones' ? '#c05621' : '#fff',
                    borderRadius: '999px',
                    padding: '0.1rem 0.5rem',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                  }}
                >
                  {cancelacionesPorResolver.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTab('resumen')}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '6px',
                border: 'none',
                background: tab === 'resumen' ? '#2b6cb0' : '#edf2f7',
                color: tab === 'resumen' ? '#fff' : '#2d3748',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              📊 Resumen del Día (K6)
            </button>
          </div>
        </div>

        {cargando ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
            Cargando información de Caja…
          </div>
        ) : (
          <>
            {/* ============================================================== */}
            {/* PESTAÑA 1: GESTIÓN DE CUENTAS (K1a / K1b / K1c) */}
            {/* ============================================================== */}
            {tab === 'cuentas' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Selector de subpestañas */}
                <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #edf2f7' }}>
                  <button
                    type="button"
                    onClick={() => setSubtabCuentas('por_cobrar')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: subtabCuentas === 'por_cobrar' ? '3px solid #2b6cb0' : '3px solid transparent',
                      fontWeight: subtabCuentas === 'por_cobrar' ? 700 : 500,
                      color: subtabCuentas === 'por_cobrar' ? '#2b6cb0' : '#4a5568',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    Por Cobrar ({cuentasPorCobrar.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubtabCuentas('abiertas')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: subtabCuentas === 'abiertas' ? '3px solid #2b6cb0' : '3px solid transparent',
                      fontWeight: subtabCuentas === 'abiertas' ? 700 : 500,
                      color: subtabCuentas === 'abiertas' ? '#2b6cb0' : '#4a5568',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    Abiertas en Consumo ({cuentasAbiertas.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubtabCuentas('pagadas')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: subtabCuentas === 'pagadas' ? '3px solid #2b6cb0' : '3px solid transparent',
                      fontWeight: subtabCuentas === 'pagadas' ? 700 : 500,
                      color: subtabCuentas === 'pagadas' ? '#2b6cb0' : '#4a5568',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    Pagadas de Hoy ({cuentasPagadasHoy.length})
                  </button>
                </div>

                {/* K1a: Cuentas Por Cobrar (PENDIENTE) */}
                {subtabCuentas === 'por_cobrar' && (
                  <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1.25rem', background: '#f7fafc', borderBottom: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>
                        Cuentas marcadas en proceso de pago (K1a · RF14)
                      </strong>
                      <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                        Estas cuentas ya fueron cerradas por el mesero para liquidación en caja.
                      </div>
                    </div>

                    {cuentasPorCobrar.length === 0 ? (
                      <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
                        No hay cuentas pendientes por cobrar en este momento.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                          <thead>
                            <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesa / Sector</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cuenta</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Abierta desde</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Total Consumido</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Comandas</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cuentasPorCobrar.map((c) => (
                              <tr key={c.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <strong style={{ fontSize: '1rem', color: '#1a202c' }}>Mesa #{c.mesa?.numero}</strong>
                                  <div style={{ fontSize: '0.75rem', color: '#718096' }}>{c.mesa?.sector_nombre || 'Principal'}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#2d3748' }}>
                                  {c.etiqueta || `Cuenta #${c.id}`}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#718096', fontSize: '0.82rem' }}>
                                  {c.abierta_en ? new Date(c.abierta_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, fontSize: '1.05rem', color: '#2b6cb0' }}>
                                  $ {Number(c.total).toLocaleString('es-CO')}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                  {c.comandas_sin_terminar > 0 ? (
                                    <span style={{ fontSize: '0.72rem', background: '#feebc8', color: '#c05621', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                                      ⏳ {c.comandas_sin_terminar} en preparación
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.72rem', background: '#c6f6d5', color: '#22543d', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                                      ✓ Despachadas
                                    </span>
                                  )}
                                  {c.cancelaciones_por_resolver > 0 && (
                                    <div style={{ fontSize: '0.7rem', color: '#e53e3e', fontWeight: 800, marginTop: '0.2rem' }}>
                                      ⚠️ {c.cancelaciones_por_resolver} por resolver
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                  <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => abrirDetalleCuenta(c.id)}
                                      style={{
                                        background: '#edf2f7',
                                        color: '#2d3748',
                                        border: '1px solid #cbd5e0',
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Detalle
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => iniciarCobro(c)}
                                      style={{
                                        background: '#38a169',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '0.35rem 0.85rem',
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      💵 Cobrar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* K1b: Cuentas Abiertas en Consumo */}
                {subtabCuentas === 'abiertas' && (
                  <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1.25rem', background: '#f7fafc', borderBottom: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>
                        Cuentas Abiertas (K1b · Solo Lectura)
                      </strong>
                      <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                        Consumo en curso en las mesas. Pide al mesero que la marque como «Pendiente de Pago» cuando los clientes vayan a pagar.
                      </div>
                    </div>

                    {cuentasAbiertas.length === 0 ? (
                      <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
                        No hay cuentas abiertas en este momento.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                          <thead>
                            <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesa</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cuenta</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Abierta</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Pedidos</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Total Acumulado</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cuentasAbiertas.map((c) => (
                              <tr key={c.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Mesa #{c.mesa?.numero}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>{c.etiqueta}</td>
                                <td style={{ padding: '0.75rem 1rem', color: '#718096' }}>
                                  {c.abierta_en ? new Date(c.abierta_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>{c.pedidos_cantidad}</td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                                  $ {Number(c.total).toLocaleString('es-CO')}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => abrirDetalleCuenta(c.id)}
                                    style={{
                                      background: '#edf2f7',
                                      color: '#2d3748',
                                      border: '1px solid #cbd5e0',
                                      padding: '0.35rem 0.75rem',
                                      borderRadius: '4px',
                                      fontSize: '0.8rem',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Ver Detalle
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* K1c: Cuentas Pagadas de Hoy */}
                {subtabCuentas === 'pagadas' && (
                  <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1.25rem', background: '#f7fafc', borderBottom: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>
                        Cuentas Pagadas Hoy (K1c · Histórico)
                      </strong>
                    </div>

                    {cuentasPagadasHoy.length === 0 ? (
                      <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
                        No hay cuentas pagadas registradas el día de hoy.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                          <thead>
                            <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesa</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cuenta</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Hora de Pago</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Método</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Propina</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Total Pagado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cuentasPagadasHoy.map((c) => (
                              <tr key={c.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Mesa #{c.mesa?.numero}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>{c.etiqueta}</td>
                                <td style={{ padding: '0.75rem 1rem', color: '#718096' }}>
                                  {c.cerrada_en ? new Date(c.cerrada_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <span style={{ fontSize: '0.75rem', background: '#edf2f7', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                                    {c.metodo_pago || 'EFECTIVO'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: '#718096' }}>
                                  $ {Number(c.propina || 0).toLocaleString('es-CO')}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#22543d' }}>
                                  $ {(Number(c.total || 0) + Number(c.propina || 0)).toLocaleString('es-CO')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* PESTAÑA 2: GESTIÓN DE CANCELACIONES (K5a / K5c / RF8) */}
            {/* ============================================================== */}
            {tab === 'cancelaciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #edf2f7' }}>
                  <button
                    type="button"
                    onClick={() => setSubtabCanc('por_resolver')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: subtabCanc === 'por_resolver' ? '3px solid #2b6cb0' : '3px solid transparent',
                      fontWeight: subtabCanc === 'por_resolver' ? 700 : 500,
                      color: subtabCanc === 'por_resolver' ? '#2b6cb0' : '#4a5568',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    Por Resolver ({cancelacionesPorResolver.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubtabCanc('resueltas')}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'none',
                      border: 'none',
                      borderBottom: subtabCanc === 'resueltas' ? '3px solid #2b6cb0' : '3px solid transparent',
                      fontWeight: subtabCanc === 'resueltas' ? 700 : 500,
                      color: subtabCanc === 'resueltas' ? '#2b6cb0' : '#4a5568',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    Resueltas de Hoy ({cancelacionesResueltas.length})
                  </button>
                </div>

                {/* K5a: Cancelaciones Por Resolver */}
                {subtabCanc === 'por_resolver' && (
                  <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1.25rem', background: '#f7fafc', borderBottom: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>
                        Solicitudes de cancelación tardías de meseros (K5a · CU18, CU19)
                      </strong>
                      <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                        Pedidos solicitados para cancelación pasados los 3 minutos. Declara qué platos ya están preparados si apruebas.
                      </div>
                    </div>

                    {cancelacionesPorResolver.length === 0 ? (
                      <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
                        No hay solicitudes de cancelación pendientes de resolver.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
                        {cancelacionesPorResolver.map((x) => (
                          <div
                            key={x.id}
                            style={{
                              border: '1px solid #fbd38d',
                              background: '#fffaf0',
                              borderRadius: '8px',
                              padding: '1rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '1rem',
                            }}
                          >
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <strong style={{ color: '#7b341e', fontSize: '1rem' }}>
                                  Mesa #{x.mesa_numero} · Cta: {x.cuenta_etiqueta}
                                </strong>
                                <span style={{ fontSize: '0.75rem', background: '#feebc8', color: '#c05621', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 800 }}>
                                  Pedido #{x.pedido_id}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.82rem', color: '#4a5568', marginTop: '0.2rem' }}>
                                Mesero solicitante: <strong>{x.mesero_nombre || 'Mesero'}</strong>
                              </div>
                              <div style={{ fontSize: '0.85rem', color: '#c53030', marginTop: '0.35rem' }}>
                                Motivo: <em>"{x.motivo}"</em>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => iniciarResolucion(x)}
                              style={{
                                background: '#c05621',
                                color: '#fff',
                                border: 'none',
                                padding: '0.55rem 1.1rem',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Resolver Solicitud (K5b)
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* K5c: Histórico de Cancelaciones Resueltas */}
                {subtabCanc === 'resueltas' && (
                  <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.85rem 1.25rem', background: '#f7fafc', borderBottom: '1px solid #edf2f7' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>
                        Cancelaciones Resueltas (K5c · Histórico)
                      </strong>
                    </div>

                    {cancelacionesResueltas.length === 0 ? (
                      <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
                        No hay cancelaciones resueltas hoy.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                          <thead>
                            <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Pedido</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesa</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Estado</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Motivo</th>
                              <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Resuelto por</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cancelacionesResueltas.map((x) => (
                              <tr key={x.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>#{x.pedido_id}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>Mesa #{x.mesa_numero}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <span
                                    style={{
                                      padding: '0.2rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      fontWeight: 800,
                                      background: x.estado === 'APROBADA' ? '#fed7d7' : '#e2e8f0',
                                      color: x.estado === 'APROBADA' ? '#9b2c2c' : '#4a5568',
                                    }}
                                  >
                                    {x.estado}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#4a5568' }}>{x.motivo}</td>
                                <td style={{ padding: '0.75rem 1rem', color: '#718096' }}>{x.resuelto_por_nombre || 'Caja'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================== */}
            {/* PESTAÑA 3: RESUMEN DEL DÍA (K6) */}
            {/* ============================================================== */}
            {tab === 'resumen' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Cabecera de Resumen con filtro de fecha (K6) */}
                <div
                  style={{
                    background: '#fff',
                    borderRadius: '8px',
                    padding: '0.85rem 1.25rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1a202c', fontWeight: 700 }}>
                      Resumen del día
                    </h2>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                      <span style={{ padding: '0.3rem 0.6rem', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '0.8rem', background: '#edf2f7', color: '#4a5568' }}>‹</span>
                      <span style={{ padding: '0.3rem 0.75rem', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '0.82rem', background: '#fff', fontWeight: 600, color: '#2d3748' }}>
                        Fecha: hoy ▾
                      </span>
                      <span style={{ padding: '0.3rem 0.6rem', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '0.8rem', background: '#edf2f7', color: '#a0aec0' }}>›</span>
                      <span style={{ padding: '0.3rem 0.6rem', border: '1px solid #cbd5e0', borderRadius: '4px', fontSize: '0.8rem', background: '#edf2f7', color: '#a0aec0' }}>Hoy</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                      Consultado a las {horaConsultaResumen}
                    </span>
                    <button
                      type="button"
                      onClick={cargarDatos}
                      style={{
                        background: '#edf2f7',
                        border: '1px solid #cbd5e0',
                        color: '#2d3748',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ↻ Actualizar
                    </button>
                  </div>
                </div>

                {/* 4 Bloques KPI (K6) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                  {/* Bloque 1: Cobrado */}
                  <div style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568', textTransform: 'uppercase', fontWeight: 700 }}>
                      Cobrado
                    </h3>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#22543d', margin: '0.35rem 0 0.1rem 0' }}>
                      $ {kpis.totalCobrado.toLocaleString('es-CO')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      {kpis.cuentasPagadasCantidad} cuentas · total sin sumar propinas
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#4a5568', fontWeight: 700, marginTop: '0.6rem' }}>
                      Por método de pago:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                        <span>Efectivo</span>
                        <b>$ {(kpis.desgloseMetodos['EFECTIVO'] || 0).toLocaleString('es-CO')}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                        <span>Tarjeta</span>
                        <b>$ {(kpis.desgloseMetodos['TARJETA'] || 0).toLocaleString('es-CO')}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#4a5568' }}>
                        <span>Transferencia / Otro</span>
                        <b>$ {(kpis.desgloseMetodos['TRANSFERENCIA'] || kpis.desgloseMetodos['OTRO'] || 0).toLocaleString('es-CO')}</b>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e0', paddingTop: '0.4rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                      <span style={{ color: '#2d3748', fontWeight: 600 }}>Propinas:</span>
                      <strong style={{ color: '#22543d' }}>$ {kpis.totalPropinas.toLocaleString('es-CO')}</strong>
                    </div>
                  </div>

                  {/* Bloque 2: Por Cobrar */}
                  <div style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568', textTransform: 'uppercase', fontWeight: 700 }}>
                      Por cobrar (ahora)
                    </h3>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#2b6cb0', margin: '0.35rem 0 0.1rem 0' }}>
                      $ {kpis.totalPorCobrar.toLocaleString('es-CO')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      {cuentasPorCobrar.length} cuentas pendientes de pago
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.6rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Pendientes:</span>
                        <b>{cuentasPorCobrar.length} · $ {kpis.totalPorCobrar.toLocaleString('es-CO')}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Abiertas:</span>
                        <b>{cuentasAbiertas.length} · $ {kpis.totalAbierto.toLocaleString('es-CO')}</b>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('cuentas');
                        setSubtabCuentas('por_cobrar');
                      }}
                      style={{
                        marginTop: 'auto',
                        padding: '0.35rem 0.65rem',
                        background: '#edf2f7',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#2b6cb0',
                        cursor: 'pointer',
                        textAlign: 'left',
                        paddingTop: '0.4rem',
                      }}
                    >
                      Ir a Por cobrar ›
                    </button>
                  </div>

                  {/* Bloque 3: Pedidos */}
                  <div style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568', textTransform: 'uppercase', fontWeight: 700 }}>
                      Pedidos
                    </h3>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#2d3748', margin: '0.35rem 0 0.1rem 0' }}>
                      {kpis.pedidosRegistrados}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      registrados hoy
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.6rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Activos:</span>
                        <b>{kpis.pedidosActivos}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Cancelados:</span>
                        <b style={{ color: kpis.pedidosCancelados > 0 ? '#c53030' : '#4a5568' }}>{kpis.pedidosCancelados}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Valor cancelado:</span>
                        <b>$ {kpis.valorCancelado.toLocaleString('es-CO')}</b>
                      </div>
                    </div>
                  </div>

                  {/* Bloque 4: Cancelaciones */}
                  <div style={{ background: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: 0, fontSize: '0.85rem', color: '#4a5568', textTransform: 'uppercase', fontWeight: 700 }}>
                      Cancelaciones
                    </h3>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#c05621', margin: '0.35rem 0 0.1rem 0' }}>
                      {kpis.cancelacionesTotal}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                      cancelaciones del día
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.6rem', fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Aprobadas:</span>
                        <b>{kpis.cancelacionesAprobadas}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Rechazadas:</span>
                        <b>{kpis.cancelacionesRechazadas}</b>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4a5568' }}>Por resolver:</span>
                        <b style={{ color: kpis.cancelacionesPendientes > 0 ? '#e53e3e' : '#4a5568' }}>{kpis.cancelacionesPendientes}</b>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTab('cancelaciones');
                        setSubtabCanc('por_resolver');
                      }}
                      style={{
                        marginTop: 'auto',
                        padding: '0.35rem 0.65rem',
                        background: '#edf2f7',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#c05621',
                        cursor: 'pointer',
                        textAlign: 'left',
                        paddingTop: '0.4rem',
                      }}
                    >
                      Ir a Cancelaciones ›
                    </button>
                  </div>
                </div>

                {/* TABLA: Pedidos del día (K6 · los más recientes primero) */}
                <div style={{ background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '0.85rem 1.25rem',
                      background: '#f7fafc',
                      borderBottom: '1px solid #edf2f7',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>
                      Pedidos del día
                    </strong>
                    <span style={{ fontSize: '0.78rem', color: '#718096' }}>
                      Mostrando {pedidosDia.length} pedidos · los más recientes primero
                    </span>
                  </div>

                  {pedidosDia.length === 0 ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.88rem' }}>
                      No se han registrado pedidos hoy.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                        <thead>
                          <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                            <th style={{ padding: '0.65rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Hora</th>
                            <th style={{ padding: '0.65rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesa</th>
                            <th style={{ padding: '0.65rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cuenta</th>
                            <th style={{ padding: '0.65rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Mesero</th>
                            <th style={{ padding: '0.65rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Estado</th>
                            <th style={{ padding: '0.65rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pedidosDia.map((p) => {
                            const esCancelado = p.estado === 'CANCELADO';
                            return (
                              <tr
                                key={p.id}
                                style={{
                                  borderBottom: '1px solid #edf2f7',
                                  background: esCancelado ? '#fff5f5' : '#fff',
                                  opacity: esCancelado ? 0.75 : 1,
                                }}
                              >
                                <td style={{ padding: '0.65rem 1rem', color: '#718096', fontSize: '0.82rem' }}>
                                  {p.creado_en ? new Date(p.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                </td>
                                <td style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>
                                  Mesa #{p.mesa_numero}
                                </td>
                                <td style={{ padding: '0.65rem 1rem', color: '#4a5568' }}>
                                  {p.cuenta_etiqueta}
                                </td>
                                <td style={{ padding: '0.65rem 1rem', color: '#4a5568' }}>
                                  {p.mesero_nombre}
                                </td>
                                <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                  <span
                                    style={{
                                      padding: '0.15rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      background: esCancelado ? '#fed7d7' : '#c6f6d5',
                                      color: esCancelado ? '#9b2c2c' : '#22543d',
                                    }}
                                  >
                                    {p.estado}
                                  </span>
                                </td>
                                <td
                                  style={{
                                    padding: '0.65rem 1rem',
                                    textAlign: 'right',
                                    fontWeight: 700,
                                    textDecoration: esCancelado ? 'line-through' : 'none',
                                    color: esCancelado ? '#a0aec0' : '#2b6cb0',
                                  }}
                                >
                                  $ {Number(p.total).toLocaleString('es-CO')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL K2: DETALLE DE CUENTA (K2 · RF14, RF8) */}
      {/* ============================================================== */}
      {cuentaSeleccionadaId && detalleCuenta && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #edf2f7', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                  Detalle de Cuenta · {detalleCuenta.etiqueta}
                </h3>
                <div style={{ fontSize: '0.85rem', color: '#718096', marginTop: '0.2rem' }}>
                  Mesa #{detalleCuenta.mesa_numero} · Estado: <strong>{detalleCuenta.estado}</strong>
                </div>
              </div>
              <button
                type="button"
                onClick={cerrarDetalleCuenta}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#718096', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Listado de Pedidos en la cuenta */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase' }}>
                Pedidos registrados ({detalleCuenta.pedidos?.length || 0})
              </div>

              {detalleCuenta.pedidos?.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: '#a0aec0' }}>
                  Esta cuenta aún no tiene pedidos enviados.
                </div>
              ) : (
                detalleCuenta.pedidos?.map((p) => {
                  const cancelado = p.estado === 'CANCELADO';
                  return (
                    <div
                      key={p.id}
                      style={{
                        border: cancelado ? '1px dashed #feb2b2' : '1px solid #e2e8f0',
                        background: cancelado ? '#fff5f5' : '#f8fafc',
                        borderRadius: '6px',
                        padding: '0.85rem',
                        opacity: cancelado ? 0.7 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: '#2d3748' }}>
                            Pedido #{p.id} {cancelado && '(CANCELADO)'}
                          </strong>
                          <span style={{ fontSize: '0.78rem', color: '#718096', marginLeft: '0.5rem' }}>
                            Mesero: {p.mesero_nombre || 'Mesero'} · {p.hora_servidor ? new Date(p.hora_servidor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>

                        {!cancelado && detalleCuenta.estado !== 'PAGADA' && (
                          <button
                            type="button"
                            onClick={() => iniciarCancelacionDirecta(p)}
                            style={{
                              background: '#fff',
                              border: '1px solid #feb2b2',
                              color: '#c53030',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Cancelar Pedido
                          </button>
                        )}
                      </div>

                      {/* Ítems del pedido */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.4rem' }}>
                        {p.items?.map((it) => (
                          <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem' }}>
                            <span style={{ textDecoration: cancelado ? 'line-through' : 'none' }}>
                              <strong>{it.cantidad}x</strong> {it.producto_nombre}
                              {it.opciones && it.opciones.length > 0 && ` (+ ${it.opciones.join(', ')})`}
                            </span>
                            <span style={{ fontWeight: 600, color: cancelado ? '#a0aec0' : '#2b6cb0' }}>
                              $ {Number(it.subtotal || it.precio_unitario * it.cantidad).toLocaleString('es-CO')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Total General de la Cuenta */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '0.75rem',
                borderTop: '2px solid #edf2f7',
              }}
            >
              <div>
                <span style={{ fontSize: '0.8rem', color: '#718096', textTransform: 'uppercase', fontWeight: 700 }}>
                  Total Consumido
                </span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2b6cb0' }}>
                  $ {Number(detalleCuenta.total || 0).toLocaleString('es-CO')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={cerrarDetalleCuenta}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cerrar
                </button>

                {detalleCuenta.estado === 'PENDIENTE' && (
                  <button
                    type="button"
                    onClick={() => {
                      cerrarDetalleCuenta();
                      iniciarCobro(detalleCuenta);
                    }}
                    style={{
                      background: '#38a169',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    💵 Proceder a Cobrar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL K3: COBRAR Y LIQUIDAR CUENTA (K3 · CU16 · RF14) */}
      {/* ============================================================== */}
      {modalCobro && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                Cobrar Cuenta · {modalCobro.etiqueta}
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#718096', marginTop: '0.2rem' }}>
                Mesa #{modalCobro.mesa?.numero} · Liquidación de pago (CU16)
              </div>
            </div>

            <form onSubmit={ejecutarLiquidacion} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Valor de consumo */}
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span style={{ color: '#4a5568' }}>Subtotal Consumo:</span>
                  <strong>$ {Number(modalCobro.total).toLocaleString('es-CO')}</strong>
                </div>

                {/* Calculadora división de cuenta */}
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e0', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#718096' }}>Dividir en partes iguales:</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setNumDivision(n)}
                          style={{
                            padding: '0.15rem 0.4rem',
                            border: '1px solid #cbd5e0',
                            borderRadius: '3px',
                            background: numDivision === n ? '#2b6cb0' : '#fff',
                            color: numDivision === n ? '#fff' : '#4a5568',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {numDivision > 1 && (
                    <div style={{ textAlign: 'right', marginTop: '0.25rem', color: '#2b6cb0', fontWeight: 700 }}>
                      $ {Math.round(Number(modalCobro.total) / numDivision).toLocaleString('es-CO')} por persona ({numDivision} partes)
                    </div>
                  )}
                </div>
              </div>

              {/* Selector de Método de Pago */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Método de Pago
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {['EFECTIVO', 'TARJETA', 'TRANSFERENCIA'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMetodoPago(m)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: metodoPago === m ? '#2b6cb0' : '#cbd5e0',
                        background: metodoPago === m ? '#ebf8ff' : '#fff',
                        color: metodoPago === m ? '#2b6cb0' : '#4a5568',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campo de Propina Voluntaria */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Propina voluntaria ($) (Opcional)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={propinaInput}
                  onChange={(e) => setPropinaInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Total final a liquidar */}
              <div
                style={{
                  background: '#f0fff4',
                  border: '1px solid #9ae6b4',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <span style={{ fontSize: '0.9rem', color: '#22543d', fontWeight: 700 }}>Total Final Cobrado:</span>
                <strong style={{ fontSize: '1.3rem', color: '#22543d' }}>
                  $ {(Number(modalCobro.total) + (parseInt(propinaInput, 10) || 0)).toLocaleString('es-CO')}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => setModalCobro(null)}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={procesandoCobro}
                  style={{
                    background: '#38a169',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: procesandoCobro ? 'not-allowed' : 'pointer',
                    opacity: procesandoCobro ? 0.6 : 1,
                  }}
                >
                  {procesandoCobro ? 'Procesando Pago…' : '✓ Confirmar Pago y Liquidar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL K4: CANCELACIÓN DIRECTA DESDE CAJA (K4 · CU17, CU19) */}
      {/* ============================================================== */}
      {modalCancelarPedido && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '500px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#c53030', fontWeight: 700 }}>
                Cancelar Pedido #{modalCancelarPedido.id} (Directa por Caja)
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#718096', marginTop: '0.2rem' }}>
                Caja puede cancelar pedidos en cualquier momento antes de que la cuenta sea pagada (RF8).
              </div>
            </div>

            <form onSubmit={ejecutarCancelacionDirecta} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Motivo obligatorio de cancelación (RF8)
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Ej: Cliente canceló el plato / Error de captura"
                  value={motivoCancelacionDirecta}
                  onChange={(e) => setMotivoCancelacionDirecta(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Declarar preparados */}
              <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Declarar Productos Ya Preparados (RF8 · CU19)
                </div>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginBottom: '0.5rem' }}>
                  Si la cocina o el bar ya prepararon unidades, indícalas aquí para registrarlas en el inventario de preparados:
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {modalCancelarPedido.items?.map((it) => (
                    <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                      <span>{it.producto_nombre} (Total: {it.cantidad})</span>
                      <input
                        type="number"
                        min="0"
                        max={it.cantidad}
                        value={preparadosDirectos[it.id] || 0}
                        onChange={(e) => {
                          const val = Math.min(it.cantidad, Math.max(0, parseInt(e.target.value, 10) || 0));
                          setPreparadosDirectos((prev) => ({ ...prev, [it.id]: val }));
                        }}
                        style={{
                          width: '60px',
                          padding: '0.2rem 0.4rem',
                          textAlign: 'center',
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                          fontWeight: 700,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => setModalCancelarPedido(null)}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.45rem 0.9rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={procesandoCancelacionDirecta}
                  style={{
                    background: '#e53e3e',
                    color: '#fff',
                    border: 'none',
                    padding: '0.45rem 1.1rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: procesandoCancelacionDirecta ? 'not-allowed' : 'pointer',
                    opacity: procesandoCancelacionDirecta ? 0.6 : 1,
                  }}
                >
                  {procesandoCancelacionDirecta ? 'Cancelando…' : 'Confirmar Cancelación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL K5b: RESOLVER SOLICITUD DE CANCELACIÓN (K5b · CU18, CU19) */}
      {/* ============================================================== */}
      {modalResolver && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#c05621', fontWeight: 700 }}>
                Resolver Solicitud de Cancelación #{modalResolver.id}
              </h3>
              <div style={{ fontSize: '0.82rem', color: '#718096', marginTop: '0.2rem' }}>
                Mesa #{modalResolver.mesa_numero} · Pedido #{modalResolver.pedido_id}
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}>
              <div>Mesero solicitante: <strong>{modalResolver.mesero_nombre || 'Mesero'}</strong></div>
              <div style={{ marginTop: '0.25rem', color: '#c53030' }}>
                Motivo: <em>"{modalResolver.motivo}"</em>
              </div>
            </div>

            {/* Declaración de preparados si se aprueba */}
            <div style={{ background: '#fffaf0', padding: '0.75rem', borderRadius: '6px', border: '1px solid #fbd38d' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7b341e', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Declarar Productos Ya Preparados (RF8 / CU19)
              </div>
              <div style={{ fontSize: '0.75rem', color: '#7b341e', marginBottom: '0.5rem' }}>
                Si apruebas la cancelación pero cocina/bar ya cocinaron ítems, decláralos aquí:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {modalResolver.items?.map((it) => (
                  <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem' }}>
                    <span>{it.producto_nombre || it.producto} (Total: {it.cantidad})</span>
                    <input
                      type="number"
                      min="0"
                      max={it.cantidad}
                      value={preparadosResolucion[it.id] || 0}
                      onChange={(e) => {
                        const val = Math.min(it.cantidad, Math.max(0, parseInt(e.target.value, 10) || 0));
                        setPreparadosResolucion((prev) => ({ ...prev, [it.id]: val }));
                      }}
                      style={{
                        width: '60px',
                        padding: '0.2rem 0.4rem',
                        textAlign: 'center',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
              <button
                type="button"
                onClick={() => setModalResolver(null)}
                style={{
                  background: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  color: '#4a5568',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Volver
              </button>
              <button
                type="button"
                disabled={procesandoResolucion}
                onClick={() => ejecutarResolucion('RECHAZAR')}
                style={{
                  background: '#718096',
                  color: '#fff',
                  border: 'none',
                  padding: '0.45rem 1rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: procesandoResolucion ? 'not-allowed' : 'pointer',
                  opacity: procesandoResolucion ? 0.6 : 1,
                }}
              >
                ✕ Rechazar Solicitud
              </button>
              <button
                type="button"
                disabled={procesandoResolucion}
                onClick={() => ejecutarResolucion('APROBAR')}
                style={{
                  background: '#e53e3e',
                  color: '#fff',
                  border: 'none',
                  padding: '0.45rem 1.1rem',
                  borderRadius: '6px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: procesandoResolucion ? 'not-allowed' : 'pointer',
                  opacity: procesandoResolucion ? 0.6 : 1,
                }}
              >
                ✓ Aprobar Cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
