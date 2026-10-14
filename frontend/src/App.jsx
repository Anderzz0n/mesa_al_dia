import { Routes, Route } from 'react-router-dom'
import { roles } from './roles.js'
import Inicio from './paginas/Inicio.jsx'
import PantallaProvisional from './paginas/PantallaProvisional.jsx'
import NoEncontrada from './paginas/NoEncontrada.jsx'

// Cada <Route> une una dirección (path) con la pantalla que se dibuja.
// El path "*" atrapa cualquier dirección sin coincidencia.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      {roles.map((rol) => (
        <Route
          key={rol.ruta}
          path={rol.ruta}
          element={<PantallaProvisional titulo={rol.nombre} descripcion={rol.descripcion} />}
        />
      ))}
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  )
}
