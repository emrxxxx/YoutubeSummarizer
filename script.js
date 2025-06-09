// ==UserScript==
// @name         YouTube Video Özetleyici
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  YouTube videosunu otomatik özetler ve özeti bir panelde gösterir
// @author       emrxxxx
// @match        *://www.youtube.com/watch*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  let apiKey = GM_getValue('mistral_api_key', '');

  GM_registerMenuCommand('🔑 Mistral API Anahtarı Ayarla', () => {
    const key = prompt('Mistral API Anahtarınızı girin:', apiKey)?.trim();
    if (key) {
      GM_setValue('mistral_api_key', key);
      apiKey = key;
      alert('API anahtarı kaydedildi!');
    }
  });

  function createButton() {
    if (document.getElementById('summary-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'summary-btn';
    btn.textContent = '📝';
    btn.title = 'Videoyu Özetle (Ctrl+Shift+S)';
    btn.style.cssText = `
      position: fixed; bottom: 30px; right: 30px; width: 40px; height: 40px;
      border-radius: 50%; border: none; background: #2a2a2a; color: white;
      font-size: 16px; cursor: pointer; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      z-index: 10000; transition: all 0.3s ease; display: flex; align-items: center;
      justify-content: center; opacity: 0.9;
    `;
    btn.addEventListener('mouseover', () => {
      btn.style.background = '#ff3333';
      btn.style.transform = 'scale(1.1) rotate(5deg)';
      btn.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.7)';
      btn.style.opacity = '1';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.background = '#2a2a2a';
      btn.style.transform = 'scale(1) rotate(0deg)';
      btn.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.5)';
      btn.style.opacity = '0.9';
    });
    btn.addEventListener('click', summarize);

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        summarize();
      }
    });

    document.body.appendChild(btn);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      #summary-btn:not(:hover) {
        animation: pulse 2s infinite;
      }
    `;
    document.head.appendChild(style);
  }

  function createSummaryPanel() {
    if (document.getElementById('summary-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'summary-panel';
    const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
    panel.style.cssText = `
      position: fixed; top: 80px; right: 80px; width: 40vh; max-height: 80vh;
      background: ${isLightTheme ? '#ffffff' : '#1f1f1f'};
      color: ${isLightTheme ? '#000000' : '#ffffff'};
      padding: 15px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,${isLightTheme ? 0.2 : 0.5});
      z-index: 10001; overflow-y: auto; font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5;
      animation: slideIn 0.3s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✖';
    closeBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; background: none; border: none; color: inherit; font-size: 16px; cursor: pointer;';
    closeBtn.onclick = () => {
      panel.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => panel.remove(), 300);
    };

    const content = document.createElement('div');
    content.id = 'summary-content';
    content.textContent = 'Özet yükleniyor...';
    content.style.marginTop = '20px';

    panel.append(closeBtn, content);
    document.body.appendChild(panel);
  }

  function updateSummaryPanel(content, isError = false) {
    const panelContent = document.getElementById('summary-content');
    if (panelContent) {
      Object.assign(panelContent.style, {
        whiteSpace: 'pre-wrap',
        fontFamily: 'Arial, sans-serif',
        lineHeight: '1.6',
        fontSize: '14px',
        color: isError ? '#ff4444' : 'inherit',
      });
      panelContent.textContent = content;
    }
  }

  async function getYouTubeTranscript() {
    const selector = '#primary-button > ytd-button-renderer > yt-button-shape > button';
    const btn = document.querySelector(selector);
    if (!btn) throw new Error('Transkript butonu bulunamadı.');

    btn.click();
    let transcript = '';
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 10;
      const interval = setInterval(() => {
        const panel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]');
        if (panel?.innerText.trim()) {
          clearInterval(interval);
          transcript = panel.innerText.replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s*/g, '').replace(/\n+/g, ' ').trim();
          resolve();
        } else if (attempts++ >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('Transkript yüklenemedi.'));
        }
      }, 500);
    });

    btn.click();
    if (!transcript) throw new Error('Transkript boş.');
    return transcript;
  }

  async function summarize() {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) return updateSummaryPanel('Video ID bulunamadı!', true);
    if (!apiKey) return updateSummaryPanel('API anahtarı eksik!', true);

    const btn = document.getElementById('summary-btn');
    btn.textContent = '⏳';
    btn.style.animation = 'spin 1s linear infinite';
    createSummaryPanel();

    try {
      const transcript = await getYouTubeTranscript();
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'codestral-latest',
          messages: [{ role: 'user', content: `Summarize the content of the following YouTube video in plain text (without Markdown), using an academic tone and a bullet-point format. Write the summary in Turkish:\n\n${transcript}` }],
          temperature: 0.4,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'API hatası.');
      updateSummaryPanel(json.choices?.[0]?.message?.content || 'Özet alınamadı.');
    } catch (err) {
      updateSummaryPanel('Hata: ' + err.message, true);
    } finally {
      btn.textContent = '📝';
      btn.style.animation = '';
    }
  }

  const observer = new MutationObserver(() => {
    if (document.body && !document.getElementById('summary-btn')) createButton();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', createButton);
})();
