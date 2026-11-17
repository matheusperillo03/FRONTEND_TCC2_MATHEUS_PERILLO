import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessaoProvider } from '../../sessao/SessaoContext';
import { clienteFalso } from '../../test/clienteFalso';
import { AbaRelatorio, resumirRelatorioJson } from './AbaRelatorio';

function renderizar(conteudo: string) {
  // O download é um clique num <a download>; o jsdom não navega.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const obterRelatorio = vi.fn(async () => conteudo);
  render(
    <SessaoProvider cliente={clienteFalso({ obterRelatorio })}>
      <AbaRelatorio casoId="caso-1" />
    </SessaoProvider>,
  );
  return obterRelatorio;
}

const BASE = { resumo: { entidades: 3, alertas: 2, capturas: 4 }, entidades: [], alertas: [], custodia: [] };

describe('AbaRelatorio — relatório sem as entradas de auditoria (perfil analista)', () => {
  it('lista vazia: mostra o resumo e explica a ausência, sem erro', async () => {
    const usuario = userEvent.setup();
    renderizar(JSON.stringify({ ...BASE, auditoria: { integra: true, entradas: 9, primeira_quebra: null, entradas_do_caso: [] } }));
    await usuario.click(screen.getByRole('button', { name: 'Baixar JSON' }));
    expect(await screen.findByTestId('entradas-auditoria')).toHaveTextContent('0');
    expect(screen.getByText(/veio sem as entradas da trilha de auditoria/)).toBeInTheDocument();
    expect(screen.getByText('íntegra')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('campo ausente ou nulo é tratado como lista vazia', () => {
    expect(resumirRelatorioJson(JSON.stringify(BASE))?.entradasAuditoria).toBe(0);
    expect(resumirRelatorioJson(JSON.stringify({ ...BASE, auditoria: { entradas_do_caso: null } }))?.entradasAuditoria).toBe(0);
    expect(resumirRelatorioJson('não é json')).toBeNull();
    expect(resumirRelatorioJson('[]')).toBeNull();
  });

  it('com entradas (delegado/admin): mostra a contagem e não mostra o aviso', async () => {
    const usuario = userEvent.setup();
    renderizar(JSON.stringify({ ...BASE, auditoria: { integra: true, entradas: 9, entradas_do_caso: [{ seq: 1 }, { seq: 2 }] } }));
    await usuario.click(screen.getByRole('button', { name: 'Baixar JSON' }));
    expect(await screen.findByTestId('entradas-auditoria')).toHaveTextContent('2');
    expect(screen.queryByText(/veio sem as entradas/)).not.toBeInTheDocument();
  });

  it('mostra coletas com falha e alertas pendentes de decisão quando o relatório os traz', async () => {
    const usuario = userEvent.setup();
    const resumo = { ...BASE.resumo, coletas: 5, coletas_com_falha: 2, alertas_pendentes: 1 };
    renderizar(JSON.stringify({ ...BASE, resumo, auditoria: { integra: true, entradas_do_caso: [{ seq: 1 }] } }));
    await usuario.click(screen.getByRole('button', { name: 'Baixar JSON' }));
    expect(await screen.findByTestId('coletas-com-falha')).toHaveTextContent('5 (2)');
    expect(screen.getByTestId('alertas-pendentes')).toHaveTextContent('1');
    expect(screen.getByText(/2 coleta\(s\) deste caso falharam/)).toBeInTheDocument();
    // Relatório de versão anterior, sem esses campos: mostra traço e não avisa.
    expect(resumirRelatorioJson(JSON.stringify(BASE))).toMatchObject({ coletas: null, coletasComFalha: null, alertasPendentes: null });
  });

  it('Markdown: gera e mostra a prévia sem tentar interpretar o conteúdo', async () => {
    const usuario = userEvent.setup();
    renderizar('# Relatório\n\ntexto sintético');
    await usuario.click(screen.getByLabelText('mostrar prévia'));
    await usuario.click(screen.getByRole('button', { name: 'Baixar Markdown' }));
    expect(await screen.findByLabelText('Prévia do relatório')).toHaveTextContent('texto sintético');
    expect(screen.queryByTestId('entradas-auditoria')).not.toBeInTheDocument();
  });
});
