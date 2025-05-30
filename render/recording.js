// Recording functionality for the browser
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let apiKeyModal = null;
let resultsPanel = null;

// Media recording variables
let mediaRecorder = null;
let recordingStream = null;
let recordingChunks = [];

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    // Create and add recording UI elements
    createRecordingUI();
    
    // Initialize API key modal
    initializeAPIKeyModal();
    
    // Initialize results panel
    initializeResultsPanel();
    
    // Check if API key is already set
    checkAPIKey();
    
    // Set up action tracking
    setupActionTracking();
});

// Create recording UI elements
function createRecordingUI() {
    // Create recording controls container
    const controlsContainer = document.createElement('div');
    controlsContainer.id = 'recordingControls';
    controlsContainer.className = 'recording-controls';
    controlsContainer.innerHTML = `
        <button id="startRecording" title="Start Recording">🔴 Record</button>
        <button id="stopRecording" title="Stop Recording" disabled>⏹️ Stop</button>
        <span id="recordingStatus" class="recording-status">Not recording</span>
        <span id="recordingTimer" class="recording-timer">00:00</span>
        <button id="settingsButton" title="Recording Settings">⚙️</button>
    `;
    
    // Add to browser controls
    const browserControls = document.querySelector('.browser-controls');
    browserControls.appendChild(controlsContainer);
    
    // Add event listeners
    document.getElementById('startRecording').addEventListener('click', startRecording);
    document.getElementById('stopRecording').addEventListener('click', stopRecording);
    document.getElementById('settingsButton').addEventListener('click', showAPIKeyModal);
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .recording-controls {
            display: flex;
            align-items: center;
            margin-left: 10px;
            gap: 5px;
        }
        
        .recording-status {
            margin-left: 5px;
            font-size: 0.8em;
        }
        
        .recording-timer {
            font-family: monospace;
            font-size: 0.9em;
            margin-left: 5px;
        }
        
        .recording-active {
            color: red;
            animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        #startRecording {
            background-color: var(--button-bg);
            color: red;
            font-weight: bold;
        }
        
        #stopRecording {
            background-color: var(--button-bg);
        }
        
        #startRecording:hover, #stopRecording:hover {
            background-color: var(--button-hover);
        }
        
        .api-key-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 9999;
        }
        
        .api-key-modal-content {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: var(--panel-bg);
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
            width: 400px;
            max-width: 90%;
        }
        
        .api-key-modal h2 {
            margin-top: 0;
        }
        
        .api-key-modal input {
            width: 100%;
            padding: 8px;
            margin: 10px 0;
            box-sizing: border-box;
        }
        
        .api-key-modal-buttons {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 15px;
        }
        
        .results-panel {
            display: none;
            position: fixed;
            top: 0;
            right: 0;
            width: 400px;
            height: 100%;
            background-color: var(--panel-bg);
            box-shadow: -2px 0 5px rgba(0, 0, 0, 0.2);
            z-index: 9000;
            overflow-y: auto;
            transition: transform 0.3s ease;
            transform: translateX(100%);
        }
        
        .results-panel.active {
            transform: translateX(0);
        }
        
        .results-header {
            padding: 10px;
            background-color: var(--header-bg);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .results-content {
            padding: 15px;
        }
        
        .results-step {
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .copy-button {
            background-color: var(--button-bg);
            border: none;
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 3px;
        }
        
        .copy-button:hover {
            background-color: var(--button-hover);
        }
    `;
    document.head.appendChild(style);
}

// Initialize API key modal
function initializeAPIKeyModal() {
    // Create modal
    apiKeyModal = document.createElement('div');
    apiKeyModal.id = 'apiKeyModal';
    apiKeyModal.className = 'api-key-modal';
    apiKeyModal.innerHTML = `
        <div class="api-key-modal-content">
            <h2>Google Gemini API Key</h2>
            <p>Enter your Google Gemini API key to enable AI-powered screen recording analysis.</p>
            <input type="password" id="apiKeyInput" placeholder="Enter your Gemini API key">
            <div class="api-key-modal-buttons">
                <button id="cancelApiKey">Cancel</button>
                <button id="saveApiKey">Save</button>
            </div>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(apiKeyModal);
    
    // Add event listeners
    document.getElementById('cancelApiKey').addEventListener('click', () => {
        apiKeyModal.style.display = 'none';
    });
    
    document.getElementById('saveApiKey').addEventListener('click', saveAPIKey);
}

// Initialize results panel
function initializeResultsPanel() {
    // Create panel
    resultsPanel = document.createElement('div');
    resultsPanel.id = 'resultsPanel';
    resultsPanel.className = 'results-panel';
    resultsPanel.innerHTML = `
        <div class="results-header">
            <h2>Recording Results</h2>
            <button id="closeResults">✕</button>
        </div>
        <div class="results-content" id="resultsContent">
            <p>No recording results yet.</p>
        </div>
        <div class="results-footer">
            <button id="copyAllResults" class="copy-button">Copy All Steps</button>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(resultsPanel);
    
    // Add event listeners
    document.getElementById('closeResults').addEventListener('click', () => {
        resultsPanel.classList.remove('active');
    });
    
    document.getElementById('copyAllResults').addEventListener('click', () => {
        const resultsContent = document.getElementById('resultsContent').innerText;
        navigator.clipboard.writeText(resultsContent)
            .then(() => {
                showNotification('Results copied to clipboard', 'success');
            })
            .catch(err => {
                console.error('Failed to copy results:', err);
                showNotification('Failed to copy results', 'error');
            });
    });
}

// Check if API key is already set
async function checkAPIKey() {
    try {
        const result = await window.electron.ipcRenderer.invoke('get-gemini-api-key');
        if (!result.success || !result.apiKey) {
            // Show API key modal if not set
            setTimeout(() => {
                showAPIKeyModal();
            }, 1000);
        }
    } catch (error) {
        console.error('Error checking API key:', error);
    }
}

// Show API key modal
function showAPIKeyModal() {
    // Get current API key
    window.electron.ipcRenderer.invoke('get-gemini-api-key')
        .then(result => {
            if (result.success && result.apiKey) {
                // Mask API key
                document.getElementById('apiKeyInput').value = '•'.repeat(result.apiKey.length);
            } else {
                document.getElementById('apiKeyInput').value = '';
            }
            
            // Show modal
            apiKeyModal.style.display = 'block';
        })
        .catch(error => {
            console.error('Error retrieving API key:', error);
            apiKeyModal.style.display = 'block';
        });
}

// Save API key
async function saveAPIKey() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    
    if (!apiKey) {
        showNotification('Please enter an API key', 'error');
        return;
    }
    
    try {
        const result = await window.electron.ipcRenderer.invoke('set-gemini-api-key', apiKey);
        
        if (result.success) {
            showNotification('API key saved successfully', 'success');
            apiKeyModal.style.display = 'none';
        } else {
            showNotification(`Failed to save API key: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error saving API key:', error);
        showNotification('An error occurred while saving the API key', 'error');
    }
}

// Start recording
async function startRecording() {
    try {
        // Check if API key is set
        const apiKeyResult = await window.electron.ipcRenderer.invoke('get-gemini-api-key');
        
        if (!apiKeyResult.success || !apiKeyResult.apiKey) {
            showNotification('Please set your Gemini API key first', 'error');
            showAPIKeyModal();
            return;
        }
        
        // Reset recording state
        recordingChunks = [];
        
        // Get screen sources from main process
        const sourcesResult = await window.electron.ipcRenderer.invoke('get-screen-sources');
        if (!sourcesResult.success) {
            throw new Error(`Failed to get screen sources: ${sourcesResult.message}`);
        }
        
        // Find the browser window source
        const sources = sourcesResult.sources;
        const browserSource = sources.find(source => 
            source.name.includes('codebro') || 
            source.name.includes('Electron') || 
            source.name.toLowerCase().includes('browser')
        );
        
        if (!browserSource) {
            throw new Error('Could not find browser window for recording');
        }
        
        // Create MediaStream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: browserSource.id
                }
            }
        });
        
        // Save the stream for cleanup later
        recordingStream = stream;
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        
        // Set up data handling
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordingChunks.push(event.data);
            }
        };
        
        // Set up recording completion handler
        mediaRecorder.onstop = async () => {
            try {
                // Create a blob from the chunks
                const blob = new Blob(recordingChunks, { type: 'video/webm' });
                
                // Convert blob to buffer
                const buffer = await blob.arrayBuffer();
                
                showNotification('Processing recording with Gemini...', 'info');
                
                // Send to main process for Gemini processing
                const result = await window.electron.ipcRenderer.invoke('process-recording', {
                    buffer: buffer,
                    mimeType: 'video/webm'
                });
                
                // Handle result
                if (result.success) {
                    showNotification('Recording processed successfully', 'success');
                    displayRecordingResults(result.instructions);
                } else {
                    showNotification(`Processing failed: ${result.message}`, 'error');
                }
                
                // Clean up
                cleanupRecording();
            } catch (error) {
                console.error('Error processing recording:', error);
                showNotification(`Error processing recording: ${error.message}`, 'error');
                cleanupRecording();
            }
        };
        
        // Start MediaRecorder
        mediaRecorder.start(1000); // Capture in 1-second chunks
        
        // Notify main process to start tracking actions
        const result = await window.electron.ipcRenderer.invoke('start-recording');
        
        if (result.success) {
            // Update UI
            isRecording = true;
            recordingStartTime = Date.now();
            updateRecordingUI(true);
            
            // Start timer
            startRecordingTimer();
            
            showNotification('Recording started', 'success');
            
            // Set up automatic stop after max duration (5 minutes)
            setTimeout(() => {
                if (isRecording && mediaRecorder && mediaRecorder.state !== 'inactive') {
                    stopRecording();
                }
            }, 5 * 60 * 1000);
        } else {
            // Clean up if main process failed to start recording
            cleanupRecording();
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        showNotification(`Failed to start recording: ${error.message}`, 'error');
        cleanupRecording();
    }
}

// Stop recording
async function stopRecording() {
    try {
        if (!isRecording || !mediaRecorder) {
            showNotification('No recording in progress', 'error');
            return;
        }
        
        // Stop the MediaRecorder if it's active
        if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        // Notify main process
        await window.electron.ipcRenderer.invoke('stop-recording');
        
        // Update UI
        isRecording = false;
        updateRecordingUI(false);
        
        // Stop timer
        stopRecordingTimer();
        
        showNotification('Recording stopped. Processing...', 'info');
    } catch (error) {
        console.error('Error stopping recording:', error);
        showNotification(`Error stopping recording: ${error.message}`, 'error');
        cleanupRecording();
    }
}

// Clean up recording resources
function cleanupRecording() {
    // Stop MediaRecorder if it exists and is active
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
        } catch (e) {
            console.error('Error stopping media recorder:', e);
        }
    }
    
    // Stop all tracks in the stream
    if (recordingStream) {
        recordingStream.getTracks().forEach(track => {
            track.stop();
        });
    }
    
    // Reset variables
    mediaRecorder = null;
    recordingStream = null;
    recordingChunks = [];
}

// Update recording UI
function updateRecordingUI(recording) {
    const startButton = document.getElementById('startRecording');
    const stopButton = document.getElementById('stopRecording');
    const statusElement = document.getElementById('recordingStatus');
    const timerElement = document.getElementById('recordingTimer');
    
    if (recording) {
        startButton.disabled = true;
        stopButton.disabled = false;
        statusElement.textContent = 'Recording';
        statusElement.classList.add('recording-active');
        timerElement.classList.add('recording-active');
    } else {
        startButton.disabled = false;
        stopButton.disabled = true;
        statusElement.textContent = 'Not recording';
        statusElement.classList.remove('recording-active');
        timerElement.classList.remove('recording-active');
        timerElement.textContent = '00:00';
    }
}

// Start recording timer
function startRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
    }
    
    recordingTimer = setInterval(() => {
        if (!recordingStartTime) return;
        
        const elapsed = Date.now() - recordingStartTime;
        const seconds = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
        const minutes = Math.floor((elapsed / (1000 * 60)) % 60).toString().padStart(2, '0');
        
        document.getElementById('recordingTimer').textContent = `${minutes}:${seconds}`;
        
        // Auto-stop after 5 minutes
        if (elapsed >= 5 * 60 * 1000) {
            stopRecording();
        }
    }, 1000);
}

// Stop recording timer
function stopRecordingTimer() {
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    recordingStartTime = null;
}

// Set up action tracking
function setupActionTracking() {
    // Track clicks
    document.addEventListener('click', event => {
        if (!isRecording) return;
        
        // Get element details
        const target = event.target;
        const tagName = target.tagName.toLowerCase();
        const id = target.id ? `#${target.id}` : '';
        const classes = target.className ? `.${target.className.replace(/\s+/g, '.')}` : '';
        const text = target.textContent ? target.textContent.trim().substring(0, 20) : '';
        
        // Log action
        logAction('click', `Clicked on ${tagName}${id}${classes} "${text}${text.length > 20 ? '...' : ''}"`);
    });
    
    // Track navigation
    const webview = document.getElementById('webview');
    if (webview) {
        webview.addEventListener('did-navigate', event => {
            if (!isRecording) return;
            
            const url = event.url;
            logAction('navigation', `Navigated to ${url}`);
        });
        
        webview.addEventListener('did-navigate-in-page', event => {
            if (!isRecording) return;
            
            const url = event.url;
            logAction('navigation', `Navigated within page to ${url}`);
        });
    }
    
    // Track form inputs
    document.addEventListener('input', event => {
        if (!isRecording) return;
        
        const target = event.target;
        if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'textarea') {
            const inputType = target.type || 'text';
            const inputId = target.id ? `#${target.id}` : '';
            
            // Don't log actual values for security
            logAction('input', `Entered text in ${inputType} field${inputId}`);
        }
    });
    
    // Track form submissions
    document.addEventListener('submit', event => {
        if (!isRecording) return;
        
        const form = event.target;
        const formId = form.id ? `#${form.id}` : '';
        
        logAction('form', `Submitted form${formId}`);
    });
    
    // Track copy/paste
    document.addEventListener('copy', () => {
        if (!isRecording) return;
        logAction('copy', 'Copied text to clipboard');
    });
    
    document.addEventListener('paste', () => {
        if (!isRecording) return;
        logAction('paste', 'Pasted text from clipboard');
    });
    
    // Track keyboard shortcuts
    document.addEventListener('keydown', event => {
        if (!isRecording) return;
        
        // Only log special keys and shortcuts
        if (event.ctrlKey || event.metaKey || event.altKey || 
            event.key === 'Enter' || event.key === 'Escape' || 
            event.key === 'Tab' || event.key === 'Backspace') {
            
            const modifiers = [];
            if (event.ctrlKey) modifiers.push('Ctrl');
            if (event.altKey) modifiers.push('Alt');
            if (event.shiftKey) modifiers.push('Shift');
            if (event.metaKey) modifiers.push('Meta');
            
            const keyCombo = [...modifiers, event.key].join('+');
            logAction('keyboard', `Pressed ${keyCombo}`);
        }
    });
}

// Log user action
function logAction(type, details) {
    if (!isRecording) return;
    
    // Send to main process
    window.electron.ipcRenderer.send('log-action', {
        type,
        details,
        time: new Date().toISOString()
    });
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        document.body.appendChild(notification);
        
        // Add styles if not already added
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                .notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 10px 15px;
                    border-radius: 4px;
                    color: white;
                    font-weight: bold;
                    z-index: 10000;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    max-width: 300px;
                }
                
                .notification.show {
                    opacity: 1;
                }
                
                .notification.info {
                    background-color: #2196F3;
                }
                
                .notification.success {
                    background-color: #4CAF50;
                }
                
                .notification.error {
                    background-color: #F44336;
                }
                
                .notification.warning {
                    background-color: #FF9800;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Set message and type
    notification.textContent = message;
    notification.className = `notification ${type}`;
    
    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Hide after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Display recording results
function displayRecordingResults(instructions) {
    const resultsContent = document.getElementById('resultsContent');
    
    // Format instructions as steps
    let formattedInstructions = '';
    
    if (typeof instructions === 'string') {
        // Check if instructions are already formatted as numbered steps
        if (instructions.match(/^\d+\.\s/m)) {
            formattedInstructions = instructions;
        } else {
            // Format as numbered steps
            formattedInstructions = instructions
                .split('\n')
                .filter(line => line.trim().length > 0)
                .map((line, index) => `${index + 1}. ${line}`)
                .join('\n');
        }
    } else {
        formattedInstructions = 'No instructions generated.';
    }
    
    // Create HTML for steps
    const stepsHtml = formattedInstructions
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(step => `<div class="results-step">${step}</div>`)
        .join('');
    
    // Update panel content
    resultsContent.innerHTML = stepsHtml || '<p>No steps generated.</p>';
    
    // Show panel
    resultsPanel.classList.add('active');
}

// Listen for recording status changes from main process
window.electron.ipcRenderer.on('recording-status-changed', (data) => {
    isRecording = data.isRecording;
    updateRecordingUI(isRecording);
    
    if (isRecording) {
        recordingStartTime = Date.now();
        startRecordingTimer();
    } else {
        stopRecordingTimer();
    }
});
