/**
 * TGSC Formula Scaler Utility
 * Precision batch calculation, student skeleton mode, CSV and Markdown export.
 */

window.TGSCFormulaScaler = {
  enrichIngredients: function (rawIngredients, studentMaterials, activeLevel) {
    if (!rawIngredients) return [];

    return rawIngredients.map(ing => {
      const parts = typeof ing.parts === 'number' ? ing.parts : (parseFloat(ing.parts) || 0);
      const cleanName = (ing.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      let matchedTier = null;
      if (ing.cas) {
        matchedTier = studentMaterials.find(m => m.cas && m.cas.trim() === ing.cas.trim());
      }
      if (!matchedTier && cleanName.length > 2) {
        matchedTier = studentMaterials.find(m => {
          const mName = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          const oName = (m.official_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return mName === cleanName || oName === cleanName || cleanName.includes(mName) || mName.includes(cleanName);
        });
      }

      let isAvailable = false;
      let levelTag = 'unmatched';
      let levelLabel = 'Specialty';

      if (matchedTier) {
        levelTag = `l${matchedTier.level}`;
        levelLabel = `L${matchedTier.level}`;
        if (activeLevel === 'all') {
          isAvailable = true;
        } else {
          const maxLvl = parseInt(activeLevel, 10) || 1;
          isAvailable = matchedTier.level <= maxLvl;
        }
      } else if (activeLevel === 'all') {
        isAvailable = true;
      }

      return {
        name: ing.name || 'Unknown Material',
        cas: ing.cas || (matchedTier ? matchedTier.cas : ''),
        parts: parts,
        isAvailable: isAvailable,
        levelTag: levelTag,
        levelLabel: levelLabel,
        matchedTier: matchedTier
      };
    });
  },

  calculateBatch: function (enrichedList, totalFormulaParts, targetGrams, mode, activeLevel) {
    let effectiveTotal = totalFormulaParts || enrichedList.reduce((s, i) => s + i.parts, 0) || 1000;
    
    if (mode === 'skeleton') {
      const availSum = enrichedList.filter(i => i.isAvailable).reduce((s, i) => s + i.parts, 0);
      if (availSum > 0) effectiveTotal = availSum;
    }

    let availCount = 0;
    let availPartsSum = 0;

    const rows = enrichedList.map(item => {
      let weight = 0;
      let pct = 0;

      if (mode === 'skeleton') {
        if (item.isAvailable) {
          weight = (item.parts / effectiveTotal) * targetGrams;
          pct = (item.parts / effectiveTotal) * 100;
          availCount++;
          availPartsSum += item.parts;
        }
      } else {
        weight = (item.parts / effectiveTotal) * targetGrams;
        pct = (item.parts / effectiveTotal) * 100;
        if (item.isAvailable) {
          availCount++;
          availPartsSum += item.parts;
        }
      }

      return {
        ...item,
        weightGrams: weight > 0 ? (weight < 0.001 ? weight.toFixed(4) : weight.toFixed(3)) : '0.000',
        percentage: pct.toFixed(2)
      };
    });

    const formulaTotalParts = enrichedList.reduce((s, i) => s + i.parts, 0) || 1;
    const coveragePercent = ((availPartsSum / formulaTotalParts) * 100).toFixed(1);

    return {
      rows: rows,
      totalGrams: targetGrams,
      availableCount: availCount,
      coveragePercent: coveragePercent
    };
  },

  generateMarkdown: function (title, calculated, targetGrams, mode) {
    let md = `### Formula: ${title}\n\n`;
    md += `**Batch Size:** ${targetGrams}g | **Mode:** ${mode === 'skeleton' ? 'Student Skeleton (100%)' : 'Full Formula'}\n\n`;
    md += `| Ingredient | Tier | Parts | % | Weight (g) |\n`;
    md += `| :--- | :--- | ---: | ---: | ---: |\n`;
    calculated.rows.forEach(r => {
      const statusIcon = r.isAvailable ? '[OK]' : '[MISSING]';
      md += `| ${statusIcon} ${r.name} | ${r.levelLabel} | ${r.parts} | ${r.percentage}% | ${r.weightGrams}g |\n`;
    });
    return md;
  },

  downloadCSV: function (title, calculated, targetGrams, mode) {
    let csv = `Ingredient,CAS,Tier,Available,Parts,Percentage,Weight_Grams\n`;
    calculated.rows.forEach(r => {
      const cleanN = `"${(r.name || '').replace(/"/g, '""')}"`;
      csv += `${cleanN},${r.cas || ''},${r.levelLabel},${r.isAvailable ? 'YES' : 'NO'},${r.parts},${r.percentage},${r.weightGrams}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${targetGrams}g_${mode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};
