const { app, BrowserWindow, ipcMain, session, Menu, desktopCapturer, dialog } = require('electron');
const path = require('path');
const { net } = require('electron');
const https = require('https');
const os = require('os');
const fs = require('fs'); // Added for file system operations
const axios = require('axios'); // Added for Gemini API
const FormData = require('form-data'); // Added for Gemini API
const { networkInterfaces } = require('systeminformation');

let Store;

// Gemini API Configuration - IMPORTANT: Replace with actual values or use environment variables
// The API key for authenticating requests to the Gemini API.
const GEMINI_API_KEY = 'AIzaSyA3k-bhoOYLjxnxPr4mBHI8x-w1RN3N3zE';
// The specific endpoint URL for the Gemini model used for content generation (e.g., video analysis).
const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Global variables for managing the video recording process.
// Stores chunks of video data as they are received from the MediaRecorder.
let recordedChunks = [];
// Holds the file system path to the fully recorded video file once finalized.
let recordedVideoPath = null;

async function initStore() {
    try {
        const storeModule = await import('electron-store');
        Store = storeModule.default;

        // Settings Management
        const settingsStore = new Store({
            name: 'browser-settings',
            defaults: {
                startupPage: false,
                newTabDefault: true,
                theme: 'system',
                clearHistoryOnExit: false,
                trackingProtection: true,
                hardwareAcceleration: true,
                downloadLocation: app.getPath('downloads'),
                vpnAutoConnect: false,
                searchEngine: 'google'
            }
        });

        // Expose settingsStore to other functions
        global.settingsStore = settingsStore;
    } catch (error) {
        console.error('Failed to initialize electron-store:', error);
    }
}

// VPN Connection Management
function setupVPNHandlers(mainWindow) {
    // IPC handler for VPN connection
    ipcMain.handle('vpn-connect', async (event, location) => {
        try {
            // Validate location
            if (!PROXY_SERVERS[location]) {
                throw new Error('Invalid VPN location');
            }

            const selectedProxy = PROXY_SERVERS[location];

            // Set system-wide proxy
            app.commandLine.appendSwitch('proxy-server', selectedProxy);

            mainWindow.webContents.send('vpn-status', {
                connected: true,
                message: `Connected via proxy: ${selectedProxy}`,
                proxy: selectedProxy,
                location: location
            });

            return { 
                success: true, 
                message: `Connected to ${location.toUpperCase()} proxy server`,
                proxy: selectedProxy,
                location: location
            };
        } catch (error) {
            mainWindow.webContents.send('vpn-status', {
                connected: false,
                message: 'VPN connection failed'
            });

            return { 
                success: false, 
                message: error.message || 'Failed to connect to VPN' 
            };
        }
    });

    // IPC handler for VPN disconnection
    ipcMain.handle('vpn-disconnect', async (event) => {
        try {
            // Remove proxy settings
            app.commandLine.removeSwitch('proxy-server');

            mainWindow.webContents.send('vpn-status', {
                connected: false,
                message: 'VPN disconnected'
            });

            return { 
                success: true, 
                message: 'Disconnected from proxy' 
            };
        } catch (error) {
            return { 
                success: false, 
                message: error.message || 'Failed to disconnect VPN' 
            };
        }
    });
}

// VPN Proxy Management
function setupProxyHandlers(mainWindow) {
    ipcMain.handle('set-proxy-for-all-tabs', async (event, proxyServer) => {
        try {
            await mainWindow.webContents.session.setProxy({
                proxyRules: proxyServer
            });
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                message: `Proxy set failed: ${error.message}` 
            };
        }
    });

    ipcMain.handle('clear-proxy-for-all-tabs', async () => {
        try {
            await mainWindow.webContents.session.setProxy({
                proxyRules: ''
            });
            return { success: true };
        } catch (error) {
            return { 
                success: false, 
                message: `Proxy clear failed: ${error.message}` 
            };
        }
    });
}

// History Suggestions Handler
function setupHistorySuggestionsHandler() {
    ipcMain.handle('get-history-suggestions', async (event, query) => {
        try {
            // Retrieve history from the database
            const stmt = db.prepare(`
                SELECT title, url 
                FROM history 
                WHERE title LIKE ? OR url LIKE ? 
                ORDER BY last_visit_time DESC 
                LIMIT 10
            `);
            
            const searchQuery = `%${query}%`;
            const results = stmt.all(searchQuery, searchQuery);
            
            return results.map(item => ({
                title: item.title || item.url,
                url: item.url
            }));
        } catch (error) {
            console.error('Error fetching history suggestions:', error);
            return [];
        }
    });
}

// Network Speed Tracking
function setupNetworkSpeedHandler() {
    ipcMain.handle('get-network-speed', async () => {
        try {
            // Get network interfaces
            const interfaces = await networkInterfaces();
            const activeInterfaces = interfaces.filter(iface => 
                iface.operstate === 'up' && !iface.internal
            );

            if (activeInterfaces.length === 0) {
                return { downloadSpeed: 0, uploadSpeed: 0 };
            }

            // Simulate network speed (you might want to replace this with a more accurate method)
            const downloadSpeed = Math.random() * 50; // Random speed between 0-50 Mbps
            const uploadSpeed = Math.random() * 25;   // Random speed between 0-25 Mbps

            return {
                downloadSpeed: downloadSpeed,
                uploadSpeed: uploadSpeed
            };
        } catch (error) {
            console.error('Network speed tracking error:', error);
            return { downloadSpeed: 0, uploadSpeed: 0 };
        }
    });
}

function setupDownloadHandler(mainWindow) {
    // Download handler
    session.defaultSession.on('will-download', (event, item, webContents) => {
        // Get the download path (you can customize this)
        const downloadPath = path.join(app.getPath('downloads'), item.getFilename());
        
        // Set the save path
        item.setSavePath(downloadPath);
        
        // Notify renderer about download start
        mainWindow.webContents.send('download-started', {
            filename: item.getFilename(),
            savePath: downloadPath
        });
        
        item.on('done', (event, state) => {
            if (state === 'completed') {
                mainWindow.webContents.send('download-completed', {
                    filename: item.getFilename(),
                    savePath: downloadPath
                });
            }
        });
    });

    // Listen for download requests from renderer
    ipcMain.on('download-request', (event, { url }) => {
        mainWindow.webContents.downloadURL(url);
    });
}

function setupSettingsHandlers() {
    // Get current settings
    ipcMain.handle('get-settings', () => {
        return global.settingsStore.store;
    });

    // Update settings
    ipcMain.on('update-settings', (event, settings) => {
        // Update individual settings
        Object.keys(settings).forEach(key => {
            global.settingsStore.set(key, settings[key]);
        });

        // Apply settings immediately
        applySettings(settings);
    });

    // Change download location
    ipcMain.handle('choose-download-location', async () => {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            global.settingsStore.set('downloadLocation', selectedPath);
            return selectedPath;
        }

        return global.settingsStore.get('downloadLocation');
    });
}

function applySettings(settings) {
    // Theme application
    if (settings.theme) {
        mainWindow.webContents.send('apply-theme', settings.theme);
    }

    // Hardware acceleration
    if (settings.hardwareAcceleration !== undefined) {
        app.disableHardwareAcceleration = !settings.hardwareAcceleration;
    }

    // Tracking protection
    if (settings.trackingProtection !== undefined) {
        mainWindow.webContents.session.setPermissionRequestHandler(
            (webContents, permission, callback) => {
                callback(!settings.trackingProtection);
            }
        );
    }

    // Download location
    if (settings.downloadLocation) {
        app.setPath('downloads', settings.downloadLocation);
    }
}

// RAM Usage Tracking
function setupRAMUsageHandler() {
    ipcMain.handle('get-ram-usage', async () => {
        try {
            // Use process.memoryUsage() for more reliable browser-specific memory
            const memoryUsage = process.memoryUsage();
            
            // Convert to MB
            const rssMemoryMB = Math.round(memoryUsage.rss / (1024 * 1024));
            const heapUsedMB = Math.round(memoryUsage.heapUsed / (1024 * 1024));

            return {
                browserRAM: rssMemoryMB,  // Resident Set Size
                heapUsed: heapUsedMB      // JavaScript heap memory
            };
        } catch (error) {
            console.error('RAM usage tracking error:', error);
            return { 
                browserRAM: 0,
                heapUsed: 0
            };
        }
    });
}

// Battery Status Tracking
function setupBatteryStatusHandler() {
    ipcMain.handle('get-battery-status', async () => {
        try {
            // Use Node.js native OS module for battery detection
            const os = require('os');
            const platform = os.platform();

            // Different approaches for different platforms
            switch (platform) {
                case 'darwin':  // macOS
                    return await getMacBatteryStatus();
                case 'win32':   // Windows
                    return await getWindowsBatteryStatus();
                case 'linux':   // Linux
                    return await getLinuxBatteryStatus();
                default:
                    return { 
                        percentage: -1, 
                        isCharging: false, 
                        timeRemaining: 0 
                    };
            }
        } catch (error) {
            console.error('Battery status tracking error:', error);
            return { 
                percentage: -1, 
                isCharging: false, 
                timeRemaining: 0 
            };
        }
    });
}

// macOS Battery Status
async function getMacBatteryStatus() {
    try {
        const { execSync } = require('child_process');
        const batteryInfo = execSync('pmset -g batt').toString();
        const percentMatch = batteryInfo.match(/(\d+)%/);
        const chargingMatch = batteryInfo.includes('charging');

        return {
            percentage: percentMatch ? parseInt(percentMatch[1]) : -1,
            isCharging: chargingMatch,
            timeRemaining: 0
        };
    } catch (error) {
        console.error('Mac battery status error:', error);
        return { percentage: -1, isCharging: false, timeRemaining: 0 };
    }
}

// Windows Battery Status
async function getWindowsBatteryStatus() {
    try {
        const { execSync } = require('child_process');
        const batteryInfo = execSync('powercfg /batteryreport /output battery_report.html').toString();
        // Implement parsing logic for Windows battery report
        return { percentage: -1, isCharging: false, timeRemaining: 0 };
    } catch (error) {
        console.error('Windows battery status error:', error);
        return { percentage: -1, isCharging: false, timeRemaining: 0 };
    }
}

// Linux Battery Status
async function getLinuxBatteryStatus() {
    try {
        const fs = require('fs');
        const batteryPath = '/sys/class/power_supply/BAT0';
        
        if (!fs.existsSync(batteryPath)) {
            return { percentage: -1, isCharging: false, timeRemaining: 0 };
        }

        const capacityPath = `${batteryPath}/capacity`;
        const statusPath = `${batteryPath}/status`;

        const capacity = parseInt(fs.readFileSync(capacityPath, 'utf8').trim());
        const status = fs.readFileSync(statusPath, 'utf8').trim();

        return {
            percentage: !isNaN(capacity) ? capacity : -1,
            isCharging: status === 'Charging',
            timeRemaining: 0
        };
    } catch (error) {
        console.error('Linux battery status error:', error);
        return { percentage: -1, isCharging: false, timeRemaining: 0 };
    }
}

async function createWindow() {
    // Initialize electron-store first
    await initStore();

    let mainWindow;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'codebro',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            webSecurity: false
        },
    });
    // Disable context menu
    Menu.setApplicationMenu(null);
    // Setup download handler
    setupDownloadHandler(mainWindow);

    // Setup VPN handlers
    setupVPNHandlers(mainWindow);

    // Setup proxy handlers
    setupProxyHandlers(mainWindow);

    // Setup history suggestions handler
    setupHistorySuggestionsHandler();

    // Setup network speed handler
    setupNetworkSpeedHandler();

    // Setup RAM usage handler
    setupRAMUsageHandler();

    // Setup battery status handler
    setupBatteryStatusHandler();

    // Setup settings handlers
    setupSettingsHandlers();

    // Setup recording handlers
    setupRecordingHandlers(mainWindow);

    // Apply initial settings
    if (global.settingsStore) {
        applySettings(global.settingsStore.store);
    }

    // Rest of your existing window setup code
    mainWindow.loadFile('index.html');
    mainWindow.setTitle('codebro');
    // mainWindow.webContents.openDevTools(); // Open DevTools for debugging
}

// Recording Handlers Function
/**
 * Sets up IPC handlers related to screen recording and Gemini AI analysis.
 * @param {BrowserWindow} mainWindow - The main application window instance.
 */
function setupRecordingHandlers(mainWindow) {
    // Handles requests from the renderer process to get a desktopCapturer source ID.
    // This ID is necessary for the renderer to start a MediaStream recording of the screen or a window.
    // It tries to find the main application window ('codebro') first, then falls back to other available sources.
    ipcMain.handle('get-screen-source-id', async (event) => {
        const triggeringWindow = BrowserWindow.fromWebContents(event.sender);
        if (!triggeringWindow) {
            console.error('Could not find the triggering window.');
            return null;
        }

        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
        // Try to find the specific window that initiated the request.
        // This can be tricky. Comparing titles or trying to match WebContents ID if available.
        // For 'codebro', we might assume it's the main window if the title matches.
        let sourceToCapture = sources.find(source => source.name === 'codebro' || source.name === mainWindow.getTitle());
        
        if (!sourceToCapture) {
            // Fallback or more sophisticated selection
            // For now, let's try to find the window by its ID if possible, or just the first window source
            sourceToCapture = sources.find(source => source.id.startsWith('window:' + triggeringWindow.webContents.id) || source.id.startsWith('window:' + triggeringWindow.id));
             if (!sourceToCapture && sources.length > 0) {
                // As a last resort pick the first window, or the entire screen.
                // This part might need user interaction in a real app (e.g. a picker)
                const windowSources = sources.filter(s => s.type === 'window' || s.name === 'Entire screen' || s.name === 'Screen 1');
                if (windowSources.length > 0) sourceToCapture = windowSources[0];
                else sourceToCapture = sources[0]; // Default to the first available source
            }
        }

        if (sourceToCapture) {
            console.log('Source found for recording:', sourceToCapture.name, sourceToCapture.id);
            return sourceToCapture.id;
        } else {
            console.error('No suitable source found for recording.');
            // Optionally, show a dialog to the user
            // dialog.showErrorBox('Recording Error', 'No suitable screen or window found to record.');
            return null;
        }
    });

    // Resets the global recording state variables.
    // This is typically called before starting a new recording to clear any previous data.
    ipcMain.on('reset-recording-state', () => {
        recordedChunks = []; // Clear the array of recorded video data chunks.
        recordedVideoPath = null; // Reset the path to any previously saved video file.
        console.log('Recording state reset.');
    });

    // Receives a chunk of video data (as a Uint8Array) from the renderer process.
    // These chunks are collected in the `recordedChunks` array.
    ipcMain.on('recording-chunk', (event, chunk) => {
        if (chunk && chunk.byteLength > 0) {
            recordedChunks.push(Buffer.from(chunk)); // Convert Uint8Array to Buffer for easier handling.
        }
    });

    // Handles the finalization of the video recording.
    // Concatenates all received video chunks into a single Buffer, then writes it to a temporary .webm file.
    // Returns an object indicating success or failure, and the filePath if successful.
    // If no chunks were recorded, it returns { success: false, message: "No data recorded." }.
    ipcMain.handle('stop-recording-finalize', async () => {
        if (recordedChunks.length === 0) {
            console.log('No recorded chunks to save.');
            return { success: false, message: "No data recorded." };
        }

        const buffer = Buffer.concat(recordedChunks); // Combine all chunks.
        const tempDir = os.tmpdir(); // Get the system's temporary directory.
        // Define a unique filename for the recording.
        recordedVideoPath = path.join(tempDir, `recording-${Date.now()}.webm`);

        try {
            fs.writeFileSync(recordedVideoPath, buffer); // Write the video file.
            console.log('Recording stopped. Video saved to:', recordedVideoPath);
            const filePath = recordedVideoPath; 
            recordedChunks = []; // Clear chunks after saving.
            // Return success and the path to the saved video.
            return { success: true, filePath: filePath };
        } catch (error) {
            console.error('Failed to save video to disk:', error);
            recordedChunks = []; // Clear chunks even on error.
            // Return failure and an error message, checking for common issues like disk space.
            return { success: false, error: `Failed to save video: ${error.code === 'ENOSPC' ? 'Disk full or insufficient space.' : 'Permission issue or other error.'} (${error.message})` };
        }
    });

    // Handles the request to upload the recorded video and associated user actions to the Gemini API for analysis.
    // @param {object} event - The IPC event object.
    // @param {object} params - An object containing the data to upload.
    // @param {Array<object>} params.actions - An array of user actions recorded during the session.
    // @param {string} params.videoPath - The file system path to the recorded video.
    ipcMain.handle('upload-to-gemini', async (event, { actions, videoPath }) => {
        console.log('Received upload-to-gemini request with videoPath:', videoPath);

        // Check if API key and endpoint are configured. Placeholder values indicate misconfiguration.
        if (GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY' || GEMINI_API_ENDPOINT === 'YOUR_GEMINI_VIDEO_ENDPOINT_URL' || !GEMINI_API_KEY || !GEMINI_API_ENDPOINT) {
            console.warn('Gemini API Key or Endpoint is not configured correctly. Please check main.js.');
            return { success: false, error: 'Gemini API is not configured. Please contact support or check application settings.' };
        }

        // Ensure the video file exists before attempting to upload.
        if (!videoPath || !fs.existsSync(videoPath)) {
            console.error('Video file does not exist at path:', videoPath);
            return { success: false, error: 'Video file for analysis not found. It might have been moved or deleted.' };
        }

        // Create a FormData object to send multipart/form-data.
        const form = new FormData();
        try {
            // Create a readable stream for the video file.
            const videoStream = fs.createReadStream(videoPath);
            videoStream.on('error', (streamError) => {
                console.error('Error with video file stream:', streamError);
            });
            // Append the video file to the form.
            form.append('video', videoStream, { filename: path.basename(videoPath) });

            // Convert the user actions array to a pretty-printed JSON string.
            const actionsJSON = JSON.stringify(actions, null, 2);
            // Construct the detailed text prompt for the Gemini API.
            // This prompt includes instructions for analysis and the JSON string of user actions.
            const promptText = `
Please analyze the following user session, which includes a screen recording (provided as 'video') and a list of user actions (provided below in JSON format).

Your task is to:
1. Provide a concise overall description of what the user was trying to achieve.
2. Identify and list any reproducible "skills" or multi-step tasks performed by the user. A skill should be a sequence of actions that achieves a specific goal and could potentially be automated.
   - For each skill, give a brief title (e.g., "Logged into ExampleWebsite," "Searched for product X," "Filled out contact form").
   - Then, list the key actions involved in that skill, referencing the provided JSON data where helpful (e.g., "Clicked button 'loginBtn', Typed into 'username' field, Navigated to '/dashboard'").
   - Aim to make the skill description clear enough for an AI agent to understand and reproduce.

Format your response as follows:
DESCRIPTION:
[Your overall description here]

SKILLS:
- SKILL TITLE: [Title of Skill 1]
  ACTIONS:
  - [Action 1 from JSON, e.g., Clicked 'button#id']
  - [Action 2 from JSON, e.g., Typed 'hello' into 'input#name']
- SKILL TITLE: [Title of Skill 2]
  ACTIONS:
  - [Action 1]
  - [Action 2]
(and so on)

User Actions JSON:
${actionsJSON}
`;
            // Append the prompt text to the form.
            form.append('actions', promptText, { contentType: 'text/plain' });

        } catch (fsError) {
            console.error('Error preparing form data (e.g., reading video file) for Gemini:', fsError);
            return { success: false, error: `Could not prepare video for analysis: ${fsError.message}. Please ensure the file is accessible.` };
        }
        
        console.log('Attempting to upload to Gemini endpoint:', GEMINI_API_ENDPOINT);

        try {
            // Make the POST request to the Gemini API endpoint.
            const response = await axios.post(GEMINI_API_ENDPOINT, form, {
                headers: {
                    ...form.getHeaders(), // Get headers from FormData (e.g., Content-Type for multipart).
                    'Authorization': `Bearer ${GEMINI_API_KEY}`, // Add Bearer token for authentication.
                },
                timeout: 180000, // Set a timeout for the request (e.g., 180 seconds).
            });

            console.log('Gemini API Success Response:', response.data);
            // On success, return an object indicating success and the data from the API response.
            return { success: true, data: response.data };

        } catch (error) {
            // Handle various types of errors that can occur during the API call.
            let userFriendlyError = 'An unexpected error occurred while contacting the AI analysis service.';
            if (error.code === 'ECONNABORTED') {
                userFriendlyError = 'The AI analysis service timed out. Please try again later.';
            } else if (error.response) { // Errors from the API (e.g., 4xx, 5xx status codes).
                console.error('Gemini API Error Response:', error.response.status, error.response.data);
                if (error.response.status === 401 || error.response.status === 403) {
                    userFriendlyError = 'Invalid Gemini API Key. Please check the application configuration.';
                } else if (error.response.status >= 500) {
                    userFriendlyError = 'The AI analysis service encountered an internal error. Please try again later.';
                } else {
                    userFriendlyError = `AI analysis service returned an error (Status ${error.response.status}).`;
                }
            } else if (error.request) { // Errors where the request was made but no response was received.
                console.error('Gemini API No Response (Network Error):', error.message);
                userFriendlyError = 'Failed to connect to the AI analysis service. Please check your internet connection.';
            } else { // Errors in setting up the request.
                console.error('Gemini API Request Setup Error:', error.message);
            }
            // Return failure and a user-friendly error message.
            return { success: false, error: userFriendlyError };
        } finally {
            // This block executes regardless of whether the try/catch block succeeded or failed.
            // It's used here to ensure the temporary video file is deleted.
            if (videoPath && fs.existsSync(videoPath)) {
                fs.unlink(videoPath, (err) => {
                    if (err) {
                        console.error('Failed to delete temporary video file:', videoPath, err);
                    } else {
                        console.log('Temporary video file deleted successfully:', videoPath);
                    }
                });
            }
        }
    });
}


const PROXY_SERVERS = {
    us: 'us-wa.proxyme.org',
    uk: 'uk-lon.proxyme.org',
    de: 'de-fra.proxyme.org',
    ca: 'ca-tor.proxyme.org',
    nl: 'nl-ams.proxyme.org'
};

app.whenReady().then(createWindow);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
