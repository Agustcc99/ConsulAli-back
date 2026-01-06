/**
 * Distribución por montos fijos con waterfall:
 * 1) laboratorio
 * 2) mamá
 * 3) Alicia
 *
 * Ajuste si precioPaciente != sumaInterna:
 * - "mama" | "alicia" | "prorrateo"
 */
export function calcularDistribucionFija(tratamiento, gastos = [], pagos = []) {
    const { precioPaciente, montoMama, montoAlicia, reglaAjuste = "mama" } = tratamiento;
  
    const labReal = gastos.reduce((a, g) => a + (g.monto || 0), 0);
    const totalPagado = pagos.reduce((a, p) => a + (p.monto || 0), 0);
  
    // Objetivos base
    let objetivoLab = labReal;
    let objetivoMama = montoMama;
    let objetivoAlicia = montoAlicia;
  
    // Ajuste por diferencia
    const sumaInternaBase = objetivoLab + objetivoMama + objetivoAlicia;
    const diferencia = precioPaciente - sumaInternaBase; // puede ser + o -
  
    if (diferencia !== 0) {
      if (reglaAjuste === "mama") {
        objetivoMama += diferencia;
      } else if (reglaAjuste === "alicia") {
        objetivoAlicia += diferencia;
      } else {
        // prorrateo entre mamá y Alicia (lab no se toca)
        const base = objetivoMama + objetivoAlicia || 1;
        const ajusteMama = Math.round(diferencia * (objetivoMama / base));
        const ajusteAlicia = diferencia - ajusteMama;
        objetivoMama += ajusteMama;
        objetivoAlicia += ajusteAlicia;
      }
    }
  
    // Evitar objetivos negativos (por descuentos grandes)
    objetivoMama = Math.max(objetivoMama, 0);
    objetivoAlicia = Math.max(objetivoAlicia, 0);
  
    const sumaInternaFinal = objetivoLab + objetivoMama + objetivoAlicia;
  
    // Waterfall
    const pagadoLab = Math.min(totalPagado, objetivoLab);
    const resto1 = Math.max(totalPagado - pagadoLab, 0);
  
    const pagadoMama = Math.min(resto1, objetivoMama);
    const resto2 = Math.max(resto1 - pagadoMama, 0);
  
    const pagadoAlicia = Math.min(resto2, objetivoAlicia);
  
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
        paciente: precioPaciente - totalPagado,
        lab: objetivoLab - pagadoLab,
        mama: objetivoMama - pagadoMama,
        alicia: objetivoAlicia - pagadoAlicia,
      },
  
      control: {
        sumaInternaBase,
        diferencia,
      },
    };
  }
  