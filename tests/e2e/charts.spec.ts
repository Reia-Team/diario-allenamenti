import { expect, test } from '@playwright/test';

test('modalità demo: grafici di analisi, confronto periodi e dashboard; dati reali non toccati', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Apri la modalità demo' }).click();
  await expect(page.getByRole('note')).toContainText('MODALITÀ DEMO');

  await page.getByRole('button', { name: 'Genera dati demo (6 mesi)' }).click();
  await page.getByRole('button', { name: 'Genera', exact: true }).click();
  await expect(page.getByText('Dati demo generati')).toBeVisible();

  // Analisi progressione con dati: grafico con punti reali e sintesi con trend
  await page.goto('/#/progress/analysis?exercise=seed-ex-chest-press');
  await expect(page.getByRole('img', { name: /Carico \(massimo per sessione\) di Chest Press/ })).toBeVisible();
  await expect.poll(() => page.locator('.chart-box svg circle').count()).toBeGreaterThan(10);
  const summary = page.getByRole('region', { name: 'Sintesi del periodo' });
  await expect(summary).toContainText('Trend positivo');
  await expect(summary.getByText(/▲ \+\d/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/analisi.png', fullPage: true });

  await page.getByRole('button', { name: 'Volume', exact: true }).click();
  await expect(page.getByRole('img', { name: /Volume \(carico × ripetizioni\)/ })).toBeVisible();

  await page.getByText('Confronta periodi').click();
  await page.getByRole('button', { name: 'Confronta', exact: true }).click();
  await expect(page.locator('.cmp-bar').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/confronto.png', fullPage: true });

  // Dashboard progressi
  await page.goto('/#/progress');
  await expect(page.getByRole('heading', { name: 'Volume settimanale' })).toBeVisible();
  await expect.poll(() => page.locator('.chart-box svg .recharts-bar-rectangle').count()).toBeGreaterThan(4);
  await expect(page.getByText('Leg Curl sdraiato').first()).toBeAttached();
  await page.screenshot({ path: 'test-results/screens/progressi.png', fullPage: true });

  // Storico demo e dettaglio
  await page.goto('/#/history');
  await page.locator('a.list-item').first().click();
  await expect(page.getByRole('heading', { name: 'Chest Press (Macchina)' }).or(page.getByRole('heading', { name: 'Ellittica' })).first()).toBeVisible();

  // Ritorno ai dati reali: il database reale è ancora vuoto (nessuna contaminazione)
  await page.goto('/#/settings');
  await page.getByRole('button', { name: 'Torna ai dati reali' }).click();
  await expect(page.getByRole('note')).toHaveCount(0);
  await page.goto('/#/history');
  await expect(page.getByText('Nessun allenamento registrato.')).toBeVisible();
});
