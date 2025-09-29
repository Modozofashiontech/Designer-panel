import React, { useState, useRef, useEffect } from 'react';
import socket from '../socket';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import { useSharedPDFs } from '../context/SharedPDFContext';
import BrandManagerSelection from './BrandManagerSelection';
import * as pdfjsLib from 'pdfjs-dist';
import AiHelpBot from './AiHelpBot';
import axios from 'axios';
import ManagerCard from './ManagerCard';

// Set worker path for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const LineSheets = () => {
  const navigate = useNavigate();
  const { sharedPDFs, addSharedPDF } = useSharedPDFs();
  const [selectedHeaderSeason, setSelectedHeaderSeason] = useState('SS 25');
  const [isHeaderSeasonOpen, setIsHeaderSeasonOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'lineSheetFiles', direction: 'desc' });
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showBrandManagerPage, setShowBrandManagerPage] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileDetails, setFileDetails] = useState([]);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [submissionDetails, setSubmissionDetails] = useState({
    count: 0,
    brandManager: ''
  });
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    season: 'SS 25',
    articleType: '',
    gender: '',
    brand: ''
  });
  const [isFormSeasonOpen, setIsFormSeasonOpen] = useState(false);
  const [isArticleTypeOpen, setIsArticleTypeOpen] = useState(false);
  const [isGenderOpen, setIsGenderOpen] = useState(false);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const seasons = ['SS 25', 'FW 24', 'SS 24', 'FW 23'];
  const articleTypes = ['Tshirt', 'Shirt', 'Pants', 'Dresses', 'Jackets', 'Sweaters'];
  const genders = ['Male', 'Female', 'All Genders', 'Kids'];
  const brands = ['Myntra', 'H&M', 'Zara', 'Nike', 'Adidas', 'Puma', 'Levis', 'Tommy Hilfiger', 'Calvin Klein', 'Forever 21'];
  const [isHelpBotOpen, setIsHelpBotOpen] = useState(false);
  const [uploadedSheets, setUploadedSheets] = useState([]);
  const [brandManagers, setBrandManagers] = useState([]);
  const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
  const PYTHON_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5001`;
  const AWS_REGION = 'ap-south-1'; // Default AWS region

  // Handle sort request
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get filtered and sorted brand managers
  const getFilteredAndSortedManagers = () => {
    let filteredManagers = brandManagersWithCounts;

    // Filter by search term
    if (searchQuery) {
      filteredManagers = brandManagersWithCounts.filter(manager =>
        manager.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort managers
    return [...filteredManagers].sort((a, b) => {
      if (sortConfig.key === 'lineSheetFiles') {
        const aCount = parseInt(a.lineSheetFiles) || 0;
        const bCount = parseInt(b.lineSheetFiles) || 0;
        if (sortConfig.direction === 'asc') {
          return aCount - bCount;
        } else {
          return bCount - aCount;
        }
      }
      if (sortConfig.key === 'name') {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (sortConfig.direction === 'asc') {
          return aName.localeCompare(bName);
        } else {
          return bName.localeCompare(aName);
        }
      }
      if (sortConfig.key === 'submittedOn') {
        const aDate = a.submittedOn || '';
        const bDate = b.submittedOn || '';
        if (sortConfig.direction === 'asc') {
          return aDate.localeCompare(bDate);
        } else {
          return bDate.localeCompare(aDate);
        }
      }
      return 0;
    });
  };

  // Refs
  const fileInputRef = useRef(null);

  // Fetch brand managers & line sheets on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [bmRes, lsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/brand-managers`),
          axios.get(`${API_BASE_URL}/line-sheets`)
        ]);
        
        setBrandManagers(bmRes.data || []);
        
        // Handle both array and paginated response formats
        const lineSheetsData = lsRes.data?.data || lsRes.data || [];
        setUploadedSheets(Array.isArray(lineSheetsData) ? lineSheetsData : []);
      } catch (err) {
        console.error('Error fetching initial data', err);
        setUploadedSheets([]); // Ensure we always have an array
      }
    };
    fetchData();
  }, []);

  // Real-time updates via socket.io
  useEffect(() => {
    const handleUpdate = (updated) => {
      setUploadedSheets(prev => {
        // If same id exists, replace, else prepend
        const idx = prev.findIndex(ls => ls._id === updated._id);
        if (idx !== -1) {
          const clone = [...prev];
          clone[idx] = { ...clone[idx], ...updated };
          return clone;
        }
        return [updated, ...prev];
      });
    };

    socket.on('linesheet-updated', handleUpdate);

    return () => {
      socket.off('linesheet-updated', handleUpdate);
    };
  }, []);

  // Combine uploadedSheets with any in-memory shared (recent uploads)
  // Ensure both are arrays before spreading
  const combinedSheets = [
    ...(Array.isArray(uploadedSheets) ? uploadedSheets : []),
    ...(Array.isArray(sharedPDFs) ? sharedPDFs : [])
  ];

  // Count sheets per manager (by ObjectId and fallback to name)
  const counts = {};
  combinedSheets.forEach(ls => {
    // Handle different shapes coming from API/shared state
    // ls.brandManager can be:
    // - ObjectId string
    // - populated object { _id, name }
    // - undefined
    if (ls.brandManager) {
      if (typeof ls.brandManager === 'object') {
        const obj = ls.brandManager;
        if (obj._id) {
          const idKey = obj._id.toString();
          counts[idKey] = (counts[idKey] || 0) + 1;
        }
        if (obj.name) {
          const lowerName = obj.name.toLowerCase();
          counts[lowerName] = (counts[lowerName] || 0) + 1;
        }
      } else {
        const idKey = ls.brandManager.toString();
        counts[idKey] = (counts[idKey] || 0) + 1;
      }
    }
    const nameKey = ls.brandManagerName || (typeof ls.brandManager === 'string' ? ls.brandManager : undefined);
    if (nameKey) {
      const lower = nameKey.toLowerCase();
      counts[lower] = (counts[lower] || 0) + 1;
    }
  });

  // Build brandManagersWithCounts list
  const brandManagersWithCounts = brandManagers
    .map(bm => {
      const filesCount = counts[bm._id] || counts[bm.name.toLowerCase()] || 0;
      return {
        id: bm._id,
        name: bm.name,
        lineSheetFiles: filesCount.toString().padStart(2, '0'),
        avatar: bm.avatar || './avatar-placeholder.png',
        submittedOn: bm.createdAt ? new Date(bm.createdAt).toLocaleDateString() : ''
      };
    })
    .filter(bm => parseInt(bm.lineSheetFiles) > 0);

  // Function to display images from the backend
  const renderImages = (images) => {
    if (!images || images.length === 0) {
      return (
        <div className="text-sm text-gray-500 mt-2">
          No images available.
        </div>
      );
    }

    return (
      <div className="mt-3">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Extracted Images ({images.length})</h4>
        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.url}
                alt={`Image ${idx + 1}`}
                className="w-full h-20 object-cover rounded border border-gray-200"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <div className="hidden absolute inset-0 bg-gray-100 flex items-center justify-center text-xs text-gray-500">
                Page {img.page}, Image {img.index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // Function to render file status badge
  const renderStatusBadge = (status) => {
    const statusConfig = {
      PROCESSING: { text: 'Processing...', className: 'bg-blue-100 text-blue-800' },
      UPLOADING: { text: 'Uploading...', className: 'bg-yellow-100 text-yellow-800' },
      READY: { text: 'Ready', className: 'bg-green-100 text-green-800' },
      SUCCESS: { text: 'Uploaded', className: 'bg-green-100 text-green-800' },
      ERROR: { text: 'Error', className: 'bg-red-100 text-red-800' },
      UPLOAD_ERROR: { text: 'Upload Failed', className: 'bg-red-100 text-red-800' },
      default: { text: 'Pending', className: 'bg-gray-100 text-gray-800' }
    };
    
    const config = statusConfig[status] || statusConfig.default;
    
    return (
      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${config.className}`}>
        {config.text}
      </span>
    );
  };

  // Upload PDF to Python extraction service and process images
  const uploadAndExtractPDF = async (file) => {
    const formData = new FormData();
    formData.append('pdf', file);

    try {
      // First, send to Python extraction service
      const extractResponse = await axios.post(
        `${PYTHON_BASE_URL}/api/extract-pdf`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 300000, // 5 minute timeout for large PDFs
        }
      );

      // Process the extracted images from Python service
      const extractedImages = [];
      if (extractResponse.data.images && Array.isArray(extractResponse.data.images)) {
        extractResponse.data.images.forEach((img) => {
          if (img && img.key) {
            // Create the URL using the S3 key with the correct region
            const imageUrl = `https://${img.bucket}.s3.${AWS_REGION}.amazonaws.com/${img.key}`;
            
            extractedImages.push({
              name: img.name,
              key: img.key,
              bucket: img.bucket,
              size: img.size,
              type: img.type,
              format: img.format,
              page: img.page,
              index: img.index,
              // Add the URL for frontend display
              url: imageUrl
            });
          }
        });
      }

      // Generate a preview URL (use first image if available, otherwise use PDF preview)
      let previewUrl = '/placeholder-tshirt.png';
      if (extractedImages.length > 0) {
        previewUrl = extractedImages[0].url;
      }

      return {
        name: file.name,
        description: 'Line Sheet Document',
        status: 'DRAFT',
        previewUrl,
        pdfUrl: URL.createObjectURL(file),
        totalPages: extractResponse.data.page_count || 1,
        extractedImages,
        imageCount: extractedImages.length,
        processingComplete: true
      };
    } catch (error) {
      console.error('Error in PDF extraction:', error);
      throw error;
    }
  };

  // Update file selection handler with validation and progress
  const handleFileSelect = async (e) => {
    try {
      const files = Array.from(e.target.files);
      const pdfFiles = files.filter(file => file.type === 'application/pdf');
      
      // Validate file size (e.g., 10MB max)
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
      
      // Show loading state
      const loadingDetails = validFiles.map(file => ({
        name: file.name,
        status: 'processing',
        previewUrl: null,
        processing: true
      }));
      setFileDetails(loadingDetails);
      
      // Process files sequentially to avoid UI freeze
      const processedDetails = [];
      for (let i = 0; i < validFiles.length; i++) {
        try {
          // Initial detail with loading state
          const initialDetail = {
            name: validFiles[i].name,
            description: 'Line Sheet Document',
            status: 'PROCESSING',
            previewUrl: '/placeholder-tshirt.png',
            pdfUrl: URL.createObjectURL(validFiles[i]),
            totalPages: 1,
            extractedImages: [],
            processing: true
          };
          
          // Update UI with initial state
          setFileDetails(prev => {
            const updated = [...prev];
            updated[i] = initialDetail;
            return updated;
          });
          
          // Process with Python service
          const processedDetail = await uploadAndExtractPDF(validFiles[i]);
          processedDetails.push(processedDetail);
          
          // Update UI with processed data
          setFileDetails(prev => {
            const updated = [...prev];
            updated[i] = {
              ...processedDetail,
              status: 'READY',
              processing: false
            };
            return updated;
          });
          
        } catch (error) {
          console.error(`Error processing ${validFiles[i].name}:`, error);
          const errorDetail = {
            name: validFiles[i].name,
            error: 'Failed to process PDF',
            status: 'ERROR',
            processing: false,
            previewUrl: '/placeholder-tshirt.png'
          };
          
          processedDetails.push(errorDetail);
          
          setFileDetails(prev => {
            const updated = [...prev];
            updated[i] = errorDetail;
            return updated;
          });
        }
      }
    } catch (error) {
      console.error('Error in file selection:', error);
      alert('An error occurred while processing files. Please try again.');
    }
  };

  // Enhanced remove file handler with confirmation
  const removeFile = (index, e) => {
    e?.stopPropagation(); // Prevent event bubbling
    
    if (window.confirm('Are you sure you want to remove this file?')) {
      setSelectedFiles(prev => prev.filter((_, i) => i !== index));
      setFileDetails(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Clear all selected files with confirmation
  const clearAllFiles = (e) => {
    e?.stopPropagation();
    if (window.confirm('Are you sure you want to remove all files?')) {
      setSelectedFiles([]);
      setFileDetails([]);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      setShowBrandManagerPage(true);
    }
  };

  // Update submit handler for multiple files
  const handleSubmitToBrandManager = async (submissionData) => {
    try {
      const results = await Promise.all(fileDetails.map(async (detail, index) => {
        // Skip files that failed processing
        if (detail.status === 'ERROR') {
          console.warn(`Skipping file ${detail.name} due to processing error`);
          return { error: `Failed to process ${detail.name}`, detail };
        }
        
        // Show loading state for this file
        setFileDetails(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], status: 'UPLOADING' };
          return updated;
        });
        
        try {
          const formDataPayload = new FormData();
          
          // Add PDF file
          formDataPayload.append('pdf', selectedFiles[index]);
          
          // Create line sheet data with extracted images
          const lineSheetData = {
            name: detail.name,
            description: detail.description || 'Line Sheet Document',
            status: 'SUBMITTED',
            brandManager: submissionData.brandManager,
            brand: formData.brand, // Include the selected brand
            season: formData.season,
            articleType: formData.articleType,
            gender: formData.gender,
            previewUrl: detail.previewUrl,
            totalPages: detail.totalPages,
            timestamp: new Date().toISOString(),
            // Include the extracted images from the Python service
            extractedImages: detail.extractedImages || [],
            imageCount: detail.imageCount || 0
          };
          
          // Add metadata
          formDataPayload.append('metadata', JSON.stringify(lineSheetData));
          
          // Upload to backend
          console.log('🔄 Uploading line sheet with extracted images...');
          const response = await axios.post(`${API_BASE_URL}/line-sheets`, formDataPayload, {
            headers: { 
              'Content-Type': 'multipart/form-data',
              'Accept': 'application/json'
            },
            timeout: 120000 // 2 minute timeout for upload
          });
          
          console.log('✅ Line sheet uploaded:', {
            status: response.status,
            data: response.data
          });
          
          // Process the response from the backend
          const savedLineSheet = response.data;
          const lineSheetId = savedLineSheet.id || savedLineSheet._id; // Handle both id and _id for compatibility
          
          console.log('✅ Line sheet saved with images:', {
            id: lineSheetId,
            imageCount: savedLineSheet.imageCount,
            extractedImages: savedLineSheet.extractedImages ? 
              `Array of ${savedLineSheet.extractedImages.length} images` : 'No images',
            brand: savedLineSheet.brand // Log the brand to verify it's being saved
          });
          
          // Update the line sheet data with the saved document
          const updatedLineSheet = {
            ...lineSheetData,
            _id: lineSheetId,
            // Use the saved images or fall back to our extracted ones
            extractedImages: savedLineSheet.extractedImages || lineSheetData.extractedImages,
            imageCount: savedLineSheet.imageCount || lineSheetData.imageCount,
            previewUrl: savedLineSheet.previewUrl || lineSheetData.previewUrl,
            status: savedLineSheet.status || 'SUBMITTED',
            createdAt: savedLineSheet.createdAt || new Date().toISOString(),
            pdfUrl: detail.pdfUrl, // Keep the client-side URL
            brand: savedLineSheet.brand || lineSheetData.brand, // Ensure brand is included
            // New: attach Pantone-style file object returned by backend
            file: savedLineSheet.file
          };
          
          // Add to shared PDFs for immediate display
          addSharedPDF(updatedLineSheet);
          
          // Update UI to show success
          setFileDetails(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], status: 'SUCCESS' };
            return updated;
          });
          
        } catch (error) {
          console.error(`Error uploading ${detail.name}:`, error);
          
          // Update UI to show error
          setFileDetails(prev => {
            const updated = [...prev];
            updated[index] = { 
              ...updated[index], 
              status: 'UPLOAD_ERROR',
              error: error.message || 'Failed to upload file'
            };
            return updated;
          });
          
          return { 
            error: `Failed to upload ${detail.name}`,
            details: error.message 
          };
        }
      }));
      
      console.log('✅ Uploaded line sheets:', results);
      
      // Refresh brand managers so new/updated manager appears immediately
      try {
        const bmRes = await axios.get(`${API_BASE_URL}/brand-managers`);
        setBrandManagers(bmRes.data || []);
      } catch (refreshErr) {
        console.warn('Failed to refresh brand managers after upload:', refreshErr);
      }
      
      // Update state after successful uploads
      setSubmissionDetails({
        count: fileDetails.length,
        brandManager: submissionData.brandManager
      });
      setSelectedFiles([]);
      setFileDetails([]);
      setShowBrandManagerPage(false);
      setShowUploadForm(false);
      setShowSuccessScreen(true);
      
    } catch (err) {
      console.error('❌ Error uploading line sheets:', {
        message: err.message,
        response: err.response ? {
          status: err.response.status,
          statusText: err.response.statusText,
          data: err.response.data,
          headers: err.response.headers
        } : 'No response',
        config: {
          url: err.config?.url,
          method: err.config?.method,
          timeout: err.config?.timeout,
          headers: err.config?.headers
        },
        stack: err.stack
      });
      
      const errorMessage = err.response?.data?.error || 
                         err.response?.data?.message || 
                         err.message || 
                         'Failed to upload line sheets. Please try again.';
      
      alert(`Error: ${errorMessage}`);
    }
  };

  // Stepper UI
  const renderStepper = () => (
    <div className="flex items-center mb-8">
      <div className={`flex-1 text-center pb-2 border-b-2 ${step === 1 ? 'border-blue-600 text-blue-600' : 'border-gray-200 text-gray-400'}`}>Input Details</div>
      <div className="w-8 h-0.5 bg-gray-200 mx-2" />
      <div className={`flex-1 text-center pb-2 border-b-2 ${step === 2 ? 'border-blue-600 text-blue-600' : 'border-gray-200 text-gray-400'}`}>Upload Files</div>
      <div className="w-8 h-0.5 bg-gray-200 mx-2" />
      <div className={`flex-1 text-center pb-2 border-b-2 ${step === 3 ? 'border-blue-600 text-blue-600' : 'border-gray-200 text-gray-400'}`}>Submit for Approval</div>
    </div>
  );

  // Step 1: Input Details
  const renderInputDetails = () => (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6">
      {renderStepper()}
      <h2 className="text-xl font-semibold mb-4">Please select the following details to continue</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Season Dropdown */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">SEASON</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">ARTICLE TYPE</label>
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
        {/* Gender Dropdown */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">GENDER</label>
          <button
            type="button"
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
            onClick={() => {
              setIsGenderOpen(!isGenderOpen);
              setIsBrandOpen(false);
            }}
          >
            <span>{formData.gender || 'Select gender'}</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isGenderOpen && (
            <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
              {genders.map((gender) => (
                <button
                  key={gender}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, gender }));
                    setIsGenderOpen(false);
                  }}
                >
                  {gender}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Brand Dropdown */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">BRAND</label>
          <button
            type="button"
            className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
            onClick={() => {
              setIsBrandOpen(!isBrandOpen);
              setIsGenderOpen(false);
            }}
          >
            <span>{formData.brand || 'Select brand'}</span>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isBrandOpen && (
            <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
              {brands.map((brand) => (
                <button
                  key={brand}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, brand }));
                    setIsBrandOpen(false);
                  }}
                >
                  {brand}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end space-x-3 mt-8">
        <button
          onClick={() => setShowUploadForm(false)}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          onClick={() => setStep(2)}
          disabled={!formData.articleType || !formData.gender}
          className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            !formData.articleType || !formData.gender
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );

  // Step 2: Upload Files
  const renderUploadFiles = () => (
    <div className="max-w-3xl mx-auto bg-white rounded-lg shadow p-6">
      {renderStepper()}
      <h2 className="text-xl font-semibold mb-4">Upload Line Sheets</h2>
      {/* File Upload Area */}
      <div className="mb-6">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".pdf"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Select Files
          </button>
          <p className="mt-2 text-sm text-gray-500">
            or drag and drop PDF files here
          </p>
        </div>
      </div>
      {/* Selected Files List */}
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
              const isProcessing = ['processing', 'UPLOADING', 'PROCESSING'].includes(file.status);
              const isError = ['error', 'UPLOAD_ERROR'].includes(file.status);
              const isReady = ['ready', 'READY', 'SUCCESS'].includes(file.status) || !file.status;
              const showExtractedImages = file.extractedImages && file.extractedImages.length > 0 && !isProcessing;
              
              return (
                <div 
                  key={index} 
                  className={`p-4 rounded-lg border ${
                    isError ? 'border-red-200 bg-red-50' : 
                    isProcessing ? 'border-blue-100 bg-blue-50' : 
                    'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start min-w-0 flex-1">
                      <div className="mt-0.5">
                        {renderStatusBadge(file.status || 'PENDING')}
                      </div>
                      <div className="ml-3 min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {file.name}
                          </p>
                          <button
                            onClick={(e) => removeFile(index, e)}
                            className="ml-2 text-gray-400 hover:text-red-500"
                            title="Remove file"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        
                        {/* File metadata */}
                        <div className="mt-1 text-xs text-gray-500 space-y-1">
                          {file.totalPages > 0 && (
                            <div className="flex items-center">
                              <svg className="w-3 h-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>{file.totalPages} pages</span>
                            </div>
                          )}
                          
                          {file.extractedImages?.length > 0 && (
                            <div className="flex items-center">
                              <svg className="w-3 h-3 mr-1 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>{file.extractedImages.length} images extracted</span>
                            </div>
                          )}
                          
                          {file.error && (
                            <div className="flex items-start text-red-600">
                              <svg className="w-3 h-3 mt-0.5 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>{file.error}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Extracted images preview */}
                        {showExtractedImages && (
                          <div className="mt-3">
                            {renderImages(file.extractedImages)}
                          </div>
                        )}
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
                  {/* Show extracted images if available */}
                  {file.extractedImages && file.extractedImages.length > 0 && renderImages(file.extractedImages)}
                  {file.extractionError && (
                    <div className="mt-2 text-xs text-red-600">{file.extractionError}</div>
                  )}
                </div>
              );
            })}
          </div>
          {fileDetails.some(f => f.status === 'error') && (
            <div className="mt-3 text-sm text-red-600">
              Some files had errors. Please fix or remove them before continuing.
            </div>
          )}
        </div>
      )}
      {/* Action Buttons */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => setStep(1)}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Back
        </button>
        <button
          onClick={() => setStep(3)}
          disabled={fileDetails.length === 0 || 
                   fileDetails.some(f => f.status === 'processing') ||
                   fileDetails.some(f => f.status === 'error')}
          className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
            fileDetails.length === 0 || 
            fileDetails.some(f => f.status === 'processing') ||
            fileDetails.some(f => f.status === 'error')
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          }`}
          title={fileDetails.some(f => f.status === 'processing') ? 'Please wait while files are being processed' : 
                 fileDetails.some(f => f.status === 'error') ? 'Please fix errors before continuing' : 
                 'Continue to next step'}
        >
          {fileDetails.some(f => f.status === 'processing') ? 'Processing...' : 'Continue'}
        </button>
      </div>
    </div>
  );

  // Check if there are any line sheets
  const hasLineSheets = combinedSheets.length > 0;

  if (showUploadForm) {
    if (step === 1) {
      return (
        <div className="h-screen flex flex-col">
          <div className="flex-none bg-white border-b border-gray-200">
            <Header 
              selectedSeason={selectedHeaderSeason}
              onSeasonChange={setSelectedHeaderSeason}
              isSeasonOpen={isHeaderSeasonOpen}
              setIsSeasonOpen={setIsHeaderSeasonOpen}
            />
          </div>
          <div className="flex-1 overflow-auto bg-gray-50 p-6">
            {renderInputDetails()}
          </div>
        </div>
      );
    }
    if (step === 2) {
      return (
        <div className="h-screen flex flex-col">
          <div className="flex-none bg-white border-b border-gray-200">
            <Header 
              selectedSeason={selectedHeaderSeason}
              onSeasonChange={setSelectedHeaderSeason}
              isSeasonOpen={isHeaderSeasonOpen}
              setIsSeasonOpen={setIsHeaderSeasonOpen}
            />
          </div>
          <div className="flex-1 overflow-auto bg-gray-50 p-6">
            {renderUploadFiles()}
          </div>
        </div>
      );
    }
    if (step === 3) {
      return (
        <div className="h-screen flex flex-col">
          <div className="flex-none bg-white border-b border-gray-200">
            <Header 
              selectedSeason={selectedHeaderSeason}
              onSeasonChange={setSelectedHeaderSeason}
              isSeasonOpen={isHeaderSeasonOpen}
              setIsSeasonOpen={setIsHeaderSeasonOpen}
            />
          </div>
          <div className="flex-1">
            <BrandManagerSelection
              files={selectedFiles}
              onSubmit={handleSubmitToBrandManager}
              onCancel={() => setStep(2)}
              formData={formData}
            />
          </div>
        </div>
      );
    }
  }

  if (showSuccessScreen) {
    return (
      <div className="h-screen flex flex-col">
        <div className="flex-none bg-white border-b border-gray-200">
          <Header 
            selectedSeason={selectedHeaderSeason}
            onSeasonChange={setSelectedHeaderSeason}
            isSeasonOpen={isHeaderSeasonOpen}
            setIsSeasonOpen={setIsHeaderSeasonOpen}
          />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="mb-6">
              <svg className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Successful!</h2>
            <p className="text-gray-600 mb-6">
              {submissionDetails.count} line sheet(s) have been uploaded to {submissionDetails.brandManager}
            </p>
            <button
              onClick={() => setShowSuccessScreen(false)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Back to Line Sheets
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Always show Header at the top */}
      <div className="flex-none bg-white border-b border-gray-200">
        <Header 
          selectedSeason={selectedHeaderSeason}
          onSeasonChange={setSelectedHeaderSeason}
          isSeasonOpen={isHeaderSeasonOpen}
          setIsSeasonOpen={setIsHeaderSeasonOpen}
        />
      </div>

      {/* Page Header */}
      <div className="flex-none bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Line Sheets</h1>
              <p className="text-sm text-gray-600 mt-1">View all line sheets and their statuses</p>
            </div>
            <button
              onClick={() => { setShowUploadForm(true); setStep(1); }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload Line Sheet
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {!hasLineSheets ? (
          <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <img src="/tshirt-illustration.png" alt="" className="mx-auto mb-6 w-40 sm:w-44 md:w-48" />
              <h2 className="text-xl font-semibold mb-2">No Linesheets Yet</h2>
              <p className="text-gray-500 mb-6">
                Start by uploading your first Linesheets to manage designs, track status, and collaborate with your team.
              </p>
              <button
                onClick={() => { setShowUploadForm(true); setStep(1); }}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Upload Line sheets
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search and Sort */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search Brand manager"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="relative">
                <select
                  className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={sortConfig.key}
                  onChange={(e) => requestSort(e.target.value)}
                >
                  <option value="lineSheetFiles">Sort by Count</option>
                  <option value="name">Sort by Name</option>
                  <option value="submittedOn">Sort by Date</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Brand Manager Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {getFilteredAndSortedManagers().map((manager) => (
                <button
                  key={manager.id}
                  onClick={() => navigate(`/line-sheets/${manager.id}`)}
                  className="text-left bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-4">
                      <ManagerCard name={manager.name} avatar={manager.avatar} />
                    </div>
                    <svg 
                      className="w-6 h-6 text-gray-400" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-500">LINE SHEET FILES</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">{manager.lineSheetFiles}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500">SUBMITTED ON</div>
                      <div className="mt-1 text-sm font-medium text-gray-900">{manager.submittedOn}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Show Need Help button and bot only during upload flow */}
      {(showUploadForm || showBrandManagerPage) && (
        <>
          <button
            className="fixed bottom-8 right-8 z-50 bg-blue-600 text-white px-5 py-3 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none"
            onClick={() => setIsHelpBotOpen(true)}
          >
            Need Help?
          </button>
          <AiHelpBot isOpen={isHelpBotOpen} onClose={() => setIsHelpBotOpen(false)} />
        </>
      )}
    </div>
  );
};

export default LineSheets;
