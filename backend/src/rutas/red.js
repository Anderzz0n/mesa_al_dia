import express from 'express';
import QRCode from 'qrcode';
import { obtenerInformacionRed } from '../red.js';

export function rutaRed({ puerto = 3000 } = {}) {
  const router = express.Router();

  // GET /api/v1/info-red - Devuelve la IP LAN del host, URLs y el QR en base64
  router.get('/', async (req, res, siguiente) => {
    try {
      const info = await obtenerInformacionRed(puerto);
      res.json({ datos: info });
    } catch (error) {
      siguiente(error);
    }
  });

  // GET /api/v1/info-red/qr?url=... - Genera QR para cualquier URL personalizada
  router.get('/qr', async (req, res, siguiente) => {
    try {
      const url = req.query.url;
      if (!url) {
        return res.status(400).json({
          codigo: 'DATOS_INVALIDOS',
          mensaje: 'El parámetro de consulta "url" es obligatorio',
        });
      }

      const qrDataUrl = await QRCode.toDataURL(String(url), {
        margin: 1,
        width: 280,
        color: {
          dark: '#1a202c',
          light: '#ffffff',
        },
      });

      res.json({ datos: { url, qrDataUrl } });
    } catch (error) {
      siguiente(error);
    }
  });

  return router;
}
