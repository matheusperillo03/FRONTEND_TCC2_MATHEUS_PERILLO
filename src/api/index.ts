import { ClienteHttp, URL_API_PADRAO } from './clienteHttp';
import type { ApiCliente, ContextoSessao, Me } from './tipos';

export interface ConfiguracaoApi {
  modoMock: boolean;
  baseUrl: string;
}

/**
 * O modo simulado é decidido em tempo de build: `__MODO_MOCK__` só vale
 * `true` quando VITE_MOCK=1 (vite.config.ts). Não há como ligá-lo depois.
 */
export function lerConfiguracao(env: ImportMetaEnv = import.meta.env): ConfiguracaoApi {
  return {
    modoMock: __MODO_MOCK__,
    baseUrl: (env.VITE_API_URL as string | undefined)?.trim() || URL_API_PADRAO,
  };
}

const MENSAGEM_SEM_SIMULADO = 'O modo simulado não faz parte deste build (ele só entra com VITE_MOCK=1).';

/**
 * Carrega o cliente simulado, as fixtures e os tokens de demonstração por
 * import dinâmico. Com `__MODO_MOCK__` falso, o ramo do `import()` é código
 * morto e o empacotador o descarta: o bundle de produção não leva esses dados.
 */
function importarSimulado(): Promise<typeof import('./simulado')> {
  if (__MODO_MOCK__) return import('./simulado');
  return Promise.reject(new Error(MENSAGEM_SEM_SIMULADO));
}

/** Tokens aceitos no modo simulado (para os botões da tela de entrada). */
export async function carregarTokensDemo(): Promise<Record<string, Me>> {
  return (await importarSimulado()).TOKENS_DEMO;
}

/** Conta do modo simulado, para a tela de entrada mostrar como entrar na demonstração. */
export interface ContaDeDemonstracao {
  usuario: string;
  senha: string;
  perfil: string;
  /** Falso: a conta ainda passa pelo cadastro do segundo fator. */
  mfa_ativo: boolean;
}

/** Contas e código do segundo fator aceitos no modo simulado (dados fictícios). */
export async function carregarLoginDemo(): Promise<{ contas: ContaDeDemonstracao[]; codigo: string }> {
  const m = await importarSimulado();
  return {
    contas: Object.entries(m.CONTAS_DEMO).map(([usuario, c]) => ({ usuario, senha: c.senha, perfil: c.perfil, mfa_ativo: c.mfa_ativo })),
    codigo: m.CODIGO_MFA_DEMO,
  };
}

/**
 * Cliente simulado carregado sob demanda. O objeto existe desde o início
 * (a sessão cria o cliente de forma síncrona); o módulo simulado só é
 * baixado na primeira chamada, e a mesma instância atende as seguintes.
 */
function criarClienteSimuladoAdiado(sessao: ContextoSessao): ApiCliente {
  let instancia: Promise<ApiCliente> | null = null;
  const obter = () => (instancia ??= importarSimulado().then((m) => new m.ClienteMock(sessao)));
  return new Proxy({} as ApiCliente, {
    get(_alvo, metodo) {
      if (typeof metodo !== 'string' || metodo === 'then') return undefined;
      return async (...args: unknown[]) => {
        const cliente = await obter();
        const fn = cliente[metodo as keyof ApiCliente] as (...a: unknown[]) => unknown;
        return fn.apply(cliente, args);
      };
    },
  });
}

export function criarCliente(sessao: ContextoSessao, config: ConfiguracaoApi = lerConfiguracao()): ApiCliente {
  if (config.modoMock) return criarClienteSimuladoAdiado(sessao);
  return new ClienteHttp({ ...sessao, baseUrl: config.baseUrl });
}

export * from './tipos';
export * from './erros';
export { ClienteHttp };
