/**
 * Localiza, no texto do documento, o trecho citado por uma sugestão da IA.
 *
 * O back-end guarda `posicao_inicio` em pontos de código Unicode; as strings
 * do JavaScript são indexadas em unidades UTF-16. As duas contagens só
 * coincidem enquanto o texto não tem caracteres fora do plano básico (emoji,
 * alguns símbolos). Por isso a posição é convertida e, mesmo assim, não é
 * aceita às cegas: o trecho precisa estar, literal, naquele ponto; se não
 * estiver, vale a ocorrência mais próxima; se não houver nenhuma, `null`.
 */
export interface TrechoLocalizado {
  /** Índices em unidades UTF-16, prontos para `texto.slice(inicio, fim)`. */
  inicio: number;
  fim: number;
  /** Verdadeiro: o trecho estava exatamente na posição informada pelo back-end. */
  naPosicaoInformada: boolean;
}

/** Converte uma posição em pontos de código Unicode no índice UTF-16 correspondente. */
export function indiceUtf16(texto: string, pontosDeCodigo: number): number {
  let indice = 0;
  for (let n = 0; n < pontosDeCodigo && indice < texto.length; n++) {
    indice += (texto.codePointAt(indice) ?? 0) > 0xffff ? 2 : 1;
  }
  return indice;
}

export function localizarTrecho(texto: string, trecho: string, posicaoInicio: number): TrechoLocalizado | null {
  if (!texto || !trecho) return null;
  const esperado = indiceUtf16(texto, Math.max(0, Number.isFinite(posicaoInicio) ? Math.trunc(posicaoInicio) : 0));
  if (texto.startsWith(trecho, esperado)) return { inicio: esperado, fim: esperado + trecho.length, naPosicaoInformada: true };
  let melhor = -1;
  for (let i = texto.indexOf(trecho); i >= 0; i = texto.indexOf(trecho, i + 1)) {
    if (melhor < 0 || Math.abs(i - esperado) < Math.abs(melhor - esperado)) melhor = i;
  }
  return melhor < 0 ? null : { inicio: melhor, fim: melhor + trecho.length, naPosicaoInformada: false };
}
