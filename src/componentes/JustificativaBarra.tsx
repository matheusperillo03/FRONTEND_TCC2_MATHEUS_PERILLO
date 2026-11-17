import { useId, useState } from 'react';
import { useSessao } from '../sessao/SessaoContext';
import { TAMANHO_MAXIMO_JUSTIFICATIVA, validarJustificativa } from '../sessao/justificativa';

/**
 * Justificativa da sessão. Toda consulta a dados de caso envia o cabeçalho
 * X-Justificativa, e o back-end rejeita consultas sem ele. O texto fica
 * visível e editável o tempo todo, porque entra na trilha de auditoria.
 */
export function JustificativaBarra() {
  const { justificativa, definirJustificativa } = useSessao();
  const [rascunho, setRascunho] = useState(justificativa);
  const [editando, setEditando] = useState(!justificativa.trim());
  const [erro, setErro] = useState<string | null>(null);
  const id = useId();
  const vazia = !justificativa.trim();

  function salvar() {
    // O back-end recusa justificativa com caracteres de controle: avisa antes de guardar.
    const problema = validarJustificativa(rascunho);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    definirJustificativa(rascunho.trim());
    setEditando(false);
  }

  return (
    <section className={`justificativa ${vazia ? 'justificativa-vazia' : ''}`} aria-labelledby={`${id}-titulo`}>
      <div className="justificativa-cabecalho">
        <strong id={`${id}-titulo`}>Justificativa da consulta</strong>
        <span className="justificativa-nota">
          Obrigatória: é enviada em cada consulta (cabeçalho <code>X-Justificativa</code>) e registrada na auditoria
          com usuário, data e caso.
        </span>
      </div>
      {editando || vazia ? (
        <form
          className="justificativa-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className={`br-input small ${erro ? 'danger' : ''}`}>
            <label htmlFor={`${id}-texto`} className="sr-only">
              Texto da justificativa
            </label>
            <input
              id={`${id}-texto`}
              type="text"
              value={rascunho}
              onChange={(e) => {
                setRascunho(e.target.value);
                if (erro) setErro(null);
              }}
              placeholder="Ex.: IP 0001/2026 — análise de vínculos societários dos fornecedores"
              maxLength={TAMANHO_MAXIMO_JUSTIFICATIVA}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? `${id}-erro` : undefined}
              required
            />
          </div>
          <button type="submit" className="br-button primary small" disabled={!rascunho.trim()}>
            Usar nesta sessão
          </button>
          {!vazia && (
            <button
              type="button"
              className="br-button secondary small"
              onClick={() => {
                setRascunho(justificativa);
                setErro(null);
                setEditando(false);
              }}
            >
              Cancelar
            </button>
          )}
        </form>
      ) : (
        <div className="justificativa-atual">
          <span className="justificativa-texto" data-testid="justificativa-atual">
            {justificativa}
          </span>
          <button
            type="button"
            className="br-button secondary small"
            onClick={() => {
              setRascunho(justificativa);
              setEditando(true);
            }}
          >
            Alterar
          </button>
        </div>
      )}
      {erro && (
        <p id={`${id}-erro`} className="justificativa-alerta" role="alert" data-testid="justificativa-erro">
          {erro}
        </p>
      )}
      {vazia && !erro && (
        <p className="justificativa-alerta" role="alert">
          Sem justificativa, as consultas ao caso são recusadas.
        </p>
      )}
    </section>
  );
}
