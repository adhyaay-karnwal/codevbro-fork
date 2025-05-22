// Function to Generate CSS Selector
function getCssSelector(el) {
    if (!(el instanceof Element)) return;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break; // ID is unique enough
        } else {
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() == selector) nth++;
            }
            if (nth != 1) selector += ":nth-of-type("+nth+")";
        }
        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(" > ");
}

// Event Capturing Logic
function captureEvent(event) {
    const target = event.target;
    const selector = getCssSelector(target);
    let value = null;
    let attributes = {};

    if (target instanceof HTMLElement) { // Ensure it's an HTMLElement
        attributes.id = target.id || null; // Use null if empty for cleaner JSON
        attributes.name = target.name || null;
        attributes.placeholder = target.placeholder || null;
        attributes.ariaLabel = target.getAttribute('aria-label') || null;
        attributes.tagName = target.tagName.toLowerCase();
        if (attributes.tagName === 'input') {
            attributes.inputType = target.type || 'text'; // Default to text if type not specified
        }

        // Capture text content for elements like buttons or links, if no other value is set
        // Also capture for other relevant elements if they don't have a specific value yet.
        if (!value && (attributes.tagName === 'button' || attributes.tagName === 'a' || attributes.tagName === 'span' || attributes.tagName === 'div' || attributes.tagName === 'p' || attributes.tagName === 'h1' || attributes.tagName === 'h2' || attributes.tagName === 'h3' || attributes.tagName === 'li')) {
             if (target.textContent) {
                value = target.textContent.trim().substring(0, 200); // Limit length
             }
        }
    }

    if (event.type === 'input' || event.type === 'change') {
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
            value = target.value; // This will override the textContent if it's an input event
        }
    } else if (event.type === 'click') {
        // For clicks, value might have been set by the generic HTMLElement check.
        // If not (e.g. it's not a button/link but something else clickable), this is a fallback.
        // Re-confirm button/link text content here if needed, or rely on above.
        if (!value && (attributes.tagName === 'button' || attributes.tagName === 'a')) {
             value = target.textContent ? target.textContent.trim().substring(0, 200) : (target.value || null);
        }
        // Also call existing download link logic for clicks
        handleDownloadLink(event); 
    } else if (event.type === 'submit') {
        value = `Form submitted: ${selector}`;
    }


    const eventData = {
        type: event.type,
        selector: selector,
        value: value,
        attributes: attributes, // New field
        url: window.location.href,
        timestamp: Date.now()
    };

    window.parent.postMessage({ type: 'user-interaction', detail: eventData }, '*');
}

// Attach Event Listeners for user interaction capturing
document.addEventListener('click', captureEvent, true);
document.addEventListener('submit', captureEvent, true);
document.addEventListener('input', captureEvent, true);
document.addEventListener('change', captureEvent, true); // Added for select dropdowns, checkboxes, radio buttons

// --- Existing Download Link Functionality ---

// Renamed original click listener to avoid conflict and allow specific invocation
function handleDownloadLink(e) {
    const target = e.target.closest('a');
    if (target && target.href) {
        const downloadExtensions = [
            'pdf', 'zip', 'rar', '7z', 
            'exe', 'msi', 
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 
            'mp3', 'wav', 'flac', 
            'mp4', 'avi', 'mkv', 'mov', 
            'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'txt', 'csv'
        ];

        const isDownloadLink = downloadExtensions.some(ext => 
            target.href.toLowerCase().endsWith(`.${ext}`)
        );

        if (isDownloadLink) {
            window.parent.postMessage({
                type: 'download-link',
                url: target.href
            }, '*');
        }
    }
}

// Inject download request handler for webview (this remains unchanged)
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'download-link') {
        const downloadLink = document.createElement('a');
        downloadLink.href = event.data.url;
        downloadLink.click();
    }
});