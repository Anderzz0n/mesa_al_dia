import { useState, useMemo } from 'react';
import { crearUsuario, actualizarUsuario, restablecerContrasenaUsuario } from '../api.js';

const ROLES = ['ADMIN', 'MESERO', 'COCINA', 'BAR', 'CAJA'];

export default function AdminPersonal({
  usuarios = [],
  sectores = [],
  usuarioActual = null,
  onRecargar = () => {},
}) {
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('TODOS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS'); // 'TODOS' | 'ACTIVO' | 'INACTIVO'

  // Modales
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalEditar, setModalEditar] = useState(null); // usuario a editar
  const [modalClave, setModalClave] = useState(null); // usuario a restablecer clave

  // Estado del formulario Nuevo Usuario
  const [nuevoNombreCompleto, setNuevoNombreCompleto] = useState('');
  const [nuevoNombreUsuario, setNuevoNombreUsuario] = useState('');
  const [nuevoRol, setNuevoRol] = useState('MESERO');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');

  // Estado del formulario Editar Usuario
  const [editNombreCompleto, setEditNombreCompleto] = useState('');
  const [editRol, setEditRol] = useState('MESERO');
  const [editActivo, setEditActivo] = useState(true);

  // Estado del formulario Clave
  const [claveNueva, setClaveNueva] = useState('');
  const [claveConfirmar, setClaveConfirmar] = useState('');

  // Notificaciones y errores locales
  const [mensajeExito, setMensajeExito] = useState(null);
  const [errorModal, setErrorModal] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // Mapa de sectores asignados a meseros para el detalle operativo (CU5 / A1a)
  const mapaSectoresMesero = useMemo(() => {
    const mapa = {};
    for (const sec of sectores) {
      if (sec.responsable_vigente?.id) {
        mapa[sec.responsable_vigente.id] = sec.nombre;
      }
    }
    return mapa;
  }, [sectores]);

  // Filtrado de usuarios
  const usuariosFiltrados = useMemo(() => {
    return usuarios.filter((u) => {
      // Filtro de búsqueda
      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const coincideNombre = u.nombre_completo.toLowerCase().includes(q);
        const coincideLogin = u.nombre_usuario.toLowerCase().includes(q);
        if (!coincideNombre && !coincideLogin) return false;
      }
      // Filtro de rol
      if (filtroRol !== 'TODOS' && u.rol.toUpperCase() !== filtroRol.toUpperCase()) {
        return false;
      }
      // Filtro de estado
      if (filtroEstado === 'ACTIVO' && !u.activo) return false;
      if (filtroEstado === 'INACTIVO' && u.activo) return false;

      return true;
    });
  }, [usuarios, busqueda, filtroRol, filtroEstado]);

  const totalActivos = usuarios.filter((u) => u.activo).length;
  const totalInactivos = usuarios.filter((u) => !u.activo).length;

  function abrirModalNuevo() {
    setNuevoNombreCompleto('');
    setNuevoNombreUsuario('');
    setNuevoRol('MESERO');
    setNuevaContrasena('');
    setConfirmarContrasena('');
    setErrorModal(null);
    setModalNuevo(true);
  }

  function abrirModalEditar(u) {
    setModalEditar(u);
    setEditNombreCompleto(u.nombre_completo);
    setEditRol(u.rol);
    setEditActivo(u.activo);
    setErrorModal(null);
  }

  function abrirModalClave(u) {
    setModalClave(u);
    setClaveNueva('');
    setClaveConfirmar('');
    setErrorModal(null);
  }

  function mostrarExito(texto) {
    setMensajeExito(texto);
    setTimeout(() => setMensajeExito(null), 4000);
  }

  // Guardar nuevo usuario (CU1)
  async function manejarCrearUsuario(e) {
    e.preventDefault();
    setErrorModal(null);

    if (!nuevoNombreCompleto.trim() || nuevoNombreCompleto.trim().length < 3) {
      setErrorModal('El nombre completo debe tener al menos 3 caracteres');
      return;
    }
    if (!nuevoNombreUsuario.trim() || nuevoNombreUsuario.trim().length < 3) {
      setErrorModal('El nombre de usuario debe tener al menos 3 caracteres');
      return;
    }
    if (!nuevaContrasena || nuevaContrasena.length < 6) {
      setErrorModal('La contraseña inicial debe tener al menos 6 caracteres');
      return;
    }
    if (nuevaContrasena !== confirmarContrasena) {
      setErrorModal('Las contraseñas no coinciden');
      return;
    }

    setGuardando(true);
    try {
      await crearUsuario({
        nombre_usuario: nuevoNombreUsuario.trim(),
        nombre_completo: nuevoNombreCompleto.trim(),
        rol: nuevoRol,
        contrasena: nuevaContrasena,
      });
      setModalNuevo(false);
      mostrarExito(`Usuario ${nuevoNombreUsuario.trim()} registrado exitosamente`);
      await onRecargar();
    } catch (err) {
      setErrorModal(err.message || 'Error al crear el usuario');
    } finally {
      setGuardando(false);
    }
  }

  // Guardar edición de usuario (CU1)
  async function manejarGuardarEdicion(e) {
    e.preventDefault();
    if (!modalEditar) return;
    setErrorModal(null);

    if (!editNombreCompleto.trim() || editNombreCompleto.trim().length < 3) {
      setErrorModal('El nombre completo debe tener al menos 3 caracteres');
      return;
    }

    setGuardando(true);
    try {
      await actualizarUsuario(modalEditar.id, {
        nombre_completo: editNombreCompleto.trim(),
        rol: editRol,
        activo: editActivo,
      });
      setModalEditar(null);
      mostrarExito(`Usuario ${modalEditar.nombre_usuario} actualizado exitosamente`);
      await onRecargar();
    } catch (err) {
      setErrorModal(err.message || 'Error al actualizar usuario');
    } finally {
      setGuardando(false);
    }
  }

  // Guardar restablecimiento de contraseña (RF1 / CU1)
  async function manejarRestablecerClave(e) {
    e.preventDefault();
    if (!modalClave) return;
    setErrorModal(null);

    if (!claveNueva || claveNueva.length < 6) {
      setErrorModal('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (claveNueva !== claveConfirmar) {
      setErrorModal('Las contraseñas no coinciden');
      return;
    }

    setGuardando(true);
    try {
      await restablecerContrasenaUsuario(modalClave.id, claveNueva);
      setModalClave(null);
      mostrarExito(`Contraseña de ${modalClave.nombre_usuario} restablecida exitosamente`);
    } catch (err) {
      setErrorModal(err.message || 'Error al restablecer contraseña');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Mensaje de éxito temporal */}
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

      {/* Cabecera de la sección y barra de control (A1a) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          background: '#fff',
          padding: '1rem 1.25rem',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1a202c', fontWeight: 700 }}>
            Usuarios y accesos{' '}
            <span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#718096' }}>
              ({totalActivos} activos · {totalInactivos} inactivos)
            </span>
          </h2>
          <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
            Gestión de credenciales, roles y accesos del personal del restaurante
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem' }}>
          {/* Buscador */}
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o usuario..."
            aria-label="Buscar por nombre o usuario"
            style={{
              padding: '0.45rem 0.75rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '0.85rem',
              minWidth: '220px',
            }}
          />

          {/* Filtro por rol */}
          <select
            value={filtroRol}
            onChange={(e) => setFiltroRol(e.target.value)}
            aria-label="Filtrar por rol"
            style={{
              padding: '0.45rem 0.6rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '0.85rem',
              background: '#fff',
            }}
          >
            <option value="TODOS">Rol: Todos</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {/* Filtro por estado */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            aria-label="Filtrar por estado"
            style={{
              padding: '0.45rem 0.6rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '0.85rem',
              background: '#fff',
            }}
          >
            <option value="TODOS">Estado: Todos</option>
            <option value="ACTIVO">Solo Activos</option>
            <option value="INACTIVO">Solo Inactivos</option>
          </select>

          {/* Botón nuevo usuario */}
          <button
            onClick={abrirModalNuevo}
            style={{
              background: '#2b6cb0',
              color: '#fff',
              border: 'none',
              padding: '0.45rem 0.9rem',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + Nuevo usuario
          </button>
        </div>
      </div>

      {/* Tabla de usuarios (A1a) */}
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.875rem',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr style={{ background: '#f7fafc', borderBottom: '2px solid #edf2f7', color: '#4a5568' }}>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Nombre</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Usuario (login)</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Rol</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Estado</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Detalle operativo</th>
              <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuariosFiltrados.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: '#a0aec0' }}>
                  No se encontraron usuarios con los filtros aplicados.
                </td>
              </tr>
            ) : (
              usuariosFiltrados.map((u) => {
                const esPropioAdmin = usuarioActual?.id === u.id;
                const asignacionMesero = u.rol === 'MESERO' ? mapaSectoresMesero[u.id] : null;

                return (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid #edf2f7',
                      background: u.activo ? 'transparent' : '#fcfcfc',
                      opacity: u.activo ? 1 : 0.65,
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#2d3748' }}>
                      {u.nombre_completo}
                      {esPropioAdmin && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.7rem',
                            background: '#ebf8ff',
                            color: '#2b6cb0',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 500,
                          }}
                        >
                          Tú
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#4a5568' }}>
                      {u.nombre_usuario}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background:
                            u.rol === 'ADMIN'
                              ? '#2d3748'
                              : u.rol === 'MESERO'
                              ? '#bee3f8'
                              : u.rol === 'COCINA'
                              ? '#feebc8'
                              : u.rol === 'BAR'
                              ? '#e9d8fd'
                              : '#c6f6d5',
                          color:
                            u.rol === 'ADMIN'
                              ? '#fff'
                              : u.rol === 'MESERO'
                              ? '#2b6cb0'
                              : u.rol === 'COCINA'
                              ? '#c05621'
                              : u.rol === 'BAR'
                              ? '#6b46c1'
                              : '#22543d',
                        }}
                      >
                        {u.rol}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: u.activo ? '#c6f6d5' : '#fed7d7',
                          color: u.activo ? '#22543d' : '#9b2c2c',
                        }}
                      >
                        {u.activo ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#718096' }}>
                      {u.rol === 'ADMIN' && 'Acceso total al sistema'}
                      {u.rol === 'CAJA' && 'Estación de caja y cobros'}
                      {u.rol === 'COCINA' && 'Pantalla y comandería de cocina'}
                      {u.rol === 'BAR' && 'Pantalla y comandería de bar'}
                      {u.rol === 'MESERO' && (
                        <span>
                          {asignacionMesero ? (
                            <span>
                              Responsable:{' '}
                              <strong style={{ color: '#2d3748' }}>{asignacionMesero}</strong>
                            </span>
                          ) : (
                            <span style={{ color: '#a0aec0' }}>Sin sector asignado actualmente</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => abrirModalEditar(u)}
                        style={{
                          background: '#edf2f7',
                          color: '#2d3748',
                          border: 'none',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          marginRight: '0.4rem',
                        }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => abrirModalClave(u)}
                        style={{
                          background: '#f7fafc',
                          color: '#4a5568',
                          border: '1px solid #cbd5e0',
                          padding: '0.3rem 0.6rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                        }}
                      >
                        Clave
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Nuevo Usuario (A1b / CU1) */}
      {modalNuevo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                  Crear nuevo empleado
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                  Registro de cuenta de acceso y asignación de rol inicial (CU1)
                </div>
              </div>
              <button
                onClick={() => setModalNuevo(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  color: '#718096',
                  cursor: 'pointer',
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
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  marginTop: '1rem',
                }}
              >
                {errorModal}
              </div>
            )}

            <form onSubmit={manejarCrearUsuario} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  value={nuevoNombreCompleto}
                  onChange={(e) => setNuevoNombreCompleto(e.target.value)}
                  placeholder="Ej. Camila Reyes"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Nombre de usuario (login único)
                </label>
                <input
                  type="text"
                  required
                  value={nuevoNombreUsuario}
                  onChange={(e) => setNuevoNombreUsuario(e.target.value)}
                  placeholder="Ej. camila"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
                  Identificador para inicio de sesión en el sistema.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Rol en el sistema
                </label>
                <select
                  value={nuevoRol}
                  onChange={(e) => setNuevoRol(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                    Contraseña inicial
                  </label>
                  <input
                    type="password"
                    required
                    value={nuevaContrasena}
                    onChange={(e) => setNuevaContrasena(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #cbd5e0',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmarContrasena}
                    onChange={(e) => setConfirmarContrasena(e.target.value)}
                    placeholder="Repetir contraseña"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      border: '1px solid #cbd5e0',
                      borderRadius: '6px',
                      fontSize: '0.9rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setModalNuevo(false)}
                  style={{
                    background: '#edf2f7',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
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
                    background: '#2b6cb0',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    opacity: guardando ? 0.7 : 1,
                  }}
                >
                  {guardando ? 'Guardando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuario (A1b / CU1) */}
      {modalEditar && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              maxWidth: '520px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                  Editar usuario · {modalEditar.nombre_usuario}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                  ID: {modalEditar.id} · Creado: {modalEditar.creado_en ? new Date(modalEditar.creado_en).toLocaleDateString() : 'N/D'}
                </div>
              </div>
              <button
                onClick={() => setModalEditar(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  color: '#718096',
                  cursor: 'pointer',
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
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  marginTop: '1rem',
                }}
              >
                {errorModal}
              </div>
            )}

            <form onSubmit={manejarGuardarEdicion} style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Nombre completo
                </label>
                <input
                  type="text"
                  required
                  value={editNombreCompleto}
                  onChange={(e) => setEditNombreCompleto(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Nombre de usuario (login)
                </label>
                <input
                  type="text"
                  disabled
                  value={modalEditar.nombre_usuario}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #e2e8f0',
                    background: '#f7fafc',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    color: '#718096',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#a0aec0', marginTop: '0.2rem' }}>
                  El identificador de login no se puede modificar una vez creado.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Rol en el sistema
                </label>
                <select
                  value={editRol}
                  disabled={usuarioActual?.id === modalEditar.id}
                  onChange={(e) => setEditRol(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    background: usuarioActual?.id === modalEditar.id ? '#f7fafc' : '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {usuarioActual?.id === modalEditar.id && (
                  <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
                    No puede remover su propio rol de administrador.
                  </div>
                )}
              </div>

              <div
                style={{
                  background: '#f7fafc',
                  border: '1px solid #edf2f7',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2d3748' }}>
                    Estado del acceso
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                    {editActivo ? 'El usuario puede iniciar sesión' : 'Acceso bloqueado (baja lógica)'}
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: usuarioActual?.id === modalEditar.id ? 'not-allowed' : 'pointer' }}>
                  <input
                    type="checkbox"
                    disabled={usuarioActual?.id === modalEditar.id}
                    checked={editActivo}
                    onChange={(e) => setEditActivo(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ marginLeft: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                    {editActivo ? 'Activo' : 'Inactivo'}
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setModalEditar(null)}
                  style={{
                    background: '#edf2f7',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
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
                    background: '#2b6cb0',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    opacity: guardando ? 0.7 : 1,
                  }}
                >
                  {guardando ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Restablecer Contraseña (A1b / RF1) */}
      {modalClave && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '8px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                  Restablecer contraseña
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#718096', marginTop: '0.2rem' }}>
                  Usuario: <strong>{modalClave.nombre_usuario}</strong> ({modalClave.nombre_completo})
                </div>
              </div>
              <button
                onClick={() => setModalClave(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  color: '#718096',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: '0.8rem',
                color: '#4a5568',
                background: '#ebf8ff',
                padding: '0.6rem 0.8rem',
                borderRadius: '6px',
                marginTop: '0.9rem',
              }}
            >
              Las contraseñas anteriores no son visibles por privacidad (bcrypt). Ingrese una nueva contraseña para permitir el acceso al empleado.
            </div>

            {errorModal && (
              <div
                role="alert"
                style={{
                  background: '#fff5f5',
                  border: '1px solid #feb2b2',
                  color: '#c53030',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  marginTop: '0.9rem',
                }}
              >
                {errorModal}
              </div>
            )}

            <form onSubmit={manejarRestablecerClave} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Nueva contraseña
                </label>
                <input
                  type="password"
                  required
                  value={claveNueva}
                  onChange={(e) => setClaveNueva(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.3rem' }}>
                  Confirmar nueva contraseña
                </label>
                <input
                  type="password"
                  required
                  value={claveConfirmar}
                  onChange={(e) => setClaveConfirmar(e.target.value)}
                  placeholder="Repetir nueva contraseña"
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setModalClave(null)}
                  style={{
                    background: '#edf2f7',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
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
                    background: '#2b6cb0',
                    color: '#fff',
                    border: 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: guardando ? 'not-allowed' : 'pointer',
                    opacity: guardando ? 0.7 : 1,
                  }}
                >
                  {guardando ? 'Actualizando...' : 'Restablecer clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
