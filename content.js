// File: content.js (Updated)
// Content script to monitor for user replies and signal the side panel

let observer = null;
let initialQueryCount = 0;

// Listen for messages from the Side Panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_MONITORING') {
        startUserReplyMonitor(request.userQuerySelector);
        // The side panel expects a response, even if we start async work
        sendResponse({ status: 'Monitoring started' });
        return true; 
    }
    return false;
});

function startUserReplyMonitor(userQuerySelector) { // Renamed argument for clarity
    // Stop any existing observer
    if (observer) {
        observer.disconnect();
        observer = null;
    }

    // FIX: Using the correct selector for the SENT user message bubble
    const getUserQueries = () =>
        document.querySelectorAll(userQuerySelector);
    
    // Set the baseline count of user messages currently on the screen
    initialQueryCount = getUserQueries().length;

    // We observe the body for changes in the number of user messages
    observer = new MutationObserver((mutationsList, observer) => {
        const currentCount = getUserQueries().length;

        // If a new user message has appeared since monitoring started
        if (currentCount > initialQueryCount) {
            observer.disconnect();
            
            // Signal the side panel to restart the meeting
            chrome.runtime.sendMessage({ action: 'USER_REPLY_SENT' }); 
        }
    });

    // Start observing the body for changes in children (new messages)
    observer.observe(document.body, { 
        childList: true, 
        subtree: true 
    });
}