import { useId, useState } from 'react';
import type { EntidadeResumo, Id } from '../api';
import { mascararCpfs } from '../privacidade';
import { useSessao } from '../sessao/SessaoContext';
import { useChamada } from '../sessao/useChamada';
import { Carregando, EtiquetaTipo, Mensagem } from './basicos';

export interface SeletorEntidadeProps {
  casoId: Id;
  rotulo: string;
  valor: EntidadeResumo | null;
  aoSelecionar: (entidade: EntidadeResumo | null) => void;
}

/** Busca entidades do caso e permite escolher uma (usado no grafo e no caminho). */
export function SeletorEntidade({ casoId, rotulo, valor, aoSelecionar }: SeletorEntidadeProps) {
  const { cliente } = useSessao();
  const [q, setQ] = useState('');
  const busca = useChamada<EntidadeResumo[]>();
  const id = useId();

  if (valor) {
    return (
      <div className="seletor seletor-escolhido">
        <span className="rotulo">{rotulo}</span>
        <span>
          <EtiquetaTipo tipo={valor.tipo} /> <strong>{mascararCpfs(valor.rotulo)}</strong> <span className="mudo">{mascararCpfs(valor.identificador, { contextoCpf: valor.tipo === 'pessoa' })}</span>
        </span>
        <button type="button" className="br-button secondary small" onClick={() => aoSelecionar(null)}>
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="seletor">
      <form
        className="linha"
        onSubmit={(e) => {
          e.preventDefault();
          void busca.executar(() => cliente.buscarEntidades(casoId, q));
        }}
      >
        <div className="br-input small campo campo-inline">
          <label htmlFor={id}>{rotulo}</label>
          <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome, CNPJ ou CPF parcial" />
        </div>
        <button type="submit" className="br-button secondary small" disabled={busca.carregando}>
          Buscar
        </button>
      </form>
      {busca.carregando && <Carregando />}
      {busca.erro && <Mensagem tipo="erro">{busca.erro}</Mensagem>}
      {busca.dados && (
        <ul className="lista-escolha" aria-label={`Resultados para ${rotulo}`}>
          {busca.dados.length === 0 && <li className="vazio">Nenhuma entidade encontrada.</li>}
          {busca.dados.map((e) => (
            <li key={String(e.id)}>
              <button type="button" className="botao-link" onClick={() => aoSelecionar(e)}>
                <EtiquetaTipo tipo={e.tipo} /> {mascararCpfs(e.rotulo)} <span className="mudo">{mascararCpfs(e.identificador, { contextoCpf: e.tipo === 'pessoa' })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
