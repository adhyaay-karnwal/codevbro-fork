const { ipcRenderer } = require('electron'); // Added for IPC communication

const webview = document.getElementById('webview');
const urlInput = document.getElementById('url');
const goButton = document.getElementById('go');
const backButton = document.getElementById('back');
const forwardButton = document.getElementById('forward');

// Navigation History
let navigationHistory = [];
let currentHistoryIndex = -1;

// Recording session data
let recordedActions = [];
let isRecording = false; 

// Video Recording variables
let localStream;
let mediaRecorder;
let currentVideoFilePath = null;

// Gemini Results Modal Elements
const geminiResultsModal = document.getElementById('geminiResultsModal');
const closeGeminiResultsModalBtn = document.getElementById('closeGeminiResultsModal');
const geminiDescriptionEl = geminiResultsModal.querySelector('#geminiDescription p');
const geminiSkillsEl = geminiResultsModal.querySelector('#geminiSkills ul');

if (closeGeminiResultsModalBtn) {
    closeGeminiResultsModalBtn.addEventListener('click', () => {
        if (geminiResultsModal) geminiResultsModal.style.display = 'none';
    });
}
// Optional: Close modal if clicked outside of its content
window.addEventListener('click', (event) => {
    if (event.target === geminiResultsModal) {
        if (geminiResultsModal) geminiResultsModal.style.display = 'none';
    }
});


// Enhanced navigation function
function navigateTo(input) {
    input = input.trim();
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    const ipPattern = /^(https?:\/\/)?((?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(:\d+)?$/;
    const localhostPattern = /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/;
    function searchOnGoogle(query) {
        return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
    if (urlPattern.test(input) || ipPattern.test(input) || localhostPattern.test(input)) {
        const url = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`;
        if(webview) webview.src = url;
        if(urlInput) urlInput.value = url;
    } else {
        const googleSearchUrl = searchOnGoogle(input);
        if(webview) webview.src = googleSearchUrl;
        if(urlInput) urlInput.value = googleSearchUrl;
    }
}

if(goButton) goButton.addEventListener('click', () => {
    const url = urlInput.value;
    navigateTo(url);
});

if(urlInput) urlInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        const url = urlInput.value;
        navigateTo(url);
    }
});

if(webview) webview.addEventListener('did-navigate', (event) => {
    if(urlInput) urlInput.value = event.url;
    if (currentHistoryIndex === -1 || event.url !== navigationHistory[currentHistoryIndex]) {
        if (currentHistoryIndex < navigationHistory.length - 1) {
            navigationHistory = navigationHistory.slice(0, currentHistoryIndex + 1);
        }
        navigationHistory.push(event.url);
        currentHistoryIndex++;
        saveHistory(); 
    }
    updateNavigationButtons();

    if (isRecording) {
        const navigationAction = {
            type: 'navigation', 
            url: event.url,
            timestamp: Date.now(),
            selector: null, 
            value: `Navigated to ${event.url}`, 
            attributes: { tagName: 'webview' } 
        };
        recordedActions.push(navigationAction);
        console.log('User action (navigation) during recording:', navigationAction);
    }
});

if(backButton) backButton.addEventListener('click', () => {
    if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        const previousUrl = navigationHistory[currentHistoryIndex];
        if(webview) webview.src = previousUrl;
        if(urlInput) urlInput.value = previousUrl;
        updateNavigationButtons();
    }
});

if(forwardButton) forwardButton.addEventListener('click', () => {
    if (currentHistoryIndex < navigationHistory.length - 1) {
        currentHistoryIndex++;
        const nextUrl = navigationHistory[currentHistoryIndex];
        if(webview) webview.src = nextUrl;
        if(urlInput) urlInput.value = nextUrl;
        updateNavigationButtons();
    }
});

function updateNavigationButtons() {
    if(backButton) backButton.disabled = currentHistoryIndex <= 0;
    if(forwardButton) forwardButton.disabled = currentHistoryIndex >= navigationHistory.length - 1;
}

const removeBtnContextMenu = document.getElementById('removeButton');
if (removeBtnContextMenu) removeBtnContextMenu.addEventListener('click', () => {
    const contextMenu = document.getElementById('customContextMenu');
    const name = contextMenu.getAttribute('data-button-name');
    const url = contextMenu.getAttribute('data-button-url');
    const buttonId = contextMenu.getAttribute('data-button-element');
    const customButtons = JSON.parse(localStorage.getItem('customButtons') || '[]');
    const updatedButtons = customButtons.filter(btn => !(btn.name === name && btn.url === url));
    localStorage.setItem('customButtons', JSON.stringify(updatedButtons));
    const button = document.getElementById(buttonId);
    if (button) button.remove();
    contextMenu.style.display = 'none';
});

const cancelCtxMenuBtn = document.getElementById('cancelContextMenu');
if(cancelCtxMenuBtn) cancelCtxMenuBtn.addEventListener('click', () => {
    const contextMenu = document.getElementById('customContextMenu');
    if(contextMenu) contextMenu.style.display = 'none';
});

document.addEventListener('click', (e) => { 
    const customContextMenu = document.getElementById('customContextMenu');
    const webviewContextMenuElem = document.getElementById('webviewContextMenu');
    if (customContextMenu && !e.target.closest('.context-menu') && !e.target.closest('#customButtons button')) {
        customContextMenu.style.display = 'none';
    }
    if (webviewContextMenuElem && !e.target.closest('#webviewContextMenu') && !e.target.closest('#webview')) {
       webviewContextMenuElem.style.display = 'none';
    }
});

document.addEventListener('contextmenu', (e) => {
    const customContextMenu = document.getElementById('customContextMenu');
    if (customContextMenu && !e.target.closest('#customButtons button')) {
        customContextMenu.style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const customButtons = JSON.parse(localStorage.getItem('customButtons') || '[]');
    const container = document.getElementById('customButtons');
    if(container) container.innerHTML = ''; 
    customButtons.forEach(({ name, url }) => {
        addButtonToUI(name, url); 
    });

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.innerHTML = `${savedTheme === 'light' ? '🌓' : '☀️'} Theme`;
});

const editBtnModal = document.getElementById('editButton');
if(editBtnModal) editBtnModal.addEventListener('click', () => {
    const contextMenu = document.getElementById('customContextMenu');
    const name = contextMenu.getAttribute('data-button-name');
    const url = contextMenu.getAttribute('data-button-url');
    document.getElementById('editButtonName').value = name;
    document.getElementById('editButtonUrl').value = url;
    document.getElementById('editButtonModal').setAttribute('data-editing-name', name); 
    document.getElementById('editButtonModal').style.display = 'block';
    contextMenu.style.display = 'none';
});

const saveEditBtnModal = document.getElementById('saveEditButton');
if(saveEditBtnModal) saveEditBtnModal.addEventListener('click', () => {
    const oldName = document.getElementById('editButtonModal').getAttribute('data-editing-name');
    const newName = document.getElementById('editButtonName').value.trim();
    const newUrl = document.getElementById('editButtonUrl').value.trim();
    if (!newName || !newUrl) {
        alert('Please enter both name and URL');
        return;
    }
    let customButtons = JSON.parse(localStorage.getItem('customButtons') || '[]');
    const buttonIndex = customButtons.findIndex(btn => btn.name === oldName); 
    if (buttonIndex !== -1) {
        customButtons[buttonIndex] = { name: newName, url: newUrl };
        localStorage.setItem('customButtons', JSON.stringify(customButtons));
        const buttonElement = document.querySelector(`#customButtons button[data-name="${oldName}"]`);
        if (buttonElement) {
            buttonElement.textContent = newName;
            buttonElement.setAttribute('data-name', newName);
            buttonElement.setAttribute('data-url', newUrl);
        }
        document.getElementById('editButtonModal').style.display = 'none';
    }
});

const cancelEditBtnModal = document.getElementById('cancelEditButton');
if(cancelEditBtnModal) cancelEditBtnModal.addEventListener('click', () => {
    document.getElementById('editButtonModal').style.display = 'none';
});

// Webview Context Menu Handling
if (webview && webviewContextMenu) {
    webview.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        webviewContextMenu.style.display = 'block';
        webviewContextMenu.style.left = `${e.clientX}px`;
        webviewContextMenu.style.top = `${e.clientY}px`;
    });
}

// Context Menu Actions
const contextMenuActions = {
    inspectElement: () => webview.inspectElement(webview.getWebContents().getLastFocusedBounds().x, webview.getWebContents().getLastFocusedBounds().y),
    viewPageSource: () => webview.executeJavaScript('window.location.href', false, (url) => navigateTo(`view-source:${url}`)),
    reloadPage: () => webview.reload(),
    goBack: () => webview.canGoBack() && webview.goBack(),
    goForward: () => webview.canGoForward() && webview.goForward(),
    saveAsPDF: () => webview.printToPDF({}, (error, data) => {
        if (error) return console.error('Error generating PDF:', error);
        const blob = new Blob([data], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'webpage.pdf';
        link.click();
    }),
    printPage: () => webview.print(),
    copyAddress: () => webview.executeJavaScript('window.location.href', false, (url) => navigator.clipboard.writeText(url).then(() => console.log('URL copied')).catch(err => console.error('Failed to copy URL:', err))),
};

Object.keys(contextMenuActions).forEach(id => {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener('click', () => {
            if (webview) contextMenuActions[id]();
            if (webviewContextMenu) webviewContextMenu.style.display = 'none';
        });
    }
});

// Recording functionality
const recordButton = document.getElementById('recordBtn');

if (recordButton) {
    recordButton.addEventListener('click', async () => {
      // Toggle intended state first
      const intendedRecordingState = !isRecording;

      if (intendedRecordingState) { // User wants to start recording
        if (!localStorage.getItem('hasShownRecordingNotice')) {
            alert("Privacy Notice:\nWhen you start recording, this application will capture your screen activity and interactions. This data, including the screen recording and a log of your actions (like clicks and text input), will be sent to an external AI service (Gemini) for analysis.\n\nPlease ensure no sensitive or private information is visible on your screen during recording.\n\nClick 'Start Recording' again if you consent and wish to proceed.");
            localStorage.setItem('hasShownRecordingNotice', 'true');
            // No change to isRecording, button text remains "Start Recording"
            return; // User needs to click "Start Recording" again to confirm
        }
        
        isRecording = true; // Set actual recording state
        recordButton.textContent = "Stop Recording";
        recordButton.disabled = true; 
        console.log("Attempting to start recording (actions and video)...");
        
        recordedActions = []; 
        if (webview) {
            const initialUrl = webview.getURL();
            recordedActions.push({ type: 'navigation', url: initialUrl, timestamp: Date.now(), selector: null, value: `Navigated to ${initialUrl}`, attributes: { tagName: 'webview'} });
            console.log('User action recording started. Initial URL:', initialUrl);
        }

        currentVideoFilePath = null; 
        ipcRenderer.send('reset-recording-state'); 
        
        try {
            const sourceId = await ipcRenderer.invoke('get-screen-source-id');
            if (!sourceId) {
                console.error('Failed to get screen source ID.');
                geminiDescriptionEl.textContent = "Error: Failed to get screen source for recording. Ensure the application window is visible and try again.";
                geminiSkillsEl.innerHTML = '';
                geminiResultsModal.style.display = 'block';
                isRecording = false; 
                recordButton.textContent = "Start Recording";
                recordButton.disabled = false;
                return;
            }

            console.log('Screen source ID obtained:', sourceId);
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: false, 
                video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } }
            });
            console.log('Media stream obtained.');
            recordButton.disabled = false; 

            mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm; codecs=vp9' });

            mediaRecorder.ondataavailable = async (event) => {
                if (event.data.size > 0) {
                    const buffer = await event.data.arrayBuffer();
                    ipcRenderer.send('recording-chunk', new Uint8Array(buffer));
                }
            };

            mediaRecorder.onstop = async () => {
                console.log('MediaRecorder stopped in renderer.');
                recordButton.textContent = "Saving video..."; 
                recordButton.disabled = true;

                const saveResult = await ipcRenderer.invoke('stop-recording-finalize');
                if (saveResult.success) {
                    currentVideoFilePath = saveResult.filePath;
                    console.log('Video recording finalized. Saved at:', currentVideoFilePath);
                    recordButton.textContent = "Analyzing with AI..."; // New state
                    
                    if (currentVideoFilePath && recordedActions && recordedActions.length > 0) {
                        console.log('Attempting to upload to Gemini...');
                        try {
                            const geminiResult = await ipcRenderer.invoke('upload-to-gemini', { actions: recordedActions, videoPath: currentVideoFilePath });
                            if (geminiResult.success && geminiResult.data) {
                                console.log('Gemini Analysis Complete:', geminiResult.data);
                                geminiDescriptionEl.textContent = geminiResult.data.description || 'No description provided by Gemini.';
                                geminiSkillsEl.innerHTML = ''; 
                                if (geminiResult.data.skills && geminiResult.data.skills.length > 0) {
                                    geminiResult.data.skills.forEach(item => { 
                                        const li = document.createElement('li');
                                        let attributesHtml = '';
                                        if (item.attributes) {
                                            attributesHtml += ` (Tag: ${item.attributes.tagName || 'N/A'}`;
                                            if (item.attributes.id) attributesHtml += `, ID: #${item.attributes.id}`;
                                            if (item.attributes.name) attributesHtml += `, Name: ${item.attributes.name}`;
                                            if (item.attributes.inputType) attributesHtml += `, Type: ${item.attributes.inputType}`;
                                            if (item.attributes.placeholder) attributesHtml += `, Placeholder: "${item.attributes.placeholder}"`;
                                            if (item.attributes.ariaLabel) attributesHtml += `, Aria-Label: "${item.attributes.ariaLabel}"`;
                                            attributesHtml += ')';
                                        }
                                        li.innerHTML = `<span class="action-type">${item.type || item.action || 'N/A'}</span> on <span class="action-selector">${item.selector || 'N/A'}</span>${attributesHtml}${item.value ? ` with value "<strong>${item.value}</strong>"` : ''}<br><span class="action-url">URL: ${item.url || 'N/A'}</span><br><span class="action-timestamp">Time: ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`;
                                        geminiSkillsEl.appendChild(li);
                                    });
                                } else {
                                    geminiSkillsEl.innerHTML = '<li>No specific skills/actions identified by AI.</li>';
                                }
                            } else { // Gemini API call failed or returned error
                                console.error('Gemini API processing failed:', geminiResult.error);
                                geminiDescriptionEl.textContent = 'Gemini Analysis Error: ' + (geminiResult.error || 'Unknown error from AI service.');
                                geminiSkillsEl.innerHTML = '<li>Displaying locally captured actions due to analysis error.</li>';
                                recordedActions.forEach(item => { // Fallback to showing local actions
                                     const li = document.createElement('li');
                                     let attributesHtml = '';
                                     if (item.attributes) { /* ... same as above ... */ }
                                     li.innerHTML = `<span class="action-type">${item.type || item.action || 'N/A'}</span> on <span class="action-selector">${item.selector || 'N/A'}</span>${attributesHtml}${item.value ? ` with value "<strong>${item.value}</strong>"` : ''}<br><span class="action-url">URL: ${item.url || 'N/A'}</span><br><span class="action-timestamp">Time: ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`;
                                     geminiSkillsEl.appendChild(li);
                                });
                            }
                        } catch (geminiInvokeError) { // Error invoking 'upload-to-gemini' itself
                            console.error('Error invoking upload-to-gemini:', geminiInvokeError);
                            geminiDescriptionEl.textContent = 'Failed to send data for Gemini analysis: ' + geminiInvokeError.message;
                            geminiSkillsEl.innerHTML = '<li>Displaying locally captured actions due to communication error.</li>';
                             recordedActions.forEach(item => { /* ... fallback ... */ });
                        }
                    } else { // Conditions for Gemini upload not met
                        geminiDescriptionEl.textContent = !currentVideoFilePath ? 'Video file was not saved correctly. Cannot upload to Gemini.' : 'No actions recorded to analyze.';
                        geminiSkillsEl.innerHTML = '<li>Displaying locally captured actions.</li>';
                        recordedActions.forEach(item => { /* ... fallback ... */ });
                    }
                    geminiResultsModal.style.display = 'block';
                } else { // stop-recording-finalize failed (video saving error)
                    console.error('Failed to save video:', saveResult.error);
                    geminiDescriptionEl.textContent = 'Error saving video: ' + (saveResult.error || 'Unknown error during video saving.');
                    geminiSkillsEl.innerHTML = '<li>Video could not be saved. Analysis cannot proceed.</li>';
                    geminiResultsModal.style.display = 'block';
                }

                if (localStream) localStream.getTracks().forEach(track => track.stop());
                localStream = null;
                mediaRecorder = null;
                recordButton.textContent = "Start Recording"; 
                recordButton.disabled = false; 
            };
            
            mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                geminiDescriptionEl.textContent = `MediaRecorder error: ${event.error.name} - ${event.error.message}. Please try again.`;
                geminiSkillsEl.innerHTML = '';
                geminiResultsModal.style.display = 'block';
                if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); // Will trigger onstop which handles cleanup
                isRecording = false; // Ensure state is reset
                recordButton.textContent = "Start Recording";
                recordButton.disabled = false;
            };

            mediaRecorder.start(1000); 
            console.log('Video recording started.');

        } catch (error) { // Catch errors from get-screen-source-id or getUserMedia
            console.error('Error starting video recording (source/permissions):', error);
            geminiDescriptionEl.textContent = `Failed to start recording: ${error.name === 'NotAllowedError' || error.message.includes('denied') ? 'Screen/microphone access denied. Please check system permissions.' : (error.message || 'Unknown error during setup.') }`;
            geminiSkillsEl.innerHTML = '';
            geminiResultsModal.style.display = 'block';
            isRecording = false; 
            recordButton.textContent = "Start Recording";
            recordButton.disabled = false;
            if (localStream) localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            mediaRecorder = null;
        }

      } else { // User wants to stop recording
        console.log("Stopping recording (actions and video)...");
        // Log final user actions - this is more for debugging, modal shows them
        // console.log("Final user actions recorded:", recordedActions);
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop(); 
        } else {
             console.log("Video recorder was not active or already stopped.");
             recordButton.textContent = "Start Recording"; 
             recordButton.disabled = false; // Ensure enabled if no active recorder
             // Optionally, if actions exist but no video, show them
             if (recordedActions.length > 0 && geminiResultsModal && (!mediaRecorder || mediaRecorder.state === 'inactive')) {
                geminiDescriptionEl.textContent = "Displaying locally recorded actions (video recording was not active or failed to start):";
                geminiSkillsEl.innerHTML = '';
                recordedActions.forEach(item => {
                    const li = document.createElement('li');
                    let attributesHtml = '';
                    if (item.attributes) { 
                        attributesHtml += ` (Tag: ${item.attributes.tagName || 'N/A'}`;
                        if (item.attributes.id) attributesHtml += `, ID: #${item.attributes.id}`;
                        if (item.attributes.name) attributesHtml += `, Name: ${item.attributes.name}`;
                        if (item.attributes.inputType) attributesHtml += `, Type: ${item.attributes.inputType}`;
                        if (item.attributes.placeholder) attributesHtml += `, Placeholder: "${item.attributes.placeholder}"`;
                        if (item.attributes.ariaLabel) attributesHtml += `, Aria-Label: "${item.attributes.ariaLabel}"`;
                        attributesHtml += ')';
                    }
                    li.innerHTML = `<span class="action-type">${item.type || item.action || 'N/A'}</span> on <span class="action-selector">${item.selector || 'N/A'}</span>${attributesHtml}${item.value ? ` with value "<strong>${item.value}</strong>"` : ''}<br><span class="action-url">URL: ${item.url || 'N/A'}</span><br><span class="action-timestamp">Time: ${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>`;
                    geminiSkillsEl.appendChild(li);
                });
                geminiResultsModal.style.display = 'block';
             }
        }
      }
    });
}

window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'user-interaction') {
        if (isRecording) { 
            recordedActions.push(event.data.detail);
        }
    }
});

function saveHistory() {
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('navigationHistory', JSON.stringify(navigationHistory));
        localStorage.setItem('currentHistoryIndex', currentHistoryIndex.toString());
    } else {
        console.warn('localStorage is not available. History not saved.');
    }
}

function addButtonToUI(name, url) {
    const container = document.getElementById('customButtons');
    if (!container) return; 
    const button = document.createElement('button');
    button.textContent = name;
    button.id = `customButton-${name.replace(/\s+/g, '-')}`; 
    button.setAttribute('data-name', name);
    button.setAttribute('data-url', url);
    
    if (typeof openPanel === 'function') {
        button.onclick = () => openPanel(name, url); 
    } else {
        console.warn('openPanel function not found for custom buttons.');
    }
    
    button.oncontextmenu = (e) => {
        e.preventDefault();
        const contextMenu = document.getElementById('customContextMenu');
        if(!contextMenu) return;
        contextMenu.setAttribute('data-button-name', name);
        contextMenu.setAttribute('data-button-url', url);
        contextMenu.setAttribute('data-button-element', button.id);
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.top = `${e.clientY}px`;
        const editModal = document.getElementById('editButtonModal');
        if (editModal) editModal.setAttribute('data-editing-name', name);
    };
    container.appendChild(button);
}
// Ensure openPanel is defined if it's actually used.
// function openPanel(name, url) { console.log(`openPanel called for ${name} with ${url}`); }
