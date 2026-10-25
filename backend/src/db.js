// Acceso a la base de datos PostgreSQL.
import pg from 'pg';

export function crearBaseDatos(urlConexion) {
  // Un "pool" es un grupo de conexiones abiertas que se reutilizan.
  // Abrir una conexión por cada petición sería lento.
  const pool = new pg.Pool({
    connectionString: urlConexion,
    connectionTimeoutMillis: 3000,
  });

  // Si PostgreSQL se cae o reinicia, las conexiones que estaban INACTIVAS en
  // el pool emiten un evento 'error'. En Node, un evento 'error' que nadie
  // escucha tumba todo el programa. Aquí solo lo registramos: el servidor
  // sigue vivo y /salud responderá 503 hasta que la base vuelva.
  pool.on('error', (error) => {
    console.error('Conexión inactiva a la base de datos perdida:', error.message);
  });

  return {
    // Consulta simple. Siempre con parámetros ($1, $2...) y NUNCA pegando
    // los valores dentro del texto SQL: así se evita la inyección SQL.
    //   db.query('SELECT * FROM usuario WHERE id = $1', [5])
    query: (texto, parametros) => pool.query(texto, parametros),

    // Transacción: varias operaciones que se guardan TODAS o NINGUNA.
    // Es lo que necesita "enviar un pedido": crear pedido, ítems y comandas,
    // y descontar stock. Si algo falla a la mitad, ROLLBACK deshace todo.
    //   await db.transaccion(async (cliente) => {
    //     await cliente.query('INSERT ...');
    //     await cliente.query('UPDATE ...');
    //   });
    async transaccion(trabajo) {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        const resultado = await trabajo(cliente);
        await cliente.query('COMMIT');
        return resultado;
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      } finally {
        cliente.release(); // devuelve la conexión al pool, pase lo que pase
      }
    },

    cerrar: () => pool.end(),
  };
}
