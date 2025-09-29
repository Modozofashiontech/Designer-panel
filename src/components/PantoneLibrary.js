import React, { useState, useRef, useEffect } from 'react';
import Header from './Header';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import pantoneColors from '../utils/pantoneColors.json';

const PantoneLibrary = () => {
  // common header state
  const [selectedSeason, setSelectedSeason] = useState('SS 25');
  const [isSeasonOpen, setIsSeasonOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    season: 'SS 25',
    articleType: '',
  });
  const [isFormSeasonOpen, setIsFormSeasonOpen] = useState(false);
  const [isArticleTypeOpen, setIsArticleTypeOpen] = useState(false);
  const seasons = ['SS 25', 'FW 24', 'SS 24', 'FW 23'];
  const articleTypes = ['Tshirt', 'Shirt', 'Pants', 'Dresses', 'Jackets', 'Sweaters'];
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileDetails, setFileDetails] = useState([]);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const fileInputRef = useRef(null);
  const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
  const [uploadedPantoneLibraries, setUploadedPantoneLibraries] = useState([]);
  const [selectedLibrary, setSelectedLibrary] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedManager, setSelectedManager] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Group pantones by manager/designer
  const managerGroups = React.useMemo(() => {
    const groups = {};
    uploadedPantoneLibraries.forEach(lib => {
      const manager = lib.uploadedBy || 'Tony Designer';
      if (!groups[manager]) groups[manager] = [];
      groups[manager].push(...(lib.pantones || []).map(p => ({ ...p, season: lib.season, addedBy: manager })));
    });
    return groups;
  }, [uploadedPantoneLibraries]);

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(totalPages, prev + 1));
  };

  useEffect(() => {
    const fetchPantoneLibraries = async () => {
      try {
        setIsLoading(true);
        const res = await axios.get(`${API_BASE_URL}/pantone-library`);
        setUploadedPantoneLibraries(res.data || []);
      } catch (err) {
        console.error('Error fetching Pantone Library records', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPantoneLibraries();
  }, [showSuccessScreen]); // refetch after upload


  const extractPdfContent = async (file) => {
    const pdfjsLib = await import('pdfjs-dist/build/pdf');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      let ocrText = '';
      let previewUrl = '';
      const pageAvgColors = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        if (i === 1) previewUrl = canvas.toDataURL('image/png');

        // Quick average colour sampler for this page (ignoring near-white background)
        const imgData = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let rSum = 0, gSum = 0, bSum = 0, pixCount = 0;
        for (let p = 0; p < imgData.length; p += 4) {
          const r = imgData[p], g = imgData[p + 1], b = imgData[p + 2], a = imgData[p + 3];
          if (a > 0 && !(r > 240 && g > 240 && b > 240)) { // exclude white background
            rSum += r; gSum += g; bSum += b; pixCount++;
          }
        }
        if (pixCount > 0) {
          const avgR = Math.round(rSum / pixCount);
          const avgG = Math.round(gSum / pixCount);
          const avgB = Math.round(bSum / pixCount);
          const toHex = x => x.toString(16).padStart(2, '0');
          const avgHex = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
          pageAvgColors.push(avgHex);
        }
        // OCR: extract text from the canvas image
        const { data: { text: ocrResult } } = await Tesseract.recognize(canvas, 'eng');
        ocrText += ocrResult + ' ';
        // Also try to extract embedded text (if any)
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + ' ';
      }
      // Combine OCR and embedded text
      const combinedText = (fullText + ' ' + ocrText).trim();
      // Extract Pantone code-to-name pairs directly from the PDF text
      const pantoneDetails = [];
      const seenCodes = new Set();
      const pairRegex = /(?:PANTONE\s+)?(\d{2}-?\d{4}\s*(?:TCX|TPG|TPX))\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)/gi;
      let pairMatch;
      while ((pairMatch = pairRegex.exec(combinedText)) !== null) {
        const code = pairMatch[1].toUpperCase().replace(/\s+/g, ' ');
        const name = pairMatch[2].trim();
        if (!seenCodes.has(code)) {
          seenCodes.add(code);
          pantoneDetails.push({
            pantoneNumber: code,
            colorName: name,
            hex: '#fff', // placeholder until we assign sampled colour
            code
          });
        }
      }
      // Assign sampled average colours to entries
      pantoneDetails.forEach((p, idx) => {
        if (idx < pageAvgColors.length) {
          p.hex = pageAvgColors[idx];
        }
      });
      console.log('PDF OCR+Text:', combinedText); // Debug: show combined extracted text
      console.log('Extracted pantones:', pantoneDetails); // Debug: show extracted pantones
      return {
        name: file.name,
        description: 'Pantone Document',
        status: 'DRAFT',
        previewUrl: previewUrl,
        totalPages: pdf.numPages,
        pantones: pantoneDetails, // Array of {hex, name, code}
        season: formData.season // Add selected season
      };
    } catch (error) {
      console.error('Error parsing PDF:', error);
      return {
        name: file.name,
        description: 'Pantone Document',
        status: 'DRAFT',
        previewUrl: '/placeholder-tshirt.png',
        totalPages: 1,
        pantones: [],
        season: formData.season
      };
    }
  };

  const handleFileSelect = async (e) => {
    try {
      const files = Array.from(e.target.files);
      const pdfFiles = files.filter(file => file.type === 'application/pdf');
      const maxSize = 10 * 1024 * 1024; // 10MB
      const validFiles = [];
      for (const file of pdfFiles) {
        if (file.size > maxSize) {
          console.warn(`File ${file.name} is too large (max 10MB)`);
          continue;
        }
        validFiles.push(file);
      }
      if (validFiles.length === 0) {
        alert('Please select valid PDF files (max 10MB each)');
        return;
      }
      setSelectedFiles(validFiles);
      const loadingDetails = validFiles.map(file => ({
        name: file.name,
        status: 'processing',
        previewUrl: null
      }));
      setFileDetails(loadingDetails);
      const processedDetails = [];
      for (let i = 0; i < validFiles.length; i++) {
        try {
          const detail = await extractPdfContent(validFiles[i]);
          console.log('handleFileSelect - Extracted pantones:', detail.pantones); // Debug: show extracted pantones
          processedDetails.push(detail);
          setFileDetails(prev => {
            const updated = [...prev];
            updated[i] = { ...detail, status: 'ready' };
            return updated;
          });
        } catch (error) {
          console.error(`Error processing ${validFiles[i].name}:`, error);
          processedDetails.push({
            name: validFiles[i].name,
            error: 'Failed to process PDF',
            status: 'error'
          });
          setFileDetails(prev => {
            const updated = [...prev];
            updated[i] = {
              ...updated[i],
              error: 'Failed to process PDF',
              status: 'error'
            };
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Error in file selection:', error);
      alert('An error occurred while processing files. Please try again.');
    }
  };

  const removeFile = (index, e) => {
    e?.stopPropagation();
    if (window.confirm('Are you sure you want to remove this file?')) {
      setSelectedFiles(prev => prev.filter((_, i) => i !== index));
      setFileDetails(prev => prev.filter((_, i) => i !== index));
    }
  };

  const clearAllFiles = (e) => {
    e?.stopPropagation();
    if (window.confirm('Are you sure you want to remove all files?')) {
      setSelectedFiles([]);
      setFileDetails([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSubmit = async () => {
    try {
      const results = await Promise.all(fileDetails.map(async (detail, index) => {
        const formDataPayload = new FormData();
        formDataPayload.append('pdf', selectedFiles[index]);
        const pantoneData = {
          name: detail.name,
          description: detail.description || 'Pantone Document',
          status: 'SUBMITTED',
          season: detail.season || formData.season,
          previewUrl: detail.previewUrl,
          totalPages: detail.totalPages,
          pantones: detail.pantones || [], // Ensure pantones array is sent
          timestamp: new Date().toISOString(),
        };
        formDataPayload.append('metadata', JSON.stringify(pantoneData));
        const response = await axios.post(`${API_BASE_URL}/pantone-library`, formDataPayload, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
      }));
      setSelectedFiles([]);
      setFileDetails([]);
      setShowSuccessScreen(false);
      setShowUploadForm(false);
      setStep(1);
    } catch (err) {
      console.error('❌ Error uploading pantone files:', err);
      alert('Error uploading pantone files. Please try again.');
    }
  };

  const renderStepper = () => (
    <div className="flex items-center mb-8">
      <div className="flex-1">
        <div className={`text-center ${step === 1 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className="mb-2">Input Details</div>
          <div className={`border-b-2 ${step === 1 ? 'border-blue-600' : 'border-gray-200'}`}></div>
        </div>
      </div>
      <div className="w-8" />
      <div className="flex-1">
        <div className={`text-center ${step === 2 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className="mb-2">Upload Files</div>
          <div className={`border-b-2 ${step === 2 ? 'border-blue-600' : 'border-gray-200'}`}></div>
        </div>
      </div>
      <div className="w-8" />
      <div className="flex-1">
        <div className={`text-center ${step === 3 ? 'text-blue-600' : 'text-gray-400'}`}>
          <div className="mb-2">Submit</div>
          <div className={`border-b-2 ${step === 3 ? 'border-blue-600' : 'border-gray-200'}`}></div>
        </div>
      </div>
    </div>
  );

  const renderInputDetails = () => (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6">
      {renderStepper()}
      <h2 className="text-xl font-semibold mb-4">Please select the following details to continue</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Season Dropdown */}
        <div className="relative">
          <label className="block text-sm uppercase font-medium text-gray-700 mb-1">SEASON</label>
          <button
            type="button"
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
            onClick={() => setIsFormSeasonOpen(!isFormSeasonOpen)}
          >
            <span>{formData.season}</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isFormSeasonOpen && (
            <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
              {seasons.map((season) => (
                <button
                  key={season}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, season }));
                    setIsFormSeasonOpen(false);
                  }}
                >
                  {season}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Article Type Dropdown */}
        <div className="relative">
          <label className="block text-sm uppercase font-medium text-gray-700 mb-1">ARTICLE TYPE</label>
          <button
            type="button"
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
            onClick={() => setIsArticleTypeOpen(!isArticleTypeOpen)}
          >
            <span>{formData.articleType || 'Select article type'}</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isArticleTypeOpen && (
            <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
              {articleTypes.map((type) => (
                <button
                  key={type}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, articleType: type }));
                    setIsArticleTypeOpen(false);
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end space-x-3 mt-8">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          onClick={() => setStep(2)}
          disabled={!formData.articleType}
          className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            !formData.articleType
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderUploadFiles = () => (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6">
      {renderStepper()}
      <h2 className="text-xl font-semibold mb-4">Upload Pantone PDFs</h2>
      <div className="mb-6">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".pdf"
            className="hidden"
            disabled={!!selectedLibrary}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${selectedLibrary ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!!selectedLibrary}
          >
            Select Files
          </button>
          <p className="mt-2 text-sm text-gray-500">
            or drag and drop PDF files here
          </p>
        </div>
      </div>
      {fileDetails.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-medium">Selected Files ({fileDetails.length})</h3>
            {fileDetails.length > 1 && (
              <button
                onClick={clearAllFiles}
                className="text-sm text-red-600 hover:text-red-800"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {fileDetails.map((file, index) => {
              const isProcessing = file.status === 'processing';
              const isError = file.status === 'error';
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-3 rounded border ${
                    isError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center min-w-0">
                    <div className={`p-1.5 rounded-full mr-3 ${
                      isProcessing ? 'bg-blue-100 text-blue-600' :
                      isError ? 'bg-red-100 text-red-600' :
                      'bg-green-100 text-green-600'
                    }`}>
                      {isProcessing ? (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : isError ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {file.name}
                      </p>
                      {file.error ? (
                        <p className="text-xs text-red-600 mt-1">{file.error}</p>
                      ) : file.status === 'processing' ? (
                        <p className="text-xs text-blue-600 mt-1">Processing...</p>
                      ) : file.totalPages ? (
                        <p className="text-xs text-gray-500 mt-1">{file.totalPages} pages</p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    onClick={(e) => removeFile(index, e)}
                    className="ml-2 text-gray-400 hover:text-red-600 transition-colors"
                    aria-label="Remove file"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex justify-end space-x-3 mt-8">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={fileDetails.length === 0 || fileDetails.some(f => f.status !== 'ready')}
          className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            fileDetails.length === 0 || fileDetails.some(f => f.status !== 'ready')
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderSubmit = () => (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6">
      {renderStepper()}
      <h2 className="text-xl font-semibold mb-4">Submit Pantone PDFs</h2>
      <div className="mb-6">
        <ul className="list-disc pl-6">
          {fileDetails.map((file, idx) => (
            <li key={idx} className="mb-2">
              <span className="font-medium">{file.name}</span> ({file.totalPages} pages)
            </li>
          ))}
        </ul>
      </div>
      <div className="flex justify-end space-x-3 mt-8">
        <button
          onClick={() => setStep(2)}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Submit
        </button>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6 text-center">
      <h2 className="text-2xl font-bold mb-4">Pantone PDFs Uploaded Successfully!</h2>
      <p className="mb-6">Your files have been uploaded and submitted for review.</p>
      <button
        onClick={() => setShowSuccessScreen(false)}
        className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
      >
        Upload More
      </button>
    </div>
  );

  // If no manager selected, show cards and upload button
  if (!selectedManager) {
    // Show upload flow if showUploadForm is true
    if (showUploadForm) {
      // Always show Header at the top of upload steps
      return (
        <div className="min-h-screen bg-gray-50 p-8">
          <Header 
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
            isSeasonOpen={isSeasonOpen}
            setIsSeasonOpen={setIsSeasonOpen}
          />
          <div>
            {step === 1 && renderInputDetails()}
            {step === 2 && renderUploadFiles()}
            {step === 3 && renderSubmit()}
            {showSuccessScreen && renderSuccess()}
          </div>
        </div>
      );
    }
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-none bg-white border-b border-gray-200">
          <Header
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
            isSeasonOpen={isSeasonOpen}
            setIsSeasonOpen={setIsSeasonOpen}
          />
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold mb-1">Pantone Library</h1>
              <p className="text-sm text-gray-500">View all Pantone's added by the designer</p>
            </div>
            <button
              className="px-5 py-2 bg-blue-600 text-white rounded-md font-medium shadow hover:bg-blue-700 focus:outline-none"
              onClick={() => {
                setShowUploadForm(true);
                setStep(1);
              }}
            >
              Upload Pantone Library
            </button>
          </div>
          <div className="flex items-center justify-between mb-6">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search Vendors"
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              SORT
            </button>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center text-gray-500">
                <svg className="animate-spin h-10 w-10 text-blue-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
                <span className="mt-3 text-sm">Loading Pantone Libraries...</span>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(managerGroups).map(([manager, pantones]) => {
              const filteredPantones = pantones.filter(p =>
                (p.pantoneNumber || '').toLowerCase().includes(search.toLowerCase()) ||
                (p.colorName || '').toLowerCase().includes(search.toLowerCase()) ||
                (p.code || '').toLowerCase().includes(search.toLowerCase()) ||
                (p.pantoneName || '').toLowerCase().includes(search.toLowerCase())
              );
              const totalPages = Math.ceil(filteredPantones.length / pageSize);
              const startIndex = (currentPage - 1) * pageSize;
              const endIndex = startIndex + pageSize;
              const currentPantones = filteredPantones.slice(startIndex, endIndex);
              return (
                <div
                  key={manager}
                  className="bg-white rounded-lg shadow p-6 flex flex-col cursor-pointer hover:shadow-lg border border-gray-200"
                  onClick={() => setSelectedManager(manager)}
                >
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <div className="font-semibold text-lg">{manager}</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 mt-2">
                    <div>
                      <div className="uppercase font-medium mb-1">TOTAL PANTONES</div>
                      <div>{pantones.length}</div>
                    </div>
                    <div>
                      <div className="uppercase font-medium mb-1">ADDED DATE</div>
                      <div>10/02/2025</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </div>
      </div>
    );
  }

  // Table view for selected manager
  const managerPantones = managerGroups[selectedManager] || [];
  const filteredPantones = managerPantones.filter(p =>
    (p.pantoneNumber || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.colorName || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.pantoneName || '').toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filteredPantones.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentPantones = filteredPantones.slice(startIndex, endIndex);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-none bg-white border-b border-gray-200">
        <Header
          selectedSeason={selectedSeason}
          onSeasonChange={setSelectedSeason}
          isSeasonOpen={isSeasonOpen}
          setIsSeasonOpen={setIsSeasonOpen}
        />
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 p-8">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center text-gray-500">
              <svg className="animate-spin h-10 w-10 text-blue-600" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              <span className="mt-3 text-sm">Loading Pantone Libraries...</span>
            </div>
          </div>
        )}
        <div className="flex items-center mb-6">
          <button
            className="mr-4 px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 font-medium"
            onClick={() => setSelectedManager(null)}
          >
            Back
          </button>
          <h1 className="text-3xl font-bold"> Pantone library</h1>
        </div>
        {/* Search, Filter, Status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search Pantone.."
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-md bg-white text-gray-700 font-medium">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M6 6h12M9 14h6" /></svg>
              FILTER
            </button>
            <button className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-md bg-white text-gray-700 font-medium">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              STATUS
            </button>
          </div>
        </div>
        {/* Pantone Table */}
        <div className="bg-white rounded-lg shadow p-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Pantone Number</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Color name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Color</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Added by</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Season</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentPantones.map((p, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2 whitespace-nowrap">{p.pantoneNumber || '-'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{p.colorName || '-'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {(() => {
                      const pantoneNum = p.pantoneNumber || p.code || '';
                      const pantone = pantoneColors[pantoneNum];
                      const hex = pantone ? pantone.hex : '#d1d5db';
                      return (
                        <span style={{ display: 'inline-block', width: 32, height: 24, background: hex, border: '1px solid #ccc', borderRadius: 4, verticalAlign: 'middle', marginRight: 8 }}></span>
                      );
                    })()}
                    <span className="text-xs text-gray-500 align-middle">
                      {(() => {
                        const pantoneNum = p.pantoneNumber || p.code || '';
                        const pantone = pantoneColors[pantoneNum];
                        return pantone ? pantone.hex : 'N/A';
                      })()}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{p.addedBy || 'TONY'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{p.season || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span>Page Size</span>
              <select
                className="border border-gray-300 rounded px-2 py-1"
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
              >
                {[10, 20, 50].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 font-medium disabled:opacity-50"
                onClick={handlePrevPage}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <button
                className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 font-medium disabled:opacity-50"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PantoneLibrary;  