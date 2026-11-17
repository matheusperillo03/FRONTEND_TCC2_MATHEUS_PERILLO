import { useEffect, useState, type FormEvent } from 'react';
import type { Captura, EntidadeDetalhe, EntidadeResumo, Id } from '../../api';
import { Anotacoes } from '../../componentes/Anotacoes';
import { Carregando, EtiquetaTipo, Hash, Mensagem, Tabela, TabelaChaveValor, formatarData } from '../../componentes/basicos';
import { mascararCpfs } from '../../privacidade';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

export interface AbaEntidadesProps {
  casoId: Id;
  entidadeInicial?: Id | null;
  aoVerNoGrafo?: (id: Id) => void;
  /** Leva a entidade ao formulário da aba Monitoramento (RF06). */
  aoMonitorar?: (entidade: EntidadeResumo) => void;
  /** Leva a captura do documento à aba Sugestões da IA (H22). Ausente quando a IA está desligada no servidor. */
  aoExtrairIa?: (capturaId: Id) => void;
  /** Chamado depois de uma anotação nova (para a tela do caso atualizar as contagens). */
  aoAnotar?: () => void;
}

export function AbaEntidades({ casoId, entidadeInicial, aoVerNoGrafo, aoMonitorar, aoExtrairIa, aoAnotar }: AbaEntidadesProps) {
  const { cliente } = useSessao();
  const [q, setQ] = useState('');
  const busca = useChamada<EntidadeResumo[]>();
  // A aba é remontada pelo pai (key) quando a entidade inicial muda.
  const [selecionada, setSelecionada] = useState<Id | null>(entidadeInicial ?? null);

  function buscar(e: FormEvent) {
    e.preventDefault();
    void busca.executar(() => cliente.buscarEntidades(casoId, q.trim()));
  }

  return (
    <div className="entidades">
      <form onSubmit={buscar} className="linha">
        <div className="br-input small campo campo-inline">
          <label htmlFor="busca-entidades">Buscar por nome, CNPJ ou CPF parcial</label>
          <input id="busca-entidades" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="deixe vazio para listar todas" />
        </div>
        <button type="submit" className="br-button primary small" disabled={busca.carregando}>
          Buscar
        </button>
      </form>
      {busca.carregando && <Carregando />}
      {busca.erro && <Mensagem tipo="erro">{busca.erro}</Mensagem>}

      <div className="entidades-grade">
        <div>
          {busca.dados && busca.dados.length === 0 && <p className="vazio">Nenhuma entidade encontrada. Faça uma coleta ou altere o termo.</p>}
          {busca.dados && busca.dados.length > 0 && (
            <Tabela rotulo="Entidades encontradas">
              <thead>
                <tr>
                  <th scope="col">Tipo</th>
                  <th scope="col">Rótulo</th>
                  <th scope="col">Identificador</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {busca.dados.map((e) => (
                  <tr key={String(e.id)} className={selecionada != null && String(selecionada) === String(e.id) ? 'linha-ativa' : ''}>
                    <td>
                      <EtiquetaTipo tipo={e.tipo} />
                    </td>
                    <td>{mascararCpfs(e.rotulo)}</td>
                    <td>
                      <code>{mascararCpfs(e.identificador, { contextoCpf: e.tipo === 'pessoa' })}</code>
                    </td>
                    <td>
                      <button type="button" className="br-button secondary small" onClick={() => setSelecionada(e.id)}>
                        Detalhe
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </div>
        <div>
          {selecionada != null ? (
            <DetalheEntidade casoId={casoId} entidadeId={selecionada} aoAbrirOutra={setSelecionada} aoVerNoGrafo={aoVerNoGrafo} aoMonitorar={aoMonitorar} aoExtrairIa={aoExtrairIa} aoAnotar={aoAnotar} />
          ) : (
            <p className="vazio">Selecione uma entidade para ver atributos, fontes e sugestões de resolução.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export interface DetalheEntidadeProps {
  casoId: Id;
  entidadeId: Id;
  aoAbrirOutra?: (id: Id) => void;
  aoVerNoGrafo?: (id: Id) => void;
  aoMonitorar?: (entidade: EntidadeResumo) => void;
  aoExtrairIa?: (capturaId: Id) => void;
  aoAnotar?: () => void;
}

/** Captura com o texto do documento (entidade do tipo edital): é sobre ela que a extração por IA roda. */
function capturaDoTexto(e: EntidadeDetalhe): Id | null {
  const id = e.atributos?.captura_texto_id;
  return typeof id === 'string' || typeof id === 'number' ? id : null;
}

export function DetalheEntidade({ casoId, entidadeId, aoAbrirOutra, aoVerNoGrafo, aoMonitorar, aoExtrairIa, aoAnotar }: DetalheEntidadeProps) {
  const { cliente } = useSessao();
  const detalhe = useChamada<EntidadeDetalhe>();

  useEffect(() => {
    void detalhe.executar(() => cliente.obterEntidade(casoId, entidadeId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId, entidadeId]);

  if (detalhe.carregando && !detalhe.dados) return <Carregando />;
  if (detalhe.erro) return <Mensagem tipo="erro">{detalhe.erro}</Mensagem>;
  const e = detalhe.dados;
  if (!e) return null;
  const capturaTexto = capturaDoTexto(e);

  return (
    <article className="detalhe-entidade" aria-labelledby="detalhe-entidade-titulo">
      <header className="painel-cabecalho">
        <h3 id="detalhe-entidade-titulo">
          <EtiquetaTipo tipo={e.tipo} /> {mascararCpfs(e.rotulo)}
        </h3>
        <div className="linha">
          {aoVerNoGrafo && (
            <button type="button" className="br-button secondary small" onClick={() => aoVerNoGrafo(e.id)}>
              Ver no grafo
            </button>
          )}
          {aoMonitorar && (
            <button
              type="button"
              className="br-button secondary small"
              onClick={() => aoMonitorar({ id: e.id, tipo: e.tipo, rotulo: e.rotulo, identificador: e.identificador, atributos: e.atributos })}
            >
              Monitorar
            </button>
          )}
          {aoExtrairIa && capturaTexto !== null && (
            <button type="button" className="br-button secondary small" onClick={() => aoExtrairIa(capturaTexto)} title="Abre a aba Sugestões da IA com a captura do texto deste documento">
              Extrair com IA
            </button>
          )}
        </div>
      </header>
      <p>
        Identificador: <code>{mascararCpfs(e.identificador, { contextoCpf: e.tipo === 'pessoa' })}</code> <span className="mudo">· id {String(e.id)}</span>
      </p>

      <h4>Atributos</h4>
      <TabelaChaveValor dados={e.atributos} />

      <h4>Fontes (cadeia de custódia)</h4>
      {e.fontes?.length ? (
        <ul className="lista-fontes">
          {e.fontes.map((f, i) => (
            <li key={`${String(f.captura_id)}-${i}`}>
              <FonteItem capturaId={f.captura_id} fonte={f.fonte} origem={f.url_ou_arquivo} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="vazio">Nenhuma fonte registrada.</p>
      )}

      <h4>Sugestões de resolução de entidades</h4>
      <p className="mudo">
        Possíveis correspondências (por exemplo, homônimos com CPF parcial diferente). São apenas sugestões: as entidades
        <strong> não foram fundidas</strong> e continuam separadas até avaliação do analista.
      </p>
      {e.sugestoes?.length ? (
        <ul className="lista-sugestoes" aria-label="Sugestões de resolução (não fundidas)">
          {e.sugestoes.map((s, i) => (
            <li key={`${String(s.entidade_id)}-${i}`} className="sugestao" data-testid="sugestao">
              <span className="br-tag small etiqueta-sugestao">sugestão — não fundida</span>{' '}
              {aoAbrirOutra ? (
                <button type="button" className="botao-link" onClick={() => aoAbrirOutra(s.entidade_id)}>
                  {mascararCpfs(s.rotulo)}
                </button>
              ) : (
                <strong>{mascararCpfs(s.rotulo)}</strong>
              )}{' '}
              {s.identificador && <code>{mascararCpfs(s.identificador)}</code>}
              {typeof s.confianca === 'number' && <span className="mudo"> · confiança {Math.round(s.confianca * 100)}%</span>}
              <div className="mudo">{mascararCpfs(s.motivo)}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="vazio">Nenhuma sugestão.</p>
      )}

      <Anotacoes casoId={casoId} alvoTipo="entidade" alvoId={e.id} aoMudar={aoAnotar} />
    </article>
  );
}

function FonteItem({ capturaId, fonte, origem }: { capturaId: Id; fonte?: string; origem?: string }) {
  const { cliente } = useSessao();
  const captura = useChamada<Captura>();
  return (
    <div className="fonte-item">
      <span>
        captura <code>{String(capturaId)}</code>
        {fonte && (
          <>
            {' '}
            · <code>{fonte}</code>
          </>
        )}
        {origem && <span className="mudo quebra"> · {origem}</span>}
      </span>{' '}
      <button type="button" className="br-button secondary small" onClick={() => void captura.executar(() => cliente.obterCaptura(capturaId))} disabled={captura.carregando}>
        {captura.carregando ? 'Carregando…' : 'Ver captura'}
      </button>
      {captura.erro && <Mensagem tipo="erro">{captura.erro}</Mensagem>}
      {captura.dados && (
        <div className="captura-detalhe">
          <div>
            SHA-256: <Hash valor={captura.dados.sha256} completo />
          </div>
          <div>
            Coletado em: {formatarData(captura.dados.coletado_em)} · {captura.dados.tamanho_bytes.toLocaleString('pt-BR')} bytes
          </div>
          <div className="quebra">Origem: {captura.dados.url_ou_arquivo}</div>
          <TabelaChaveValor dados={captura.dados.metadados} titulo="Metadados" />
        </div>
      )}
    </div>
  );
}
