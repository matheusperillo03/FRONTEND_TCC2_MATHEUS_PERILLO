import { useEffect } from 'react';
import type { LimiteDispensa, ParametroTipologia, TipologiaCatalogo } from '../../api';
import { rotuloSeveridade } from '../../componentes/CartaoAlerta';
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

function ValorParametro({ parametro }: { parametro: ParametroTipologia }) {
  const { nome, valor } = parametro;
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
  return (
    <article className="br-card tipologia-catalogo" aria-labelledby={idTitulo} data-testid="tipologia">
      <header className="alerta-cabecalho">
        <span className="br-tag small etiqueta-tipologia">{t.codigo}</span>
        <h3 id={idTitulo}>{t.nome}</h3>
        <span className={`br-tag small severidade severidade-${sev}`}>severidade: {rotuloSeveridade(t.severidade)}</span>
        {ROTULOS_PREFERE[t.prefere_evitar] && <span className="br-tag small etiqueta-politica">{ROTULOS_PREFERE[t.prefere_evitar]}</span>}
      </header>
      <dl>
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
      {catalogo.carregando && !catalogo.dados && <Carregando />}
      {catalogo.erro && <Mensagem tipo="erro">{catalogo.erro}</Mensagem>}
      {catalogo.dados && catalogo.dados.length === 0 && <p className="vazio">O servidor não devolveu nenhuma tipologia.</p>}
      {(catalogo.dados ?? []).map((t) => (
        <CartaoTipologia key={t.codigo} tipologia={t} />
      ))}
    </div>
  );
}
