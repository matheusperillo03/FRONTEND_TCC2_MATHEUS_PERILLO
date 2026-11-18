import { useEffect, useState } from 'react';
import {
  GRUPOS_TIPOLOGIA,
  ROTULOS_GRUPO_TIPOLOGIA,
  TIPOLOGIAS,
  grupoDaTipologia,
  mesmoId,
  type Alerta,
  type DecisaoAlertaValor,
  type ExecucaoAlertas,
  type Id,
  type ParametrosTipologias,
  type Tipologia,
} from '../../api';
import { CartaoAlerta, TEXTO_SINAL_FRACO, irParaCartaoAlerta } from '../../componentes/CartaoAlerta';
import { Caixa, Campo, Carregando, Mensagem, contar } from '../../componentes/basicos';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

export interface AbaAlertasProps {
  casoId: Id;
  aoAbrirEntidade?: (id: Id) => void;
  aoExecutar?: () => void;
  /** Avisos da última execução (`avisos_tipologias` do caso): o que ficou sem avaliação. */
  avisosTipologias?: string[];
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

/** Sem teto no contrato para os limiares das tipologias de lavagem: só o mínimo é conferido. */
const SEM_TETO = Number.MAX_SAFE_INTEGER;

interface LimiarLavagem {
  nome: keyof ParametrosTipologias;
  rotulo: string;
  dica: string;
  inteiro?: boolean;
  minimo: number;
  minimoExclusivo?: boolean;
}

/** Limiares por execução das tipologias de lavagem e da combinação (contrato da API, seção 1.2). */
const LIMIARES_LAVAGEM: LimiarLavagem[] = [
  { nome: 'l1_minimo_estabelecimentos', rotulo: 'L1 — mínimo de estabelecimentos no endereço', dica: 'Inteiro a partir de 2.', inteiro: true, minimo: 2 },
  { nome: 'l1_janela_abertura_dias', rotulo: 'L1 — janela de abertura (dias)', dica: 'Inteiro a partir de 1.', inteiro: true, minimo: 1 },
  { nome: 'l1_minimo_abertas_na_janela', rotulo: 'L1 — mínimo de empresas abertas na janela', dica: 'Inteiro a partir de 2.', inteiro: true, minimo: 2 },
  { nome: 'l3_minimo_empresas', rotulo: 'L3 — mínimo de empresas do mesmo administrador', dica: 'Inteiro a partir de 2.', inteiro: true, minimo: 2 },
  { nome: 'l3_minimo_abertas_na_janela', rotulo: 'L3 — mínimo de empresas abertas na janela', dica: 'Inteiro a partir de 1.', inteiro: true, minimo: 1 },
  { nome: 'l3_janela_meses', rotulo: 'L3 — janela de abertura (meses)', dica: 'Inteiro a partir de 1.', inteiro: true, minimo: 1 },
  { nome: 'l4_minimo_niveis', rotulo: 'L4 — mínimo de níveis de sócio pessoa jurídica', dica: 'Inteiro a partir de 2.', inteiro: true, minimo: 2 },
  { nome: 'l7_dias_apos_abertura', rotulo: 'L7 — dias após a abertura que ainda contam como fundador', dica: 'Inteiro a partir de 0.', inteiro: true, minimo: 0 },
  { nome: 'l7_meses_antes_contrato', rotulo: 'L7 — meses antes do contrato', dica: 'Inteiro a partir de 1.', inteiro: true, minimo: 1 },
  { nome: 'l14_valor_minimo', rotulo: 'L14 — valor contratado mínimo (R$)', dica: 'Número a partir de 0.', minimo: 0 },
  { nome: 'l15_minimo_cnaes', rotulo: 'L15 — mínimo de CNAEs', dica: 'Inteiro a partir de 2.', inteiro: true, minimo: 2 },
  { nome: 'l15_minimo_categorias', rotulo: 'L15 — mínimo de categorias de objeto', dica: 'Inteiro a partir de 2.', inteiro: true, minimo: 2 },
  { nome: 'l16_dias_minimos', rotulo: 'L16 — dias mínimos entre a abertura e a vigência do convênio', dica: 'Inteiro a partir de 0.', inteiro: true, minimo: 0 },
  { nome: 'comb_minimo_tipologias', rotulo: 'COMB — mínimo de tipologias distintas', dica: 'Inteiro a partir de 2.', inteiro: true, minimo: 2 },
  { nome: 'comb_peso_minimo', rotulo: 'COMB — soma mínima dos pesos', dica: 'Número maior que 0.', minimo: 0, minimoExclusivo: true },
];

const ehCombinacao = (a: Alerta) => grupoDaTipologia(a.tipologia, a.grupo) === 'combinacao';
const ehSinalFraco = (a: Alerta) => a.sinal_fraco === true && !ehCombinacao(a);

export function AbaAlertas({ casoId, aoAbrirEntidade, aoExecutar, avisosTipologias }: AbaAlertasProps) {
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
  /** Limiares das tipologias de lavagem e da combinação, como texto, pelo nome do parâmetro. */
  const [limiaresLavagem, setLimiaresLavagem] = useState<Record<string, string>>({});
  /** Sinais fracos ficam recolhidos: sozinhos não indicam nada. */
  const [sinaisFracosAbertos, setSinaisFracosAbertos] = useState(false);

  const limiarT5 = lerLimiar(t5Minimo, { inteiro: true, minimo: 2, maximo: 1000 });
  const limiarT8 = lerLimiar(t8Limite, { minimo: 0, minimoExclusivo: true, maximo: 1000 });
  const limiarT8Reforma = lerLimiar(t8LimiteReforma, { minimo: 0, minimoExclusivo: true, maximo: 1000 });
  const lidosLavagem = LIMIARES_LAVAGEM.map((l) => ({
    ...l,
    lido: lerLimiar(limiaresLavagem[l.nome] ?? '', { inteiro: l.inteiro, minimo: l.minimo, minimoExclusivo: l.minimoExclusivo, maximo: SEM_TETO }),
  }));
  const execucaoValida = escolhidas.length > 0 && limiarT5.valido && limiarT8.valido && limiarT8Reforma.valido && lidosLavagem.every((l) => l.lido.valido);

  function alternarTipologia(t: Tipologia, marcada: boolean) {
    setEscolhidas((atual) => TIPOLOGIAS.filter((x) => (x === t ? marcada : atual.includes(x))));
  }

  /** Só manda o que foi alterado: sem corpo, o back-end roda todas as tipologias com a configuração em vigor. */
  function montarExecucao(): ExecucaoAlertas | undefined {
    const parametros: ParametrosTipologias = {};
    if (limiarT5.valor !== undefined) parametros.t5_minimo_contratacoes = limiarT5.valor;
    if (limiarT8.valor !== undefined) parametros.t8_percentual_limite = limiarT8.valor;
    if (limiarT8Reforma.valor !== undefined) parametros.t8_percentual_limite_reforma = limiarT8Reforma.valor;
    for (const l of lidosLavagem) if (l.lido.valor !== undefined) parametros[l.nome] = l.lido.valor;
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
  // Três blocos: a combinação em destaque, os alertas de cada tipologia e, à parte, os sinais fracos.
  const combinacoes = alertas.filter(ehCombinacao);
  const sinaisFracos = alertas.filter(ehSinalFraco);
  const demais = alertas.filter((a) => !ehCombinacao(a) && !ehSinalFraco(a));

  /** Leva ao cartão de um componente da combinação, mesmo que ele esteja filtrado ou entre os sinais fracos recolhidos. */
  function irParaAlerta(alertaId: Id) {
    const alvo = todos.find((a) => mesmoId(a.id, alertaId));
    if (!alvo) return;
    if (!alertas.includes(alvo)) {
      setFiltro('todos');
      setSituacao('todas');
    }
    if (ehSinalFraco(alvo)) setSinaisFracosAbertos(true);
    // O cartão pode só existir depois da próxima renderização (filtros limpos ou seção aberta).
    window.setTimeout(() => irParaCartaoAlerta(alertaId), 0);
  }

  const cartao = (a: Alerta) => (
    <CartaoAlerta
      key={String(a.id)}
      alerta={a}
      rotulosEntidades={rotulos}
      aoAbrirEntidade={aoAbrirEntidade}
      aoDecidir={decidir}
      casoId={casoId}
      aoIrParaAlerta={irParaAlerta}
    />
  );

  return (
    <div className="alertas">
      <div className="painel-cabecalho">
        <p className="mudo">
          Tipologias de contratações (T1 a T10), de lavagem e ocultação (L) e a combinação de alertas na mesma entidade,
          ordenadas por severidade. Todo alerta mostra a regra, o motivo, as evidências com fonte e hash de captura (RNF05)
          e a política de erro da tipologia. O alerta é uma pista: confirme ou descarte cada um, com justificativa.
        </p>
        <div className="linha">
          <Campo rotulo="Tipologia" emLinha>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
              <option value="todos">todas</option>
              {GRUPOS_TIPOLOGIA.map((g) => (
                <optgroup key={g} label={ROTULOS_GRUPO_TIPOLOGIA[g]}>
                  {TIPOLOGIAS.filter((t) => grupoDaTipologia(t) === g).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </optgroup>
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
          {GRUPOS_TIPOLOGIA.map((g) => (
            <div key={g} role="group" aria-label={ROTULOS_GRUPO_TIPOLOGIA[g]} className="caixas-tipologias">
              <strong className="caixas-tipologias-rotulo">{ROTULOS_GRUPO_TIPOLOGIA[g]}:</strong>
              <div className="caixas-tipologias-opcoes">
                {TIPOLOGIAS.filter((t) => grupoDaTipologia(t) === g).map((t) => (
                  <Caixa key={t} marcado={escolhidas.includes(t)} aoMudar={(marcada) => alternarTipologia(t, marcada)}>
                    {t}
                  </Caixa>
                ))}
              </div>
            </div>
          ))}
          <p className="campo-dica">
            As tipologias desmarcadas não são reavaliadas nesta execução. A combinação (COMB) roda por último, sobre os alertas
            que existirem. O que cada uma faz está na aba Tipologias.
          </p>
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
          <details className="limiares-lavagem">
            <summary>Limiares das tipologias de lavagem e da combinação ({LIMIARES_LAVAGEM.length})</summary>
            <div className="grade-2">
              {lidosLavagem.map((l) => (
                <Campo key={l.nome} rotulo={l.rotulo} dica={l.dica}>
                  <input
                    type="number"
                    min={l.minimo}
                    step={l.inteiro ? 1 : 'any'}
                    value={limiaresLavagem[l.nome] ?? ''}
                    onChange={(e) => setLimiaresLavagem((atual) => ({ ...atual, [l.nome]: e.target.value }))}
                    aria-invalid={!l.lido.valido}
                  />
                </Campo>
              ))}
            </div>
          </details>
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
      {avisosTipologias && avisosTipologias.length > 0 && (
        <div data-testid="avisos-tipologias">
          <Mensagem tipo="aviso">
            {contar(avisosTipologias.length, 'aviso')} da última execução das tipologias (o que ficou sem avaliação por falta de dado):
            <ul>
              {avisosTipologias.map((aviso, i) => (
                <li key={i}>{aviso}</li>
              ))}
            </ul>
          </Mensagem>
        </div>
      )}
      {todos.length > 0 && (
        <p role="status" data-testid="resumo-situacao">
          {contar(contagem('pendente'), 'pendente')} de análise · {contar(contagem('confirmado'), 'confirmado')} ·{' '}
          {contar(contagem('descartado'), 'descartado')}
        </p>
      )}
      {lista.dados && todos.length === 0 && <p className="vazio">Nenhum alerta. Execute as tipologias após a coleta.</p>}
      {todos.length > 0 && alertas.length === 0 && <p className="vazio">Nenhum alerta com os filtros escolhidos.</p>}
      {combinacoes.length > 0 && (
        <section className="grupo-alertas" aria-labelledby="alertas-combinacao-titulo" data-testid="grupo-combinacao">
          <h3 id="alertas-combinacao-titulo">Combinação de alertas na mesma entidade ({combinacoes.length})</h3>
          <p className="mudo">
            Em destaque porque vários sinais recaem sobre a mesma entidade. Não é escore de culpa: cada combinação lista os
            alertas que a compõem, o peso de cada um e a soma contra o mínimo.
          </p>
          {combinacoes.map(cartao)}
        </section>
      )}
      {demais.length > 0 && (
        <section className="grupo-alertas" aria-labelledby="alertas-tipologias-titulo" data-testid="grupo-alertas">
          <h3 id="alertas-tipologias-titulo">Alertas por tipologia ({demais.length})</h3>
          {demais.map(cartao)}
        </section>
      )}
      {sinaisFracos.length > 0 && (
        <section className="grupo-alertas sinais-fracos" aria-labelledby="alertas-sinais-fracos-titulo" data-testid="grupo-sinais-fracos">
          <h3 id="alertas-sinais-fracos-titulo">Sinais fracos ({sinaisFracos.length})</h3>
          <p>{TEXTO_SINAL_FRACO} Por isso ficam à parte e recolhidos.</p>
          <div className="linha">
            <button
              type="button"
              className="br-button secondary small"
              aria-expanded={sinaisFracosAbertos}
              aria-controls="lista-sinais-fracos"
              onClick={() => setSinaisFracosAbertos((aberto) => !aberto)}
            >
              {sinaisFracosAbertos ? 'Recolher sinais fracos' : 'Mostrar sinais fracos'}
            </button>
          </div>
          <div id="lista-sinais-fracos" className="grupo-alertas" hidden={!sinaisFracosAbertos}>
            {sinaisFracosAbertos && sinaisFracos.map(cartao)}
          </div>
        </section>
      )}
    </div>
  );
}
