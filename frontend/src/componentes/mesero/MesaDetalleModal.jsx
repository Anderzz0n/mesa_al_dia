import { useState, useEffect } from 'react';
import { obtenerCuentasMesa, crearCuentaMesa } from '../../api.js';

/**
 * M2: Vista de mesa con sus cuentas vivas (CU9, CU14).
 */
export function MesaDetalleModal({
  mesa,
  onSeleccionarCuenta,
  onAbrirNuevaCuenta,
  onReasignarMesa,
  onCerrar,
}) {
  const [cuentas, setCuentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await obtenerCuentasMesa(mesa.id);
        if (activo) setCuentas(res.cuentas || []);
      } catch (err) {
        if (activo) setError(err.message || 'Error al obtener cuentas de la mesa');
      } finally {
        if (activo) setCargando(false);
      }
    })();

    return () => {
      activo = false;
    };
  }, [mesa.id]);

  // Calcular la siguiente etiqueta sugerida ("Cuenta N")
  const siguienteNumero = cuentas.length + 1;
  const etiquetaSugerida = `Cuenta ${siguienteNumero}`;

  async function manejarCrearNueva() {
    setCreando(true);
    setError(null);
    try {
      const res = await crearCuentaMesa(mesa.id, { etiqueta: etiquetaSugerida });
      const nuevaCuenta = res.cuenta;
      onAbrirNuevaCuenta({
        ...nuevaCuenta,
        mesa_numero: mesa.numero,
        sector_nombre: mesa.sector_nombre,
      });
    } catch (err) {
      setError(err.message || 'Error al abrir nueva cuenta');
    } finally {
      setCreando(false);
    }
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
        zIndex: 100,
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
          onClick={onCerrar}
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
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
              Mesa {mesa.numero}
            </h1>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                background:
                  mesa.estado === 'DISPONIBLE'
                    ? '#38a169'
                    : mesa.estado === 'OCUPADA'
                    ? '#dd6b20'
                    : mesa.estado === 'CON_PEDIDOS_PENDIENTES'
                    ? '#3182ce'
                    : '#e53e3e',
                color: '#fff',
              }}
            >
              {mesa.estado === 'DISPONIBLE'
                ? 'Libre'
                : mesa.estado === 'OCUPADA'
                ? 'Ocupada'
                : mesa.estado === 'CON_PEDIDOS_PENDIENTES'
                ? 'Pedidos'
                : 'En pago'}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            {mesa.sector_nombre || 'Sin sector'}
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

        <h2 style={{ fontSize: '0.95rem', color: '#2d3748', margin: '0 0 0.75rem 0', fontWeight: 700 }}>
          Cuentas de la mesa ({cuentas.length})
        </h2>

        {cargando ? (
          <p style={{ textAlign: 'center', color: '#718096', marginTop: '2rem' }}>Cargando cuentas...</p>
        ) : cuentas.length === 0 ? (
          <div
            style={{
              background: '#ffffff',
              border: '1px dashed #cbd5e0',
              borderRadius: '8px',
              padding: '1.5rem',
              textAlign: 'center',
              color: '#718096',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#4a5568', marginBottom: '0.25rem' }}>
              Esta mesa no tiene cuentas abiertas.
            </div>
            <span style={{ fontSize: '0.8rem' }}>
              Al abrir una cuenta pasas directo a tomar el pedido.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {cuentas.map((c) => (
              <div
                key={c.id}
                onClick={() => onSeleccionarCuenta(c)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1a202c' }}>
                      {c.etiqueta}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        background: c.estado === 'ABIERTA' ? '#ebf8ff' : '#feebc8',
                        color: c.estado === 'ABIERTA' ? '#2b6cb0' : '#744210',
                        border: c.estado === 'ABIERTA' ? '1px solid #bee3f8' : '1px solid #fbd38d',
                      }}
                    >
                      {c.estado === 'ABIERTA' ? 'Abierta' : 'Pendiente de pago'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.25rem' }}>
                    {c.pedidos || 0} {c.pedidos === 1 ? 'pedido' : 'pedidos'} · <strong style={{ color: '#2d3748' }}>${Number(c.total || 0).toLocaleString('es-CO')}</strong>
                  </div>
                </div>

                <span style={{ fontSize: '1.25rem', color: '#a0aec0', fontWeight: 700 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Barra inferior fija */}
      <div
        style={{
          background: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <button
          type="button"
          disabled={creando}
          onClick={manejarCrearNueva}
          style={{
            width: '100%',
            background: '#2b6cb0',
            color: '#ffffff',
            border: 'none',
            padding: '0.85rem',
            borderRadius: '8px',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: creando ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(43,108,176,0.3)',
          }}
        >
          {creando ? 'Creando cuenta...' : `+ Nueva cuenta (${etiquetaSugerida}) y tomar pedido`}
        </button>

        <button
          type="button"
          onClick={onReasignarMesa}
          style={{
            width: '100%',
            background: '#edf2f7',
            border: '1px solid #cbd5e0',
            color: '#4a5568',
            padding: '0.65rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Reasignar mesa…
        </button>
      </div>
    </div>
  );
}
