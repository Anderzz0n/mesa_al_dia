import { Navigate, useLocation } from 'react-router-dom';
import { obtenerToken, obtenerUsuario } from '../api.js';

export default function RutaProtegida({ children, rolesPermitidos }) {
  const token = obtenerToken();
  const usuario = obtenerUsuario();
  const location = useLocation();

  if (!token || !usuario) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    return (
      <div style={{ maxWidth: '600px', margin: '4rem auto', padding: '2rem', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <h2 style={{ color: '#e53e3e', marginBottom: '1rem' }}>Acceso Denegado (403)</h2>
        <p style={{ color: '#4a5568', marginBottom: '1.5rem' }}>
          Su usuario <strong>{usuario.nombre_completo}</strong> tiene el rol <strong>{usuario.rol}</strong>, el cual no tiene autorización para acceder a esta sección.
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            padding: '0.6rem 1.2rem',
            background: '#2b6cb0',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: '4px',
            fontWeight: 500,
          }}
        >
          Ir al Inicio
        </a>
      </div>
    );
  }

  return children;
}
