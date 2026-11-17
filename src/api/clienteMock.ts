/**
 * Cliente simulado em memória (VITE_MOCK=1). Implementa a mesma interface do
 * cliente HTTP e aplica as mesmas regras: exige token válido e justificativa
 * nas consultas a dados do caso, e registra cada operação na auditoria
 * encadeada por hash, como o back-end faz.
 */
import { limparCnpj, temFormaDeCnpj } from '../cnpj';
import { sha256Hex } from '../hash';
import { ErroApi, ErroAutenticacao, ErroJustificativa } from './erros';
import {
  ALERTAS,
  ANOTACOES_DEMO,
  ARESTAS,
  AVISO_COMBINACAO_DEMO,
  AVISOS_DEMO,
  CAPTURA_EDITAL_DEMO,
  CAPTURAS,
  CAPTURAS_MONITORAMENTO,
  CAPTURA_VIOLADA_DEMO,
  CASO_DEMO,
  CODIGO_MFA_DEMO,
  COLETAS_DEMO,
  CONECTORES_DEMO,
  CONTAS_DEMO,
  ENTIDADES,
  IA_DEMO,
  ITENS_IA_DEMO,
  MAX_FALHAS_LOGIN_DEMO,
  MEMBROS_DEMO,
  MONITORAMENTOS_DEMO,
  MOTIVO_PORTAL_NAO_CONFIGURADO,
  OBSERVACAO_L8_DEMO,
  PARAMETROS_TIPOLOGIAS_DEMO,
  PESOS_COMBINACAO_DEMO,
  POLITICAS_DEMO,
  RECUSAS_IA_DEMO,
  SEGREDO_MFA_DEMO,
  TAREFAS_DEMO,
  TEXTOS_CAPTURA_DEMO,
  TIPOLOGIAS_DEMO,
  TOKENS_DEMO,
  hashSintetico,
  type ContaDemo,
} from './dadosSinteticos';
import {
  PAPEIS_CASO,
  PERFIS_USUARIO,
  SITUACOES_TAREFA,
  TIPOLOGIAS,
  mesmoId,
  type Alerta,
  type AlteracaoTarefa,
  type AlteracaoUsuario,
  type Anotacao,
  type ApiCliente,
  type ArquivoExportado,
  type Aviso,
  type Captura,
  type Caso,
  type CasoDetalhe,
  type ColetaRegistro,
  type ColetaRequisicao,
  type ColetaResultado,
  type ComparacaoCaptura,
  type ComponenteCombinacao,
  type ContextoSessao,
  type DecisaoSugestaoIa,
  type DefinicaoMembro,
  type EntidadeDetalhe,
  type EntidadeResumo,
  type EntradaAuditoria,
  type ExecucaoAlertas,
  type ExecucaoMonitoramento,
  type ExecucaoMonitoramentoResultado,
  type ExtracaoIa,
  type FiltroAnotacoes,
  type FiltroSugestoesIa,
  type FormatoExportacao,
  type FormatoRelatorio,
  type Grafo,
  type IaEstado,
  type Id,
  type Me,
  type Membro,
  type Monitoramento,
  type NovaAnotacao,
  type NovaDecisao,
  type NovaTarefa,
  type NovoCaso,
  type NovoMonitoramento,
  type NovoUsuario,
  type PapelCaso,
  type ParametrosTipologias,
  type RecoletaMonitorada,
  type RecoletaResultado,
  type Saude,
  type SessaoAtual,
  type SessaoLogin,
  type SituacaoMonitoramento,
  type SituacaoTarefa,
  type SugestaoIa,
  type Tarefa,
  type TextoCaptura,
  type TipologiaCatalogo,
  type TrocaSenha,
  type UsuarioAdmin,
  type VerificacaoAuditoria,
  type VerificacaoCaptura,
} from './tipos';
import { montarZip } from './zipSimulado';

export interface OpcoesClienteMock extends ContextoSessao {
  /** Atraso simulado em milissegundos (0 nos testes). */
  latenciaMs?: number;
  /** Tokens aceitos → usuário/perfil. Padrão: TOKENS_DEMO. */
  tokens?: Record<string, Me>;
  /**
   * Falso simula o servidor sem a chave do Portal da Transparência: a coleta
   * dessa fonte fecha como `nao_configurado` (H19). Padrão: verdadeiro.
   */
  portalConfigurado?: boolean;
  /** Falso simula o servidor com a extração por IA desligada (H22). Padrão: verdadeiro. */
  iaAtiva?: boolean;
}

/** Conta do simulado com o estado que o login altera. */
interface ContaSimulada extends ContaDemo {
  falhas: number;
  bloqueado_ate: string | null;
  criado_por: string;
  criado_em: string;
}

interface SessaoSimulada {
  usuario: string;
  etapa: 'mfa' | 'cadastro_mfa' | 'ativa';
  expira_em: string;
}

const MENSAGEM_CREDENCIAIS = 'Usuário ou senha inválidos.';
const MENSAGEM_BLOQUEIO = 'Conta bloqueada temporariamente por excesso de tentativas. Tente de novo mais tarde.';
const SITUACOES_ABERTAS = new Set(['aberta', 'em_andamento']);
const TAMANHO_MINIMO_SENHA = 12;

interface Faixa {
  inteiro?: boolean;
  minimo: number;
  /** Verdadeiro: o valor precisa ser maior que o mínimo (e não igual). */
  exclusivo?: boolean;
}

/** Faixas dos limiares por execução das tipologias de lavagem e da combinação (contrato da API, seção 1.2). */
const FAIXAS_LAVAGEM = {
  l1_minimo_estabelecimentos: { inteiro: true, minimo: 2 },
  l1_janela_abertura_dias: { inteiro: true, minimo: 1 },
  l1_minimo_abertas_na_janela: { inteiro: true, minimo: 2 },
  l3_minimo_empresas: { inteiro: true, minimo: 2 },
  l3_minimo_abertas_na_janela: { inteiro: true, minimo: 1 },
  l3_janela_meses: { inteiro: true, minimo: 1 },
  l4_minimo_niveis: { inteiro: true, minimo: 2 },
  l7_dias_apos_abertura: { inteiro: true, minimo: 0 },
  l7_meses_antes_contrato: { inteiro: true, minimo: 1 },
  l14_valor_minimo: { minimo: 0 },
  l15_minimo_cnaes: { inteiro: true, minimo: 2 },
  l15_minimo_categorias: { inteiro: true, minimo: 2 },
  l16_dias_minimos: { inteiro: true, minimo: 0 },
  comb_minimo_tipologias: { inteiro: true, minimo: 2 },
  comb_peso_minimo: { minimo: 0, exclusivo: true },
} satisfies Partial<Record<keyof ParametrosTipologias, Faixa>>;

/** Perfis que recebem as entradas de auditoria dentro do relatório (como no back-end). */
const PERFIS_COM_AUDITORIA = new Set(['delegado', 'admin']);

export class ClienteMock implements ApiCliente {
  private readonly sessao: ContextoSessao;
  private readonly latenciaMs: number;
  private readonly tokens: Record<string, Me>;

  private casos: Caso[] = [{ ...CASO_DEMO }];
  private entidadesPorCaso = new Map<string, EntidadeDetalhe[]>([[String(CASO_DEMO.id), ENTIDADES.map((e) => ({ ...e }))]]);
  private arestasPorCaso = new Map<string, Grafo['arestas']>([[String(CASO_DEMO.id), [...ARESTAS]]]);
  private alertasPorCaso = new Map<string, Alerta[]>();
  private capturas: Captura[] = [...CAPTURAS, ...CAPTURAS_MONITORAMENTO].map((c) => ({ ...c }));
  private capturasPorCaso = new Map<string, Id[]>([[String(CASO_DEMO.id), [...CAPTURAS, ...CAPTURAS_MONITORAMENTO].map((c) => c.id)]]);
  private coletasPorCaso = new Map<string, ColetaRegistro[]>([
    [String(CASO_DEMO.id), COLETAS_DEMO.map((c) => ({ ...c, avisos: [...c.avisos], captura_ids: [...c.captura_ids] }))],
  ]);
  private monitoramentosPorCaso = new Map<string, Monitoramento[]>([[String(CASO_DEMO.id), MONITORAMENTOS_DEMO.map(clonarMonitoramento)]]);
  private avisosPorCaso = new Map<string, Aviso[]>([[String(CASO_DEMO.id), AVISOS_DEMO.map(clonarAviso)]]);
  private auditoria: EntradaAuditoria[] = [];
  private proximoId = 100;
  private readonly portalConfigurado: boolean;
  // Horizonte 3
  private readonly iaAtiva: boolean;
  private contas = new Map<string, ContaSimulada>(
    Object.entries(CONTAS_DEMO).map(([usuario, c]) => [usuario, { ...c, falhas: 0, bloqueado_ate: null, criado_por: 'admin.demo', criado_em: '2026-11-11T11:00:00Z' }]),
  );
  private sessoes = new Map<string, SessaoSimulada>();
  private membrosPorCaso = new Map<string, Membro[]>([[String(CASO_DEMO.id), MEMBROS_DEMO.map((m) => ({ ...m }))]]);
  private anotacoesPorCaso = new Map<string, Anotacao[]>([[String(CASO_DEMO.id), ANOTACOES_DEMO.map((a) => ({ ...a }))]]);
  private tarefasPorCaso = new Map<string, Tarefa[]>([[String(CASO_DEMO.id), TAREFAS_DEMO.map(clonarTarefa)]]);
  private extracoesPorCaso = new Map<string, ExtracaoIa[]>();
  private sugestoesIaPorCaso = new Map<string, SugestaoIa[]>();

  constructor(opcoes: OpcoesClienteMock) {
    this.sessao = { obterToken: opcoes.obterToken, obterJustificativa: opcoes.obterJustificativa };
    this.latenciaMs = opcoes.latenciaMs ?? 150;
    this.tokens = opcoes.tokens ?? TOKENS_DEMO;
    this.portalConfigurado = opcoes.portalConfigurado ?? true;
    this.iaAtiva = opcoes.iaAtiva ?? true;
    this.registrar('sistema', 'inicializacao', null, 'inicialização do modo simulado', { fixtures: 'sintéticas' });
    // A demonstração já traz uma extração feita sobre o edital sintético, com as sugestões pendentes.
    // Os identificadores dela são fixos (ext-1, sug-2 a sug-7) e não consomem a numeração dos demais.
    const numeracao = this.proximoId;
    this.proximoId = 1;
    this.novaExtracao(CASO_DEMO.id, CAPTURA_EDITAL_DEMO, 'delegado.demo', '2026-11-15T10:00:00Z');
    this.proximoId = numeracao;
  }

  // ---- infraestrutura -----------------------------------------------------

  private async esperar(): Promise<void> {
    if (this.latenciaMs > 0) await new Promise((r) => setTimeout(r, this.latenciaMs));
  }

  private autenticar(): Me {
    const token = this.sessao.obterToken().trim();
    if (!token) throw new ErroAutenticacao();
    const me = this.tokens[token];
    if (me) return { ...me, autenticacao: 'token_dev' };
    // Sessão aberta pelo login com senha e segundo fator (H23).
    const sessao = this.sessoes.get(token);
    const conta = sessao?.etapa === 'ativa' ? this.contas.get(sessao.usuario) : undefined;
    if (!sessao || !conta?.ativo || sessao.expira_em < new Date().toISOString()) {
      throw new ErroApi(401, '/me', 'Token inválido ou sessão expirada.');
    }
    return { usuario: sessao.usuario, perfil: conta.perfil, autenticacao: 'sessao' };
  }

  private papel(casoId: Id, usuario: string): PapelCaso | null {
    const membro = (this.membrosPorCaso.get(String(casoId)) ?? []).find((m) => m.usuario === usuario);
    return (membro?.papel as PapelCaso | undefined) ?? null;
  }

  /**
   * Acesso por caso (H23), como no back-end: só membro vê, e o papel precisa
   * alcançar o mínimo da ação. A negação responde 403 e fica na auditoria.
   */
  private exigirPapel(me: Me, casoId: Id, justificativa: string, minimo: PapelCaso, rota: string): void {
    if (!this.casos.some((c) => mesmoId(c.id, casoId))) return; // o 404 é de quem chama
    const papel = this.papel(casoId, me.usuario);
    if (papel !== null && PAPEIS_CASO.indexOf(papel) >= PAPEIS_CASO.indexOf(minimo)) return;
    this.registrar(me.usuario, 'caso.acesso_negado', casoId, justificativa, { rota, papel_exigido: minimo, papel_atual: papel });
    throw new ErroApi(
      403,
      `/casos/${casoId}`,
      papel === null ? 'Você não é membro deste caso.' : `Seu papel neste caso (${papel}) não permite esta ação (exige ${minimo}).`,
    );
  }

  private exigirJustificativa(rota: string): string {
    const j = this.sessao.obterJustificativa().trim();
    if (!j) throw new ErroJustificativa();
    void rota;
    return j;
  }

  private registrar(usuario: string, acao: string, casoId: Id | null, justificativa: string, detalhes: Record<string, unknown>): void {
    const anterior = this.auditoria.at(-1);
    const seq = (anterior?.seq ?? 0) + 1;
    const hash_anterior = anterior?.hash ?? null;
    const quando = new Date().toISOString();
    const conteudo = JSON.stringify({ seq, quando, usuario, acao, casoId, justificativa, detalhes, hash_anterior });
    this.auditoria.push({ seq, quando, usuario, acao, caso_id: casoId, justificativa, detalhes, hash_anterior, hash: hashSintetico(conteudo) });
  }

  /**
   * Autentica, exige justificativa, confere o papel no caso e registra a ação
   * na auditoria. `papelMinimo` nulo dispensa a conferência (rotas que não são
   * do caso, como a trilha de auditoria).
   */
  private async consulta(acao: string, casoId: Id | null, detalhes: Record<string, unknown> = {}, papelMinimo: PapelCaso | null = 'leitor'): Promise<Me> {
    const me = this.autenticar();
    const justificativa = this.exigirJustificativa(acao);
    await this.esperar();
    if (casoId !== null && papelMinimo) this.exigirPapel(me, casoId, justificativa, papelMinimo, acao);
    this.registrar(me.usuario, acao, casoId, justificativa, detalhes);
    return me;
  }

  private caso(casoId: Id): Caso {
    const caso = this.casos.find((c) => mesmoId(c.id, casoId));
    if (!caso) throw new ErroApi(404, `/casos/${casoId}`, 'Caso não encontrado');
    return caso;
  }

  /** Como no back-end: a partir do dia seguinte ao prazo, o caso é só leitura (RNF04, H17). */
  private vencido(caso: Caso): boolean {
    return !!caso.retencao_ate && new Date().toISOString().slice(0, 10) > caso.retencao_ate;
  }

  private comSituacao(caso: Caso, me?: Me): Caso {
    return { ...caso, somente_leitura: this.vencido(caso), meu_papel: me ? this.papel(caso.id, me.usuario) : null };
  }

  /**
   * Autentica, exige justificativa e devolve o caso se ele ainda estiver no
   * prazo de retenção. Com o prazo vencido, recusa com 403 e registra a recusa
   * na auditoria, como o back-end.
   */
  private async casoAberto(acao: string, casoId: Id, detalhes: Record<string, unknown> = {}, papelMinimo: PapelCaso = 'leitor'): Promise<{ me: Me; caso: Caso }> {
    const me = this.autenticar();
    const justificativa = this.exigirJustificativa(acao);
    await this.esperar();
    const caso = this.caso(casoId);
    this.exigirPapel(me, casoId, justificativa, papelMinimo, acao);
    if (this.vencido(caso)) {
      this.registrar(me.usuario, 'caso.retencao_recusa', casoId, justificativa, { acao_recusada: acao, retencao_ate: caso.retencao_ate });
      throw new ErroApi(403, `/casos/${casoId}`, `O prazo de retenção deste caso terminou em ${caso.retencao_ate}: o caso está só para leitura.`);
    }
    this.registrar(me.usuario, acao, casoId, justificativa, detalhes);
    return { me, caso };
  }

  private entidades(casoId: Id): EntidadeDetalhe[] {
    return this.entidadesPorCaso.get(String(casoId)) ?? [];
  }

  private arestas(casoId: Id): Grafo['arestas'] {
    return this.arestasPorCaso.get(String(casoId)) ?? [];
  }

  // ---- contrato v0 ---------------------------------------------------------

  async health(): Promise<Saude> {
    await this.esperar();
    return { status: 'ok' };
  }

  async me(): Promise<Me> {
    const { usuario, perfil } = this.autenticar();
    await this.esperar();
    return { usuario, perfil };
  }

  async listarCasos(): Promise<Caso[]> {
    const me = this.autenticar();
    const j = this.exigirJustificativa('/casos');
    await this.esperar();
    this.registrar(me.usuario, 'listar_casos', null, j, {});
    // H23: só os casos de que o usuário é membro.
    return this.casos.filter((c) => this.papel(c.id, me.usuario) !== null).map((c) => this.comSituacao(c, me));
  }

  async criarCaso(corpo: NovoCaso): Promise<Caso> {
    const me = this.autenticar();
    this.exigirJustificativa('/casos');
    if (!corpo.titulo?.trim()) throw new ErroApi(422, '/casos', 'Título obrigatório');
    if (!corpo.finalidade?.trim()) throw new ErroApi(422, '/casos', 'finalidade: a finalidade do caso é obrigatória');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(corpo.retencao_ate ?? '')) throw new ErroApi(422, '/casos', 'retencao_ate: informe o prazo de retenção (AAAA-MM-DD)');
    if (corpo.retencao_ate < new Date().toISOString().slice(0, 10)) throw new ErroApi(422, '/casos', 'retencao_ate: o prazo de retenção não pode ser uma data passada');
    await this.esperar();
    const caso: Caso = {
      id: `caso-${this.proximoId++}`,
      titulo: corpo.titulo.trim(),
      descricao: corpo.descricao ?? '',
      numero_procedimento: corpo.numero_procedimento ?? '',
      criado_por: me.usuario,
      criado_em: new Date().toISOString(),
      finalidade: corpo.finalidade.trim(),
      retencao_ate: corpo.retencao_ate,
    };
    this.casos.push(caso);
    this.entidadesPorCaso.set(String(caso.id), []);
    this.arestasPorCaso.set(String(caso.id), []);
    this.capturasPorCaso.set(String(caso.id), []);
    // Quem cria o caso é o responsável por ele (H23).
    this.membrosPorCaso.set(String(caso.id), [{ usuario: me.usuario, papel: 'responsavel', adicionado_por: me.usuario, adicionado_em: caso.criado_em }]);
    this.registrar(me.usuario, 'criar_caso', caso.id, this.sessao.obterJustificativa().trim(), { titulo: caso.titulo, finalidade: caso.finalidade, retencao_ate: caso.retencao_ate });
    return this.comSituacao(caso, me);
  }

  async obterCaso(casoId: Id): Promise<CasoDetalhe> {
    const me = await this.consulta('consultar_caso', casoId);
    const caso = this.caso(casoId);
    return {
      ...this.comSituacao(caso, me),
      contagens: {
        entidades: this.entidades(casoId).length,
        alertas: (this.alertasPorCaso.get(String(casoId)) ?? []).length,
        capturas: (this.capturasPorCaso.get(String(casoId)) ?? []).length,
        coletas: (this.coletasPorCaso.get(String(casoId)) ?? []).length,
        monitoramentos: this.monitoramentos(casoId).filter((m) => m.ativo).length,
        avisos_nao_lidos: this.avisos(casoId).filter((a) => !a.lido_em).length,
        membros: this.membros(casoId).length,
        anotacoes: this.anotacoes(casoId).length,
        tarefas_abertas: this.tarefas(casoId).filter((t) => SITUACOES_ABERTAS.has(t.situacao)).length,
        sugestoes_ia_pendentes: this.sugestoesIa(casoId).filter((s) => s.situacao === 'pendente').length,
      },
    };
  }

  /** Abre a linha da coleta no histórico (RNF12, H15); `fechar` grava o resultado. */
  private abrirColeta(casoId: Id, usuario: string, fonte: string, parametros: Record<string, unknown>, recoletaDe: Id | null): ColetaRegistro {
    const conector = CONECTORES_DEMO[fonte] ?? { nome: fonte, versao: '0.0.0' };
    const coleta: ColetaRegistro = {
      id: `col-${this.proximoId++}`,
      fonte,
      parametros: { ...parametros },
      conector_nome: conector.nome,
      conector_versao: conector.versao,
      situacao: 'em_andamento',
      tentativas: 0,
      motivo: '',
      registros: 0,
      avisos: [],
      usuario,
      iniciado_em: new Date().toISOString(),
      concluido_em: null,
      recoleta_de: recoletaDe,
      captura_ids: [],
    };
    const chave = String(casoId);
    this.coletasPorCaso.set(chave, [coleta, ...(this.coletasPorCaso.get(chave) ?? [])]);
    return coleta;
  }

  private falharColeta(coleta: ColetaRegistro, casoId: Id, motivo: string): never {
    coleta.situacao = 'falha';
    coleta.motivo = motivo;
    coleta.concluido_em = new Date().toISOString();
    throw new ErroApi(422, `/casos/${casoId}/coletas`, motivo);
  }

  /**
   * Valida os parâmetros da fonte como o back-end e devolve os que ficam
   * gravados na coleta: `do_caso: true` é trocado pela lista explícita das
   * contratadas (CEIS e CNEP) ou dos contratos do caso (termos do PNCP).
   */
  private prepararParametros(casoId: Id, corpo: ColetaRequisicao): { parametros: Record<string, unknown>; erro?: string } {
    const parametros = { ...(corpo.parametros as unknown as Record<string, unknown>) };
    const entidades = this.entidades(casoId);
    const arestas = this.arestas(casoId);
    const contratos = entidades.filter((e) => e.tipo === 'contrato');
    if (corpo.fonte === 'cnpj_arquivo' && !corpo.parametros.diretorio?.trim()) return { parametros, erro: 'Parâmetro "diretorio" obrigatório' };
    if (corpo.fonte === 'pncp' && !/^\d{8}$/.test(corpo.parametros.dataInicial ?? '')) return { parametros, erro: 'dataInicial deve estar no formato AAAAMMDD' };
    if ((corpo.fonte === 'tse_arquivo' || corpo.fonte === 'edital_arquivo') && !corpo.parametros.diretorio?.trim()) {
      return { parametros, erro: 'Parâmetro "diretorio" obrigatório' };
    }
    if (corpo.fonte === 'portal_transparencia') {
      const p = corpo.parametros;
      if (!['ceis', 'cnep', 'servidores', 'cepim', 'ceaf', 'convenios'].includes(p.recurso)) {
        return { parametros, erro: 'recurso: ceis, cnep, cepim, ceaf, convenios ou servidores' };
      }
      // Empresas contratadas do caso (ponta "fornecedor" dos contratos).
      const idsContratadas = new Set(arestas.filter((a) => a.tipo === 'contratado_por' && contratos.some((c) => mesmoId(c.id, a.destino))).map((a) => String(a.origem)));
      if (p.recurso === 'ceaf') {
        // CEAF: sempre por nome, nunca por CPF. `do_caso` vira a lista dos sócios pessoa física das contratadas.
        if (p.do_caso) {
          const idsSocios = new Set(arestas.filter((a) => a.tipo === 'socio_de' && idsContratadas.has(String(a.destino))).map((a) => String(a.origem)));
          const nomes = [...new Set(entidades.filter((e) => e.tipo === 'pessoa' && idsSocios.has(String(e.id))).map((e) => e.rotulo))];
          if (!nomes.length) return { parametros, erro: 'O caso não tem sócios pessoa física de contratadas ou convenentes: faça antes as coletas do CNPJ e do PNCP.' };
          delete parametros.do_caso;
          parametros.nomeSancionado = nomes;
        } else {
          const nomes = (p.nomeSancionado ?? []).map((n) => n.trim()).filter(Boolean);
          if (!nomes.length) return { parametros, erro: 'nomeSancionado: nome completo ou lista de nomes (ou "do_caso": true).' };
          if (nomes.some((n) => /\d/.test(n))) return { parametros, erro: 'nomeSancionado: informe só nomes. O CEAF nunca é consultado por CPF.' };
          parametros.nomeSancionado = nomes;
        }
      } else if (p.recurso === 'convenios' && p.do_caso) {
        const semFins = entidades.filter((e) => e.tipo === 'empresa' && /sem fins lucrativos|associa[cç][aã]o|funda[cç][aã]o/i.test(String(e.atributos.natureza_juridica ?? '')));
        if (!semFins.length) return { parametros, erro: 'O caso não tem entidade sem fins lucrativos (pela natureza jurídica): faça antes a coleta do CNPJ ou informe os CNPJs.' };
        delete parametros.do_caso;
        parametros.codigoSancionado = semFins.map((e) => limparCnpj(e.identificador));
      } else if (p.recurso === 'servidores') {
        const codigo = p.orgaoServidorLotacao ?? p.orgaoServidorExercicio ?? '';
        if (!/^\d+$/.test(codigo)) return { parametros, erro: 'Informe orgaoServidorLotacao ou orgaoServidorExercicio (código SIAPE do órgão, só dígitos).' };
        if (!temFormaDeCnpj(p.cnpjOrgao ?? '')) return { parametros, erro: 'cnpjOrgao: informe o órgão contratante do caso a que o código SIAPE corresponde.' };
      } else if (p.do_caso) {
        const contratadas = new Set(arestas.filter((a) => a.tipo === 'contratado_por' && contratos.some((c) => mesmoId(c.id, a.destino))).map((a) => String(a.origem)));
        const cnpjs = entidades.filter((e) => contratadas.has(String(e.id))).map((e) => limparCnpj(e.identificador));
        if (!cnpjs.length) return { parametros, erro: 'O caso não tem empresas contratadas: faça antes a coleta do PNCP.' };
        delete parametros.do_caso;
        parametros.codigoSancionado = cnpjs;
      } else if (!(p.codigoSancionado ?? []).some((c) => temFormaDeCnpj(c))) {
        return { parametros, erro: 'codigoSancionado: CNPJ ou lista de até 100 CNPJs (ou "do_caso": true).' };
      }
    }
    if (corpo.fonte === 'pncp_termos') {
      if (corpo.parametros.do_caso) {
        if (!contratos.length) return { parametros, erro: 'O caso não tem contratos com órgão, ano e sequencial: faça antes a coleta do PNCP.' };
        delete parametros.do_caso;
        parametros.contratos = contratos.map((c) => {
          const [cnpj, , sequencialEAno] = String(c.identificador).split('-');
          const [sequencial, ano] = (sequencialEAno ?? '').split('/');
          return { cnpj, ano: Number(ano), sequencial: Number(sequencial), numero_controle_pncp: c.identificador };
        });
      } else if (!(corpo.parametros.contratos ?? []).length) {
        return { parametros, erro: 'contratos: lista de objetos com cnpj, ano e sequencial (ou "do_caso": true).' };
      }
    }
    return { parametros };
  }

  private resultadoDe(coleta: ColetaRegistro, entidadesNovas: number, recoletaDe: Id | null): ColetaResultado {
    return {
      captura_ids: [...coleta.captura_ids],
      entidades_novas: entidadesNovas,
      avisos: [...coleta.avisos],
      coleta_id: coleta.id,
      situacao: coleta.situacao,
      tentativas: coleta.tentativas,
      motivo: coleta.motivo,
      conector_nome: coleta.conector_nome,
      conector_versao: coleta.conector_versao,
      recoleta_de: recoletaDe,
    };
  }

  /** Coleta simulada: o caso recebe as fixtures sintéticas da fonte escolhida. */
  private coletar(casoId: Id, me: Me, corpo: ColetaRequisicao, recoletaDe: Id | null): { coleta: ColetaRegistro; resultado: ColetaResultado } {
    const { parametros, erro } = this.prepararParametros(casoId, corpo);
    const coleta = this.abrirColeta(casoId, me.usuario, corpo.fonte, parametros, recoletaDe);
    if (erro) this.falharColeta(coleta, casoId, erro);
    if (corpo.fonte === 'portal_transparencia' && !this.portalConfigurado) {
      // H19: fonte sem configuração não é falha. Responde 200, sem capturas, com o motivo.
      coleta.situacao = 'nao_configurado';
      coleta.motivo = MOTIVO_PORTAL_NAO_CONFIGURADO;
      coleta.avisos = [MOTIVO_PORTAL_NAO_CONFIGURADO];
      coleta.concluido_em = new Date().toISOString();
      this.registrar(me.usuario, 'coleta.nao_configurada', casoId, this.sessao.obterJustificativa().trim(), { fonte: corpo.fonte, situacao: 'nao_configurado' });
      return { coleta, resultado: this.resultadoDe(coleta, 0, recoletaDe) };
    }
    const chave = String(casoId);
    const idsExistentes = this.capturasPorCaso.get(chave) ?? [];
    const entidadesExistentes = this.entidades(casoId);
    const novas: EntidadeDetalhe[] = [];
    const capturaIds: Id[] = [];

    // No Portal da Transparência, cada recurso (CEIS, CNEP, servidores) tem a sua carga.
    const recurso = corpo.fonte === 'portal_transparencia' ? corpo.parametros.recurso : null;
    const cargas = CAPTURAS.filter((c) => c.fonte === corpo.fonte && (recurso === null || c.metadados.recurso === recurso));
    for (const captura of cargas) {
      const id = idsExistentes.some((x) => mesmoId(x, captura.id)) ? `cap-${this.proximoId++}` : captura.id;
      const existente = this.capturas.find((c) => mesmoId(c.id, id));
      if (existente) {
        existente.coleta_id ??= coleta.id;
      } else {
        this.capturas.push({ ...captura, id, coleta_id: coleta.id, coletado_em: new Date().toISOString(), metadados: { ...captura.metadados, parametros } });
      }
      idsExistentes.push(id);
      capturaIds.push(id);
    }
    this.capturasPorCaso.set(chave, idsExistentes);

    // Cada entidade sintética entra no caso com a coleta da carga que a originou (a primeira das suas fontes).
    const idsDasCargas = new Set(cargas.map((c) => String(c.id)));
    for (const ent of ENTIDADES.filter((e) => idsDasCargas.has(String(e.fontes[0]?.captura_id)))) {
      if (!entidadesExistentes.some((e) => mesmoId(e.id, ent.id))) {
        novas.push({ ...ent });
      }
    }
    this.entidadesPorCaso.set(chave, [...entidadesExistentes, ...novas]);
    const idsNoCaso = new Set(this.entidades(casoId).map((e) => String(e.id)));
    this.arestasPorCaso.set(
      chave,
      ARESTAS.filter((a) => idsNoCaso.has(String(a.origem)) && idsNoCaso.has(String(a.destino))),
    );
    // CEPIM, CEAF e convênios não têm carga sintética: a coleta fecha com sucesso, sem capturas, e avisa.
    if (!cargas.length) coleta.avisos = ['Nenhum registro encontrado: o modo simulado não tem carga sintética para este recurso.'];
    coleta.situacao = 'sucesso';
    coleta.tentativas = 1;
    coleta.registros = capturaIds.length;
    coleta.captura_ids = capturaIds;
    coleta.concluido_em = new Date().toISOString();
    return { coleta, resultado: this.resultadoDe(coleta, novas.length, recoletaDe) };
  }

  async iniciarColeta(casoId: Id, corpo: ColetaRequisicao): Promise<ColetaResultado> {
    const { me } = await this.casoAberto('coleta', casoId, { fonte: corpo.fonte, parametros: corpo.parametros }, 'investigador');
    return this.coletar(casoId, me, corpo, null).resultado;
  }

  async listarColetas(casoId: Id): Promise<ColetaRegistro[]> {
    await this.consulta('listar_coletas', casoId);
    this.caso(casoId);
    return (this.coletasPorCaso.get(String(casoId)) ?? []).map((c) => ({ ...c, avisos: [...c.avisos], captura_ids: [...c.captura_ids] }));
  }

  /** Recoleta simulada (RF07, H14): as fixtures não mudam, então o hash é sempre o mesmo. */
  async recoletar(casoId: Id, coletaId: Id): Promise<RecoletaResultado> {
    const { me } = await this.casoAberto('recoleta', casoId, { coleta_id: coletaId }, 'investigador');
    const original = (this.coletasPorCaso.get(String(casoId)) ?? []).find((c) => mesmoId(c.id, coletaId));
    if (!original) throw new ErroApi(404, `/casos/${casoId}/coletas/${coletaId}/recoletar`, 'Coleta não encontrada no caso');
    const corpo = { fonte: original.fonte, parametros: original.parametros } as unknown as ColetaRequisicao;
    const { coleta, resultado } = this.coletar(casoId, me, corpo, original.id);
    const capturas: ComparacaoCaptura[] = [];
    const semAnterior: Id[] = [];
    const anteriores = original.captura_ids.map((id) => this.capturas.find((c) => mesmoId(c.id, id))).filter(Boolean) as Captura[];
    for (const id of coleta.captura_ids) {
      const nova = this.capturas.find((c) => mesmoId(c.id, id))!;
      const anterior = anteriores.find((c) => c.url_ou_arquivo === nova.url_ou_arquivo);
      if (!anterior) {
        semAnterior.push(id);
        continue;
      }
      const conector = { nome: nova.conector_nome ?? '', versao: nova.conector_versao ?? '' };
      const conectorAnterior = { nome: anterior.conector_nome ?? '', versao: anterior.conector_versao ?? '' };
      capturas.push({
        captura_id: nova.id,
        anterior_id: anterior.id,
        fonte: nova.fonte,
        url_ou_arquivo: nova.url_ou_arquivo,
        coletado_em: nova.coletado_em,
        anterior_coletado_em: anterior.coletado_em,
        sha256: nova.sha256,
        anterior_sha256: anterior.sha256,
        mesmo_hash: nova.sha256 === anterior.sha256,
        tamanho_bytes: nova.tamanho_bytes,
        anterior_tamanho_bytes: anterior.tamanho_bytes,
        conector,
        anterior_conector: conectorAnterior,
        mesma_versao_conector: conector.versao === conectorAnterior.versao,
        registros_comparados: true,
        registros: { adicionados: 0, removidos: 0, alterados: 0, iguais: null },
        campos_alterados: [],
        diferencas: [],
        diferencas_omitidas: 0,
        observacao: 'As duas cargas têm o mesmo SHA-256: o conteúdo é idêntico.',
      });
    }
    const iguais = capturas.filter((c) => c.mesmo_hash).length;
    return {
      ...resultado,
      comparacao: {
        coleta_id: coleta.id,
        anterior_id: original.id,
        fonte: coleta.fonte,
        conector: { nome: coleta.conector_nome, versao: coleta.conector_versao },
        anterior_conector: { nome: original.conector_nome, versao: original.conector_versao },
        mesmo_conteudo: capturas.length > 0 && iguais === capturas.length && semAnterior.length === 0,
        capturas_iguais: iguais,
        capturas_diferentes: capturas.length - iguais,
        capturas,
        capturas_sem_anterior: semAnterior,
        capturas_anteriores_sem_correspondente: [],
      },
    };
  }

  async buscarEntidades(casoId: Id, q: string): Promise<EntidadeResumo[]> {
    await this.casoAberto('buscar_entidades', casoId, { q });
    const termo = normalizar(q);
    return this.entidades(casoId)
      .filter((e) => !termo || normalizar(e.rotulo).includes(termo) || normalizar(e.identificador).includes(termo) || (soDigitos(e.identificador).includes(soDigitos(termo)) && soDigitos(termo).length > 0) || (/[A-Za-z]/.test(q) && /\d/.test(q) && limparCnpj(e.identificador).includes(limparCnpj(q))))
      .map(({ id, tipo, rotulo, identificador, atributos }) => ({ id, tipo, rotulo, identificador, atributos: { ...atributos } }));
  }

  async obterEntidade(casoId: Id, entidadeId: Id): Promise<EntidadeDetalhe> {
    await this.casoAberto('consultar_entidade', casoId, { entidade_id: entidadeId });
    const ent = this.entidades(casoId).find((e) => mesmoId(e.id, entidadeId));
    if (!ent) throw new ErroApi(404, `/casos/${casoId}/entidades/${entidadeId}`, 'Entidade não encontrada');
    const idsNoCaso = new Set(this.entidades(casoId).map((e) => String(e.id)));
    return { ...ent, fontes: ent.fontes.map((f) => ({ ...f })), sugestoes: ent.sugestoes.filter((s) => idsNoCaso.has(String(s.entidade_id))).map((s) => ({ ...s })) };
  }

  async obterGrafo(casoId: Id, centro: Id, profundidade: number): Promise<Grafo> {
    await this.casoAberto('consultar_grafo', casoId, { centro, profundidade });
    const nos = this.entidades(casoId);
    if (!nos.some((n) => mesmoId(n.id, centro))) throw new ErroApi(404, `/casos/${casoId}/grafo`, 'Entidade central não encontrada');
    const arestas = this.arestas(casoId);
    const visitados = new Set<string>([String(centro)]);
    let fronteira = [String(centro)];
    for (let nivel = 0; nivel < Math.max(0, profundidade); nivel++) {
      const proxima: string[] = [];
      for (const a of arestas) {
        const o = String(a.origem);
        const d = String(a.destino);
        if (fronteira.includes(o) && !visitados.has(d)) { visitados.add(d); proxima.push(d); }
        if (fronteira.includes(d) && !visitados.has(o)) { visitados.add(o); proxima.push(o); }
      }
      fronteira = proxima;
      if (!fronteira.length) break;
    }
    return {
      nos: nos.filter((n) => visitados.has(String(n.id))).map(({ id, tipo, rotulo }) => ({ id, tipo, rotulo })),
      arestas: arestas.filter((a) => visitados.has(String(a.origem)) && visitados.has(String(a.destino))).map((a) => ({ ...a })),
    };
  }

  async obterCaminho(casoId: Id, de: Id, para: Id): Promise<Grafo> {
    await this.casoAberto('consultar_caminho', casoId, { de, para });
    const nos = this.entidades(casoId);
    const arestas = this.arestas(casoId);
    const anterior = new Map<string, { no: string; aresta: Grafo['arestas'][number] } | null>([[String(de), null]]);
    const fila = [String(de)];
    while (fila.length) {
      const atual = fila.shift()!;
      if (atual === String(para)) break;
      for (const a of arestas) {
        const vizinho = String(a.origem) === atual ? String(a.destino) : String(a.destino) === atual ? String(a.origem) : null;
        if (vizinho && !anterior.has(vizinho)) { anterior.set(vizinho, { no: atual, aresta: a }); fila.push(vizinho); }
      }
    }
    if (!anterior.has(String(para))) return { nos: [], arestas: [] };
    const idsCaminho: string[] = [];
    const arestasCaminho: Grafo['arestas'] = [];
    let cursor: string | null = String(para);
    while (cursor) {
      idsCaminho.push(cursor);
      const passo = anterior.get(cursor);
      if (passo) arestasCaminho.push({ ...passo.aresta });
      cursor = passo ? passo.no : null;
    }
    return {
      nos: nos.filter((n) => idsCaminho.includes(String(n.id))).map(({ id, tipo, rotulo }) => ({ id, tipo, rotulo })),
      arestas: arestasCaminho.reverse(),
    };
  }

  /**
   * Como no back-end: a reexecução mantém a decisão dos alertas que continuam
   * detectados. Com `tipologias`, só as escolhidas são reavaliadas e os alertas
   * das demais ficam como estavam. Dos limiares por execução, o simulado aplica
   * os três do horizonte 2 aos alertas sintéticos de T5 e de T8, o valor mínimo
   * da L14 e os dois mínimos da combinação; os demais são só validados.
   */
  async executarAlertas(casoId: Id, corpo: ExecucaoAlertas = {}): Promise<Alerta[]> {
    const rota = `/casos/${casoId}/alertas/executar`;
    const p = corpo.parametros ?? {};
    const escolhidas = corpo.tipologias ?? [...TIPOLOGIAS];
    if (escolhidas.some((t) => !TIPOLOGIAS.includes(t))) throw new ErroApi(422, rota, 'tipologias: use T1 a T10, L1 a L16 (as implementadas) ou COMB');
    const t5 = p.t5_minimo_contratacoes;
    if (t5 !== undefined && (!Number.isInteger(t5) || t5 < 2 || t5 > 1000)) throw new ErroApi(422, rota, 't5_minimo_contratacoes: inteiro de 2 a 1000');
    for (const nome of ['t8_percentual_limite', 't8_percentual_limite_reforma'] as const) {
      const v = p[nome];
      if (v !== undefined && !(Number.isFinite(v) && v > 0 && v <= 1000)) throw new ErroApi(422, rota, `${nome}: maior que 0, até 1000`);
    }
    for (const [nome, faixa] of Object.entries(FAIXAS_LAVAGEM) as [keyof typeof FAIXAS_LAVAGEM, Faixa][]) {
      const v = p[nome];
      if (v === undefined) continue;
      const naFaixa = Number.isFinite(v) && (!faixa.inteiro || Number.isInteger(v)) && (faixa.exclusivo ? v > faixa.minimo : v >= faixa.minimo);
      if (!naFaixa) throw new ErroApi(422, rota, `${nome}: ${faixa.inteiro ? 'inteiro' : 'número'} ${faixa.exclusivo ? 'maior que' : 'a partir de'} ${faixa.minimo}`);
    }
    await this.casoAberto('executar_alertas', casoId, { tipologias: escolhidas, parametros: { ...p } }, 'investigador');
    const minimoT5 = t5 ?? PARAMETROS_TIPOLOGIAS_DEMO.t5_minimo_contratacoes;
    const limiteT8 = p.t8_percentual_limite ?? PARAMETROS_TIPOLOGIAS_DEMO.t8_percentual_limite;
    const minimoL14 = p.l14_valor_minimo ?? PARAMETROS_TIPOLOGIAS_DEMO.l14_valor_minimo;
    const dispara = (a: Alerta) => {
      if (a.tipologia === 'T5') return Number(a.parametros.contratacoes) >= minimoT5;
      if (a.tipologia === 'T8') return Number(a.parametros.percentual_observado) > limiteT8;
      if (a.tipologia === 'L14') return Number(a.parametros.valor_contratado) >= minimoL14;
      return true;
    };
    const comLimiar = (a: Alerta): Record<string, unknown> => {
      if (a.tipologia === 'T5') return { ...a.parametros, t5_minimo_contratacoes: minimoT5 };
      if (a.tipologia === 'T8') return { ...a.parametros, percentual_limite: limiteT8 };
      if (a.tipologia === 'L14') return { ...a.parametros, l14_valor_minimo: minimoL14 };
      return a.parametros;
    };
    const idsNoCaso = new Set(this.entidades(casoId).map((e) => String(e.id)));
    const anteriores = this.alertasPorCaso.get(String(casoId)) ?? [];
    const alertas = ALERTAS.filter((a) => a.entidades.every((e) => idsNoCaso.has(String(e)))).flatMap((a) => {
      const anterior = anteriores.find((x) => mesmoId(x.id, a.id));
      if (!escolhidas.includes(a.tipologia)) return anterior ? [clonarAlerta(anterior)] : [];
      if (!dispara(a)) return [];
      const parametros = comLimiar(a);
      return [clonarAlerta(anterior ? { ...a, parametros, situacao: anterior.situacao, decisao: anterior.decisao, decisoes: anterior.decisoes } : { ...a, parametros })];
    });
    // A combinação é a última a rodar, sobre os alertas que ficaram; fora da execução, a anterior é mantida.
    const combinacoes = escolhidas.includes('COMB')
      ? this.combinar(casoId, alertas, p).map((c) => {
          const anterior = anteriores.find((x) => mesmoId(x.id, c.id));
          return anterior ? { ...c, situacao: anterior.situacao, decisao: anterior.decisao, decisoes: anterior.decisoes } : c;
        })
      : anteriores.filter((a) => a.tipologia === 'COMB');
    // Severidade alta e código "COMB": vêm antes de todos, como na ordem do back-end.
    const todos = [...combinacoes, ...alertas];
    this.alertasPorCaso.set(String(casoId), todos);
    return todos.map(clonarAlerta);
  }

  /**
   * Alerta de combinação (COMB): uma entidade com alertas de tipologias distintas em número e em
   * soma de pesos iguais ou maiores que os mínimos. Simplificação do simulado: a entidade de um
   * alerta é a primeira da lista `entidades`. Alertas descartados não entram.
   */
  private combinar(casoId: Id, alertas: Alerta[], p: ParametrosTipologias): Alerta[] {
    const minimoTipologias = p.comb_minimo_tipologias ?? PARAMETROS_TIPOLOGIAS_DEMO.comb_minimo_tipologias;
    const pesoMinimo = p.comb_peso_minimo ?? PARAMETROS_TIPOLOGIAS_DEMO.comb_peso_minimo;
    const porEntidade = new Map<string, Alerta[]>();
    for (const a of alertas) {
      if (a.tipologia === 'COMB' || (a.situacao ?? 'pendente') === 'descartado' || !a.entidades.length) continue;
      const chave = String(a.entidades[0]);
      porEntidade.set(chave, [...(porEntidade.get(chave) ?? []), a]);
    }
    const saida: Alerta[] = [];
    for (const [entidadeId, doAlvo] of porEntidade) {
      const componentes: ComponenteCombinacao[] = doAlvo.map((a) => {
        const peso = PESOS_COMBINACAO_DEMO[a.tipologia] ?? 0;
        return {
          alerta_id: a.id,
          tipologia: a.tipologia,
          tipologia_nome: a.tipologia_nome ?? POLITICAS_DEMO[a.tipologia].nome,
          titulo: a.titulo,
          severidade: a.severidade,
          situacao: a.situacao ?? 'pendente',
          peso,
          sinal_fraco: a.sinal_fraco === true,
          conta: peso > 0,
          observacao: a.tipologia === 'L8' ? OBSERVACAO_L8_DEMO : '',
        };
      });
      const contam = componentes.filter((c) => c.conta);
      const distintas = [...new Set(contam.map((c) => c.tipologia))];
      const soma = contam.reduce((total, c) => total + c.peso, 0);
      if (distintas.length < minimoTipologias || soma < pesoMinimo) continue;
      const entidade = this.entidades(casoId).find((e) => mesmoId(e.id, entidadeId));
      const rotulo = entidade?.rotulo ?? entidadeId;
      const evidencias = doAlvo.flatMap((a) => a.evidencias).filter((ev, i, todas) => todas.findIndex((x) => mesmoId(x.captura_id, ev.captura_id) && x.descricao === ev.descricao) === i);
      const { nome, severidade, prefere_evitar, politica_erro } = POLITICAS_DEMO.COMB;
      const numero = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1 });
      saida.push({
        id: `alr-comb-${entidadeId}`,
        tipologia: 'COMB',
        titulo: `Combinação de alertas em ${rotulo}: ${distintas.length} tipologias distintas`,
        motivo:
          `${rotulo} acumula ${contam.length} alerta(s) de ${distintas.length} tipologias distintas (${distintas.join(', ')}), com soma de pesos ` +
          `${numero(soma)} (mínimos: ${minimoTipologias} tipologias e peso ${numero(pesoMinimo)}). ${AVISO_COMBINACAO_DEMO}`,
        severidade,
        tipologia_nome: nome,
        prefere_evitar,
        politica_erro,
        situacao: 'pendente',
        decisao: null,
        decisoes: [],
        ativo: true,
        grupo: 'combinacao',
        sinal_fraco: false,
        peso: 0,
        entidades: [entidadeId],
        evidencias,
        parametros: {
          entidade_id: entidadeId,
          entidade_rotulo: rotulo,
          entidade_tipo: entidade?.tipo ?? '',
          tipologias_distintas: distintas.length,
          soma_pesos: soma,
          comb_minimo_tipologias: minimoTipologias,
          comb_peso_minimo: pesoMinimo,
          componentes,
          aviso: AVISO_COMBINACAO_DEMO,
        },
      });
    }
    return saida.sort((a, b) => a.titulo.localeCompare(b.titulo));
  }

  async listarAlertas(casoId: Id): Promise<Alerta[]> {
    await this.consulta('listar_alertas', casoId);
    this.caso(casoId);
    return (this.alertasPorCaso.get(String(casoId)) ?? []).map(clonarAlerta);
  }

  /** RF12 (H12): a decisão fica no alerta, entra no histórico e gera evento na auditoria. */
  async decidirAlerta(casoId: Id, alertaId: Id, corpo: NovaDecisao): Promise<Alerta> {
    const me = this.autenticar();
    const justificativaAcesso = this.exigirJustificativa('decidir_alerta');
    await this.esperar();
    const caso = this.caso(casoId);
    const rota = `/casos/${casoId}/alertas/${alertaId}/decisao`;
    this.exigirPapel(me, casoId, justificativaAcesso, 'investigador', 'alerta.decidir');
    if (this.vencido(caso)) {
      this.registrar(me.usuario, 'caso.retencao_recusa', casoId, justificativaAcesso, { acao_recusada: 'alerta.decidir', retencao_ate: caso.retencao_ate });
      throw new ErroApi(403, rota, `O prazo de retenção deste caso terminou em ${caso.retencao_ate}: o caso está só para leitura.`);
    }
    const justificativa = (corpo.justificativa ?? '').trim();
    if (corpo.decisao !== 'confirmado' && corpo.decisao !== 'descartado') throw new ErroApi(422, rota, 'decisao: use "confirmado" ou "descartado"');
    if (!/[\p{L}\p{N}]/u.test(justificativa)) throw new ErroApi(422, rota, 'justificativa: a justificativa da decisão é obrigatória');
    const alerta = (this.alertasPorCaso.get(String(casoId)) ?? []).find((a) => mesmoId(a.id, alertaId));
    if (!alerta) throw new ErroApi(404, rota, 'Alerta não encontrado no caso');
    const situacaoAnterior = alerta.situacao ?? 'pendente';
    const decisao = { decisao: corpo.decisao, justificativa, usuario: me.usuario, perfil: me.perfil, decidido_em: new Date().toISOString() };
    alerta.decisoes = [...(alerta.decisoes ?? []), decisao];
    alerta.decisao = decisao;
    alerta.situacao = corpo.decisao;
    this.registrar(me.usuario, 'alerta.decidir', casoId, justificativaAcesso, {
      alerta_id: alerta.id,
      tipologia: alerta.tipologia,
      decisao: corpo.decisao,
      justificativa_decisao: justificativa,
      situacao_anterior: situacaoAnterior,
      revisao: situacaoAnterior !== 'pendente',
    });
    return clonarAlerta(alerta);
  }

  async obterCaptura(capturaId: Id): Promise<Captura> {
    await this.consulta('consultar_captura', null, { captura_id: capturaId });
    const captura = this.capturas.find((c) => mesmoId(c.id, capturaId));
    if (!captura) throw new ErroApi(404, `/capturas/${capturaId}`, 'Captura não encontrada');
    return { ...captura, metadados: { ...captura.metadados } };
  }

  async verificarCaptura(capturaId: Id): Promise<VerificacaoCaptura> {
    await this.consulta('verificar_captura', null, { captura_id: capturaId });
    const captura = this.capturas.find((c) => mesmoId(c.id, capturaId));
    if (!captura) throw new ErroApi(404, `/capturas/${capturaId}/verificar`, 'Captura não encontrada');
    const violada = mesmoId(captura.id, CAPTURA_VIOLADA_DEMO);
    const recalculado = violada ? hashSintetico(`${captura.sha256}:alterado`) : captura.sha256;
    return { integra: !violada, sha256_registrado: captura.sha256, sha256_recalculado: recalculado };
  }

  async listarAuditoria(casoId?: Id): Promise<EntradaAuditoria[]> {
    await this.consulta('consultar_auditoria', casoId ?? null, {}, null);
    return this.auditoria
      .filter((e) => casoId === undefined || mesmoId(e.caso_id, casoId))
      .map((e) => ({ ...e }));
  }

  async verificarAuditoria(): Promise<VerificacaoAuditoria> {
    await this.consulta('verificar_auditoria', null, {});
    return this.estadoDaCadeia();
  }

  private async estadoDaCadeia(): Promise<VerificacaoAuditoria> {
    let anteriorHash: string | null = null;
    let primeira_quebra: number | null = null;
    for (const e of this.auditoria) {
      if (e.hash_anterior !== anteriorHash) { primeira_quebra = e.seq; break; }
      anteriorHash = e.hash;
    }
    return { integra: primeira_quebra === null, entradas: this.auditoria.length, primeira_quebra };
  }

  async obterRelatorio(casoId: Id, formato: FormatoRelatorio): Promise<string> {
    const me = await this.consulta('gerar_relatorio', casoId, { formato });
    const caso = this.caso(casoId);
    const tarefas = this.tarefas(casoId);
    // Como no back-end: as entradas da trilha de auditoria só entram no
    // relatório para os perfis que podem ler a auditoria; para os demais a
    // lista vem vazia. O resultado da verificação da cadeia vale para todos.
    const cadeia = await this.estadoDaCadeia();
    const entradas_do_caso = PERFIS_COM_AUDITORIA.has(me.perfil)
      ? this.auditoria.filter((e) => mesmoId(e.caso_id, casoId)).map((e) => ({ ...e }))
      : [];
    const entidades = this.entidades(casoId);
    const alertas = this.alertasPorCaso.get(String(casoId)) ?? [];
    const coletas = this.coletasPorCaso.get(String(casoId)) ?? [];
    const contar = (situacao: string) => alertas.filter((a) => (a.situacao ?? 'pendente') === situacao).length;
    const capturas = (this.capturasPorCaso.get(String(casoId)) ?? []).map((id) => this.capturas.find((c) => mesmoId(c.id, id))).filter(Boolean) as Captura[];
    if (formato === 'json') {
      return JSON.stringify(
        {
          caso: this.comSituacao(caso),
          gerado_em: new Date().toISOString(),
          resumo: {
            entidades: entidades.length,
            alertas: alertas.length,
            capturas: capturas.length,
            coletas: coletas.length,
            coletas_com_falha: coletas.filter((c) => c.situacao === 'falha').length,
            coletas_nao_configuradas: coletas.filter((c) => c.situacao === 'nao_configurado').length,
            monitoramentos_ativos: this.monitoramentos(casoId).filter((m) => m.ativo).length,
            avisos: this.avisos(casoId).length,
            avisos_nao_lidos: this.avisos(casoId).filter((a) => !a.lido_em).length,
            alertas_pendentes: contar('pendente'),
            alertas_confirmados: contar('confirmado'),
            alertas_descartados: contar('descartado'),
            membros: this.membros(casoId).length,
            anotacoes: this.anotacoes(casoId).length,
            tarefas_abertas: tarefas.filter((t) => SITUACOES_ABERTAS.has(t.situacao)).length,
            sugestoes_ia_pendentes: this.sugestoesIa(casoId).filter((s) => s.situacao === 'pendente').length,
          },
          membros: this.membros(casoId).map((m) => ({ ...m })),
          anotacoes: this.anotacoes(casoId).map((a) => ({ ...a })),
          tarefas: tarefas.map((t) => this.tarefaSaida(t)),
          coletas,
          entidades,
          alertas,
          custodia: capturas,
          monitoramentos: this.monitoramentos(casoId).map(clonarMonitoramento),
          avisos: this.avisos(casoId).map(clonarAviso),
          dados_pessoais: 'Nenhum CPF completo é guardado: só os seis dígitos centrais, no formato ***NNNNNN**.',
          auditoria: { ...cadeia, entradas_do_caso },
        },
        null,
        2,
      );
    }
    const linhas = [
      `# Relatório do caso ${caso.numero_procedimento} — ${caso.titulo}`,
      '',
      `Gerado em ${new Date().toISOString()} (modo simulado, dados sintéticos).`,
      `Finalidade: ${caso.finalidade || '(não informada)'}. Prazo de retenção: ${caso.retencao_ate ?? '(não definido)'}${this.vencido(caso) ? ' — vencido: caso só para leitura' : ''}.`,
      '',
      '## Entidades',
      '',
      ...entidades.map((e) => `- **${e.rotulo}** (${e.tipo}, ${e.identificador}) — fontes: ${e.fontes.map((f) => f.captura_id).join(', ')}`),
      '',
      '## Alertas',
      '',
      ...alertas.flatMap((a) => [
        `### ${a.tipologia} — ${a.titulo} (severidade ${a.severidade})`,
        '',
        `Situação: ${a.situacao ?? 'pendente'}${a.decisao ? ` (por ${a.decisao.usuario} em ${a.decisao.decidido_em} — justificativa: ${a.decisao.justificativa})` : ''}`,
        '',
        a.motivo,
        '',
        ...a.evidencias.map((ev) => `- ${ev.descricao} — fonte ${ev.fonte}, captura ${ev.captura_id}, \`${ev.url_ou_arquivo}\`, SHA-256 \`${ev.sha256}\``),
        '',
      ]),
      '## Coletas',
      '',
      '| Coleta | Fonte | Conector | Situação | Tentativas | Motivo |',
      '|---|---|---|---|---|---|',
      ...coletas.map((c) => `| ${c.id} | ${c.fonte} | ${c.conector_nome} ${c.conector_versao} | ${c.situacao} | ${c.tentativas} | ${c.motivo} |`),
      '',
      '## Monitoramento contínuo e avisos',
      '',
      ...(this.monitoramentos(casoId).length
        ? this.monitoramentos(casoId).map((m) => `- ${m.entidade_rotulo} — a cada ${m.periodicidade_horas} h, ${m.ativo ? 'ativo' : `inativo (${m.motivo_inativo})`}`)
        : ['Nenhuma entidade monitorada.']),
      ...this.avisos(casoId).map((a) => `- Aviso (${a.tipo}) em ${a.criado_em}: ${a.descricao} ${a.lido_em ? `— lido por ${a.lido_por}` : '— não lido'}`),
      '',
      '## Dados pessoais',
      '',
      'Nenhum CPF completo é guardado: só os seis dígitos centrais, no formato ***NNNNNN**.',
      '',
      '## Cadeia de custódia',
      '',
      '| Captura | Fonte | Conector | Origem | Coletado em (UTC) | SHA-256 |',
      '|---|---|---|---|---|---|',
      ...capturas.map((c) => `| ${c.id} | ${c.fonte} | ${c.conector_nome ?? ''} ${c.conector_versao ?? ''} | ${c.url_ou_arquivo} | ${c.coletado_em} | ${c.sha256} |`),
      '',
      '## Trilha de auditoria',
      '',
      `Cadeia ${cadeia.integra ? 'íntegra' : 'VIOLADA'} (${cadeia.entradas} entradas verificadas).`,
      '',
      ...(entradas_do_caso.length
        ? entradas_do_caso.map((e) => `- seq ${e.seq} · ${e.quando} · ${e.usuario} · ${e.acao}`)
        : ['As entradas da trilha de auditoria não fazem parte deste relatório para o perfil que o gerou.']),
      '',
    ];
    return linhas.join('\n');
  }

  // ---- horizonte 2: catálogo de tipologias, monitoramento e avisos ---------

  /** Não é dado de caso: exige só o token e não entra na auditoria (como no back-end). */
  async listarTipologias(): Promise<TipologiaCatalogo[]> {
    this.autenticar();
    await this.esperar();
    return TIPOLOGIAS_DEMO.map((t) => ({ ...t, fontes: [...t.fontes], parametros: t.parametros.map((p) => ({ ...p })) }));
  }

  private monitoramentos(casoId: Id): Monitoramento[] {
    return this.monitoramentosPorCaso.get(String(casoId)) ?? [];
  }

  private avisos(casoId: Id): Aviso[] {
    return this.avisosPorCaso.get(String(casoId)) ?? [];
  }

  /**
   * Coletas que o monitoramento refaz: as bem-sucedidas que produziram capturas
   * citadas pela entidade; para cada fonte e conjunto de parâmetros, a mais recente.
   */
  private coletasDeOrigem(casoId: Id, entidadeId: Id): ColetaRegistro[] {
    const entidade = this.entidades(casoId).find((e) => mesmoId(e.id, entidadeId));
    if (!entidade) return [];
    const citadas = new Set(entidade.fontes.map((f) => String(f.captura_id)));
    const vistas = new Set<string>();
    const origens: ColetaRegistro[] = [];
    // O histórico já está do mais recente para o mais antigo.
    for (const coleta of this.coletasPorCaso.get(String(casoId)) ?? []) {
      if (coleta.situacao !== 'sucesso' || !coleta.captura_ids.some((id) => citadas.has(String(id)))) continue;
      const chave = `${coleta.fonte}|${JSON.stringify(coleta.parametros)}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      origens.push(coleta);
    }
    return origens;
  }

  private monitoramentoSaida(casoId: Id, m: Monitoramento): Monitoramento {
    const entidade = this.entidades(casoId).find((e) => mesmoId(e.id, m.entidade_id));
    return {
      ...clonarMonitoramento(m),
      entidade_rotulo: entidade?.rotulo ?? m.entidade_rotulo,
      entidade_tipo: entidade?.tipo ?? m.entidade_tipo,
      entidade_identificador: entidade?.identificador ?? m.entidade_identificador,
      coletas_de_origem: this.coletasDeOrigem(casoId, m.entidade_id).map((c) => ({ coleta_id: c.id, fonte: c.fonte, iniciado_em: c.iniciado_em })),
    };
  }

  private obterMonitoramento(casoId: Id, monitoramentoId: Id, rota: string): Monitoramento {
    const m = this.monitoramentos(casoId).find((x) => mesmoId(x.id, monitoramentoId));
    if (!m) throw new ErroApi(404, rota, `Monitoramento ${monitoramentoId} não encontrado no caso.`);
    return m;
  }

  private validarPeriodicidade(horas: unknown, rota: string): void {
    if (typeof horas !== 'number' || !Number.isInteger(horas) || horas < 1 || horas > 8760) {
      throw new ErroApi(422, rota, 'periodicidade_horas: inteiro de 1 a 8760');
    }
  }

  async listarMonitoramentos(casoId: Id): Promise<Monitoramento[]> {
    await this.consulta('monitoramento.listar', casoId);
    this.caso(casoId);
    return this.monitoramentos(casoId).map((m) => this.monitoramentoSaida(casoId, m));
  }

  /** Um monitoramento por entidade: marcar de novo reativa e atualiza a periodicidade. */
  async criarMonitoramento(casoId: Id, corpo: NovoMonitoramento): Promise<Monitoramento> {
    const rota = `/casos/${casoId}/monitoramentos`;
    const me = this.autenticar();
    const justificativa = this.exigirJustificativa(rota);
    this.validarPeriodicidade(corpo.periodicidade_horas, rota);
    await this.esperar();
    const caso = this.caso(casoId);
    this.exigirPapel(me, casoId, justificativa, 'investigador', 'monitoramento.criar');
    if (this.vencido(caso)) {
      this.registrar(me.usuario, 'caso.retencao_recusa', casoId, justificativa, { acao_recusada: 'monitoramento.criar', retencao_ate: caso.retencao_ate });
      throw new ErroApi(403, rota, `O prazo de retenção deste caso terminou em ${caso.retencao_ate}: o caso está só para leitura.`);
    }
    const entidade = this.entidades(casoId).find((e) => mesmoId(e.id, corpo.entidade_id));
    if (!entidade) throw new ErroApi(404, rota, `Entidade ${corpo.entidade_id} não encontrada no caso.`);
    let m = this.monitoramentos(casoId).find((x) => mesmoId(x.entidade_id, entidade.id));
    const novo = !m;
    if (!m) {
      m = {
        id: `mon-${this.proximoId++}`,
        caso_id: casoId,
        entidade_id: entidade.id,
        entidade_rotulo: entidade.rotulo,
        entidade_tipo: entidade.tipo,
        entidade_identificador: entidade.identificador,
        periodicidade_horas: corpo.periodicidade_horas,
        ativo: true,
        motivo_inativo: '',
        justificativa,
        criado_por: me.usuario,
        criado_em: new Date().toISOString(),
        proxima_execucao_em: '',
        ultima_execucao_em: null,
        coletas_de_origem: [],
        ultima_execucao: null,
      };
      this.monitoramentosPorCaso.set(String(casoId), [...this.monitoramentos(casoId), m]);
    }
    m.periodicidade_horas = corpo.periodicidade_horas;
    m.ativo = true;
    m.motivo_inativo = '';
    m.justificativa = justificativa;
    m.proxima_execucao_em = daquiA(corpo.periodicidade_horas);
    this.registrar(me.usuario, novo ? 'monitoramento.criar' : 'monitoramento.reativar', casoId, justificativa, {
      monitoramento_id: m.id,
      entidade_id: entidade.id,
      entidade_tipo: entidade.tipo,
      periodicidade_horas: m.periodicidade_horas,
    });
    return this.monitoramentoSaida(casoId, m);
  }

  /** Desativar é permitido com o caso vencido; reativar, não. */
  async alterarMonitoramento(casoId: Id, monitoramentoId: Id, corpo: SituacaoMonitoramento): Promise<Monitoramento> {
    const rota = `/casos/${casoId}/monitoramentos/${monitoramentoId}/situacao`;
    const me = this.autenticar();
    const justificativa = this.exigirJustificativa(rota);
    if (corpo.periodicidade_horas !== undefined) this.validarPeriodicidade(corpo.periodicidade_horas, rota);
    await this.esperar();
    const caso = this.caso(casoId);
    this.exigirPapel(me, casoId, justificativa, 'investigador', 'monitoramento.alterar');
    if (corpo.ativo && this.vencido(caso)) {
      this.registrar(me.usuario, 'caso.retencao_recusa', casoId, justificativa, { acao_recusada: 'monitoramento.alterar', retencao_ate: caso.retencao_ate });
      throw new ErroApi(403, rota, `O prazo de retenção deste caso terminou em ${caso.retencao_ate}: o caso está só para leitura.`);
    }
    const m = this.obterMonitoramento(casoId, monitoramentoId, rota);
    if (corpo.periodicidade_horas !== undefined) m.periodicidade_horas = corpo.periodicidade_horas;
    m.ativo = corpo.ativo;
    m.motivo_inativo = corpo.ativo ? '' : `Desativado por ${me.usuario}.`;
    if (corpo.ativo) m.proxima_execucao_em = daquiA(m.periodicidade_horas);
    this.registrar(me.usuario, 'monitoramento.alterar', casoId, justificativa, { monitoramento_id: m.id, ativo: m.ativo, periodicidade_horas: m.periodicidade_horas });
    return this.monitoramentoSaida(casoId, m);
  }

  /**
   * Execução manual: refaz as coletas de origem como recoletas comuns (H14).
   * As fixtures não mudam, então o conteúdo é sempre o mesmo e nenhum aviso
   * novo é gerado; os avisos da demonstração vêm das execuções já registradas.
   */
  async executarMonitoramento(casoId: Id, monitoramentoId: Id): Promise<ExecucaoMonitoramentoResultado> {
    const rota = `/casos/${casoId}/monitoramentos/${monitoramentoId}/executar`;
    const { me } = await this.casoAberto('monitoramento.iniciar', casoId, { monitoramento_id: monitoramentoId, origem: 'manual' }, 'investigador');
    const m = this.obterMonitoramento(casoId, monitoramentoId, rota);
    if (!m.ativo) throw new ErroApi(409, rota, 'O monitoramento está desativado.');
    const iniciado_em = new Date().toISOString();
    const coletas: RecoletaMonitorada[] = [];
    for (const origem of this.coletasDeOrigem(casoId, m.entidade_id)) {
      const corpo = { fonte: origem.fonte, parametros: origem.parametros } as unknown as ColetaRequisicao;
      try {
        const { coleta } = this.coletar(casoId, me, corpo, origem.id);
        const feita = coleta.situacao === 'sucesso';
        coletas.push({ coleta_id: coleta.id, recoleta_de: origem.id, fonte: origem.fonte, situacao: coleta.situacao, mesmo_conteudo: feita ? true : null, motivo: coleta.motivo });
      } catch (e) {
        coletas.push({ coleta_id: null, recoleta_de: origem.id, fonte: origem.fonte, situacao: 'falha', mesmo_conteudo: null, motivo: e instanceof Error ? e.message : String(e) });
      }
    }
    const feitas = coletas.filter((c) => c.situacao === 'sucesso').length;
    const situacao = !coletas.length ? 'sem_coletas' : feitas === coletas.length ? 'sucesso' : feitas > 0 ? 'parcial' : 'falha';
    const execucao: ExecucaoMonitoramento = {
      id: `exe-${this.proximoId++}`,
      monitoramento_id: m.id,
      origem: 'manual',
      usuario: me.usuario,
      iniciado_em,
      concluido_em: new Date().toISOString(),
      situacao,
      coletas,
      avisos_gerados: 0,
      motivo: situacao === 'sem_coletas' ? 'Nenhuma coleta de origem encontrada para a entidade.' : '',
    };
    m.ultima_execucao = execucao;
    m.ultima_execucao_em = execucao.concluido_em;
    m.proxima_execucao_em = daquiA(m.periodicidade_horas);
    this.registrar(me.usuario, 'monitoramento.executar', casoId, this.sessao.obterJustificativa().trim(), {
      monitoramento_id: m.id,
      execucao_id: execucao.id,
      situacao,
      recoletas: coletas.length,
      avisos_gerados: 0,
    });
    return { ...execucao, coletas: coletas.map((c) => ({ ...c })), avisos: [] };
  }

  async listarAvisos(casoId: Id, naoLidos = false): Promise<Aviso[]> {
    await this.consulta('aviso.listar', casoId, { nao_lidos: naoLidos });
    this.caso(casoId);
    return this.avisos(casoId)
      .filter((a) => !naoLidos || !a.lido_em)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map(clonarAviso);
  }

  async marcarAvisoLido(casoId: Id, avisoId: Id): Promise<Aviso> {
    const me = await this.consulta('aviso.marcar_lido', casoId, { aviso_id: avisoId }, 'investigador');
    this.caso(casoId);
    const aviso = this.avisos(casoId).find((a) => mesmoId(a.id, avisoId));
    if (!aviso) throw new ErroApi(404, `/casos/${casoId}/avisos/${avisoId}/lido`, `Aviso ${avisoId} não encontrado no caso.`);
    if (!aviso.lido_em) {
      aviso.lido_em = new Date().toISOString();
      aviso.lido_por = me.usuario;
    }
    return clonarAviso(aviso);
  }

  // ---- horizonte 3: autenticação com senha e segundo fator (H23) -----------

  private abrirSessao(usuario: string, etapa: SessaoSimulada['etapa'], minutos: number): { token: string; sessao: SessaoSimulada } {
    const token = `sessao-simulada-${this.proximoId++}-${hashSintetico(`${usuario}:${etapa}:${Date.now()}:${this.proximoId}`).slice(0, 24)}`;
    const sessao: SessaoSimulada = { usuario, etapa, expira_em: new Date(Date.now() + minutos * 60_000).toISOString() };
    this.sessoes.set(token, sessao);
    return { token, sessao };
  }

  private bloqueada(conta: ContaSimulada): boolean {
    return !!conta.bloqueado_ate && conta.bloqueado_ate > new Date().toISOString();
  }

  /** Conta a falha e bloqueia a conta por 15 minutos ao chegar ao limite, como o back-end. */
  private registrarFalha(conta: ContaSimulada): boolean {
    conta.falhas += 1;
    if (conta.falhas < MAX_FALHAS_LOGIN_DEMO) return false;
    conta.falhas = 0;
    conta.bloqueado_ate = new Date(Date.now() + 15 * 60_000).toISOString();
    return true;
  }

  private saidaDoLogin(usuario: string, conta: ContaSimulada, token: string, sessao: SessaoSimulada): SessaoLogin {
    const cadastro = sessao.etapa === 'cadastro_mfa';
    return {
      etapa: sessao.etapa,
      token,
      expira_em: sessao.expira_em,
      usuario,
      perfil: conta.perfil,
      segredo: cadastro ? SEGREDO_MFA_DEMO : null,
      otpauth_uri: cadastro
        ? `otpauth://totp/${encodeURIComponent(`Buscador OSINT (simulado):${usuario}`)}?secret=${SEGREDO_MFA_DEMO}&issuer=${encodeURIComponent('Buscador OSINT (simulado)')}&algorithm=SHA1&digits=6&period=30`
        : null,
    };
  }

  async login(usuario: string, senha: string): Promise<SessaoLogin> {
    await this.esperar();
    const nome = (usuario ?? '').trim().toLowerCase();
    const conta = this.contas.get(nome);
    const falhar = (status: number, mensagem: string, motivo: string): never => {
      this.registrar(nome.slice(0, 100) || '(vazio)', 'auth.login_falhou', null, '', { motivo });
      throw new ErroApi(status, '/auth/login', mensagem);
    };
    if (!conta) return falhar(401, MENSAGEM_CREDENCIAIS, 'usuario_inexistente');
    if (this.bloqueada(conta)) return falhar(429, MENSAGEM_BLOQUEIO, 'conta_bloqueada');
    if (conta.senha !== senha) {
      const bloqueou = this.registrarFalha(conta);
      return falhar(401, MENSAGEM_CREDENCIAIS, bloqueou ? 'senha_incorreta_conta_bloqueada' : 'senha');
    }
    if (!conta.ativo) return falhar(401, MENSAGEM_CREDENCIAIS, 'conta_inativa');
    const { token, sessao } = this.abrirSessao(nome, conta.mfa_ativo ? 'mfa' : 'cadastro_mfa', 5);
    this.registrar(nome, 'auth.senha_aceita', null, '', { perfil: conta.perfil, etapa: sessao.etapa, mfa: false });
    return this.saidaDoLogin(nome, conta, token, sessao);
  }

  async confirmarMfa(tokenPendente: string, codigo: string): Promise<SessaoLogin> {
    await this.esperar();
    const rota = '/auth/mfa';
    const pendente = this.sessoes.get((tokenPendente ?? '').trim());
    if (!pendente || pendente.etapa === 'ativa' || pendente.expira_em < new Date().toISOString()) {
      throw new ErroApi(401, rota, 'Etapa de autenticação inválida ou expirada.');
    }
    const conta = this.contas.get(pendente.usuario)!;
    const falhar = (status: number, mensagem: string, motivo: string): never => {
      this.registrar(pendente.usuario, 'auth.mfa_falhou', null, '', { motivo });
      throw new ErroApi(status, rota, mensagem);
    };
    if (!conta.ativo) return falhar(401, MENSAGEM_CREDENCIAIS, 'conta_inativa');
    if (this.bloqueada(conta)) return falhar(429, MENSAGEM_BLOQUEIO, 'conta_bloqueada');
    if (!/^\d{6}$/.test(codigo ?? '')) throw new ErroApi(422, rota, 'codigo: informe os 6 dígitos do código');
    if (codigo !== CODIGO_MFA_DEMO) {
      if (this.registrarFalha(conta)) {
        this.sessoes.delete(tokenPendente.trim());
        return falhar(429, MENSAGEM_BLOQUEIO, 'mfa_incorreto_conta_bloqueada');
      }
      return falhar(401, 'Código de verificação inválido.', 'mfa_incorreto');
    }
    const cadastradoAgora = pendente.etapa === 'cadastro_mfa';
    conta.falhas = 0;
    conta.bloqueado_ate = null;
    conta.mfa_ativo = true;
    this.sessoes.delete(tokenPendente.trim());
    // O token da etapa pendente deixa de valer: o da sessão ativa é outro.
    const { token, sessao } = this.abrirSessao(pendente.usuario, 'ativa', 8 * 60);
    this.registrar(pendente.usuario, 'auth.login', null, '', { perfil: conta.perfil, mfa: true, mfa_cadastrado_agora: cadastradoAgora });
    return this.saidaDoLogin(pendente.usuario, conta, token, sessao);
  }

  async obterSessao(): Promise<SessaoAtual> {
    const me = this.autenticar();
    await this.esperar();
    const sessao = this.sessoes.get(this.sessao.obterToken().trim());
    if (me.autenticacao !== 'sessao' || !sessao) {
      return { usuario: me.usuario, perfil: me.perfil, autenticacao: 'token_dev', mfa_ativo: false, expira_em: null, inatividade_minutos: null };
    }
    return { usuario: me.usuario, perfil: me.perfil, autenticacao: 'sessao', mfa_ativo: true, expira_em: sessao.expira_em, inatividade_minutos: 30 };
  }

  private exigirSessaoReal(me: Me, rota: string): string {
    const token = this.sessao.obterToken().trim();
    if (me.autenticacao !== 'sessao' || !this.sessoes.has(token)) {
      throw new ErroApi(400, rota, 'Tokens de desenvolvimento não têm sessão: esta rota vale só para usuários reais.');
    }
    return token;
  }

  async logout(): Promise<void> {
    const me = this.autenticar();
    await this.esperar();
    const token = this.exigirSessaoReal(me, '/auth/logout');
    this.sessoes.delete(token);
    this.registrar(me.usuario, 'auth.logout', null, '', {});
  }

  private validarSenha(senha: string, usuario: string, rota: string): void {
    if ((senha ?? '').length < TAMANHO_MINIMO_SENHA) throw new ErroApi(422, rota, `A senha precisa ter ao menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
    if (senha.toLowerCase().includes(usuario.toLowerCase())) throw new ErroApi(422, rota, 'A senha não pode conter o nome de usuário.');
  }

  /** Encerra as sessões da conta, menos a indicada; devolve quantas foram encerradas. */
  private encerrarSessoes(usuario: string, exceto?: string): number {
    let encerradas = 0;
    for (const [token, sessao] of this.sessoes) {
      if (sessao.usuario === usuario && token !== exceto) {
        this.sessoes.delete(token);
        encerradas++;
      }
    }
    return encerradas;
  }

  async trocarSenha(corpo: TrocaSenha): Promise<void> {
    const me = this.autenticar();
    await this.esperar();
    const rota = '/auth/senha';
    const token = this.exigirSessaoReal(me, rota);
    const conta = this.contas.get(me.usuario)!;
    if (conta.senha !== corpo.senha_atual) {
      this.registrar(me.usuario, 'auth.troca_de_senha_falhou', null, '', { motivo: 'senha_atual' });
      throw new ErroApi(403, rota, 'A senha atual não confere.');
    }
    this.validarSenha(corpo.senha_nova, me.usuario, rota);
    conta.senha = corpo.senha_nova;
    this.registrar(me.usuario, 'auth.trocar_senha', null, '', { sessoes_encerradas: this.encerrarSessoes(me.usuario, token) });
  }

  /** Administração de contas: perfil admin, com justificativa e registro na auditoria. */
  private async comoAdmin(acao: string, rota: string, detalhes: Record<string, unknown> = {}): Promise<Me> {
    const me = this.autenticar();
    const justificativa = this.exigirJustificativa(rota);
    await this.esperar();
    if (me.perfil !== 'admin') {
      this.registrar(me.usuario, 'acesso.perfil_negado', null, '', { perfil: me.perfil, perfis_exigidos: ['admin'], rota });
      throw new ErroApi(403, rota, 'Acesso restrito aos perfis: admin.');
    }
    this.registrar(me.usuario, acao, null, justificativa, detalhes);
    return me;
  }

  private contaSaida(usuario: string, conta: ContaSimulada): UsuarioAdmin {
    return {
      usuario,
      nome: conta.nome,
      perfil: conta.perfil,
      ativo: conta.ativo,
      mfa_ativo: conta.mfa_ativo,
      mfa_obrigatorio: true,
      bloqueado_ate: this.bloqueada(conta) ? conta.bloqueado_ate : null,
      criado_por: conta.criado_por,
      criado_em: conta.criado_em,
    };
  }

  async listarUsuarios(): Promise<UsuarioAdmin[]> {
    await this.comoAdmin('usuario.listar', '/usuarios', { total: this.contas.size });
    return [...this.contas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([usuario, conta]) => this.contaSaida(usuario, conta));
  }

  async criarUsuario(corpo: NovoUsuario): Promise<UsuarioAdmin> {
    const rota = '/usuarios';
    const usuario = (corpo.usuario ?? '').trim().toLowerCase();
    const me = await this.comoAdmin('usuario.criar', rota, { usuario_criado: usuario, perfil_criado: corpo.perfil });
    if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(usuario)) {
      throw new ErroApi(422, rota, 'O nome de usuário deve ter de 3 a 64 caracteres: letras minúsculas, dígitos, ponto, hífen ou sublinhado, começando por letra ou dígito.');
    }
    if (!PERFIS_USUARIO.includes(corpo.perfil)) throw new ErroApi(422, rota, `Perfil desconhecido (aceitos: ${PERFIS_USUARIO.join(', ')}).`);
    this.validarSenha(corpo.senha, usuario, rota);
    if (this.contas.has(usuario)) throw new ErroApi(409, rota, `Já existe o usuário '${usuario}'.`);
    const conta: ContaSimulada = {
      nome: (corpo.nome ?? '').trim(),
      perfil: corpo.perfil,
      senha: corpo.senha,
      mfa_ativo: false,
      ativo: true,
      falhas: 0,
      bloqueado_ate: null,
      criado_por: me.usuario,
      criado_em: new Date().toISOString(),
    };
    this.contas.set(usuario, conta);
    return this.contaSaida(usuario, conta);
  }

  async alterarUsuario(usuario: string, corpo: AlteracaoUsuario): Promise<UsuarioAdmin> {
    const rota = `/usuarios/${usuario}`;
    const me = await this.comoAdmin('usuario.alterar', rota, { usuario_alterado: usuario, mudancas: Object.keys(corpo) });
    const conta = this.contas.get(usuario);
    if (!conta) throw new ErroApi(404, rota, 'Usuário não encontrado.');
    let mudou = false;
    if (corpo.ativo !== undefined && corpo.ativo !== conta.ativo) {
      if (!corpo.ativo && usuario === me.usuario) throw new ErroApi(422, rota, 'Você não pode desativar a própria conta.');
      conta.ativo = corpo.ativo;
      mudou = true;
    }
    if (corpo.perfil !== undefined && corpo.perfil !== conta.perfil) {
      if (usuario === me.usuario) throw new ErroApi(422, rota, 'Você não pode mudar o próprio perfil.');
      if (!PERFIS_USUARIO.includes(corpo.perfil)) throw new ErroApi(422, rota, `Perfil desconhecido (aceitos: ${PERFIS_USUARIO.join(', ')}).`);
      conta.perfil = corpo.perfil;
      mudou = true;
    }
    if (corpo.senha !== undefined) {
      this.validarSenha(corpo.senha, usuario, rota);
      conta.senha = corpo.senha;
      conta.falhas = 0;
      conta.bloqueado_ate = null;
      mudou = true;
    }
    if (corpo.redefinir_mfa) {
      conta.mfa_ativo = false;
      mudou = true;
    }
    // Qualquer mudança encerra as sessões da conta (menos a de quem está alterando).
    if (mudou) this.encerrarSessoes(usuario, this.sessao.obterToken().trim());
    return this.contaSaida(usuario, conta);
  }

  // ---- horizonte 3: membros do caso (H23) ----------------------------------

  private membros(casoId: Id): Membro[] {
    return this.membrosPorCaso.get(String(casoId)) ?? [];
  }

  private usuarioConhecido(usuario: string): boolean {
    const conta = this.contas.get(usuario);
    if (conta) return conta.ativo;
    return Object.values(this.tokens).some((u) => u.usuario === usuario);
  }

  private responsaveis(casoId: Id): number {
    return this.membros(casoId).filter((m) => m.papel === 'responsavel').length;
  }

  async listarMembros(casoId: Id): Promise<Membro[]> {
    await this.consulta('membro.listar', casoId);
    this.caso(casoId);
    return this.membros(casoId).map((m) => ({ ...m }));
  }

  async definirMembro(casoId: Id, corpo: DefinicaoMembro): Promise<Membro[]> {
    const rota = `/casos/${casoId}/membros`;
    const usuario = (corpo.usuario ?? '').trim().toLowerCase();
    const me = await this.consulta('membro.definir', casoId, { membro: usuario, papel: corpo.papel }, 'responsavel');
    this.caso(casoId);
    if (!PAPEIS_CASO.includes(corpo.papel)) throw new ErroApi(422, rota, 'papel: responsavel, investigador ou leitor');
    if (!usuario || !this.usuarioConhecido(usuario)) throw new ErroApi(422, rota, `Não há usuário ativo com o login '${usuario}'.`);
    const membros = this.membros(casoId);
    const membro = membros.find((m) => m.usuario === usuario);
    if (!membro) {
      this.membrosPorCaso.set(String(casoId), [...membros, { usuario, papel: corpo.papel, adicionado_por: me.usuario, adicionado_em: new Date().toISOString() }]);
    } else if (membro.papel !== corpo.papel) {
      if (membro.papel === 'responsavel' && this.responsaveis(casoId) <= 1) {
        throw new ErroApi(422, rota, 'O caso precisa de ao menos um responsável: defina outro antes de mudar este.');
      }
      membro.papel = corpo.papel;
    }
    return this.membros(casoId).map((m) => ({ ...m }));
  }

  async removerMembro(casoId: Id, usuario: string): Promise<Membro[]> {
    const rota = `/casos/${casoId}/membros/${usuario}/remover`;
    const alvo = (usuario ?? '').trim().toLowerCase();
    await this.consulta('membro.remover', casoId, { membro: alvo }, 'responsavel');
    this.caso(casoId);
    const membro = this.membros(casoId).find((m) => m.usuario === alvo);
    if (!membro) throw new ErroApi(404, rota, 'Este usuário não é membro do caso.');
    if (membro.papel === 'responsavel' && this.responsaveis(casoId) <= 1) {
      throw new ErroApi(422, rota, 'O caso precisa de ao menos um responsável: defina outro antes de remover.');
    }
    this.membrosPorCaso.set(String(casoId), this.membros(casoId).filter((m) => m !== membro));
    return this.membros(casoId).map((m) => ({ ...m }));
  }

  // ---- horizonte 3: anotações e tarefas (H37) ------------------------------

  private anotacoes(casoId: Id): Anotacao[] {
    return this.anotacoesPorCaso.get(String(casoId)) ?? [];
  }

  /** Rótulo do alvo, ou `null` se ele não existe neste caso. */
  private rotuloDoAlvo(casoId: Id, alvoTipo: string, alvoId: string): string | null {
    if (alvoTipo === 'entidade') return this.entidades(casoId).find((e) => mesmoId(e.id, alvoId))?.rotulo ?? null;
    const alerta = (this.alertasPorCaso.get(String(casoId)) ?? []).find((a) => mesmoId(a.id, alvoId));
    return alerta ? `[${alerta.tipologia}] ${alerta.titulo}` : null;
  }

  async listarAnotacoes(casoId: Id, filtro: FiltroAnotacoes = {}): Promise<Anotacao[]> {
    await this.consulta('anotacao.listar', casoId, { alvo_tipo: filtro.alvo_tipo ?? null, alvo_id: filtro.alvo_id ?? null });
    this.caso(casoId);
    return this.anotacoes(casoId)
      .filter((a) => (!filtro.alvo_tipo || a.alvo_tipo === filtro.alvo_tipo) && (filtro.alvo_id === undefined || mesmoId(a.alvo_id, filtro.alvo_id)))
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em))
      .map((a) => ({ ...a, alvo_rotulo: this.rotuloDoAlvo(casoId, a.alvo_tipo, a.alvo_id) ?? a.alvo_rotulo ?? null }));
  }

  /** Só de acréscimo: não há rota para editar nem para apagar uma anotação. */
  async criarAnotacao(casoId: Id, corpo: NovaAnotacao): Promise<Anotacao> {
    const rota = `/casos/${casoId}/anotacoes`;
    const texto = (corpo.texto ?? '').trim();
    if (corpo.alvo_tipo !== 'entidade' && corpo.alvo_tipo !== 'alerta') throw new ErroApi(422, rota, 'alvo_tipo: entidade ou alerta');
    if (!/[\p{L}\p{N}]/u.test(texto)) throw new ErroApi(422, rota, 'texto: a anotação precisa ter texto');
    if (texto.length > 5000) throw new ErroApi(422, rota, 'texto: no máximo 5000 caracteres');
    const { me } = await this.casoAberto('anotacao.criar', casoId, { alvo_tipo: corpo.alvo_tipo, alvo_id: corpo.alvo_id, caracteres: texto.length }, 'investigador');
    const rotulo = this.rotuloDoAlvo(casoId, corpo.alvo_tipo, String(corpo.alvo_id));
    if (rotulo === null) throw new ErroApi(404, rota, `${corpo.alvo_tipo === 'entidade' ? 'Entidade' : 'Alerta'} não encontrado(a) no caso.`);
    const anotacao: Anotacao = {
      id: `ano-${this.proximoId++}`,
      alvo_tipo: corpo.alvo_tipo,
      alvo_id: String(corpo.alvo_id),
      alvo_rotulo: rotulo,
      autor: me.usuario,
      criado_em: new Date().toISOString(),
      texto,
    };
    this.anotacoesPorCaso.set(String(casoId), [anotacao, ...this.anotacoes(casoId)]);
    return { ...anotacao };
  }

  private tarefas(casoId: Id): Tarefa[] {
    return this.tarefasPorCaso.get(String(casoId)) ?? [];
  }

  private tarefaSaida(t: Tarefa): Tarefa {
    const hoje = new Date().toISOString().slice(0, 10);
    return { ...clonarTarefa(t), atrasada: !!t.prazo && SITUACOES_ABERTAS.has(t.situacao) && t.prazo < hoje };
  }

  private obterTarefaInterna(casoId: Id, tarefaId: Id, rota: string): Tarefa {
    const tarefa = this.tarefas(casoId).find((t) => mesmoId(t.id, tarefaId));
    if (!tarefa) throw new ErroApi(404, rota, `Tarefa ${tarefaId} não encontrada no caso.`);
    return tarefa;
  }

  private validarResponsavel(casoId: Id, responsavel: string | null | undefined, rota: string): string | null {
    const nome = (responsavel ?? '').trim().toLowerCase();
    if (!nome) return null;
    if (!this.membros(casoId).some((m) => m.usuario === nome)) throw new ErroApi(422, rota, 'O responsável pela tarefa precisa ser membro do caso.');
    return nome;
  }

  private validarPrazo(prazo: string | null | undefined, rota: string): string | null {
    if (prazo === null || prazo === undefined || prazo === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) throw new ErroApi(422, rota, 'prazo: use o formato AAAA-MM-DD');
    return prazo;
  }

  /** Abertas primeiro; dentro de cada grupo, pelo prazo (sem prazo por último). */
  async listarTarefas(casoId: Id, situacao?: SituacaoTarefa): Promise<Tarefa[]> {
    await this.consulta('tarefa.listar', casoId, { situacao: situacao ?? null });
    this.caso(casoId);
    const chave = (t: Tarefa) => `${SITUACOES_ABERTAS.has(t.situacao) ? 0 : 1}${t.prazo ?? '9999-12-31'}`;
    return this.tarefas(casoId)
      .filter((t) => !situacao || t.situacao === situacao)
      .sort((a, b) => chave(a).localeCompare(chave(b)) || b.criado_em.localeCompare(a.criado_em))
      .map((t) => this.tarefaSaida(t));
  }

  async criarTarefa(casoId: Id, corpo: NovaTarefa): Promise<Tarefa> {
    const rota = `/casos/${casoId}/tarefas`;
    const titulo = (corpo.titulo ?? '').trim();
    if (!/[\p{L}\p{N}]/u.test(titulo)) throw new ErroApi(422, rota, 'titulo: o título da tarefa é obrigatório');
    const { me } = await this.casoAberto('tarefa.criar', casoId, { titulo }, 'investigador');
    const agora = new Date().toISOString();
    const tarefa: Tarefa = {
      id: `tar-${this.proximoId++}`,
      titulo,
      descricao: (corpo.descricao ?? '').trim(),
      responsavel: this.validarResponsavel(casoId, corpo.responsavel, rota),
      situacao: 'aberta',
      prazo: this.validarPrazo(corpo.prazo, rota),
      atrasada: false,
      criado_por: me.usuario,
      criado_em: agora,
      atualizado_em: agora,
      historico: [],
    };
    tarefa.historico.push({
      usuario: me.usuario,
      quando: agora,
      alteracoes: {
        titulo: { de: null, para: tarefa.titulo },
        responsavel: { de: null, para: tarefa.responsavel },
        situacao: { de: null, para: tarefa.situacao },
        prazo: { de: null, para: tarefa.prazo },
      },
    });
    this.tarefasPorCaso.set(String(casoId), [tarefa, ...this.tarefas(casoId)]);
    return this.tarefaSaida(tarefa);
  }

  async obterTarefa(casoId: Id, tarefaId: Id): Promise<Tarefa> {
    await this.consulta('tarefa.ver', casoId, { tarefa_id: tarefaId });
    this.caso(casoId);
    return this.tarefaSaida(this.obterTarefaInterna(casoId, tarefaId, `/casos/${casoId}/tarefas/${tarefaId}`));
  }

  /** Só os campos enviados mudam; cada alteração acrescenta uma linha ao histórico, com o valor anterior e o novo. */
  async alterarTarefa(casoId: Id, tarefaId: Id, corpo: AlteracaoTarefa): Promise<Tarefa> {
    const rota = `/casos/${casoId}/tarefas/${tarefaId}`;
    const { me } = await this.casoAberto('tarefa.alterar', casoId, { tarefa_id: tarefaId, campos: Object.keys(corpo) }, 'investigador');
    const tarefa = this.obterTarefaInterna(casoId, tarefaId, rota);
    const novos: Partial<Pick<Tarefa, 'titulo' | 'descricao' | 'situacao' | 'responsavel' | 'prazo'>> = {};
    if (corpo.titulo !== undefined) {
      if (!/[\p{L}\p{N}]/u.test(corpo.titulo)) throw new ErroApi(422, rota, 'titulo: o título da tarefa é obrigatório');
      novos.titulo = corpo.titulo.trim();
    }
    if (corpo.descricao !== undefined) novos.descricao = corpo.descricao.trim();
    if (corpo.situacao !== undefined) {
      if (!SITUACOES_TAREFA.includes(corpo.situacao)) throw new ErroApi(422, rota, 'situacao: aberta, em_andamento, concluida ou cancelada');
      novos.situacao = corpo.situacao;
    }
    if ('responsavel' in corpo) novos.responsavel = this.validarResponsavel(casoId, corpo.responsavel, rota);
    if ('prazo' in corpo) novos.prazo = this.validarPrazo(corpo.prazo, rota);
    const alteracoes: Tarefa['historico'][number]['alteracoes'] = {};
    for (const [campo, valor] of Object.entries(novos) as [keyof typeof novos, string | null][]) {
      if (tarefa[campo] !== valor) alteracoes[campo] = { de: tarefa[campo], para: valor };
    }
    if (!Object.keys(alteracoes).length) throw new ErroApi(422, rota, 'Nenhum campo foi alterado.');
    const agora = new Date().toISOString();
    Object.assign(tarefa, Object.fromEntries(Object.entries(alteracoes).map(([campo, mudanca]) => [campo, mudanca.para])));
    tarefa.atualizado_em = agora;
    if (alteracoes.descricao) {
      // O histórico registra que a descrição mudou, sem repetir o texto inteiro duas vezes.
      alteracoes.descricao = {
        de: `(${String(alteracoes.descricao.de ?? '').length} caracteres)`,
        para: `(${String(alteracoes.descricao.para ?? '').length} caracteres)`,
      };
    }
    tarefa.historico.push({ usuario: me.usuario, quando: agora, alteracoes });
    return this.tarefaSaida(tarefa);
  }

  // ---- horizonte 3: exportação do grafo em formatos abertos (H38) ----------

  /**
   * GraphML, CSV de entidades, CSV de vínculos ou ZIP com os três. Cada linha
   * leva o ID e o SHA-256 da captura de origem. O SHA-256 do arquivo é
   * calculado de verdade sobre os bytes entregues.
   */
  async exportarGrafo(casoId: Id, formato: FormatoExportacao): Promise<ArquivoExportado> {
    const rota = `/casos/${casoId}/exportacao`;
    if (!['zip', 'graphml', 'csv_entidades', 'csv_vinculos'].includes(formato)) throw new ErroApi(422, rota, 'formato: graphml, csv_entidades, csv_vinculos ou zip');
    await this.casoAberto('exportacao.gerar', casoId, { formato });
    const capturaDe = (id: Id | undefined) => this.capturas.find((c) => mesmoId(c.id, id));
    const camposCaptura = (id: Id | undefined) => {
      const c = capturaDe(id);
      return [String(id ?? ''), c?.sha256 ?? '', c?.fonte ?? '', c?.url_ou_arquivo ?? '', c?.coletado_em ?? ''];
    };
    const entidades = this.entidades(casoId);
    const porId = new Map(entidades.map((e) => [String(e.id), e]));
    const linhasEntidades = entidades.map((e) => [String(e.id), e.tipo, e.rotulo, e.identificador, ...camposCaptura(e.fontes[0]?.captura_id), JSON.stringify(e.atributos)]);
    const ponta = (id: Id) => {
      const e = porId.get(String(id));
      return [String(id), e?.tipo ?? '', e?.rotulo ?? '', e?.identificador ?? ''];
    };
    const linhasVinculos = this.arestas(casoId).map((a, i) => [`vin-${i + 1}`, a.tipo, ...ponta(a.origem), ...ponta(a.destino), ...camposCaptura(a.captura_id), JSON.stringify(a.atributos)]);
    const CAPTURA = ['captura_id', 'captura_sha256', 'captura_fonte', 'captura_origem', 'captura_coletado_em'];
    const csvEntidades = paraCsv(['id', 'tipo', 'rotulo', 'identificador', ...CAPTURA, 'atributos_json'], linhasEntidades);
    const csvVinculos = paraCsv(
      ['id', 'tipo', 'origem_id', 'origem_tipo', 'origem_rotulo', 'origem_identificador', 'destino_id', 'destino_tipo', 'destino_rotulo', 'destino_identificador', ...CAPTURA, 'atributos_json'],
      linhasVinculos,
    );
    const graphml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
      ...['tipo', 'rotulo', 'identificador', ...CAPTURA].map((k) => `  <key id="n_${k}" for="node" attr.name="${k}" attr.type="string"/>`),
      ...['tipo', ...CAPTURA].map((k) => `  <key id="e_${k}" for="edge" attr.name="${k}" attr.type="string"/>`),
      '  <graph id="caso" edgedefault="directed">',
      ...linhasEntidades.map(
        (l) => `    <node id="${xml(l[0])}">${['tipo', 'rotulo', 'identificador', ...CAPTURA].map((k, i) => `<data key="n_${k}">${xml(l[i + 1])}</data>`).join('')}</node>`,
      ),
      ...linhasVinculos.map(
        (l) => `    <edge id="${xml(l[0])}" source="${xml(l[2])}" target="${xml(l[6])}"><data key="e_tipo">${xml(l[1])}</data>${CAPTURA.map((k, i) => `<data key="e_${k}">${xml(l[10 + i])}</data>`).join('')}</edge>`,
      ),
      '  </graph>',
      '</graphml>',
      '',
    ].join('\n');
    const codificar = (texto: string) => new TextEncoder().encode(texto);
    const arquivos = {
      csv_entidades: { nome: 'entidades.csv', tipo: 'text/csv', bytes: codificar(csvEntidades) },
      csv_vinculos: { nome: 'vinculos.csv', tipo: 'text/csv', bytes: codificar(csvVinculos) },
      graphml: { nome: 'grafo.graphml', tipo: 'application/graphml+xml', bytes: codificar(graphml) },
    };
    let nome: string;
    let tipo: string;
    let bytes: Uint8Array;
    if (formato === 'zip') {
      const lista = Object.values(arquivos);
      const manifesto = {
        caso_id: String(casoId),
        simulado: true,
        arquivos: await Promise.all(lista.map(async (a) => ({ nome: a.nome, sha256: (await sha256Hex(a.bytes)) ?? hashSintetico(a.nome), tamanho_bytes: a.bytes.length }))),
      };
      const leiame =
        'Exportação do grafo do caso (buscador OSINT, TCC2 - UnB/FCTE) - modo simulado, dados sintéticos.\n\n' +
        '- entidades.csv: uma linha por entidade.\n- vinculos.csv: uma linha por vínculo, com os dados das duas pontas.\n' +
        '- grafo.graphml: o mesmo grafo em GraphML.\n- manifesto.json: SHA-256 de cada arquivo.\n\n' +
        'Cada linha leva o ID e o SHA-256 da captura de origem.\n';
      bytes = montarZip([
        ...lista.map((a) => ({ nome: a.nome, conteudo: a.bytes })),
        { nome: 'manifesto.json', conteudo: codificar(JSON.stringify(manifesto, null, 2)) },
        { nome: 'LEIAME.txt', conteudo: codificar(leiame) },
      ]);
      nome = `caso-${String(casoId)}-grafo.zip`;
      tipo = 'application/zip';
    } else {
      ({ nome, tipo, bytes } = arquivos[formato]);
      nome = `caso-${String(casoId)}-${nome}`;
    }
    const sha256 = (await sha256Hex(bytes)) ?? hashSintetico(nome + bytes.length);
    return { nome, tipo, sha256, conteudo: new Blob([bytes.slice().buffer as ArrayBuffer], { type: tipo }) };
  }

  // ---- horizonte 3: extração assistida por IA local (RF13, H22) ------------

  private sugestoesIa(casoId: Id): SugestaoIa[] {
    return this.sugestoesIaPorCaso.get(String(casoId)) ?? [];
  }

  /**
   * Execução simulada: nenhum modelo é chamado. Os itens fixos da demonstração
   * passam pela mesma verificação do back-end (o trecho precisa estar,
   * literal, no texto) e viram sugestões PENDENTES; os demais ficam em
   * `recusas`. As posições contam pontos de código Unicode.
   */
  private novaExtracao(casoId: Id, capturaId: Id, usuario: string, quando: string): ExtracaoIa {
    const texto = TEXTOS_CAPTURA_DEMO[String(capturaId)] ?? '';
    const captura = this.capturas.find((c) => mesmoId(c.id, capturaId));
    const id = `ext-${this.proximoId++}`;
    const sugestoes: SugestaoIa[] = [];
    const recusas = RECUSAS_IA_DEMO.map((r) => ({ ...r }));
    for (const item of ITENS_IA_DEMO) {
      const indice = texto.indexOf(item.trecho);
      if (indice < 0) {
        recusas.push({ motivo: 'trecho_nao_literal', tipo: item.tipo, valor: item.valor, trecho: item.trecho });
        continue;
      }
      const inicio = Array.from(texto.slice(0, indice)).length;
      sugestoes.push({
        id: `sug-${this.proximoId++}`,
        extracao_id: id,
        captura_id: capturaId,
        captura_sha256: captura?.sha256 ?? '',
        tipo: item.tipo,
        valor: item.valor,
        campos: { ...item.campos },
        trecho: item.trecho,
        posicao_inicio: inicio,
        posicao_fim: inicio + Array.from(item.trecho).length,
        confianca: item.confianca,
        situacao: 'pendente',
        decidido_por: null,
        decidido_em: null,
        justificativa_decisao: null,
        entidade_id: null,
        modelo: IA_DEMO.modelo,
        provedor: IA_DEMO.provedor,
      });
    }
    const extracao: ExtracaoIa = {
      id,
      captura_id: capturaId,
      captura_sha256: captura?.sha256 ?? '',
      provedor: IA_DEMO.provedor,
      modelo: IA_DEMO.modelo,
      modelo_versao: IA_DEMO.modelo_versao,
      servidor_versao: IA_DEMO.servidor_versao,
      parametros: { ...IA_DEMO.parametros },
      prompt_sha256: hashSintetico('prompt-de-extracao-simulado'),
      situacao: 'sucesso',
      motivo: '',
      blocos: 1,
      itens_recebidos: sugestoes.length + recusas.length,
      itens_aceitos: sugestoes.length,
      itens_recusados: recusas.length,
      recusas,
      usuario,
      iniciado_em: quando,
      concluido_em: quando,
      sugestoes: [],
    };
    const chave = String(casoId);
    this.extracoesPorCaso.set(chave, [extracao, ...(this.extracoesPorCaso.get(chave) ?? [])]);
    this.sugestoesIaPorCaso.set(chave, [...this.sugestoesIa(casoId), ...sugestoes]);
    return extracao;
  }

  /** Não é dado de caso: exige só o token e não entra na auditoria. */
  async estadoIa(): Promise<IaEstado> {
    this.autenticar();
    await this.esperar();
    return { ativa: this.iaAtiva, provedor: this.iaAtiva ? IA_DEMO.provedor : null, modelo: this.iaAtiva ? IA_DEMO.modelo : null, local: true, tipos: [...IA_DEMO.tipos] };
  }

  private capturaDoCaso(casoId: Id, capturaId: Id, rota: string): Captura {
    const pertence = (this.capturasPorCaso.get(String(casoId)) ?? []).some((id) => mesmoId(id, capturaId));
    const captura = pertence ? this.capturas.find((c) => mesmoId(c.id, capturaId)) : undefined;
    if (!captura) throw new ErroApi(404, rota, `Captura ${capturaId} não encontrada no caso.`);
    return captura;
  }

  private textoDaCaptura(captura: Captura, rota: string): string {
    const texto = TEXTOS_CAPTURA_DEMO[String(captura.id)];
    if (texto === undefined) throw new ErroApi(422, rota, 'Esta captura não é um documento de texto: não há o que extrair.');
    return texto;
  }

  async obterTextoCaptura(casoId: Id, capturaId: Id): Promise<TextoCaptura> {
    const rota = `/casos/${casoId}/capturas/${capturaId}/texto`;
    await this.casoAberto('captura.texto', casoId, { captura_id: capturaId });
    const captura = this.capturaDoCaso(casoId, capturaId, rota);
    const texto = this.textoDaCaptura(captura, rota);
    return { captura_id: captura.id, sha256: captura.sha256, codificacao: 'utf-8', caracteres: Array.from(texto).length, truncado: false, texto };
  }

  async extrairComIa(casoId: Id, capturaId: Id): Promise<ExtracaoIa> {
    const rota = `/casos/${casoId}/capturas/${capturaId}/extracao-ia`;
    const { me } = await this.casoAberto('ia.extrair', casoId, { captura_id: capturaId }, 'investigador');
    if (!this.iaAtiva) throw new ErroApi(409, rota, 'A extração assistida por IA está desligada neste servidor (IA_EXTRACAO_ATIVA=0).');
    const captura = this.capturaDoCaso(casoId, capturaId, rota);
    if (mesmoId(captura.id, CAPTURA_VIOLADA_DEMO)) throw new ErroApi(409, rota, 'A captura não passou na verificação de integridade; a extração foi recusada.');
    this.textoDaCaptura(captura, rota);
    const extracao = this.novaExtracao(casoId, captura.id, me.usuario, new Date().toISOString());
    return clonarExtracao(extracao, this.sugestoesIa(casoId).filter((s) => mesmoId(s.extracao_id, extracao.id)));
  }

  async listarExtracoesIa(casoId: Id): Promise<ExtracaoIa[]> {
    await this.consulta('ia.listar_extracoes', casoId);
    this.caso(casoId);
    return (this.extracoesPorCaso.get(String(casoId)) ?? []).map((e) => clonarExtracao(e, []));
  }

  async listarSugestoesIa(casoId: Id, filtro: FiltroSugestoesIa = {}): Promise<SugestaoIa[]> {
    await this.consulta('ia.listar_sugestoes', casoId, { situacao: filtro.situacao ?? null, captura_id: filtro.captura_id ?? null });
    this.caso(casoId);
    return this.sugestoesIa(casoId)
      .filter((s) => (!filtro.situacao || s.situacao === filtro.situacao) && (filtro.captura_id === undefined || mesmoId(s.captura_id, filtro.captura_id)))
      .map((s) => ({ ...s, campos: { ...s.campos } }));
  }

  /**
   * Só a aceitação pode criar (ou completar) uma entidade: empresa ou órgão
   * com CNPJ no campo `cnpj` se une à entidade do caso com o mesmo CNPJ; pessoa
   * vira entidade própria, restrita ao documento; valor, data e objeto ficam
   * aceitos como campo confirmado, sem entidade. A decisão é única.
   */
  async decidirSugestaoIa(casoId: Id, sugestaoId: Id, corpo: DecisaoSugestaoIa): Promise<SugestaoIa> {
    const rota = `/casos/${casoId}/sugestoes-ia/${sugestaoId}/decisao`;
    const justificativa = (corpo.justificativa ?? '').trim();
    if (corpo.decisao !== 'aceita' && corpo.decisao !== 'recusada') throw new ErroApi(422, rota, 'decisao: use "aceita" ou "recusada"');
    if (!/[\p{L}\p{N}]/u.test(justificativa)) throw new ErroApi(422, rota, 'justificativa: a justificativa da decisão é obrigatória');
    // Como no back-end, só a decisão registrada entra na auditoria como `ia.sugestao_decidir`.
    const me = this.autenticar();
    const justificativaAcesso = this.exigirJustificativa(rota);
    await this.esperar();
    const caso = this.caso(casoId);
    this.exigirPapel(me, casoId, justificativaAcesso, 'investigador', 'ia.sugestao_decidir');
    if (this.vencido(caso)) {
      this.registrar(me.usuario, 'caso.retencao_recusa', casoId, justificativaAcesso, { acao_recusada: 'ia.sugestao_decidir', retencao_ate: caso.retencao_ate });
      throw new ErroApi(403, rota, `O prazo de retenção deste caso terminou em ${caso.retencao_ate}: o caso está só para leitura.`);
    }
    const sugestao = this.sugestoesIa(casoId).find((s) => mesmoId(s.id, sugestaoId));
    if (!sugestao) throw new ErroApi(404, rota, `Sugestão ${sugestaoId} não encontrada no caso.`);
    if (sugestao.situacao !== 'pendente') throw new ErroApi(409, rota, `Esta sugestão já foi decidida (${sugestao.situacao}).`);
    let entidadeId: Id | null = null;
    if (corpo.decisao === 'aceita') {
      const cnpj = limparCnpj(sugestao.campos.cnpj ?? '');
      const fonte = { captura_id: sugestao.captura_id, fonte: 'extracao_ia' };
      const origem = { origem: 'extracao_ia', sugestao_ia_id: String(sugestao.id) };
      const entidades = this.entidades(casoId);
      if ((sugestao.tipo === 'empresa' || sugestao.tipo === 'orgao') && temFormaDeCnpj(cnpj)) {
        const basico = (e: EntidadeDetalhe) => (sugestao.tipo === 'empresa' ? limparCnpj(e.identificador).slice(0, 8) === cnpj.slice(0, 8) : limparCnpj(e.identificador) === cnpj);
        const existente = entidades.find((e) => e.tipo === sugestao.tipo && basico(e));
        if (existente) {
          existente.fontes = [...existente.fontes, fonte];
          entidadeId = existente.id;
        } else {
          entidadeId = `${sugestao.tipo === 'empresa' ? 'emp' : 'org'}-${this.proximoId++}`;
          this.entidadesPorCaso.set(String(casoId), [
            ...entidades,
            { id: entidadeId, tipo: sugestao.tipo, rotulo: sugestao.valor, identificador: sugestao.campos.cnpj, atributos: { cnpj, razao_social: sugestao.valor, ...origem }, fontes: [fonte], sugestoes: [] },
          ]);
        }
      } else if (sugestao.tipo === 'pessoa') {
        entidadeId = `pes-${this.proximoId++}`;
        this.entidadesPorCaso.set(String(casoId), [
          ...entidades,
          { id: entidadeId, tipo: 'pessoa', rotulo: sugestao.valor, identificador: `extraida:${String(sugestao.captura_id)}:${sugestao.valor}`, atributos: { ...sugestao.campos, ...origem }, fontes: [fonte], sugestoes: [] },
        ]);
      }
    }
    sugestao.situacao = corpo.decisao;
    sugestao.decidido_por = me.usuario;
    sugestao.decidido_em = new Date().toISOString();
    sugestao.justificativa_decisao = justificativa;
    sugestao.entidade_id = entidadeId;
    this.registrar(me.usuario, 'ia.sugestao_decidir', casoId, justificativaAcesso, {
      sugestao_id: sugestao.id,
      extracao_id: sugestao.extracao_id,
      captura_id: sugestao.captura_id,
      tipo: sugestao.tipo,
      valor: sugestao.valor,
      decisao: corpo.decisao,
      justificativa_decisao: justificativa,
      entidade_id: entidadeId,
      modelo: sugestao.modelo,
    });
    return { ...sugestao, campos: { ...sugestao.campos } };
  }
}

function clonarTarefa(t: Tarefa): Tarefa {
  return { ...t, historico: t.historico.map((h) => ({ ...h, alteracoes: Object.fromEntries(Object.entries(h.alteracoes).map(([campo, m]) => [campo, { ...m }])) })) };
}

function clonarExtracao(e: ExtracaoIa, sugestoes: SugestaoIa[]): ExtracaoIa {
  return { ...e, parametros: { ...e.parametros }, recusas: e.recusas.map((r) => ({ ...r })), sugestoes: sugestoes.map((s) => ({ ...s, campos: { ...s.campos } })) };
}

/** Valor que uma planilha executaria como fórmula ganha um apóstrofo na frente (injeção de CSV). */
function neutralizarFormula(valor: string): string {
  return /^[=+\-@\t\r\n]/.test(valor) ? `'${valor}` : valor;
}

/** CSV no formato da RFC 4180: vírgula, aspas dobradas, CRLF e cabeçalho. */
function paraCsv(campos: string[], linhas: string[][]): string {
  const celula = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [campos, ...linhas.map((l) => l.map(neutralizarFormula))].map((l) => l.map(celula).join(',')).join('\r\n') + '\r\n';
}

function xml(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clonarMonitoramento(m: Monitoramento): Monitoramento {
  return {
    ...m,
    coletas_de_origem: m.coletas_de_origem.map((c) => ({ ...c })),
    ultima_execucao: m.ultima_execucao ? { ...m.ultima_execucao, coletas: m.ultima_execucao.coletas.map((c) => ({ ...c })) } : null,
  };
}

function clonarAviso(a: Aviso): Aviso {
  return { ...a, detalhes: { ...a.detalhes }, captura_ids: [...a.captura_ids] };
}

/** Próxima execução: agora mais a periodicidade, em ISO 8601 (UTC). */
function daquiA(horas: number): string {
  return new Date(Date.now() + horas * 3_600_000).toISOString();
}

function clonarAlerta(a: Alerta): Alerta {
  return {
    ...a,
    entidades: [...a.entidades],
    evidencias: a.evidencias.map((e) => ({ ...e })),
    parametros: structuredClone(a.parametros),
    decisao: a.decisao ? { ...a.decisao } : null,
    decisoes: (a.decisoes ?? []).map((d) => ({ ...d })),
  };
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function soDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}
