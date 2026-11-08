import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GestorCuentasPedidos } from '../src/servicios/GestorCuentasPedidos.js';
import { ErrorNegocio } from '../src/errores.js';

describe('GestorCuentasPedidos - Pruebas Unitarias de Dominio (RF4, RF12, RF14)', () => {
  const gestor = new GestorCuentasPedidos();

  describe('Casos de éxito (Happy Path)', () => {
    test('validarApertura valida y sanea etiqueta para una nueva cuenta en mesa (RF4)', () => {
      const cuentasExistentes = [
        { id: 1, mesa_id: 1, etiqueta: 'Cuenta 1', estado: 'ABIERTA' },
      ];
      const resultado = gestor.validarApertura({
        mesaId: 1,
        etiqueta: '  Cuenta 2  ',
        cuentasExistentes,
      });

      assert.deepEqual(resultado, {
        mesaId: 1,
        etiqueta: 'Cuenta 2',
      });
    });

    test('validarApertura permite reusar etiqueta de una cuenta previa si ya está en estado PAGADA', () => {
      const cuentasExistentes = [
        { id: 1, mesa_id: 2, etiqueta: 'Principal', estado: 'PAGADA' },
      ];
      const resultado = gestor.validarApertura({
        mesaId: 2,
        etiqueta: 'Principal',
        cuentasExistentes,
      });

      assert.equal(resultado.etiqueta, 'Principal');
    });

    test('validarItemsPedido retorna lista estructurada y sanitizada de ítems (RF12)', () => {
      const itemsEntrada = [
        {
          producto_id: 1,
          cantidad: 2,
          modalidad: 'MESA',
          observacion: 'Término medio, sin cebolla',
          opciones: [1, 2],
        },
        {
          producto_id: 4,
          cantidad: 1,
          modalidad: 'llevar',
        },
      ];

      const resultado = gestor.validarItemsPedido(itemsEntrada);
      assert.equal(resultado.length, 2);
      assert.equal(resultado[0].producto_id, 1);
      assert.equal(resultado[0].cantidad, 2);
      assert.equal(resultado[0].modalidad, 'MESA');
      assert.equal(resultado[0].observacion, 'Término medio, sin cebolla');
      assert.equal(resultado[1].modalidad, 'LLEVAR');
    });

    test('calcularTotalCuenta calcula con exactitud ítems base y opciones de personalización (RF4)', () => {
      const estado = {
        pedidos: [
          { id: 10, cuenta_id: 1, cancelado: false },
        ],
        itemsPedido: [
          // Producto 1: Hamburguesa $22.000 x 2 unidades = $44.000
          { id: 101, pedido_id: 10, cantidad: 2, precio_unitario: 22000 },
          // Producto 2: Bebida $5.000 x 1 unidad = $5.000
          { id: 102, pedido_id: 10, cantidad: 1, precio_unitario: 5000 },
        ],
        itemOpciones: [
          // Opción extra para ítem 101: Tocineta +$3.000 (aplica a cada una de las 2 unidades)
          { item_id: 101, opcion_id: 1, precio_extra: 3000 },
          // Opción extra para ítem 101: Queso extra +$2.000
          { item_id: 101, opcion_id: 2, precio_extra: 2000 },
        ],
      };

      // Cálculo esperado:
      // Ítem 101: 2 * (22000 + 3000 + 2000) = 2 * 27000 = 54000
      // Ítem 102: 1 * 5000 = 5000
      // Total = 59000
      const total = gestor.calcularTotalCuenta(1, estado);
      assert.equal(total, 59000);
    });

    test('calcularTotalCuenta excluye pedidos que fueron cancelados (RF8)', () => {
      const estado = {
        pedidos: [
          { id: 20, cuenta_id: 2, cancelado: true },
          { id: 21, cuenta_id: 2, cancelado: false },
        ],
        itemsPedido: [
          { id: 201, pedido_id: 20, cantidad: 1, precio_unitario: 50000 }, // Cancelado
          { id: 202, pedido_id: 21, cantidad: 1, precio_unitario: 15000 }, // Activo
        ],
        itemOpciones: [],
      };

      const total = gestor.calcularTotalCuenta(2, estado);
      assert.equal(total, 15000);
    });

    test('validarLiquidacion aprueba cobro con método de pago válido y calcula total con propina (RF14)', () => {
      const liquidacion = gestor.validarLiquidacion({
        estadoCuenta: 'PENDIENTE',
        metodoPago: 'TARJETA',
        propina: 10000,
        subtotal: 90000,
      });

      assert.deepEqual(liquidacion, {
        metodoPago: 'TARJETA',
        propina: 10000,
        subtotal: 90000,
        totalFinal: 100000,
      });
    });
  });

  describe('Valores límite (Boundary Values)', () => {
    test('validarApertura acepta etiqueta en el límite superior exacto de 50 caracteres', () => {
      const etiquetaExacta = 'C'.repeat(50);
      const resultado = gestor.validarApertura({
        mesaId: 3,
        etiqueta: etiquetaExacta,
        cuentasExistentes: [],
      });
      assert.equal(resultado.etiqueta.length, 50);
    });

    test('validarItemsPedido acepta la cantidad mínima válida de 1 unidad', () => {
      const items = [{ producto_id: 1, cantidad: 1, modalidad: 'MESA' }];
      const res = gestor.validarItemsPedido(items);
      assert.equal(res[0].cantidad, 1);
    });

    test('validarItemsPedido acepta la cantidad máxima límite de 100 unidades', () => {
      const items = [{ producto_id: 1, cantidad: 100, modalidad: 'MESA' }];
      const res = gestor.validarItemsPedido(items);
      assert.equal(res[0].cantidad, 100);
    });

    test('validarItemsPedido acepta observación en el límite superior exacto de 200 caracteres', () => {
      const obsExacta = 'X'.repeat(200);
      const items = [{ producto_id: 1, cantidad: 1, observacion: obsExacta }];
      const res = gestor.validarItemsPedido(items);
      assert.equal(res[0].observacion.length, 200);
    });

    test('validarLiquidacion acepta propina en límite inferior ($0) y calcula total exacto', () => {
      const res = gestor.validarLiquidacion({
        estadoCuenta: 'ABIERTA',
        metodoPago: 'EFECTIVO',
        propina: 0,
        subtotal: 45000,
      });
      assert.equal(res.propina, 0);
      assert.equal(res.totalFinal, 45000);
    });

    test('validarLiquidacion acepta propina en el límite superior exacto de $500.000', () => {
      const res = gestor.validarLiquidacion({
        estadoCuenta: 'PENDIENTE',
        metodoPago: 'TRANSFERENCIA',
        propina: 500000,
        subtotal: 100000,
      });
      assert.equal(res.propina, 500000);
      assert.equal(res.totalFinal, 600000);
    });

    test('calcularTotalCuenta devuelve 0 cuando una cuenta no tiene pedidos registrados', () => {
      const estadoVacio = { pedidos: [], itemsPedido: [], itemOpciones: [] };
      assert.equal(gestor.calcularTotalCuenta(99, estadoVacio), 0);
    });
  });

  describe('Manejo de errores y excepciones (Error Handling)', () => {
    test('validarApertura arroja ErrorNegocio si la etiqueta está ausente o vacía', () => {
      assert.throws(
        () => gestor.validarApertura({ mesaId: 1, etiqueta: '' }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarApertura({ mesaId: 1, etiqueta: '   ' }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarApertura arroja ErrorNegocio si la etiqueta supera 50 caracteres', () => {
      const etiquetaLarga = 'D'.repeat(51);
      assert.throws(
        () => gestor.validarApertura({ mesaId: 1, etiqueta: etiquetaLarga }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarApertura arroja ErrorNegocio con 409 si la etiqueta ya existe activa en la misma mesa', () => {
      const cuentas = [
        { id: 1, mesa_id: 5, etiqueta: 'Mesa 5 - A', estado: 'ABIERTA' },
      ];
      assert.throws(
        () => gestor.validarApertura({ mesaId: 5, etiqueta: 'mesa 5 - a', cuentasExistentes: cuentas }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'ETIQUETA_DUPLICADA' && err.estadoHttp === 409
      );
    });

    test('validarItemsPedido arroja ErrorNegocio si el arreglo de ítems está vacío o es nulo', () => {
      assert.throws(
        () => gestor.validarItemsPedido([]),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarItemsPedido(null),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarItemsPedido arroja ErrorNegocio si la cantidad es 0, negativa o no entera', () => {
      assert.throws(
        () => gestor.validarItemsPedido([{ producto_id: 1, cantidad: 0 }]),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarItemsPedido([{ producto_id: 1, cantidad: -2 }]),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
      assert.throws(
        () => gestor.validarItemsPedido([{ producto_id: 1, cantidad: 1.5 }]),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarItemsPedido arroja ErrorNegocio si la cantidad supera el límite de 100 unidades', () => {
      assert.throws(
        () => gestor.validarItemsPedido([{ producto_id: 1, cantidad: 101 }]),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarItemsPedido arroja ErrorNegocio ante modalidad no permitida', () => {
      assert.throws(
        () => gestor.validarItemsPedido([{ producto_id: 1, cantidad: 1, modalidad: 'DOMICILIO' }]),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarItemsPedido arroja ErrorNegocio si la observación supera los 200 caracteres', () => {
      const obsExcedida = 'Z'.repeat(201);
      assert.throws(
        () => gestor.validarItemsPedido([{ producto_id: 1, cantidad: 1, observacion: obsExcedida }]),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarLiquidacion arroja ErrorNegocio con 409 si la cuenta ya está pagada', () => {
      assert.throws(
        () => gestor.validarLiquidacion({ estadoCuenta: 'PAGADA', metodoPago: 'EFECTIVO' }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'CUENTA_YA_PAGADA' && err.estadoHttp === 409
      );
    });

    test('validarLiquidacion arroja ErrorNegocio si el método de pago no está autorizado', () => {
      assert.throws(
        () => gestor.validarLiquidacion({ estadoCuenta: 'ABIERTA', metodoPago: 'CRIPTOMONEDA' }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarLiquidacion arroja ErrorNegocio si la propina es negativa', () => {
      assert.throws(
        () => gestor.validarLiquidacion({ estadoCuenta: 'ABIERTA', metodoPago: 'EFECTIVO', propina: -500 }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });

    test('validarLiquidacion arroja ErrorNegocio si la propina supera los $500.000', () => {
      assert.throws(
        () => gestor.validarLiquidacion({ estadoCuenta: 'ABIERTA', metodoPago: 'EFECTIVO', propina: 500001 }),
        (err) => err instanceof ErrorNegocio && err.codigo === 'DATOS_INVALIDOS'
      );
    });
  });
});
