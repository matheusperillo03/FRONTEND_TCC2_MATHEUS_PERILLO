import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErroApi, carregarLoginDemo, carregarTokensDemo, mensagemDeErro, type ContaDeDemonstracao, type Me, type SessaoLogin } from '../api';
import { Campo, Mensagem } from '../componentes/basicos';
import { Cabecalho, Rodape } from '../componentes/Moldura';
import { MENSAGEM_SESSAO_EXPIRADA, useSessao } from '../sessao/SessaoContext';

/** Nas rotas de autenticação o detalhe do servidor já é a mensagem para o usuário. */
function mensagemDeLogin(erro: unknown): string {
  if (erro instanceof ErroApi && erro.status !== 0) return erro.detalhe;
  return mensagemDeErro(erro);
}

/**
 * Tela de entrada (RNF01, H23): usuário e senha e, em seguida, o código do
 * segundo fator (TOTP). No primeiro acesso de uma conta, a etapa do código
 * também cadastra o segundo fator: a tela mostra o segredo e a URI `otpauth://`
 * como texto, para o aplicativo autenticador.
 *
 * O token de desenvolvimento fica recolhido e só é oferecido quando o servidor
 * diz, em `/health`, que está em MODO_DEV=1 (o modo simulado responde o mesmo).
 * Sem essa resposta (servidor fora do modo, antigo ou fora do ar), a tela não
 * mostra o acesso por token, que o servidor recusaria.
 */
export function Entrada() {
  const { cliente, config, token, definirToken, definirMe, aviso, definirAviso } = useSessao();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  /** Resposta do login à espera do código. O token pendente fica só aqui, na memória. */
  const [pendente, setPendente] = useState<SessaoLogin | null>(null);
  const [tokenDev, setTokenDev] = useState('');
  /** Só `true` depois de o servidor confirmar o modo de desenvolvimento. */
  const [tokenDevDisponivel, setTokenDevDisponivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  /** Dados do modo simulado: só existem no build feito com VITE_MOCK=1 (import dinâmico). */
  const [tokensDemo, setTokensDemo] = useState<Record<string, Me>>({});
  const [loginDemo, setLoginDemo] = useState<{ contas: ContaDeDemonstracao[]; codigo: string } | null>(null);
  const restaurou = useRef(false);

  useEffect(() => {
    if (!config.modoMock) return;
    let ativo = true;
    void carregarTokensDemo().then(
      (t) => {
        if (ativo) setTokensDemo(t);
      },
      () => undefined,
    );
    void carregarLoginDemo().then(
      (d) => {
        if (ativo) setLoginDemo(d);
      },
      () => undefined,
    );
    return () => {
      ativo = false;
    };
  }, [config.modoMock]);

  useEffect(() => {
    let ativo = true;
    cliente.health().then(
      (saude) => {
        if (ativo) setTokenDevDisponivel(saude.modo_dev === true);
      },
      () => undefined,
    );
    return () => {
      ativo = false;
    };
  }, [cliente]);

  // Página recarregada com token guardado na sessão do navegador: confere no
  // servidor se a sessão ainda vale, em vez de pedir a senha de novo.
  useEffect(() => {
    if (restaurou.current || !token.trim()) return;
    restaurou.current = true;
    cliente.obterSessao().then(
      (s) => definirMe({ usuario: s.usuario, perfil: s.perfil, autenticacao: s.autenticacao }),
      (e: unknown) => {
        definirToken('');
        if (e instanceof ErroApi && e.status === 401) definirAviso(MENSAGEM_SESSAO_EXPIRADA);
      },
    );
    // Só na montagem: depois disso o token muda pelas ações desta tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Sessão ativa: guarda o token que vale e identifica o usuário. */
  function concluir(sessao: SessaoLogin) {
    setSenha('');
    setCodigo('');
    setPendente(null);
    definirToken(sessao.token);
    definirMe({ usuario: sessao.usuario, perfil: sessao.perfil, autenticacao: 'sessao' });
  }

  async function enviarCredenciais(e: FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !senha) return;
    setErro(null);
    definirAviso(null);
    setCarregando(true);
    try {
      const resposta = await cliente.login(usuario.trim(), senha);
      setSenha('');
      if (resposta.etapa === 'ativa') concluir(resposta);
      else setPendente(resposta);
    } catch (e2) {
      setErro(mensagemDeLogin(e2));
    } finally {
      setCarregando(false);
    }
  }

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault();
    if (!pendente || !/^\d{6}$/.test(codigo)) return;
    setErro(null);
    setCarregando(true);
    try {
      concluir(await cliente.confirmarMfa(pendente.token, codigo));
    } catch (e2) {
      setCodigo('');
      setErro(mensagemDeLogin(e2));
    } finally {
      setCarregando(false);
    }
  }

  function recomecar() {
    setPendente(null);
    setCodigo('');
    setSenha('');
    setErro(null);
  }

  async function entrarComToken(t: string) {
    setErro(null);
    definirAviso(null);
    setCarregando(true);
    definirToken(t.trim());
    try {
      const me = await cliente.me();
      definirMe({ ...me, autenticacao: 'token_dev' });
    } catch (e) {
      definirToken('');
      definirMe(null);
      setErro(mensagemDeErro(e));
    } finally {
      setCarregando(false);
    }
  }

  const cadastro = pendente?.etapa === 'cadastro_mfa';

  return (
    <div className="app">
      <Cabecalho />
      <main className="entrada" id="conteudo">
        <section className="br-card painel-entrada" aria-labelledby="entrada-titulo">
          <div className="card-content">
            <h1 id="entrada-titulo">Buscador OSINT</h1>
            <p className="mudo">
              Protótipo acadêmico de apoio à investigação com dados abertos. O acesso é por usuário e senha, com segundo
              fator (código de um aplicativo autenticador). Toda consulta é registrada na trilha de auditoria.
            </p>
            <p className="mudo">
              Modo: <strong>{config.modoMock ? 'simulado (dados sintéticos, sem back-end)' : `API em ${config.baseUrl}`}</strong>
            </p>
            {aviso && <Mensagem tipo="aviso">{aviso}</Mensagem>}

            {!pendente ? (
              <form onSubmit={enviarCredenciais} className="formulario" aria-label="Entrar com usuário e senha">
                <Campo rotulo="Usuário">
                  <input type="text" name="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={100} autoFocus required />
                </Campo>
                <Campo rotulo="Senha">
                  <input type="password" name="senha" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" maxLength={256} required />
                </Campo>
                <div className="linha">
                  <button type="submit" className="br-button primary small" disabled={carregando || !usuario.trim() || !senha}>
                    {carregando ? 'Verificando…' : 'Entrar'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={enviarCodigo} className="formulario" aria-label="Segundo fator de autenticação">
                <h2>{cadastro ? 'Cadastre o segundo fator' : 'Segundo fator'}</h2>
                <p>
                  Senha aceita para <strong>{pendente.usuario}</strong> (perfil {pendente.perfil}).{' '}
                  {cadastro
                    ? 'Esta conta ainda não tem segundo fator. Cadastre a chave abaixo num aplicativo autenticador (TOTP) e informe o código que ele mostrar.'
                    : 'Informe o código de 6 dígitos do seu aplicativo autenticador.'}
                </p>
                {cadastro && (
                  <div className="cadastro-mfa" data-testid="cadastro-mfa">
                    <TextoCopiavel rotulo="Chave secreta (Base32)" valor={pendente.segredo ?? ''} />
                    <TextoCopiavel rotulo="URI de configuração (otpauth)" valor={pendente.otpauth_uri ?? ''} />
                    <p className="campo-dica">
                      No aplicativo autenticador, escolha a opção de digitar a chave de configuração (conta por tempo, 6
                      dígitos) e cole a chave secreta; ou use a URI, se o aplicativo aceitar. A chave só aparece nesta
                      etapa: guarde-a no aplicativo antes de continuar e não a compartilhe.
                    </p>
                  </div>
                )}
                <Campo rotulo="Código de 6 dígitos" dica={loginDemo ? `No modo simulado, o código é ${loginDemo.codigo}.` : undefined}>
                  <input
                    type="text"
                    name="codigo"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoFocus
                    required
                  />
                </Campo>
                <div className="linha">
                  <button type="submit" className="br-button primary small" disabled={carregando || !/^\d{6}$/.test(codigo)}>
                    {carregando ? 'Verificando…' : cadastro ? 'Cadastrar e entrar' : 'Confirmar código'}
                  </button>
                  <button type="button" className="br-button secondary small" onClick={recomecar} disabled={carregando}>
                    Voltar ao usuário e senha
                  </button>
                </div>
              </form>
            )}
            {erro && <Mensagem tipo="erro">{erro}</Mensagem>}

            {!pendente && loginDemo && (
              <div className="tokens-demo">
                <span className="rotulo">Contas do modo simulado (fictícias)</span>
                <div className="linha">
                  {loginDemo.contas.map((c) => (
                    <button
                      key={c.usuario}
                      type="button"
                      className="br-button secondary small"
                      disabled={carregando}
                      onClick={() => {
                        setUsuario(c.usuario);
                        setSenha(c.senha);
                      }}
                    >
                      {c.usuario}
                      {!c.mfa_ativo && ' (sem segundo fator)'}
                    </button>
                  ))}
                </div>
                <span className="campo-dica">O botão preenche usuário e senha; o código do segundo fator no simulado é {loginDemo.codigo}.</span>
              </div>
            )}

            {!pendente && tokenDevDisponivel && (
              <details className="token-dev">
                <summary>Entrar com token de desenvolvimento</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (tokenDev.trim()) void entrarComToken(tokenDev);
                  }}
                  className="formulario"
                  aria-label="Entrar com token de desenvolvimento"
                >
                  <Campo
                    rotulo="Token de desenvolvimento"
                    dica={
                      config.modoMock
                        ? 'No modo simulado, use um dos tokens abaixo.'
                        : 'Só funciona com o back-end em modo de desenvolvimento (MODO_DEV=1); os tokens ficam na configuração dele. Fora desse modo, entre com usuário e senha.'
                    }
                  >
                    <input type="password" name="token" value={tokenDev} onChange={(e) => setTokenDev(e.target.value)} autoComplete="off" />
                  </Campo>
                  <div className="linha">
                    <button type="submit" className="br-button secondary small" disabled={carregando || !tokenDev.trim()}>
                      Entrar com token
                    </button>
                  </div>
                </form>
                {config.modoMock && Object.keys(tokensDemo).length > 0 && (
                  <div className="tokens-demo">
                    <span className="rotulo">Tokens do modo simulado</span>
                    <div className="linha">
                      {Object.entries(tokensDemo).map(([t, me]) => (
                        <button key={t} type="button" className="br-button secondary small" disabled={carregando} onClick={() => void entrarComToken(t)}>
                          {me.perfil}&nbsp;<code>{t}</code>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </details>
            )}
          </div>
        </section>
      </main>
      <Rodape />
    </div>
  );
}

/** Valor mostrado como texto selecionável, com botão de copiar onde o navegador permite. */
function TextoCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const podeCopiar = typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="texto-copiavel">
      <Campo rotulo={rotulo}>
        <input type="text" value={valor} readOnly spellCheck={false} onFocus={(e) => e.target.select()} />
      </Campo>
      {podeCopiar && (
        <button type="button" className="br-button secondary small" onClick={() => void copiar()}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      )}
    </div>
  );
}
