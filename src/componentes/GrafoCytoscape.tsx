import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import { useEffect, useRef, useState } from 'react';
import type { Grafo, Id } from '../api';
import { COR_DESTAQUE, ESTILO_ARESTA, ESTILO_NO, ROTULOS_TIPO_ARESTA, ROTULOS_TIPO_NO, paraElementosCytoscape } from '../grafo/mapear';
import { Tabela, TabelaChaveValor } from './basicos';

export interface GrafoCytoscapeProps {
  grafo: Grafo;
  centro?: Id | null;
  aoClicarNo?: (idOriginal: string) => void;
  altura?: number;
}

interface SelecaoAresta {
  tipo: string;
  rotulo: string;
  origem: string;
  destino: string;
  capturaId: string;
  atributos: Record<string, unknown>;
}

const ESTILO: cytoscape.StylesheetJson = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(cor)',
      shape: 'data(forma)' as never,
      label: 'data(rotulo)',
      color: '#333333',
      'font-size': 10,
      'text-wrap': 'wrap',
      'text-max-width': '120',
      'text-valign': 'bottom',
      'text-margin-y': 4,
      width: 28,
      height: 28,
      'border-width': 1,
      'border-color': '#ffffff',
    },
  },
  {
    selector: 'node.centro',
    style: { 'border-width': 4, 'border-color': COR_DESTAQUE, width: 36, height: 36 },
  },
  {
    selector: 'edge',
    style: {
      width: 1.5,
      'line-color': 'data(cor)',
      'line-style': 'data(estilo)' as never,
      'target-arrow-color': 'data(cor)',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      label: 'data(rotulo)',
      'font-size': 8,
      color: '#444',
      'text-rotation': 'autorotate',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.85,
      'text-background-padding': '1',
    },
  },
  { selector: 'edge.mesmo_endereco', style: { 'target-arrow-shape': 'none' } },
  { selector: ':selected', style: { 'overlay-color': COR_DESTAQUE, 'overlay-opacity': 0.25, 'overlay-padding': 4 } },
];

export function GrafoCytoscape({ grafo, centro, aoClicarNo, altura = 520 }: GrafoCytoscapeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [aresta, setAresta] = useState<SelecaoAresta | null>(null);
  const clicarRef = useRef(aoClicarNo);

  useEffect(() => {
    clicarRef.current = aoClicarNo;
  }, [aoClicarNo]);

  useEffect(() => {
    if (!ref.current) return;
    const cy = cytoscape({ container: ref.current, style: ESTILO, wheelSensitivity: 0.2, minZoom: 0.2, maxZoom: 3 });
    cyRef.current = cy;
    cy.on('tap', 'node', (ev) => {
      const id = ev.target.data('idOriginal') as string;
      clicarRef.current?.(id);
    });
    cy.on('tap', 'edge', (ev) => {
      const d = ev.target.data();
      setAresta({
        tipo: d.tipo,
        rotulo: d.rotulo,
        origem: ev.target.source().data('rotulo'),
        destino: ev.target.target().data('rotulo'),
        capturaId: d.capturaId,
        atributos: d.atributos ?? {},
      });
    });
    cy.on('tap', (ev) => {
      if (ev.target === cy) setAresta(null);
    });
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const elementos: ElementDefinition[] = paraElementosCytoscape(grafo, { centro });
    cy.elements().remove();
    cy.add(elementos);
    setAresta(null);
    const layout = cy.layout({ name: 'cose', animate: false, padding: 30, fit: true } as cytoscape.LayoutOptions);
    layout.run();
  }, [grafo, centro]);

  return (
    <div className="grafo">
      <div className="grafo-legenda" aria-label="Legenda do grafo">
        {Object.entries(ROTULOS_TIPO_NO).map(([tipo, rotulo]) => (
          <span key={tipo} className="legenda-item">
            <span className={`legenda-no legenda-${ESTILO_NO[tipo as keyof typeof ESTILO_NO].forma}`} style={{ background: ESTILO_NO[tipo as keyof typeof ESTILO_NO].cor }} aria-hidden="true" />
            {rotulo}
          </span>
        ))}
        <span className="legenda-sep" aria-hidden="true" />
        {Object.entries(ROTULOS_TIPO_ARESTA).map(([tipo, rotulo]) => (
          <span key={tipo} className="legenda-item">
            <span
              className="legenda-aresta"
              style={{ borderTopColor: ESTILO_ARESTA[tipo as keyof typeof ESTILO_ARESTA].cor, borderTopStyle: ESTILO_ARESTA[tipo as keyof typeof ESTILO_ARESTA].estilo }}
              aria-hidden="true"
            />
            {rotulo}
          </span>
        ))}
      </div>
      <div className="grafo-area">
        <div ref={ref} className="grafo-canvas" style={{ height: altura }} role="img" aria-label={`Grafo com ${grafo.nos.length} nós e ${grafo.arestas.length} arestas`} />
        {aresta && (
          <aside className="br-card grafo-painel" aria-label="Vínculo selecionado">
            <h4>
              Vínculo: {aresta.rotulo} <span className="mudo">({aresta.tipo})</span>
            </h4>
            <p>
              <strong>{aresta.origem}</strong> → <strong>{aresta.destino}</strong>
            </p>
            <p>
              Captura de origem: <code>{aresta.capturaId}</code>
            </p>
            <TabelaChaveValor dados={aresta.atributos} titulo="Atributos" />
          </aside>
        )}
      </div>
      <details className="grafo-tabela">
        <summary>
          Lista de vínculos ({grafo.arestas.length}) e nós ({grafo.nos.length})
        </summary>
        <Tabela rotulo="Vínculos do grafo">
          <thead>
            <tr>
              <th scope="col">Origem</th>
              <th scope="col">Vínculo</th>
              <th scope="col">Destino</th>
              <th scope="col">Captura</th>
            </tr>
          </thead>
          <tbody>
            {grafo.arestas.map((a, i) => (
              <tr key={i}>
                <td>{rotuloNo(grafo, a.origem)}</td>
                <td>{ROTULOS_TIPO_ARESTA[a.tipo] ?? a.tipo}</td>
                <td>{rotuloNo(grafo, a.destino)}</td>
                <td>
                  <code>{String(a.captura_id)}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </details>
    </div>
  );
}

function rotuloNo(grafo: Grafo, id: Id): string {
  return grafo.nos.find((n) => String(n.id) === String(id))?.rotulo ?? String(id);
}
