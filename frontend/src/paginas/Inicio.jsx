import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { roles } from '../roles.js';
import { obtenerUsuario, cerrarSesion } from '../api.js';
import EstadoServidor from '../componentes/EstadoServidor.jsx';

export default function Inicio() {
  const [usuario, setUsuario] = useState(() => obtenerUsuario());
  const navigate = useNavigate();


  async function salir() {
    await cerrarSesion();
    setUsuario(null);
    navigate('/login');
  }

  const rolUsuario = usuario ? roles.find((r) => r.rol === usuario.rol) : null;

  return (
    <main className="pagina">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#1a202c' }}>Mesa al día</h1>
          <p style={{ margin: 0, color: '#718096', fontSize: '0.9rem' }}>Sistema Integral de Restaurante</p>
        </div>
        <div>
          {usuario ? (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.85rem', color: '#2d3748', display: 'block' }}>
                Sesión: <strong>{usuario.nombre_completo}</strong>
              </span>
              <span style={{ fontSize: '0.75rem', color: '#718096', marginRight: '0.5rem' }}>
                Rol: {usuario.rol}
              </span>
              <button
                onClick={salir}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.5rem',
                  background: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cerrar Sesión
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              style={{
                display: 'inline-block',
                padding: '0.5rem 1rem',
                background: '#2b6cb0',
                color: '#fff',
                textDecoration: 'none',
                borderRadius: '6px',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              Iniciar Sesión (Login)
            </Link>
          )}
        </div>
      </header>

      {usuario && rolUsuario && (
        <section
          style={{
            background: '#ebf8ff',
            border: '1px solid #bee3f8',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.5rem',
          }}
        >
          <strong style={{ color: '#2b6cb0', display: 'block', fontSize: '1.05rem', marginBottom: '0.25rem' }}>
            Bienvenido, {usuario.nombre_completo}
          </strong>
          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', color: '#2c5282' }}>
            Tu cuenta tiene rol asignado de <strong>{usuario.rol}</strong>. Puedes ingresar directamente a tu pantalla operativa:
          </p>
          <Link
            to={rolUsuario.ruta}
            style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              background: '#3182ce',
              color: '#fff',
              textDecoration: 'none',
              borderRadius: '6px',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            Abrir mi pantalla ({rolUsuario.nombre}) →
          </Link>
        </section>
      )}

      <h2>Módulos del Sistema por Rol</h2>
      <p style={{ color: '#4a5568', fontSize: '0.95rem' }}>
        Seleccione un rol para ingresar (requiere inicio de sesión):
      </p>
      <nav className="tarjetas">
        {roles.map((rol) => (
          <Link key={rol.ruta} to={rol.ruta} className="tarjeta">
            <strong>{rol.nombre}</strong>
            <span style={{ fontSize: '0.85rem', color: '#718096' }}>{rol.descripcion}</span>
          </Link>
        ))}
      </nav>

      <h2 style={{ marginTop: '2.5rem', fontSize: '1.25rem' }}>Wireframes y Diseños UX Aprobados (Tarea 2.5)</h2>
      <p style={{ color: '#4a5568', fontSize: '0.9rem', margin: '0 0 0.75rem 0' }}>
        Prototipos interactivos de baja fidelidad para PC y móvil con notas de especificación:
      </p>
      <nav className="tarjetas">
        <a href="/docs/ux/admin/index.html" className="tarjeta">
          <strong>Administrador (Tarea 2.5)</strong>
          <span style={{ fontSize: '0.85rem', color: '#718096' }}>Usuarios, sectores, menú y parámetros</span>
        </a>
        <a href="/docs/ux/caja/index.html" className="tarjeta">
          <strong>Caja</strong>
          <span style={{ fontSize: '0.85rem', color: '#718096' }}>Cuentas, cobro, cancelaciones y resumen</span>
        </a>
        <a href="/docs/ux/cocina/index.html" className="tarjeta">
          <strong>Cocina</strong>
          <span style={{ fontSize: '0.85rem', color: '#718096' }}>Tablero de comandas, listas y stock</span>
        </a>
        <a href="/docs/ux/bar/index.html" className="tarjeta">
          <strong>Bar</strong>
          <span style={{ fontSize: '0.85rem', color: '#718096' }}>Comandas de bebidas y preparados</span>
        </a>
        <a href="/docs/ux/mesero/index.html" className="tarjeta">
          <strong>Mesero</strong>
          <span style={{ fontSize: '0.85rem', color: '#718096' }}>Celular: mesas, pedidos y cancelaciones</span>
        </a>
      </nav>

      <EstadoServidor />
    </main>
  );
}
