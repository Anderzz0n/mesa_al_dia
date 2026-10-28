import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  obtenerUsuario,
  cerrarSesion,
  obtenerMesas,
  obtenerSectores,
  reasignarMesa,
  terminarReasignacionMesa,
  obtenerActividadMesero,
  obtenerCategorias,
  obtenerProductos,
  obtenerOpciones,
  obtenerParametros,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

import { MesaDetalleModal } from '../componentes/mesero/MesaDetalleModal.jsx';
import { CuentaDetalleModal } from '../componentes/mesero/CuentaDetalleModal.jsx';
import { MenuPedidoModal } from '../componentes/mesero/MenuPedidoModal.jsx';
import { PersonalizarProductoModal } from '../componentes/mesero/PersonalizarProductoModal.jsx';
import { PersonalizarComboModal } from '../componentes/mesero/PersonalizarComboModal.jsx';
import { ResumenPedidoModal } from '../componentes/mesero/ResumenPedidoModal.jsx';

export default function MeseroMesas() {
  const usuario = obtenerUsuario();
  const navigate = useNavigate();

  const [pestana, setPestana] = useState('mesas'); // 'mesas' | 'mi_dia'
  const [mesas, setMesas] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [actividad, setActividad] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [enLinea, setEnLinea] = useState(true);
  const [filtroSector, setFiltroSector] = useState('todos');

  // Catálogo y parámetros para pedidos móviles
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);
  const [opciones, setOpciones] = useState([]);
  const [parametros, setParametros] = useState({});

  // Flujo modal M2 -> M3 -> M4 -> M5a/M5b -> M6
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
  const [cuentaParaPedido, setCuentaParaPedido] = useState(null);
  const [productoParaPersonalizar, setProductoParaPersonalizar] = useState(null);
  const [comboParaPersonalizar, setComboParaPersonalizar] = useState(null);
  const [mostrandoResumen, setMostrandoResumen] = useState(false);
  const [itemsPedidoEnCurso, setItemsPedidoEnCurso] = useState([]);

  // Modal Reasignar (M9a)
  const [mesaParaReasignar, setMesaParaReasignar] = useState(null);
  const [motivoReasignacion, setMotivoReasignacion] = useState('Apoyo temporal en turno');
  const [guardandoReasignacion, setGuardandoReasignacion] = useState(false);
  const [errorReasignacion, setErrorReasignacion] = useState(null);

  // Aviso temporal emergente (toast de TIEMPO REAL / CU13)
  const [avisoEmergente, setAvisoEmergente] = useState(null);
  const [mostrarModalSalir, setMostrarModalSalir] = useState(false);

  const cargarDatos = useCallback(async () => {
    try {
      setError(null);
      const [listaMesas, listaSectores, listaCats, listaProds, listaOps, listaParams] =
        await Promise.all([
          obtenerMesas(),
          obtenerSectores(),
          obtenerCategorias().catch(() => []),
          obtenerProductos().catch(() => []),
          obtenerOpciones().catch(() => []),
          obtenerParametros().catch(() => ({})),
        ]);

      setMesas(listaMesas);
      setSectores(listaSectores);
      setCategorias(listaCats);
      setProductos(listaProds);
      setOpciones(listaOps);
      setParametros(listaParams);

      if (usuario?.id) {
        try {
          const act = await obtenerActividadMesero(usuario.id);
          setActividad(act);
        } catch {
          // No bloqueante
        }
      }
    } catch (err) {
      setError(err.message || 'Error al cargar mesas');
    } finally {
      setCargando(false);
    }
  }, [usuario?.id]);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (activo) await cargarDatos();
    })();

    const socket = conectarTiempoReal();
    socket.on('connect', () => setEnLinea(true));
    socket.on('disconnect', () => setEnLinea(false));

    socket.on('sector.asignacion', (datos) => {
      cargarDatos();
      if (datos.tipo === 'reasignacion_mesa') {
        mostrarAviso(`Mesa ${datos.numero || datos.mesa_id} reasignada a ${datos.mesero_nombre}`);
      } else if (datos.tipo === 'termino_reasignacion') {
        mostrarAviso(`Reasignación de mesa ${datos.mesa_id} finalizada`);
      } else {
        mostrarAviso('Actualización de asignación de sectores recibida');
      }
    });

    socket.on('mesa.estado', (datos) => {
      cargarDatos();
      mostrarAviso(`Estado actualizado en Mesa ${datos.numero || datos.mesa_id}`);
    });

    socket.on('producto.disponibilidad', (datos) => {
      // Actualizar catálogo local en vivo
      setProductos((prev) =>
        prev.map((p) => {
          if (p.id === datos.producto_id) {
            return {
              ...p,
              disponible: datos.disponible,
              stock_cantidad: datos.stock_cantidad !== undefined ? datos.stock_cantidad : p.stock_cantidad,
            };
          }
          return p;
        })
      );
      if (!datos.disponible) {
        mostrarAviso(`Atención: Producto #${datos.producto_id} no disponible`);
      }
    });

    socket.on('anticipada.estado', (datos) => {
      setParametros((prev) => ({
        ...prev,
        [`ANTICIPADA_ACTIVA_${datos.destino}`]: datos.activa ? 'true' : 'false',
      }));
      mostrarAviso(`Preparación anticipada en ${datos.destino} ${datos.activa ? 'activada' : 'desactivada'}`);
    });

    return () => {
      activo = false;
      socket.disconnect();
    };
  }, [cargarDatos]);

  function mostrarAviso(mensaje) {
    setAvisoEmergente(mensaje);
    setTimeout(() => {
      setAvisoEmergente(null);
    }, 4500);
  }

  async function salir() {
    await cerrarSesion();
    navigate('/login');
  }

  async function ejecutarReasignacion() {
    if (!mesaParaReasignar) return;
    setGuardandoReasignacion(true);
    setErrorReasignacion(null);

    try {
      await reasignarMesa(mesaParaReasignar.id, { motivo: motivoReasignacion });
      setMesaParaReasignar(null);
      await cargarDatos();
      mostrarAviso(`Mesa ${mesaParaReasignar.numero} reasignada exitosamente`);
    } catch (err) {
      if (err.codigo === 'SIN_MESEROS_DISPONIBLES') {
        setErrorReasignacion(
          'No hay meseros disponibles en este momento (SIN_MESEROS_DISPONIBLES). Pide ayuda a un administrador.'
        );
      } else {
        setErrorReasignacion(err.message || 'Error al reasignar mesa');
      }
    } finally {
      setGuardandoReasignacion(false);
    }
  }

  async function ejecutarTerminarReasignacion(mesaId, mesaNum) {
    try {
      await terminarReasignacionMesa(mesaId);
      await cargarDatos();
      mostrarAviso(`Reasignación de Mesa ${mesaNum} terminada.`);
    } catch (err) {
      setError(err.message || 'Error al terminar reasignación');
    }
  }

  // Manejo de Agregar ítem a pedido en curso
  function manejarAgregarItemAPedido(nuevoItem) {
    setItemsPedidoEnCurso((prev) => [...prev, nuevoItem]);
    setProductoParaPersonalizar(null);
    setComboParaPersonalizar(null);
    mostrarAviso(`Agregado: ${nuevoItem.cantidad}× ${nuevoItem.producto_nombre}`);
  }

  // Éxito al enviar pedido (M6 -> M3)
  function manejarPedidoEnviado(resultado) {
    setMostrandoResumen(false);
    setCuentaParaPedido(null);
    setItemsPedidoEnCurso([]);
    cargarDatos();
    mostrarAviso(`¡Pedido #${resultado.id} enviado a preparación!`);
    // Abrir cuenta actualizada para ver comandas generadas
    setCuentaSeleccionada({ id: resultado.cuenta_id });
  }

  const mesasFiltradas = mesas.filter((m) => {
    if (filtroSector === 'mis_mesas') {
      return m.mesero_actual?.id === usuario?.id || m.mesero_titular?.id === usuario?.id;
    }
    if (filtroSector !== 'todos' && String(m.sector_id) !== String(filtroSector)) {
      return false;
    }
    return true;
  });

  return (
    <div
      style={{
        maxWidth: '480px',
        margin: '0 auto',
        background: '#f7fafc',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Barra superior (M0/M1) */}
      <header
        style={{
          background: '#2b6cb0',
          color: '#fff',
          padding: '0.75rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mesa al día · Mesero</h1>
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            {usuario?.nombre_completo || 'Mesero'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: enLinea ? '#22543d' : '#742a2a',
              padding: '0.2rem 0.5rem',
              borderRadius: '12px',
            }}
          >
            ● {enLinea ? 'En línea' : 'Sin conexión'}
          </span>
          <Link
            to="/"
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              textDecoration: 'none',
              padding: '0.3rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
            }}
          >
            Inicio
          </Link>
          <button
            onClick={() => setMostrarModalSalir(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: '#fff',
              padding: '0.3rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {/* Aviso emergente WebSocket (M13) */}
      {avisoEmergente && (
        <div
          style={{
            background: '#2d3748',
            color: '#fff',
            padding: '0.65rem 1rem',
            textAlign: 'center',
            fontSize: '0.85rem',
            fontWeight: 600,
            borderBottom: '2px solid #ecc94b',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {avisoEmergente}
        </div>
      )}

      {/* Pestañas: Mesas (M1) · Mi día (M12) */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => setPestana('mesas')}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            background: 'none',
            fontWeight: pestana === 'mesas' ? 700 : 500,
            color: pestana === 'mesas' ? '#2b6cb0' : '#718096',
            borderBottom: pestana === 'mesas' ? '3px solid #2b6cb0' : 'none',
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          Mesas ({mesas.length})
        </button>
        <button
          onClick={() => setPestana('mi_dia')}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            background: 'none',
            fontWeight: pestana === 'mi_dia' ? 700 : 500,
            color: pestana === 'mi_dia' ? '#2b6cb0' : '#718096',
            borderBottom: pestana === 'mi_dia' ? '3px solid #2b6cb0' : 'none',
            cursor: 'pointer',
            fontSize: '0.95rem',
          }}
        >
          Mi día (CU24)
        </button>
      </div>

      {/* Contenido principal */}
      <div style={{ padding: '1rem', flex: 1 }}>
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

        {cargando ? (
          <p style={{ color: '#718096', textAlign: 'center', marginTop: '2rem' }}>
            Cargando información de mesas...
          </p>
        ) : pestana === 'mesas' ? (
          <div>
            {/* Filtros de sector (M1) */}
            <div
              style={{
                display: 'flex',
                gap: '0.4rem',
                overflowX: 'auto',
                paddingBottom: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <button
                onClick={() => setFiltroSector('mis_mesas')}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '16px',
                  border: filtroSector === 'mis_mesas' ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
                  background: filtroSector === 'mis_mesas' ? '#ebf8ff' : '#fff',
                  color: filtroSector === 'mis_mesas' ? '#2b6cb0' : '#4a5568',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                A mi cargo
              </button>
              <button
                onClick={() => setFiltroSector('todos')}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: '16px',
                  border: filtroSector === 'todos' ? '2px solid #2b6cb0' : '1px solid #cbd5e0',
                  background: filtroSector === 'todos' ? '#ebf8ff' : '#fff',
                  color: filtroSector === 'todos' ? '#2b6cb0' : '#4a5568',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                Todas las mesas
              </button>
              {sectores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setFiltroSector(s.id)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '16px',
                    border:
                      String(filtroSector) === String(s.id)
                        ? '2px solid #2b6cb0'
                        : '1px solid #cbd5e0',
                    background: String(filtroSector) === String(s.id) ? '#ebf8ff' : '#fff',
                    color: String(filtroSector) === String(s.id) ? '#2b6cb0' : '#4a5568',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                  }}
                >
                  {s.nombre}
                </button>
              ))}
            </div>

            {/* Cuadrícula de mesas (M1) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
              {mesasFiltradas.map((m) => {
                const soyTitular = m.mesero_titular?.id === usuario?.id;
                const laAtiendoYo = m.mesero_actual?.id === usuario?.id;
                const estaCedida = soyTitular && Boolean(m.reasignacion) && !laAtiendoYo;
                const meLaCedieron = !soyTitular && laAtiendoYo && Boolean(m.reasignacion);

                // Colores y patrones según estado operativo
                const colorEstado =
                  m.estado === 'DISPONIBLE'
                    ? '#38a169'
                    : m.estado === 'OCUPADA'
                    ? '#dd6b20'
                    : m.estado === 'CON_PEDIDOS_PENDIENTES'
                    ? '#3182ce'
                    : '#e53e3e';

                const fondoCard =
                  m.estado === 'DISPONIBLE'
                    ? '#ffffff'
                    : m.estado === 'OCUPADA'
                    ? '#fffaf0'
                    : m.estado === 'CON_PEDIDOS_PENDIENTES'
                    ? '#ebf8ff'
                    : '#fff5f5';

                return (
                  <div
                    key={m.id}
                    onClick={() => setMesaSeleccionada(m)}
                    style={{
                      background: fondoCard,
                      border: estaCedida ? '2px dashed #a0aec0' : `1px solid ${colorEstado}`,
                      borderRadius: '8px',
                      padding: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      cursor: 'pointer',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                        }}
                      >
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1a202c' }}>
                          Mesa {m.numero}
                        </span>
                        <span
                          style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            background: colorEstado,
                            color: '#fff',
                            textTransform: 'uppercase',
                          }}
                        >
                          {m.estado === 'DISPONIBLE'
                            ? 'Libre'
                            : m.estado === 'OCUPADA'
                            ? 'Ocupada'
                            : m.estado === 'CON_PEDIDOS_PENDIENTES'
                            ? 'Pedidos'
                            : 'En pago'}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.75rem', color: '#718096', margin: '0.25rem 0' }}>
                        {m.sector_nombre || 'Sin sector'}
                      </div>

                      {/* Estado de atención / asignación */}
                      <div style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                        {estaCedida ? (
                          <div
                            style={{
                              background: '#edf2f7',
                              padding: '0.3rem',
                              borderRadius: '4px',
                              color: '#4a5568',
                            }}
                          >
                            <span style={{ fontWeight: 700, color: '#2d3748' }}>
                              Cedida temporalmente
                            </span>
                            <div style={{ fontSize: '0.7rem' }}>
                              Atiende: {m.mesero_actual?.nombre_completo}
                            </div>
                          </div>
                        ) : meLaCedieron ? (
                          <div
                            style={{
                              background: '#feebc8',
                              padding: '0.3rem',
                              borderRadius: '4px',
                              color: '#744210',
                            }}
                          >
                            <span style={{ fontWeight: 700 }}>A mi cargo (Apoyo)</span>
                            <div style={{ fontSize: '0.7rem' }}>
                              Titular: {m.mesero_titular?.nombre_completo}
                            </div>
                          </div>
                        ) : laAtiendoYo ? (
                          <span style={{ color: '#2b6cb0', fontWeight: 600 }}>Mi mesa asignada</span>
                        ) : (
                          <span style={{ color: '#a0aec0' }}>
                            Atiende: {m.mesero_actual?.nombre_completo || 'Sin asignar'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Acciones de mesa (M2, M9a, M9b) */}
                    <div
                      style={{
                        marginTop: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
                      {estaCedida || meLaCedieron ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ejecutarTerminarReasignacion(m.id, m.numero);
                          }}
                          style={{
                            background: '#e2e8f0',
                            border: '1px solid #cbd5e0',
                            color: '#2d3748',
                            padding: '0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Terminar reasignación (M9b)
                        </button>
                      ) : laAtiendoYo ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMesaParaReasignar(m);
                            setErrorReasignacion(null);
                          }}
                          style={{
                            background: '#edf2f7',
                            border: '1px solid #cbd5e0',
                            color: '#2b6cb0',
                            padding: '0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Reasignar mesa (M9a)
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* PESTAÑA MI DÍA (RF15 / CU24 / M12) */
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1rem',
              border: '1px solid #e2e8f0',
            }}
          >
            <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0', color: '#2d3748' }}>
              Actividad de hoy
            </h2>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#718096' }}>
              Resumen de pedidos atendidos hoy (sin cancelados).
            </p>

            <div
              style={{
                display: 'flex',
                gap: '1rem',
                background: '#ebf8ff',
                padding: '1rem',
                borderRadius: '6px',
                marginBottom: '1rem',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#4a5568',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  Total pedidos hoy:
                </span>
                <strong style={{ display: 'block', fontSize: '1.5rem', color: '#2b6cb0' }}>
                  {actividad?.total_pedidos || 0}
                </strong>
              </div>
            </div>

            <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.5rem 0', color: '#4a5568' }}>
              Desglose por mesa:
            </h3>
            {actividad?.pedidos_por_mesa && actividad.pedidos_por_mesa.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {actividad.pedidos_por_mesa.map((p) => (
                  <div
                    key={p.mesa}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      background: '#f7fafc',
                      borderRadius: '4px',
                      border: '1px solid #edf2f7',
                    }}
                  >
                    <span>
                      <strong>Mesa {p.mesa}</strong> ({p.sector || 'Sector'})
                    </span>
                    <span style={{ fontWeight: 700, color: '#2b6cb0' }}>{p.pedidos} pedidos</span>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{
                  fontSize: '0.85rem',
                  color: '#a0aec0',
                  textAlign: 'center',
                  margin: '1.5rem 0',
                }}
              >
                Aún no hay pedidos registrados para hoy.
              </p>
            )}
          </div>
        )}
      </div>

      {/* M2: MODAL DETALLE DE MESA Y CUENTAS VIVAS */}
      {mesaSeleccionada && !cuentaSeleccionada && !cuentaParaPedido && (
        <MesaDetalleModal
          mesa={mesaSeleccionada}
          onSeleccionarCuenta={(c) => {
            setCuentaSeleccionada({
              ...c,
              mesa_numero: mesaSeleccionada.numero,
              sector_nombre: mesaSeleccionada.sector_nombre,
            });
          }}
          onAbrirNuevaCuenta={(c) => {
            setCuentaParaPedido(c);
            setItemsPedidoEnCurso([]);
          }}
          onReasignarMesa={() => {
            setMesaParaReasignar(mesaSeleccionada);
            setMesaSeleccionada(null);
          }}
          onCerrar={() => setMesaSeleccionada(null)}
        />
      )}

      {/* M3: MODAL DETALLE DE CUENTA Y PEDIDOS */}
      {cuentaSeleccionada && !cuentaParaPedido && (
        <CuentaDetalleModal
          cuentaId={cuentaSeleccionada.id}
          onTomarPedido={(c) => {
            setCuentaParaPedido(c);
            setItemsPedidoEnCurso([]);
          }}
          onVolverMesa={() => setCuentaSeleccionada(null)}
        />
      )}

      {/* M4: MODAL MENÚ Y CATÁLOGO PARA TOMAR PEDIDO */}
      {cuentaParaPedido && !mostrandoResumen && (
        <MenuPedidoModal
          cuenta={cuentaParaPedido}
          categorias={categorias}
          productos={productos}
          itemsPedidoEnCurso={itemsPedidoEnCurso}
          onSeleccionarProducto={(prod) => {
            if (prod.es_combo) {
              setComboParaPersonalizar(prod);
            } else {
              setProductoParaPersonalizar(prod);
            }
          }}
          onVerResumen={() => setMostrandoResumen(true)}
          onVolver={() => {
            setCuentaParaPedido(null);
            setItemsPedidoEnCurso([]);
          }}
        />
      )}

      {/* M5a: PERSONALIZAR PRODUCTO INDIVIDUAL */}
      {productoParaPersonalizar && (
        <PersonalizarProductoModal
          producto={productoParaPersonalizar}
          opcionesCatalogo={opciones}
          parametros={parametros}
          onAgregar={manejarAgregarItemAPedido}
          onCerrar={() => setProductoParaPersonalizar(null)}
        />
      )}

      {/* M5b: PERSONALIZAR COMBO COMPUESTO */}
      {comboParaPersonalizar && (
        <PersonalizarComboModal
          combo={comboParaPersonalizar}
          catalogoProductos={productos}
          parametros={parametros}
          onAgregar={manejarAgregarItemAPedido}
          onCerrar={() => setComboParaPersonalizar(null)}
        />
      )}

      {/* M6: RESUMEN Y ENVÍO DEL PEDIDO */}
      {mostrandoResumen && cuentaParaPedido && (
        <ResumenPedidoModal
          cuenta={cuentaParaPedido}
          itemsPedido={itemsPedidoEnCurso}
          catalogoProductos={productos}
          onActualizarItems={setItemsPedidoEnCurso}
          onPedidoEnviado={manejarPedidoEnviado}
          onVolverMenu={() => setMostrandoResumen(false)}
        />
      )}

      {/* MODAL M9a: Reasignar mesa temporalmente */}
      {mesaParaReasignar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 150,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              padding: '1.25rem',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            }}
          >
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: '#1a202c' }}>
              Reasignar Mesa {mesaParaReasignar.numero}
            </h2>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#4a5568' }}>
              Otro mesero atenderá esta mesa temporalmente. El sistema elige automáticamente a un
              mesero disponible. Sigue siendo tu mesa.
            </p>

            {errorReasignacion && (
              <div
                style={{
                  background: '#fff5f5',
                  border: '1px solid #feb2b2',
                  color: '#c53030',
                  padding: '0.6rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  marginBottom: '0.75rem',
                }}
              >
                <strong>{errorReasignacion}</strong>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#4a5568',
                  marginBottom: '0.3rem',
                }}
              >
                Motivo:
              </label>
              <input
                type="text"
                value={motivoReasignacion}
                onChange={(e) => setMotivoReasignacion(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #cbd5e0',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={guardandoReasignacion}
                onClick={ejecutarReasignacion}
                style={{
                  background: guardandoReasignacion ? '#718096' : '#2b6cb0',
                  color: '#fff',
                  border: 'none',
                  padding: '0.65rem',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: guardandoReasignacion ? 'not-allowed' : 'pointer',
                }}
              >
                {guardandoReasignacion ? 'Reasignando...' : 'Reasignar mesa (CU7)'}
              </button>
              <button
                type="button"
                onClick={() => setMesaParaReasignar(null)}
                style={{
                  background: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  color: '#4a5568',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de salida */}
      {mostrarModalSalir && (
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
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#fff',
              padding: '1.25rem',
              borderRadius: '8px',
              maxWidth: '380px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h3
              style={{
                margin: '0 0 0.5rem',
                fontSize: '1.05rem',
                color: '#1a202c',
                fontWeight: 700,
              }}
            >
              Confirmar salida
            </h3>
            <p
              style={{
                margin: '0 0 0.75rem',
                fontSize: '0.85rem',
                color: '#4a5568',
                lineHeight: 1.5,
              }}
            >
              ¿Desea cerrar la sesión de trabajo activa de{' '}
              <b>{usuario?.nombre_completo || usuario?.nombre_usuario}</b>?
            </p>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.75rem', color: '#718096' }}>
              El estado de sus mesas asignadas y turnos se mantendrá guardado en el servidor.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setMostrarModalSalir(false)}
                style={{
                  background: '#edf2f7',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#4a5568',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salir}
                style={{
                  background: '#c53030',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 0.85rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
