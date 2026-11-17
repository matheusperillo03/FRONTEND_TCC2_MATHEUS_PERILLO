/**
 * RNF04: a interface só mostra CPF no formato descaracterizado dos dados
 * abertos do CNPJ, `***NNNNNN**` (os três primeiros dígitos e os dois
 * verificadores ocultos). O back-end já devolve só esse formato; esta é a
 * última barreira, aplicada aos textos vindos da API antes de irem para a tela.
 *
 * Um candidato a CPF é uma sequência de 11 dígitos, com ou sem a pontuação
 * `NNN.NNN.NNN-NN`, sem letra nem dígito colados antes ou depois. O candidato
 * é descaracterizado quando ao menos uma das condições vale:
 *
 * 1. os dois dígitos verificadores conferem (todo CPF de verdade passa aqui);
 * 2. o texto tem a forma própria de CPF, com hífen antes dos dois últimos
 *    dígitos (`NNN.NNN.NNN-NN` ou `NNNNNNNNN-NN`);
 * 3. o contexto diz que é CPF: a palavra "CPF" vem logo antes, ou o valor está
 *    num campo cujo nome contém "cpf" (`mascararCpfsEmValor`).
 *
 * Fora disso, 11 dígitos seguidos não são tratados como CPF: telefone com DDD,
 * número de controle, valor sem separador ou parte de um identificador maior
 * ficam como vieram. O dígito verificador deixa passar cerca de 1 em cada 100
 * números quaisquer; esses continuam descaracterizados, porque o erro escolhido
 * é esconder um número que não é CPF, e nunca mostrar um CPF.
 *
 * CNPJ (14 dígitos, com ou sem pontuação) não é alterado. O formato já
 * descaracterizado com pontuação, `***.NNN.NNN-**`, é só reescrito como
 * `***NNNNNN**`.
 */

/** Não pode haver dígito, letra ou ponto antes (seria o meio de um número maior, de um CNPJ ou de um hash). */
const CANDIDATO_A_CPF = /(?<![\dA-Za-z.])(\d{3})\.?(\d{3})\.?(\d{3})(-?)(\d{2})(?![\dA-Za-z])/g;

/** `***.123.456-**` ou `***123.456**`: já descaracterizado, mas com pontuação. */
const CPF_DESCARACTERIZADO_PONTUADO = /\*{3}\.?(\d{3})\.?(\d{3})-?\*{2}/g;

/** A palavra "CPF" logo antes do número, separada só por texto curto sem dígitos ("CPF nº ", "CPF do sócio: "). */
const PALAVRA_CPF_ANTES = /\bcpf\b[^\d]{0,30}$/i;

/** Nome de campo que indica CPF (`cpf`, `cpf_socio`, `cpfDoador`, `nr_cpf`). */
const CAMPO_DE_CPF = /cpf/i;

/** Confere os dois dígitos verificadores de um CPF (11 dígitos, sem pontuação). */
export function cpfComDigitosValidos(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;
  // Sequências de um dígito só (000.000.000-00, 111.111.111-11...) passam na conta, mas não são CPF.
  if (/^(\d)\1{10}$/.test(digitos)) return false;
  const verificador = (quantos: number): number => {
    let soma = 0;
    for (let i = 0; i < quantos; i++) soma += Number(digitos[i]) * (quantos + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return verificador(9) === Number(digitos[9]) && verificador(10) === Number(digitos[10]);
}

export interface OpcoesMascara {
  /** Verdadeiro: o texto vem de um campo de CPF; todo candidato é descaracterizado. */
  contextoCpf?: boolean;
}

export function mascararCpfs(texto: string, opcoes: OpcoesMascara = {}): string {
  if (!texto) return texto;
  return texto
    .replace(CANDIDATO_A_CPF, (tudo: string, inicio: string, meio1: string, meio2: string, hifen: string, dv: string, posicao: number) => {
      const ehCpf =
        opcoes.contextoCpf === true ||
        hifen === '-' ||
        cpfComDigitosValidos(inicio + meio1 + meio2 + dv) ||
        PALAVRA_CPF_ANTES.test(texto.slice(Math.max(0, posicao - 40), posicao));
      return ehCpf ? `***${meio1}${meio2}**` : tudo;
    })
    .replace(CPF_DESCARACTERIZADO_PONTUADO, (_tudo, meio1: string, meio2: string) => `***${meio1}${meio2}**`);
}

/** Como `mascararCpfs`, para o valor de um campo com nome: campo de CPF é contexto de CPF. */
export function mascararCpfsDoCampo(chave: string, texto: string): string {
  return mascararCpfs(texto, { contextoCpf: CAMPO_DE_CPF.test(chave) });
}

/**
 * Aplica `mascararCpfs` a todo texto dentro de um valor JSON (atributos,
 * parâmetros, detalhes). O nome do campo vale como contexto para o que está
 * dentro dele.
 */
export function mascararCpfsEmValor<T>(valor: T, opcoes: OpcoesMascara = {}): T {
  if (typeof valor === 'string') return mascararCpfs(valor, opcoes) as T;
  if (Array.isArray(valor)) return valor.map((item) => mascararCpfsEmValor(item, opcoes)) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [chave, mascararCpfsEmValor(v, { contextoCpf: opcoes.contextoCpf === true || CAMPO_DE_CPF.test(chave) })]),
    ) as T;
  }
  return valor;
}
