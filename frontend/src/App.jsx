import { Routes, Route } from 'react-router-dom';
import { roles } from './roles.js';
import Inicio from './paginas/Inicio.jsx';
import Login from './paginas/Login.jsx';
import PantallaProvisional from './paginas/PantallaProvisional.jsx';
import AdminSectores from './paginas/AdminSectores.jsx';
import MeseroMesas from './paginas/MeseroMesas.jsx';
import RutaProtegida from './componentes/RutaProtegida.jsx';
import NoEncontrada from './paginas/NoEncontrada.jsx';

// Rutas de la aplicación:
// - / : Inicio con selector de rol, estado de sesión y acceso a wireframes
// - /login : Inicio de sesión (RF1 / CU2)
// - /admin : Gestión de Sectores, Mesas y Asignaciones (RF2)
// - /mesero : Mis mesas, reasignación y actividad diaria (RF2 / RF15)
// - /cocina, /bar, /caja : Pantallas operativas protegidas por rol
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/login" element={<Login />} />

      {/* Pantalla operativa Admin (RF2) */}
      <Route
        path="/admin"
        element={
          <RutaProtegida rolesPermitidos={['ADMIN']}>
            <AdminSectores />
          </RutaProtegida>
        }
      />

      {/* Pantalla operativa Mesero (RF2 / RF15) */}
      <Route
        path="/mesero"
        element={
          <RutaProtegida rolesPermitidos={['MESERO', 'ADMIN']}>
            <MeseroMesas />
          </RutaProtegida>
        }
      />

      {/* Pantallas provisionales conectadas a WebSocket y wireframes */}
      {roles
        .filter((r) => r.ruta !== '/admin' && r.ruta !== '/mesero')
        .map((rol) => (
          <Route
            key={rol.ruta}
            path={rol.ruta}
            element={
              <RutaProtegida rolesPermitidos={[rol.rol, 'ADMIN']}>
                <PantallaProvisional
                  titulo={rol.nombre}
                  descripcion={rol.descripcion}
                  rutaWireframe={rol.rutaWireframe}
                />
              </RutaProtegida>
            }
          />
        ))}
      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
