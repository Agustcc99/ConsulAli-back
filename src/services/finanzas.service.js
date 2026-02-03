/**
 * Distribución por regla NUEVA con waterfall:
 * 1) laboratorio (se cubre primero)
 * 2) mamá
 * 3) Alicia
 *
 * Regla:
 * - precioPaciente = "bruto"
 * - laboratorio se descuenta del bruto
 * - del NETO (= precioPaciente - laboratorio) se divide 70/30
 *
 * NOTA:
 * - Se usa el laboratorio REAL a partir de gastos tipo "laboratorio".
 * - Otros gastos (tipo "otro") NO se descuentan del neto para el 70/30.
 */
export function calcularDistribucionFija(tratamiento, gastos = [], pagos = []) {
  const precioPaciente = Number(tratamiento?.precioPaciente ?? 0) || 0;

  // ✅ SOLO laboratorio (no todos los gastos)
  const labReal = (gastos || [])
    .filter((g) => (g?.tipo || "laboratorio") === "laboratorio")
    .reduce((acc, g) => acc + (Number(g?.monto ?? 0) || 0), 0);

  const totalPagado = (pagos || []).reduce((acc, p) => acc + (Number(p?.monto ?? 0) || 0), 0);

  // Neto de ganancia sobre el que se reparte 70/30
  const netoGanancia = precioPaciente - labReal;
  const netoParaRepartir = Math.max(netoGanancia, 0);

  // 70/30 en enteros: redondeo para mamá, resto para Alicia
  const objetivoMama = Math.round((netoParaRepartir * 68,42105) / 100);
  const objetivoAlicia = netoParaRepartir - objetivoMama;

  const objetivoLab = labReal;

  const sumaInternaFinal = objetivoLab + objetivoMama + objetivoAlicia;

  // Waterfall (secuencial): lab -> mamá -> Alicia
  const pagadoLab = Math.min(totalPagado, objetivoLab);
  const resto1 = Math.max(totalPagado - pagadoLab, 0);

  const pagadoMama = Math.min(resto1, objetivoMama);
  const resto2 = Math.max(resto1 - pagadoMama, 0);

  const pagadoAlicia = Math.min(resto2, objetivoAlicia);

  // Saldos (no toco la lógica original del saldo del paciente)
  const saldoPaciente = precioPaciente - totalPagado;

  return {
    totalPagado,
    labReal,

    objetivo: {
      lab: objetivoLab,
      mama: objetivoMama,
      alicia: objetivoAlicia,
      sumaInterna: sumaInternaFinal,
    },

    pagado: {
      lab: pagadoLab,
      mama: pagadoMama,
      alicia: pagadoAlicia,
    },

    saldo: {
      paciente: saldoPaciente,
      lab: objetivoLab - pagadoLab,
      mama: objetivoMama - pagadoMama,
      alicia: objetivoAlicia - pagadoAlicia,
    },

    control: {
      // Dejo datos útiles para debug / reportes
      precioPaciente,
      netoGanancia,        // puede ser negativo si lab > precio
      netoParaRepartir,    // clamp a 0
      // compat con lo que antes existía (ya no aplica “diferencia” por montos fijos)
      sumaInternaBase: sumaInternaFinal,
      diferencia: precioPaciente - sumaInternaFinal,
    },
  };
}
