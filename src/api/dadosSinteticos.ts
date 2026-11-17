/**
 * Dados sintéticos para o modo simulado (VITE_MOCK=1) e para os testes.
 *
 * Nenhuma pessoa, empresa, CPF ou CNPJ aqui é real. Os CPFs só aparecem no
 * formato descaracterizado dos dados abertos do CNPJ, `***NNNNNN**` (três
 * primeiros dígitos e dois verificadores ocultos), o mesmo que o back-end
 * devolve. Os hashes são hexadecimais sintéticos.
 *
 * Os dados do horizonte 2 (H18, H19, H32 a H36 e H39) seguem as fixtures do
 * back-end: órgão "PREFEITURA SINTETICA DE EXEMPLOPOLIS", empresas com CNPJ
 * das bases fictícias 900000xx e 901000xx, e capturas com origem `simulado://`.
 */
import type {
  Alerta,
  Anotacao,
  ArestaGrafo,
  Aviso,
  Captura,
  Caso,
  ColetaRegistro,
  EntidadeDetalhe,
  Evidencia,
  Id,
  Membro,
  Monitoramento,
  PerfilUsuario,
  Tarefa,
  Tipologia,
  TipologiaCatalogo,
} from './tipos';

export const CASO_DEMO: Caso = {
  id: 'caso-1',
  titulo: 'Demonstração — contratos de TI (dados sintéticos)',
  descricao: 'Caso de demonstração com dados fictícios para validar a fatia vertical do MVP.',
  numero_procedimento: '0001/2026-DEMO',
  criado_por: 'analista.demo',
  criado_em: '2026-11-11T12:00:00Z',
  finalidade: 'Demonstração do protótipo com dados sintéticos.',
  retencao_ate: '2099-12-31',
  somente_leitura: false,
  meu_papel: null,
};

/** Conectores do modo simulado (mesmos nomes e versões do back-end na data desta versão). */
export const CONECTORES_DEMO: Record<string, { nome: string; versao: string }> = {
  cnpj_arquivo: { nome: 'cnpj_arquivo', versao: '1.1.0' },
  pncp: { nome: 'pncp', versao: '1.2.0' },
  portal_transparencia: { nome: 'portal_transparencia', versao: '1.0.0' },
  pncp_termos: { nome: 'pncp_termos', versao: '1.0.0' },
  tse_arquivo: { nome: 'tse_arquivo', versao: '1.0.0' },
  edital_arquivo: { nome: 'edital_arquivo', versao: '1.0.0' },
};

/** Motivo devolvido quando falta a chave do Portal da Transparência (coleta `nao_configurado`). */
export const MOTIVO_PORTAL_NAO_CONFIGURADO =
  'Portal da Transparência não configurado: defina a chave de API na variável de ambiente PORTAL_TRANSPARENCIA_CHAVE do servidor.';

const H = (semente: string): string => {
  // hash sintético determinístico (não criptográfico), só para a demonstração
  let a = 0x811c9dc5;
  for (const ch of semente) {
    a ^= ch.charCodeAt(0);
    a = Math.imul(a, 0x01000193) >>> 0;
  }
  let saida = '';
  for (let i = 0; i < 8; i++) {
    a = Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) >>> 0;
    saida += a.toString(16).padStart(8, '0');
  }
  return saida;
};

export const CAPTURAS: Captura[] = [
  {
    id: 'cap-1',
    fonte: 'cnpj_arquivo',
    url_ou_arquivo: 'fixtures/cnpj/K3241.K03200Y0.D61111.EMPRECSV',
    coletado_em: '2026-11-11T12:05:10Z',
    sha256: H('cap-1'),
    metadados: { tabela: 'Empresas', layout: 'Receita Federal — dados abertos do CNPJ', linhas: 7 },
    tamanho_bytes: 812,
    conector_nome: 'cnpj_arquivo',
    conector_versao: '1.1.0',
  },
  {
    id: 'cap-2',
    fonte: 'cnpj_arquivo',
    url_ou_arquivo: 'fixtures/cnpj/K3241.K03200Y0.D61111.SOCIOCSV',
    coletado_em: '2026-11-11T12:05:11Z',
    sha256: H('cap-2'),
    metadados: { tabela: 'Sócios', layout: 'Receita Federal — dados abertos do CNPJ', linhas: 7 },
    tamanho_bytes: 1024,
    conector_nome: 'cnpj_arquivo',
    conector_versao: '1.1.0',
  },
  {
    id: 'cap-3',
    fonte: 'cnpj_arquivo',
    url_ou_arquivo: 'fixtures/cnpj/K3241.K03200Y0.D61111.ESTABELE',
    coletado_em: '2026-11-11T12:05:12Z',
    sha256: H('cap-3'),
    metadados: { tabela: 'Estabelecimentos', layout: 'Receita Federal — dados abertos do CNPJ', linhas: 7 },
    tamanho_bytes: 2210,
    conector_nome: 'cnpj_arquivo',
    conector_versao: '1.1.0',
  },
  {
    id: 'cap-4',
    fonte: 'pncp',
    url_ou_arquivo: 'https://pncp.gov.br/api/consulta/v1/contratos?dataInicial=20260101&dataFinal=20260331&pagina=1',
    coletado_em: '2026-11-11T12:06:30Z',
    sha256: H('cap-4'),
    metadados: { pagina: 1, total_registros: 9, http_status: 200 },
    tamanho_bytes: 6144,
    conector_nome: 'pncp',
    conector_versao: '1.2.0',
  },
  // ---- Horizonte 2 (H19): Portal da Transparência, termos do PNCP, TSE e editais ----
  {
    id: 'cap-5',
    fonte: 'portal_transparencia',
    url_ou_arquivo: 'simulado://api.portaldatransparencia.gov.br/api-de-dados/ceis?codigoSancionado=90000006000151&pagina=1',
    coletado_em: '2026-11-16T09:10:05Z',
    sha256: H('cap-5'),
    metadados: { recurso: 'ceis', pagina: 1, registros: 1, http_status: 200, simulado: true },
    tamanho_bytes: 1490,
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
  },
  {
    id: 'cap-6',
    fonte: 'portal_transparencia',
    url_ou_arquivo: 'simulado://api.portaldatransparencia.gov.br/api-de-dados/servidores?orgaoServidorLotacao=90001&pagina=1',
    coletado_em: '2026-11-16T09:20:10Z',
    sha256: H('cap-6'),
    metadados: { recurso: 'servidores', pagina: 1, registros: 2, http_status: 200, simulado: true },
    tamanho_bytes: 2304,
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
  },
  {
    id: 'cap-7',
    fonte: 'pncp_termos',
    url_ou_arquivo: 'simulado://pncp.gov.br/api/pncp/v1/orgaos/90100001000100/contratos/2026/4/termos',
    coletado_em: '2026-11-16T09:12:40Z',
    sha256: H('cap-7'),
    metadados: { contrato: '90100001000100-2-000004/2026', termos: 1, http_status: 200, simulado: true },
    tamanho_bytes: 980,
    conector_nome: 'pncp_termos',
    conector_versao: '1.0.0',
  },
  {
    id: 'cap-8',
    fonte: 'tse_arquivo',
    url_ou_arquivo: 'simulado://tse_arquivo/TSE_DIR_BASE/tse/receitas_candidatos_2024_GO.csv',
    coletado_em: '2026-11-16T09:15:02Z',
    sha256: H('cap-8'),
    metadados: { arquivo: 'receitas_candidatos_2024_GO.csv', codificacao: 'utf-8', linhas: 4, simulado: true },
    tamanho_bytes: 3120,
    conector_nome: 'tse_arquivo',
    conector_versao: '1.0.0',
  },
  {
    id: 'cap-9',
    fonte: 'tse_arquivo',
    url_ou_arquivo: 'simulado://tse_arquivo/TSE_DIR_BASE/tse/consulta_cand_2024_GO.csv',
    coletado_em: '2026-11-16T09:15:01Z',
    sha256: H('cap-9'),
    metadados: { arquivo: 'consulta_cand_2024_GO.csv', codificacao: 'utf-8', linhas: 3, simulado: true },
    tamanho_bytes: 2048,
    conector_nome: 'tse_arquivo',
    conector_versao: '1.0.0',
  },
  {
    id: 'cap-10',
    fonte: 'edital_arquivo',
    url_ou_arquivo: 'simulado://edital_arquivo/EDITAIS_DIR_BASE/editais/edital_restritivo.txt',
    coletado_em: '2026-11-16T09:18:30Z',
    sha256: H('cap-10'),
    metadados: { arquivo: 'edital_restritivo.txt', codificacao: 'utf-8', simulado: true },
    tamanho_bytes: 1876,
    conector_nome: 'edital_arquivo',
    conector_versao: '1.0.0',
  },
  {
    id: 'cap-11',
    fonte: 'portal_transparencia',
    url_ou_arquivo: 'simulado://api.portaldatransparencia.gov.br/api-de-dados/cnep?codigoSancionado=90000007000104&pagina=1',
    coletado_em: '2026-11-16T09:11:20Z',
    sha256: H('cap-11'),
    metadados: { recurso: 'cnep', pagina: 1, registros: 1, http_status: 200, simulado: true },
    tamanho_bytes: 1320,
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
  },
];

/**
 * Capturas das recoletas feitas pelo monitoramento contínuo (H18) no caso de
 * demonstração. Ficam fora de `CAPTURAS` porque não são a carga inicial de
 * nenhuma fonte: só existem como resultado de uma execução do agendador.
 */
export const CAPTURAS_MONITORAMENTO: Captura[] = [
  {
    id: 'cap-12',
    fonte: 'pncp_termos',
    url_ou_arquivo: 'simulado://pncp.gov.br/api/pncp/v1/orgaos/90100001000100/contratos/2026/4/termos',
    coletado_em: '2026-11-16T10:00:04Z',
    sha256: H('cap-12'),
    metadados: { contrato: '90100001000100-2-000004/2026', termos: 2, http_status: 200, simulado: true },
    tamanho_bytes: 1710,
    conector_nome: 'pncp_termos',
    conector_versao: '1.0.0',
    coleta_id: 'col-11',
  },
  {
    id: 'cap-13',
    fonte: 'portal_transparencia',
    url_ou_arquivo: 'simulado://api.portaldatransparencia.gov.br/api-de-dados/ceis?codigoSancionado=90000006000151&pagina=1',
    coletado_em: '2026-11-16T10:00:06Z',
    sha256: H('cap-13'),
    metadados: { recurso: 'ceis', pagina: 1, registros: 2, http_status: 200, simulado: true },
    tamanho_bytes: 2890,
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
    coleta_id: 'col-12',
  },
  {
    id: 'cap-14',
    fonte: 'pncp',
    url_ou_arquivo: 'https://pncp.gov.br/api/consulta/v1/contratos?dataInicial=20260101&dataFinal=20260331&pagina=1',
    coletado_em: '2026-11-15T08:00:03Z',
    sha256: H('cap-14'),
    metadados: { pagina: 1, total_registros: 9, http_status: 200 },
    tamanho_bytes: 6912,
    conector_nome: 'pncp',
    conector_versao: '1.2.0',
    coleta_id: 'col-13',
  },
];

const TODAS_AS_CAPTURAS = (): Captura[] => [...CAPTURAS, ...CAPTURAS_MONITORAMENTO];

/** Evidência ligada a uma captura sintética (fonte, origem e SHA-256 vêm da captura). */
function ev(descricao: string, capturaId: Id): Evidencia {
  const captura = TODAS_AS_CAPTURAS().find((c) => c.id === capturaId)!;
  return { descricao, fonte: captura.fonte, captura_id: captura.id, url_ou_arquivo: captura.url_ou_arquivo, sha256: captura.sha256 };
}

/** Fonte de uma entidade, a partir da captura sintética. */
function fonteDe(capturaId: Id) {
  const captura = TODAS_AS_CAPTURAS().find((c) => c.id === capturaId)!;
  return { captura_id: captura.id, fonte: captura.fonte, url_ou_arquivo: captura.url_ou_arquivo };
}

/**
 * Histórico de coletas do caso de demonstração (RNF12, H15), da mais recente
 * para a mais antiga. A falha do PNCP é sintética: mostra como a tela informa
 * a fonte que falhou, as tentativas e o motivo.
 */
export const COLETAS_DEMO: ColetaRegistro[] = [
  // ---- Horizonte 2: recoletas do monitoramento (H18) e fontes novas (H19) ----
  {
    id: 'col-12',
    fonte: 'portal_transparencia',
    parametros: { recurso: 'ceis', codigoSancionado: ['90000004000162', '90000006000151', '90000007000104'], max_paginas: 20 },
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 2,
    avisos: [],
    usuario: 'agendador',
    iniciado_em: '2026-11-16T10:00:05Z',
    concluido_em: '2026-11-16T10:00:06Z',
    recoleta_de: 'col-5',
    captura_ids: ['cap-13'],
  },
  {
    id: 'col-11',
    fonte: 'pncp_termos',
    parametros: { contratos: [{ cnpj: '90100001000100', ano: 2026, sequencial: 4, numero_controle_pncp: '90100001000100-2-000004/2026' }] },
    conector_nome: 'pncp_termos',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 2,
    avisos: [],
    usuario: 'agendador',
    iniciado_em: '2026-11-16T10:00:03Z',
    concluido_em: '2026-11-16T10:00:04Z',
    recoleta_de: 'col-7',
    captura_ids: ['cap-12'],
  },
  {
    id: 'col-10',
    fonte: 'portal_transparencia',
    parametros: { recurso: 'servidores', orgaoServidorLotacao: '90001', cnpjOrgao: '90100001000100', max_paginas: 20 },
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 2,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-16T09:20:09Z',
    concluido_em: '2026-11-16T09:20:10Z',
    recoleta_de: null,
    captura_ids: ['cap-6'],
  },
  {
    id: 'col-9',
    fonte: 'edital_arquivo',
    parametros: { diretorio: 'editais', cnpjOrgao: '90100001000100' },
    conector_nome: 'edital_arquivo',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 1,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-16T09:18:29Z',
    concluido_em: '2026-11-16T09:18:30Z',
    recoleta_de: null,
    captura_ids: ['cap-10'],
  },
  {
    id: 'col-8',
    fonte: 'tse_arquivo',
    parametros: { diretorio: 'tse', uf: 'GO', municipio: 'EXEMPLOPOLIS' },
    conector_nome: 'tse_arquivo',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 3,
    avisos: ['1 receita de "Recursos próprios" foi ignorada (o doador é o próprio candidato).'],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-16T09:15:00Z',
    concluido_em: '2026-11-16T09:15:02Z',
    recoleta_de: null,
    captura_ids: ['cap-9', 'cap-8'],
  },
  {
    id: 'col-7',
    fonte: 'pncp_termos',
    parametros: { contratos: [{ cnpj: '90100001000100', ano: 2026, sequencial: 4, numero_controle_pncp: '90100001000100-2-000004/2026' }] },
    conector_nome: 'pncp_termos',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 1,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-16T09:12:39Z',
    concluido_em: '2026-11-16T09:12:40Z',
    recoleta_de: null,
    captura_ids: ['cap-7'],
  },
  {
    id: 'col-6',
    fonte: 'portal_transparencia',
    parametros: { recurso: 'cnep', codigoSancionado: ['90000004000162', '90000006000151', '90000007000104'], max_paginas: 20 },
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 1,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-16T09:11:19Z',
    concluido_em: '2026-11-16T09:11:20Z',
    recoleta_de: null,
    captura_ids: ['cap-11'],
  },
  {
    id: 'col-5',
    fonte: 'portal_transparencia',
    parametros: { recurso: 'ceis', codigoSancionado: ['90000004000162', '90000006000151', '90000007000104'], max_paginas: 20 },
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 1,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-16T09:10:04Z',
    concluido_em: '2026-11-16T09:10:05Z',
    recoleta_de: null,
    captura_ids: ['cap-5'],
  },
  {
    // A primeira tentativa foi feita antes de a chave do Portal ser configurada no servidor.
    id: 'col-4',
    fonte: 'portal_transparencia',
    parametros: { recurso: 'ceis', codigoSancionado: ['90000004000162', '90000006000151', '90000007000104'], max_paginas: 20 },
    conector_nome: 'portal_transparencia',
    conector_versao: '1.0.0',
    situacao: 'nao_configurado',
    tentativas: 0,
    motivo: MOTIVO_PORTAL_NAO_CONFIGURADO,
    registros: 0,
    avisos: [MOTIVO_PORTAL_NAO_CONFIGURADO],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-16T09:02:00Z',
    concluido_em: '2026-11-16T09:02:00Z',
    recoleta_de: null,
    captura_ids: [],
  },
  {
    id: 'col-13',
    fonte: 'pncp',
    parametros: { dataInicial: '20260101', dataFinal: '20260331', max_paginas: 1 },
    conector_nome: 'pncp',
    conector_versao: '1.2.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 9,
    avisos: [],
    usuario: 'agendador',
    iniciado_em: '2026-11-15T08:00:02Z',
    concluido_em: '2026-11-15T08:00:03Z',
    recoleta_de: 'col-3',
    captura_ids: ['cap-14'],
  },
  {
    id: 'col-3',
    fonte: 'pncp',
    parametros: { dataInicial: '20260101', dataFinal: '20260331', max_paginas: 1 },
    conector_nome: 'pncp',
    conector_versao: '1.2.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 9,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-11T12:06:29Z',
    concluido_em: '2026-11-11T12:06:30Z',
    recoleta_de: null,
    captura_ids: ['cap-4'],
  },
  {
    id: 'col-2',
    fonte: 'pncp',
    parametros: { dataInicial: '20260101', dataFinal: '20260331', max_paginas: 1 },
    conector_nome: 'pncp',
    conector_versao: '1.2.0',
    situacao: 'falha',
    tentativas: 3,
    motivo: 'Falha ao consultar o PNCP após 3 tentativas: PNCP respondeu HTTP 503',
    registros: 0,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-11T12:05:40Z',
    concluido_em: '2026-11-11T12:05:46Z',
    recoleta_de: null,
    captura_ids: [],
  },
  {
    id: 'col-1',
    fonte: 'cnpj_arquivo',
    parametros: { diretorio: 'cnpj' },
    conector_nome: 'cnpj_arquivo',
    conector_versao: '1.1.0',
    situacao: 'sucesso',
    tentativas: 1,
    motivo: '',
    registros: 13,
    avisos: [],
    usuario: 'analista.demo',
    iniciado_em: '2026-11-11T12:05:09Z',
    concluido_em: '2026-11-11T12:05:12Z',
    recoleta_de: null,
    captura_ids: ['cap-1', 'cap-2', 'cap-3'],
  },
];

const ENDERECO_COMUM = 'RUA EXEMPLO, 100, SALA 1, BRASÍLIA/DF, 70000-000';

export const ENTIDADES: EntidadeDetalhe[] = [
  {
    id: 'emp-1',
    tipo: 'empresa',
    rotulo: 'ALFA SOLUÇÕES EM TI LTDA',
    identificador: '12.345.678/0001-95',
    atributos: {
      cnpj_basico: '12345678',
      razao_social: 'ALFA SOLUÇÕES EM TI LTDA',
      capital_social: 10000,
      data_abertura: '2026-01-15',
      natureza_juridica: 'Sociedade Empresária Limitada',
      endereco: ENDERECO_COMUM,
      situacao_cadastral: 'ATIVA',
    },
    fontes: [
      { captura_id: 'cap-1', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[0].url_ou_arquivo },
      { captura_id: 'cap-3', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[2].url_ou_arquivo },
    ],
    sugestoes: [],
  },
  {
    id: 'emp-2',
    tipo: 'empresa',
    rotulo: 'BETA SERVIÇOS DIGITAIS LTDA',
    identificador: '23.456.789/0001-00',
    atributos: {
      cnpj_basico: '23456789',
      razao_social: 'BETA SERVIÇOS DIGITAIS LTDA',
      capital_social: 50000,
      data_abertura: '2019-03-02',
      natureza_juridica: 'Sociedade Empresária Limitada',
      endereco: ENDERECO_COMUM,
      situacao_cadastral: 'ATIVA',
    },
    fontes: [
      { captura_id: 'cap-1', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[0].url_ou_arquivo },
      { captura_id: 'cap-3', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[2].url_ou_arquivo },
    ],
    sugestoes: [],
  },
  {
    id: 'emp-3',
    tipo: 'empresa',
    rotulo: 'GAMA CONSULTORIA LTDA',
    identificador: '34.567.890/0001-11',
    atributos: {
      cnpj_basico: '34567890',
      razao_social: 'GAMA CONSULTORIA LTDA',
      capital_social: 5000,
      data_abertura: '2015-07-20',
      natureza_juridica: 'Sociedade Empresária Limitada',
      endereco: 'AVENIDA FICTÍCIA, 2500, BLOCO B, GOIÂNIA/GO, 74000-000',
      situacao_cadastral: 'BAIXADA',
      data_situacao_cadastral: '2025-08-15',
    },
    fontes: [{ captura_id: 'cap-1', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[0].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'emp-4',
    tipo: 'empresa',
    rotulo: 'DELTA ENGENHARIA S.A.',
    identificador: '45.678.901/0001-22',
    atributos: {
      cnpj_basico: '45678901',
      razao_social: 'DELTA ENGENHARIA S.A.',
      capital_social: 2000000,
      data_abertura: '2010-01-04',
      natureza_juridica: 'Sociedade Anônima Fechada',
      endereco: 'RODOVIA MODELO, KM 10, TAGUATINGA/DF, 72000-000',
      situacao_cadastral: 'ATIVA',
    },
    fontes: [{ captura_id: 'cap-1', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[0].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'pes-1',
    tipo: 'pessoa',
    rotulo: 'JOÃO EXEMPLO DA SILVA',
    identificador: '***123456**',
    atributos: {
      nome_normalizado: 'JOAO EXEMPLO DA SILVA',
      cpf_descaracterizado: '***123456**',
      qualificacao: 'Sócio-Administrador',
    },
    fontes: [{ captura_id: 'cap-2', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[1].url_ou_arquivo }],
    sugestoes: [
      {
        entidade_id: 'pes-3',
        rotulo: 'JOÃO EXEMPLO DA SILVA',
        identificador: '***987654**',
        motivo: 'Mesmo nome normalizado, CPF parcial diferente. Possível homônimo; não foi fundido.',
        confianca: 0.35,
      },
    ],
  },
  {
    id: 'pes-2',
    tipo: 'pessoa',
    rotulo: 'MARIA EXEMPLO SOUZA',
    identificador: '***234567**',
    atributos: {
      nome_normalizado: 'MARIA EXEMPLO SOUZA',
      cpf_descaracterizado: '***234567**',
      qualificacao: 'Sócia',
    },
    fontes: [{ captura_id: 'cap-2', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[1].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'pes-3',
    tipo: 'pessoa',
    rotulo: 'JOÃO EXEMPLO DA SILVA',
    identificador: '***987654**',
    atributos: {
      nome_normalizado: 'JOAO EXEMPLO DA SILVA',
      cpf_descaracterizado: '***987654**',
      qualificacao: 'Sócio',
    },
    fontes: [{ captura_id: 'cap-2', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[1].url_ou_arquivo }],
    sugestoes: [
      {
        entidade_id: 'pes-1',
        rotulo: 'JOÃO EXEMPLO DA SILVA',
        identificador: '***123456**',
        motivo: 'Mesmo nome normalizado, CPF parcial diferente. Possível homônimo; não foi fundido.',
        confianca: 0.35,
      },
    ],
  },
  {
    id: 'pes-4',
    tipo: 'pessoa',
    rotulo: 'CARLOS EXEMPLO PEREIRA',
    identificador: '***345678**',
    atributos: {
      nome_normalizado: 'CARLOS EXEMPLO PEREIRA',
      cpf_descaracterizado: '***345678**',
      qualificacao: 'Diretor',
    },
    fontes: [{ captura_id: 'cap-2', fonte: 'cnpj_arquivo', url_ou_arquivo: CAPTURAS[1].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'org-1',
    tipo: 'orgao',
    rotulo: 'SECRETARIA EXEMPLO DE TECNOLOGIA',
    identificador: '98.765.432/0001-10',
    atributos: { esfera: 'Distrital', uf: 'DF' },
    fontes: [{ captura_id: 'cap-4', fonte: 'pncp', url_ou_arquivo: CAPTURAS[3].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'org-2',
    tipo: 'orgao',
    rotulo: 'AUTARQUIA EXEMPLO DE OBRAS',
    identificador: '87.654.321/0001-20',
    atributos: { esfera: 'Distrital', uf: 'DF' },
    fontes: [{ captura_id: 'cap-4', fonte: 'pncp', url_ou_arquivo: CAPTURAS[3].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'con-1',
    tipo: 'contrato',
    rotulo: 'Contrato 98765432-1-000012/2026',
    identificador: '98765432-1-000012/2026',
    atributos: {
      numero_controle_pncp: '98765432-1-000012/2026',
      objeto: 'Serviços de sustentação de sistemas (sintético)',
      valor_global: 1200000,
      data_assinatura: '2026-02-10',
      fornecedor: '12.345.678/0001-95',
      orgao: '98.765.432/0001-10',
    },
    fontes: [{ captura_id: 'cap-4', fonte: 'pncp', url_ou_arquivo: CAPTURAS[3].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'con-2',
    tipo: 'contrato',
    rotulo: 'Contrato 98765432-1-000031/2026',
    identificador: '98765432-1-000031/2026',
    atributos: {
      numero_controle_pncp: '98765432-1-000031/2026',
      objeto: 'Licenciamento de software (sintético)',
      valor_global: 300000,
      data_assinatura: '2026-03-05',
      fornecedor: '23.456.789/0001-00',
      orgao: '98.765.432/0001-10',
    },
    fontes: [{ captura_id: 'cap-4', fonte: 'pncp', url_ou_arquivo: CAPTURAS[3].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'con-3',
    tipo: 'contrato',
    rotulo: 'Contrato 87654321-1-000007/2026',
    identificador: '87654321-1-000007/2026',
    atributos: {
      numero_controle_pncp: '87654321-1-000007/2026',
      objeto: 'Obras de pavimentação (sintético)',
      valor_global: 5000000,
      data_assinatura: '2026-01-20',
      fornecedor: '45.678.901/0001-22',
      orgao: '87.654.321/0001-20',
    },
    fontes: [{ captura_id: 'cap-4', fonte: 'pncp', url_ou_arquivo: CAPTURAS[3].url_ou_arquivo }],
    sugestoes: [],
  },
  {
    id: 'con-4',
    tipo: 'contrato',
    rotulo: 'Contrato 87654321-1-000009/2026',
    identificador: '87654321-1-000009/2026',
    atributos: {
      numero_controle_pncp: '87654321-1-000009/2026',
      objeto: 'Consultoria em processos (sintético)',
      valor_global: 80000,
      data_assinatura: '2026-01-30',
      fornecedor: '34.567.890/0001-11',
      orgao: '87.654.321/0001-20',
    },
    fontes: [{ captura_id: 'cap-4', fonte: 'pncp', url_ou_arquivo: CAPTURAS[3].url_ou_arquivo }],
    sugestoes: [],
  },
  // ---- Horizonte 2 (fixtures no molde das do back-end; tudo fictício) ----
  {
    id: 'emp-5',
    tipo: 'empresa',
    rotulo: 'TETA SERVICOS SINTETICA LTDA',
    identificador: '90.000.004/0001-62',
    atributos: {
      cnpj_basico: '90000004',
      razao_social: 'TETA SERVICOS SINTETICA LTDA',
      capital_social: 80000,
      data_abertura: '2018-05-10',
      natureza_juridica: 'Sociedade Empresária Limitada',
      endereco: 'RUA FICTICIA, 40, EXEMPLOPOLIS/GO, 75000-000',
      situacao_cadastral: 'ATIVA',
    },
    fontes: [fonteDe('cap-1'), fonteDe('cap-3')],
    sugestoes: [],
  },
  {
    id: 'emp-6',
    tipo: 'empresa',
    rotulo: 'ZETA COMERCIO SINTETICA LTDA',
    identificador: '90.000.006/0001-51',
    atributos: {
      cnpj_basico: '90000006',
      razao_social: 'ZETA COMERCIO SINTETICA LTDA',
      capital_social: 150000,
      data_abertura: '2016-09-01',
      natureza_juridica: 'Sociedade Empresária Limitada',
      endereco: 'AVENIDA EXEMPLO, 600, EXEMPLOPOLIS/GO, 75000-010',
      situacao_cadastral: 'ATIVA',
    },
    fontes: [fonteDe('cap-1'), fonteDe('cap-3'), fonteDe('cap-5')],
    sugestoes: [],
  },
  {
    id: 'emp-7',
    tipo: 'empresa',
    rotulo: 'ETA OBRAS SINTETICA LTDA',
    identificador: '90.000.007/0001-04',
    atributos: {
      cnpj_basico: '90000007',
      razao_social: 'ETA OBRAS SINTETICA LTDA',
      capital_social: 500000,
      data_abertura: '2012-02-20',
      natureza_juridica: 'Sociedade Empresária Limitada',
      endereco: 'RODOVIA FICTICIA, KM 7, EXEMPLOPOLIS/GO, 75000-020',
      situacao_cadastral: 'ATIVA',
    },
    fontes: [fonteDe('cap-1'), fonteDe('cap-3'), fonteDe('cap-8')],
    sugestoes: [],
  },
  {
    id: 'pes-5',
    tipo: 'pessoa',
    rotulo: 'RICARDO FICTICIO LIMA',
    identificador: '***666666**',
    atributos: {
      nome_normalizado: 'RICARDO FICTICIO LIMA',
      cpf_mascarado: '***666666**',
      qualificacao: 'Sócio-Administrador',
      papel_fonte: 'socio',
    },
    fontes: [fonteDe('cap-2')],
    sugestoes: [
      {
        entidade_id: 'pes-6',
        rotulo: 'RICARDO FICTICIO LIMA',
        identificador: '***666666**',
        motivo: 'Possível coincidência: mesmo nome normalizado e mesmos seis dígitos visíveis do CPF de um servidor. Não é identificação; não foi fundido.',
        confianca: 0.9,
      },
      {
        entidade_id: 'pes-7',
        rotulo: 'RICARDO FICTICIO LIMA',
        identificador: '***666666**',
        motivo: 'Possível coincidência: mesmo nome normalizado e mesmos seis dígitos visíveis do CPF de um doador de campanha. Não é identificação; não foi fundido.',
        confianca: 0.9,
      },
    ],
  },
  {
    id: 'pes-6',
    tipo: 'pessoa',
    rotulo: 'RICARDO FICTICIO LIMA',
    identificador: '***666666**',
    atributos: {
      nome_normalizado: 'RICARDO FICTICIO LIMA',
      cpf_mascarado: '***666666**',
      papel_fonte: 'servidor',
      codigo_orgao_siape: '90001',
      orgao_siape: 'PREFEITURA SINTETICA DE EXEMPLOPOLIS',
      situacao: 'ATIVO',
      tipo_servidor: 'Civil',
    },
    fontes: [fonteDe('cap-6')],
    sugestoes: [
      {
        entidade_id: 'pes-5',
        rotulo: 'RICARDO FICTICIO LIMA',
        identificador: '***666666**',
        motivo: 'Possível coincidência: mesmo nome normalizado e mesmos seis dígitos visíveis do CPF de um sócio. Não é identificação; não foi fundido.',
        confianca: 0.9,
      },
    ],
  },
  {
    id: 'pes-7',
    tipo: 'pessoa',
    rotulo: 'RICARDO FICTICIO LIMA',
    identificador: '***666666**',
    atributos: {
      nome_normalizado: 'RICARDO FICTICIO LIMA',
      cpf_mascarado: '***666666**',
      papel_fonte: 'doador',
    },
    fontes: [fonteDe('cap-8')],
    sugestoes: [
      {
        entidade_id: 'pes-5',
        rotulo: 'RICARDO FICTICIO LIMA',
        identificador: '***666666**',
        motivo: 'Possível coincidência: mesmo nome normalizado e mesmos seis dígitos visíveis do CPF de um sócio. Não é identificação; não foi fundido.',
        confianca: 0.9,
      },
    ],
  },
  {
    id: 'org-3',
    tipo: 'orgao',
    rotulo: 'PREFEITURA SINTETICA DE EXEMPLOPOLIS',
    identificador: '90.100.001/0001-00',
    atributos: { esfera: 'M', poder: 'E', uf: 'GO', municipio: 'EXEMPLOPOLIS' },
    fontes: [fonteDe('cap-4'), fonteDe('cap-6')],
    sugestoes: [],
  },
  ...[
    { n: 1, data: '2026-02-02' },
    { n: 2, data: '2026-03-02' },
    { n: 3, data: '2026-03-30' },
  ].map(
    ({ n, data }): EntidadeDetalhe => ({
      id: `con-${4 + n}`,
      tipo: 'contrato',
      rotulo: `Contrato 90100001000100-2-00000${n}/2026`,
      identificador: `90100001000100-2-00000${n}/2026`,
      atributos: {
        numero_controle_pncp: `90100001000100-2-00000${n}/2026`,
        objeto: `Serviços de manutenção predial, etapa ${n} (sintético)`,
        valor_global: 30000,
        valorInicial: 30000,
        data_assinatura: data,
        sequencialContrato: n,
        categoriaProcessoId: 8,
        categoriaProcessoNome: 'Serviços',
        codigoUnidade: '1',
        fornecedor: '90.000.004/0001-62',
        orgao: '90.100.001/0001-00',
      },
      fontes: [fonteDe('cap-4')],
      sugestoes: [],
    }),
  ),
  {
    id: 'con-8',
    tipo: 'contrato',
    rotulo: 'Contrato 90100001000100-2-000004/2026',
    identificador: '90100001000100-2-000004/2026',
    atributos: {
      numero_controle_pncp: '90100001000100-2-000004/2026',
      objeto: 'Fornecimento de material de expediente (sintético)',
      valor_global: 100000,
      valorInicial: 100000,
      data_assinatura: '2026-03-01',
      sequencialContrato: 4,
      categoriaProcessoId: 2,
      categoriaProcessoNome: 'Compras',
      codigoUnidade: '1',
      fornecedor: '90.000.006/0001-51',
      orgao: '90.100.001/0001-00',
      termos: [
        { sequencial: 1, numero: '1/2026', tipo: 'Termo Aditivo', objeto: 'Acréscimo de quantitativo', valor_acrescido: 20000, data_assinatura: '2026-06-01', captura_id: 'cap-7' },
        { sequencial: 2, numero: '2/2026', tipo: 'Termo Aditivo', objeto: 'Acréscimo de quantitativo', valor_acrescido: 10000, data_assinatura: '2026-09-01', captura_id: 'cap-12' },
      ],
    },
    fontes: [fonteDe('cap-4'), fonteDe('cap-7'), fonteDe('cap-12')],
    sugestoes: [],
  },
  {
    id: 'con-9',
    tipo: 'contrato',
    rotulo: 'Contrato 90100001000100-2-000005/2026',
    identificador: '90100001000100-2-000005/2026',
    atributos: {
      numero_controle_pncp: '90100001000100-2-000005/2026',
      objeto: 'Pavimentação de via urbana (sintético)',
      valor_global: 400000,
      valorInicial: 400000,
      data_assinatura: '2026-02-15',
      sequencialContrato: 5,
      categoriaProcessoId: 7,
      categoriaProcessoNome: 'Obras',
      codigoUnidade: '2',
      fornecedor: '90.000.007/0001-04',
      orgao: '90.100.001/0001-00',
    },
    fontes: [fonteDe('cap-4')],
    sugestoes: [],
  },
  {
    id: 'san-1',
    tipo: 'sancao',
    rotulo: 'CEIS — impedimento de licitar (registro sintético 9001)',
    identificador: 'CEIS:9001',
    atributos: {
      cadastro: 'CEIS',
      id_registro: '9001',
      tipo_sancao: 'Impedimento de licitar e contratar (sintético)',
      orgao_sancionador: 'ORGAO SINTETICO DE CONTROLE',
      data_inicio_sancao: '2025-01-01',
      data_fim_sancao: '2027-01-01',
      sancionado: '90.000.006/0001-51',
    },
    fontes: [fonteDe('cap-5')],
    sugestoes: [],
  },
  {
    id: 'san-2',
    tipo: 'sancao',
    rotulo: 'CNEP — multa (registro sintético 9002)',
    identificador: 'CNEP:9002',
    atributos: {
      cadastro: 'CNEP',
      id_registro: '9002',
      tipo_sancao: 'Multa (sintético)',
      orgao_sancionador: 'ORGAO SINTETICO DE CONTROLE',
      data_inicio_sancao: '2020-01-01',
      data_fim_sancao: '2021-01-01',
      sancionado: '90.000.007/0001-04',
    },
    fontes: [fonteDe('cap-11')],
    sugestoes: [],
  },
  {
    id: 'cand-1',
    tipo: 'candidato',
    rotulo: 'CANDIDATO FICTICIO DE EXEMPLOPOLIS',
    identificador: '2024:900001',
    atributos: {
      ano: 2024,
      sq_candidato: '900001',
      cargo: 'PREFEITO',
      unidade_eleitoral: 'EXEMPLOPOLIS',
      uf: 'GO',
      situacao_turno: 'ELEITO',
    },
    fontes: [fonteDe('cap-9'), fonteDe('cap-8')],
    sugestoes: [],
  },
  {
    id: 'edi-1',
    tipo: 'edital',
    rotulo: 'edital_restritivo.txt',
    identificador: 'edital_restritivo.txt',
    atributos: {
      nome_arquivo: 'edital_restritivo.txt',
      captura_texto_id: 'cap-10',
      numero_controle_pncp_compra: '90100001000100-1-000001/2026',
      orgao: '90.100.001/0001-00',
    },
    fontes: [fonteDe('cap-10')],
    sugestoes: [],
  },
];

/**
 * Arestas do grafo. Contratos entram como nós ligados ao fornecedor e ao órgão
 * por `contratado_por` (SUPOSIÇÃO: o contrato v0 não diz como o nó "contrato"
 * se liga aos demais).
 */
export const ARESTAS: ArestaGrafo[] = [
  { origem: 'pes-1', destino: 'emp-1', tipo: 'socio_de', atributos: { qualificacao: 'Sócio-Administrador', desde: '2026-01-15' }, captura_id: 'cap-2' },
  { origem: 'pes-2', destino: 'emp-1', tipo: 'socio_de', atributos: { qualificacao: 'Sócia', desde: '2026-01-15' }, captura_id: 'cap-2' },
  { origem: 'pes-1', destino: 'emp-2', tipo: 'socio_de', atributos: { qualificacao: 'Sócio', desde: '2019-03-02' }, captura_id: 'cap-2' },
  { origem: 'pes-3', destino: 'emp-3', tipo: 'socio_de', atributos: { qualificacao: 'Sócio', desde: '2015-07-20' }, captura_id: 'cap-2' },
  { origem: 'pes-4', destino: 'emp-4', tipo: 'socio_de', atributos: { qualificacao: 'Diretor', desde: '2010-01-04' }, captura_id: 'cap-2' },
  { origem: 'emp-1', destino: 'con-1', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 1200000, data_assinatura: '2026-02-10' }, captura_id: 'cap-4' },
  { origem: 'con-1', destino: 'org-1', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-2', destino: 'con-2', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 300000, data_assinatura: '2026-03-05' }, captura_id: 'cap-4' },
  { origem: 'con-2', destino: 'org-1', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-4', destino: 'con-3', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 5000000, data_assinatura: '2026-01-20' }, captura_id: 'cap-4' },
  { origem: 'con-3', destino: 'org-2', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-3', destino: 'con-4', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 80000, data_assinatura: '2026-01-30' }, captura_id: 'cap-4' },
  { origem: 'con-4', destino: 'org-2', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-1', destino: 'emp-2', tipo: 'mesmo_endereco', atributos: { endereco: ENDERECO_COMUM }, captura_id: 'cap-3' },
  // ---- Horizonte 2 ----
  { origem: 'pes-5', destino: 'emp-5', tipo: 'socio_de', atributos: { qualificacao: 'Sócio-Administrador', desde: '2018-05-10' }, captura_id: 'cap-2' },
  { origem: 'pes-5', destino: 'emp-6', tipo: 'socio_de', atributos: { qualificacao: 'Sócio', desde: '2016-09-01' }, captura_id: 'cap-2' },
  { origem: 'emp-5', destino: 'con-5', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 30000, data_assinatura: '2026-02-02' }, captura_id: 'cap-4' },
  { origem: 'con-5', destino: 'org-3', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-5', destino: 'con-6', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 30000, data_assinatura: '2026-03-02' }, captura_id: 'cap-4' },
  { origem: 'con-6', destino: 'org-3', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-5', destino: 'con-7', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 30000, data_assinatura: '2026-03-30' }, captura_id: 'cap-4' },
  { origem: 'con-7', destino: 'org-3', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-6', destino: 'con-8', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 100000, data_assinatura: '2026-03-01' }, captura_id: 'cap-4' },
  { origem: 'con-8', destino: 'org-3', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-7', destino: 'con-9', tipo: 'contratado_por', atributos: { papel: 'fornecedor', valor_global: 400000, data_assinatura: '2026-02-15' }, captura_id: 'cap-4' },
  { origem: 'con-9', destino: 'org-3', tipo: 'contratado_por', atributos: { papel: 'contratante' }, captura_id: 'cap-4' },
  { origem: 'emp-6', destino: 'san-1', tipo: 'sancionada_em', atributos: { cadastro: 'CEIS', data_inicio_sancao: '2025-01-01', data_fim_sancao: '2027-01-01' }, captura_id: 'cap-5' },
  { origem: 'emp-7', destino: 'san-2', tipo: 'sancionada_em', atributos: { cadastro: 'CNEP', data_inicio_sancao: '2020-01-01', data_fim_sancao: '2021-01-01' }, captura_id: 'cap-11' },
  { origem: 'pes-6', destino: 'org-3', tipo: 'servidor_de', atributos: { codigo_orgao_siape: '90001', situacao: 'ATIVO' }, captura_id: 'cap-6' },
  { origem: 'emp-7', destino: 'cand-1', tipo: 'doou_para', atributos: { valor: 15000, data: '2024-09-10' }, captura_id: 'cap-8' },
  { origem: 'pes-7', destino: 'cand-1', tipo: 'doou_para', atributos: { valor: 2000, data: '2024-09-12' }, captura_id: 'cap-8' },
  { origem: 'org-3', destino: 'edi-1', tipo: 'edital_de', atributos: { numero_controle_pncp_compra: '90100001000100-1-000001/2026' }, captura_id: 'cap-10' },
];

/**
 * Severidade e política de erro por tipologia (RF14, H13). Cópia resumida, só
 * para o modo simulado, da tabela única do back-end
 * (`buscador/tipologias/politicas.py`); os valores são decisão do autor.
 */
export const POLITICAS_DEMO: Record<Tipologia, { nome: string; severidade: string; prefere_evitar: 'falso_negativo' | 'falso_positivo'; politica_erro: string }> = {
  T4: {
    nome: 'Empresa contratada sem situação cadastral ativa no CNPJ',
    severidade: 'alta',
    prefere_evitar: 'falso_negativo',
    politica_erro:
      'Prefere evitar falso negativo: dispara para qualquer situação diferente de ATIVA, mesmo quando a mudança é posterior à assinatura do contrato. O falso positivo esperado vem da defasagem do arquivo do CNPJ e custa pouco conferir.',
  },
  T1: {
    nome: 'Empresa aberta pouco antes do contrato',
    severidade: 'media',
    prefere_evitar: 'falso_negativo',
    politica_erro:
      'Prefere evitar falso negativo: o limiar de dias é largo e aponta toda empresa recente, inclusive as regulares. Cabe ao investigador descartar com justificativa.',
  },
  T3: {
    nome: 'Capital social incompatível com o valor contratado',
    severidade: 'media',
    prefere_evitar: 'falso_positivo',
    politica_erro:
      'Prefere evitar falso positivo: só dispara quando o contrato vale muitas vezes o capital social. Aceita falso negativo: desproporções menores não são apontadas.',
  },
  T2: {
    nome: 'Endereço compartilhado por empresas contratadas',
    severidade: 'baixa',
    prefere_evitar: 'falso_negativo',
    politica_erro:
      'Prefere evitar falso negativo: aponta todo endereço com várias empresas em que ao menos uma é contratada. O falso positivo é frequente (contabilidade, coworking), por isso a severidade é baixa.',
  },
  T5: {
    nome: 'Possível fracionamento de despesa (art. 75, § 1º, da Lei nº 14.133/2021)',
    severidade: 'media',
    prefere_evitar: 'falso_positivo',
    politica_erro:
      'Prefere evitar falso positivo: por padrão só soma contratações do mesmo fornecedor e da mesma categoria, na mesma unidade e no mesmo exercício, cada uma abaixo do limite de dispensa. Aceita falso negativo. O alerta é indício: o contrato no PNCP não diz se houve dispensa.',
  },
  T6: {
    nome: 'Empresa contratada com sanção vigente (CEIS ou CNEP)',
    severidade: 'alta',
    prefere_evitar: 'falso_negativo',
    politica_erro:
      'Prefere evitar falso negativo: dispara para qualquer registro do CEIS ou do CNEP cujo período cobre a data de assinatura, sem avaliar o alcance da sanção. O falso positivo esperado é a sanção que não impede contratar com aquele órgão; confere-se no próprio registro.',
  },
  T7: {
    nome: 'Possível coincidência entre sócio da contratada e servidor do órgão contratante',
    severidade: 'alta',
    prefere_evitar: 'falso_positivo',
    politica_erro:
      'Prefere evitar falso positivo: só dispara quando coincidem os seis dígitos visíveis do CPF descaracterizado E o nome normalizado. Ainda assim é possível coincidência, não identificação: homônimo com os mesmos seis dígitos é possível.',
  },
  T8: {
    nome: 'Aditivos acima do limite do art. 125 da Lei nº 14.133/2021',
    severidade: 'media',
    prefere_evitar: 'falso_negativo',
    politica_erro:
      'Prefere evitar falso negativo: soma todo valor acrescido positivo dos termos e compara com o valor inicial sem atualização monetária. Espera-se falso positivo quando o termo é supressão (o PNCP usa o mesmo campo) ou quando a reforma não aparece no objeto.',
  },
  T9: {
    nome: 'Doador de campanha contratado pelo ente do candidato eleito',
    severidade: 'media',
    prefere_evitar: 'falso_positivo',
    politica_erro:
      'Prefere evitar falso positivo: exige candidato eleito, órgão do mesmo ente e contrato assinado depois da doação; para doador pessoa física, exige ainda os seis dígitos visíveis do CPF e o nome iguais aos de um sócio (possível coincidência, nunca identificação).',
  },
  T10: {
    nome: 'Cláusula potencialmente restritiva em edital',
    severidade: 'baixa',
    prefere_evitar: 'falso_negativo',
    politica_erro:
      'Prefere evitar falso negativo: aponta toda ocorrência textual das expressões configuradas, mesmo fora do capítulo de habilitação. O falso positivo é frequente; cada alerta traz o trecho literal e a posição para conferência imediata.',
  },
};

function politicaDe(tipologia: Tipologia) {
  const { nome, prefere_evitar, politica_erro } = POLITICAS_DEMO[tipologia];
  return { tipologia_nome: nome, prefere_evitar, politica_erro, situacao: 'pendente' as const, decisao: null, decisoes: [], ativo: true };
}

/**
 * Na ordem em que o back-end devolve: severidade (alta, média, baixa), depois o código da
 * tipologia como texto (por isso T10 vem antes de T2) e o título.
 */
export const ALERTAS: Alerta[] = [
  {
    id: 'alr-4',
    tipologia: 'T4',
    titulo: 'Empresa com situação cadastral BAIXADA no contrato 87654321-1-000009/2026',
    motivo:
      'GAMA CONSULTORIA LTDA (CNPJ 34.567.890/0001-11) tem contrato com a SECRETARIA EXEMPLO DE OBRAS ' +
      '(87654321-1-000009/2026, assinado em 30/01/2026), mas a situação cadastral do estabelecimento no CNPJ é ' +
      'BAIXADA (código 08); essa situação vigora desde 15/08/2025, 168 dias antes da assinatura. ' +
      'A regra dispara para qualquer situação diferente de ATIVA (código 02).',
    severidade: POLITICAS_DEMO.T4.severidade,
    ...politicaDe('T4'),
    entidades: ['emp-3', 'con-4'],
    evidencias: [
      {
        descricao: 'Situação cadastral BAIXADA desde 15/08/2025 (tabela Estabelecimentos do CNPJ)',
        fonte: 'cnpj_arquivo',
        captura_id: 'cap-3',
        url_ou_arquivo: CAPTURAS[2].url_ou_arquivo,
        sha256: CAPTURAS[2].sha256,
      },
      {
        descricao: 'Fornecedor e data de assinatura do contrato (PNCP)',
        fonte: 'pncp',
        captura_id: 'cap-4',
        url_ou_arquivo: CAPTURAS[3].url_ou_arquivo,
        sha256: CAPTURAS[3].sha256,
      },
    ],
    parametros: {
      situacao_cadastral_codigo: '08',
      situacao_cadastral: 'BAIXADA',
      data_situacao_cadastral: '2025-08-15',
      data_assinatura: '2026-01-30',
      situacao_anterior_ao_contrato: true,
    },
  },
  {
    id: 'alr-6',
    tipologia: 'T6',
    titulo: 'ZETA COMERCIO SINTETICA LTDA contratada com sanção vigente no CEIS',
    motivo:
      'ZETA COMERCIO SINTETICA LTDA (CNPJ 90.000.006/0001-51) assinou o contrato 90100001000100-2-000004/2026 com a ' +
      'PREFEITURA SINTETICA DE EXEMPLOPOLIS em 01/03/2026, e tem registro no CEIS (9001) com sanção de 01/01/2025 a ' +
      '01/01/2027: o período cobre a data de assinatura. Limitação: a regra não avalia o alcance da sanção (órgão, ' +
      'esfera ou tipo); confira no próprio registro.',
    severidade: POLITICAS_DEMO.T6.severidade,
    ...politicaDe('T6'),
    entidades: ['emp-6', 'san-1', 'con-8', 'org-3'],
    evidencias: [
      ev('Registro 9001 do CEIS: sanção de 01/01/2025 a 01/01/2027 (Portal da Transparência)', 'cap-5'),
      ev('Contrato 90100001000100-2-000004/2026, assinado em 01/03/2026 (PNCP)', 'cap-4'),
    ],
    parametros: { cadastro: 'CEIS', id_registro: '9001', data_inicio_sancao: '2025-01-01', data_fim_sancao: '2027-01-01', data_assinatura: '2026-03-01' },
  },
  {
    id: 'alr-7',
    tipologia: 'T7',
    titulo: 'Possível coincidência: sócio de TETA SERVICOS SINTETICA LTDA e servidor de PREFEITURA SINTETICA DE EXEMPLOPOLIS',
    motivo:
      'O sócio RICARDO FICTICIO LIMA (***666666**) de TETA SERVICOS SINTETICA LTDA, contratada pela PREFEITURA SINTETICA ' +
      'DE EXEMPLOPOLIS em 3 contrato(s), possivelmente coincide com o servidor RICARDO FICTICIO LIMA (***666666**) do ' +
      "órgão de código SIAPE 90001. Coincidem o nome normalizado ('RICARDO FICTICIO LIMA') e os seis dígitos centrais do CPF. " +
      'Seis dígitos do CPF e o nome não identificam uma pessoa: é possível coincidência a verificar por outros meios, nunca identificação.',
    severidade: POLITICAS_DEMO.T7.severidade,
    ...politicaDe('T7'),
    entidades: ['pes-5', 'pes-6', 'emp-5', 'org-3', 'con-5', 'con-6', 'con-7'],
    evidencias: [
      ev('Sócio RICARDO FICTICIO LIMA (***666666**) de TETA SERVICOS SINTETICA LTDA (dados abertos do CNPJ, Sócios)', 'cap-2'),
      ev('Servidor RICARDO FICTICIO LIMA (***666666**) no órgão de código SIAPE 90001 (Portal da Transparência, servidores)', 'cap-6'),
      ev('Contratos de TETA SERVICOS SINTETICA LTDA com PREFEITURA SINTETICA DE EXEMPLOPOLIS (PNCP)', 'cap-4'),
    ],
    parametros: {
      criterio: 'seis dígitos visíveis do CPF e nome normalizado iguais',
      cpf_descaracterizado: '***666666**',
      nome_normalizado: 'RICARDO FICTICIO LIMA',
      codigo_orgao_siape: '90001',
      contratos: 3,
      identidade_confirmada: false,
    },
  },
  {
    id: 'alr-1',
    tipologia: 'T1',
    titulo: 'Empresa aberta pouco antes do contrato',
    motivo:
      'ALFA SOLUÇÕES EM TI LTDA foi aberta em 15/01/2026 e assinou o contrato 98765432-1-000012/2026 em 10/02/2026, ' +
      '26 dias depois — abaixo do limiar de 90 dias.',
    severidade: POLITICAS_DEMO.T1.severidade,
    ...politicaDe('T1'),
    entidades: ['emp-1', 'con-1', 'org-1'],
    evidencias: [
      {
        descricao: 'Data de abertura da empresa (tabela Empresas do CNPJ)',
        fonte: 'cnpj_arquivo',
        captura_id: 'cap-1',
        url_ou_arquivo: CAPTURAS[0].url_ou_arquivo,
        sha256: CAPTURAS[0].sha256,
      },
      {
        descricao: 'Data de assinatura do contrato (PNCP, /v1/contratos)',
        fonte: 'pncp',
        captura_id: 'cap-4',
        url_ou_arquivo: CAPTURAS[3].url_ou_arquivo,
        sha256: CAPTURAS[3].sha256,
      },
    ],
    parametros: { limiar_dias: 90, dias_entre_abertura_e_contrato: 26 },
  },
  {
    id: 'alr-3',
    tipologia: 'T3',
    titulo: 'Capital social incompatível com o valor contratado',
    motivo:
      'ALFA SOLUÇÕES EM TI LTDA tem capital social de R$ 10.000,00 e contrato de R$ 1.200.000,00: ' +
      'razão de 120 vezes, acima do limiar de 10 vezes.',
    severidade: POLITICAS_DEMO.T3.severidade,
    ...politicaDe('T3'),
    entidades: ['emp-1', 'con-1'],
    evidencias: [
      {
        descricao: 'Capital social (tabela Empresas do CNPJ)',
        fonte: 'cnpj_arquivo',
        captura_id: 'cap-1',
        url_ou_arquivo: CAPTURAS[0].url_ou_arquivo,
        sha256: CAPTURAS[0].sha256,
      },
      {
        descricao: 'Valor global do contrato (PNCP)',
        fonte: 'pncp',
        captura_id: 'cap-4',
        url_ou_arquivo: CAPTURAS[3].url_ou_arquivo,
        sha256: CAPTURAS[3].sha256,
      },
    ],
    parametros: { razao_maxima: 10, razao_observada: 120, capital_social: 10000, valor_global: 1200000 },
  },
  {
    id: 'alr-5',
    tipologia: 'T5',
    titulo: 'Possível fracionamento: 3 contratações de TETA SERVICOS SINTETICA LTDA somam R$ 90.000,00 em 2026',
    motivo:
      'A unidade 1 da PREFEITURA SINTETICA DE EXEMPLOPOLIS assinou em 2026 três contratações de Serviços com TETA ' +
      'SERVICOS SINTETICA LTDA, de R$ 30.000,00 cada: cada uma fica abaixo do limite de dispensa do art. 75, II ' +
      '(R$ 65.492,11), mas a soma é de R$ 90.000,00. É indício a verificar: o contrato no PNCP não diz se houve ' +
      'dispensa, e "mesma natureza" foi aproximada por mesmo fornecedor e mesma categoria do processo.',
    severidade: POLITICAS_DEMO.T5.severidade,
    ...politicaDe('T5'),
    entidades: ['emp-5', 'org-3', 'con-5', 'con-6', 'con-7'],
    evidencias: [ev('Contratos 000001, 000002 e 000003/2026 da unidade 1, valor inicial de R$ 30.000,00 cada (PNCP)', 'cap-4')],
    parametros: {
      exercicio: '2026',
      orgao_cnpj: '90100001000100',
      codigo_unidade: '1',
      inciso: 'II',
      limite_dispensa: 65492.11,
      fonte_limite: 'Decreto nº 12.807, de 29/12/2025, Anexo (art. 75, caput, I e II, da Lei nº 14.133/2021)',
      soma: 90000,
      contratacoes: 3,
      criterio_natureza: 'fornecedor_e_categoria',
      t5_minimo_contratacoes: 2,
    },
  },
  {
    id: 'alr-8',
    tipologia: 'T8',
    titulo: 'Aditivos de 30% no contrato 90100001000100-2-000004/2026 (limite de 25%)',
    motivo:
      'Os termos do contrato 90100001000100-2-000004/2026, de ZETA COMERCIO SINTETICA LTDA, somam R$ 30.000,00 de valor ' +
      'acrescido (R$ 20.000,00 e R$ 10.000,00) sobre o valor inicial de R$ 100.000,00: 30%, acima do limite de 25% do ' +
      'art. 125 da Lei nº 14.133/2021. É indício a verificar: o PNCP usa o mesmo campo para acréscimo e supressão, e o ' +
      'valor inicial não foi atualizado monetariamente.',
    severidade: POLITICAS_DEMO.T8.severidade,
    ...politicaDe('T8'),
    entidades: ['emp-6', 'con-8'],
    evidencias: [
      ev('Valor inicial do contrato: R$ 100.000,00 (PNCP)', 'cap-4'),
      ev('Termo aditivo 1/2026: valor acrescido de R$ 20.000,00 (PNCP, termos de contrato)', 'cap-7'),
      ev('Termo aditivo 2/2026: valor acrescido de R$ 10.000,00 (PNCP, termos de contrato)', 'cap-12'),
    ],
    parametros: {
      valor_inicial: 100000,
      soma_valor_acrescido: 30000,
      percentual_observado: 30,
      percentual_limite: 25,
      reforma_identificada: false,
      termos_considerados: 2,
      termos_total: 2,
    },
  },
  {
    id: 'alr-9',
    tipologia: 'T9',
    titulo: 'Doadora contratada por PREFEITURA SINTETICA DE EXEMPLOPOLIS após doação a CANDIDATO FICTICIO DE EXEMPLOPOLIS',
    motivo:
      'ETA OBRAS SINTETICA LTDA (CNPJ 90.000.007/0001-04) doou R$ 15.000,00 em 10/09/2024 à campanha de CANDIDATO ' +
      'FICTICIO DE EXEMPLOPOLIS, eleito prefeito de EXEMPLOPOLIS/GO em 2024, e assinou em 15/02/2026 o contrato ' +
      '90100001000100-2-000005/2026 com a PREFEITURA SINTETICA DE EXEMPLOPOLIS, órgão do mesmo município. É indício a ' +
      'verificar: doação registrada é lícita, e o vínculo com o ente é só territorial.',
    severidade: POLITICAS_DEMO.T9.severidade,
    ...politicaDe('T9'),
    entidades: ['emp-7', 'cand-1', 'org-3', 'con-9'],
    evidencias: [
      ev('Receita de campanha: doação de R$ 15.000,00 em 10/09/2024 (TSE, prestação de contas)', 'cap-8'),
      ev('Candidato eleito em EXEMPLOPOLIS/GO, 2024 (TSE, consulta de candidatos)', 'cap-9'),
      ev('Contrato 90100001000100-2-000005/2026, assinado em 15/02/2026 (PNCP)', 'cap-4'),
    ],
    parametros: {
      tipo_doador: 'pessoa_juridica',
      identidade_confirmada: true,
      total_doado: 15000,
      doacoes: 1,
      contratos: 1,
      ente: 'município de EXEMPLOPOLIS/GO',
      situacao_candidato: 'ELEITO',
      ano_eleicao: 2024,
    },
  },
  {
    id: 'alr-10',
    tipologia: 'T9',
    titulo:
      'Possível coincidência: doador sócio de empresa contratada por PREFEITURA SINTETICA DE EXEMPLOPOLIS após doação a CANDIDATO FICTICIO DE EXEMPLOPOLIS',
    motivo:
      'O doador RICARDO FICTICIO LIMA (***666666**) doou R$ 2.000,00 em 12/09/2024 à campanha de CANDIDATO FICTICIO DE ' +
      'EXEMPLOPOLIS, eleito em EXEMPLOPOLIS/GO, e possivelmente coincide com o sócio RICARDO FICTICIO LIMA (***666666**) ' +
      'de TETA SERVICOS SINTETICA LTDA, que assinou 3 contrato(s) com a PREFEITURA SINTETICA DE EXEMPLOPOLIS depois da ' +
      'doação. É indício a verificar. Seis dígitos do CPF e o nome não identificam uma pessoa: é possível coincidência a verificar por outros meios, nunca identificação.',
    severidade: POLITICAS_DEMO.T9.severidade,
    ...politicaDe('T9'),
    entidades: ['pes-7', 'cand-1', 'emp-5', 'org-3', 'con-5', 'con-6', 'con-7', 'pes-5'],
    evidencias: [
      ev('Receita de campanha: doação de R$ 2.000,00 em 12/09/2024, doador RICARDO FICTICIO LIMA (***666666**) (TSE)', 'cap-8'),
      ev('Sócio RICARDO FICTICIO LIMA (***666666**) de TETA SERVICOS SINTETICA LTDA (dados abertos do CNPJ, Sócios)', 'cap-2'),
      ev('Contratos de TETA SERVICOS SINTETICA LTDA com PREFEITURA SINTETICA DE EXEMPLOPOLIS (PNCP)', 'cap-4'),
    ],
    parametros: {
      tipo_doador: 'pessoa_fisica',
      identidade_confirmada: false,
      total_doado: 2000,
      doacoes: 1,
      contratos: 3,
      ente: 'município de EXEMPLOPOLIS/GO',
      situacao_candidato: 'ELEITO',
      ano_eleicao: 2024,
    },
  },
  {
    id: 'alr-11',
    tipologia: 'T10',
    titulo: 'Exigência de certidão negativa de quitação no edital edital_restritivo.txt',
    motivo:
      "O edital edital_restritivo.txt contém 2 ocorrência(s) da expressão 'Exigência de certidão negativa de quitação', " +
      'tratada como cláusula potencialmente restritiva (Manual da Alice, CGU, 2025, seção 2.2). A detecção é textual, por ' +
      'expressão regular explícita, sem modelo de linguagem: a expressão pode aparecer em contexto que não é exigência ' +
      'de habilitação, e a análise jurídica da cláusula é do investigador.',
    severidade: POLITICAS_DEMO.T10.severidade,
    ...politicaDe('T10'),
    entidades: ['edi-1'],
    evidencias: [
      ev('Edital edital_restritivo.txt, linha 12, coluna 31 (caractere 508): trecho literal "certidão negativa de quitação"', 'cap-10'),
      ev('Edital edital_restritivo.txt, linha 27, coluna 58 (caractere 1304): trecho literal "certidao negativa\nde quitacao"', 'cap-10'),
    ],
    parametros: {
      regra: 'certidao_negativa_quitacao',
      expressao: 'certid(?:ão|ao|ões|oes)\\s+negativas?\\s+de\\s+quita(?:ção|cao|çao|cão)',
      fonte_regra: 'Manual da Alice (CGU, 2025), seção 2.2, exemplo citado no backlog (H36)',
      ocorrencias_total: 2,
      ocorrencias: [
        {
          linha: 12,
          coluna: 31,
          posicao: 508,
          trecho: 'certidão negativa de quitação',
          contexto: '8.3. A licitante deverá apresentar certidão negativa de quitação junto ao conselho profissional (texto sintético).',
        },
        {
          linha: 27,
          coluna: 58,
          posicao: 1304,
          trecho: 'certidao negativa\nde quitacao',
          contexto: '9.1. Será inabilitada a empresa que não comprovar certidao negativa\nde quitacao de anuidades (texto sintético).',
        },
      ],
    },
  },
  {
    id: 'alr-2',
    tipologia: 'T2',
    titulo: 'Endereço compartilhado por empresas contratadas',
    motivo:
      'Duas empresas contratadas pela SECRETARIA EXEMPLO DE TECNOLOGIA declaram o mesmo endereço ' +
      `(${ENDERECO_COMUM}): ALFA SOLUÇÕES EM TI LTDA e BETA SERVIÇOS DIGITAIS LTDA.`,
    severidade: POLITICAS_DEMO.T2.severidade,
    ...politicaDe('T2'),
    entidades: ['emp-1', 'emp-2', 'org-1'],
    evidencias: [
      {
        descricao: 'Endereço dos estabelecimentos (tabela Estabelecimentos do CNPJ)',
        fonte: 'cnpj_arquivo',
        captura_id: 'cap-3',
        url_ou_arquivo: CAPTURAS[2].url_ou_arquivo,
        sha256: CAPTURAS[2].sha256,
      },
      {
        descricao: 'Contratos das duas empresas com o mesmo órgão (PNCP)',
        fonte: 'pncp',
        captura_id: 'cap-4',
        url_ou_arquivo: CAPTURAS[3].url_ou_arquivo,
        sha256: CAPTURAS[3].sha256,
      },
    ],
    parametros: { minimo_empresas: 2, empresas_no_endereco: 2 },
  },
];

const FONTE_LIMITES_2026 =
  'Decreto nº 12.807, de 29/12/2025, Anexo (art. 75, caput, I e II, da Lei nº 14.133/2021); https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12807.htm';

/** Configuração das tipologias em vigor no servidor simulado (os limiares de T1 a T3 são os dos alertas acima). */
export const PARAMETROS_TIPOLOGIAS_DEMO = {
  t1_dias_minimos: 90,
  t2_minimo_empresas: 2,
  t3_razao_minima: 10,
  t5_minimo_contratacoes: 2,
  t5_criterio_natureza: 'fornecedor_e_categoria',
  t5_limites_dispensa: { '2026': { inciso_i: 130984.2, inciso_ii: 65492.11, fonte: FONTE_LIMITES_2026 } },
  t8_percentual_limite: 25,
  t8_percentual_limite_reforma: 50,
  t9_situacoes_eleito: ['ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA'],
  t10_expressoes_extras: [] as string[],
};

const POR_EXECUCAO = new Set(['t1_dias_minimos', 't2_minimo_empresas', 't3_razao_minima', 't5_minimo_contratacoes', 't8_percentual_limite', 't8_percentual_limite_reforma']);

const DESCRICAO_PARAMETROS: Record<keyof typeof PARAMETROS_TIPOLOGIAS_DEMO, string> = {
  t1_dias_minimos: 'Dias mínimos entre o início da atividade e a assinatura do contrato.',
  t2_minimo_empresas: 'Número mínimo de empresas no mesmo endereço.',
  t3_razao_minima: 'Razão mínima entre o valor do contrato e o capital social.',
  t5_minimo_contratacoes: 'Número mínimo de contratações somadas.',
  t5_criterio_natureza:
    "Critério de 'mesma natureza': fornecedor_e_categoria = mesmo fornecedor e mesma categoria do processo (categoriaProcesso); categoria = mesma categoria do processo (categoriaProcesso), qualquer fornecedor; fornecedor = mesmo fornecedor, qualquer categoria.",
  t5_limites_dispensa: 'Limites de dispensa por exercício (art. 75, I e II), com a fonte.',
  t8_percentual_limite: 'Limite de acréscimo em % do valor inicial (art. 125).',
  t8_percentual_limite_reforma: 'Limite de acréscimo em % para reforma de edifício ou de equipamento (art. 125).',
  t9_situacoes_eleito: 'Situações de totalização do TSE que contam como eleito.',
  t10_expressoes_extras: 'Expressões regulares além das do código (certidão negativa de quitação; certidão de quitação).',
};

const LEI_14133 = 'Lei nº 14.133/2021 (https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm)';

type NomeParametro = keyof typeof PARAMETROS_TIPOLOGIAS_DEMO;

/** código → [história, regra, base, fontes necessárias, parâmetros]. Cópia resumida do catálogo do back-end. */
const DESCRICOES_TIPOLOGIAS: Record<Tipologia, [string, string, string, string[], NomeParametro[]]> = {
  T1: ['H04', 'Empresa que iniciou a atividade menos de N dias antes de assinar o contrato.', 'Levantamento com o especialista (RF04); limiar: decisão do autor.', ['cnpj_arquivo', 'pncp'], ['t1_dias_minimos']],
  T2: ['H04', 'Endereço normalizado compartilhado por N ou mais empresas, com ao menos uma contratada.', 'Levantamento com o especialista (RF04); limiar: decisão do autor.', ['cnpj_arquivo', 'pncp'], ['t2_minimo_empresas']],
  T3: ['H04', 'Valor global do contrato igual ou maior que N vezes o capital social da contratada.', 'Levantamento com o especialista (RF04); limiar: decisão do autor.', ['cnpj_arquivo', 'pncp'], ['t3_razao_minima']],
  T4: ['H31', 'Estabelecimento contratado com situação cadastral diferente de ATIVA (código 02).', 'Layout dos dados abertos do CNPJ (Receita Federal): 01 NULA, 2 ATIVA, 3 SUSPENSA, 4 INAPTA, 08 BAIXADA.', ['cnpj_arquivo', 'pncp'], []],
  T5: [
    'H32',
    'Contratações da mesma unidade do órgão, no mesmo exercício, de objetos de mesma natureza (critério configurável), cada uma abaixo do limite de dispensa, cujo somatório atinge o limite.',
    `${LEI_14133}, art. 75, I e II, e § 1º; valores de 2026: ${FONTE_LIMITES_2026}.`,
    ['pncp'],
    ['t5_minimo_contratacoes', 't5_criterio_natureza', 't5_limites_dispensa'],
  ],
  T6: ['H33', 'Contratada com registro no CEIS ou no CNEP cujo período cobre a data de assinatura.', 'Cadastros de sanções do Portal da Transparência (CGU): CEIS e CNEP.', ['pncp', 'portal_transparencia (ceis, cnep)'], []],
  T7: [
    'H34',
    'Sócio da contratada cujos seis dígitos visíveis do CPF e o nome normalizado são iguais aos de um servidor do órgão contratante. Possível coincidência, nunca identificação.',
    'Levantamento com o especialista (RF04); CPF descaracterizado no layout do CNPJ (Receita Federal); regra de sugestão sem fusão (RF02).',
    ['cnpj_arquivo', 'pncp', 'portal_transparencia (servidores)'],
    [],
  ],
  T8: [
    'H35',
    'Soma do valor acrescido dos termos do contrato acima de N% do valor inicial (limite maior para reforma de edifício ou de equipamento, identificada pelo objeto).',
    `${LEI_14133}, art. 125 (25% e 50%).`,
    ['pncp', 'pncp_termos'],
    ['t8_percentual_limite', 't8_percentual_limite_reforma'],
  ],
  T9: [
    'H39',
    'Doador de campanha (empresa, ou pessoa física que possivelmente coincide com um sócio) cuja empresa assinou contrato, depois da doação, com órgão do ente do candidato eleito.',
    'Levantamento com o especialista (RF04); dados abertos de prestação de contas do TSE.',
    ['cnpj_arquivo', 'pncp', 'tse_arquivo'],
    ['t9_situacoes_eleito'],
  ],
  T10: [
    'H36',
    'Texto do edital com expressão de cláusula potencialmente restritiva (lista explícita de expressões regulares, sem modelo de linguagem); cada alerta cita o trecho e a posição.',
    'Manual da Alice (CGU, 2025), seção 2.2: exigência de certidão de quitação ou de certidão negativa de quitação.',
    ['edital_arquivo'],
    ['t10_expressoes_extras'],
  ],
};

/** Catálogo de `GET /tipologias` no modo simulado, em ordem numérica. */
export const TIPOLOGIAS_DEMO: TipologiaCatalogo[] = (Object.keys(DESCRICOES_TIPOLOGIAS) as Tipologia[])
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  .map((codigo) => {
    const [historia, regra, base, fontes, nomes] = DESCRICOES_TIPOLOGIAS[codigo];
    const { nome, severidade, prefere_evitar, politica_erro } = POLITICAS_DEMO[codigo];
    return {
      codigo,
      nome,
      historia,
      severidade,
      prefere_evitar,
      politica_erro,
      regra,
      base,
      fontes,
      parametros: nomes.map((n) => ({ nome: n, valor: PARAMETROS_TIPOLOGIAS_DEMO[n], descricao: DESCRICAO_PARAMETROS[n], por_execucao: POR_EXECUCAO.has(n) })),
    };
  });

/**
 * Monitoramento contínuo do caso de demonstração (RF06, H18). A execução do
 * agendador sobre a ZETA refez as coletas de origem e achou um termo aditivo
 * e um registro de sanção novos; a do órgão achou um contrato novo.
 */
export const MONITORAMENTOS_DEMO: Monitoramento[] = [
  {
    id: 'mon-1',
    caso_id: 'caso-1',
    entidade_id: 'emp-6',
    entidade_rotulo: 'ZETA COMERCIO SINTETICA LTDA',
    entidade_tipo: 'empresa',
    entidade_identificador: '90.000.006/0001-51',
    periodicidade_horas: 24,
    ativo: true,
    motivo_inativo: '',
    justificativa: 'Acompanhar sanções e aditivos da contratada (demonstração)',
    criado_por: 'analista.demo',
    criado_em: '2026-11-16T09:30:00Z',
    proxima_execucao_em: '2026-11-17T10:00:00Z',
    ultima_execucao_em: '2026-11-16T10:00:06Z',
    coletas_de_origem: [],
    ultima_execucao: {
      id: 'exe-2',
      monitoramento_id: 'mon-1',
      origem: 'agendador',
      usuario: 'agendador',
      iniciado_em: '2026-11-16T10:00:02Z',
      concluido_em: '2026-11-16T10:00:06Z',
      situacao: 'sucesso',
      coletas: [
        { coleta_id: 'col-11', recoleta_de: 'col-7', fonte: 'pncp_termos', situacao: 'sucesso', mesmo_conteudo: false, motivo: '' },
        { coleta_id: 'col-12', recoleta_de: 'col-5', fonte: 'portal_transparencia', situacao: 'sucesso', mesmo_conteudo: false, motivo: '' },
      ],
      avisos_gerados: 2,
      motivo: '',
    },
  },
  {
    id: 'mon-2',
    caso_id: 'caso-1',
    entidade_id: 'org-3',
    entidade_rotulo: 'PREFEITURA SINTETICA DE EXEMPLOPOLIS',
    entidade_tipo: 'orgao',
    entidade_identificador: '90.100.001/0001-00',
    periodicidade_horas: 168,
    ativo: false,
    motivo_inativo: 'Desativado por delegado.demo.',
    justificativa: 'Acompanhar novos contratos do órgão (demonstração)',
    criado_por: 'delegado.demo',
    criado_em: '2026-11-14T08:00:00Z',
    proxima_execucao_em: '2026-11-22T08:00:00Z',
    ultima_execucao_em: '2026-11-15T08:00:03Z',
    coletas_de_origem: [],
    ultima_execucao: {
      id: 'exe-1',
      monitoramento_id: 'mon-2',
      origem: 'agendador',
      usuario: 'agendador',
      iniciado_em: '2026-11-15T08:00:01Z',
      concluido_em: '2026-11-15T08:00:03Z',
      situacao: 'sucesso',
      coletas: [{ coleta_id: 'col-13', recoleta_de: 'col-3', fonte: 'pncp', situacao: 'sucesso', mesmo_conteudo: false, motivo: '' }],
      avisos_gerados: 1,
      motivo: '',
    },
  },
];

/** Avisos de novidade do caso de demonstração, do mais recente para o mais antigo. */
export const AVISOS_DEMO: Aviso[] = [
  {
    id: 'avi-3',
    caso_id: 'caso-1',
    monitoramento_id: 'mon-1',
    execucao_id: 'exe-2',
    entidade_id: 'emp-6',
    entidade_rotulo: 'ZETA COMERCIO SINTETICA LTDA',
    tipo: 'sancao_nova',
    titulo: 'Sanção nova: ZETA COMERCIO SINTETICA LTDA',
    descricao: 'Novo registro no CEIS para ZETA COMERCIO SINTETICA LTDA: registro sintético 9003, com início em 10/11/2026 e sem data final.',
    detalhes: { cadastro: 'CEIS', id_registro: '9003', data_inicio_sancao: '2026-11-10', data_fim_sancao: null },
    captura_ids: ['cap-13'],
    criado_em: '2026-11-16T10:00:06Z',
    lido_em: null,
    lido_por: null,
  },
  {
    id: 'avi-2',
    caso_id: 'caso-1',
    monitoramento_id: 'mon-1',
    execucao_id: 'exe-2',
    entidade_id: 'emp-6',
    entidade_rotulo: 'ZETA COMERCIO SINTETICA LTDA',
    tipo: 'termo_novo',
    titulo: 'Termo de contrato novo: 90100001000100-2-000004/2026',
    descricao: 'Novo termo aditivo (2/2026) no contrato 90100001000100-2-000004/2026 de ZETA COMERCIO SINTETICA LTDA, com valor acrescido de R$ 10.000,00.',
    detalhes: { contrato: '90100001000100-2-000004/2026', termo: '2/2026', valor_acrescido: 10000 },
    captura_ids: ['cap-12'],
    criado_em: '2026-11-16T10:00:04Z',
    lido_em: null,
    lido_por: null,
  },
  {
    id: 'avi-1',
    caso_id: 'caso-1',
    monitoramento_id: 'mon-2',
    execucao_id: 'exe-1',
    entidade_id: 'org-3',
    entidade_rotulo: 'PREFEITURA SINTETICA DE EXEMPLOPOLIS',
    tipo: 'contrato_novo',
    titulo: 'Contrato novo: PREFEITURA SINTETICA DE EXEMPLOPOLIS',
    descricao: 'Novo contrato 90100001000100-2-000005/2026 da PREFEITURA SINTETICA DE EXEMPLOPOLIS com ETA OBRAS SINTETICA LTDA, de R$ 400.000,00.',
    detalhes: { contrato: '90100001000100-2-000005/2026', fornecedor: '90.000.007/0001-04', valor_global: 400000 },
    captura_ids: ['cap-14'],
    criado_em: '2026-11-15T08:00:03Z',
    lido_em: '2026-11-15T13:20:00Z',
    lido_por: 'delegado.demo',
  },
];

/** Captura cuja verificação simula uma violação de integridade (só na demonstração). */
export const CAPTURA_VIOLADA_DEMO: Id = 'cap-3';

export const TOKENS_DEMO: Record<string, { usuario: string; perfil: string }> = {
  'dev-delegado': { usuario: 'delegado.demo', perfil: 'delegado' },
  'dev-agente': { usuario: 'agente.demo', perfil: 'agente' },
  'dev-analista': { usuario: 'analista.demo', perfil: 'analista' },
  'dev-admin': { usuario: 'admin.demo', perfil: 'admin' },
};

// ---- Horizonte 3 (H22, H23, H37 e H38) ---------------------------------------

/**
 * Contas do modo simulado para o login com senha e segundo fator (H23). São
 * fictícias e só existem no build feito com VITE_MOCK=1. O simulado não calcula
 * TOTP: aceita o código fixo `CODIGO_MFA_DEMO`. A conta `novato.demo` ainda não
 * cadastrou o segundo fator e passa pela etapa de cadastro.
 */
export interface ContaDemo {
  nome: string;
  perfil: PerfilUsuario;
  senha: string;
  mfa_ativo: boolean;
  ativo: boolean;
}

export const CONTAS_DEMO: Record<string, ContaDemo> = {
  'analista.demo': { nome: 'Analista de Demonstração', perfil: 'analista', senha: 'Demonstracao-Analista-2026', mfa_ativo: true, ativo: true },
  'delegado.demo': { nome: 'Delegado de Demonstração', perfil: 'delegado', senha: 'Demonstracao-Delegado-2026', mfa_ativo: true, ativo: true },
  'admin.demo': { nome: 'Administrador de Demonstração', perfil: 'admin', senha: 'Demonstracao-Admin-2026', mfa_ativo: true, ativo: true },
  'novato.demo': { nome: 'Analista sem segundo fator', perfil: 'analista', senha: 'Demonstracao-Novato-2026', mfa_ativo: false, ativo: true },
};

/** Código aceito pelo simulado na etapa do segundo fator. */
export const CODIGO_MFA_DEMO = '123456';

/** Segredo TOTP fictício (Base32) mostrado no cadastro do segundo fator do simulado. */
export const SEGREDO_MFA_DEMO = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/** Falhas seguidas (senha ou código) que bloqueiam a conta no simulado, como o padrão do back-end. */
export const MAX_FALHAS_LOGIN_DEMO = 5;

/** Equipe do caso de demonstração: quem criou o caso é o responsável. */
export const MEMBROS_DEMO: Membro[] = [
  { usuario: 'analista.demo', papel: 'responsavel', adicionado_por: 'analista.demo', adicionado_em: '2026-11-11T12:00:00Z' },
  { usuario: 'delegado.demo', papel: 'investigador', adicionado_por: 'analista.demo', adicionado_em: '2026-11-11T12:10:00Z' },
  { usuario: 'agente.demo', papel: 'leitor', adicionado_por: 'analista.demo', adicionado_em: '2026-11-12T09:00:00Z' },
];

export const ANOTACOES_DEMO: Anotacao[] = [
  {
    id: 'ano-2',
    alvo_tipo: 'entidade',
    alvo_id: 'edi-1',
    alvo_rotulo: 'edital_restritivo.txt',
    autor: 'delegado.demo',
    criado_em: '2026-11-16T09:30:00Z',
    texto: 'Conferir se a exigência de certidão foi mantida na versão republicada do edital (dado sintético).',
  },
  {
    id: 'ano-1',
    alvo_tipo: 'entidade',
    alvo_id: 'emp-5',
    alvo_rotulo: 'TETA SERVICOS SINTETICA LTDA',
    autor: 'analista.demo',
    criado_em: '2026-11-15T14:00:00Z',
    texto: 'Três contratos com o mesmo órgão depois da doação. Pedir os processos de contratação (dado sintético).',
  },
];

export const TAREFAS_DEMO: Tarefa[] = [
  {
    id: 'tar-1',
    titulo: 'Pedir os processos de contratação ao órgão',
    descricao: 'Ofício à PREFEITURA SINTETICA DE EXEMPLOPOLIS pedindo os três processos (dado sintético).',
    responsavel: 'delegado.demo',
    situacao: 'aberta',
    prazo: '2026-11-10',
    atrasada: true,
    criado_por: 'analista.demo',
    criado_em: '2026-11-12T10:00:00Z',
    atualizado_em: '2026-11-12T10:00:00Z',
    historico: [
      {
        usuario: 'analista.demo',
        quando: '2026-11-12T10:00:00Z',
        alteracoes: {
          titulo: { de: null, para: 'Pedir os processos de contratação ao órgão' },
          responsavel: { de: null, para: 'delegado.demo' },
          situacao: { de: null, para: 'aberta' },
          prazo: { de: null, para: '2026-11-10' },
        },
      },
    ],
  },
  {
    id: 'tar-2',
    titulo: 'Revisar as sugestões da IA sobre o edital',
    descricao: '',
    responsavel: 'analista.demo',
    situacao: 'em_andamento',
    prazo: '2099-12-01',
    atrasada: false,
    criado_por: 'delegado.demo',
    criado_em: '2026-11-14T08:00:00Z',
    atualizado_em: '2026-11-15T11:00:00Z',
    historico: [
      {
        usuario: 'delegado.demo',
        quando: '2026-11-14T08:00:00Z',
        alteracoes: {
          titulo: { de: null, para: 'Revisar as sugestões da IA sobre o edital' },
          responsavel: { de: null, para: null },
          situacao: { de: null, para: 'aberta' },
          prazo: { de: null, para: '2099-12-01' },
        },
      },
      {
        usuario: 'analista.demo',
        quando: '2026-11-15T11:00:00Z',
        alteracoes: { responsavel: { de: null, para: 'analista.demo' }, situacao: { de: 'aberta', para: 'em_andamento' } },
      },
    ],
  },
  {
    id: 'tar-3',
    titulo: 'Coletar os dados abertos do CNPJ das contratadas',
    descricao: '',
    responsavel: 'analista.demo',
    situacao: 'concluida',
    prazo: null,
    atrasada: false,
    criado_por: 'analista.demo',
    criado_em: '2026-11-11T12:30:00Z',
    atualizado_em: '2026-11-11T16:00:00Z',
    historico: [
      {
        usuario: 'analista.demo',
        quando: '2026-11-11T12:30:00Z',
        alteracoes: {
          titulo: { de: null, para: 'Coletar os dados abertos do CNPJ das contratadas' },
          responsavel: { de: null, para: 'analista.demo' },
          situacao: { de: null, para: 'aberta' },
          prazo: { de: null, para: null },
        },
      },
      { usuario: 'analista.demo', quando: '2026-11-11T16:00:00Z', alteracoes: { situacao: { de: 'aberta', para: 'concluida' } } },
    ],
  },
];

/** Captura do texto do edital sintético (a mesma do atributo `captura_texto_id` da entidade `edi-1`). */
export const CAPTURA_EDITAL_DEMO: Id = 'cap-10';

/**
 * Texto dos documentos capturados, por captura (`GET .../capturas/{id}/texto`).
 * O edital é fictício: órgão, empresa, CNPJs, valores e datas são sintéticos.
 */
export const TEXTOS_CAPTURA_DEMO: Record<string, string> = {
  [String(CAPTURA_EDITAL_DEMO)]: [
    'PREFEITURA SINTETICA DE EXEMPLOPOLIS',
    'CNPJ 90.100.001/0001-00',
    '',
    'EDITAL DE PREGÃO ELETRÔNICO Nº 1/2026 (documento sintético, para demonstração)',
    '',
    '1. DO OBJETO',
    '1.1. Contratação de serviços de suporte técnico de informática para as unidades da Prefeitura.',
    '1.2. O valor estimado da contratação é de R$ 480.000,00 (quatrocentos e oitenta mil reais).',
    '',
    '2. DA SESSÃO PÚBLICA',
    '2.1. A sessão pública será aberta em 15/03/2026, às 10h, no portal de compras do município.',
    '',
    '3. DA HABILITAÇÃO',
    '3.1. A licitante deverá apresentar certidão negativa de quitação junto ao conselho de classe.',
    '3.2. Será exigido atestado de capacidade técnica emitido por pessoa jurídica de direito público.',
    '',
    '4. DAS DISPOSIÇÕES FINAIS',
    '4.1. A atual prestadora dos serviços é TETA SERVICOS SINTETICA LTDA, CNPJ 90.000.004/0001-62.',
    '4.2. Responde pelo edital o pregoeiro FULANO FICTICIO DE TAL, designado pela Portaria nº 1/2026.',
    '4.3. Não havendo quitação das obrigações, a licitante deverá apresentar nova certidao negativa',
    'de quitacao no prazo de cinco dias.',
    '',
    'Exemplopolis, 20 de fevereiro de 2026.',
    '',
  ].join('\n'),
};

/** Provedor e modelo do simulado. Nenhum modelo é chamado: os itens abaixo são fixos. */
export const IA_DEMO = {
  provedor: 'simulado',
  modelo: 'modelo-sintetico-de-demonstracao',
  modelo_versao: 'sintetico-0',
  servidor_versao: '0.0.0-simulado',
  parametros: { temperature: 0, seed: 0, deterministico: true, simulado: true },
  tipos: ['empresa', 'orgao', 'pessoa', 'valor', 'data', 'objeto'],
};

/** Itens que o "modelo" do simulado devolve para o edital sintético. O trecho é literal. */
export const ITENS_IA_DEMO: { tipo: string; valor: string; campos: Record<string, string>; trecho: string; confianca: number | null }[] = [
  {
    tipo: 'orgao',
    valor: 'PREFEITURA SINTETICA DE EXEMPLOPOLIS',
    campos: { cnpj: '90.100.001/0001-00' },
    trecho: 'PREFEITURA SINTETICA DE EXEMPLOPOLIS\nCNPJ 90.100.001/0001-00',
    confianca: 0.97,
  },
  {
    tipo: 'objeto',
    valor: 'serviços de suporte técnico de informática',
    campos: {},
    trecho: 'Contratação de serviços de suporte técnico de informática para as unidades da Prefeitura.',
    confianca: 0.9,
  },
  { tipo: 'valor', valor: 'R$ 480.000,00', campos: {}, trecho: 'O valor estimado da contratação é de R$ 480.000,00', confianca: 0.93 },
  { tipo: 'data', valor: '15/03/2026', campos: {}, trecho: 'A sessão pública será aberta em 15/03/2026', confianca: null },
  {
    tipo: 'empresa',
    valor: 'TETA SERVICOS SINTETICA LTDA',
    campos: { cnpj: '90.000.004/0001-62', papel: 'atual prestadora' },
    trecho: 'A atual prestadora dos serviços é TETA SERVICOS SINTETICA LTDA, CNPJ 90.000.004/0001-62.',
    confianca: 0.88,
  },
  {
    tipo: 'pessoa',
    valor: 'FULANO FICTICIO DE TAL',
    campos: { papel: 'pregoeiro' },
    trecho: 'Responde pelo edital o pregoeiro FULANO FICTICIO DE TAL',
    confianca: 0.71,
  },
];

/** Itens que a verificação automática recusa no simulado, com os motivos que o back-end usa. */
export const RECUSAS_IA_DEMO = [
  { motivo: 'trecho_nao_literal', tipo: 'empresa', valor: 'OMEGA INEXISTENTE SINTETICA LTDA', trecho: 'A vencedora do certame foi OMEGA INEXISTENTE SINTETICA LTDA' },
  { motivo: 'valor_fora_do_trecho', tipo: 'valor', valor: 'R$ 900.000,00', trecho: 'O valor estimado da contratação é de R$ 480.000,00' },
];

export { H as hashSintetico };
