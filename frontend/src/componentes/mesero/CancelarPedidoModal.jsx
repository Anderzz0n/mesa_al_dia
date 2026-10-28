import { useState, useEffect } from 'react';
import { solicitarOCancelarPedido } from '../../api.js';

/**
 * M8a / M8b: Modal para cancelar pedido directamente (< 3 min) o solicitar a caja (>= 3 min).
 * Cubre RF8 · CU17, CU18.
 */
export function CancelarPedidoModal({
  pedido,
  cuenta,
  horaServidor,
  onExito,
  onCerrar,
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  // Calcular tiempo restante de los 3 minutos (180 segundos) usando la hora del servidor
  const [segundosRestantes, setSegundosRestantes] = useState(() => {
    const fechaRegistro = pedido.creado_en ? new Date(pedido.creado_en).getTime() : 0;
    const refInicial = horaServidor ? new Date(horaServidor).getTime() : 0;
    if (refInicial && fechaRegistro) {
      return Math.max(0, 180 - Math.floor((refInicial - fechaRegistro) / 1000));
    }
    return 180;
  });

  useEffect(() => {
    if (segundosRestantes <= 0) return;
    const intervalo = setInterval(() => {
      setSegundosRestantes((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(intervalo);
  }, [segundosRestantes]);

  const esDirecta = segundosRestantes > 0;
  const minutosM = Math.floor(segundosRestantes / 60);
  const segundosS = String(segundosRestantes % 60).padStart(2, '0');

  const chipsMotivos = ['Cliente cambió de idea', 'Error al tomar', 'Demora en preparación', 'Otro'];

  async function ejecutarAccion() {
    if (!motivo.trim() || enviando) return;
    setEnviando(true);
    setError(null);

    try {
      const res = await solicitarOCancelarPedido(pedido.id, { motivo: motivo.trim() });
      onExito(res.cancelacion);
    } catch (err) {
      if (err.codigo === 'CUENTA_PAGADA') {
        setError('La cuenta ya fue liquidada; no se pueden cancelar sus pedidos.');
      } else if (err.codigo === 'CANCELACION_YA_EXISTE') {
        setError('Este pedido ya tiene una solicitud de cancelación en curso o ya fue cancelado.');
      } else {
        setError(err.message || 'Error al procesar la cancelación');
      }
    } finally {
      setEnviando(false);
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
        zIndex: 125,
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
        <div>
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
            {esDirecta ? 'Cancelar pedido' : 'Solicitar cancelación'}
          </h1>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            Mesa {cuenta.mesa_numero} · {cuenta.etiqueta}
          </span>
        </div>
      </header>

      {/* Contenido */}
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
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        {/* Tarjeta del pedido a cancelar */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '0.85rem',
            marginBottom: '1rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1a202c' }}>
              Pedido #{pedido.id}
            </span>
            <span style={{ fontWeight: 700, color: '#2b6cb0', fontSize: '0.9rem' }}>
              ${Number(pedido.total || 0).toLocaleString('es-CO')}
            </span>
          </div>

          <ul style={{ margin: '0.4rem 0', paddingLeft: '1.2rem', fontSize: '0.85rem', color: '#4a5568' }}>
            {pedido.items?.map((it) => (
              <li key={it.id} style={{ margin: '0.2rem 0' }}>
                <strong>{it.cantidad}×</strong> {it.producto_nombre}
                {it.modalidad && it.modalidad !== 'MESA' && (
                  <span style={{ color: '#2b6cb0', fontWeight: 600 }}> · {it.modalidad}</span>
                )}
                {it.opciones && it.opciones.length > 0 && (
                  <span style={{ color: '#718096' }}> ({it.opciones.map((o) => o.nombre).join(', ')})</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Estado de la ventana de 3 minutos */}
        {esDirecta ? (
          <div
            style={{
              background: '#ebf8ff',
              border: '1px solid #bee3f8',
              borderRadius: '8px',
              padding: '1rem',
              textAlign: 'center',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#2b6cb0', marginBottom: '0.2rem' }}>
              Quedan para cancelarlo directamente:
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#2b6cb0' }}>
              {minutosM}:{segundosS}
            </div>
            <span style={{ fontSize: '0.75rem', color: '#718096', display: 'block', marginTop: '0.2rem' }}>
              La cancelación se aplicará de inmediato y no requiere autorización.
            </span>
          </div>
        ) : (
          <div
            style={{
              background: '#fffaf0',
              border: '1px solid #feebc8',
              borderRadius: '8px',
              padding: '0.85rem',
              marginBottom: '1rem',
              color: '#744210',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '0.25rem' }}>
              Ya pasaron más de 3 minutos.
            </div>
            <span style={{ fontSize: '0.8rem', lineHeight: 1.4, display: 'block' }}>
              Esta cancelación debe ser <strong>autorizada por Caja</strong>. El pedido seguirá activo hasta que Caja tome la decisión.
            </span>
          </div>
        )}

        {/* Motivo obligatorio */}
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="motivo-cancelacion-text"
            style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#2d3748', marginBottom: '0.35rem' }}
          >
            Motivo (obligatorio)
          </label>
          <textarea
            id="motivo-cancelacion-text"
            rows={3}
            placeholder="Escribe por qué se cancela..."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            style={{
              width: '100%',
              padding: '0.6rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '0.85rem',
              resize: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Atajos de motivos */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {chipsMotivos.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setMotivo(ch)}
                style={{
                  background: motivo === ch ? '#ebf8ff' : '#ffffff',
                  border: motivo === ch ? '1px solid #2b6cb0' : '1px solid #cbd5e0',
                  color: motivo === ch ? '#2b6cb0' : '#4a5568',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '14px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Barra inferior */}
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
          disabled={!motivo.trim() || enviando}
          onClick={ejecutarAccion}
          style={{
            width: '100%',
            background: !motivo.trim() || enviando ? '#cbd5e0' : esDirecta ? '#c53030' : '#2b6cb0',
            color: '#ffffff',
            border: 'none',
            padding: '0.85rem',
            borderRadius: '8px',
            fontSize: '0.95rem',
            fontWeight: 800,
            cursor: !motivo.trim() || enviando ? 'not-allowed' : 'pointer',
          }}
        >
          {enviando
            ? 'Procesando...'
            : !motivo.trim()
            ? (esDirecta ? 'Cancelar pedido (escribe el motivo)' : 'Enviar solicitud (escribe el motivo)')
            : esDirecta
            ? 'Cancelar pedido al instante (CU17)'
            : 'Enviar solicitud a caja (CU18)'}
        </button>

        <button
          type="button"
          onClick={onCerrar}
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
          {esDirecta ? 'No cancelar, volver' : 'Volver'}
        </button>

        {!esDirecta && (
          <span style={{ fontSize: '0.75rem', color: '#718096', textAlign: 'center', marginTop: '0.2rem' }}>
            Después verás «Solicitud enviada» en la cuenta y un aviso con la respuesta.
          </span>
        )}
      </div>
    </div>
  );
}
