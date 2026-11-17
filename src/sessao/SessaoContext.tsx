/**
 * Sessão da aplicação: token de acesso, usuário autenticado e justificativa
 * corrente. O cliente da API lê token e justificativa no momento de cada
 * requisição, por isso ficam no armazém e não só no estado.
 *
 * O token fica onde já ficava: na memória e no `sessionStorage` (some ao
 * fechar a aba; nunca no `localStorage`). O token pendente do login (antes do
 * segundo fator) não passa por aqui: fica só no estado da tela de entrada.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ErroApi, criarCliente, lerConfiguracao, type ApiCliente, type ConfiguracaoApi, type Me } from '../api';
import { ArmazemSessao } from './armazemSessao';

/** Mostrada na tela de entrada quando o servidor responde 401 a uma chamada autenticada. */
export const MENSAGEM_SESSAO_EXPIRADA = 'Sua sessão expirou ou foi encerrada. Entre de novo para continuar.';

/**
 * Chamadas em que um 401 não significa sessão expirada: nas duas etapas do
 * login ele quer dizer senha ou código errado, e a tela de entrada trata.
 */
const SEM_VIGIA_DE_401 = new Set(['login', 'confirmarMfa']);

/**
 * Envolve o cliente: qualquer resposta 401 numa chamada autenticada chama
 * `aoExpirar` (que derruba a sessão local) e o erro segue para quem chamou.
 * Vale para o cliente HTTP, para o simulado e para os clientes de teste.
 */
function vigiarSessao(cliente: ApiCliente, aoExpirar: () => void): ApiCliente {
  return new Proxy(cliente, {
    get(alvo, prop) {
      const valor = Reflect.get(alvo, prop, alvo) as unknown;
      if (typeof valor !== 'function' || typeof prop !== 'string' || SEM_VIGIA_DE_401.has(prop)) return valor;
      return (...args: unknown[]) => {
        const resultado = (valor as (...a: unknown[]) => unknown).apply(alvo, args);
        if (resultado instanceof Promise) {
          resultado.catch((erro: unknown) => {
            if (erro instanceof ErroApi && erro.status === 401) aoExpirar();
          });
        }
        return resultado;
      };
    },
  });
}

const CHAVE_TOKEN = 'osint.token';
const CHAVE_JUSTIFICATIVA = 'osint.justificativa';

function lerStorage(chave: string): string {
  try {
    return sessionStorage.getItem(chave) ?? '';
  } catch {
    return '';
  }
}

function gravarStorage(chave: string, valor: string): void {
  try {
    if (valor) sessionStorage.setItem(chave, valor);
    else sessionStorage.removeItem(chave);
  } catch {
    /* storage indisponível */
  }
}

export interface Sessao {
  config: ConfiguracaoApi;
  cliente: ApiCliente;
  token: string;
  me: Me | null;
  justificativa: string;
  definirToken: (token: string) => void;
  definirMe: (me: Me | null) => void;
  definirJustificativa: (texto: string) => void;
  /** Limpa a sessão local (token, usuário e justificativa), sem falar com o servidor. */
  sair: () => void;
  /** "Sair": encerra a sessão no servidor (`POST /auth/logout`) e limpa a sessão local. */
  encerrarSessao: () => Promise<void>;
  /** Aviso para a tela de entrada (por exemplo, sessão expirada). */
  aviso: string | null;
  definirAviso: (texto: string | null) => void;
}

const Contexto = createContext<Sessao | null>(null);

export interface SessaoProviderProps {
  children: ReactNode;
  /** Permite injetar um cliente nos testes. */
  cliente?: ApiCliente;
  config?: ConfiguracaoApi;
  /** Estado inicial (testes). */
  inicial?: { token?: string; me?: Me | null; justificativa?: string };
}

export function SessaoProvider({ children, cliente, config, inicial }: SessaoProviderProps) {
  const configuracao = useMemo(() => config ?? lerConfiguracao(), [config]);
  const [token, setToken] = useState(() => inicial?.token ?? lerStorage(CHAVE_TOKEN));
  const [justificativa, setJustificativa] = useState(() => inicial?.justificativa ?? lerStorage(CHAVE_JUSTIFICATIVA));
  const [me, setMeEstado] = useState<Me | null>(inicial?.me ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  /** Lido pela vigia de 401 fora do ciclo de render: só há sessão a derrubar se houver usuário. */
  const meRef = useRef<Me | null>(inicial?.me ?? null);
  const setMe = useCallback((novo: Me | null) => {
    meRef.current = novo;
    setMeEstado(novo);
    if (novo) setAviso(null);
  }, []);

  /** Lido pelo cliente no momento de cada requisição (o cliente é criado uma vez). */
  const [armazem] = useState(() => new ArmazemSessao(token, justificativa));

  // A vigia avisa o armazém, que repassa ao ouvinte registrado mais abaixo (`expirar`).
  const clienteFinal = useMemo<ApiCliente>(
    () => vigiarSessao(cliente ?? criarCliente(armazem, configuracao), armazem.sessaoExpirou),
    [cliente, configuracao, armazem],
  );

  const definirToken = useCallback(
    (t: string) => {
      armazem.definirToken(t);
      setToken(t);
      gravarStorage(CHAVE_TOKEN, t);
    },
    [armazem],
  );

  const definirJustificativa = useCallback(
    (j: string) => {
      armazem.definirJustificativa(j);
      setJustificativa(j);
      gravarStorage(CHAVE_JUSTIFICATIVA, j);
    },
    [armazem],
  );

  // Sair limpa também a justificativa (memória e sessionStorage): o próximo
  // usuário da mesma aba não pode herdar o X-Justificativa do anterior (RNF02).
  const sair = useCallback(() => {
    definirToken('');
    definirJustificativa('');
    setMe(null);
  }, [definirToken, definirJustificativa, setMe]);

  // 401 numa chamada autenticada: o token não vale mais. Derruba a sessão local
  // e volta à tela de entrada com o aviso. Sem usuário (tela de entrada), o 401
  // é token ou credencial errada, e quem trata é a própria tela.
  const expirar = useCallback(() => {
    if (!meRef.current) return;
    sair();
    setAviso(MENSAGEM_SESSAO_EXPIRADA);
  }, [sair]);
  useEffect(() => {
    armazem.definirOuvinteDeExpiracao(expirar);
    return () => armazem.definirOuvinteDeExpiracao(null);
  }, [armazem, expirar]);

  const encerrarSessao = useCallback(async () => {
    const atual = meRef.current;
    // Daqui em diante um 401 do logout não é "sessão expirada": o usuário está saindo.
    meRef.current = null;
    try {
      // Token de desenvolvimento não tem sessão no servidor (a rota responde 400).
      if (atual && atual.autenticacao !== 'token_dev') await clienteFinal.logout();
    } catch {
      /* a sessão local é limpa de qualquer forma */
    } finally {
      sair();
    }
  }, [clienteFinal, sair]);

  const valor = useMemo<Sessao>(
    () => ({
      config: configuracao,
      cliente: clienteFinal,
      token,
      me,
      justificativa,
      definirToken,
      definirMe: setMe,
      definirJustificativa,
      sair,
      encerrarSessao,
      aviso,
      definirAviso: setAviso,
    }),
    [configuracao, clienteFinal, token, me, justificativa, definirToken, setMe, definirJustificativa, sair, encerrarSessao, aviso],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useSessao precisa de SessaoProvider');
  return ctx;
}
