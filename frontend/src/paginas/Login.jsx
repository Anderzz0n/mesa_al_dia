import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { iniciarSesion } from '../api.js';

const CREDENCIALES_DEMO = [
  { usuario: 'admin', clave: '123456', rol: 'ADMIN', nombre: 'Anderson Rincón (Admin)' },
  { usuario: 'simon', clave: '123456', rol: 'CAJA', nombre: 'Simón Ruedas (Caja)' },
  { usuario: 'miguel', clave: '123456', rol: 'MESERO', nombre: 'Miguel Angulo (Mesero)' },
  { usuario: 'cocina', clave: '123456', rol: 'COCINA', nombre: 'Carlos Chef (Cocina)' },
  { usuario: 'bar', clave: '123456', rol: 'BAR', nombre: 'Diana Bartender (Bar)' },
  { usuario: 'inactivo', clave: '123456', rol: 'INACTIVO', nombre: 'Prueba Usuario Inactivo' },
];

export default function Login() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  async function manejarSubmit(e) {
    if (e) e.preventDefault();
    if (!nombreUsuario || !contrasena) {
      setError({ mensaje: 'Por favor complete el usuario y la contraseña' });
      return;
    }

    setError(null);
    setCargando(true);

    try {
      const res = await iniciarSesion(nombreUsuario, contrasena);
      const rol = res.usuario?.rol?.toLowerCase();
      // Redirección automática según rol asignado (RF1)
      if (rol === 'admin') navigate('/admin');
      else if (rol === 'caja') navigate('/caja');
      else if (rol === 'mesero') navigate('/mesero');
      else if (rol === 'cocina') navigate('/cocina');
      else if (rol === 'bar') navigate('/bar');
      else navigate('/');
    } catch (err) {
      setError({
        codigo: err.codigo,
        mensaje: err.message || 'Error al autenticar',
      });
    } finally {
      setCargando(false);
    }
  }

  function cargarDemo(demo) {
    setNombreUsuario(demo.usuario);
    setContrasena(demo.clave);
    setError(null);
  }

  return (
    <main className="pagina" style={{ maxWidth: '32rem', marginTop: '2rem' }}>
      <header style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.8rem', color: '#1a202c' }}>Mesa al día</h1>
        <p style={{ margin: 0, color: '#4a5568', fontSize: '0.95rem' }}>
          Sistema de gestión de restaurante · Inicio de Sesión (RF1)
        </p>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
            color: '#c53030',
            fontSize: '0.9rem',
          }}
        >
          <strong>{error.codigo ? `[${error.codigo}] ` : ''}</strong>
          {error.mensaje}
        </div>
      )}

      <form
        onSubmit={manejarSubmit}
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <label
            htmlFor="usuario"
            style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#2d3748', marginBottom: '0.35rem' }}
          >
            Nombre de usuario:
          </label>
          <input
            id="usuario"
            type="text"
            value={nombreUsuario}
            onChange={(e) => setNombreUsuario(e.target.value)}
            placeholder="Ej. admin, miguel, simon..."
            autoFocus
            style={{
              width: '100%',
              padding: '0.65rem 0.75rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '0.95rem',
            }}
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <label
            htmlFor="contrasena"
            style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#2d3748', marginBottom: '0.35rem' }}
          >
            Contraseña:
          </label>
          <input
            id="contrasena"
            type="password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            placeholder="Contraseña"
            style={{
              width: '100%',
              padding: '0.65rem 0.75rem',
              border: '1px solid #cbd5e0',
              borderRadius: '6px',
              fontSize: '0.95rem',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={cargando}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: cargando ? '#718096' : '#2b6cb0',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: cargando ? 'not-allowed' : 'pointer',
          }}
        >
          {cargando ? 'Ingresando...' : 'Iniciar Sesión'}
        </button>
      </form>

      <section style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontSize: '0.9rem', color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          Acceso rápido / Usuarios de prueba
        </h3>
        <p style={{ fontSize: '0.8rem', color: '#718096', margin: '0 0 0.75rem 0' }}>
          Haz clic en cualquier rol para rellenar usuario y contraseña de prueba:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          {CREDENCIALES_DEMO.map((demo) => (
            <button
              key={demo.usuario}
              type="button"
              onClick={() => cargarDemo(demo)}
              style={{
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                border: '1px solid #e2e8f0',
                background: '#f7fafc',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ fontWeight: 600, color: '#2d3748', display: 'block' }}>
                {demo.rol}
              </span>
              <span style={{ color: '#718096', fontSize: '0.75rem' }}>{demo.usuario}</span>
            </button>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.85rem', color: '#a0aec0' }}>
        <a href="/" style={{ color: '#4a5568', textDecoration: 'none' }}>
          ← Volver a la página principal
        </a>
      </footer>
    </main>
  );
}
