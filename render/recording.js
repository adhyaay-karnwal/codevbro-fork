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

// Debug flag - set to true to enable console debugging
const DEBUG = true;

// Debug logger function
function debugLog(...args) {
    if (DEBUG) {
        console.log('[Recording Debug]', ...args);
    }
}

// Check if electron API is available
function checkElectronAvailability() {
    if (!window.electron) {
        console.error('Electron API not available. Make sure preload.js is properly loaded.');
        return false;
    }
    return true;
}

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOM loaded, initializing recording UI');
    
    try {
        // Create and add recording UI elements
        createRecordingUI();
        
        // Initialize API key modal
        initializeAPIKeyModal();
        
        // Initialize results panel
        initializeResultsPanel();
        
        // Check if API key is already set
        setTimeout(() => {
            checkAPIKey();
        }, 1000);
        
        // Set up action tracking
        setupActionTracking();
        
        debugLog('Recording UI initialization complete');
    } catch (error) {
        console.error('Error initializing recording UI:', error);
    }
});

// Create recording UI elements
function createRecordingUI() {
    debugLog('Creating recording UI elements');
    
    try {
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
        if (browserControls) {
            browserControls.appendChild(controlsContainer);
            debugLog('Recording controls added to browser controls');
        } else {
            console.error('Browser controls element not found');
        }
        
        // Add event listeners
        document.getElementById('startRecording')?.addEventListener('click', startRecording);
        document.getElementById('stopRecording')?.addEventListener('click', stopRecording);
        document.getElementById('settingsButton')?.addEventListener('click', showAPIKeyModal);
        
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
                display: block;
                position: fixed;
                top: 0;
                right: 0;
                width: 400px;
                height: 100%;
                background-color: var(--panel-bg);
                box-shadow: -5px 0 15px rgba(0, 0, 0, 0.3);
                z-index: 9000;
                overflow-y: auto;
                transition: transform 0.3s ease;
                transform: translateX(100%);
                border-left: 1px solid var(--border-color);
            }
            
            .results-panel.active {
                transform: translateX(0);
            }
            
            .results-header {
                padding: 15px;
                background-color: var(--header-bg);
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
                position: sticky;
                top: 0;
                z-index: 1;
            }
            
            .results-header h2 {
                margin: 0;
                font-size: 18px;
                color: var(--text-color);
            }
            
            .results-header button {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: var(--text-color);
            }
            
            .results-content {
                padding: 20px;
                color: var(--text-color);
            }
            
            .results-step {
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid var(--border-color);
                line-height: 1.5;
                font-size: 15px;
            }
            
            .results-step:last-child {
                border-bottom: none;
            }
            
            .results-footer {
                padding: 15px;
                background-color: var(--header-bg);
                border-top: 1px solid var(--border-color);
                display: flex;
                justify-content: flex-end;
                position: sticky;
                bottom: 0;
            }
            
            .copy-button {
                background-color: #4CAF50;
                color: white;
                border: none;
                padding: 8px 15px;
                cursor: pointer;
                border-radius: 3px;
                font-weight: bold;
                transition: background-color 0.2s;
            }
            
            .copy-button:hover {
                background-color: #45a049;
            }
            
            .source-selection-modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.5);
                z-index: 9999;
            }
            
            .source-selection-content {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: var(--panel-bg);
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
                width: 600px;
                max-width: 90%;
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .source-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                gap: 15px;
                margin-top: 15px;
            }
            
            .source-item {
                border: 2px solid var(--border-color);
                border-radius: 5px;
                padding: 10px;
                cursor: pointer;
                transition: border-color 0.3s;
                display: flex;
                flex-direction: column;
            }
            
            .source-item:hover {
                border-color: #007bff;
            }
            
            .source-item.selected {
                border-color: #28a745;
                background-color: rgba(40, 167, 69, 0.1);
            }
            
            .source-thumbnail {
                width: 100%;
                height: 150px;
                object-fit: contain;
                margin-bottom: 10px;
            }
            
            .source-name {
                font-weight: bold;
                margin-bottom: 5px;
                word-break: break-word;
            }
            
            .source-id {
                font-size: 0.8em;
                color: #666;
                word-break: break-all;
            }
            
            /* Results loading animation */
            .results-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 30px;
                text-align: center;
            }
            
            .loading-spinner {
                border: 4px solid rgba(0, 0, 0, 0.1);
                border-radius: 50%;
                border-top: 4px solid #3498db;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin-bottom: 15px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            /* Empty state */
            .empty-results {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 20px;
                text-align: center;
                color: #666;
            }
            
            .empty-results-icon {
                font-size: 48px;
                margin-bottom: 15px;
                opacity: 0.5;
            }
        `;
        document.head.appendChild(style);
        debugLog('Recording styles added');
    } catch (error) {
        console.error('Error creating recording UI:', error);
    }
}

// Initialize API key modal
function initializeAPIKeyModal() {
    debugLog('Initializing API key modal');
    
    try {
        // Create modal if it doesn't exist
        if (!document.getElementById('apiKeyModal')) {
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
            debugLog('API key modal created and added to body');
            
            // Add event listeners
            document.getElementById('cancelApiKey')?.addEventListener('click', () => {
                apiKeyModal.style.display = 'none';
            });
            
            document.getElementById('saveApiKey')?.addEventListener('click', saveAPIKey);
            
            // Close modal when clicking outside
            apiKeyModal.addEventListener('click', (event) => {
                if (event.target === apiKeyModal) {
                    apiKeyModal.style.display = 'none';
                }
            });
        } else {
            apiKeyModal = document.getElementById('apiKeyModal');
            debugLog('API key modal already exists, using existing element');
        }
    } catch (error) {
        console.error('Error initializing API key modal:', error);
    }
}

// Initialize source selection modal
function initializeSourceSelectionModal() {
    debugLog('Initializing source selection modal');
    
    try {
        // Remove existing modal if it exists
        const existingModal = document.getElementById('sourceSelectionModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal
        const modal = document.createElement('div');
        modal.id = 'sourceSelectionModal';
        modal.className = 'source-selection-modal';
        modal.innerHTML = `
            <div class="source-selection-content">
                <h2>Select Window to Record</h2>
                <p>Choose which window you want to record:</p>
                <div id="sourceGrid" class="source-grid"></div>
                <div class="api-key-modal-buttons">
                    <button id="cancelSourceSelection">Cancel</button>
                    <button id="confirmSourceSelection" disabled>Start Recording</button>
                </div>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(modal);
        
        // Add event listeners
        document.getElementById('cancelSourceSelection')?.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Close modal when clicking outside
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
        
        return modal;
    } catch (error) {
        console.error('Error initializing source selection modal:', error);
        return null;
    }
}

// Initialize results panel
function initializeResultsPanel() {
    debugLog('Initializing results panel');
    
    try {
        // Remove existing panel if it exists
        const existingPanel = document.getElementById('resultsPanel');
        if (existingPanel) {
            existingPanel.remove();
        }
        
        // Create panel
        resultsPanel = document.createElement('div');
        resultsPanel.id = 'resultsPanel';
        resultsPanel.className = 'results-panel';
        resultsPanel.innerHTML = `
            <div class="results-header">
                <h2>Step-by-Step Instructions</h2>
                <button id="closeResults" title="Close">✕</button>
            </div>
            <div class="results-content" id="resultsContent">
                <div class="empty-results">
                    <div class="empty-results-icon">📋</div>
                    <p>No recording results yet. Start a recording to see AI-generated instructions here.</p>
                </div>
            </div>
            <div class="results-footer">
                <button id="copyAllResults" class="copy-button">Copy All Steps</button>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(resultsPanel);
        
        // Add event listeners
        document.getElementById('closeResults')?.addEventListener('click', () => {
            hideResultsPanel();
        });
        
        document.getElementById('copyAllResults')?.addEventListener('click', () => {
            const resultsContent = document.getElementById('resultsContent')?.innerText;
            if (resultsContent) {
                navigator.clipboard.writeText(resultsContent)
                    .then(() => {
                        showNotification('Results copied to clipboard', 'success');
                    })
                    .catch(err => {
                        console.error('Failed to copy results:', err);
                        showNotification('Failed to copy results', 'error');
                    });
            }
        });
        
        debugLog('Results panel initialized');
    } catch (error) {
        console.error('Error initializing results panel:', error);
    }
}

// Show results panel with loading state
function showResultsPanelLoading() {
    debugLog('Showing results panel in loading state');
    
    try {
        if (!resultsPanel) {
            debugLog('Results panel not initialized, initializing now');
            initializeResultsPanel();
        }
        
        // Set loading content
        const resultsContent = document.getElementById('resultsContent');
        if (resultsContent) {
            resultsContent.innerHTML = `
                <div class="results-loading">
                    <div class="loading-spinner"></div>
                    <p>Analyzing recording with Google Gemini AI...</p>
                    <p>This may take a moment depending on the length of your recording.</p>
                </div>
            `;
        }
        
        // Show panel
        showResultsPanel();
    } catch (error) {
        console.error('Error showing results panel loading state:', error);
    }
}

// Show results panel
function showResultsPanel() {
    debugLog('Showing results panel');
    
    try {
        if (!resultsPanel) {
            debugLog('Results panel not initialized, initializing now');
            initializeResultsPanel();
        }
        
        // Add active class to show panel
        resultsPanel.classList.add('active');
        
        // Ensure the panel is visible
        resultsPanel.style.display = 'block';
        
        debugLog('Results panel shown');
    } catch (error) {
        console.error('Error showing results panel:', error);
    }
}

// Hide results panel
function hideResultsPanel() {
    debugLog('Hiding results panel');
    
    try {
        if (resultsPanel) {
            resultsPanel.classList.remove('active');
        }
    } catch (error) {
        console.error('Error hiding results panel:', error);
    }
}

// Check if API key is already set
async function checkAPIKey() {
    debugLog('Checking if API key is set');
    
    try {
        if (!checkElectronAvailability()) {
            showNotification('Electron API not available. Cannot check API key.', 'error');
            return;
        }
        
        // Try using direct ipcRenderer first (for compatibility)
        if (window.ipcRenderer) {
            debugLog('Using direct ipcRenderer');
            try {
                const result = await window.ipcRenderer.invoke('get-gemini-api-key');
                debugLog('API key check result:', result);
                if (!result.success || !result.apiKey) {
                    debugLog('API key not set, showing modal');
                    setTimeout(() => {
                        showAPIKeyModal();
                    }, 500);
                }
                return;
            } catch (err) {
                debugLog('Error with direct ipcRenderer, falling back to window.electron');
            }
        }
        
        // Fallback to window.electron
        const result = await window.electron.ipcRenderer.invoke('get-gemini-api-key');
        debugLog('API key check result:', result);
        if (!result.success || !result.apiKey) {
            debugLog('API key not set, showing modal');
            setTimeout(() => {
                showAPIKeyModal();
            }, 500);
        }
    } catch (error) {
        console.error('Error checking API key:', error);
        // Show modal anyway if there was an error
        setTimeout(() => {
            showAPIKeyModal();
        }, 500);
    }
}

// Show API key modal
function showAPIKeyModal() {
    debugLog('Showing API key modal');
    
    try {
        if (!apiKeyModal) {
            debugLog('API key modal not initialized, initializing now');
            initializeAPIKeyModal();
        }
        
        if (!checkElectronAvailability()) {
            showNotification('Electron API not available. Cannot get API key.', 'error');
            apiKeyModal.style.display = 'block';
            return;
        }
        
        // Try using direct ipcRenderer first (for compatibility)
        const getKey = async () => {
            try {
                let result;
                if (window.ipcRenderer) {
                    debugLog('Using direct ipcRenderer for getting API key');
                    result = await window.ipcRenderer.invoke('get-gemini-api-key');
                } else {
                    debugLog('Using window.electron.ipcRenderer for getting API key');
                    result = await window.electron.ipcRenderer.invoke('get-gemini-api-key');
                }
                
                debugLog('Got API key result:', result);
                
                if (result.success && result.apiKey) {
                    // Mask API key
                    document.getElementById('apiKeyInput').value = '•'.repeat(result.apiKey.length);
                } else {
                    document.getElementById('apiKeyInput').value = '';
                }
                
                // Show modal
                apiKeyModal.style.display = 'block';
            } catch (error) {
                console.error('Error retrieving API key:', error);
                document.getElementById('apiKeyInput').value = '';
                apiKeyModal.style.display = 'block';
            }
        };
        
        getKey();
    } catch (error) {
        console.error('Error showing API key modal:', error);
        // Try to show modal anyway
        if (apiKeyModal) {
            apiKeyModal.style.display = 'block';
        }
    }
}

// Save API key
async function saveAPIKey() {
    debugLog('Saving API key');
    
    const apiKey = document.getElementById('apiKeyInput')?.value.trim();
    
    if (!apiKey) {
        showNotification('Please enter an API key', 'error');
        return;
    }
    
    try {
        if (!checkElectronAvailability()) {
            showNotification('Electron API not available. Cannot save API key.', 'error');
            return;
        }
        
        let result;
        // Try using direct ipcRenderer first (for compatibility)
        if (window.ipcRenderer) {
            debugLog('Using direct ipcRenderer for saving API key');
            result = await window.ipcRenderer.invoke('set-gemini-api-key', apiKey);
        } else {
            debugLog('Using window.electron.ipcRenderer for saving API key');
            result = await window.electron.ipcRenderer.invoke('set-gemini-api-key', apiKey);
        }
        
        if (result.success) {
            showNotification('API key saved successfully', 'success');
            if (apiKeyModal) {
                apiKeyModal.style.display = 'none';
            }
        } else {
            showNotification(`Failed to save API key: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error saving API key:', error);
        showNotification('An error occurred while saving the API key', 'error');
    }
}

// Show source selection modal
async function showSourceSelectionModal(sources) {
    debugLog('Showing source selection modal with sources:', sources);
    
    try {
        // Initialize modal
        const modal = initializeSourceSelectionModal();
        if (!modal) {
            throw new Error('Failed to initialize source selection modal');
        }
        
        // Get grid container
        const sourceGrid = document.getElementById('sourceGrid');
        if (!sourceGrid) {
            throw new Error('Source grid element not found');
        }
        
        // Clear existing content
        sourceGrid.innerHTML = '';
        
        // Add sources to grid
        sources.forEach(source => {
            const sourceItem = document.createElement('div');
            sourceItem.className = 'source-item';
            sourceItem.dataset.sourceId = source.id;
            
            // Create thumbnail if available
            let thumbnailHtml = '';
            if (source.thumbnail) {
                thumbnailHtml = `<img src="${source.thumbnail}" class="source-thumbnail" alt="${source.name}">`;
            }
            
            sourceItem.innerHTML = `
                ${thumbnailHtml}
                <div class="source-name">${source.name}</div>
                <div class="source-id">${source.id.substring(0, 20)}...</div>
            `;
            
            // Add click handler
            sourceItem.addEventListener('click', () => {
                // Remove selected class from all items
                document.querySelectorAll('.source-item').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Add selected class to this item
                sourceItem.classList.add('selected');
                
                // Enable confirm button
                const confirmButton = document.getElementById('confirmSourceSelection');
                if (confirmButton) {
                    confirmButton.disabled = false;
                }
            });
            
            sourceGrid.appendChild(sourceItem);
        });
        
        // Add confirm button handler
        const confirmButton = document.getElementById('confirmSourceSelection');
        if (confirmButton) {
            confirmButton.addEventListener('click', () => {
                const selectedItem = document.querySelector('.source-item.selected');
                if (selectedItem) {
                    const sourceId = selectedItem.dataset.sourceId;
                    modal.style.display = 'none';
                    
                    // Start recording with selected source
                    startRecordingWithSource(sources.find(s => s.id === sourceId));
                }
            });
        }
        
        // Show modal
        modal.style.display = 'block';
    } catch (error) {
        console.error('Error showing source selection modal:', error);
        showNotification('Failed to show source selection', 'error');
    }
}

// Start recording
async function startRecording() {
    debugLog('Starting recording');
    
    try {
        if (!checkElectronAvailability()) {
            showNotification('Electron API not available. Cannot start recording.', 'error');
            return;
        }
        
        // Check if API key is set
        let apiKeyResult;
        if (window.ipcRenderer) {
            debugLog('Using direct ipcRenderer for API key check');
            apiKeyResult = await window.ipcRenderer.invoke('get-gemini-api-key');
        } else {
            debugLog('Using window.electron.ipcRenderer for API key check');
            apiKeyResult = await window.electron.ipcRenderer.invoke('get-gemini-api-key');
        }
        
        if (!apiKeyResult.success || !apiKeyResult.apiKey) {
            showNotification('Please set your Gemini API key first', 'error');
            showAPIKeyModal();
            return;
        }
        
        // Reset recording state
        recordingChunks = [];
        
        // Get screen sources from main process
        let sourcesResult;
        if (window.ipcRenderer) {
            debugLog('Using direct ipcRenderer for screen sources');
            sourcesResult = await window.ipcRenderer.invoke('get-screen-sources');
        } else {
            debugLog('Using window.electron.ipcRenderer for screen sources');
            sourcesResult = await window.electron.ipcRenderer.invoke('get-screen-sources');
        }
        
        if (!sourcesResult.success) {
            throw new Error(`Failed to get screen sources: ${sourcesResult.message}`);
        }
        
        const sources = sourcesResult.sources;
        debugLog('Available sources:', sources);
        
        // Log all source names for debugging
        debugLog('Source names:', sources.map(s => s.name));
        
        // Try to find the browser window with multiple strategies
        let browserSource = findBrowserSource(sources);
        
        if (!browserSource) {
            // If no automatic match, show source selection modal
            showSourceSelectionModal(sources);
            return;
        }
        
        // Start recording with the found source
        await startRecordingWithSource(browserSource);
        
    } catch (error) {
        console.error('Error starting recording:', error);
        showNotification(`Failed to start recording: ${error.message}`, 'error');
        cleanupRecording();
    }
}

// Find browser source with multiple strategies
function findBrowserSource(sources) {
    debugLog('Finding browser source with multiple strategies');
    
    // Strategy 1: Look for exact matches
    let browserSource = sources.find(source => 
        source.name.includes('codebro') || 
        source.name.includes('Electron') || 
        source.name.toLowerCase().includes('browser')
    );
    
    if (browserSource) {
        debugLog('Found browser source with exact match:', browserSource.name);
        return browserSource;
    }
    
    // Strategy 2: Look for common window titles
    browserSource = sources.find(source => 
        source.name.toLowerCase().includes('chrome') ||
        source.name.toLowerCase().includes('firefox') ||
        source.name.toLowerCase().includes('edge') ||
        source.name.toLowerCase().includes('safari') ||
        source.name.toLowerCase().includes('opera') ||
        source.name.toLowerCase().includes('codesurf') ||
        source.name.toLowerCase().includes('strawberry')
    );
    
    if (browserSource) {
        debugLog('Found browser source with common title match:', browserSource.name);
        return browserSource;
    }
    
    // Strategy 3: Look for window sources (not screens)
    const windowSources = sources.filter(source => 
        !source.name.toLowerCase().includes('screen') &&
        !source.name.toLowerCase().includes('entire') &&
        !source.name.toLowerCase().includes('monitor')
    );
    
    if (windowSources.length > 0) {
        debugLog('Found window sources (not screens):', windowSources.map(s => s.name));
        return windowSources[0]; // Return the first window source
    }
    
    // Strategy 4: If all else fails, just return the first source
    if (sources.length > 0) {
        debugLog('No specific browser source found, using first available source:', sources[0].name);
        return sources[0];
    }
    
    // No sources found
    debugLog('No sources found at all');
    return null;
}

// Start recording with a specific source
async function startRecordingWithSource(source) {
    debugLog('Starting recording with source:', source);
    
    try {
        if (!source) {
            throw new Error('No source provided for recording');
        }
        
        // Create MediaStream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id
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
                
                // Show loading state in results panel
                showResultsPanelLoading();
                
                // Send to main process for Gemini processing
                let result;
                if (window.ipcRenderer) {
                    debugLog('Using direct ipcRenderer for processing');
                    result = await window.ipcRenderer.invoke('process-recording', {
                        buffer: buffer,
                        mimeType: 'video/webm'
                    });
                } else {
                    debugLog('Using window.electron.ipcRenderer for processing');
                    result = await window.electron.ipcRenderer.invoke('process-recording', {
                        buffer: buffer,
                        mimeType: 'video/webm'
                    });
                }
                
                debugLog('Received Gemini processing result:', result);
                
                // Handle result
                if (result.success) {
                    showNotification('✅ AI analysis complete! Showing step-by-step instructions.', 'success');
                    displayRecordingResults(result.instructions);
                } else {
                    showNotification(`Processing failed: ${result.message}`, 'error');
                    // Show error in results panel
                    displayProcessingError(result.message);
                }
                
                // Clean up
                cleanupRecording();
            } catch (error) {
                console.error('Error processing recording:', error);
                showNotification(`Error processing recording: ${error.message}`, 'error');
                // Show error in results panel
                displayProcessingError(error.message);
                cleanupRecording();
            }
        };
        
        // Start MediaRecorder
        mediaRecorder.start(1000); // Capture in 1-second chunks
        
        // Notify main process to start tracking actions
        let result;
        if (window.ipcRenderer) {
            debugLog('Using direct ipcRenderer for start-recording');
            result = await window.ipcRenderer.invoke('start-recording');
        } else {
            debugLog('Using window.electron.ipcRenderer for start-recording');
            result = await window.electron.ipcRenderer.invoke('start-recording');
        }
        
        if (result.success) {
            // Update UI
            isRecording = true;
            recordingStartTime = Date.now();
            updateRecordingUI(true);
            
            // Start timer
            startRecordingTimer();
            
            showNotification(`Recording started: ${source.name}`, 'success');
            
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
        console.error('Error starting recording with source:', error);
        showNotification(`Failed to start recording: ${error.message}`, 'error');
        cleanupRecording();
    }
}

// Stop recording
async function stopRecording() {
    debugLog('Stopping recording');
    
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
        if (window.ipcRenderer) {
            debugLog('Using direct ipcRenderer for stop-recording');
            await window.ipcRenderer.invoke('stop-recording');
        } else if (window.electron) {
            debugLog('Using window.electron.ipcRenderer for stop-recording');
            await window.electron.ipcRenderer.invoke('stop-recording');
        }
        
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
    debugLog('Cleaning up recording resources');
    
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
    debugLog('Updating recording UI, recording =', recording);
    
    const startButton = document.getElementById('startRecording');
    const stopButton = document.getElementById('stopRecording');
    const statusElement = document.getElementById('recordingStatus');
    const timerElement = document.getElementById('recordingTimer');
    
    if (!startButton || !stopButton || !statusElement || !timerElement) {
        console.error('Recording UI elements not found');
        return;
    }
    
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
    debugLog('Starting recording timer');
    
    if (recordingTimer) {
        clearInterval(recordingTimer);
    }
    
    recordingTimer = setInterval(() => {
        if (!recordingStartTime) return;
        
        const elapsed = Date.now() - recordingStartTime;
        const seconds = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
        const minutes = Math.floor((elapsed / (1000 * 60)) % 60).toString().padStart(2, '0');
        
        const timerElement = document.getElementById('recordingTimer');
        if (timerElement) {
            timerElement.textContent = `${minutes}:${seconds}`;
        }
        
        // Auto-stop after 5 minutes
        if (elapsed >= 5 * 60 * 1000) {
            stopRecording();
        }
    }, 1000);
}

// Stop recording timer
function stopRecordingTimer() {
    debugLog('Stopping recording timer');
    
    if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
    }
    recordingStartTime = null;
}

// Set up action tracking
function setupActionTracking() {
    debugLog('Setting up action tracking');
    
    try {
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
        
        debugLog('Action tracking setup complete');
    } catch (error) {
        console.error('Error setting up action tracking:', error);
    }
}

// Log user action
function logAction(type, details) {
    if (!isRecording) return;
    
    debugLog('Logging action:', type, details);
    
    try {
        // Send to main process
        if (window.ipcRenderer) {
            window.ipcRenderer.send('log-action', {
                type,
                details,
                time: new Date().toISOString()
            });
        } else if (window.electron) {
            window.electron.ipcRenderer.send('log-action', {
                type,
                details,
                time: new Date().toISOString()
            });
        } else {
            console.error('Cannot log action: IPC renderer not available');
        }
    } catch (error) {
        console.error('Error logging action:', error);
    }
}

// Show notification
function showNotification(message, type = 'info') {
    debugLog('Showing notification:', message, type);
    
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
                    padding: 15px 20px;
                    border-radius: 5px;
                    color: white;
                    font-weight: bold;
                    z-index: 10000;
                    opacity: 0;
                    transition: opacity 0.3s ease;
                    max-width: 400px;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
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
    
    // Hide after 5 seconds for regular notifications, 8 seconds for success
    const displayTime = type === 'success' ? 8000 : 5000;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, displayTime);
}

// Display recording results
function displayRecordingResults(instructions) {
    debugLog('Displaying recording results:', instructions);
    
    try {
        const resultsContent = document.getElementById('resultsContent');
        if (!resultsContent) {
            console.error('Results content element not found');
            return;
        }
        
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
            .map(step => {
                // Enhance URLs to be clickable
                const enhancedStep = step.replace(
                    /(https?:\/\/[^\s]+)/g, 
                    '<a href="$1" target="_blank" style="color: #007bff; text-decoration: underline;">$1</a>'
                );
                
                return `<div class="results-step">${enhancedStep}</div>`;
            })
            .join('');
        
        // Update panel content
        resultsContent.innerHTML = stepsHtml || '<p>No steps generated.</p>';
        
        // Show panel
        showResultsPanel();
        
        // Add a subtle animation to draw attention
        resultsPanel.animate(
            [
                { transform: 'translateX(10px)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(10px)' },
                { transform: 'translateX(-10px)' },
                { transform: 'translateX(0)' }
            ],
            { 
                duration: 500,
                easing: 'ease-in-out'
            }
        );
        
        debugLog('Results displayed successfully');
    } catch (error) {
        console.error('Error displaying recording results:', error);
        showNotification('Error displaying results', 'error');
    }
}

// Display processing error in results panel
function displayProcessingError(errorMessage) {
    debugLog('Displaying processing error:', errorMessage);
    
    try {
        const resultsContent = document.getElementById('resultsContent');
        if (!resultsContent) {
            console.error('Results content element not found');
            return;
        }
        
        // Create error message HTML
        resultsContent.innerHTML = `
            <div class="empty-results" style="color: #d32f2f;">
                <div class="empty-results-icon">⚠️</div>
                <h3>Processing Error</h3>
                <p>${errorMessage || 'An unknown error occurred while processing the recording.'}</p>
                <p style="margin-top: 20px;">Try recording again with a shorter duration or different window.</p>
            </div>
        `;
        
        // Show panel
        showResultsPanel();
    } catch (error) {
        console.error('Error displaying processing error:', error);
    }
}

// Listen for recording status changes from main process
if (window.electron && window.electron.ipcRenderer) {
    debugLog('Setting up electron.ipcRenderer listeners');
    window.electron.ipcRenderer.on('recording-status-changed', (data) => {
        debugLog('Recording status changed:', data);
        isRecording = data.isRecording;
        updateRecordingUI(isRecording);
        
        if (isRecording) {
            recordingStartTime = Date.now();
            startRecordingTimer();
        } else {
            stopRecordingTimer();
        }
    });
} else if (window.ipcRenderer) {
    debugLog('Setting up direct ipcRenderer listeners');
    window.ipcRenderer.on('recording-status-changed', (event, data) => {
        debugLog('Recording status changed:', data);
        isRecording = data.isRecording;
        updateRecordingUI(isRecording);
        
        if (isRecording) {
            recordingStartTime = Date.now();
            startRecordingTimer();
        } else {
            stopRecordingTimer();
        }
    });
} else {
    console.error('Neither window.electron.ipcRenderer nor window.ipcRenderer is available');
}

// Initialize on load
debugLog('Recording module loaded');
