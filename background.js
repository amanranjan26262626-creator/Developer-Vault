// Developer Vault — background.js v4.0
// Added: WebSocket capture, IndexedDB, data size tracking

let capturedData = { network: [], storage: {}, sources: [], websockets: [] };
let isTrackingNetwork = false;
let isTrackingWS = false;
const trackedTabs = new Set();
const requestMap = {};
const scriptMap = {};

function persist() {
    try { chrome.storage.session.set({ capturedData }); } catch(e) {}
}

chrome.storage.session.get(['capturedData'], (result) => {
    if (result?.capturedData) capturedData = result.capturedData;
});

async function attachDebugger(tabId) {
    if (!trackedTabs.has(tabId)) {
        await chrome.debugger.attach({ tabId }, "1.3");
        trackedTabs.add(tabId);
    }
}

async function detachDebugger(tabId) {
    if (trackedTabs.has(tabId)) {
        try { await chrome.debugger.detach({ tabId }); } catch(e) {}
        trackedTabs.delete(tabId);
    }
}

chrome.debugger.onDetach.addListener((source) => {
    trackedTabs.delete(source.tabId);
    if (trackedTabs.size === 0) { isTrackingNetwork = false; isTrackingWS = false; }
});

chrome.debugger.onEvent.addListener(async (source, method, params) => {

    // ── Network request metadata ──
    if (method === "Network.requestWillBeSent") {
        requestMap[params.requestId] = {
            method: params.request.method,
            postData: params.request.postData || null,
            requestHeaders: params.request.headers,
            startTime: params.timestamp,
            initiator: params.initiator?.type || "other",
            url: params.request.url
        };
    }

    // ── Network response ──
    if (method === "Network.responseReceived" && isTrackingNetwork) {
        const res = params.response;
        const reqInfo = requestMap[params.requestId] || {};
        const interesting = params.type === "XHR" || params.type === "Fetch" ||
            params.type === "Document" || res.url.includes("api") || res.url.includes("?");
        if (!interesting) return;

        const entry = {
            id: params.requestId,
            url: res.url,
            method: reqInfo.method || "GET",
            postData: reqInfo.postData || null,
            status: res.status,
            statusText: res.statusText,
            type: params.type,
            mimeType: res.mimeType,
            requestHeaders: reqInfo.requestHeaders || {},
            responseHeaders: res.headers || {},
            timing: null,
            responseBody: "Loading...",
            responseSize: 0,
            base64Encoded: false,
            base64Raw: null,
            timestamp: new Date().toISOString(),
            initiator: reqInfo.initiator || "other",
            isGraphQL: false
        };

        // Detect GraphQL
        if (reqInfo.postData) {
            try {
                const parsed = JSON.parse(reqInfo.postData);
                if (parsed.query || parsed.operationName) entry.isGraphQL = true;
            } catch(e) {}
        }

        capturedData.network.push(entry);

        // Fetch body immediately — also retried in loadingFinished
        setTimeout(async () => {
            try {
                const bodyResp = await chrome.debugger.sendCommand(
                    { tabId: source.tabId }, "Network.getResponseBody",
                    { requestId: params.requestId }
                );
                const idx = capturedData.network.findIndex(e => e.id === params.requestId);
                if (idx === -1) return;
                if (bodyResp.base64Encoded) {
                    capturedData.network[idx].responseBody = "[Binary/Base64]";
                    capturedData.network[idx].base64Raw = bodyResp.body;
                    capturedData.network[idx].base64Encoded = true;
                    capturedData.network[idx].responseSize = bodyResp.body.length;
                } else {
                    capturedData.network[idx].responseBody = bodyResp.body || "(empty)";
                    capturedData.network[idx].responseSize = (bodyResp.body || "").length;
                }
                persist();
            } catch(e) { /* will retry in loadingFinished */ }
        }, 100);

        persist();
        // requestMap NOT deleted here — loadingFinished needs it
    }

    // ── Body + Timing — after full load ──
    if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
        const entry = capturedData.network.find(e => e.id === params.requestId);

        if (method === "Network.loadingFailed") {
            if (entry && entry.responseBody === "Loading...") {
                entry.responseBody = "(failed: " + (params.errorText || "network error") + ")";
                persist();
            }
            delete requestMap[params.requestId];
            return;
        }

        if (!entry) { delete requestMap[params.requestId]; return; }

        const reqInfo = requestMap[params.requestId];
        if (reqInfo?.startTime) {
            entry.timing = Math.round((params.timestamp - reqInfo.startTime) * 1000);
        }

        // Retry body fetch — buffer may not be ready instantly
        const fetchBody = async (retries) => {
            try {
                const bodyResp = await chrome.debugger.sendCommand(
                    { tabId: source.tabId }, "Network.getResponseBody",
                    { requestId: params.requestId }
                );
                if (bodyResp.base64Encoded) {
                    entry.responseBody = "[Binary/Base64]";
                    entry.base64Raw = bodyResp.body;
                    entry.base64Encoded = true;
                    entry.responseSize = bodyResp.body.length;
                } else {
                    entry.responseBody = bodyResp.body || "(empty)";
                    entry.responseSize = (bodyResp.body || "").length;
                }
            } catch(e) {
                if (retries > 0) {
                    await new Promise(r => setTimeout(r, 300));
                    await fetchBody(retries - 1);
                } else {
                    if (entry.responseBody === "Loading...") entry.responseBody = "(no body)";
                }
            }
        };

        await fetchBody(3);
        persist();
        delete requestMap[params.requestId];
    }

    // ── WebSocket capture ──
    if (method === "Network.webSocketCreated" && isTrackingWS) {
        capturedData.websockets.push({
            id: params.requestId,
            url: params.url,
            timestamp: new Date().toISOString(),
            messages: [],
            status: "open"
        });
        persist();
    }

    if (method === "Network.webSocketFrameReceived" && isTrackingWS) {
        const ws = capturedData.websockets.find(w => w.id === params.requestId);
        if (ws) {
            ws.messages.push({
                dir: "IN",
                data: params.response.payloadData,
                time: new Date().toISOString(),
                opcode: params.response.opcode
            });
            persist();
        }
    }

    if (method === "Network.webSocketFrameSent" && isTrackingWS) {
        const ws = capturedData.websockets.find(w => w.id === params.requestId);
        if (ws) {
            ws.messages.push({
                dir: "OUT",
                data: params.response.payloadData,
                time: new Date().toISOString(),
                opcode: params.response.opcode
            });
            persist();
        }
    }

    if (method === "Network.webSocketClosed" && isTrackingWS) {
        const ws = capturedData.websockets.find(w => w.id === params.requestId);
        if (ws) { ws.status = "closed"; persist(); }
    }

    // ── Script tracking ──
    if (method === "Debugger.scriptParsed") {
        if (!params.url || params.url === "" ||
            params.url.startsWith("extensions::") ||
            params.url.startsWith("chrome-extension://") ||
            params.url.startsWith("debugger://")) return;
        const tabId = source.tabId;
        if (!scriptMap[tabId]) scriptMap[tabId] = {};
        scriptMap[tabId][params.scriptId] = { url: params.url, scriptId: params.scriptId };
    }
});

// ── Message handler ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.action === 'GET_STATE') {
        sendResponse({ capturedData, isTrackingNetwork, isTrackingWS });
        return true;
    }

    if (message.action === 'CLEAR_DATA') {
        capturedData = { network: [], storage: {}, sources: [], websockets: [] };
        for (const k of Object.keys(scriptMap)) delete scriptMap[k];
        persist();
        sendResponse({ success: true });
        return true;
    }

    if (message.action === 'START_NETWORK') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs.length) return sendResponse({ error: "No active tab" });
            const tabId = tabs[0].id;
            try {
                await attachDebugger(tabId);
                await chrome.debugger.sendCommand({ tabId }, "Network.enable", {
                    maxResourceBufferSize: 10 * 1024 * 1024,
                    maxTotalBufferSize: 100 * 1024 * 1024
                });
                isTrackingNetwork = true;
                sendResponse({ success: true });
            } catch(e) { sendResponse({ error: e.message }); }
        });
        return true;
    }

    if (message.action === 'STOP_NETWORK') {
        isTrackingNetwork = false;
        isTrackingWS = false;
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs.length) {
                try {
                    await chrome.debugger.sendCommand({ tabId: tabs[0].id }, "Network.disable");
                    await detachDebugger(tabs[0].id);
                } catch(e) {}
            }
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.action === 'START_WEBSOCKET') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs.length) return sendResponse({ error: "No active tab" });
            const tabId = tabs[0].id;
            try {
                await attachDebugger(tabId);
                await chrome.debugger.sendCommand({ tabId }, "Network.enable", {});
                isTrackingWS = true;
                sendResponse({ success: true });
            } catch(e) { sendResponse({ error: e.message }); }
        });
        return true;
    }

    if (message.action === 'SCRAPE_STORAGE') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs.length) return sendResponse({ error: "No active tab" });
            const tabId = tabs[0].id;
            try {
                await attachDebugger(tabId);
                await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");

                const exp = `(function(){
                    var l={},s={};
                    try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);l[k]=localStorage.getItem(k);}}catch(e){}
                    try{for(var i=0;i<sessionStorage.length;i++){var k=sessionStorage.key(i);s[k]=sessionStorage.getItem(k);}}catch(e){}
                    return JSON.stringify({localStorage:l,sessionStorage:s,cookie:document.cookie,url:window.location.href,scraped_at:new Date().toISOString()});
                })()`;

                const result = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", { expression: exp, returnByValue: true });
                if (result.result?.value) {
                    capturedData.storage = JSON.parse(result.result.value);
                    persist();
                    sendResponse({ success: true, storage: capturedData.storage });
                } else {
                    sendResponse({ error: "Empty result" });
                }
                if (!isTrackingNetwork) await detachDebugger(tabId);
            } catch(e) { sendResponse({ error: e.message }); }
        });
        return true;
    }

    // ── IndexedDB scrape ──
    if (message.action === 'SCRAPE_INDEXEDDB') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs.length) return sendResponse({ error: "No active tab" });
            const tabId = tabs[0].id;
            try {
                await attachDebugger(tabId);
                await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");

                const exp = `(async function() {
                    const result = {};
                    const dbNames = await indexedDB.databases();
                    for (const dbInfo of dbNames) {
                        const db = await new Promise((res, rej) => {
                            const req = indexedDB.open(dbInfo.name);
                            req.onsuccess = () => res(req.result);
                            req.onerror = () => rej(req.error);
                        });
                        result[dbInfo.name] = {};
                        for (const storeName of db.objectStoreNames) {
                            const tx = db.transaction(storeName, 'readonly');
                            const store = tx.objectStore(storeName);
                            const data = await new Promise((res) => {
                                const req = store.getAll();
                                req.onsuccess = () => res(req.result);
                                req.onerror = () => res([]);
                            });
                            result[dbInfo.name][storeName] = data;
                        }
                        db.close();
                    }
                    return JSON.stringify(result);
                })()`;

                const result = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", {
                    expression: exp, returnByValue: true, awaitPromise: true
                });

                if (result.result?.value) {
                    capturedData.storage.indexedDB = JSON.parse(result.result.value);
                    persist();
                    sendResponse({ success: true, indexedDB: capturedData.storage.indexedDB });
                } else {
                    sendResponse({ error: "No IndexedDB data or permission denied" });
                }
                if (!isTrackingNetwork) await detachDebugger(tabId);
            } catch(e) { sendResponse({ error: e.message }); }
        });
        return true;
    }

    if (message.action === 'SCRAPE_SOURCES') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (!tabs.length) return sendResponse({ error: "No active tab" });
            const tabId = tabs[0].id;
            try {
                await attachDebugger(tabId);
                capturedData.sources = [];
                let scrapedCount = 0;

                await chrome.debugger.sendCommand({ tabId }, "Debugger.enable");
                const knownScripts = scriptMap[tabId] ? Object.values(scriptMap[tabId]) : [];

                for (const script of knownScripts) {
                    try {
                        const result = await chrome.debugger.sendCommand({ tabId }, "Debugger.getScriptSource", { scriptId: script.scriptId });
                        if (result.scriptSource?.length > 0) {
                            capturedData.sources.push({ url: script.url, type: "Script", content: result.scriptSource, size: result.scriptSource.length, via: "Debugger" });
                            scrapedCount++;
                        }
                    } catch(e) {}
                }

                await chrome.debugger.sendCommand({ tabId }, "Page.enable");
                const tree = await chrome.debugger.sendCommand({ tabId }, "Page.getResourceTree");
                const pageRes = [];
                function collectAll(frame) {
                    if (frame.resources) frame.resources.forEach(r => pageRes.push({ url: r.url, type: r.type, frameId: frame.frame.id }));
                    if (frame.childFrames) frame.childFrames.forEach(c => collectAll(c));
                }
                collectAll(tree.frameTree);

                const alreadyCaptured = new Set(capturedData.sources.map(s => s.url));
                for (const r of pageRes) {
                    if (!['Script', 'Stylesheet', 'Document'].includes(r.type)) continue;
                    if (alreadyCaptured.has(r.url)) continue;
                    try {
                        const content = await chrome.debugger.sendCommand({ tabId }, "Page.getResourceContent", { frameId: r.frameId, url: r.url });
                        let text = content.content || "";
                        if (content.base64Encoded && text) { try { text = atob(text); } catch(e) { text = "[binary]"; } }
                        if (!text) continue;
                        capturedData.sources.push({ url: r.url, type: r.type, content: text, size: text.length, via: "Page" });
                        scrapedCount++;
                    } catch(e) {}
                }

                persist();
                sendResponse({ success: true, scrapedCount, sources: capturedData.sources });
                if (!isTrackingNetwork) {
                    try { await chrome.debugger.sendCommand({ tabId }, "Debugger.disable"); } catch(e) {}
                    try { await chrome.debugger.sendCommand({ tabId }, "Page.disable"); } catch(e) {}
                    await detachDebugger(tabId);
                }
            } catch(e) { sendResponse({ error: e.message }); }
        });
        return true;
    }
});
