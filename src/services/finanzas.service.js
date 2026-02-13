export function calcularDistribucionFija(tratamiento, gastos = [], pagos = []) {
  const precioPaciente = Number(tratamiento?.precioPaciente ?? 0) || 0;

  // 1) LABORATORIO REAL
  const labReal = (gastos || [])
    .filter((g) => (g?.tipo || "laboratorio") === "laboratorio")
    .reduce((acc, g) => acc + (Number(g?.monto ?? 0) || 0), 0);

  const totalPagado = (pagos || []).reduce(
    (acc, p) => acc + (Number(p?.monto ?? 0) || 0),
    0
  );

  // 2) OBJETIVOS

  const objetivoLab = Math.max(labReal, 0);

  const objetivoAlicia = Math.max(
    Number(tratamiento?.montoAlicia ?? 0),
    0
  );

  // Mamá = residuo automático
  const objetivoMama = Math.max(
    precioPaciente - objetivoLab - objetivoAlicia,
    0
  );

  // 3) WATERFALL CORRECTO (Lab → Mamá → Alicia)

  const pagadoLab = Math.min(totalPagado, objetivoLab);
  const resto1 = Math.max(totalPagado - pagadoLab, 0);

  const pagadoMama = Math.min(resto1, objetivoMama);
  const resto2 = Math.max(resto1 - pagadoMama, 0);

  const pagadoAlicia = Math.min(resto2, objetivoAlicia);

  const saldoPaciente = precioPaciente - totalPagado;

  return {
    totalPagado,
    labReal,

    objetivo: {
      lab: objetivoLab,
      mama: objetivoMama,
      alicia: objetivoAlicia,
      sumaInterna: objetivoLab + objetivoMama + objetivoAlicia,
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
  };
}
