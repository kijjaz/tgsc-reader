/**
 * TGSC Perfumery Companion - Popup & Fullscreen Explorer Logic
 * Clean, high-density, emoji-free student perfumery companion.
 */

document.addEventListener('DOMContentLoaded', async () => {
  let directoryItems = [];
  let studentMaterials = [];
  let currentCategory = 'all';
  let currentLevel = 'all';
  let currentVolatility = 'all';
  let searchQuery = '';
  let activeMaterialItem = null;
  let activeViewMode = 'all'; // 'all' | 'formulas' | 'pairings' | 'ingredients' | 'organ_only'

  const searchInput = document.getElementById('search-input');
  const materialList = document.getElementById('material-list');
  const catTabs = document.querySelectorAll('.cat-tab');
  const tierPills = document.querySelectorAll('.tier-pill');
  const volChips = document.querySelectorAll('.vol-chip');
  const openFullTabBtn = document.getElementById('btn-open-fulltab');
  const detailModal = document.getElementById('detail-modal');
  const modalContent = document.getElementById('modal-content');
  const modalBackdrop = document.getElementById('modal-backdrop');

  const countAll = document.getElementById('count-all');
  const countRm = document.getElementById('count-rm');
  const countNat = document.getElementById('count-nat');
  const countFr = document.getElementById('count-fr');
  const countFl = document.getElementById('count-fl');
  const countDemo = document.getElementById('count-demo');

  // Check if running in a standalone browser tab
  const isFullTab = window.innerWidth > 600 || window.location.search.includes('full');
  if (isFullTab) {
    document.body.classList.add('fullscreen-mode');
    document.documentElement.classList.add('fullscreen-mode');
    if (openFullTabBtn) openFullTabBtn.style.display = 'none';
  }

  const openSidePanelBtn = document.getElementById('btn-open-sidepanel');

  // Handle Side Panel opening
  if (openSidePanelBtn) {
    openSidePanelBtn.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'open_side_panel' });
        window.close();
      }
    });
  }

  // Handle Fullscreen Tab opening (with active material deep link)
  if (openFullTabBtn) {
    openFullTabBtn.addEventListener('click', () => {
      const activeId = activeMaterialItem ? activeMaterialItem.id : '';
      const targetUrl = activeId ? chrome.runtime.getURL(`app/studio.html?id=${activeId}`) : chrome.runtime.getURL('app/studio.html');
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: targetUrl });
      } else {
        window.open(targetUrl, '_blank');
      }
    });
  }

  // Load datasets
  try {
    const dirRes = await fetch(chrome.runtime.getURL('data/tgsc_directory.json'));
    const dirData = await dirRes.json();
    directoryItems = dirData.items || [];

    const stRes = await fetch(chrome.runtime.getURL('data/student_tiers.json'));
    const stData = await stRes.json();
    studentMaterials = stData.materials || [];

    // Set badge counts
    if (countAll) countAll.innerText = directoryItems.length;
    if (countRm) countRm.innerText = directoryItems.filter(m => m.type === 'raw_material').length;
    if (countNat) countNat.innerText = directoryItems.filter(m => m.type === 'natural').length;
    if (countFr) countFr.innerText = directoryItems.filter(m => m.type === 'fragrance').length;
    if (countFl) countFl.innerText = directoryItems.filter(m => m.type === 'flavor').length;
    if (countDemo) countDemo.innerText = directoryItems.filter(m => m.type === 'demo_formula' || m.type === 'perfume_base').length;

    // Load saved tier preference from storage
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const stored = await chrome.storage.local.get('userSelectedTier');
        if (stored && stored.userSelectedTier) {
          currentLevel = stored.userSelectedTier;
          tierPills.forEach(p => {
            p.classList.toggle('active', p.dataset.level === currentLevel);
          });
        }
      } catch (e) {
        // Continue with default
      }
    }

    // Detect if current active browser tab is on TGSC
    const activeTabBanner = document.getElementById('active-tab-banner');
    if (chrome && chrome.tabs && chrome.tabs.query && activeTabBanner) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
          const url = tabs[0].url;
          const tabId = tabs[0].id;
          const idMatch = url.match(/\/(data|demos)\/([a-z]{2}[0-9]+)\.html/i);
          if (idMatch) {
            const activeId = idMatch[2].toLowerCase();
            const activeItem = directoryItems.find(x => x.id.toLowerCase() === activeId);
            if (activeItem) {
              activeMaterialItem = activeItem;
              const isPaletteOrFormula = activeItem.type === 'fragrance' || activeItem.type === 'flavor' || activeItem.type === 'demo_formula' || activeItem.type === 'perfume_base';
              activeViewMode = isPaletteOrFormula ? 'ingredients' : (activeItem.used_in_formula_ids && activeItem.used_in_formula_ids.length > 0 ? 'formulas' : 'all');
              renderActiveTabCard(activeItem, tabId);
            }
          }
        }
        renderList();
      });
    } else {
      renderList();
    }
  } catch (err) {
    materialList.innerHTML = `<div style="padding: 20px; color: #f87171;">Failed to load directory data: ${err.message}</div>`;
  }

  function renderActiveTabCard(item, tabId) {
    const activeTabBanner = document.getElementById('active-tab-banner');
    if (!activeTabBanner) return;
    activeTabBanner.classList.remove('hidden');

    const isDemoFormula = item.type === 'demo_formula' || item.type === 'perfume_base';
    const isBlendingPalette = item.type === 'fragrance' || item.type === 'flavor';
    
    // Archetype 1: Demo Formula Page
    if (isDemoFormula) {
      const ingCount = (item.ingredients || []).length;
      activeTabBanner.innerHTML = `
        <div class="active-tab-card">
          <div class="active-tab-header">
            <span class="active-tab-badge">Viewing Active Demo Formula</span>
            <span class="active-tab-id"><code>${item.id}</code></span>
          </div>
          <div class="active-tab-title-row">
            <span class="active-tab-title">${item.name}</span>
            <span style="font-size: 11px; color: #a5b4fc; font-weight: 600;">${ingCount} Formula Ingredients</span>
          </div>
          <div class="active-tab-synonyms">${item.family} &bull; ${item.description || 'Demo formula composition'}</div>
          
          <div class="active-tab-context-nav">
            <button class="btn-ctx ${activeViewMode === 'ingredients' ? 'active' : ''}" id="btn-ctx-ing">
              Formula Breakdown (${ingCount})
            </button>
            <button class="btn-ctx ${activeViewMode === 'all' ? 'active' : ''}" id="btn-ctx-all">
              Browse All Directory
            </button>
          </div>

          <div class="active-tab-actions">
            <button class="btn-act btn-act-inspect" id="btn-act-inspect">Open Formula Scaler (10g)</button>
          </div>
        </div>
      `;

      document.getElementById('btn-ctx-ing')?.addEventListener('click', () => {
        activeViewMode = 'ingredients';
        searchQuery = '';
        searchInput.value = '';
        renderActiveTabCard(item, tabId);
        renderList();
      });
    } 
    // Archetype 2: Fragrance or Flavor Blending Palette
    else if (isBlendingPalette) {
      const ingCount = (item.ingredients || []).length;
      activeTabBanner.innerHTML = `
        <div class="active-tab-card" style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15)); border-color: #10b981;">
          <div class="active-tab-header">
            <span class="active-tab-badge" style="color: #6ee7b7;">Recommended Blenders & Materials</span>
            <span class="active-tab-id"><code>${item.id}</code></span>
          </div>
          <div class="active-tab-title-row">
            <span class="active-tab-title">${item.name}</span>
            <span style="font-size: 11px; color: #6ee7b7; font-weight: 600;">${ingCount} Candidate Blenders</span>
          </div>
          <div class="active-tab-synonyms" style="color: #cbd5e1;">
            Materials and blenders that blend well with or are useful in <strong>${item.name.toLowerCase()}</strong> formulations.
          </div>
          
          <div class="active-tab-context-nav">
            <button class="btn-ctx ${activeViewMode === 'ingredients' ? 'active' : ''}" id="btn-ctx-ing">
              All Candidate Blenders (${ingCount})
            </button>
            <button class="btn-ctx ${activeViewMode === 'organ_only' ? 'active' : ''}" id="btn-ctx-organ">
              In My Student Organ
            </button>
            <button class="btn-ctx ${activeViewMode === 'all' ? 'active' : ''}" id="btn-ctx-all">
              Browse All Directory
            </button>
          </div>

          <div class="active-tab-actions">
            <button class="btn-act btn-act-inspect" id="btn-act-inspect" style="background: #059669; color: #ffffff;">Inspect Blending Palette</button>
          </div>
        </div>
      `;

      document.getElementById('btn-ctx-ing')?.addEventListener('click', () => {
        activeViewMode = 'ingredients';
        searchQuery = '';
        searchInput.value = '';
        renderActiveTabCard(item, tabId);
        renderList();
      });

      document.getElementById('btn-ctx-organ')?.addEventListener('click', () => {
        activeViewMode = 'organ_only';
        searchQuery = '';
        searchInput.value = '';
        renderActiveTabCard(item, tabId);
        renderList();
      });
    } 
    // Archetype 3: Raw Material or Natural Page
    else {
      const formulaCount = (item.used_in_formula_ids || []).length;
      const pairingsCount = ((item.pairings && item.pairings['1']) || []).length;

      activeTabBanner.innerHTML = `
        <div class="active-tab-card">
          <div class="active-tab-header">
            <span class="active-tab-badge">Viewing Raw Material</span>
            <span class="active-tab-id"><code>${item.id}</code></span>
          </div>
          <div class="active-tab-title-row">
            <span class="active-tab-title">${item.name}</span>
            ${item.sku ? `<span class="mat-id" style="font-size: 10px;"><code>PW: ${item.sku}</code></span>` : ''}
            ${item.cas ? `<span class="active-tab-cas">CAS: ${item.cas}</span>` : ''}
          </div>
          ${item.synonyms && item.synonyms.length > 1 ? `
            <div class="active-tab-synonyms">Synonyms: ${item.synonyms.slice(0, 4).join(', ')}</div>
          ` : ''}
          
          <div class="active-tab-context-nav">
            ${formulaCount > 0 ? `
              <button class="btn-ctx ${activeViewMode === 'formulas' ? 'active' : ''}" id="btn-ctx-formulas">
                Fragrances Using This (${formulaCount})
              </button>
            ` : ''}
            ${pairingsCount > 0 ? `
              <button class="btn-ctx ${activeViewMode === 'pairings' ? 'active' : ''}" id="btn-ctx-pairings">
                Top Companion Blenders (${pairingsCount})
              </button>
            ` : ''}
            <button class="btn-ctx ${activeViewMode === 'all' ? 'active' : ''}" id="btn-ctx-all">
              Browse All Directory
            </button>
          </div>

          <div class="active-tab-actions">
            <button class="btn-act btn-act-inspect" id="btn-act-inspect">Inspect Material Profile</button>
          </div>
        </div>
      `;

      document.getElementById('btn-ctx-formulas')?.addEventListener('click', () => {
        activeViewMode = 'formulas';
        searchQuery = '';
        searchInput.value = '';
        renderActiveTabCard(item, tabId);
        renderList();
      });

      document.getElementById('btn-ctx-pairings')?.addEventListener('click', () => {
        activeViewMode = 'pairings';
        searchQuery = '';
        searchInput.value = '';
        renderActiveTabCard(item, tabId);
        renderList();
      });
    }

    document.getElementById('btn-ctx-all')?.addEventListener('click', () => {
      activeViewMode = 'all';
      renderActiveTabCard(item, tabId);
      renderList();
    });

    document.getElementById('btn-act-inspect')?.addEventListener('click', () => {
      openInAppStudio(item);
    });
  }

  // Filter & Render
  function renderList() {
    const q = searchQuery.toLowerCase().trim();
    let filtered = [];

    if (!q && activeMaterialItem && activeViewMode === 'formulas') {
      const fids = new Set(activeMaterialItem.used_in_formula_ids || []);
      filtered = directoryItems.filter(item => fids.has(item.id));
      if (filtered.length === 0) {
        filtered = directoryItems.filter(item => item.type === 'fragrance' && (item.family === activeMaterialItem.family || (item.facets || []).some(f => (activeMaterialItem.facets || []).includes(f))));
      }
    } else if (!q && activeMaterialItem && activeViewMode === 'pairings') {
      const pList = (activeMaterialItem.pairings && (activeMaterialItem.pairings['1'] || activeMaterialItem.pairings['2'])) || [];
      const pNames = new Set(pList.map(p => (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
      filtered = directoryItems.filter(item => pNames.has((item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
    } else if (!q && activeMaterialItem && (activeViewMode === 'ingredients' || activeViewMode === 'organ_only')) {
      const ingNames = new Set((activeMaterialItem.ingredients || []).map(i => (i.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
      const ingIds = new Set((activeMaterialItem.ingredients || []).map(i => (i.id || '').toLowerCase()));
      filtered = directoryItems.filter(item => ingIds.has(item.id.toLowerCase()) || ingNames.has((item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
      
      if (activeViewMode === 'organ_only') {
        filtered = filtered.filter(item => item.level && item.level >= 1 && item.level <= 3);
      }
    } else if (!q && activeMaterialItem && activeViewMode === 'related') {
      filtered = directoryItems.filter(item => item.id !== activeMaterialItem.id && item.family === activeMaterialItem.family);
    } else {
      filtered = directoryItems.filter(item => {
        if (currentCategory !== 'all') {
          if (currentCategory === 'demo_formula') {
            if (item.type !== 'demo_formula' && item.type !== 'perfume_base') return false;
          } else if (item.type !== currentCategory) {
            return false;
          }
        }

        if (currentLevel !== 'all') {
          if (item.level !== parseInt(currentLevel, 10)) return false;
        }

        if (currentVolatility !== 'all' && item.volatility !== currentVolatility) {
          return false;
        }

        if (q) {
          const inId = (item.id || '').toLowerCase().includes(q);
          const inName = (item.name || '').toLowerCase().includes(q);
          const inChem = (item.chemical_name || '').toLowerCase().includes(q);
          const inSyn = (item.synonyms || []).some(s => s.toLowerCase().includes(q));
          const inCas = (item.cas || '').toLowerCase().includes(q);
          const inFamily = (item.family || '').toLowerCase().includes(q);
          const inFacets = (item.facets || []).some(f => f.toLowerCase().includes(q));
          const inAccords = (item.commercial_accords || []).some(a => a.toLowerCase().includes(q));
          if (!inId && !inName && !inChem && !inSyn && !inCas && !inFamily && !inFacets && !inAccords) return false;
        }
        return true;
      });
    }

    if (filtered.length === 0) {
      materialList.innerHTML = `<div style="padding: 40px; text-align: center; color: #64748b; grid-column: 1 / -1;">No items match your search.</div>`;
      return;
    }

    let contextHeaderHtml = '';
    if (!q && activeMaterialItem && activeViewMode === 'formulas') {
      contextHeaderHtml = `
        <div class="list-context-banner">
          <span>Showing <strong>${filtered.length} Fragrance Themes</strong> using <strong>${activeMaterialItem.name}</strong></span>
        </div>
      `;
    } else if (!q && activeMaterialItem && activeViewMode === 'pairings') {
      contextHeaderHtml = `
        <div class="list-context-banner" style="border-left-color: #34d399;">
          <span>Showing <strong>Top Companion Blenders</strong> for <strong>${activeMaterialItem.name}</strong></span>
        </div>
      `;
    } else if (!q && activeMaterialItem && activeViewMode === 'ingredients') {
      const isPalette = activeMaterialItem.type === 'fragrance' || activeMaterialItem.type === 'flavor';
      contextHeaderHtml = `
        <div class="list-context-banner" style="border-left-color: #38bdf8;">
          <span>Showing <strong>${filtered.length} ${isPalette ? 'Candidate Materials & Blenders' : 'Ingredients'}</strong> for <strong>${activeMaterialItem.name}</strong></span>
        </div>
      `;
    } else if (!q && activeMaterialItem && activeViewMode === 'organ_only') {
      contextHeaderHtml = `
        <div class="list-context-banner" style="border-left-color: #10b981;">
          <span>Showing <strong>${filtered.length} Materials in Student Organ</strong> that blend well in <strong>${activeMaterialItem.name}</strong></span>
        </div>
      `;
    }

    const cardsHtml = filtered.slice(0, 150).map(m => {
      let tierBadgeHtml = '';
      if (m.level) {
        const badgeClass = m.level === 1 ? 'badge-l1' : m.level === 2 ? 'badge-l2' : 'badge-l3';
        const levelShort = m.level === 1 ? 'L1: Core' : m.level === 2 ? 'L2: Inter' : 'L3: Spec';
        tierBadgeHtml = `<span class="mat-tier-badge ${badgeClass}">${levelShort}</span>`;
      } else {
        const typeBadgeClass = `badge-type-${m.type}`;
        tierBadgeHtml = `<span class="mat-tier-badge ${typeBadgeClass}">${m.type_label}</span>`;
      }

      const volClass = m.volatility === 'Top Note' ? 'vol-top' : m.volatility === 'Heart Note' ? 'vol-heart' : m.volatility === 'Base Note' ? 'vol-base' : 'vol-accord';
      const showChemSub = m.chemical_name && m.chemical_name.toLowerCase() !== m.name.toLowerCase();
      const isDemo = m.type === 'demo_formula' || m.type === 'perfume_base';
      const isPalette = m.type === 'fragrance' || m.type === 'flavor';

      let actionBtnText = 'Inspect Material';
      if (isDemo) actionBtnText = 'Scale Formula (10g)';
      else if (isPalette) actionBtnText = 'Inspect Blenders';

      return `
        <div class="mat-card" data-id="${m.id}">
          <div class="mat-card-top">
            <div>
              <span class="mat-name btn-inspect" data-id="${m.id}" title="Click to Inspect">${m.name}</span>
              ${showChemSub ? `<div class="mat-sub-chem">${m.chemical_name}</div>` : ''}
            </div>
            ${tierBadgeHtml}
          </div>

          <div class="mat-meta">
            ${m.id ? `<span class="mat-id" data-id="${m.id}" title="Click to copy TGSC ID"><code>${m.id}</code></span>` : ''}
            ${m.sku ? `<span class="mat-id" title="PerfumersWorld Code"><code>PW: ${m.sku}</code></span>` : ''}
            ${m.cas ? `<span class="mat-cas" data-cas="${m.cas}" title="Click to copy CAS">CAS: ${m.cas}</span>` : ''}
            <span class="mat-vol ${volClass}">${m.volatility || 'Accord'}</span>
            ${m.substantivity_hours ? `<span style="color: #64748b; font-size: 11px;">${m.substantivity_hours}h</span>` : ''}
            <span style="color: #94a3b8; font-size: 11px; margin-left: auto;">Family: <strong>${m.family}</strong></span>
          </div>

          ${m.synonyms && m.synonyms.length > 1 ? `
            <div class="mat-synonyms-line">
              <span class="syn-label">Synonyms:</span>
              <span class="syn-text">${m.synonyms.slice(0, 4).join(', ')}</span>
            </div>
          ` : ''}

          ${m.facets && m.facets.length > 0 ? `
            <div class="mat-facets">
              ${m.facets.slice(0, 5).map(f => `<span class="facet-chip">${f}</span>`).join('')}
            </div>
          ` : ''}

          ${m.commercial_accords && m.commercial_accords.length > 0 ? `
            <div class="mat-accords-line">
              <span class="accords-label">Used In:</span>
              ${m.commercial_accords.slice(0, 4).map(a => `<span class="accord-pill-mini chip-search-accord" data-accord="${a}">${a}</span>`).join('')}
            </div>
          ` : ''}

          <div class="mat-actions">
            <button class="mat-btn mat-btn-inspect btn-inspect" data-id="${m.id}">
              ${actionBtnText}
            </button>
            ${m.cas ? `<button class="mat-btn btn-copy" data-copy="${m.cas}">CAS</button>` : ''}
            <a href="${m.url}" target="_blank" class="mat-btn mat-btn-tgsc" title="External link to TGSC">TGSC</a>
          </div>
        </div>
      `;
    }).join('');

    materialList.innerHTML = contextHeaderHtml + cardsHtml;

    materialList.querySelectorAll('.btn-inspect').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const item = directoryItems.find(x => x.id === id);
        if (item) openInAppStudio(item);
      });
    });

    materialList.querySelectorAll('.chip-search-accord').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.value = chip.dataset.accord;
        searchQuery = chip.dataset.accord;
        activeViewMode = 'all';
        renderList();
      });
    });

    materialList.querySelectorAll('.btn-copy, .mat-cas, .mat-id').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.dataset.copy || btn.dataset.cas || btn.dataset.id;
        if (text) {
          navigator.clipboard.writeText(text);
          const original = btn.innerText;
          btn.innerText = 'Copied';
          setTimeout(() => { btn.innerText = original; }, 1500);
        }
      });
    });
  }

  // Open In-App Studio Inspector / Scaler
  function openInAppStudio(item) {
    let targetGrams = 10.0;
    let organLevel = '1';
    let fMode = 'gap_analysis';

    function renderModalBody() {
      const isDemo = item.type === 'demo_formula' || item.type === 'perfume_base';
      const isPalette = item.type === 'fragrance' || item.type === 'flavor';

      // 1. Real Demo Formula with Batch Scaler
      if (isDemo && window.TGSCFormulaScaler && item.ingredients && item.ingredients.length > 0) {
        const totalParts = item.ingredients.reduce((s, i) => s + (i.parts || 25), 0);
        const enriched = window.TGSCFormulaScaler.enrichIngredients(item.ingredients, studentMaterials, organLevel);
        const calcMode = fMode === 'skeleton' ? 'skeleton' : 'original';
        const calculated = window.TGSCFormulaScaler.calculateBatch(enriched, totalParts, targetGrams, calcMode, organLevel);

        const missingItems = calculated.rows.filter(r => !r.isAvailable);
        let displayRows = fMode === 'in_organ_only' ? calculated.rows.filter(r => r.isAvailable) : calculated.rows;

        modalContent.innerHTML = `
          <div class="modal-header">
            <div class="modal-brand">
              <div>
                <h2 class="modal-title">${item.name}</h2>
                <span class="modal-subtitle">Demo Formula &bull; ${item.family} &bull; ${item.ingredients.length} Ingredients</span>
              </div>
            </div>
            <button class="btn-close-modal" id="btn-close-modal">✕</button>
          </div>

          <div class="modal-body">
            <div class="modal-level-box">
              <span style="font-size: 11px; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px;">Filter Formula to Organ Level:</span>
              <div class="modal-level-buttons">
                <button class="m-lvl-btn ${organLevel === '1' ? 'active' : ''}" data-lvl="1">L1: Core 50</button>
                <button class="m-lvl-btn ${organLevel === '2' ? 'active' : ''}" data-lvl="2">L2: Inter 150</button>
                <button class="m-lvl-btn ${organLevel === '3' ? 'active' : ''}" data-lvl="3">L3: Spec 300+</button>
                <button class="m-lvl-btn ${organLevel === 'all' ? 'active' : ''}" data-lvl="all">Full Formula</button>
              </div>
            </div>

            ${organLevel !== 'all' ? `
              <div style="background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 10px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
                  <span>Level ${organLevel} Organ Compatibility: <strong style="color: #34d399;">${calculated.coveragePercent}%</strong></span>
                  <span style="color: #94a3b8;">(${calculated.availableCount} of ${item.ingredients.length} in organ)</span>
                </div>
                <div class="tgsc-gauge-track">
                  <div class="tgsc-gauge-fill" style="width: ${calculated.coveragePercent}%; background: #10b981;"></div>
                </div>
              </div>
            ` : ''}

            <div class="tgsc-scaler-controls" style="margin-bottom: 12px;">
              <div class="tgsc-input-group">
                <label>Batch Size (g):</label>
                <div class="tgsc-input-box">
                  <input type="number" id="m-batch-input" value="${targetGrams}" min="0.1" step="0.5" />
                  <span class="tgsc-input-unit">g</span>
                </div>
              </div>

              <div class="tgsc-quick-presets">
                <span class="tgsc-preset-label">Presets:</span>
                <button class="tgsc-btn-preset ${targetGrams === 5 ? 'active' : ''}" data-g="5">5g</button>
                <button class="tgsc-btn-preset ${targetGrams === 10 ? 'active' : ''}" data-g="10">10g</button>
                <button class="tgsc-btn-preset ${targetGrams === 20 ? 'active' : ''}" data-g="20">20g</button>
                <button class="tgsc-btn-preset ${targetGrams === 50 ? 'active' : ''}" data-g="50">50g</button>
              </div>
            </div>

            ${organLevel !== 'all' ? `
              <div class="tgsc-mode-tabs" style="display: flex; gap: 6px; margin-bottom: 12px;">
                <button class="tgsc-mode-tab ${fMode === 'gap_analysis' ? 'active' : ''}" data-mode="gap_analysis">Full Formula</button>
                <button class="tgsc-mode-tab ${fMode === 'skeleton' ? 'active' : ''}" data-mode="skeleton">Student Skeleton (100%)</button>
              </div>
            ` : ''}

            <div class="tgsc-actions-bar" style="margin-bottom: 12px;">
              <button id="m-btn-csv" class="tgsc-btn tgsc-btn-primary">Download CSV</button>
              <button id="m-btn-md" class="tgsc-btn tgsc-btn-secondary">Copy Markdown</button>
              <a href="${item.url}" target="_blank" class="tgsc-btn tgsc-btn-secondary" style="margin-left: auto; text-decoration: none;">Open TGSC Link</a>
            </div>

            <div class="tgsc-table-container">
              <table class="tgsc-table">
                <thead>
                  <tr>
                    <th>Ingredient (Click to inspect)</th>
                    <th>Tier</th>
                    <th style="text-align: right;">Parts</th>
                    <th style="text-align: right;">%</th>
                    <th style="text-align: right;">Weight (g)</th>
                  </tr>
                </thead>
                <tbody>
                  ${displayRows.map(r => `
                    <tr class="${r.isAvailable ? 'tgsc-row-available' : 'tgsc-row-missing'}">
                      <td>
                        <div class="tgsc-ing-wrap">
                          <span class="tgsc-status-dot ${r.isAvailable ? 'dot-green' : 'dot-red'}"></span>
                          <span class="ing-clickable btn-drill-mat" data-name="${r.name}" title="Click to view material card">${r.name}</span>
                        </div>
                      </td>
                      <td><span class="tgsc-tier-pill-sm tag-${r.levelTag}">${r.levelLabel}</span></td>
                      <td style="text-align: right; font-family: monospace;">${r.parts}</td>
                      <td style="text-align: right; color: #a78bfa;">${r.percentage}%</td>
                      <td style="text-align: right; color: ${r.isAvailable ? '#34d399' : '#f87171'}; font-weight: 600; font-family: monospace;">${r.weightGrams}g</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;

        modalContent.querySelector('#btn-close-modal').addEventListener('click', closeModal);
        modalContent.querySelectorAll('.m-lvl-btn').forEach(b => {
          b.addEventListener('click', () => { organLevel = b.dataset.lvl; renderModalBody(); });
        });
        modalContent.querySelectorAll('.tgsc-mode-tab').forEach(b => {
          b.addEventListener('click', () => { fMode = b.dataset.mode; renderModalBody(); });
        });
        modalContent.querySelectorAll('.tgsc-btn-preset').forEach(b => {
          b.addEventListener('click', () => { targetGrams = parseFloat(b.dataset.g); renderModalBody(); });
        });
        const mBatch = modalContent.querySelector('#m-batch-input');
        if (mBatch) {
          mBatch.addEventListener('input', (e) => { targetGrams = parseFloat(e.target.value) || 10.0; renderModalBody(); });
        }
        modalContent.querySelector('#m-btn-csv').addEventListener('click', () => {
          window.TGSCFormulaScaler.downloadCSV(item.name, calculated, targetGrams, fMode);
        });
        modalContent.querySelector('#m-btn-md').addEventListener('click', () => {
          const md = window.TGSCFormulaScaler.generateMarkdown(item.name, calculated, targetGrams, fMode);
          navigator.clipboard.writeText(md);
          alert('Copied Markdown formula table to clipboard');
        });

        modalContent.querySelectorAll('.btn-drill-mat').forEach(el => {
          el.addEventListener('click', () => {
            const ingName = el.dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetMat = directoryItems.find(m => {
              const mName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const sNames = (m.synonyms || []).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
              return mName === ingName || mName.includes(ingName) || ingName.includes(mName) || sNames.includes(ingName);
            });
            if (targetMat) openInAppStudio(targetMat);
          });
        });
      } 
      // 2. Fragrance or Flavor Blending Palette
      else if (isPalette) {
        const rawIngs = item.ingredients || [];
        const ingNames = new Set(rawIngs.map(i => (i.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
        const ingIds = new Set(rawIngs.map(i => (i.id || '').toLowerCase()));
        
        let paletteMaterials = directoryItems.filter(m => ingIds.has(m.id.toLowerCase()) || ingNames.has((m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')));
        if (organLevel !== 'all') {
          paletteMaterials = paletteMaterials.filter(m => m.level && m.level <= parseInt(organLevel, 10));
        }

        modalContent.innerHTML = `
          <div class="modal-header">
            <div class="modal-brand">
              <div>
                <h2 class="modal-title">${item.name} Blending Palette</h2>
                <span class="modal-subtitle">${rawIngs.length} Documented Materials & Blenders on TGSC</span>
              </div>
            </div>
            <button class="btn-close-modal" id="btn-close-modal">✕</button>
          </div>

          <div class="modal-body">
            <div class="tgsc-hero-card" style="margin-bottom: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid #10b981;">
              <p style="font-size: 12px; color: #d1fae5; line-height: 1.5; margin: 0;">
                These materials are recommended by perfumers on TGSC as effective blenders and building blocks for creating, modifying, or nuancing a <strong>${item.name.toLowerCase()}</strong> composition.
              </p>
            </div>

            <div class="modal-level-box">
              <span style="font-size: 11px; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px;">Filter Blenders in Student Organ:</span>
              <div class="modal-level-buttons">
                <button class="m-lvl-btn ${organLevel === '1' ? 'active' : ''}" data-lvl="1">L1: Core 50</button>
                <button class="m-lvl-btn ${organLevel === '2' ? 'active' : ''}" data-lvl="2">L2: Inter 150</button>
                <button class="m-lvl-btn ${organLevel === '3' ? 'active' : ''}" data-lvl="3">L3: Spec 300+</button>
                <button class="m-lvl-btn ${organLevel === 'all' ? 'active' : ''}" data-lvl="all">All Blenders (${rawIngs.length})</button>
              </div>
            </div>

            <div class="tgsc-table-container" style="margin-top: 10px;">
              <table class="tgsc-table">
                <thead>
                  <tr>
                    <th>Blender / Aroma Chemical</th>
                    <th>Tier</th>
                    <th>Volatility</th>
                    <th>Primary Odor Facets</th>
                  </tr>
                </thead>
                <tbody>
                  ${paletteMaterials.map(m => `
                    <tr>
                      <td>
                        <span class="ing-clickable btn-drill-mat" data-name="${m.name}" style="font-weight: 600; color: #38bdf8;">${m.name}</span>
                        ${m.cas ? `<div style="font-size: 10px; color: #64748b;">CAS: ${m.cas}</div>` : ''}
                      </td>
                      <td>
                        ${m.level ? `<span class="tgsc-tier-pill-sm tag-l${m.level}">L${m.level}</span>` : '<span style="color: #64748b; font-size: 10px;">Specialty</span>'}
                      </td>
                      <td>
                        <span style="font-size: 11px; color: #cbd5e1;">${m.volatility || 'Heart Note'}</span>
                      </td>
                      <td>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                          ${(m.facets || []).slice(0, 3).map(f => `<span class="facet-chip" style="font-size: 9px; padding: 1px 4px;">${f}</span>`).join('')}
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="tgsc-actions-bar" style="margin-top: 14px; border-top: 1px solid #334155; padding-top: 12px;">
              <a href="${item.url}" target="_blank" class="tgsc-btn tgsc-btn-secondary" style="margin-left: auto; text-decoration: none;">Open TGSC Uses Page</a>
            </div>
          </div>
        `;

        modalContent.querySelector('#btn-close-modal').addEventListener('click', closeModal);
        modalContent.querySelectorAll('.m-lvl-btn').forEach(b => {
          b.addEventListener('click', () => { organLevel = b.dataset.lvl; renderModalBody(); });
        });

        modalContent.querySelectorAll('.btn-drill-mat').forEach(el => {
          el.addEventListener('click', () => {
            const ingName = el.dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetMat = directoryItems.find(m => {
              const mName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const sNames = (m.synonyms || []).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
              return mName === ingName || mName.includes(ingName) || ingName.includes(mName) || sNames.includes(ingName);
            });
            if (targetMat) openInAppStudio(targetMat);
          });
        });
      }
      // 3. Raw Material / Natural Inspector
      else {
        const pairingsList = (item.pairings && item.pairings[organLevel]) || (item.pairings && item.pairings['1']) || [];

        modalContent.innerHTML = `
          <div class="modal-header">
            <div class="modal-brand">
              <div>
                <h2 class="modal-title">${item.name}</h2>
                <span class="modal-subtitle">${item.type_label} &bull; Family: <strong>${item.family}</strong></span>
              </div>
            </div>
            <button class="btn-close-modal" id="btn-close-modal">✕</button>
          </div>

          <div class="modal-body">
            <div class="tgsc-hero-card" style="margin-bottom: 12px;">
              <div class="tgsc-meta-chips" style="margin-bottom: 10px;">
                ${item.cas ? `<span class="tgsc-chip tgsc-chip-cas" id="m-copy-cas">CAS: ${item.cas}</span>` : ''}
                ${item.id ? `<span class="tgsc-chip">ID: ${item.id}</span>` : ''}
                ${item.sku ? `<span class="tgsc-chip" style="color: #60a5fa;">PW: <strong>${item.sku}</strong></span>` : ''}
                <span class="tgsc-chip">Volatility: <strong>${item.volatility}</strong></span>
                ${item.substantivity_hours ? `<span class="tgsc-chip">Substantivity: ${item.substantivity_hours} hrs</span>` : ''}
              </div>
              <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin: 0;">${item.description || 'No detailed description available.'}</p>
            </div>

            ${item.synonyms && item.synonyms.length > 1 ? `
              <div style="margin-bottom: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px;">
                <span style="font-size: 11px; font-weight: 600; color: #fcd34d; display: block; margin-bottom: 6px;">Common Synonyms & Commercial Trade Names:</span>
                <div class="tgsc-facet-grid">
                  ${item.synonyms.map(s => `<span class="synonym-chip">${s}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            <div class="modal-level-box">
              <span style="font-size: 11px; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px;">Match Companions to Organ Level:</span>
              <div class="modal-level-buttons">
                <button class="m-lvl-btn ${organLevel === '1' ? 'active' : ''}" data-lvl="1">L1 (Core 50)</button>
                <button class="m-lvl-btn ${organLevel === '2' ? 'active' : ''}" data-lvl="2">L2 (Inter 150)</button>
                <button class="m-lvl-btn ${organLevel === '3' ? 'active' : ''}" data-lvl="3">L3 (Spec 300+)</button>
              </div>
            </div>

            ${pairingsList.length > 0 ? `
              <div style="margin-bottom: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px;">
                <span style="font-size: 11px; font-weight: 600; color: #34d399; display: block; margin-bottom: 6px;">Best Paired With (In Level ${organLevel} Organ):</span>
                <div class="tgsc-facet-grid">
                  ${pairingsList.map(p => `
                    <span class="companion-chip btn-drill-mat" data-name="${p.name}" title="Click to view ${p.name}">
                      + ${p.name}
                    </span>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${item.commercial_accords && item.commercial_accords.length > 0 ? `
              <div style="margin-bottom: 12px;">
                <span style="font-size: 11px; font-weight: 600; color: #93c5fd; display: block; margin-bottom: 6px;">Used In Fragrances & Accords:</span>
                <div class="tgsc-facet-grid">
                  ${item.commercial_accords.map(a => `
                    <span class="accord-pill-action chip-search-modal" data-query="${a}">
                      ${a}
                    </span>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            ${item.facets && item.facets.length > 0 ? `
              <div style="margin-bottom: 14px;">
                <span style="font-size: 11px; font-weight: 600; color: #94a3b8; display: block; margin-bottom: 6px;">Olfactory Facets:</span>
                <div class="tgsc-facet-grid">
                  ${item.facets.map(f => `<span class="tgsc-facet-pill">${f}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            <div class="tgsc-actions-bar" style="margin-top: 14px; border-top: 1px solid #334155; padding-top: 12px;">
              ${item.cas ? `<button id="m-btn-copy-cas" class="tgsc-btn tgsc-btn-primary">Copy CAS</button>` : ''}
              <a href="${item.url}" target="_blank" class="tgsc-btn tgsc-btn-secondary" style="text-decoration: none;">Open on TGSC</a>
            </div>
          </div>
        `;

        modalContent.querySelector('#btn-close-modal').addEventListener('click', closeModal);
        modalContent.querySelectorAll('.m-lvl-btn').forEach(b => {
          b.addEventListener('click', () => { organLevel = b.dataset.lvl; renderModalBody(); });
        });
        modalContent.querySelectorAll('.chip-search-modal').forEach(chip => {
          chip.addEventListener('click', () => {
            closeModal();
            searchInput.value = chip.dataset.query;
            searchQuery = chip.dataset.query;
            activeViewMode = 'all';
            renderList();
          });
        });

        modalContent.querySelectorAll('.btn-drill-mat').forEach(el => {
          el.addEventListener('click', () => {
            const ingName = el.dataset.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetMat = directoryItems.find(m => {
              const mName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const sNames = (m.synonyms || []).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, ''));
              return mName === ingName || mName.includes(ingName) || ingName.includes(mName) || sNames.includes(ingName);
            });
            if (targetMat) openInAppStudio(targetMat);
          });
        });

        const copyBtn = modalContent.querySelector('#m-btn-copy-cas');
        if (copyBtn && item.cas) {
          copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(item.cas);
            copyBtn.innerText = 'CAS Copied';
            setTimeout(() => { copyBtn.innerText = 'Copy CAS'; }, 1500);
          });
        }
      }
    }

    renderModalBody();
    detailModal.classList.remove('hidden');
  }

  function closeModal() {
    detailModal.classList.add('hidden');
    modalContent.innerHTML = '';
  }

  if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);

  // Search input listeners
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      activeViewMode = 'all';
      renderList();
    });
  }

  // Category Tab listeners
  catTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      catTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCategory = tab.dataset.type;
      activeViewMode = 'all';
      renderList();
    });
  });

  // Student Tier Pill listeners
  tierPills.forEach(pill => {
    pill.addEventListener('click', () => {
      tierPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentLevel = pill.dataset.level;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ userSelectedTier: currentLevel });
      }
      renderList();
    });
  });

  // Volatility Chip listeners
  volChips.forEach(chip => {
    chip.addEventListener('click', () => {
      volChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentVolatility = chip.dataset.vol;
      renderList();
    });
  });
});
