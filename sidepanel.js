/* .About
    File Name:  sidepanel.js
    Author:     Kristopher Roy
    Purpose:    Orchestrates the multi-agent conversation and bridges local files to the browser DOM.
*/

let directoryHandle = null;
let gems = [];

// --- 1. FOLDER LINKING ---
document.getElementById('linkFolderBtn').addEventListener('click', async () => {
    try {
        directoryHandle = await window.showDirectoryPicker();
        const statusDiv = document.getElementById('folderStatus');
        statusDiv.innerText = `✅ Linked: ${directoryHandle.name}`;
        statusDiv.className = 'status-linked';
        await scanForGems();
    } catch (err) {
        console.error("Folder access denied:", err);
    }
});

// --- 2. GEM DISCOVERY ---
async function scanForGems() {
    const container = document.getElementById('gemList');
    container.innerHTML = ''; 
    gems = [];

    // Scan for .txt or .md files
    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && (entry.name.endsWith('.txt') || entry.name.endsWith('.md'))) {
            const name = entry.name.split('.')[0]; 
            gems.push({ name: name, filename: entry.name });
            
            const div = document.createElement('div');
            div.className = 'gem-card';
            div.innerHTML = `
                <label>
                    <input type="checkbox" value="${name}" checked> 
                    <div>
                        <strong>${name}</strong>
                        <span class="gem-info">${entry.name}</span>
                    </div>
                </label>
            `;
            container.appendChild(div);
        }
    }
    if (gems.length === 0) container.innerHTML = '<p style="color:red; text-align:center;">No text files found.</p>';
}

// --- 3. FILE READING ---
async function getFileContent(filename) {
    if (!directoryHandle) return ""; 
    try {
        const fileHandle = await directoryHandle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        return await file.text();
    } catch (e) {
        return `[System Error: Could not read ${filename}]`;
    }
}

// --- 4. THE ORCHESTRATOR ---
document.getElementById('startMeetingBtn').addEventListener('click', async () => {
    const selectedCheckboxes = Array.from(document.querySelectorAll('#gemList input:checked'));
    const userTopic = document.getElementById('userInput').value;
    
    if (selectedCheckboxes.length === 0) return alert("Select at least one Specialist.");
    if (!userTopic) return alert("Please provide a topic.");

    const btn = document.getElementById('startMeetingBtn');
    btn.innerText = "Running Meeting...";
    btn.disabled = true;

    try {
        for (const cb of selectedCheckboxes) {
            const gemName = cb.value;
            const gemData = gems.find(g => g.name === gemName);
            const knowledge = await getFileContent(gemData.filename);
            
            // The Prompt Engineering
            const prompt = `
*** SYSTEM INSTRUCTION: NEW SPEAKER ***
ROLE: ${gemName}
CONTEXT/KNOWLEDGE:
${knowledge.substring(0, 10000)}

TOPIC: ${userTopic}

TASK: Provide your specific expert analysis on the topic. Be direct.
            `;

            await injectPromptIntoGemini(prompt);
            
            // Wait for generation (20 seconds per turn - adjust as needed)
            await new Promise(r => setTimeout(r, 20000)); 
        }
    } catch (error) {
        alert("Error: " + error.message);
    } finally {
        btn.innerText = "🚀 Start Team Meeting";
        btn.disabled = false;
    }
});

// --- 5. DOM INJECTION ---
async function injectPromptIntoGemini(text) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes("gemini.google.com")) {
        throw new Error("You must be on gemini.google.com!");
    }

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (msg) => {
            // Locate the input box (Google classes change, so we try multiple selectors)
            const editor = document.querySelector('.ql-editor') || 
                           document.querySelector('div[contenteditable="true"]'); 
            
            if (editor) {
                editor.focus();
                document.execCommand('insertText', false, msg);
                
                setTimeout(() => {
                    const sendBtn = document.querySelector('button[aria-label="Send message"]') || 
                                    document.querySelector('button.send-button');
                    if(sendBtn) sendBtn.click();
                }, 800);
            } else {
                alert("Could not locate chat input. Google may have updated the UI.");
            }
        },
        args: [text]
    });
}