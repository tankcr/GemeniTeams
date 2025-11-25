/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy (Modified by Lead Developer)
    Purpose:    v4.1 - INTEGRATED FINAL FIXES (R2/R3/R5/R6). 
                Automated restart via Message Passing. Stable Idle State detection.
*/

// --- CONFIGURATION ---
const MAX_LOOPS = 5;

let loopCount = 0;
let stopSignal = false;
let currentKnowledgeText = "";
let globalGems = [];

// ✅ R3 FIX: STATIC LOCAL SELECTORS (Replaced external config loading)
let SELECTORS = {
    editor: '.ql-editor, div[contenteditable="true"]',
    sendBtn: 'button[aria-label="Send message"], button.send-button'
};

// ========================================================================
// R6: HANDLER FOR AUTOMATED RESTART
// ========================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'USER_REPLY_SENT') {
        // Find the current topic/reply from the input field
        const newTopic = document.getElementById('userInput')?.value;
        if (newTopic) {
            // Restart the meeting loop with the new input. isContinuation=true
            startMeeting(newTopic, true); 
        } else {
            console.error("R6 Error: Could not get topic for automated restart.");
            resetUI();
        }
    }
});


// ========================================================================
// 1. UTILITY & VISUAL FUNCTIONS
// ========================================================================

function setTheme(color) {
    const header = document.querySelector('header');
    if (header) header.style.background = color;
    document.body.style.borderLeftColor = color;
}

function showScreen(id) {
    document.querySelectorAll('.screen')
        .forEach(s => s.classList.remove('active-screen'));

    const target = document.getElementById(id);
    if (target) target.classList.add('active-screen');
}

function resetForm() {
    const name = document.getElementById('newGemName');
    const role = document.getElementById('newGemRole');
    const file = document.getElementById('hiddenFile');
    const display = document.getElementById('fileNameDisplay');

    if (name) name.value = "";
    if (role) role.value = "";
    if (file) file.value = "";
    if (display) display.innerText = "📂 Click to Attach File";

    currentKnowledgeText = "";
}

function resetConversation() {
    stopSignal = true;
    setTheme('#0078d4');
    removeHUD();
    resetUI();
}

function resetUI() {
    const start = document.getElementById('startMeetingBtn');
    const resetBtn = document.getElementById('resetBtn');
    if (start) {
        start.disabled = false;
        start.innerText = '🚀 Start';
    }
    if (resetBtn) resetBtn.style.display = 'none';
    setTheme('#0078d4');
    removeHUD();
}

// ========================================================================
// HUD / VISUAL FEEDBACK
// ========================================================================

async function updateHUD(text, color) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg, clr) => {
            let h = document.getElementById('gemini-hud');
            if (!h) {
                h = document.createElement('div');
                h.id = 'gemini-hud';
                Object.assign(h.style, {
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    padding: '10px 20px',
                    background: 'rgba(255,255,255,0.95)',
                    borderLeft: '5px solid #333',
                    borderRadius: '8px',
                    fontFamily: 'sans-serif',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: '99999'
                });
                document.body.appendChild(h);
            }
            h.style.borderLeftColor = clr;
            h.innerText = msg;
            h.style.display = 'block';
        },
        args: [text, color]
    });
}

async function removeHUD() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            const h = document.getElementById('gemini-hud');
            if (h) h.style.display = 'none';
        }
    });
}

// ========================================================================
// 2. IMPORT / EXPORT / STORAGE
// ========================================================================

async function exportTeamData() {
    if (globalGems.length === 0) return console.warn("No specialists to export.");

    const blob = new Blob([JSON.stringify(globalGems, null, 2)], {
        type: "application/json"
    });

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "gemini_team_backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

// --------------------------------------------------------------------------------------
// Import Modal (non-blocking confirm)
// --------------------------------------------------------------------------------------

function showImportModal(count) {
    return new Promise(resolve => {
        const old = document.getElementById("gt-import-modal");
        if (old) old.remove();

        const modal = document.createElement("div");
        modal.id = "gt-import-modal";
        Object.assign(modal.style, {
            position: "fixed",
            inset: "0",
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999
        });

        const box = document.createElement("div");
        Object.assign(box.style, {
            width: "420px",
            background: "#fff",
            padding: "20px",
            borderRadius: "10px",
            fontFamily: "sans-serif",
            boxShadow: "0 12px 30px rgba(0,0,0,0.25)"
        });

        box.innerHTML = `
            <h3 style="margin:0 0 10px 0;">Import ${count} Specialists</h3>
            <p style="margin-bottom:15px; color:#333">
                Would you like to append them or replace your current team?
            </p>
        `;

        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "flex-end";
        row.style.gap = "10px";

        const mkBtn = (label, bg, val) => {
            const b = document.createElement("button");
            b.innerText = label;
            Object.assign(b.style, {
                padding: "8px 12px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                background: bg,
                color: bg === "#fff" ? "#333" : "#fff"
            });
            b.onclick = () => {
                modal.remove();
                resolve(val);
            };
            return b;
        };

        row.appendChild(mkBtn("Cancel", "#fff", "cancel"));
        row.appendChild(mkBtn("Append", "#0078d4", "append"));
        row.appendChild(mkBtn("Replace", "#28a745", "replace"));

        box.appendChild(row);
        modal.appendChild(box);
        document.body.appendChild(modal);
    });
}

// --------------------------------------------------------------------------------------
// FIXED + CLEAN IMPORT LOGIC
// --------------------------------------------------------------------------------------

async function importTeamData(e) {
    const file = e?.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            if (!Array.isArray(data)) throw new Error("File must contain array JSON");

            const choice = await showImportModal(data.length);

            if (choice === "cancel") {
                updateHUD("Import cancelled", "#555");
                return;
            }

            if (choice === "replace") {
                globalGems = [...data];
            } else {
                // Append + dedupe by name
                const existing = new Set(globalGems.map(g => g.name.trim()));
                const toAdd = data.filter(g => !existing.has(g.name.trim()));
                globalGems = [...globalGems, ...toAdd];
            }

            await chrome.storage.local.set({ myGems: globalGems });
            loadGems();
            updateHUD(`Imported ${data.length} specialists`, "#28a745");

        } catch (err) {
            console.error("Import error:", err);
            updateHUD("Import Failed", "red");
        } finally {
            e.target.value = "";
        }
    };

    reader.readAsText(file);
}

// --------------------------------------------------------------------------------------
// Load Gems
// --------------------------------------------------------------------------------------

async function loadGems() {
    const list = document.getElementById('gemList');
    if (!list) return;

    list.innerHTML = "";

    const stored = await chrome.storage.local.get("myGems");
    globalGems = stored.myGems || [];

    if (globalGems.length === 0) {
        list.innerHTML = `<p style="text-align:center; margin-top:20px; color:#777;">
            No specialists yet.
        </p>`;
        return;
    }

    globalGems.forEach((gem, idx) => {
        const div = document.createElement("div");
        div.className = "gem-card";
        div.style.borderLeftColor = gem.color || "#ccc";

        div.innerHTML = `
            <div class="gem-header">
                <label class="gem-label">
                    <input type="checkbox" value="${idx}" checked>
                    <span class="color-chip" style="background-color:${gem.color || "#333"};"></span>
                    <span>${gem.name}</span>
                </label>
                <div>
                    <span class="icon-btn settings-toggle" data-index="${idx}">⚙️</span>
                    <span class="icon-btn delete" data-index="${idx}">🗑️</span>
                </div>
            </div>

            <div class="edit-panel" id="edit-panel-${idx}">
                <div class="edit-field">
                    <label>Name</label>
                    <input id="edit-name-${idx}" value="${gem.name}">
                </div>

                <div class="edit-field">
                    <label>Instructions</label>
                    <textarea id="edit-role-${idx}" rows="3">${gem.instruction}</textarea>
                </div>

                <div class="color-row">
                    <label>Color:</label>
                    <input type="color" id="edit-color-${idx}" value="${gem.color || "#0078d4"}">
                </div>

                <div style="display:flex; gap:5px; margin-top:6px;">
                    <button class="btn-small update-file-btn" data-index="${idx}">📂 Update File</button>
                    <button class="btn-small" style="background:#0078d4; color:white"
                        onclick="saveGemEdits(${idx})">Save</button>
                </div>

                <div id="edit-file-status-${idx}" style="font-size:0.75em; color:green; margin-top:3px;"></div>
            </div>
        `;

        list.appendChild(div);
    });

    // Attach events
    document.querySelectorAll('.settings-toggle').forEach(btn =>
        btn.addEventListener('click', e => {
            const id = e.target.dataset.index;
            document.getElementById(`edit-panel-${id}`).classList.toggle("open");
        })
    );

    document.querySelectorAll('.delete').forEach(btn =>
        btn.addEventListener('click', async e => {
            const id = e.target.dataset.index;
            if (!confirm("Remove this specialist?")) return;
            globalGems.splice(id, 1);
            await chrome.storage.local.set({ myGems: globalGems });
            loadGems();
        })
    );

    document.querySelectorAll('.update-file-btn').forEach(btn =>
        btn.addEventListener('click', e => {
            const id = e.target.dataset.index;
            const fileInput = document.getElementById('updateFileInput');
            fileInput.setAttribute('data-editing-index', id);
            fileInput.click();
        })
    );
}

// --------------------------------------------------------------------------------------
// Save New Gem
// --------------------------------------------------------------------------------------

async function saveGem() {
    const name = document.getElementById('newGemName')?.value;
    const instr = document.getElementById('newGemRole')?.value;
    const color = document.getElementById('newGemColor')?.value || "#0078d4";

    if (!name || !instr) return console.warn("Missing required fields");

    globalGems.push({
        name,
        instruction: instr,
        knowledge: currentKnowledgeText || "",
        color
    });

    await chrome.storage.local.set({ myGems: globalGems });
    resetForm();
    showScreen("screen-meeting");
    loadGems();
}

window.saveGemEdits = async function (idx) {
    const g = globalGems[idx];
    g.name = document.getElementById(`edit-name-${idx}`).value;
    g.instruction = document.getElementById(`edit-role-${idx}`).value;
    g.color = document.getElementById(`edit-color-${idx}`).value;

    await chrome.storage.local.set({ myGems: globalGems });
    loadGems();
};

// --------------------------------------------------------------------------------------
// Update Specialist's Knowledge File
// --------------------------------------------------------------------------------------

async function handleUpdateFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const idx = e.target.getAttribute('data-editing-index');
    globalGems[idx].knowledge = await file.text();

    document.getElementById(`edit-file-status-${idx}`).innerText =
        `Updated: ${file.name}`;

    await chrome.storage.local.set({ myGems: globalGems });
}

// ========================================================================
// 3. MEETING ENGINE
// ========================================================================

function setupEventListeners() {
    const goCreate = document.getElementById('goToCreateBtn');
    const cancelCreate = document.getElementById('cancelCreateBtn');
    if (goCreate) goCreate.onclick = () => showScreen("screen-create");
    if (cancelCreate) cancelCreate.onclick = () => { resetForm(); showScreen("screen-meeting"); };

    const uploadArea = document.getElementById('uploadClickArea');
    const fileInput = document.getElementById('hiddenFile');
    if (uploadArea && fileInput) {
        uploadArea.onclick = () => fileInput.click();
        fileInput.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById('fileNameDisplay').innerText = `📄 ${file.name}`;
            currentKnowledgeText = await file.text();
        };
    }

    const importBtn = document.getElementById('importFile');
    if (importBtn) importBtn.onchange = importTeamData;

    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) exportBtn.onclick = exportTeamData;

    const saveBtn = document.getElementById('saveGemBtn');
    if (saveBtn) saveBtn.onclick = saveGem;

    const startBtn = document.getElementById('startMeetingBtn');
    // R6 FIX: startMeeting handles both initial start and automated continuation
    if (startBtn) startBtn.onclick = () => startMeeting(); 

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.onclick = resetConversation;

    const updateInput = document.getElementById('updateFileInput');
    if (updateInput) updateInput.onchange = handleUpdateFile;
}

// --------------------------------------------------------------------------------------
// R6: Modified to handle both fresh start and continuation
// --------------------------------------------------------------------------------------
async function startMeeting(newTopic = null, isContinuation = false) {
    const selected = [...document.querySelectorAll('#gemList input:checked')]
        .map(cb => cb.value);

    // Get the topic from the DOM unless it was passed during continuation
    const topic = newTopic || document.getElementById('userInput')?.value;

    if (!selected.length) return console.warn("Select at least one specialist");
    if (!topic) return console.warn("Topic required");

    await ensureGeminiTab();

    setTheme('#333');
    await updateHUD("Initializing team...", "#333");

    stopSignal = false;
    
    // Only reset loopCount if this is a fresh start (not a continuation)
    if (!isContinuation) {
        loopCount = 0;
    }

    const squad = selected.map(i => globalGems[i]);
    const names = squad.map(g => g.name).join(", ");

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.style.display = "block";

    runMeetingLoop(squad, topic, "User", names);
}

// --------------------------------------------------------------------------------------
// The Meeting Loop
// --------------------------------------------------------------------------------------

async function runMeetingLoop(selectedGems, topic, lastSpeaker, squadNames) {
    // R6 FIX: Removed MAX_LOOPS check to align with user's request (but still dangerous)
    if (stopSignal) {
        setTheme("#dc3545");
        await updateHUD("Meeting stopped by user.", "#dc3545");
        resetUI();
        return;
    }

    loopCount++;

    const btn = document.getElementById('startMeetingBtn');
    if (btn) {
        btn.innerText = `🔄 Round ${loopCount}...`;
        btn.disabled = true;
    }

    try {
        let context = lastSpeaker;

        // Specialist Pass
        for (const gem of selectedGems) {
            if (stopSignal) return;

            setTheme(gem.color || "#0078d4");
            await updateHUD(`${gem.name} is thinking...`, gem.color || "#0078d4");

            const prompt = `
*** ROLE: ${gem.name} ***
CORE INSTRUCTIONS: ${gem.instruction}

ACTIVE TEAM: ${squadNames}
CURRENT TOPIC: "${topic}"

CONTEXT: Previous speaker was ${context}.

YOUR KNOWLEDGE:
${(gem.knowledge || "").substring(0, 15000)}

TASK: Respond as your role, following DYNAMIC DEFERENCE PROTOCOL.
`;

            await injectPromptIntoGemini(prompt);
            // Wait for AI to finish typing
            await waitForIdleState();

            context = gem.name;
            await new Promise(r => setTimeout(r, 1500));
        }

        // PM Phase
        setTheme("#28a745");
        await updateHUD("Project Manager summarizing...", "#28a745");

        await injectPromptIntoGemini(`
*** ROLE: Project Manager ***
Summarize team positions on "${topic}". Ask user if they want more input.
`);

        await waitForIdleState();

        // ✅ R6 FIX: PAUSE AND START MONITORING FOR AUTOMATED RESTART
        setTheme("#666");
        await updateHUD("Meeting Paused: Waiting for user input...", "#666");

        // Send message to content.js to begin monitoring for the user's next message
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        await chrome.tabs.sendMessage(tab.id, { 
            action: 'START_MONITORING', 
            userQuerySelector: SELECTORS.editor
        });

        // The meeting thread now exits and waits for the message listener (in global scope) to fire.

    } catch (err) {
        console.error(err);
        if (!stopSignal) {
            updateHUD("Fatal Error — Check Console", "red");
            resetUI();
        }
    }
}

// --------------------------------------------------------------------------------------
// Ensure Gemini Tab Open
// --------------------------------------------------------------------------------------

async function ensureGeminiTab() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url.includes("gemini.google.com")) {
        const tabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });

        if (tabs.length > 0) {
            await chrome.tabs.update(tabs[0].id, { active: true });
        } else {
            await chrome.tabs.create({ url: "https://gemini.google.com" });
        }

        await new Promise(r => setTimeout(r, 2000));
    }
}

// --------------------------------------------------------------------------------------
// Inject Prompt into Gemini
// --------------------------------------------------------------------------------------

async function injectPromptIntoGemini(msg) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (txt, sel) => {
            const editor = document.querySelector(sel.editor);
            if (!editor) return;

            editor.focus();
            document.execCommand("selectAll", false, null);
            document.execCommand("insertText", false, txt);

            await new Promise(r => setTimeout(r, 400));

            const btn = document.querySelector(sel.sendBtn);
            if (btn) {
                btn.click();
                await new Promise(r => setTimeout(r, 2500));
            }
        },
        args: [msg, SELECTORS]
    });
}

// --------------------------------------------------------------------------------------
// ✅ R2 FIX: Wait for Gemini to Finish Thinking (Robust Check)
// --------------------------------------------------------------------------------------

async function waitForIdleState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    return chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selectors) => {
            return new Promise(resolve => {
                
                // --- ROBUST CHECK LOGIC ---
                const AI_LOADING_SELECTORS = [
                    'div[data-testid*="generating"]', 
                    'div[aria-busy="true"]',
                    '.loading-indicator'
                ];
                
                const isIdle = () => {
                    // Check 1: Is the send button enabled?
                    const btn = document.querySelector(selectors.sendBtn);
                    const isSendReady = btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true";
                    
                    // Check 2: Are any known loading/generating indicators present?
                    const isAILoading = AI_LOADING_SELECTORS.some(s => document.querySelector(s));
                    
                    return isSendReady && !isAILoading;
                };

                if (isIdle()) return resolve(true);

                const obs = new MutationObserver(() => {
                    if (isIdle()) {
                        obs.disconnect();
                        resolve(true);
                    }
                });

                obs.observe(document.body, {
                    subtree: true,
                    attributes: true,
                    childList: true
                });
                
                setTimeout(() => {
                    obs.disconnect();
                    console.warn('GeminiTeams: Timeout reached waiting for AI idle state (60s). Proceeding...');
                    resolve(false);
                }, 60000);
            });
        },
        args: [SELECTORS]
    });
}


// ========================================================================
// Init
// ========================================================================

document.addEventListener("DOMContentLoaded", async () => {
    setupEventListeners();
    const stored = await chrome.storage.local.get("myGems");
    globalGems = stored.myGems || [];
    loadGems();
});