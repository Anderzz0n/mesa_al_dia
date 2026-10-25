import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  obtenerUsuario,
  cerrarSesion,
  obtenerUsuarios,
  obtenerSectores,
  obtenerMesas,
  crearSector,
  asignarMeseroSector,
  crearMesa,
  reasignarMesa,
  terminarReasignacionMesa,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

export default function AdminSectores() {
  const usuario = obtenerUsuario();
  const navigate = useNavigate();

  const [subtab, setSubtab] = useState('sectores'); // 'sectores' | 'mesas'
  const [sectores, setSectores] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [meserosDisponibles, setMeserosDisponibles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [enLinea, setEnLinea] = useState(true);

  // Modales
  const [modalNuevoSector, setModalNuevoSector] = useState(false);
  const [nuevoSectorNombre, setNuevoSectorNombre] = useState('');
  const [nuevoSectorMesas, setNuevoSectorMesas] = useState([]);

  const [modalCambiarMesero, setModalCambiarMesero] = useState(null); // sectorId
  const [nuevoMeseroId, setNuevoMeseroId] = useState('');

  const [modalNuevaMesa, setModalNuevaMesa] = useState(false);
  const [nuevaMesaNumero, setNuevaMesaNumero] = useState('');
  const [nuevaMesaSectorId, setNuevaMesaSectorId] = useState('');

  const [modalReasignarMesa, setModalReasignarMesa] = useState(null); // mesa
  const [motivoReasignacion, setMotivoReasignacion] = useState('Apoyo en salón');
  const [meseroReasignadoId, setMeseroReasignadoId] = useState('');

  // Filtros de mesas
  const [filtroSector, setFiltroSector] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const cargarDatos = useCallback(async () => {
    try {
      setError(null);
      const [sec, mes, usr] = await Promise.all([
        obtenerSectores(),
        obtenerMesas(),
        obtenerUsuarios({ rol: 'MESERO', activo: true }).catch(() => []),
      ]);
      setSectores(sec);
      setMesas(mes);
      setMeserosDisponibles(usr);
    } catch (err) {
      setError(err.message || 'Error al cargar sectores y mesas');
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
    socket.on('connect', () => setEnLinea(true));
    socket.on('disconnect', () => setEnLinea(false));

    // Escuchar eventos de asignación de sector o reasignación de mesa en tiempo real
    socket.on('sector.asignacion', () => {
      cargarDatos();
    });

    socket.on('mesa.estado', () => {
      cargarDatos();
    });

    return () => {
      activo = false;
      socket.disconnect();
    };
  }, [cargarDatos]);

  async function salir() {
    await cerrarSesion();
    navigate('/login');
  }

  // Guardar nuevo sector
  async function manejarCrearSector(e) {
    e.preventDefault();
    if (!nuevoSectorNombre.trim()) {
      setError('El nombre del sector es requerido');
      return;
    }
    if (nuevoSectorMesas.length === 0) {
      setError('Debe seleccionar al menos una mesa para el sector (SECTOR_SIN_MESAS)');
      return;
    }

    try {
      setError(null);
      await crearSector({
        nombre: nuevoSectorNombre.trim(),
        mesas: nuevoSectorMesas.map(Number),
      });
      setModalNuevoSector(false);
      setNuevoSectorNombre('');
      setNuevoSectorMesas([]);
      await cargarDatos();
    } catch (err) {
      setError(err.message || 'Error al crear el sector');
    }
  }

  // Asignar mesero al sector
  async function manejarAsignarMesero(sectorId) {
    try {
      setError(null);
      await asignarMeseroSector(sectorId, nuevoMeseroId ? Number(nuevoMeseroId) : null);
      setModalCambiarMesero(null);
      setNuevoMeseroId('');
      await cargarDatos();
    } catch (err) {
      setError(err.message || 'Error al asignar mesero');
    }
  }

  // Crear nueva mesa
  async function manejarCrearMesa(e) {
    e.preventDefault();
    const num = Number(nuevaMesaNumero);
    if (!num || num <= 0) {
      setError('Número de mesa inválido');
      return;
    }

    try {
      setError(null);
      await crearMesa({
        numero: num,
        sector_id: nuevaMesaSectorId ? Number(nuevaMesaSectorId) : null,
      });
      setModalNuevaMesa(false);
      setNuevaMesaNumero('');
      setNuevaMesaSectorId('');
      await cargarDatos();
    } catch (err) {
      setError(err.message || 'Error al crear mesa');
    }
  }

  // Reasignar mesa
  async function manejarReasignarMesa(mesaId) {
    try {
      setError(null);
      await reasignarMesa(mesaId, {
        motivo: motivoReasignacion,
        mesero_id: meseroReasignadoId ? Number(meseroReasignadoId) : undefined,
      });
      setModalReasignarMesa(null);
      setMeseroReasignadoId('');
      await cargarDatos();
    } catch (err) {
      setError(err.codigo ? `[${err.codigo}] ${err.message}` : err.message);
    }
  }

  // Terminar reasignación
  async function manejarTerminarReasignacion(mesaId) {
    try {
      setError(null);
      await terminarReasignacionMesa(mesaId);
      await cargarDatos();
    } catch (err) {
      setError(err.message || 'Error al terminar reasignación');
    }
  }

  const mesasFiltradas = mesas.filter((m) => {
    if (filtroSector !== 'todos' && String(m.sector_id) !== String(filtroSector)) return false;
    if (filtroEstado !== 'todos' && m.estado !== filtroEstado) return false;
    return true;
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f7fafc', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Barra superior integrada (mismo diseño limpio que mesero) */}
      <header
        style={{
          background: '#2b6cb0',
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
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Mesa al día · Administrador</h1>
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            Usuario: {usuario?.nombre_completo || usuario?.nombre_usuario || 'admin'}
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
            onClick={salir}
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

      {/* Contenido principal */}
      <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '1.25rem 1rem', flex: 1 }}>

      {/* Pestañas principales */}
      <nav style={{ display: 'flex', gap: '0.5rem', borderBottom: '2px solid #e2e8f0', marginBottom: '1.25rem' }}>
        <button
          style={{
            padding: '0.6rem 1.2rem',
            background: 'none',
            border: 'none',
            borderBottom: '3px solid #3182ce',
            fontWeight: 700,
            color: '#2b6cb0',
            cursor: 'pointer',
          }}
        >
          Sectores y Mesas (RF2)
        </button>
      </nav>

      {/* Mensajes de error / alertas */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            color: '#c53030',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Cabecera de la sección */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: '0 0 0.25rem 0', fontSize: '1.5rem', color: '#1a202c' }}>Distribución Física y Turnos</h1>
          <p style={{ margin: 0, color: '#718096', fontSize: '0.9rem' }}>
            Gestión de sectores del restaurante, asignación de meseros y reasignaciones temporales (RF2).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setModalNuevoSector(true)}
            style={{
              background: '#3182ce',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Nuevo sector
          </button>
          <button
            onClick={() => setModalNuevaMesa(true)}
            style={{
              background: '#4a5568',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Nueva mesa
          </button>
        </div>
      </div>

      {/* Subpestañas */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => setSubtab('sectores')}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            border: subtab === 'sectores' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            background: subtab === 'sectores' ? '#ebf8ff' : '#fff',
            color: subtab === 'sectores' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sectores y asignación ({sectores.length})
        </button>
        <button
          onClick={() => setSubtab('mesas')}
          style={{
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            border: subtab === 'mesas' ? '2px solid #3182ce' : '1px solid #cbd5e0',
            background: subtab === 'mesas' ? '#ebf8ff' : '#fff',
            color: subtab === 'mesas' ? '#2b6cb0' : '#4a5568',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Mesas y reasignación ({mesas.length})
        </button>
      </div>

      {cargando ? (
        <p style={{ color: '#718096' }}>Cargando datos del restaurante...</p>
      ) : subtab === 'sectores' ? (
        /* VISTA DE SECTORES (A2a) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sectores.map((sec) => (
            <div
              key={sec.id}
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#2d3748' }}>{sec.nombre}</h2>
                  <span
                    style={{
                      background: '#edf2f7',
                      color: '#4a5568',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '12px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    {sec.total_mesas} mesas
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1rem',
                  background: sec.responsable_vigente ? '#f7fafc' : '#fff5f5',
                  border: sec.responsable_vigente ? '1px solid #edf2f7' : '1px dashed #feb2b2',
                  padding: '1rem',
                  borderRadius: '6px',
                }}
              >
                {/* Mesas pertenecientes al sector */}
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#718096' }}>
                    Mesas pertenecientes (RF2):
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {sec.mesas && sec.mesas.length > 0 ? (
                      sec.mesas.map((m) => (
                        <span
                          key={m.id}
                          style={{
                            background: '#e2e8f0',
                            padding: '0.25rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: '#2d3748',
                          }}
                        >
                          Mesa {m.numero}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: '#a0aec0' }}>Sin mesas</span>
                    )}
                  </div>
                </div>

                {/* Mesero responsable de turno */}
                <div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: sec.responsable_vigente ? '#718096' : '#c53030',
                    }}
                  >
                    Mesero responsable de turno (CU5):
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                    <div>
                      {sec.responsable_vigente ? (
                        <>
                          <strong style={{ fontSize: '1rem', color: '#2d3748', display: 'block' }}>
                            {sec.responsable_vigente.nombre_completo}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: '#718096' }}>
                            Asignado: {new Date(sec.responsable_vigente.vigente_desde).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: '#c53030', fontWeight: 700, fontSize: '0.9rem' }}>
                          Sin mesero asignado
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setModalCambiarMesero(sec.id);
                        setNuevoMeseroId(sec.responsable_vigente?.id ? String(sec.responsable_vigente.id) : '');
                      }}
                      style={{
                        background: sec.responsable_vigente ? '#edf2f7' : '#3182ce',
                        color: sec.responsable_vigente ? '#2d3748' : '#fff',
                        border: '1px solid #cbd5e0',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                      }}
                    >
                      {sec.responsable_vigente ? 'Cambiar mesero ›' : 'Asignar mesero ›'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* VISTA DE MESAS Y REASIGNACIÓN TEMPORAL (A2c) */
        <div>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.85rem', color: '#4a5568' }}>
              Sector:{' '}
              <select
                value={filtroSector}
                onChange={(e) => setFiltroSector(e.target.value)}
                style={{ padding: '0.35rem 0.6rem', borderRadius: '4px', border: '1px solid #cbd5e0' }}
              >
                <option value="todos">Todos los sectores</option>
                {sectores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: '0.85rem', color: '#4a5568' }}>
              Estado operativo:{' '}
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                style={{ padding: '0.35rem 0.6rem', borderRadius: '4px', border: '1px solid #cbd5e0' }}
              >
                <option value="todos">Todos los estados</option>
                <option value="DISPONIBLE">Libre (Disponible)</option>
                <option value="OCUPADA">Ocupada</option>
                <option value="CON_PEDIDOS_PENDIENTES">Con pedidos pendientes</option>
                <option value="EN_PROCESO_DE_PAGO">En proceso de pago</option>
              </select>
            </label>
          </div>

          {/* Tabla de mesas */}
          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0', color: '#4a5568' }}>
                <tr>
                  <th style={{ padding: '0.75rem 1rem' }}>Mesa</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Sector</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Estado operativo</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Mesero titular (sector)</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Mesero atendiendo ahora</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mesasFiltradas.map((m) => {
                  const tieneReasignacion = Boolean(m.reasignacion);
                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: '1px solid #edf2f7',
                        background: tieneReasignacion ? '#fffbe6' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Mesa {m.numero}</td>
                      <td style={{ padding: '0.75rem 1rem', color: '#4a5568' }}>{m.sector_nombre || 'Sin sector'}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            background:
                              m.estado === 'DISPONIBLE'
                                ? '#c6f6d5'
                                : m.estado === 'OCUPADA'
                                ? '#feebc8'
                                : m.estado === 'CON_PEDIDOS_PENDIENTES'
                                ? '#e2e8f0'
                                : '#fed7d7',
                            color:
                              m.estado === 'DISPONIBLE'
                                ? '#22543d'
                                : m.estado === 'OCUPADA'
                                ? '#744210'
                                : m.estado === 'CON_PEDIDOS_PENDIENTES'
                                ? '#2d3748'
                                : '#742a2a',
                          }}
                        >
                          {m.estado}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {m.mesero_titular ? m.mesero_titular.nombre_completo : <span style={{ color: '#e53e3e' }}>Sin asignar</span>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {tieneReasignacion ? (
                          <div>
                            <strong>{m.mesero_actual?.nombre_completo}</strong>{' '}
                            <span
                              style={{
                                background: '#2d3748',
                                color: '#fff',
                                padding: '0.1rem 0.4rem',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                marginLeft: '0.3rem',
                              }}
                            >
                              REASIGNADA
                            </span>
                            <div style={{ fontSize: '0.75rem', color: '#718096' }}>Motivo: {m.reasignacion.motivo}</div>
                          </div>
                        ) : m.mesero_actual ? (
                          m.mesero_actual.nombre_completo
                        ) : (
                          <span style={{ color: '#a0aec0' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        {tieneReasignacion ? (
                          <button
                            onClick={() => manejarTerminarReasignacion(m.id)}
                            style={{
                              background: '#fed7d7',
                              border: '1px solid #feb2b2',
                              color: '#9b2c2c',
                              padding: '0.3rem 0.6rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            Terminar reasignación
                          </button>
                        ) : (
                          <button
                            onClick={() => setModalReasignarMesa(m)}
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
                            Reasignar ›
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo Sector (A2b) */}
      {modalNuevoSector && (
        <div
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
              maxWidth: '450px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#2d3748' }}>Nuevo Sector</h2>
            <form onSubmit={manejarCrearSector}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Nombre del sector:
                </label>
                <input
                  type="text"
                  value={nuevoSectorNombre}
                  onChange={(e) => setNuevoSectorNombre(e.target.value)}
                  placeholder="Ej. Terraza Norte, Salón VIP..."
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Seleccione mesas pertenecientes (mínimo 1):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                  {mesas.map((m) => {
                    const sel = nuevoSectorMesas.includes(m.numero);
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => {
                          if (sel) {
                            setNuevoSectorMesas(nuevoSectorMesas.filter((n) => n !== m.numero));
                          } else {
                            setNuevoSectorMesas([...nuevoSectorMesas, m.numero]);
                          }
                        }}
                        style={{
                          padding: '0.4rem',
                          background: sel ? '#3182ce' : '#edf2f7',
                          color: sel ? '#fff' : '#2d3748',
                          border: '1px solid #cbd5e0',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                        }}
                      >
                        Mesa {m.numero}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setModalNuevoSector(false)}
                  style={{ background: '#edf2f7', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Crear Sector
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cambiar / Asignar Mesero a Sector */}
      {modalCambiarMesero && (
        <div
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
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#2d3748' }}>Asignar Mesero a Sector</h2>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                Mesero responsable:
              </label>
              <select
                value={nuevoMeseroId}
                onChange={(e) => setNuevoMeseroId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              >
                <option value="">-- Sin mesero (Liberar sector) --</option>
                {meserosDisponibles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre_completo} ({m.nombre_usuario})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setModalCambiarMesero(null)}
                style={{ background: '#edf2f7', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => manejarAsignarMesero(modalCambiarMesero)}
                style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                Guardar asignación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nueva Mesa */}
      {modalNuevaMesa && (
        <div
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
              maxWidth: '380px',
              width: '100%',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#2d3748' }}>Nueva Mesa</h2>
            <form onSubmit={manejarCrearMesa}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Número de mesa:
                </label>
                <input
                  type="number"
                  min="1"
                  value={nuevaMesaNumero}
                  onChange={(e) => setNuevaMesaNumero(e.target.value)}
                  placeholder="Ej. 13"
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Sector asignado:
                </label>
                <select
                  value={nuevaMesaSectorId}
                  onChange={(e) => setNuevaMesaSectorId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '4px' }}
                >
                  <option value="">-- Sin sector asignado --</option>
                  {sectores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setModalNuevaMesa(false)}
                  style={{ background: '#edf2f7', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Crear Mesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reasignar Mesa Temporalmente (CU7) */}
      {modalReasignarMesa && (
        <div
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
            }}
          >
            <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#2d3748' }}>
              Reasignar Mesa {modalReasignarMesa.numero}
            </h2>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#718096' }}>
              Otro mesero atenderá temporalmente esta mesa. El sistema seleccionará a un mesero activo disponible.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                Asignar a mesero específico (opcional):
              </label>
              <select
                value={meseroReasignadoId}
                onChange={(e) => setMeseroReasignadoId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              >
                <option value="">-- Automático (servidor selecciona mesero disponible) --</option>
                {meserosDisponibles.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre_completo} ({m.nombre_usuario})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                Motivo de la reasignación:
              </label>
              <input
                type="text"
                value={motivoReasignacion}
                onChange={(e) => setMotivoReasignacion(e.target.value)}
                placeholder="Ej. Apoyo en salón, cambio de turno..."
                style={{ width: '100%', padding: '0.5rem', border: '1px solid #cbd5e0', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setModalReasignarMesa(null)}
                style={{ background: '#edf2f7', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => manejarReasignarMesa(modalReasignarMesa.id)}
                style={{ background: '#3182ce', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
              >
                Confirmar reasignación
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
