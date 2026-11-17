import { useEffect, useState, type FormEvent } from 'react';
import type { SessaoAtual } from '../api';
import { Campo, Carregando, Mensagem, formatarData } from '../componentes/basicos';
import { useSessao } from '../sessao/SessaoContext';
import { useChamada } from '../sessao/useChamada';

/**
 * Minha conta (H23): como o usuário entrou, até quando a sessão vale e a troca
 * da própria senha. As rotas `/auth/*` não levam justificativa.
 */
export function Conta() {
  const { cliente } = useSessao();
  const sessao = useChamada<SessaoAtual>();
  const troca = useChamada<true>();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');

  useEffect(() => {
    void sessao.executar(() => cliente.obterSessao());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente]);

  const s = sessao.dados;
  const confere = senhaNova.length > 0 && senhaNova === confirmacao;

  async function trocar(e: FormEvent) {
    e.preventDefault();
    if (!confere || !senhaAtual) return;
    const ok = await troca.executar(async () => {
      await cliente.trocarSenha({ senha_atual: senhaAtual, senha_nova: senhaNova });
      return true as const;
    });
    if (ok) {
      setSenhaAtual('');
      setSenhaNova('');
      setConfirmacao('');
    }
  }

  return (
    <main className="conta" id="conteudo">
      <section className="br-card painel" aria-labelledby="conta-titulo">
        <h2 id="conta-titulo">Minha conta</h2>
        {sessao.carregando && <Carregando />}
        {sessao.erro && <Mensagem tipo="erro">{sessao.erro}</Mensagem>}
        {s && (
          <dl className="resumo-relatorio" aria-label="Sessão atual">
            <div>
              <dt>Usuário</dt>
              <dd>{s.usuario}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>{s.perfil}</dd>
            </div>
            <div>
              <dt>Autenticação</dt>
              <dd>{s.autenticacao === 'sessao' ? 'usuário e senha' : 'token de desenvolvimento'}</dd>
            </div>
            <div>
              <dt>Segundo fator</dt>
              <dd>{s.mfa_ativo ? 'ativo' : 'não usado nesta sessão'}</dd>
            </div>
            <div>
              <dt>Sessão válida até</dt>
              <dd>{s.expira_em ? formatarData(s.expira_em) : '—'}</dd>
            </div>
            <div>
              <dt>Encerra por inatividade</dt>
              <dd>{s.inatividade_minutos ? `após ${s.inatividade_minutos} min` : '—'}</dd>
            </div>
          </dl>
        )}
        {s?.autenticacao === 'token_dev' && (
          <Mensagem tipo="aviso">
            Você entrou com um token de desenvolvimento: não há sessão no servidor nem senha para trocar. Esse acesso só
            existe com o back-end em modo de desenvolvimento.
          </Mensagem>
        )}
      </section>

      {s?.autenticacao === 'sessao' && (
        <section className="br-card painel" aria-labelledby="senha-titulo">
          <h2 id="senha-titulo">Trocar a senha</h2>
          <form onSubmit={trocar} className="formulario">
            <Campo rotulo="Senha atual">
              <input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} autoComplete="current-password" maxLength={256} required />
            </Campo>
            <Campo rotulo="Senha nova" dica="A política de senha (tamanho mínimo e senhas recusadas) é a do servidor; se a senha for recusada, o motivo aparece aqui.">
              <input type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} autoComplete="new-password" maxLength={256} required />
            </Campo>
            <Campo rotulo="Repita a senha nova">
              <input type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" maxLength={256} required />
            </Campo>
            {confirmacao.length > 0 && !confere && <Mensagem tipo="aviso">As duas senhas novas não são iguais.</Mensagem>}
            <div className="linha">
              <button type="submit" className="br-button primary small" disabled={troca.carregando || !confere || !senhaAtual}>
                {troca.carregando ? 'Trocando…' : 'Trocar a senha'}
              </button>
            </div>
            {troca.erro && <Mensagem tipo="erro">{troca.erro}</Mensagem>}
            {troca.dados && <Mensagem tipo="ok">Senha trocada. As outras sessões desta conta foram encerradas.</Mensagem>}
          </form>
        </section>
      )}
    </main>
  );
}
