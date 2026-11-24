/**
 * Converte o grafo do contrato v0 em elementos do Cytoscape.js.
 * Função pura, sem dependência do DOM, para ser testada isoladamente.
 */
import type { ElementDefinition } from 'cytoscape';
import type { Grafo, Id, TipoAresta, TipoEntidade } from '../api/tipos';

export const ROTULOS_TIPO_NO: Record<TipoEntidade, string> = {
  empresa: 'Empresa',
  pessoa: 'Pessoa',
  orgao: 'Órgão',
  contrato: 'Contrato',
  sancao: 'Sanção',
  candidato: 'Candidato',
  edital: 'Edital',
  convenio: 'Convênio',
};

export const ROTULOS_TIPO_ARESTA: Record<TipoAresta, string> = {
  socio_de: 'sócio de',
  contratado_por: 'contratado por',
  mesmo_endereco: 'mesmo endereço',
  fornecedor_de: 'fornecedor de',
  contratante_de: 'contratante de',
  sancionada_em: 'sancionada em',
  servidor_de: 'servidor de',
  doou_para: 'doou para',
  edital_de: 'edital de',
  convenente_de: 'convenente de',
  concedente_de: 'concedente de',
  despesa_de_campanha: 'despesa de campanha com',
};

/**
 * Cores da paleta do Padrão Digital de Governo (@govbr-ds/core, core-tokens.css).
 * O Cytoscape desenha em canvas e não lê variáveis CSS, por isso os valores
 * dos tokens são repetidos aqui; as mesmas cores estão em styles.css.
 */
const PALETA = {
  azul: '#1351b4', // --blue-warm-vivid-70
  violeta: '#54278f', // --violet-vivid-70
  verde: '#216e1f', // --green-cool-vivid-60
  laranja: '#8c471c', // --orange-vivid-60
  vermelho: '#b50909', // --red-vivid-60
  magenta: '#ab2165', // --magenta-vivid-60
  ciano: '#00687d', // --cyan-vivid-60
  indigo: '#4a50c4', // --indigo-vivid-60
} as const;

/** Destaque do nó central e da seleção (--yellow-vivid-20, o token --warning). */
export const COR_DESTAQUE = '#ffcd07';

/** Cores e formas por tipo de nó (também usadas na legenda). */
export const ESTILO_NO: Record<TipoEntidade, { cor: string; forma: string }> = {
  empresa: { cor: PALETA.azul, forma: 'round-rectangle' },
  pessoa: { cor: PALETA.violeta, forma: 'ellipse' },
  orgao: { cor: PALETA.verde, forma: 'hexagon' },
  contrato: { cor: PALETA.laranja, forma: 'diamond' },
  sancao: { cor: PALETA.vermelho, forma: 'octagon' },
  candidato: { cor: PALETA.magenta, forma: 'star' },
  edital: { cor: PALETA.ciano, forma: 'rectangle' },
  convenio: { cor: PALETA.indigo, forma: 'triangle' },
};

export const ESTILO_ARESTA: Record<TipoAresta, { cor: string; estilo: 'solid' | 'dashed' | 'dotted' }> = {
  socio_de: { cor: PALETA.violeta, estilo: 'solid' },
  contratado_por: { cor: PALETA.laranja, estilo: 'solid' },
  mesmo_endereco: { cor: PALETA.vermelho, estilo: 'dashed' },
  fornecedor_de: { cor: PALETA.laranja, estilo: 'dotted' },
  contratante_de: { cor: PALETA.verde, estilo: 'dotted' },
  sancionada_em: { cor: PALETA.vermelho, estilo: 'solid' },
  servidor_de: { cor: PALETA.verde, estilo: 'dashed' },
  doou_para: { cor: PALETA.magenta, estilo: 'solid' },
  edital_de: { cor: PALETA.ciano, estilo: 'dashed' },
  convenente_de: { cor: PALETA.indigo, estilo: 'solid' },
  concedente_de: { cor: PALETA.indigo, estilo: 'dotted' },
  despesa_de_campanha: { cor: PALETA.magenta, estilo: 'dashed' },
};

export function rotuloTipoNo(tipo: string): string {
  return (ROTULOS_TIPO_NO as Record<string, string>)[tipo] ?? tipo;
}

export function rotuloTipoAresta(tipo: string): string {
  return (ROTULOS_TIPO_ARESTA as Record<string, string>)[tipo] ?? tipo.replace(/_/g, ' ');
}

export function idNo(id: Id): string {
  return `n:${String(id)}`;
}

export function idAresta(origem: Id, destino: Id, tipo: string, indice: number): string {
  return `e:${String(origem)}>${String(destino)}:${tipo}:${indice}`;
}

export interface OpcoesMapeamento {
  /** Nó a destacar (por exemplo, o centro da consulta). */
  centro?: Id | null;
}

export function paraElementosCytoscape(grafo: Grafo, opcoes: OpcoesMapeamento = {}): ElementDefinition[] {
  const idsNos = new Set(grafo.nos.map((n) => String(n.id)));
  const nos: ElementDefinition[] = grafo.nos.map((n) => ({
    group: 'nodes',
    data: {
      id: idNo(n.id),
      idOriginal: String(n.id),
      tipo: n.tipo,
      rotulo: n.rotulo,
      tipoRotulo: rotuloTipoNo(n.tipo),
      cor: (ESTILO_NO as Record<string, { cor: string }>)[n.tipo]?.cor ?? '#555555',
      forma: (ESTILO_NO as Record<string, { forma: string }>)[n.tipo]?.forma ?? 'ellipse',
    },
    classes: [n.tipo, opcoes.centro != null && String(opcoes.centro) === String(n.id) ? 'centro' : ''].filter(Boolean).join(' '),
  }));

  const arestas: ElementDefinition[] = grafo.arestas
    // Ignora arestas cujas pontas não estão entre os nós devolvidos (o Cytoscape lançaria erro).
    .filter((a) => idsNos.has(String(a.origem)) && idsNos.has(String(a.destino)))
    .map((a, i) => ({
      group: 'edges',
      data: {
        id: idAresta(a.origem, a.destino, a.tipo, i),
        source: idNo(a.origem),
        target: idNo(a.destino),
        tipo: a.tipo,
        rotulo: rotuloTipoAresta(a.tipo),
        atributos: a.atributos ?? {},
        capturaId: String(a.captura_id),
        cor: (ESTILO_ARESTA as Record<string, { cor: string }>)[a.tipo]?.cor ?? '#666666',
        estilo: (ESTILO_ARESTA as Record<string, { estilo: string }>)[a.tipo]?.estilo ?? 'solid',
        naoDirecionada: a.tipo === 'mesmo_endereco',
      },
      classes: a.tipo,
    }));

  return [...nos, ...arestas];
}
