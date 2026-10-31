import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  obtenerCategorias,
  obtenerProductos,
  obtenerOpciones,
  crearProducto,
  actualizarProducto,
  crearOpcion,
  actualizarOpcion,
  obtenerRestriccionesOpciones,
  crearRestriccionOpcion,
  eliminarRestriccionOpcion,
  actualizarDisponibilidadProducto,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

export default function AdminMenu() {
  const [subtab, setSubtab] = useState('productos'); // 'productos' | 'opciones'
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [restricciones, setRestricciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);

  // Filtros de productos
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [filtroDestino, setFiltroDestino] = useState('TODOS');
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS');

  // Filtro de opciones
  const [busquedaOpcion, setBusquedaOpcion] = useState('');

  // Modal Producto / Combo (A3b)
  const [modalProducto, setModalProducto] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null); // null = nuevo
  const [tipoItem, setTipoItem] = useState('INDIVIDUAL'); // 'INDIVIDUAL' | 'COMBO'
  const [formNombre, setFormNombre] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formCategoriaId, setFormCategoriaId] = useState('');
  const [formPrecio, setFormPrecio] = useState('');
  const [formDestino, setFormDestino] = useState('COCINA');
  const [formStock, setFormStock] = useState('50');
  const [formLlevar, setFormLlevar] = useState(true);
  const [formAnticipada, setFormAnticipada] = useState(true);
  const [formDisponible, setFormDisponible] = useState(true);
  const [formOpcionesIds, setFormOpcionesIds] = useState([]);
  const [formComponentes, setFormComponentes] = useState([]); // [{ producto_id, cantidad, removible }]

  // Modal Opción (A3c)
  const [modalOpcion, setModalOpcion] = useState(false);
  const [opcionEditando, setOpcionEditando] = useState(null);
  const [formOpNombre, setFormOpNombre] = useState('');
  const [formOpTipo, setFormOpTipo] = useState('PREFERENCIA');
  const [formOpPrecioExtra, setFormOpPrecioExtra] = useState('0');

  // Modal Restricción / Incompatibilidad (A3c)
  const [modalRestriccion, setModalRestriccion] = useState(false);
  const [formRestrOpA, setFormRestrOpA] = useState('');
  const [formRestrOpB, setFormRestrOpB] = useState('');
  const [formRestrMotivo, setFormRestrMotivo] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState(null);

  const cargarDatos = useCallback(async () => {
    try {
      setError(null);
      const [cats, prods, ops, restrs] = await Promise.all([
        obtenerCategorias(),
        obtenerProductos(),
        obtenerOpciones(),
        obtenerRestriccionesOpciones().catch(() => []),
      ]);
      setCategorias(cats || []);
      setProductos(prods || []);
      setOpciones(ops || []);
      setRestricciones(restrs || []);
    } catch (err) {
      setError(err.message || 'Error al cargar catálogo de menú');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (activo) await cargarDatos();
    })();

    const socket = conectarTiempoReal();
    const manejarDisponibilidadProducto = (data) => {
      setProductos((prev) =>
        prev.map((p) => {
          if (p.id === data.producto_id) {
            return {
              ...p,
              disponible: data.disponible !== undefined ? data.disponible : p.disponible,
              disponible_calculado:
                data.disponible_calculado !== undefined
                  ? data.disponible_calculado
                  : data.disponible,
              stock_cantidad:
                data.stock_cantidad !== undefined ? data.stock_cantidad : p.stock_cantidad,
              permite_anticipada:
                data.permite_anticipada !== undefined
                  ? data.permite_anticipada
                  : p.permite_anticipada,
            };
          }
          return p;
        })
      );
    };

    const manejarDisponibilidadOpcion = (data) => {
      setOpciones((prev) =>
        prev.map((o) => (o.id === data.opcion_id ? { ...o, disponible: data.disponible } : o))
      );
    };

    const manejarRestriccionCreada = (nueva) => {
      setRestricciones((prev) => {
        if (prev.some((r) => r.opcion_a_id === nueva.opcion_a_id && r.opcion_b_id === nueva.opcion_b_id)) return prev;
        return [...prev, nueva];
      });
    };

    const manejarRestriccionEliminada = (data) => {
      setRestricciones((prev) =>
        prev.filter(
          (r) => !(r.opcion_a_id === data.opcion_a_id && r.opcion_b_id === data.opcion_b_id)
        )
      );
    };

    const manejarOpcionCreada = (nueva) => {
      setOpciones((prev) => {
        if (prev.some((o) => o.id === nueva.id)) return prev;
        return [...prev, nueva];
      });
    };

    socket.on('producto.disponibilidad', manejarDisponibilidadProducto);
    socket.on('opcion.disponibilidad', manejarDisponibilidadOpcion);
    socket.on('restriccion.creada', manejarRestriccionCreada);
    socket.on('restriccion.eliminada', manejarRestriccionEliminada);
    socket.on('opcion.creada', manejarOpcionCreada);

    return () => {
      activo = false;
      socket.off('producto.disponibilidad', manejarDisponibilidadProducto);
      socket.off('opcion.disponibilidad', manejarDisponibilidadOpcion);
      socket.off('restriccion.creada', manejarRestriccionCreada);
      socket.off('restriccion.eliminada', manejarRestriccionEliminada);
      socket.off('opcion.creada', manejarOpcionCreada);
    };
  }, [cargarDatos]);

  const mostrarExito = (texto) => {
    setMensajeExito(texto);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  // Filtrado de productos
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (busquedaProducto.trim()) {
        const q = busquedaProducto.trim().toLowerCase();
        const coincide =
          p.nombre.toLowerCase().includes(q) ||
          (p.descripcion && p.descripcion.toLowerCase().includes(q));
        if (!coincide) return false;
      }
      if (filtroDestino !== 'TODOS') {
        if (filtroDestino === 'COMBO') {
          if (!p.es_combo) return false;
        } else if (p.destino !== filtroDestino) {
          return false;
        }
      }
      if (filtroCategoria !== 'TODAS') {
        if (p.categoria_id !== Number(filtroCategoria)) return false;
      }
      return true;
    });
  }, [productos, busquedaProducto, filtroDestino, filtroCategoria]);

  // Filtrado de opciones
  const opcionesFiltradas = useMemo(() => {
    return opciones.filter((o) => {
      if (busquedaOpcion.trim()) {
        const q = busquedaOpcion.trim().toLowerCase();
        return o.nombre.toLowerCase().includes(q) || (o.tipo && o.tipo.toLowerCase().includes(q));
      }
      return true;
    });
  }, [opciones, busquedaOpcion]);

  // Abrir modal nuevo producto
  const abrirNuevoProducto = () => {
    setProductoEditando(null);
    setTipoItem('INDIVIDUAL');
    setFormNombre('');
    setFormDescripcion('');
    setFormCategoriaId(categorias[0]?.id?.toString() || '');
    setFormPrecio('');
    setFormDestino('COCINA');
    setFormStock('50');
    setFormLlevar(true);
    setFormAnticipada(true);
    setFormDisponible(true);
    setFormOpcionesIds([]);
    setFormComponentes([]);
    setErrorModal(null);
    setModalProducto(true);
  };

  // Abrir modal editar producto o combo
  const abrirEditarProducto = (prod) => {
    setProductoEditando(prod);
    setTipoItem(prod.es_combo ? 'COMBO' : 'INDIVIDUAL');
    setFormNombre(prod.nombre || '');
    setFormDescripcion(prod.descripcion || '');
    setFormCategoriaId(prod.categoria_id ? prod.categoria_id.toString() : '');
    setFormPrecio(prod.precio ? prod.precio.toString() : '');
    setFormDestino(prod.destino || 'COCINA');
    setFormStock(
      prod.stock_cantidad !== null && prod.stock_cantidad !== undefined
        ? prod.stock_cantidad.toString()
        : ''
    );
    setFormLlevar(Boolean(prod.permite_llevar));
    setFormAnticipada(Boolean(prod.permite_anticipada));
    setFormDisponible(Boolean(prod.disponible));
    setFormOpcionesIds((prod.opciones || []).map((o) => o.id));
    setFormComponentes(
      (prod.componentes || []).map((c) => ({
        producto_id: c.producto_id,
        cantidad: c.cantidad || 1,
        removible: c.removible !== false,
      }))
    );
    setErrorModal(null);
    setModalProducto(true);
  };

  // Guardar Producto o Combo
  const guardarProducto = async (e) => {
    e.preventDefault();
    setErrorModal(null);

    const nom = formNombre.trim();
    if (!nom) {
      setErrorModal('El nombre del producto es obligatorio');
      return;
    }
    const prec = Number(formPrecio);
    if (isNaN(prec) || prec < 0) {
      setErrorModal('El precio debe ser un número mayor o igual a 0');
      return;
    }
    const catId = Number(formCategoriaId);
    if (!catId) {
      setErrorModal('Selecciona una categoría válida');
      return;
    }

    if (tipoItem === 'COMBO' && formComponentes.length === 0) {
      setErrorModal('Un combo debe tener al menos un componente incluido');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: nom,
        descripcion: formDescripcion.trim() || null,
        categoria_id: catId,
        precio: prec,
        es_combo: tipoItem === 'COMBO',
        destino: tipoItem === 'COMBO' ? null : formDestino,
        stock_cantidad: tipoItem === 'COMBO' ? null : formStock !== '' ? Number(formStock) : null,
        permite_llevar: formLlevar,
        permite_anticipada: tipoItem === 'COMBO' ? false : formAnticipada,
        disponible: formDisponible,
        opciones_ids: tipoItem === 'COMBO' ? [] : formOpcionesIds,
        componentes: tipoItem === 'COMBO' ? formComponentes : [],
      };

      if (productoEditando) {
        await actualizarProducto(productoEditando.id, payload);
        mostrarExito(`Producto "${nom}" actualizado exitosamente`);
      } else {
        await crearProducto(payload);
        mostrarExito(`Producto "${nom}" creado exitosamente`);
      }

      setModalProducto(false);
      await cargarDatos();
    } catch (err) {
      setErrorModal(err.message || 'Error al guardar el producto');
    } finally {
      setGuardando(false);
    }
  };

  // Alternar disponibilidad rápida de producto
  const alternarDisponibilidad = async (prod) => {
    const nuevoValor = !prod.disponible;
    try {
      setError(null);
      await actualizarDisponibilidadProducto(prod.id, nuevoValor);
      setProductos((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, disponible: nuevoValor } : p))
      );
      mostrarExito(`Disponibilidad de "${prod.nombre}" actualizada`);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la disponibilidad');
    }
  };

  // Alternar disponibilidad de opción
  const alternarOpcion = async (op) => {
    const nuevoValor = !op.disponible;
    try {
      setError(null);
      await actualizarOpcion(op.id, { disponible: nuevoValor });
      setOpciones((prev) =>
        prev.map((o) => (o.id === op.id ? { ...o, disponible: nuevoValor } : o))
      );
      mostrarExito(`Opción "${op.nombre}" ${nuevoValor ? 'activada' : 'desactivada'}`);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la disponibilidad de la opción');
    }
  };

  // Guardar Opción
  const guardarOpcion = async (e) => {
    e.preventDefault();
    setErrorModal(null);
    const nom = formOpNombre.trim();
    if (!nom) {
      setErrorModal('El nombre de la opción es obligatorio');
      return;
    }
    const extra = Number(formOpPrecioExtra);
    if (isNaN(extra) || extra < 0) {
      setErrorModal('El precio extra debe ser un valor mayor o igual a 0');
      return;
    }

    setGuardando(true);
    try {
      if (opcionEditando) {
        await actualizarOpcion(opcionEditando.id, {
          nombre: nom,
          tipo: formOpTipo,
          precio_extra: extra,
        });
        mostrarExito(`Opción "${nom}" actualizada exitosamente`);
      } else {
        await crearOpcion({
          nombre: nom,
          tipo: formOpTipo,
          precio_extra: extra,
        });
        mostrarExito(`Opción "${nom}" creada en el catálogo único`);
      }
      setModalOpcion(false);
      await cargarDatos();
    } catch (err) {
      setErrorModal(err.message || 'Error al guardar la opción');
    } finally {
      setGuardando(false);
    }
  };

  // Abrir modal de nueva restricción
  const abrirNuevaRestriccion = () => {
    setErrorModal(null);
    if (opciones.length < 2) {
      setError('Se requieren al menos dos opciones en el catálogo para definir una regla de incompatibilidad');
      return;
    }
    const opA = opciones[0].id.toString();
    const opB = opciones[1].id.toString();
    setFormRestrOpA(opA);
    setFormRestrOpB(opB);
    setFormRestrMotivo('');
    setModalRestriccion(true);
  };

  // Guardar Restricción
  const guardarRestriccion = async (e) => {
    e.preventDefault();
    setErrorModal(null);
    const a = Number(formRestrOpA);
    const b = Number(formRestrOpB);

    if (!a || !b) {
      setErrorModal('Debe seleccionar ambas opciones');
      return;
    }
    if (a === b) {
      setErrorModal('Las dos opciones deben ser diferentes');
      return;
    }

    setGuardando(true);
    try {
      await crearRestriccionOpcion({
        opcion_a_id: a,
        opcion_b_id: b,
        motivo: formRestrMotivo.trim() || undefined,
      });
      mostrarExito('Regla de incompatibilidad registrada exitosamente');
      setModalRestriccion(false);
      await cargarDatos();
    } catch (err) {
      setErrorModal(err.message || 'Error al registrar la restricción');
    } finally {
      setGuardando(false);
    }
  };

  // Eliminar Restricción
  const eliminarRestriccion = async (r) => {
    const seguro = window.confirm(
      `¿Desea quitar la incompatibilidad entre "${r.opcion_a_nombre}" y "${r.opcion_b_nombre}"?`
    );
    if (!seguro) return;

    try {
      setError(null);
      await eliminarRestriccionOpcion(r.opcion_a_id, r.opcion_b_id);
      setRestricciones((prev) =>
        prev.filter((item) => !(item.opcion_a_id === r.opcion_a_id && item.opcion_b_id === r.opcion_b_id))
      );
      mostrarExito('Regla de incompatibilidad eliminada');
      await cargarDatos();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la restricción');
    }
  };

  // Componentes de combo helpers
  const agregarComponenteCombo = () => {
    const primerIndividual = productos.find((p) => !p.es_combo);
    if (!primerIndividual) return;
    setFormComponentes((prev) => [
      ...prev,
      { producto_id: primerIndividual.id, cantidad: 1, removible: true },
    ]);
  };

  const actualizarComponenteCombo = (idx, campo, valor) => {
    setFormComponentes((prev) => {
      const copia = [...prev];
      copia[idx] = { ...copia[idx], [campo]: valor };
      return copia;
    });
  };

  const quitarComponenteCombo = (idx) => {
    setFormComponentes((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Mensajes de alerta y confirmación */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            color: '#c53030',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            fontSize: '0.9rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#c53030',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {mensajeExito && (
        <div
          role="status"
          style={{
            background: '#f0fff4',
            border: '1px solid #9ae6b4',
            color: '#22543d',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            fontSize: '0.9rem',
          }}
        >
          {mensajeExito}
        </div>
      )}

      {/* Cabecera de la sección (A3a & A3c) */}
      <div
        style={{
          background: '#fff',
          padding: '1.25rem 1.5rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#1a202c', fontWeight: 700 }}>
              Catálogo de menú y precios
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#718096', marginTop: '0.2rem' }}>
              Gestión de productos, combos compuestos, stock por área y personalización (RF3, RF9)
            </div>
          </div>

          <div>
            {subtab === 'productos' ? (
              <button
                type="button"
                onClick={abrirNuevoProducto}
                style={{
                  background: '#3182ce',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.1rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                }}
              >
                + Nuevo producto o combo
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={abrirNuevaRestriccion}
                  style={{
                    background: '#edf2f7',
                    color: '#2d3748',
                    border: '1px solid #cbd5e0',
                    padding: '0.55rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  + Nueva restricción
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpcionEditando(null);
                    setFormOpNombre('');
                    setFormOpTipo('PREFERENCIA');
                    setFormOpPrecioExtra('0');
                    setErrorModal(null);
                    setModalOpcion(true);
                  }}
                  style={{
                    background: '#3182ce',
                    color: '#fff',
                    border: 'none',
                    padding: '0.55rem 1.1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                  }}
                >
                  + Nueva opción
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Subpestañas estilo Wireframe A3a / A3c */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #edf2f7', paddingTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => setSubtab('productos')}
            style={{
              padding: '0.5rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: subtab === 'productos' ? '3px solid #3182ce' : '3px solid transparent',
              fontWeight: subtab === 'productos' ? 700 : 500,
              color: subtab === 'productos' ? '#2b6cb0' : '#4a5568',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Productos y combos ({productos.length})
          </button>
          <button
            type="button"
            onClick={() => setSubtab('opciones')}
            style={{
              padding: '0.5rem 1rem',
              background: 'none',
              border: 'none',
              borderBottom: subtab === 'opciones' ? '3px solid #3182ce' : '3px solid transparent',
              fontWeight: subtab === 'opciones' ? 700 : 500,
              color: subtab === 'opciones' ? '#2b6cb0' : '#4a5568',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            Opciones y restricciones ({opciones.length})
          </button>
        </div>
      </div>

      {/* Contenido Subtab 1: Productos y Combos (A3a) */}
      {subtab === 'productos' && (
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Barra de Filtros */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              background: '#f7fafc',
              borderBottom: '1px solid #edf2f7',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div style={{ flex: '1 1 240px' }}>
              <input
                type="text"
                placeholder="Buscar por nombre o descripción…"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  background: '#fff',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>
                Destino:
              </label>
              <select
                value={filtroDestino}
                onChange={(e) => setFiltroDestino(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  background: '#fff',
                }}
              >
                <option value="TODOS">Todos los destinos</option>
                <option value="COCINA">Cocina</option>
                <option value="BAR">Bar</option>
                <option value="COMBO">Combos (Mixto)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#718096', textTransform: 'uppercase' }}>
                Categoría:
              </label>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  background: '#fff',
                }}
              >
                <option value="TODAS">Todas las categorías</option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tabla de Productos */}
          {cargando ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#718096', fontSize: '0.9rem' }}>
              Cargando catálogo…
            </div>
          ) : productosFiltrados.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#718096', fontSize: '0.9rem' }}>
              No se encontraron productos con los filtros seleccionados.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Producto
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Tipo / Destino
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Categoría
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                      Precio base
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                      Disponibilidad
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                      Stock
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                      Anticipada
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map((prod) => {
                    const cat = categorias.find((c) => c.id === prod.categoria_id);
                    const estaDisponible =
                      prod.disponible_calculado !== undefined
                        ? prod.disponible_calculado
                        : prod.disponible;
                    const esCombo = prod.es_combo;

                    return (
                      <tr
                        key={prod.id}
                        style={{
                          borderBottom: '1px solid #edf2f7',
                          background: estaDisponible ? '#fff' : '#fcfcfc',
                          opacity: estaDisponible ? 1 : 0.8,
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <strong style={{ color: '#1a202c', fontSize: '0.92rem' }}>{prod.nombre}</strong>
                            {esCombo && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  background: '#faf5ff',
                                  color: '#6b46c1',
                                  border: '1px solid #e9d8fd',
                                }}
                              >
                                COMBO
                              </span>
                            )}
                          </div>
                          {prod.descripcion && (
                            <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.15rem' }}>
                              {prod.descripcion}
                            </div>
                          )}
                          {!esCombo && prod.opciones && prod.opciones.length > 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#2b6cb0', marginTop: '0.15rem' }}>
                              {prod.opciones.length} {prod.opciones.length === 1 ? 'opción' : 'opciones'} de personalización
                            </div>
                          )}
                          {esCombo && prod.componentes && (
                            <div style={{ fontSize: '0.75rem', color: '#6b46c1', marginTop: '0.15rem' }}>
                              {prod.componentes.length} componentes incluidos
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem' }}>
                          {esCombo ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: '#edf2f7',
                                color: '#2d3748',
                              }}
                            >
                              MIXTO (COC/BAR)
                            </span>
                          ) : prod.destino === 'COCINA' ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: '#fffaf0',
                                color: '#c05621',
                                border: '1px solid #feebc8',
                              }}
                            >
                              COCINA
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: '#ebf8ff',
                                color: '#2b6cb0',
                                border: '1px solid #bee3f8',
                              }}
                            >
                              BAR
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', color: '#4a5568' }}>{cat ? cat.nombre : '—'}</td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#1a202c' }}>
                          $ {Number(prod.precio).toLocaleString('es-CO')}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              type="button"
                              onClick={() => alternarDisponibilidad(prod)}
                              disabled={prod.stock_cantidad === 0 && !prod.disponible}
                              title={
                                prod.stock_cantidad === 0
                                  ? 'Stock en 0: aumente el stock antes de habilitar'
                                  : 'Alternar disponibilidad'
                              }
                              style={{
                                width: '38px',
                                height: '22px',
                                background: estaDisponible ? '#38a169' : '#cbd5e0',
                                borderRadius: '999px',
                                border: 'none',
                                position: 'relative',
                                cursor: prod.stock_cantidad === 0 && !prod.disponible ? 'not-allowed' : 'pointer',
                                opacity: prod.stock_cantidad === 0 && !prod.disponible ? 0.5 : 1,
                                transition: 'background 0.2s',
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '2px',
                                  left: estaDisponible ? '18px' : '2px',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  background: '#fff',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                  transition: 'left 0.2s',
                                }}
                              />
                            </button>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: estaDisponible ? '#c6f6d5' : '#fed7d7',
                                color: estaDisponible ? '#22543d' : '#742a2a',
                              }}
                            >
                              {estaDisponible ? 'DISPONIBLE' : 'BLOQUEADO'}
                            </span>
                          </div>
                          {esCombo && (
                            <div style={{ fontSize: '0.68rem', color: '#a0aec0', marginTop: '0.2rem' }}>
                              Derivado de componentes
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {esCombo ? (
                            <span style={{ color: '#a0aec0' }}>—</span>
                          ) : prod.stock_cantidad !== null && prod.stock_cantidad !== undefined ? (
                            <div>
                              <strong style={{ color: prod.stock_cantidad === 0 ? '#e53e3e' : '#1a202c' }}>
                                {prod.stock_cantidad}
                              </strong>{' '}
                              <span style={{ fontSize: '0.75rem', color: '#718096' }}>uds</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>Sin límite</span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          {esCombo ? (
                            <span style={{ fontSize: '0.75rem', color: '#718096' }}>Por componente</span>
                          ) : prod.permite_anticipada ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: '#c6f6d5',
                                color: '#22543d',
                              }}
                            >
                              SÍ
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                background: '#edf2f7',
                                color: '#718096',
                              }}
                            >
                              No
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => abrirEditarProducto(prod)}
                            style={{
                              background: '#edf2f7',
                              border: '1px solid #cbd5e0',
                              color: '#2b6cb0',
                              padding: '0.3rem 0.6rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            {esCombo ? 'Editar combo ›' : 'Editar ›'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Contenido Subtab 2: Opciones y Restricciones (A3c) */}
      {subtab === 'opciones' && (
        <div
          style={{
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.85rem 1.25rem',
              background: '#f7fafc',
              borderBottom: '1px solid #edf2f7',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <div>
              <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>
                Catálogo general de opciones (RF3, CU12)
              </strong>
              <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                Catálogo único compartido entre Cocina y Bar
              </div>
            </div>

            <div style={{ minWidth: '220px' }}>
              <input
                type="text"
                placeholder="Buscar opción…"
                value={busquedaOpcion}
                onChange={(e) => setBusquedaOpcion(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  background: '#fff',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {cargando ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#718096', fontSize: '0.9rem' }}>
              Cargando opciones…
            </div>
          ) : opcionesFiltradas.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#718096', fontSize: '0.9rem' }}>
              No se encontraron opciones registradas.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Opción
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Grupo / Tipo
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                      Precio extra
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Usada en productos (usada_en)
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>
                      Habilitación global
                    </th>
                    <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {opcionesFiltradas.map((op) => {
                    const usadaEn = op.usada_en || [];
                    const tieneCocina = usadaEn.some((p) => p.destino === 'COCINA');
                    const tieneBar = usadaEn.some((p) => p.destino === 'BAR');
                    const esCompartida = tieneCocina && tieneBar;

                    return (
                      <tr
                        key={op.id}
                        style={{
                          borderBottom: '1px solid #edf2f7',
                          background: op.disponible ? '#fff' : '#fcfcfc',
                          opacity: op.disponible ? 1 : 0.75,
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#1a202c' }}>
                          {op.nombre}
                        </td>

                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              background: '#edf2f7',
                              color: '#4a5568',
                            }}
                          >
                            {op.tipo || 'PREFERENCIA'}
                          </span>
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                          {Number(op.precio_extra) > 0 ? (
                            <span style={{ color: '#1a202c' }}>
                              + $ {Number(op.precio_extra).toLocaleString('es-CO')}
                            </span>
                          ) : (
                            <span style={{ color: '#a0aec0' }}>$ 0</span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem' }}>
                          {usadaEn.length > 0 ? (
                            <div>
                              <div style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                                {usadaEn.map((p) => p.nombre).slice(0, 3).join(', ')}
                                {usadaEn.length > 3 && ` +${usadaEn.length - 3} más`}
                              </div>
                              <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.2rem' }}>
                                {tieneCocina && (
                                  <span
                                    style={{
                                      padding: '0.1rem 0.35rem',
                                      borderRadius: '3px',
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      background: '#fffaf0',
                                      color: '#c05621',
                                      border: '1px solid #feebc8',
                                    }}
                                  >
                                    COCINA
                                  </span>
                                )}
                                {tieneBar && (
                                  <span
                                    style={{
                                      padding: '0.1rem 0.35rem',
                                      borderRadius: '3px',
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      background: '#ebf8ff',
                                      color: '#2b6cb0',
                                      border: '1px solid #bee3f8',
                                    }}
                                  >
                                    BAR
                                  </span>
                                )}
                                {esCompartida && (
                                  <span
                                    style={{
                                      padding: '0.1rem 0.35rem',
                                      borderRadius: '3px',
                                      fontSize: '0.68rem',
                                      fontWeight: 700,
                                      background: '#fefcbf',
                                      color: '#744210',
                                    }}
                                  >
                                    COMPARTIDA
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>Sin asociar</span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              type="button"
                              onClick={() => alternarOpcion(op)}
                              style={{
                                width: '38px',
                                height: '22px',
                                background: op.disponible ? '#38a169' : '#cbd5e0',
                                borderRadius: '999px',
                                border: 'none',
                                position: 'relative',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  top: '2px',
                                  left: op.disponible ? '18px' : '2px',
                                  width: '18px',
                                  height: '18px',
                                  borderRadius: '50%',
                                  background: '#fff',
                                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                  transition: 'left 0.2s',
                                }}
                              />
                            </button>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                background: op.disponible ? '#c6f6d5' : '#fed7d7',
                                color: op.disponible ? '#22543d' : '#742a2a',
                              }}
                            >
                              {op.disponible ? 'ACTIVA' : 'INACTIVA'}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setOpcionEditando(op);
                              setFormOpNombre(op.nombre || '');
                              setFormOpTipo(op.tipo || 'PREFERENCIA');
                              setFormOpPrecioExtra(op.precio_extra ? op.precio_extra.toString() : '0');
                              setErrorModal(null);
                              setModalOpcion(true);
                            }}
                            style={{
                              background: '#edf2f7',
                              border: '1px solid #cbd5e0',
                              color: '#2b6cb0',
                              padding: '0.3rem 0.6rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Bloque 2: Restricciones de opciones (combinaciones prohibidas - Wireframe A3c) */}
          <div
            style={{
              padding: '1.25rem',
              background: '#fff',
              borderTop: '2px solid #edf2f7',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <div>
                <strong style={{ fontSize: '0.95rem', color: '#1a202c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Restricciones y combinaciones prohibidas (restriccion_opcion)
                </strong>
                <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                  Impide que un mesero seleccione opciones mutuamente excluyentes en un mismo producto (RF3 · CU9)
                </div>
              </div>
              <button
                type="button"
                onClick={abrirNuevaRestriccion}
                style={{
                  background: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  color: '#2b6cb0',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                + Añadir regla de incompatibilidad
              </button>
            </div>

            {restricciones.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#718096', fontSize: '0.88rem', background: '#f7fafc', borderRadius: '6px' }}>
                No hay reglas de incompatibilidad registradas. Todas las combinaciones de opciones están permitidas.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Opción A
                      </th>
                      <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', width: '50px', color: '#e53e3e', fontSize: '1rem' }}>
                        ≠
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Opción B incompatible
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Motivo de negocio / Descripción
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {restricciones.map((r) => (
                      <tr
                        key={r.id || `${r.opcion_a_id}-${r.opcion_b_id}`}
                        style={{ borderBottom: '1px solid #edf2f7' }}
                      >
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#1a202c' }}>
                          {r.opcion_a_nombre}{' '}
                          <span style={{ fontSize: '0.75rem', color: '#718096', fontWeight: 400 }}>
                            (ID: {r.opcion_a_id})
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontSize: '1.1rem' }}>
                          ⛔
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#1a202c' }}>
                          {r.opcion_b_nombre}{' '}
                          <span style={{ fontSize: '0.75rem', color: '#718096', fontWeight: 400 }}>
                            (ID: {r.opcion_b_id})
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.85rem' }}>
                          {r.motivo || 'Opciones mutuamente excluyentes'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => eliminarRestriccion(r)}
                            style={{
                              background: '#fff5f5',
                              border: '1px solid #fed7d7',
                              color: '#c53030',
                              padding: '0.3rem 0.65rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                            }}
                          >
                            Quitar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Producto o Combo (Wireframe A3b) */}
      {modalProducto && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '820px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', pb: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1a202c', fontWeight: 700 }}>
                  {productoEditando
                    ? `${tipoItem === 'COMBO' ? 'Editar combo' : 'Editar producto'} · ${productoEditando.nombre}`
                    : tipoItem === 'COMBO'
                    ? 'Nuevo combo compuesto'
                    : 'Nuevo producto individual'}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                  Catálogo RF3 · Destino físico, stock y personalización
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalProducto(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  color: '#718096',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>

            {errorModal && (
              <div
                style={{
                  background: '#fff5f5',
                  border: '1px solid #feb2b2',
                  color: '#c53030',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                {errorModal}
              </div>
            )}

            {/* Selector de Tipo (Individual vs Combo) */}
            {!productoEditando && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: '#edf2f7', padding: '0.3rem', borderRadius: '6px' }}>
                <button
                  type="button"
                  onClick={() => setTipoItem('INDIVIDUAL')}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    background: tipoItem === 'INDIVIDUAL' ? '#fff' : 'transparent',
                    color: tipoItem === 'INDIVIDUAL' ? '#2b6cb0' : '#4a5568',
                    boxShadow: tipoItem === 'INDIVIDUAL' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Producto individual (Cocina / Bar)
                </button>
                <button
                  type="button"
                  onClick={() => setTipoItem('COMBO')}
                  style={{
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    background: tipoItem === 'COMBO' ? '#fff' : 'transparent',
                    color: tipoItem === 'COMBO' ? '#6b46c1' : '#4a5568',
                    boxShadow: tipoItem === 'COMBO' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Combo compuesto (Paquete)
                </button>
              </div>
            )}

            <form onSubmit={guardarProducto} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {/* Columna Izquierda: Datos generales */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Nombre comercial
                    </label>
                    <input
                      type="text"
                      required
                      value={formNombre}
                      onChange={(e) => setFormNombre(e.target.value)}
                      placeholder="Ej. Hamburguesa Clásica"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #cbd5e0',
                        borderRadius: '6px',
                        fontSize: '0.88rem',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Categoría
                      </label>
                      <select
                        value={formCategoriaId}
                        onChange={(e) => setFormCategoriaId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          border: '1px solid #cbd5e0',
                          borderRadius: '6px',
                          fontSize: '0.88rem',
                          background: '#fff',
                          boxSizing: 'border-box',
                        }}
                      >
                        {categorias.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Precio ($ COP)
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={formPrecio}
                        onChange={(e) => setFormPrecio(e.target.value)}
                        placeholder="22000"
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          border: '1px solid #cbd5e0',
                          borderRadius: '6px',
                          fontSize: '0.88rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Descripción
                    </label>
                    <textarea
                      rows={2}
                      value={formDescripcion}
                      onChange={(e) => setFormDescripcion(e.target.value)}
                      placeholder="Ingredientes o características del plato…"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #cbd5e0',
                        borderRadius: '6px',
                        fontSize: '0.88rem',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  {tipoItem === 'INDIVIDUAL' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                          Destino de preparación
                        </label>
                        <select
                          value={formDestino}
                          onChange={(e) => setFormDestino(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            border: '1px solid #cbd5e0',
                            borderRadius: '6px',
                            fontSize: '0.88rem',
                            background: '#fff',
                            boxSizing: 'border-box',
                          }}
                        >
                          <option value="COCINA">Cocina</option>
                          <option value="BAR">Bar</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                          Stock numérico (uds)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formStock}
                          onChange={(e) => setFormStock(e.target.value)}
                          placeholder="Vacío para ilimitado"
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            border: '1px solid #cbd5e0',
                            borderRadius: '6px',
                            fontSize: '0.88rem',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {tipoItem === 'COMBO' && (
                    <div
                      style={{
                        background: '#faf5ff',
                        border: '1px solid #e9d8fd',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        fontSize: '0.78rem',
                        color: '#553c9a',
                      }}
                    >
                      <strong>Destino y stock en combos:</strong> Los combos no tienen destino físico
                      ni stock directo; se dividen en cocina y bar según sus componentes y su
                      disponibilidad se deriva en vivo.
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 600 }}>
                      <input
                        type="checkbox"
                        checked={formDisponible}
                        onChange={(e) => setFormDisponible(e.target.checked)}
                      />
                      <span>Disponible para la venta (menú del mesero)</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formLlevar}
                        onChange={(e) => setFormLlevar(e.target.checked)}
                      />
                      <span>Permite modalidad para llevar</span>
                    </label>

                    {tipoItem === 'INDIVIDUAL' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formAnticipada}
                          onChange={(e) => setFormAnticipada(e.target.checked)}
                        />
                        <span>Habilitado para preparación anticipada (RF6)</span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Columna Derecha: Opciones o Componentes */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {tipoItem === 'INDIVIDUAL' ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                        Opciones aplicables ({formOpcionesIds.length} seleccionadas)
                      </label>
                      <div
                        style={{
                          maxHeight: '260px',
                          overflowY: 'auto',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          padding: '0.5rem',
                          background: '#f7fafc',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                        }}
                      >
                        {opciones.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: '#a0aec0', padding: '0.5rem' }}>
                            No hay opciones registradas
                          </div>
                        ) : (
                          opciones.map((op) => {
                            const seleccionada = formOpcionesIds.includes(op.id);
                            return (
                              <label
                                key={op.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.35rem 0.5rem',
                                  background: seleccionada ? '#ebf8ff' : '#fff',
                                  border: '1px solid',
                                  borderColor: seleccionada ? '#bee3f8' : '#edf2f7',
                                  borderRadius: '4px',
                                  fontSize: '0.82rem',
                                  cursor: 'pointer',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <input
                                    type="checkbox"
                                    checked={seleccionada}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFormOpcionesIds([...formOpcionesIds, op.id]);
                                      } else {
                                        setFormOpcionesIds(formOpcionesIds.filter((id) => id !== op.id));
                                      }
                                    }}
                                  />
                                  <span style={{ fontWeight: 600, color: '#2d3748' }}>{op.nombre}</span>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#718096', fontFamily: 'monospace' }}>
                                  {Number(op.precio_extra) > 0
                                    ? `+$${Number(op.precio_extra).toLocaleString('es-CO')}`
                                    : '$0'}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' }}>
                          Componentes del combo (CU11)
                        </label>
                        <button
                          type="button"
                          onClick={agregarComponenteCombo}
                          style={{
                            background: '#faf5ff',
                            border: '1px solid #d6bcfa',
                            color: '#6b46c1',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                          }}
                        >
                          + Añadir componente
                        </button>
                      </div>

                      <div
                        style={{
                          maxHeight: '260px',
                          overflowY: 'auto',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          padding: '0.5rem',
                          background: '#f7fafc',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                        }}
                      >
                        {formComponentes.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: '#718096', padding: '1rem', textAlign: 'center' }}>
                            Añada al menos un producto componente incluido en el combo.
                          </div>
                        ) : (
                          formComponentes.map((comp, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                background: '#fff',
                                padding: '0.4rem 0.6rem',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e0',
                              }}
                            >
                              <select
                                value={comp.producto_id}
                                onChange={(e) =>
                                  actualizarComponenteCombo(idx, 'producto_id', Number(e.target.value))
                                }
                                style={{
                                  flex: 1,
                                  padding: '0.35rem 0.5rem',
                                  border: '1px solid #cbd5e0',
                                  borderRadius: '4px',
                                  fontSize: '0.82rem',
                                  background: '#fff',
                                }}
                              >
                                {productos
                                  .filter((p) => !p.es_combo)
                                  .map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.nombre} ({p.destino})
                                    </option>
                                  ))}
                              </select>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <input
                                  type="checkbox"
                                  checked={comp.removible}
                                  onChange={(e) =>
                                    actualizarComponenteCombo(idx, 'removible', e.target.checked)
                                  }
                                />
                                <span>Removible</span>
                              </label>

                              <button
                                type="button"
                                onClick={() => quitarComponenteCombo(idx)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#e53e3e',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => setModalProducto(false)}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    background: '#3182ce',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    opacity: guardando ? 0.6 : 1,
                  }}
                >
                  {guardando ? 'Guardando…' : 'Guardar producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Opción (Wireframe A3c) */}
      {modalOpcion && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', paddingBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 700 }}>
                {opcionEditando ? 'Editar opción' : 'Nueva opción de personalización'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpcion(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  color: '#718096',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>

            {errorModal && (
              <div
                style={{
                  background: '#fff5f5',
                  border: '1px solid #feb2b2',
                  color: '#c53030',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              >
                {errorModal}
              </div>
            )}

            <form onSubmit={guardarOpcion} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Nombre de la opción
                </label>
                <input
                  type="text"
                  required
                  value={formOpNombre}
                  onChange={(e) => setFormOpNombre(e.target.value)}
                  placeholder="Ej. Término Tres Cuartos o Tocineta"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Tipo de opción
                </label>
                <select
                  value={formOpTipo}
                  onChange={(e) => setFormOpTipo(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="PREFERENCIA">Preferencia (ej. Término de carne)</option>
                  <option value="ADICIONAL">Adicional (ej. Extra queso, tocineta)</option>
                  <option value="EXCLUSION">Exclusión (ej. Sin sal, sin cebolla)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Precio extra ($ COP)
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={formOpPrecioExtra}
                  onChange={(e) => setFormOpPrecioExtra(e.target.value)}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem', display: 'block' }}>
                  Use 0 para opciones que no incrementan el valor del plato.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => setModalOpcion(false)}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    background: '#3182ce',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    opacity: guardando ? 0.6 : 1,
                  }}
                >
                  {guardando ? 'Guardando…' : 'Guardar opción'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nueva Regla de Incompatibilidad / Restricción (A3c) */}
      {modalRestriccion && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 110,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                  Añadir regla de incompatibilidad (A3c)
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                  Define un par de opciones que no pueden seleccionarse juntas (RF3 · CU9)
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalRestriccion(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  color: '#718096',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                ✕
              </button>
            </div>

            {errorModal && (
              <div
                role="alert"
                style={{
                  background: '#fff5f5',
                  border: '1px solid #feb2b2',
                  color: '#c53030',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                {errorModal}
              </div>
            )}

            <form onSubmit={guardarRestriccion} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Opción A
                </label>
                <select
                  required
                  value={formRestrOpA}
                  onChange={(e) => setFormRestrOpA(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  {opciones.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.nombre} ({op.tipo})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ textAlign: 'center', fontSize: '1.1rem', color: '#e53e3e', fontWeight: 800 }}>
                ⛔ Incompatible con ⛔
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Opción B
                </label>
                <select
                  required
                  value={formRestrOpB}
                  onChange={(e) => setFormRestrOpB(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  {opciones
                    .filter((op) => op.id.toString() !== formRestrOpA)
                    .map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.nombre} ({op.tipo})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Motivo de negocio / Justificación operativa
                </label>
                <input
                  type="text"
                  maxLength={150}
                  value={formRestrMotivo}
                  onChange={(e) => setFormRestrMotivo(e.target.value)}
                  placeholder="Ej. Términos de cocción mutuamente excluyentes"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.88rem',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem', display: 'block' }}>
                  Texto explicativo visible para el personal cuando se intente combinar ambas opciones.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => setModalRestriccion(false)}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    background: '#3182ce',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    opacity: guardando ? 0.6 : 1,
                  }}
                >
                  {guardando ? 'Guardando…' : 'Añadir regla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
