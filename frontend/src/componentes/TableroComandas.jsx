import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  obtenerComandas,
  confirmarRecepcionComanda,
  cambiarEstadoComanda,
  acusarCancelacionComanda,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

/**
 * Tablero Kanban de Comandas para Cocina y Bar (RF7, CU15, RF6, RF8).
 * Administra el flujo de pedidos en cocina/bar:
 * 1. Enviadas -> Recibidas (con verificación de recuento de ítems CU15)
 * 2. Recibidas -> En preparación
 * 3. En preparación -> Listas / Despachadas
 * Maneja además cancelaciones urgentes en tiempo real con acuse de recibo obligatorio.
 */
export default function TableroComandas({ destino = 'COCINA' }) {
  const [comandas, setComandas] = useState([]);
  const [cancelacionesPendientes, setCancelacionesPendientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [vistaHistorico, setVistaHistorico] = useState(false); // Alternar ver listas de hoy
  const [comandasListas, setComandasListas] = useState([]);

  // Modal de confirmación de recepción / discrepancia (CU15)
  const [modalConfirmacion, setModalConfirmacion] = useState(null);
  const [conteoItemsInput, setConteoItemsInput] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [resultadoDiscrepancia, setResultadoDiscrepancia] = useState(null);

  // Reloj interno para actualizar tiempos de espera cada 30 segundos
  const [tiempoActual, setTiempoActual] = useState(() => Date.now());

  const esCocina = destino.toUpperCase() === 'COCINA';

  const mostrarMensaje = (texto) => {
    setMensajeExito(texto);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const cargarComandas = useCallback(async () => {
    try {
      setError(null);
      const [resActivas, resCanceladas] = await Promise.all([
        obtenerComandas({
          destino,
          estado: 'ENVIADA,RECIBIDA,EN_PREPARACION',
        }),
        obtenerComandas({
          destino,
          acuse: 'pendiente',
        }),
      ]);

      setComandas(resActivas.comandas || []);
      setCancelacionesPendientes(resCanceladas.comandas || []);
    } catch (err) {
      setError(err.message || 'Error al sincronizar comandas');
    } finally {
      setCargando(false);
    }
  }, [destino]);

  const cargarListasHoy = useCallback(async () => {
    try {
      const res = await obtenerComandas({
        destino,
        estado: 'LISTA',
        fecha: 'hoy',
      });
      setComandasListas(res.comandas || []);
    } catch (err) {
      console.error('Error al cargar comandas listas de hoy:', err);
    }
  }, [destino]);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (activo) {
        await cargarComandas();
        if (vistaHistorico) {
          await cargarListasHoy();
        }
      }
    })();

    const timer = setInterval(() => {
      setTiempoActual(Date.now());
    }, 30000);

    const socket = conectarTiempoReal();

    const actualizarTodo = () => {
      cargarComandas();
      if (vistaHistorico) cargarListasHoy();
    };

    socket.on('comanda.creada', actualizarTodo);
    socket.on('comanda.nueva', actualizarTodo);
    socket.on('comanda.estado', actualizarTodo);
    socket.on('comanda.recibida', actualizarTodo);
    socket.on('pedido.creado', actualizarTodo);
    socket.on('pedido.cancelado', (data) => {
      mostrarMensaje(`⚠️ ¡Aviso! Pedido #${data?.pedido_id || ''} ha sido cancelado`);
      actualizarTodo();
    });

    return () => {
      activo = false;
      clearInterval(timer);
      socket.off('comanda.creada', actualizarTodo);
      socket.off('comanda.nueva', actualizarTodo);
      socket.off('comanda.estado', actualizarTodo);
      socket.off('comanda.recibida', actualizarTodo);
      socket.off('pedido.creado', actualizarTodo);
      socket.off('pedido.cancelado');
    };
  }, [cargarComandas, cargarListasHoy, vistaHistorico]);

  // Cálculo de minutos transcurridos
  const calcularMinutosEspera = (fechaIso) => {
    if (!fechaIso) return 0;
    const diffMs = tiempoActual - new Date(fechaIso).getTime();
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  // Separación de comandas por columnas del tablero Kanban
  const enviadas = useMemo(
    () => comandas.filter((c) => c.estado === 'ENVIADA'),
    [comandas]
  );
  const recibidas = useMemo(
    () => comandas.filter((c) => c.estado === 'RECIBIDA'),
    [comandas]
  );
  const enPreparacion = useMemo(
    () => comandas.filter((c) => c.estado === 'EN_PREPARACION'),
    [comandas]
  );

  // Apertura del modal CU15 para contar ítems
  const abrirModalConfirmacion = (comanda) => {
    setModalConfirmacion(comanda);
    setResultadoDiscrepancia(null);
    // Sugerir la cantidad de ítems que ya vienen o dejar vacío para conteo ciego
    setConteoItemsInput(
      comanda.items_confirmados !== null && comanda.items_confirmados !== undefined
        ? String(comanda.items_confirmados)
        : String(comanda.total_items || comanda.items?.length || 1)
    );
  };

  // Enviar confirmación de recepción (CU15)
  const ejecutarConfirmacion = async (e) => {
    e.preventDefault();
    if (!modalConfirmacion) return;

    const cant = parseInt(conteoItemsInput, 10);
    if (isNaN(cant) || cant < 0) {
      setError('Por favor indica un número válido de ítems recibidos');
      return;
    }

    setConfirmando(true);
    setError(null);
    try {
      const resp = await confirmarRecepcionComanda(modalConfirmacion.id, cant);
      setResultadoDiscrepancia(resp);

      // Si coincide, cerramos directo
      if (resp.coincide) {
        mostrarMensaje(`Comanda #${modalConfirmacion.id} confirmada exitosamente (sin discrepancias)`);
        setModalConfirmacion(null);
        await cargarComandas();
      } else {
        // Alerta de discrepancia: el backend notificó al mesero y la comanda pasó a RECIBIDA
        await cargarComandas();
      }
    } catch (err) {
      setError(err.message || 'No se pudo confirmar la comanda');
    } finally {
      setConfirmando(false);
    }
  };

  // Cambiar estado a EN_PREPARACION o LISTA
  const avanzarEstado = async (comandaId, nuevoEstado) => {
    try {
      setError(null);
      await cambiarEstadoComanda(comandaId, nuevoEstado);
      mostrarMensaje(
        nuevoEstado === 'EN_PREPARACION'
          ? `Comanda #${comandaId} en preparación`
          : `Comanda #${comandaId} marcada como lista y despachada`
      );
      await cargarComandas();
      if (vistaHistorico) await cargarListasHoy();
    } catch (err) {
      setError(err.message || 'Error al cambiar estado de la comanda');
    }
  };

  // Acusar recibo de cancelación urgente (RF8)
  const procesarAcuseCancelacion = async (comandaId) => {
    try {
      setError(null);
      await acusarCancelacionComanda(comandaId);
      mostrarMensaje(`Cancelación de comanda #${comandaId} acusada`);
      setCancelacionesPendientes((prev) => prev.filter((c) => c.id !== comandaId));
      await cargarComandas();
    } catch (err) {
      setError(err.message || 'Error al acusar la cancelación');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Notificaciones de error o éxito */}
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
          }}
        >
          {mensajeExito}
        </div>
      )}

      {/* FRANJA DE CANCELACIONES URGENTES POR ACUSAR (RF8) */}
      {cancelacionesPendientes.length > 0 && (
        <div
          style={{
            background: '#fffaf0',
            border: '2px solid #dd6b20',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            boxShadow: '0 2px 4px rgba(221,107,32,0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <strong style={{ color: '#c05621', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                ⚠️ CANCELACIONES POR ACUSAR ({cancelacionesPendientes.length})
              </strong>
              <div style={{ fontSize: '0.85rem', color: '#7b341e', marginTop: '0.2rem' }}>
                Atención: estos pedidos fueron cancelados por mesero/caja. Detén su preparación y acusa recibo.
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginTop: '0.85rem' }}>
            {cancelacionesPendientes.map((c) => (
              <div
                key={c.id}
                style={{
                  background: '#fff',
                  border: '1px solid #fbd38d',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#7b341e' }}>
                    Mesa #{c.mesa} · Cta: {c.cuenta || 'Principal'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                    Comanda #{c.id} · Pedido #{c.pedido_id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => procesarAcuseCancelacion(c.id)}
                  style={{
                    background: '#dd6b20',
                    color: '#fff',
                    border: 'none',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Acusar Recibo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barra de control del Tablero */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: '#fff',
          padding: '0.85rem 1.25rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 700 }}>
            {vistaHistorico ? `Comandas Despachadas Hoy (${comandasListas.length})` : `Tablero de Comandas en Vivo`}
          </h3>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              background: esCocina ? '#feebc8' : '#bee3f8',
              color: esCocina ? '#7b341e' : '#2b6cb0',
            }}
          >
            {destino}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={() => {
              setVistaHistorico(!vistaHistorico);
              if (!vistaHistorico) cargarListasHoy();
            }}
            style={{
              background: vistaHistorico ? '#4a5568' : '#edf2f7',
              color: vistaHistorico ? '#fff' : '#2d3748',
              border: '1px solid #cbd5e0',
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {vistaHistorico ? '← Volver al Tablero Activo' : 'Ver Despachadas Hoy'}
          </button>
          <button
            type="button"
            onClick={cargarComandas}
            style={{
              background: '#edf2f7',
              color: '#2d3748',
              border: '1px solid #cbd5e0',
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↻ Refrescar
          </button>
        </div>
      </div>

      {cargando ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#718096' }}>
          Cargando comandas de {destino}…
        </div>
      ) : vistaHistorico ? (
        /* VISTA DE HISTÓRICO: COMANDAS LISTAS DE HOY */
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            padding: '1.25rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          {comandasListas.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
              No hay comandas despachadas registradas hoy.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {comandasListas.map((c) => (
                <div
                  key={c.id}
                  style={{
                    background: '#f7fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div>
                      <strong style={{ fontSize: '1rem', color: '#1a202c' }}>Mesa #{c.mesa}</strong>
                      <span style={{ fontSize: '0.8rem', color: '#718096', marginLeft: '0.4rem' }}>
                        Cta: {c.cuenta || '1'}
                      </span>
                    </div>
                    <span
                      style={{
                        background: '#c6f6d5',
                        color: '#22543d',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      ✓ LISTA
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#4a5568', marginBottom: '0.5rem' }}>
                    Mesero: {c.mesero?.nombre || 'Mesero'} · Despachada: {c.lista_en ? new Date(c.lista_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Hoy'}
                  </div>

                  <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#2d3748' }}>
                    {c.items?.map((it) => (
                      <li key={it.id} style={{ marginBottom: '0.25rem' }}>
                        <strong>{it.cantidad}x</strong> {it.producto}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* TABLERO KANBAN DE TRES COLUMNAS */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.25rem',
            alignItems: 'start',
          }}
        >
          {/* COLUMNA 1: ENVIADAS / NUEVAS (Esperando confirmación CU15) */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem',
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
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #cbd5e0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#dd6b20' }} />
                <strong style={{ fontSize: '0.95rem', color: '#2d3748', textTransform: 'uppercase' }}>
                  1. Enviadas / Nuevas
                </strong>
              </div>
              <span
                style={{
                  background: '#dd6b20',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {enviadas.length}
              </span>
            </div>

            {enviadas.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.85rem' }}>
                No hay comandas nuevas por confirmar
              </div>
            ) : (
              enviadas.map((c) => {
                const minutos = calcularMinutosEspera(c.enviada_en);
                const demorada = minutos >= 15;

                return (
                  <div
                    key={c.id}
                    style={{
                      background: '#fff',
                      border: c.es_anticipada ? '2px solid #ed8936' : '1px solid #cbd5e0',
                      borderRadius: '8px',
                      padding: '1rem',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    {/* Cabecera de Comanda */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '1.1rem', color: '#1a202c' }}>Mesa #{c.mesa}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                            Cta: {c.cuenta || '1'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.1rem' }}>
                          Mesero: {c.mesero?.nombre || 'Mesero'} · Comanda #{c.id}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                        {c.es_anticipada && (
                          <span
                            style={{
                              background: '#feebc8',
                              color: '#c05621',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              border: '1px solid #fbd38d',
                            }}
                          >
                            ⚡ ANTICIPADA
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: demorada ? '#fed7d7' : '#edf2f7',
                            color: demorada ? '#9b2c2c' : '#4a5568',
                          }}
                        >
                          🕒 Hace {minutos} min {demorada && '⚠️'}
                        </span>
                      </div>
                    </div>

                    {/* Lista de Ítems */}
                    <div
                      style={{
                        background: '#f8fafc',
                        borderRadius: '6px',
                        padding: '0.65rem 0.75rem',
                        border: '1px solid #edf2f7',
                      }}
                    >
                      <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                        Ítems a preparar ({c.items?.length || 0})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {c.items?.map((it) => (
                          <div key={it.id} style={{ fontSize: '0.85rem', color: '#1a202c' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span>
                                <strong>{it.cantidad}x</strong> {it.producto}
                              </span>
                              {it.es_preparado && (
                                <span style={{ fontSize: '0.7rem', color: '#2b6cb0', fontWeight: 600 }}>
                                  ✓ Ya preparado
                                </span>
                              )}
                              {it.modalidad === 'LLEVAR' && (
                                <span style={{ fontSize: '0.7rem', color: '#b7791f', fontWeight: 600 }}>
                                  📦 Para llevar
                                </span>
                              )}
                            </div>
                            {it.opciones && it.opciones.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#4a5568', marginLeft: '1rem' }}>
                                + {it.opciones.join(', ')}
                              </div>
                            )}
                            {it.observacion && (
                              <div style={{ fontSize: '0.75rem', color: '#c53030', marginLeft: '1rem', fontStyle: 'italic' }}>
                                Nota: {it.observacion}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Acción: Confirmar Recepción (CU15) */}
                    <button
                      type="button"
                      onClick={() => abrirModalConfirmacion(c)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 1rem',
                        background: '#3182ce',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      ✓ Confirmar Recepción (CU15)
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* COLUMNA 2: RECIBIDAS (Confirmadas, listas para entrar a fogones/barra) */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem',
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
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #cbd5e0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3182ce' }} />
                <strong style={{ fontSize: '0.95rem', color: '#2d3748', textTransform: 'uppercase' }}>
                  2. Recibidas
                </strong>
              </div>
              <span
                style={{
                  background: '#3182ce',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {recibidas.length}
              </span>
            </div>

            {recibidas.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.85rem' }}>
                No hay comandas en espera de inicio
              </div>
            ) : (
              recibidas.map((c) => {
                const minutos = calcularMinutosEspera(c.enviada_en);
                const demorada = minutos >= 15;
                const tieneDiscrepancia =
                  c.items_confirmados !== null &&
                  c.items_confirmados !== undefined &&
                  c.items_confirmados !== (c.total_items || c.items?.length);

                return (
                  <div
                    key={c.id}
                    style={{
                      background: '#fff',
                      border: c.es_anticipada ? '2px solid #ed8936' : '1px solid #cbd5e0',
                      borderRadius: '8px',
                      padding: '1rem',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '1.1rem', color: '#1a202c' }}>Mesa #{c.mesa}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                            Cta: {c.cuenta || '1'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.1rem' }}>
                          Mesero: {c.mesero?.nombre || 'Mesero'} · Comanda #{c.id}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                        {c.es_anticipada && (
                          <span
                            style={{
                              background: '#feebc8',
                              color: '#c05621',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              border: '1px solid #fbd38d',
                            }}
                          >
                            ⚡ ANTICIPADA
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: demorada ? '#fed7d7' : '#edf2f7',
                            color: demorada ? '#9b2c2c' : '#4a5568',
                          }}
                        >
                          🕒 Hace {minutos} min {demorada && '⚠️'}
                        </span>
                      </div>
                    </div>

                    {/* Discrepancia badge si hubo diferencia en CU15 */}
                    {tieneDiscrepancia && (
                      <div
                        style={{
                          background: '#fffaf0',
                          border: '1px solid #fbd38d',
                          borderRadius: '6px',
                          padding: '0.4rem 0.6rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                          color: '#7b341e',
                        }}
                      >
                        <span>⚠️ Discrepancia: {c.items_confirmados} de {c.total_items} ítems</span>
                        <button
                          type="button"
                          onClick={() => abrirModalConfirmacion(c)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#c05621',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Corregir recuento
                        </button>
                      </div>
                    )}

                    {/* Lista de Ítems */}
                    <div
                      style={{
                        background: '#f8fafc',
                        borderRadius: '6px',
                        padding: '0.65rem 0.75rem',
                        border: '1px solid #edf2f7',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {c.items?.map((it) => (
                          <div key={it.id} style={{ fontSize: '0.85rem', color: '#1a202c' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>
                                <strong>{it.cantidad}x</strong> {it.producto}
                              </span>
                              {it.es_preparado && (
                                <span style={{ fontSize: '0.7rem', color: '#2b6cb0', fontWeight: 600 }}>
                                  ✓ Ya preparado
                                </span>
                              )}
                            </div>
                            {it.opciones && it.opciones.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#4a5568', marginLeft: '1rem' }}>
                                + {it.opciones.join(', ')}
                              </div>
                            )}
                            {it.observacion && (
                              <div style={{ fontSize: '0.75rem', color: '#c53030', marginLeft: '1rem', fontStyle: 'italic' }}>
                                Nota: {it.observacion}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Acción: Iniciar Preparación */}
                    <button
                      type="button"
                      onClick={() => avanzarEstado(c.id, 'EN_PREPARACION')}
                      style={{
                        width: '100%',
                        padding: '0.6rem 1rem',
                        background: '#2b6cb0',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      ▶ Iniciar Preparación
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* COLUMNA 3: EN PREPARACIÓN (Cocinándose / preparándose) */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem',
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
                paddingBottom: '0.5rem',
                borderBottom: '2px solid #cbd5e0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#38a169' }} />
                <strong style={{ fontSize: '0.95rem', color: '#2d3748', textTransform: 'uppercase' }}>
                  3. En Preparación
                </strong>
              </div>
              <span
                style={{
                  background: '#38a169',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '0.15rem 0.55rem',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {enPreparacion.length}
              </span>
            </div>

            {enPreparacion.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.85rem' }}>
                No hay platos o bebidas en proceso
              </div>
            ) : (
              enPreparacion.map((c) => {
                const minutos = calcularMinutosEspera(c.enviada_en);
                const demorada = minutos >= 15;

                return (
                  <div
                    key={c.id}
                    style={{
                      background: '#fff',
                      border: c.es_anticipada ? '2px solid #ed8936' : '1px solid #cbd5e0',
                      borderRadius: '8px',
                      padding: '1rem',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '1.1rem', color: '#1a202c' }}>Mesa #{c.mesa}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                            Cta: {c.cuenta || '1'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.1rem' }}>
                          Mesero: {c.mesero?.nombre || 'Mesero'} · Comanda #{c.id}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                        {c.es_anticipada && (
                          <span
                            style={{
                              background: '#feebc8',
                              color: '#c05621',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              border: '1px solid #fbd38d',
                            }}
                          >
                            ⚡ ANTICIPADA
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            background: demorada ? '#fed7d7' : '#edf2f7',
                            color: demorada ? '#9b2c2c' : '#4a5568',
                          }}
                        >
                          🕒 Hace {minutos} min {demorada && '⚠️'}
                        </span>
                      </div>
                    </div>

                    {/* Lista de Ítems */}
                    <div
                      style={{
                        background: '#f8fafc',
                        borderRadius: '6px',
                        padding: '0.65rem 0.75rem',
                        border: '1px solid #edf2f7',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {c.items?.map((it) => (
                          <div key={it.id} style={{ fontSize: '0.85rem', color: '#1a202c' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>
                                <strong>{it.cantidad}x</strong> {it.producto}
                              </span>
                              {it.es_preparado && (
                                <span style={{ fontSize: '0.7rem', color: '#2b6cb0', fontWeight: 600 }}>
                                  ✓ Ya preparado
                                </span>
                              )}
                            </div>
                            {it.opciones && it.opciones.length > 0 && (
                              <div style={{ fontSize: '0.75rem', color: '#4a5568', marginLeft: '1rem' }}>
                                + {it.opciones.join(', ')}
                              </div>
                            )}
                            {it.observacion && (
                              <div style={{ fontSize: '0.75rem', color: '#c53030', marginLeft: '1rem', fontStyle: 'italic' }}>
                                Nota: {it.observacion}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Acción: Marcar Lista / Despachada */}
                    <button
                      type="button"
                      onClick={() => avanzarEstado(c.id, 'LISTA')}
                      style={{
                        width: '100%',
                        padding: '0.6rem 1rem',
                        background: '#38a169',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      ✓ Marcar Lista / Despachada
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* MODAL: VERIFICACIÓN Y RECUENTO DE ÍTEMS RECIBIDOS (CU15) */}
      {modalConfirmacion && (
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
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 700 }}>
                Confirmar Recepción de Comanda #{modalConfirmacion.id}
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                Mesa #{modalConfirmacion.mesa} · Mesero: {modalConfirmacion.mesero?.nombre || 'Mesero'} · CU15
              </div>
            </div>

            {/* Alerta de discrepancia si no coincidió */}
            {resultadoDiscrepancia && !resultadoDiscrepancia.coincide && (
              <div
                style={{
                  background: '#fffaf0',
                  border: '1px solid #dd6b20',
                  borderRadius: '6px',
                  padding: '0.85rem',
                  color: '#7b341e',
                  fontSize: '0.85rem',
                }}
              >
                <strong>⚠️ Discrepancia detectada en el recuento:</strong>
                <div style={{ marginTop: '0.35rem' }}>
                  El pedido enviado contiene <strong>{resultadoDiscrepancia.items_enviados} ítems</strong>, pero confirmaste haber recibido <strong>{resultadoDiscrepancia.items_confirmados} ítems</strong>.
                </div>
                <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#9c4221' }}>
                  El mesero ha sido notificado en tiempo real con la diferencia. La comanda ha quedado registrada en «Recibidas» para que puedas comenzar o corregir el conteo.
                </div>
              </div>
            )}

            {/* Listado de lo que contiene la comanda */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '0.75rem',
                maxHeight: '180px',
                overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#718096', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Líneas de la comanda física
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#2d3748' }}>
                {modalConfirmacion.items?.map((it) => (
                  <li key={it.id} style={{ marginBottom: '0.2rem' }}>
                    <strong>{it.cantidad}x</strong> {it.producto} {it.es_preparado ? '(Ya preparado)' : ''}
                  </li>
                ))}
              </ul>
            </div>

            <form onSubmit={ejecutarConfirmacion} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Cantidad de ítems físicos que ves en el área (CU15)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setConteoItemsInput(String(Math.max(0, (parseInt(conteoItemsInput, 10) || 0) - 1)))}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      background: '#edf2f7',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={conteoItemsInput}
                    onChange={(e) => setConteoItemsInput(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '0.45rem 0.75rem',
                      border: '1px solid #cbd5e0',
                      borderRadius: '6px',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setConteoItemsInput(String((parseInt(conteoItemsInput, 10) || 0) + 1))}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e0',
                      background: '#edf2f7',
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    +
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem', display: 'block' }}>
                  Cuenta cada línea o plato recibido. Si hay diferencia, se emitirá una alerta sin bloquear la comanda.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => {
                    setModalConfirmacion(null);
                    setResultadoDiscrepancia(null);
                  }}
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
                  {resultadoDiscrepancia ? 'Entendido / Cerrar' : 'Cancelar'}
                </button>
                <button
                  type="submit"
                  disabled={confirmando}
                  style={{
                    background: '#3182ce',
                    color: '#fff',
                    border: 'none',
                    padding: '0.45rem 1.1rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: confirmando ? 'not-allowed' : 'pointer',
                    opacity: confirmando ? 0.6 : 1,
                  }}
                >
                  {confirmando
                    ? 'Confirmando…'
                    : resultadoDiscrepancia
                    ? 'Reenviar Corrección'
                    : 'Confirmar Recuento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
