import { describe, expect, it, vi } from 'vitest';
import { ClienteMock } from './clienteMock';
import { ErroApi, ErroJustificativa } from './erros';
import type { ParametrosCombinacao, ParametrosTipologias } from './tipos';

function criar(token = 'dev-analista', justificativa = 'teste') {
  return new ClienteMock({ obterToken: () => token, obterJustificativa: () => justificativa, latenciaMs: 0 });
}

describe('ClienteMock — mesmas regras do back-end', () => {
  it('rejeita token desconhecido com 401', async () => {
    await expect(criar('errado').me()).rejects.toBeInstanceOf(ErroApi);
  });

  it('identifica usuário e perfil pelo token', async () => {
    await expect(criar('dev-delegado').me()).resolves.toEqual({ usuario: 'delegado.demo', perfil: 'delegado' });
  });

  it('exige justificativa nas consultas ao caso', async () => {
    const c = criar('dev-analista', '');
    await expect(c.listarCasos()).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(c.obterCaso('caso-1')).rejects.toBeInstanceOf(ErroJustificativa);
  });

  it('registra cada consulta na auditoria encadeada e verifica a cadeia', async () => {
    const c = criar();
    await c.buscarEntidades('caso-1', 'alfa');
    await c.obterEntidade('caso-1', 'emp-1');
    const entradas = await c.listarAuditoria('caso-1');
    expect(entradas.map((e) => e.acao)).toContain('buscar_entidades');
    expect(entradas.every((e) => e.justificativa === 'teste')).toBe(true);
    const todas = await c.listarAuditoria();
    for (let i = 1; i < todas.length; i++) expect(todas[i].hash_anterior).toBe(todas[i - 1].hash);
    await expect(c.verificarAuditoria()).resolves.toMatchObject({ integra: true, primeira_quebra: null });
  });

  it('H09/RF11: a busca filtra por tipo de entidade, combinada com o termo', async () => {
    const c = criar();
    const todas = await c.buscarEntidades('caso-1', '');
    const empresas = await c.buscarEntidades('caso-1', '', 'empresa');
    expect(empresas.length).toBeGreaterThan(0);
    expect(empresas.length).toBeLessThan(todas.length);
    expect(empresas.every((e) => e.tipo === 'empresa')).toBe(true);
    expect(empresas).toEqual(todas.filter((e) => e.tipo === 'empresa'));
    const pessoasAlfa = await c.buscarEntidades('caso-1', 'alfa', 'pessoa');
    expect(pessoasAlfa.every((e) => e.tipo === 'pessoa')).toBe(true);
    expect(await c.buscarEntidades('caso-1', '', 'convenio')).toEqual([]);
  });

  it('relatório: entradas de auditoria só para delegado; para analista a lista vem vazia', async () => {
    const analista = JSON.parse(await criar('dev-analista').obterRelatorio('caso-1', 'json'));
    expect(analista.auditoria.entradas_do_caso).toEqual([]);
    expect(analista.auditoria.integra).toBe(true);
    const delegado = JSON.parse(await criar('dev-delegado').obterRelatorio('caso-1', 'json'));
    expect(delegado.auditoria.entradas_do_caso.length).toBeGreaterThan(0);
  });

  it('grafo e caminho respeitam a topologia sintética', async () => {
    const c = criar();
    const g1 = await c.obterGrafo('caso-1', 'emp-1', 1);
    expect(g1.nos.map((n) => String(n.id)).sort()).toEqual(['con-1', 'emp-1', 'emp-2', 'pes-1', 'pes-2']);
    const caminho = await c.obterCaminho('caso-1', 'pes-2', 'org-1');
    expect(caminho.nos.length).toBeGreaterThan(2);
    expect(caminho.arestas.length).toBe(caminho.nos.length - 1);
  });

  it('executa tipologias e devolve T1 a T10, as L e a combinação por severidade, com evidências e hash', async () => {
    const c = criar();
    const alertas = await c.executarAlertas('caso-1');
    // Severidade primeiro; dentro dela, o código como texto (COMB e L antes de T; T10 antes de T2), como no back-end.
    expect(alertas.map((a) => a.tipologia)).toEqual(['COMB', 'COMB', 'T4', 'T6', 'T7', 'L6', 'T1', 'T3', 'T5', 'T8', 'T9', 'T9', 'L14', 'T10', 'T2']);
    expect(alertas.map((a) => a.severidade)).toEqual([...Array(5).fill('alta'), ...Array(7).fill('media'), ...Array(3).fill('baixa')]);
    expect(alertas.every((a) => a.politica_erro?.startsWith('Prefere evitar falso') && a.situacao === 'pendente')).toBe(true);
    for (const a of alertas) for (const ev of a.evidencias) expect(ev.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ClienteMock — horizonte 1 do backlog', () => {
  const CASO = { titulo: 'Caso', descricao: '', numero_procedimento: '', finalidade: 'Apurar o contrato sintético', retencao_ate: '2099-12-31' };

  it('H17: o caso exige finalidade e prazo de retenção', async () => {
    const c = criar();
    await expect(c.criarCaso({ ...CASO, finalidade: ' ' })).rejects.toMatchObject({ status: 422 });
    await expect(c.criarCaso({ ...CASO, retencao_ate: '' })).rejects.toMatchObject({ status: 422 });
    await expect(c.criarCaso({ ...CASO, retencao_ate: '2000-01-01' })).rejects.toMatchObject({ status: 422 });
    const caso = await c.criarCaso(CASO);
    expect(caso).toMatchObject({ finalidade: 'Apurar o contrato sintético', retencao_ate: '2099-12-31', somente_leitura: false });
  });

  it('H17: caso vencido recusa coleta, consulta e decisão, registra a recusa e continua legível', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
      const c = criar('dev-delegado');
      const caso = await c.criarCaso({ ...CASO, retencao_ate: '2026-11-16' });
      // O último dia do prazo ainda vale.
      await c.iniciarColeta(caso.id, { fonte: 'cnpj_arquivo', parametros: { diretorio: 'cnpj' } });
      const [alerta] = await c.executarAlertas(caso.id);
      vi.setSystemTime(new Date('2026-11-17T00:00:01Z'));
      await expect(c.iniciarColeta(caso.id, { fonte: 'pncp', parametros: { dataInicial: '20260101', dataFinal: '20260331', max_paginas: 1 } })).rejects.toMatchObject({ status: 403 });
      await expect(c.buscarEntidades(caso.id, '')).rejects.toMatchObject({ status: 403 });
      await expect(c.executarAlertas(caso.id)).rejects.toMatchObject({ status: 403 });
      if (alerta) await expect(c.decidirAlerta(caso.id, alerta.id, { decisao: 'confirmado', justificativa: 'tarde demais' })).rejects.toMatchObject({ status: 403 });
      const recusas = (await c.listarAuditoria(caso.id)).filter((e) => e.acao === 'caso.retencao_recusa');
      expect(recusas.length).toBeGreaterThanOrEqual(3);
      expect((recusas[0].detalhes as Record<string, unknown>).retencao_ate).toBe('2026-11-16');
      await expect(c.obterCaso(caso.id)).resolves.toMatchObject({ somente_leitura: true });
      await expect(c.obterRelatorio(caso.id, 'md')).resolves.toContain('vencido: caso só para leitura');
      await expect(c.listarColetas(caso.id)).resolves.toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('H12: decisão exige justificativa, fica no alerta, mantém o histórico na revisão e gera evento', async () => {
    const c = criar('dev-delegado');
    const [alerta] = await c.executarAlertas('caso-1');
    await expect(c.decidirAlerta('caso-1', alerta.id, { decisao: 'confirmado', justificativa: '  ' })).rejects.toMatchObject({ status: 422 });
    await expect(c.decidirAlerta('caso-1', 'inexistente', { decisao: 'confirmado', justificativa: 'ok' })).rejects.toMatchObject({ status: 404 });
    const confirmado = await c.decidirAlerta('caso-1', alerta.id, { decisao: 'confirmado', justificativa: 'Conferido no cadastro' });
    expect(confirmado).toMatchObject({ situacao: 'confirmado', decisao: { usuario: 'delegado.demo', justificativa: 'Conferido no cadastro' } });
    const revisto = await c.decidirAlerta('caso-1', alerta.id, { decisao: 'descartado', justificativa: 'Revisto' });
    expect(revisto.situacao).toBe('descartado');
    expect(revisto.decisoes?.map((d) => d.decisao)).toEqual(['confirmado', 'descartado']);
    // A reexecução das tipologias mantém a decisão.
    const reexecutados = await c.executarAlertas('caso-1');
    expect(reexecutados.find((a) => a.id === alerta.id)?.decisoes).toHaveLength(2);
    const eventos = (await c.listarAuditoria('caso-1')).filter((e) => e.acao === 'alerta.decidir');
    expect(eventos.map((e) => (e.detalhes as Record<string, unknown>).revisao)).toEqual([false, true]);
  });

  it('H14 e H15: coleta registra conector, situação e tentativas; a recoleta compara e não apaga', async () => {
    const c = criar();
    // As três coletas mais antigas são as do horizonte 1 (as do horizonte 2 vêm antes, por serem mais recentes).
    const historico = (await c.listarColetas('caso-1')).slice(-3);
    expect(historico.map((x) => x.situacao)).toEqual(['sucesso', 'falha', 'sucesso']);
    expect(historico[1]).toMatchObject({ fonte: 'pncp', tentativas: 3 });
    expect(historico[1].motivo).toContain('HTTP 503');
    await expect(c.iniciarColeta('caso-1', { fonte: 'cnpj_arquivo', parametros: { diretorio: ' ' } })).rejects.toMatchObject({ status: 422 });
    expect((await c.listarColetas('caso-1'))[0]).toMatchObject({ situacao: 'falha', tentativas: 0 });

    const antes = (await c.obterCaso('caso-1')).contagens!.capturas;
    const recoleta = await c.recoletar('caso-1', 'col-1');
    expect(recoleta).toMatchObject({ situacao: 'sucesso', conector_nome: 'cnpj_arquivo', conector_versao: '1.1.0', recoleta_de: 'col-1' });
    expect(recoleta.comparacao).toMatchObject({ mesmo_conteudo: true, capturas_iguais: 3, capturas_diferentes: 0 });
    expect((await c.obterCaso('caso-1')).contagens!.capturas).toBe(antes + 3);
    await expect(c.obterCaptura('cap-1')).resolves.toMatchObject({ conector_nome: 'cnpj_arquivo', conector_versao: '1.1.0' });
    await expect(c.recoletar('caso-1', 'col-999')).rejects.toMatchObject({ status: 404 });
  });
});

describe('ClienteMock — horizonte 2 do backlog', () => {
  const CASO = { titulo: 'Caso H2', descricao: '', numero_procedimento: '', finalidade: 'Apurar o contrato sintético', retencao_ate: '2099-12-31' };
  const PNCP = { fonte: 'pncp', parametros: { dataInicial: '20260101', dataFinal: '20260331', max_paginas: 1 } } as const;

  it('dados sintéticos: nomes fictícios, CPF só como ***NNNNNN** e CNPJ das bases 900000xx e 901000xx', async () => {
    const c = criar('dev-delegado');
    const entidades = await c.buscarEntidades('caso-1', '');
    const novas = entidades.filter((e) => /^(emp-[5-9]|pes-[5-9]|org-3|san-|cand-|edi-)/.test(String(e.id)));
    expect(new Set(novas.map((e) => e.tipo))).toEqual(new Set(['empresa', 'pessoa', 'orgao', 'sancao', 'candidato', 'edital']));
    for (const e of novas.filter((x) => ['empresa', 'pessoa', 'orgao', 'candidato'].includes(x.tipo))) {
      expect(e.rotulo).toMatch(/SINTETICA|SINTETICO|EXEMPLO|FICTICIO/);
    }
    for (const e of entidades.filter((x) => x.tipo === 'pessoa')) expect(e.identificador).toMatch(/^\*{3}\d{6}\*{2}$/);
    for (const e of novas.filter((x) => x.tipo === 'empresa' || x.tipo === 'orgao')) expect(e.identificador).toMatch(/^90\.[01]00\.0\d{2}\//);

    // Nada do que a API simulada devolve traz 11 dígitos seguidos com cara de CPF.
    const alertas = await c.executarAlertas('caso-1');
    const tudo = JSON.stringify([entidades, alertas, await c.listarAvisos('caso-1'), await c.listarMonitoramentos('caso-1'), await c.obterRelatorio('caso-1', 'json')]);
    expect(tudo).not.toMatch(/(?<![\dA-Za-z.])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\dA-Za-z])/);
  });

  it('há ao menos um alerta de cada tipologia T5 a T10, com as arestas novas no grafo', async () => {
    const c = criar();
    const alertas = await c.executarAlertas('caso-1');
    for (const t of ['T5', 'T6', 'T7', 'T8', 'T9', 'T10']) expect(alertas.some((a) => a.tipologia === t)).toBe(true);
    const t7 = alertas.find((a) => a.tipologia === 'T7')!;
    expect(t7.parametros).toMatchObject({ identidade_confirmada: false, cpf_descaracterizado: '***666666**' });
    expect(alertas.filter((a) => a.tipologia === 'T9').map((a) => a.parametros.identidade_confirmada)).toEqual([true, false]);
    const t10 = alertas.find((a) => a.tipologia === 'T10')!;
    expect(t10.parametros.ocorrencias).toHaveLength(2);
    for (const a of alertas) for (const ev of a.evidencias) expect(ev.sha256).toMatch(/^[0-9a-f]{64}$/);

    const grafo = await c.obterGrafo('caso-1', 'org-3', 3);
    const tipos = new Set(grafo.arestas.map((a) => a.tipo));
    for (const t of ['sancionada_em', 'servidor_de', 'doou_para', 'edital_de']) expect(tipos.has(t as never)).toBe(true);
  });

  it('executarAlertas: seleção de tipologias, limiares por execução e validação das faixas', async () => {
    const c = criar();
    const soT5eT8 = await c.executarAlertas('caso-1', { tipologias: ['T5', 'T8'] });
    expect(soT5eT8.map((a) => a.tipologia)).toEqual(['T5', 'T8']);
    // Limiar mais alto: o aditivo de 30% deixa de passar do limite; quatro contratações não existem.
    const comLimiares = await c.executarAlertas('caso-1', { parametros: { t8_percentual_limite: 35, t5_minimo_contratacoes: 4 } });
    expect(comLimiares.some((a) => a.tipologia === 'T8' || a.tipologia === 'T5')).toBe(false);
    expect(comLimiares.some((a) => a.tipologia === 'T10')).toBe(true);
    await expect(c.executarAlertas('caso-1', { parametros: { t5_minimo_contratacoes: 1 } })).rejects.toMatchObject({ status: 422 });
    await expect(c.executarAlertas('caso-1', { parametros: { t8_percentual_limite: 0 } })).rejects.toMatchObject({ status: 422 });
    await expect(c.executarAlertas('caso-1', { parametros: { t8_percentual_limite_reforma: 1001 } })).rejects.toMatchObject({ status: 422 });
  });

  it('GET /tipologias: catálogo (T1 a T10, as L e COMB) só com o token, sem justificativa e sem entrada na auditoria', async () => {
    const c = criar('dev-delegado', '');
    const catalogo = await c.listarTipologias();
    expect(catalogo.map((t) => t.codigo)).toEqual([
      'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10',
      'L1', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L10', 'L14', 'L15', 'L16',
      'COMB',
    ]);
    const t5 = catalogo.find((t) => t.codigo === 'T5')!;
    expect(t5.parametros.map((p) => [p.nome, p.por_execucao])).toEqual([
      ['t5_minimo_contratacoes', true],
      ['t5_criterio_natureza', false],
      ['t5_limites_dispensa', false],
    ]);
    expect(t5.parametros[2].valor).toMatchObject({ '2026': { inciso_i: 130984.2, inciso_ii: 65492.11 } });
    await expect(criar('errado').listarTipologias()).rejects.toMatchObject({ status: 401 });
    const comJ = criar('dev-delegado');
    await comJ.listarTipologias();
    expect((await comJ.listarAuditoria()).some((e) => e.acao.includes('tipologia'))).toBe(false);
  });

  it('coletas novas: do_caso vira lista explícita, e cada fonte traz as suas entidades', async () => {
    const c = criar();
    const caso = await c.criarCaso(CASO);
    // Sem contratos no caso, "do_caso" não tem o que consultar.
    await expect(c.iniciarColeta(caso.id, { fonte: 'pncp_termos', parametros: { do_caso: true } })).rejects.toMatchObject({ status: 422 });
    await c.iniciarColeta(caso.id, { fonte: 'cnpj_arquivo', parametros: { diretorio: 'cnpj' } });
    await c.iniciarColeta(caso.id, PNCP);

    const ceis = await c.iniciarColeta(caso.id, { fonte: 'portal_transparencia', parametros: { recurso: 'ceis', do_caso: true } });
    expect(ceis).toMatchObject({ situacao: 'sucesso', conector_nome: 'portal_transparencia', conector_versao: '1.0.0', entidades_novas: 1 });
    const [registro] = await c.listarColetas(caso.id);
    expect(registro.parametros.do_caso).toBeUndefined();
    expect(registro.parametros.codigoSancionado).toContain('90000006000151');

    const termos = await c.iniciarColeta(caso.id, { fonte: 'pncp_termos', parametros: { do_caso: true } });
    expect(termos.situacao).toBe('sucesso');
    const contratos = (await c.listarColetas(caso.id))[0].parametros.contratos as { cnpj: string; ano: number; sequencial: number }[];
    expect(contratos).toContainEqual(expect.objectContaining({ cnpj: '90100001000100', ano: 2026, sequencial: 4 }));

    await expect(c.iniciarColeta(caso.id, { fonte: 'portal_transparencia', parametros: { recurso: 'servidores', orgaoServidorLotacao: '90001' } })).rejects.toMatchObject({ status: 422 });
    await c.iniciarColeta(caso.id, { fonte: 'portal_transparencia', parametros: { recurso: 'servidores', orgaoServidorLotacao: '90001', cnpjOrgao: '90100001000100' } });
    await c.iniciarColeta(caso.id, { fonte: 'tse_arquivo', parametros: { diretorio: 'tse', uf: 'GO' } });
    await c.iniciarColeta(caso.id, { fonte: 'edital_arquivo', parametros: { diretorio: 'editais' } });
    await expect(c.iniciarColeta(caso.id, { fonte: 'tse_arquivo', parametros: { diretorio: ' ' } })).rejects.toMatchObject({ status: 422 });

    const tipos = new Set((await c.buscarEntidades(caso.id, '')).map((e) => e.tipo));
    expect(tipos).toEqual(new Set(['empresa', 'pessoa', 'orgao', 'contrato', 'sancao', 'candidato', 'edital']));
    const alertas = await c.executarAlertas(caso.id);
    // T1 a T10, mais L6, L14 e a combinação.
    expect(new Set(alertas.map((a) => a.tipologia)).size).toBe(13);
  });

  it('fonte não configurada: responde sem erro, sem capturas, com o motivo, e não impede as outras fontes', async () => {
    const c = new ClienteMock({ obterToken: () => 'dev-analista', obterJustificativa: () => 'teste', latenciaMs: 0, portalConfigurado: false });
    const caso = await c.criarCaso(CASO);
    await c.iniciarColeta(caso.id, { fonte: 'cnpj_arquivo', parametros: { diretorio: 'cnpj' } });
    await c.iniciarColeta(caso.id, PNCP);
    const r = await c.iniciarColeta(caso.id, { fonte: 'portal_transparencia', parametros: { recurso: 'cnep', do_caso: true } });
    expect(r).toMatchObject({ situacao: 'nao_configurado', captura_ids: [], entidades_novas: 0, tentativas: 0 });
    expect(r.motivo).toContain('PORTAL_TRANSPARENCIA_CHAVE');
    expect(r.avisos).toEqual([r.motivo]);
    expect((await c.listarColetas(caso.id))[0]).toMatchObject({ situacao: 'nao_configurado', fonte: 'portal_transparencia' });
    expect((await c.listarAuditoria(caso.id)).some((e) => e.acao === 'coleta.nao_configurada')).toBe(true);
    await expect(c.iniciarColeta(caso.id, { fonte: 'edital_arquivo', parametros: { diretorio: 'editais' } })).resolves.toMatchObject({ situacao: 'sucesso' });
    // O caso de demonstração guarda um registro assim no histórico.
    expect((await c.listarColetas('caso-1')).filter((x) => x.situacao === 'nao_configurado')).toHaveLength(1);
  });

  it('H18: marcar entidade, mudar a situação e executar o monitoramento, com contagens e auditoria', async () => {
    const c = criar('dev-delegado', 'Acompanhar a contratada');
    const antes = (await c.obterCaso('caso-1')).contagens!;
    expect(antes).toMatchObject({ monitoramentos: 1, avisos_nao_lidos: 2 });
    const lista = await c.listarMonitoramentos('caso-1');
    expect(lista.map((m) => [m.entidade_id, m.ativo])).toEqual([
      ['emp-6', true],
      ['org-3', false],
    ]);
    expect(lista[0].coletas_de_origem.map((o) => o.fonte).sort()).toEqual(['cnpj_arquivo', 'portal_transparencia']);
    expect(lista[0].ultima_execucao).toMatchObject({ origem: 'agendador', situacao: 'sucesso', avisos_gerados: 2 });

    await expect(c.criarMonitoramento('caso-1', { entidade_id: 'inexistente', periodicidade_horas: 24 })).rejects.toMatchObject({ status: 404 });
    await expect(c.criarMonitoramento('caso-1', { entidade_id: 'emp-5', periodicidade_horas: 0 })).rejects.toMatchObject({ status: 422 });
    const novo = await c.criarMonitoramento('caso-1', { entidade_id: 'emp-5', periodicidade_horas: 168 });
    expect(novo).toMatchObject({ entidade_rotulo: 'TETA SERVICOS SINTETICA LTDA', periodicidade_horas: 168, ativo: true, justificativa: 'Acompanhar a contratada', ultima_execucao: null });
    // Um monitoramento por entidade: marcar de novo atualiza a periodicidade, sem duplicar.
    const deNovo = await c.criarMonitoramento('caso-1', { entidade_id: 'emp-5', periodicidade_horas: 720 });
    expect(deNovo.id).toBe(novo.id);
    expect(await c.listarMonitoramentos('caso-1')).toHaveLength(3);

    const coletasAntes = (await c.listarColetas('caso-1')).length;
    const execucao = await c.executarMonitoramento('caso-1', novo.id);
    expect(execucao).toMatchObject({ origem: 'manual', usuario: 'delegado.demo', situacao: 'sucesso', avisos_gerados: 0, avisos: [] });
    expect(execucao.coletas.length).toBeGreaterThan(0);
    expect(execucao.coletas.every((r) => r.mesmo_conteudo === true && r.coleta_id !== null)).toBe(true);
    // Cada recoleta é uma coleta comum do histórico, ligada à de origem.
    const coletasDepois = await c.listarColetas('caso-1');
    expect(coletasDepois).toHaveLength(coletasAntes + execucao.coletas.length);
    expect(coletasDepois[0].recoleta_de).not.toBeNull();

    const desativado = await c.alterarMonitoramento('caso-1', novo.id, { ativo: false });
    expect(desativado).toMatchObject({ ativo: false, motivo_inativo: 'Desativado por delegado.demo.' });
    await expect(c.executarMonitoramento('caso-1', novo.id)).rejects.toMatchObject({ status: 409 });
    await expect(c.alterarMonitoramento('caso-1', 'mon-999', { ativo: true })).rejects.toMatchObject({ status: 404 });
    expect((await c.alterarMonitoramento('caso-1', novo.id, { ativo: true, periodicidade_horas: 24 })).periodicidade_horas).toBe(24);
    expect((await c.obterCaso('caso-1')).contagens!.monitoramentos).toBe(2);

    const acoes = (await c.listarAuditoria('caso-1')).map((e) => e.acao);
    for (const acao of ['monitoramento.criar', 'monitoramento.reativar', 'monitoramento.iniciar', 'monitoramento.executar', 'monitoramento.alterar']) {
      expect(acoes).toContain(acao);
    }
  });

  it('H18: avisos do mais recente para o mais antigo, filtro de não lidos e marcação de leitura', async () => {
    const c = criar();
    const avisos = await c.listarAvisos('caso-1');
    expect(avisos.map((a) => a.tipo)).toEqual(['sancao_nova', 'termo_novo', 'contrato_novo']);
    expect(avisos.map((a) => !!a.lido_em)).toEqual([false, false, true]);
    expect(await c.listarAvisos('caso-1', true)).toHaveLength(2);

    const lido = await c.marcarAvisoLido('caso-1', avisos[0].id);
    expect(lido).toMatchObject({ lido_por: 'analista.demo' });
    expect(lido.lido_em).toBeTruthy();
    // Marcar de novo não troca quem leu nem quando.
    await expect(c.marcarAvisoLido('caso-1', avisos[0].id)).resolves.toMatchObject({ lido_em: lido.lido_em });
    expect(await c.listarAvisos('caso-1', true)).toHaveLength(1);
    expect((await c.obterCaso('caso-1')).contagens!.avisos_nao_lidos).toBe(1);
    await expect(c.marcarAvisoLido('caso-1', 'avi-999')).rejects.toMatchObject({ status: 404 });
    await expect(criar('dev-analista', '').listarAvisos('caso-1')).rejects.toBeInstanceOf(ErroJustificativa);
  });

  it('H18 e H17: caso vencido não é monitorado, mas ainda permite desativar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
      const c = criar('dev-delegado');
      const caso = await c.criarCaso({ ...CASO, retencao_ate: '2026-11-16' });
      await c.iniciarColeta(caso.id, PNCP);
      const m = await c.criarMonitoramento(caso.id, { entidade_id: 'org-3', periodicidade_horas: 24 });
      vi.setSystemTime(new Date('2026-11-17T00:00:01Z'));
      await expect(c.executarMonitoramento(caso.id, m.id)).rejects.toMatchObject({ status: 403 });
      await expect(c.criarMonitoramento(caso.id, { entidade_id: 'org-3', periodicidade_horas: 24 })).rejects.toMatchObject({ status: 403 });
      await expect(c.alterarMonitoramento(caso.id, m.id, { ativo: false })).resolves.toMatchObject({ ativo: false });
      await expect(c.alterarMonitoramento(caso.id, m.id, { ativo: true })).rejects.toMatchObject({ status: 403 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RF04: ClienteMock com as tipologias de lavagem (dados sintéticos)', () => {
  it('catálogo: cada item traz o grupo, a marca de sinal fraco e o peso; os parâmetros estruturados novos vêm com a fonte', async () => {
    const catalogo = await criar().listarTipologias();
    expect(new Set(catalogo.filter((t) => t.codigo.startsWith('T')).map((t) => t.grupo))).toEqual(new Set(['contratacao']));
    expect(new Set(catalogo.filter((t) => t.codigo.startsWith('L')).map((t) => t.grupo))).toEqual(new Set(['lavagem']));
    expect(catalogo.find((t) => t.codigo === 'COMB')).toMatchObject({ grupo: 'combinacao', severidade: 'alta', sinal_fraco: false, peso: 0 });
    expect(catalogo.filter((t) => t.sinal_fraco).map((t) => [t.codigo, t.peso])).toEqual([['L14', 0.5], ['L15', 0.5]]);
    expect(catalogo.find((t) => t.codigo === 'L8')).toMatchObject({ severidade: 'alta', peso: 0 });
    expect(Object.fromEntries(catalogo.filter((t) => t.codigo.startsWith('L')).map((t) => [t.codigo, t.severidade]))).toEqual({
      L1: 'baixa', L3: 'media', L4: 'media', L5: 'baixa', L6: 'media', L7: 'media', L8: 'alta', L10: 'media', L14: 'baixa', L15: 'baixa', L16: 'media',
    });
    const l6 = catalogo.find((t) => t.codigo === 'L6')!;
    const limites = l6.parametros.find((p) => p.nome === 'l6_limites')!;
    expect(limites.por_execucao).toBe(false);
    expect(limites.valor).toMatchObject({
      mei: { '2012': { anual: 60000, mensal_inicio: 5000 }, '2018': { anual: 81000, mensal_inicio: 6750 }, '2027': { anual: 110000 }, '2028': { anual: 140000 } },
      me: { anual: 360000 },
      epp: { anual: 4800000 },
      me_por_ano: { '2012': { anual: 360000 } },
      epp_por_ano: { '2012': { anual: 3600000 }, '2018': { anual: 4800000 } },
      primeiro_ano: 2012,
    });
    expect(l6.parametros.map((p) => p.nome)).toEqual(['l6_limites']);
    const comb = catalogo.find((t) => t.codigo === 'COMB')!;
    expect(comb.parametros.map((p) => [p.nome, p.por_execucao])).toEqual([['comb_minimo_tipologias', true], ['comb_peso_minimo', true], ['comb_pesos', false]]);
    expect(comb.parametros[2].valor).toMatchObject({ T1: 1, L8: 0, L14: 0.5, COMB: 0 });
  });

  it('RF12: há um alerta L normal e um sinal fraco, explicados como os T (motivo, evidências com hash e política de erro)', async () => {
    const alertas = await criar().executarAlertas('caso-1');
    const l6 = alertas.find((a) => a.tipologia === 'L6')!;
    expect(l6).toMatchObject({ grupo: 'lavagem', sinal_fraco: false, peso: 1, severidade: 'media', situacao: 'pendente' });
    const l14 = alertas.find((a) => a.tipologia === 'L14')!;
    expect(l14).toMatchObject({ grupo: 'lavagem', sinal_fraco: true, peso: 0.5, severidade: 'baixa' });
    for (const a of [l6, l14]) {
      expect(a.motivo.length).toBeGreaterThan(50);
      expect(a.politica_erro).toMatch(/^Prefere evitar falso/);
      expect(a.evidencias.length).toBeGreaterThan(0);
      for (const ev of a.evidencias) expect(ev.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // A idade é dado pessoal: o alerta só fala em faixa etária.
    expect(JSON.stringify(l14)).not.toMatch(/data_nascimento|\bidade\b\s*:/);
    expect(alertas.filter((a) => a.tipologia.startsWith('T')).every((a) => a.grupo === 'contratacao' && a.sinal_fraco === false && a.peso === 1)).toBe(true);
  });

  it('RF14: o alerta de combinação é coerente com os componentes (pesos, soma, tipologias distintas e mínimos)', async () => {
    const alertas = await criar().executarAlertas('caso-1');
    const combinacoes = alertas.filter((a) => a.tipologia === 'COMB');
    expect(combinacoes.map((a) => a.entidades)).toEqual([['emp-1'], ['emp-6']]);
    for (const comb of combinacoes) {
      const p = comb.parametros as ParametrosCombinacao;
      const componentes = p.componentes!;
      // Cada componente aponta para um alerta que existe, da mesma entidade, com o mesmo título e peso.
      for (const c of componentes) {
        const alvo = alertas.find((a) => a.id === c.alerta_id)!;
        expect(alvo).toMatchObject({ tipologia: c.tipologia, titulo: c.titulo, peso: c.peso, sinal_fraco: c.sinal_fraco });
        expect(alvo.entidades[0]).toBe(p.entidade_id);
      }
      const contam = componentes.filter((c) => c.conta);
      expect(p.soma_pesos).toBe(contam.reduce((s, c) => s + c.peso, 0));
      expect(p.tipologias_distintas).toBe(new Set(contam.map((c) => c.tipologia)).size);
      expect(p.soma_pesos!).toBeGreaterThanOrEqual(p.comb_peso_minimo!);
      expect(p.tipologias_distintas!).toBeGreaterThanOrEqual(p.comb_minimo_tipologias!);
      expect(p.aviso).toMatch(/^Não é escore de culpa/);
      expect(comb).toMatchObject({ grupo: 'combinacao', severidade: 'alta', peso: 0, sinal_fraco: false });
      expect(comb.evidencias.length).toBeGreaterThan(0);
    }
    const alfa = combinacoes[0].parametros as ParametrosCombinacao;
    expect(alfa).toMatchObject({ entidade_rotulo: 'ALFA SOLUÇÕES EM TI LTDA', entidade_tipo: 'empresa', tipologias_distintas: 5, soma_pesos: 4.5, comb_minimo_tipologias: 2, comb_peso_minimo: 2 });
    expect(alfa.componentes!.map((c) => c.tipologia).sort()).toEqual(['L14', 'L6', 'T1', 'T2', 'T3']);
  });

  it('RF12 e RF14: alerta descartado sai da combinação na execução seguinte; a decisão sobre a combinação é mantida', async () => {
    const c = criar();
    const antes = await c.executarAlertas('caso-1');
    const zeta = antes.find((a) => a.id === 'alr-comb-emp-6')!;
    expect((zeta.parametros as ParametrosCombinacao).componentes!.map((x) => x.tipologia).sort()).toEqual(['T6', 'T8']);
    await c.decidirAlerta('caso-1', 'alr-comb-emp-1', { decisao: 'confirmado', justificativa: 'Sinais conferidos nos documentos' });
    await c.decidirAlerta('caso-1', 'alr-8', { decisao: 'descartado', justificativa: 'Aditivo de reequilíbrio, fora do art. 125' });

    const depois = await c.executarAlertas('caso-1');
    // Sem a T8, a ZETA fica com uma tipologia só: a combinação dela deixa de existir.
    expect(depois.filter((a) => a.tipologia === 'COMB').map((a) => a.id)).toEqual(['alr-comb-emp-1']);
    expect(depois.find((a) => a.id === 'alr-comb-emp-1')).toMatchObject({ situacao: 'confirmado' });
    expect(depois.find((a) => a.id === 'alr-8')).toMatchObject({ situacao: 'descartado' });
  });

  it('RF14: limiares por execução da combinação e da L14; sem COMB na seleção, a combinação anterior fica como estava', async () => {
    const c = criar();
    const comMinimos = await c.executarAlertas('caso-1', { parametros: { comb_minimo_tipologias: 3, comb_peso_minimo: 4.5 } });
    expect(comMinimos.filter((a) => a.tipologia === 'COMB').map((a) => a.id)).toEqual(['alr-comb-emp-1']);
    expect(comMinimos[0].parametros).toMatchObject({ comb_minimo_tipologias: 3, comb_peso_minimo: 4.5 });
    expect((await c.executarAlertas('caso-1', { parametros: { comb_peso_minimo: 5 } })).some((a) => a.tipologia === 'COMB')).toBe(false);

    // Valor mínimo da L14 acima do contratado: o sinal fraco some e a soma da ALFA cai para 4.
    const semL14 = await c.executarAlertas('caso-1', { parametros: { l14_valor_minimo: 5_000_000 } });
    expect(semL14.some((a) => a.tipologia === 'L14')).toBe(false);
    expect(semL14.find((a) => a.id === 'alr-comb-emp-1')!.parametros).toMatchObject({ soma_pesos: 4, tipologias_distintas: 4 });

    const soL = await c.executarAlertas('caso-1', { tipologias: ['L6', 'L14'] });
    expect(soL.find((a) => a.id === 'alr-comb-emp-1')!.parametros).toMatchObject({ soma_pesos: 4 });
    expect(soL.some((a) => a.tipologia === 'L14')).toBe(true);
  });

  it('valida as faixas dos limiares novos (422), como o contrato', async () => {
    const c = criar();
    const invalidos: ParametrosTipologias[] = [
      { l1_minimo_estabelecimentos: 1 },
      { l1_janela_abertura_dias: 0 },
      { l3_janela_meses: 1.5 },
      { l4_minimo_niveis: 1 },
      { l7_dias_apos_abertura: -1 },
      { l14_valor_minimo: -0.01 },
      { l15_minimo_cnaes: 1 },
      { l16_dias_minimos: -1 },
      { comb_minimo_tipologias: 1 },
      { comb_peso_minimo: 0 },
    ];
    for (const parametros of invalidos) await expect(c.executarAlertas('caso-1', { parametros })).rejects.toMatchObject({ status: 422 });
    await expect(c.executarAlertas('caso-1', { tipologias: ['L2' as never] })).rejects.toMatchObject({ status: 422 });
    await expect(c.executarAlertas('caso-1', { parametros: { l7_dias_apos_abertura: 0, l14_valor_minimo: 0, l16_dias_minimos: 0, comb_peso_minimo: 0.5 } })).resolves.toBeInstanceOf(Array);
  });

  it('RF01 e RNF04: coleta de CEPIM, convênios e CEAF; no CEAF, "do caso" vira a lista de nomes dos sócios e CPF é recusado', async () => {
    const c = criar();
    const cepim = await c.iniciarColeta('caso-1', { fonte: 'portal_transparencia', parametros: { recurso: 'cepim', do_caso: true } });
    expect(cepim).toMatchObject({ situacao: 'sucesso', captura_ids: [], entidades_novas: 0 });
    expect(cepim.avisos?.[0]).toMatch(/não tem carga sintética/);
    expect((await c.listarColetas('caso-1'))[0].parametros).toMatchObject({ recurso: 'cepim', codigoSancionado: expect.arrayContaining(['90000006000151']) });

    await c.iniciarColeta('caso-1', { fonte: 'portal_transparencia', parametros: { recurso: 'ceaf', do_caso: true } });
    const ceaf = (await c.listarColetas('caso-1'))[0].parametros;
    expect(ceaf.do_caso).toBeUndefined();
    expect(ceaf.nomeSancionado).toEqual(expect.arrayContaining(['JOÃO EXEMPLO DA SILVA']));
    // Só nomes: nada com cara de CPF, nem descaracterizado, vai nos parâmetros do CEAF.
    expect(JSON.stringify(ceaf)).not.toMatch(/\d{6}|codigoSancionado/);

    await expect(c.iniciarColeta('caso-1', { fonte: 'portal_transparencia', parametros: { recurso: 'ceaf', nomeSancionado: ['***123456**'] } })).rejects.toMatchObject({ status: 422 });
    await expect(c.iniciarColeta('caso-1', { fonte: 'portal_transparencia', parametros: { recurso: 'ceaf', nomeSancionado: [] } })).rejects.toMatchObject({ status: 422 });
    await expect(c.iniciarColeta('caso-1', { fonte: 'portal_transparencia', parametros: { recurso: 'ceaf', nomeSancionado: ['FULANO FICTICIO DE TAL'] } })).resolves.toMatchObject({ situacao: 'sucesso' });
    await expect(c.iniciarColeta('caso-1', { fonte: 'portal_transparencia', parametros: { recurso: 'convenios', codigoSancionado: ['90000007000104'] } })).resolves.toMatchObject({ situacao: 'sucesso' });
    // O caso de demonstração não tem entidade sem fins lucrativos.
    await expect(c.iniciarColeta('caso-1', { fonte: 'portal_transparencia', parametros: { recurso: 'convenios', do_caso: true } })).rejects.toMatchObject({ status: 422 });
  });
});
