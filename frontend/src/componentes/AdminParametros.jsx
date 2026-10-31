import { useState, useEffect, useCallback } from 'react';
import {
  obtenerParametros,
  actualizarParametro,
  actualizarParametroAnticipada,
} from '../api.js';
import { conectarTiempoReal } from '../tiempoReal.js';

/**
 * Panel de Configuración de Parámetros Operativos del Sistema (A5 / RF6, RF8).
 * Permite calibrar la ventana de cancelación de pedidos, los umbrales de demora de comandas
 * para Cocina y Bar, y gobernar los interruptores de preparación anticipada.
 */
export default function AdminParametros() {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensajeExito, setMensajeExito] = useState(null);

  // Valores de los parámetros
  const [ventanaCancelacion, setVentanaCancelacion] = useState(3);
  const [umbralCocina, setUmbralCocina] = useState(20);
  const [umbralBar, setUmbralBar] = useState(7);
  const [anticipadaCocina, setAnticipadaCocina] = useState(true);
  const [anticipadaBar, setAnticipadaBar] = useState(true);

  // Estados de guardado individual
  const [guardandoVentana, setGuardandoVentana] = useState(false);
  const [guardandoCocina, setGuardandoCocina] = useState(false);
  const [guardandoBar, setGuardandoBar] = useState(false);
  const [guardandoAnticipada, setGuardandoAnticipada] = useState(false);

  const cargarParametros = useCallback(async () => {
    try {
      setError(null);
      const params = await obtenerParametros();
      if (params) {
        if (params.VENTANA_CANCELACION_MINUTOS !== undefined) {
          setVentanaCancelacion(Number(params.VENTANA_CANCELACION_MINUTOS));
        }
        if (params.UMBRAL_DEMORA_COCINA_MINUTOS !== undefined) {
          setUmbralCocina(Number(params.UMBRAL_DEMORA_COCINA_MINUTOS));
        }
        if (params.UMBRAL_DEMORA_BAR_MINUTOS !== undefined) {
          setUmbralBar(Number(params.UMBRAL_DEMORA_BAR_MINUTOS));
        }
        if (params.ANTICIPADA_ACTIVA_COCINA !== undefined) {
          setAnticipadaCocina(Boolean(params.ANTICIPADA_ACTIVA_COCINA));
        }
        if (params.ANTICIPADA_ACTIVA_BAR !== undefined) {
          setAnticipadaBar(Boolean(params.ANTICIPADA_ACTIVA_BAR));
        }
      }
    } catch (err) {
      setError(err.message || 'Error al cargar los parámetros del sistema');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    (async () => {
      if (activo) {
        await cargarParametros();
      }
    })();

    const socket = conectarTiempoReal();
    socket.on('parametro.actualizado', (datos) => {
      if (!datos) return;
      if (datos.clave === 'VENTANA_CANCELACION_MINUTOS') {
        setVentanaCancelacion(Number(datos.valor));
      } else if (datos.clave === 'UMBRAL_DEMORA_COCINA_MINUTOS') {
        setUmbralCocina(Number(datos.valor));
      } else if (datos.clave === 'UMBRAL_DEMORA_BAR_MINUTOS') {
        setUmbralBar(Number(datos.valor));
      }
    });

    socket.on('anticipada.estado', (datos) => {
      if (!datos) return;
      if (datos.destino === 'COCINA') {
        setAnticipadaCocina(Boolean(datos.activa));
      } else if (datos.destino === 'BAR') {
        setAnticipadaBar(Boolean(datos.activa));
      }
    });

    return () => {
      activo = false;
      socket.disconnect();
    };
  }, [cargarParametros]);

  function mostrarNotificacion(msg) {
    setMensajeExito(msg);
    setTimeout(() => {
      setMensajeExito(null);
    }, 4000);
  }

  async function handleGuardarVentana(e) {
    e.preventDefault();
    const val = Number(ventanaCancelacion);
    if (isNaN(val) || !Number.isInteger(val) || val <= 0) {
      setError('La ventana de cancelación debe ser un número entero mayor a 0 minutos');
      return;
    }
    setGuardandoVentana(true);
    setError(null);
    try {
      await actualizarParametro('VENTANA_CANCELACION_MINUTOS', val);
      mostrarNotificacion('Ventana de cancelación actualizada a ' + val + ' minutos');
    } catch (err) {
      setError(err.message || 'Error al actualizar ventana de cancelación');
    } finally {
      setGuardandoVentana(false);
    }
  }

  async function handleGuardarUmbralCocina(e) {
    e.preventDefault();
    const val = Number(umbralCocina);
    if (isNaN(val) || !Number.isInteger(val) || val <= 0) {
      setError('El umbral de demora de cocina debe ser un número entero mayor a 0 minutos');
      return;
    }
    setGuardandoCocina(true);
    setError(null);
    try {
      await actualizarParametro('UMBRAL_DEMORA_COCINA_MINUTOS', val);
      mostrarNotificacion('Umbral de demora de Cocina actualizado a ' + val + ' minutos');
    } catch (err) {
      setError(err.message || 'Error al actualizar umbral de cocina');
    } finally {
      setGuardandoCocina(false);
    }
  }

  async function handleGuardarUmbralBar(e) {
    e.preventDefault();
    const val = Number(umbralBar);
    if (isNaN(val) || !Number.isInteger(val) || val <= 0) {
      setError('El umbral de demora de bar debe ser un número entero mayor a 0 minutos');
      return;
    }
    setGuardandoBar(true);
    setError(null);
    try {
      await actualizarParametro('UMBRAL_DEMORA_BAR_MINUTOS', val);
      mostrarNotificacion('Umbral de demora de Bar actualizado a ' + val + ' minutos');
    } catch (err) {
      setError(err.message || 'Error al actualizar umbral de bar');
    } finally {
      setGuardandoBar(false);
    }
  }

  async function handleToggleAnticipada(destino, actual) {
    setGuardandoAnticipada(true);
    setError(null);
    const nuevoValor = !actual;
    try {
      await actualizarParametroAnticipada({ destino, activa: nuevoValor });
      if (destino === 'COCINA') setAnticipadaCocina(nuevoValor);
      if (destino === 'BAR') setAnticipadaBar(nuevoValor);
      mostrarNotificacion(
        `Preparación anticipada en ${destino === 'COCINA' ? 'Cocina' : 'Bar'} ` +
          (nuevoValor ? 'activada' : 'desactivada')
      );
    } catch (err) {
      setError(err.message || 'Error al cambiar preparación anticipada');
    } finally {
      setGuardandoAnticipada(false);
    }
  }

  if (cargando) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#718096' }}>
        <p>Cargando parámetros del sistema...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1a202c', margin: 0 }}>
            Parámetros operativos del sistema (A5)
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#718096', margin: '0.25rem 0 0' }}>
            Valores globales de tiempo y comportamiento almacenados en la tabla <code>parametro</code>.
          </p>
        </div>
        <button
          onClick={cargarParametros}
          style={{
            background: '#edf2f7',
            border: '1px solid #cbd5e0',
            color: '#4a5568',
            padding: '0.4rem 0.8rem',
            borderRadius: '4px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Alertas */}
      {mensajeExito && (
        <div
          style={{
            background: '#f0fff4',
            border: '1px solid #9ae6b4',
            color: '#22543d',
            padding: '0.75rem 1rem',
            borderRadius: '4px',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          ✓ {mensajeExito}
        </div>
      )}

      {error && (
        <div
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            color: '#9b2c2c',
            padding: '0.75rem 1rem',
            borderRadius: '4px',
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Cuadrícula de 2 columnas según wireframe A5 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {/* Columna Izquierda: Tiempos y ventanas operativas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Tarjeta 1: Ventana de cancelación directa (RF8) */}
          <div
            style={{
              background: '#fff',
              border: '2px solid #e2e8f0',
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <b style={{ fontSize: '1rem', color: '#1a202c' }}>Ventana de cancelación directa (RF8)</b>
                <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#718096' }}>
                  VENTANA_CANCELACION_MINUTOS
                </div>
              </div>
              <span
                style={{
                  background: '#2d3748',
                  color: '#fff',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                {ventanaCancelacion} min
              </span>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#4a5568', margin: 0, lineHeight: 1.4 }}>
              Tiempo máximo desde el registro de un pedido durante el cual el mesero puede anularlo de forma inmediata.
              Superado este lapso, el mesero solo puede <b>solicitar</b> la cancelación y Caja debe resolverla (CU17, CU18).
            </p>

            <form onSubmit={handleGuardarVentana} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#4a5568' }}>Minutos:</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={ventanaCancelacion}
                  onChange={(e) => setVentanaCancelacion(e.target.value)}
                  style={{
                    width: '90px',
                    padding: '0.4rem 0.6rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#1a202c',
                  }}
                  disabled={guardandoVentana}
                />
              </div>
              <button
                type="submit"
                disabled={guardandoVentana}
                style={{
                  background: '#2b6cb0',
                  color: '#fff',
                  border: 'none',
                  padding: '0.45rem 0.9rem',
                  borderRadius: '4px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: guardandoVentana ? 'not-allowed' : 'pointer',
                  opacity: guardandoVentana ? 0.7 : 1,
                }}
              >
                {guardandoVentana ? 'Guardando...' : 'Guardar valor'}
              </button>
            </form>
          </div>

          {/* Tarjeta 2: Umbrales de demora de comandas */}
          <div
            style={{
              background: '#fff',
              border: '2px solid #e2e8f0',
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div>
              <b style={{ fontSize: '1rem', color: '#1a202c' }}>Umbrales de alerta por demora en comandas</b>
              <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                Tiempo transcurrido para resaltar comandas demoradas con fondo oscuro en tableros Kanban.
              </div>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#4a5568', margin: 0, lineHeight: 1.4 }}>
              Las bebidas se preparan más rápido que los platos de cocina; por eso cada área cuenta con su propio umbral calibrado de forma independiente:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.25rem' }}>
              {/* Cocina */}
              <div
                style={{
                  background: '#f7fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <b style={{ fontSize: '0.85rem', color: '#2d3748' }}>Cocina (platos calientes)</b>
                  <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#718096' }}>
                    UMBRAL_DEMORA_COCINA
                  </div>
                </div>
                <form onSubmit={handleGuardarUmbralCocina} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={umbralCocina}
                    onChange={(e) => setUmbralCocina(e.target.value)}
                    style={{
                      width: '65px',
                      padding: '0.35rem 0.5rem',
                      border: '1px solid #cbd5e0',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                    disabled={guardandoCocina}
                  />
                  <span style={{ fontSize: '0.78rem', color: '#718096' }}>min</span>
                  <button
                    type="submit"
                    disabled={guardandoCocina}
                    style={{
                      background: '#4a5568',
                      color: '#fff',
                      border: 'none',
                      padding: '0.35rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: guardandoCocina ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {guardandoCocina ? '...' : 'Fijar'}
                  </button>
                </form>
              </div>

              {/* Bar */}
              <div
                style={{
                  background: '#f7fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '4px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <b style={{ fontSize: '0.85rem', color: '#2d3748' }}>Bar (bebidas y cocteles)</b>
                  <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#718096' }}>
                    UMBRAL_DEMORA_BAR
                  </div>
                </div>
                <form onSubmit={handleGuardarUmbralBar} style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={umbralBar}
                    onChange={(e) => setUmbralBar(e.target.value)}
                    style={{
                      width: '65px',
                      padding: '0.35rem 0.5rem',
                      border: '1px solid #cbd5e0',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                    disabled={guardandoBar}
                  />
                  <span style={{ fontSize: '0.78rem', color: '#718096' }}>min</span>
                  <button
                    type="submit"
                    disabled={guardandoBar}
                    style={{
                      background: '#4a5568',
                      color: '#fff',
                      border: 'none',
                      padding: '0.35rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: guardandoBar ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {guardandoBar ? '...' : 'Fijar'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Preparación anticipada */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Tarjeta 3: Interruptores de preparación anticipada (RF6) */}
          <div
            style={{
              background: '#fff',
              border: '2px solid #e2e8f0',
              borderRadius: '6px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <b style={{ fontSize: '1rem', color: '#1a202c' }}>Preparación anticipada por área (RF6)</b>
                <div style={{ fontSize: '0.78rem', color: '#718096' }}>
                  Habilitación de colas prioritarias de elaboración
                </div>
              </div>
              <span
                style={{
                  background: '#e2e8f0',
                  color: '#4a5568',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                RF6
              </span>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#4a5568', margin: 0, lineHeight: 1.4 }}>
              Cada área gobierna su interruptor según su capacidad física. El Administrador puede supervisar el estado actual o conmutarlo centralizadamente:
            </p>

            {/* Switch Cocina */}
            <div
              style={{
                background: '#f7fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <b style={{ fontSize: '0.88rem', color: '#2d3748' }}>Cocina · Preparación anticipada</b>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#718096' }}>
                  ANTICIPADA_ACTIVA_COCINA
                </div>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.15rem' }}>
                  Permite a los meseros pedir platos marcados como anticipados.
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleAnticipada('COCINA', anticipadaCocina)}
                disabled={guardandoAnticipada}
                style={{
                  background: anticipadaCocina ? '#276749' : '#e2e8f0',
                  color: anticipadaCocina ? '#fff' : '#4a5568',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: guardandoAnticipada ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: anticipadaCocina ? '#68d391' : '#a0aec0',
                  }}
                />
                {anticipadaCocina ? 'ACTIVA' : 'INACTIVA'}
              </button>
            </div>

            {/* Switch Bar */}
            <div
              style={{
                background: '#f7fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '4px',
                padding: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <b style={{ fontSize: '0.88rem', color: '#2d3748' }}>Bar · Preparación anticipada</b>
                <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#718096' }}>
                  ANTICIPADA_ACTIVA_BAR
                </div>
                <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.15rem' }}>
                  Permite despachar bebidas frías antes de los platos principales.
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleToggleAnticipada('BAR', anticipadaBar)}
                disabled={guardandoAnticipada}
                style={{
                  background: anticipadaBar ? '#276749' : '#e2e8f0',
                  color: anticipadaBar ? '#fff' : '#4a5568',
                  border: 'none',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '4px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: guardandoAnticipada ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: anticipadaBar ? '#68d391' : '#a0aec0',
                  }}
                />
                {anticipadaBar ? 'ACTIVA' : 'INACTIVA'}
              </button>
            </div>
          </div>

          {/* Tarjeta 4: Regla de negocio explicada */}
          <div
            style={{
              background: '#ebf8ff',
              border: '1px solid #bee3f8',
              borderRadius: '6px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
            }}
          >
            <b style={{ fontSize: '0.85rem', color: '#2b6cb0' }}>ℹ Regla de negocio garantizada:</b>
            <p style={{ fontSize: '0.8rem', color: '#2d3748', margin: 0, lineHeight: 1.45 }}>
              Un ítem de un pedido puede viajar con modalidad <code>ANTICIPADA</code> si y solo si: (1) el producto individual tiene{' '}
              <code>permite_anticipada = true</code> y (2) el interruptor del área de su destino está en <code>ACTIVA</code>. Si
              cualquiera de las dos condiciones no se cumple, el backend rechaza la solicitud atómica con <code>MODALIDAD_NO_PERMITIDA</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
