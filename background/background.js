/**
 * TGSC Perfumery Companion - Background Service Worker
 * Manages live TGSC tab synchronization, Chrome Side Panel, background crawling, and studio messaging.
 */

import { fetchAndParseTGSC } from './crawler.js';

// Enable side panel to open on action click if desired or keep popup
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// Track and broadcast active TGSC tab changes in real-time
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    broadcastIfTGSC(tab);
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab && tab.url) {
    broadcastIfTGSC(tab);
  }
});

function broadcastIfTGSC(tab) {
  if (!tab || !tab.url) return;
  const idMatch = tab.url.match(/\/(data|demos)\/([a-z]{2}[0-9]+)\.html/i);
  if (idMatch) {
    chrome.runtime.sendMessage({
      action: 'tgsc_tab_changed',
      tabId: tab.id,
      url: tab.url,
      pageId: idMatch[2].toLowerCase(),
      section: idMatch[1].toLowerCase()
    }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Live Crawl TGSC URL or ID
  if (request.action === 'crawl_tgsc') {
    fetchAndParseTGSC(request.target)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 2. Query Current Active TGSC Tab
  if (request.action === 'get_active_tgsc_tab') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        const url = tabs[0].url;
        const idMatch = url.match(/\/(data|demos)\/([a-z]{2}[0-9]+)\.html/i);
        if (idMatch) {
          sendResponse({
            isTGSC: true,
            tabId: tabs[0].id,
            url: url,
            pageId: idMatch[2].toLowerCase(),
            section: idMatch[1].toLowerCase()
          });
          return;
        }
      }
      sendResponse({ isTGSC: false });
    });
    return true;
  }

  // 3. Open Chrome Side Panel
  if (request.action === 'open_side_panel') {
    chrome.windows.getCurrent((currentWin) => {
      if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: currentWin.id })
          .then(() => sendResponse({ success: true }))
          .catch(err => sendResponse({ success: false, error: err.message }));
      } else {
        // Fallback to opening studio tab
        chrome.tabs.create({ url: chrome.runtime.getURL('app/studio.html') });
        sendResponse({ success: true });
      }
    });
    return true;
  }

  // 4. Navigate Live TGSC Tab
  if (request.action === 'navigate_tgsc_tab') {
    const targetUrl = request.url;
    if (request.tabId) {
      chrome.tabs.update(request.tabId, { url: targetUrl, active: true }, (tab) => {
        sendResponse({ success: true, tab });
      });
    } else {
      chrome.tabs.query({ url: "*://*.thegoodscentscompany.com/*" }, (tabs) => {
        if (tabs && tabs.length > 0) {
          chrome.tabs.update(tabs[0].id, { url: targetUrl, active: true }, (tab) => {
            sendResponse({ success: true, tab });
          });
        } else {
          chrome.tabs.create({ url: targetUrl }, (tab) => {
            sendResponse({ success: true, tab });
          });
        }
      });
    }
    return true;
  }

  // 5. Open Standalone Studio in New Tab
  if (request.action === 'open_studio') {
    const targetUrl = request.id ? chrome.runtime.getURL(`app/studio.html?id=${request.id}`) : chrome.runtime.getURL('app/studio.html');
    chrome.tabs.create({ url: targetUrl }, (tab) => {
      sendResponse({ success: true, tab });
    });
    return true;
  }
});
