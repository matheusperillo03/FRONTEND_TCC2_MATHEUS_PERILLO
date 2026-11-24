/**
 * Ligação de registros de pessoas (decisão do autor de 23/11/2026, opção (a)):
 * H46 (sugestão candidato x sócio, decidida pelo investigador), H50 (bens
 * declarados ao TSE), H51 (linha do tempo patrimonial).
 */
import { describe, expect, it, vi } from 'vitest';
import { ClienteHttp } from './clienteHttp';
import { ErroApi } from './erros';

function criar(corpo: unknown, status = 200) {
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch &
    ReturnType<typeof vi.fn>;
  const cliente = new ClienteHttp({ baseUrl: 'http://api.teste:8000', obterToken: () => 'tok-123', obterJustificativa: () => 'IP 0001/2026', fetchImpl });
  return { cliente, fetchImpl };
}

/** Item de `sugestoes` como o back-end devolve (`SugestaoSaida`). */
const SUGESTAO_DO_BACK = {
  id: 'sug-9',
  candidata_id: 'pes-2',
  candidata_rotulo: 'MARIA EXEMPLO SOUZA',
  candidata_identificador: '***234567**',
  candidata_tipo: 'pessoa',
  score: 0.9,
  motivo: 'Possível coincidência entre candidato e sócio.',
  criado_em: '2026-11-23T12:00:00Z',
  situacao: 'pendente',
  decidido_por: null,
  decidido_em: null,
  justificativa_decisao: null,
};

describe('ClienteHttp — ligação de registros de pessoas', () => {
  it('H46: obterEntidade adapta a sugestão do back-end (id, candidata_*, score) ao formato da tela, com a situação da decisão', async () => {
    const { cliente } = criar({
      id: 'cand-3',
      tipo: 'candidato',
      rotulo: 'MARIA EXEMPLO SOUZA',
      identificador: '2024:900002',
      atributos: {},
      captura_id: 'cap-9',
      fontes: [],
      sugestoes: [SUGESTAO_DO_BACK],
      outras_candidaturas: [{ entidade_id: 'cand-2', rotulo: 'MARIA EXEMPLO SOUZA', ano: '2020', cargo: 'VEREADOR', uf: 'GO', situacao_turno: 'ELEITO POR QP' }],
    });
    const e = await cliente.obterEntidade('caso-1', 'cand-3');
    expect(e.sugestoes).toEqual([
      {
        id: 'sug-9',
        entidade_id: 'pes-2',
        rotulo: 'MARIA EXEMPLO SOUZA',
        identificador: '***234567**',
        tipo: 'pessoa',
        confianca: 0.9,
        motivo: 'Possível coincidência entre candidato e sócio.',
        criado_em: '2026-11-23T12:00:00Z',
        situacao: 'pendente',
        decidido_por: null,
        decidido_em: null,
        justificativa_decisao: null,
      },
    ]);
    expect(e.outras_candidaturas).toEqual([{ entidade_id: 'cand-2', rotulo: 'MARIA EXEMPLO SOUZA', ano: '2020', cargo: 'VEREADOR', uf: 'GO', situacao_turno: 'ELEITO POR QP' }]);
  });

  it('H46: obterEntidade tolera resposta antiga (sem situação, sem outras_candidaturas) e sugestão cuja candidata saiu do caso', async () => {
    const { cliente } = criar({
      id: 'pes-1',
      tipo: 'pessoa',
      rotulo: 'JOÃO EXEMPLO DA SILVA',
      identificador: '***123456**',
      atributos: {},
      fontes: [],
      sugestoes: [{ id: 's1', candidata_id: 'pes-3', candidata_rotulo: null, candidata_identificador: null, score: 0.35, motivo: 'm', criado_em: 'x' }],
    });
    const e = await cliente.obterEntidade('caso-1', 'pes-1');
    expect(e.sugestoes[0]).toMatchObject({ id: 's1', entidade_id: 'pes-3', rotulo: 'pes-3', identificador: undefined, confianca: 0.35, situacao: 'pendente' });
    expect(e.outras_candidaturas).toEqual([]);
  });

  it('H46: decidirSugestao envia POST com decisão e justificativa e devolve a sugestão adaptada', async () => {
    const { cliente, fetchImpl } = criar({ ...SUGESTAO_DO_BACK, situacao: 'confirmado', decidido_por: 'ana', decidido_em: '2026-11-23T13:00:00Z', justificativa_decisao: 'Conferido no registro de candidatura' });
    const s = await cliente.decidirSugestao('caso-1', 'sug-9', { decisao: 'confirmado', justificativa: 'Conferido no registro de candidatura' });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('http://api.teste:8000/casos/caso-1/sugestoes/sug-9/decisao');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ decisao: 'confirmado', justificativa: 'Conferido no registro de candidatura' });
    expect((init.headers as Record<string, string>)['X-Justificativa']).toBeTruthy();
    expect(s).toMatchObject({ id: 'sug-9', entidade_id: 'pes-2', situacao: 'confirmado', decidido_por: 'ana', decidido_em: '2026-11-23T13:00:00Z', justificativa_decisao: 'Conferido no registro de candidatura' });
  });

  it('H46: decidirSugestao repassa o 403 do leitor como ErroApi', async () => {
    const { cliente } = criar({ detail: 'Seu papel neste caso (leitor) não permite esta ação.' }, 403);
    await expect(cliente.decidirSugestao('caso-1', 'sug-9', { decisao: 'descartado', justificativa: 'Homônimo' })).rejects.toBeInstanceOf(ErroApi);
  });

  it('H51: obterPatrimonio consulta a linha do tempo patrimonial do candidato com justificativa', async () => {
    const linha = { entidade_id: 'cand-3', ligacao: 'titulo_eleitoral', nota: 'n', pontos: [], variacoes: [], renda_publica: { conhecida: false, motivo: 'm' } };
    const { cliente, fetchImpl } = criar(linha);
    await expect(cliente.obterPatrimonio('caso-1', 'cand-3')).resolves.toEqual(linha);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('http://api.teste:8000/casos/caso-1/entidades/cand-3/patrimonio');
    expect(init.method ?? 'GET').toBe('GET');
    expect((init.headers as Record<string, string>)['X-Justificativa']).toBeTruthy();
  });
});
