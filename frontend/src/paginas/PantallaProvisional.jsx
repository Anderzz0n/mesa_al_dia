import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { obtenerUsuario, cerrarSesion } from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

export default function PantallaProvisional({ titulo, descripcion, rutaWireframe }) {
  const usuario = obtenerUsuario();
  const navigate = useNavigate();
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    const socket = conectarTiempoReal();
    socket.on('connect', () => setEnLinea(true));
    socket.on('disconnect', () => setEnLinea(false));
    return () => {
      socket.disconnect();
    };
  }, []);

  async function salir() {
    await cerrarSesion();
    navigate('/login');
  }

  const nombreRol = usuario?.rol || titulo;

  return (
    <div style={{ minHeight: '100vh', background: '#f7fafc', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Barra superior integrada (mismo diseño limpio que mesero y admin) */}
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
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            Mesa al día · {nombreRol}
          </h1>
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            Usuario: {usuario?.nombre_completo || 'Usuario'}
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
      <main style={{ maxWidth: '42rem', width: '100%', margin: '0 auto', padding: '2rem 1rem', flex: 1 }}>
        <h2 style={{ fontSize: '1.5rem', color: '#1a202c', marginTop: 0, marginBottom: '0.5rem' }}>{titulo}</h2>
        <p style={{ color: '#4a5568', fontSize: '0.95rem', margin: '0 0 1.5rem 0' }}>{descripcion}</p>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: '#2d3748' }}>Estado de implementación</h3>
          <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.9rem', color: '#718096', lineHeight: 1.5 }}>
            Autenticación JWT completada (RF1). La pantalla operativa está conectada al bus de eventos WebSocket con las salas asignadas automáticamente para <strong>{nombreRol}</strong>.
          </p>

          {rutaWireframe && (
            <a
              href={rutaWireframe}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-block',
                padding: '0.6rem 1.1rem',
                background: '#3182ce',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              Ver Wireframe Interactivo Aprobado (Tarea 2.5) ↗
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
