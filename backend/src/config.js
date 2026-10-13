// Configuración del servidor.
// Los valores salen de variables de entorno (archivo .env), no del código:
// así el mismo programa funciona en tu computador y en producción
// cambiando solo la configuración, y las claves nunca se suben a Git.

export const config = {
  puerto: Number(process.env.PUERTO ?? 3000),
  urlBaseDatos: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/mesa_al_dia',
};
