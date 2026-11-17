import { useEffect, useState, type FormEvent } from 'react';
import type { Caso, Id } from '../api';
import { Campo, Carregando, Mensagem, Tabela, formatarData, formatarDia } from '../componentes/basicos';
import { rotuloPapel } from '../sessao/PapelContext';
import { useSessao } from '../sessao/SessaoContext';
import { useChamada } from '../sessao/useChamada';

export function Casos({ aoAbrir }: { aoAbrir: (id: Id) => void }) {
  const { cliente, justificativa } = useSessao();
  const lista = useChamada<Caso[]>();
  const criacao = useChamada<Caso>();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [numero, setNumero] = useState('');
  const [finalidade, setFinalidade] = useState('');
  const [retencaoAte, setRetencaoAte] = useState('');

  const semJustificativa = !justificativa.trim();

  // O back-end exige justificativa também para listar casos (auditoria).
  useEffect(() => {
    if (semJustificativa) {
      lista.limpar();
      return;
    }
    void lista.executar(() => cliente.listarCasos());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, semJustificativa]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    const novo = await criacao.executar(() =>
      cliente.criarCaso({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        numero_procedimento: numero.trim(),
        finalidade: finalidade.trim(),
        retencao_ate: retencaoAte,
      }),
    );
    if (novo) {
      setTitulo('');
      setDescricao('');
      setNumero('');
      setFinalidade('');
      setRetencaoAte('');
      void lista.executar(() => cliente.listarCasos());
    }
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const completo = titulo.trim() && finalidade.trim() && /^\d{4}-\d{2}-\d{2}$/.test(retencaoAte) && retencaoAte >= hoje;

  return (
    <main className="casos" id="conteudo">
      <section className="br-card painel" aria-labelledby="casos-titulo">
        <div className="painel-cabecalho">
          <h2 id="casos-titulo">Casos</h2>
          <button type="button" className="br-button secondary small" onClick={() => void lista.executar(() => cliente.listarCasos())} disabled={lista.carregando || semJustificativa}>
            Atualizar
          </button>
        </div>
        {semJustificativa && <Mensagem tipo="aviso">Informe a justificativa da consulta no topo da página para listar e abrir casos.</Mensagem>}
        {lista.carregando && <Carregando />}
        {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
        {lista.dados && lista.dados.length === 0 && (
          <p className="vazio">
            Nenhum caso. A lista só traz os casos de que você é membro: crie um ao lado (você será o responsável) ou peça ao responsável
            por um caso que acrescente você à equipe.
          </p>
        )}
        {lista.dados && lista.dados.length > 0 && (
          <Tabela rotulo="Casos">
            <thead>
              <tr>
                <th scope="col">Procedimento</th>
                <th scope="col">Título</th>
                <th scope="col">Criado por</th>
                <th scope="col">Criado em</th>
                <th scope="col">Retenção até</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.map((c) => (
                <tr key={String(c.id)}>
                  <td>
                    <code>{c.numero_procedimento || '—'}</code>
                  </td>
                  <td>
                    <strong>{c.titulo}</strong>
                    {c.descricao && <div className="mudo">{c.descricao}</div>}
                    {c.finalidade && <div className="mudo">Finalidade: {c.finalidade}</div>}
                    {c.meu_papel && <div className="mudo">Seu papel: {rotuloPapel(c.meu_papel)}</div>}
                  </td>
                  <td>{c.criado_por}</td>
                  <td>{formatarData(c.criado_em)}</td>
                  <td>
                    {formatarDia(c.retencao_ate)}
                    {c.somente_leitura && (
                      <div>
                        <span className="br-tag small etiqueta-somente-leitura">só leitura</span>
                      </div>
                    )}
                  </td>
                  <td>
                    <button type="button" className="br-button primary small" onClick={() => aoAbrir(c.id)} disabled={semJustificativa} title={semJustificativa ? 'Informe a justificativa acima' : undefined}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>

      <section className="br-card painel" aria-labelledby="novo-caso-titulo">
        <h2 id="novo-caso-titulo">Novo caso</h2>
        <form onSubmit={criar} className="formulario">
          <Campo rotulo="Título">
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
          </Campo>
          <Campo rotulo="Número do procedimento" dica="Ex.: inquérito policial ou procedimento interno">
            <input type="text" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={100} />
          </Campo>
          <Campo rotulo="Descrição" tipo="textarea">
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={2000} />
          </Campo>
          <Campo rotulo="Finalidade" tipo="textarea" dica="Obrigatória. Para que o caso existe (por exemplo, o fato apurado e o procedimento). Limita o uso dos dados coletados.">
            <textarea value={finalidade} onChange={(e) => setFinalidade(e.target.value)} rows={2} maxLength={2000} required />
          </Campo>
          <Campo rotulo="Prazo de retenção" dica="Obrigatório. Depois desta data o caso fica só para leitura: novas coletas e consultas são recusadas e a recusa é registrada na auditoria.">
            <input type="date" value={retencaoAte} min={hoje} onChange={(e) => setRetencaoAte(e.target.value)} required />
          </Campo>
          <div className="linha">
            <button type="submit" className="br-button primary small" disabled={criacao.carregando || !completo || semJustificativa}>
              {criacao.carregando ? 'Criando…' : 'Criar caso'}
            </button>
          </div>
          {criacao.erro && <Mensagem tipo="erro">{criacao.erro}</Mensagem>}
          {criacao.dados && (
            <Mensagem tipo="ok">
              Caso <strong>{criacao.dados.titulo}</strong> criado (id {String(criacao.dados.id)}).
            </Mensagem>
          )}
        </form>
      </section>
    </main>
  );
}
