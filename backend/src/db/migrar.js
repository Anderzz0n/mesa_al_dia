// Script ejecutable para correr las migraciones desde la terminal:
//   npm run migrar
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { crearBaseDatos } from '../db.js';
import { ejecutarMigraciones } from './migrador.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dirMigraciones = path.join(__dirname, 'migraciones');

async function principal() {
  console.log('Iniciando proceso de migraciones...');
  console.log(`Directorio de migraciones: ${dirMigraciones}`);

  if (!config.urlBaseDatos) {
    console.error('Error: DATABASE_URL no está configurada.');
    process.exit(1);
  }

  const db = crearBaseDatos(config.urlBaseDatos);

  try {
    // Probar conectividad antes de intentar migrar
    await db.query('SELECT 1');
  } catch (error) {
    console.error('Error al conectar con PostgreSQL:', error.message);
    console.error('Asegúrate de que la base de datos esté encendida y accesible vía DATABASE_URL.');
    await db.cerrar();
    process.exit(1);
  }

  try {
    const resultado = await ejecutarMigraciones({ db, dirMigraciones });
    console.log(`Listo. Total de migraciones registradas: ${resultado.total}.`);
    await db.cerrar();
    process.exit(0);
  } catch (error) {
    console.error('Error durante la ejecución de migraciones:', error.message);
    await db.cerrar();
    process.exit(1);
  }
}

principal();
