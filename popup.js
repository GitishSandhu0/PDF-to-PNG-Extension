// Set the worker source for pdf.js to the local worker file
// This is crucial for pdf.js to work correctly within the Chrome extension environment
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

// Get references to HTML elements
const pdfFileInput = document.getElementById('pdfFile');
const pdfInfoDiv = document.getElementById('pdfInfo');
const totalPagesSpan = document.getElementById('totalPages');
const singlePageNumInput = document.getElementById('singlePageNum');
const startPageInput = document.getElementById('startPage');
const endPageInput = document.getElementById('endPage');
const convertSinglePageBtn = document.getElementById('convertSinglePage');
const convertPageRangeBtn = document.getElementById('convertPageRange');
const loadCurrentPdfBtn = document.getElementById('loadCurrentPdf'); // New button reference
const statusDiv = document.getElementById('status');
const downloadLinksDiv = document.getElementById('downloadLinks');
const noDownloadsYetText = document.getElementById('noDownloadsYet');

// Variable to store the loaded PDF document
let pdfDoc = null;
let fileName = "document"; // Default file name for downloads

/**
 * Displays a status message to the user.
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if it's an error message, false otherwise.
 */
function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.classList.remove('hidden', 'bg-e0f2fe', 'text-0c4a6e', 'bg-fee2e2', 'text-991b1b');
    if (isError) {
        statusDiv.classList.add('error-message');
    } else {
        statusDiv.classList.add('status-message');
    }
}

/**
 * Clears the status message.
 */
function clearStatus() {
    statusDiv.textContent = '';
    statusDiv.classList.add('hidden');
}

/**
 * Enables or disables conversion buttons and page number inputs.
 * @param {boolean} enable - True to enable, false to disable.
 */
function toggleConversionControls(enable) {
    singlePageNumInput.disabled = !enable;
    startPageInput.disabled = !enable;
    endPageInput.disabled = !enable;
    convertSinglePageBtn.disabled = !enable;
    convertPageRangeBtn.disabled = !enable;
}

/**
 * Handles the loading of a PDF from an ArrayBuffer.
 * This is a helper function used by both file input and URL loading.
 * @param {ArrayBuffer} arrayBuffer - The PDF data as an ArrayBuffer.
 * @param {string} sourceFileName - The name of the PDF file/source.
 */
async function loadPdfFromArrayBuffer(arrayBuffer, sourceFileName) {
    fileName = sourceFileName.replace(/\.pdf$/i, '').replace(/[^a-z0-9\-\_]/gi, '_'); // Sanitize for filename
    showStatus('Loading PDF...');
    toggleConversionControls(false);
    downloadLinksDiv.innerHTML = '<p class="text-sm text-gray-500 text-center" id="noDownloadsYet">Generated images will appear here.</p>';

    try {
        // Load the PDF document
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        totalPagesSpan.textContent = pdfDoc.numPages;
        pdfInfoDiv.classList.remove('hidden');
        singlePageNumInput.max = pdfDoc.numPages;
        startPageInput.max = pdfDoc.numPages;
        endPageInput.max = pdfDoc.numPages;

        // Set default values for range inputs
        singlePageNumInput.value = 1;
        startPageInput.value = 1;
        endPageInput.value = pdfDoc.numPages;

        toggleConversionControls(true);
        clearStatus();
        showStatus(`PDF "${sourceFileName}" loaded successfully. Select pages to convert.`);

    } catch (error) {
        console.error('Error loading PDF:', error);
        showStatus(`Error loading PDF: ${error.message}`, true);
        pdfDoc = null;
        totalPagesSpan.textContent = '0';
        pdfInfoDiv.classList.add('hidden');
        toggleConversionControls(false);
    }
}


/**
 * Handles the PDF file selection.
 */
pdfFileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) {
        // No file selected, reset state
        pdfDoc = null;
        totalPagesSpan.textContent = '0';
        pdfInfoDiv.classList.add('hidden');
        toggleConversionControls(false);
        clearStatus();
        downloadLinksDiv.innerHTML = '<p class="text-sm text-gray-500 text-center" id="noDownloadsYet">Generated images will appear here.</p>';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        await loadPdfFromArrayBuffer(e.target.result, file.name);
    };
    reader.onerror = (error) => {
        console.error('FileReader error:', error);
        showStatus('Error reading file.', true);
        pdfDoc = null;
        totalPagesSpan.textContent = '0';
        pdfInfoDiv.classList.add('hidden');
        toggleConversionControls(false);
    };
    reader.readAsArrayBuffer(file);
});

/**
 * Handles the "Load Current Browser PDF" button click.
 */
loadCurrentPdfBtn.addEventListener('click', async () => {
    showStatus('Attempting to load PDF from current browser tab...');
    toggleConversionControls(false);
    downloadLinksDiv.innerHTML = '<p class="text-sm text-gray-500 text-center" id="noDownloadsYet">Generated images will appear here.</p>';

    try {
        // Query the active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length === 0) {
            showStatus('No active tab found.', true);
            toggleConversionControls(true);
            return;
        }

        const activeTab = tabs[0];
        const tabUrl = activeTab.url;

        if (!tabUrl) {
            showStatus('Could not get current tab URL.', true);
            toggleConversionControls(true);
            return;
        }

        // Basic check for PDF URL
        const isPdfUrl = tabUrl.toLowerCase().endsWith('.pdf') || tabUrl.toLowerCase().includes('.pdf#');
        const isLocalFile = tabUrl.startsWith('file://');

        if (!isPdfUrl && !isLocalFile && activeTab.title && activeTab.title.toLowerCase().includes('.pdf')) {
            // Attempt to guess if it's a PDF based on title, even if URL doesn't end with .pdf
            showStatus('Warning: URL does not end with .pdf, but title suggests it might be a PDF. Attempting to load...');
        } else if (!isPdfUrl && !isLocalFile) {
            showStatus('The current tab does not appear to be a PDF. Please open a PDF directly in the tab or use "Choose PDF File".', true);
            toggleConversionControls(true);
            return;
        }
        
        if (isLocalFile) {
            showStatus('Loading local files directly from "file://" URLs is not supported via this button due to browser security restrictions. Please use "Choose PDF File" for local PDFs.', true);
            toggleConversionControls(true);
            return;
        }

        // Fetch the PDF content
        const response = await fetch(tabUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const detectedFileName = tabUrl.substring(tabUrl.lastIndexOf('/') + 1);
        await loadPdfFromArrayBuffer(arrayBuffer, detectedFileName || 'browser_pdf');

    } catch (error) {
        console.error('Error loading PDF from current tab:', error);
        showStatus(`Error loading PDF from current tab: ${error.message}. This might be due to security restrictions (e.g., local files) or network issues.`, true);
        toggleConversionControls(true);
    }
});


/**
 * Converts a specific page of the PDF to a PNG image.
 * @param {object} pdfDocument - The PDF document object.
 * @param {number} pageNum - The page number to convert (1-indexed).
 * @param {number} totalPages - The total number of pages in the PDF.
 * @returns {Promise<string|null>} A promise that resolves with the PNG data URL or null on error.
 */
async function convertPageToPng(pdfDocument, pageNum, totalPages) {
    if (pageNum < 1 || pageNum > totalPages) {
        console.warn(`Page number ${pageNum} is out of bounds (1-${totalPages}).`);
        return null;
    }

    try {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 }); // Scale for better resolution

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };
        await page.render(renderContext).promise;

        // Get data URL for the PNG image
        const pngDataUrl = canvas.toDataURL('image/png');
        page.cleanup(); // Clean up page resources
        return pngDataUrl;
    } catch (error) {
        console.error(`Error converting page ${pageNum}:`, error);
        return null;
    }
}

/**
 * Creates and appends a download link for a generated image.
 * @param {string} dataUrl - The data URL of the image.
 * @param {string} fileNamePrefix - The base file name (e.g., 'document').
 * @param {number} pageNumber - The page number for the file name.
 */
function createDownloadLink(dataUrl, fileNamePrefix, pageNumber) {
    // Check if the noDownloadsYetText element exists before trying to remove it
    const currentNoDownloadsYetText = document.getElementById('noDownloadsYet');
    if (currentNoDownloadsYetText) {
        currentNoDownloadsYetText.remove(); // Remove the "no downloads yet" message
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${fileNamePrefix}_page_${pageNumber}.png`;
    link.textContent = `Download Page ${pageNumber}`;
    link.classList.add('px-2', 'py-1', 'bg-blue-50', 'rounded', 'hover:bg-blue-100', 'text-blue-700', 'text-sm');
    downloadLinksDiv.appendChild(link);
}

/**
 * Handles the conversion of a single selected page.
 */
convertSinglePageBtn.addEventListener('click', async () => {
    if (!pdfDoc) {
        showStatus('Please load a PDF first.', true);
        return;
    }

    const pageNum = parseInt(singlePageNumInput.value, 10);
    if (isNaN(pageNum) || pageNum < 1 || pageNum > pdfDoc.numPages) {
        showStatus(`Please enter a valid page number between 1 and ${pdfDoc.numPages}.`, true);
        return;
    }

    showStatus(`Converting page ${pageNum}...`);
    toggleConversionControls(false); // Disable controls during conversion
    downloadLinksDiv.innerHTML = ''; // Clear previous downloads

    // Ensure noDownloadsYetText is removed only if it exists in the DOM
    const currentNoDownloadsYetText = document.getElementById('noDownloadsYet');
    if (currentNoDownloadsYetText) {
        currentNoDownloadsYetText.remove();
    }


    try {
        const dataUrl = await convertPageToPng(pdfDoc, pageNum, pdfDoc.numPages);
        if (dataUrl) {
            createDownloadLink(dataUrl, fileName, pageNum);
            showStatus(`Page ${pageNum} converted successfully!`);
        } else {
            showStatus(`Failed to convert page ${pageNum}.`, true);
        }
    } catch (error) {
        console.error('Error during single page conversion:', error);
        showStatus('An unexpected error occurred during conversion.', true);
    } finally {
        toggleConversionControls(true); // Re-enable controls
    }
});

/**
 * Handles the conversion of a range of pages.
 */
convertPageRangeBtn.addEventListener('click', async () => {
    if (!pdfDoc) {
        showStatus('Please load a PDF first.', true);
        return;
    }

    let startPage = parseInt(startPageInput.value, 10);
    let endPage = parseInt(endPageInput.value, 10);

    // If inputs are empty, convert all pages
    if (isNaN(startPage) || startPage < 1) {
        startPage = 1;
    }
    if (isNaN(endPage) || endPage > pdfDoc.numPages) {
        endPage = pdfDoc.numPages;
    }

    if (startPage > endPage) {
        showStatus('Start page cannot be greater than end page.', true);
        return;
    }
    if (startPage > pdfDoc.numPages || endPage < 1) {
        showStatus('Invalid page range. Please check the page numbers.', true);
        return;
    }

    showStatus(`Converting pages ${startPage} to ${endPage}...`);
    toggleConversionControls(false); // Disable controls during conversion
    downloadLinksDiv.innerHTML = ''; // Clear previous downloads

    // Ensure noDownloadsYetText is removed only if it exists in the DOM
    const currentNoDownloadsYetText = document.getElementById('noDownloadsYet');
    if (currentNoDownloadsYetText) {
        currentNoDownloadsYetText.remove();
    }


    let convertedCount = 0;
    try {
        for (let i = startPage; i <= endPage; i++) {
            showStatus(`Converting page ${i} of ${endPage} (${convertedCount}/${endPage - startPage + 1} completed)...`);
            const dataUrl = await convertPageToPng(pdfDoc, i, pdfDoc.numPages);
            if (dataUrl) {
                createDownloadLink(dataUrl, fileName, i);
                convertedCount++;
            } else {
                console.warn(`Skipping page ${i} due to conversion failure.`);
            }
        }
        showStatus(`Converted ${convertedCount} of ${endPage - startPage + 1} pages successfully.`);
    } catch (error) {
        console.error('Error during range conversion:', error);
        showStatus('An unexpected error occurred during conversion.', true);
    } finally {
        toggleConversionControls(true); // Re-enable controls
    }
});

// Initial state: disable controls until a PDF is loaded
toggleConversionControls(false);
