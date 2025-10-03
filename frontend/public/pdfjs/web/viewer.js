// Set the worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

// Get the PDF file URL from the query string
const params = new URLSearchParams(window.location.search);
let fileUrl = params.get('file');
const initialPageParam = parseInt(params.get('page') || '1', 10);
const hideToolbar = (params.get('toolbar') === '0') || (params.get('embed') === '1') || false;
const previewMode = (params.get('preview') === '1') || (params.get('single') === '1');

// If no file parameter is provided, show an error
if (!fileUrl) {
    document.getElementById('viewer').innerHTML = `
        <div class="error">
            <p>No PDF file specified. Please provide a file URL parameter.</p>
            <p>Example: viewer.html?file=example.pdf</p>
        </div>`;
    throw new Error('No PDF file specified');
}

// If the file URL is relative, make it absolute
if (!fileUrl.startsWith('http') && !fileUrl.startsWith('blob:')) {
    if (fileUrl.startsWith('/')) {
        fileUrl = window.location.origin + fileUrl;
    } else {
        // If it's a relative URL, make it relative to the current page
        const baseUrl = window.location.href.split('?')[0];
        const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        fileUrl = basePath + fileUrl;
    }
}

// Show the filename in the toolbar (if visible)
const filenameEl = document.getElementById('filename');
if (filenameEl) {
  filenameEl.textContent = ' | ' + (fileUrl.split('/').pop() || 'document.pdf');
}

// Initialize variables
let pdfDoc = null,
    pageNum = previewMode ? 1 : (Number.isFinite(initialPageParam) && initialPageParam > 0 ? initialPageParam : 1),
    pageRendering = false,
    pageNumPending = null,
    scale = 1.0,
    canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d');

// Get DOM elements
const container = document.getElementById('viewer');
const pageNumElement = document.getElementById('page_num');
const pageCountElement = document.getElementById('page_count');
const prevButton = document.getElementById('prev');
const nextButton = document.getElementById('next');
const zoomInButton = document.getElementById('zoom_in');
const zoomOutButton = document.getElementById('zoom_out');
const loadingElement = document.getElementById('loading');

// Apply embed mode styles: hide toolbar and remove top offset
const toolbarEl = document.getElementById('toolbar');
const viewerContainerEl = document.getElementById('viewerContainer');
if ((hideToolbar || previewMode) && toolbarEl && viewerContainerEl) {
  toolbarEl.style.display = 'none';
  // Remove any reserved top space
  viewerContainerEl.style.top = '0';
  // For previews, hide scrollbars within the iframe and let parent control size
  if (previewMode) {
    viewerContainerEl.style.overflow = 'hidden';
  }
}

// Render the page
function renderPage(num) {
    pageRendering = true;
    loadingElement.classList.remove('hidden');
    
    // Using promise to fetch the page
    pdfDoc.getPage(num).then(function(page) {
        // Set the viewport
        // Auto-fit width in preview mode
        if (previewMode) {
          const baseViewport = page.getViewport({ scale: 1 });
          const containerWidth = (viewerContainerEl || container).clientWidth || baseViewport.width;
          scale = Math.max(0.5, Math.min(3.0, containerWidth / baseViewport.width));
        }
        const viewport = page.getViewport({ scale: scale });
        
        // Set canvas dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Clear the container and append the canvas
        container.innerHTML = '';
        container.appendChild(canvas);
        
        // Render PDF page into canvas context
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        
        const renderTask = page.render(renderContext);
        
        // Wait for rendering to finish
        return renderTask.promise.then(function() {
            pageRendering = false;
            loadingElement.classList.add('hidden');
            
            // Update page number
            if (pageNumElement) pageNumElement.textContent = num;
            
            // Enable/disable page navigation buttons
            if (!previewMode) {
              if (prevButton) prevButton.disabled = (num <= 1);
              if (nextButton) nextButton.disabled = (num >= pdfDoc.numPages);
            }
            
            // Resolve any pending page rendering
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            }
        });
    }).catch(function(error) {
        console.error('Error rendering page:', error);
        loadingElement.classList.add('error');
        loadingElement.textContent = 'Error rendering page: ' + error.message;
    });
}

// Go to previous page
function onPrevPage() {
    if (previewMode || pageNum <= 1 || pageRendering) {
        return;
    }
    pageNum--;
    queueRenderPage(pageNum);
}

// Go to next page
function onNextPage() {
    if (previewMode || pageNum >= pdfDoc.numPages || pageRendering) {
        return;
    }
    pageNum++;
    queueRenderPage(pageNum);
}

// Queue a page rendering if another page is being rendered
function queueRenderPage(num) {
    if (pageRendering) {
        pageNumPending = num;
    } else {
        renderPage(num);
    }
}

// Zoom in
function zoomIn() {
    if (scale >= 3.0) return;
    scale += 0.25;
    queueRenderPage(pageNum);
}

// Zoom out
function zoomOut() {
    if (scale <= 0.5) return;
    scale -= 0.25;
    queueRenderPage(pageNum);
}

// Event listeners
prevButton.addEventListener('click', onPrevPage);
nextButton.addEventListener('click', onNextPage);
zoomInButton.addEventListener('click', zoomIn);
zoomOutButton.addEventListener('click', zoomOut);

// Handle keyboard navigation
document.addEventListener('keydown', function(e) {
    if (previewMode) return;
    if (e.target.tagName.toLowerCase() === 'input') return; // Skip if typing in an input field
    
    switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
            onPrevPage();
            e.preventDefault();
            break;
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
            onNextPage();
            e.preventDefault();
            break;
    }
});

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        if (pdfDoc) {
            queueRenderPage(pageNum);
        }
    }, 250); // Debounce resize events
});

// Load the PDF
const loadingTask = pdfjsLib.getDocument({
    url: fileUrl,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.11.338/cmaps/',
    cMapPacked: true,
});

loadingTask.promise.then(function(pdf) {
    pdfDoc = pdf;
    
    // Update page count
    if (pageCountElement && !previewMode) pageCountElement.textContent = pdf.numPages;
    
    // Set document title
    document.title = fileUrl.split('/').pop() + ' - PDF Viewer';
    
    // Initial render
    renderPage(pageNum);
    
}).catch(function(error) {
    // Handle errors
    console.error('Error loading PDF:', error);
    loadingElement.classList.add('error');
    loadingElement.textContent = 'Error loading PDF: ' + (error.message || 'Unknown error');
    
    // Show more detailed error in console
    if (error.name === 'PasswordException') {
        console.error('This PDF is password protected. Please provide the password.');
    } else if (error.name === 'InvalidPDFException') {
        console.error('The file is not a valid PDF or is corrupted.');
    } else if (error.name === 'MissingPDFException') {
        console.error('The PDF could not be found at the specified URL.');
    } else if (error.name === 'UnexpectedResponseException') {
        console.error('Unexpected server response.');
    }
});
