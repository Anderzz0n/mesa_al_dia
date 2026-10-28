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

export async function crearUsuario(datos) {
  const res = await peticionAutenticada('/api/v1/usuarios', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al crear usuario');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function actualizarUsuario(id, datos) {
  const res = await peticionAutenticada(`/api/v1/usuarios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar usuario');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function restablecerContrasenaUsuario(id, nueva_contrasena) {
  const res = await peticionAutenticada(`/api/v1/usuarios/${id}/restablecer-contrasena`, {
    method: 'POST',
    body: JSON.stringify({ nueva_contrasena }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al restablecer contraseña');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
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

/**
 * Catálogo del Menú (RF3 / Sprint 3)
 */
export async function obtenerCategorias() {
  const res = await peticionAutenticada('/api/v1/categorias');
  if (!res || !res.ok) throw new Error('Error al obtener categorías');
  return res.json();
}

export async function obtenerProductos({ categoria, disponible, destino } = {}) {
  const params = new URLSearchParams();
  if (categoria) params.append('categoria', categoria);
  if (disponible !== undefined) params.append('disponible', String(disponible));
  if (destino) params.append('destino', destino);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await peticionAutenticada(`/api/v1/productos${qs}`);
  if (!res || !res.ok) throw new Error('Error al obtener productos');
  return res.json();
}

export async function obtenerOpciones({ destino } = {}) {
  const params = new URLSearchParams();
  if (destino) params.append('destino', destino);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await peticionAutenticada(`/api/v1/opciones${qs}`);
  if (!res || !res.ok) throw new Error('Error al obtener opciones');
  return res.json();
}

export async function obtenerProductosRecomendados() {
  const res = await peticionAutenticada('/api/v1/productos/recomendados');
  if (!res || !res.ok) throw new Error('Error al obtener recomendados');
  return res.json();
}

export async function crearProducto(datos) {
  const res = await peticionAutenticada('/api/v1/productos', {
    method: 'POST',
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al crear producto');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function actualizarProducto(id, datos) {
  const res = await peticionAutenticada(`/api/v1/productos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar producto');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function actualizarOpcion(id, datos) {
  const res = await peticionAutenticada(`/api/v1/opciones/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(datos),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar opción');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

/**
 * Control de Stock y Disponibilidad en Tiempo Real (RF9 / RF6)
 */
export async function actualizarStockProducto(id, { cantidad, ajuste }) {
  const res = await peticionAutenticada(`/api/v1/productos/${id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({ cantidad, ajuste }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar stock');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function actualizarDisponibilidadProducto(id, disponible) {
  const res = await peticionAutenticada(`/api/v1/productos/${id}/disponibilidad`, {
    method: 'PATCH',
    body: JSON.stringify({ disponible }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar disponibilidad');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function actualizarAnticipadaProducto(id, permite_anticipada) {
  const res = await peticionAutenticada(`/api/v1/productos/${id}/anticipada`, {
    method: 'PATCH',
    body: JSON.stringify({ permite_anticipada }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar anticipada');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

/**
 * Parámetros Operativos (RF6 / RF8)
 */
export async function obtenerParametros() {
  const res = await peticionAutenticada('/api/v1/parametros');
  if (!res || !res.ok) throw new Error('Error al obtener parámetros');
  return res.json();
}

export async function actualizarParametroAnticipada({ destino, activa }) {
  const res = await peticionAutenticada('/api/v1/parametros/anticipada', {
    method: 'PATCH',
    body: JSON.stringify({ destino, activa }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar parámetro de anticipada');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function actualizarParametro(clave, valor) {
  const res = await peticionAutenticada(`/api/v1/parametros/${clave}`, {
    method: 'PATCH',
    body: JSON.stringify({ valor }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar parámetro');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

/**
 * Cuentas Vivas de Mesa (RF4 / RF12 / RF14)
 */
export async function obtenerCuentasMesa(mesaId) {
  const res = await peticionAutenticada(`/api/v1/mesas/${mesaId}/cuentas`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al obtener cuentas de la mesa');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function crearCuentaMesa(mesaId, { etiqueta } = {}) {
  const res = await peticionAutenticada(`/api/v1/mesas/${mesaId}/cuentas`, {
    method: 'POST',
    body: JSON.stringify({ etiqueta }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al abrir cuenta');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function obtenerCuentas({ estado, mesa_id, fecha } = {}) {
  const params = new URLSearchParams();
  if (estado) params.set('estado', estado);
  if (mesa_id) params.set('mesa_id', mesa_id);
  if (fecha) params.set('fecha', fecha);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await peticionAutenticada(`/api/v1/cuentas${qs}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al listar cuentas');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function obtenerDetalleCuenta(id) {
  const res = await peticionAutenticada(`/api/v1/cuentas/${id}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al obtener detalle de la cuenta');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function actualizarEstadoCuenta(id, estado) {
  const res = await peticionAutenticada(`/api/v1/cuentas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al actualizar estado de la cuenta');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function enviarPedido(cuentaId, { items }) {
  const res = await peticionAutenticada(`/api/v1/cuentas/${cuentaId}/pedidos`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al enviar pedido');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

export async function obtenerPedido(id) {
  const res = await peticionAutenticada(`/api/v1/pedidos/${id}`);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.mensaje || 'Error al obtener pedido');
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}




