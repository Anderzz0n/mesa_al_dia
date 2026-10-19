import { useEffect, useState } from 'react'
import { consultarSalud } from '../api.js'
import { conectarTiempoReal } from '../tiempoReal.js'

const TEXTOS_API = {
  comprobando: 'Comprobando…',
  ok: 'Conectado',
  degradado: 'Servidor activo, base de datos con problemas',
  sin_conexion: 'Sin conexión con el servidor',
}

// Muestra si la API responde y si la conexión en vivo está abierta.
export default function EstadoServidor() {
  // useState guarda un valor que, al cambiar, hace que React vuelva a dibujar.
  const [api, setApi] = useState('comprobando')
  const [enVivo, setEnVivo] = useState(false)

  // useEffect ejecuta código "de afuera" (red, temporizadores) cuando el
  // componente aparece. La función que devuelve es la limpieza: se ejecuta
  // cuando el componente desaparece, para no dejar conexiones abiertas.
  useEffect(() => {
    let activo = true
    const comprobar = async () => {
      const estado = await consultarSalud()
      if (activo) setApi(estado)
    }
    comprobar()
    const reloj = setInterval(comprobar, 10000) // repite cada 10 segundos
    return () => {
      activo = false
      clearInterval(reloj)
    }
  }, [])

  useEffect(() => {
    const socket = conectarTiempoReal()
    socket.on('connect', () => setEnVivo(true))
    socket.on('disconnect', () => setEnVivo(false))
    return () => socket.close()
  }, [])

  return (
    <section className="estado-servidor" aria-label="Estado del servidor">
      <p>
        <strong>Servidor:</strong> {TEXTOS_API[api]}
      </p>
      <p>
        <strong>Eventos en vivo:</strong> {enVivo ? 'Conectado' : 'Desconectado'}
      </p>
    </section>
  )
}
