import { useEffect } from 'react';
import {
  GRUPOS_TIPOLOGIA,
  ROTULOS_GRUPO_TIPOLOGIA,
  grupoDaTipologia,
  type GrupoTipologia,
  type LimiteDispensa,
  type LimiteReceita,
  type LimitesL6,
  type ParametroTipologia,
  type TipologiaCatalogo,
} from '../../api';
import { TEXTO_SINAL_FRACO, formatarPeso, rotuloSeveridade } from '../../componentes/CartaoAlerta';
import { Carregando, Mensagem, Tabela, formatarValor } from '../../componentes/basicos';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

const ROTULOS_PREFERE: Record<string, string> = {
  falso_negativo: 'prefere evitar falso negativo',
  falso_positivo: 'prefere evitar falso positivo',
};

function formatarReais(valor: unknown): string {
  return typeof valor === 'number' ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : formatarValor(valor);
}

/** `t5_limites_dispensa`: objeto por exercício, `{"2026": {inciso_i, inciso_ii, fonte}}`. */
function lerLimitesDispensa(valor: unknown): [string, LimiteDispensa][] | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const linhas = Object.entries(valor as Record<string, unknown>).filter(([, v]) => !!v && typeof v === 'object') as [string, LimiteDispensa][];
  return linhas.sort(([a], [b]) => a.localeCompare(b));
}

const ehObjeto = (valor: unknown): valor is Record<string, unknown> => !!valor && typeof valor === 'object' && !Array.isArray(valor);

/** `l6_limites`: `{mei, me_por_ano, epp_por_ano: {"2018": {anual, mensal_inicio?, fonte}}, me, epp, primeiro_ano}`. */
function lerLimitesL6(valor: unknown): LimitesL6 | null {
  if (!ehObjeto(valor)) return null;
  const limites = valor as LimitesL6;
  if (![limites.mei, limites.me, limites.epp, limites.me_por_ano, limites.epp_por_ano].some(ehObjeto)) return null;
  return limites;
}

/** Linhas de uma tabela por ano, em ordem, com o período em que cada uma vale (até a linha seguinte). */
function linhasPorAno(tabela: unknown): { periodo: string; limite: LimiteReceita }[] {
  const anos = Object.entries(ehObjeto(tabela) ? tabela : {})
    .filter((par): par is [string, LimiteReceita] => ehObjeto(par[1]))
    .sort(([a], [b]) => a.localeCompare(b));
  return anos.map(([ano, limite], i) => {
    const seguinte = anos[i + 1]?.[0];
    if (seguinte === undefined) return { periodo: `a partir de ${ano}`, limite };
    const ultimo = Number(seguinte) - 1;
    return { periodo: Number.isFinite(ultimo) && ultimo > Number(ano) ? `${ano} a ${ultimo}` : ano, limite };
  });
}

/** Tabela dos limites de receita da L6: uma linha por regime ou porte e por período, sempre com a fonte. */
function TabelaLimitesL6({ limites }: { limites: LimitesL6 }) {
  // Resposta antiga, sem a tabela por ano: mostra a linha atual da ME e da EPP.
  const dePorte = (porAno: unknown, atual: LimiteReceita | undefined) => {
    const linhas = linhasPorAno(porAno);
    return linhas.length > 0 || !ehObjeto(atual) ? linhas : [{ periodo: 'todos', limite: atual }];
  };
  const grupos: { rotulo: string; testid: string; linhas: { periodo: string; limite: LimiteReceita }[] }[] = [
    { rotulo: 'MEI', testid: 'limite-mei', linhas: linhasPorAno(limites.mei) },
    { rotulo: 'Microempresa (ME)', testid: 'limite-porte', linhas: dePorte(limites.me_por_ano, limites.me) },
    { rotulo: 'Empresa de pequeno porte (EPP)', testid: 'limite-porte', linhas: dePorte(limites.epp_por_ano, limites.epp) },
  ];
  return (
    <>
      <Tabela rotulo="Limites de receita por regime ou porte" className="tabela-limites">
        <thead>
          <tr>
            <th scope="col">Regime ou porte</th>
            <th scope="col">Ano-calendário</th>
            <th scope="col">Limite anual</th>
            <th scope="col">Por mês, no ano de início</th>
            <th scope="col">Fonte</th>
          </tr>
        </thead>
        <tbody>
          {grupos.flatMap(({ rotulo, testid, linhas }) =>
            linhas.map(({ periodo, limite }) => (
              <tr key={`${rotulo}-${periodo}`} data-testid={testid}>
                <th scope="row">{rotulo}</th>
                <td>{periodo}</td>
                <td>{formatarReais(limite.anual)}</td>
                <td>{limite.mensal_inicio === undefined ? 'limite anual × meses ÷ 12' : formatarReais(limite.mensal_inicio)}</td>
                <td className="quebra">{limite.fonte || '—'}</td>
              </tr>
            )),
          )}
        </tbody>
      </Tabela>
      {typeof limites.primeiro_ano === 'number' && (
        <p className="mudo" data-testid="limites-primeiro-ano">
          Contratos anteriores a {limites.primeiro_ano} não são avaliados: os limites desses anos não foram conferidos no texto legal.
        </p>
      )}
    </>
  );
}

/** `comb_pesos`: `{"T1": 1.0, ..., "L14": 0.5}`, na ordem em que o servidor mandou. */
function TabelaPesos({ pesos }: { pesos: Record<string, unknown> }) {
  return (
    <Tabela rotulo="Peso de cada tipologia na combinação" className="tabela-limites">
      <thead>
        <tr>
          <th scope="col">Tipologia</th>
          <th scope="col">Peso</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(pesos).map(([codigo, peso]) => (
          <tr key={codigo} data-testid="peso-combinacao">
            <th scope="row">
              <code>{codigo}</code>
            </th>
            <td>
              {formatarPeso(peso)}
              {peso === 0 && <span className="mudo"> (não conta)</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}

function ValorParametro({ parametro }: { parametro: ParametroTipologia }) {
  const { nome, valor } = parametro;
  if (nome === 'l6_limites') {
    const limites = lerLimitesL6(valor);
    if (limites) return <TabelaLimitesL6 limites={limites} />;
  }
  if (nome === 'comb_pesos' && ehObjeto(valor)) {
    if (Object.keys(valor).length === 0) return <span className="vazio">nenhum peso configurado</span>;
    return <TabelaPesos pesos={valor} />;
  }
  if (nome === 't5_limites_dispensa') {
    const limites = lerLimitesDispensa(valor);
    if (limites && limites.length === 0) return <span className="vazio">nenhum exercício configurado</span>;
    if (limites) {
      return (
        <Tabela rotulo="Limites de dispensa por exercício" className="tabela-limites">
          <thead>
            <tr>
              <th scope="col">Exercício</th>
              <th scope="col">Inciso I (obras e serviços de engenharia)</th>
              <th scope="col">Inciso II (outros serviços e compras)</th>
              <th scope="col">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {limites.map(([exercicio, limite]) => (
              <tr key={exercicio} data-testid="limite-dispensa">
                <th scope="row">{exercicio}</th>
                <td>{formatarReais(limite.inciso_i)}</td>
                <td>{formatarReais(limite.inciso_ii)}</td>
                <td className="quebra">{limite.fonte || '—'}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      );
    }
  }
  if (Array.isArray(valor)) {
    if (valor.length === 0) return <span className="vazio">nenhum</span>;
    return (
      <>
        {valor.map((item, i) => (
          <code key={i} className="quebra">
            {formatarValor(item)}{' '}
          </code>
        ))}
      </>
    );
  }
  return <code className="quebra">{formatarValor(valor)}</code>;
}

/** Uma tipologia do catálogo: o que a regra faz, em que se baseia e com que configuração roda. */
export function CartaoTipologia({ tipologia: t }: { tipologia: TipologiaCatalogo }) {
  const sev = (t.severidade ?? '').toLowerCase();
  const idTitulo = `tipologia-${t.codigo}-titulo`;
  const grupo = grupoDaTipologia(t.codigo, t.grupo);
  return (
    <article className="br-card tipologia-catalogo" aria-labelledby={idTitulo} data-testid="tipologia">
      <header className="alerta-cabecalho">
        <span className="br-tag small etiqueta-tipologia">{t.codigo}</span>
        <h3 id={idTitulo}>{t.nome}</h3>
        <span className={`br-tag small severidade severidade-${sev}`}>severidade: {rotuloSeveridade(t.severidade)}</span>
        {ROTULOS_PREFERE[t.prefere_evitar] && <span className="br-tag small etiqueta-politica">{ROTULOS_PREFERE[t.prefere_evitar]}</span>}
        {t.sinal_fraco && (
          <span className="br-tag small etiqueta-sinal-fraco" data-testid="selo-sinal-fraco">
            sinal fraco
          </span>
        )}
      </header>
      {t.sinal_fraco && <p data-testid="texto-sinal-fraco">{TEXTO_SINAL_FRACO}</p>}
      <dl>
        <dt>Grupo</dt>
        <dd>{ROTULOS_GRUPO_TIPOLOGIA[grupo]}</dd>
        {grupo !== 'combinacao' && typeof t.peso === 'number' && (
          <>
            <dt>Peso na combinação</dt>
            <dd data-testid="peso-tipologia">
              {formatarPeso(t.peso)}
              {t.peso === 0 && ' (não conta na soma)'}
            </dd>
          </>
        )}
        <dt>História do backlog</dt>
        <dd>{t.historia || '—'}</dd>
        <dt>Regra</dt>
        <dd>{t.regra}</dd>
        <dt>Base legal ou fonte</dt>
        <dd>{t.base}</dd>
        <dt>Política de erro</dt>
        <dd>{t.politica_erro}</dd>
        <dt>Fontes necessárias</dt>
        <dd>{t.fontes.length ? t.fontes.map((f) => <code key={f}>{f} </code>) : '—'}</dd>
      </dl>
      <h4>Parâmetros e valor em vigor</h4>
      {t.parametros.length === 0 ? (
        <p className="vazio">Esta tipologia não tem parâmetro configurável.</p>
      ) : (
        <Tabela rotulo={`Parâmetros da tipologia ${t.codigo}`}>
          <thead>
            <tr>
              <th scope="col">Parâmetro</th>
              <th scope="col">Valor em vigor</th>
              <th scope="col">O que é</th>
              <th scope="col">Por execução?</th>
            </tr>
          </thead>
          <tbody>
            {t.parametros.map((p) => (
              <tr key={p.nome} data-testid="parametro-tipologia">
                <th scope="row">
                  <code>{p.nome}</code>
                </th>
                <td>
                  <ValorParametro parametro={p} />
                </td>
                <td className="quebra">{p.descricao}</td>
                <td>
                  {p.por_execucao ? (
                    <span className="br-tag small etiqueta-por-execucao">pode ser sobrescrito por execução</span>
                  ) : (
                    <span className="br-tag small etiqueta-so-configuracao">só pela configuração do servidor</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </article>
  );
}

const DESCRICAO_GRUPO: Record<GrupoTipologia, string> = {
  contratacao: 'Sinais em contratações públicas (possível infração antecedente).',
  lavagem: 'Sinais de possível ocultação por interposição de pessoas e empresas. Nenhum deles prova lavagem de dinheiro.',
  combinacao: 'Vários alertas na mesma entidade. Prioriza a análise; não é escore de culpa.',
};

/**
 * Catálogo das tipologias (`GET /tipologias`): regra, base, política de erro e
 * configuração em vigor. Não é dado de caso, então não depende da justificativa.
 */
export function AbaTipologias() {
  const { cliente } = useSessao();
  const catalogo = useChamada<TipologiaCatalogo[]>();

  useEffect(() => {
    void catalogo.executar(() => cliente.listarTipologias());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente]);

  return (
    <div className="tipologias">
      <p className="mudo">
        Catálogo das tipologias com a configuração em vigor no servidor. A severidade e a política de erro são decisão do
        autor do protótipo. Os parâmetros marcados como "por execução" podem ser alterados na aba Alertas só para uma
        execução; os demais mudam apenas na configuração do servidor. Todo alerta é uma pista, nunca uma conclusão.
      </p>
      <p className="mudo">
        São três grupos: contratações (T), que apontam possível infração antecedente; lavagem e ocultação (L), que apontam
        possível interposição de pessoas e empresas; e a combinação, que soma os pesos dos alertas da mesma entidade. O
        peso é decisão do autor e não é escore de culpa.
      </p>
      {catalogo.carregando && !catalogo.dados && <Carregando />}
      {catalogo.erro && <Mensagem tipo="erro">{catalogo.erro}</Mensagem>}
      {catalogo.dados && catalogo.dados.length === 0 && <p className="vazio">O servidor não devolveu nenhuma tipologia.</p>}
      {GRUPOS_TIPOLOGIA.map((grupo) => {
        const doGrupo = (catalogo.dados ?? []).filter((t) => grupoDaTipologia(t.codigo, t.grupo) === grupo);
        if (!doGrupo.length) return null;
        return (
          <section key={grupo} className="grupo-tipologias" aria-labelledby={`grupo-tipologias-${grupo}`} data-testid="grupo-tipologias">
            <h3 id={`grupo-tipologias-${grupo}`}>
              {ROTULOS_GRUPO_TIPOLOGIA[grupo]} ({doGrupo.length})
            </h3>
            <p className="mudo">{DESCRICAO_GRUPO[grupo]}</p>
            {doGrupo.map((t) => (
              <CartaoTipologia key={t.codigo} tipologia={t} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
