/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    v2.5 - Dynamic Squad Protocol + Role Specific Overrides (The "Yes, And" Patch)
*/

// --- CONFIGURATION ---
const MAX_LOOPS = 5;
// *** ACTION REQUIRED: PASTE YOUR RAW GITHUB JSON URL HERE ***
const GITHUB_CONFIG_URL = "https://raw.githubusercontent.com/tankcr/GemeniTeams/refs/heads/main/selectors.json"; 

let loopCount = 0;
let currentKnowledgeText = ""; 
let globalGems = []; 

// Default Fallback Selectors
let SELECTORS = {
    editor: '.ql-editor, div[contenteditable="true"]',
    sendBtn: 'button[aria-label="Send message"], button.send-button'
};

// --- 1. INITIALIZATION ---
window.addEventListener('load', async () => {
    try {
        console.log("GeminiTeams: UI Loaded.");
        await fetchRemoteConfig();
        loadGems();
        setupEventListeners();
    } catch (e) {
        console.error("GeminiTeams Init Error:", e);
    }
});

async function fetchRemoteConfig() {
    try {
        const response = await fetch(GITHUB_CONFIG_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Network response was not ok");
        const remoteSelectors = await response.json();
        
        if (remoteSelectors.editor && remoteSelectors.sendBtn) {
            SELECTORS = remoteSelectors;
            console.log("GeminiTeams: Remote config loaded successfully. 🟢");
        } else {
            console.warn("GeminiTeams: Remote config invalid. Using Fallback. 🟡");
        }
    } catch (error) {
        console.warn(`GeminiTeams: Could not fetch remote config (${error.message}). Using Fallback. 🟡`);
    }
}

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
}

const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    const target = document.getElementById(id);
    if(target) target.classList.add('active-screen');
};

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

// --- 2. DATA OPS ---
async function exportTeamData() {
    if (globalGems.length === 0) return alert("No specialists to export.");
    const dataStr = JSON.stringify(globalGems, null, 2);
    const blob = new Blob([dataStr], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "gemini_team_backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
            alert("Import success!");
        }
    } catch (err) { alert("Import Failed: " + err.message); }
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
        const div = document.createElement('div');
        div.className = 'gem-card';
        div.innerHTML = `
            <label>
                <input type="checkbox" value="${index}" checked> 
                <span>${gem.name}</span>
            </label>
            <span class="delete-btn" data-index="${index}" title="Remove">×</span>
        `;
        container.appendChild(div);
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if(!confirm("Fire this Specialist?")) return;
            const idx = e.target.getAttribute('data-index');
            globalGems.splice(idx, 1);
            await chrome.storage.local.set({ myGems: globalGems });
            loadGems();
        });
    });
}

async function saveGem() {
    const name = document.getElementById('newGemName').value;
    const role = document.getElementById('newGemRole').value;
    if (!name || !role) return alert("Name/Instructions required.");
    globalGems.push({ name: name, instruction: role, knowledge: currentKnowledgeText || "" });
    await chrome.storage.local.set({ myGems: globalGems });
    resetForm();
    showScreen('screen-meeting');
    loadGems();
}

// --- 3. MEETING ENGINE (SQUAD AWARE + ROLE OVERRIDES) ---
async function startMeeting() {
    const selectedIndices = Array.from(document.querySelectorAll('#gemList input:checked')).map(cb => cb.value);
    const topicEl = document.getElementById('userInput');
    
    if (selectedIndices.length === 0) return alert("Select at least one Specialist.");
    if (!topicEl || !topicEl.value) return alert("Please provide a topic.");

    await ensureGeminiTab();
    await updateHUD("Initializing Team...", "#333");

    loopCount = 0;
    const selectedGems = selectedIndices.map(idx => globalGems[idx]);
    
    // Create Squad Context
    const squadNames = selectedGems.map(g => g.name).join(", ");
    runMeetingLoop(selectedGems, topicEl.value, "User", squadNames);
}

async function runMeetingLoop(selectedGems, topic, lastSpeaker, squadNames) {
    if (loopCount >= MAX_LOOPS) {
        await updateHUD("Max Loops Reached.", "#dc3545");
        resetUI();
        return;
    }
    loopCount++;

    const btn = document.getElementById('startMeetingBtn');
    if(btn) { btn.innerText = `🔄 Round ${loopCount}: Specialists working...`; btn.disabled = true; }

    try {
        let currentContext = lastSpeaker;

        // A. SPECIALIST PHASE
        for (const gem of selectedGems) {
            
            await updateHUD(`${gem.name} is thinking...`, "#0078d4");

            // *** DYNAMIC HIERARCHY PROTOCOL + ROLE OVERRIDES ***
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

        // B. PM PHASE
        await updateHUD("Project Manager Synthesizing...", "#28a745");
        if(btn) btn.innerText = "👨‍💼 PM Synthesizing...";
        
        const pmPrompt = `
*** ROLE: Project Manager ***
CONTEXT: Review responses regarding "${topic}".
TASK: Summarize consensus and ask User if they want more feedback from specific specialists.
        `;
        await injectPromptIntoGemini(pmPrompt);
        await waitForIdleState();

        // C. LISTENING PHASE
        await updateHUD("Waiting for User Reply...", "#666");
        if(btn) btn.innerText = "👂 Listening...";
        
        const userReply = await waitForUserReply();
        if (userReply) {
            runMeetingLoop(selectedGems, userReply, "The User (You)", squadNames);
        } else {
             await removeHUD(); 
             resetUI();
        }

    } catch (error) {
        console.error(error);
        await updateHUD("Error: " + error.message, "red");
        resetUI();
    }
}

function resetUI() {
    const btn = document.getElementById('startMeetingBtn');
    if(btn) { btn.innerText = "🚀 Start Team Meeting"; btn.disabled = false; }
}

// --- UTILS & VISUAL INJECTION ---

async function ensureGeminiTab() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes("gemini.google.com")) {
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
        func: (statusText, statusColor) => {
            let hud = document.getElementById('gemini-teams-hud');
            if (!hud) {
                hud = document.createElement('div');
                hud.id = 'gemini-teams-hud';
                Object.assign(hud.style, {
                    position: 'fixed', top: '20px', right: '20px', padding: '12px 20px',
                    background: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)',
                    borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                    borderLeft: '5px solid #333', zIndex: '9999',
                    fontFamily: 'Segoe UI, sans-serif', fontSize: '14px', fontWeight: '600',
                    color: '#333', transition: 'all 0.3s ease', opacity: '0', transform: 'translateY(-10px)'
                });
                document.body.appendChild(hud);
                requestAnimationFrame(() => { hud.style.opacity = '1'; hud.style.transform = 'translateY(0)'; });
            }
            hud.style.borderLeftColor = statusColor;
            hud.innerText = statusText;
        },
        args: [text, color]
    });
}

async function removeHUD() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            const hud = document.getElementById('gemini-teams-hud');
            if (hud) { hud.style.opacity = '0'; setTimeout(() => hud.remove(), 500); }
        }
    });
}

async function injectPromptIntoGemini(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg, sel) => {
            const editor = document.querySelector(sel.editor); 
            if (editor) {
                editor.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, msg);
                setTimeout(() => {
                    const sendBtn = document.querySelector(sel.sendBtn);
                    if(sendBtn) sendBtn.click();
                }, 800);
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
            return new Promise((resolve) => {
                const getBtn = () => document.querySelector(sel.sendBtn);
                const check = () => {
                    const btn = getBtn();
                    return btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true';
                };
                
                if (check()) return resolve(true);

                const observer = new MutationObserver(() => {
                    if (check()) { observer.disconnect(); resolve(true); }
                });
                observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });
                setTimeout(() => { observer.disconnect(); resolve(true); }, 45000);
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
            return new Promise((resolve) => {
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