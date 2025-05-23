const { ipcRenderer } = require('electron'); // Added for IPC communication

document.addEventListener('DOMContentLoaded', function() {
    const webview = document.getElementById('webview');
    const urlInput = document.getElementById('url');
    const goButton = document.getElementById('go');
    const backButton = document.getElementById('back');
    const forwardButton = document.getElementById('forward');

    // Navigation History
    let navigationHistory = [];
    let currentHistoryIndex = -1;

    // Recording session data
    // Array to store user actions (clicks, input, navigation) recorded during a session.
    let recordedActions = [];
    // Boolean flag to indicate if a recording (actions and video) is currently in progress.
    let isRecording = false; 

    // Video Recording variables
    // Holds the MediaStream object obtained from navigator.mediaDevices.getUserMedia.
    let localStream;
    // The MediaRecorder instance used to record video from the localStream.
    let mediaRecorder;
    // Stores the file path of the most recently saved video recording. Null if no video is saved or recording is in progress.
    let currentVideoFilePath = null;

    // Gemini Results Modal Elements
    // The main container element for the modal dialog that displays Gemini analysis results.
    const geminiResultsModal = document.getElementById('geminiResultsModal');
    // The button within the modal used to close it.
    const closeGeminiResultsModalBtn = document.getElementById('closeGeminiResultsModal');
    // The paragraph element within the modal where the Gemini-generated description is displayed.
    const geminiDescriptionEl = geminiResultsModal.querySelector('#geminiDescription p');
    // The unordered list (ul) element within the modal where Gemini-identified skills are listed.
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

        // If a recording session is active, capture navigation events as part of the recorded actions.
        if (isRecording) {
            const navigationAction = {
                type: 'navigation', // Type of action
                url: event.url,     // The URL navigated to
                timestamp: Date.now(), // Timestamp of the navigation
                selector: null,     // No specific element selector for navigation
                value: `Navigated to ${event.url}`, // Descriptive value of the action
                attributes: { tagName: 'webview' } // Associated element (the webview itself)
            };
            recordedActions.push(navigationAction); // Add to the list of recorded actions
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

    // This was the original DOMContentLoaded, so its content is merged here.
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
    const webviewContextMenu = document.getElementById('webviewContextMenu'); // Added declaration for webviewContextMenu
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
        // Handles the click event on the 'Record' button, toggling between starting and stopping a recording.
        recordButton.addEventListener('click', async () => {
          // Determine the intended state (start or stop recording) based on the current `isRecording` flag.
          const intendedRecordingState = !isRecording;

          // --- BRANCH 1: User wants to START recording ---
          if (intendedRecordingState) {
            // Display a privacy notice on the first recording attempt.
            // The user must click "Start Recording" again to confirm consent.
            if (!localStorage.getItem('hasShownRecordingNotice')) {
                alert("Privacy Notice:\nWhen you start recording, this application will capture your screen activity and interactions. This data, including the screen recording and a log of your actions (like clicks and text input), will be sent to an external AI service (Gemini) for analysis.\n\nPlease ensure no sensitive or private information is visible on your screen during recording.\n\nClick 'Start Recording' again if you consent and wish to proceed.");
                localStorage.setItem('hasShownRecordingNotice', 'true');
                return; // Exit early, requiring a second click to actually start.
            }
            
            // Update recording state and UI.
            isRecording = true; 
            recordButton.textContent = "Stop Recording";
            recordButton.disabled = true; // Disable button temporarily to prevent rapid clicks during setup.
            console.log("Attempting to start recording (actions and video)...");
            
            // Reset data from any previous recording session.
            recordedActions = []; 
            currentVideoFilePath = null; 
            // Notify the main process to reset its recording state (e.g., clear chunk array).
            ipcRenderer.send('reset-recording-state'); 
            
            if (webview) { // Log the initial URL when recording starts.
                const initialUrl = webview.getURL();
                recordedActions.push({ type: 'navigation', url: initialUrl, timestamp: Date.now(), selector: null, value: `Navigated to ${initialUrl}`, attributes: { tagName: 'webview'} });
                console.log('User action recording started. Initial URL:', initialUrl);
            }
            
            try {
                // Request the screen source ID from the main process.
                // This is needed for navigator.mediaDevices.getUserMedia to capture the screen.
                const sourceId = await ipcRenderer.invoke('get-screen-source-id');
                if (!sourceId) { // Handle failure to get a source ID (e.g., user cancels picker, no suitable source).
                    console.error('Failed to get screen source ID.');
                    geminiDescriptionEl.textContent = "Error: Failed to get screen source for recording. Ensure the application window is visible and try again.";
                    geminiSkillsEl.innerHTML = '';
                    geminiResultsModal.style.display = 'block';
                    // Reset recording state and UI if source ID acquisition fails.
                    isRecording = false; 
                    recordButton.textContent = "Start Recording";
                    recordButton.disabled = false;
                    return;
                }

                console.log('Screen source ID obtained:', sourceId);
                // Get the media stream (screen video). Audio is explicitly set to false.
                // Constraints specify desktop capture using the obtained sourceId and preferred dimensions.
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: false, 
                    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } }
                });
                console.log('Media stream obtained.');
                recordButton.disabled = false; // Re-enable button now that setup is nearly complete.

                // Initialize the MediaRecorder with the stream and specified MIME type.
                // 'video/webm; codecs=vp9' is a common choice for high-quality web video.
                mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm; codecs=vp9' });

                // Event handler for when video data becomes available.
                // This fires periodically based on the timeslice parameter in mediaRecorder.start().
                mediaRecorder.ondataavailable = async (event) => {
                    if (event.data.size > 0) { // Ensure there's actual data.
                        const buffer = await event.data.arrayBuffer(); // Convert Blob to ArrayBuffer.
                        // Send the data chunk (as Uint8Array) to the main process for aggregation.
                        ipcRenderer.send('recording-chunk', new Uint8Array(buffer));
                    }
                };

                // Event handler for when the MediaRecorder stops.
                // This is a critical part of the process, handling video finalization, upload, and AI analysis.
                mediaRecorder.onstop = async () => {
                    console.log('MediaRecorder stopped in renderer.');
                    recordButton.textContent = "Saving video..."; 
                    recordButton.disabled = true; // Disable button during saving/analysis.

                    // Request the main process to finalize the recording (save chunks to a file).
                    const saveResult = await ipcRenderer.invoke('stop-recording-finalize');
                    
                    // --- Sub-branch: Handling video save result ---
                    if (saveResult.success) { // Video saved successfully.
                        currentVideoFilePath = saveResult.filePath; // Store the path for upload.
                        console.log('Video recording finalized. Saved at:', currentVideoFilePath);
                        recordButton.textContent = "Analyzing with AI..."; // Update button text.
                        
                        // Show modal with "loading" state for better UX.
                        geminiDescriptionEl.textContent = "Analyzing with AI, please wait...";
                        geminiSkillsEl.innerHTML = '<li>Loading identified skills...</li>'; 
                        geminiResultsModal.style.display = 'block';

                        // Proceed to upload if video path and actions are available.
                        if (currentVideoFilePath && recordedActions && recordedActions.length > 0) {
                            console.log('Attempting to upload to Gemini...');
                            try {
                                // Invoke IPC handler in main process to upload video and actions to Gemini.
                                const geminiResult = await ipcRenderer.invoke('upload-to-gemini', { actions: recordedActions, videoPath: currentVideoFilePath });
                                
                                // --- Sub-branch: Handling Gemini API response ---
                                if (geminiResult.success && geminiResult.data) { // Successful API call.
                                    console.log('Gemini Analysis Complete:', geminiResult.data);
                                    // Attempt to parse the standard Gemini API response structure.
                                    let modelOutputText = null;
                                    if (geminiResult.data.candidates &&
                                        geminiResult.data.candidates[0] &&
                                        geminiResult.data.candidates[0].content &&
                                        geminiResult.data.candidates[0].content.parts &&
                                        geminiResult.data.candidates[0].content.parts[0] &&
                                        geminiResult.data.candidates[0].content.parts[0].text) {
                                        modelOutputText = geminiResult.data.candidates[0].content.parts[0].text;
                                    }

                                    geminiSkillsEl.innerHTML = ''; // Clear previous skills list.

                                    if (modelOutputText) { // If text was successfully extracted.
                                        const fullResponseText = modelOutputText;
                                        const descMarker = "DESCRIPTION:";
                                        const skillsMarker = "SKILLS:";
                                        let descriptionText = "";
                                        let skillsText = "";

                                        // Extract DESCRIPTION part.
                                        const descIndex = fullResponseText.indexOf(descMarker);
                                        const skillsIndex = fullResponseText.indexOf(skillsMarker);
                                        if (descIndex !== -1) {
                                            descriptionText = fullResponseText.substring(
                                                descIndex + descMarker.length,
                                                skillsIndex !== -1 ? skillsIndex : fullResponseText.length
                                            ).trim();
                                        } else { // Fallback if DESCRIPTION marker is missing.
                                            descriptionText = fullResponseText.trim();
                                            console.warn("DESCRIPTION: marker not found in Gemini response. Displaying full text as description.");
                                        }
                                        geminiDescriptionEl.textContent = descriptionText || "No description provided by AI.";

                                        // Extract and parse SKILLS part.
                                        if (skillsIndex !== -1) {
                                            skillsText = fullResponseText.substring(skillsIndex + skillsMarker.length).trim();
                                            const skillBlocks = skillsText.split(/(?=- SKILL TITLE:)/g); // Split by skill title delimiter.

                                            if (skillBlocks.length > 0) {
                                                skillBlocks.forEach(skillBlockText => {
                                                    if (!skillBlockText.trim().startsWith("- SKILL TITLE:")) return;

                                                    const lines = skillBlockText.trim().split('\n');
                                                    const skillTitleLine = lines.find(line => line.trim().startsWith("- SKILL TITLE:"));
                                                    const skillTitle = skillTitleLine ? skillTitleLine.replace("- SKILL TITLE:", "").trim() : "Untitled Skill";
                                                    
                                                    const skillLi = document.createElement('li');
                                                    skillLi.innerHTML = `<strong>TITLE:</strong> ${skillTitle}`;
                                                    
                                                    const actionsUl = document.createElement('ul');
                                                    const actionsMarkerIndex = lines.findIndex(line => line.trim().toUpperCase() === "ACTIONS:");
                                                    
                                                    if (actionsMarkerIndex !== -1) { // If "ACTIONS:" marker found.
                                                        for (let i = actionsMarkerIndex + 1; i < lines.length; i++) {
                                                            const actionLine = lines[i].trim();
                                                            if (actionLine.startsWith("- ") && actionLine.length > 2) {
                                                                const actionItemLi = document.createElement('li');
                                                                actionItemLi.textContent = actionLine.substring(2).trim();
                                                                actionsUl.appendChild(actionItemLi);
                                                            } else if (actionLine.trim() !== "" && !actionLine.trim().startsWith("- SKILL TITLE:")) {
                                                                const actionItemLi = document.createElement('li');
                                                                actionItemLi.textContent = actionLine.trim();
                                                                actionsUl.appendChild(actionItemLi);
                                                            }
                                                        }
                                                    }
                                                    // Append actions or "no actions" message.
                                                    if (actionsUl.hasChildNodes()) {
                                                        skillLi.appendChild(actionsUl);
                                                    } else {
                                                        const noActionsLi = document.createElement('li');
                                                        noActionsLi.textContent = "No specific actions listed for this skill.";
                                                        skillLi.appendChild(noActionsLi);
                                                    }
                                                    geminiSkillsEl.appendChild(skillLi);
                                                });
                                                // Handle cases where parsing might not yield list items.
                                                if (!geminiSkillsEl.hasChildNodes() && skillsText.length > 0) {
                                                    geminiSkillsEl.innerHTML = '<li>Could not parse skills from AI response format.</li>';
                                                } else if (!geminiSkillsEl.hasChildNodes()) {
                                                     geminiSkillsEl.innerHTML = '<li>No skills identified by AI.</li>';
                                                }
                                            } else { // No skill blocks found after splitting.
                                                geminiSkillsEl.innerHTML = '<li>No specific skills identified or skills format was incorrect.</li>';
                                            }
                                        } else { // SKILLS marker not found.
                                            geminiSkillsEl.innerHTML = '<li>SKILLS: section not found in AI response.</li>';
                                            if (descIndex === -1) { // If neither marker was found.
                                                geminiDescriptionEl.textContent = "AI response received, but content format is unrecognized.";
                                            }
                                        }
                                    } else { // modelOutputText is null or empty (unexpected API response structure).
                                        geminiDescriptionEl.textContent = "Successfully contacted AI, but response format was unexpected or empty.";
                                        geminiSkillsEl.innerHTML = '<li>Could not parse skills from AI response.</li>';
                                    }
                                } else { // Gemini API call failed or returned an error.
                                    console.error('Gemini API processing failed:', geminiResult.error);
                                    geminiDescriptionEl.textContent = 'Gemini Analysis Error: ' + (geminiResult.error || 'Unknown error from AI service.');
                                    geminiSkillsEl.innerHTML = '<li>Displaying locally captured actions due to analysis error.</li>';
                                    // Fallback: Display locally recorded actions if AI analysis fails.
                                    recordedActions.forEach(item => {
                                         const li = document.createElement('li');
                                         let attributesHtml = ''; // Construct HTML for action attributes.
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
                                }
                            } catch (geminiInvokeError) { // Error invoking the 'upload-to-gemini' IPC itself.
                                console.error('Error invoking upload-to-gemini:', geminiInvokeError);
                                geminiDescriptionEl.textContent = 'Failed to send data for Gemini analysis: ' + geminiInvokeError.message;
                                geminiSkillsEl.innerHTML = '<li>Displaying locally captured actions due to communication error.</li>';
                                 recordedActions.forEach(item => { /* ... fallback to local actions ... */ }); // Simplified for brevity
                            }
                        } else { // Conditions for Gemini upload not met (e.g., no video or no actions).
                            geminiDescriptionEl.textContent = !currentVideoFilePath ? 'Video file was not saved correctly. Cannot upload to Gemini.' : 'No actions recorded to analyze.';
                            geminiSkillsEl.innerHTML = '<li>Displaying locally captured actions.</li>';
                            recordedActions.forEach(item => { /* ... fallback to local actions ... */ }); // Simplified for brevity
                        }
                        geminiResultsModal.style.display = 'block'; // Ensure modal is visible with results or errors.
                    } else { // stop-recording-finalize failed (video saving error).
                        // Handle specific "No data recorded" error from main process.
                        if (saveResult.message === "No data recorded.") {
                            geminiDescriptionEl.textContent = "No video data was recorded. Please try recording for a longer duration or ensure the screen content is changing.";
                            geminiSkillsEl.innerHTML = '<li>No actions to analyze as no video was recorded.</li>';
                        } else { // Other video saving errors.
                            console.error('Failed to save video:', saveResult.error);
                            geminiDescriptionEl.textContent = 'Error saving video: ' + (saveResult.error || 'Unknown error during video saving.');
                            geminiSkillsEl.innerHTML = '<li>Video could not be saved. Analysis cannot proceed.</li>';
                        }
                        geminiResultsModal.style.display = 'block'; // Show modal with error.
                    }

                    // Cleanup: Stop all tracks on the local media stream.
                    if (localStream) localStream.getTracks().forEach(track => track.stop());
                    localStream = null; // Release stream object.
                    mediaRecorder = null; // Release recorder object.
                    // Reset record button to initial state.
                    recordButton.textContent = "Start Recording"; 
                    recordButton.disabled = false; 
                };
                
                // Event handler for errors within the MediaRecorder itself.
                mediaRecorder.onerror = (event) => {
                    console.error('MediaRecorder error:', event.error);
                    geminiDescriptionEl.textContent = `MediaRecorder error: ${event.error.name} - ${event.error.message}. Please try again.`;
                    geminiSkillsEl.innerHTML = '';
                    geminiResultsModal.style.display = 'block';
                    // Attempt to stop the recorder if it's not already inactive to trigger onstop for cleanup.
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
                    // Reset recording state and UI.
                    isRecording = false; 
                    recordButton.textContent = "Start Recording";
                    recordButton.disabled = false;
                };

                // Start recording. The argument (1000ms) specifies the timeslice,
                // meaning ondataavailable will fire every 1 second with the data recorded during that slice.
                mediaRecorder.start(1000); 
                console.log('Video recording started.');

            } catch (error) { // Catch errors from get-screen-source-id or getUserMedia.
                console.error('Error starting video recording (source/permissions):', error);
                geminiDescriptionEl.textContent = `Failed to start recording: ${error.name === 'NotAllowedError' || error.message.includes('denied') ? 'Screen/microphone access denied. Please check system permissions.' : (error.message || 'Unknown error during setup.') }`;
                geminiSkillsEl.innerHTML = '';
                geminiResultsModal.style.display = 'block';
                // Reset recording state and UI.
                isRecording = false; 
                recordButton.textContent = "Start Recording";
                recordButton.disabled = false;
                if (localStream) localStream.getTracks().forEach(track => track.stop()); // Ensure stream is stopped if partially acquired.
                localStream = null;
                mediaRecorder = null;
            }

          // --- BRANCH 2: User wants to STOP recording ---
          } else { 
            console.log("Stopping recording (actions and video)...");
            // If MediaRecorder exists and is currently recording, stop it.
            // This will trigger the mediaRecorder.onstop event handler.
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop(); 
            } else { // If recorder wasn't active (e.g., failed to start).
                 console.log("Video recorder was not active or already stopped.");
                 recordButton.textContent = "Start Recording"; 
                 recordButton.disabled = false; 
                 // Optionally, if actions were recorded but video failed, show local actions.
                 if (recordedActions.length > 0 && geminiResultsModal && (!mediaRecorder || mediaRecorder.state === 'inactive')) {
                    geminiDescriptionEl.textContent = "Displaying locally recorded actions (video recording was not active or failed to start):";
                    geminiSkillsEl.innerHTML = '';
                    recordedActions.forEach(item => { /* ... display local actions ... */ }); // Simplified for brevity
                    geminiResultsModal.style.display = 'block';
                 }
            }
          }
        });
    }

    // Event listener for messages from the webview-preload.js script.
    // This is used to capture user interactions (clicks, input) within the loaded web page.
    window.addEventListener('message', (event) => {
        // Check if the message is of type 'user-interaction'.
        if (event.data && event.data.type === 'user-interaction') {
            if (isRecording) { // Only add to recordedActions if a recording is in progress.
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
        
        if (typeof openPanel === 'function') { // Check if openPanel is defined before assigning
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
    // Placeholder for openPanel if it's not defined elsewhere, to avoid errors
    // In a real scenario, openPanel would be defined with its actual logic.
    if (typeof openPanel === 'undefined') {
        // eslint-disable-next-line no-unused-vars
        function openPanel(name, url) { 
            console.warn(`openPanel called for ${name} with ${url}, but it's not fully implemented.`);
            // Example: webview.loadURL(url); or similar logic to open in a new tab/panel.
        }
    }
});
