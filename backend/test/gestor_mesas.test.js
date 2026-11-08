import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GestorMesas } from '../src/servicios/GestorMesas.js';
import { ErrorNegocio } from '../src/errores.js';

describe('GestorMesas - Pruebas Unitarias de Dominio (RF2, RF13)', () => {
  const gestor = new GestorMesas();

  describe('Casos de éxito (Happy Path)', () => {
    test('validarId acepta identificadores enteros positivos numéricos o convertibles', () => {
      assert.equal(gestor.validarId(1), 1);
      assert.equal(gestor.validarId(42), 42);
      assert.equal(gestor.validarId('10'), 10);
    });

    test('calcularEstado retorna DISPONIBLE cuando no existen cuentas asociadas a la mesa', () => {
      const estado = { cuentas: [], pedidos: [], comandas: [] };
      const resultado = gestor.calcularEstado(1, estado);
      assert.equal(resultado, GestorMesas.ESTADOS.DISPONIBLE);
    });

    test('calcularEstado retorna DISPONIBLE cuando todas las cuentas de la mesa están en estado PAGADA', () => {
      const estado = {
        cuentas: [
          { id: 101, mesa_id: 1, estado: 'PAGADA' },
          { id: 102, mesa_id: 1, estado: 'PAGADA' },
        ],
        pedidos: [],
        comandas: [],
      };
      const resultado = gestor.calcularEstado(1, estado);
      assert.equal(resultado, GestorMesas.ESTADOS.DISPONIBLE);
    });

    test('calcularEstado retorna OCUPADA cuando existe al menos una cuenta en estado ABIERTA', () => {
      const estado = {
        cuentas: [{ id: 1, mesa_id: 2, estado: 'ABIERTA' }],
        pedidos: [],
        comandas: [],
      };
      const resultado = gestor.calcularEstado(2, estado);
      assert.equal(resultado, GestorMesas.ESTADOS.OCUPADA);
    });

    test('calcularEstado retorna EN_PROCESO_DE_PAGO cuando todas las cuentas vivas están en PENDIENTE', () => {
      const estado = {
        cuentas: [{ id: 1, mesa_id: 3, estado: 'PENDIENTE' }],
        pedidos: [],
        comandas: [],
      };
      const resultado = gestor.calcularEstado(3, estado);
      assert.equal(resultado, GestorMesas.ESTADOS.EN_PROCESO_DE_PAGO);
    });

    test('calcularEstado prioriza CON_PEDIDOS_PENDIENTES si hay comandas activas no terminadas', () => {
      const estado = {
        cuentas: [{ id: 1, mesa_id: 4, estado: 'ABIERTA' }],
        pedidos: [{ id: 10, cuenta_id: 1, cancelado: false }],
        comandas: [
          { id: 201, pedido_id: 10, estado: 'PENDIENTE' },
          { id: 202, pedido_id: 10, estado: 'EN_PREPARACION' },
        ],
      };
      const resultado = gestor.calcularEstado(4, estado);
      assert.equal(resultado, GestorMesas.ESTADOS.CON_PEDIDOS_PENDIENTES);
    });

    test('calcularEstado ignora comandas finalizadas (LISTA o CANCELADA) para no bloquear la mesa', () => {
      const estado = {
        cuentas: [{ id: 1, mesa_id: 5, estado: 'ABIERTA' }],
        pedidos: [{ id: 20, cuenta_id: 1, cancelado: false }],
        comandas: [
          { id: 301, pedido_id: 20, estado: 'LISTA' },
          { id: 302, pedido_id: 20, estado: 'CANCELADA' },
        ],
      };
      const resultado = gestor.calcularEstado(5, estado);
      assert.equal(resultado, GestorMesas.ESTADOS.OCUPADA);
    });

    test('validarReasignacion sanea y retorna parámetros correctos de reasignación (CU7)', () => {
      const datos = {
        mesaId: 2,
        meseroId: 3,
        motivo: '  Cubre turno de almuerzo  ',
      };
      const resultado = gestor.validarReasignacion(datos);
      assert.deepEqual(resultado, {
        mesaId: 2,
        meseroId: 3,
        motivo: 'Cubre turno de almuerzo',
      });
    });

    test('puedeAbrirCuenta permite la operación si la mesa está DISPONIBLE u OCUPADA', () => {
      const estadoDisponible = { cuentas: [] };
      const estadoOcupada = { cuentas: [{ id: 1, mesa_id: 2, estado: 'ABIERTA' }] };

      assert.equal(gestor.puedeAbrirCuenta(1, estadoDisponible), true);
      assert.equal(gestor.puedeAbrirCuenta(2, estadoOcupada), true);
    });
  });

  describe('Valores límite (Boundary Values)', () => {
    test('validarId acepta el límite inferior de entero positivo (id = 1)', () => {
      assert.equal(gestor.validarId(1), 1);
    });

    test('validarReasignacion acepta motivo en el límite superior exacto de 200 caracteres', () => {
      const motivoExacto = 'A'.repeat(200);
      const resultado = gestor.validarReasignacion({
        mesaId: 1,
        meseroId: 2,
        motivo: motivoExacto,
      });
      assert.equal(resultado.motivo.length, 200);
    });

    test('calcularEstado evalúa correctamente mesas con múltiples cuentas mixtas (ABIERTA y PENDIENTE)', () => {
      const estado = {
        cuentas: [
          { id: 1, mesa_id: 6, estado: 'PENDIENTE' },
          { id: 2, mesa_id: 6, estado: 'ABIERTA' },
        ],
        pedidos: [],
        comandas: [],
      };
      // La presencia de una cuenta ABIERTA prevalece sobre PENDIENTE
      assert.equal(gestor.calcularEstado(6, estado), GestorMesas.ESTADOS.OCUPADA);
    });

    test('calcularEstado ignora comandas de pedidos marcados como cancelados', () => {
      const estado = {
        cuentas: [{ id: 1, mesa_id: 7, estado: 'ABIERTA' }],
        pedidos: [{ id: 50, cuenta_id: 1, cancelado: true }],
        comandas: [{ id: 501, pedido_id: 50, estado: 'PENDIENTE' }],
      };
      assert.equal(gestor.calcularEstado(7, estado), GestorMesas.ESTADOS.OCUPADA);
    });
  });

  describe('Manejo de errores y excepciones (Error Handling)', () => {
    test('validarId arroja ErrorNegocio con 400 si el id es nulo, indefinido o vacío', () => {
      assert.throws(
        () => gestor.validarId(null),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS' && err.estadoHttp === 400
      );
      assert.throws(
        () => gestor.validarId(undefined),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarId(''),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarId arroja ErrorNegocio si el id es 0, negativo o decimal', () => {
      assert.throws(
        () => gestor.validarId(0),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarId(-5),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarId(3.14),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarId('mesa_tres'),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('calcularEstado arroja ErrorNegocio con 500 si no se provee estado de datos', () => {
      assert.throws(
        () => gestor.calcularEstado(1, null),
        (err) => err instanceof ErrorNegocio && err.codigo === 'ESTADO_NO_DISPONIBLE' && err.estadoHttp === 500
      );
    });

    test('validarReasignacion arroja ErrorNegocio si el meseroId es inválido o ausente', () => {
      assert.throws(
        () => gestor.validarReasignacion({ mesaId: 1, meseroId: null, motivo: 'Apoyo' }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarReasignacion({ mesaId: 1, meseroId: 0, motivo: 'Apoyo' }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarReasignacion arroja ErrorNegocio si el motivo está vacío o solo contiene espacios', () => {
      assert.throws(
        () => gestor.validarReasignacion({ mesaId: 1, meseroId: 2, motivo: '   ' }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarReasignacion arroja ErrorNegocio si el motivo supera los 200 caracteres', () => {
      const motivoExcedido = 'B'.repeat(201);
      assert.throws(
        () => gestor.validarReasignacion({ mesaId: 1, meseroId: 2, motivo: motivoExcedido }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS' && err.estadoHttp === 400
      );
    });

    test('puedeAbrirCuenta arroja ErrorNegocio con 409 si la mesa está en EN_PROCESO_DE_PAGO', () => {
      const estadoEnPago = {
        cuentas: [{ id: 1, mesa_id: 1, estado: 'PENDIENTE' }],
        pedidos: [],
        comandas: [],
      };
      assert.throws(
        () => gestor.puedeAbrirCuenta(1, estadoEnPago),
        (err) => err instanceof ErrorNegocio && err.codigo === 'MESA_EN_PAGO' && err.estadoHttp === 409
      );
    });
  });
});
