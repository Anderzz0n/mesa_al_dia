import { useState, useEffect, useCallback } from 'react';
import { obtenerDetalleCuenta, actualizarEstadoCuenta } from '../../api.js';
import { conectarTiempoReal } from '../../tiempoReal.js';
import { CancelarPedidoModal } from './CancelarPedidoModal.jsx';

/**
 * M3: Vista de detalle de una cuenta con sus pedidos, estados de comandas y totales (CU13, RF4, RF8).
 */
export function CuentaDetalleModal({
  cuentaId,
  onTomarPedido,
  onVolverMesa,
}) {
  const [cuenta, setCuenta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [procesandoEstado, setProcesandoEstado] = useState(false);
  const [horaServidor, setHoraServidor] = useState(null);

  // Modal Cancelar / Solicitar (M8a / M8b)
  const [pedidoParaCancelar, setPedidoParaCancelar] = useState(null);
  const [avisoLocal, setAvisoLocal] = useState(null);

  const cargarDetalle = useCallback(async () => {
    try {
      setError(null);
      const res = await obtenerDetalleCuenta(cuentaId);
      setCuenta(res.cuenta);
      setHoraServidor(res.hora_servidor || new Date().toISOString());
    } catch (err) {
      setError(err.message || 'Error al cargar detalle de la cuenta');
    } finally {
      setCargando(false);
    }
  }, [cuentaId]);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await obtenerDetalleCuenta(cuentaId);
        if (activo) {
          setCuenta(res.cuenta);
          setHoraServidor(res.hora_servidor || new Date().toISOString());
        }
      } catch (err) {
        if (activo) setError(err.message || 'Error al cargar detalle de la cuenta');
      } finally {
        if (activo) setCargando(false);
      }
    })();

    // Suscripción a eventos en tiempo real para cancelaciones y comandas
    const socket = conectarTiempoReal();
    socket.on('pedido.cancelado', (datos) => {
      if (datos.cuenta_id === Number(cuentaId)) {
        cargarDetalle();
        setAvisoLocal(`Pedido #${datos.pedido_id} cancelado`);
      }
    });

    socket.on('cancelacion.solicitada', (datos) => {
      if (datos.cuenta_id === Number(cuentaId)) {
        cargarDetalle();
        setAvisoLocal(`Solicitud de cancelación enviada a Caja para Pedido #${datos.pedido_id}`);
      }
    });

    socket.on('cancelacion.rechazada', (datos) => {
      if (datos.cuenta_id === Number(cuentaId)) {
        cargarDetalle();
        setAvisoLocal(`Caja rechazó la cancelación del Pedido #${datos.pedido_id}`);
      }
    });

    socket.on('comanda.estado', () => {
      cargarDetalle();
    });

    return () => {
      activo = false;
      socket.disconnect();
    };
  }, [cuentaId, cargarDetalle]);

  async function cambiarEstado(nuevoEstado) {
    setProcesandoEstado(true);
    try {
      await actualizarEstadoCuenta(cuentaId, nuevoEstado);
      await cargarDetalle();
    } catch (err) {
      setError(err.message || 'Error al actualizar estado de la cuenta');
    } finally {
      setProcesandoEstado(false);
    }
  }

  function formatearTiempo(fechaIso) {
    if (!fechaIso) return '';
    const refMs = horaServidor ? new Date(horaServidor).getTime() : new Date(fechaIso).getTime();
    const diffMs = Math.max(0, refMs - new Date(fechaIso).getTime());
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins === 1) return 'hace 1 min';
    return `hace ${mins} min`;
  }

  function calcularSegundosRestantes(fechaIso) {
    if (!fechaIso || !horaServidor) return 0;
    const refMs = new Date(horaServidor).getTime();
    const diffSeg = Math.floor((refMs - new Date(fechaIso).getTime()) / 1000);
    return Math.max(0, 180 - diffSeg);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#f7fafc',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 105,
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      {/* Cabecera */}
      <header
        style={{
          background: '#2b6cb0',
          color: '#ffffff',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <button
          type="button"
          onClick={onVolverMesa}
          style={{
            background: 'none',
            border: 'none',
            color: '#fff',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ‹
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
              Mesa {cuenta?.mesa_numero || ''} · {cuenta?.etiqueta || 'Cuenta'}
            </h1>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                background: cuenta?.estado === 'ABIERTA' ? '#38a169' : '#dd6b20',
                color: '#fff',
              }}
            >
              {cuenta?.estado === 'ABIERTA' ? 'Abierta' : cuenta?.estado === 'PENDIENTE' ? 'Pendiente de pago' : 'Pagada'}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            {cuenta?.sector_nombre || 'Sector'}
          </span>
        </div>
      </header>

      {/* Aviso local emergente */}
      {avisoLocal && (
        <div
          style={{
            background: '#2d3748',
            color: '#ffffff',
            padding: '0.5rem 1rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            textAlign: 'center',
            borderBottom: '2px solid #ecc94b',
          }}
        >
          {avisoLocal}
        </div>
      )}

      {/* Contenido principal */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {error && (
          <div
            style={{
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              padding: '0.75rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {cargando ? (
          <p style={{ textAlign: 'center', color: '#718096', marginTop: '2rem' }}>Cargando cuenta...</p>
        ) : !cuenta ? (
          <p style={{ textAlign: 'center', color: '#718096', marginTop: '2rem' }}>No se encontró la cuenta</p>
        ) : (
          <div>
            <h2 style={{ fontSize: '0.95rem', color: '#2d3748', margin: '0 0 0.75rem 0', fontWeight: 700 }}>
              Pedidos de la cuenta ({cuenta.pedidos?.length || 0})
            </h2>

            {cuenta.pedidos && cuenta.pedidos.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {cuenta.pedidos.map((ped) => {
                  const cancelacion = ped.cancelacion;
                  const esAprobada = ped.cancelado || cancelacion?.estado === 'APROBADA';
                  const esSolicitada = cancelacion?.estado === 'SOLICITADA';
                  const esRechazada = cancelacion?.estado === 'RECHAZADA';

                  const segundosRestantes = calcularSegundosRestantes(ped.creado_en);
                  const esDirecta = segundosRestantes > 0;
                  const minutosM = Math.floor(segundosRestantes / 60);
                  const segundosS = String(segundosRestantes % 60).padStart(2, '0');

                  return (
                    <div
                      key={ped.id}
                      style={{
                        background: esAprobada ? '#f7fafc' : '#ffffff',
                        border: esAprobada ? '1px dashed #cbd5e0' : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        opacity: esAprobada ? 0.7 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: esAprobada ? '#a0aec0' : '#1a202c', textDecoration: esAprobada ? 'line-through' : 'none' }}>
                            Pedido #{ped.id}
                          </span>
                          {esAprobada && (
                            <span style={{ fontSize: '0.65rem', background: '#fed7d7', color: '#9b2c2c', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>
                              Cancelado
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                          {formatearTiempo(ped.creado_en)}
                        </span>
                      </div>

                      {/* Estado de las comandas asociadas */}
                      {ped.comandas && ped.comandas.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', margin: '0.35rem 0' }}>
                          {ped.comandas.map((k) => (
                            <span
                              key={k.id}
                              style={{
                                fontSize: '0.7rem',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                background:
                                  k.estado === 'LISTA'
                                    ? '#c6f6d5'
                                    : k.estado === 'EN_PREPARACION'
                                    ? '#feebc8'
                                    : k.estado === 'CANCELADA'
                                    ? '#edf2f7'
                                    : '#ebf8ff',
                                color:
                                  k.estado === 'LISTA'
                                    ? '#22543d'
                                    : k.estado === 'EN_PREPARACION'
                                    ? '#744210'
                                    : k.estado === 'CANCELADA'
                                    ? '#a0aec0'
                                    : '#2b6cb0',
                                fontWeight: 700,
                              }}
                            >
                              {k.destino}:{' '}
                              {k.estado === 'ENVIADA'
                                ? 'Esperando confirmación'
                                : k.estado === 'RECIBIDA'
                                ? 'Recibida'
                                : k.estado === 'EN_PREPARACION'
                                ? 'En preparación'
                                : k.estado === 'LISTA'
                                ? 'Lista'
                                : 'Cancelada'}{' '}
                              {k.es_anticipada ? '(Anticipada)' : ''}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Lista de ítems del pedido */}
                      <ul style={{ margin: '0.4rem 0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#4a5568' }}>
                        {ped.items?.map((it) => (
                          <li key={it.id} style={{ margin: '0.2rem 0' }}>
                            <strong>{it.cantidad}×</strong> {it.producto_nombre}
                            {it.modalidad && it.modalidad !== 'MESA' && (
                              <span style={{ color: '#2b6cb0', fontWeight: 600 }}> · {it.modalidad}</span>
                            )}
                            {it.opciones && it.opciones.length > 0 && (
                              <span style={{ color: '#718096' }}> ({it.opciones.map((o) => o.nombre).join(', ')})</span>
                            )}
                            {it.observacion && (
                              <span style={{ fontStyle: 'italic', color: '#718096' }}> · «{it.observacion}»</span>
                            )}
                          </li>
                        ))}
                      </ul>

                      {/* Estados y acciones de Cancelación */}
                      {esSolicitada ? (
                        <div
                          style={{
                            background: '#ebf8ff',
                            border: '1px solid #bee3f8',
                            color: '#2b6cb0',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            margin: '0.5rem 0 0.25rem 0',
                          }}
                        >
                          Solicitud enviada · esperando a caja
                        </div>
                      ) : esRechazada ? (
                        <div
                          style={{
                            background: '#fffaf0',
                            border: '1px solid #feebc8',
                            color: '#744210',
                            padding: '0.4rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            margin: '0.5rem 0 0.25rem 0',
                          }}
                        >
                          <span><b>Caja rechazó</b> la cancelación</span>
                          <button
                            type="button"
                            onClick={() => setPedidoParaCancelar(ped)}
                            style={{
                              background: '#2b6cb0',
                              color: '#fff',
                              border: 'none',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            Volver a solicitar
                          </button>
                        </div>
                      ) : !esAprobada ? (
                        <div style={{ marginTop: '0.5rem' }}>
                          <button
                            type="button"
                            onClick={() => setPedidoParaCancelar(ped)}
                            style={{
                              background: esDirecta ? '#fff5f5' : '#f7fafc',
                              border: esDirecta ? '1px solid #feb2b2' : '1px solid #cbd5e0',
                              color: esDirecta ? '#c53030' : '#4a5568',
                              padding: '0.35rem 0.6rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {esDirecta
                              ? `Cancelar pedido · quedan ${minutosM}:${segundosS}`
                              : 'Solicitar cancelación'}
                          </button>
                        </div>
                      ) : null}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid #edf2f7' }}>
                        <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                          Atendido por: {ped.mesero?.nombre_completo || 'Mesero'}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: esAprobada ? '#a0aec0' : '#2b6cb0' }}>
                          {esAprobada ? 'No suma al total' : `$${Number(ped.total || 0).toLocaleString('es-CO')}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  background: '#ffffff',
                  border: '1px dashed #cbd5e0',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  textAlign: 'center',
                  color: '#718096',
                  fontSize: '0.85rem',
                }}
              >
                Esta cuenta aún no tiene pedidos registrados.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barra inferior fija de acciones */}
      {cuenta && (
        <div
          style={{
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4a5568' }}>Total de la cuenta</span>
            <span style={{ fontWeight: 800, fontSize: '1.35rem', color: '#2b6cb0' }}>
              ${Number(cuenta.total || 0).toLocaleString('es-CO')}
            </span>
          </div>

          {cuenta.estado === 'ABIERTA' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => onTomarPedido(cuenta)}
                style={{
                  width: '100%',
                  background: '#2b6cb0',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.8rem',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(43,108,176,0.3)',
                }}
              >
                + Agregar productos
              </button>

              <button
                type="button"
                disabled={procesandoEstado}
                onClick={() => cambiarEstado('PENDIENTE')}
                style={{
                  width: '100%',
                  background: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  color: '#2d3748',
                  padding: '0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: procesandoEstado ? 'not-allowed' : 'pointer',
                }}
              >
                Marcar pendiente de pago
              </button>
            </div>
          ) : cuenta.estado === 'PENDIENTE' ? (
            <div>
              <div style={{ fontSize: '0.8rem', color: '#c53030', fontWeight: 600, marginBottom: '0.5rem', textAlign: 'center' }}>
                En proceso de pago · Ya no se pueden agregar pedidos.
              </div>
              <button
                type="button"
                disabled={procesandoEstado}
                onClick={() => cambiarEstado('ABIERTA')}
                style={{
                  width: '100%',
                  background: '#2b6cb0',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: procesandoEstado ? 'not-allowed' : 'pointer',
                }}
              >
                Reabrir cuenta
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: '#718096', textAlign: 'center' }}>
              Cuenta pagada: no se puede modificar ni reabrir.
            </div>
          )}
        </div>
      )}

      {/* MODAL M8a / M8b: CANCELAR O SOLICITAR CANCELACIÓN */}
      {pedidoParaCancelar && cuenta && (
        <CancelarPedidoModal
          pedido={pedidoParaCancelar}
          cuenta={cuenta}
          horaServidor={horaServidor}
          onExito={() => {
            setPedidoParaCancelar(null);
            cargarDetalle();
          }}
          onCerrar={() => setPedidoParaCancelar(null)}
        />
      )}
    </div>
  );
}
