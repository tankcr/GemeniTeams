/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    v3.6 - FINAL VISUAL ALIGNMENT FIX (Complete Logic Set)
*/

// --- CONFIGURATION ---
const MAX_LOOPS = 5;
const GITHUB_CONFIG_URL = "https://raw.githubusercontent.com/tankcr/GemeniTeams/refs/heads/main/selectors.json"; 

let loopCount = 0;
let stopSignal = false;
let currentKnowledgeText = ""; 
let globalGems = []; 
let SELECTORS = { editor: '.ql-editor, div[contenteditable="true"]', sendBtn: 'button[aria-label="Send message"]' };

// ========================================================================
// 1. UTILITY & VISUAL FUNCTIONS (Independent Helpers)
// ========================================================================

function setTheme(color) {
    const header = document.querySelector('header');
    if (header) header.style.background = color;
    document.body.style.borderLeftColor = color;
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    const target = document.getElementById(id);
    if(target) target.classList.add('active-screen');
}

function resetForm() {
    const nameInput = document.getElementById('newGemName');
    const roleInput = document.getElementById('newGemRole');
    const fileInput = document.getElementById('hiddenFile');
    const display = document.getElementById('fileNameDisplay');
    if(nameInput) nameInput.value = "";
    if(roleInput) roleInput.value = "";
    if(fileInput) fileInput.value = "";
    if(display) display.innerText = "📂 Click to Attach File";
    currentKnowledgeText = "";
}

function resetConversation() {
    stopSignal = true;
    setTheme('#0078d4'); 
    removeHUD();
    resetUI();
}

function resetUI() {
    document.getElementById('startMeetingBtn').disabled = false;
    document.getElementById('resetBtn').style.display = 'none';
    setTheme('#0078d4'); 
    removeHUD();
}

// --- VISUAL & COMMUNICATION UTILS ---

async function updateHUD(text, color) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (t, c) => {
            let h = document.getElementById('gemini-hud');
            if (!h) {
                h = document.createElement('div'); h.id = 'gemini-hud';
                Object.assign(h.style, {
                    position:'fixed', top:'20px', right:'20px', padding:'10px 20px',
                    background:'rgba(255,255,255,0.95)', borderLeft:'5px solid #333',
                    borderRadius:'8px', boxShadow:'0 4px 12px rgba(0,0,0,0.15)',
                    zIndex:'99999', fontFamily:'sans-serif', fontSize:'14px', fontWeight:'bold'
                });
                document.body.appendChild(h);
            }
            h.style.borderLeftColor = c; h.innerText = t; h.style.display = 'block';
        },
        args: [text, color]
    });
}

async function removeHUD() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => { const h = document.getElementById('gemini-hud'); if(h) h.style.display='none'; }
    });
}

// ========================================================================
// 2. DATA & CONFIG OPS
// ========================================================================

async function fetchRemoteConfig() {
    try {
        const response = await fetch(GITHUB_CONFIG_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Network response was not ok");
        const remoteSelectors = await response.json();
        
        if (remoteSelectors.editor && remoteSelectors.sendBtn) {
            SELECTORS = remoteSelectors;
        }
    } catch (error) { console.warn(`GeminiTeams: Using Fallback Config (${error.message}).`); }
}

async function exportTeamData() {
    if (globalGems.length === 0) return console.warn("GeminiTeams: No specialists to export.");
    const dataStr = JSON.stringify(globalGems, null, 2);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "gemini_team_backup.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function importTeamData(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        const importedGems = JSON.parse(text);
        if (!Array.isArray(importedGems)) throw new Error("Invalid JSON");
        if(confirm(`Found ${importedGems.length} specialists. Import?`)) {
            globalGems = [...globalGems, ...importedGems];
            await chrome.storage.local.set({ myGems: globalGems });
            loadGems();
            updateHUD(`Imported ${importedGems.length} specialists.`, '#28a745');
        }
    } catch (err) { console.error("Import Failed:", err); updateHUD("Import Failed: Check Console", 'red'); }
    e.target.value = ''; 
}

async function loadGems() {
    const container = document.getElementById('gemList');
    if (!container) return;
    container.innerHTML = '';
    
    if (!chrome.storage || !chrome.storage.local) {
        container.innerHTML = '<p style="color:red">Error: Storage permission missing.</p>';
        return;
    }

    const result = await chrome.storage.local.get("myGems");
    globalGems = result.myGems || [];

    if (globalGems.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; margin-top:30px; font-size: 0.9em;">No Specialists hired yet.</p>';
        return;
    }

    globalGems.forEach((gem, index) => {
        const card = document.createElement('div');
        card.className = 'gem-card';
        card.style.borderLeftColor = gem.color || '#ccc';

        card.innerHTML = `
            <div class="gem-header">
                <label class="gem-label">
                    <input type="checkbox" value="${index}" checked> 
                    <span style="color:${gem.color || '#333'}; margin-right:5px;">●</span>
                    <span>${gem.name}</span>
                </label>
                <div>
                    <span class="icon-btn settings-toggle" data-index="${index}" title="Edit Specialist">⚙️</span>
                    <span class="icon-btn delete" data-index="${index}" title="Remove Specialist">🗑️</span>
                </div>
            </div>
            <div class="edit-panel" id="edit-panel-${index}">
                <div class="edit-field"><label>Name</label><input type="text" class="edit-input" id="edit-name-${index}" value="${gem.name}"></div>
                <div class="edit-field"><label>Instructions</label><textarea rows="3" class="edit-input" id="edit-role-${index}">${gem.instruction}</textarea></div>
                <div class="color-row"><label>Color:</label><input type="color" id="edit-color-${index}" value="${gem.color || '#0078d4'}"></div>
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <button class="btn-small update-file-btn" data-index="${index}">📂 Update File</button>
                    <button class="btn-small" style="background:#0078d4; color:white;" onclick="saveGemEdits(${index})">Save Changes</button>
                </div>
                <div id="edit-file-status-${index}" style="font-size:0.7em; color:green; margin-top:2px;"></div>
            </div>
        `;
        container.appendChild(card);
    });

    document.querySelectorAll('.settings-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => document.getElementById(`edit-panel-${e.target.dataset.index}`).classList.toggle('open'));
    });
    document.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(!confirm("Delete Specialist?")) return;
            globalGems.splice(e.target.dataset.index, 1);
            await chrome.storage.local.set({ myMems: globalGems });
            loadGems();
        });
    });
    document.querySelectorAll('.update-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const input = document.getElementById('updateFileInput');
            input.setAttribute('data-editing-index', e.target.dataset.index);
            input.click();
        });
    });
}

async function saveGem() {
    const name = document.getElementById('newGemName').value;
    const role = document.getElementById('newGemRole').value;
    const color = document.getElementById('newGemColor').value;
    if (!name || !role) return console.warn("GeminiTeams: Name/Instructions required.");
    globalGems.push({ name, instruction: role, knowledge: currentKnowledgeText || "", color: color });
    await chrome.storage.local.set({ myGems: globalGems });
    resetForm();
    showScreen('screen-meeting');
    loadGems();
}

window.saveGemEdits = async (index) => {
    globalGems[index].name = document.getElementById(`edit-name-${index}`).value;
    globalGems[index].instruction = document.getElementById(`edit-role-${index}`).value;
    globalGems[index].color = document.getElementById(`edit-color-${index}`).value;
    await chrome.storage.local.set({ myGems: globalGems });
    loadGems();
};

async function handleUpdateFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const idx = e.target.getAttribute('data-editing-index');
    globalGems[idx].knowledge = await file.text();
    document.getElementById(`edit-file-status-${idx}`).innerText = `Updated: ${file.name}`;
    await chrome.storage.local.set({ myGems: globalGems });
}

// --- 3. CORE LOGIC & EXECUTION ---

function setupEventListeners() {
    const goCreate = document.getElementById('goToCreateBtn');
    const cancelCreate = document.getElementById('cancelCreateBtn');
    if(goCreate) goCreate.addEventListener('click', () => showScreen('screen-create'));
    if(cancelCreate) cancelCreate.addEventListener('click', () => { resetForm(); showScreen('screen-meeting'); });

    const fileInput = document.getElementById('hiddenFile');
    const uploadArea = document.getElementById('uploadClickArea');
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('fileNameDisplay').innerText = `📄 ${file.name}`;
            currentKnowledgeText = await file.text();
        });
    }

    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    if (exportBtn) exportBtn.addEventListener('click', exportTeamData);
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', importTeamData);
    }

    const saveBtn = document.getElementById('saveGemBtn');
    if(saveBtn) saveBtn.addEventListener('click', saveGem);
    const startBtn = document.getElementById('startMeetingBtn');
    if(startBtn) startBtn.addEventListener('click', startMeeting);
    
    const resetBtn = document.getElementById('resetBtn');
    if(resetBtn) resetBtn.addEventListener('click', resetConversation);
    document.getElementById('updateFileInput').addEventListener('change', handleUpdateFile);
}

async function startMeeting() {
    const selectedIndices = Array.from(document.querySelectorAll('#gemList input:checked')).map(cb => cb.value);
    const topicEl = document.getElementById('userInput');
    
    if (selectedIndices.length === 0) return console.warn("GeminiTeams: Select at least one Specialist.");
    if (!topicEl || !topicEl.value) return console.warn("GeminiTeams: Provide a topic.");

    await ensureGeminiTab();
    
    setTheme('#333'); 
    await updateHUD("Initializing Team...", "#333");
    
    document.getElementById('resetBtn').style.display = 'block';
    stopSignal = false;
    loopCount = 0;
    
    const selectedGems = selectedIndices.map(idx => globalGems[idx]);
    const squadNames = selectedGems.map(g => g.name).join(", ");
    
    runMeetingLoop(selectedGems, topicEl.value, "User", squadNames);
}

async function runMeetingLoop(selectedGems, topic, lastSpeaker, squadNames) {
    if (stopSignal || loopCount >= MAX_LOOPS) {
        setTheme('#dc3545'); 
        await updateHUD("Max Loops Reached.", "#dc3545");
        resetUI();
        return;
    }
    loopCount++;

    const btn = document.getElementById('startMeetingBtn');
    if(btn) { btn.innerText = `🔄 Round ${loopCount}...`; btn.disabled = true; }

    try {
        let currentContext = lastSpeaker;

        for (const gem of selectedGems) {
            if (stopSignal) return;
            
            const activeColor = gem.color || "#0078d4";
            setTheme(activeColor); 
            await updateHUD(`${gem.name} is thinking...`, activeColor); 

            const prompt = `
*** ROLE: ${gem.name} ***
CORE INSTRUCTIONS: ${gem.instruction}

*** SQUAD PROTOCOL: DYNAMIC DEFERENCE ***
ACTIVE TEAM: ${squadNames}
CURRENT TOPIC: "${topic}"

RULES OF ENGAGEMENT:
1. IDENTIFY THE EXPERT: Look at the 'Active Team' list and the 'Current Topic'.
2. SELF-ASSESSMENT: Are you the execution authority?
   - IF YES: Provide concrete plan/code.
   - IF NO: Defer execution details to the Authority.
3. ROLE SPECIFIC OVERRIDES (The "Yes, And" Rule):
   - **Creative/Designers:** If the topic is technical (e.g., scraping, databases), DO NOT discuss the backend. Instead, ask: "How will we visualize this?" or "What is the user experience?" Pivot to Dashboards, UI, or UX immediately.
   - **Architects:** Focus on Risk, Scope, and Integration. Do not debug code unless it breaks architecture.

CONTEXT: Previous input from: ${currentContext}.
YOUR KNOWLEDGE BASE: ${gem.knowledge.substring(0, 15000)}

TASK: Offer your expert input adhering to the PROTOCOL above.
            `;

            await injectPromptIntoGemini(prompt);
            await waitForIdleState();
            currentContext = gem.name;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (stopSignal) return;

        // B. PM PHASE
        setTheme('#28a745'); // Green for PM
        await updateHUD("Project Manager Synthesizing...", "#28a745");
        
        const pmPrompt = `
*** ROLE: Project Manager ***
CONTEXT: Review responses regarding "${topic}".
TASK: Summarize consensus and ask User if they want more feedback from specific specialists.
        `;
        await injectPromptIntoGemini(pmPrompt);
        await waitForIdleState();

        if (stopSignal) return;

        // C. LISTENING PHASE
        setTheme('#666'); // Grey for Listening
        await updateHUD("Waiting for Reply...", "#666");
        
        const userReply = await waitForUserReply();
        if (userReply && !stopSignal) {
            runMeetingLoop(selectedGems, userReply, "The User (You)", squadNames);
        } else {
            removeHUD(); 
            resetUI();
        }

    } catch (e) {
        if (!stopSignal) {
            console.error(e);
            await updateHUD("Fatal Error: Check Console", "red");
            resetUI();
        }
    }
}

async function ensureGeminiTab() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes("gemini.google.com")) {
        const geminiTabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
        if (geminiTabs.length > 0) {
            await chrome.tabs.update(geminiTabs[0].id, { active: true });
        } else {
            await chrome.tabs.create({ url: "https://gemini.google.com" });
        }
        await new Promise(r => setTimeout(r, 2000));
    }
}

async function injectPromptIntoGemini(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (msg, sel) => {
            const editor = document.querySelector(sel.editor); 
            if (editor) {
                editor.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, msg);
                await new Promise(r => setTimeout(r, 500));
                const btn = document.querySelector(sel.sendBtn);
                if(btn) { btn.click(); await new Promise(r => setTimeout(r, 3000)); }
            }
        },
        args: [text, SELECTORS]
    });
}

async function waitForIdleState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
            return new Promise(r => {
                const getBtn = () => document.querySelector(sel.sendBtn);
                const check = () => {
                    const btn = getBtn();
                    return btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
                };
                
                if (check()) return r(true);
                const obs = new MutationObserver(() => {
                    if (check()) { obs.disconnect(); r(true); }
                });
                obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
                setTimeout(() => { obs.disconnect(); r(true); }, 45000);
            });
        },
        args: [SELECTORS]
    });
}

async function waitForUserReply() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            return new Promise(r => {
                const getCount = () => document.querySelectorAll('.user-query').length || document.querySelectorAll('[data-test-id="user-query"]').length;
                const initial = getCount();
                const poll = setInterval(() => {
                    if (getCount() > initial) {
                        clearInterval(poll);
                        const queries = document.querySelectorAll('.user-query'); 
                        resolve(queries[queries.length - 1]?.innerText || "Reply");
                    }
                }, 1000);
            });
        }
    }).then(results => results[0].result);
}