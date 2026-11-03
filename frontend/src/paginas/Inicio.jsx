import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { obtenerUsuario, iniciarSesion, cerrarSesion } from '../api.js';

const USUARIOS_ACCESO_RAPIDO = [
  {
    rol: 'ADMIN',
    titulo: 'Administrador',
    usuario: 'admin',
    clave: '123456',
    nombre: 'Anderson Rincón',
    descripcion: 'Parámetros, menú, sectores, restricciones y supervisión',
    ruta: '/admin',
    color: '#2b6cb0',
    colorFondo: '#ebf8ff',
  },
  {
    rol: 'MESERO',
    titulo: 'Mesero (Móvil)',
    usuario: 'miguel',
    clave: '123456',
    nombre: 'Miguel Angulo',
    descripcion: 'Toma de pedidos, mesas asignadas, comandas y preparados',
    ruta: '/mesero',
    color: '#2b6cb0',
    colorFondo: '#ebf8ff',
  },
  {
    rol: 'CAJA',
    titulo: 'Caja',
    usuario: 'simon',
    clave: '123456',
    nombre: 'Simón Ruedas',
    descripcion: 'Liquidación de cuentas, división equitativa y cancelaciones',
    ruta: '/caja',
    color: '#2b6cb0',
    colorFondo: '#ebf8ff',
  },
  {
    rol: 'COCINA',
    titulo: 'Cocina',
    usuario: 'cocina',
    clave: '123456',
    nombre: 'Carlos Chef',
    descripcion: 'Tablero Kanban de platos, confirmación y preparados',
    ruta: '/cocina',
    color: '#2b6cb0',
    colorFondo: '#ebf8ff',
  },
  {
    rol: 'BAR',
    titulo: 'Bar',
    usuario: 'bar',
    clave: '123456',
    nombre: 'Diana Bartender',
    descripcion: 'Tablero Kanban de bebidas y despacho de barra',
    ruta: '/bar',
    color: '#2b6cb0',
    colorFondo: '#ebf8ff',
  },
];

export default function Inicio() {
  const [usuario, setUsuario] = useState(() => obtenerUsuario());
  const [cargandoRol, setCargandoRol] = useState(null);
  const [error, setError] = useState(null);
  const [mostrarLoginManual, setMostrarLoginManual] = useState(false);
  const [usuarioManual, setUsuarioManual] = useState('');
  const [claveManual, setClaveManual] = useState('');
  const [cargandoManual, setCargandoManual] = useState(false);
  const navigate = useNavigate();

  async function entrarRapido(item) {
    setError(null);
    setCargandoRol(item.rol);
    try {
      await iniciarSesion(item.usuario, item.clave);
      setUsuario(obtenerUsuario());
      navigate(item.ruta);
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión rápida');
    } finally {
      setCargandoRol(null);
    }
  }

  async function manejarLoginManual(e) {
    e.preventDefault();
    if (!usuarioManual.trim() || !claveManual) return;
    setError(null);
    setCargandoManual(true);
    try {
      const res = await iniciarSesion(usuarioManual.trim(), claveManual);
      const rol = res.usuario?.rol?.toLowerCase();
      setUsuario(res.usuario);
      if (rol === 'admin') navigate('/admin');
      else if (rol === 'caja') navigate('/caja');
      else if (rol === 'mesero') navigate('/mesero');
      else if (rol === 'cocina') navigate('/cocina');
      else if (rol === 'bar') navigate('/bar');
      else navigate('/');
    } catch (err) {
      setError(err.message || 'Error al autenticar usuario');
    } finally {
      setCargandoManual(false);
    }
  }

  async function salir() {
    await cerrarSesion();
    setUsuario(null);
  }

  const accesoActual = usuario
    ? USUARIOS_ACCESO_RAPIDO.find((u) => u.rol === usuario.rol)
    : null;

  return (
    <main
      className="pagina"
      style={{
        maxWidth: '38rem',
        margin: '0 auto',
        padding: '1.5rem 1rem 3rem',
        boxSizing: 'border-box',
      }}
    >
      {/* Cabecera limpia */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '1rem',
          gap: '0.75rem',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.7rem',
              fontWeight: 800,
              color: '#1a202c',
              letterSpacing: '-0.02em',
            }}
          >
            Mesa al día
          </h1>
          <p style={{ margin: '0.2rem 0 0', color: '#718096', fontSize: '0.88rem' }}>
            Sistema de Gestión para Restaurantes
          </p>
        </div>

        {usuario && (
          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                fontSize: '0.82rem',
                color: '#2d3748',
                display: 'block',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {usuario.nombre_completo}
            </span>
            <button
              type="button"
              onClick={salir}
              style={{
                marginTop: '0.25rem',
                fontSize: '0.72rem',
                padding: '0.25rem 0.55rem',
                background: '#edf2f7',
                border: '1px solid #cbd5e0',
                borderRadius: '4px',
                cursor: 'pointer',
                color: '#4a5568',
                fontWeight: 600,
              }}
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </header>

      {/* Alerta de error */}
      {error && (
        <div
          role="alert"
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            color: '#c53030',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Banner de sesión activa */}
      {usuario && accesoActual && (
        <section
          style={{
            background: '#ebf8ff',
            border: '1px solid #bee3f8',
            borderRadius: '10px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#2b6cb0',
                background: '#bee3f8',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                letterSpacing: '0.04em',
              }}
            >
              {usuario.rol}
            </span>
            <strong style={{ color: '#2b6cb0', fontSize: '1.05rem' }}>
              Sesión activa: {usuario.nombre_completo}
            </strong>
          </div>
          <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.85rem', color: '#2c5282' }}>
            Tienes una sesión iniciada con este rol. Puedes ingresar directamente:
          </p>
          <button
            type="button"
            onClick={() => navigate(accesoActual.ruta)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              background: '#2b6cb0',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
            }}
          >
            Abrir mi pantalla ({accesoActual.titulo}) →
          </button>
        </section>
      )}

      {/* Menú de Acceso Rápido */}
      <section style={{ marginBottom: '2rem' }}>
        <div style={{ marginBottom: '0.85rem' }}>
          <h2
            style={{
              margin: 0,
              fontSize: '1.15rem',
              fontWeight: 700,
              color: '#1a202c',
            }}
          >
            Menú de acceso rápido
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: '#718096', fontSize: '0.85rem' }}>
            Selecciona el rol con el que deseas ingresar al sistema:
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {USUARIOS_ACCESO_RAPIDO.map((item) => {
            const esCargando = cargandoRol === item.rol;
            const esSesionActual = usuario?.rol === item.rol;

            return (
              <button
                key={item.rol}
                type="button"
                onClick={() => entrarRapido(item)}
                disabled={Boolean(cargandoRol)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  background: esSesionActual ? '#ebf8ff' : '#ffffff',
                  border: esSesionActual ? '2px solid #2b6cb0' : '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: cargandoRol ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '46px',
                      height: '46px',
                      borderRadius: '8px',
                      background: '#edf2f7',
                      color: '#2b6cb0',
                      fontWeight: 800,
                      fontSize: '0.72rem',
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    {item.rol}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.98rem', color: '#1a202c' }}>
                        {item.titulo}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '0.1rem 0.4rem',
                          background: '#edf2f7',
                          color: '#4a5568',
                          borderRadius: '4px',
                          fontWeight: 700,
                        }}
                      >
                        {item.usuario}
                      </span>
                      {esSesionActual && (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.1rem 0.4rem',
                            background: '#c6f6d5',
                            color: '#22543d',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }}
                        >
                          Sesión activa
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        display: 'block',
                        fontSize: '0.78rem',
                        color: '#718096',
                        marginTop: '0.15rem',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.descripcion}
                    </span>
                  </div>
                </div>

                <div style={{ flexShrink: 0, marginLeft: '0.5rem', textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#2b6cb0',
                    }}
                  >
                    {esCargando ? 'Entrando...' : 'Entrar ›'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Ingreso manual opcional para cuentas personalizadas */}
      <section
        style={{
          borderTop: '1px solid #e2e8f0',
          paddingTop: '1.25rem',
        }}
      >
        <button
          type="button"
          onClick={() => setMostrarLoginManual((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: '#4a5568',
            fontSize: '0.85rem',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            fontWeight: 600,
          }}
        >
          <span>{mostrarLoginManual ? '▼' : '▶'}</span>
          <span>Iniciar sesión con otro usuario</span>
        </button>

        {mostrarLoginManual && (
          <form
            onSubmit={manejarLoginManual}
            style={{
              marginTop: '1rem',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1.25rem',
            }}
          >
            <div style={{ marginBottom: '0.85rem' }}>
              <label
                htmlFor="usuario-manual"
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#4a5568',
                  marginBottom: '0.25rem',
                }}
              >
                Usuario:
              </label>
              <input
                id="usuario-manual"
                type="text"
                value={usuarioManual}
                onChange={(e) => setUsuarioManual(e.target.value)}
                placeholder="Nombre de usuario"
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

            <div style={{ marginBottom: '1rem' }}>
              <label
                htmlFor="clave-manual"
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#4a5568',
                  marginBottom: '0.25rem',
                }}
              >
                Contraseña:
              </label>
              <input
                id="clave-manual"
                type="password"
                value={claveManual}
                onChange={(e) => setClaveManual(e.target.value)}
                placeholder="Contraseña"
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

            <button
              type="submit"
              disabled={cargandoManual}
              style={{
                width: '100%',
                padding: '0.6rem',
                background: cargandoManual ? '#718096' : '#2b6cb0',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: cargandoManual ? 'not-allowed' : 'pointer',
              }}
            >
              {cargandoManual ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
