const { contextBridge, ipcRenderer, desktopCapturer } = require('electron');

// Expose limited APIs to the renderer process
contextBridge.exposeInMainWorld('api', {
    navigate: (url) => ipcRenderer.send('navigate', url),
    goBack: () => ipcRenderer.send('go-back'),
    goForward: () => ipcRenderer.send('go-forward'),
    
    onNavigate: (callback) => ipcRenderer.on('did-navigate', (event, url) => callback(url)),
    onError: (callback) => ipcRenderer.on('navigation-error', (event, error) => callback(error)),
});

// Expose electron APIs for recording functionality
contextBridge.exposeInMainWorld('electron', {
    // IPC communication
    ipcRenderer: {
        // Send events to main process
        send: (channel, data) => {
            // Whitelist channels
            const validChannels = ['log-action'];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
        
        // Invoke methods on main process
        invoke: (channel, ...args) => {
            // Whitelist channels
            const validChannels = [
                'start-recording',
                'stop-recording',
                'set-gemini-api-key',
                'get-gemini-api-key',
                'get-recording-status',
                'get-screen-sources',
                'process-recording'
            ];
            if (validChannels.includes(channel)) {
                return ipcRenderer.invoke(channel, ...args);
            }
            
            return Promise.reject(new Error(`Unauthorized IPC invoke: ${channel}`));
        },
        
        // Receive events from main process
        on: (channel, func) => {
            // Whitelist channels
            const validChannels = [
                'recording-status-changed',
                'recording-processed'
            ];
            if (validChannels.includes(channel)) {
                // Strip event as it includes `sender` and other internal properties
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        },
        
        // Remove event listener
        removeListener: (channel, func) => {
            const validChannels = [
                'recording-status-changed',
                'recording-processed'
            ];
            if (validChannels.includes(channel)) {
                ipcRenderer.removeListener(channel, func);
            }
        }
    },
    
    // Screen capture functionality
    desktopCapturer: {
        getSources: (options) => desktopCapturer.getSources(options)
    }
});
