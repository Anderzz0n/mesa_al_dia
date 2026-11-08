import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { obtenerInfoRed } from '../api.js';

export default function BotonQRConexion() {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [infoRed, setInfoRed] = useState(null);
  const [urlSeleccionada, setUrlSeleccionada] = useState('');
  const [qrSrc, setQrSrc] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState(null);

  async function abrirModal() {
    setAbierto(true);
    setCargando(true);
    setError(null);
    setCopiado(false);

    try {
      const datos = await obtenerInfoRed();
      setInfoRed(datos);

      const esLocalhost =
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      const urlPorDefecto = esLocalhost && datos.urlRed ? datos.urlRed : window.location.origin;
      setUrlSeleccionada(urlPorDefecto);

      if (urlPorDefecto === datos.urlRed && datos.qrDataUrl) {
        setQrSrc(datos.qrDataUrl);
      } else {
        const dataUrl = await QRCode.toDataURL(urlPorDefecto, {
          margin: 1,
          width: 260,
          color: { dark: '#1a202c', light: '#ffffff' },
        });
        setQrSrc(dataUrl);
      }
    } catch {
      const fallbackUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      setUrlSeleccionada(fallbackUrl);
      try {
        const dataUrl = await QRCode.toDataURL(fallbackUrl, {
          margin: 1,
          width: 260,
          color: { dark: '#1a202c', light: '#ffffff' },
        });
        setQrSrc(dataUrl);
      } catch {
        setError('No fue posible generar el código QR');
      }
    } finally {
      setCargando(false);
    }
  }

  async function cambiarUrl(nuevaUrl) {
    setUrlSeleccionada(nuevaUrl);
    setCopiado(false);
    try {
      const dataUrl = await QRCode.toDataURL(nuevaUrl, {
        margin: 1,
        width: 260,
        color: { dark: '#1a202c', light: '#ffffff' },
      });
      setQrSrc(dataUrl);
    } catch {
      setError('Error al generar QR');
    }
  }

  async function copiarAlPortapapeles() {
    if (!urlSeleccionada) return;
    try {
      await navigator.clipboard.writeText(urlSeleccionada);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  const [hayModalActivo, setHayModalActivo] = useState(false);
  const [descartado, setDescartado] = useState(false);

  useEffect(() => {
    function chequearModales() {
      if (typeof document === 'undefined') return;
      const modales = document.querySelectorAll('[role="dialog"]');
      const hayOtro = Array.from(modales).some((m) => m.id !== 'modal-qr-conexion-dialog');
      setHayModalActivo(hayOtro);
    }

    chequearModales();
    const observer = new MutationObserver(chequearModales);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function manejarTecla(e) {
      if (e.key === 'Escape' && abierto) {
        setAbierto(false);
      }
    }
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [abierto]);

  if ((hayModalActivo || descartado) && !abierto) {
    return null;
  }

  return (
    <>
      {/* Botón flotante en la esquina inferior derecha con opción de cierre */}
      {!descartado && !hayModalActivo && (
        <div
          id="contenedor-btn-qr-conexion"
          style={{
            position: 'fixed',
            bottom: '1rem',
            right: '1rem',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <button
            type="button"
            onClick={abrirModal}
            title="Conectar dispositivo móvil (Escanear código QR)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              background: '#1a202c',
              color: '#ffffff',
              border: '1px solid #4a5568',
              borderRadius: '9999px',
              padding: '0.5rem 0.9rem',
              fontSize: '0.82rem',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>QR Conexión</span>
          </button>

          <button
            type="button"
            onClick={() => setDescartado(true)}
            title="Ocultar botón QR"
            style={{
              background: '#2d3748',
              color: '#cbd5e0',
              border: '1px solid #4a5568',
              borderRadius: '9999px',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '0.75rem',
              lineHeight: 1,
              padding: 0,
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal emergente */}
      {abierto && (
        <div
          id="modal-qr-conexion-dialog"
          role="dialog"
          aria-modal="true"
          onClick={() => setAbierto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '1rem',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              maxWidth: '440px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {/* Cabecera del modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1a202c', fontWeight: 700 }}>
                  Conexión en red local
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#718096' }}>
                  Escanea este código con tu teléfono para ingresar directamente sin escribir la IP
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                title="Cerrar"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  color: '#718096',
                  cursor: 'pointer',
                  padding: '0.2rem 0.4rem',
                  borderRadius: '4px',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* Contenedor del código QR */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                background: '#f7fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                minHeight: '270px',
              }}
            >
              {cargando ? (
                <div style={{ color: '#718096', fontSize: '0.9rem' }}>Generando código QR...</div>
              ) : error ? (
                <div style={{ color: '#c53030', fontSize: '0.9rem' }}>{error}</div>
              ) : qrSrc ? (
                <img
                  src={qrSrc}
                  alt="Código QR de conexión"
                  style={{
                    width: '240px',
                    height: '240px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    padding: '8px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                  }}
                />
              ) : null}
            </div>

            {/* URL y botón de copiar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4a5568', textTransform: 'uppercase' }}>
                Dirección web de acceso
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  readOnly
                  value={urlSeleccionada}
                  style={{
                    flex: 1,
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    background: '#edf2f7',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    color: '#2d3748',
                  }}
                />
                <button
                  type="button"
                  onClick={copiarAlPortapapeles}
                  style={{
                    padding: '0.5rem 0.85rem',
                    background: copiado ? '#38a169' : '#3182ce',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Opciones de IP en caso de múltiples interfaces */}
            {infoRed?.interfaces && infoRed.interfaces.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#718096' }}>
                  Otras interfaces de red disponibles:
                </span>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {infoRed.interfaces.map((iface) => {
                    const urlIface = `http://${iface.ip}:${infoRed.puerto}`;
                    const seleccionada = urlSeleccionada === urlIface;
                    return (
                      <button
                        key={`${iface.interfaz}-${iface.ip}`}
                        type="button"
                        onClick={() => cambiarUrl(urlIface)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          border: '1px solid',
                          borderColor: seleccionada ? '#3182ce' : '#cbd5e0',
                          background: seleccionada ? '#ebf8ff' : '#f7fafc',
                          color: seleccionada ? '#2b6cb0' : '#4a5568',
                          cursor: 'pointer',
                          fontWeight: seleccionada ? 700 : 500,
                        }}
                      >
                        {iface.interfaz}: {iface.ip}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => cambiarUrl(window.location.origin)}
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid',
                      borderColor: urlSeleccionada === window.location.origin ? '#3182ce' : '#cbd5e0',
                      background: urlSeleccionada === window.location.origin ? '#ebf8ff' : '#f7fafc',
                      color: urlSeleccionada === window.location.origin ? '#2b6cb0' : '#4a5568',
                      cursor: 'pointer',
                    }}
                  >
                    URL navegador
                  </button>
                </div>
              </div>
            )}

            {/* Nota de ayuda */}
            <div
              style={{
                fontSize: '0.8rem',
                color: '#4a5568',
                background: '#ebf8ff',
                border: '1px solid #bee3f8',
                borderRadius: '6px',
                padding: '0.6rem 0.75rem',
                lineHeight: 1.4,
              }}
            >
              <strong>Requisito de red:</strong> Tu teléfono o tablet debe estar conectado a la misma red Wi-Fi que este computador para abrir la aplicación.
            </div>

            {/* Botón de cierre */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#edf2f7',
                  border: '1px solid #cbd5e0',
                  borderRadius: '6px',
                  color: '#4a5568',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
