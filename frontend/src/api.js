// Llamadas al backend (API REST) y gestión de sesión JWT (RF1).

const CLAVE_TOKEN = 'mesa_al_dia_token';
const CLAVE_USUARIO = 'mesa_al_dia_usuario';

export function obtenerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function obtenerUsuario() {
  try {
    const raw = localStorage.getItem(CLAVE_USUARIO);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(token, usuario) {
  try {
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  } catch (e) {
    console.error('Error al guardar sesión:', e);
  }
}

export function limpiarSesion() {
  try {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
  } catch (e) {
    console.error('Error al limpiar sesión:', e);
  }
}

/**
 * Inicia sesión con credenciales de usuario (CU2).
 */
export async function iniciarSesion(nombre_usuario, contrasena) {
  const respuesta = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre_usuario, contrasena }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    const error = new Error(datos.mensaje || 'Error al iniciar sesión');
    error.codigo = datos.codigo || 'ERROR_LOGIN';
    error.estado = respuesta.status;
    throw error;
  }

  guardarSesion(datos.token, datos.usuario);
  return datos;
}

/**
 * Cierra la sesión activa (CU3).
 */
export async function cerrarSesion() {
  const token = obtenerToken();
  if (token) {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignoramos error de red al cerrar sesión
    }
  }
  limpiarSesion();
}

/**
 * Consulta los datos del usuario autenticado con el token actual.
 */
export async function consultarYo() {
  const token = obtenerToken();
  if (!token) return null;

  try {
    const respuesta = await fetch('/api/v1/auth/yo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!respuesta.ok) {
      limpiarSesion();
      return null;
    }
    const datos = await respuesta.json();
    return datos.usuario;
  } catch {
    return null;
  }
}

/**
 * Realiza peticiones autenticadas a la API inyectando el token Bearer.
 */
export async function peticionAutenticada(url, opciones = {}) {
  const token = obtenerToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(opciones.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const respuesta = await fetch(url, {
    ...opciones,
    headers,
  });

  if (respuesta.status === 401) {
    limpiarSesion();
    window.location.href = '/login';
    return null;
  }

  return respuesta;
}

// Devuelve 'ok', 'degradado' (el servidor responde pero la base de datos
// falla) o 'sin_conexion' (no se pudo hablar con el servidor).
export async function consultarSalud() {
  try {
    const respuesta = await fetch('/api/v1/salud');
    const datos = await respuesta.json();
    return datos.estado === 'ok' ? 'ok' : 'degradado';
  } catch {
    return 'sin_conexion';
  }
}

/**
 * Operaciones de Mesas, Sectores y Usuarios (RF1 / RF2)
 */
export async function obtenerUsuarios({ rol, activo } = {}) {
  const params = new URLSearchParams();
  if (rol) params.append('rol', rol);
  if (activo !== undefined) params.append('activo', activo);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await peticionAutenticada(`/api/v1/usuarios${q}`);
  if (!res || !res.ok) throw new Error('Error al obtener usuarios');
  return res.json();
}

export async function obtenerMesas() {
  const res = await peticionAutenticada('/api/v1/mesas');
  if (!res || !res.ok) throw new Error('Error al obtener mesas');
  return res.json();
}

export async function crearMesa(datos) {
  const res = await peticionAutenticada('/api/v1/mesas', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al crear mesa');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function obtenerSectores() {
  const res = await peticionAutenticada('/api/v1/sectores');
  if (!res || !res.ok) throw new Error('Error al obtener sectores');
  return res.json();
}

export async function crearSector(datos) {
  const res = await peticionAutenticada('/api/v1/sectores', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al crear sector');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function asignarMeseroSector(sectorId, meseroId) {
  const res = await peticionAutenticada(`/api/v1/sectores/${sectorId}/asignacion`, {
    method: 'PUT',
    body: JSON.stringify({ mesero_id: meseroId }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al asignar mesero');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function reasignarMesa(mesaId, { motivo, mesero_id } = {}) {
  const res = await peticionAutenticada(`/api/v1/mesas/${mesaId}/reasignaciones`, {
    method: 'POST',
    body: JSON.stringify({ motivo, mesero_id }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al reasignar mesa');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function terminarReasignacionMesa(mesaId) {
  const res = await peticionAutenticada(`/api/v1/mesas/${mesaId}/reasignaciones/vigente`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al terminar reasignación');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function obtenerActividadMesero(meseroId, fecha) {
  const url = fecha ? `/api/v1/meseros/${meseroId}/actividad?fecha=${fecha}` : `/api/v1/meseros/${meseroId}/actividad`;
  const res = await peticionAutenticada(url);
  if (!res || !res.ok) throw new Error('Error al obtener actividad');
  return res.json();
}
