import { Routes, Route } from 'react-router-dom';
import { roles } from './roles.js';
import Inicio from './paginas/Inicio.jsx';
import Login from './paginas/Login.jsx';
import PantallaProvisional from './paginas/PantallaProvisional.jsx';
import AdminSectores from './paginas/AdminSectores.jsx';
import MeseroMesas from './paginas/MeseroMesas.jsx';
import AreaStockControl from './paginas/AreaStockControl.jsx';
import RutaProtegida from './componentes/RutaProtegida.jsx';
import NoEncontrada from './paginas/NoEncontrada.jsx';

// Rutas de la aplicación:
// - / : Inicio con selector de rol, estado de sesión y acceso a wireframes
// - /login : Inicio de sesión (RF1 / CU2)
// - /admin : Gestión de Sectores, Mesas, Personal y Menú (RF1, RF2, RF3, RF9, RF15)
// - /mesero : Mis mesas, reasignación y actividad diaria (RF2 / RF15)
// - /cocina : Control de stock, disponibilidad y anticipada de Cocina (RF9, RF6, RF3)
// - /bar : Control de stock, disponibilidad y anticipada de Bar (RF9, RF6, RF3)
// - /caja : Pantalla provisional conectada a WebSocket
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/login" element={<Login />} />

      {/* Pantalla operativa Admin (RF1, RF2, RF3, RF9, RF15) */}
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

      {/* Pantalla operativa Cocina (RF9 / RF6 / RF3) */}
      <Route
        path="/cocina"
        element={
          <RutaProtegida rolesPermitidos={['COCINA', 'ADMIN']}>
            <AreaStockControl destino="COCINA" />
          </RutaProtegida>
        }
      />

      {/* Pantalla operativa Bar (RF9 / RF6 / RF3) */}
      <Route
        path="/bar"
        element={
          <RutaProtegida rolesPermitidos={['BAR', 'ADMIN']}>
            <AreaStockControl destino="BAR" />
          </RutaProtegida>
        }
      />

      {/* Pantalla provisional Caja (Sprint 5) */}
      {roles
        .filter((r) => !['/admin', '/mesero', '/cocina', '/bar'].includes(r.ruta))
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
