import os from 'node:os';
import QRCode from 'qrcode';

/**
 * Obtiene todas las interfaces de red IPv4 no internas (omitir 127.0.0.1).
 * Ordena con prioridad las redes LAN privadas comunes (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
 */
export function obtenerIpsLocales() {
  const interfaces = os.networkInterfaces();
  const resultados = [];

  for (const [nombre, lista] of Object.entries(interfaces)) {
    for (const iface of lista || []) {
      const esIpv4 = iface.family === 'IPv4' || iface.family === 4;
      if (esIpv4 && !iface.internal) {
        resultados.push({
          interfaz: nombre,
          ip: iface.address,
        });
      }
    }
  }

  // Priorizar rangos típicos de red LAN privada de restaurantes / hogares
  resultados.sort((a, b) => {
    const puntaje = (ip) => {
      if (ip.startsWith('192.168.')) return 3;
      if (ip.startsWith('10.')) return 2;
      if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return 1;
      return 0;
    };
    return puntaje(b.ip) - puntaje(a.ip);
  });

  return resultados;
}

/**
 * Retorna la información de red del servidor y genera el código QR (data URL).
 */
export async function obtenerInformacionRed(puerto = 3000) {
  const ips = obtenerIpsLocales();
  const ipPrimaria = ips.length > 0 ? ips[0].ip : 'localhost';
  const urlRed = `http://${ipPrimaria}:${puerto}`;
  const urlLocal = `http://localhost:${puerto}`;

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(urlRed, {
      margin: 1,
      width: 280,
      color: {
        dark: '#1a202c',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Error generando QR data URL:', err?.message || err);
  }

  return {
    puerto,
    ipPrimaria,
    urlRed,
    urlLocal,
    interfaces: ips,
    qrDataUrl,
  };
}

/**
 * Imprime un banner en la consola con el código QR en caracteres ASCII/terminal
 * y las URLs de conexión para facilitar el acceso desde teléfonos y tablets.
 */
export async function imprimirBannerInicioConQR({ puerto = 3000, host = '0.0.0.0' } = {}) {
  const info = await obtenerInformacionRed(puerto);
  let qrTerminal = '';

  try {
    qrTerminal = await QRCode.toString(info.urlRed, {
      type: 'terminal',
      small: true,
    });
  } catch (err) {
    qrTerminal = '';
  }

  console.log('\n============================================================');
  console.log('            MESA AL DÍA · SERVIDOR EN LÍNEA                 ');
  console.log('============================================================');
  console.log(`  Local:   ${info.urlLocal}`);
  console.log(`  Red LAN: ${info.urlRed}`);
  if (info.interfaces.length > 1) {
    console.log(`  Otras IPs detectadas: ${info.interfaces.map((i) => i.ip).join(', ')}`);
  }
  console.log('------------------------------------------------------------');
  console.log('  Escanea este código QR con la cámara de tu teléfono móvil');
  console.log('  o tablet (en la misma red Wi-Fi) para ingresar directo:');
  console.log('------------------------------------------------------------');
  if (qrTerminal) {
    console.log(qrTerminal);
  } else {
    console.log(`  Ingresa desde tu teléfono a: ${info.urlRed}`);
  }
  console.log('------------------------------------------------------------');
  console.log('  Tip: En la esquina inferior derecha de la pantalla web');
  console.log('  también tienes un botón para mostrar este código QR.');
  console.log('============================================================\n');
}
