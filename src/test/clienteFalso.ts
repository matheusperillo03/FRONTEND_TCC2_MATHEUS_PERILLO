/** Cliente falso para testes de componentes: parte do mock e permite sobrescrever métodos. */
import { ClienteMock } from '../api/clienteMock';
import type { ApiCliente } from '../api/tipos';

export function clienteFalso(
  sobrescritas: Partial<ApiCliente> = {},
  justificativa = 'teste automatizado',
  /** Token de quem chama: `dev-analista` é o responsável pelo caso de demonstração; `dev-agente`, leitor. */
  /** `importacaoJudicial`: liga o módulo do RF10; nos testes ele vem desligado, como no padrão do back-end. */
  opcoes: { token?: string; iaAtiva?: boolean; importacaoJudicial?: boolean } = {},
): ApiCliente {
  const base = new ClienteMock({
    obterToken: () => opcoes.token ?? 'dev-analista',
    obterJustificativa: () => justificativa,
    latenciaMs: 0,
    iaAtiva: opcoes.iaAtiva,
    importacaoJudicialAtiva: opcoes.importacaoJudicial ?? false,
  });
  return new Proxy(base, {
    get(alvo, prop: keyof ApiCliente) {
      if (prop in sobrescritas) return sobrescritas[prop];
      const valor = alvo[prop];
      return typeof valor === 'function' ? (valor as (...a: unknown[]) => unknown).bind(alvo) : valor;
    },
  }) as ApiCliente;
}
