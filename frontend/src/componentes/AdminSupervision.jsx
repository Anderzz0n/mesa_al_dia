import { useState, useEffect, useCallback } from 'react';
import { obtenerActividadMesero } from '../api.js';

function obtenerFechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminSupervision({ meseros = [] }) {
  const [meseroSeleccionado, setMeseroSeleccionado] = useState('');
  const [fechaSeleccionada, setFechaSeleccionada] = useState(obtenerFechaHoy);
  const [actividad, setActividad] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const meseroIdEfectivo = meseroSeleccionado || (meseros[0]?.id ? String(meseros[0].id) : '');

  const recargarActividad = useCallback(async () => {
    if (!meseroIdEfectivo) return;
    setCargando(true);
    setError(null);
    try {
      const data = await obtenerActividadMesero(meseroIdEfectivo, fechaSeleccionada);
      setActividad(data);
    } catch (err) {
      setError(err.message || 'Error al obtener la actividad del mesero');
    } finally {
      setCargando(false);
    }
  }, [meseroIdEfectivo, fechaSeleccionada]);

  useEffect(() => {
    let activo = true;
    if (!meseroIdEfectivo) return;

    obtenerActividadMesero(meseroIdEfectivo, fechaSeleccionada)
      .then((data) => {
        if (activo) {
          setActividad(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (activo) setError(err.message || 'Error al obtener la actividad del mesero');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [meseroIdEfectivo, fechaSeleccionada]);

  const formatearDinero = (val) => {
    return `$ ${Number(val || 0).toLocaleString('es-CO')}`;
  };

  const formatearHora = (isoStr) => {
    if (!isoStr) return '--:--';
    const date = new Date(isoStr);
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const meseroActual = meseros.find((m) => String(m.id) === String(meseroIdEfectivo));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Cabecera y controles de filtro (A4a) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          background: '#fff',
          padding: '1rem 1.25rem',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1a202c', fontWeight: 700 }}>
            Supervisión operativa (RF15 / CU24)
          </h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#718096' }}>
            Auditoría de actividad diaria por mesero. Excluye pedidos con cancelación aprobada.
          </p>
        </div>

        {/* Filtros de Mesero y Fecha */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem' }}>
          <div>
            <label
              htmlFor="filtro-mesero"
              style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.2rem' }}
            >
              Mesero:
            </label>
            <select
              id="filtro-mesero"
              value={meseroIdEfectivo}
              onChange={(e) => setMeseroSeleccionado(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '0.85rem',
                background: '#fff',
                minWidth: '200px',
              }}
            >
              {meseros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre_completo || m.nombre_usuario} {m.activo ? '' : '(Inactivo)'}
                </option>
              ))}
              {meseros.length === 0 && <option value="">Sin meseros registrados</option>}
            </select>
          </div>

          <div>
            <label
              htmlFor="filtro-fecha"
              style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4a5568', marginBottom: '0.2rem' }}
            >
              Fecha:
            </label>
            <input
              id="filtro-fecha"
              type="date"
              value={fechaSeleccionada}
              onChange={(e) => setFechaSeleccionada(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                border: '1px solid #cbd5e0',
                borderRadius: '6px',
                fontSize: '0.85rem',
                background: '#fff',
              }}
            />
          </div>

          <button
            onClick={recargarActividad}
            disabled={cargando}
            style={{
              alignSelf: 'flex-end',
              padding: '0.45rem 1rem',
              background: '#2b6cb0',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: cargando ? 'not-allowed' : 'pointer',
              opacity: cargando ? 0.7 : 1,
            }}
          >
            {cargando ? 'Consultando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            background: '#fff5f5',
            border: '1px solid #feb2b2',
            color: '#c53030',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Tarjetas KPI (A4a · Bloque 6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          style={{
            background: '#f7fafc',
            border: '1px solid #e2e8f0',
            padding: '1rem',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#718096' }}>
            Pedidos despachados
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2d3748', marginTop: '0.25rem' }}>
            {actividad?.total_pedidos || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
            Sin pedidos cancelados
          </div>
        </div>

        <div
          style={{
            background: '#f7fafc',
            border: '1px solid #e2e8f0',
            padding: '1rem',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#718096' }}>
            Total facturado
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2d3748', marginTop: '0.25rem' }}>
            {formatearDinero(actividad?.total_facturado || 0)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
            Valor neto de pedidos activos
          </div>
        </div>

        <div
          style={{
            background: '#f7fafc',
            border: '1px solid #e2e8f0',
            padding: '1rem',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#718096' }}>
            Mesas atendidas
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#2d3748', marginTop: '0.25rem' }}>
            {actividad?.mesas_atendidas || actividad?.pedidos_por_mesa?.length || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#718096', marginTop: '0.2rem' }}>
            {actividad?.pedidos_por_mesa && actividad.pedidos_por_mesa.length > 0
              ? actividad.pedidos_por_mesa.map((m) => `Mesa ${m.mesa}`).join(', ')
              : 'Sin mesas activas'}
          </div>
        </div>

        <div
          style={{
            background: '#fff5f5',
            border: '1px solid #fed7d7',
            padding: '1rem',
            borderRadius: '8px',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, color: '#c53030' }}>
            Cancelaciones
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#c53030', marginTop: '0.25rem' }}>
            {actividad?.cancelaciones_excluidas ?? 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9b2c2c', marginTop: '0.2rem' }}>
            Excluida de la actividad (CU24)
          </div>
        </div>
      </div>

      {/* Tabla detallada de pedidos del mesero (A4a · Bloque 8) */}
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#2d3748', textTransform: 'uppercase' }}>
            Pedidos despachados por {meseroActual?.nombre_completo || meseroActual?.nombre_usuario || 'el mesero'}
          </span>
          <span style={{ fontSize: '0.8rem', color: '#718096' }}>
            Ordenados por hora de registro (más recientes primero)
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#edf2f7', borderBottom: '1px solid #cbd5e0', color: '#4a5568' }}>
                <th style={{ padding: '0.6rem 1rem' }}>Hora</th>
                <th style={{ padding: '0.6rem 1rem' }}>Mesa</th>
                <th style={{ padding: '0.6rem 1rem' }}>Sector</th>
                <th style={{ padding: '0.6rem 1rem' }}>Cuenta</th>
                <th style={{ padding: '0.6rem 1rem' }}>Ítems del pedido</th>
                <th style={{ padding: '0.6rem 1rem' }}>Estado comanda</th>
                <th style={{ padding: '0.6rem 1rem', textAlign: 'right' }}>Total pedido</th>
              </tr>
            </thead>
            <tbody>
              {actividad?.pedidos && actividad.pedidos.length > 0 ? (
                actividad.pedidos.map((ped, idx) => (
                  <tr
                    key={ped.pedido_id || idx}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      background: idx % 2 === 0 ? '#fff' : '#fafafa',
                    }}
                  >
                    <td style={{ padding: '0.6rem 1rem', fontWeight: 600, color: '#4a5568' }}>
                      {formatearHora(ped.creado_en)}
                    </td>
                    <td style={{ padding: '0.6rem 1rem', fontWeight: 700, color: '#1a202c' }}>
                      Mesa {ped.mesa_numero}
                    </td>
                    <td style={{ padding: '0.6rem 1rem', color: '#4a5568' }}>
                      {ped.sector_nombre || 'General'}
                    </td>
                    <td style={{ padding: '0.6rem 1rem', color: '#718096' }}>
                      {ped.cuenta_etiqueta || `Cuenta ${ped.cuenta_id || 1}`}
                    </td>
                    <td style={{ padding: '0.6rem 1rem', color: '#2d3748' }}>
                      {ped.items_resumen || 'Detalle no disponible'}
                    </td>
                    <td style={{ padding: '0.6rem 1rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: ped.estado_comanda === 'LISTA' ? '#c6f6d5' : '#e2e8f0',
                          color: ped.estado_comanda === 'LISTA' ? '#22543d' : '#4a5568',
                        }}
                      >
                        {ped.estado_comanda || 'RECIBIDA'}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 1rem', textAlign: 'right', fontWeight: 700, color: '#2d3748' }}>
                      {ped.total ? formatearDinero(ped.total) : '--'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem 1rem', textAlign: 'center', color: '#a0aec0' }}>
                    {cargando
                      ? 'Cargando pedidos...'
                      : 'No se registraron pedidos despachados para este mesero en la fecha seleccionada.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

