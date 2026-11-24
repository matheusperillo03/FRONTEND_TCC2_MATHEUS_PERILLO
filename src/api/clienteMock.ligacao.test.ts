/**
 * Ligação de registros de pessoas no modo simulado (decisão do autor de
 * 23/11/2026, opção (a)): H46, H50, H51 e H52. Só dados sintéticos.
 */
import { describe, expect, it } from 'vitest';
import { ClienteMock } from './clienteMock';
import { ErroApi } from './erros';
import { TIPOLOGIAS_LAVAGEM, type EntradaAuditoria } from './tipos';

function criar(token = 'dev-analista', justificativa = 'teste') {
  return new ClienteMock({ obterToken: () => token, obterJustificativa: () => justificativa, latenciaMs: 0 });
}

const erro = (status: number) => expect.objectContaining({ status });
const detalhes = (e: EntradaAuditoria) => (e.detalhes ?? {}) as Record<string, unknown>;

describe('ClienteMock — ligação de registros de pessoas', () => {
  it('H50: a candidata sintética tem duas candidaturas ligadas, sem fusão, e o título eleitoral nunca aparece', async () => {
    const c = criar();
    const de2024 = await c.obterEntidade('caso-1', 'cand-3');
    const de2020 = await c.obterEntidade('caso-1', 'cand-2');
    expect(de2024.outras_candidaturas).toEqual([{ entidade_id: 'cand-2', rotulo: 'MARIA EXEMPLO SOUZA', ano: '2020', cargo: 'VEREADOR', uf: 'GO', situacao_turno: 'ELEITO POR QP' }]);
    expect(de2020.outras_candidaturas?.map((o) => [o.entidade_id, o.ano])).toEqual([['cand-3', '2024']]);
    // Continuam sendo dois registros, cada um com o seu identificador.
    expect([de2020.identificador, de2024.identificador]).toEqual(['2020:800002', '2024:900002']);
    // Quem não é candidato, ou é candidato de uma eleição só, não tem outras candidaturas.
    expect((await c.obterEntidade('caso-1', 'cand-1')).outras_candidaturas).toEqual([]);
    expect((await c.obterEntidade('caso-1', 'pes-2')).outras_candidaturas).toEqual([]);
    // Nem o título nem o resumo dele chegam ao front; do CPF, só os seis dígitos.
    // (`ligacao: "titulo_eleitoral"` só diz como as candidaturas foram ligadas; não há campo com o título.)
    const tudo = JSON.stringify([de2020, de2024, await c.obterPatrimonio('caso-1', 'cand-3')]);
    expect(tudo).not.toMatch(/"[^"]*(titulo|resumo|hmac)[^"]*":/i);
    expect(tudo).not.toMatch(/(^|[^0-9a-f])\d{12}([^0-9a-f]|$)/);
    expect(JSON.stringify([de2020.atributos, de2024.atributos, de2020.sugestoes, de2024.sugestoes])).not.toMatch(/\d{11}/);
    expect(de2024.atributos.cpf_mascarado).toBe('***234567**');
  });

  it('H46: candidato e sócio com os mesmos seis dígitos e o mesmo nome aparecem como sugestão pendente nos dois sentidos', async () => {
    const c = criar();
    const [ida] = (await c.obterEntidade('caso-1', 'cand-3')).sugestoes;
    expect(ida).toMatchObject({ entidade_id: 'pes-2', tipo: 'pessoa', identificador: '***234567**', confianca: 0.9, situacao: 'pendente', decidido_por: null, decidido_em: null, justificativa_decisao: null });
    expect(ida.id).toBeTruthy();
    expect(ida.motivo).toMatch(/seis dígitos/);
    expect(ida.motivo).toMatch(/não foram fundidos/);
    const volta = (await c.obterEntidade('caso-1', 'pes-2')).sugestoes.find((s) => s.entidade_id === 'cand-3');
    expect(volta).toMatchObject({ tipo: 'candidato', situacao: 'pendente' });
    expect(volta!.id).not.toBe(ida.id);
  });

  it('H46: leitor não decide (403), a justificativa e a decisão são validadas (422) e a sugestão precisa existir no caso (404)', async () => {
    const c = criar();
    const [s] = (await c.obterEntidade('caso-1', 'cand-3')).sugestoes;
    const corpo = { decisao: 'confirmado' as const, justificativa: 'Conferido no registro de candidatura' };
    await expect(criar('dev-agente').decidirSugestao('caso-1', s.id!, corpo)).rejects.toEqual(erro(403));
    await expect(c.decidirSugestao('caso-1', s.id!, { decisao: 'confirmado', justificativa: '   ' })).rejects.toEqual(erro(422));
    await expect(c.decidirSugestao('caso-1', s.id!, { decisao: 'fundir' as never, justificativa: 'x' })).rejects.toEqual(erro(422));
    await expect(c.decidirSugestao('caso-1', s.id!, { decisao: 'confirmado', justificativa: 'a'.repeat(501) })).rejects.toEqual(erro(422));
    await expect(c.decidirSugestao('caso-1', 'inexistente', corpo)).rejects.toEqual(erro(404));
    await expect(c.decidirSugestao('caso-1', s.id!, corpo)).resolves.toMatchObject({ situacao: 'confirmado' });
    expect((await c.obterEntidade('caso-1', 'cand-3')).sugestoes[0].situacao).toBe('confirmado');
  });

  it('H46: a decisão vale para o par nos dois sentidos, nunca funde as entidades, pode ser revista e fica na auditoria', async () => {
    const c = criar('dev-delegado');
    const antes = await c.buscarEntidades('caso-1', '');
    const [ida] = (await c.obterEntidade('caso-1', 'cand-3')).sugestoes;
    const r = await c.decidirSugestao('caso-1', ida.id!, { decisao: 'confirmado', justificativa: ' Conferido no registro de candidatura ' });
    expect(r).toMatchObject({ id: ida.id, entidade_id: 'pes-2', situacao: 'confirmado', decidido_por: 'delegado.demo', justificativa_decisao: 'Conferido no registro de candidatura' });
    expect(r.decidido_em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const volta = (await c.obterEntidade('caso-1', 'pes-2')).sugestoes.find((s) => s.entidade_id === 'cand-3')!;
    expect(volta).toMatchObject({ situacao: 'confirmado', decidido_por: 'delegado.demo', decidido_em: r.decidido_em, justificativa_decisao: 'Conferido no registro de candidatura' });
    // Sem fusão: as mesmas entidades, com os mesmos identificadores e atributos.
    expect(await c.buscarEntidades('caso-1', '')).toEqual(antes);
    // Rever pelo outro sentido é uma nova decisão.
    await c.decidirSugestao('caso-1', volta.id!, { decisao: 'descartado', justificativa: 'Homônimo' });
    expect((await c.obterEntidade('caso-1', 'cand-3')).sugestoes[0]).toMatchObject({ situacao: 'descartado', justificativa_decisao: 'Homônimo' });
    const decisoes = (await c.listarAuditoria('caso-1')).filter((e) => e.acao === 'sugestao.decidir');
    expect(decisoes.map((d) => detalhes(d).decisao)).toEqual(['confirmado', 'descartado']);
    expect(decisoes[0]).toMatchObject({ usuario: 'delegado.demo', detalhes: { sugestao_id: ida.id, entidade_id: 'cand-3', candidata_id: 'pes-2', situacao_anterior: 'pendente', revisao: false } });
    expect(decisoes[1].detalhes).toMatchObject({ situacao_anterior: 'confirmado', revisao: true, justificativa_decisao: 'Homônimo' });
    await expect(c.verificarAuditoria()).resolves.toMatchObject({ integra: true });
    // A decisão de um cliente simulado não vaza para outro (os dados sintéticos não são alterados).
    expect((await criar().obterEntidade('caso-1', 'cand-3')).sugestoes[0].situacao).toBe('pendente');
  });

  it('H46: a tentativa do leitor fica na auditoria como acesso negado', async () => {
    const leitor = criar('dev-agente');
    const [s] = (await leitor.obterEntidade('caso-1', 'cand-3')).sugestoes;
    await expect(leitor.decidirSugestao('caso-1', s.id!, { decisao: 'confirmado', justificativa: 'x' })).rejects.toBeInstanceOf(ErroApi);
    const trilha = await leitor.listarAuditoria('caso-1');
    expect(trilha.some((e) => e.acao === 'caso.acesso_negado' && detalhes(e).rota === 'sugestao.decidir')).toBe(true);
    expect(trilha.some((e) => e.acao === 'sugestao.decidir')).toBe(false);
  });

  it('H51: a linha do tempo patrimonial soma os bens por eleição e por tipo, com a captura de origem e a variação', async () => {
    const c = criar();
    const linha = await c.obterPatrimonio('caso-1', 'cand-3');
    expect(linha).toMatchObject({ entidade_id: 'cand-3', ligacao: 'titulo_eleitoral', renda_publica: { conhecida: false } });
    expect(linha.nota).toMatch(/valor informado pelo candidato/);
    expect(linha.renda_publica.motivo).toMatch(/não é gerado/);
    expect(linha.pontos.map((p) => [p.entidade_id, p.ano, p.total, p.quantidade])).toEqual([
      ['cand-2', '2020', 180000, 2],
      ['cand-3', '2024', 455000, 4],
    ]);
    for (const p of linha.pontos) {
      expect(p.bens.reduce((soma, b) => soma + (b.valor ?? 0), 0)).toBe(p.total);
      expect(p.por_tipo.reduce((soma, t) => soma + t.total, 0)).toBe(p.total);
      expect(p.por_tipo.reduce((n, t) => n + t.quantidade, 0)).toBe(p.quantidade);
      expect(p.fonte).toBe('tse_bens');
      const captura = await c.obterCaptura(p.captura_id!);
      expect([captura.sha256, captura.url_ou_arquivo, captura.fonte]).toEqual([p.sha256, p.url_ou_arquivo, 'tse_bens']);
    }
    expect(linha.variacoes).toEqual([{ de_ano: '2020', para_ano: '2024', diferenca: 275000, percentual: 152.78 }]);
    // A mesma linha, pedida a partir da outra candidatura.
    expect((await c.obterPatrimonio('caso-1', 'cand-2')).pontos).toEqual(linha.pontos);
    expect((await c.listarAuditoria('caso-1')).some((e) => e.acao === 'patrimonio.ver')).toBe(true);
  });

  it('H51: candidatura única sem arquivo de bens tem total nulo (não é zero); entidade que não é candidato é recusada (422)', async () => {
    const c = criar();
    const linha = await c.obterPatrimonio('caso-1', 'cand-1');
    expect(linha.ligacao).toBe('candidatura_unica');
    expect(linha.pontos).toHaveLength(1);
    expect(linha.pontos[0]).toMatchObject({ entidade_id: 'cand-1', total: null, quantidade: 0, bens: [], por_tipo: [], captura_id: null, sha256: null, fonte: null, url_ou_arquivo: null });
    expect(linha.variacoes).toEqual([]);
    await expect(c.obterPatrimonio('caso-1', 'pes-2')).rejects.toEqual(erro(422));
    await expect(c.obterPatrimonio('caso-1', 'nao-existe')).rejects.toEqual(erro(404));
  });

  it('H50: a fonte tse_bens exige diretório, só o investigador coleta e a coleta fica no histórico com o conector', async () => {
    const c = criar();
    await expect(c.iniciarColeta('caso-1', { fonte: 'tse_bens', parametros: { diretorio: ' ' } })).rejects.toEqual(erro(422));
    await expect(criar('dev-agente').iniciarColeta('caso-1', { fonte: 'tse_bens', parametros: { diretorio: 'tse/bens' } })).rejects.toEqual(erro(403));
    const r = await c.iniciarColeta('caso-1', { fonte: 'tse_bens', parametros: { diretorio: 'tse/bens', uf: 'GO', do_caso: true } });
    expect(r).toMatchObject({ situacao: 'sucesso', conector_nome: 'tse_bens' });
    expect(r.captura_ids).toHaveLength(2);
    const [ultima] = await c.listarColetas('caso-1');
    expect(ultima).toMatchObject({ fonte: 'tse_bens', situacao: 'sucesso' });
    // `do_caso` é trocado pela lista dos candidatos do caso (SQ_CANDIDATO), como no back-end.
    expect(ultima.parametros).toMatchObject({ diretorio: 'tse/bens', uf: 'GO', candidatos: expect.arrayContaining(['800002', '900002']) });
    expect(ultima.parametros.do_caso).toBeUndefined();
    // O histórico da demonstração já traz a coleta dos bens.
    expect((await criar().listarColetas('caso-1')).some((x) => x.fonte === 'tse_bens')).toBe(true);
  });

  it('H50: tse_bens com "do_caso" num caso sem candidato é recusada', async () => {
    const c = criar();
    const caso = await c.criarCaso({ titulo: 'Caso sem candidatos', descricao: 'sintético', numero_procedimento: '0002/2026-DEMO', finalidade: 'Teste automatizado com dados sintéticos.', retencao_ate: '2099-12-31' });
    await expect(c.iniciarColeta(caso.id, { fonte: 'tse_bens', parametros: { diretorio: 'tse/bens', do_caso: true } })).rejects.toEqual(erro(422));
  });

  it('H52: a despesa de campanha liga o candidato à empresa fornecedora no grafo, com valor, data e CNAE do fornecedor', async () => {
    const g = await criar().obterGrafo('caso-1', 'cand-3', 1);
    const despesas = g.arestas.filter((a) => a.tipo === 'despesa_de_campanha');
    expect(despesas).toHaveLength(1);
    expect(despesas[0]).toMatchObject({ origem: 'cand-3', atributos: { valor: 48000, data: '2024-09-05', ano: '2024' } });
    expect(Object.keys(despesas[0].atributos)).toEqual(expect.arrayContaining(['descricao', 'cnae_fornecedor']));
    expect(g.nos.find((n) => n.id === despesas[0].destino)?.tipo).toBe('empresa');
    const captura = await criar().obterCaptura(despesas[0].captura_id);
    expect(captura.fonte).toBe('tse_arquivo');
    expect(captura.url_ou_arquivo).toMatch(/despesas_contratadas_candidatos_2024/);
  });

  it('H46 e H52: o catálogo simulado traz L9 e L13 no grupo de lavagem, com nome e política, sem parâmetros de tela', async () => {
    expect(TIPOLOGIAS_LAVAGEM).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L13', 'L14', 'L15', 'L16']);
    const catalogo = await criar().listarTipologias();
    const l9 = catalogo.find((t) => t.codigo === 'L9')!;
    const l13 = catalogo.find((t) => t.codigo === 'L13')!;
    expect(l9).toMatchObject({ nome: 'Eleito possivelmente sócio de empresa contratada pelo próprio ente', historia: 'H46', grupo: 'lavagem', parametros: [] });
    expect(l13).toMatchObject({ nome: 'Despesa de campanha com fornecedor de perfil incompatível', historia: 'H52', grupo: 'lavagem', parametros: [] });
    expect(l9.politica_erro).toMatch(/^Prefere evitar falso/);
    expect(l13.politica_erro).toMatch(/^Prefere evitar falso/);
    expect(l13.fontes).toContain('tse_arquivo');
    // As tipologias novas ainda não geram alerta sintético: a execução do simulado não muda.
    const alertas = await criar().executarAlertas('caso-1');
    expect(alertas.some((a) => a.tipologia === 'L9' || a.tipologia === 'L13')).toBe(false);
  });
});
