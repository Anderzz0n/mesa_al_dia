import { Link } from 'react-router-dom'

// Se muestra cuando la dirección no corresponde a ninguna pantalla.
export default function NoEncontrada() {
  return (
    <main className="pagina">
      <h1>Página no encontrada</h1>
      <Link to="/">Volver al inicio</Link>
    </main>
  )
}
