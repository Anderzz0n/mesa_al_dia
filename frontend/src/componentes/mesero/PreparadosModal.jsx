import { useState, useEffect, useMemo } from 'react';
import { obtenerPreparados } from '../../api.js';
import { conectarTiempoReal } from '../../tiempoReal.js';

/**
 * M11: Pestaña / Vista de consulta de productos preparados disponibles (RF10 · CU20).
 * Es de solo consulta. Los meseros no crean preparados (eso es de cocina/bar)
 * y la asignación se realiza dentro del flujo del pedido (M5a/M7).
 */
export function PreparadosModal({ onCerrar }) {
  const [cargando, setCargando] = useState(true);
  const [unidades, setUnidades] = useState([]);
  const [errorCarga, setErrorCarga] = useState(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        setErrorCarga(null);
        const data = await obtenerPreparados();
        if (activo) {
          setUnidades(data?.preparados || []);
        }
      } catch (err) {
        if (activo) {
          setErrorCarga(err.message || 'Error al consultar productos preparados');
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    cargar();

    const socket = conectarTiempoReal();
    function manejarActualizacion() {
      cargar();
    }
    socket.on('preparado.nuevo', manejarActualizacion);
    socket.on('preparado.asignado', manejarActualizacion);

    return () => {
      activo = false;
      socket.off('preparado.nuevo', manejarActualizacion);
      socket.off('preparado.asignado', manejarActualizacion);
      socket.disconnect();
    };
  }, []);

  // Agrupar unidades por producto
  const gruposPorProducto = useMemo(() => {
    const mapa = new Map();
    for (const u of unidades) {
      if (!mapa.has(u.producto_id)) {
        mapa.set(u.producto_id, {
          producto_id: u.producto_id,
          producto_nombre: u.producto_nombre,
          destino: u.destino,
          precio: u.precio,
          unidades: [],
        });
      }
      mapa.get(u.producto_id).unidades.push(u);
    }
    return Array.from(mapa.values());
  }, [unidades]);

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
        zIndex: 110,
        maxWidth: '480px',
        margin: '0 auto',
      }}
    >
      {/* Cabecera */}
      <header
        style={{
          background: '#2b6cb0',
          color: '#ffffff',
          padding: '0.85rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Preparados</h1>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            Platos ya hechos y disponibles
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span
            style={{
              background: '#22543d',
              color: '#c6f6d5',
              padding: '0.2rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.72rem',
              fontWeight: 700,
            }}
          >
            ● En línea
          </span>
          {onCerrar && (
            <button
              type="button"
              onClick={onCerrar}
              style={{
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                color: '#fff',
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Contenido */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {/* Banner informativo de uso */}
        <div
          style={{
            padding: '0.75rem',
            borderRadius: '8px',
            background: '#ebf8ff',
            border: '1px solid #bee3f8',
            color: '#2b6cb0',
            fontSize: '0.82rem',
            lineHeight: '1.35',
            marginBottom: '1rem',
          }}
        >
          Para usar uno, elígelo al tomar el pedido: <strong>Menú → producto → «Usar un preparado»</strong>.
        </div>

        {errorCarga && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '8px',
              background: '#fff5f5',
              border: '1px solid #feb2b2',
              color: '#c53030',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            {errorCarga}
          </div>
        )}

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#718096', fontSize: '0.9rem' }}>
            Consultando platos ya preparados...
          </div>
        ) : gruposPorProducto.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1.5rem',
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px dashed #cbd5e0',
              marginTop: '1rem',
            }}
          >
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#2d3748', marginBottom: '0.35rem' }}>
              No hay platos ya preparados
            </div>
            <div style={{ fontSize: '0.82rem', color: '#718096' }}>
              Todos los platos se elaborarán al enviarse la comanda.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {gruposPorProducto.map((grupo) => (
              <div
                key={grupo.producto_id}
                style={{
                  background: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                {/* Cabecera del grupo de producto */}
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#edf2f7',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a202c' }}>
                    {grupo.producto_nombre} · {grupo.unidades.length}{' '}
                    {grupo.unidades.length === 1 ? 'disponible' : 'disponibles'}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      background: grupo.destino === 'COCINA' ? '#feebc8' : '#e9d8fd',
                      color: grupo.destino === 'COCINA' ? '#7b341e' : '#44337a',
                    }}
                  >
                    {grupo.destino}
                  </span>
                </div>

                {/* Lista de unidades del producto */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {grupo.unidades.map((u, idx) => (
                    <div
                      key={u.id}
                      style={{
                        padding: '0.75rem 1rem',
                        borderBottom: idx < grupo.unidades.length - 1 ? '1px solid #edf2f7' : 'none',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#2d3748' }}>
                          Unidad {idx + 1}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.1rem' }}>
                          Preparado hace {u.minutos_preparado} min
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          background: '#c6f6d5',
                          color: '#22543d',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontWeight: 700,
                        }}
                      >
                        DISPONIBLE
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Botón inferior Volver a Mesas */}
      {onCerrar && (
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
          <button
            type="button"
            onClick={onCerrar}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e0',
              background: '#f7fafc',
              color: '#2d3748',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Volver a Mis Mesas
          </button>
        </div>
      )}
    </div>
  );
}
