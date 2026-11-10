/**
 * Script de validación automatizada para el motor de calendario de duplas.
 * Ejecutable vía: npx tsx scripts/test-calendario-duplas.ts
 */

import assert from 'node:assert/strict';
import {
  proyectarCalendarioCohorteV2,
  TOTAL_SESIONES_CICLO,
  TOTAL_SESIONES_MATRIZ,
} from '../src/lib/calendario-duplas';

function testCasoIdeal() {
  console.log('\n============================================================');
  console.log('TEST 1: Caso Ideal (3 semanas limpias sin feriados)');
  console.log('============================================================');

  const input = {
    fechaInicioTeoria: '2026-02-27',
    fechaInicioSimulador: '2026-03-02', // Lunes
  };

  const res = proyectarCalendarioCohorteV2(input);

  // 1. Verificación de fechas límite
  assert.strictEqual(
    res.fechaInicioSimulador,
    '2026-03-02',
    'La fecha de inicio debe ser 2026-03-02'
  );
  assert.strictEqual(
    res.fechaFinSimulador,
    '2026-03-20',
    'La fecha de fin debe ser Viernes de Semana 3 (2026-03-20)'
  );
  assert.strictEqual(
    res.fechaPaseTerreno,
    '2026-03-23',
    'Pase a terreno debe ser Lunes siguiente (2026-03-23)'
  );

  // 2. Grupo A: 3 Lunes y 3 Miércoles exactos
  assert.strictEqual(
    res.diasEfectivosGrupoA.length,
    TOTAL_SESIONES_CICLO,
    'Grupo A debe tener 6 fechas'
  );
  assert.deepStrictEqual(
    res.diasEfectivosGrupoA,
    [
      '2026-03-02', // Lun Sem 1
      '2026-03-04', // Mié Sem 1
      '2026-03-09', // Lun Sem 2
      '2026-03-11', // Mié Sem 2
      '2026-03-16', // Lun Sem 3
      '2026-03-18', // Mié Sem 3
    ],
    'Grupo A debe cursar los 3 Lunes y 3 Miércoles canónicos'
  );

  // 3. Grupo B: 3 Martes y 3 Jueves exactos
  assert.strictEqual(
    res.diasEfectivosGrupoB.length,
    TOTAL_SESIONES_CICLO,
    'Grupo B debe tener 6 fechas'
  );
  assert.deepStrictEqual(
    res.diasEfectivosGrupoB,
    [
      '2026-03-03', // Mar Sem 1
      '2026-03-05', // Jue Sem 1
      '2026-03-10', // Mar Sem 2
      '2026-03-12', // Jue Sem 2
      '2026-03-17', // Mar Sem 3
      '2026-03-19', // Jue Sem 3
    ],
    'Grupo B debe cursar los 3 Martes y 3 Jueves canónicos'
  );

  // 4. Los 3 Viernes Buffer deben estar libres
  assert.strictEqual(res.viernesEstado.length, 3, 'Deben existir 3 viernes buffer');
  res.viernesEstado.forEach((v, idx) => {
    assert.strictEqual(
      v.estado,
      'LIBRE',
      `El Viernes de semana ${idx + 1} (${v.fecha}) debe estar LIBRE`
    );
    assert.strictEqual(
      v.sesionesReubicadas,
      0,
      `El Viernes ${v.fecha} debe tener 0 sesiones reubicadas`
    );
  });

  // 5. Matriz de 48 sesiones
  assert.strictEqual(
    res.matrizSesiones.length,
    TOTAL_SESIONES_MATRIZ,
    'La matriz debe contener exactamente 48 sesiones'
  );
  const reubicadas = res.matrizSesiones.filter((s) => s.reprogramada);
  assert.strictEqual(
    reubicadas.length,
    0,
    'En el caso ideal ninguna sesión debe estar reprogramada'
  );

  console.log('✓ Inicio:            ', res.fechaInicioSimulador);
  console.log('✓ Fin de Simulador:  ', res.fechaFinSimulador);
  console.log('✓ Pase a Terreno:    ', res.fechaPaseTerreno);
  console.log('✓ Fechas Grupo A (6):', res.diasEfectivosGrupoA.join(', '));
  console.log('✓ Fechas Grupo B (6):', res.diasEfectivosGrupoB.join(', '));
  console.log('✓ 3 Viernes Buffer libres verificados.');
  console.log('✓ Total 48 slots planificados.');
  console.log('-> TEST 1 PASÓ EXITOSAMENTE.');
  return res;
}

function testCasoConFeriado(resIdeal: ReturnType<typeof proyectarCalendarioCohorteV2>) {
  console.log('\n============================================================');
  console.log('TEST 2: Caso con Feriado (Miércoles de Semana 2 bloqueado)');
  console.log('============================================================');

  // Miércoles de Semana 2 = 2026-03-11
  const feriadoMiercolesSem2 = '2026-03-11';
  const input = {
    fechaInicioTeoria: '2026-02-27',
    fechaInicioSimulador: '2026-03-02',
    diasBloqueados: [feriadoMiercolesSem2],
    estrategiaFeriados: 'MOVER_A_VIERNES' as const,
  };

  const res = proyectarCalendarioCohorteV2(input);

  // 1. Invarianza de fecha final de egreso
  assert.strictEqual(
    res.fechaFinSimulador,
    resIdeal.fechaFinSimulador,
    'La fecha final de simulador NO debe alterarse (debe mantenerse el egreso a las 3 semanas exactas)'
  );
  assert.strictEqual(
    res.fechaPaseTerreno,
    resIdeal.fechaPaseTerreno,
    'La fecha de pase a terreno NO debe alterarse'
  );

  // 2. Grupo A absorbió el feriado moviendo la sesión 4 al Viernes de esa misma semana
  assert.deepStrictEqual(
    res.diasEfectivosGrupoA,
    [
      '2026-03-02', // Lun Sem 1
      '2026-03-04', // Mié Sem 1
      '2026-03-09', // Lun Sem 2
      '2026-03-13', // Viernes de Semana 2 (RECUPERATORIO de feriado 11/03)
      '2026-03-16', // Lun Sem 3
      '2026-03-18', // Mié Sem 3
    ],
    'Grupo A debe tener la fecha del Miércoles 11/03 reubicada al Viernes 13/03'
  );

  // 3. Grupo B no debe sufrir ninguna alteración
  assert.deepStrictEqual(
    res.diasEfectivosGrupoB,
    resIdeal.diasEfectivosGrupoB,
    'Grupo B debe mantenerse intacto'
  );

  // 4. Verificación de los estados de Viernes Buffer
  const v1 = res.viernesEstado.find((v) => v.fecha === '2026-03-06');
  const v2 = res.viernesEstado.find((v) => v.fecha === '2026-03-13');
  const v3 = res.viernesEstado.find((v) => v.fecha === '2026-03-20');

  assert.ok(v1 && v2 && v3, 'Deben existir los 3 viernes de semana 1, 2 y 3');
  assert.strictEqual(v1.estado, 'LIBRE');
  assert.strictEqual(v1.sesionesReubicadas, 0);

  assert.strictEqual(
    v2.estado,
    'RECUPERATORIO_FERIADO',
    'El Viernes de semana 2 debe estar marcado como RECUPERATORIO_FERIADO'
  );
  assert.strictEqual(
    v2.sesionesReubicadas,
    4,
    'El Viernes de semana 2 debe registrar 4 sesiones reubicadas (4 duplas del Grupo A)'
  );

  assert.strictEqual(v3.estado, 'LIBRE');
  assert.strictEqual(v3.sesionesReubicadas, 0);

  // 5. Matriz de sesiones: verificar flags de recuperatorio
  assert.strictEqual(res.matrizSesiones.length, TOTAL_SESIONES_MATRIZ);
  const sesionesViernes13 = res.matrizSesiones.filter(
    (s) => s.fechaProgramada === '2026-03-13'
  );
  assert.strictEqual(
    sesionesViernes13.length,
    4,
    'Deben existir exactamente 4 sesiones programadas en el Viernes 13/03'
  );

  sesionesViernes13.forEach((s) => {
    assert.strictEqual(s.grupo, 'GRUPO_A');
    assert.strictEqual(s.numeroSesion, 4);
    assert.strictEqual(s.diaSemana, 'Viernes');
    assert.strictEqual(s.esRecuperatorioViernes, true);
    assert.strictEqual(s.reprogramada, true);
    assert.ok(
      s.motivoReprogramacion?.includes('2026-03-11'),
      'Debe indicar en el motivo la fecha original del feriado'
    );
  });

  // 6. Verificar que se emitió la alerta operativa
  assert.ok(
    res.alertas.some((a) => a.includes('2026-03-11') && a.includes('2026-03-13')),
    'Debe registrarse la alerta de absorción de feriado'
  );

  console.log('✓ Fin de Simulador invariante: ', res.fechaFinSimulador);
  console.log('✓ Pase a Terreno invariante:   ', res.fechaPaseTerreno);
  console.log('✓ Fechas Grupo A adaptadas:   ', res.diasEfectivosGrupoA.join(', '));
  console.log('✓ Viernes 13/03 clasificado:   ', v2.estado, `(${v2.sesionesReubicadas} sesiones reubicadas)`);
  console.log('✓ Alerta registrada:          ', res.alertas[0]);
  console.log('-> TEST 2 PASÓ EXITOSAMENTE.');
}

function testNormalizacionInicioNoLunes() {
  console.log('\n============================================================');
  console.log('TEST 3: Normalización de fecha de inicio (no Lunes)');
  console.log('============================================================');

  // 2026-03-03 es Martes -> debe ajustarse automáticamente al Lunes siguiente 2026-03-09
  const res = proyectarCalendarioCohorteV2({
    fechaInicioTeoria: '2026-02-27',
    fechaInicioSimulador: '2026-03-03',
  });

  assert.strictEqual(
    res.fechaInicioSimulador,
    '2026-03-09',
    'Debe ajustar al siguiente Lunes (2026-03-09)'
  );
  assert.ok(
    res.alertas.some((a) => a.includes('no es Lunes')),
    'Debe emitir advertencia operativa de ajuste de inicio'
  );

  console.log('✓ Inicio solicitado: 2026-03-03 (Martes)');
  console.log('✓ Inicio ajustado:   2026-03-09 (Lunes)');
  console.log('-> TEST 3 PASÓ EXITOSAMENTE.');
}

function main() {
  console.log('INICIANDO SUITE DE TESTS: MOTOR CALENDARIO DE DUPLAS (SPRINT 2)');
  const resIdeal = testCasoIdeal();
  testCasoConFeriado(resIdeal);
  testNormalizacionInicioNoLunes();
  console.log('\n============================================================');
  console.log('🎉 TODOS LOS TESTS DE ASSERTION PASARON EXITOSAMENTE.');
  console.log('============================================================\n');
}

main();
