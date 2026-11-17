/**
 * Tipos do contrato da API v0 (docs/mvp-escopo.md, seção 5, da monografia),
 * com o que os horizontes 1 (H12 a H17 e H31), 2 (H18, H19, H32 a H36 e H39)
 * e 3 (H22, H23, H37 e H38) do backlog acrescentaram: a referência atual é a
 * tabela de rotas do README do back-end.
 *
 * Onde o contrato não fixa o nome de um campo, a suposição adotada está
 * anotada em comentário com a marca "SUPOSIÇÃO".
 */

/** Identificadores podem vir como string ou número do back-end. */
export type Id = string | number;

export interface Saude {
  status: string;
}

export interface Me {
  usuario: string;
  /** Perfis do back-end: analista, delegado e admin (RNF08). Mantido aberto. */
  perfil: string;
  /**
   * Como o usuário entrou (H23): `sessao` (usuário e senha, com segundo fator)
   * ou `token_dev` (token fixo, só com o back-end em MODO_DEV=1). Ausente em
   * `GET /me`; a tela de entrada preenche.
   */
  autenticacao?: TipoAutenticacao;
}

export interface NovoCaso {
  titulo: string;
  descricao: string;
  numero_procedimento: string;
  /** RNF04 (H17): para que o caso existe. Obrigatória. */
  finalidade: string;
  /** RNF04 (H17): data (AAAA-MM-DD) até a qual o caso aceita coletas e consultas. Obrigatória. */
  retencao_ate: string;
}

export interface Caso {
  id: Id;
  titulo: string;
  descricao: string;
  numero_procedimento: string;
  criado_por: string;
  criado_em: string;
  /** Vazia em casos criados antes da H17. */
  finalidade?: string;
  /** `null` em casos criados antes da H17 (sem prazo). */
  retencao_ate?: string | null;
  /** Verdadeiro depois do prazo de retenção: o back-end recusa novas coletas e consultas. */
  somente_leitura?: boolean;
  /** H23: papel de quem consulta neste caso. `GET /casos` só lista casos de que o usuário é membro. */
  meu_papel?: PapelCaso | null;
}

/** SUPOSIÇÃO: `GET /casos/{id}` devolve o caso com um objeto `contagens`. */
export interface CasoDetalhe extends Caso {
  contagens?: {
    entidades: number;
    alertas: number;
    capturas: number;
    coletas?: number;
    sugestoes?: number;
    /** H18: monitoramentos ativos e avisos de novidade ainda não lidos. */
    monitoramentos?: number;
    avisos_nao_lidos?: number;
    /** Horizonte 3: equipe (H23 e H37) e sugestões da IA ainda sem decisão (H22). */
    membros?: number;
    anotacoes?: number;
    tarefas_abertas?: number;
    sugestoes_ia_pendentes?: number;
  };
}

/** Fontes de coleta. As quatro últimas vieram com o horizonte 2 (H19). */
export type FonteColeta = 'cnpj_arquivo' | 'pncp' | 'portal_transparencia' | 'pncp_termos' | 'tse_arquivo' | 'edital_arquivo';

export interface ParametrosCnpjArquivo {
  diretorio: string;
}

export interface ParametrosPncp {
  /** Formato AAAAMMDD. */
  dataInicial: string;
  /** Formato AAAAMMDD. */
  dataFinal: string;
  cnpjOrgao?: string;
  max_paginas: number;
}

/** `cepim`, `ceaf` e `convenios` vieram com as tipologias de lavagem (L10 e L16). */
export type RecursoPortalTransparencia = 'ceis' | 'cnep' | 'servidores' | 'cepim' | 'ceaf' | 'convenios';

/**
 * Portal da Transparência (H19). CEIS e CNEP: `codigoSancionado` (CNPJ ou
 * lista de até 100) ou `do_caso: true` (as contratadas do caso). Servidores:
 * código SIAPE do órgão (lotação ou exercício) e `cnpjOrgao`, o órgão
 * contratante do caso a que o código corresponde, declarado pelo investigador.
 *
 * CEPIM e convênios: `codigoSancionado` (CNPJ da entidade ou do convenente) ou
 * `do_caso: true`. CEAF (expulsões da administração federal): `nomeSancionado`
 * (lista de nomes completos) ou `do_caso: true` (os nomes dos sócios pessoa
 * física das contratadas e convenentes). O CEAF nunca é consultado por CPF.
 */
export interface ParametrosPortalTransparencia {
  recurso: RecursoPortalTransparencia;
  codigoSancionado?: string[];
  /** Só no CEAF: nomes completos. Nunca CPF. */
  nomeSancionado?: string[];
  do_caso?: boolean;
  orgaoServidorLotacao?: string;
  orgaoServidorExercicio?: string;
  cnpjOrgao?: string;
  max_paginas?: number;
}

export interface ContratoPncp {
  cnpj: string;
  ano: number;
  sequencial: number;
  numero_controle_pncp?: string;
}

/** Termos de contrato do PNCP: lista explícita ou `do_caso: true` (todos os contratos do caso). */
export interface ParametrosPncpTermos {
  contratos?: ContratoPncp[];
  do_caso?: boolean;
}

/**
 * TSE (arquivos). `uf`, `municipio` e `candidatos` (lista de `SQ_CANDIDATO`) restringem as
 * linhas lidas; `do_caso: true` é trocado pelo servidor pela lista dos candidatos do caso.
 * Arquivo acima do teto de leitura integral só é lido (em fluxo) com ao menos um desses filtros,
 * e a captura guarda o recorte (`metadados.recorte`).
 */
export interface ParametrosTseArquivo {
  diretorio: string;
  uf?: string;
  municipio?: string;
  ano?: string;
  candidatos?: string[];
  do_caso?: boolean;
}

export interface ParametrosEditalArquivo {
  diretorio: string;
  numero_controle_pncp_compra?: string;
  cnpjOrgao?: string;
}

export type ColetaRequisicao =
  | { fonte: 'cnpj_arquivo'; parametros: ParametrosCnpjArquivo }
  | { fonte: 'pncp'; parametros: ParametrosPncp }
  | { fonte: 'portal_transparencia'; parametros: ParametrosPortalTransparencia }
  | { fonte: 'pncp_termos'; parametros: ParametrosPncpTermos }
  | { fonte: 'tse_arquivo'; parametros: ParametrosTseArquivo }
  | { fonte: 'edital_arquivo'; parametros: ParametrosEditalArquivo };

/**
 * `nao_configurado` (H19): a fonte não tem configuração no servidor (por
 * exemplo, falta a chave de API). Não é falha: a resposta é 200, sem capturas,
 * com o motivo em `motivo` e em `avisos`.
 */
export type SituacaoColeta = 'sucesso' | 'falha' | 'em_andamento' | 'nao_configurado';

/** Resposta de `POST /casos/{id}/coletas` (os campos da H14 e da H15 são opcionais por tolerância). */
export interface ColetaResultado {
  captura_ids: Id[];
  entidades_novas: number;
  avisos?: string[];
  coleta_id?: Id;
  situacao?: SituacaoColeta;
  /** Maior número de tentativas que uma operação da coleta precisou (0 = nada foi tentado). */
  tentativas?: number;
  motivo?: string;
  conector_nome?: string;
  conector_versao?: string;
  recoleta_de?: Id | null;
}

/** Uma coleta do histórico do caso (`GET /casos/{id}/coletas`), bem-sucedida ou não (RNF12, H15). */
export interface ColetaRegistro {
  id: Id;
  fonte: string;
  parametros: Record<string, unknown>;
  conector_nome: string;
  conector_versao: string;
  situacao: SituacaoColeta;
  tentativas: number;
  motivo: string;
  registros: number;
  avisos: string[];
  usuario: string;
  iniciado_em: string;
  concluido_em: string | null;
  recoleta_de: Id | null;
  captura_ids: Id[];
}

export interface Conector {
  nome: string;
  versao: string;
}

export interface CampoAlterado {
  campo: string;
  antes: string | null;
  depois: string | null;
}

export interface DiferencaRegistro {
  registro: string | null;
  tipo: 'alterado' | 'adicionado' | 'removido';
  campos: CampoAlterado[];
}

/** Comparação de uma captura com a anterior da mesma origem (RF07, H14). */
export interface ComparacaoCaptura {
  captura_id: Id;
  anterior_id: Id;
  fonte: string;
  url_ou_arquivo: string;
  coletado_em: string;
  anterior_coletado_em: string;
  sha256: string;
  anterior_sha256: string;
  mesmo_hash: boolean;
  tamanho_bytes: number;
  anterior_tamanho_bytes: number;
  conector: Conector;
  anterior_conector: Conector;
  mesma_versao_conector: boolean;
  registros_comparados: boolean;
  registros: { adicionados: number; removidos: number; alterados: number; iguais: number | null };
  campos_alterados: string[];
  diferencas: DiferencaRegistro[];
  diferencas_omitidas: number;
  observacao: string | null;
}

export interface ComparacaoColeta {
  coleta_id: Id;
  anterior_id: Id;
  fonte: string;
  conector: Conector;
  anterior_conector: Conector;
  mesmo_conteudo: boolean;
  capturas_iguais: number;
  capturas_diferentes: number;
  capturas: ComparacaoCaptura[];
  capturas_sem_anterior: Id[];
  capturas_anteriores_sem_correspondente: Id[];
}

/** Resposta de `POST /casos/{id}/coletas/{coleta_id}/recoletar`. */
export interface RecoletaResultado extends ColetaResultado {
  comparacao: ComparacaoColeta;
}

export type TipoEntidade = 'empresa' | 'pessoa' | 'orgao' | 'contrato' | 'sancao' | 'candidato' | 'edital' | 'convenio';

export interface EntidadeResumo {
  id: Id;
  tipo: TipoEntidade;
  rotulo: string;
  identificador: string;
  atributos: Record<string, unknown>;
}

/** SUPOSIÇÃO: cada fonte traz ao menos `captura_id`; os demais campos são opcionais. */
export interface FonteEntidade {
  captura_id: Id;
  fonte?: string;
  url_ou_arquivo?: string;
  coletado_em?: string;
}

/**
 * Sugestão de resolução de homônimos (RF02). Nunca representa uma fusão:
 * é apenas uma indicação para o analista.
 * SUPOSIÇÃO: campos `entidade_id`, `rotulo`, `identificador`, `motivo`, `confianca`.
 */
export interface SugestaoResolucao {
  entidade_id: Id;
  rotulo: string;
  identificador?: string;
  motivo: string;
  confianca?: number;
}

export interface EntidadeDetalhe extends EntidadeResumo {
  fontes: FonteEntidade[];
  sugestoes: SugestaoResolucao[];
}

export interface NoGrafo {
  id: Id;
  tipo: TipoEntidade;
  rotulo: string;
}

export type TipoAresta =
  | 'socio_de'
  | 'contratado_por'
  | 'mesmo_endereco'
  | 'fornecedor_de'
  | 'contratante_de'
  // Horizonte 2: empresa → sanção, pessoa → órgão, doador → candidato, órgão → edital.
  | 'sancionada_em'
  | 'servidor_de'
  | 'doou_para'
  | 'edital_de'
  // Tipologias de lavagem (L16): empresa → convênio e órgão → convênio.
  | 'convenente_de'
  | 'concedente_de';

export interface ArestaGrafo {
  origem: Id;
  destino: Id;
  tipo: TipoAresta;
  atributos: Record<string, unknown>;
  captura_id: Id;
}

export interface Grafo {
  nos: NoGrafo[];
  arestas: ArestaGrafo[];
}

/** T: contratações (possível infração antecedente). */
export type TipologiaContratacao = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10';
/** L: lavagem e ocultação. Não existem L2, L9, L11, L12 e L13. */
export type TipologiaLavagem = 'L1' | 'L3' | 'L4' | 'L5' | 'L6' | 'L7' | 'L8' | 'L10' | 'L14' | 'L15' | 'L16';
/** COMB: combinação de alertas na mesma entidade. */
export type Tipologia = TipologiaContratacao | TipologiaLavagem | 'COMB';

export const TIPOLOGIAS_CONTRATACAO: readonly TipologiaContratacao[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'];
export const TIPOLOGIAS_LAVAGEM: readonly TipologiaLavagem[] = ['L1', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L10', 'L14', 'L15', 'L16'];

/** Na ordem do catálogo e da execução do back-end: T1 a T10, as L e, por fim, a combinação. */
export const TIPOLOGIAS: readonly Tipologia[] = [...TIPOLOGIAS_CONTRATACAO, ...TIPOLOGIAS_LAVAGEM, 'COMB'];

export type GrupoTipologia = 'contratacao' | 'lavagem' | 'combinacao';

export const GRUPOS_TIPOLOGIA: readonly GrupoTipologia[] = ['contratacao', 'lavagem', 'combinacao'];

export const ROTULOS_GRUPO_TIPOLOGIA: Record<GrupoTipologia, string> = {
  contratacao: 'Contratações',
  lavagem: 'Lavagem e ocultação',
  combinacao: 'Combinação',
};

/**
 * Grupo de uma tipologia: o que o back-end mandar ou, em respostas antigas (sem
 * o campo), o que o código diz (T, L ou COMB).
 */
export function grupoDaTipologia(codigo: string, grupoDoServidor?: string | null): GrupoTipologia {
  if (grupoDoServidor === 'contratacao' || grupoDoServidor === 'lavagem' || grupoDoServidor === 'combinacao') return grupoDoServidor;
  if (codigo === 'COMB') return 'combinacao';
  return codigo.startsWith('L') ? 'lavagem' : 'contratacao';
}

/** Limiares que podem ser sobrescritos numa execução (`POST .../alertas/executar`). */
export interface ParametrosTipologias {
  t1_dias_minimos?: number;
  t2_minimo_empresas?: number;
  t3_razao_minima?: number;
  /** Inteiro de 2 a 1000. */
  t5_minimo_contratacoes?: number;
  /** Percentual maior que 0, até 1000. */
  t8_percentual_limite?: number;
  /** Percentual maior que 0, até 1000. */
  t8_percentual_limite_reforma?: number;
  // Tipologias de lavagem e combinação: todos opcionais e numéricos.
  /** Inteiro ≥ 2. */
  l1_minimo_estabelecimentos?: number;
  /** Inteiro ≥ 1. */
  l1_janela_abertura_dias?: number;
  /** Inteiro ≥ 2. */
  l1_minimo_abertas_na_janela?: number;
  /** Inteiro ≥ 2. */
  l3_minimo_empresas?: number;
  /** Inteiro ≥ 1. */
  l3_minimo_abertas_na_janela?: number;
  /** Inteiro ≥ 1. */
  l3_janela_meses?: number;
  /** Inteiro ≥ 2. */
  l4_minimo_niveis?: number;
  /** Inteiro ≥ 0. */
  l7_dias_apos_abertura?: number;
  /** Inteiro ≥ 1. */
  l7_meses_antes_contrato?: number;
  /** Número ≥ 0 (reais). */
  l14_valor_minimo?: number;
  /** Inteiro ≥ 2. */
  l15_minimo_cnaes?: number;
  /** Inteiro ≥ 2. */
  l15_minimo_categorias?: number;
  /** Inteiro ≥ 0. */
  l16_dias_minimos?: number;
  /** Inteiro ≥ 2. */
  comb_minimo_tipologias?: number;
  /** Número maior que 0. */
  comb_peso_minimo?: number;
}

/** Corpo de `POST /casos/{id}/alertas/executar`. Sem `tipologias`, roda todas. */
export interface ExecucaoAlertas {
  parametros?: ParametrosTipologias;
  tipologias?: Tipologia[];
}

/** Parâmetro de uma tipologia no catálogo (`GET /tipologias`), com o valor em vigor. */
export interface ParametroTipologia {
  nome: string;
  valor: unknown;
  descricao: string;
  /** Verdadeiro: pode ser sobrescrito em `POST /casos/{id}/alertas/executar`. */
  por_execucao: boolean;
}

/** Entrada do catálogo de tipologias: regra, base, política de erro e configuração em vigor. */
export interface TipologiaCatalogo {
  codigo: string;
  nome: string;
  historia: string;
  severidade: string;
  prefere_evitar: string;
  politica_erro: string;
  regra: string;
  base: string;
  fontes: string[];
  parametros: ParametroTipologia[];
  /** Ausente em respostas antigas: a interface deduz do código (`grupoDaTipologia`). */
  grupo?: GrupoTipologia;
  /** Verdadeiro: o alerta é só insumo da combinação; sozinho não indica nada. */
  sinal_fraco?: boolean;
  /** Quanto um alerta desta tipologia pesa no alerta de combinação (0 = não conta). */
  peso?: number;
}

/** Limite de receita de um regime ou porte (`l6_limites`), com a fonte. */
export interface LimiteReceita {
  anual: number;
  /** Só no MEI: limite por mês no ano de início da atividade. */
  mensal_inicio?: number;
  fonte?: string;
}

/**
 * `l6_limites`: limite do MEI por ano-calendário e limites da ME e da EPP.
 * `mei_ate` e `mei_a_partir` dizem que ano vale antes do primeiro e depois do último da tabela.
 */
export interface LimitesL6 {
  mei?: Record<string, LimiteReceita>;
  me?: LimiteReceita;
  epp?: LimiteReceita;
  mei_ate?: string;
  mei_a_partir?: string;
}

/** Uma linha de `t5_limites_dispensa`: limites do art. 75, I e II, num exercício, com a fonte. */
export interface LimiteDispensa {
  inciso_i: number;
  inciso_ii: number;
  fonte?: string;
}

/** Ocorrência textual de uma expressão no edital (T10), como vem em `parametros.ocorrencias`. */
export interface OcorrenciaClausula {
  linha: number;
  coluna: number;
  posicao: number;
  trecho: string;
  contexto?: string;
}

export type SituacaoAlerta = 'pendente' | 'confirmado' | 'descartado';
export type DecisaoAlertaValor = 'confirmado' | 'descartado';

/** Uma decisão do investigador sobre um alerta (RF12, H12). */
export interface DecisaoAlerta {
  decisao: DecisaoAlertaValor;
  justificativa: string;
  usuario: string;
  perfil: string;
  decidido_em: string;
}

/** Corpo de `POST /casos/{id}/alertas/{alerta_id}/decisao`. A justificativa é obrigatória. */
export interface NovaDecisao {
  decisao: DecisaoAlertaValor;
  justificativa: string;
}

export interface Evidencia {
  descricao: string;
  fonte: string;
  captura_id: Id;
  url_ou_arquivo: string;
  sha256: string;
}

export interface Alerta {
  id: Id;
  tipologia: Tipologia;
  titulo: string;
  motivo: string;
  severidade: string;
  entidades: Id[];
  evidencias: Evidencia[];
  parametros: Record<string, unknown>;
  /** RF14 (H13): nome e política de erro da tipologia, da tabela única do back-end. */
  tipologia_nome?: string;
  prefere_evitar?: 'falso_negativo' | 'falso_positivo' | '';
  politica_erro?: string;
  /** RF12 (H12): situação, decisão em vigor e histórico completo. Ausente = pendente. */
  situacao?: SituacaoAlerta;
  decisao?: DecisaoAlerta | null;
  decisoes?: DecisaoAlerta[];
  /** Falso: a última execução da tipologia não detectou mais o alerta (mantido pela decisão). */
  ativo?: boolean;
  /** Tipologias de lavagem e combinação: ausentes em respostas antigas. */
  grupo?: GrupoTipologia;
  /** Verdadeiro: sinal fraco, que só pesa no alerta de combinação. */
  sinal_fraco?: boolean;
  peso?: number;
}

/** Um alerta que entra (ou não) num alerta de combinação (`parametros.componentes` do COMB). */
export interface ComponenteCombinacao {
  alerta_id: Id;
  tipologia: string;
  tipologia_nome?: string;
  titulo: string;
  severidade?: string;
  situacao?: SituacaoAlerta | string;
  peso: number;
  sinal_fraco?: boolean;
  /** Falso: o alerta aparece na lista, mas não soma (a `observacao` diz por quê). */
  conta: boolean;
  observacao?: string;
}

/** `parametros` de um alerta `COMB`. Não é escore de culpa: é pista para priorizar a análise (RF12). */
export interface ParametrosCombinacao {
  entidade_id?: Id;
  entidade_rotulo?: string;
  entidade_tipo?: string;
  tipologias_distintas?: number;
  soma_pesos?: number;
  comb_minimo_tipologias?: number;
  comb_peso_minimo?: number;
  componentes?: ComponenteCombinacao[];
  aviso?: string;
}

export interface Captura {
  id: Id;
  fonte: string;
  url_ou_arquivo: string;
  coletado_em: string;
  sha256: string;
  metadados: Record<string, unknown>;
  tamanho_bytes: number;
  /** RF07 (H14): conector que produziu a captura. Vazio em capturas antigas. */
  conector_nome?: string;
  conector_versao?: string;
  coleta_id?: Id | null;
}

export interface VerificacaoCaptura {
  integra: boolean;
  sha256_registrado: string;
  sha256_recalculado: string;
}

export interface EntradaAuditoria {
  seq: number;
  quando: string;
  usuario: string;
  acao: string;
  caso_id: Id | null;
  justificativa: string;
  detalhes: Record<string, unknown> | string | null;
  hash_anterior: string | null;
  hash: string;
}

export interface VerificacaoAuditoria {
  integra: boolean;
  entradas: number;
  primeira_quebra: number | null;
}

export type FormatoRelatorio = 'json' | 'md';

// ---- Monitoramento contínuo e avisos de novidade (RF06, H18) ----------------

/** Uma recoleta feita por uma execução do monitoramento. */
export interface RecoletaMonitorada {
  coleta_id: Id | null;
  recoleta_de: Id;
  fonte: string;
  situacao: string;
  mesmo_conteudo?: boolean | null;
  motivo?: string;
}

export type SituacaoExecucaoMonitoramento = 'em_andamento' | 'sucesso' | 'parcial' | 'falha' | 'sem_coletas' | 'recusada_retencao';

export interface ExecucaoMonitoramento {
  id: Id;
  monitoramento_id: Id;
  /** `manual` ou `agendador`. */
  origem: string;
  usuario: string;
  iniciado_em: string;
  concluido_em: string | null;
  situacao: SituacaoExecucaoMonitoramento | string;
  coletas: RecoletaMonitorada[];
  avisos_gerados: number;
  motivo: string;
}

export interface ColetaDeOrigem {
  coleta_id: Id;
  fonte: string;
  iniciado_em: string;
}

/** Entidade do caso marcada para acompanhamento (um monitoramento por entidade). */
export interface Monitoramento {
  id: Id;
  caso_id: Id;
  entidade_id: Id;
  entidade_rotulo: string | null;
  entidade_tipo: string | null;
  entidade_identificador: string | null;
  periodicidade_horas: number;
  ativo: boolean;
  motivo_inativo: string;
  /** Justificativa de quem marcou a entidade; acompanha as execuções automáticas na auditoria. */
  justificativa: string;
  criado_por: string;
  criado_em: string;
  proxima_execucao_em: string;
  ultima_execucao_em: string | null;
  /** Coletas que serão refeitas a cada execução. */
  coletas_de_origem: ColetaDeOrigem[];
  ultima_execucao: ExecucaoMonitoramento | null;
}

/** Corpo de `POST /casos/{id}/monitoramentos`. Periodicidade de 1 a 8760 horas (padrão 24). */
export interface NovoMonitoramento {
  entidade_id: Id;
  periodicidade_horas: number;
}

/** Corpo de `POST /casos/{id}/monitoramentos/{mid}/situacao`. */
export interface SituacaoMonitoramento {
  ativo: boolean;
  periodicidade_horas?: number;
}

export type TipoAviso = 'quadro_societario' | 'contrato_novo' | 'sancao_nova' | 'termo_novo';

/** Novidade detectada sobre uma entidade monitorada. */
export interface Aviso {
  id: Id;
  caso_id: Id;
  monitoramento_id: Id;
  execucao_id: Id;
  entidade_id: Id;
  entidade_rotulo: string | null;
  tipo: TipoAviso;
  titulo: string;
  descricao: string;
  detalhes: Record<string, unknown>;
  captura_ids: Id[];
  criado_em: string;
  lido_em: string | null;
  lido_por: string | null;
}

/** Resposta de `POST /casos/{id}/monitoramentos/{mid}/executar`. */
export interface ExecucaoMonitoramentoResultado extends ExecucaoMonitoramento {
  avisos: Aviso[];
}

// ---- Horizonte 3: autenticação (RNF01, H23) ---------------------------------

export type TipoAutenticacao = 'sessao' | 'token_dev';

/** `mfa`: falta o código; `cadastro_mfa`: falta cadastrar o segundo fator; `ativa`: pode usar a API. */
export type EtapaLogin = 'mfa' | 'cadastro_mfa' | 'ativa';

/**
 * Resposta de `POST /auth/login` e de `POST /auth/mfa`. Nas etapas pendentes o
 * `token` só serve para `POST /auth/mfa`; o da etapa `ativa` é o que vale.
 */
export interface SessaoLogin {
  etapa: EtapaLogin;
  token: string;
  expira_em: string;
  usuario: string;
  perfil: string;
  /** Só em `cadastro_mfa`: o segredo TOTP (Base32) e a URI `otpauth://` para o aplicativo autenticador. */
  segredo?: string | null;
  otpauth_uri?: string | null;
}

/** `GET /auth/sessao`. */
export interface SessaoAtual {
  usuario: string;
  perfil: string;
  autenticacao: TipoAutenticacao;
  mfa_ativo: boolean;
  expira_em: string | null;
  inatividade_minutos: number | null;
}

export interface TrocaSenha {
  senha_atual: string;
  senha_nova: string;
}

export type PerfilUsuario = 'analista' | 'delegado' | 'admin';

export const PERFIS_USUARIO: readonly PerfilUsuario[] = ['analista', 'delegado', 'admin'];

/** Conta de usuário, como o perfil admin a vê (`GET /usuarios`). */
export interface UsuarioAdmin {
  usuario: string;
  nome: string;
  perfil: string;
  ativo: boolean;
  mfa_ativo: boolean;
  mfa_obrigatorio: boolean;
  bloqueado_ate: string | null;
  criado_por: string;
  criado_em: string;
}

/** Corpo de `POST /usuarios`. O segundo fator é cadastrado pelo próprio usuário no primeiro login. */
export interface NovoUsuario {
  usuario: string;
  nome: string;
  perfil: PerfilUsuario;
  senha: string;
}

/** Corpo de `POST /usuarios/{usuario}`: só o que for enviado muda. */
export interface AlteracaoUsuario {
  ativo?: boolean;
  perfil?: PerfilUsuario;
  senha?: string;
  redefinir_mfa?: boolean;
}

// ---- Horizonte 3: equipe do caso, anotações e tarefas (H23 e H37) -----------

/** Do menor para o maior: quem tem um papel pode o que os anteriores podem. */
export type PapelCaso = 'leitor' | 'investigador' | 'responsavel';

export const PAPEIS_CASO: readonly PapelCaso[] = ['leitor', 'investigador', 'responsavel'];

export interface Membro {
  usuario: string;
  papel: PapelCaso | string;
  adicionado_por: string;
  adicionado_em: string;
}

/** Corpo de `POST /casos/{id}/membros`: acrescenta o membro ou muda o papel de quem já é. */
export interface DefinicaoMembro {
  usuario: string;
  papel: PapelCaso;
}

export type AlvoAnotacao = 'entidade' | 'alerta';

/** Anotação sobre uma entidade ou um alerta. Só de acréscimo: não se edita nem se apaga. */
export interface Anotacao {
  id: Id;
  alvo_tipo: AlvoAnotacao | string;
  alvo_id: string;
  alvo_rotulo?: string | null;
  autor: string;
  criado_em: string;
  texto: string;
}

export interface NovaAnotacao {
  alvo_tipo: AlvoAnotacao;
  alvo_id: string;
  texto: string;
}

export interface FiltroAnotacoes {
  alvo_tipo?: AlvoAnotacao;
  alvo_id?: Id;
}

export type SituacaoTarefa = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';

export const SITUACOES_TAREFA: readonly SituacaoTarefa[] = ['aberta', 'em_andamento', 'concluida', 'cancelada'];

/** Uma linha do histórico da tarefa: quem mudou, quando e cada campo com o valor anterior e o novo. */
export interface EventoTarefa {
  usuario: string;
  quando: string;
  alteracoes: Record<string, { de?: unknown; para?: unknown }>;
}

export interface Tarefa {
  id: Id;
  titulo: string;
  descricao: string;
  responsavel: string | null;
  situacao: SituacaoTarefa | string;
  /** AAAA-MM-DD. */
  prazo: string | null;
  /** Prazo vencido com a tarefa ainda aberta ou em andamento. */
  atrasada: boolean;
  criado_por: string;
  criado_em: string;
  atualizado_em: string;
  historico: EventoTarefa[];
}

/** Corpo de `POST /casos/{id}/tarefas`. O responsável precisa ser membro do caso. */
export interface NovaTarefa {
  titulo: string;
  descricao?: string;
  responsavel?: string | null;
  prazo?: string | null;
}

/** Corpo de `POST /casos/{id}/tarefas/{tid}`: só os campos enviados mudam; `null` limpa responsável e prazo. */
export interface AlteracaoTarefa {
  titulo?: string;
  descricao?: string;
  responsavel?: string | null;
  situacao?: SituacaoTarefa;
  prazo?: string | null;
}

// ---- Horizonte 3: exportação do grafo (RNF09, H38) --------------------------

export type FormatoExportacao = 'zip' | 'graphml' | 'csv_entidades' | 'csv_vinculos';

/** Arquivo de `GET /casos/{id}/exportacao`, já lido como bytes. */
export interface ArquivoExportado {
  nome: string;
  tipo: string;
  /** SHA-256 informado pelo servidor no cabeçalho `X-Conteudo-SHA256` (`null` se o cabeçalho não veio). */
  sha256: string | null;
  conteudo: Blob;
}

// ---- Horizonte 3: extração assistida por IA local (RF13, RNF05, H22) --------

/** `GET /ia`: se a extração está ligada no servidor e com qual provedor e modelo (sempre local). */
export interface IaEstado {
  ativa: boolean;
  provedor: string | null;
  modelo: string | null;
  local: boolean;
  tipos: string[];
}

/** `GET /casos/{id}/capturas/{captura_id}/texto`: o texto do documento capturado. */
export interface TextoCaptura {
  captura_id: Id;
  sha256: string;
  codificacao: string;
  caracteres: number;
  truncado: boolean;
  /**
   * Origem do texto. Em PDF, `sha256` é o do arquivo original e o texto é extraído dele: as
   * posições dos trechos referem-se ao texto extraído (`texto_sha256`), não ao arquivo.
   */
  formato?: 'texto' | 'pdf';
  paginas?: number | null;
  extrator?: string;
  texto_sha256?: string;
  /** PDF: o texto extraído agora é igual ao da coleta? `null` quando não há registro. */
  confere_com_coleta?: boolean | null;
  /**
   * RNF04: o texto devolvido leva todo CPF descaracterizado (mesmo comprimento); `true` quando
   * o original guardado na custódia tinha CPF completo. `texto_sha256` é o do texto original.
   */
  cpfs_descaracterizados?: boolean;
  texto: string;
}

export type SituacaoSugestaoIa = 'pendente' | 'aceita' | 'recusada';
export type DecisaoSugestaoIaValor = 'aceita' | 'recusada';

/**
 * Sugestão da IA: um item extraído do documento, com o trecho literal que o
 * ampara. Só vira entidade se o investigador aceitar. `posicao_inicio` e
 * `posicao_fim` contam pontos de código Unicode, não unidades UTF-16.
 */
export interface SugestaoIa {
  id: Id;
  extracao_id: Id;
  captura_id: Id;
  captura_sha256: string;
  tipo: string;
  valor: string;
  campos: Record<string, string>;
  trecho: string;
  posicao_inicio: number;
  posicao_fim: number;
  confianca: number | null;
  situacao: SituacaoSugestaoIa | string;
  decidido_por: string | null;
  decidido_em: string | null;
  justificativa_decisao: string | null;
  entidade_id: Id | null;
  modelo: string;
  provedor: string;
}

/** Item que o modelo devolveu e a verificação automática recusou, com o motivo. */
export interface RecusaIa {
  motivo: string;
  tipo: string;
  valor: string;
  trecho: string;
}

/** Uma execução da extração sobre uma captura (inclusive as que falharam). */
export interface ExtracaoIa {
  id: Id;
  captura_id: Id;
  captura_sha256: string;
  provedor: string;
  modelo: string;
  modelo_versao: string;
  servidor_versao: string;
  parametros: Record<string, unknown>;
  prompt_sha256: string;
  situacao: string;
  motivo: string;
  blocos: number;
  itens_recebidos: number;
  itens_aceitos: number;
  itens_recusados: number;
  recusas: RecusaIa[];
  usuario: string;
  iniciado_em: string;
  concluido_em: string | null;
  /** Preenchida só na resposta da execução; vazia em `GET /casos/{id}/extracoes-ia`. */
  sugestoes: SugestaoIa[];
}

export interface DecisaoSugestaoIa {
  decisao: DecisaoSugestaoIaValor;
  justificativa: string;
}

export interface FiltroSugestoesIa {
  situacao?: SituacaoSugestaoIa;
  captura_id?: Id;
}

/**
 * Interface única do cliente. Implementada pelo cliente HTTP (contrato v0)
 * e pelo cliente simulado (VITE_MOCK=1).
 */
export interface ApiCliente {
  health(): Promise<Saude>;
  me(): Promise<Me>;
  listarCasos(): Promise<Caso[]>;
  criarCaso(corpo: NovoCaso): Promise<Caso>;
  obterCaso(casoId: Id): Promise<CasoDetalhe>;
  iniciarColeta(casoId: Id, corpo: ColetaRequisicao): Promise<ColetaResultado>;
  /** Histórico das coletas do caso, da mais recente para a mais antiga (inclui as que falharam). */
  listarColetas(casoId: Id): Promise<ColetaRegistro[]>;
  /** Repete a coleta e compara as capturas novas com as da coleta original. */
  recoletar(casoId: Id, coletaId: Id): Promise<RecoletaResultado>;
  buscarEntidades(casoId: Id, q: string): Promise<EntidadeResumo[]>;
  obterEntidade(casoId: Id, entidadeId: Id): Promise<EntidadeDetalhe>;
  obterGrafo(casoId: Id, centro: Id, profundidade: number): Promise<Grafo>;
  obterCaminho(casoId: Id, de: Id, para: Id): Promise<Grafo>;
  /** Roda as tipologias (todas, ou as de `corpo.tipologias`), com limiares opcionais por execução. */
  executarAlertas(casoId: Id, corpo?: ExecucaoAlertas): Promise<Alerta[]>;
  listarAlertas(casoId: Id): Promise<Alerta[]>;
  /** Confirma ou descarta o alerta, com justificativa; devolve o alerta atualizado. */
  decidirAlerta(casoId: Id, alertaId: Id, corpo: NovaDecisao): Promise<Alerta>;
  obterCaptura(capturaId: Id): Promise<Captura>;
  verificarCaptura(capturaId: Id): Promise<VerificacaoCaptura>;
  listarAuditoria(casoId?: Id): Promise<EntradaAuditoria[]>;
  verificarAuditoria(): Promise<VerificacaoAuditoria>;
  /** Devolve o corpo bruto (texto JSON ou Markdown) para download. */
  obterRelatorio(casoId: Id, formato: FormatoRelatorio): Promise<string>;
  /** Catálogo das tipologias (T1 a T10, as L e a combinação). Não é dado de caso: exige só o token. */
  listarTipologias(): Promise<TipologiaCatalogo[]>;
  listarMonitoramentos(casoId: Id): Promise<Monitoramento[]>;
  /** Marca uma entidade do caso para acompanhamento; marcar de novo reativa e atualiza a periodicidade. */
  criarMonitoramento(casoId: Id, corpo: NovoMonitoramento): Promise<Monitoramento>;
  alterarMonitoramento(casoId: Id, monitoramentoId: Id, corpo: SituacaoMonitoramento): Promise<Monitoramento>;
  /** Executa o monitoramento agora (o agendador do back-end faz o mesmo na periodicidade escolhida). */
  executarMonitoramento(casoId: Id, monitoramentoId: Id): Promise<ExecucaoMonitoramentoResultado>;
  /** Avisos de novidade, do mais recente para o mais antigo. */
  listarAvisos(casoId: Id, naoLidos?: boolean): Promise<Aviso[]>;
  marcarAvisoLido(casoId: Id, avisoId: Id): Promise<Aviso>;

  // ---- horizonte 3: autenticação (H23). As rotas /auth não levam X-Justificativa. ----
  /** Primeira etapa: usuário e senha. Não usa o token da sessão. */
  login(usuario: string, senha: string): Promise<SessaoLogin>;
  /** Segunda etapa: o código TOTP, com o token pendente devolvido pelo login. */
  confirmarMfa(tokenPendente: string, codigo: string): Promise<SessaoLogin>;
  obterSessao(): Promise<SessaoAtual>;
  /** Encerra a sessão no servidor (400 para token de desenvolvimento, que não tem sessão). */
  logout(): Promise<void>;
  trocarSenha(corpo: TrocaSenha): Promise<void>;
  /** Administração de contas: exige o perfil admin e justificativa. */
  listarUsuarios(): Promise<UsuarioAdmin[]>;
  criarUsuario(corpo: NovoUsuario): Promise<UsuarioAdmin>;
  alterarUsuario(usuario: string, corpo: AlteracaoUsuario): Promise<UsuarioAdmin>;

  // ---- horizonte 3: equipe, anotações e tarefas (H23 e H37) ----
  listarMembros(casoId: Id): Promise<Membro[]>;
  /** Acrescenta um membro ou muda o papel de quem já é membro (só o responsável); devolve a lista atualizada. */
  definirMembro(casoId: Id, corpo: DefinicaoMembro): Promise<Membro[]>;
  removerMembro(casoId: Id, usuario: string): Promise<Membro[]>;
  /** Da mais recente para a mais antiga; com o filtro, só as de uma entidade ou de um alerta. */
  listarAnotacoes(casoId: Id, filtro?: FiltroAnotacoes): Promise<Anotacao[]>;
  criarAnotacao(casoId: Id, corpo: NovaAnotacao): Promise<Anotacao>;
  listarTarefas(casoId: Id, situacao?: SituacaoTarefa): Promise<Tarefa[]>;
  criarTarefa(casoId: Id, corpo: NovaTarefa): Promise<Tarefa>;
  obterTarefa(casoId: Id, tarefaId: Id): Promise<Tarefa>;
  alterarTarefa(casoId: Id, tarefaId: Id, corpo: AlteracaoTarefa): Promise<Tarefa>;

  // ---- horizonte 3: exportação do grafo (H38) ----
  exportarGrafo(casoId: Id, formato: FormatoExportacao): Promise<ArquivoExportado>;

  // ---- horizonte 3: extração assistida por IA local (H22) ----
  /** Não é dado de caso: exige só o token. */
  estadoIa(): Promise<IaEstado>;
  /** Roda o modelo local sobre o texto da captura (409 com a IA desligada; 502 se a extração falhar). */
  extrairComIa(casoId: Id, capturaId: Id): Promise<ExtracaoIa>;
  listarExtracoesIa(casoId: Id): Promise<ExtracaoIa[]>;
  listarSugestoesIa(casoId: Id, filtro?: FiltroSugestoesIa): Promise<SugestaoIa[]>;
  /** Aceita ou recusa a sugestão, com justificativa. A decisão é única (409 se já decidida). */
  decidirSugestaoIa(casoId: Id, sugestaoId: Id, corpo: DecisaoSugestaoIa): Promise<SugestaoIa>;
  obterTextoCaptura(casoId: Id, capturaId: Id): Promise<TextoCaptura>;
}

/** Credenciais e justificativa lidas no momento de cada requisição. */
export interface ContextoSessao {
  obterToken: () => string;
  obterJustificativa: () => string;
}

export function mesmoId(a: Id | null | undefined, b: Id | null | undefined): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}
