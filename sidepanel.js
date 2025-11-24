/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    Full-Duplex Conversational Manager with Auto-Looping & Noise Reduction
*/

let loadedFiles = [];
let gems = [];
const GEMINI_URL = "https://gemini.google.com";
let loopCount = 0;
const MAX_LOOPS = 5; // Safety brake to prevent infinite runaway chats

// --- 1. LEGACY FOLDER LOADING ---
document.getElementById('folderInput').addEventListener('change', async (event) => {
    try {
        const files = event.target.files;
        if (files.length === 0) return;
        loadedFiles = Array.from(files);
        
        const statusDiv = document.getElementById('folderStatus');
        statusDiv.innerText = `✅ Loaded: ${files.length} files`;
        statusDiv.className = 'status-linked';
        
        await scanForGems();
    } catch (err) {
        console.error("File load error:", err);
    }
});

// --- 2. GEM DISCOVERY ---
async function scanForGems() {
    const container = document.getElementById('gemList');
    container.innerHTML = ''; 
    gems = [];

    for (const file of loadedFiles) {
        if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
            const name = file.name.split('.')[0]; 
            gems.push({ name: name, fileObj: file });
            
            const div = document.createElement('div');
            div.className = 'gem-card';
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${name}" checked> 
                    <div>
                        <strong>${name}</strong>
                        <span class="gem-info">${file.name}</span>
                    </div>
                </label>
            `;
            container.appendChild(div);
        }
    }
}

// --- 3. FILE READING ---
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
    
    // Reset Safety Counter
    loopCount = 0;
    
    // Start the Conversation Chain
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
            const gemData = gems.find(g => g.name === gemName);
            const knowledge = await readFileContent(gemData.fileObj);
            
            // --- UPDATED PROMPT: SILENCE PROTOCOL ADDED HERE ---
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
        
        // Wait for the USER to type a reply in the main window
        const userReply = await waitForUserReply();
        
        if (userReply) {
            // RESTART LOOP WITH NEW CONTEXT
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
                    // Check if button is visible AND enabled
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

    // Inject a listener that waits for the DOM to change (User Message Added)
    return await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            return new Promise((resolve) => {
                console.log("System: Listening for user input...");
                
                // 1. Snapshot current message count
                const getMessageCount = () => document.querySelectorAll('.user-query').length || document.querySelectorAll('[data-test-id="user-query"]').length; // Google specific selectors
                const initialCount = getMessageCount();

                // 2. Poll for increase
                const poll = setInterval(() => {
                    const currentCount = getMessageCount();
                    
                    // If we have MORE user queries than before, the user just sent one!
                    if (currentCount > initialCount) {
                        clearInterval(poll);
                        
                        // Try to grab the text of the last user query
                        const allQueries = document.querySelectorAll('.user-query'); 
                        const lastQuery = allQueries[allQueries.length - 1]?.innerText || "User Follow-up";
                        
                        resolve(lastQuery);
                    }
                }, 1000);
            });
        }
    }).then(results => results[0].result); // Get the return value from the injected script
}