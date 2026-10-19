// Llamadas al backend (API REST). Todas pasan por aquí para tener un solo
// lugar donde cambiar la dirección base o, más adelante, agregar el token.

// Devuelve 'ok', 'degradado' (el servidor responde pero la base de datos
// falla) o 'sin_conexion' (no se pudo hablar con el servidor).
export async function consultarSalud() {
  try {
    const respuesta = await fetch('/api/v1/salud')
    const datos = await respuesta.json()
    return datos.estado === 'ok' ? 'ok' : 'degradado'
  } catch {
    return 'sin_conexion'
  }
}
