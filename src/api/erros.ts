/** Erro devolvido pela API (status HTTP diferente de 2xx) ou falha de rede. */
export class ErroApi extends Error {
  readonly status: number;
  readonly rota: string;
  readonly detalhe: string;

  constructor(status: number, rota: string, detalhe: string) {
    super(`${status} em ${rota}: ${detalhe}`);
    this.name = 'ErroApi';
    this.status = status;
    this.rota = rota;
    this.detalhe = detalhe;
  }
}

/**
 * Lançado localmente, antes de qualquer requisição, quando uma consulta a
 * dados do caso é tentada sem justificativa. O back-end também rejeita essas
 * consultas; o erro local só evita a ida e volta e dá uma mensagem clara.
 */
export class ErroJustificativa extends Error {
  constructor() {
    super('Informe a justificativa da consulta antes de prosseguir. Ela é registrada na trilha de auditoria.');
    this.name = 'ErroJustificativa';
  }
}

/** Lançado localmente quando não há token de acesso na sessão. */
export class ErroAutenticacao extends Error {
  constructor() {
    super('Sessão sem token de acesso. Informe o token na tela de entrada.');
    this.name = 'ErroAutenticacao';
  }
}

/**
 * Texto de erro para a interface. As recusas do back-end por conteúdo
 * (400/422, por exemplo justificativa com caracteres de controle) e por
 * tamanho (413) dizem o que foi recusado e o que o usuário pode fazer.
 */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi) {
    const { status, rota, detalhe } = erro;
    if (status === 0) return `Falha de rede ao chamar ${rota}: ${detalhe}`;
    if (status === 401 || status === 403) return `Acesso negado (${status}): ${detalhe}`;
    if (status === 413) {
      return `Requisição recusada por tamanho (413) em ${rota}: o conteúdo enviado passa do limite aceito pelo servidor. Reduza o texto dos campos e tente de novo. Detalhe: ${detalhe}`;
    }
    if (status === 400 || status === 422) {
      const sobreJustificativa = /justificativa/i.test(detalhe);
      return `Requisição recusada pelo servidor (${status}) em ${rota}: ${detalhe}${sobreJustificativa ? ' Corrija a justificativa no topo da página e repita a consulta.' : ''}`;
    }
    return `Erro ${status} em ${rota}: ${detalhe}`;
  }
  if (erro instanceof Error) return erro.message;
  return String(erro);
}
