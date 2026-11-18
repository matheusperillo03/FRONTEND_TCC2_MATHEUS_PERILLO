/**
 * Componentes básicos sobre o Padrão Digital de Governo (@govbr-ds/core):
 * usam as classes do Design System (br-message, br-tag, br-input, br-table,
 * br-loading) e só a parte em CSS; o comportamento fica com o React.
 */
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import type { TipoEntidade } from '../api';
import { rotuloTipoNo } from '../grafo/mapear';
import { mascararCpfsDoCampo } from '../privacidade';

type TipoMensagem = 'info' | 'erro' | 'ok' | 'aviso';

const CLASSE_MENSAGEM: Record<TipoMensagem, string> = { info: 'info', erro: 'danger', ok: 'success', aviso: 'warning' };

/** Mensagem contextual (br-message). Erros usam role="alert"; os demais, role="status". */
export function Mensagem({ tipo = 'info', children }: { tipo?: TipoMensagem; children: ReactNode }) {
  return (
    <div className={`br-message ${CLASSE_MENSAGEM[tipo]}`}>
      <div className="content" role={tipo === 'erro' ? 'alert' : 'status'}>
        {children}
      </div>
    </div>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <span className="carregando" role="status" aria-live="polite">
      <span className="br-loading" aria-hidden="true" />
      {texto}
    </span>
  );
}

/** Etiqueta (br-tag) com a cor do tipo de entidade, a mesma usada no grafo. */
export function EtiquetaTipo({ tipo }: { tipo: TipoEntidade | string }) {
  return <span className={`br-tag small etiqueta-${tipo}`}>{rotuloTipoNo(tipo)}</span>;
}

export function Hash({ valor, completo = false }: { valor: string; completo?: boolean }) {
  const v = valor ?? '';
  const texto = completo || v.length <= 20 ? v : `${v.slice(0, 12)}…${v.slice(-8)}`;
  return (
    <code className="hash" title={v}>
      {texto}
    </code>
  );
}

export function formatarData(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'medium' }) + ' UTC';
}

/** Data sem hora (AAAA-MM-DD) como DD/MM/AAAA, sem conversão de fuso. */
export function formatarDia(iso: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '—';
}

/**
 * Número com o substantivo concordando ("1 aviso", "2 avisos", "0 avisos"),
 * no lugar de "aviso(s)". O plural irregular vem no terceiro argumento.
 */
export function contar(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function formatarValor(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** Tabela de dados em alta densidade (br-table small), com rolagem horizontal quando não couber. */
export function Tabela({ children, className = '', rotulo }: { children: ReactNode; className?: string; rotulo?: string }) {
  return (
    <div className={`br-table small ${className}`.trim()}>
      <div className="responsive">
        <table aria-label={rotulo}>{children}</table>
      </div>
    </div>
  );
}

/**
 * Tabela chave/valor para atributos, parâmetros e metadados. Os valores vêm da
 * API e passam por `mascararCpfs` (RNF04): CPF só no formato `***NNNNNN**`. O nome
 * do campo conta como contexto: num campo com "cpf" no nome, 11 dígitos são CPF.
 */
export function TabelaChaveValor({ dados, titulo }: { dados: Record<string, unknown> | null | undefined; titulo?: string }) {
  const entradas = Object.entries(dados ?? {});
  if (!entradas.length) return <p className="vazio">{titulo ? `${titulo}: nenhum.` : 'Nenhum.'}</p>;
  return (
    <table className="tabela-kv" aria-label={titulo}>
      {titulo && <caption>{titulo}</caption>}
      <tbody>
        {entradas.map(([chave, valor]) => (
          <tr key={chave}>
            <th scope="row">{chave}</th>
            <td>{typeof valor === 'number' ? formatarValor(valor) : mascararCpfsDoCampo(chave, formatarValor(valor))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type PropsControle = { id?: string; 'aria-describedby'?: string };

/**
 * Campo de formulário no padrão do Design System (br-input ou br-textarea,
 * alta densidade): rótulo ligado ao controle por `for`/`id` e texto auxiliar
 * ligado por `aria-describedby`. O filho é o controle (input, select ou textarea).
 */
export function Campo({
  rotulo,
  children,
  dica,
  tipo = 'input',
  emLinha = false,
}: {
  rotulo: string;
  children: ReactElement<PropsControle>;
  dica?: string;
  tipo?: 'input' | 'textarea';
  emLinha?: boolean;
}) {
  const idGerado = useId();
  const id = children.props.id ?? idGerado;
  const idDica = `${id}-dica`;
  return (
    <div className={`${tipo === 'textarea' ? 'br-textarea' : 'br-input'} small campo${emLinha ? ' campo-inline' : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      {cloneElement(children, { id, 'aria-describedby': dica ? idDica : children.props['aria-describedby'] })}
      {dica && (
        <p id={idDica} className="campo-dica">
          {dica}
        </p>
      )}
    </div>
  );
}

/** Caixa de seleção no padrão do Design System (br-checkbox). */
export function Caixa({ marcado, aoMudar, children }: { marcado: boolean; aoMudar: (marcado: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="br-checkbox">
      <input id={id} type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} />
      <label htmlFor={id}>{children}</label>
    </div>
  );
}

/** Opção de rádio no padrão do Design System (br-radio). */
export function Radio({ nome, valor, marcado, aoMarcar, children }: { nome: string; valor: string; marcado: boolean; aoMarcar: () => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="br-radio">
      <input id={id} type="radio" name={nome} value={valor} checked={marcado} onChange={aoMarcar} />
      <label htmlFor={id}>{children}</label>
    </div>
  );
}
