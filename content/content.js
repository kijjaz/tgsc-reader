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

  // Create isolated container for hover tooltip and side card
  const root = document.createElement('div');
  root.id = 'tgsc-companion-root';
  document.body.appendChild(root);

  const tooltip = document.createElement('div');
  tooltip.id = 'tgsc-hover-tooltip';
  tooltip.className = 'tgsc-tooltip hidden';
  root.appendChild(tooltip);

  // Helper: Find matches in student organ database
  function findStudentMatches(cas, namesToMatch) {
    const matches = [];
    const seenSkus = new Set();

    // 1. Exact CAS match (highest precision)
    if (cas) {
      studentMaterials.forEach(m => {
        if (m.cas && m.cas.trim() === cas.trim() && !seenSkus.has(m.sku)) {
          seenSkus.add(m.sku);
          matches.push(m);
        }
      });
    }

    // 2. Name / Synonym matches
    const cleanNames = namesToMatch
      .filter(Boolean)
      .map(n => n.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(n => n.length > 2);

    studentMaterials.forEach(m => {
      if (seenSkus.has(m.sku)) return;
      const mNameClean = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const mFullClean = (m.student_material_name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const mOffClean = (m.official_name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      const mSyns = (m.synonyms || []).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim());

      for (const target of cleanNames) {
        if (mNameClean === target || mOffClean === target || mFullClean.includes(target) || mSyns.includes(target)) {
          seenSkus.add(m.sku);
          matches.push(m);
          break;
        }
      }
    });

    return matches;
  }

  // Helper: Find substitutions in student organ for a missing item
  function findSubstitutions(targetItem, maxResults = 4) {
    if (!targetItem || !studentMaterials || studentMaterials.length === 0) return [];

    const targetFacets = (targetItem.facets || []).map(f => f.toLowerCase());
    const targetFamily = (targetItem.family || '').toLowerCase();
    const targetVol = (targetItem.volatility || '').toLowerCase();
    const targetCas = (targetItem.cas || '').trim();

    const scored = [];
    const seenNames = new Set();

    studentMaterials.forEach(sm => {
      // Don't substitute with itself
      if (targetCas && sm.cas === targetCas) return;
      if (sm.name.toLowerCase() === (targetItem.name || '').toLowerCase()) return;

      let score = 0;

      // 1. Facet Overlap (+3 per matching facet)
      const smFacets = (sm.facets || []).map(f => f.toLowerCase());
      targetFacets.forEach(tf => {
        if (smFacets.includes(tf)) score += 3;
      });

      // 2. Family Match (+4)
      if (targetFamily && (sm.family || '').toLowerCase().includes(targetFamily)) {
        score += 4;
      }

      // 3. Volatility Match (+2)
      if (targetVol && (sm.volatility || '').toLowerCase().includes(targetVol)) {
        score += 2;
      }

      // 4. Boost Core L1 and L2 organ materials
      if (sm.level === 1) score += 2;
      else if (sm.level === 2) score += 1;

      if (score > 3) {
        const displayName = sm.student_material_name || `${sm.name} from ${(sm.suppliers || [])[0] || 'Database'}`;
        if (!seenNames.has(displayName)) {
          seenNames.add(displayName);
          scored.push({
            material: sm,
            displayName: displayName,
            score: score,
            reason: smFacets.filter(f => targetFacets.includes(f)).slice(0, 3).join(', ') || sm.family
          });
        }
      }
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }

  // 1. Detect Active Page Material and Render Right Side Card (with Substitutions)
  function renderActivePageSideCard() {
    const url = window.location.href;
    const idMatch = url.match(/\/(data|demos)\/([a-z]{2}[0-9]+)\.html/i);
    if (!idMatch) return;

    const pageSection = idMatch[1].toLowerCase();
    const pageId = idMatch[2].toLowerCase();

    // Extract on-page headings and CAS
    const h1El = document.querySelector('h1');
    const h1Text = h1El ? h1El.innerText.replace(/\n/g, ' ').trim() : '';
    const h1ItemProp = document.querySelector('h1 [itemprop="name"]');
    const primaryName = h1ItemProp ? h1ItemProp.innerText.trim() : (h1Text.split('\n')[0] || document.title.split(',')[0].split('-')[0].trim());

    // Extract CAS from cheminfo or body text
    let pageCas = '';
    const bodyText = document.body.innerText;
    const casMatch = bodyText.match(/CAS\s*(?:Number|#)?\s*:?\s*([0-9]{2,7}-[0-9]{2}-[0-9])/i) ||
                     document.documentElement.innerHTML.match(/CAS Number:.*?([0-9]{2,7}-[0-9]{2}-[0-9])/i) ||
                     document.title.match(/([0-9]{2,7}-[0-9]{2}-[0-9])/);
    if (casMatch) {
      pageCas = casMatch[1].trim();
    }

    // Also collect synonyms from on-page synonym table
    const pageSynonyms = [];
    document.querySelectorAll('[itemprop="alternateName"]').forEach(el => {
      const syn = el.innerText.trim();
      if (syn && !pageSynonyms.includes(syn)) pageSynonyms.push(syn);
    });

    const candidateNames = [primaryName, h1Text, document.title, ...pageSynonyms];
    const matches = findStudentMatches(pageCas, candidateNames);

    // If no direct inventory match, calculate substitutions from student organ!
    let subHtml = '';
    if (matches.length === 0 && pageSection === 'data') {
      const dirItem = directoryItems.find(x => x.id.toLowerCase() === pageId.toLowerCase());
      const itemToSub = dirItem || { name: primaryName, cas: pageCas, facets: [], family: '' };
      const subs = findSubstitutions(itemToSub, 3);
      if (subs.length > 0) {
        subHtml = `
          <div class="tgsc-sub-box">
            <div class="tgsc-sub-box-title">
              <span>Organ Substitutions (${subs.length})</span>
              <span style="font-size: 8px; color: #a5b4fc;">Similar Facets</span>
            </div>
            ${subs.map(s => `
              <div class="tgsc-sub-item">
                <span class="tgsc-sub-name">${s.displayName}</span>
                <span class="tgsc-sub-meta">Shared: ${s.reason}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    // If matches found or on a material page, show right-side card
    if (matches.length === 0 && !pageCas && pageSection !== 'data') return;

    let sideCard = document.getElementById('tgsc-student-side-card');
    if (!sideCard) {
      sideCard = document.createElement('div');
      sideCard.id = 'tgsc-student-side-card';
      sideCard.className = 'tgsc-side-card';
      root.appendChild(sideCard);
    }

    const matchHtml = matches.length > 0 ? `
      <div class="tgsc-side-match-box">
        <div class="tgsc-side-match-title">Available in Student Database (${matches.length})</div>
        ${matches.map(m => `
          <div class="tgsc-side-mat-item">
            <div class="tgsc-side-mat-name">${m.student_material_name || m.name}</div>
            <div class="tgsc-side-mat-meta">
              ${m.level ? `<span class="tgsc-link-badge badge-l${m.level}" style="margin:0;">L${m.level}</span>` : ''}
              ${m.sku ? `<span class="tgsc-side-sku-tag">SKU: ${m.sku}</span>` : ''}
              <span class="tgsc-side-vendor-tag">${(m.suppliers && m.suppliers[0]) || 'Database'}</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="tgsc-side-no-match">
        Not currently in student organ inventory.
      </div>
      ${subHtml}
    `;

    sideCard.innerHTML = `
      <div class="tgsc-side-header">
        <div class="tgsc-side-brand">
          <span>Student Database</span>
        </div>
        <div class="tgsc-side-actions">
          <button class="tgsc-side-btn-min" id="tgsc-btn-toggle-min" title="Collapse / Expand Card">&minus;</button>
        </div>
      </div>
      <div class="tgsc-side-body">
        <div class="tgsc-side-tgsc-source">
          TGSC: <strong>${primaryName || pageId}</strong>
          ${pageCas ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">CAS: ${pageCas} &bull; ${pageId}</div>` : ''}
        </div>
        ${matchHtml}
        <button class="tgsc-side-btn-studio" id="tgsc-btn-open-ext-studio">
          Open in Perfumery Studio &rarr;
        </button>
      </div>
    `;

    const minBtn = sideCard.querySelector('#tgsc-btn-toggle-min');
    if (minBtn) {
      minBtn.addEventListener('click', () => {
        sideCard.classList.toggle('collapsed');
        minBtn.innerHTML = sideCard.classList.contains('collapsed') ? '&#43;' : '&minus;';
      });
    }

    const studioBtn = sideCard.querySelector('#tgsc-btn-open-ext-studio');
    if (studioBtn) {
      studioBtn.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'open_studio', id: pageId });
        }
      });
    }
  }

  // 2. In-Page Live Demo Formula Scaler Bar (Injects directly on /demos/dm... pages)
  function enhanceDemoFormulaPage() {
    const url = window.location.href;
    if (!url.includes('/demos/') && !document.querySelector('.dmow5')) return;

    const tables = document.querySelectorAll('table');
    tables.forEach((table, tIdx) => {
      if (table.dataset.tgscFormulaScaled) return;

      // Check if table contains demo formula parts (class dmow5 or numbers ending with Total)
      const partCells = table.querySelectorAll('.dmow5, td[align="right"]');
      if (partCells.length < 3) return;

      table.dataset.tgscFormulaScaled = 'true';

      // Parse ingredients from rows
      const rows = table.querySelectorAll('tr');
      const formulaIngredients = [];
      let totalParts = 0;

      rows.forEach(tr => {
        const pCell = tr.querySelector('.dmow5') || tr.cells[0];
        const nCell = tr.querySelector('.dmow6') || tr.cells[1];
        if (!pCell || !nCell) return;

        const val = parseFloat(pCell.innerText.replace(/,/g, '').trim());
        const rawName = nCell.innerText.replace(/<[^>]+>/g, '').trim();

        if (!isNaN(val) && rawName) {
          if (rawName.toLowerCase() === 'total' || rawName.toLowerCase().startsWith('total')) {
            totalParts = val;
          } else {
            const link = nCell.querySelector('a');
            const href = link ? link.getAttribute('href') : '';
            const idM = href ? href.match(/\/(data|demos)\/([a-z]{2}[0-9]+)\.html/i) : null;
            const itemId = idM ? idM[2].toLowerCase() : null;

            formulaIngredients.push({
              tr: tr,
              id: itemId,
              name: rawName,
              parts: val
            });
          }
        }
      });

      if (formulaIngredients.length === 0) return;
      if (!totalParts) totalParts = formulaIngredients.reduce((s, i) => s + i.parts, 0);

      // Create Live In-Page Scaler Bar
      const scalerBar = document.createElement('div');
      scalerBar.className = 'tgsc-live-formula-bar';

      let targetWeight = 10.0;
      let scaleMode = 'full'; // 'full' or 'skeleton'

      function updateInPageScaling() {
        const enriched = window.TGSCFormulaScaler ? window.TGSCFormulaScaler.enrichIngredients(formulaIngredients, studentMaterials, '1') : [];
        const calculated = window.TGSCFormulaScaler ? window.TGSCFormulaScaler.calculateBatch(enriched, totalParts, targetWeight, scaleMode, '1') : null;

        // Add or update live weight column on table rows
        formulaIngredients.forEach((ing, idx) => {
          let scaledCell = ing.tr.querySelector('.tgsc-scale-cell');
          if (!scaledCell) {
            scaledCell = document.createElement('td');
            scaledCell.className = 'tgsc-scale-cell';
            ing.tr.appendChild(scaledCell);
          }

          const calcRow = calculated && calculated.rows[idx];
          if (calcRow) {
            scaledCell.innerHTML = `<strong>${calcRow.weightGrams}g</strong>`;
            if (calcRow.isAvailable) {
              scaledCell.className = 'tgsc-scale-cell tgsc-scale-ok';
              scaledCell.title = `Available in Organ (${calcRow.levelLabel})`;
            } else {
              scaledCell.className = 'tgsc-scale-cell tgsc-scale-missing';
              // Check substitutions
              const subs = findSubstitutions({ name: ing.name, facets: [] }, 2);
              if (subs.length > 0) {
                scaledCell.innerHTML += `<span class="tgsc-sub-chip" title="Try substitute: ${subs[0].displayName}">Sub &rarr;</span>`;
              }
            }
          }
        });

        // Update stats
        const statsEl = scalerBar.querySelector('#tgsc-lfb-stats-display');
        if (statsEl && calculated) {
          statsEl.innerHTML = `
            <span>Coverage: <strong>${calculated.coveragePercent}%</strong></span>
            <span>(${calculated.availableCount} of ${formulaIngredients.length} in Organ)</span>
          `;
        }
      }

      scalerBar.innerHTML = `
        <div class="tgsc-lfb-top">
          <div class="tgsc-lfb-title">
            <span>Formula Batch Scaler</span>
          </div>
          <div class="tgsc-lfb-stats" id="tgsc-lfb-stats-display">
            Calculating coverage...
          </div>
          <div class="tgsc-lfb-controls">
            <div class="tgsc-lfb-input-box">
              <label>Target:</label>
              <input type="number" id="tgsc-lfb-val" value="${targetWeight}" min="0.1" step="0.5" />
              <span style="font-size:11px;color:#94a3b8;">g</span>
            </div>
            <button class="tgsc-lfb-btn ${scaleMode === 'full' ? 'active' : ''}" id="tgsc-lfb-mode-full">Full Formula</button>
            <button class="tgsc-lfb-btn ${scaleMode === 'skeleton' ? 'active' : ''}" id="tgsc-lfb-mode-skel">Student Skeleton (100%)</button>
            <div class="tgsc-lfb-actions">
              <button class="tgsc-lfb-btn" id="tgsc-lfb-copy-md" style="background:#2563eb;color:#fff;">Copy MD</button>
              <button class="tgsc-lfb-btn" id="tgsc-lfb-dl-csv">Export CSV</button>
            </div>
          </div>
        </div>
      `;

      table.parentNode.insertBefore(scalerBar, table);

      // Event Listeners for in-page scaler controls
      const valInput = scalerBar.querySelector('#tgsc-lfb-val');
      valInput?.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val) && val > 0) {
          targetWeight = val;
          updateInPageScaling();
        }
      });

      const btnFull = scalerBar.querySelector('#tgsc-lfb-mode-full');
      const btnSkel = scalerBar.querySelector('#tgsc-lfb-mode-skel');
      btnFull?.addEventListener('click', () => {
        scaleMode = 'full';
        btnFull.classList.add('active');
        btnSkel.classList.remove('active');
        updateInPageScaling();
      });
      btnSkel?.addEventListener('click', () => {
        scaleMode = 'skeleton';
        btnSkel.classList.add('active');
        btnFull.classList.remove('active');
        updateInPageScaling();
      });

      scalerBar.querySelector('#tgsc-lfb-copy-md')?.addEventListener('click', () => {
        const enriched = window.TGSCFormulaScaler ? window.TGSCFormulaScaler.enrichIngredients(formulaIngredients, studentMaterials, '1') : [];
        const calculated = window.TGSCFormulaScaler ? window.TGSCFormulaScaler.calculateBatch(enriched, totalParts, targetWeight, scaleMode, '1') : null;
        if (calculated && window.TGSCFormulaScaler) {
          const md = window.TGSCFormulaScaler.generateMarkdown(document.title || 'Demo Formula', calculated, targetWeight, scaleMode);
          navigator.clipboard.writeText(md);
          const btn = scalerBar.querySelector('#tgsc-lfb-copy-md');
          btn.innerText = 'Copied!';
          setTimeout(() => { btn.innerText = 'Copy MD'; }, 1500);
        }
      });

      scalerBar.querySelector('#tgsc-lfb-dl-csv')?.addEventListener('click', () => {
        const enriched = window.TGSCFormulaScaler ? window.TGSCFormulaScaler.enrichIngredients(formulaIngredients, studentMaterials, '1') : [];
        const calculated = window.TGSCFormulaScaler ? window.TGSCFormulaScaler.calculateBatch(enriched, totalParts, targetWeight, scaleMode, '1') : null;
        if (calculated && window.TGSCFormulaScaler) {
          window.TGSCFormulaScaler.downloadCSV(document.title || 'Demo Formula', calculated, targetWeight, scaleMode);
        }
      });

      // Run initial in-page scaling
      updateInPageScaling();
    });
  }

  function enhancePage() {
    if (!directoryItems || directoryItems.length === 0) return;

    // 1. Render Right Floating Card for current page material
    renderActivePageSideCard();

    // 2. In-Page Live Formula Scaler if on Demo Formula Table
    enhanceDemoFormulaPage();

    // 3. Enhance Material & Formula Links with Badges, Substitutions, and Tooltips
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
          } else {
            // Material not in organ: check if substitution exists
            const subs = findSubstitutions(item, 1);
            if (subs.length > 0) {
              const subChip = document.createElement('span');
              subChip.className = 'tgsc-sub-chip';
              subChip.innerText = `Sub: ${subs[0].material.name}`;
              subChip.title = `Organ Substitute: ${subs[0].displayName} (Shared: ${subs[0].reason})`;
              link.parentNode.insertBefore(subChip, link.nextSibling);
            }
          }

          // Attach hover tooltip
          link.addEventListener('mouseenter', (e) => {
            const rect = link.getBoundingClientRect();
            const synText = item.synonyms && item.synonyms.length > 1 ? item.synonyms.slice(0, 3).join(', ') : '';
            const facetsText = item.facets && item.facets.length > 0 ? item.facets.slice(0, 4).join(', ') : '';

            // Check if available in student database
            const stMatches = findStudentMatches(item.cas, [item.name, ...(item.synonyms || [])]);
            const stMatchName = stMatches.length > 0 ? (stMatches[0].student_material_name || `${stMatches[0].name} from ${(stMatches[0].suppliers || [])[0] || 'Database'}`) : '';

            // If not in DB, show top substitution
            let subTooltipHtml = '';
            if (stMatches.length === 0) {
              const subs = findSubstitutions(item, 2);
              if (subs.length > 0) {
                subTooltipHtml = `
                  <div style="background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); border-radius: 4px; padding: 3px 6px; font-size: 10px; color: #c7d2fe; margin-bottom: 4px;">
                    <strong>Organ Substitute:</strong> ${subs.map(s => s.displayName).join(' or ')}
                  </div>
                `;
              }
            }

            tooltip.innerHTML = `
              <div class="tt-header">
                <span class="tt-name">${item.name}</span>
                ${item.level ? `<span class="tgsc-link-badge badge-l${item.level}">L${item.level}</span>` : ''}
              </div>
              ${stMatchName ? `<div style="background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.3); border-radius: 4px; padding: 3px 6px; font-size: 10px; color: #34d399; margin-bottom: 4px; font-weight: 600;">In DB: ${stMatchName}</div>` : ''}
              ${subTooltipHtml}
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

    // 4. Inject Table Filter Bar above large TGSC tables (e.g. Blenders & Uses)
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


