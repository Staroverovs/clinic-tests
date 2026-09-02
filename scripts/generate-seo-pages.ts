// Пост-билд шаг: генерирует статические пререндер-страницы для каждой шкалы из TESTS,
// с собственными <title>/<meta description>/<link canonical> и реальным индексируемым
// контентом (название, что измеряет, кому подходит, дисклеймер).
//
// Важно про хостинг: nginx на этом сервере отдаёт запрос напрямую (минуя Apache/.htaccess
// вообще), если URL совпадает с реальным файлом ИЛИ директорией на диске — так что
// .htaccess-переписывание запроса `/tests/?test=slug` в другой файл НЕ РАБОТАЕТ, пока
// `/tests/index.html` физически существует (проверено эмпирически). Поэтому вместо
// index.html на сервер уходит index.php (см. index.php.template ниже) — PHP-исполнение
// не блокируется этим "есть такой файл — отдай как есть" правилом, и сам скрипт по
// $_GET['test'] решает, что отдать: конкретный пререндер или SPA-оболочку (app.html).
// URL для пользователя и в индексе НЕ меняется (?test=<slug> уже проиндексирован,
// 301 не нужен) — меняется только то, что физически отдаётся при первом байте.
//
// После того как страница загрузилась в браузере, React монтируется в #root и удаляет
// #seo-landing (см. useEffect в App.tsx) — интерактивная SPA берёт управление на себя,
// сырой пререндер использовался только для первого байта.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { TESTS, CATEGORY_LABELS } from '../constants';
import { getTestSeoTitle, getTestSeoDescription, getTestCanonical } from '../services/seoMeta';
import type { TestDefinition } from '../types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.join(distDir, 'prerender');

const SITE = 'https://cnpp.ru/tests/';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Достаём реально сгенерированные Vite-теги (хэшированные имена файлов) из уже собранного dist/index.html,
// чтобы пререндер-страницы грузили тот же бандл/стили, что и основной SPA-вход.
function extractBuiltAssetTags(indexHtml: string): { scriptTag: string; styleTag: string } {
  const scriptMatch = indexHtml.match(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/);
  const styleMatch = indexHtml.match(/<link rel="stylesheet"[^>]*href="[^"]+"[^>]*>/);
  if (!scriptMatch || !styleMatch) {
    throw new Error('Не найдены собранные <script>/<link> теги в dist/index.html — запусти после `vite build`.');
  }
  return { scriptTag: scriptMatch[0], styleTag: styleMatch[0] };
}

function relatedTests(t: TestDefinition): TestDefinition[] {
  return TESTS.filter(o => o.id !== t.id && o.category === t.category).slice(0, 3);
}

function renderPage(t: TestDefinition, scriptTag: string, styleTag: string): string {
  const canonical = getTestCanonical(t);
  const title = esc(getTestSeoTitle(t));
  const description = esc(getTestSeoDescription(t));
  const categoryLabel = esc(CATEGORY_LABELS[t.category] || t.category);
  const related = relatedTests(t);

  return `<!doctype html>
<html lang="ru" class="h-auto min-h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">

    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:site_name" content="Клиника Диалектика">
    <meta property="og:locale" content="ru_RU">

    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": ${JSON.stringify(t.fullName || t.name)},
      "description": ${JSON.stringify(t.description)},
      "url": ${JSON.stringify(canonical)},
      "applicationCategory": "HealthApplication",
      "operatingSystem": "Web",
      "inLanguage": "ru",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "RUB" },
      "provider": {
        "@type": "MedicalOrganization",
        "name": "Клиника Диалектика",
        "url": "https://cnpp.ru"
      }
    }
    </script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        :root { --brand-teal: #4A6D7C; --brand-slate: #87A1AD; }
        html, body { height: auto; min-height: 100%; }
        body {
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: #334155;
          -webkit-font-smoothing: antialiased;
          background-color: #F0F4F8;
          margin: 0;
        }
        #seo-landing { max-width: 720px; margin: 0 auto; padding: 32px 20px 60px; }
        #seo-landing a.seo-logo { display: inline-flex; align-items: center; gap: 10px; text-decoration: none; color: #1e293b; font-weight: 800; margin-bottom: 28px; }
        #seo-landing a.seo-logo img { width: 32px; height: 32px; border-radius: 8px; }
        #seo-landing .seo-badge { display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--brand-teal); background: rgba(74,109,124,0.1); border-radius: 999px; padding: 4px 12px; margin-bottom: 12px; }
        #seo-landing h1 { font-size: 28px; font-weight: 800; color: #0f172a; margin: 0 0 6px; line-height: 1.2; }
        #seo-landing .seo-fullname { color: #64748b; font-size: 14px; margin-bottom: 20px; }
        #seo-landing p { line-height: 1.7; color: #334155; font-size: 16px; }
        #seo-landing .seo-cta { display: inline-block; margin-top: 20px; padding: 14px 28px; background: var(--brand-teal); color: white; font-weight: 700; text-decoration: none; border-radius: 12px; }
        #seo-landing .seo-cta:hover { background: #395561; }
        #seo-landing .seo-disclaimer { margin-top: 32px; padding: 16px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 12px; font-size: 13px; color: #7a5c00; }
        #seo-landing .seo-related { margin-top: 36px; padding-top: 24px; border-top: 1px solid #e2e8f0; }
        #seo-landing .seo-related h2 { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
        #seo-landing .seo-related a { display: block; color: var(--brand-teal); text-decoration: none; padding: 8px 0; font-weight: 600; }
        #seo-landing .seo-related a:hover { text-decoration: underline; }
        #seo-landing .seo-back { display: inline-block; margin-top: 24px; color: #64748b; text-decoration: none; font-size: 14px; }
        #seo-landing .seo-back:hover { text-decoration: underline; }
    </style>
    ${styleTag}
</head>
<body class="overflow-x-hidden">
    <div id="seo-landing">
        <a class="seo-logo" href="https://cnpp.ru">
            <img src="https://cnpp.ru/wp-content/uploads/2026/04/cropped-dialectica-100x100.png" alt="Клиника Диалектика">
            Диалектика
        </a>
        <div class="seo-badge">${categoryLabel}</div>
        <h1>${esc(t.name)}</h1>
        ${t.fullName && t.fullName !== t.name ? `<p class="seo-fullname">${esc(t.fullName)}${t.author ? ` · ${esc(t.author)}` : ''}</p>` : ''}
        <p>${esc(t.description)}</p>
        <p>${esc(t.instructions)}</p>
        <a class="seo-cta" href="${SITE}?test=${t.id}">Пройти тест бесплатно</a>
        <div class="seo-disclaimer">
            Это предварительная самооценка, а не медицинский диагноз. Результаты теста не заменяют консультацию специалиста — для точной интерпретации и назначения лечения обратитесь к врачу или психологу Клиники «Диалектика».
        </div>
        ${related.length > 0 ? `
        <div class="seo-related">
            <h2>Похожие тесты</h2>
            ${related.map(r => `<a href="${SITE}?test=${r.id}">${esc(r.name)}</a>`).join('\n            ')}
        </div>` : ''}
        <a class="seo-back" href="${SITE}">← Все тесты клиники</a>
    </div>
    <div class="bg-blobs">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
        <div class="blob blob-3"></div>
    </div>
    <div id="root"></div>
    ${scriptTag}
</body>
</html>`;
}

const PHP_ROUTER = `<?php
// Автосгенерировано scripts/generate-seo-pages.ts при билде — не редактировать руками на сервере.
// nginx на этом хостинге отдаёт /tests/index.html напрямую и не даёт Apache/.htaccess
// переписать запрос по query string (см. комментарий в generate-seo-pages.ts), поэтому
// маршрутизация "какой HTML отдать" сделана здесь, в PHP.
header('Content-Type: text/html; charset=utf-8');

$slug = $_GET['test'] ?? '';
$slug = preg_replace('/[^a-z0-9_]/', '', $slug);

$prerenderPath = $slug !== '' ? __DIR__ . '/prerender/' . $slug . '.html' : '';

if ($prerenderPath !== '' && is_file($prerenderPath)) {
    readfile($prerenderPath);
} else {
    readfile(__DIR__ . '/app.html');
}
`;

function main() {
  const indexPath = path.join(distDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`Не найден ${indexPath} — сначала запусти vite build.`);
  }
  const indexHtml = readFileSync(indexPath, 'utf-8');
  const { scriptTag, styleTag } = extractBuiltAssetTags(indexHtml);

  mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const t of TESTS) {
    const html = renderPage(t, scriptTag, styleTag);
    writeFileSync(path.join(outDir, `${t.id}.html`), html, 'utf-8');
    count++;
  }

  // SPA-оболочка (без ?test=<slug> или для неизвестного slug) переезжает в app.html;
  // index.html сознательно НЕ остаётся в dist/ — его наличие как реального файла на
  // диске и есть то, что мешало маршрутизации (см. комментарий выше). index.php — новая
  // точка входа, отдаёт либо конкретный пререндер, либо app.html по содержимому.
  const appHtmlPath = path.join(distDir, 'app.html');
  writeFileSync(appHtmlPath, indexHtml, 'utf-8');
  writeFileSync(path.join(distDir, 'index.php'), PHP_ROUTER, 'utf-8');

  const indexHtmlPath = path.join(distDir, 'index.html');
  if (existsSync(indexHtmlPath)) {
    rmSync(indexHtmlPath);
  }

  console.log(`✓ Сгенерировано ${count} пререндер-страниц в ${outDir}`);
  console.log(`✓ app.html + index.php готовы (index.html удалён из dist/ — см. комментарий в скрипте)`);
}

main();
