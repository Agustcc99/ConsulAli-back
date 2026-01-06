export const esNumeroValido = (valor) =>
    typeof valor === "number" && Number.isFinite(valor);
  
  export const esEnteroNoNegativo = (valor) =>
    esNumeroValido(valor) && Number.isInteger(valor) && valor >= 0;
  
  export const esEnteroPositivo = (valor) =>
    esNumeroValido(valor) && Number.isInteger(valor) && valor > 0;
  
  export const textoNoVacio = (valor) =>
    typeof valor === "string" && valor.trim().length > 0;
  