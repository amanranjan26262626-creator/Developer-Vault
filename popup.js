// Developer Vault — popup.js v4.2
// Fix 1: Auto-refresh sirf network list update kare — detail pane stable rahe
// Fix 2: Sources/Storage detail pane alag DOM mein — innerHTML rebuild se affect na ho
// Fix 3: Response body properly wait kare — "Loading..." na rahe

let capturedData = { network: [], storage: {}, sources: [], websockets: [] };
let selectedNetIdx = null;
let selectedSrcIdx = null;
let selectedWsIdx = null;
let selectedDetailTab = 'response';
let srcBeautified = false;
let lastNetworkCount = 0; // track changes to avoid unnecessary re-renders

// ── Tab switching ──
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'tools') renderSessionStats();
    });
});

document.querySelectorAll('.detail-tab').forEach(dt => {
    dt.addEventListener('click', () => {
        document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
        dt.classList.add('active');
        selectedDetailTab = dt.dataset.dtab;
        renderDetailPane();
    });
});

// ── Log ──
function log(msg, type = 'export') {
    const list = document.getElementById('log-list');
    const div = document.createElement('div');
    div.className = `log-item log-${type}`;
    div.innerHTML = `<span class="ts">[${new Date().toLocaleTimeString()}]</span>${msg}`;
    list.prepend(div);
}

// ── Helpers ──
function formatBytes(b) {
    if (!b) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
    return (b/1048576).toFixed(2) + ' MB';
}

function updateStats() {
    const n = capturedData.network;
    document.getElementById('badge-net').textContent = n.length;
    document.getElementById('badge-src').textContent = capturedData.sources.length;
    document.getElementById('badge-ws').textContent = capturedData.websockets.length;
    document.getElementById('stat-req').textContent = n.length;
    document.getElementById('stat-size').textContent = formatBytes(n.reduce((a,e)=>a+(e.responseSize||0),0));
    document.getElementById('stat-err').textContent = n.filter(e=>e.status>=400).length;
}

function methodClass(m) {
    return {GET:'m-GET',POST:'m-POST',PUT:'m-PUT',DELETE:'m-DELETE',PATCH:'m-PATCH'}[m?.toUpperCase()]||'m-OTHER';
}
function statusClass(c) { return c ? `s-${String(c)[0]}xx` : ''; }
function timingHtml(ms) {
    if (!ms) return '';
    const cls = ms>2000?'very-slow':ms>500?'slow':'';
    return `<span class="net-timing ${cls}">${ms>=1000?(ms/1000).toFixed(1)+'s':ms+'ms'}</span>`;
}
function shortUrl(url) {
    try {
        const u = new URL(url);
        const p = u.pathname+(u.search.length>20?u.search.slice(0,20)+'…':u.search);
        return p.length>52?'…'+p.slice(-52):p;
    } catch { return url.slice(0,55); }
}

// ── Binary mime check ──
const BINARY_MIMES = ['image/','video/','audio/','font/','model/','application/octet-stream'];
function isBinaryMime(mime) {
    if (!mime) return false;
    return BINARY_MIMES.some(t => mime.startsWith(t)) || mime.includes('zip') || mime.includes('pdf');
}

// ── Format response body ──
function formatBody(entry) {
    if (!entry) return '';

    if (isBinaryMime(entry.mimeType)) {
        return `⚠ Binary/media file — cannot display as text\n\nURL  : ${entry.url}\nType : ${entry.mimeType}\nSize : ${formatBytes(entry.responseSize)}`;
    }

    if (entry.base64Encoded && entry.base64Raw) {
        try {
            const decoded = atob(entry.base64Raw);
            if (/[\x00-\x08\x0E-\x1F]/.test(decoded.slice(0,200))) {
                return `⚠ Binary data (${formatBytes(entry.responseSize)}) — cannot display as text`;
            }
            try { return JSON.stringify(JSON.parse(decoded), null, 2); } catch {}
            return decoded;
        } catch {
            return `⚠ Encoded binary data — cannot display\nSize: ${formatBytes(entry.responseSize)}`;
        }
    }

    const body = entry.responseBody || '';
    if (!body || body === 'Loading...') return '⏳ Waiting for response body...\n\nTip: Reload the page after clicking START to capture full responses.';
    if (body === '(no body)') return '(empty response body)';

    // JSON pretty print
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch {}
    return body;
}

// ────────────────────────────────────────────
// NETWORK LIST — only re-render when count changes
// ────────────────────────────────────────────
function renderNetList() {
    const list = document.getElementById('net-list');
    const search = document.getElementById('net-search').value.toLowerCase();
    const mf = document.getElementById('net-method-filter').value;
    const sf = document.getElementById('net-status-filter').value;

    let items = capturedData.network;
    if (search) items = items.filter(e => e.url.toLowerCase().includes(search));
    if (mf) items = items.filter(e => e.method?.toUpperCase() === mf);
    if (sf) items = items.filter(e => String(e.status||'')[0] === sf);

    if (!items.length) {
        list.innerHTML = `<div class="empty-state"><div class="icon">◎</div><p>${capturedData.network.length?'No results match filter':'No packets captured'}</p><div class="hint">Click START → reload page</div></div>`;
        return;
    }

    list.innerHTML = items.map(entry => {
        const ri = capturedData.network.indexOf(entry);
        const isBin = isBinaryMime(entry.mimeType);
        const gqlTag = entry.isGraphQL ? `<span class="gql-tag">GQL</span>` : '';
        const binTag = isBin ? `<span style="font-size:8px;color:var(--muted);flex-shrink:0">[bin]</span>` : '';
        return `<div class="net-item ${ri===selectedNetIdx?'selected':''}" data-idx="${ri}">
            <span class="method-tag ${methodClass(entry.method)}">${entry.method||'?'}</span>
            <span class="status-badge ${statusClass(entry.status)}">${entry.status||'---'}</span>
            ${gqlTag}${binTag}
            <span class="net-url" title="${entry.url}">${shortUrl(entry.url)}</span>
            ${timingHtml(entry.timing)}
        </div>`;
    }).join('');

    list.querySelectorAll('.net-item').forEach(el => {
        el.addEventListener('click', () => {
            selectedNetIdx = parseInt(el.dataset.idx);
            list.querySelectorAll('.net-item').forEach(i => i.classList.remove('selected'));
            el.classList.add('selected');
            renderDetailPane();
            document.getElementById('detail-pane').style.display = 'flex';
            const e = capturedData.network[selectedNetIdx];
            if (e) document.getElementById('detail-url').textContent = e.url;

            // If body still loading, poll background until it arrives
            if (e && (e.responseBody === 'Loading...' || !e.responseBody)) {
                let polls = 0;
                const poll = setInterval(() => {
                    polls++;
                    chrome.runtime.sendMessage({action:'GET_STATE'}, res => {
                        if (!res) return;
                        const updated = res.capturedData.network[selectedNetIdx];
                        if (!updated) { clearInterval(poll); return; }
                        if (updated.responseBody && updated.responseBody !== 'Loading...') {
                            capturedData.network[selectedNetIdx] = updated;
                            renderDetailPane();
                            clearInterval(poll);
                        }
                        if (polls > 15) clearInterval(poll); // stop after 3s
                    });
                }, 200);
            }
        });
    });
}

// ── Detail pane — completely separate, never auto-refreshed ──
function renderDetailPane() {
    if (selectedNetIdx === null) return;
    const e = capturedData.network[selectedNetIdx];
    if (!e) return;
    const body = document.getElementById('detail-body');

    if (selectedDetailTab === 'response') {
        const formatted = formatBody(e);
        if (formatted.startsWith('⚠')) {
            body.innerHTML = `<div class="binary-notice">${formatted.replace(/\n/g,'<br>')}</div>`;
        } else if (formatted.startsWith('⏳')) {
            body.innerHTML = `<div class="binary-notice" style="color:var(--yellow)">${formatted.replace(/\n/g,'<br>')}</div>`;
        } else {
            body.textContent = formatted;
        }
    } else if (selectedDetailTab === 'request') {
        body.textContent = [
            `URL       : ${e.url}`,
            `Method    : ${e.method}`,
            `Status    : ${e.status} ${e.statusText||''}`,
            `Type      : ${e.type}`,
            `Mime      : ${e.mimeType}`,
            `Timing    : ${e.timing?e.timing+'ms':'N/A'}`,
            `Size      : ${formatBytes(e.responseSize||0)}`,
            `Timestamp : ${e.timestamp}`,
            `Initiator : ${e.initiator}`
        ].join('\n');
    } else if (selectedDetailTab === 'headers') {
        const rq = Object.entries(e.requestHeaders||{}).map(([k,v])=>`  ${k}: ${v}`).join('\n')||'  (none)';
        const rs = Object.entries(e.responseHeaders||{}).map(([k,v])=>`  ${k}: ${v}`).join('\n')||'  (none)';
        body.textContent = `REQUEST HEADERS\n${rq}\n\nRESPONSE HEADERS\n${rs}`;
    } else if (selectedDetailTab === 'postdata') {
        let t = e.postData||'(no payload)';
        try { t = JSON.stringify(JSON.parse(t),null,2); } catch {}
        body.textContent = t;
    } else if (selectedDetailTab === 'graphql') {
        if (!e.isGraphQL) { body.textContent = '(not a GraphQL request)'; return; }
        try {
            const p = JSON.parse(e.postData||'{}');
            let out = '';
            if (p.operationName) out += `OPERATION: ${p.operationName}\n\n`;
            if (p.query) out += `QUERY:\n${p.query}\n`;
            if (p.variables) out += `\nVARIABLES:\n${JSON.stringify(p.variables,null,2)}`;
            body.textContent = out||'(could not parse)';
        } catch { body.textContent = '(parse error)'; }
    } else if (selectedDetailTab === 'curl') {
        body.textContent = generateCurl(e);
    }
}

// Copy response
document.getElementById('btn-copy-response').addEventListener('click', () => {
    const text = document.getElementById('detail-body').textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('btn-copy-response');
        btn.textContent='COPIED!'; btn.classList.add('copied');
        setTimeout(()=>{btn.textContent='COPY';btn.classList.remove('copied');},1500);
    });
});

// ────────────────────────────────────────────
// STORAGE — rendered once, detail pane outside refresh loop
// ────────────────────────────────────────────
function renderStorage() {
    const view = document.getElementById('storage-view');
    const s = capturedData.storage;
    if (!s||!Object.keys(s).length) {
        view.innerHTML=`<div class="empty-state"><div class="icon">◎</div><p>Storage empty</p><div class="hint">Click EXTRACT</div></div>`;
        return;
    }

    const sections=[];
    if (s.localStorage&&Object.keys(s.localStorage).length) sections.push({title:'localStorage',emoji:'📦',data:s.localStorage});
    if (s.sessionStorage&&Object.keys(s.sessionStorage).length) sections.push({title:'sessionStorage',emoji:'⏱',data:s.sessionStorage});
    if (s.cookie) {
        const obj={};
        s.cookie.split(';').forEach(c=>{const[k,...v]=c.trim().split('=');if(k)obj[k.trim()]=v.join('=');});
        if (Object.keys(obj).length) sections.push({title:'Cookies',emoji:'🍪',data:obj});
    }
    if (s.indexedDB&&Object.keys(s.indexedDB).length) {
        sections.push({title:'IndexedDB',emoji:'🗃',data:Object.fromEntries(
            Object.entries(s.indexedDB).map(([db,stores])=>[db,JSON.stringify(stores).slice(0,80)+'…'])
        )});
    }

    let html = s.url?`<div class="storage-section"><h3>🌐 ${s.url}</h3></div>`:'';
    if (!sections.length) {
        view.innerHTML=html+`<div class="storage-section"><p style="color:var(--muted);padding:6px;font-size:10px">No storage data found on this page</p></div>`;
        return;
    }

    html+=sections.map(sec=>`
        <div class="storage-section">
            <h3>${sec.emoji} ${sec.title} — ${Object.keys(sec.data).length} keys</h3>
            <div>${Object.entries(sec.data).map(([k,v])=>`
                <div class="kv-row storage-key-row" data-key="${encodeURIComponent(k)}" data-val="${encodeURIComponent(String(v))}">
                    <span class="kv-key" title="${k}">${k}</span>
                    <span class="kv-val">${String(v).length>55?String(v).slice(0,55)+'…':v}</span>
                    <span style="color:var(--muted);font-size:10px;flex-shrink:0">▶</span>
                </div>`).join('')}
            </div>
        </div>`).join('');

    view.innerHTML = html;

    // Attach click handlers immediately after innerHTML set
    view.querySelectorAll('.storage-key-row').forEach(row=>{
        row.addEventListener('click', () => {
            const key = decodeURIComponent(row.dataset.key);
            const val = decodeURIComponent(row.dataset.val);

            // Remove or create storage detail pane
            let det = document.getElementById('storage-detail');
            if (!det) {
                det = document.createElement('div');
                det.id = 'storage-detail';
                det.style.cssText = 'border-top:1px solid var(--border);padding:10px;background:var(--surface);';
                view.appendChild(det);
            }

            let display = val;
            try { display = JSON.stringify(JSON.parse(val),null,2); } catch {}

            det.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="color:var(--cyan);font-size:10px;font-weight:600;">${key}</span>
                    <div style="display:flex;gap:6px;">
                        <button class="copy-btn" id="btn-copy-storage-val">COPY</button>
                        <button onclick="document.getElementById('storage-detail').style.display='none'" 
                            style="background:none;border:1px solid var(--border);color:var(--muted);cursor:pointer;font-size:10px;padding:1px 7px;border-radius:3px;">✕</button>
                    </div>
                </div>
                <div id="storage-detail-val" style="font-size:10px;white-space:pre-wrap;word-break:break-all;color:var(--text);max-height:150px;overflow-y:auto;line-height:1.7;">${display}</div>`;

            det.style.display = 'block';
            det.scrollIntoView({behavior:'smooth'});

            document.getElementById('btn-copy-storage-val').addEventListener('click', () => {
                navigator.clipboard.writeText(display).then(() => {
                    const btn = document.getElementById('btn-copy-storage-val');
                    btn.textContent='COPIED!'; btn.classList.add('copied');
                    setTimeout(()=>{btn.textContent='COPY';btn.classList.remove('copied');},1500);
                });
            });
        });
    });
}

// ────────────────────────────────────────────
// SOURCES — file list rendered once, detail pane is a fixed DOM element
// ────────────────────────────────────────────
function renderSources() {
    const container = document.getElementById('src-list');
    const search = document.getElementById('src-search').value.toLowerCase();
    let items = capturedData.sources;
    if (search) items = items.filter(s=>s.url.toLowerCase().includes(search));

    if (!items.length) {
        container.innerHTML=`<div class="empty-state"><div class="icon">◎</div><p>${capturedData.sources.length?'No match':'No source files'}</p><div class="hint">Click EXTRACT</div></div>`;
        container.style.cssText='';
        return;
    }

    // Only rebuild file list, not the detail pane
    let fileListHtml = items.map(src => {
        const ri = capturedData.sources.indexOf(src);
        const kb = src.size?(src.size/1024).toFixed(1)+' KB':'?';
        const tc = src.type==='Script'?'t-Script':src.type==='Stylesheet'?'t-Stylesheet':'t-Document';
        return `<div class="net-item ${ri===selectedSrcIdx?'selected':''}" data-src-idx="${ri}">
            <span class="src-type ${tc}">${src.type==='Script'?'JS':src.type==='Stylesheet'?'CSS':'HTML'}</span>
            <span class="src-url" title="${src.url}">${shortUrl(src.url)}</span>
            <span style="font-size:9px;color:var(--muted);flex-shrink:0">[${src.via||'?'}]</span>
            <span class="src-size">${kb}</span>
        </div>`;
    }).join('');

    container.style.cssText='display:flex;flex-direction:column;overflow:hidden;flex:1;';

    // Check if structure already exists — only rebuild file list part
    let fileList = document.getElementById('src-file-list');
    if (!fileList) {
        // First time — build full structure
        container.innerHTML = `
            <div class="net-list" id="src-file-list" style="flex:1;overflow-y:auto;"></div>
            <div id="src-detail-pane" style="display:none;flex-direction:column;height:205px;border-top:1px solid var(--border);flex-shrink:0;background:var(--bg2);">
                <div style="display:flex;background:var(--surface);border-bottom:1px solid var(--border);align-items:center;gap:5px;padding:0 8px;flex-shrink:0;">
                    <span id="src-detail-label" style="flex:1;padding:5px 0;font-size:9px;color:var(--green);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
                    <button class="copy-btn" id="btn-copy-src">COPY</button>
                    <button class="btn d" id="btn-beautify" style="font-size:8px;padding:2px 6px;">BEAUTIFY</button>
                    <button class="btn d" id="btn-src-search-toggle" style="font-size:8px;padding:2px 6px;">SEARCH</button>
                    <button id="src-detail-close" style="padding:4px 8px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;">✕</button>
                </div>
                <div id="src-search-bar" style="display:none;padding:4px 8px;background:var(--surface2);border-bottom:1px solid var(--border);">
                    <input type="text" id="src-file-search" placeholder="Search in file..." style="width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:4px 8px;font-size:10px;outline:none;border-radius:4px;font-family:var(--mono);">
                </div>
                <div id="src-detail-body" style="flex:1;overflow-y:auto;padding:8px 10px;font-size:10px;line-height:1.7;white-space:pre-wrap;word-break:break-all;color:var(--text);"></div>
            </div>`;

        // Attach permanent event listeners ONCE
        document.getElementById('src-detail-close').addEventListener('click', () => {
            selectedSrcIdx = null;
            document.getElementById('src-detail-pane').style.display = 'none';
            document.querySelectorAll('[data-src-idx]').forEach(e=>e.classList.remove('selected'));
        });

        document.getElementById('btn-copy-src').addEventListener('click', () => {
            navigator.clipboard.writeText(document.getElementById('src-detail-body').textContent).then(() => {
                const btn = document.getElementById('btn-copy-src');
                btn.textContent='COPIED!'; btn.classList.add('copied');
                setTimeout(()=>{btn.textContent='COPY';btn.classList.remove('copied');},1500);
            });
        });

        document.getElementById('btn-beautify').addEventListener('click', () => {
            if (selectedSrcIdx===null) return;
            const src = capturedData.sources[selectedSrcIdx];
            const body = document.getElementById('src-detail-body');
            const btn = document.getElementById('btn-beautify');
            if (!srcBeautified) {
                try { body.textContent=JSON.stringify(JSON.parse(src.content),null,2); }
                catch {
                    let code=src.content||'';
                    code=code.replace(/([{};])/g,'$1\n').replace(/\n\s*\n/g,'\n');
                    body.textContent=code;
                }
                srcBeautified=true; btn.textContent='MINIFY'; btn.style.color='var(--yellow)';
            } else {
                body.textContent=src.content||'(empty)';
                srcBeautified=false; btn.textContent='BEAUTIFY'; btn.style.color='';
            }
        });

        document.getElementById('btn-src-search-toggle').addEventListener('click', () => {
            const bar = document.getElementById('src-search-bar');
            bar.style.display = bar.style.display==='none'?'block':'none';
            if (bar.style.display==='block') document.getElementById('src-file-search').focus();
        });

        document.getElementById('src-file-search').addEventListener('input', e => {
            if (selectedSrcIdx===null) return;
            const src = capturedData.sources[selectedSrcIdx];
            const q = e.target.value.toLowerCase();
            const body = document.getElementById('src-detail-body');
            if (!q){body.textContent=src.content||'';return;}
            const matched=(src.content||'').split('\n').map((line,i)=>
                line.toLowerCase().includes(q)?`[${String(i+1).padStart(4,' ')}] ${line}`:null
            ).filter(Boolean);
            body.textContent=matched.length?matched.join('\n'):'(no matches)';
        });

        fileList = document.getElementById('src-file-list');
    }

    // Just update the file list HTML
    fileList.innerHTML = fileListHtml;

    // Attach click handlers on file items
    fileList.querySelectorAll('[data-src-idx]').forEach(el => {
        el.addEventListener('click', () => {
            selectedSrcIdx = parseInt(el.dataset.srcIdx);
            srcBeautified = false;
            const src = capturedData.sources[selectedSrcIdx];
            if (!src) return;
            fileList.querySelectorAll('[data-src-idx]').forEach(e=>e.classList.remove('selected'));
            el.classList.add('selected');
            document.getElementById('src-detail-label').textContent = shortUrl(src.url);
            document.getElementById('src-detail-label').title = src.url;
            document.getElementById('src-detail-body').textContent = src.content||'(empty)';
            document.getElementById('btn-beautify').textContent = 'BEAUTIFY';
            document.getElementById('btn-beautify').style.color = '';
            document.getElementById('src-detail-pane').style.display = 'flex';
        });
    });
}

// ── WebSocket ──
function renderWSList() {
    const list = document.getElementById('ws-list');
    if (!capturedData.websockets.length) {
        list.innerHTML=`<div class="empty-state"><div class="icon">◎</div><p>No WS connections</p><div class="hint">Start → open page with WebSocket</div></div>`;
        return;
    }
    list.innerHTML=capturedData.websockets.map((ws,i)=>`
        <div class="net-item ws-item ${i===selectedWsIdx?'selected':''}" data-ws-idx="${i}">
            <span class="method-tag m-WS">WS</span>
            <span class="status-badge ${ws.status==='open'?'s-2xx':'s-4xx'}">${ws.status.toUpperCase()}</span>
            <span class="net-url" title="${ws.url}">${shortUrl(ws.url)}</span>
            <span style="font-size:9px;color:var(--muted)">${ws.messages.length} msg</span>
        </div>`).join('');

    list.querySelectorAll('[data-ws-idx]').forEach(el=>{
        el.addEventListener('click',()=>{
            selectedWsIdx=parseInt(el.dataset.wsIdx);
            renderWSList();
            const ws=capturedData.websockets[selectedWsIdx];
            if (!ws) return;
            document.getElementById('ws-detail-url').textContent=ws.url;
            const msgs=document.getElementById('ws-messages');
            msgs.innerHTML=ws.messages.length?ws.messages.map(m=>{
                const col=m.dir==='IN'?'var(--green)':'var(--cyan)';
                let data=m.data||'';
                try{data=JSON.stringify(JSON.parse(data),null,2);}catch{}
                return `<div style="padding:5px 10px;border-bottom:1px solid var(--border);">
                    <span style="color:${col};font-size:9px;font-weight:600">${m.dir==='IN'?'▼ IN':'▲ OUT'}</span>
                    <span style="color:var(--muted);font-size:9px;margin-left:8px">${m.time}</span>
                    <pre style="color:${col};font-size:9px;margin-top:3px;white-space:pre-wrap;word-break:break-all;max-height:60px;overflow:hidden">${data}</pre>
                </div>`;
            }).join(''):`<div style="padding:10px;color:var(--muted);font-size:10px">No messages yet</div>`;
            document.getElementById('ws-detail').style.display='flex';
        });
    });
}

// ────────────────────────────────────────────
// AUTO REFRESH — smart: only update what changed
// ────────────────────────────────────────────
function refreshState() {
    chrome.runtime.sendMessage({action:'GET_STATE'}, res => {
        if (!res) return;

        const prevCount = capturedData.network.length;
        const prevSrcCount = capturedData.sources.length;
        const prevWsCount = capturedData.websockets.length;

        capturedData = res.capturedData;

        // Pill + dot
        const pill = document.getElementById('tracking-pill');
        const dot = document.getElementById('live-dot');
        if (res.isTrackingNetwork) {
            pill.textContent='TRACING'; pill.classList.add('active'); dot.classList.add('active');
        } else {
            pill.textContent='IDLE'; pill.classList.remove('active'); dot.classList.remove('active');
        }

        updateStats();

        // Only re-render network list if count changed
        if (capturedData.network.length !== prevCount) {
            renderNetList();
        }

        // If currently viewing a request, refresh detail pane if body was "Loading..."
        if (selectedNetIdx !== null) {
            const e = capturedData.network[selectedNetIdx];
            if (e && selectedDetailTab === 'response' && e.responseBody !== 'Loading...') {
                const body = document.getElementById('detail-body');
                if (body && body.textContent.includes('Waiting for response')) {
                    renderDetailPane();
                }
            }
        }

        // Sources + Storage — only re-render if count changed (not every 1.5s)
        if (capturedData.sources.length !== prevSrcCount) {
            renderSources();
        }

        // WS only if changed
        if (capturedData.websockets.length !== prevWsCount) {
            renderWSList();
        }
    });
}

// Init
refreshState();
setInterval(refreshState, 2000); // 2s instead of 1.5s — less aggressive

// ── Filters ──
document.getElementById('net-search').addEventListener('input', renderNetList);
document.getElementById('net-method-filter').addEventListener('change', renderNetList);
document.getElementById('net-status-filter').addEventListener('change', renderNetList);
document.getElementById('src-search').addEventListener('input', renderSources);

// ── Network controls ──
document.getElementById('btn-start').addEventListener('click', () => {
    log('Attaching debugger...','net');
    chrome.runtime.sendMessage({action:'START_NETWORK'}, res => {
        if (res?.error){log('ERROR: '+res.error,'error');return;}
        log('Trace started — reload page to capture requests','net');
        refreshState();
    });
});

document.getElementById('btn-stop').addEventListener('click', () => {
    chrome.runtime.sendMessage({action:'STOP_NETWORK'}, () => {
        log('Trace stopped','net');
        refreshState();
    });
});

// ── WebSocket ──
document.getElementById('btn-start-ws').addEventListener('click', () => {
    log('Starting WebSocket capture...','net');
    chrome.runtime.sendMessage({action:'START_WEBSOCKET'}, res => {
        if (res?.error){log('ERROR: '+res.error,'error');return;}
        log('WS capture active — open page with WebSocket','net');
        refreshState();
    });
});

document.getElementById('btn-export-ws').addEventListener('click', () => {
    if (!capturedData.websockets.length){log('No WS data','error');return;}
    const blob=new Blob([JSON.stringify(capturedData.websockets,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`devvault_ws_${Date.now()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
    log('WS exported','export');
});

// ── Storage ──
document.getElementById('btn-scrape-storage').addEventListener('click', () => {
    log('Scanning storage...','storage');
    chrome.runtime.sendMessage({action:'SCRAPE_STORAGE'}, res => {
        if (res?.error){log('ERROR: '+res.error,'error');return;}
        if (res.storage) capturedData.storage=res.storage;
        log('Storage extracted','storage');
        updateStats(); renderStorage();
    });
});

// Copy all storage as JSON directly
document.getElementById('btn-copy-storage-all').addEventListener('click', () => {
    if (!Object.keys(capturedData.storage).length){log('No storage data — click EXTRACT first','error');return;}
    navigator.clipboard.writeText(JSON.stringify(capturedData.storage, null, 2)).then(() => {
        const btn = document.getElementById('btn-copy-storage-all');
        btn.textContent='COPIED!'; btn.classList.add('copied');
        setTimeout(()=>{btn.textContent='COPY ALL';btn.classList.remove('copied');},1500);
        log('Storage copied to clipboard','storage');
    });
});

document.getElementById('btn-scrape-idb').addEventListener('click', () => {
    log('Scanning IndexedDB...','storage');
    chrome.runtime.sendMessage({action:'SCRAPE_INDEXEDDB'}, res => {
        if (res?.error){log('ERROR: '+res.error,'error');return;}
        if (res.indexedDB) capturedData.storage.indexedDB=res.indexedDB;
        log('IndexedDB extracted','storage');
        renderStorage();
    });
});

document.getElementById('btn-export-storage').addEventListener('click', () => {
    if (!Object.keys(capturedData.storage).length){log('No storage data','error');return;}
    const blob=new Blob([JSON.stringify(capturedData.storage,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`devvault_storage_${Date.now()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
    log('Storage exported','export');
});

// ── Sources ──
document.getElementById('btn-scrape-sources').addEventListener('click', () => {
    log('Scanning sources...','sources');
    chrome.runtime.sendMessage({action:'SCRAPE_SOURCES'}, res => {
        if (res?.error){log('ERROR: '+res.error,'error');return;}
        if (res.sources) capturedData.sources=res.sources;
        log(`Extracted ${res.scrapedCount} files`,'sources');
        updateStats(); renderSources();
    });
});

// ── Tools ──
document.getElementById('btn-decode-jwt').addEventListener('click', () => {
    decodeJWT(document.getElementById('jwt-input').value.trim());
});

document.getElementById('btn-jwt-from-storage').addEventListener('click', () => {
    const s=capturedData.storage;
    const vals=[
        ...Object.values(s.localStorage||{}),
        ...Object.values(s.sessionStorage||{})
    ];
    const jwt=vals.find(v=>v&&typeof v==='string'&&v.split('.').length===3&&v.startsWith('ey'));
    if (jwt){
        document.getElementById('jwt-input').value=jwt;
        decodeJWT(jwt);
        log('JWT found in storage','tools');
    } else {
        log('No JWT found in storage','error');
    }
});

function decodeJWT(token) {
    if (!token){log('Paste a JWT token first','error');return;}
    try {
        const parts=token.trim().split('.');
        if (parts.length!==3) throw new Error('Not a valid JWT — must have 3 parts');
        const decode=str=>{
            const pad=str.length%4?str+'='.repeat(4-str.length%4):str;
            return JSON.parse(atob(pad.replace(/-/g,'+').replace(/_/g,'/')));
        };
        const header=decode(parts[0]);
        const payload=decode(parts[1]);
        document.getElementById('jwt-header').textContent=JSON.stringify(header,null,2);
        document.getElementById('jwt-payload').textContent=JSON.stringify(payload,null,2);
        if (payload.exp) {
            const exp=new Date(payload.exp*1000);
            const now=new Date();
            const expired=exp<now;
            const remaining=Math.floor((exp-now)/60000);
            document.getElementById('jwt-exp').textContent=
                `${exp.toLocaleString()}\n${expired?'⚠ EXPIRED':'✓ VALID — '+remaining+' min remaining'}`;
        } else {
            document.getElementById('jwt-exp').textContent='No expiry (exp claim not present)';
        }
        document.getElementById('jwt-output').style.display='block';
        log('JWT decoded successfully','tools');
    } catch(e){
        log('JWT error: '+e.message,'error');
    }
}

function generateCurl(e) {
    if (!e) return '(select a network request first)';
    let curl=`curl -X ${e.method} '${e.url}'`;
    Object.entries(e.requestHeaders||{}).forEach(([k,v])=>{
        if (!['content-length','accept-encoding','connection'].includes(k.toLowerCase()))
            curl+=` \\\n  -H '${k}: ${v}'`;
    });
    if (e.postData) curl+=` \\\n  --data '${e.postData.replace(/'/g,"\\'")}' `;
    return curl;
}

document.getElementById('btn-gen-curl').addEventListener('click', () => {
    if (selectedNetIdx===null){log('Select a request in NETWORK tab first','error');return;}
    const curl=generateCurl(capturedData.network[selectedNetIdx]);
    document.getElementById('curl-output').textContent=curl;
    document.getElementById('curl-output').style.display='block';
    document.getElementById('curl-copy-row').style.display='flex';
    log('cURL generated','tools');
});

document.getElementById('btn-copy-curl').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('curl-output').textContent).then(()=>{
        const btn=document.getElementById('btn-copy-curl');
        btn.textContent='COPIED!'; btn.classList.add('copied');
        setTimeout(()=>{btn.textContent='COPY cURL';btn.classList.remove('copied');},1500);
    });
});

function generateHAR() {
    return JSON.stringify({log:{version:'1.2',creator:{name:'Developer Vault',version:'4.2'},
        entries:capturedData.network.map(e=>({
            startedDateTime:e.timestamp, time:e.timing||0,
            request:{method:e.method||'GET',url:e.url,httpVersion:'HTTP/1.1',
                headers:Object.entries(e.requestHeaders||{}).map(([k,v])=>({name:k,value:v})),
                queryString:[],cookies:[],headersSize:-1,
                bodySize:e.postData?e.postData.length:0,
                postData:e.postData?{mimeType:'application/json',text:e.postData}:undefined},
            response:{status:e.status||0,statusText:e.statusText||'',httpVersion:'HTTP/1.1',
                headers:Object.entries(e.responseHeaders||{}).map(([k,v])=>({name:k,value:v})),
                cookies:[],
                content:{size:e.responseSize||0,mimeType:e.mimeType||'',
                    text:e.base64Encoded?'':(e.responseBody||'')},
                redirectURL:'',headersSize:-1,bodySize:e.responseSize||0},
            cache:{},timings:{send:0,wait:e.timing||0,receive:0}
        }))
    }},null,2);
}

function exportHAR() {
    if (!capturedData.network.length){log('No network data to export','error');return;}
    const blob=new Blob([generateHAR()],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`devvault_${Date.now()}.har`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
    log('HAR exported','export');
}

document.getElementById('btn-export-har').addEventListener('click', exportHAR);
document.getElementById('btn-export-har-tools').addEventListener('click', exportHAR);

function renderSessionStats() {
    const n=capturedData.network;
    const totalSize=n.reduce((a,e)=>a+(e.responseSize||0),0);
    const avgTime=n.length?Math.round(n.reduce((a,e)=>a+(e.timing||0),0)/n.length):0;
    const methods={};
    n.forEach(e=>{methods[e.method]=(methods[e.method]||0)+1;});
    const st={'2xx':0,'3xx':0,'4xx':0,'5xx':0};
    n.forEach(e=>{const k=String(e.status||'')[0]+'xx';if(st[k]!==undefined)st[k]++;});
    document.getElementById('session-stats').innerHTML=[
        `Total Requests : <span>${n.length}</span>`,
        `Total Data     : <span>${formatBytes(totalSize)}</span>`,
        `Avg Response   : <span>${avgTime}ms</span>`,
        `WebSockets     : <span>${capturedData.websockets.length}</span>`,
        `GraphQL Ops    : <span>${n.filter(e=>e.isGraphQL).length}</span>`,
        `Sources        : <span>${capturedData.sources.length}</span>`,
        `2xx OK         : <span>${st['2xx']}</span>`,
        `3xx Redirect   : <span>${st['3xx']}</span>`,
        `4xx Client Err : <span style="color:var(--orange)">${st['4xx']}</span>`,
        `5xx Server Err : <span style="color:var(--red)">${st['5xx']}</span>`,
        `Methods        : <span>${Object.entries(methods).map(([k,v])=>k+':'+v).join(', ')}</span>`
    ].join('<br>');
}

document.getElementById('btn-refresh-stats').addEventListener('click', renderSessionStats);

// ── Export sources ZIP ──
function doSourcesZip(cb) {
    if (typeof JSZip==='undefined'){log('JSZip missing','error');return;}
    const zip=new JSZip(); const seen={};
    capturedData.sources.forEach((src,i)=>{
        if (!src.content?.length) return;
        const ext=src.type==='Script'?'js':src.type==='Stylesheet'?'css':'html';
        let fname;
        try{const u=new URL(src.url);fname=u.pathname.replace(/\//g,'_').replace(/^_/,'')||`file_${i}`;if(!fname.endsWith('.'+ext))fname+='.'+ext;}
        catch{fname=`file_${i}.${ext}`;}
        if(seen[fname]){seen[fname]++;fname=fname.replace('.'+ext,`_${seen[fname]}.`+ext);}else seen[fname]=1;
        zip.file(`Sources/${fname}`,src.content);
    });
    zip.file('Sources/_index.json',JSON.stringify(capturedData.sources.map(s=>({url:s.url,type:s.type,size:s.size})),null,2));
    cb(zip);
}

document.getElementById('btn-export-sources').addEventListener('click', () => {
    if (!capturedData.sources.length){log('No sources','error');return;}
    doSourcesZip(zip=>{
        zip.generateAsync({type:'blob'}).then(blob=>{
            const url=URL.createObjectURL(blob);
            const a=document.createElement('a');
            a.href=url; a.download=`devvault_sources_${Date.now()}.zip`;
            document.body.appendChild(a); a.click();
            setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
            log('Sources exported','export');
        });
    });
});

document.getElementById('btn-export-net').addEventListener('click', () => {
    if (!capturedData.network.length){log('No network data','error');return;}

    // Export as readable format — each API call with response clearly shown
    const readable = capturedData.network.map((e,i) => ({
        index: i+1,
        url: e.url,
        method: e.method,
        status: e.status,
        timing: e.timing ? e.timing+'ms' : null,
        mimeType: e.mimeType,
        timestamp: e.timestamp,
        requestHeaders: e.requestHeaders,
        postData: e.postData || null,
        responseHeaders: e.responseHeaders,
        // Response body clearly at top level
        responseBody: (() => {
            if (!e.responseBody || e.responseBody === 'Loading...') return null;
            if (e.base64Encoded) return '[binary data]';
            try { return JSON.parse(e.responseBody); } catch { return e.responseBody; }
        })(),
        responseSize: e.responseSize
    }));

    const blob=new Blob([JSON.stringify(readable,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=`devvault_network_${Date.now()}.json`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
    log('Network exported — response bodies included','export');
});

// ── Export All ZIP ──
document.getElementById('btn-export-all').addEventListener('click', () => {
    if (typeof JSZip==='undefined'){log('JSZip missing','error');return;}
    chrome.runtime.sendMessage({action:'GET_STATE'}, res => {
        if (res?.capturedData) capturedData=res.capturedData;
        const zip=new JSZip(); let has=false;

        if (capturedData.network.length) {
            zip.file('Network/api_calls.json',JSON.stringify(capturedData.network,null,2));
            zip.file('Network/export.har',generateHAR());
            has=true;
        }
        if (Object.keys(capturedData.storage).length) {
            zip.file('Storage/storage.json',JSON.stringify(capturedData.storage,null,2));
            has=true;
        }
        if (capturedData.websockets.length) {
            zip.file('WebSockets/ws_data.json',JSON.stringify(capturedData.websockets,null,2));
            has=true;
        }
        if (capturedData.sources.length) {
            const seen={};
            capturedData.sources.forEach((src,i)=>{
                if(!src.content?.length) return;
                const ext=src.type==='Script'?'js':src.type==='Stylesheet'?'css':'html';
                let fname;
                try{const u=new URL(src.url);fname=u.pathname.replace(/\//g,'_').replace(/^_/,'')||`file_${i}`;if(!fname.endsWith('.'+ext))fname+='.'+ext;}
                catch{fname=`file_${i}.${ext}`;}
                if(seen[fname]){seen[fname]++;fname=fname.replace('.'+ext,`_${seen[fname]}.`+ext);}else seen[fname]=1;
                zip.file(`Sources/${fname}`,src.content);
            });
            has=true;
        }

        if (!has){log('Nothing to export','error');return;}
        log('Building archive...','export');
        zip.generateAsync({type:'blob'}).then(blob=>{
            const url=URL.createObjectURL(blob);
            const a=document.createElement('a');
            a.href=url; a.download=`devvault_full_${Date.now()}.zip`;
            document.body.appendChild(a); a.click();
            setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
            log('Full export complete','export');
        });
    });
});

// ── Clear ──
document.getElementById('btn-clear').addEventListener('click', () => {
    chrome.runtime.sendMessage({action:'STOP_NETWORK'});
    chrome.runtime.sendMessage({action:'CLEAR_DATA'}, () => {
        capturedData={network:[],storage:{},sources:[],websockets:[]};
        selectedNetIdx=null; selectedSrcIdx=null; selectedWsIdx=null;
        document.getElementById('detail-pane').style.display='none';
        document.getElementById('log-list').innerHTML='';
        // Reset sources container so it rebuilds from scratch
        document.getElementById('src-list').innerHTML='';
        document.getElementById('src-list').style.cssText='';
        updateStats();
        renderNetList(); renderStorage(); renderSources(); renderWSList();
        log('Vault wiped — all data cleared','error');
    });
});
