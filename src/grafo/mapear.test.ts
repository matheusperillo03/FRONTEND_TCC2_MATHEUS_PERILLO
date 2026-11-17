import { describe, expect, it } from 'vitest';
import type { Grafo } from '../api/tipos';
import { ESTILO_NO, paraElementosCytoscape } from './mapear';

const grafo: Grafo = {
  nos: [
    { id: 'emp-1', tipo: 'empresa', rotulo: 'ALFA LTDA' },
    { id: 7, tipo: 'pessoa', rotulo: 'PESSOA EXEMPLO' },
    { id: 'org-1', tipo: 'orgao', rotulo: 'ÓRGÃO EXEMPLO' },
    { id: 'con-1', tipo: 'contrato', rotulo: 'Contrato 1' },
  ],
  arestas: [
    { origem: 7, destino: 'emp-1', tipo: 'socio_de', atributos: { qualificacao: 'Sócio' }, captura_id: 'cap-2' },
    { origem: 'emp-1', destino: 'con-1', tipo: 'contratado_por', atributos: {}, captura_id: 'cap-4' },
    { origem: 'emp-1', destino: 'emp-9', tipo: 'mesmo_endereco', atributos: {}, captura_id: 'cap-3' },
  ],
};

describe('paraElementosCytoscape', () => {
  it('mapeia nós com tipo, rótulo, cor e forma distintas por tipo', () => {
    const elementos = paraElementosCytoscape(grafo);
    const nos = elementos.filter((e) => e.group === 'nodes');
    expect(nos).toHaveLength(4);
    const porTipo = Object.fromEntries(nos.map((n) => [n.data.tipo, n.data]));
    expect(porTipo.empresa.id).toBe('n:emp-1');
    expect(porTipo.pessoa.id).toBe('n:7');
    expect(porTipo.pessoa.idOriginal).toBe('7');
    expect(porTipo.orgao.tipoRotulo).toBe('Órgão');
    const cores = new Set(nos.map((n) => n.data.cor));
    const formas = new Set(nos.map((n) => n.data.forma));
    expect(cores.size).toBe(4);
    expect(formas.size).toBe(4);
  });

  it('mapeia arestas com rótulo legível, captura e atributos, descartando pontas ausentes', () => {
    const arestas = paraElementosCytoscape(grafo).filter((e) => e.group === 'edges');
    expect(arestas).toHaveLength(2);
    expect(arestas[0].data).toMatchObject({ source: 'n:7', target: 'n:emp-1', tipo: 'socio_de', rotulo: 'sócio de', capturaId: 'cap-2', atributos: { qualificacao: 'Sócio' } });
    expect(arestas[1].data).toMatchObject({ source: 'n:emp-1', target: 'n:con-1', rotulo: 'contratado por' });
    expect(arestas[0].data.id).not.toBe(arestas[1].data.id);
  });

  it('marca o nó central com a classe "centro"', () => {
    const nos = paraElementosCytoscape(grafo, { centro: 7 }).filter((e) => e.group === 'nodes');
    expect(nos.find((n) => n.data.id === 'n:7')?.classes).toContain('centro');
    expect(nos.find((n) => n.data.id === 'n:emp-1')?.classes).not.toContain('centro');
  });

  it('grafo vazio produz lista vazia', () => {
    expect(paraElementosCytoscape({ nos: [], arestas: [] })).toEqual([]);
  });
});

describe('paraElementosCytoscape — tipos do horizonte 2', () => {
  it('sanção, candidato e edital têm rótulo, cor e forma próprios; as arestas novas têm rótulo em português', () => {
    const elementos = paraElementosCytoscape({
      nos: [
        { id: 'emp-6', tipo: 'empresa', rotulo: 'ZETA COMERCIO SINTETICA LTDA' },
        { id: 'san-1', tipo: 'sancao', rotulo: 'CEIS 9001' },
        { id: 'cand-1', tipo: 'candidato', rotulo: 'CANDIDATO FICTICIO' },
        { id: 'edi-1', tipo: 'edital', rotulo: 'edital_restritivo.txt' },
        { id: 'org-3', tipo: 'orgao', rotulo: 'PREFEITURA SINTETICA' },
        { id: 'pes-6', tipo: 'pessoa', rotulo: 'RICARDO FICTICIO LIMA' },
      ],
      arestas: [
        { origem: 'emp-6', destino: 'san-1', tipo: 'sancionada_em', atributos: {}, captura_id: 'cap-5' },
        { origem: 'pes-6', destino: 'org-3', tipo: 'servidor_de', atributos: {}, captura_id: 'cap-6' },
        { origem: 'emp-6', destino: 'cand-1', tipo: 'doou_para', atributos: { valor: 15000 }, captura_id: 'cap-8' },
        { origem: 'org-3', destino: 'edi-1', tipo: 'edital_de', atributos: {}, captura_id: 'cap-10' },
      ],
    });
    const nos = elementos.filter((e) => e.group === 'nodes').map((e) => e.data);
    const novos = nos.filter((n) => ['sancao', 'candidato', 'edital'].includes(n.tipo));
    expect(novos.map((n) => n.tipoRotulo)).toEqual(['Sanção', 'Candidato', 'Edital']);
    // Nenhum tipo novo cai na cor ou na forma padrão, e todos se distinguem entre si.
    expect(novos.every((n) => n.cor !== '#555555')).toBe(true);
    expect(new Set(nos.map((n) => n.forma)).size).toBe(nos.length);
    const arestas = elementos.filter((e) => e.group === 'edges').map((e) => e.data);
    expect(arestas.map((a) => a.rotulo)).toEqual(['sancionada em', 'servidor de', 'doou para', 'edital de']);
    expect(arestas.every((a) => a.cor !== '#666666')).toBe(true);
  });

  it('RF03: convênio (tipologia L16) tem rótulo, cor e forma próprios, e as arestas convenente de e concedente de', () => {
    const elementos = paraElementosCytoscape({
      nos: [
        { id: 'emp-9', tipo: 'empresa', rotulo: 'ASSOCIACAO SINTETICA' },
        { id: 'org-3', tipo: 'orgao', rotulo: 'MINISTERIO SINTETICO' },
        { id: 'conv-1', tipo: 'convenio', rotulo: 'Convênio 900001' },
      ],
      arestas: [
        { origem: 'emp-9', destino: 'conv-1', tipo: 'convenente_de', atributos: {}, captura_id: 'cap-20' },
        { origem: 'org-3', destino: 'conv-1', tipo: 'concedente_de', atributos: {}, captura_id: 'cap-20' },
      ],
    });
    const nos = elementos.filter((e) => e.group === 'nodes').map((e) => e.data);
    const convenio = nos.find((n) => n.tipo === 'convenio')!;
    expect(convenio.tipoRotulo).toBe('Convênio');
    expect(convenio.cor).not.toBe('#555555');
    expect(new Set(Object.values(ESTILO_NO).map((e) => e.forma)).size).toBe(Object.keys(ESTILO_NO).length);
    expect(new Set(Object.values(ESTILO_NO).map((e) => e.cor)).size).toBe(Object.keys(ESTILO_NO).length);
    const arestas = elementos.filter((e) => e.group === 'edges').map((e) => e.data);
    expect(arestas.map((a) => a.rotulo)).toEqual(['convenente de', 'concedente de']);
    expect(arestas.every((a) => a.cor !== '#666666')).toBe(true);
    expect(arestas[0].estilo).not.toBe(arestas[1].estilo);
  });
});
