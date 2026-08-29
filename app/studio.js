/**
 * TGSC Perfumery Studio - Standalone App Logic
 * Universal runner: Works in Extension tab mode AND direct browser file:// mode.
 */

document.addEventListener('DOMContentLoaded', async () => {
  let directoryItems = [];
  let studentMaterials = [];
  let currentCategory = 'all';
  let currentTier = 'all';
  let currentVolatility = 'all';
  let searchQuery = '';
  let activeItem = null;
  let activeTGSCtabId = null;

  // DOM Elements
  const libSearch = document.getElementById('lib-search');
  const sidebarList = document.getElementById('sidebar-list');
  const catButtons = document.querySelectorAll('.cat-btn');
  const tierChips = document.querySelectorAll('.tier-chip');
  const volButtons = document.querySelectorAll('.vol-btn');
  const crawlInput = document.getElementById('crawl-input');
  const btnCrawl = document.getElementById('btn-crawl');
  const liveSyncBadge = document.getElementById('live-sync-badge');
  const syncText = document.getElementById('sync-text');
  const btnOpenTGSC = document.getElementById('btn-open-tgsc');
  const emptyState = document.getElementById('empty-state');
  const inspectorContent = document.getElementById('inspector-content');
  const networkBody = document.getElementById('network-body');

  const countAll = document.getElementById('count-all');
  const countRm = document.getElementById('count-rm');
  const countNat = document.getElementById('count-nat');
  const countFr = document.getElementById('count-fr');
  const countFl = document.getElementById('count-fl');
  const countDemo = document.getElementById('count-demo');

  async function fetchDataset(relativePath) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      try {
        const res = await fetch(chrome.runtime.getURL(relativePath));
        if (res.ok) return await res.json();
      } catch (e) {}
    }
    try {
      const res = await fetch(relativePath);
      if (res.ok) return await res.json();
    } catch (e) {}
    try {
      const res = await fetch(`../${relativePath}`);
      if (res.ok) return await res.json();
    } catch (e) {}
    throw new Error(`Could not load ${relativePath}`);
  }

  // 1. Load Local Datasets (Works in extension AND direct GitHub Pages / file://)
  try {
    const dirData = await fetchDataset('data/tgsc_directory.json');
    directoryItems = dirData.items || [];

    const stData = await fetchDataset('data/student_tiers.json');
    studentMaterials = stData.materials || [];

    // Set Counts
    if (countAll) countAll.innerText = directoryItems.length;
    if (countRm) countRm.innerText = directoryItems.filter(m => m.type === 'raw_material').length;
    if (countNat) countNat.innerText = directoryItems.filter(m => m.type === 'natural').length;
    if (countFr) countFr.innerText = directoryItems.filter(m => m.type === 'fragrance').length;
    if (countFl) countFl.innerText = directoryItems.filter(m => m.type === 'flavor').length;
    if (countDemo) countDemo.innerText = directoryItems.filter(m => m.type === 'demo_formula' || m.type === 'perfume_base').length;

    // Load saved tier preference
    let savedTier = localStorage.getItem('tgsc_selected_tier');
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const stored = await chrome.storage.local.get('userSelectedTier');
        if (stored && stored.userSelectedTier) savedTier = stored.userSelectedTier;
      } catch (e) {}
    }
    if (savedTier) {
      currentTier = savedTier;
      tierChips.forEach(c => c.classList.toggle('active', c.dataset.tier === currentTier));
    }

    renderSidebarList();

    // Check URL query parameters (e.g. ?id=rw1000531)
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('id');
    if (paramId) {
      const match = directoryItems.find(x => x.id.toLowerCase() === paramId.toLowerCase());
      if (match) {
        selectItem(match);
      } else {
        crawlTGSC(paramId);
      }
    } else {
      checkActiveTGSCTab();
    }
  } catch (err) {
    sidebarList.innerHTML = `<div style="padding: 16px; color: #f87171;">Failed to load directory: ${err.message}</div>`;
  }

  // Real-time listener for TGSC tab changes
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'tgsc_tab_changed' && msg.pageId) {
        activeTGSCtabId = msg.tabId;
        const found = directoryItems.find(x => x.id.toLowerCase() === msg.pageId.toLowerCase());
        const displayTitle = found ? found.name : msg.pageId;
        syncText.innerHTML = `Connected to TGSC: <strong>${displayTitle}</strong> (<code>${msg.pageId}</code>)`;
        btnOpenTGSC.classList.remove('hidden');
        btnOpenTGSC.onclick = () => {
          chrome.runtime.sendMessage({ action: 'navigate_tgsc_tab', url: msg.url, tabId: activeTGSCtabId });
        };
        if (found) {
          selectItem(found);
        } else {
          crawlTGSC(msg.url);
        }
      }
    });
  }

  // 2. Check Active TGSC Tab for Live Sync
  function checkActiveTGSCTab() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: 'get_active_tgsc_tab' }, (res) => {
          if (chrome.runtime.lastError) {
            fallbackLocalMode();
            return;
          }
          if (res && res.isTGSC && res.pageId) {
            activeTGSCtabId = res.tabId;
            const found = directoryItems.find(x => x.id.toLowerCase() === res.pageId.toLowerCase());
            const displayTitle = found ? found.name : res.pageId;
            
            syncText.innerHTML = `Connected to TGSC: <strong>${displayTitle}</strong> (<code>${res.pageId}</code>)`;
            btnOpenTGSC.classList.remove('hidden');
            btnOpenTGSC.onclick = () => {
              chrome.runtime.sendMessage({ action: 'navigate_tgsc_tab', url: res.url, tabId: activeTGSCtabId });
            };

            if (found) {
              selectItem(found);
            } else {
              crawlTGSC(res.url);
            }
          } else {
            fallbackLocalMode();
          }
        });
      } catch (e) {
        fallbackLocalMode();
      }
    } else {
      fallbackLocalMode();
    }
  }

  function fallbackLocalMode() {
    syncText.innerText = 'Autonomous Studio Mode (Offline & Live Ready)';
    btnOpenTGSC.classList.add('hidden');
    if (!activeItem && directoryItems.length > 0) {
      selectItem(directoryItems[0]);
    }
  }

  // 3. Live Headless Crawler
  async function crawlTGSC(targetUrlOrId) {
    if (!targetUrlOrId || !targetUrlOrId.trim()) return;
    const q = targetUrlOrId.trim();

    syncText.innerHTML = `Searching / Crawling for <strong>${q}</strong>...`;

    // A. Check if already in local directory (Instant 0ms lookup)
    const cleanQ = q.toLowerCase().replace(/https?:\/\/.*?\/data\//i, '').replace('.html', '').trim();
    const localMatch = directoryItems.find(x => 
      x.id.toLowerCase() === cleanQ ||
      x.name.toLowerCase() === q.toLowerCase() ||
      (x.cas && x.cas === q) ||
      x.name.toLowerCase().includes(q.toLowerCase())
    );

    if (localMatch) {
      syncText.innerHTML = `Found: <strong>${localMatch.name}</strong> (<code>${localMatch.id}</code>)`;
      selectItem(localMatch);
      renderSidebarList();
      return;
    }
    
    // B. If not in local directory, send to background service worker crawler
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'crawl_tgsc', target: q }, (res) => {
        if (res && res.success && res.data) {
          const crawled = res.data;
          const stMatch = studentMaterials.find(m => (crawled.cas && m.cas === crawled.cas) || m.name.toLowerCase() === crawled.name.toLowerCase());
          if (stMatch) {
            crawled.level = stMatch.level;
            crawled.sku = stMatch.sku;
            crawled.level_label = stMatch.level_label;
          }

          const existingIdx = directoryItems.findIndex(x => x.id.toLowerCase() === crawled.id.toLowerCase());
          if (existingIdx >= 0) {
            directoryItems[existingIdx] = { ...directoryItems[existingIdx], ...crawled };
          } else {
            directoryItems.unshift(crawled);
          }

          syncText.innerHTML = `Live Crawled: <strong>${crawled.name}</strong> (<code>${crawled.id}</code>)`;
          selectItem(crawled);
          renderSidebarList();
        } else {
          syncText.innerText = `Could not crawl "${q}". Searching offline database...`;
          searchQuery = q;
          if (libSearch) libSearch.value = q;
          renderSidebarList();
        }
      });
    } else {
      // Direct offline search in local mode
      searchQuery = q;
      if (libSearch) libSearch.value = q;
      renderSidebarList();
      syncText.innerText = `Filtered database for "${q}"`;
    }
  }

  if (btnCrawl) {
    btnCrawl.addEventListener('click', () => crawlTGSC(crawlInput.value));
  }
  if (crawlInput) {
    crawlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') crawlTGSC(crawlInput.value);
    });
  }

  // 4. Render Left Sidebar List
  function renderSidebarList() {
    const q = searchQuery.toLowerCase().trim();

    const filtered = directoryItems.filter(item => {
      if (currentCategory !== 'all') {
        if (currentCategory === 'demo_formula') {
          if (item.type !== 'demo_formula' && item.type !== 'perfume_base') return false;
        } else if (item.type !== currentCategory) {
          return false;
        }
      }

      if (currentTier !== 'all' && item.level !== parseInt(currentTier, 10)) return false;
      if (currentVolatility !== 'all' && item.volatility !== currentVolatility) return false;

      if (q) {
        const inId = (item.id || '').toLowerCase().includes(q);
        const inName = (item.name || '').toLowerCase().includes(q);
        const inChem = (item.chemical_name || '').toLowerCase().includes(q);
        const inCas = (item.cas || '').toLowerCase().includes(q);
        const inFamily = (item.family || '').toLowerCase().includes(q);
        const inSyn = (item.synonyms || []).some(s => s.toLowerCase().includes(q));
        const inFacets = (item.facets || []).some(f => f.toLowerCase().includes(q));
        if (!inId && !inName && !inChem && !inCas && !inFamily && !inSyn && !inFacets) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      sidebarList.innerHTML = `<div style="padding: 24px; text-align: center; color: #64748b;">No items match filters.</div>`;
      return;
    }

    sidebarList.innerHTML = filtered.slice(0, 120).map(item => {
      const isSelected = activeItem && activeItem.id === item.id;
      let badgeHtml = '';
      if (item.level) {
        badgeHtml = `<span class="tag-l${item.level}">L${item.level}</span>`;
      } else {
        badgeHtml = `<span class="tag-spec">${item.type_label || item.type}</span>`;
      }

      return `
        <div class="side-item-card ${isSelected ? 'active' : ''}" data-id="${item.id}">
          <div class="side-item-top">
            <span class="side-item-name">${item.name}</span>
            ${badgeHtml}
          </div>
          <div class="side-item-meta">
            ${item.cas ? `<span>CAS: ${item.cas}</span> &bull;` : ''}
            <span>${item.volatility || 'Accord'}</span> &bull;
            <span>${item.family}</span>
          </div>
        </div>
      `;
    }).join('');

    sidebarList.querySelectorAll('.side-item-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const item = directoryItems.find(x => x.id === id);
        if (item) selectItem(item);
      });
    });
  }

  // 5. Select & Render Unified 3-Pillar Center Inspector
  function selectItem(item) {
    activeItem = item;
    renderSidebarList(); // Update active highlights
    emptyState.classList.add('hidden');
    inspectorContent.classList.remove('hidden');

    const isDemo = item.type === 'demo_formula' || item.type === 'perfume_base';
    const isPalette = item.type === 'fragrance' || item.type === 'flavor';

    // Extract blenders list
    let blendersList = item.blenders || [];
    if (blendersList.length === 0 && item.pairings) {
      const pArr = (item.pairings['1'] || []).concat(item.pairings['2'] || []);
      blendersList = pArr.map(p => ({
        id: p.id || '',
        name: p.name,
        level: p.level || 1,
        url: '#'
      }));
    }

    // Extract uses
    const linkedUses = item.linked_uses || (item.commercial_accords || []).map(a => ({ id: '', name: a, type: 'fragrance' }));
    const unlinkedUses = item.unlinked_uses || [];

    // Extract organoleptic descriptions
    const descriptions = item.odor_descriptions || (item.description ? [item.description] : []);

    let formulaScalerHtml = '';
    if (isDemo && item.ingredients && item.ingredients.length > 0 && window.TGSCFormulaScaler) {
      const targetGrams = 10.0;
      const totalParts = item.ingredients.reduce((s, i) => s + (i.parts || 25), 0);
      const enriched = window.TGSCFormulaScaler.enrichIngredients(item.ingredients, studentMaterials, '1');
      const calculated = window.TGSCFormulaScaler.calculateBatch(enriched, totalParts, targetGrams, 'original', '1');

      formulaScalerHtml = `
        <div class="pillar-card">
          <div class="pillar-header">
            <span class="pillar-title">Interactive Batch Formula Scaler</span>
            <div style="display: flex; gap: 8px;">
              <button id="s-btn-csv" class="btn-hero-act" style="background: #2563eb; color: #fff;">Download CSV</button>
              <button id="s-btn-md" class="btn-hero-act">Copy Markdown</button>
            </div>
          </div>
          <div class="scaler-bar">
            <div class="scaler-input-box">
              <label style="font-size: 11px; font-weight: 600; color: #94a3b8;">Batch Weight:</label>
              <input type="number" id="s-batch-input" value="10" min="0.1" step="0.5" />
              <span style="font-size: 11px; color: #94a3b8;">g</span>
            </div>
            <div style="font-size: 11px; color: #34d399; font-weight: 600;">
              L1 Organ Coverage: ${calculated.coveragePercent}% (${calculated.availableCount} of ${item.ingredients.length} available)
            </div>
          </div>
          <table class="scaler-table">
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
              ${calculated.rows.map(r => `
                <tr style="background: ${r.isAvailable ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)'};">
                  <td>
                    <span class="btn-drill-mat" data-name="${r.name}" style="color: #38bdf8; font-weight: 600; cursor: pointer;">${r.name}</span>
                  </td>
                  <td><span class="tag-${r.levelTag}">${r.levelLabel}</span></td>
                  <td style="text-align: right; font-family: monospace;">${r.parts}</td>
                  <td style="text-align: right; color: #a78bfa;">${r.percentage}%</td>
                  <td style="text-align: right; font-weight: 700; color: ${r.isAvailable ? '#34d399' : '#f87171'}; font-family: monospace;">${r.weightGrams}g</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    inspectorContent.innerHTML = `
      <!-- Hero Header -->
      <div class="studio-hero">
        <div class="hero-top-row">
          <div class="hero-title-area">
            <h2>${item.name}</h2>
            ${item.chemical_name && item.chemical_name.toLowerCase() !== item.name.toLowerCase() ? `<div class="hero-sub-chem">Chemical / Systematic Name: ${item.chemical_name}</div>` : ''}
          </div>
          <div class="hero-actions">
            ${item.cas ? `<button id="btn-copy-cas" class="btn-hero-act">Copy CAS: ${item.cas}</button>` : ''}
            <button id="btn-nav-tgsc" class="btn-hero-act" style="background: #2563eb; color: #fff;">Navigate TGSC Tab</button>
          </div>
        </div>

        <div class="hero-meta-pills">
          ${item.id ? `<span class="hero-chip">TGSC ID: <code>${item.id}</code></span>` : ''}
          ${item.sku ? `<span class="hero-chip" style="color: #60a5fa;">PW Code: <strong>${item.sku}</strong></span>` : ''}
          <span class="hero-chip">Note: <strong>${item.volatility || 'Accord'}</strong></span>
          ${item.substantivity_hours ? `<span class="hero-chip">Substantivity: <strong>${item.substantivity_hours} hrs on blotter</strong></span>` : ''}
          <span class="hero-chip">Family: <strong>${item.family}</strong></span>
          ${item.level ? `<span class="tag-l${item.level}">Level ${item.level}: Student Organ</span>` : ''}
        </div>
      </div>

      <!-- Pillar 1: Odor & Organoleptic Profile -->
      <div class="pillar-card">
        <div class="pillar-header">
          <span class="pillar-title">1. Odor & Organoleptic Profile</span>
          <span style="font-size: 11px; color: #94a3b8;">${item.odor_type || item.family} Scent Family</span>
        </div>

        ${item.facets && item.facets.length > 0 ? `
          <div class="facet-chip-grid">
            ${item.facets.map(f => `<span class="facet-chip-lg">${f}</span>`).join('')}
          </div>
        ` : ''}

        ${descriptions.length > 0 ? `
          <div class="pillar-desc-list">
            ${descriptions.map(d => `<div class="pillar-desc-item">${d}</div>`).join('')}
          </div>
        ` : `<div style="font-size: 12px; color: #64748b;">No textual odor description recorded.</div>`}
      </div>

      <!-- Pillar 2: Blenders & Harmonious Pairings -->
      <div class="pillar-card">
        <div class="pillar-header">
          <span class="pillar-title">2. Blenders & Harmonious Pairings (${blendersList.length})</span>
          <span style="font-size: 11px; color: #34d399;">Materials that blend well with ${item.name}</span>
        </div>

        ${blendersList.length > 0 ? `
          <div class="blenders-grid">
            ${blendersList.slice(0, 48).map(b => {
              const matchedDir = directoryItems.find(x => x.id.toLowerCase() === (b.id || '').toLowerCase() || x.name.toLowerCase() === b.name.toLowerCase());
              const levelTag = matchedDir && matchedDir.level ? `tag-l${matchedDir.level}` : 'tag-spec';
              const levelText = matchedDir && matchedDir.level ? `L${matchedDir.level}` : 'Specialty';

              return `
                <div class="blender-card btn-drill-mat" data-name="${b.name}" data-id="${b.id}">
                  <span class="blender-name">${b.name}</span>
                  <span class="${levelTag}">${levelText}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : `<div style="font-size: 12px; color: #64748b;">No specific blenders documented.</div>`}
      </div>

      <!-- Pillar 3: Perfumery Uses (Linked & Unlinked Plain Text) -->
      <div class="pillar-card">
        <div class="pillar-header">
          <span class="pillar-title">3. Perfumery Uses & Applications</span>
          <span style="font-size: 11px; color: #a5b4fc;">Linked Scent Themes & Compounding Notes</span>
        </div>

        ${linkedUses.length > 0 ? `
          <div style="margin-bottom: 8px;">
            <span style="font-size: 11px; font-weight: 700; color: #93c5fd; display: block; margin-bottom: 6px;">Used In Fragrance & Flavor Themes (Click to Explore Palette):</span>
            <div class="uses-pill-grid">
              ${linkedUses.map(u => `
                <span class="use-pill btn-drill-use" data-name="${u.name}" data-id="${u.id}">
                  ${u.name}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${unlinkedUses.length > 0 ? `
          <div class="compounding-box">
            <h4>Compounding & Application Guidance (From TGSC):</h4>
            ${unlinkedUses.map(u => `<div class="compounding-text">&bull; ${u}</div>`).join('')}
          </div>
        ` : ''}

        ${linkedUses.length === 0 && unlinkedUses.length === 0 ? `
          <div style="font-size: 12px; color: #64748b;">No specific application uses documented for this item.</div>
        ` : ''}
      </div>

      <!-- Formula Scaler (if Demo Formula) -->
      ${formulaScalerHtml}
    `;

    // 6. Populate Right Network Panel with Connected Materials
    renderNetworkPanel(item, blendersList, linkedUses);

    // Event Listeners for Dynamic Drilldowns & Actions
    inspectorContent.querySelectorAll('.btn-drill-mat').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const name = (el.dataset.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const target = directoryItems.find(x => (id && x.id.toLowerCase() === id.toLowerCase()) || x.name.toLowerCase().replace(/[^a-z0-9]/g, '') === name);
        if (target) {
          selectItem(target);
        } else if (id) {
          crawlTGSC(id);
        } else {
          crawlTGSC(el.dataset.name);
        }
      });
    });

    inspectorContent.querySelectorAll('.btn-drill-use').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const name = el.dataset.name;
        const target = directoryItems.find(x => (id && x.id.toLowerCase() === id.toLowerCase()) || x.name.toLowerCase() === name.toLowerCase());
        if (target) {
          selectItem(target);
        } else if (id) {
          crawlTGSC(id);
        } else {
          crawlTGSC(name);
        }
      });
    });

    const copyBtn = inspectorContent.querySelector('#btn-copy-cas');
    if (copyBtn && item.cas) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(item.cas);
        copyBtn.innerText = 'CAS Copied';
        setTimeout(() => { copyBtn.innerText = `Copy CAS: ${item.cas}`; }, 1500);
      });
    }

    const navBtn = inspectorContent.querySelector('#btn-nav-tgsc');
    if (navBtn) {
      navBtn.addEventListener('click', () => {
        const targetUrl = item.url && item.url.startsWith('http') ? item.url : `https://www.thegoodscentscompany.com/data/${item.id}.html`;
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'navigate_tgsc_tab', url: targetUrl, tabId: activeTGSCtabId });
        } else {
          window.open(targetUrl, '_blank');
        }
      });
    }
  }

  // 7. Right Network Panel Rendering
  function renderNetworkPanel(item, blenders, uses) {
    if (blenders.length === 0 && uses.length === 0) {
      networkBody.innerHTML = `<p class="network-empty">No external connections discovered for this item.</p>`;
      return;
    }

    networkBody.innerHTML = `
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">Direct Blenders: <strong>${blenders.length}</strong> | Scent Themes: <strong>${uses.length}</strong></div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${uses.slice(0, 6).map(u => `
          <div class="network-item btn-drill-use" data-name="${u.name}" data-id="${u.id}">
            <div class="network-item-title">${u.name}</div>
            <div class="network-item-sub">Fragrance Scent Theme &bull; Click to Crawl</div>
          </div>
        `).join('')}
        ${blenders.slice(0, 8).map(b => `
          <div class="network-item btn-drill-mat" data-name="${b.name}" data-id="${b.id}">
            <div class="network-item-title">${b.name}</div>
            <div class="network-item-sub">Harmonious Blender &bull; Click to Inspect</div>
          </div>
        `).join('')}
      </div>
    `;

    networkBody.querySelectorAll('.btn-drill-mat, .btn-drill-use').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const name = el.dataset.name;
        const target = directoryItems.find(x => (id && x.id.toLowerCase() === id.toLowerCase()) || x.name.toLowerCase() === name.toLowerCase());
        if (target) {
          selectItem(target);
        } else if (id) {
          crawlTGSC(id);
        } else {
          crawlTGSC(name);
        }
      });
    });
  }

  // 8. Event Listeners for Filters & Search
  if (libSearch) {
    libSearch.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderSidebarList();
    });
  }

  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      renderSidebarList();
    });
  });

  tierChips.forEach(chip => {
    chip.addEventListener('click', () => {
      tierChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentTier = chip.dataset.tier;
      localStorage.setItem('tgsc_selected_tier', currentTier);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ userSelectedTier: currentTier });
      }
      renderSidebarList();
    });
  });

  volButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      volButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentVolatility = btn.dataset.vol;
      renderSidebarList();
    });
  });
});
