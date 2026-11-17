import { useEffect, useId, useState, type FormEvent } from 'react';
import type { AlvoAnotacao, Anotacao, Id } from '../api';
import { mascararCpfs } from '../privacidade';
import { usePapelNoCaso } from '../sessao/PapelContext';
import { useSessao } from '../sessao/SessaoContext';
import { useChamada } from '../sessao/useChamada';
import { Carregando, Mensagem, formatarData } from './basicos';

export const TAMANHO_MAXIMO_ANOTACAO = 5000;

/** Uma anotação: quem, quando, sobre o quê (na lista geral) e o texto. O texto é mostrado como texto. */
export function ItemAnotacao({ anotacao, comAlvo = false }: { anotacao: Anotacao; comAlvo?: boolean }) {
  return (
    <li className="anotacao" data-testid="anotacao">
      <div className="mudo">
        <strong>{anotacao.autor}</strong> · {formatarData(anotacao.criado_em)}
        {comAlvo && (
          <>
            {' '}
            · {anotacao.alvo_tipo === 'alerta' ? 'alerta' : 'entidade'}{' '}
            <span className="quebra">{mascararCpfs(anotacao.alvo_rotulo ?? '') || `${anotacao.alvo_id} (não está mais no caso)`}</span>
          </>
        )}
      </div>
      <p className="anotacao-texto">{mascararCpfs(anotacao.texto)}</p>
    </li>
  );
}

export interface AnotacoesProps {
  casoId: Id;
  alvoTipo: AlvoAnotacao;
  alvoId: Id;
  /** Verdadeiro: só consulta o servidor quando o usuário pede (cartões de alerta, que aparecem em lista). */
  sobDemanda?: boolean;
  aoMudar?: () => void;
}

/**
 * Anotações de uma entidade ou de um alerta (RF08, H37). São só de acréscimo:
 * não há como editar nem apagar; para corrigir, anota-se de novo. O leitor vê
 * as anotações e o formulário desabilitado, com a explicação.
 */
export function Anotacoes({ casoId, alvoTipo, alvoId, sobDemanda = false, aoMudar }: AnotacoesProps) {
  const { cliente } = useSessao();
  const { podeEscrever, motivoSomenteLeitura } = usePapelNoCaso();
  const lista = useChamada<Anotacao[]>();
  const criacao = useChamada<Anotacao>();
  const [aberto, setAberto] = useState(!sobDemanda);
  const [texto, setTexto] = useState('');
  const id = useId();

  const carregar = () => lista.executar(() => cliente.listarAnotacoes(casoId, { alvo_tipo: alvoTipo, alvo_id: alvoId }));

  useEffect(() => {
    if (aberto) void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId, alvoTipo, alvoId, aberto]);

  // Mesma regra do back-end: a anotação precisa ter letras ou números.
  const valida = /[\p{L}\p{N}]/u.test(texto);

  async function anotar(e: FormEvent) {
    e.preventDefault();
    if (!valida || !podeEscrever) return;
    const r = await criacao.executar(() => cliente.criarAnotacao(casoId, { alvo_tipo: alvoTipo, alvo_id: String(alvoId), texto: texto.trim() }));
    if (r) {
      setTexto('');
      await carregar();
      aoMudar?.();
    }
  }

  const rotuloAlvo = alvoTipo === 'alerta' ? 'alerta' : 'entidade';

  return (
    <section className="anotacoes" aria-label={`Anotações do(a) ${rotuloAlvo} ${String(alvoId)}`}>
      <h4>Anotações</h4>
      {!aberto ? (
        <button type="button" className="br-button secondary small" onClick={() => setAberto(true)}>
          Ver e escrever anotações
        </button>
      ) : (
        <>
          <p className="mudo">As anotações da equipe são só de acréscimo: não se editam nem se apagam. Para corrigir, anote de novo.</p>
          {lista.carregando && !lista.dados && <Carregando />}
          {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
          {lista.dados && lista.dados.length === 0 && <p className="vazio">Nenhuma anotação.</p>}
          {lista.dados && lista.dados.length > 0 && (
            <ul className="lista-anotacoes">
              {lista.dados.map((a) => (
                <ItemAnotacao key={String(a.id)} anotacao={a} />
              ))}
            </ul>
          )}
          <form className="formulario" onSubmit={anotar}>
            <div className="br-textarea small campo">
              <label htmlFor={id}>Nova anotação</label>
              <textarea
                id={id}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                maxLength={TAMANHO_MAXIMO_ANOTACAO}
                disabled={!podeEscrever}
                aria-describedby={motivoSomenteLeitura ? `${id}-motivo` : undefined}
              />
            </div>
            {motivoSomenteLeitura && (
              <p id={`${id}-motivo`} className="campo-dica" data-testid="somente-leitura">
                {motivoSomenteLeitura}
              </p>
            )}
            <div className="linha">
              <button type="submit" className="br-button secondary small" disabled={!podeEscrever || !valida || criacao.carregando}>
                {criacao.carregando ? 'Gravando…' : 'Anotar'}
              </button>
            </div>
            {criacao.erro && <Mensagem tipo="erro">{criacao.erro}</Mensagem>}
          </form>
        </>
      )}
    </section>
  );
}
