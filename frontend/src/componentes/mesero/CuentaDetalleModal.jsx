import { useState, useEffect, useCallback } from 'react';
import { obtenerDetalleCuenta, actualizarEstadoCuenta } from '../../api.js';

/**
 * M3: Vista de detalle de una cuenta con sus pedidos, estados de comandas y totales (CU13, RF4).
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

    return () => {
      activo = false;
    };
  }, [cuentaId]);

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
                  const esCancelado = ped.cancelado;

                  return (
                    <div
                      key={ped.id}
                      style={{
                        background: esCancelado ? '#f7fafc' : '#ffffff',
                        border: esCancelado ? '1px dashed #cbd5e0' : '1px solid #e2e8f0',
                        borderRadius: '8px',
                        padding: '0.85rem',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        opacity: esCancelado ? 0.7 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: esCancelado ? '#a0aec0' : '#1a202c', textDecoration: esCancelado ? 'line-through' : 'none' }}>
                            Pedido #{ped.id}
                          </span>
                          {esCancelado && (
                            <span style={{ fontSize: '0.65rem', background: '#fed7d7', color: '#9b2c2c', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>
                              Cancelado
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                          {formatearTiempo(ped.creado_en)}
                        </span>
                      </div>

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

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid #edf2f7' }}>
                        <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                          Atendido por: {ped.mesero?.nombre_completo || 'Mesero'}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: esCancelado ? '#a0aec0' : '#2b6cb0' }}>
                          {esCancelado ? 'No suma al total' : `$${Number(ped.total || 0).toLocaleString('es-CO')}`}
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
    </div>
  );
}
