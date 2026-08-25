#!/usr/bin/env node
/**
 * Symagic -> weekrooster proeflezer
 *
 * Dit script wijzigt niets in Symagic of de KCC-database.
 * Het opent Symagic, laat de gebruiker zelf inloggen, en probeert het
 * zichtbare planbord/rooster uit te lezen. De gevonden tekst wordt lokaal
 * als JSON opgeslagen zodat we daarna gericht de juiste velden kunnen mappen.
 *
 * Gebruik:
 *   npm install -D playwright
 *   node tools/symagic-playwright-rooster.js
 *
 * Optioneel:
 *   SYMAGIC_URL="https://..." node tools/symagic-playwright-rooster.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const url = process.env.SYMAGIC_URL || 'about:blank';
const out = path.resolve(process.cwd(), 'symagic-rooster-test.json');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const network = [];
  page.on('response', async response => {
    const request = response.request();
    const type = request.resourceType();
    if (!['xhr', 'fetch'].includes(type)) return;
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('json') && !ct.includes('text')) return;
    try {
      const text = await response.text();
      if (/08:\d\d|09:\d\d|10:\d\d|11:\d\d|12:\d\d|13:\d\d|14:\d\d|15:\d\d|16:\d\d|17:\d\d|18:\d\d/.test(text)) {
        network.push({ url: response.url(), status: response.status(), text: text.slice(0, 500000) });
      }
    } catch (_) {}
  });

  if (url !== 'about:blank') await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log('\nSymagic is geopend.');
  console.log('1. Log in als dat nodig is.');
  console.log('2. Open het Planbord/weekrooster.');
  console.log('3. Kies de gewenste week.');
  console.log('4. Zorg dat de medewerkers en werktijden zichtbaar zijn.');
  console.log('5. Druk daarna in deze terminal op Enter.\n');

  process.stdin.setEncoding('utf8');
  await new Promise(resolve => process.stdin.once('data', resolve));

  const visibleText = await page.locator('body').innerText().catch(() => '');
  const links = await page.locator('a').evaluateAll(els => els.map(a => ({ text: a.innerText, href: a.href })).filter(x => x.text || x.href));
  const title = await page.title();
  const currentUrl = page.url();

  const result = {
    capturedAt: new Date().toISOString(),
    title,
    url: currentUrl,
    visibleText,
    links,
    matchingNetworkResponses: network,
    note: 'Dit bestand is alleen een testcapture. Er is niets naar Supabase geschreven.'
  };

  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\nKlaar. Testresultaat opgeslagen in: ${out}`);
  console.log(`XHR/fetch responses met tijdpatronen gevonden: ${network.length}`);
  console.log('Stuur symagic-rooster-test.json terug; daarna kunnen we de echte weekrooster-parser maken.');

  await browser.close();
})();
