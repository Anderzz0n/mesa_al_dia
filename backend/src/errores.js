// Manejo de errores con el formato definido en docs/02_api_y_eventos.md:
//   { "codigo": "USUARIO_DUPLICADO", "mensaje": "Usuario ya registrado" }

// Error "esperado" del negocio: el usuario hizo algo que las reglas no permiten.
// Se lanza desde cualquier parte del código con:
//   throw new ErrorNegocio('USUARIO_DUPLICADO', 'Usuario ya registrado', 409);
export class ErrorNegocio extends Error {
  constructor(codigo, mensaje, estadoHttp = 400) {
    super(mensaje);
    this.codigo = codigo;
    this.estadoHttp = estadoHttp;
  }
}

// Se ejecuta cuando ninguna ruta coincide con la petición.
export function rutaNoEncontrada(req, res) {
  res.status(404).json({ codigo: 'NO_ENCONTRADO', mensaje: 'Ruta no encontrada' });
}

// Punto ÚNICO donde terminan todos los errores. Express lo reconoce como
// manejador de errores porque tiene cuatro parámetros (el primero es err).
// Express 5 envía aquí también los errores de funciones async, sin código extra.
export function manejadorErrores(err, req, res, _siguiente) {
  if (err instanceof ErrorNegocio) {
    return res.status(err.estadoHttp).json({ codigo: err.codigo, mensaje: err.message });
  }
  // JSON mal formado en el cuerpo de la petición
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ codigo: 'DATOS_INVALIDOS', mensaje: 'El cuerpo de la petición no es un JSON válido' });
  }
  // Error inesperado (un bug): se registra completo para nosotros, pero al
  // cliente solo se le dice algo genérico. Nunca se filtran detalles internos.
  console.error(err);
  res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' });
}
