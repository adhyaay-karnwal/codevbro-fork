// Function to Generate CSS Selector
/**
 * Generates a CSS selector that uniquely identifies the given HTML element.
 * The selector is built by traversing up the DOM tree from the element.
 * It prioritizes IDs if available, otherwise constructs a path using node names
 * and :nth-of-type to distinguish siblings of the same type.
 * @param {Element} el - The HTML element to generate a selector for.
 * @returns {string|undefined} A CSS selector string, or undefined if el is not an Element.
 */
function getCssSelector(el) {
    if (!(el instanceof Element)) return; // Only process actual HTML Elements.
    const path = []; // Array to hold parts of the selector.
    while (el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break; // ID is unique enough, no need to go further up the DOM tree.
        } else {
            // For elements without an ID, determine their position among siblings of the same type.
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling) { // Count previous siblings with the same node name.
                if (sib.nodeName.toLowerCase() == selector) nth++;
            }
            if (nth != 1) selector += ":nth-of-type("+nth+")"; // Add :nth-of-type if it's not the first of its kind.
        }
        path.unshift(selector); // Add the current part to the beginning of the path array.
        el = el.parentNode; // Move to the parent element for the next iteration.
    }
    return path.join(" > "); // Join all parts with " > " to form the final CSS selector.
}

// Event Capturing Logic
/**
 * Captures details about user interaction events (click, input, change, submit).
 * It gathers information about the event target, its attributes, and relevant values,
 * then posts this data to the parent window (the Electron renderer process).
 * @param {Event} event - The DOM event object to capture.
 */
function captureEvent(event) {
    // Identify the direct target of the event.
    const target = event.target;
    // Generate a CSS selector for the event target to identify it.
    const selector = getCssSelector(target);
    let value = null; // Initialize value, to be populated based on event/target type.
    // Object to store relevant HTML attributes of the target element.
    // These attributes help understand the context of the element (e.g., its purpose, type).
    let attributes = {};

    if (target instanceof HTMLElement) { // Ensure the target is an HTMLElement to access its properties.
        attributes.id = target.id || null; // Element's ID, if any.
        attributes.name = target.name || null; // Element's name attribute, common in forms.
        attributes.placeholder = target.placeholder || null; // Placeholder text for input fields.
        attributes.ariaLabel = target.getAttribute('aria-label') || null; // ARIA label for accessibility.
        attributes.tagName = target.tagName.toLowerCase(); // Tag name (e.g., 'input', 'button').
        // If the element is an input, capture its specific type (e.g., 'text', 'checkbox').
        if (attributes.tagName === 'input') {
            attributes.inputType = target.type || 'text'; // Default to 'text' if type is not specified.
        }

        // Capture visible text content for certain interactive or content-displaying elements
        // if a more specific value (like input value) hasn't been determined yet.
        // This provides context for elements like buttons, links, or headers.
        if (!value && (attributes.tagName === 'button' || attributes.tagName === 'a' || attributes.tagName === 'span' || attributes.tagName === 'div' || attributes.tagName === 'p' || attributes.tagName === 'h1' || attributes.tagName === 'h2' || attributes.tagName === 'h3' || attributes.tagName === 'li')) {
             if (target.textContent) {
                // Get trimmed text content, limited to 200 characters to keep data manageable.
                value = target.textContent.trim().substring(0, 200); 
             }
        }
    }

    // Determine the 'value' based on the event type and target element.
    if (event.type === 'input' || event.type === 'change') {
        // For 'input' or 'change' events on form elements, the element's 'value' property is most relevant.
        // This captures typing in text fields, selections in dropdowns, state of checkboxes/radios.
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
            value = target.value; // This overrides any textContent captured earlier for these elements.
        }
    } else if (event.type === 'click') {
        // For 'click' events, the 'value' might have already been set by the generic HTMLElement textContent capture.
        // If not (e.g., a click on an element not typically holding user-facing text like a 'div' used as a button),
        // this serves as a fallback or re-confirmation, especially for buttons and links.
        if (!value && (attributes.tagName === 'button' || attributes.tagName === 'a')) {
             value = target.textContent ? target.textContent.trim().substring(0, 200) : (target.value || null);
        }
        // Additionally, for click events, check if it's a download link.
        handleDownloadLink(event); 
    } else if (event.type === 'submit') {
        // For 'submit' events, the value can be a descriptive string indicating a form submission.
        value = `Form submitted: ${selector}`; // Includes the selector of the submitted form.
    }

    // Construct the data object to be sent to the renderer process.
    const eventData = {
        type: event.type,                     // Type of the event (e.g., 'click', 'input').
        selector: selector,                   // CSS selector of the event target.
        value: value,                         // Captured value (e.g., input text, button text).
        attributes: attributes,               // Collected HTML attributes of the target.
        url: window.location.href,            // URL of the page where the event occurred.
        timestamp: Date.now()                 // Timestamp of when the event was captured.
    };

    // Send the captured event data to the parent window (Electron renderer process - render/renderer.js).
    // '*' as the targetOrigin is used here for simplicity in this context, but for production,
    // a specific targetOrigin should be used if possible for security.
    window.parent.postMessage({ type: 'user-interaction', detail: eventData }, '*');
}

// Attach Event Listeners for user interaction capturing.
// These listeners are attached to the document in the capturing phase (true as the third argument).
// This allows them to intercept events before they reach their target elements,
// ensuring that interactions are caught even if, for example, a page script stops event propagation.
document.addEventListener('click', captureEvent, true);
document.addEventListener('submit', captureEvent, true);
document.addEventListener('input', captureEvent, true);
document.addEventListener('change', captureEvent, true); // For <select>, checkboxes, radio buttons.

// --- Existing Download Link Functionality ---

// Renamed original click listener to avoid conflict and allow specific invocation
/**
 * Handles click events specifically to detect and report download links.
 * If a clicked anchor tag (`<a>`) points to a common downloadable file type,
 * it posts a 'download-link' message to the parent window.
 * @param {Event} e - The click event object.
 */
function handleDownloadLink(e) {
    const target = e.target.closest('a'); // Find the closest anchor tag, if any.
    if (target && target.href) { // If an anchor with an href is found.
        // List of common file extensions that typically trigger downloads.
        const downloadExtensions = [
            'pdf', 'zip', 'rar', '7z', // Archives
            'exe', 'msi',             // Executables
            'jpg', 'jpeg', 'png', 'gif', 'bmp', // Images
            'mp3', 'wav', 'flac',     // Audio
            'mp4', 'avi', 'mkv', 'mov', // Video
            'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', // Office documents
            'txt', 'csv'              // Text/Data
        ];

        // Check if the link's href ends with one of the download extensions.
        const isDownloadLink = downloadExtensions.some(ext => 
            target.href.toLowerCase().endsWith(`.${ext}`)
        );

        if (isDownloadLink) {
            // If it's a download link, post a message to the parent window.
            window.parent.postMessage({
                type: 'download-link', // Message type
                url: target.href       // URL of the download link
            }, '*');
        }
    }
}

// Inject download request handler for webview (this remains unchanged)
// This listener handles messages *from* the parent (renderer) to trigger a download *within* the webview.
// This is part of the download handling mechanism, distinct from capturing user clicks on download links.
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'download-link') {
        // This part is for *initiating* a download programmatically if instructed by the parent,
        // not for capturing user clicks on download links (that's handleDownloadLink).
        const downloadLink = document.createElement('a');
        downloadLink.href = event.data.url;
        downloadLink.click();
    }
});