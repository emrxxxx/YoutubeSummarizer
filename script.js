// ==UserScript==
// @name         YouTube Video Özetleyici
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  YouTube videosunu Mistral AI ile otomatik özetler ve özeti şık, formatlı bir panelde gösterir. Her tıklamada özet yeniden oluşturulur.
// @author       emrxxxx
// @match        *://www.youtube.com/watch*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.mistral.ai
// @require      https://cdn.jsdelivr.net/npm/marked/marked.min.js
// @require      https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js
// ==/UserScript==

(() => {
    'use strict';

    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try {
            window.trustedTypes.createPolicy('default', {
                createHTML: (string) => DOMPurify.sanitize(string, {
                    RETURN_TRUSTED_TYPE: true
                }),
            });
        } catch (e) {
            /* Politika zaten varsa sorun değil */ }
    }

    const CONFIG = {
        API_MODEL: 'codestral-latest',
        API_KEY_STORAGE: 'mistral_api_key',
    };

    let apiKey = GM_getValue(CONFIG.API_KEY_STORAGE, '');
    let summaryPanel = null;

    GM_registerMenuCommand('🔑 Mistral API Anahtarını Ayarla', () => {
        const key = prompt('Lütfen Mistral API anahtarınızı girin:', apiKey)?.trim();
        if (key) {
            GM_setValue(CONFIG.API_KEY_STORAGE, key);
            apiKey = key;
            alert('API anahtarı başarıyla kaydedildi!');
        }
    });

    function createButton() {
        if (document.getElementById('summary-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'summary-btn';
        btn.textContent = '📝';
        btn.title = 'Videoyu Özetle (Ctrl+Shift+S)';
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '30px',
            right: '30px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: 'none',
            background: '#2a2a2a',
            color: 'white',
            fontSize: '16px',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
            zIndex: '10000',
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0.9',
            padding: '0',
            lineHeight: '1',
        });

        btn.addEventListener('mouseover', () => {
            btn.style.background = '#ff3333';
            btn.style.transform = 'scale(1.1) rotate(5deg)';
            btn.style.opacity = '1';
        });
        btn.addEventListener('mouseout', () => {
            btn.style.background = '#2a2a2a';
            btn.style.transform = 'scale(1) rotate(0deg)';
            btn.style.opacity = '0.9';
        });
        btn.addEventListener('click', handleSummarizeClick);

        document.body.appendChild(btn);

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
                e.preventDefault();
                handleSummarizeClick();
            }
        });

        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            #summary-btn:not(:hover) { animation: pulse 2s infinite; }
            #summary-panel { transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s; }
            #summary-content h3 { font-size: 1.1em; margin-top: 1em; margin-bottom: 0.5em; color: #ff9f43; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px; }
            #summary-content ul, #summary-content ol { padding-left: 20px; }
            #summary-content li { margin-bottom: 8px; }
            #summary-content strong, b { color: #f0f0f0; font-weight: 600; }
            #summary-content code { background-color: rgba(0,0,0,0.3); padding: 2px 4px; border-radius: 4px; font-family: 'Courier New', Courier, monospace; }
            #summary-content::-webkit-scrollbar { width: 6px; }
            #summary-content::-webkit-scrollbar-track { background: rgba(255,255,255,0.1); }
            #summary-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.3); border-radius: 3px; }
        `;
        document.head.appendChild(style);
    }

    function createSummaryPanel() {
        if (summaryPanel) return summaryPanel;

        summaryPanel = document.createElement('div');
        summaryPanel.id = 'summary-panel';
        summaryPanel.style.cssText = `
            position: fixed; top: 80px; right: 85px; width: 42vh;
            max-height: calc(100vh - 110px); background: rgba(42, 42, 42, 0.9);
            border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: white; backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1);
            overflow: hidden; display: flex; flex-direction: column;
            transform: translateX(calc(100% + 90px)); opacity: 0;
        `;

        const header = document.createElement('div');
        header.style.cssText = `padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); cursor: move; flex-shrink: 0;`;
        const title = document.createElement('h3');
        title.textContent = '📄 Video Özeti';
        title.style.cssText = 'margin: 0; font-size: 15px; font-weight: 500;';
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `background: none; border: none; color: white; font-size: 20px; cursor: pointer; opacity: 0.8; transition: opacity 0.2s; lineHeight: 1; padding: 0 4px;`;
        closeBtn.addEventListener('click', hideSummaryPanel);
        header.append(title, closeBtn);

        const content = document.createElement('div');
        content.id = 'summary-content';
        content.style.cssText = `padding: 16px; overflow-y: auto; line-height: 1.5; font-size: 14px; flex-grow: 1;`;
        content.textContent = 'Özet bekleniyor...';

        summaryPanel.append(header, content);
        document.body.appendChild(summaryPanel);

        makeDraggable(summaryPanel, header);
        return summaryPanel;
    }

    function showSummaryPanel() {
        if (!summaryPanel) createSummaryPanel();
        requestAnimationFrame(() => {
            summaryPanel.style.transform = 'translateX(0)';
            summaryPanel.style.opacity = '1';
        });
    }

    function hideSummaryPanel() {
        if (!summaryPanel) return;
        summaryPanel.style.transform = `translateX(calc(100% + 90px))`;
        summaryPanel.style.opacity = '0';
    }

    function updateSummaryPanel(content, {
        isError = false,
        isLoading = false
    } = {}) {
        const panelContent = document.getElementById('summary-content');
        if (!panelContent) return;
        panelContent.style.color = isError ? '#ff6b6b' : 'inherit';
        if (isError || isLoading) {
            panelContent.textContent = content;
        } else {
            const dirtyHtml = marked.parse(content);
            const cleanHtml = DOMPurify.sanitize(dirtyHtml, {
                RETURN_TRUSTED_TYPE: true
            });
            panelContent.innerHTML = cleanHtml;
        }
    }

    async function getYouTubeTranscript() {
        console.log("Transkript alınmaya çalışılıyor...");
        let transcriptOpened = false;

        try {
            console.log("Deneme 1: Menü butonu üzerinden transkript açılıyor...");
            const menuButton = document.querySelector('#button-shape > button[aria-label="Diğer işlemler"]');
            if (menuButton) {
                menuButton.click();
                await new Promise(r => setTimeout(r, 500));
                const transcriptMenuItem = Array.from(document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item'))
                    .find(el => el.innerText.includes('Transkripti göster'));
                if (transcriptMenuItem) {
                    transcriptMenuItem.click();
                    transcriptOpened = true;
                    console.log("Deneme 1 başarılı: Menü üzerinden transkript butonu tıklandı.");
                }
            }
        } catch (e) {
            console.warn("Deneme 1 sırasında bir hata oluştu:", e);
        }

        if (!transcriptOpened) {
            try {
                console.log("Deneme 1 başarısız. Deneme 2: Açıklama alanından transkript açılıyor...");
                const descriptionExpander = document.querySelector('#description-inline-expander button');
                if (descriptionExpander) descriptionExpander.click();
                await new Promise(r => setTimeout(r, 500));
                const transcriptButtonInDesc = Array.from(document.querySelectorAll('ytd-button-renderer, a.yt-simple-endpoint'))
                    .find(el => el.innerText.trim().includes('Transkripti göster'));
                if (transcriptButtonInDesc) {
                    transcriptButtonInDesc.click();
                    transcriptOpened = true;
                    console.log("Deneme 2 başarılı: Açıklama alanı üzerinden transkript butonu tıklandı.");
                }
            } catch (e) {
                console.warn("Deneme 2 sırasında bir hata oluştu:", e);
            }
        }

        if (!transcriptOpened) {
            throw new Error('"Transkripti göster" butonu hiçbir yöntemle bulunamadı. Bu video için transkript mevcut olmayabilir.');
        }

        const transcriptPanelSelector = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
        const transcriptSegmentSelector = 'yt-formatted-string.ytd-transcript-segment-renderer';
        let transcriptPanel;

        for (let i = 0; i < 20; i++) {
            transcriptPanel = document.querySelector(transcriptPanelSelector);
            if (transcriptPanel && transcriptPanel.querySelector(transcriptSegmentSelector)) {
                break;
            }
            await new Promise(r => setTimeout(r, 500));
        }

        if (!transcriptPanel) throw new Error('Transkript paneli yüklenemedi.');

        const segments = transcriptPanel.querySelectorAll(transcriptSegmentSelector);
        const transcriptText = Array.from(segments).map(s => s.textContent.trim()).join(' ');

        const closeButton = document.querySelector(`${transcriptPanelSelector} button[aria-label="Transkripti kapat"]`);
        if (closeButton) {
            closeButton.click();
            console.log("Transkript paneli kapatıldı.");
        }

        if (!transcriptText) throw new Error('Transkript içeriği boş.');
        console.log("Transkript başarıyla alındı.");
        return transcriptText;
    }

    async function fetchSummaryFromAPI(transcript) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.mistral.ai/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                data: JSON.stringify({
                    model: CONFIG.API_MODEL,
                    messages: [{
                            role: 'system',
                            content: `You are an expert assistant for summarizing YouTube videos. Your goal is to provide a clear, structured summary in Turkish using Markdown formatting. Use headings (###), bullet points (*), and bold text (**). Start with a one-sentence overview.`
                        },
                        {
                            role: 'user',
                            content: `Summarize the YouTube video transcript below in Turkish in Markdown format:\n\n${transcript}`
                        }
                    ],
                    temperature: 0.5
                }),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        const json = JSON.parse(response.responseText);
                        const summary = json.choices?.[0]?.message?.content;
                        if (summary) resolve(summary);
                        else reject(new Error('API yanıtında özet bulunamadı.'));
                    } else {
                        const errorJson = JSON.parse(response.responseText);
                        reject(new Error(errorJson.error?.message || `API Hatası: ${response.statusText}`));
                    }
                },
                onerror: () => reject(new Error('Ağ hatası veya API\'ye ulaşılamıyor.'))
            });
        });
    }

    async function handleSummarizeClick() {
        const btn = document.getElementById('summary-btn');
        if (btn.classList.contains('loading')) return;
        const videoId = new URLSearchParams(window.location.search).get('v');
        if (!videoId) {
            alert('Geçerli bir YouTube video sayfası değil.');
            return;
        }
        if (!apiKey) {
            alert('Lütfen menüden Mistral API anahtarınızı ayarlayın.');
            return;
        }

        btn.textContent = '⏳';
        btn.style.animation = 'spin 1s linear infinite';
        btn.classList.add('loading');
        createSummaryPanel();
        showSummaryPanel();
        updateSummaryPanel('Özet hazırlanıyor, lütfen bekleyin...', {
            isLoading: true
        });

        try {
            const transcript = await getYouTubeTranscript();
            const summary = await fetchSummaryFromAPI(transcript);
            updateSummaryPanel(summary);
        } catch (err) {
            console.error('Özetleme hatası:', err);
            updateSummaryPanel(`Hata: ${err.message}`, {
                isError: true
            });
        } finally {
            btn.textContent = '📝';
            btn.style.animation = '';
            btn.classList.remove('loading');
        }
    }

    function makeDraggable(element, handle) {
        let pos1 = 0,
            pos2 = 0,
            pos3 = 0,
            pos4 = 0;
        handle.onmousedown = (e) => {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        };

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = 'auto';
            element.style.bottom = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    function initialize() {
        if (document.getElementById('summary-btn')) return;
        if (window.location.href.includes('/watch')) createButton();
    }

    window.addEventListener('yt-navigate-finish', () => setTimeout(initialize, 500));
    initialize();

})();
