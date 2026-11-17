import { useEffect, useState } from 'react';
import type { EntradaAuditoria, Id, VerificacaoAuditoria } from '../../api';
import { Campo, Carregando, Hash, Mensagem, Tabela, formatarData, formatarValor } from '../../componentes/basicos';
import { mascararCpfs } from '../../privacidade';
import { useSessao } from '../../sessao/SessaoContext';
import { useChamada } from '../../sessao/useChamada';

export function AbaAuditoria({ casoId }: { casoId: Id }) {
  const { cliente } = useSessao();
  const lista = useChamada<EntradaAuditoria[]>();
  const verificacao = useChamada<VerificacaoAuditoria>();
  const [escopo, setEscopo] = useState<'caso' | 'tudo'>('caso');

  useEffect(() => {
    void lista.executar(() => cliente.listarAuditoria(escopo === 'caso' ? casoId : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, casoId, escopo]);

  const entradas = [...(lista.dados ?? [])].sort((a, b) => b.seq - a.seq);

  return (
    <div className="auditoria">
      <div className="painel-cabecalho">
        <p className="mudo">
          Registro só de acréscimo, encadeado por hash: cada entrada guarda o hash da anterior. A verificação recalcula a
          cadeia inteira (RNF02).
        </p>
        <div className="linha">
          <Campo rotulo="Escopo" emLinha>
            <select value={escopo} onChange={(e) => setEscopo(e.target.value as 'caso' | 'tudo')}>
              <option value="caso">este caso</option>
              <option value="tudo">todos os casos</option>
            </select>
          </Campo>
          <button type="button" className="br-button secondary small" onClick={() => void lista.executar(() => cliente.listarAuditoria(escopo === 'caso' ? casoId : undefined))} disabled={lista.carregando}>
            Atualizar
          </button>
          <button type="button" className="br-button primary small" onClick={() => void verificacao.executar(() => cliente.verificarAuditoria())} disabled={verificacao.carregando}>
            {verificacao.carregando ? 'Verificando…' : 'Verificar cadeia'}
          </button>
        </div>
      </div>

      {verificacao.carregando && <Carregando texto="Verificando a cadeia de auditoria…" />}
      {verificacao.erro && <Mensagem tipo="erro">{verificacao.erro}</Mensagem>}
      {verificacao.dados && (
        <Mensagem tipo={verificacao.dados.integra ? 'ok' : 'erro'}>
          <strong data-testid="resultado-cadeia">{verificacao.dados.integra ? 'Cadeia íntegra' : 'Cadeia VIOLADA'}</strong> ·{' '}
          {verificacao.dados.entradas} entrada(s) verificada(s)
          {!verificacao.dados.integra && verificacao.dados.primeira_quebra !== null && (
            <>
              {' '}
              · primeira quebra na entrada <strong>seq {verificacao.dados.primeira_quebra}</strong>
            </>
          )}
        </Mensagem>
      )}

      {lista.carregando && <Carregando />}
      {lista.erro && <Mensagem tipo="erro">{lista.erro}</Mensagem>}
      {lista.dados && entradas.length === 0 && <p className="vazio">Nenhuma entrada de auditoria.</p>}
      {entradas.length > 0 && (
        <Tabela className="tabela-auditoria" rotulo="Entradas da trilha de auditoria">
          <thead>
            <tr>
              <th scope="col">Seq</th>
              <th scope="col">Quando (UTC)</th>
              <th scope="col">Usuário</th>
              <th scope="col">Ação</th>
              <th scope="col">Caso</th>
              <th scope="col">Justificativa</th>
              <th scope="col">Detalhes</th>
              <th scope="col">Hash</th>
              <th scope="col">Hash anterior</th>
            </tr>
          </thead>
          <tbody>
            {entradas.map((e) => (
              <tr key={e.seq} className={verificacao.dados && verificacao.dados.primeira_quebra === e.seq ? 'linha-quebra' : ''}>
                <td>{e.seq}</td>
                <td>{formatarData(e.quando)}</td>
                <td>{e.usuario}</td>
                <td>
                  <code>{e.acao}</code>
                </td>
                <td>{e.caso_id === null || e.caso_id === undefined ? '—' : String(e.caso_id)}</td>
                <td className="quebra">{e.justificativa || <span className="mudo">—</span>}</td>
                <td className="quebra mudo">{mascararCpfs(typeof e.detalhes === 'string' ? e.detalhes : formatarValor(e.detalhes))}</td>
                <td>
                  <Hash valor={e.hash} />
                </td>
                <td>{e.hash_anterior ? <Hash valor={e.hash_anterior} /> : <span className="mudo">(gênese)</span>}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      )}
    </div>
  );
}
