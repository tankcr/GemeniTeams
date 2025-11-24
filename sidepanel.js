/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    v2.7 - Silent Operation (Removed all alert() dialogs)
*/

// --- CONFIGURATION ---
const MAX_LOOPS = 5;
const GITHUB_CONFIG_URL = "https://raw.githubusercontent.com/tankcr/GemeniTeams/refs/heads/main/selectors.json"; 

let loopCount = 0;
let stopSignal = false;
let currentKnowledgeText = ""; 
let globalGems = []; 
let SELECTORS = { editor: '.ql-editor, div[contenteditable="true"]', sendBtn: 'button[aria-label="Send message"]' };

// --- 1. INITIALIZATION ---
window.addEventListener('load', async () => {
    try {
        console.log("GeminiTeams: UI Loaded.");
        await fetchRemoteConfig();
        loadGems();
        setupEventListeners();
        document.querySelector('header').style.transition = "background 0.5s ease";
        document.body.style.transition = "border-color 0.5s ease";
        document.body.style.borderLeft = "5px solid #0078d4"; // Initial setup
        setTheme('#0078d4'); // Set default theme
    } catch (e) {
        console.error("GeminiTeams Init Error:", e);
    }
});

async function fetchRemoteConfig() {
    try {
        const r = await fetch(GITHUB_CONFIG_URL);
        if (r.ok) {
            const json = await r.json();
            if (json.editor) SELECTORS = json;
        }
    } catch (e) { console.warn("Using Fallback Config"); }
}

function setupEventListeners() {
    const goCreate = document.getElementById('goToCreateBtn');
    const cancelCreate = document.getElementById('cancelCreateBtn');
    if(goCreate) goCreate.addEventListener('click', () => showScreen('screen-create'));
    if(cancelCreate) cancelCreate.addEventListener('click', () => { resetForm(); showScreen('screen-meeting'); });

    const newFileBtn = document.getElementById('newFileBtn');
    const newFileInput = document.getElementById('newFileInput');
    if (newFileBtn) {
        newFileBtn.addEventListener('click', () => newFileInput.click());
        newFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('newFileDisplay').innerText = `📄 ${file.name}`;
            currentKnowledgeText = await file.text();
        });
    }
    document.getElementById('saveGemBtn').addEventListener('click', createNewGem);
    document.getElementById('startMeetingBtn').addEventListener('click', startMeeting);
    document.getElementById('resetBtn').addEventListener('click', resetConversation);
    document.getElementById('exportBtn').addEventListener('click', exportTeamData);
    
    const impBtn = document.getElementById('importBtn');
    const impFile = document.getElementById('importFile');
    if (impBtn) {
        impBtn.addEventListener('click', () => impFile.click());
        impFile.addEventListener('change', importTeamData);
    }
    document.getElementById('updateFileInput').addEventListener('change', handleUpdateFile);
}

// --- 2. VISUAL THEME ENGINE (CHAMELEON) ---
function setTheme(color) {
    const header = document.querySelector('header');
    if (header) header.style.background = color;
    document.body.style.borderLeftColor = color;
}

// --- 3. RENDER & EDIT LOGIC ---
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
                    <span style="color:${gem.color || '#333'}">●</span>
                    <span>${gem.name}</span>
                </label>
                <div>
                    <span class="icon-btn settings-toggle" data-index="${index}">⚙️</span>
                    <span class="icon-btn delete" data-index="${index}">🗑️</span>
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
            await chrome.storage.local.set({ myGems: globalGems });
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

async function createNewGem() {
    const name = document.getElementById('newGemName').value;
    const role = document.getElementById('newGemRole').value;
    const color = document.getElementById('newGemColor').value;
    if (!name || !role) return console.warn("GeminiTeams: Name/Instructions required.");
    globalGems.push({ name, instruction: role, knowledge: tempCreateKnowledge || "", color: color });
    await chrome.storage.local.set({ myGems: globalGems });
    document.getElementById('newGemName').value = "";
    document.getElementById('newGemRole').value = "";
    tempCreateKnowledge = "";
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

// --- 4. MEETING ENGINE (COLOR SYNCED) ---

async function startMeeting() {
    const selectedIndices = Array.from(document.querySelectorAll('#gemList input:checked')).map(cb => cb.value);
    const topicEl = document.getElementById('userInput');
    
    if (selectedIndices.length === 0) return console.warn("GeminiTeams: Select at least one Specialist.");
    if (!topicEl || !topicEl.value) return console.warn("GeminiTeams: Please provide a topic.");

    await ensureGeminiTab();
    
    // Default Start Color
    setTheme('#333'); 
    await updateHUD("Initializing...", "#333");
    
    document.getElementById('resetBtn').style.display = 'block';
    stopSignal = false;
    loopCount = 0;
    
    const selectedGems = selectedIndices.map(idx => globalGems[idx]);
    const squadNames = selectedGems.map(g => g.name).join(", ");
    
    runMeetingLoop(selectedGems, topicEl.value, "User", squadNames);
}

async function runMeetingLoop(selectedGems, topic, lastSpeaker, squadNames) {
    if (stopSignal || loopCount >= MAX_LOOPS) {
        setTheme('#dc3545'); // Red for Stop
        await updateHUD("Max Loops Reached.", "#dc3545");
        resetUI();
        return;
    }
    loopCount++;

    const btn = document.getElementById('startMeetingBtn');
    if(btn) { btn.innerText = `🔄 Round ${loopCount}...`; btn.disabled = true; }

    try {
        let currentContext = lastSpeaker;

        // A. SPECIALIST PHASE
        for (const gem of selectedGems) {
            if (stopSignal) return;
            
            // USE THE GEM'S CUSTOM COLOR for HUD and SIDE PANEL
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
            // Clean up if user clicked reset
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

function resetConversation() {
    stopSignal = true;
    setTheme('#0078d4'); // Reset to Default Blue
    removeHUD();
    resetUI();
}

function resetUI() {
    document.getElementById('startMeetingBtn').disabled = false;
    document.getElementById('resetBtn').style.display = 'none';
    removeHUD();
}

// --- UTILS & VISUAL INJECTION ---

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
                if(btn) { btn.click(); await new Promise(r => setTimeout(r, 3000)); } // Handshake Delay Included
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
    }).then(res => res[0].result);
}