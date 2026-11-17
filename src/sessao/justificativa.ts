/** Limite local do texto da justificativa (o campo também usa `maxLength`). */
export const TAMANHO_MAXIMO_JUSTIFICATIVA = 500;

/** Caracteres de controle (categoria Unicode Cc): NUL, tabulação, quebras de linha, ESC etc. */
const CONTROLE = /\p{Cc}/u;

/**
 * Validação local da justificativa, antes de guardá-la na sessão. O back-end
 * rejeita justificativa com caracteres de controle; avisar aqui evita que
 * todas as consultas seguintes sejam recusadas. Devolve a mensagem de erro
 * ou `null` quando o texto é aceito. A regra que vale é a do back-end.
 */
export function validarJustificativa(texto: string): string | null {
  const t = texto.trim();
  if (!t) return 'Informe a justificativa da consulta.';
  if (CONTROLE.test(t)) {
    return 'A justificativa tem caracteres de controle (tabulação, quebra de linha ou outro caractere invisível), que o servidor recusa. Redigite o texto sem eles.';
  }
  if (t.length > TAMANHO_MAXIMO_JUSTIFICATIVA) {
    return `A justificativa passa de ${TAMANHO_MAXIMO_JUSTIFICATIVA} caracteres. Resuma o texto.`;
  }
  return null;
}
