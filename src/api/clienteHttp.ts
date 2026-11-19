/**
 * Cliente HTTP tipado do contrato v0 (docs/mvp-escopo.md, seção 5).
 *
 * Regras de cabeçalho:
 * - `Authorization: Bearer <token>` em todas as rotas, menos `/health`.
 * - `X-Justificativa: <texto>` em toda rota, menos `/health`, `/me`,
 *   `/tipologias`, `/ia`, `/importacao-judicial/estado` e `/auth/*` (não são
 *   dado de caso e nunca levam o cabeçalho), como exige o back-end. Sem justificativa, a requisição nem é enviada
 *   (ErroJustificativa). O texto vai codificado com `encodeURIComponent`,
 *   porque cabeçalhos HTTP não carregam UTF-8; o back-end decodifica.
 */
import { ErroApi, ErroAutenticacao, ErroJustificativa } from './erros';
import type {
  Alerta,
  AlteracaoTarefa,
  AlteracaoUsuario,
  Anotacao,
  ApiCliente,
  ArquivoExportado,
  Aviso,
  Captura,
  Caso,
  CasoDetalhe,
  ColetaRegistro,
  ColetaRequisicao,
  ColetaResultado,
  ContextoSessao,
  DecisaoJudicial,
  DecisaoSugestaoIa,
  DefinicaoMembro,
  EntidadeDetalhe,
  EntidadeResumo,
  EntradaAuditoria,
  EstadoImportacaoJudicial,
  ExecucaoAlertas,
  ExecucaoMonitoramentoResultado,
  ExtracaoIa,
  FiltroAnotacoes,
  FiltroRegistrosJudiciais,
  FiltroSugestoesIa,
  FormatoExportacao,
  FormatoRelatorio,
  Grafo,
  IaEstado,
  Id,
  ImportacaoJudicial,
  Me,
  Membro,
  Monitoramento,
  NovaAnotacao,
  NovaDecisao,
  NovaDecisaoJudicial,
  NovaImportacaoJudicial,
  NovaTarefa,
  NovoCaso,
  NovoMonitoramento,
  NovoUsuario,
  PaginaRegistrosJudiciais,
  ProgressoExtracaoIa,
  RecoletaResultado,
  Saude,
  SessaoAtual,
  SessaoLogin,
  SituacaoMonitoramento,
  SituacaoTarefa,
  SugestaoIa,
  Tarefa,
  TextoCaptura,
  TipologiaCatalogo,
  TrocaSenha,
  UsuarioAdmin,
  VerificacaoAuditoria,
  VerificacaoCaptura,
} from './tipos';

export const URL_API_PADRAO = 'http://localhost:8100';

export interface OpcoesClienteHttp extends ContextoSessao {
  baseUrl?: string;
  /** Permite injetar um `fetch` falso nos testes. */
  fetchImpl?: typeof fetch;
}

interface OpcoesRequisicao {
  metodo?: 'GET' | 'POST';
  corpo?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Rota pública: não envia Authorization nem justificativa. */
  publica?: boolean;
  /** Exige justificativa preenchida; caso contrário lança ErroJustificativa. */
  exigeJustificativa?: boolean;
  /** Rota que não é dado de caso (`/tipologias`, `/ia`, `/importacao-judicial/estado`, `/auth/*`): só o token, nunca o X-Justificativa. */
  semJustificativa?: boolean;
  /** Devolve texto bruto em vez de JSON. */
  texto?: boolean;
  /** Token a usar no lugar do da sessão (o token pendente, em `POST /auth/mfa`). */
  token?: string;
  /** Valor do cabeçalho Accept (padrão: JSON, ou texto com `texto`). */
  aceita?: string;
}

/**
 * Cabeçalhos HTTP aceitam apenas caracteres Latin-1 (ByteString). Caracteres
 * fora dessa faixa (por exemplo, travessão ou emoji) fariam o `fetch` lançar
 * TypeError; eles são substituídos por "?" para não bloquear a consulta.
 * Acentos do português (á, ç, ã...) estão dentro do Latin-1 e passam intactos.
 */
export function sanitizarCabecalho(valor: string): string {
  return Array.from(valor.trim(), (c) => (c.charCodeAt(0) > 0xff ? '?' : c))
    .join('')
    .replace(/[\r\n]+/g, ' ');
}

export class ClienteHttp implements ApiCliente {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sessao: ContextoSessao;

  constructor(opcoes: OpcoesClienteHttp) {
    this.baseUrl = (opcoes.baseUrl ?? URL_API_PADRAO).replace(/\/+$/, '');
    this.fetchImpl = opcoes.fetchImpl ?? ((...args) => fetch(...args));
    this.sessao = { obterToken: opcoes.obterToken, obterJustificativa: opcoes.obterJustificativa };
  }

  private montarUrl(rota: string, query?: OpcoesRequisicao['query']): string {
    // A base pode ser relativa (`/api`, atrás do nginx); nesse caso resolve contra a origem da página.
    const origem = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(this.baseUrl + rota, origem);
    if (query) {
      for (const [chave, valor] of Object.entries(query)) {
        if (valor !== undefined && valor !== '') url.searchParams.set(chave, String(valor));
      }
    }
    return url.toString();
  }

  /** Monta os cabeçalhos, envia e devolve a resposta já conferida (lança ErroApi se não for 2xx). */
  private async enviar(rota: string, opcoes: OpcoesRequisicao = {}): Promise<Response> {
    const cabecalhos: Record<string, string> = { Accept: opcoes.aceita ?? (opcoes.texto ? 'text/plain, */*' : 'application/json') };

    if (!opcoes.publica) {
      const token = (opcoes.token ?? this.sessao.obterToken()).trim();
      if (!token) throw new ErroAutenticacao();
      cabecalhos['Authorization'] = `Bearer ${sanitizarCabecalho(token)}`;

      if (!opcoes.semJustificativa) {
        const justificativa = this.sessao.obterJustificativa().trim().replace(/[\r\n]+/g, ' ');
        if (opcoes.exigeJustificativa && !justificativa) throw new ErroJustificativa();
        if (justificativa) cabecalhos['X-Justificativa'] = encodeURIComponent(justificativa);
      }
    }

    const init: RequestInit = { method: opcoes.metodo ?? 'GET', headers: cabecalhos };
    if (opcoes.corpo !== undefined) {
      cabecalhos['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opcoes.corpo);
    }

    let resposta: Response;
    try {
      resposta = await this.fetchImpl(this.montarUrl(rota, opcoes.query), init);
    } catch (erro) {
      throw new ErroApi(0, rota, erro instanceof Error ? erro.message : String(erro));
    }

    if (!resposta.ok) {
      throw new ErroApi(resposta.status, rota, await extrairDetalhe(resposta));
    }
    return resposta;
  }

  private async requisitar<T>(rota: string, opcoes: OpcoesRequisicao = {}): Promise<T> {
    const resposta = await this.enviar(rota, opcoes);
    if (opcoes.texto) return (await resposta.text()) as T;
    if (resposta.status === 204) return undefined as T;
    return (await resposta.json()) as T;
  }

  health(): Promise<Saude> {
    return this.requisitar('/health', { publica: true });
  }

  me(): Promise<Me> {
    return this.requisitar('/me');
  }

  listarCasos(): Promise<Caso[]> {
    return this.requisitar('/casos', { exigeJustificativa: true });
  }

  criarCaso(corpo: NovoCaso): Promise<Caso> {
    return this.requisitar('/casos', { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  obterCaso(casoId: Id): Promise<CasoDetalhe> {
    return this.requisitar(`/casos/${enc(casoId)}`, { exigeJustificativa: true });
  }

  iniciarColeta(casoId: Id, corpo: ColetaRequisicao): Promise<ColetaResultado> {
    return this.requisitar(`/casos/${enc(casoId)}/coletas`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  listarColetas(casoId: Id): Promise<ColetaRegistro[]> {
    return this.requisitar(`/casos/${enc(casoId)}/coletas`, { exigeJustificativa: true });
  }

  recoletar(casoId: Id, coletaId: Id): Promise<RecoletaResultado> {
    return this.requisitar(`/casos/${enc(casoId)}/coletas/${enc(coletaId)}/recoletar`, { metodo: 'POST', exigeJustificativa: true });
  }

  buscarEntidades(casoId: Id, q: string): Promise<EntidadeResumo[]> {
    return this.requisitar(`/casos/${enc(casoId)}/entidades`, { query: { q }, exigeJustificativa: true });
  }

  obterEntidade(casoId: Id, entidadeId: Id): Promise<EntidadeDetalhe> {
    return this.requisitar(`/casos/${enc(casoId)}/entidades/${enc(entidadeId)}`, { exigeJustificativa: true });
  }

  obterGrafo(casoId: Id, centro: Id, profundidade: number): Promise<Grafo> {
    return this.requisitar(`/casos/${enc(casoId)}/grafo`, {
      query: { centro: String(centro), profundidade },
      exigeJustificativa: true,
    });
  }

  obterCaminho(casoId: Id, de: Id, para: Id): Promise<Grafo> {
    return this.requisitar(`/casos/${enc(casoId)}/caminho`, {
      query: { de: String(de), para: String(para) },
      exigeJustificativa: true,
    });
  }

  executarAlertas(casoId: Id, corpo?: ExecucaoAlertas): Promise<Alerta[]> {
    return this.requisitar(`/casos/${enc(casoId)}/alertas/executar`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  listarAlertas(casoId: Id): Promise<Alerta[]> {
    return this.requisitar(`/casos/${enc(casoId)}/alertas`, { exigeJustificativa: true });
  }

  decidirAlerta(casoId: Id, alertaId: Id, corpo: NovaDecisao): Promise<Alerta> {
    return this.requisitar(`/casos/${enc(casoId)}/alertas/${enc(alertaId)}/decisao`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  obterCaptura(capturaId: Id): Promise<Captura> {
    return this.requisitar(`/capturas/${enc(capturaId)}`, { exigeJustificativa: true });
  }

  verificarCaptura(capturaId: Id): Promise<VerificacaoCaptura> {
    return this.requisitar(`/capturas/${enc(capturaId)}/verificar`, { exigeJustificativa: true });
  }

  listarAuditoria(casoId?: Id): Promise<EntradaAuditoria[]> {
    return this.requisitar('/auditoria', {
      query: { caso_id: casoId === undefined ? undefined : String(casoId) },
      exigeJustificativa: true,
    });
  }

  verificarAuditoria(): Promise<VerificacaoAuditoria> {
    return this.requisitar('/auditoria/verificar', { exigeJustificativa: true });
  }

  obterRelatorio(casoId: Id, formato: FormatoRelatorio): Promise<string> {
    return this.requisitar(`/casos/${enc(casoId)}/relatorio`, {
      query: { formato },
      exigeJustificativa: true,
      texto: true,
    });
  }

  listarTipologias(): Promise<TipologiaCatalogo[]> {
    return this.requisitar('/tipologias', { semJustificativa: true });
  }

  listarMonitoramentos(casoId: Id): Promise<Monitoramento[]> {
    return this.requisitar(`/casos/${enc(casoId)}/monitoramentos`, { exigeJustificativa: true });
  }

  criarMonitoramento(casoId: Id, corpo: NovoMonitoramento): Promise<Monitoramento> {
    return this.requisitar(`/casos/${enc(casoId)}/monitoramentos`, {
      metodo: 'POST',
      corpo: { entidade_id: String(corpo.entidade_id), periodicidade_horas: corpo.periodicidade_horas },
      exigeJustificativa: true,
    });
  }

  alterarMonitoramento(casoId: Id, monitoramentoId: Id, corpo: SituacaoMonitoramento): Promise<Monitoramento> {
    return this.requisitar(`/casos/${enc(casoId)}/monitoramentos/${enc(monitoramentoId)}/situacao`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  executarMonitoramento(casoId: Id, monitoramentoId: Id): Promise<ExecucaoMonitoramentoResultado> {
    return this.requisitar(`/casos/${enc(casoId)}/monitoramentos/${enc(monitoramentoId)}/executar`, { metodo: 'POST', exigeJustificativa: true });
  }

  listarAvisos(casoId: Id, naoLidos = false): Promise<Aviso[]> {
    return this.requisitar(`/casos/${enc(casoId)}/avisos`, { query: { nao_lidos: naoLidos ? 'true' : undefined }, exigeJustificativa: true });
  }

  marcarAvisoLido(casoId: Id, avisoId: Id): Promise<Aviso> {
    return this.requisitar(`/casos/${enc(casoId)}/avisos/${enc(avisoId)}/lido`, { metodo: 'POST', exigeJustificativa: true });
  }

  // ---- horizonte 3: autenticação (H23) --------------------------------------

  login(usuario: string, senha: string): Promise<SessaoLogin> {
    return this.requisitar('/auth/login', { metodo: 'POST', corpo: { usuario, senha }, publica: true });
  }

  confirmarMfa(tokenPendente: string, codigo: string): Promise<SessaoLogin> {
    return this.requisitar('/auth/mfa', { metodo: 'POST', corpo: { codigo }, token: tokenPendente, semJustificativa: true });
  }

  obterSessao(): Promise<SessaoAtual> {
    return this.requisitar('/auth/sessao', { semJustificativa: true });
  }

  logout(): Promise<void> {
    return this.requisitar('/auth/logout', { metodo: 'POST', semJustificativa: true });
  }

  trocarSenha(corpo: TrocaSenha): Promise<void> {
    return this.requisitar('/auth/senha', { metodo: 'POST', corpo, semJustificativa: true });
  }

  listarUsuarios(): Promise<UsuarioAdmin[]> {
    return this.requisitar('/usuarios', { exigeJustificativa: true });
  }

  criarUsuario(corpo: NovoUsuario): Promise<UsuarioAdmin> {
    return this.requisitar('/usuarios', { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  alterarUsuario(usuario: string, corpo: AlteracaoUsuario): Promise<UsuarioAdmin> {
    return this.requisitar(`/usuarios/${enc(usuario)}`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  // ---- horizonte 3: equipe, anotações e tarefas (H23 e H37) ------------------

  listarMembros(casoId: Id): Promise<Membro[]> {
    return this.requisitar(`/casos/${enc(casoId)}/membros`, { exigeJustificativa: true });
  }

  definirMembro(casoId: Id, corpo: DefinicaoMembro): Promise<Membro[]> {
    return this.requisitar(`/casos/${enc(casoId)}/membros`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  removerMembro(casoId: Id, usuario: string): Promise<Membro[]> {
    return this.requisitar(`/casos/${enc(casoId)}/membros/${enc(usuario)}/remover`, { metodo: 'POST', exigeJustificativa: true });
  }

  listarAnotacoes(casoId: Id, filtro: FiltroAnotacoes = {}): Promise<Anotacao[]> {
    return this.requisitar(`/casos/${enc(casoId)}/anotacoes`, {
      query: { alvo_tipo: filtro.alvo_tipo, alvo_id: filtro.alvo_id === undefined ? undefined : String(filtro.alvo_id) },
      exigeJustificativa: true,
    });
  }

  criarAnotacao(casoId: Id, corpo: NovaAnotacao): Promise<Anotacao> {
    return this.requisitar(`/casos/${enc(casoId)}/anotacoes`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  listarTarefas(casoId: Id, situacao?: SituacaoTarefa): Promise<Tarefa[]> {
    return this.requisitar(`/casos/${enc(casoId)}/tarefas`, { query: { situacao }, exigeJustificativa: true });
  }

  criarTarefa(casoId: Id, corpo: NovaTarefa): Promise<Tarefa> {
    return this.requisitar(`/casos/${enc(casoId)}/tarefas`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  obterTarefa(casoId: Id, tarefaId: Id): Promise<Tarefa> {
    return this.requisitar(`/casos/${enc(casoId)}/tarefas/${enc(tarefaId)}`, { exigeJustificativa: true });
  }

  alterarTarefa(casoId: Id, tarefaId: Id, corpo: AlteracaoTarefa): Promise<Tarefa> {
    return this.requisitar(`/casos/${enc(casoId)}/tarefas/${enc(tarefaId)}`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  // ---- horizonte 3: exportação do grafo (H38) --------------------------------

  /**
   * O arquivo vem como anexo e a rota exige Authorization e X-Justificativa:
   * um link comum não serviria. O conteúdo é lido como Blob; o nome vem do
   * `Content-Disposition` e o SHA-256, do cabeçalho `X-Conteudo-SHA256`.
   */
  async exportarGrafo(casoId: Id, formato: FormatoExportacao): Promise<ArquivoExportado> {
    const resposta = await this.enviar(`/casos/${enc(casoId)}/exportacao`, { query: { formato }, exigeJustificativa: true, aceita: '*/*' });
    const conteudo = await resposta.blob();
    return {
      nome: nomeDoAnexo(resposta.headers.get('Content-Disposition')) ?? `caso-${String(casoId)}-${NOME_PADRAO_EXPORTACAO[formato]}`,
      tipo: (resposta.headers.get('Content-Type') ?? conteudo.type ?? '').split(';')[0].trim(),
      sha256: resposta.headers.get('X-Conteudo-SHA256')?.trim().toLowerCase() || null,
      conteudo,
    };
  }

  // ---- horizonte 3: extração assistida por IA local (H22) --------------------

  estadoIa(): Promise<IaEstado> {
    return this.requisitar('/ia', { semJustificativa: true });
  }

  extrairComIa(casoId: Id, capturaId: Id): Promise<ExtracaoIa> {
    return this.requisitar(`/casos/${enc(casoId)}/capturas/${enc(capturaId)}/extracao-ia`, { metodo: 'POST', exigeJustificativa: true });
  }

  progressoExtracaoIa(casoId: Id, extracaoId: Id): Promise<ProgressoExtracaoIa> {
    return this.requisitar(`/casos/${enc(casoId)}/extracoes-ia/${enc(extracaoId)}/progresso`, { exigeJustificativa: true });
  }

  cancelarExtracaoIa(casoId: Id, extracaoId: Id): Promise<ProgressoExtracaoIa> {
    return this.requisitar(`/casos/${enc(casoId)}/extracoes-ia/${enc(extracaoId)}/cancelar`, { metodo: 'POST', exigeJustificativa: true });
  }

  retomarExtracaoIa(casoId: Id, extracaoId: Id): Promise<ProgressoExtracaoIa> {
    return this.requisitar(`/casos/${enc(casoId)}/extracoes-ia/${enc(extracaoId)}/retomar`, { metodo: 'POST', exigeJustificativa: true });
  }

  listarExtracoesIa(casoId: Id): Promise<ExtracaoIa[]> {
    return this.requisitar(`/casos/${enc(casoId)}/extracoes-ia`, { exigeJustificativa: true });
  }

  listarSugestoesIa(casoId: Id, filtro: FiltroSugestoesIa = {}): Promise<SugestaoIa[]> {
    return this.requisitar(`/casos/${enc(casoId)}/sugestoes-ia`, {
      query: { situacao: filtro.situacao, captura_id: filtro.captura_id === undefined ? undefined : String(filtro.captura_id) },
      exigeJustificativa: true,
    });
  }

  decidirSugestaoIa(casoId: Id, sugestaoId: Id, corpo: DecisaoSugestaoIa): Promise<SugestaoIa> {
    return this.requisitar(`/casos/${enc(casoId)}/sugestoes-ia/${enc(sugestaoId)}/decisao`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  obterTextoCaptura(casoId: Id, capturaId: Id): Promise<TextoCaptura> {
    return this.requisitar(`/casos/${enc(casoId)}/capturas/${enc(capturaId)}/texto`, { exigeJustificativa: true });
  }

  // ---- RF10: importação sob ordem judicial ------------------------------------
  // Todas as rotas do caso exigem justificativa, e cada chamada (inclusive GET) entra na auditoria (RNF02).

  estadoImportacaoJudicial(): Promise<EstadoImportacaoJudicial> {
    return this.requisitar('/importacao-judicial/estado', { semJustificativa: true });
  }

  registrarDecisaoJudicial(casoId: Id, corpo: NovaDecisaoJudicial): Promise<DecisaoJudicial> {
    return this.requisitar(`/casos/${enc(casoId)}/importacao-judicial/decisoes`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  listarDecisoesJudiciais(casoId: Id): Promise<DecisaoJudicial[]> {
    return this.requisitar(`/casos/${enc(casoId)}/importacao-judicial/decisoes`, { exigeJustificativa: true });
  }

  importarSobOrdemJudicial(casoId: Id, decisaoId: Id, corpo: NovaImportacaoJudicial): Promise<ImportacaoJudicial> {
    return this.requisitar(`/casos/${enc(casoId)}/importacao-judicial/decisoes/${enc(decisaoId)}/importacoes`, { metodo: 'POST', corpo, exigeJustificativa: true });
  }

  listarImportacoesJudiciais(casoId: Id): Promise<ImportacaoJudicial[]> {
    return this.requisitar(`/casos/${enc(casoId)}/importacao-judicial/importacoes`, { exigeJustificativa: true });
  }

  listarRegistrosJudiciais(casoId: Id, filtro: FiltroRegistrosJudiciais = {}): Promise<PaginaRegistrosJudiciais> {
    return this.requisitar(`/casos/${enc(casoId)}/importacao-judicial/registros`, {
      query: {
        decisao_id: filtro.decisao_id === undefined ? undefined : String(filtro.decisao_id),
        tipo: filtro.tipo,
        quarentena: filtro.quarentena === undefined ? undefined : String(filtro.quarentena),
        limite: filtro.limite,
        deslocamento: filtro.deslocamento,
      },
      exigeJustificativa: true,
    });
  }
}

/** Nome do arquivo quando o `Content-Disposition` não chega ao navegador. */
const NOME_PADRAO_EXPORTACAO: Record<FormatoExportacao, string> = {
  zip: 'grafo.zip',
  graphml: 'grafo.graphml',
  csv_entidades: 'entidades.csv',
  csv_vinculos: 'vinculos.csv',
};

/** `attachment; filename="caso-1-grafo.graphml"` → `caso-1-grafo.graphml` (sem barras: é só um nome). */
export function nomeDoAnexo(cabecalho: string | null): string | null {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecalho ?? '');
  if (!m) return null;
  let nome = m[1].trim();
  try {
    nome = decodeURIComponent(nome);
  } catch {
    /* mantém o nome como veio */
  }
  nome = nome.replace(/[\\/]+/g, '_');
  return nome || null;
}

function enc(id: Id): string {
  return encodeURIComponent(String(id));
}

/** Mensagens para respostas sem corpo aproveitável (por exemplo, a página HTML de erro do nginx). */
const DETALHE_POR_STATUS: Record<number, string> = {
  413: 'corpo da requisição grande demais',
  502: 'back-end indisponível',
  504: 'o back-end demorou demais para responder',
};

/** Erros de validação do FastAPI: `[{loc: ['body', 'titulo'], msg: '...'}]` → "titulo: ...". */
function formatarValidacao(itens: unknown[]): string {
  return itens
    .map((item) => {
      if (typeof item === 'string') return item;
      const { loc, msg } = (item ?? {}) as { loc?: unknown; msg?: unknown };
      if (typeof msg !== 'string') return JSON.stringify(item);
      const campo = Array.isArray(loc) ? loc.filter((p) => p !== 'body' && p !== 'query' && p !== 'header').join('.') : '';
      return campo ? `${campo}: ${msg}` : msg;
    })
    .join('; ');
}

export async function extrairDetalhe(resposta: Response): Promise<string> {
  const padrao = DETALHE_POR_STATUS[resposta.status] ?? (resposta.statusText || 'sem detalhe');
  const texto = (await resposta.text().catch(() => '')).trim();
  if (!texto) return padrao;
  try {
    const json = JSON.parse(texto) as { detail?: unknown; detalhe?: unknown; mensagem?: unknown };
    const detalhe = json.detail ?? json.detalhe ?? json.mensagem;
    if (typeof detalhe === 'string') return detalhe;
    if (Array.isArray(detalhe)) return formatarValidacao(detalhe);
    if (detalhe !== undefined) return JSON.stringify(detalhe);
  } catch {
    /* corpo não é JSON */
  }
  // Página HTML de erro (nginx): o texto não ajuda o usuário.
  if (texto.startsWith('<')) return padrao;
  return texto.slice(0, 300);
}
