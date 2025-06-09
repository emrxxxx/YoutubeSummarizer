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
    let summaryPanel = null;

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
      justify-content: center; opacity: 0.9; padding: 0; line-height: 1;
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
        if (summaryPanel) return summaryPanel;

        summaryPanel = document.createElement('div');
        summaryPanel.id = 'summary-panel';
        summaryPanel.style.cssText = `
      position: fixed; top: 80px; right: 85px; width: 42vh;
      max-height: calc(100vh - 110px); background: #2a2a2a; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 10001;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: white; backdrop-filter: blur(10px); transform: translateX(400px);
      transition: transform 0.3s ease; opacity: 0.95; border: 1px solid rgba(255,255,255,0.1);
      overflow: hidden;
    `;

        const header = document.createElement('div');
        header.style.cssText = `
      padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.2);
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(0,0,0,0.3); cursor: move;
    `;

        const title = document.createElement('h3');
        title.textContent = '📄 Video Özeti';
        title.style.cssText = 'margin: 0; font-size: 15px; font-weight: 500;';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
      background: none; border: none; color: white; font-size: 18px; cursor: pointer;
      opacity: 0.8; transition: opacity 0.2s; line-height: 1; padding: 0 4px;
    `;
        closeBtn.addEventListener('mouseover', () => closeBtn.style.opacity = '1');
        closeBtn.addEventListener('mouseout', () => closeBtn.style.opacity = '0.8');
        closeBtn.addEventListener('click', hideSummaryPanel);

        header.appendChild(title);
        header.appendChild(closeBtn);

        const content = document.createElement('div');
        content.id = 'summary-content';
        content.textContent = 'Özet yükleniyor...';
        content.style.cssText = `
      padding: 16px; max-height: calc(100vh - 250px); overflow-y: auto;
      line-height: 1.4; font-size: 13.5px;
    `;

        let pos1 = 0,
            pos2 = 0,
            pos3 = 0,
            pos4 = 0;
        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            summaryPanel.style.top = (summaryPanel.offsetTop - pos2) + "px";
            summaryPanel.style.left = (summaryPanel.offsetLeft - pos1) + "px";
            summaryPanel.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }

        summaryPanel.appendChild(header);
        summaryPanel.appendChild(content);
        document.body.appendChild(summaryPanel);

        const style = document.createElement('style');
        style.textContent = `
      #summary-content::-webkit-scrollbar { width: 6px; }
      #summary-content::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); }
      #summary-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
      #summary-content::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.5); }
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 0.95; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 0.95; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
        document.head.appendChild(style);

        return summaryPanel;
    }

    function showSummaryPanel() {
        if (!summaryPanel) return;

        summaryPanel.style.display = 'block';
        requestAnimationFrame(() => {
            summaryPanel.style.opacity = '0.95';
            summaryPanel.style.transform = 'translateX(0)';
            summaryPanel.style.pointerEvents = 'auto';
        });
    }

    function hideSummaryPanel() {
        if (!summaryPanel) return;

        summaryPanel.style.opacity = '0';
        summaryPanel.style.transform = 'translateX(400px)';
        summaryPanel.style.pointerEvents = 'none';

        setTimeout(() => {
            if (summaryPanel) summaryPanel.style.display = 'none';
        }, 300);
    }

    function updateSummaryPanel(content, isError = false) {
        const panelContent = document.getElementById('summary-content');
        if (panelContent) {
            Object.assign(panelContent.style, {
                whiteSpace: 'pre-wrap',
                lineHeight: '1.4',
                fontSize: '13.5px',
                color: isError ? '#ff6b6b' : 'inherit',
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
        showSummaryPanel();

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
                    messages: [{
                            role: 'system',
                            content: 'You are an academic assistant tasked with summarizing content in a clear, concise, and professional manner. Provide summaries in Turkish, using a bullet-point format and an academic tone. Do not use Markdown under any circumstances; avoid all formatting symbols such as asterisks (*), hashtags (#), or backticks (`). The output must be in plain text only, with clean spacing and a clear structure.'
                        },
                        {
                            role: 'user',
                            content: `Summarize the content below:\n\n${transcript}`
                        }
                    ],
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

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    window.addEventListener('load', createButton);
})();
