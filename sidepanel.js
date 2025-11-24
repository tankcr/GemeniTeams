/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    v2.2 - Remote Config (GitHub) + MutationObserver Reliability
*/

// --- CONFIGURATION ---
const MAX_LOOPS = 5;
// *** ACTION REQUIRED: PASTE YOUR RAW GITHUB JSON URL HERE ***
const GITHUB_CONFIG_URL = "https://raw.githubusercontent.com/tankcr/GemeniTeams/refs/heads/main/selectors.json"; 

let loopCount = 0;
let currentKnowledgeText = ""; 
let globalGems = []; 

// Default Fallback Selectors (The Engineer's Safety Net)
let SELECTORS = {
    editor: '.ql-editor, div[contenteditable="true"]',
    sendBtn: 'button[aria-label="Send message"], button.send-button'
};

// --- 1. INITIALIZATION ---
window.addEventListener('load', async () => {
    try {
        console.log("GeminiTeams: UI Loaded.");
        await fetchRemoteConfig(); // Fetch the "Brain" first
        loadGems();
        setupEventListeners();
    } catch (e) {
        console.error("GeminiTeams Init Error:", e);
    }
});

// --- REMOTE CONFIG ENGINE ---
async function fetchRemoteConfig() {
    try {
        console.log("GeminiTeams: Fetching remote selectors...");
        const response = await fetch(GITHUB_CONFIG_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("Network response was not ok");
        
        const remoteSelectors = await response.json();
        
        // Validation: Ensure keys exist before overwriting
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

// --- 2. UI SETUP ---
function setupEventListeners() {
    // A. Navigation
    const goCreate = document.getElementById('goToCreateBtn');
    const cancelCreate = document.getElementById('cancelCreateBtn');
    
    if(goCreate) goCreate.addEventListener('click', () => showScreen('screen-create'));
    if(cancelCreate) cancelCreate.addEventListener('click', () => {
        resetForm();
        showScreen('screen-meeting');
    });

    // B. File Upload
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

    // C. Data Controls
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');

    if (exportBtn) exportBtn.addEventListener('click', exportTeamData);
    if (importBtn && importFile) {
        importBtn.addEventListener('click', () => importFile.click());
        importFile.addEventListener('change', importTeamData);
    }

    // D. Actions
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

// --- 3. DATA & STORAGE ---
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
        if (!Array.isArray(importedGems)) throw new Error("Invalid JSON format");
        if(confirm(`Found ${importedGems.length} specialists. Import them?`)) {
            globalGems = [...globalGems, ...importedGems];
            await chrome.storage.local.set({ myGems: globalGems });
            loadGems();
            alert("Team imported successfully!");
        }
    } catch (err) {
        alert("Import Failed: " + err.message);
    }
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
        container.innerHTML = '<p style="text-align:center; color:#888; margin-top:30px; font-size: 0.9em;">No Specialists hired yet.<br>Use Import or Hire New.</p>';
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
    if (!name || !role) return alert("Name and Instructions are required.");
    const newGem = {
        name: name,
        instruction: role,
        knowledge: currentKnowledgeText || ""
    };
    globalGems.push(newGem);
    await chrome.storage.local.set({ myGems: globalGems });
    resetForm();
    showScreen('screen-meeting');
    loadGems();
}

// --- 4. MEETING ENGINE ---
async function startMeeting() {
    const selectedIndices = Array.from(document.querySelectorAll('#gemList input:checked')).map(cb => cb.value);
    const userTopic = document.getElementById('userInput').value;
    
    if (selectedIndices.length === 0) return alert("Select at least one Specialist.");
    if (!userTopic) return alert("Please provide a topic.");

    await ensureGeminiTab();
    loopCount = 0;
    const selectedGems = selectedIndices.map(idx => globalGems[idx]);
    runMeetingLoop(selectedGems, userTopic, "User");
}

async function runMeetingLoop(selectedGems, topic, lastSpeaker) {
    if (loopCount >= MAX_LOOPS) {
        alert("Max conversation loops reached.");
        resetUI();
        return;
    }
    loopCount++;

    const btn = document.getElementById('startMeetingBtn');
    if(btn) {
        btn.innerText = `🔄 Round ${loopCount}: Specialists working...`;
        btn.disabled = true;
    }

    try {
        let currentContext = lastSpeaker;

        // A. SPECIALIST PHASE
        for (const gem of selectedGems) {
            const prompt = `
*** ROLE: ${gem.name} ***
CORE INSTRUCTIONS: ${gem.instruction}
CONTEXT: A multi-agent meeting. The previous input was from: ${currentContext}.
TOPIC: ${topic}
YOUR KNOWLEDGE BASE: ${gem.knowledge.substring(0, 15000)}
TASK: Offer your expert technical input based on your Role and Knowledge.
*** CRITICAL INSTRUCTION: NOISE REDUCTION ***
1. IF the previous speaker has already accurately covered the topic from your domain's perspective:
   - Respond ONLY with: "I have reviewed the conversation and concur. No additional constraints from [${gem.name}]."
2. IF you have a specific, unique addition or correction based on your Knowledge Base:
   - Provide it concisely.
DO NOT repeat information already stated.
            `;

            await injectPromptIntoGemini(prompt);
            await waitForIdleState(); // Uses new MutationObserver
            currentContext = gem.name;
            await new Promise(r => setTimeout(r, 2000));
        }

        // B. PM PHASE
        if(btn) btn.innerText = "👨‍💼 PM Synthesizing...";
        const pmPrompt = `
*** ROLE: Project Manager ***
CONTEXT: Review the responses from the specialists above regarding "${topic}".
TASK:
1. Summarize the technical consensus so far.
2. CRITICAL: Explicitly ask the user if they would like additional feedback from any specific specialists, or if they are ready to proceed.
        `;
        await injectPromptIntoGemini(pmPrompt);
        await waitForIdleState();

        // C. LISTENING PHASE
        if(btn) btn.innerText = "👂 Listening for your reply...";
        const userReply = await waitForUserReply();
        
        if (userReply) {
            runMeetingLoop(selectedGems, userReply, "The User (You)");
        } else {
             resetUI();
        }

    } catch (error) {
        console.error(error);
        alert("Loop Error: " + error.message);
        resetUI();
    }
}

function resetUI() {
    const btn = document.getElementById('startMeetingBtn');
    if(btn) {
        btn.innerText = "🚀 Start Team Meeting";
        btn.disabled = false;
    }
}

// --- UTILS (Injection & Observation) ---

async function ensureGeminiTab() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes("gemini.google.com")) {
        const geminiTabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
        if (geminiTabs.length > 0) {
            await chrome.tabs.update(geminiTabs[0].id, { active: true });
            tab = geminiTabs[0];
            await new Promise(r => setTimeout(r, 1000));
        } else {
            const newTab = await chrome.tabs.create({ url: "https://gemini.google.com" });
            await new Promise(r => setTimeout(r, 4000)); 
            tab = newTab;
        }
    }
}

async function injectPromptIntoGemini(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Pass SELECTORS to the injected function
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
            } else { 
                console.error("GeminiTeams: Chat input not found.");
            }
        },
        args: [text, SELECTORS]
    });
}

// UPGRADED: MutationObserver (No more polling!)
async function waitForIdleState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (sel) => {
            return new Promise((resolve) => {
                const getBtn = () => document.querySelector(sel.sendBtn);
                
                // 1. Immediate Check
                const btn = getBtn();
                if (btn && !btn.hasAttribute('disabled') && btn.getAttribute('aria-disabled') !== 'true') {
                    return resolve(true);
                }

                // 2. Observer
                const observer = new MutationObserver(() => {
                    const currentBtn = getBtn();
                    const isIdle = currentBtn && !currentBtn.hasAttribute('disabled') && currentBtn.getAttribute('aria-disabled') !== 'true';
                    if (isIdle) {
                        observer.disconnect();
                        resolve(true);
                    }
                });

                // Watch the body subtree for attribute changes on buttons
                observer.observe(document.body, { 
                    subtree: true, 
                    attributes: true, 
                    attributeFilter: ['disabled', 'aria-disabled']
                });

                // Safety Timeout (45s)
                setTimeout(() => {
                    observer.disconnect();
                    resolve(true);
                }, 45000);
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
                const getMessageCount = () => document.querySelectorAll('.user-query').length || document.querySelectorAll('[data-test-id="user-query"]').length;
                const initialCount = getMessageCount();

                const poll = setInterval(() => {
                    const currentCount = getMessageCount();
                    if (currentCount > initialCount) {
                        clearInterval(poll);
                        const allQueries = document.querySelectorAll('.user-query'); 
                        const lastQuery = allQueries[allQueries.length - 1]?.innerText || "User Follow-up";
                        resolve(lastQuery);
                    }
                }, 1000);
            });
        }
    }).then(results => results[0].result);
}