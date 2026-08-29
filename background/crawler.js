/**
 * TGSC Crawler & HTML Parser Module
 * Live headless extraction of TGSC's 3-Pillar structure:
 * 1. Odor & Organoleptic Profile
 * 2. Blenders & Pairings
 * 3. Uses (Linked Fragrance Palettes + Unlinked Plain Text Compounding Notes)
 */

const COMMON_FACETS = [
  'floral', 'woody', 'citrus', 'amber', 'musk', 'fruity', 'green', 'spicy', 'herbal',
  'sweet', 'balsamic', 'powdery', 'fresh', 'rose', 'jasmine', 'violet', 'leather',
  'earthy', 'mossy', 'animalic', 'aldehydic', 'marine', 'ozonic', 'creamy', 'vanilla',
  'honey', 'caramel', 'clean', 'soapy', 'aromatic', 'tea', 'tobacco', 'smoke', 'metallic'
];

export async function fetchAndParseTGSC(targetUrlOrId) {
  let url = targetUrlOrId;
  if (!url.startsWith('http')) {
    const cleanId = targetUrlOrId.toLowerCase().trim();
    if (cleanId.startsWith('dm') || cleanId.startsWith('df')) {
      url = `https://www.thegoodscentscompany.com/demos/${cleanId}.html`;
    } else {
      url = `https://www.thegoodscentscompany.com/data/${cleanId}.html`;
    }
  }

  // Check cache first
  const cacheKey = `tgsc_crawl_${url}`;
  try {
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached && cached[cacheKey] && (Date.now() - cached[cacheKey].timestamp < 86400000)) {
      return cached[cacheKey].data;
    }
  } catch (e) {
    // Continue if storage fails
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch TGSC page (${res.status} ${res.statusText})`);
  }

  const html = await res.text();
  const idMatch = url.match(/\/(data|demos)\/([a-z]{2}[0-9]+)\.html/i);
  const pageId = idMatch ? idMatch[2].toLowerCase() : 'unknown';
  const pageSection = idMatch ? idMatch[1].toLowerCase() : 'data';

  const parsed = parseTGSChtml(html, url, pageId, pageSection);

  // Cache in storage
  try {
    const toStore = {};
    toStore[cacheKey] = {
      timestamp: Date.now(),
      data: parsed
    };
    await chrome.storage.local.set(toStore);
  } catch (e) {
    // Ignore cache error
  }

  return parsed;
}

export function parseTGSChtml(html, url, pageId, pageSection) {
  // Use regex / text extraction suitable for Service Worker environments
  const cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 1. Title & Main Header
  let title = '';
  const titleMatch = cleanHtml.match(/<title[^>]*>(.*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/The Good Scents Company/gi, '').replace(/[-|:]/g, ' ').trim();
  }

  const h1Match = cleanHtml.match(/<h1[^>]*>(.*?)<\/h1>/i) || cleanHtml.match(/<td[^>]*class=["']?header["']?[^>]*>(.*?)<\/td>/i);
  if (h1Match) {
    const rawH1 = h1Match[1].replace(/<[^>]+>/g, '').trim();
    if (rawH1.length > 2) title = rawH1;
  }

  // 2. Chemical Identifiers (CAS, FEMA, EC, MW)
  let cas = '';
  const casMatch = cleanHtml.match(/CAS\s*(?:Number|#)?\s*:?\s*<\/td>\s*<td[^>]*>([0-9]+-[0-9]+-[0-9]+)/i) ||
                   cleanHtml.match(/([0-9]{2,7}-[0-9]{2}-[0-9])/);
  if (casMatch) cas = casMatch[1].trim();

  let fema = '';
  const femaMatch = cleanHtml.match(/FEMA\s*(?:Number|#)?\s*:?\s*<\/td>\s*<td[^>]*>([0-9]+)/i) ||
                    cleanHtml.match(/FEMA\s*(?:Number|#)?\s*:\s*([0-9]+)/i);
  if (femaMatch) fema = femaMatch[1].trim();

  let ec = '';
  const ecMatch = cleanHtml.match(/EINECS\s*(?:Number|#)?\s*:?\s*<\/td>\s*<td[^>]*>([0-9]+-[0-9]+-[0-9]+)/i);
  if (ecMatch) ec = ecMatch[1].trim();

  let mw = '';
  const mwMatch = cleanHtml.match(/Molecular\s*Weight\s*:?\s*<\/td>\s*<td[^>]*>([0-9\.]+)/i);
  if (mwMatch) mw = mwMatch[1].trim();

  // 3. Pillar 1: Organoleptic Odor Properties & Substantivity
  let odorType = 'General';
  const odorTypeMatch = cleanHtml.match(/Odor\s*Type\s*:?\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i) ||
                        cleanHtml.match(/Odor\s*Type\s*:\s*([a-zA-Z\s]+)/i);
  if (odorTypeMatch) {
    odorType = odorTypeMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  let substantivityHours = null;
  let substantivityText = '';
  const subMatch = cleanHtml.match(/Substantivity\s*:?\s*<\/td>\s*<td[^>]*>(.*?)<\/td>/i) ||
                   cleanHtml.match(/([0-9]+)\s*hour\(?s?\)?\s*at\s*100\s*%/i) ||
                   cleanHtml.match(/([0-9]+)\s*hours?\s*on\s*blotter/i);
  if (subMatch) {
    const rawSub = subMatch[1].replace(/<[^>]+>/g, '').trim();
    substantivityText = rawSub;
    const numMatch = rawSub.match(/([0-9]+)\s*hour/i);
    if (numMatch) {
      substantivityHours = parseInt(numMatch[1], 10);
    }
  }

  let volatility = 'Accord / Base';
  if (substantivityHours !== null) {
    if (substantivityHours <= 12) volatility = 'Top Note';
    else if (substantivityHours <= 120) volatility = 'Heart Note';
    else volatility = 'Base Note';
  } else if (cleanHtml.includes('Top note') || cleanHtml.includes('top note')) {
    volatility = 'Top Note';
  } else if (cleanHtml.includes('Heart note') || cleanHtml.includes('middle note')) {
    volatility = 'Heart Note';
  } else if (cleanHtml.includes('Base note') || cleanHtml.includes('bottom note')) {
    volatility = 'Base Note';
  }

  // Full Organoleptic Odor Descriptions
  const odorDescriptions = [];
  const odorSectionMatch = cleanHtml.match(/Organoleptic\s*Properties\s*:?[\s\S]*?(?:<table[\s\S]*?<\/table>|(?=<h[1-6]|<table|\bSafety\b|\bBlenders\b))/i);
  if (odorSectionMatch) {
    const descMatches = odorSectionMatch[0].match(/Odor\s*Description\s*:?\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi) ||
                        odorSectionMatch[0].match(/Odor\s*Description\s*:?\s*([\s\S]*?)(?:<br|<\/p|<\/div)/gi);
    if (descMatches) {
      descMatches.forEach(m => {
        const cleanDesc = m.replace(/Odor\s*Description\s*:?/i, '').replace(/<[^>]+>/g, '').trim();
        if (cleanDesc && cleanDesc.length > 5 && !odorDescriptions.includes(cleanDesc)) {
          odorDescriptions.push(cleanDesc);
        }
      });
    }
  }

  // Extracted Facets
  const combinedOdorText = (odorType + ' ' + odorDescriptions.join(' ')).toLowerCase();
  const facets = COMMON_FACETS.filter(f => combinedOdorText.includes(f));

  // 4. Pillar 2: Blenders List
  const blenders = [];
  const blendersSectionMatch = cleanHtml.match(/Blenders\s*and\s*Pairings[\s\S]*?(?=<h[1-6]|\bUses\b|\bSafety\b|$)/i) ||
                               cleanHtml.match(/Blenders[\s\S]*?(?=<h[1-6]|\bUses\b|\bSafety\b|$)/i);
  if (blendersSectionMatch) {
    const linkMatches = blendersSectionMatch[0].match(/<a\s+[^>]*href=["'](?:\/data\/|\/demos\/)?([a-z]{2}[0-9]+)\.html["'][^>]*>(.*?)<\/a>/gi);
    if (linkMatches) {
      linkMatches.forEach(m => {
        const idM = m.match(/([a-z]{2}[0-9]+)\.html/i);
        const nameM = m.replace(/<[^>]+>/g, '').trim();
        if (idM && nameM && idM[1].toLowerCase() !== pageId.toLowerCase()) {
          const bId = idM[1].toLowerCase();
          if (!blenders.some(b => b.id === bId)) {
            blenders.push({
              id: bId,
              name: nameM,
              url: `https://www.thegoodscentscompany.com/data/${bId}.html`
            });
          }
        }
      });
    }
  }

  // 5. Pillar 3: Uses (Linked Fragrance/Flavor Themes + Unlinked Plain Text Compounding Notes)
  const linkedUses = [];
  const unlinkedUses = [];

  const usesSectionMatch = cleanHtml.match(/Perfumery\s*Uses[\s\S]*?(?=<h[1-6]|\bSafety\b|\bSuppliers\b|$)/i) ||
                           cleanHtml.match(/Uses\s*:?[\s\S]*?(?=<h[1-6]|\bSafety\b|\bSuppliers\b|$)/i);

  if (usesSectionMatch) {
    const rawUsesBlock = usesSectionMatch[0];

    // Linked Fragrance / Flavor Uses (e.g. <a href="fr1109513.html">rose fragrance</a>)
    const linkedMatches = rawUsesBlock.match(/<a\s+[^>]*href=["'](?:\/data\/|\/demos\/)?([a-z]{2}[0-9]+)\.html["'][^>]*>(.*?)<\/a>/gi);
    if (linkedMatches) {
      linkedMatches.forEach(m => {
        const idM = m.match(/([a-z]{2}[0-9]+)\.html/i);
        const nameM = m.replace(/<[^>]+>/g, '').trim();
        if (idM && nameM && idM[1].toLowerCase() !== pageId.toLowerCase()) {
          const uId = idM[1].toLowerCase();
          if (!linkedUses.some(u => u.id === uId)) {
            linkedUses.push({
              id: uId,
              name: nameM,
              type: uId.startsWith('fr') ? 'fragrance' : (uId.startsWith('fl') ? 'flavor' : 'material'),
              url: `https://www.thegoodscentscompany.com/data/${uId}.html`
            });
          }
        }
      });
    }

    // Unlinked Plain Text Compounding Notes
    const textLines = rawUsesBlock.split(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/i);
    textLines.forEach(line => {
      const plainText = line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      // Keep meaningful perfumery advice lines that aren't navigation headers or short IDs
      if (plainText.length > 20 &&
          !plainText.toLowerCase().startsWith('perfumery uses') &&
          !plainText.toLowerCase().startsWith('appearance') &&
          !plainText.toLowerCase().startsWith('odor type') &&
          !unlinkedUses.includes(plainText)) {
        unlinkedUses.push(plainText);
      }
    });
  }

  // 6. Demo Formula Ingredients (if on /demos/dm...)
  const formulaIngredients = [];
  if (pageSection === 'demos' || cleanHtml.includes('Demo Formula') || cleanHtml.includes('formula')) {
    const rowMatches = cleanHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi);
    if (rowMatches) {
      rowMatches.forEach(tr => {
        const idM = tr.match(/(?:href=["'](?:\/data\/)?([a-z]{2}[0-9]+)\.html["'])|([a-z]{2}[0-9]{5,7})/i);
        const cells = tr.replace(/<script[\s\S]*?<\/script>/gi, '').split(/<\/td>|<\/th>/i).map(c => c.replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 2) {
          const rawName = cells[0];
          const rawParts = parseFloat(cells[cells.length - 1].replace(/,/g, ''));
          if (rawName && !isNaN(rawParts) && rawParts > 0 && !rawName.toLowerCase().includes('total') && !rawName.toLowerCase().includes('ingredient')) {
            formulaIngredients.push({
              id: idM ? idM[1] || idM[2] : null,
              name: rawName,
              parts: rawParts
            });
          }
        }
      });
    }
  }

  // Determine Entity Type
  let type = 'raw_material';
  let typeLabel = 'Raw Material';
  if (pageId.startsWith('ab') || pageId.startsWith('es') || pageId.startsWith('nat') || title.toLowerCase().includes('oil') || title.toLowerCase().includes('absolute')) {
    type = 'natural';
    typeLabel = 'Natural Extract';
  } else if (pageId.startsWith('fr') || title.toLowerCase().includes('fragrance')) {
    type = 'fragrance';
    typeLabel = 'Fragrance Blending Palette';
  } else if (pageId.startsWith('fl') || title.toLowerCase().includes('flavor')) {
    type = 'flavor';
    typeLabel = 'Flavor Blending Palette';
  } else if (pageId.startsWith('dm') || pageId.startsWith('df') || formulaIngredients.length > 0) {
    type = 'demo_formula';
    typeLabel = 'Demo Formula';
  }

  return {
    id: pageId,
    url: url,
    title: title,
    name: title,
    type: type,
    type_label: typeLabel,
    cas: cas,
    fema: fema,
    ec: ec,
    mw: mw,
    family: odorType.toLowerCase(),
    odor_type: odorType,
    volatility: volatility,
    substantivity_hours: substantivityHours,
    substantivity_text: substantivityText,
    odor_descriptions: odorDescriptions,
    facets: facets,
    blenders: blenders,
    linked_uses: linkedUses,
    unlinked_uses: unlinkedUses,
    ingredients: formulaIngredients,
    total_parts: formulaIngredients.reduce((s, i) => s + i.parts, 0)
  };
}
