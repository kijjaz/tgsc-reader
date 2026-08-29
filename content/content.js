/**
 * TGSC Perfumery Companion - Content Script
 * 100% Unobtrusive in-page enhancements:
 * - Subtle Student Organ Badges [L1, L2, L3] on material links
 * - Hover tooltip with Trade Names, CAS, Volatility, and Facets
 * - In-page Table Filter Bar on large data tables
 * NO full-page overlays, side drawers, or disruptive banners.
 */

(async function () {
  'use strict';

  if (document.getElementById('tgsc-companion-root')) return;

  let studentMaterials = [];
  let directoryItems = [];

  try {
    const stRes = await fetch(chrome.runtime.getURL('data/student_tiers.json'));
    const stData = await stRes.json();
    studentMaterials = stData.materials || [];

    const dirRes = await fetch(chrome.runtime.getURL('data/tgsc_directory.json'));
    const dirData = await dirRes.json();
    directoryItems = dirData.items || [];
  } catch (err) {
    console.warn('[TGSC Companion] Could not load datasets:', err);
  }

  // Create isolated container for hover tooltip
  const root = document.createElement('div');
  root.id = 'tgsc-companion-root';
  document.body.appendChild(root);

  const tooltip = document.createElement('div');
  tooltip.id = 'tgsc-hover-tooltip';
  tooltip.className = 'tgsc-tooltip hidden';
  root.appendChild(tooltip);

  function enhancePage() {
    if (!directoryItems || directoryItems.length === 0) return;

    // 1. Enhance Material & Formula Links with Badges and Tooltips
    const links = document.querySelectorAll('a[href*="/data/"], a[href*="/demos/"]');
    links.forEach(link => {
      if (link.dataset.tgscEnhanced) return;
      link.dataset.tgscEnhanced = 'true';

      const href = link.getAttribute('href') || '';
      const idMatch = href.match(/\/(data|demos)\/([a-z]{2}[0-9]+)\.html/i);
      if (idMatch) {
        const id = idMatch[2].toLowerCase();
        const item = directoryItems.find(x => x.id.toLowerCase() === id);
        if (item) {
          // Add small organ tier badge
          if (item.level) {
            const badge = document.createElement('span');
            badge.className = `tgsc-link-badge badge-l${item.level}`;
            badge.innerText = `L${item.level}`;
            badge.title = item.level_label || `Level ${item.level} Student Organ`;
            link.parentNode.insertBefore(badge, link.nextSibling);
          }

          // Attach hover tooltip
          link.addEventListener('mouseenter', (e) => {
            const rect = link.getBoundingClientRect();
            const synText = item.synonyms && item.synonyms.length > 1 ? item.synonyms.slice(0, 3).join(', ') : '';
            const facetsText = item.facets && item.facets.length > 0 ? item.facets.slice(0, 4).join(', ') : '';

            tooltip.innerHTML = `
              <div class="tt-header">
                <span class="tt-name">${item.name}</span>
                ${item.level ? `<span class="tgsc-link-badge badge-l${item.level}">L${item.level}</span>` : ''}
              </div>
              <div class="tt-meta">
                ${item.cas ? `<span>CAS: <strong>${item.cas}</strong></span>` : ''}
                <span class="tt-vol">${item.volatility || 'Accord'}</span>
                <span>Family: <strong>${item.family}</strong></span>
              </div>
              ${synText ? `<div class="tt-syn">Synonyms: ${synText}</div>` : ''}
              ${facetsText ? `<div class="tt-facets">Facets: ${facetsText}</div>` : ''}
            `;
            tooltip.style.top = `${rect.bottom + window.scrollY + 6}px`;
            tooltip.style.left = `${Math.min(window.innerWidth - 280, Math.max(10, rect.left + window.scrollX))}px`;
            tooltip.classList.remove('hidden');
          });

          link.addEventListener('mouseleave', () => {
            tooltip.classList.add('hidden');
          });
        }
      }
    });

    // 2. Inject Table Filter Bar above large TGSC tables (e.g. Blenders & Uses)
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      if (table.dataset.tgscFiltered) return;
      const rows = table.querySelectorAll('tr');
      if (rows.length > 8) {
        table.dataset.tgscFiltered = 'true';
        const filterBar = document.createElement('div');
        filterBar.className = 'tgsc-table-filter-bar';
        filterBar.innerHTML = `
          <span class="tgsc-table-filter-label">Filter Table:</span>
          <button class="tgsc-filter-btn active" data-filter="all">Show All (${rows.length})</button>
          <button class="tgsc-filter-btn" data-filter="l1">In My L1 Organ</button>
          <button class="tgsc-filter-btn" data-filter="l2">In My L2 Organ</button>
        `;

        filterBar.querySelectorAll('.tgsc-filter-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            filterBar.querySelectorAll('.tgsc-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.filter;

            rows.forEach(tr => {
              tr.classList.remove('tgsc-dimmed-row', 'tgsc-highlight-row');
              if (mode === 'all') return;

              const hasL1 = tr.querySelector('.badge-l1');
              const hasL2 = tr.querySelector('.badge-l1, .badge-l2');

              if (mode === 'l1') {
                if (hasL1) tr.classList.add('tgsc-highlight-row');
                else tr.classList.add('tgsc-dimmed-row');
              } else if (mode === 'l2') {
                if (hasL2) tr.classList.add('tgsc-highlight-row');
                else tr.classList.add('tgsc-dimmed-row');
              }
            });
          });
        });

        table.parentNode.insertBefore(filterBar, table);
      }
    });
  }

  setTimeout(enhancePage, 500);
})();
