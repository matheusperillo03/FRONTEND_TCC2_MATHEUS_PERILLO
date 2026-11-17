import { useEffect, useState } from 'react';
import type { EntidadeResumo, Grafo, Id } from '../../api';
import { ExportarGrafo } from '../../componentes/ExportarGrafo';
import { GrafoCytoscape } from '../../componentes/GrafoCytoscape';
import { SeletorEntidade } from '../../componentes/SeletorEntidade';
import { Campo, Carregando, Mensagem, Radio } from '../../componentes/basicos';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

export interface AbaGrafoProps {
  casoId: Id;
  centroInicial?: Id | null;
  aoAbrirEntidade?: (id: Id) => void;
}

export function AbaGrafo({ casoId, centroInicial, aoAbrirEntidade }: AbaGrafoProps) {
  const { cliente } = useSessao();
  const [modo, setModo] = useState<'vizinhanca' | 'caminho'>('vizinhanca');
  const [centro, setCentro] = useState<EntidadeResumo | null>(null);
  const [profundidade, setProfundidade] = useState(2);
  const [de, setDe] = useState<EntidadeResumo | null>(null);
  const [para, setPara] = useState<EntidadeResumo | null>(null);
  const grafo = useChamada<Grafo>();
  const centroAtual: Id | null = modo === 'vizinhanca' && centro ? centro.id : null;

  // Centro vindo de outra aba ("Ver no grafo").
  useEffect(() => {
    if (centroInicial == null) return;
    let ativo = true;
    void cliente.obterEntidade(casoId, centroInicial).then(
      (e) => {
        if (!ativo) return;
        setModo('vizinhanca');
        setCentro(e);
      },
      () => {
        if (ativo) setCentro({ id: centroInicial, tipo: 'empresa', rotulo: String(centroInicial), identificador: '', atributos: {} });
      },
    );
    return () => {
      ativo = false;
    };
  }, [centroInicial, casoId, cliente]);

  // Consulta a vizinhança quando o centro ou a profundidade mudam.
  useEffect(() => {
    if (modo !== 'vizinhanca' || !centro) return;
    void grafo.executar(() => cliente.obterGrafo(casoId, centro.id, profundidade));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, centro, profundidade, casoId, cliente]);

  function consultarCaminho() {
    if (!de || !para) return;
    void grafo.executar(() => cliente.obterCaminho(casoId, de.id, para.id));
  }

  return (
    <div className="grafo-aba">
      <div className="linha linha-modos" role="radiogroup" aria-label="Tipo de consulta">
        <Radio nome="modo-grafo" valor="vizinhanca" marcado={modo === 'vizinhanca'} aoMarcar={() => { grafo.limpar(); setModo('vizinhanca'); }}>
          Vizinhança de uma entidade
        </Radio>
        <Radio nome="modo-grafo" valor="caminho" marcado={modo === 'caminho'} aoMarcar={() => { grafo.limpar(); setModo('caminho'); }}>
          Caminho entre duas entidades
        </Radio>
      </div>

      {modo === 'vizinhanca' ? (
        <div className="grafo-controles">
          <SeletorEntidade casoId={casoId} rotulo="Entidade central" valor={centro} aoSelecionar={setCentro} />
          <Campo rotulo="Profundidade" emLinha>
            <select value={profundidade} onChange={(e) => setProfundidade(Number(e.target.value))}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'nível' : 'níveis'}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      ) : (
        <div className="grafo-controles">
          <SeletorEntidade casoId={casoId} rotulo="De" valor={de} aoSelecionar={setDe} />
          <SeletorEntidade casoId={casoId} rotulo="Para" valor={para} aoSelecionar={setPara} />
          <button type="button" className="br-button primary small" onClick={consultarCaminho} disabled={!de || !para || grafo.carregando}>
            Buscar caminho mais curto
          </button>
        </div>
      )}

      {grafo.carregando && <Carregando texto="Consultando o grafo…" />}
      {grafo.erro && <Mensagem tipo="erro">{grafo.erro}</Mensagem>}
      {grafo.dados && grafo.dados.nos.length === 0 && <Mensagem tipo="aviso">Nenhum nó devolvido: não há caminho ou a entidade não tem vínculos registrados.</Mensagem>}
      {grafo.dados && grafo.dados.nos.length > 0 && (
        <GrafoCytoscape grafo={grafo.dados} centro={centroAtual} aoClicarNo={(id) => aoAbrirEntidade?.(id)} />
      )}
      {!grafo.dados && !grafo.carregando && !grafo.erro && (
        <p className="vazio">
          {modo === 'vizinhanca' ? 'Escolha a entidade central para desenhar a vizinhança.' : 'Escolha as duas entidades para buscar o caminho.'}
        </p>
      )}
      <p className="mudo">Clique num nó para abrir o detalhe da entidade; clique numa aresta para ver atributos e captura de origem.</p>
      <ExportarGrafo casoId={casoId} />
    </div>
  );
}
