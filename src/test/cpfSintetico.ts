/**
 * CPF sintético para testes. Todo número com dígitos verificadores válidos pode
 * pertencer a alguém, então nenhum fica gravado no repositório: o teste gera um
 * número aleatório a cada execução e calcula os dígitos verificadores.
 */
function digito(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** 11 dígitos com verificadores válidos, nunca uma sequência de um dígito só. */
export function cpfSinteticoValido(): string {
  for (;;) {
    const v = new Uint8Array(9);
    crypto.getRandomValues(v);
    const base = Array.from(v, (x) => String(x % 10)).join('');
    if (/^(\d)\1{8}$/.test(base)) continue;
    const d1 = digito(base);
    const d2 = digito(base + d1);
    return `${base}${d1}${d2}`;
  }
}

/** Mesmo número com o último dígito trocado (verificador inválido). */
export function comVerificadorErrado(cpf: string): string {
  const ultimo = (Number(cpf[10]) + 1) % 10;
  return cpf.slice(0, 10) + String(ultimo);
}

/** Forma descaracterizada esperada: `***NNNNNN**`. */
export function mascarado(cpf: string): string {
  return `***${cpf.slice(3, 9)}**`;
}

/** Forma pontuada: `NNN.NNN.NNN-NN`. */
export function pontuado(cpf: string): string {
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
