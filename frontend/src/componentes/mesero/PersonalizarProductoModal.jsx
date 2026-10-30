import { useState, useMemo } from 'react';
import { ElegirPreparadoModal } from './ElegirPreparadoModal.jsx';

/**
 * M5a: Modal / Hoja inferior para personalizar producto individual (CU10, CU14, RF10 · CU20, CU21).
 */
export function PersonalizarProductoModal({
  producto,
  opcionesCatalogo = [],
  parametros = {},
  onAgregar,
  onCerrar,
}) {
  const [cantidad, setCantidad] = useState(1);
  const [modalidad, setModalidad] = useState('MESA');
  const [opcionesSeleccionadas, setOpcionesSeleccionadas] = useState([]);
  const [observacion, setObservacion] = useState('');
  const [preparadoSeleccionado, setPreparadoSeleccionado] = useState(null);
  const [mostrarModalPreparado, setMostrarModalPreparado] = useState(false);

  // Validaciones de modalidad según permisos del producto y switch de área
  const anticipadaActivaArea =
    producto.destino === 'COCINA'
      ? parametros.ANTICIPADA_ACTIVA_COCINA !== 'false'
      : parametros.ANTICIPADA_ACTIVA_BAR !== 'false';

  const permiteAnticipada = producto.permite_anticipada && anticipadaActivaArea;
  const permiteLlevar = producto.permite_llevar;

  // Opciones disponibles para este producto
  const opcionesDelProducto = useMemo(() => {
    return opcionesCatalogo.filter((op) => {
      // Si la opción tiene asignación explícita a este producto
      if (Array.isArray(producto.opciones_asignadas) && producto.opciones_asignadas.length > 0) {
        return producto.opciones_asignadas.includes(op.id);
      }
      // O si el producto tiene producto_opciones
      if (Array.isArray(producto.opciones)) {
        return producto.opciones.some((o) => o.id === op.id);
      }
      return true;
    });
  }, [producto, opcionesCatalogo]);

  // Verificar restricciones mutuamente excluyentes entre opciones seleccionadas
  function estaRestringida(opcionId) {
    if (opcionesSeleccionadas.includes(opcionId)) return false;
    for (const idSel of opcionesSeleccionadas) {
      const opSel = opcionesCatalogo.find((o) => o.id === idSel);
      if (opSel && Array.isArray(opSel.restricciones) && opSel.restricciones.includes(opcionId)) {
        return opSel.nombre;
      }
    }
    return null;
  }

  function toggleOpcion(opcion) {
    if (!opcion.disponible) return;
    const restriccionCon = estaRestringida(opcion.id);
    if (restriccionCon) return;

    if (opcionesSeleccionadas.includes(opcion.id)) {
      setOpcionesSeleccionadas(opcionesSeleccionadas.filter((id) => id !== opcion.id));
    } else {
      setOpcionesSeleccionadas([...opcionesSeleccionadas, opcion.id]);
    }
  }

  // Cálculo del precio unitario y total con extras
  const extrasTotal = opcionesSeleccionadas.reduce((acc, id) => {
    const op = opcionesCatalogo.find((o) => o.id === id);
    return acc + Number(op?.precio_extra || 0);
  }, 0);

  const precioUnitarioConExtras = Number(producto.precio || 0) + extrasTotal;
  const totalItem = precioUnitarioConExtras * cantidad;

  function manejarAgregar() {
    onAgregar({
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      destino: producto.destino,
      precio_unitario: Number(producto.precio || 0),
      cantidad: preparadoSeleccionado ? 1 : cantidad,
      modalidad,
      observacion: observacion.trim() || null,
      opciones: opcionesSeleccionadas,
      opciones_detalle: opcionesSeleccionadas.map((id) => opcionesCatalogo.find((o) => o.id === id)).filter(Boolean),
      subtotal: totalItem,
      es_combo: false,
      es_preparado: !!preparadoSeleccionado,
      preparado_id: preparadoSeleccionado ? preparadoSeleccionado.id : null,
      preparado_minutos: preparadoSeleccionado ? preparadoSeleccionado.minutos_preparado : null,
    });
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
        zIndex: 120,
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.2)',
          maxWidth: '480px',
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* Cabecera con título y botón de cierre */}
        <div
          style={{
            padding: '1rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 800 }}>
              {producto.nombre}
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#718096', marginTop: '0.2rem' }}>
              ${Number(producto.precio || 0).toLocaleString('es-CO')} c/u · <span style={{ fontWeight: 600, color: '#2b6cb0' }}>{producto.destino}</span>
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

        {/* Cuerpo deslizable */}
        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {/* Sección de Producto Preparado (M5a / M7 · CU20, CU21) */}
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: '#2d3748', marginBottom: '0.5rem' }}>
              Platos ya preparados
            </span>
            {preparadoSeleccionado ? (
              <div
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  background: '#f0fff4',
                  border: '1px solid #9ae6b4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#22543d' }}>
                    ✓ Unidad lista seleccionada
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#276749', marginTop: '0.15rem' }}>
                    Preparado hace {preparadoSeleccionado.minutos_preparado} min · Cocina no lo cocinará de nuevo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreparadoSeleccionado(null);
                  }}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #cbd5e0',
                    color: '#c53030',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.35rem 0.6rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMostrarModalPreparado(true)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px dashed #2b6cb0',
                  background: '#ebf8ff',
                  color: '#2b6cb0',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>Usar producto ya preparado</span>
                <span style={{ fontSize: '0.75rem', background: '#2b6cb0', color: '#fff', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                  Consultar M7 ›
                </span>
              </button>
            )}
          </div>

          {/* Selector de Cantidad */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid #edf2f7',
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2d3748' }}>Cantidad</span>
              {preparadoSeleccionado && (
                <span style={{ display: 'block', fontSize: '0.75rem', color: '#2b6cb0', fontWeight: 600 }}>
                  (1 unidad física preparada)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                disabled={Boolean(preparadoSeleccionado)}
                onClick={() => setCantidad((prev) => Math.max(1, prev - 1))}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e0',
                  background: preparadoSeleccionado ? '#edf2f7' : '#f7fafc',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  cursor: preparadoSeleccionado ? 'not-allowed' : 'pointer',
                  color: preparadoSeleccionado ? '#a0aec0' : '#2d3748',
                }}
              >
                −
              </button>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, minWidth: '24px', textAlign: 'center' }}>
                {preparadoSeleccionado ? 1 : cantidad}
              </span>
              <button
                type="button"
                disabled={Boolean(preparadoSeleccionado)}
                onClick={() => setCantidad((prev) => prev + 1)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e0',
                  background: preparadoSeleccionado ? '#edf2f7' : '#f7fafc',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  cursor: preparadoSeleccionado ? 'not-allowed' : 'pointer',
                  color: preparadoSeleccionado ? '#a0aec0' : '#2d3748',
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Selector de Modalidad (Mesa / Llevar / Anticipada) */}
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: '#2d3748', marginBottom: '0.5rem' }}>
              Modalidad de preparación
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setModalidad('MESA')}
                style={{
                  padding: '0.6rem 0.2rem',
                  borderRadius: '6px',
                  border: modalidad === 'MESA' ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
                  background: modalidad === 'MESA' ? '#ebf8ff' : '#ffffff',
                  color: modalidad === 'MESA' ? '#2b6cb0' : '#4a5568',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Mesa
              </button>

              <button
                type="button"
                disabled={!permiteLlevar}
                onClick={() => setModalidad('LLEVAR')}
                style={{
                  padding: '0.6rem 0.2rem',
                  borderRadius: '6px',
                  border: modalidad === 'LLEVAR' ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
                  background: !permiteLlevar ? '#edf2f7' : modalidad === 'LLEVAR' ? '#ebf8ff' : '#ffffff',
                  color: !permiteLlevar ? '#a0aec0' : modalidad === 'LLEVAR' ? '#2b6cb0' : '#4a5568',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: permiteLlevar ? 'pointer' : 'not-allowed',
                }}
              >
                Llevar
              </button>

              <button
                type="button"
                disabled={!permiteAnticipada}
                onClick={() => setModalidad('ANTICIPADA')}
                style={{
                  padding: '0.6rem 0.2rem',
                  borderRadius: '6px',
                  border: modalidad === 'ANTICIPADA' ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
                  background: !permiteAnticipada ? '#edf2f7' : modalidad === 'ANTICIPADA' ? '#ebf8ff' : '#ffffff',
                  color: !permiteAnticipada ? '#a0aec0' : modalidad === 'ANTICIPADA' ? '#2b6cb0' : '#4a5568',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: permiteAnticipada ? 'pointer' : 'not-allowed',
                }}
              >
                Anticipada
              </button>
            </div>
            {!anticipadaActivaArea && (
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#c53030', marginTop: '0.35rem' }}>
                Preparación anticipada desactivada temporalmente por {producto.destino}.
              </span>
            )}
          </div>

          {/* Opciones de Personalización */}
          {opcionesDelProducto.length > 0 && (
            <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: '#2d3748', marginBottom: '0.5rem' }}>
                Opciones y adiciones
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {opcionesDelProducto.map((op) => {
                  const seleccionada = opcionesSeleccionadas.includes(op.id);
                  const restriccionCon = estaRestringida(op.id);
                  const deshabilitada = !op.disponible || Boolean(restriccionCon);

                  return (
                    <div
                      key={op.id}
                      onClick={() => !deshabilitada && toggleOpcion(op)}
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: '6px',
                        border: deshabilitada
                          ? '1px dashed #cbd5e0'
                          : seleccionada
                          ? '2px solid #2b6cb0'
                          : '1px solid #e2e8f0',
                        background: deshabilitada ? '#f7fafc' : seleccionada ? '#ebf8ff' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: deshabilitada ? 'not-allowed' : 'pointer',
                        opacity: deshabilitada ? 0.65 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            border: seleccionada ? '2px solid #2b6cb0' : '2px solid #a0aec0',
                            background: seleccionada ? '#2b6cb0' : '#ffffff',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                          }}
                        >
                          {seleccionada ? '✓' : ''}
                        </span>
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2d3748' }}>
                            {op.nombre}
                          </span>
                          {!op.disponible ? (
                            <div style={{ fontSize: '0.7rem', color: '#c53030' }}>
                              No disponible (deshabilitada por área)
                            </div>
                          ) : restriccionCon ? (
                            <div style={{ fontSize: '0.7rem', color: '#dd6b20' }}>
                              No se combina con {restriccionCon}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {Number(op.precio_extra || 0) > 0 && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2b6cb0' }}>
                          +${Number(op.precio_extra).toLocaleString('es-CO')}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Campo Observación */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="observacion-input"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#2d3748', marginBottom: '0.35rem' }}
            >
              Observación para cocina/bar (opcional)
            </label>
            <input
              id="observacion-input"
              type="text"
              maxLength={200}
              placeholder="Ej.: sin cebolla, aderezo aparte, bien caliente..."
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>

        {/* Barra inferior fija de agregar */}
        <div
          style={{
            padding: '0.85rem 1rem',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
          }}
        >
          <button
            type="button"
            onClick={manejarAgregar}
            style={{
              width: '100%',
              background: '#2b6cb0',
              color: '#ffffff',
              border: 'none',
              padding: '0.85rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(43,108,176,0.3)',
            }}
          >
            Agregar al pedido · ${totalItem.toLocaleString('es-CO')}
          </button>
        </div>
      </div>

      {mostrarModalPreparado && (
        <ElegirPreparadoModal
          producto={producto}
          onSeleccionarPreparado={(unidad) => {
            setPreparadoSeleccionado(unidad);
            setCantidad(1);
            setMostrarModalPreparado(false);
          }}
          onCerrar={() => setMostrarModalPreparado(false)}
        />
      )}
    </div>
  );
}
