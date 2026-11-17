import type { ContextoSessao } from '../api';

/**
 * Guarda token e justificativa fora do ciclo de render do React, para que o
 * cliente da API (criado uma única vez) leia sempre o valor mais recente no
 * momento de cada requisição.
 */
export class ArmazemSessao implements ContextoSessao {
  private token: string;
  private justificativa: string;

  constructor(token = '', justificativa = '') {
    this.token = token;
    this.justificativa = justificativa;
  }

  obterToken = (): string => this.token;
  obterJustificativa = (): string => this.justificativa;

  definirToken(token: string): void {
    this.token = token;
  }

  definirJustificativa(justificativa: string): void {
    this.justificativa = justificativa;
  }

  /** Quem avisar quando o servidor responder 401 a uma chamada autenticada (a sessão React). */
  private ouvinteDeExpiracao: (() => void) | null = null;

  definirOuvinteDeExpiracao(ouvinte: (() => void) | null): void {
    this.ouvinteDeExpiracao = ouvinte;
  }

  /** Chamado pela vigia do cliente quando chega um 401. */
  sessaoExpirou = (): void => {
    this.ouvinteDeExpiracao?.();
  };
}
