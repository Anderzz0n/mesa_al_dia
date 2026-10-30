import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  obtenerUsuario,
  cerrarSesion,
  obtenerProductos,
  obtenerOpciones,
  obtenerParametros,
  actualizarStockProducto,
  actualizarDisponibilidadProducto,
  actualizarAnticipadaProducto,
  actualizarParametroAnticipada,
  actualizarOpcion,
  obtenerPreparados,
  registrarPreparados,
  descartarPreparado,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';
import TableroComandas from '../componentes/TableroComandas.jsx';

export default function AreaStockControl({ destino = 'COCINA' }) {
  const usuario = obtenerUsuario();
  const navigate = useNavigate();

  const [subtab, setSubtab] = useState('comandas'); // 'comandas' | 'stock' | 'opciones' | 'anticipada' | 'preparados'
  const [productos, setProductos] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [parametros, setParametros] = useState({});
  const [preparados, setPreparados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);
  const [enLinea, setEnLinea] = useState(true);

  // Filtros
  const [busqueda, setBusqueda] = useState('');

  // Modal ajuste de stock
  const [modalStock, setModalStock] = useState(null); // producto a ajustar
  const [cantidadStockInput, setCantidadStockInput] = useState('');
  const [guardandoStock, setGuardandoStock] = useState(false);

  // Modal confirmación opción compartida
  const [modalOpcionCompartida, setModalOpcionCompartida] = useState(null);

  // Modal registrar producto preparado (RF10 / CU19)
  const [modalNuevoPreparado, setModalNuevoPreparado] = useState(false);
  const [productoPreparadoId, setProductoPreparadoId] = useState('');
  const [cantidadPreparadaInput, setCantidadPreparadaInput] = useState('1');
  const [guardandoPreparado, setGuardandoPreparado] = useState(false);

  const esCocina = destino.toUpperCase() === 'COCINA';
  const otraArea = esCocina ? 'Bar' : 'Cocina';
  const claveParamAnticipada = esCocina ? 'ANTICIPADA_ACTIVA_COCINA' : 'ANTICIPADA_ACTIVA_BAR';
  const anticipadaAreaActiva = parametros[claveParamAnticipada] === 'true';

  const cargarDatos = useCallback(async () => {
    try {
      setError(null);
      const [prods, ops, params, preps] = await Promise.all([
        obtenerProductos({ destino }),
        obtenerOpciones({ destino }),
        obtenerParametros(),
        obtenerPreparados({ destino }),
      ]);
      setProductos(prods || []);
      setOpciones(ops || []);
      setParametros(params || {});
      setPreparados(preps?.preparados || []);
    } catch (err) {
      setError(err.message || 'Error al cargar información de stock');
    } finally {
      setCargando(false);
    }
  }, [destino]);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (activo) await cargarDatos();
    })();

    const socket = conectarTiempoReal();
    socket.on('connect', () => setEnLinea(true));
    socket.on('disconnect', () => setEnLinea(false));

    const manejarProductoDisponibilidad = (data) => {
      setProductos((prev) =>
        prev.map((p) => {
          if (p.id === data.producto_id) {
            return {
              ...p,
              disponible: data.disponible !== undefined ? data.disponible : p.disponible,
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

    const manejarOpcionDisponibilidad = (data) => {
      setOpciones((prev) =>
        prev.map((o) => (o.id === data.opcion_id ? { ...o, disponible: data.disponible } : o))
      );
    };

    const manejarAnticipadaEstado = (data) => {
      if (data.destino === destino) {
        setParametros((prev) => ({
          ...prev,
          [claveParamAnticipada]: String(data.activa),
        }));
      }
    };

    const manejarPreparadosActualizados = () => {
      obtenerPreparados({ destino })
        .then((res) => setPreparados(res?.preparados || []))
        .catch(() => {});
    };

    socket.on('producto.disponibilidad', manejarProductoDisponibilidad);
    socket.on('opcion.disponibilidad', manejarOpcionDisponibilidad);
    socket.on('anticipada.estado', manejarAnticipadaEstado);
    socket.on('preparado.nuevo', manejarPreparadosActualizados);
    socket.on('preparado.asignado', manejarPreparadosActualizados);
    socket.on('preparado.descartado', manejarPreparadosActualizados);

    return () => {
      activo = false;
      socket.off('connect');
      socket.off('disconnect');
      socket.off('producto.disponibilidad', manejarProductoDisponibilidad);
      socket.off('opcion.disponibilidad', manejarOpcionDisponibilidad);
      socket.off('anticipada.estado', manejarAnticipadaEstado);
      socket.off('preparado.nuevo', manejarPreparadosActualizados);
      socket.off('preparado.asignado', manejarPreparadosActualizados);
      socket.off('preparado.descartado', manejarPreparadosActualizados);
    };
  }, [cargarDatos, destino, claveParamAnticipada]);

  const mostrarExito = (texto) => {
    setMensajeExito(texto);
    setTimeout(() => setMensajeExito(null), 3500);
  };

  async function salir() {
    await cerrarSesion();
    navigate('/login');
  }

  // Registrar unidades preparadas (RF10 / CU19)
  const guardarNuevoPreparado = async (e) => {
    e.preventDefault();
    const prodId = Number(productoPreparadoId);
    const cant = parseInt(cantidadPreparadaInput, 10);
    if (!prodId || isNaN(cant) || cant < 1) {
      setError('Selecciona un producto y una cantidad válida');
      return;
    }

    setGuardandoPreparado(true);
    setError(null);
    try {
      await registrarPreparados({ productoId: prodId, cantidad: cant });
      const prodObj = productos.find((p) => p.id === prodId);
      mostrarExito(`${cant}x "${prodObj?.nombre || 'Producto'}" registrado en preparados`);
      setModalNuevoPreparado(false);
      setProductoPreparadoId('');
      setCantidadPreparadaInput('1');
      const resPreps = await obtenerPreparados({ destino });
      setPreparados(resPreps?.preparados || []);
    } catch (err) {
      setError(err.message || 'Error al registrar producto preparado');
    } finally {
      setGuardandoPreparado(false);
    }
  };

  // Dar de baja / descartar producto preparado echado a perder (Hueco 3 / RF10)
  const darDeBajaPreparado = async (prepId) => {
    try {
      setError(null);
      await descartarPreparado(prepId, { motivo: 'Descartado por área (enfriado o dañado)' });
      setPreparados((prev) => prev.filter((p) => p.id !== prepId));
      mostrarExito('Unidad preparada descartada');
    } catch (err) {
      setError(err.message || 'Error al dar de baja el preparado');
    }
  };

  // Filtrado de productos por búsqueda
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        return (
          p.nombre.toLowerCase().includes(q) ||
          (p.descripcion && p.descripcion.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [productos, busqueda]);

  // Alternar disponibilidad rápida del producto (CU22)
  const alternarDisponibilidad = async (prod) => {
    const nuevoValor = !prod.disponible;
    try {
      setError(null);
      await actualizarDisponibilidadProducto(prod.id, nuevoValor);
      setProductos((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, disponible: nuevoValor } : p))
      );
      mostrarExito(`Producto "${prod.nombre}" ${nuevoValor ? 'habilitado' : 'bloqueado'}`);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la disponibilidad');
    }
  };

  // Ajuste rápido con botones (+1 / -1)
  const ajustarStockDelta = async (prod, delta) => {
    try {
      setError(null);
      const res = await actualizarStockProducto(prod.id, { ajuste: delta });
      setProductos((prev) =>
        prev.map((p) =>
          p.id === prod.id
            ? { ...p, stock_cantidad: res.stock_cantidad, disponible: res.disponible }
            : p
        )
      );
      mostrarExito(`Stock de "${prod.nombre}": ${res.stock_cantidad} uds`);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el stock');
    }
  };

  // Guardar stock manual desde modal (CU22)
  const guardarStockManual = async (e) => {
    e.preventDefault();
    if (!modalStock) return;
    setGuardandoStock(true);
    setError(null);
    try {
      const cantidad = Number(cantidadStockInput);
      const res = await actualizarStockProducto(modalStock.id, { cantidad });
      setProductos((prev) =>
        prev.map((p) =>
          p.id === modalStock.id
            ? { ...p, stock_cantidad: res.stock_cantidad, disponible: res.disponible }
            : p
        )
      );
      mostrarExito(`Stock de "${modalStock.nombre}" actualizado a ${res.stock_cantidad} uds`);
      setModalStock(null);
    } catch (err) {
      setError(err.message || 'Error al guardar el stock');
    } finally {
      setGuardandoStock(false);
    }
  };

  // Alternar anticipada por producto (RF6)
  const alternarAnticipadaProducto = async (prod) => {
    const nuevoValor = !prod.permite_anticipada;
    try {
      setError(null);
      await actualizarAnticipadaProducto(prod.id, nuevoValor);
      setProductos((prev) =>
        prev.map((p) => (p.id === prod.id ? { ...p, permite_anticipada: nuevoValor } : p))
      );
      mostrarExito(`Preparación anticipada de "${prod.nombre}": ${nuevoValor ? 'Sí' : 'No'}`);
    } catch (err) {
      setError(err.message || 'Error al cambiar anticipada del producto');
    }
  };

  // Alternar interruptor general de anticipada de área (RF6 / CU12)
  const alternarAnticipadaArea = async () => {
    const nuevoValor = !anticipadaAreaActiva;
    try {
      setError(null);
      await actualizarParametroAnticipada({ destino, activa: nuevoValor });
      setParametros((prev) => ({
        ...prev,
        [claveParamAnticipada]: String(nuevoValor),
      }));
      mostrarExito(
        `Preparación anticipada de ${esCocina ? 'Cocina' : 'Bar'} ${
          nuevoValor ? 'ACTIVADA' : 'DESACTIVADA'
        }`
      );
    } catch (err) {
      setError(err.message || 'Error al actualizar interruptor de anticipada');
    }
  };

  // Alternar opción de personalización (CU12)
  const ejecutarCambioOpcion = async (op) => {
    const nuevoValor = !op.disponible;
    try {
      setError(null);
      await actualizarOpcion(op.id, { disponible: nuevoValor });
      setOpciones((prev) =>
        prev.map((o) => (o.id === op.id ? { ...o, disponible: nuevoValor } : o))
      );
      mostrarExito(`Opción "${op.nombre}" ${nuevoValor ? 'habilitada' : 'deshabilitada'}`);
      setModalOpcionCompartida(null);
    } catch (err) {
      setError(err.message || 'Error al actualizar opción');
    }
  };

  const alternarOpcionConAviso = (op) => {
    const usadaEn = op.usada_en || [];
    const esCompartida =
      usadaEn.some((p) => p.destino === 'COCINA') && usadaEn.some((p) => p.destino === 'BAR');

    // Si está activa y es compartida, advertir antes de apagar
    if (op.disponible && esCompartida) {
      setModalOpcionCompartida(op);
    } else {
      ejecutarCambioOpcion(op);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f7fafc',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Barra superior institucional */}
      <header
        style={{
          background: esCocina ? '#c05621' : '#2b6cb0',
          color: '#fff',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            Mesa al día · {esCocina ? 'Cocina' : 'Bar'}
          </h1>
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            Usuario: {usuario?.nombre_completo || usuario?.nombre_usuario || 'Operador'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: enLinea ? 'rgba(0,0,0,0.2)' : '#742a2a',
              padding: '0.25rem 0.6rem',
              borderRadius: '999px',
            }}
          >
            ● {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
          <button
            onClick={salir}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              padding: '0.35rem 0.75rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Contenedor Principal */}
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '1.25rem 1rem', flex: 1 }}>
        {/* Notificaciones */}
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
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: '#c53030', fontWeight: 700, cursor: 'pointer' }}
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
              marginBottom: '1rem',
            }}
          >
            {mensajeExito}
          </div>
        )}

        {/* Pestañas Operativas del Área (C4/C5 / B4/B5) */}
        <div
          style={{
            background: '#fff',
            padding: '1.25rem 1.5rem',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#1a202c', fontWeight: 700 }}>
                Control Operativo de {esCocina ? 'Cocina' : 'Bar'}
              </h2>
              <div style={{ fontSize: '0.85rem', color: '#718096', marginTop: '0.2rem' }}>
                Stock en tiempo real, bloqueo de productos y personalización (RF9, RF6, CU22, CU12)
              </div>
            </div>

            {/* Widget resumen anticipada */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                background: anticipadaAreaActiva ? '#f0fff4' : '#edf2f7',
                border: '1px solid',
                borderColor: anticipadaAreaActiva ? '#9ae6b4' : '#cbd5e0',
                padding: '0.5rem 0.85rem',
                borderRadius: '6px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: '#4a5568' }}>
                  Anticipada {esCocina ? 'Cocina' : 'Bar'}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: anticipadaAreaActiva ? '#22543d' : '#718096' }}>
                  {anticipadaAreaActiva ? 'Activa para meseros' : 'Desactivada'}
                </div>
              </div>
              <button
                type="button"
                onClick={alternarAnticipadaArea}
                style={{
                  background: anticipadaAreaActiva ? '#38a169' : '#4a5568',
                  color: '#fff',
                  border: 'none',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {anticipadaAreaActiva ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>

          {/* Subpestañas */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #edf2f7', marginTop: '1rem', overflowX: 'auto' }}>
            <button
              type="button"
              onClick={() => setSubtab('comandas')}
              style={{
                padding: '0.6rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: subtab === 'comandas' ? `3px solid ${esCocina ? '#c05621' : '#2b6cb0'}` : '3px solid transparent',
                fontWeight: subtab === 'comandas' ? 700 : 500,
                color: subtab === 'comandas' ? (esCocina ? '#c05621' : '#2b6cb0') : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              📋 Comandas en Vivo (Kanban)
            </button>
            <button
              type="button"
              onClick={() => setSubtab('stock')}
              style={{
                padding: '0.6rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: subtab === 'stock' ? `3px solid ${esCocina ? '#c05621' : '#2b6cb0'}` : '3px solid transparent',
                fontWeight: subtab === 'stock' ? 700 : 500,
                color: subtab === 'stock' ? (esCocina ? '#c05621' : '#2b6cb0') : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Stock y Disponibilidad ({productos.length})
            </button>
            <button
              type="button"
              onClick={() => setSubtab('opciones')}
              style={{
                padding: '0.6rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: subtab === 'opciones' ? `3px solid ${esCocina ? '#c05621' : '#2b6cb0'}` : '3px solid transparent',
                fontWeight: subtab === 'opciones' ? 700 : 500,
                color: subtab === 'opciones' ? (esCocina ? '#c05621' : '#2b6cb0') : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Opciones de Personalización ({opciones.length})
            </button>
            <button
              type="button"
              onClick={() => setSubtab('anticipada')}
              style={{
                padding: '0.6rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: subtab === 'anticipada' ? `3px solid ${esCocina ? '#c05621' : '#2b6cb0'}` : '3px solid transparent',
                fontWeight: subtab === 'anticipada' ? 700 : 500,
                color: subtab === 'anticipada' ? (esCocina ? '#c05621' : '#2b6cb0') : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Preparación Anticipada (RF6)
            </button>
            <button
              type="button"
              onClick={() => setSubtab('preparados')}
              style={{
                padding: '0.6rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: subtab === 'preparados' ? `3px solid ${esCocina ? '#c05621' : '#2b6cb0'}` : '3px solid transparent',
                fontWeight: subtab === 'preparados' ? 700 : 500,
                color: subtab === 'preparados' ? (esCocina ? '#c05621' : '#2b6cb0') : '#4a5568',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              🍲 Preparados ({preparados.length})
            </button>
          </div>
        </div>

        {/* Contenido 0: Tablero Kanban de Comandas (RF7, CU15, RF8) */}
        {subtab === 'comandas' && (
          <TableroComandas destino={destino} />
        )}

        {/* Contenido 1: Stock y Disponibilidad (CU22 / RF9) */}
        {subtab === 'stock' && (
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
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ flex: '1 1 240px' }}>
                <input
                  type="text"
                  placeholder={`Buscar producto de ${esCocina ? 'Cocina' : 'Bar'}…`}
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
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

              <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                * El stock en 0 bloquea automáticamente el producto para los meseros (RF9).
              </div>
            </div>

            {cargando ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
                Cargando productos de {destino}…
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
                No se encontraron productos registrados para {destino}.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        Producto
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>
                        Disponibilidad
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>
                        Stock Actual
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>
                        Ajuste Rápido (CU22)
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>
                        Anticipada
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.map((prod) => (
                      <tr
                        key={prod.id}
                        style={{
                          borderBottom: '1px solid #edf2f7',
                          background: prod.disponible ? '#fff' : '#fcfcfc',
                          opacity: prod.disponible ? 1 : 0.8,
                        }}
                      >
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <strong style={{ color: '#1a202c', fontSize: '0.92rem' }}>{prod.nombre}</strong>
                          {prod.descripcion && (
                            <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.15rem' }}>
                              {prod.descripcion}
                            </div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.15rem' }}>
                            $ {Number(prod.precio).toLocaleString('es-CO')}
                          </div>
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => alternarDisponibilidad(prod)}
                              disabled={prod.stock_cantidad === 0 && !prod.disponible}
                              style={{
                                width: '38px',
                                height: '22px',
                                background: prod.disponible ? '#38a169' : '#cbd5e0',
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
                                  left: prod.disponible ? '18px' : '2px',
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
                                background: prod.disponible ? '#c6f6d5' : '#fed7d7',
                                color: prod.disponible ? '#22543d' : '#742a2a',
                              }}
                            >
                              {prod.disponible ? 'DISPONIBLE' : 'BLOQUEADO'}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          {prod.stock_cantidad !== null && prod.stock_cantidad !== undefined ? (
                            <div>
                              <strong
                                style={{
                                  fontSize: '1.1rem',
                                  color: prod.stock_cantidad === 0 ? '#e53e3e' : '#1a202c',
                                }}
                              >
                                {prod.stock_cantidad}
                              </strong>{' '}
                              <span style={{ fontSize: '0.75rem', color: '#718096' }}>uds</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Ilimitado</span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => ajustarStockDelta(prod, -1)}
                              disabled={prod.stock_cantidad !== null && prod.stock_cantidad <= 0}
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e0',
                                background: '#edf2f7',
                                color: '#2d3748',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Restar 1 unidad"
                            >
                              -1
                            </button>
                            <button
                              type="button"
                              onClick={() => ajustarStockDelta(prod, 1)}
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e0',
                                background: '#edf2f7',
                                color: '#2d3748',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Sumar 1 unidad"
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setModalStock(prod);
                                setCantidadStockInput(
                                  prod.stock_cantidad !== null && prod.stock_cantidad !== undefined
                                    ? prod.stock_cantidad.toString()
                                    : '50'
                                );
                              }}
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                border: '1px solid #bee3f8',
                                background: '#ebf8ff',
                                color: '#2b6cb0',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                marginLeft: '0.2rem',
                              }}
                            >
                              Ajustar valor
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => alternarAnticipadaProducto(prod)}
                            style={{
                              padding: '0.25rem 0.6rem',
                              borderRadius: '4px',
                              border: '1px solid',
                              borderColor: prod.permite_anticipada ? '#9ae6b4' : '#cbd5e0',
                              background: prod.permite_anticipada ? '#f0fff4' : '#edf2f7',
                              color: prod.permite_anticipada ? '#22543d' : '#718096',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            {prod.permite_anticipada ? 'Permite SÍ' : 'Permite No'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Contenido 2: Opciones de Personalización (CU12 / RF3) */}
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
              }}
            >
              <strong style={{ color: '#1a202c', fontSize: '0.95rem' }}>
                Opciones de personalización de {esCocina ? 'Cocina' : 'Bar'} (CU12)
              </strong>
              <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.15rem' }}>
                Las opciones marcadas con «También en {otraArea}» pertenecen al catálogo compartido;
                su desactivación afecta también a esa área.
              </div>
            </div>

            {opciones.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
                No hay opciones registradas para productos de {destino}.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        Opción
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        Tipo
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        Alcance / Área
                      </th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {opciones.map((op) => {
                      const usadaEn = op.usada_en || [];
                      const compartida = usadaEn.some(
                        (p) => p.destino && p.destino !== destino.toUpperCase()
                      );

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
                            <div style={{ fontSize: '0.75rem', color: '#718096', fontWeight: 400 }}>
                              {usadaEn.map((p) => p.nombre).join(', ')}
                            </div>
                          </td>

                          <td style={{ padding: '0.75rem 1rem', color: '#4a5568' }}>
                            {op.tipo || 'PREFERENCIA'}
                          </td>

                          <td style={{ padding: '0.75rem 1rem' }}>
                            {compartida ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  background: '#fefcbf',
                                  color: '#744210',
                                  border: '1px solid #faf089',
                                }}
                              >
                                También en {otraArea} (Compartida)
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: '#edf2f7',
                                  color: '#4a5568',
                                }}
                              >
                                Solo {esCocina ? 'Cocina' : 'Bar'}
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => alternarOpcionConAviso(op)}
                              style={{
                                padding: '0.35rem 0.75rem',
                                borderRadius: '4px',
                                border: 'none',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                background: op.disponible ? '#c6f6d5' : '#fed7d7',
                                color: op.disponible ? '#22543d' : '#742a2a',
                              }}
                            >
                              {op.disponible ? 'ACTIVA' : 'INACTIVA'}
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

        {/* Contenido 3: Preparación Anticipada (RF6) */}
        {subtab === 'anticipada' && (
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 700 }}>
                Interruptor de Preparación Anticipada de {esCocina ? 'Cocina' : 'Bar'} (RF6)
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#718096' }}>
                Permite al jefe de cocina o bar encender o apagar la cola de despacho prioritario
                para su área en momentos de alta o baja demanda operativa.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1.25rem',
                borderRadius: '8px',
                border: '2px solid',
                borderColor: anticipadaAreaActiva ? '#48bb78' : '#cbd5e0',
                background: anticipadaAreaActiva ? '#f0fff4' : '#f7fafc',
              }}
            >
              <div>
                <strong style={{ fontSize: '1.05rem', color: '#1a202c' }}>
                  Estado actual de la función: {anticipadaAreaActiva ? 'ACTIVADA' : 'DESACTIVADA'}
                </strong>
                <div style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: '0.25rem' }}>
                  {anticipadaAreaActiva
                    ? 'Los meseros tienen habilitado el selector de modalidad "Anticipada" para los productos de tu área que lo permitan.'
                    : 'La modalidad anticipada está bloqueada para esta área; todos los productos se prepararán bajo la modalidad de mesa estándar o para llevar.'}
                </div>
              </div>

              <button
                type="button"
                onClick={alternarAnticipadaArea}
                style={{
                  padding: '0.65rem 1.25rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  background: anticipadaAreaActiva ? '#e53e3e' : '#38a169',
                  color: '#fff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                {anticipadaAreaActiva ? 'Desactivar Función' : 'Activar Función'}
              </button>
            </div>
          </div>
        )}

        {/* Contenido 4: Gestión de Productos Preparados (RF10 · CU19, CU20, Hueco 3) */}
        {subtab === 'preparados' && (
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.25rem 1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                  Productos Ya Preparados · {esCocina ? 'Cocina' : 'Bar'} (RF10)
                </h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#718096' }}>
                  Unidades listas para despacho inmediato sin esperar cocción. Los meseros pueden asignarlas a nuevos pedidos.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalNuevoPreparado(true)}
                style={{
                  background: esCocina ? '#c05621' : '#2b6cb0',
                  color: '#fff',
                  border: 'none',
                  padding: '0.55rem 1.1rem',
                  borderRadius: '6px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                + Registrar Preparado (CU19)
              </button>
            </div>

            {preparados.length === 0 ? (
              <div
                style={{
                  padding: '3rem',
                  textAlign: 'center',
                  color: '#718096',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed #cbd5e0',
                }}
              >
                No hay productos preparados disponibles en este momento.
                <div style={{ fontSize: '0.8rem', color: '#a0aec0', marginTop: '0.35rem' }}>
                  Haz clic en "+ Registrar Preparado" para añadir platos o bebidas cocinadas con anticipación.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7' }}>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Producto</th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase' }}>Origen</th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Tiempo Preparado</th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Precio</th>
                      <th style={{ padding: '0.75rem 1rem', color: '#4a5568', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preparados.map((prep) => {
                      const mins = prep.minutos_preparado || 0;
                      const demasiadoTiempo = mins >= 45;

                      return (
                        <tr key={prep.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#1a202c' }}>{prep.producto_nombre}</strong>
                            <div style={{ fontSize: '0.75rem', color: '#718096' }}>ID Unidad #{prep.id}</div>
                          </td>

                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                background: prep.origen === 'CANCELACION' ? '#feebc8' : '#edf2f7',
                                color: prep.origen === 'CANCELACION' ? '#7b341e' : '#4a5568',
                              }}
                            >
                              {prep.origen === 'CANCELACION' ? 'Cancelación de Pedido' : 'Registro Directo'}
                            </span>
                          </td>

                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.55rem',
                                borderRadius: '4px',
                                background: demasiadoTiempo ? '#fed7d7' : '#edf2f7',
                                color: demasiadoTiempo ? '#9b2c2c' : '#4a5568',
                              }}
                            >
                              🕒 Hace {mins} min {demasiadoTiempo && '⚠️'}
                            </span>
                          </td>

                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                            $ {Number(prep.precio || 0).toLocaleString('es-CO')}
                          </td>

                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => darDeBajaPreparado(prep.id)}
                              style={{
                                background: '#fff',
                                border: '1px solid #feb2b2',
                                color: '#c53030',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Dar de baja producto echado a perder o enfriado (Hueco 3)"
                            >
                              🗑 Dar de baja
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
      </div>

      {/* MODAL: Registrar Nuevo Producto Preparado (RF10 / CU19) */}
      {modalNuevoPreparado && (
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
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 700 }}>
                Registrar Producto Preparado (CU19)
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                Área: <strong>{esCocina ? 'Cocina' : 'Bar'}</strong>
              </div>
            </div>

            <form onSubmit={guardarNuevoPreparado} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Seleccionar Producto
                </label>
                <select
                  required
                  value={productoPreparadoId}
                  onChange={(e) => setProductoPreparadoId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">-- Elige un producto --</option>
                  {productos
                    .filter((p) => !p.es_combo)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ($ {Number(p.precio).toLocaleString('es-CO')})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Cantidad preparada (unidades)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  required
                  value={cantidadPreparadaInput}
                  onChange={(e) => setCantidadPreparadaInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => setModalNuevoPreparado(false)}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.45rem 0.9rem',
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
                  disabled={guardandoPreparado}
                  style={{
                    background: esCocina ? '#c05621' : '#2b6cb0',
                    color: '#fff',
                    border: 'none',
                    padding: '0.45rem 1.1rem',
                    borderRadius: '6px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: guardandoPreparado ? 'not-allowed' : 'pointer',
                    opacity: guardandoPreparado ? 0.6 : 1,
                  }}
                >
                  {guardandoPreparado ? 'Registrando…' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ajuste Numérico de Stock (CU22) */}
      {modalStock && (
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
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1a202c', fontWeight: 700 }}>
                Ajustar Stock · {modalStock.nombre}
              </h3>
              <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                Corrección de inventario en tiempo real (CU22)
              </div>
            </div>

            <form onSubmit={guardarStockManual} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                  Cantidad disponible (unidades)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={cantidadStockInput}
                  onChange={(e) => setCantidadStockInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '1rem',
                    fontWeight: 700,
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.25rem', display: 'block' }}>
                  Si la cantidad llega a 0, el producto pasará automáticamente a no disponible.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
                <button
                  type="button"
                  onClick={() => setModalStock(null)}
                  style={{
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    color: '#4a5568',
                    padding: '0.45rem 0.9rem',
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
                  disabled={guardandoStock}
                  style={{
                    background: '#3182ce',
                    color: '#fff',
                    border: 'none',
                    padding: '0.45rem 1.1rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: guardandoStock ? 'not-allowed' : 'pointer',
                    opacity: guardandoStock ? 0.6 : 1,
                  }}
                >
                  {guardandoStock ? 'Guardando…' : 'Guardar stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Advertencia Opción Compartida (CU12) */}
      {modalOpcionCompartida && (
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
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#744210', fontWeight: 700 }}>
                Opción Compartida con {otraArea}
              </h3>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: '#4a5568', lineHeight: 1.4 }}>
                La opción <strong>"{modalOpcionCompartida.nombre}"</strong> también es utilizada por
                productos de <strong>{otraArea}</strong>. Si la desactivas, los comensales y
                meseros no podrán solicitarla para ninguna de las dos áreas.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #edf2f7' }}>
              <button
                type="button"
                onClick={() => setModalOpcionCompartida(null)}
                style={{
                  background: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  color: '#4a5568',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => ejecutarCambioOpcion(modalOpcionCompartida)}
                style={{
                  background: '#c53030',
                  color: '#fff',
                  border: 'none',
                  padding: '0.45rem 1.1rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Desactivar para todos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
