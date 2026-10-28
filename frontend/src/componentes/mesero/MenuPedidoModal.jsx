import { useState, useMemo } from 'react';

/**
 * M4: Menú móvil para tomar pedido (CU10, CU23, RF3).
 */
export function MenuPedidoModal({
  cuenta,
  categorias = [],
  productos = [],
  itemsPedidoEnCurso = [],
  onSeleccionarProducto,
  onVerResumen,
  onVolver,
}) {
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  // Filtrado de productos por categoría y término de búsqueda
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (categoriaSeleccionada !== 'todos') {
        if (categoriaSeleccionada === 'recomendados') {
          // Si es recomendados, mostrar combos y productos destacados
          if (!p.es_combo && p.categoria_id !== 2) return false;
        } else if (String(p.categoria_id) !== String(categoriaSeleccionada)) {
          return false;
        }
      }
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincideNombre = p.nombre.toLowerCase().includes(q);
        const coincideDesc = p.descripcion ? p.descripcion.toLowerCase().includes(q) : false;
        if (!coincideNombre && !coincideDesc) return false;
      }
      return true;
    });
  }, [productos, categoriaSeleccionada, busqueda]);

  const totalItemsEnCurso = itemsPedidoEnCurso.reduce((acc, i) => acc + i.cantidad, 0);
  const subtotalEnCurso = itemsPedidoEnCurso.reduce((acc, i) => acc + i.subtotal, 0);

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
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <button
          type="button"
          onClick={onVolver}
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
          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Tomar pedido</h1>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
            Mesa {cuenta.mesa_numero} · {cuenta.etiqueta}
          </span>
        </div>
      </header>

      {/* Buscador */}
      <div style={{ padding: '0.75rem 1rem 0.25rem 1rem' }}>
        <input
          type="text"
          placeholder="Buscar producto..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{
            width: '100%',
            padding: '0.55rem 0.75rem',
            borderRadius: '20px',
            border: '1px solid #cbd5e0',
            fontSize: '0.85rem',
            background: '#ffffff',
          }}
        />
      </div>

      {/* Chips de Categorías */}
      <div
        style={{
          display: 'flex',
          gap: '0.4rem',
          overflowX: 'auto',
          padding: '0.5rem 1rem',
          whiteSpace: 'nowrap',
        }}
      >
        <button
          type="button"
          onClick={() => setCategoriaSeleccionada('todos')}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '16px',
            border: categoriaSeleccionada === 'todos' ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
            background: categoriaSeleccionada === 'todos' ? '#ebf8ff' : '#ffffff',
            color: categoriaSeleccionada === 'todos' ? '#2b6cb0' : '#4a5568',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Todos
        </button>

        <button
          type="button"
          onClick={() => setCategoriaSeleccionada('recomendados')}
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '16px',
            border: categoriaSeleccionada === 'recomendados' ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
            background: categoriaSeleccionada === 'recomendados' ? '#ebf8ff' : '#ffffff',
            color: categoriaSeleccionada === 'recomendados' ? '#2b6cb0' : '#4a5568',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Recomendados
        </button>

        {categorias.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoriaSeleccionada(cat.id)}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '16px',
              border: String(categoriaSeleccionada) === String(cat.id) ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
              background: String(categoriaSeleccionada) === String(cat.id) ? '#ebf8ff' : '#ffffff',
              color: String(categoriaSeleccionada) === String(cat.id) ? '#2b6cb0' : '#4a5568',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {cat.nombre}
          </button>
        ))}
      </div>

      {/* Lista de productos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 1rem' }}>
        {productosFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#a0aec0', marginTop: '2rem', fontSize: '0.9rem' }}>
            No se encontraron productos en esta categoría o búsqueda.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {productosFiltrados.map((prod) => {
              const estaAgotado = !prod.disponible;
              const tieneControlStock = prod.stock_cantidad !== null && prod.stock_cantidad !== undefined;

              return (
                <div
                  key={prod.id}
                  onClick={() => !estaAgotado && onSeleccionarProducto(prod)}
                  style={{
                    background: estaAgotado ? '#f7fafc' : '#ffffff',
                    border: estaAgotado ? '1px dashed #cbd5e0' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: estaAgotado ? 'not-allowed' : 'pointer',
                    opacity: estaAgotado ? 0.6 : 1,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ flex: 1, paddingRight: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1a202c' }}>
                        {prod.nombre}
                      </span>
                      {prod.es_combo ? (
                        <span style={{ fontSize: '0.65rem', background: '#805ad5', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>
                          COMBO
                        </span>
                      ) : prod.destino ? (
                        <span style={{ fontSize: '0.65rem', background: '#edf2f7', color: '#4a5568', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>
                          {prod.destino}
                        </span>
                      ) : null}

                      {estaAgotado ? (
                        <span style={{ fontSize: '0.65rem', background: '#fed7d7', color: '#9b2c2c', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>
                          Agotado
                        </span>
                      ) : tieneControlStock ? (
                        <span style={{ fontSize: '0.65rem', background: '#feebc8', color: '#744210', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>
                          Quedan {prod.stock_cantidad}
                        </span>
                      ) : null}
                    </div>

                    {prod.descripcion && (
                      <p style={{ margin: '0.2rem 0', fontSize: '0.75rem', color: '#718096', lineHeight: 1.3 }}>
                        {prod.descripcion}
                      </p>
                    )}

                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#2b6cb0' }}>
                      ${Number(prod.precio || 0).toLocaleString('es-CO')}
                    </span>
                  </div>

                  {/* Botón '+' de añadir */}
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: estaAgotado ? '#edf2f7' : '#ebf8ff',
                      color: estaAgotado ? '#a0aec0' : '#2b6cb0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    +
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de pedido en curso */}
      {totalItemsEnCurso > 0 && (
        <div
          style={{
            background: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            padding: '0.85rem 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 -2px 6px rgba(0,0,0,0.06)',
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1a202c' }}>
              Pedido en curso
            </div>
            <div style={{ fontSize: '0.8rem', color: '#718096' }}>
              {totalItemsEnCurso} {totalItemsEnCurso === 1 ? 'ítem' : 'ítems'} · ${subtotalEnCurso.toLocaleString('es-CO')}
            </div>
          </div>

          <button
            type="button"
            onClick={onVerResumen}
            style={{
              background: '#2b6cb0',
              color: '#ffffff',
              border: 'none',
              padding: '0.65rem 1.25rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Ver pedido ›
          </button>
        </div>
      )}
    </div>
  );
}
