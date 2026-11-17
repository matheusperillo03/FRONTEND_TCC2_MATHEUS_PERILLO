/**
 * CNPJ numérico e alfanumérico: limpeza, validação dos dígitos verificadores e máscara.
 *
 * Fontes oficiais (acesso em 17/11/2026):
 * - Receita Federal, página do CNPJ alfanumérico
 *   (https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico):
 *   Instrução Normativa RFB nº 2.229, de 15/10/2024; o formato é atribuído "a partir de
 *   Julho de 2026, exclusivamente a novas inscrições", e os CNPJs numéricos continuam válidos.
 * - "Perguntas e Respostas"
 *   (https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf),
 *   perguntas 2, 14 e 21: 14 posições com a mesma máscara (`AA.AAA.AAA/AAAA-DV`); as 12
 *   primeiras aceitam dígitos e letras maiúsculas de A a Z; os 2 DVs são numéricos.
 * - "Cálculo dos dígitos verificadores de CNPJ alfanumérico"
 *   (https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf):
 *   cada caractere vale o código ASCII menos 48; pesos de 2 a 9 da direita para a esquerda,
 *   recomeçando depois do oitavo; módulo 11; resto 0 ou 1 dá DV 0, senão 11 − resto.
 *   Exemplo do manual: 12.ABC.345/01DE-35.
 *
 * Decisão do autor: letras minúsculas digitadas são aceitas e convertidas em maiúsculas.
 * A mesma regra está no back-end (`buscador/resolucao/normalizacao.py`).
 */

const FORMA_COMPLETA = /^[0-9A-Z]{12}[0-9]{2}$/;
const FORMA_DA_RAIZ = /^[0-9A-Z]{8}$/;

/** Tira a pontuação da máscara (`.`, `/`, `-`, espaços) e põe em maiúsculas. Não descarta outro símbolo. */
export function limparCnpj(texto: string): string {
  return texto.replace(/[.\-/\s]/g, '').toUpperCase();
}

/** 14 posições no formato do CNPJ (numérico ou alfanumérico), sem conferir os DVs. */
export function temFormaDeCnpj(texto: string): boolean {
  return FORMA_COMPLETA.test(limparCnpj(texto));
}

/** Raiz do CNPJ (8 posições), a partir da raiz ou do CNPJ completo; `''` se não tem nenhuma das formas. */
export function raizDoCnpj(texto: string): string {
  const limpo = limparCnpj(texto);
  if (FORMA_DA_RAIZ.test(limpo)) return limpo;
  return FORMA_COMPLETA.test(limpo) ? limpo.slice(0, 8) : '';
}

function digitoVerificador(parcial: string): string {
  let soma = 0;
  for (let i = 0; i < parcial.length; i++) {
    const valor = parcial.charCodeAt(parcial.length - 1 - i) - 48;
    soma += valor * (2 + (i % 8));
  }
  const resto = soma % 11;
  return resto < 2 ? '0' : String(11 - resto);
}

/** Os dois dígitos verificadores para as 12 primeiras posições (raiz + ordem). */
export function calcularDvCnpj(doze: string): string {
  const base = limparCnpj(doze);
  if (!/^[0-9A-Z]{12}$/.test(base)) throw new Error('São necessárias 12 posições (raiz + ordem), com dígitos ou letras de A a Z.');
  const primeiro = digitoVerificador(base);
  return primeiro + digitoVerificador(base + primeiro);
}

/** CNPJ com a forma certa e os dois dígitos verificadores conferindo. */
export function cnpjValido(texto: string): boolean {
  const limpo = limparCnpj(texto);
  return FORMA_COMPLETA.test(limpo) && calcularDvCnpj(limpo.slice(0, 12)) === limpo.slice(12);
}

/** `AA.AAA.AAA/AAAA-DV`; o que não tem a forma de CNPJ volta como veio. */
export function formatarCnpj(texto: string): string {
  const d = limparCnpj(texto);
  if (!FORMA_COMPLETA.test(d)) return texto;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Máscara progressiva para campo de digitação: aceita dígitos e letras, põe em maiúsculas,
 * corta em 14 posições e insere a pontuação à medida que o texto cresce.
 */
export function mascaraDeCnpj(texto: string): string {
  const d = texto
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 14);
  let saida = d.slice(0, 2);
  if (d.length > 2) saida += `.${d.slice(2, 5)}`;
  if (d.length > 5) saida += `.${d.slice(5, 8)}`;
  if (d.length > 8) saida += `/${d.slice(8, 12)}`;
  if (d.length > 12) saida += `-${d.slice(12)}`;
  return saida;
}
