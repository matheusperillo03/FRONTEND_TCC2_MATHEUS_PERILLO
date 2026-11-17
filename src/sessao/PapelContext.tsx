/**
 * Papel do usuário no caso aberto (H23): `leitor` só consulta; `investigador`
 * também altera; `responsavel` ainda gerencia a equipe. A tela do caso fornece
 * o papel que veio em `meu_papel`, e os componentes de escrita o leem daqui.
 *
 * A interface só antecipa a regra para explicar o que está desabilitado: quem
 * autoriza é o back-end, que responde 403 e registra a tentativa na auditoria.
 */
import { createContext, useContext } from 'react';
import type { PapelCaso } from '../api';

export interface PapelNoCaso {
  /** `undefined`: o back-end não informou o papel (a interface não bloqueia nada). */
  papel: PapelCaso | null | undefined;
  /** Falso para o leitor e para quem não é membro. */
  podeEscrever: boolean;
  ehResponsavel: boolean;
  /** Texto para mostrar ao lado do que está desabilitado; `null` quando o usuário pode escrever. */
  motivoSomenteLeitura: string | null;
}

const ROTULOS_PAPEL: Record<string, string> = { responsavel: 'responsável', investigador: 'investigador', leitor: 'leitor' };

export function rotuloPapel(papel: string | null | undefined): string {
  if (!papel) return 'sem papel';
  return ROTULOS_PAPEL[papel] ?? papel;
}

export function papelNoCaso(papel: PapelCaso | null | undefined): PapelNoCaso {
  const podeEscrever = papel === undefined || papel === 'investigador' || papel === 'responsavel';
  return {
    papel,
    podeEscrever,
    ehResponsavel: papel === 'responsavel',
    motivoSomenteLeitura: podeEscrever
      ? null
      : papel === 'leitor'
        ? 'Seu papel neste caso é leitor: você consulta, mas não altera. Para anotar, criar tarefas ou decidir, peça ao responsável pelo caso o papel de investigador.'
        : 'Você não é membro deste caso: não pode alterá-lo.',
  };
}

const Contexto = createContext<PapelNoCaso>(papelNoCaso(undefined));

export const PapelProvider = Contexto.Provider;

export function usePapelNoCaso(): PapelNoCaso {
  return useContext(Contexto);
}
