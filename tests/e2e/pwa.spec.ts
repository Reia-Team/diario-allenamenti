import { expect, test, type Page } from '@playwright/test';

async function waitForServiceWorkerControl(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Diario Allenamenti' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Al primo avvio il service worker si attiva ma controlla la pagina solo dal caricamento successivo.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test.describe('PWA', () => {
  test('manifest e icone per l’installazione su Android', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ name: 'Diario Allenamenti', short_name: 'Allenamenti', display: 'standalone', lang: 'it' });
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons) {
      const img = await request.get(`/${icon.src}`);
      expect(img.ok()).toBe(true);
      expect(img.headers()['content-type']).toContain('image/png');
    }
    const html = await (await request.get('/')).text();
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color"');
  });

  test('funziona offline e i dati registrati offline persistono', async ({ page, context }) => {
    await waitForServiceWorkerControl(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Diario Allenamenti' })).toBeVisible();
    await expect(page.getByText('Allenamento A', { exact: true })).toBeVisible();

    // Avvio allenamento e registrazione di una serie SENZA rete
    await page.getByRole('button', { name: 'Inizia allenamento' }).click();
    await expect(page.getByRole('heading', { name: 'Chest Press (Macchina)' })).toBeVisible();
    await page.getByRole('group', { name: 'Carico' }).locator('.value').click();
    await page.getByRole('textbox', { name: 'Carico' }).fill('70');
    await page.getByRole('textbox', { name: 'Carico' }).press('Enter');
    await page.getByRole('button', { name: 'FINE SERIE' }).click();
    await expect(page.getByRole('region', { name: 'Timer di recupero' })).toBeVisible();

    // Chiusura accidentale / ricarica offline: l'allenamento e la serie sono ancora lì
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Chest Press (Macchina)' })).toBeVisible();
    await expect(page.locator('.set-row.done')).toHaveCount(1);
    await expect(page.locator('.set-row.done')).toContainText('70 kg × 10');
    await expect(page.getByRole('region', { name: 'Timer di recupero' })).toBeVisible();

    await context.setOffline(false);
    await page.getByRole('button', { name: 'Salta recupero' }).click();
    await expect(page.getByRole('region', { name: 'Timer di recupero' })).toBeHidden();
  });
});

test.describe('scenario reale nell’interfaccia', () => {
  test('allenamento A → storico → analisi progressione', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Inizia allenamento' }).click();
    await expect(page.getByRole('heading', { name: 'Chest Press (Macchina)' })).toBeVisible();
    await expect(page.getByText('4 × 10')).toBeVisible();
    await expect(page.getByText('Nessuna prestazione precedente')).toBeVisible();

    // Serie 1: carico 70; le serie successive ereditano il carico
    await page.getByRole('group', { name: 'Carico' }).locator('.value').click();
    await page.getByRole('textbox', { name: 'Carico' }).fill('70');
    await page.getByRole('textbox', { name: 'Carico' }).press('Enter');
    const reps = [10, 10, 9, 8];
    for (const r of reps) {
      const group = page.getByRole('group', { name: 'Ripetizioni' });
      await group.locator('.value').click();
      await page.getByRole('textbox', { name: 'Ripetizioni' }).fill(String(r));
      await page.getByRole('textbox', { name: 'Ripetizioni' }).press('Enter');
      await page.getByRole('button', { name: 'FINE SERIE' }).click();
      await page.getByRole('button', { name: 'Salta recupero' }).click();
    }
    await expect(page.getByText('Completato').first()).toBeVisible();

    await page.getByRole('button', { name: 'Termina', exact: true }).click();
    await expect(page.getByText(/serie non confermate verranno salvate/)).toBeVisible();
    await page.getByRole('textbox', { name: 'Note sull’allenamento' }).fill('Oggi poca energia');
    await page.getByRole('button', { name: 'Termina e salva' }).click();

    await expect(page.getByText('Allenamento salvato.')).toBeVisible();
    const chest = page.getByRole('region', { name: 'Chest Press (Macchina)' });
    await expect(chest.getByRole('cell', { name: '70 kg' })).toHaveCount(4);
    await expect(chest.getByRole('cell', { name: '9', exact: true })).toBeVisible();
    await expect(page.getByText('2590 kg').or(page.getByText('2.590 kg'))).toBeVisible();
    await expect(page.getByText('non registrata').first()).toBeVisible();

    // Nuovo allenamento: la home propone B
    await page.goto('/');
    await expect(page.getByText('Allenamento B', { exact: true })).toBeVisible();

    // Analisi: solo Chest Press, periodo con dati e periodo vuoto
    await page.goto('/#/progress/analysis?exercise=seed-ex-chest-press');
    await expect(page.getByRole('heading', { name: 'Sessioni (1)' })).toBeVisible();
    const summary = page.getByRole('region', { name: 'Sintesi del periodo' });
    await expect(summary).toContainText('Chest Press (Macchina)');
    await expect(summary.getByRole('row', { name: /^Carico 70 kg 70 kg/ })).toBeVisible();
    await expect(summary.getByRole('row', { name: /^Volume 2590 kg 2590 kg/ })).toBeVisible();
    await expect(summary).toContainText('1RM STIMATO');
    await expect(page.getByText('Dati insufficienti').first()).toBeVisible();

    await page.getByLabel('Data iniziale').fill('2024-01-01');
    await page.getByLabel('Data finale').fill('2024-12-31');
    await page.getByRole('button', { name: 'ANALIZZA' }).click();
    await expect(page.getByText('Nessun dato disponibile per i criteri selezionati.')).toBeVisible();
  });
});
