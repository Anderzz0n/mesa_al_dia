import { useState } from 'react';
import { enviarPedido } from '../../api.js';

/**
 * M6: Resumen y confirmación de envío del pedido móvil (CU25 / RF12).
 */
export function ResumenPedidoModal({
  cuenta,
  itemsPedido = [],
  catalogoProductos = [],
  onActualizarItems,
  onPedidoEnviado,
  onVolverMenu,
}) {
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  // Verificar si algún ítem seleccionado se agotó en tiempo real
  const itemsConEstado = itemsPedido.map((item, index) => {
    const prodCatalogo = catalogoProductos.find((p) => p.id === item.producto_id);
    const estaAgotado = prodCatalogo ? !prodCatalogo.disponible : false;
    return {
      ...item,
      indice: index,
      estaAgotado,
    };
  });

  const hayItemsAgotados = itemsConEstado.some((i) => i.estaAgotado);

  // Agrupación por destino
  const itemsCocina = itemsConEstado.filter((i) => !i.es_combo && i.destino === 'COCINA');
  const itemsBar = itemsConEstado.filter((i) => !i.es_combo && i.destino === 'BAR');
  const itemsCombos = itemsConEstado.filter((i) => i.es_combo);

  // Cálculo del total general
  const totalPedido = itemsConEstado.reduce((acc, i) => acc + (i.estaAgotado ? 0 : i.subtotal), 0);

  function cambiarCantidad(indice, delta) {
    const nuevos = [...itemsPedido];
    const actual = nuevos[indice];
    const nuevaCant = actual.cantidad + delta;
    if (nuevaCant <= 0) {
      quitarItem(indice);
      return;
    }
    const precioUnit = actual.subtotal / actual.cantidad;
    nuevos[indice] = {
      ...actual,
      cantidad: nuevaCant,
      subtotal: precioUnit * nuevaCant,
    };
    onActualizarItems(nuevos);
  }

  function quitarItem(indice) {
    const nuevos = itemsPedido.filter((_, i) => i !== indice);
    onActualizarItems(nuevos);
    if (nuevos.length === 0) {
      onVolverMenu();
    }
  }

  async function ejecutarEnvio() {
    if (itemsPedido.length === 0 || hayItemsAgotados || enviando) return;
    setEnviando(true);
    setErrorEnvio(null);

    try {
      // Formatear items para el backend conforme a RF12
      const itemsPayload = itemsPedido.map((it) => {
        if (!it.es_combo) {
          return {
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            modalidad: it.modalidad,
            observacion: it.observacion,
            opciones: it.opciones || [],
          };
        } else {
          return {
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            modalidad: it.modalidad,
            observacion: it.observacion,
            componentes_quitados: it.componentes_quitados || [],
            componentes_anticipados: it.componentes_anticipados || [],
            extras: (it.extras || []).map((e) => ({
              producto_id: e.producto_id,
              cantidad: e.cantidad,
            })),
          };
        }
      });

      const resultado = await enviarPedido(cuenta.id, { items: itemsPayload });
      onPedidoEnviado(resultado);
    } catch (err) {
      setErrorEnvio(err.message || 'Error al enviar pedido a preparación');
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
        zIndex: 130,
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
          onClick={onVolverMenu}
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
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Resumen del pedido</h1>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            Mesa {cuenta.mesa_numero} · {cuenta.etiqueta}
          </span>
        </div>
      </header>

      {/* Contenido */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {errorEnvio && (
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
            {errorEnvio}
          </div>
        )}

        {hayItemsAgotados && (
          <div
            style={{
              background: '#fffaf0',
              border: '1px solid #fbd38d',
              color: '#c05621',
              padding: '0.75rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Uno o más productos se agotaron mientras armaba el pedido. Quítelos para poder enviar.
          </div>
        )}

        {/* Grupo Cocina */}
        {itemsCocina.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.9rem', color: '#4a5568', textTransform: 'uppercase', margin: '0 0 0.5rem 0', fontWeight: 700 }}>
              Va a Cocina ({itemsCocina.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {itemsCocina.map((item) => (
                <div
                  key={item.indice}
                  style={{
                    background: item.estaAgotado ? '#f7fafc' : '#ffffff',
                    border: item.estaAgotado ? '1px dashed #e53e3e' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a202c' }}>
                        {item.cantidad}× {item.producto_nombre}
                      </span>
                      {item.estaAgotado && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', background: '#fed7d7', color: '#9b2c2c', padding: '0.1rem 0.3rem', borderRadius: '3px', fontWeight: 700 }}>
                          Agotado
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, color: '#2b6cb0' }}>
                      ${item.subtotal.toLocaleString('es-CO')}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#718096', margin: '0.25rem 0' }}>
                    <span style={{ fontWeight: 600, color: '#4a5568' }}>{item.modalidad}</span>
                    {item.opciones_detalle && item.opciones_detalle.length > 0 && (
                      <span> · {item.opciones_detalle.map((o) => o.nombre).join(', ')}</span>
                    )}
                    {item.observacion && <span> · «{item.observacion}»</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(item.indice, -1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e0',
                          background: '#f7fafc',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: 800, minWidth: '16px', textAlign: 'center', fontSize: '0.85rem' }}>
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(item.indice, 1)}
                        style={{
                          width: '26px',
                          height: '26px',
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

                    <button
                      type="button"
                      onClick={() => quitarItem(item.indice)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e53e3e',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grupo Bar */}
        {itemsBar.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.9rem', color: '#4a5568', textTransform: 'uppercase', margin: '0 0 0.5rem 0', fontWeight: 700 }}>
              Va a Bar ({itemsBar.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {itemsBar.map((item) => (
                <div
                  key={item.indice}
                  style={{
                    background: item.estaAgotado ? '#f7fafc' : '#ffffff',
                    border: item.estaAgotado ? '1px dashed #e53e3e' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a202c' }}>
                        {item.cantidad}× {item.producto_nombre}
                      </span>
                      {item.estaAgotado && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', background: '#fed7d7', color: '#9b2c2c', padding: '0.1rem 0.3rem', borderRadius: '3px', fontWeight: 700 }}>
                          Agotado
                        </span>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, color: '#2b6cb0' }}>
                      ${item.subtotal.toLocaleString('es-CO')}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#718096', margin: '0.25rem 0' }}>
                    <span style={{ fontWeight: 600, color: '#4a5568' }}>{item.modalidad}</span>
                    {item.opciones_detalle && item.opciones_detalle.length > 0 && (
                      <span> · {item.opciones_detalle.map((o) => o.nombre).join(', ')}</span>
                    )}
                    {item.observacion && <span> · «{item.observacion}»</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(item.indice, -1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e0',
                          background: '#f7fafc',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: 800, minWidth: '16px', textAlign: 'center', fontSize: '0.85rem' }}>
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(item.indice, 1)}
                        style={{
                          width: '26px',
                          height: '26px',
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

                    <button
                      type="button"
                      onClick={() => quitarItem(item.indice)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e53e3e',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grupo Combos */}
        {itemsCombos.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h2 style={{ fontSize: '0.9rem', color: '#4a5568', textTransform: 'uppercase', margin: '0 0 0.5rem 0', fontWeight: 700 }}>
              Combos (Cocina y Bar) ({itemsCombos.length})
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {itemsCombos.map((item) => (
                <div
                  key={item.indice}
                  style={{
                    background: item.estaAgotado ? '#f7fafc' : '#ffffff',
                    border: item.estaAgotado ? '1px dashed #e53e3e' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a202c' }}>
                        {item.cantidad}× {item.producto_nombre}
                      </span>
                    </div>
                    <span style={{ fontWeight: 700, color: '#2b6cb0' }}>
                      ${item.subtotal.toLocaleString('es-CO')}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#718096', margin: '0.25rem 0' }}>
                    <span style={{ fontWeight: 600, color: '#4a5568' }}>{item.modalidad}</span>
                    {item.componentes_quitados?.length > 0 && (
                      <span> · Sin {item.componentes_quitados.length} componente(s)</span>
                    )}
                    {item.componentes_anticipados?.length > 0 && (
                      <span style={{ color: '#2b6cb0', fontWeight: 600 }}> · Con anticipada(s)</span>
                    )}
                    {item.extras?.length > 0 && (
                      <span> · +{item.extras.length} extra(s)</span>
                    )}
                    {item.observacion && <span> · «{item.observacion}»</span>}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(item.indice, -1)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          border: '1px solid #cbd5e0',
                          background: '#f7fafc',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        −
                      </button>
                      <span style={{ fontWeight: 800, minWidth: '16px', textAlign: 'center', fontSize: '0.85rem' }}>
                        {item.cantidad}
                      </span>
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(item.indice, 1)}
                        style={{
                          width: '26px',
                          height: '26px',
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

                    <button
                      type="button"
                      onClick={() => quitarItem(item.indice)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#e53e3e',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tarjeta suave explicativa de división de comandas */}
        <div
          style={{
            background: '#ebf8ff',
            border: '1px solid #bee3f8',
            borderRadius: '6px',
            padding: '0.75rem',
            fontSize: '0.8rem',
            color: '#2b6cb0',
            lineHeight: 1.4,
          }}
        >
          Se crearán comandas separadas: <strong>Cocina</strong> y <strong>Bar</strong>. Lo marcado como «Anticipada» va en cola prioritaria.
        </div>
      </div>

      {/* Barra inferior fija de envío */}
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
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#4a5568' }}>Total del pedido</span>
          <span style={{ fontWeight: 800, fontSize: '1.25rem', color: '#2b6cb0' }}>
            ${totalPedido.toLocaleString('es-CO')}
          </span>
        </div>

        <button
          type="button"
          disabled={hayItemsAgotados || enviando || itemsPedido.length === 0}
          onClick={ejecutarEnvio}
          style={{
            width: '100%',
            background: hayItemsAgotados || itemsPedido.length === 0 ? '#a0aec0' : '#2b6cb0',
            color: '#ffffff',
            border: 'none',
            padding: '0.85rem',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 800,
            cursor: hayItemsAgotados || itemsPedido.length === 0 || enviando ? 'not-allowed' : 'pointer',
          }}
        >
          {enviando ? 'Enviando a comanda...' : 'Enviar pedido'}
        </button>

        <span
          style={{
            display: 'block',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#718096',
            marginTop: '0.4rem',
          }}
        >
          Se envía completo o no se envía nada.
        </span>
      </div>
    </div>
  );
}
