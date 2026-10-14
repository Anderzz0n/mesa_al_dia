import { Link } from 'react-router-dom'

// Marcador de posición para las pantallas de cada rol. Cada rol tendrá luego
// su propio archivo con su contenido real (tablero de comandas, mesas, caja...).
export default function PantallaProvisional({ titulo, descripcion }) {
  return (
    <main className="pagina">
      <Link to="/">← Volver al inicio</Link>
      <h1>{titulo}</h1>
      <p>{descripcion}</p>
      <p className="aviso">Pantalla en construcción.</p>
    </main>
  )
}
