/**
 * TGSC Reader - DOM Parser Module
 * Robust extractors for raw material pages and demo formulas on thegoodscentscompany.com
 */

const TGSCParser = {
  /**
   * Determine page type: 'material', 'demo_formula', or 'other'
   */
  detectPageType() {
    const path = window.location.pathname.toLowerCase();

    // 1. Strict Material / Natural / Fragrance / Flavor detail pages
    if (path.match(/\/data\/(rw|ra|ab|es|fr|fl|pb)[0-9]+/i) || 
        path.includes('/data/rw') || path.includes('/data/ab') || 
        path.includes('/data/es') || path.includes('/data/fr') || 
        path.includes('/data/fl') || path.includes('/data/pb')) {
      return 'material';
    }

    // 2. Strict Demo Formula detail pages
    if (path.match(/\/demos\/(dm|df)[0-9]+/i) || 
        path.includes('/demos/dm') || path.includes('/demos/df')) {
      return 'demo_formula';
    }

    // 3. Directory listing, index, sponsors, or general navigation pages
    return 'other';
  },

  /**
   * Parse a raw material page
   */
  parseMaterialPage() {
    const rawText = document.body.innerText;
    
    // Extract Title / Name
    let title = '';
    const h1 = document.querySelector('h1, h2.radH, .header, th.nwtop');
    if (h1 && h1.innerText.trim()) {
      title = h1.innerText.trim().replace(/\s+/g, ' ');
    } else {
      title = document.title.split('|')[0].split('-')[0].trim();
    }

    // Extract CAS number
    let cas = '';
    const casMatch = rawText.match(/CAS\s*(?:Number|#|Index)?\s*[:\s]+([0-9]{2,7}-[0-9]{2}-[0-9])/i) ||
                     rawText.match(/\b([0-9]{2,7}-[0-9]{2}-[0-9])\b/);
    if (casMatch) cas = casMatch[1].trim();

    // Extract FEMA, EC/EINECS, MW
    let fema = '';
    const femaMatch = rawText.match(/FEMA\s*(?:No|Number)?\s*[:\s]+([0-9]{3,5})/i);
    if (femaMatch) fema = femaMatch[1].trim();

    let ec = '';
    const ecMatch = rawText.match(/EINECS\s*[:\s]+([0-9]{3}-[0-9]{3}-[0-9])/i) || rawText.match(/EC\s*[:\s]+([0-9]{3}-[0-9]{3}-[0-9])/i);
    if (ecMatch) ec = ecMatch[1].trim();

    let mw = '';
    const mwMatch = rawText.match(/Molecular\s*Weight\s*[:\s]+([0-9]+(?:\.[0-9]+)?)/i);
    if (mwMatch) mw = mwMatch[1].trim();

    // Extract Substantivity (hours on blotter)
    let substantivityHours = null;
    let substantivityText = '';
    const subMatch = rawText.match(/Substantivity\s*[:\s]+([0-9,]+(?:\.[0-9]+)?)\s*hour/i) ||
                     rawText.match(/([0-9,]+(?:\.[0-9]+)?)\s*hour\(s\)\s*on\s*blotter/i) ||
                     rawText.match(/tenacity\s*[:\s]+([0-9,]+(?:\.[0-9]+)?)\s*hrs/i);
    
    if (subMatch) {
      substantivityHours = parseFloat(subMatch[1].replace(/,/g, ''));
      substantivityText = `${substantivityHours} hour(s) on blotter`;
    }

    // Determine Volatility Note
    let volatility = 'Heart Note';
    let volatilityClass = 'heart';
    if (substantivityHours !== null) {
      if (substantivityHours <= 12) {
        volatility = 'Top Note';
        volatilityClass = 'top';
      } else if (substantivityHours <= 120) {
        volatility = 'Heart Note';
        volatilityClass = 'heart';
      } else {
        volatility = 'Base Note';
        volatilityClass = 'base';
      }
    } else {
      // Fallback heuristics
      if (rawText.toLowerCase().includes('top note')) {
        volatility = 'Top Note';
        volatilityClass = 'top';
      } else if (rawText.toLowerCase().includes('base note') || rawText.toLowerCase().includes('fixative')) {
        volatility = 'Base Note';
        volatilityClass = 'base';
      }
    }

    // Extract Odor Descriptions & Facets
    const odorDescriptions = [];
    const facetSet = new Set();
    const rows = Array.from(document.querySelectorAll('tr, p, div'));
    
    const facetKeywords = [
      'floral', 'rose', 'jasmine', 'violet', 'muguet', 'lilac', 'orris', 'orange blossom',
      'woody', 'cedar', 'sandalwood', 'vetiver', 'patchouli', 'pine', 'amber', 'ambergris',
      'citrus', 'lemon', 'bergamot', 'grapefruit', 'mandarin', 'orange', 'lime',
      'fruity', 'apple', 'peach', 'berry', 'pineapple', 'strawberry', 'tropical',
      'green', 'leafy', 'galbanum', 'grassy', 'herbal', 'aromatic', 'minty', 'cooling',
      'spicy', 'cinnamon', 'clove', 'peppery', 'nutmeg', 'cardamom',
      'musk', 'musky', 'clean', 'powdery', 'soapy', 'aldehydic',
      'gourmet', 'sweet', 'vanilla', 'caramel', 'chocolate', 'nutty', 'coconut', 'buttery',
      'marine', 'ozonic', 'aquatic', 'fresh', 'watery', 'metallic', 'earthy', 'mossy', 'leather', 'smoky'
    ];

    rows.forEach(el => {
      const text = el.innerText.trim();
      if ((text.startsWith('Odor Description:') || text.startsWith('Odor:') || text.includes('Odor Type:')) && text.length > 15 && text.length < 500) {
        const cleaned = text.replace(/^Odor\s*(?:Description|Type)?\s*:\s*/i, '').trim();
        if (cleaned && !odorDescriptions.includes(cleaned)) {
          odorDescriptions.push(cleaned);
        }
      }
    });

    if (odorDescriptions.length === 0) {
      // General paragraph search
      const odorBlock = rawText.match(/Odor\s*(?:Description|Type)?\s*:\s*([^\n\r]+)/gi);
      if (odorBlock) {
        odorBlock.forEach(b => {
          const c = b.replace(/^Odor\s*(?:Description|Type)?\s*:\s*/i, '').trim();
          if (c.length > 5 && !odorDescriptions.includes(c)) odorDescriptions.push(c);
        });
      }
    }

    // Populate facet set from descriptions and text
    const fullDescText = (odorDescriptions.join(' ') + ' ' + rawText.slice(0, 4000)).toLowerCase();
    facetKeywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(fullDescText)) {
        facetSet.add(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    });

    // Extract IFRA / Safety recommendations if present
    let safetyNotes = [];
    if (rawText.includes('IFRA') || rawText.includes('Safety in use') || rawText.includes('dermal')) {
      const ifraMatches = rawText.match(/(?:IFRA|dermal|recommendation)[^\n\r.]{10,180}\./gi);
      if (ifraMatches) {
        safetyNotes = ifraMatches.slice(0, 3).map(s => s.trim());
      }
    }

    return {
      title,
      cas,
      fema,
      ec,
      mw,
      substantivityHours,
      substantivityText,
      volatility,
      volatilityClass,
      odorDescriptions,
      facets: Array.from(facetSet).slice(0, 10),
      safetyNotes
    };
  },

  /**
   * Parse a Demo Formula page
   */
  parseDemoFormulaPage() {
    const rawText = document.body.innerText;
    
    // Formula Title
    let formulaName = 'Demo Fragrance Formula';
    const h1 = document.querySelector('h1, h2, th[colspan], .nwtop');
    if (h1 && h1.innerText.trim()) {
      formulaName = h1.innerText.trim().replace(/\s+/g, ' ');
    } else {
      formulaName = document.title.split('|')[0].trim();
    }

    // Find table containing ingredients and ppt numbers
    const tables = Array.from(document.querySelectorAll('table'));
    let formulaRows = [];
    
    tables.forEach(table => {
      const rows = Array.from(table.querySelectorAll('tr'));
      const candidateRows = [];

      rows.forEach(tr => {
        const cells = Array.from(tr.querySelectorAll('td, th')).map(c => ({
          text: c.innerText.trim(),
          link: c.querySelector('a')?.href || null
        }));

        if (cells.length >= 2) {
          // Look for ingredient name and numeric parts
          let name = '';
          let parts = null;
          let link = null;

          cells.forEach((cell, idx) => {
            const cleanNum = cell.text.replace(/,/g, '').trim();
            if (/^[0-9]+(?:\.[0-9]+)?$/.test(cleanNum) && parts === null) {
              parts = parseFloat(cleanNum);
            } else if (cell.text.length > 2 && !name && !cleanNum.match(/^[0-9]+$/)) {
              // Exclude header strings
              if (!['parts', 'percent', 'total', 'compound', 'material', 'ingredient', 'ppt'].includes(cell.text.toLowerCase())) {
                name = cell.text;
                link = cell.link;
              }
            }
          });

          if (name && parts !== null && !name.toLowerCase().includes('total')) {
            candidateRows.push({ name, parts, link });
          }
        }
      });

      if (candidateRows.length > formulaRows.length && candidateRows.length >= 3) {
        formulaRows = candidateRows;
      }
    });

    // Calculate total parts
    const totalParts = formulaRows.reduce((sum, item) => sum + item.parts, 0);

    return {
      formulaName,
      totalParts: totalParts > 0 ? totalParts : 1000,
      ingredients: formulaRows
    };
  }
};

window.TGSCParser = TGSCParser;
