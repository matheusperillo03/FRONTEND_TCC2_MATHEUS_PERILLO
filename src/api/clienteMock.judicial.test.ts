import { describe, expect, it } from 'vitest';
import { bytesDoBlob } from '../hash';
import { cpfSinteticoValido, mascarado, pontuado } from '../test/cpfSintetico';
import { ClienteMock } from './clienteMock';
import { ARQUIVOS_JUDICIAIS_DEMO, DECISAO_JUDICIAL_DEMO, IMPORTACAO_JUDICIAL_DEMO } from './dadosSinteticos';
import { ErroJustificativa } from './erros';

function criar(token = 'dev-delegado', opcoes: { ativa?: boolean; justificativa?: string } = {}) {
  return new ClienteMock({ obterToken: () => token, obterJustificativa: () => opcoes.justificativa ?? 'teste', latenciaMs: 0, importacaoJudicialAtiva: opcoes.ativa });
}

const IMPORTAR = { diretorio: 'caso-sintetico', origem: 'simba' } as const;

describe('RF10: ClienteMock — o módulo de importação sob ordem judicial liga e desliga por opção explícita', () => {
  it('no simulado o módulo vem ligado pela opção dos dados sintéticos; `importacaoJudicialAtiva: false` desliga', async () => {
    expect(IMPORTACAO_JUDICIAL_DEMO.ativa).toBe(true);
    await expect(criar().estadoImportacaoJudicial()).resolves.toMatchObject({
      ativa: true, perfis_autorizados: ['delegado'], arquivos: ['AGENCIAS', 'CONTAS', 'TITULARES', 'EXTRATO', 'ORIGEM_DESTINO'], origens: ['simba', 'oficio', 'midia'], somente_sintetico: true,
    });
    await expect(criar('dev-delegado', { ativa: false }).estadoImportacaoJudicial()).resolves.toMatchObject({ ativa: false });
    // O estado exige só o token: sem justificativa responde; com token errado, 401.
    await expect(criar('dev-analista', { justificativa: '' }).estadoImportacaoJudicial()).resolves.toMatchObject({ ativa: true });
    await expect(criar('errado').estadoImportacaoJudicial()).rejects.toMatchObject({ status: 401 });
  });

  it('desligado: toda rota do caso responde 404 com o motivo, e nada entra na auditoria do módulo', async () => {
    const c = criar('dev-delegado', { ativa: false });
    const chamadas = [
      () => c.listarDecisoesJudiciais('caso-1'),
      () => c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO),
      () => c.importarSobOrdemJudicial('caso-1', 'dj-1', IMPORTAR),
      () => c.listarImportacoesJudiciais('caso-1'),
      () => c.listarRegistrosJudiciais('caso-1'),
    ];
    for (const chamar of chamadas) await expect(chamar()).rejects.toMatchObject({ status: 404, message: expect.stringContaining('está desligado') });
    expect((await c.listarAuditoria('caso-1')).some((e) => e.acao.startsWith('importacao_judicial.'))).toBe(false);
  });
});

describe('RF10 e RNF02: ClienteMock — decisão, importação, quarentena e auditoria (dados sintéticos)', () => {
  it('RNF02: toda rota do caso exige justificativa, inclusive as de leitura', async () => {
    const c = criar('dev-delegado', { justificativa: ' ' });
    await expect(c.listarDecisoesJudiciais('caso-1')).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO)).rejects.toBeInstanceOf(ErroJustificativa);
    await expect(c.listarRegistrosJudiciais('caso-1')).rejects.toBeInstanceOf(ErroJustificativa);
  });

  it('só o perfil autorizado, membro do caso, registra a decisão; os obrigatórios são conferidos', async () => {
    // analista: responsável pelo caso, mas o perfil não é autorizado.
    await expect(criar('dev-analista').registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO)).rejects.toMatchObject({ status: 403 });
    const c = criar();
    for (const campo of ['numero_processo', 'numero_decisao', 'juizo', 'data_decisao', 'periodo_inicio', 'periodo_fim', 'descricao_escopo'] as const) {
      await expect(c.registrarDecisaoJudicial('caso-1', { ...DECISAO_JUDICIAL_DEMO, [campo]: ' ' })).rejects.toMatchObject({ status: 422 });
    }
    await expect(c.registrarDecisaoJudicial('caso-1', { ...DECISAO_JUDICIAL_DEMO, contas: [] })).rejects.toMatchObject({ status: 422 });
    await expect(c.registrarDecisaoJudicial('caso-1', { ...DECISAO_JUDICIAL_DEMO, contas: [{ banco: '999', agencia: '', conta: '1' }] })).rejects.toMatchObject({ status: 422 });
    await expect(c.registrarDecisaoJudicial('caso-1', { ...DECISAO_JUDICIAL_DEMO, periodo_fim: '2025-12-31' })).rejects.toMatchObject({ status: 422 });
    await expect(c.listarDecisoesJudiciais('caso-1')).resolves.toEqual([]);

    const semInvestigados = await c.registrarDecisaoJudicial('caso-1', { ...DECISAO_JUDICIAL_DEMO, investigados: undefined });
    expect(semInvestigados.investigados).toEqual([]);
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    expect(decisao).toMatchObject({
      ...DECISAO_JUDICIAL_DEMO,
      caso_id: 'caso-1',
      registrado_por: 'delegado.demo',
      marca: 'sigiloso: ordem judicial nº Decisão ID 123456 (processo 0000000-00.2026.8.07.0001)',
      importacoes: 0,
    });
    await expect(c.listarDecisoesJudiciais('caso-1')).resolves.toHaveLength(2);
  });

  it('RNF04: o CPF de um investigado nunca é devolvido completo', async () => {
    const cpf = cpfSinteticoValido();
    const decisao = await criar().registrarDecisaoJudicial('caso-1', { ...DECISAO_JUDICIAL_DEMO, investigados: [pontuado(cpf), '90.000.001/0001-00'] });
    expect(decisao.investigados).toEqual([mascarado(cpf), '90000001000100']);
    expect(JSON.stringify(decisao)).not.toContain(cpf);
  });

  it('sem decisão registrada não há importação (404); pasta que não é a sintética é recusada (422)', async () => {
    const c = criar();
    await expect(c.importarSobOrdemJudicial('caso-1', 'dj-inexistente', IMPORTAR)).rejects.toMatchObject({ status: 404 });
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    await expect(c.importarSobOrdemJudicial('caso-1', decisao.id, { ...IMPORTAR, diretorio: 'pasta-real' })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('SINTETICO') });
    await expect(c.importarSobOrdemJudicial('caso-1', decisao.id, { diretorio: 'caso-sintetico', origem: 'email' as never })).rejects.toMatchObject({ status: 422 });
    await expect(c.listarImportacoesJudiciais('caso-1')).resolves.toEqual([]);
  });

  it('importa a pasta sintética: relatório por arquivo com SHA-256, rejeições, quarentena e totais coerentes', async () => {
    const c = criar();
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    const imp = await c.importarSobOrdemJudicial('caso-1', decisao.id, { ...IMPORTAR, descricao_origem: ' Mídia sintética ' });
    expect(imp).toMatchObject({ decisao_id: decisao.id, caso_id: 'caso-1', origem: 'simba', descricao_origem: 'Mídia sintética', importado_por: 'delegado.demo', marca: decisao.marca });
    expect(imp.arquivos.map((a) => a.tipo)).toEqual(['AGENCIAS', 'CONTAS', 'TITULARES', 'EXTRATO', 'ORIGEM_DESTINO']);
    for (const a of imp.arquivos) {
      expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(a.linhas).toBe(a.aceitas + a.rejeitadas);
      expect(a.em_quarentena).toBeLessThanOrEqual(a.aceitas);
    }
    const extrato = imp.arquivos.find((a) => a.tipo === 'EXTRATO')!;
    expect(extrato).toMatchObject({ linhas: 8, aceitas: 7, rejeitadas: 1, em_quarentena: 2, rejeicoes: [{ linha: 7, campo: 'DATA_LANCAMENTO', motivo: 'data inválida (esperado ddmmaaaa)' }] });
    expect(imp.totais).toEqual({ linhas: 15, aceitas: 14, rejeitadas: 1, em_quarentena: 3 });
    expect((await c.listarDecisoesJudiciais('caso-1'))[0].importacoes).toBe(1);
    await expect(c.listarImportacoesJudiciais('caso-1')).resolves.toHaveLength(1);
  });

  it('registros: marca de sigilo em todos, filtros por tipo, quarentena e decisão, paginação e faixa do limite', async () => {
    const c = criar();
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    // A outra decisão autoriza as duas contas e o ano todo: nada fica em quarentena sob ela.
    const ampla = await c.registrarDecisaoJudicial('caso-1', { ...DECISAO_JUDICIAL_DEMO, numero_decisao: 'Decisão ID 999', periodo_fim: '2026-12-31', contas: [...DECISAO_JUDICIAL_DEMO.contas, { banco: '999', agencia: '00001', conta: '654321' }] });
    await c.importarSobOrdemJudicial('caso-1', decisao.id, IMPORTAR);
    await c.importarSobOrdemJudicial('caso-1', ampla.id, IMPORTAR);

    const todos = await c.listarRegistrosJudiciais('caso-1', { decisao_id: decisao.id });
    expect(todos.total).toBe(14);
    expect(todos.itens.every((r) => r.marca === decisao.marca && r.decisao_id === decisao.id)).toBe(true);
    const quarentena = await c.listarRegistrosJudiciais('caso-1', { decisao_id: decisao.id, quarentena: true });
    expect(quarentena.itens.map((r) => [r.tipo, r.linha])).toEqual([['CONTAS', 2], ['EXTRATO', 6], ['EXTRATO', 8]]);
    expect(quarentena.itens.every((r) => r.quarentena && r.motivo_quarentena.length > 0)).toBe(true);
    expect(quarentena.itens[1].motivo_quarentena).toContain('fora do período da decisão');
    expect(quarentena.itens[2].motivo_quarentena).toContain('fora das contas autorizadas');
    await expect(c.listarRegistrosJudiciais('caso-1', { decisao_id: ampla.id, quarentena: true })).resolves.toMatchObject({ total: 0, itens: [] });
    const fora = await c.listarRegistrosJudiciais('caso-1', { decisao_id: decisao.id, quarentena: false });
    expect(fora.total).toBe(11);
    expect(fora.itens.every((r) => !r.quarentena && r.motivo_quarentena === '')).toBe(true);
    await expect(c.listarRegistrosJudiciais('caso-1', { tipo: 'EXTRATO' })).resolves.toMatchObject({ total: 14 });

    const pagina = await c.listarRegistrosJudiciais('caso-1', { limite: 5, deslocamento: 25 });
    expect(pagina.total).toBe(28);
    expect(pagina.itens).toHaveLength(3);
    await expect(c.listarRegistrosJudiciais('caso-1', { limite: 201 })).rejects.toMatchObject({ status: 422 });
    await expect(c.listarRegistrosJudiciais('caso-1', { limite: 0 })).rejects.toMatchObject({ status: 422 });
    await expect(c.listarRegistrosJudiciais('caso-1', { deslocamento: -1 })).rejects.toMatchObject({ status: 422 });
  });

  it('RNF04: os dados sintéticos e o que a API simulada devolve só trazem CPF descaracterizado', async () => {
    const c = criar();
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    const imp = await c.importarSobOrdemJudicial('caso-1', decisao.id, IMPORTAR);
    const registros = await c.listarRegistrosJudiciais('caso-1', { limite: 200 });
    const tudo = JSON.stringify([ARQUIVOS_JUDICIAIS_DEMO, decisao, imp, registros]);
    expect(tudo).not.toMatch(/(?<![\dA-Za-z.])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\dA-Za-z])/);
    expect(tudo).toMatch(/\*{3}\d{6}\*{2}/);
    // Datas em ISO e valores em reais, como no contrato.
    const lancamento = registros.itens.find((r) => r.tipo === 'EXTRATO' && r.linha === 3)!;
    expect(lancamento.campos).toMatchObject({ CODIGO_CHAVE_EXTRATO: '3', DATA_LANCAMENTO: '2026-02-10', VALOR_LANCAMENTO: 100, NATUREZA_LANCAMENTO: 'C', NUMERO_CONTA: '123456' });
  });

  it('RNF02: cada chamada, inclusive GET, gera entrada na auditoria; a recusa por perfil também', async () => {
    const c = criar();
    const acoes = async () => (await c.listarAuditoria('caso-1')).filter((e) => e.acao.startsWith('importacao_judicial.')).map((e) => e.acao);
    await c.listarDecisoesJudiciais('caso-1');
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    await c.importarSobOrdemJudicial('caso-1', decisao.id, IMPORTAR);
    await c.listarImportacoesJudiciais('caso-1');
    await c.listarRegistrosJudiciais('caso-1');
    await c.listarRegistrosJudiciais('caso-1', { quarentena: true });
    expect(await acoes()).toEqual([
      'importacao_judicial.decisoes_listar',
      'importacao_judicial.decisao_registrar',
      'importacao_judicial.importar',
      'importacao_judicial.importacoes_listar',
      'importacao_judicial.registros_listar',
      'importacao_judicial.registros_listar',
    ]);
    await expect(c.verificarAuditoria()).resolves.toMatchObject({ integra: true });

    const analista = criar('dev-analista');
    await expect(analista.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO)).rejects.toMatchObject({ status: 403 });
    expect((await analista.listarAuditoria('caso-1')).some((e) => e.acao === 'importacao_judicial.acesso_negado')).toBe(true);
  });

  it('papel no caso: o leitor não importa nem vê os registros (403); quem não é membro não vê nada', async () => {
    const delegado = criar();
    const tokens: Record<string, string> = { delegado: 'dev-delegado', agente: 'dev-agente', admin: 'dev-admin' };
    // Os três compartilham o mesmo estado do simulado.
    let atual = 'delegado';
    const c = new ClienteMock({ obterToken: () => tokens[atual], obterJustificativa: () => 'teste', latenciaMs: 0, importacaoJudicialAtiva: true });
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    atual = 'agente';
    await expect(c.listarDecisoesJudiciais('caso-1')).resolves.toHaveLength(1);
    await expect(c.importarSobOrdemJudicial('caso-1', decisao.id, IMPORTAR)).rejects.toMatchObject({ status: 403 });
    await expect(c.listarRegistrosJudiciais('caso-1')).rejects.toMatchObject({ status: 403 });
    atual = 'admin';
    await expect(c.listarDecisoesJudiciais('caso-1')).rejects.toMatchObject({ status: 403 });
    await expect(delegado.listarDecisoesJudiciais('caso-inexistente')).rejects.toMatchObject({ status: 404 });
  });

  it('RNF04: o dado sob ordem judicial fica separado do dado aberto (fora de entidades, grafo, relatório e exportação)', async () => {
    const c = criar();
    const antes = { entidades: await c.buscarEntidades('caso-1', ''), caso: (await c.obterCaso('caso-1')).contagens };
    const decisao = await c.registrarDecisaoJudicial('caso-1', DECISAO_JUDICIAL_DEMO);
    await c.importarSobOrdemJudicial('caso-1', decisao.id, IMPORTAR);
    expect(await c.buscarEntidades('caso-1', '')).toEqual(antes.entidades);
    expect((await c.obterCaso('caso-1')).contagens).toEqual(antes.caso);
    const grafo = await c.obterGrafo('caso-1', 'emp-1', 3);
    const exportacao = new TextDecoder().decode(await bytesDoBlob((await c.exportarGrafo('caso-1', 'csv_entidades')).conteudo));
    const abertos = JSON.stringify([await c.obterRelatorio('caso-1', 'json'), await c.obterRelatorio('caso-1', 'md'), grafo, exportacao, await c.listarColetas('caso-1')]);
    for (const marca of ['sigiloso', 'ALFA SINTETICA LTDA', 'AGENCIA SINTETICA CENTRO', 'CODIGO_CHAVE_EXTRATO', decisao.numero_processo]) expect(abertos).not.toContain(marca);
  });
});
