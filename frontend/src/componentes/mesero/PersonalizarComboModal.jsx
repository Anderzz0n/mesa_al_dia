import { useState } from 'react';

/**
 * M5b: Modal / Hoja inferior para personalizar un combo compuesto (CU10, CU11, CU14).
 */
export function PersonalizarComboModal({
  combo,
  catalogoProductos = [],
  parametros = {},
  onAgregar,
  onCerrar,
}) {
  const [cantidad, setCantidad] = useState(1);
  const [modalidad, setModalidad] = useState('MESA');
  const [componentesQuitados, setComponentesQuitados] = useState([]);
  const [componentesAnticipados, setComponentesAnticipados] = useState([]);
  const [extrasSeleccionados, setExtrasSeleccionados] = useState({}); // { [prodId]: cantidad }
  const [observacion, setObservacion] = useState('');

  const permiteLlevar = combo.permite_llevar;
  const componentes = Array.isArray(combo.componentes) ? combo.componentes : [];

  // Interruptores de área de preparación anticipada
  const anticipadaCocina = parametros.ANTICIPADA_ACTIVA_COCINA !== 'false';
  const anticipadaBar = parametros.ANTICIPADA_ACTIVA_BAR !== 'false';

  // Toggle de componente removible
  function toggleQuitarComponente(prodId, removible) {
    if (!removible) return;
    if (componentesQuitados.includes(prodId)) {
      setComponentesQuitados(componentesQuitados.filter((id) => id !== prodId));
    } else {
      setComponentesQuitados([...componentesQuitados, prodId]);
      // Si se quita, también se remueve de anticipados
      setComponentesAnticipados(componentesAnticipados.filter((id) => id !== prodId));
    }
  }

  // Toggle de componente anticipado
  function toggleAnticipadaComponente(prodId, destino) {
    if (modalidad === 'LLEVAR') return;
    const activaEnArea = destino === 'COCINA' ? anticipadaCocina : anticipadaBar;
    if (!activaEnArea) return;

    if (componentesAnticipados.includes(prodId)) {
      setComponentesAnticipados(componentesAnticipados.filter((id) => id !== prodId));
    } else {
      setComponentesAnticipados([...componentesAnticipados, prodId]);
    }
  }

  // Modificar cantidad de extra
  function cambiarCantidadExtra(prodId, delta) {
    setExtrasSeleccionados((prev) => {
      const actual = prev[prodId] || 0;
      const nuevo = Math.max(0, actual + delta);
      if (nuevo === 0) {
        const copia = { ...prev };
        delete copia[prodId];
        return copia;
      }
      return { ...prev, [prodId]: nuevo };
    });
  }

  // Opciones de extras disponibles (bebidas y acompañamientos no combos)
  const extrasDisponibles = catalogoProductos.filter(
    (p) => !p.es_combo && p.id !== combo.id && p.disponible
  );

  // Cálculo de total
  const totalExtras = Object.entries(extrasSeleccionados).reduce((acc, [prodId, cant]) => {
    const prod = catalogoProductos.find((p) => p.id === Number(prodId));
    return acc + Number(prod?.precio || 0) * cant;
  }, 0);

  const totalUnitarioCombo = Number(combo.precio || 0) + totalExtras;
  const totalPedido = totalUnitarioCombo * cantidad;

  // Validación de componentes fijos disponibles
  const hayFijoAgotado = componentes.some((c) => !c.removible && !c.disponible);

  function manejarAgregar() {
    if (hayFijoAgotado) return;

    const extrasArray = Object.entries(extrasSeleccionados).map(([prodId, cant]) => {
      const prod = catalogoProductos.find((p) => p.id === Number(prodId));
      return {
        producto_id: Number(prodId),
        nombre: prod?.nombre || 'Extra',
        precio: Number(prod?.precio || 0),
        destino: prod?.destino || 'COCINA',
        cantidad: cant,
      };
    });

    onAgregar({
      producto_id: combo.id,
      producto_nombre: combo.nombre,
      precio_unitario: Number(combo.precio || 0),
      cantidad,
      modalidad,
      observacion: observacion.trim() || null,
      componentes_quitados: componentesQuitados,
      componentes_anticipados: modalidad === 'LLEVAR' ? [] : componentesAnticipados,
      extras: extrasArray,
      subtotal: totalPedido,
      es_combo: true,
      componentes_detalle: componentes,
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
        {/* Cabecera */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 800 }}>
                {combo.nombre}
              </h2>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  background: '#805ad5',
                  color: '#fff',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '4px',
                }}
              >
                COMBO
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#718096', marginTop: '0.2rem' }}>
              ${Number(combo.precio || 0).toLocaleString('es-CO')} c/u
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
          {hayFijoAgotado && (
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
              Este combo contiene un componente principal no disponible. No puede ser ordenado en este momento.
            </div>
          )}

          {/* Cantidad */}
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
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2d3748' }}>Cantidad</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setCantidad((prev) => Math.max(1, prev - 1))}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e0',
                  background: '#f7fafc',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#2d3748',
                }}
              >
                −
              </button>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, minWidth: '24px', textAlign: 'center' }}>
                {cantidad}
              </span>
              <button
                type="button"
                onClick={() => setCantidad((prev) => prev + 1)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e0',
                  background: '#f7fafc',
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#2d3748',
                }}
              >
                +
              </button>
            </div>
          </div>

          {/* Modalidad (Mesa / Llevar) */}
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: '#2d3748', marginBottom: '0.5rem' }}>
              Modalidad del combo
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={() => setModalidad('MESA')}
                style={{
                  padding: '0.6rem',
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
                onClick={() => {
                  setModalidad('LLEVAR');
                  setComponentesAnticipados([]); // En llevar no hay anticipados
                }}
                style={{
                  padding: '0.6rem',
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
            </div>
            {modalidad === 'LLEVAR' && (
              <span style={{ display: 'block', fontSize: '0.75rem', color: '#718096', marginTop: '0.35rem' }}>
                En «Llevar», cada componente usa su empaque individual asignado.
              </span>
            )}
          </div>

          {/* Componentes del combo */}
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: '#2d3748', marginBottom: '0.5rem' }}>
              Incluye · quita lo que no desee
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {componentes.map((c) => {
                const prodId = c.producto_id;
                const estaQuitado = componentesQuitados.includes(prodId) || !c.disponible;
                const esAnticipado = componentesAnticipados.includes(prodId);
                const activaArea = c.destino === 'COCINA' ? anticipadaCocina : anticipadaBar;
                const puedeAnticipar = !estaQuitado && modalidad !== 'LLEVAR' && c.permite_anticipada && activaArea;

                return (
                  <div
                    key={prodId}
                    style={{
                      padding: '0.65rem 0.75rem',
                      borderRadius: '6px',
                      border: !c.disponible
                        ? '1px dashed #cbd5e0'
                        : estaQuitado
                        ? '1px dashed #e2e8f0'
                        : '1px solid #e2e8f0',
                      background: !c.disponible ? '#f7fafc' : estaQuitado ? '#f7fafc' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      opacity: estaQuitado ? 0.75 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      {c.removible && c.disponible ? (
                        <button
                          type="button"
                          onClick={() => toggleQuitarComponente(prodId, true)}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            border: estaQuitado ? '2px solid #a0aec0' : '2px solid #2b6cb0',
                            background: estaQuitado ? '#ffffff' : '#2b6cb0',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {!estaQuitado ? '✓' : ''}
                        </button>
                      ) : (
                        <span
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            background: '#e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            color: '#718096',
                            fontWeight: 800,
                          }}
                        >
                          ●
                        </span>
                      )}

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2d3748' }}>
                            {c.nombre}
                          </span>
                          {!c.removible && (
                            <span style={{ fontSize: '0.65rem', background: '#edf2f7', color: '#4a5568', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                              Fijo
                            </span>
                          )}
                          {estaQuitado && c.disponible && (
                            <span style={{ fontSize: '0.65rem', background: '#feebc8', color: '#744210', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                              Quitado
                            </span>
                          )}
                          {!c.disponible && (
                            <span style={{ fontSize: '0.65rem', background: '#fed7d7', color: '#9b2c2c', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                              No disponible hoy
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#718096' }}>
                          {c.destino} · Cantidad: {c.cantidad}
                        </span>
                      </div>
                    </div>

                    {/* Botón / Chip de Anticipada por componente */}
                    {c.permite_anticipada && (
                      <button
                        type="button"
                        disabled={!puedeAnticipar}
                        onClick={() => toggleAnticipadaComponente(prodId, c.destino)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '12px',
                          border: esAnticipado ? '1px solid #2b6cb0' : '1px solid #cbd5e0',
                          background: !puedeAnticipar ? '#edf2f7' : esAnticipado ? '#ebf8ff' : '#ffffff',
                          color: !puedeAnticipar ? '#a0aec0' : esAnticipado ? '#2b6cb0' : '#718096',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: puedeAnticipar ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Anticipada
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <span style={{ display: 'block', fontSize: '0.75rem', color: '#718096', marginTop: '0.4rem' }}>
              «Anticipada» se define por componente (sale antes que el resto del pedido).
            </span>
          </div>

          {/* Extras Opcionales */}
          {extrasDisponibles.length > 0 && (
            <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #edf2f7' }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: '0.95rem', color: '#2d3748', marginBottom: '0.5rem' }}>
                Extras (se cobran aparte)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {extrasDisponibles.slice(0, 4).map((extra) => {
                  const cantExtra = extrasSeleccionados[extra.id] || 0;
                  return (
                    <div
                      key={extra.id}
                      style={{
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2d3748' }}>
                          {extra.nombre}
                        </span>
                        <div style={{ fontSize: '0.75rem', color: '#2b6cb0', fontWeight: 700 }}>
                          +${Number(extra.precio).toLocaleString('es-CO')}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => cambiarCantidadExtra(extra.id, -1)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e0',
                            background: '#f7fafc',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800, minWidth: '18px', textAlign: 'center' }}>
                          {cantExtra}
                        </span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidadExtra(extra.id, 1)}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e0',
                            background: '#f7fafc',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Observación */}
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="combo-obs-input"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#2d3748', marginBottom: '0.35rem' }}
            >
              Observación para cocina/bar (opcional)
            </label>
            <input
              id="combo-obs-input"
              type="text"
              maxLength={200}
              placeholder="Ej.: salsas por separado..."
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

        {/* Botón Agregar al pedido */}
        <div
          style={{
            padding: '0.85rem 1rem',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff',
          }}
        >
          <button
            type="button"
            disabled={hayFijoAgotado}
            onClick={manejarAgregar}
            style={{
              width: '100%',
              background: hayFijoAgotado ? '#a0aec0' : '#2b6cb0',
              color: '#ffffff',
              border: 'none',
              padding: '0.85rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: hayFijoAgotado ? 'not-allowed' : 'pointer',
              boxShadow: hayFijoAgotado ? 'none' : '0 2px 4px rgba(43,108,176,0.3)',
            }}
          >
            {hayFijoAgotado ? 'No disponible para ordenar' : `Agregar al pedido · $${totalPedido.toLocaleString('es-CO')}`}
          </button>
        </div>
      </div>
    </div>
  );
}
