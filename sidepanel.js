/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    v3.0 - Full CRUD, Edit Mode, Color Customization
*/

const MAX_LOOPS = 5;
const GITHUB_CONFIG_URL = "https://raw.githubusercontent.com/tankcr/GemeniTeams/refs/heads/main/selectors.json"; 

let loopCount = 0;
let stopSignal = false;
let globalGems = []; 
let tempCreateKnowledge = ""; // For new gem creation
let SELECTORS = { editor: '.ql-editor, div[contenteditable="true"]', sendBtn: 'button[aria-label="Send message"]' };

// --- 1. INITIALIZATION ---
window.addEventListener('load', async () => {
    await fetchRemoteConfig();
    loadGems();
    setupEventListeners();
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
    // Navigation
    document.getElementById('goToCreateBtn').addEventListener('click', () => showScreen('screen-create'));
    document.getElementById('cancelCreateBtn').addEventListener('click', () => showScreen('screen-meeting'));

    // New Gem Creation Logic
    const newFileBtn = document.getElementById('newFileBtn');
    const newFileInput = document.getElementById('newFileInput');
    if (newFileBtn) {
        newFileBtn.addEventListener('click', () => newFileInput.click());
        newFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('newFileDisplay').innerText = `📄 ${file.name}`;
            tempCreateKnowledge = await file.text();
        });
    }
    document.getElementById('saveGemBtn').addEventListener('click', createNewGem);

    // Meeting Controls
    document.getElementById('startMeetingBtn').addEventListener('click', startMeeting);
    document.getElementById('resetBtn').addEventListener('click', resetConversation);

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', exportTeamData);
    const impBtn = document.getElementById('importBtn');
    const impFile = document.getElementById('importFile');
    if (impBtn) {
        impBtn.addEventListener('click', () => impFile.click());
        impFile.addEventListener('change', importTeamData);
    }
    
    // Shared Update Input (For editing existing gems)
    document.getElementById('updateFileInput').addEventListener('change', handleUpdateFile);
}

// --- 2. RENDER & EDIT LOGIC (The Big Change) ---
async function loadGems() {
    const container = document.getElementById('gemList');
    container.innerHTML = '';
    
    const result = await chrome.storage.local.get("myGems");
    globalGems = result.myGems || [];

    if (globalGems.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; margin-top:20px;">No Specialists.</p>';
        return;
    }

    globalGems.forEach((gem, index) => {
        const card = document.createElement('div');
        card.className = 'gem-card';
        card.style.borderLeftColor = gem.color || '#ccc'; // Visual indicator

        // HTML Structure for View + Edit Mode
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
                <div class="edit-field">
                    <label>Name</label>
                    <input type="text" class="edit-input" id="edit-name-${index}" value="${gem.name}">
                </div>
                <div class="edit-field">
                    <label>Instructions</label>
                    <textarea rows="3" class="edit-input" id="edit-role-${index}">${gem.instruction}</textarea>
                </div>
                <div class="color-row">
                    <label>Border Color:</label>
                    <input type="color" id="edit-color-${index}" value="${gem.color || '#0078d4'}">
                </div>
                <div style="display:flex; gap:5px; margin-top:5px;">
                    <button class="btn-small update-file-btn" data-index="${index}">📂 Update File</button>
                    <button class="btn-small" style="background:#0078d4; color:white;" onclick="saveGemEdits(${index})">Save Changes</button>
                </div>
                <div id="edit-file-status-${index}" style="font-size:0.7em; color:green; margin-top:2px;"></div>
            </div>
        `;
        container.appendChild(card);
    });

    // Attach Listeners
    document.querySelectorAll('.settings-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = e.target.dataset.index;
            const panel = document.getElementById(`edit-panel-${idx}`);
            panel.classList.toggle('open');
        });
    });

    document.querySelectorAll('.delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(confirm("Delete Specialist?")) {
                globalGems.splice(e.target.dataset.index, 1);
                await chrome.storage.local.set({ myGems: globalGems });
                loadGems();
            }
        });
    });

    // File Update Listener
    document.querySelectorAll('.update-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Trigger the shared hidden input, store the index we are editing
            const input = document.getElementById('updateFileInput');
            input.setAttribute('data-editing-index', e.target.dataset.index);
            input.click();
        });
    });
}

// --- 3. CRUD OPERATIONS ---

async function createNewGem() {
    const name = document.getElementById('newGemName').value;
    const role = document.getElementById('newGemRole').value;
    const color = document.getElementById('newGemColor').value;
    
    if (!name || !role) return alert("Name required");
    
    globalGems.push({ 
        name, 
        instruction: role, 
        knowledge: tempCreateKnowledge || "",
        color: color
    });
    
    await chrome.storage.local.set({ myGems: globalGems });
    
    // Reset & Switch
    document.getElementById('newGemName').value = "";
    document.getElementById('newGemRole').value = "";
    tempCreateKnowledge = "";
    showScreen('screen-meeting');
    loadGems();
}

// Global function for the HTML onclick
window.saveGemEdits = async (index) => {
    const name = document.getElementById(`edit-name-${index}`).value;
    const role = document.getElementById(`edit-role-${index}`).value;
    const color = document.getElementById(`edit-color-${index}`).value;
    
    globalGems[index].name = name;
    globalGems[index].instruction = role;
    globalGems[index].color = color;
    
    await chrome.storage.local.set({ myGems: globalGems });
    loadGems(); // Re-render to show changes
};

async function handleUpdateFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const idx = e.target.getAttribute('data-editing-index');
    
    const text = await file.text();
    globalGems[idx].knowledge = text;
    
    // Visual feedback
    document.getElementById(`edit-file-status-${idx}`).innerText = `Updated: ${file.name}`;
    // Save immediately (optional, or wait for Save button)
    // For safety, we just update memory, user must click "Save Changes" to persist DB? 
    // Let's persist immediately for file uploads to avoid data loss.
    await chrome.storage.local.set({ myGems: globalGems });
}

// --- 4. MEETING ENGINE (COLOR AWARE) ---

async function startMeeting() {
    const selectedIndices = Array.from(document.querySelectorAll('#gemList input:checked')).map(cb => cb.value);
    const topicEl = document.getElementById('userInput');
    
    if (selectedIndices.length === 0) return alert("Select Specialist");
    if (!topicEl.value) return alert("Enter Topic");

    await ensureGeminiTab();
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
        await removeHUD();
        resetUI();
        return;
    }
    loopCount++;
    document.getElementById('startMeetingBtn').disabled = true;

    try {
        let currentContext = lastSpeaker;

        for (const gem of selectedGems) {
            if (stopSignal) return;
            
            // USE THE GEM'S CUSTOM COLOR
            await updateHUD(`${gem.name} is thinking...`, gem.color || "#0078d4");

            const prompt = `
*** ROLE: ${gem.name} ***
CORE INSTRUCTIONS: ${gem.instruction}
*** SQUAD PROTOCOL ***
ACTIVE TEAM: ${squadNames}
CURRENT TOPIC: "${topic}"
RULES:
1. IDENTIFY EXPERT: Are you the execution authority?
   - YES: Provide plan/code.
   - NO: Defer to authority.
2. OVERRIDES:
   - Creatives: Pivot to UI/UX/Visualization.
   - Architects: Focus on Risk/Scope.
CONTEXT: Previous input from: ${currentContext}.
KNOWLEDGE BASE: ${gem.knowledge.substring(0, 15000)}
TASK: Offer expert input.
            `;

            await injectPromptIntoGemini(prompt);
            await waitForIdleState();
            currentContext = gem.name;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (stopSignal) return;

        await updateHUD("PM Synthesizing...", "#28a745");
        await injectPromptIntoGemini(`*** ROLE: PM ***\nCONTEXT: Review responses on "${topic}".\nTASK: Summarize and ask if User wants more details.`);
        await waitForIdleState();

        if (stopSignal) return;

        await updateHUD("Waiting for Reply...", "#666");
        const reply = await waitForUserReply();
        if (reply && !stopSignal) {
            runMeetingLoop(selectedGems, reply, "User", squadNames);
        } else {
            resetUI();
        }

    } catch (e) {
        console.error(e);
        resetUI();
    }
}

async function resetConversation() {
    stopSignal = true;
    await removeHUD();
    resetUI();
}

function resetUI() {
    document.getElementById('startMeetingBtn').disabled = false;
    document.getElementById('resetBtn').style.display = 'none';
    removeHUD();
}

// --- UTILS ---
const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    document.getElementById(id).classList.add('active-screen');
};

async function exportTeamData() {
    const blob = new Blob([JSON.stringify(globalGems, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = "gemini_team.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function importTeamData(e) {
    try {
        const text = await e.target.files[0].text();
        const json = JSON.parse(text);
        if(confirm("Import Team?")) {
            globalGems = [...globalGems, ...json];
            await chrome.storage.local.set({ myGems: globalGems });
            loadGems();
        }
    } catch (e) { alert("Import Error"); }
}

async function ensureGeminiTab() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes("gemini.google.com")) {
        await chrome.tabs.create({ url: "https://gemini.google.com" });
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
                if (getBtn() && !getBtn().hasAttribute('disabled')) return r(true);
                const obs = new MutationObserver(() => {
                    if (getBtn() && !getBtn().hasAttribute('disabled')) { obs.disconnect(); r(true); }
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
                const getC = () => document.querySelectorAll('.user-query').length || document.querySelectorAll('[data-test-id="user-query"]').length;
                const start = getC();
                const i = setInterval(() => {
                    if (getC() > start) { clearInterval(i); r(document.querySelectorAll('.user-query')[start]?.innerText || "Reply"); }
                }, 1000);
            });
        }
    }).then(res => res[0].result);
}