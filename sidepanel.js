/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    Full-Duplex Manager with IndexedDB Persistence (Integrated Vault)
*/

// --- DATABASE CONSTANTS ---
const DB_NAME = "GeminiTeamsDB";
const STORE_NAME = "specialists";
const GEMINI_URL = "https://gemini.google.com";

let gems = []; 
let loopCount = 0;
const MAX_LOOPS = 5; 

// --- 1. DATABASE UTILITIES (The Vault) ---
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "name" });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject("DB Error");
    });
}

async function saveSpecialistToDB(name, content, filename) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ name, content, filename });
    return new Promise(resolve => tx.oncomplete = resolve);
}

async function loadSpecialistsFromDB() {
    const db = await openDB();
    return new Promise(resolve => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result);
    });
}

// --- 2. STARTUP & UI ---
// Automatically load from Vault when opened
window.addEventListener('DOMContentLoaded', async () => {
    await refreshUI();
});

async function refreshUI() {
    gems = await loadSpecialistsFromDB();
    renderGemList();
    
    const statusDiv = document.getElementById('folderStatus');
    if (gems.length > 0) {
        statusDiv.innerText = `✅ Storage: ${gems.length} Specialists Ready`;
        statusDiv.className = 'status-linked';
    } else {
        statusDiv.innerText = `⚠️ Internal Storage Empty`;
        statusDiv.className = 'status-missing';
    }
}

function renderGemList() {
    const container = document.getElementById('gemList');
    container.innerHTML = '';
    
    if (gems.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666; font-size: 0.9em;">Load a folder to populate the Vault.</p>';
        return;
    }

    gems.forEach(gem => {
        const div = document.createElement('div');
        div.className = 'gem-card';
        div.innerHTML = `
            <label>
                <input type="checkbox" value="${gem.name}" checked> 
                <div>
                    <strong>${gem.name}</strong>
                    <span class="gem-info">Source: ${gem.filename}</span>
                </div>
            </label>
        `;
        container.appendChild(div);
    });
}

// --- 3. INGESTION (One-Time Load) ---
document.getElementById('folderInput').addEventListener('change', async (event) => {
    try {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        const statusDiv = document.getElementById('folderStatus');
        statusDiv.innerText = `⏳ Ingesting ${files.length} files...`;

        // Process files and save to DB
        for (const file of files) {
            if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
                const content = await readFileContent(file); // Read text immediately
                const name = file.name.split('.')[0];
                await saveSpecialistToDB(name, content, file.name);
            }
        }
        
        await refreshUI(); // Reload from DB
        
    } catch (err) {
        console.error("Ingestion error:", err);
        alert("Error saving files: " + err.message);
    }
});

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

// --- 4. THE MEETING LOOP (Recursive) ---
document.getElementById('startMeetingBtn').addEventListener('click', async () => {
    const selectedCheckboxes = Array.from(document.querySelectorAll('#gemList input:checked'));
    const userTopic = document.getElementById('userInput').value;
    
    if (selectedCheckboxes.length === 0) return alert("Select at least one Specialist.");
    if (!userTopic) return alert("Please provide a topic.");

    await ensureGeminiTab();
    loopCount = 0;
    
    runMeetingLoop(selectedCheckboxes, userTopic, "User");
});

async function runMeetingLoop(selectedCheckboxes, topic, lastSpeaker) {
    if (loopCount >= MAX_LOOPS) {
        alert("Max conversation loops reached. Stopping for safety.");
        resetUI();
        return;
    }
    loopCount++;

    const btn = document.getElementById('startMeetingBtn');
    btn.innerText = `🔄 Round ${loopCount}: Specialists working...`;
    btn.disabled = true;

    try {
        let currentContext = lastSpeaker;

        // A. SPECIALIST PHASE
        for (const cb of selectedCheckboxes) {
            const gemName = cb.value;
            // Load content directly from Vault (gems array), NOT file object
            const gemData = gems.find(g => g.name === gemName);
            const knowledge = gemData.content; 
            
            const prompt = `
*** ROLE: ${gemName} ***
CONTEXT: A multi-agent meeting. The previous input was from: ${currentContext}.
TOPIC: ${topic}
YOUR KNOWLEDGE BASE: ${knowledge.substring(0, 5000)}

TASK: Offer your expert technical input.

*** CRITICAL INSTRUCTION: NOISE REDUCTION ***
1. IF the previous speaker has already accurately covered the topic from your domain's perspective:
   - Respond ONLY with: "I have reviewed the conversation and concur. No additional constraints from [${gemName}]."
2. IF you have a specific, unique addition or correction based on your Knowledge Base:
   - Provide it concisely.
DO NOT repeat information already stated.
            `;

            await injectPromptIntoGemini(prompt);
            await waitForIdleState();
            currentContext = gemName;
        }

        // B. PROJECT MANAGER PHASE
        btn.innerText = "👨‍💼 PM Synthesizing...";
        const pmPrompt = `
*** ROLE: Project Manager ***
CONTEXT: Review the responses from the specialists above regarding "${topic}".

TASK:
1. Summarize the technical consensus.
2. Ask the user (The Human) if they agree or if they have modifications.
3. If specialists mostly concurred, note that the team is aligned.
        `;
        
        await injectPromptIntoGemini(pmPrompt);
        await waitForIdleState();

        // C. LISTENING PHASE
        btn.innerText = "👂 Listening for your reply...";
        const userReply = await waitForUserReply();
        
        if (userReply) {
            console.log("User Replied: ", userReply);
            runMeetingLoop(selectedCheckboxes, userReply, "The User (You)");
        }

    } catch (error) {
        console.error(error);
        alert("Loop Error: " + error.message);
        resetUI();
    }
}

function resetUI() {
    const btn = document.getElementById('startMeetingBtn');
    btn.innerText = "🚀 Start Team Meeting";
    btn.disabled = false;
}

// --- 5. CORE UTILITIES ---

async function ensureGeminiTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes("gemini.google.com")) {
        await chrome.tabs.create({ url: GEMINI_URL });
        await new Promise(r => setTimeout(r, 5000));
    }
}

async function injectPromptIntoGemini(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => {
            const editor = document.querySelector('.ql-editor') || document.querySelector('div[contenteditable="true"]'); 
            if (editor) {
                editor.focus();
                document.execCommand('insertText', false, msg);
                setTimeout(() => {
                    const sendBtn = document.querySelector('button[aria-label="Send message"]') || document.querySelector('button.send-button');
                    if(sendBtn) sendBtn.click();
                }, 800);
            } else { throw new Error("Chat input not found."); }
        },
        args: [text]
    });
}

async function waitForIdleState() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    const sendBtn = document.querySelector('button[aria-label="Send message"]');
                    const isIdle = sendBtn && !sendBtn.hasAttribute('disabled') && sendBtn.getAttribute('aria-disabled') !== 'true';
                    if (isIdle) {
                        clearInterval(checkInterval);
                        resolve(true);
                    }
                }, 1000);
            });
        }
    });
}

// --- 6. THE LISTENER ---
async function waitForUserReply() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            return new Promise((resolve) => {
                console.log("System: Listening for user input...");
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