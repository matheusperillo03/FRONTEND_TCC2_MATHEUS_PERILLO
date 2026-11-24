import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  mensagemDeErro,
  type Captura,
  type EntidadeDetalhe,
  type EntidadeResumo,
  type Id,
  type LinhaDoTempoPatrimonial as LinhaPatrimonial,
  type OutraCandidatura,
  type PontoPatrimonial,
  type SituacaoSugestao,
  type SugestaoResolucao,
  type VariacaoPatrimonial,
} from '../../api';
import { Anotacoes } from '../../componentes/Anotacoes';
import { Carregando, EtiquetaTipo, Hash, Mensagem, Tabela, TabelaChaveValor, contar, formatarData, formatarDia, formatarReais } from '../../componentes/basicos';
import { mascararCpfs } from '../../privacidade';
import { usePapelNoCaso } from '../../sessao/PapelContext';
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
  const ehCandidato = e.tipo === 'candidato';
  // A lista dos bens do candidato vai para a linha do tempo patrimonial, não para a tabela de atributos.
  const atributos = ehCandidato ? Object.fromEntries(Object.entries(e.atributos ?? {}).filter(([chave]) => chave !== 'bens')) : e.atributos;

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
      <TabelaChaveValor dados={atributos} />

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
        Possíveis correspondências (por exemplo, homônimos com CPF parcial diferente, ou candidato e sócio com os mesmos seis dígitos visíveis do CPF e o mesmo
        nome). São apenas sugestões: as entidades
        <strong> não foram fundidas</strong> e continuam separadas, mesmo depois de confirmadas pelo investigador.
      </p>
      {/* A chave reinicia as decisões e os campos quando a entidade muda. */}
      <ListaSugestoes key={String(e.id)} casoId={casoId} sugestoes={e.sugestoes ?? []} aoAbrirOutra={aoAbrirOutra} />

      {ehCandidato && (
        <>
          <OutrasCandidaturas candidaturas={e.outras_candidaturas ?? []} aoAbrirOutra={aoAbrirOutra} />
          <LinhaDoTempoPatrimonial key={`patrimonio-${String(e.id)}`} casoId={casoId} entidadeId={e.id} />
        </>
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

const ROTULOS_SITUACAO_SUGESTAO: Record<SituacaoSugestao, string> = {
  pendente: 'pendente',
  confirmado: 'confirmada pelo investigador',
  descartado: 'descartada pelo investigador',
};

/**
 * Sugestões de resolução com a decisão do investigador (RF02, H46). A decisão vale para o par
 * (os dois sentidos) e nunca funde os registros; quem autoriza é o back-end (leitor recebe 403).
 */
function ListaSugestoes({ casoId, sugestoes, aoAbrirOutra }: { casoId: Id; sugestoes: SugestaoResolucao[]; aoAbrirOutra?: (id: Id) => void }) {
  const { cliente } = useSessao();
  const { podeEscrever } = usePapelNoCaso();
  // Decisões tomadas nesta tela, por id da sugestão (o que o back-end devolveu).
  const [decididas, setDecididas] = useState<Record<string, SugestaoResolucao>>({});

  if (!sugestoes.length) return <p className="vazio">Nenhuma sugestão.</p>;

  async function decidir(sugestaoId: Id, decisao: 'confirmado' | 'descartado', justificativa: string) {
    const atualizada = await cliente.decidirSugestao(casoId, sugestaoId, { decisao, justificativa });
    setDecididas((d) => ({ ...d, [String(sugestaoId)]: atualizada }));
  }

  return (
    <>
      <ul className="lista-sugestoes" aria-label="Sugestões de resolução (não fundidas)">
        {sugestoes.map((original, i) => {
          const s = (original.id !== undefined && decididas[String(original.id)]) || original;
          return <ItemSugestao key={`${String(s.id ?? s.entidade_id)}-${i}`} sugestao={s} aoAbrirOutra={aoAbrirOutra} aoDecidir={podeEscrever && s.id !== undefined ? decidir : undefined} />;
        })}
      </ul>
      {!podeEscrever && <p className="mudo">Só o investigador ou o responsável pelo caso confirma ou descarta sugestões.</p>}
    </>
  );
}

function ItemSugestao({
  sugestao: s,
  aoAbrirOutra,
  aoDecidir,
}: {
  sugestao: SugestaoResolucao;
  aoAbrirOutra?: (id: Id) => void;
  /** Ausente para o leitor e para sugestão sem id (resposta antiga): só a situação é mostrada. */
  aoDecidir?: (sugestaoId: Id, decisao: 'confirmado' | 'descartado', justificativa: string) => Promise<void>;
}) {
  const idCampo = useId();
  const idDica = `${idCampo}-dica`;
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState<'confirmado' | 'descartado' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const situacao: SituacaoSugestao = s.situacao ?? 'pendente';
  const decidida = situacao !== 'pendente';
  // Mesma regra do back-end: a justificativa precisa ter letras ou números.
  const valida = /[\p{L}\p{N}]/u.test(justificativa);

  async function decidir(decisao: 'confirmado' | 'descartado') {
    if (!aoDecidir || s.id === undefined || !valida) return;
    setEnviando(decisao);
    setErro(null);
    try {
      await aoDecidir(s.id, decisao, justificativa.trim());
      setJustificativa('');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(null);
    }
  }

  return (
    <li className="sugestao" data-testid="sugestao">
      <span className="br-tag small etiqueta-sugestao">sugestão — não fundida</span>{' '}
      <span className={`br-tag small situacao-${situacao}`} data-testid="situacao-sugestao">
        {ROTULOS_SITUACAO_SUGESTAO[situacao]}
      </span>{' '}
      {aoAbrirOutra ? (
        <button type="button" className="botao-link" onClick={() => aoAbrirOutra(s.entidade_id)}>
          {mascararCpfs(s.rotulo)}
        </button>
      ) : (
        <strong>{mascararCpfs(s.rotulo)}</strong>
      )}{' '}
      {s.tipo && <EtiquetaTipo tipo={s.tipo} />} {s.identificador && <code>{mascararCpfs(s.identificador)}</code>}
      {typeof s.confianca === 'number' && <span className="mudo"> · confiança {Math.round(s.confianca * 100)}%</span>}
      <div className="mudo">{mascararCpfs(s.motivo)}</div>
      {decidida && (
        <div data-testid="decisao-sugestao">
          <strong>{situacao === 'confirmado' ? 'Confirmada' : 'Descartada'}</strong>
          {s.decidido_por ? ` por ${s.decidido_por}` : ''}
          {s.decidido_em ? ` em ${formatarData(s.decidido_em)}` : ''}
          {s.justificativa_decisao && <div className="quebra">Justificativa: {mascararCpfs(s.justificativa_decisao)}</div>}
        </div>
      )}
      {aoDecidir && (
        <form className="formulario formulario-decisao" onSubmit={(e: FormEvent) => e.preventDefault()}>
          <p id={idDica} className="mudo">
            Confirmar não funde os registros: só registra que o investigador aceita a ligação. A decisão vale para o par (nos dois sentidos) e fica, com a
            justificativa, na trilha de auditoria.
          </p>
          <div className="br-textarea small campo">
            <label htmlFor={idCampo}>{decidida ? 'Justificativa da revisão (obrigatória)' : 'Justificativa da decisão (obrigatória)'}</label>
            <textarea
              id={idCampo}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value.replace(/[\r\n]+/g, ' '))}
              rows={2}
              maxLength={500}
              required
              aria-describedby={idDica}
            />
          </div>
          <div className="linha">
            <button type="button" className="br-button primary small" onClick={() => void decidir('confirmado')} disabled={!valida || enviando !== null}>
              {enviando === 'confirmado' ? 'Registrando…' : decidida ? 'Rever: confirmar' : 'Confirmar sugestão'}
            </button>
            <button type="button" className="br-button secondary small" onClick={() => void decidir('descartado')} disabled={!valida || enviando !== null}>
              {enviando === 'descartado' ? 'Registrando…' : decidida ? 'Rever: descartar' : 'Descartar sugestão'}
            </button>
          </div>
          {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
        </form>
      )}
    </li>
  );
}

/** H50: as outras candidaturas da mesma pessoa. São registros separados, ligados pelo título eleitoral. */
function OutrasCandidaturas({ candidaturas, aoAbrirOutra }: { candidaturas: OutraCandidatura[]; aoAbrirOutra?: (id: Id) => void }) {
  return (
    <section aria-labelledby="outras-candidaturas-titulo">
      <h4 id="outras-candidaturas-titulo">Outras candidaturas da mesma pessoa</h4>
      <p className="mudo" data-testid="explicacao-ligacao">
        Cada eleição gera um registro de candidato. A ligação entre eles é feita pelo título eleitoral, comparado só por um resumo (com chave) que o sistema
        não exibe nem exporta. As candidaturas não foram fundidas: cada uma continua com as suas fontes.
      </p>
      {candidaturas.length ? (
        <Tabela rotulo="Outras candidaturas da mesma pessoa">
          <thead>
            <tr>
              <th scope="col">Ano</th>
              <th scope="col">Cargo</th>
              <th scope="col">UF</th>
              <th scope="col">Situação</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {candidaturas.map((c) => (
              <tr key={String(c.entidade_id)}>
                <td>{c.ano || '—'}</td>
                <td>{mascararCpfs(c.cargo) || '—'}</td>
                <td>{c.uf || '—'}</td>
                <td>{mascararCpfs(c.situacao_turno) || '—'}</td>
                <td>
                  {aoAbrirOutra && (
                    <button type="button" className="br-button secondary small" onClick={() => aoAbrirOutra(c.entidade_id)} aria-label={`Abrir a candidatura de ${c.ano}`} title={mascararCpfs(c.rotulo)}>
                      Abrir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      ) : (
        <p className="vazio">Nenhuma outra candidatura desta pessoa no caso.</p>
      )}
    </section>
  );
}

/** Nota do back-end sobre os bens; usada enquanto a resposta não chega (ou se ela falhar). */
const NOTA_PATRIMONIO = 'Declarado ao TSE no registro da candidatura; valor informado pelo candidato (não é avaliação de mercado). Só há dado de quem foi candidato.';

function textoVariacao(v: VariacaoPatrimonial): string {
  const sinal = v.diferenca > 0 ? '+' : v.diferenca < 0 ? '−' : '';
  const percentual =
    v.percentual === null
      ? 'sem percentual: o total anterior é zero'
      : `${v.percentual > 0 ? '+' : v.percentual < 0 ? '−' : ''}${Math.abs(v.percentual).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  return `${v.de_ano} → ${v.para_ano}: ${sinal}${formatarReais(Math.abs(v.diferenca))} (${percentual})`;
}

/**
 * H51 (RF05): bens declarados ao TSE em cada eleição, com a captura de origem. É só informativa:
 * sem renda pública conhecida, o sistema não gera alerta de evolução patrimonial.
 */
function LinhaDoTempoPatrimonial({ casoId, entidadeId }: { casoId: Id; entidadeId: Id }) {
  const { cliente } = useSessao();
  const linha = useChamada<LinhaPatrimonial>();

  useEffect(() => {
    void linha.executar(() => cliente.obterPatrimonio(casoId, entidadeId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId, entidadeId]);

  const dados = linha.dados;
  return (
    <section className="patrimonio" aria-labelledby="patrimonio-titulo">
      <h4 id="patrimonio-titulo">Linha do tempo patrimonial</h4>
      <p className="mudo" data-testid="nota-patrimonio">
        {mascararCpfs(dados?.nota || NOTA_PATRIMONIO)}
      </p>
      {linha.carregando && !dados && <Carregando />}
      {linha.erro && <Mensagem tipo="erro">{linha.erro}</Mensagem>}
      {dados && (
        <>
          <p className="mudo">
            {dados.ligacao === 'titulo_eleitoral'
              ? 'Candidaturas ligadas pelo título eleitoral (comparado só por resumo, que o sistema não exibe).'
              : 'Só há uma candidatura desta pessoa no caso.'}
          </p>
          <Tabela rotulo="Bens declarados por eleição">
            <thead>
              <tr>
                <th scope="col">Eleição</th>
                <th scope="col">Total declarado</th>
                <th scope="col">Bens</th>
                <th scope="col">Soma por tipo</th>
                <th scope="col">Captura de origem</th>
              </tr>
            </thead>
            <tbody>
              {dados.pontos.map((p) => (
                <LinhaPonto key={String(p.entidade_id)} ponto={p} />
              ))}
            </tbody>
          </Tabela>
          {dados.pontos
            .filter((p) => p.bens.length > 0)
            .map((p) => (
              <BensDaEleicao key={String(p.entidade_id)} ponto={p} />
            ))}
          <h5>Variação entre eleições</h5>
          <div data-testid="variacoes-patrimonio">
            {dados.variacoes.length ? (
              <ul>
                {dados.variacoes.map((v) => (
                  <li key={`${v.de_ano}-${v.para_ano}`}>{textoVariacao(v)}</li>
                ))}
              </ul>
            ) : (
              <p className="vazio">Sem variação a mostrar: é preciso ter bens coletados em ao menos duas eleições.</p>
            )}
          </div>
          <div data-testid="renda-publica">
            {dados.renda_publica.conhecida ? (
              <Mensagem tipo="info">{mascararCpfs(dados.renda_publica.motivo)}</Mensagem>
            ) : (
              <Mensagem tipo="aviso">
                <strong>Renda pública não conhecida.</strong> {mascararCpfs(dados.renda_publica.motivo)} Não há alerta: a linha do tempo é só informativa.
              </Mensagem>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function LinhaPonto({ ponto: p }: { ponto: PontoPatrimonial }) {
  const semArquivo = p.total === null;
  return (
    <tr>
      <th scope="row">
        {p.ano || '—'}
        <div className="mudo">{[mascararCpfs(p.cargo), p.uf].filter(Boolean).join(' · ')}</div>
      </th>
      <td>{semArquivo ? <span className="mudo">sem arquivo de bens coletado</span> : formatarReais(p.total)}</td>
      <td>{semArquivo ? '—' : contar(p.quantidade, 'bem', 'bens')}</td>
      <td>
        {p.por_tipo.length ? (
          <ul className="lista-simples">
            {p.por_tipo.map((t) => (
              <li key={t.tipo}>
                {mascararCpfs(t.tipo)}: {formatarReais(t.total)} ({t.quantidade})
              </li>
            ))}
          </ul>
        ) : (
          '—'
        )}
      </td>
      <td>
        {p.captura_id !== null ? (
          <>
            captura <code>{String(p.captura_id)}</code>
            {p.fonte && (
              <>
                {' '}
                · <code>{p.fonte}</code>
              </>
            )}
            {p.sha256 && (
              <div>
                SHA-256: <Hash valor={p.sha256} />
              </div>
            )}
            {p.url_ou_arquivo && <div className="mudo quebra">{p.url_ou_arquivo}</div>}
          </>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

function BensDaEleicao({ ponto: p }: { ponto: PontoPatrimonial }) {
  return (
    <details className="bens-eleicao">
      <summary>
        Ver {p.bens.length === 1 ? 'o bem declarado' : `os ${p.bens.length} bens declarados`} em {p.ano}
      </summary>
      <Tabela rotulo={`Bens declarados em ${p.ano}`}>
        <thead>
          <tr>
            <th scope="col">Nº</th>
            <th scope="col">Tipo</th>
            <th scope="col">Descrição</th>
            <th scope="col">Valor informado</th>
            <th scope="col">Atualizado em</th>
          </tr>
        </thead>
        <tbody>
          {p.bens.map((b, i) => (
            <tr key={`${b.ordem}-${i}`}>
              <td>{b.ordem || '—'}</td>
              <td>{mascararCpfs(b.tipo) || '—'}</td>
              <td>{mascararCpfs(b.descricao) || '—'}</td>
              <td>{b.valor === null ? <span className="mudo">valor não informado</span> : formatarReais(b.valor)}</td>
              <td>{formatarDia(b.atualizado_em)}</td>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </details>
  );
}
