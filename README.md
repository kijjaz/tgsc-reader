# 🌸 TGSC Perfumery Studio & Companion

An intelligent student perfumery companion, live crawler, and batch formula scaler for [The Good Scents Company (TGSC)](http://www.thegoodscentscompany.com).

* 🌐 **Live Web App (GitHub Pages)**: [https://kijjaz.github.io/tgsc-reader/](https://kijjaz.github.io/tgsc-reader/)
* 🧩 **Chrome Extension**: Cross-platform Manifest V3 extension with native Chrome Side Panel & live TGSC tab synchronization.

---

## 🌟 Core Features

### 1. 🏛️ Unified 3-Pillar Perfumery Model
Every material or scent palette on TGSC is structured into:
* **Pillar 1: Odor & Organoleptic Profile**: Scent family, substantivity hours on smelling blotters, sensory facet tags (`rose`, `petal`, `honey`, `sweet`), and complete textual odor descriptions.
* **Pillar 2: Blenders & Pairings**: Harmonious companion materials matched against your **Student Organ (`[L1 Core 50]`, `[L2 Inter 150]`, `[L3 Spec 300+]`)** with 1-click organ filtering.
* **Pillar 3: Perfumery Uses**:
  * **Linked Scent Palettes**: Clickable themes (e.g. *Rose Fragrance*, *Chypre*, *Leather*).
  * **Unlinked Compounding Wisdom**: Preserves qualitative perfumer formulation notes from TGSC.

### 2. ◨ Native Chrome Side Panel
* Docks directly to the right of your browser window.
* Stays open continuously as you browse TGSC.
* Auto-syncs in real-time as you click between materials and formulas on `thegoodscentscompany.com`.

### 3. 🎯 In-Page Student Inventory & Trade Name Card
* When browsing any material page (e.g. `rw1020611.html` for patchouli ethanone / Iso E Super), an unobtrusive floating card docks on the right.
* Displays the exact matching material name, vendor/supplier (`PerfumersWorld`, `SimpleScentsDIY`, etc.), organ tier badge (`L1`, `L2`, `L3`), and SKU code from your student organ database.
* **Instant Organ Substitutions (#1)**: If a material is not in your inventory, it automatically calculates top replacements from your organ based on shared sensory facets (+3), family match (+4), and volatility (+2).

### 4. ⚖️ In-Page Live Demo Formula Scaler (#5)
* On any TGSC demo formula page (`/demos/dm...`), an interactive batch control bar injects directly above the formula table.
* **Live Batch Weight Scaling**: Change the target weight (e.g. `10g`) and watch the table update in real time with calculated grams per ingredient.
* **Student Skeleton Mode**: 1-click toggle between Full Formula and a normalized 100% Student Skeleton (scaling only materials you own).
* **Missing Material Detection & Substitutions**: Highlights missing ingredients and offers 1-click substitute suggestions from your organ.
* **Instant Export**: 1-click **Copy Markdown** table or **Export CSV** formatted for lab notebooks and digital scales.

### 5. 🕷️ Headless Live Crawler
* Type or paste any TGSC URL, ID (e.g. `rw1020611`, `fr1109513`), or CAS number in the studio topbar to live-crawl and parse it in the background in milliseconds (no CORS restrictions).

---

## 🚀 Installation

### Option A: Use Web App (No Install)
Open [https://kijjaz.github.io/tgsc-reader/](https://kijjaz.github.io/tgsc-reader/) in any web browser on Mac, Windows, Linux, iPad, or mobile.

### Option B: Install Chrome / Edge Extension
1. Clone this repository or download the ZIP:
   ```bash
   git clone https://github.com/kijjaz/tgsc-reader.git
   ```
2. Open Chrome and navigate to `chrome://extensions`.
3. Toggle **Developer mode** ON (top right).
4. Click **Load unpacked** (top left).
5. Select the `tgsc-reader` folder.
6. Click the extension icon and select **`[ ◨ Side Panel ]`** or browse any TGSC page!

---

## 📂 Project Structure

```
├── manifest.json            # Chrome Manifest V3 declaration
├── index.html               # GitHub Pages entry point (Standalone Studio Web App)
├── app/
│   ├── studio.html          # Full-screen Studio & Side Panel layout
│   ├── studio.css           # Dark slate responsive styling
│   └── studio.js            # Studio controller & tab synchronizer
├── background/
│   ├── background.js        # Service worker for Side Panel & live tab tracking
│   └── crawler.js           # Headless HTML parser & TGSC scraper
├── content/
│   ├── content.js           # Subtle in-page link badges & hover tooltips
│   ├── content.css          # In-page styling
│   └── formula_scaler.js    # Batch calculation & CSV/Markdown export engine
├── popup/
│   ├── popup.html           # Compact toolbar popup
│   ├── popup.css            # Popup styling
│   └── popup.js             # Popup controller with tier memory
├── data/
│   ├── student_tiers.json   # Level 1 (Core 50), Level 2 (150), Level 3 (300+)
│   └── tgsc_directory.json  # 4,352 offline materials, palettes, & formulas
└── icons/                   # Extension icons (16, 48, 128)
```

---

## 📜 License
MIT License. Created for perfumery students and compounding artisans.
