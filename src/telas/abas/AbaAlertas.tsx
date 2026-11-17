import { useEffect, useState } from 'react';
import { TIPOLOGIAS, type Alerta, type DecisaoAlertaValor, type ExecucaoAlertas, type Id, type ParametrosTipologias, type Tipologia } from '../../api';
import { CartaoAlerta } from '../../componentes/CartaoAlerta';
import { Caixa, Campo, Carregando, Mensagem } from '../../componentes/basicos';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

export interface AbaAlertasProps {
  casoId: Id;
  aoAbrirEntidade?: (id: Id) => void;
  aoExecutar?: () => void;
}

/** Campo vazio = usa a configuração em vigor; preenchido, precisa ser número na faixa do back-end. */
function lerLimiar(texto: string, opcoes: { inteiro?: boolean; minimo: number; minimoExclusivo?: boolean; maximo: number }): { valor?: number; valido: boolean } {
  const t = texto.trim().replace(',', '.');
  if (!t) return { valido: true };
  const n = Number(t);
  const valido =
    Number.isFinite(n) && (!opcoes.inteiro || Number.isInteger(n)) && (opcoes.minimoExclusivo ? n > opcoes.minimo : n >= opcoes.minimo) && n <= opcoes.maximo;
  return { valor: n, valido };
}

export function AbaAlertas({ casoId, aoAbrirEntidade, aoExecutar }: AbaAlertasProps) {
  const { cliente } = useSessao();
  const lista = useChamada<Alerta[]>();
  const [rotulos, setRotulos] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<'todos' | Tipologia>('todos');
  const [situacao, setSituacao] = useState<'todas' | 'pendente' | 'confirmado' | 'descartado'>('todas');
  /** Alertas devolvidos pela decisão, por id: substituem os da lista sem nova consulta. */
  const [decididos, setDecididos] = useState<Record<string, Alerta>>({});
  // Execução: tipologias escolhidas e limiares do horizonte 2 (vazio = configuração em vigor).
  const [escolhidas, setEscolhidas] = useState<Tipologia[]>([...TIPOLOGIAS]);
  const [t5Minimo, setT5Minimo] = useState('');
  const [t8Limite, setT8Limite] = useState('');
  const [t8LimiteReforma, setT8LimiteReforma] = useState('');

  const limiarT5 = lerLimiar(t5Minimo, { inteiro: true, minimo: 2, maximo: 1000 });
  const limiarT8 = lerLimiar(t8Limite, { minimo: 0, minimoExclusivo: true, maximo: 1000 });
  const limiarT8Reforma = lerLimiar(t8LimiteReforma, { minimo: 0, minimoExclusivo: true, maximo: 1000 });
  const execucaoValida = escolhidas.length > 0 && limiarT5.valido && limiarT8.valido && limiarT8Reforma.valido;

  function alternarTipologia(t: Tipologia, marcada: boolean) {
    setEscolhidas((atual) => TIPOLOGIAS.filter((x) => (x === t ? marcada : atual.includes(x))));
  }

  /** Só manda o que foi alterado: sem corpo, o back-end roda T1 a T10 com a configuração em vigor. */
  function montarExecucao(): ExecucaoAlertas | undefined {
    const parametros: ParametrosTipologias = {};
    if (limiarT5.valor !== undefined) parametros.t5_minimo_contratacoes = limiarT5.valor;
    if (limiarT8.valor !== undefined) parametros.t8_percentual_limite = limiarT8.valor;
    if (limiarT8Reforma.valor !== undefined) parametros.t8_percentual_limite_reforma = limiarT8Reforma.valor;
    const corpo: ExecucaoAlertas = {};
    if (Object.keys(parametros).length) corpo.parametros = parametros;
    if (escolhidas.length < TIPOLOGIAS.length) corpo.tipologias = escolhidas;
    return Object.keys(corpo).length ? corpo : undefined;
  }

  useEffect(() => {
    void lista.executar(() => cliente.listarAlertas(casoId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId]);

  // Resolve rótulos das entidades citadas (melhor leitura; falha em silêncio).
  useEffect(() => {
    if (!lista.dados?.length) return;
    let ativo = true;
    void cliente.buscarEntidades(casoId, '').then(
      (ents) => {
        if (!ativo) return;
        setRotulos(Object.fromEntries(ents.map((e) => [String(e.id), e.rotulo])));
      },
      () => undefined,
    );
    return () => {
      ativo = false;
    };
  }, [lista.dados, casoId, cliente]);

  async function executar() {
    if (!execucaoValida) return;
    const corpo = montarExecucao();
    const r = await lista.executar(() => (corpo ? cliente.executarAlertas(casoId, corpo) : cliente.executarAlertas(casoId)));
    if (r) {
      setDecididos({});
      aoExecutar?.();
    }
  }

  /** Erros sobem para o cartão, que os mostra junto do formulário da decisão. */
  async function decidir(alertaId: Id, decisao: DecisaoAlertaValor, justificativa: string) {
    const atualizado = await cliente.decidirAlerta(casoId, alertaId, { decisao, justificativa });
    setDecididos((atual) => ({ ...atual, [String(alertaId)]: atualizado }));
  }

  // A ordem é a do back-end: severidade (alta primeiro), depois tipologia e título (RF14).
  const todos = (lista.dados ?? []).map((a) => decididos[String(a.id)] ?? a);
  const contagem = (s: string) => todos.filter((a) => (a.situacao ?? 'pendente') === s).length;
  const alertas = todos.filter(
    (a) => (filtro === 'todos' || a.tipologia === filtro) && (situacao === 'todas' || (a.situacao ?? 'pendente') === situacao),
  );

  return (
    <div className="alertas">
      <div className="painel-cabecalho">
        <p className="mudo">
          Tipologias T1 a T10, ordenadas por severidade. Todo alerta mostra a regra, o motivo, as evidências com fonte e hash
          de captura (RNF05) e a política de erro da tipologia. O alerta é uma pista: confirme ou descarte cada um, com
          justificativa.
        </p>
        <div className="linha">
          <Campo rotulo="Tipologia" emLinha>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="todos">todas</option>
              {TIPOLOGIAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Situação" emLinha>
            <select value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
              <option value="todas">todas</option>
              <option value="pendente">pendentes</option>
              <option value="confirmado">confirmados</option>
              <option value="descartado">descartados</option>
            </select>
          </Campo>
        </div>
      </div>
      <form
        className="formulario formulario-execucao"
        aria-label="Execução das tipologias"
        onSubmit={(e) => {
          e.preventDefault();
          void executar();
        }}
      >
        <fieldset>
          <legend>Tipologias a executar</legend>
          <div className="caixas-tipologias">
            {TIPOLOGIAS.map((t) => (
              <Caixa key={t} marcado={escolhidas.includes(t)} aoMudar={(marcada) => alternarTipologia(t, marcada)}>
                {t}
              </Caixa>
            ))}
          </div>
          <p className="campo-dica">As tipologias desmarcadas não são reavaliadas nesta execução. O que cada uma faz está na aba Tipologias.</p>
        </fieldset>
        <fieldset>
          <legend>Limiares desta execução (opcionais)</legend>
          <p className="campo-dica">Em branco, vale a configuração em vigor no servidor, mostrada na aba Tipologias.</p>
          <div className="grade-2">
            <Campo rotulo="T5 — mínimo de contratações somadas" dica="Inteiro de 2 a 1000.">
              <input type="number" min={2} max={1000} step={1} value={t5Minimo} onChange={(e) => setT5Minimo(e.target.value)} aria-invalid={!limiarT5.valido} />
            </Campo>
            <Campo rotulo="T8 — limite de acréscimo (%)" dica="Maior que 0, até 1000 (art. 125: 25%).">
              <input type="number" min={0} max={1000} step="any" value={t8Limite} onChange={(e) => setT8Limite(e.target.value)} aria-invalid={!limiarT8.valido} />
            </Campo>
            <Campo rotulo="T8 — limite de acréscimo em reforma (%)" dica="Maior que 0, até 1000 (art. 125: 50%).">
              <input type="number" min={0} max={1000} step="any" value={t8LimiteReforma} onChange={(e) => setT8LimiteReforma(e.target.value)} aria-invalid={!limiarT8Reforma.valido} />
            </Campo>
          </div>
        </fieldset>
        {!execucaoValida && (
          <Mensagem tipo="aviso">
            {escolhidas.length === 0 ? 'Escolha ao menos uma tipologia.' : 'Há limiar fora da faixa aceita: confira os valores informados.'}
          </Mensagem>
        )}
        <div className="linha">
          <button type="submit" className="br-button primary small" disabled={lista.carregando || !execucaoValida}>
            {lista.carregando ? 'Processando…' : 'Executar tipologias'}
          </button>
        </div>
      </form>
      {lista.carregando && <Carregando />}
      {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
      {todos.length > 0 && (
        <p role="status" data-testid="resumo-situacao">
          {contagem('pendente')} pendente(s) de análise · {contagem('confirmado')} confirmado(s) · {contagem('descartado')} descartado(s)
        </p>
      )}
      {lista.dados && todos.length === 0 && <p className="vazio">Nenhum alerta. Execute as tipologias após a coleta.</p>}
      {todos.length > 0 && alertas.length === 0 && <p className="vazio">Nenhum alerta com os filtros escolhidos.</p>}
      {alertas.map((a) => (
        <CartaoAlerta key={String(a.id)} alerta={a} rotulosEntidades={rotulos} aoAbrirEntidade={aoAbrirEntidade} aoDecidir={decidir} casoId={casoId} />
      ))}
    </div>
  );
}
