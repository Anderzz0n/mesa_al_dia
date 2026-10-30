import { useState, useEffect } from 'react';
import { obtenerPreparados } from '../../api.js';

/**
 * M7: Modal para elegir producto preparado disponible (CU20, CU21).
 * Muestra las unidades físicas ya elaboradas para entrega inmediata.
 */
export function ElegirPreparadoModal({
  producto,
  onSeleccionarPreparado,
  onCerrar,
}) {
  const [cargando, setCargando] = useState(true);
  const [unidades, setUnidades] = useState([]);
  const [errorAsignacion, setErrorAsignacion] = useState(null);

  useEffect(() => {
    let activo = true;

    async function cargar() {
      try {
        setCargando(true);
        const data = await obtenerPreparados({ productoId: producto.id });
        if (activo) {
          setUnidades(data?.preparados || []);
        }
      } catch {
        if (activo) {
          setUnidades([]);
        }
      } finally {
        if (activo) {
          setCargando(false);
        }
      }
    }

    cargar();
    return () => {
      activo = false;
    };
  }, [producto.id]);

  function manejarUsar(unidad) {
    if (unidad.estado !== 'DISPONIBLE') {
      setErrorAsignacion('Esa unidad ya fue asignada a otro pedido. La lista se actualizó; elige otra.');
      return;
    }
    onSeleccionarPreparado(unidad);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        zIndex: 130,
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.2)',
          maxWidth: '480px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* Cabecera */}
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1a202c', fontWeight: 800 }}>
              Preparados disponibles
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: '0.15rem' }}>
              {producto.nombre}
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            style={{
              background: '#edf2f7',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              cursor: 'pointer',
              fontWeight: 700,
              color: '#4a5568',
              fontSize: '1rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          <div
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: '6px',
              background: '#ebf8ff',
              border: '1px solid #bee3f8',
              color: '#2b6cb0',
              fontSize: '0.82rem',
              lineHeight: '1.3',
              marginBottom: '1rem',
            }}
          >
            <strong>Platos ya hechos.</strong> Si usas uno, cocina no lo vuelve a preparar y se entrega de inmediato.
          </div>

          {errorAsignacion && (
            <div
              style={{
                padding: '0.65rem 0.75rem',
                borderRadius: '6px',
                background: '#fff5f5',
                border: '1px solid #fed7d7',
                color: '#c53030',
                fontSize: '0.82rem',
                marginBottom: '1rem',
                fontWeight: 600,
              }}
            >
              {errorAsignacion}
            </div>
          )}

          {cargando ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#718096', fontSize: '0.9rem' }}>
              Consultando preparados disponibles...
            </div>
          ) : unidades.length === 0 ? (
            <div
              style={{
                padding: '2.5rem 1rem',
                textAlign: 'center',
                background: '#f7fafc',
                borderRadius: '8px',
                border: '1px dashed #cbd5e0',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#2d3748', marginBottom: '0.35rem' }}>
                No hay platos ya preparados
              </div>
              <div style={{ fontSize: '0.82rem', color: '#718096' }}>
                Puedes pedirlo normal desde el menú y se enviará a preparar.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {unidades.map((u, idx) => (
                <div
                  key={u.id}
                  style={{
                    padding: '0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1a202c' }}>
                      Unidad {idx + 1}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#718096', marginTop: '0.15rem' }}>
                      Preparado hace {u.minutos_preparado} min · Área: {u.destino}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => manejarUsar(u)}
                    style={{
                      background: '#2b6cb0',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.55rem 1.1rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      minWidth: '85px',
                    }}
                  >
                    Usar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Botón inferior fijo */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
          <button
            type="button"
            onClick={onCerrar}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e0',
              background: '#ffffff',
              color: '#4a5568',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Volver sin usar preparado
          </button>
        </div>
      </div>
    </div>
  );
}
