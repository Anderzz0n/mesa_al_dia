import { Link } from 'react-router-dom'
import { roles } from '../roles.js'
import EstadoServidor from '../componentes/EstadoServidor.jsx'

// Pantalla de inicio provisional: un acceso por rol.
// <Link> cambia de pantalla sin recargar la página (a diferencia de <a>).
export default function Inicio() {
  return (
    <main className="pagina">
      <h1>Mesa al día</h1>
      <p>Elige un rol para ver su pantalla.</p>
      <nav className="tarjetas">
        {roles.map((rol) => (
          <Link key={rol.ruta} to={rol.ruta} className="tarjeta">
            <strong>{rol.nombre}</strong>
            <span>{rol.descripcion}</span>
          </Link>
        ))}
      </nav>
      <EstadoServidor />
    </main>
  )
}
