/**
 * Distribución con waterfall:
 * 1) laboratorio (se cubre primero)
 * 2) mamá
 * 3) Alicia
 *
 * Soporta 2 modos:
 * - manual: usa montoMama/montoAlicia guardados (histórico)
 * - auto: calcula sobre NETO (= precioPaciente - labReal) con porcentajes "congelados" en el tratamiento
 *
 * ✅ FIX: En modo MANUAL, el orden real del consultorio es:
 *    laboratorio -> Alicia -> Mamá (residuo / lo que sobra)
 *
 * NOTA:
 * - labReal se calcula con gastos tipo "laboratorio"
 * - otros gastos NO entran al neto para repartir (igual que antes)
 */
export function calcularDistribucionFija(tratamiento, gastos = [], pagos = []) {
  const precioPaciente = Number(tratamiento?.precioPaciente ?? 0) || 0;

  // SOLO laboratorio (no todos los gastos)
  const labReal = (gastos || [])
    .filter((g) => (g?.tipo || "laboratorio") === "laboratorio")
    .reduce((acc, g) => acc + (Number(g?.monto ?? 0) || 0), 0);

  const totalPagado = (pagos || []).reduce(
    (acc, p) => acc + (Number(p?.monto ?? 0) || 0),
    0
  );

  // Neto de ganancia sobre el que se reparte (solo aplica en modo auto)
  const netoGanancia = precioPaciente - labReal;
  const netoParaRepartir = Math.max(netoGanancia, 0);

  const modoDistribucion = String(tratamiento?.modoDistribucion || "auto");

  // Si es manual, o si viene de histórico (tiene montos y no tiene porcentajes congelados),
  // respetamos montos fijos.
  const tienePorcentajesCongelados =
    Number.isFinite(Number(tratamiento?.porcentajeMamaUsado)) ||
    Number.isFinite(Number(tratamiento?.porcentajeAliciaUsado));

  const montoMamaHist = Number(tratamiento?.montoMama ?? 0) || 0;
  const montoAliciaHist = Number(tratamiento?.montoAlicia ?? 0) || 0;

  const usarManual =
    modoDistribucion === "manual" ||
    (!tienePorcentajesCongelados && (montoMamaHist > 0 || montoAliciaHist > 0));

  let objetivoMama = 0;
  let objetivoAlicia = 0;

  let porcentajeMamaUsado = null;
  let porcentajeAliciaUsado = null;

  if (usarManual) {
    // Histórico/manual: se respeta tal cual
    objetivoMama = Math.max(Math.round(montoMamaHist), 0);
    objetivoAlicia = Math.max(Math.round(montoAliciaHist), 0);
  } else {
    // Auto: se usa porcentaje congelado si existe (snapshot),
    // y si no existe, se cae a los defaults actuales para no romper.
    const DEFAULT_PORC_MAMA = 68.42105;

    const pm = Number(tratamiento?.porcentajeMamaUsado);
    const pa = Number(tratamiento?.porcentajeAliciaUsado);

    // Prioridad:
    // - si viene porcentaje mamá, lo usamos; Alicia es 100 - mamá (salvo que venga explícito)
    // - si viene solo Alicia, mamá es 100 - Alicia
    // - si no viene ninguno, default
    if (Number.isFinite(pm)) {
      porcentajeMamaUsado = pm;
      porcentajeAliciaUsado = Number.isFinite(pa) ? pa : 100 - pm;
    } else if (Number.isFinite(pa)) {
      porcentajeAliciaUsado = pa;
      porcentajeMamaUsado = 100 - pa;
    } else {
      porcentajeMamaUsado = DEFAULT_PORC_MAMA;
      porcentajeAliciaUsado = 100 - DEFAULT_PORC_MAMA;
    }

    // clamp suave
    porcentajeMamaUsado = Math.min(Math.max(porcentajeMamaUsado, 0), 100);
    porcentajeAliciaUsado = Math.min(Math.max(porcentajeAliciaUsado, 0), 100);

    // Redondeo en enteros: redondeo para mamá, resto para Alicia
    objetivoMama = Math.round((netoParaRepartir * porcentajeMamaUsado) / 100);
    objetivoAlicia = netoParaRepartir - objetivoMama;
  }

  const objetivoLab = labReal;

  const sumaInternaFinal = objetivoLab + objetivoMama + objetivoAlicia;

  // ✅ Waterfall:
  // - AUTO: lab -> mamá -> Alicia (se mantiene para no tocar históricos auto)
  // - MANUAL: lab -> Alicia -> mamá (fix para tu regla real y pendientes falsos)
  let pagadoLab = 0;
  let pagadoMama = 0;
  let pagadoAlicia = 0;

  if (usarManual) {
    // ✅ MANUAL: lab -> Alicia -> mamá
    pagadoLab = Math.min(totalPagado, objetivoLab);
    const resto1 = Math.max(totalPagado - pagadoLab, 0);

    pagadoAlicia = Math.min(resto1, objetivoAlicia);
    const resto2 = Math.max(resto1 - pagadoAlicia, 0);

    pagadoMama = Math.min(resto2, objetivoMama);
  } else {
    // 🔒 AUTO: lab -> mamá -> Alicia (como estaba)
    pagadoLab = Math.min(totalPagado, objetivoLab);
    const resto1 = Math.max(totalPagado - pagadoLab, 0);

    pagadoMama = Math.min(resto1, objetivoMama);
    const resto2 = Math.max(resto1 - pagadoMama, 0);

    pagadoAlicia = Math.min(resto2, objetivoAlicia);
  }

  // Saldos
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
      precioPaciente,
      netoGanancia, // puede ser negativo si lab > precio
      netoParaRepartir,
      modoDistribucion: usarManual ? "manual" : "auto",
      porcentajeMamaUsado,
      porcentajeAliciaUsado,

      // compat / debug
      sumaInternaBase: sumaInternaFinal,
      diferencia: precioPaciente - sumaInternaFinal,
    },
  };
}
