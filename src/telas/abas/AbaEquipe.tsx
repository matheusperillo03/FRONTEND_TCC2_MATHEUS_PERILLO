import { useEffect, useState, type FormEvent } from 'react';
import {
  PAPEIS_CASO,
  SITUACOES_TAREFA,
  type AlteracaoTarefa,
  type Anotacao,
  type Id,
  type Membro,
  type PapelCaso,
  type SituacaoTarefa,
  type Tarefa,
} from '../../api';
import { ItemAnotacao } from '../../componentes/Anotacoes';
import { Campo, Carregando, Mensagem, Tabela, formatarData, formatarDia } from '../../componentes/basicos';
import { rotuloPapel, usePapelNoCaso } from '../../sessao/PapelContext';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

const ROTULOS_SITUACAO: Record<string, string> = { aberta: 'aberta', em_andamento: 'em andamento', concluida: 'concluída', cancelada: 'cancelada' };
const ROTULOS_CAMPO: Record<string, string> = { titulo: 'título', descricao: 'descrição', responsavel: 'responsável', situacao: 'situação', prazo: 'prazo' };

export function rotuloSituacaoTarefa(situacao: string): string {
  return ROTULOS_SITUACAO[situacao] ?? situacao;
}

const O_QUE_CADA_PAPEL_FAZ: Record<PapelCaso, string> = {
  leitor: 'consulta o caso',
  investigador: 'consulta e altera (coletas, decisões, anotações, tarefas)',
  responsavel: 'tudo do investigador e gerencia a equipe',
};

export interface AbaEquipeProps {
  casoId: Id;
  /** Avisa a tela do caso para atualizar as contagens do cabeçalho. */
  aoMudar?: () => void;
}

/**
 * Trabalho em equipe no caso: membros e papéis (RNF01, H23), tarefas com
 * histórico e a lista geral de anotações (RF08, H37).
 */
export function AbaEquipe({ casoId, aoMudar }: AbaEquipeProps) {
  const { cliente } = useSessao();
  const membros = useChamada<Membro[]>();

  const carregarMembros = () => membros.executar(() => cliente.listarMembros(casoId));

  useEffect(() => {
    void carregarMembros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  return (
    <div className="equipe">
      <SecaoMembros casoId={casoId} membros={membros.dados} carregando={membros.carregando} erro={membros.erro} aoAtualizar={(lista) => membros.executar(async () => lista)} aoMudar={aoMudar} />
      <SecaoTarefas casoId={casoId} membros={membros.dados ?? []} aoMudar={aoMudar} />
      <SecaoAnotacoes casoId={casoId} />
    </div>
  );
}

// ---- Membros -----------------------------------------------------------------

interface SecaoMembrosProps {
  casoId: Id;
  membros: Membro[] | null;
  carregando: boolean;
  erro: string | null;
  /** As rotas de escrita devolvem a lista atualizada: a tela a usa sem nova consulta. */
  aoAtualizar: (lista: Membro[]) => unknown;
  aoMudar?: () => void;
}

function SecaoMembros({ casoId, membros, carregando, erro, aoAtualizar, aoMudar }: SecaoMembrosProps) {
  const { cliente, me } = useSessao();
  const { papel, ehResponsavel } = usePapelNoCaso();
  const acao = useChamada<Membro[]>();
  const [login, setLogin] = useState('');
  const [novoPapel, setNovoPapel] = useState<PapelCaso>('investigador');
  const [feito, setFeito] = useState<string | null>(null);

  async function aplicar(fn: () => Promise<Membro[]>, mensagem: string) {
    setFeito(null);
    const lista = await acao.executar(fn);
    if (lista) {
      setFeito(mensagem);
      await aoAtualizar(lista);
      aoMudar?.();
    }
    return lista;
  }

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    const usuario = login.trim().toLowerCase();
    if (!usuario) return;
    const lista = await aplicar(() => cliente.definirMembro(casoId, { usuario, papel: novoPapel }), `${usuario} agora é ${rotuloPapel(novoPapel)} neste caso.`);
    if (lista) setLogin('');
  }

  const responsaveis = (membros ?? []).filter((m) => m.papel === 'responsavel').length;

  return (
    <section className="br-card painel" aria-labelledby="equipe-membros-titulo">
      <h3 id="equipe-membros-titulo">Membros do caso</h3>
      <p className="mudo">
        Só os membros veem este caso. Papéis: <strong>leitor</strong> {O_QUE_CADA_PAPEL_FAZ.leitor}; <strong>investigador</strong>{' '}
        {O_QUE_CADA_PAPEL_FAZ.investigador}; <strong>responsável</strong> {O_QUE_CADA_PAPEL_FAZ.responsavel}. Seu papel:{' '}
        <strong data-testid="meu-papel">{rotuloPapel(papel)}</strong>.
      </p>
      {!ehResponsavel && (
        <Mensagem tipo="info">
          Só o responsável pelo caso acrescenta membros, muda papéis e remove membros. Com o papel de {rotuloPapel(papel)}, você vê a
          equipe, sem alterá-la.
        </Mensagem>
      )}
      {carregando && !membros && <Carregando />}
      {erro && <Mensagem tipo="erro">{erro}</Mensagem>}
      {acao.erro && <Mensagem tipo="erro">{acao.erro}</Mensagem>}
      {feito && !acao.erro && <Mensagem tipo="ok">{feito}</Mensagem>}
      {membros && (
        <Tabela rotulo="Membros do caso">
          <thead>
            <tr>
              <th scope="col">Usuário</th>
              <th scope="col">Papel</th>
              <th scope="col">Acrescentado por</th>
              <th scope="col">Em</th>
              <th scope="col">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => {
              // O caso não pode ficar sem responsável: o back-end recusa (422), e a tela já avisa.
              const unicoResponsavel = m.papel === 'responsavel' && responsaveis <= 1;
              const travado = !ehResponsavel || acao.carregando || unicoResponsavel;
              const motivo = !ehResponsavel ? 'Só o responsável altera a equipe' : unicoResponsavel ? 'O caso precisa de ao menos um responsável' : undefined;
              return (
                <tr key={m.usuario} data-testid="membro">
                  <td>
                    <strong>{m.usuario}</strong>
                    {m.usuario === me?.usuario && <span className="mudo"> (você)</span>}
                  </td>
                  <td>
                    <select
                      aria-label={`Papel de ${m.usuario}`}
                      value={m.papel}
                      disabled={travado}
                      title={motivo}
                      onChange={(e) => {
                        const escolhido = e.target.value as PapelCaso;
                        void aplicar(() => cliente.definirMembro(casoId, { usuario: m.usuario, papel: escolhido }), `${m.usuario} agora é ${rotuloPapel(escolhido)} neste caso.`);
                      }}
                    >
                      {PAPEIS_CASO.map((p) => (
                        <option key={p} value={p}>
                          {rotuloPapel(p)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{m.adicionado_por}</td>
                  <td>{formatarData(m.adicionado_em)}</td>
                  <td>
                    <button
                      type="button"
                      className="br-button secondary small"
                      disabled={travado}
                      title={motivo}
                      aria-label={`Remover ${m.usuario}`}
                      onClick={() => void aplicar(() => cliente.removerMembro(casoId, m.usuario), `${m.usuario} foi removido(a) do caso e deixou de vê-lo.`)}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
      )}
      <form onSubmit={adicionar} className="linha formulario-membro" aria-label="Acrescentar membro">
        <Campo rotulo="Login do usuário" emLinha>
          <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} disabled={!ehResponsavel} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={100} />
        </Campo>
        <Campo rotulo="Papel" emLinha>
          <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value as PapelCaso)} disabled={!ehResponsavel}>
            {PAPEIS_CASO.map((p) => (
              <option key={p} value={p}>
                {rotuloPapel(p)}
              </option>
            ))}
          </select>
        </Campo>
        <button type="submit" className="br-button primary small" disabled={!ehResponsavel || acao.carregando || !login.trim()}>
          Acrescentar membro
        </button>
      </form>
    </section>
  );
}

// ---- Tarefas -----------------------------------------------------------------

function SecaoTarefas({ casoId, membros, aoMudar }: { casoId: Id; membros: Membro[]; aoMudar?: () => void }) {
  const { cliente } = useSessao();
  const { podeEscrever, motivoSomenteLeitura } = usePapelNoCaso();
  const lista = useChamada<Tarefa[]>();
  const criacao = useChamada<Tarefa>();
  const [filtro, setFiltro] = useState<'todas' | SituacaoTarefa>('todas');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [prazo, setPrazo] = useState('');

  const carregar = (f = filtro) => lista.executar(() => cliente.listarTarefas(casoId, f === 'todas' ? undefined : f));

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !podeEscrever) return;
    const r = await criacao.executar(() =>
      cliente.criarTarefa(casoId, {
        titulo: titulo.trim(),
        ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
        ...(responsavel ? { responsavel } : {}),
        ...(prazo ? { prazo } : {}),
      }),
    );
    if (r) {
      setTitulo('');
      setDescricao('');
      setResponsavel('');
      setPrazo('');
      await carregar();
      aoMudar?.();
    }
  }

  async function aposAlterar() {
    await carregar();
    aoMudar?.();
  }

  const tarefas = lista.dados ?? [];

  return (
    <section className="br-card painel" aria-labelledby="equipe-tarefas-titulo">
      <div className="painel-cabecalho">
        <h3 id="equipe-tarefas-titulo">Tarefas</h3>
        <Campo rotulo="Situação das tarefas" emLinha>
          <select
            value={filtro}
            onChange={(e) => {
              const f = e.target.value as typeof filtro;
              setFiltro(f);
              void carregar(f);
            }}
          >
            <option value="todas">todas</option>
            {SITUACOES_TAREFA.map((s) => (
              <option key={s} value={s}>
                {rotuloSituacaoTarefa(s)}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {lista.carregando && !lista.dados && <Carregando />}
      {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
      {lista.dados && tarefas.length === 0 && <p className="vazio">Nenhuma tarefa{filtro === 'todas' ? '' : ' com esta situação'}.</p>}
      <ul className="lista-tarefas">
        {tarefas.map((t) => (
          <CartaoTarefa key={String(t.id)} casoId={casoId} tarefa={t} membros={membros} aoAlterar={aposAlterar} />
        ))}
      </ul>

      <form onSubmit={criar} className="formulario formulario-tarefa" aria-label="Nova tarefa">
        <h4>Nova tarefa</h4>
        {motivoSomenteLeitura && (
          <p className="campo-dica" data-testid="tarefas-somente-leitura">
            {motivoSomenteLeitura}
          </p>
        )}
        <div className="grade-2">
          <Campo rotulo="Título da tarefa">
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={300} disabled={!podeEscrever} required />
          </Campo>
          <Campo rotulo="Responsável pela tarefa" dica="Precisa ser membro do caso.">
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} disabled={!podeEscrever}>
              <option value="">sem responsável</option>
              {membros.map((m) => (
                <option key={m.usuario} value={m.usuario}>
                  {m.usuario}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Descrição da tarefa" tipo="textarea">
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={5000} disabled={!podeEscrever} />
          </Campo>
          <Campo rotulo="Prazo da tarefa">
            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} disabled={!podeEscrever} />
          </Campo>
        </div>
        <div className="linha">
          <button type="submit" className="br-button primary small" disabled={!podeEscrever || criacao.carregando || !titulo.trim()}>
            {criacao.carregando ? 'Criando…' : 'Criar tarefa'}
          </button>
        </div>
        {criacao.erro && <Mensagem tipo="erro">{criacao.erro}</Mensagem>}
      </form>
    </section>
  );
}

function valorDoHistorico(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '(vazio)';
  if (campo === 'situacao') return rotuloSituacaoTarefa(String(valor));
  if (campo === 'prazo') return formatarDia(String(valor));
  return String(valor);
}

interface CartaoTarefaProps {
  casoId: Id;
  tarefa: Tarefa;
  membros: Membro[];
  aoAlterar?: () => unknown;
}

/** Tarefa com responsável, situação, prazo e o histórico de quem mudou o quê (valor anterior e novo). */
export function CartaoTarefa({ casoId, tarefa, membros, aoAlterar }: CartaoTarefaProps) {
  const { cliente } = useSessao();
  const { podeEscrever, motivoSomenteLeitura } = usePapelNoCaso();
  const alteracao = useChamada<Tarefa>();
  const [editando, setEditando] = useState(false);
  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [descricao, setDescricao] = useState(tarefa.descricao);
  const [responsavel, setResponsavel] = useState(tarefa.responsavel ?? '');
  const [situacao, setSituacao] = useState<SituacaoTarefa>(tarefa.situacao as SituacaoTarefa);
  const [prazo, setPrazo] = useState(tarefa.prazo ?? '');
  const idTitulo = `tarefa-${String(tarefa.id)}-titulo`;

  function abrirEdicao() {
    setTitulo(tarefa.titulo);
    setDescricao(tarefa.descricao);
    setResponsavel(tarefa.responsavel ?? '');
    setSituacao(tarefa.situacao as SituacaoTarefa);
    setPrazo(tarefa.prazo ?? '');
    alteracao.limpar();
    setEditando(true);
  }

  /** Só o que mudou vai no corpo; `null` limpa o responsável e o prazo. */
  function montar(): AlteracaoTarefa {
    const corpo: AlteracaoTarefa = {};
    if (titulo.trim() !== tarefa.titulo) corpo.titulo = titulo.trim();
    if (descricao.trim() !== tarefa.descricao) corpo.descricao = descricao.trim();
    if (responsavel !== (tarefa.responsavel ?? '')) corpo.responsavel = responsavel || null;
    if (situacao !== tarefa.situacao) corpo.situacao = situacao;
    if (prazo !== (tarefa.prazo ?? '')) corpo.prazo = prazo || null;
    return corpo;
  }

  const corpo = editando ? montar() : {};
  const mudou = Object.keys(corpo).length > 0;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!mudou || !titulo.trim()) return;
    const r = await alteracao.executar(() => cliente.alterarTarefa(casoId, tarefa.id, corpo));
    if (r) {
      setEditando(false);
      await aoAlterar?.();
    }
  }

  // O responsável atual continua escolhível mesmo que tenha saído da equipe (o back-end recusa só ao trocar para quem não é membro).
  const opcoesResponsavel = [...new Set([...membros.map((m) => m.usuario), ...(tarefa.responsavel ? [tarefa.responsavel] : [])])];

  return (
    <li className={`br-card tarefa tarefa-${tarefa.situacao}${tarefa.atrasada ? ' tarefa-atrasada' : ''}`} aria-labelledby={idTitulo} data-testid="tarefa">
      <header className="tarefa-cabecalho">
        <h4 id={idTitulo}>{tarefa.titulo}</h4>
        <span className={`br-tag small situacao-tarefa situacao-tarefa-${tarefa.situacao}`}>{rotuloSituacaoTarefa(tarefa.situacao)}</span>
        {tarefa.atrasada && <span className="br-tag small etiqueta-atrasada">atrasada</span>}
        <button type="button" className="br-button secondary small" onClick={() => (editando ? setEditando(false) : abrirEdicao())} disabled={!podeEscrever} title={motivoSomenteLeitura ?? undefined}>
          {editando ? 'Cancelar' : 'Alterar'}
        </button>
      </header>
      {tarefa.descricao && <p className="anotacao-texto">{tarefa.descricao}</p>}
      <p className="mudo">
        Responsável: <strong>{tarefa.responsavel ?? 'sem responsável'}</strong> · Prazo: <strong>{tarefa.prazo ? formatarDia(tarefa.prazo) : 'sem prazo'}</strong> · criada por{' '}
        {tarefa.criado_por} em {formatarData(tarefa.criado_em)}
      </p>

      {editando && (
        <form onSubmit={salvar} className="formulario" aria-label={`Alterar a tarefa ${tarefa.titulo}`}>
          <div className="grade-2">
            <Campo rotulo="Título">
              <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={300} required />
            </Campo>
            <Campo rotulo="Situação">
              <select value={situacao} onChange={(e) => setSituacao(e.target.value as SituacaoTarefa)}>
                {SITUACOES_TAREFA.map((s) => (
                  <option key={s} value={s}>
                    {rotuloSituacaoTarefa(s)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Responsável">
              <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
                <option value="">sem responsável</option>
                {opcoesResponsavel.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Prazo">
              <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </Campo>
          </div>
          <Campo rotulo="Descrição" tipo="textarea">
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={5000} />
          </Campo>
          <div className="linha">
            <button type="submit" className="br-button primary small" disabled={alteracao.carregando || !mudou || !titulo.trim()}>
              {alteracao.carregando ? 'Gravando…' : 'Gravar alterações'}
            </button>
          </div>
          {alteracao.erro && <Mensagem tipo="erro">{alteracao.erro}</Mensagem>}
        </form>
      )}

      <details className="tarefa-historico">
        <summary>Histórico ({tarefa.historico.length})</summary>
        <ol className="lista-decisoes" aria-label={`Histórico da tarefa ${tarefa.titulo}`}>
          {tarefa.historico.map((evento, i) => (
            <li key={`${evento.quando}-${i}`} data-testid="evento-tarefa">
              <strong>{evento.usuario}</strong> em {formatarData(evento.quando)}
              <ul className="lista-simples">
                {Object.entries(evento.alteracoes ?? {}).map(([campo, mudanca]) => (
                  <li key={campo}>
                    {ROTULOS_CAMPO[campo] ?? campo}: {valorDoHistorico(campo, mudanca?.de)} → {valorDoHistorico(campo, mudanca?.para)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}

// ---- Anotações (lista geral) ---------------------------------------------------

function SecaoAnotacoes({ casoId }: { casoId: Id }) {
  const { cliente } = useSessao();
  const lista = useChamada<Anotacao[]>();
  const carregar = () => lista.executar(() => cliente.listarAnotacoes(casoId));

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  return (
    <section className="br-card painel" aria-labelledby="equipe-anotacoes-titulo">
      <div className="painel-cabecalho">
        <h3 id="equipe-anotacoes-titulo">Anotações do caso</h3>
        <button type="button" className="br-button secondary small" onClick={() => void carregar()} disabled={lista.carregando}>
          Atualizar
        </button>
      </div>
      <p className="mudo">
        Todas as anotações da equipe, da mais recente para a mais antiga. Para anotar, abra a entidade (aba Entidades) ou o
        alerta (aba Alertas). As anotações são só de acréscimo: não se editam nem se apagam.
      </p>
      {lista.carregando && !lista.dados && <Carregando />}
      {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
      {lista.dados && lista.dados.length === 0 && <p className="vazio">Nenhuma anotação neste caso.</p>}
      {lista.dados && lista.dados.length > 0 && (
        <ul className="lista-anotacoes" aria-label="Anotações do caso">
          {lista.dados.map((a) => (
            <ItemAnotacao key={String(a.id)} anotacao={a} comAlvo />
          ))}
        </ul>
      )}
    </section>
  );
}
