const { app, BrowserWindow, ipcMain, session, Menu } = require('electron');
const { desktopCapturer } = require('electron');
const path = require('path');
const { net } = require('electron');
const https = require('https');
const os = require('os');
const { networkInterfaces } = require('systeminformation');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const { Readable } = require('stream');
const mime = require('mime-types');

// Recording state variables
let isRecording = false;
let actionLog = [];
let recordingStartTime = null;
const MAX_RECORDING_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

let Store;

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
                searchEngine: 'google',
                geminiApiKey: ''
            }
        });

        // Expose settingsStore to other functions
        global.settingsStore = settingsStore;
        console.log('Electron store initialized successfully');
    } catch (error) {
        console.error('Failed to initialize electron-store:', error);
        global.settingsStore = null; // Set to null so we can check for it later
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
        if (!global.settingsStore) {
            console.error('Settings store not initialized');
            return {};
        }
        return global.settingsStore.store;
    });

    // Update settings
    ipcMain.on('update-settings', (event, settings) => {
        if (!global.settingsStore) {
            console.error('Settings store not initialized');
            return;
        }
        
        // Update individual settings
        Object.keys(settings).forEach(key => {
            global.settingsStore.set(key, settings[key]);
        });

        // Apply settings immediately
        applySettings(settings);
    });

    // Change download location
    ipcMain.handle('choose-download-location', async () => {
        if (!global.settingsStore) {
            console.error('Settings store not initialized');
            return app.getPath('downloads');
        }
        
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const selectedPath = result.filePaths[0];
            global.settingsStore.set('downloadLocation', selectedPath);
            return selectedPath;
        }

        return global.settingsStore.get('downloadLocation') || app.getPath('downloads');
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

// Screen Recording Functionality
function setupRecordingHandlers(mainWindow) {
    // Handler for getting screen sources
    ipcMain.handle('get-screen-sources', async () => {
        try {
            const sources = await desktopCapturer.getSources({
                types: ['window', 'screen'],
                thumbnailSize: { width: 150, height: 150 }
            });
            
            return {
                success: true,
                sources: sources.map(source => ({
                    id: source.id,
                    name: source.name,
                    thumbnail: source.thumbnail.toDataURL()
                }))
            };
        } catch (error) {
            console.error('Error getting screen sources:', error);
            return { success: false, message: error.message };
        }
    });
    
    // Handler for starting screen recording
    ipcMain.handle('start-recording', async () => {
        try {
            if (isRecording) {
                return { success: false, message: 'Recording already in progress' };
            }

            // Check if Gemini API key is set
            if (!global.settingsStore) {
                return { success: false, message: 'Settings store not initialized' };
            }
            
            const apiKey = global.settingsStore.get('geminiApiKey');
            if (!apiKey) {
                return { success: false, message: 'Gemini API key not set. Please set it in settings.' };
            }

            // Reset action log
            actionLog = [];
            
            // Set recording state
            isRecording = true;
            recordingStartTime = Date.now();
            
            // Notify renderer
            mainWindow.webContents.send('recording-status-changed', { isRecording: true });
            
            return { success: true, message: 'Recording started' };
        } catch (error) {
            console.error('Error starting recording:', error);
            return { success: false, message: `Failed to start recording: ${error.message}` };
        }
    });
    
    // Handler for stopping screen recording
    ipcMain.handle('stop-recording', async () => {
        try {
            if (!isRecording) {
                return { success: false, message: 'No recording in progress' };
            }
            
            // Update state
            isRecording = false;
            
            // Notify renderer
            mainWindow.webContents.send('recording-status-changed', { isRecording: false });
            
            return { success: true, message: 'Recording stopped' };
        } catch (error) {
            console.error('Error stopping recording:', error);
            return { success: false, message: `Failed to stop recording: ${error.message}` };
        }
    });
    
    // Handler for receiving recorded video from renderer
    ipcMain.handle('process-recording', async (event, { buffer, mimeType }) => {
        try {
            // Save to temporary file
            const tempDir = path.join(os.tmpdir(), 'codebro-recordings');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const videoPath = path.join(tempDir, `recording-${Date.now()}.webm`);
            fs.writeFileSync(videoPath, Buffer.from(buffer));
            
            // Process with Gemini
            try {
                const instructions = await processRecordingWithGemini(videoPath, actionLog);
                return {
                    success: true,
                    instructions
                };
            } catch (error) {
                console.error('Error processing recording with Gemini:', error);
                return {
                    success: false,
                    message: `Error processing recording: ${error.message}`
                };
            } finally {
                // Clean up temporary file
                if (fs.existsSync(videoPath)) {
                    fs.unlinkSync(videoPath);
                }
            }
        } catch (error) {
            console.error('Error processing recording:', error);
            return { success: false, message: `Failed to process recording: ${error.message}` };
        }
    });
    
    // Handler for logging user actions
    ipcMain.on('log-action', (event, action) => {
        if (isRecording) {
            // Add timestamp relative to recording start
            const timestamp = Date.now() - recordingStartTime;
            actionLog.push({
                ...action,
                timestamp
            });
        }
    });
    
    // Handler for setting Gemini API key
    ipcMain.handle('set-gemini-api-key', async (event, apiKey) => {
        try {
            if (!global.settingsStore) {
                console.error('Settings store not initialized');
                return { success: false, message: 'Settings store not initialized' };
            }
            
            global.settingsStore.set('geminiApiKey', apiKey);
            return { success: true, message: 'API key saved' };
        } catch (error) {
            console.error('Error saving API key:', error);
            return { success: false, message: `Failed to save API key: ${error.message}` };
        }
    });
    
    // Handler for getting Gemini API key
    ipcMain.handle('get-gemini-api-key', async () => {
        try {
            if (!global.settingsStore) {
                console.error('Settings store not initialized');
                return { success: false, message: 'Settings store not initialized' };
            }
            
            const apiKey = global.settingsStore.get('geminiApiKey');
            return { success: true, apiKey };
        } catch (error) {
            console.error('Error retrieving API key:', error);
            return { success: false, message: `Failed to retrieve API key: ${error.message}` };
        }
    });
    
    // Handler for getting recording status
    ipcMain.handle('get-recording-status', () => {
        return { isRecording };
    });
}

// Function to process recording with Gemini
async function processRecordingWithGemini(videoPath, actions) {
    try {
        // Get API key from settings
        if (!global.settingsStore) {
            throw new Error('Settings store not initialized');
        }
        
        const apiKey = global.settingsStore.get('geminiApiKey');
        if (!apiKey) {
            throw new Error('Gemini API key not set');
        }
        
        // Initialize Gemini API
        const genAI = new GoogleGenerativeAI(apiKey);
        // Use gemini-2.0-flash-exp model instead of gemini-pro-vision
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        
        // Read video file
        const videoBuffer = fs.readFileSync(videoPath);
        const mimeType = mime.lookup(videoPath) || 'video/webm';
        
        // Prepare action log as text
        const actionsText = actions.map((action, index) => {
            const time = (action.timestamp / 1000).toFixed(2); // Convert to seconds
            return `${index + 1}. [${time}s] ${action.type}: ${action.details}`;
        }).join('\n');
        
        // Prepare prompt for Gemini
        const prompt = `
        I have a screen recording of a web browsing session with the following user actions:
        
        ${actionsText}
        
        Please analyze the video and provide a detailed, step-by-step guide of what the user did.
        Format the response as numbered steps that a human could follow to replicate the actions.
        Include URLs visited, buttons clicked, text entered, and any other relevant details.
        Be specific and clear with each instruction.
        `;
        
        // Create parts for the multimodal request
        const parts = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: mimeType,
                    data: videoBuffer.toString('base64')
                }
            }
        ];
        
        // Send request to Gemini
        const result = await model.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.2
            }
        });
        
        const response = result.response;
        const text = response.text();
        
        // Format the response as numbered steps if not already formatted
        if (!text.match(/^\d+\.\s/m)) {
            const steps = text.split('\n')
                .filter(line => line.trim().length > 0)
                .map((line, index) => `${index + 1}. ${line}`);
            return steps.join('\n');
        }
        
        return text;
    } catch (error) {
        console.error('Error processing with Gemini:', error);
        throw error;
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
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
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
