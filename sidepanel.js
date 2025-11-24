/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    Manages Persona CRUD operations and Orchestrates Meetings with Auto-Routing.
    Updated:    Added Auto-Pilot logic to open gemini.google.com automatically.
*/

// --- STATE MANAGEMENT ---
let currentKnowledgeText = ""; // Holds file content temporarily during creation

// Initialize Application
loadGems();

// --- NAVIGATION ---
const showScreen = (id) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    document.getElementById(id).classList.add('active-screen');
};
document.getElementById('goToCreateBtn').addEventListener('click', () => showScreen('screen-create'));
document.getElementById('cancelCreateBtn').addEventListener('click', () => {
    resetForm();
    showScreen('screen-meeting');
});

// --- STORAGE: LOAD GEMS ---
async function loadGems() {
    const container = document.getElementById('gemList');
    container.innerHTML = '';
    
    // Fetch from Chrome's internal database
    const result = await chrome.storage.local.get("myGems");
    const gems = result.myGems || [];

    if (gems.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666; font-size:0.9em; margin-top:20px;">No Specialists hired yet.<br>Click the button below to start.</p>';
        return;
    }

    gems.forEach((gem, index) => {
        const div = document.createElement('div');
        div.className = 'gem-card';
        div.innerHTML = `
            <label>
                <input type="checkbox" value="${index}" checked> 
                <span>${gem.name}</span>
            </label>
            <span class="delete-btn" data-index="${index}" title="Fire Specialist">×</span>
        `;
        container.appendChild(div);
    });

    // Add Delete Listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const idx = e.target.getAttribute('data-index');
            // Confirm deletion
            if(!confirm("Are you sure you want to remove this Specialist?")) return;
            
            gems.splice(idx, 1);
            await chrome.storage.local.set({ myGems: gems });
            loadGems();
        });
    });
}

// --- STORAGE: SAVE GEM ---
// 1. Handle File Reading
document.getElementById('hiddenFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    document.getElementById('fileNameDisplay').innerText = `📄 ${file.name}`;
    
    // Read text content immediately
    const text = await file.text();
    currentKnowledgeText = text;
});

// 2. Handle Save
document.getElementById('saveGemBtn').addEventListener('click', async () => {
    const name = document.getElementById('newGemName').value;
    const role = document.getElementById('newGemRole').value;
    
    if (!name || !role) return alert("Name and Role are required.");

    const newGem = {
        name: name,
        instruction: role,
        knowledge: currentKnowledgeText || "" // Save the file content directly into DB
    };

    // Get existing, push new, save back
    const result = await chrome.storage.local.get("myGems");
    const gems = result.myGems || [];
    gems.push(newGem);
    
    await chrome.storage.local.set({ myGems: gems });
    
    resetForm();
    showScreen('screen-meeting');
    loadGems();
});

function resetForm() {
    document.getElementById('newGemName').value = "";
    document.getElementById('newGemRole').value = "";
    document.getElementById('hiddenFile').value = "";
    document.getElementById('fileNameDisplay').innerText = "📂 Click to Attach File";
    currentKnowledgeText = "";
}

// --- MEETING ORCHESTRATION ---
document.getElementById('startMeetingBtn').addEventListener('click', async () => {
    const selectedIndices = Array.from(document.querySelectorAll('#gemList input:checked')).map(cb => cb.value);
    const userTopic = document.getElementById('userInput').value;

    if (selectedIndices.length === 0) return alert("Select at least one Specialist.");
    if (!userTopic) return alert("Please enter a meeting topic.");

    // Load actual data
    const result = await chrome.storage.local.get("myGems");
    const allGems = result.myGems || [];

    const btn = document.getElementById('startMeetingBtn');
    const originalText = btn.innerText;
    btn.innerText = "Running Meeting...";
    btn.disabled = true;

    try {
        for (const index of selectedIndices) {
            const gem = allGems[index];
            
            const prompt = `
*** SYSTEM INSTRUCTION: NEW SPEAKER ***
ROLE: ${gem.name}
CORE INSTRUCTION: ${gem.instruction}

KNOWLEDGE BASE:
${gem.knowledge.substring(0, 25000)}

TOPIC: ${userTopic}

TASK: Provide your expert analysis.
            `;

            await injectPromptIntoGemini(prompt);
            
            // Wait for generation (15 seconds per turn)
            await new Promise(r => setTimeout(r, 15000));
        }
    } catch (error) {
        console.error(error);
        alert("Meeting Error: " + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// --- DOM INJECTION (AUTO-PILOT VERSION) ---
async function injectPromptIntoGemini(text) {
    // 1. Get the Active Tab
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 2. AUTO-ROUTING LOGIC
    // If we are not on Gemini, find it or open it.
    if (!tab || !tab.url || !tab.url.includes("gemini.google.com")) {
        
        // Check if Gemini is open in another tab
        const geminiTabs = await chrome.tabs.query({ url: "*://gemini.google.com/*" });
        
        if (geminiTabs.length > 0) {
            // Switch to existing tab
            await chrome.tabs.update(geminiTabs[0].id, { active: true });
            tab = geminiTabs[0];
            // Brief pause to allow tab switch to register
            await new Promise(r => setTimeout(r, 1000));
        } else {
            // Open new tab
            const newTab = await chrome.tabs.create({ url: "https://gemini.google.com" });
            // Wait for load (Critical for cold starts)
            await new Promise(r => setTimeout(r, 4000)); 
            tab = newTab;
        }
    }

    // 3. Execute Injection on the Correct Tab
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => {
            // The "Puppeteer" Logic
            const editor = document.querySelector('.ql-editor') || document.querySelector('div[contenteditable="true"]');
            
            if (editor) {
                editor.focus();
                // Clear existing text if any
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, msg);
                
                // Click Send
                setTimeout(() => {
                    const sendBtn = document.querySelector('button[aria-label="Send message"]') || document.querySelector('button.send-button');
                    if(sendBtn) sendBtn.click();
                }, 800);
            } else { 
                // Fallback if UI hasn't loaded yet
                console.error("GeminiTeams: Chat input not found.");
                alert("GeminiTeams: I opened the page, but the chat box isn't ready. Please wait a moment and click Start again.");
            }
        },
        args: [text]
    });
}