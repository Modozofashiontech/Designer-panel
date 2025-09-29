import React, { useState, useMemo, useEffect, useRef, memo, useCallback } from 'react';
import ManagerCommentsSidebar from './ManagerCommentsSidebar';
import PDFViewer from './PDFViewer';
import socket from '../socket';
import { API_BASE } from '../config';
import { FaComment, FaCommentAlt, FaPaperPlane } from 'react-icons/fa';
import axios from 'axios';

const CommentForm = ({ techpackId, onCommentAdded }) => {
  const [comment, setComment] = useState('');
  const [user, setUser] = useState('Designer'); // Default or get from auth context

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;

    try {
      // Emit via Socket.IO for real-time
      socket.emit('add-comment', {
        techpackId,
        comment: comment.trim(),
        user
      });

      // Also save via HTTP for persistence
  await axios.post(`${API_BASE}/api/tech-packs/${techpackId}/comments`, {
        text: comment.trim(),
        user
      });

      setComment('');
      if (onCommentAdded) onCommentAdded();
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-center">
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment..."
        className="flex-1 px-3 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="bg-blue-500 text-white px-4 py-2 rounded-r-lg hover:bg-blue-600 transition-colors"
      >
        <FaPaperPlane />
      </button>
    </form>
  );
};

const getStatusClass = (status) => {
  const normalizedStatus = status?.toUpperCase() || 'DRAFT';
  switch (normalizedStatus) {
    case 'SUBMITTED':
      return 'bg-yellow-400 text-yellow-900';
    case 'ACCEPTED':
      return 'bg-[#22C55E] text-white';
    case 'REJECTED':
      return 'bg-[#EF4444] text-white';
    default:
      return 'bg-gray-200 text-gray-600';
  }
};

const PastUploads = memo(({ setShowUploadForm, uploadedFiles: uploadedFilesProp, isLoading, selectedManager, setSelectedManager }) => {
  // Comments sidebar state
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  // State for tech packs and loading
  const uploadedFiles = useMemo(() => uploadedFilesProp || [], [uploadedFilesProp]);
  const [isLoadingManagers, setIsLoadingManagers] = useState(true);
  const [isPDFViewerOpen, setIsPDFViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  // Right-pane selection for List view
  const [detailFile, setDetailFile] = useState(null);
  const [selectedBrandManager, setSelectedBrandManager] = useState('');
  const [brandManagers, setBrandManagers] = useState([]);
  // Cache of fileId -> resolved PDF URL for inline rendering
  const [inlinePdfUrls, setInlinePdfUrls] = useState({});

  //Url getting Method
  const getFileUrl = (fileObj) => {
    if (!fileObj) return null;
    
    // If it's already a URL, return it
    if (typeof fileObj === 'string' && 
        (fileObj.startsWith('http') || fileObj.startsWith('blob:'))) {
      return fileObj;
    }

    // Handle both direct key and file object with key property
    const key = fileObj.key || fileObj;
    if (!key) return null;

    // Use the file serving endpoint directly (it will redirect to presigned URL)
    return `${API_BASE}/api/file/${encodeURIComponent(key)}`;
  };

  // Build the best PDF URL for a techpack
  const getBestPdfUrl = (file) => {
    if (!file) {
      console.debug('[getBestPdfUrl] No file provided');
      return null;
    }
    
    let url = null;
    
    if (inlinePdfUrls[file._id]) {
      url = inlinePdfUrls[file._id];
      console.debug('[getBestPdfUrl] Using cached URL:', { fileId: file._id, url });
      return url;
    }
    
    // Try different methods to get the URL
    if (file.s3Key) {
      url = getFileUrl(file.s3Key);
      console.debug('[getBestPdfUrl] Using s3Key:', { s3Key: file.s3Key, url });
    } else if (typeof file.pdfUrl === 'string' && file.pdfUrl) {
      url = file.pdfUrl;
      console.debug('[getBestPdfUrl] Using pdfUrl:', { pdfUrl: file.pdfUrl, url });
    } else if (file.file && file.file.key) {
      url = getFileUrl(file.file);
      console.debug('[getBestPdfUrl] Using file.key:', { fileKey: file.file.key, url });
    } else if (file.url) {
      url = file.url;
      console.debug('[getBestPdfUrl] Using direct URL:', { url });
    }
    
    if (!url) {
      console.warn('[getBestPdfUrl] No valid URL found for file:', {
        fileId: file._id,
        hasS3Key: !!file.s3Key,
        hasPdfUrl: !!file.pdfUrl,
        hasFileKey: !!(file.file && file.file.key),
        fileKeys: Object.keys(file).join(', ')
      });
    }
    
    return url;
  };

  const pdfIframeSrc = (rawUrl) => {
    if (!rawUrl) return null;
    const viewerUrl = `${window.location.origin}/pdfjs/web/viewer.html?file=${encodeURIComponent(rawUrl)}&toolbar=0&embed=1&preview=1#page=1&zoom=page-width`;
    console.debug('[pdfIframeSrc] Generated viewer URL:', { rawUrl, viewerUrl });
    return viewerUrl;
  };

  // Handle file click to open PDF viewer
  const handleFileClick = useCallback(async (file) => {
    try {
      console.log('File clicked:', file);
      // First, fetch the latest version of the file with comments
      const controller = new AbortController();
      const response = await fetch(`${API_BASE}/api/tech-packs/${file._id}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'max-age=30' // Cache for 30 seconds
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch file details: ${response.statusText}`);
      }
      const fileData = await response.json();

      // Use the same file URL generation method as Pantone component
      let pdfUrl = null;
      if (fileData.s3Key) {
        pdfUrl = getFileUrl(fileData.s3Key);
        console.log('Generated PDF URL:', pdfUrl);
      } else if (fileData.pdfUrl) {
        pdfUrl = fileData.pdfUrl;
      }

      if (pdfUrl) {
        const updatedFile = {
          ...fileData,
          pdfUrl: pdfUrl,
          comments: fileData.comments || []
        };
        console.log('Opening PDF viewer with URL:', pdfUrl);
        setSelectedFile(updatedFile);
        setIsPDFViewerOpen(true);
      } else {
        console.error('No PDF URL available for this file. S3 key:', fileData.s3Key);
      }
    } catch (error) {
      console.error('Error loading file details:', error);
      // Fallback to the original file data if there's an error
      if (file.pdfUrl) {
        setSelectedFile({
          ...file,
          comments: file.comments || []
        });
        setIsPDFViewerOpen(true);
      } else {
        console.error('No valid file data available');
      }
    }
  }, []);

  // Open selected techpack in the right detail pane (List view)
  const openInRightPane = useCallback(async (file) => {
    try {
      const controller = new AbortController();
      const response = await fetch(`${API_BASE}/api/tech-packs/${file._id}`, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'max-age=30'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch file details');
      const fileData = await response.json();

      let pdfUrl = null;
      if (fileData.s3Key) {
        pdfUrl = getFileUrl(fileData.s3Key);
      } else if (fileData.pdfUrl) {
        pdfUrl = fileData.pdfUrl;
      } else if (fileData.file && fileData.file.key) {
        pdfUrl = getFileUrl(fileData.file);
      }

      setDetailFile({
        ...fileData,
        pdfUrl: pdfUrl || fileData.pdfUrl || file.pdfUrl || null,
        comments: fileData.comments || []
      });
    } catch (e) {
      // fallback to provided file data
      setDetailFile({ ...file, comments: file.comments || [] });
    }
  }, []);

  

  // Memoized fetch function for brand managers
  const fetchBrandManagers = useCallback(async () => {
    try {
      setIsLoadingManagers(true);
      const res = await fetch(`${API_BASE}/api/brand-managers`);
      if (!res.ok) {
        throw new Error('Failed to fetch brand managers');
      }
      const data = await res.json();
      setBrandManagers(data);
    } catch (error) {
      console.error('Error fetching brand managers:', error);
    } finally {
      setIsLoadingManagers(false);
    }
  }, []);

  // Fetch brand managers on component mount
  useEffect(() => {
    // Only fetch if not already loading and brand managers are not already loaded
    if (!isLoadingManagers && (!brandManagers || brandManagers.length === 0)) {
      fetchBrandManagers();
    }
  }, [fetchBrandManagers, isLoadingManagers, brandManagers]);

  // Add real-time updates via socket
  useEffect(() => {
    const handleTechPackUpdate = (updatedTechPack) => {
      // Find the index of the updated tech pack
      const index = uploadedFiles.findIndex(file => file._id === updatedTechPack._id);
      
      if (index !== -1) {
        // Update the specific tech pack
        const newFiles = [...uploadedFiles];
        newFiles[index] = {
          ...newFiles[index],
          ...updatedTechPack,
          status: updatedTechPack.status?.toUpperCase() || 'DRAFT',
          articleType: updatedTechPack.articletype || 'N/A',
          colour: updatedTechPack.colour || 'N/A',
          gender: updatedTechPack.gender || 'N/A',
          printTechnique: updatedTechPack.printTechnique || 'N/A'
        };
        // setUploadedFiles(newFiles);
      }
    };

    const handleNewComment = ({ techpackId, lineSheetId, comment }) => {
      // Only process tech pack comments, ignore line sheet comments
      if (lineSheetId || !techpackId) {
        return;
      }
      
      // setUploadedFiles(prevFiles => 
      //   prevFiles.map(file => {
      //     if (file._id === techpackId) {
      //       return {
      //         ...file,
      //         comments: [...(file.comments || []), comment]
      //       };
      //     }
      //     return file;
      //   })
      // );
    };

    // Join techpack rooms for all files
    uploadedFiles.forEach(file => {
      if (file._id) {
        socket.emit('join-techpack', file._id);
      }
    });

    // Listen for updates
    socket.on('techpack-updated', handleTechPackUpdate);
    socket.on('new-comment', handleNewComment);
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Clean up socket listeners
    return () => {
      socket.off('techpack-updated', handleTechPackUpdate);
      socket.off('new-comment', handleNewComment);
      socket.off('error');
    };
  }, [uploadedFiles]);

  // Handle connection events
  useEffect(() => {
    socket.on('connect', () => {
      // Connected to server
    });

    socket.on('disconnect', () => {
      // Disconnected from server
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
    });

    return () => {
      // Cleanup socket listeners
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
    };
  }, []);

  // Transform data to match frontend expectations
  const transformedFiles = useMemo(() => {
    return uploadedFiles.map(techpack => ({
      ...techpack,
      // Normalize status to lowercase for display
      status: techpack.status?.toLowerCase() || 'draft',
      // Ensure status is always lowercase for filtering
      _status: techpack.status?.toLowerCase() || 'draft'
    }));
  }, [uploadedFiles]);
  // Add view state
  const [viewMode, setViewMode] = useState('table'); // 'table', 'grid', or 'list'
  const [searchQuery, setSearchQuery] = useState('');
  // State for filters and search
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({
    articleType: [],
    gender: [],
    colour: []
  });
  const [selectedStatuses, setSelectedStatuses] = useState([]);

  // Extract unique values for filters
  const filters = useMemo(() => {
    return {
      articleType: [...new Set(uploadedFiles.map(file => file.articleType))],
      gender: [...new Set(uploadedFiles.map(file => file.gender))],
      colour: [...new Set(uploadedFiles.map(file => file.colour))]
    };
  }, [uploadedFiles]);

  // Statuses should match the case from the database
  const statuses = ['draft', 'submitted', 'accepted', 'rejected'];

  // Handle brand manager selection
  const handleBrandManagerSelect = useCallback((managerName) => {
    setSelectedBrandManager(managerName === selectedBrandManager ? '' : managerName);
  }, [selectedBrandManager]);

  // Derive brand managers & counts from currently loaded tech packs
  const brandManagersWithCounts = useMemo(() => {
    const counts = uploadedFiles.reduce((acc, file) => {
      const name = file.brandManager || 'Unassigned';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      color: `hsl(${Math.abs(name.split('').reduce((hash, char) => char.charCodeAt(0) + ((hash << 5) - hash), 0)) % 360}, 70%, 60%)`
    }));
  }, [uploadedFiles]);

  // Filter files based on selectedManager
  const filteredFiles = useMemo(() => {
    if (!selectedManager) return [];
    let files = uploadedFiles;
    if (selectedManager) {
      files = files.filter(file => file.brandManager === selectedManager);
    }
      const searchLower = searchQuery.toLowerCase();
    return files.filter(file => {
      const matchesSearch = searchQuery === '' || 
        (file.name && file.name.toLowerCase().includes(searchLower)) ||
        (file.articleType && file.articleType.toLowerCase().includes(searchLower)) ||
        (file.brandManager && file.brandManager.toLowerCase().includes(searchLower));
      const statusMatch = selectedStatuses.length === 0 ||
        selectedStatuses.some(status => file.status && file.status.toLowerCase() === status.toLowerCase());
      const filterMatch = Object.entries(selectedFilters).every(([field, values]) => {
        if (values.length === 0) return true;
        return values.includes(file[field]);
      });
      return matchesSearch && statusMatch && filterMatch;
    });
  }, [uploadedFiles, searchQuery, selectedManager, selectedStatuses, selectedFilters]);

  // Initialize right pane selection when switching to list view or when list changes
  useEffect(() => {
    if (viewMode === 'list') {
      if (filteredFiles.length > 0) {
        if (!detailFile || !filteredFiles.some(f => f._id === detailFile._id)) {
          openInRightPane(filteredFiles[0]);
        }
      } else {
        setDetailFile(null);
      }
    }
  }, [viewMode, filteredFiles, openInRightPane]);

  // Prefetch inline PDF URLs for currently visible files in grid/list
  useEffect(() => {
    const abort = new AbortController();
    const fetchUrlFor = async (file) => {
      try {
        // Skip if already cached
        if (inlinePdfUrls[file._id]) return;
        const res = await fetch(`${API_BASE}/api/tech-packs/${file._id}`, { signal: abort.signal });
        if (!res.ok) return;
        const data = await res.json();
        let url = null;
        if (data.s3Key) url = getFileUrl(data.s3Key);
        if (!url && data.pdfUrl) url = data.pdfUrl;
        if (!url && data.file && data.file.key) url = getFileUrl(data.file);
        if (url) {
          setInlinePdfUrls(prev => ({ ...prev, [file._id]: url }));
        }
      } catch (e) {
        // ignore
      }
    };
    // Only prefetch when in grid or list view where inline previews are shown
    if (['grid', 'list'].includes(viewMode)) {
      // In grid view, warm up a subset to keep things snappy.
      // In list view, warm up all visible items so multiple PDFs render inline.
      const targets = viewMode === 'grid' ? filteredFiles.slice(0, 12) : filteredFiles;
      targets.forEach(fetchUrlFor);
    }
    return () => abort.abort();
  }, [filteredFiles, viewMode, API_BASE]);

  // Aggressive prefetch for ALL visible items when switching to Grid/List view
  useEffect(() => {
    if (viewMode !== 'grid' && viewMode !== 'list') return;
    let cancelled = false;
    const controller = new AbortController();

    const concurrency = 12;
    const queue = [...filteredFiles];

    const runNext = async () => {
      if (cancelled) return;
      const file = queue.shift();
      if (!file) return;
      // Skip if already cached
      if (!inlinePdfUrls[file._id]) {
        try {
          const res = await fetch(`${API_BASE}/api/tech-packs/${file._id}`, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            let url = null;
            if (data.s3Key) url = getFileUrl(data.s3Key);
            if (!url && data.pdfUrl) url = data.pdfUrl;
            if (!url && data.file && data.file.key) url = getFileUrl(data.file);
            if (url) {
              setInlinePdfUrls(prev => ({ ...prev, [file._id]: url }));
            }
          }
        } catch (e) {
          // ignore per item
        }
      }
      if (!cancelled && queue.length) await runNext();
    };

    // Kick off N workers
    const workers = Array.from({ length: Math.min(concurrency, filteredFiles.length) }, () => runNext());
    Promise.all(workers).catch(() => {});

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewMode, filteredFiles, API_BASE, inlinePdfUrls]);

  // Toggle filter selection
  const toggleFilter = useCallback((type, value) => {
    setSelectedFilters(prev => ({
      ...prev,
      [type]: prev[type].includes(value)
        ? prev[type].filter(item => item !== value)
        : [...prev[type], value]
    }));
  }, []);

  // Toggle status selection
  const toggleStatus = useCallback((status) => {
    setSelectedStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACCEPTED':
        return 'bg-green-100 text-green-800';
      case 'SUBMITTED':
        return 'bg-yellow-100 text-yellow-800';
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'REJECTED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading tech packs...</p>
      </div>
    );
  }

  // Render empty state if no files
  if (!uploadedFiles.length) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center p-6">
        {/* Empty State Icon */}
        <div className="w-32 h-32 mb-6">
        <img
            src="./color-swatch.png"
            alt="No Assortment Plans"
            className="w-32 h-32 mb-4 opacity-70"
          />
        </div>

        {/* Empty State Text */}
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          No Tech Packs Yet
        </h2>
        <p className="text-gray-600 text-center mb-8 max-w-md">
          Start by uploading your first tech pack to manage designs,
          track status, and collaborate with your team.
        </p>

        {/* Upload Button */}
        <button
          onClick={() => setShowUploadForm(true)}
          className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
        >
          Upload Tech Packs
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Search and Filter Bar */}
      <div className="flex-none bg-white px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="w-full">
            {/* Search */}
            <div className="w-full max-w-md relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search Techpack"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Filters and View Options */}
          <div className="flex items-center space-x-4">
            {/* Comments Button */}
            <button
              onClick={() => setShowCommentsSidebar(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 mr-2"
            >
              <FaComment className="mr-2" />
              Comments
            </button>
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg className="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              FILTER
              {Object.values(selectedFilters).some(arr => arr.length > 0) && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {Object.values(selectedFilters).reduce((acc, arr) => acc + arr.length, 0)}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsStatusOpen(!isStatusOpen)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              STATUS
              <svg className="h-5 w-5 ml-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {selectedStatuses.length > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {selectedStatuses.length}
                </span>
              )}
            </button>

            {/* View Toggle Buttons */}
            <div className="flex items-center space-x-2 border-l border-gray-200 pl-4">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                title="List view"
              >
                <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg ${viewMode === 'grid' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                title="Grid view"
              >
                <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-lg ${viewMode === 'table' ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                title="Table view"
              >
                <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Status Dropdowns */}
      {isFilterOpen && (
        <div className="absolute right-0 mt-2 w-full max-w-xs sm:w-80 bg-white rounded-lg shadow-lg z-10 border border-gray-200">
          <div className="p-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Article Type</h3>
              <div className="space-y-2">
                {filters.articleType.map(type => (
                  <label key={type} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedFilters.articleType.includes(type)}
                      onChange={() => toggleFilter('articleType', type)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">{type}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Gender</h3>
              <div className="space-y-2">
                {filters.gender.map(gender => (
                  <label key={gender} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedFilters.gender.includes(gender)}
                      onChange={() => toggleFilter('gender', gender)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">{gender}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Colour</h3>
              <div className="space-y-2">
                {filters.colour.map(colour => (
                  <label key={colour} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedFilters.colour.includes(colour)}
                      onChange={() => toggleFilter('colour', colour)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-700">{colour}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {isStatusOpen && (
        <div className="absolute right-0 mt-2 w-full max-w-xs sm:w-48 bg-white rounded-lg shadow-lg z-10 border border-gray-200">
          <div className="p-2">
            {statuses.map(status => (
              <label key={status} className="flex items-center px-3 py-2 hover:bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  checked={selectedStatuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">{status}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Content based on view mode */}
      <div className="flex-1 overflow-auto">
        {selectedManager && (
          <div className="flex items-center text-sm text-gray-500 mb-4">
            <span
              onClick={() => setSelectedManager && setSelectedManager('')}
              className="cursor-pointer hover:underline"
            >
              All Brand Managers
            </span>
            <span className="mx-1">/</span>
            <span className="font-semibold text-gray-700">{selectedManager}</span>
          </div>
        )}
        {viewMode === 'table' && (
          <div className="w-full overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="w-8 px-6 py-3 bg-gray-50 border-b border-gray-200">
                  <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Description</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Article Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Colour</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Fit</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Gender</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Print Technique</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredFiles.map((upload, index) => (
                <tr 
                  key={index} 
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => handleFileClick(upload)}
                >
                  <td className="px-6 py-4 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.description}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.articleType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.colour}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.fit}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.gender}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{upload.printTechnique}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(upload.status)}`}>
                      {upload.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {upload.thumbnail?.url ? (
                      <img 
                        src={upload.thumbnail.url} 
                        alt={`Thumbnail for ${upload.name || 'PDF'}`}
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => {
                          // Fallback to PDF icon if thumbnail fails to load
                          e.target.onerror = null;
                          e.target.src = '/pdf-icon.png';
                        }}
                      />
                    ) : (
                      <div className="text-gray-300">
                        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
        {viewMode === 'grid' && (
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFiles.map((file, index) => (
              <div 
                key={index} 
                className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200 relative group cursor-pointer"
                onClick={() => handleFileClick(file)}
              >
                {/* PDF Preview Section (Inline PDF via pdf.js like Pantone Techpack tab) */}
                <div className="bg-gray-50 relative h-72">
                  {(() => {
                    const url = getBestPdfUrl(file);
                    console.debug('[PastUploads][Grid] URL for inline PDF:', { id: file._id, url });
                    if (url) {
                      return (
                        <>
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400">
                            Loading preview…
                          </div>
                          <iframe
                            src={pdfIframeSrc(url)}
                            title={`PDF ${file.name || ''}`}
                            className="w-full h-full border-0"
                          />
                          {/* Fallback direct embed in case viewer fails visually */}
                          <noscript>
                            <iframe src={url} title={`PDF ${file.name || ''}`} className="w-full h-full border-0" />
                          </noscript>
                          <div className="absolute bottom-1 left-0 right-0 text-center text-[11px] text-gray-500">
                            Having trouble viewing the PDF?{' '}
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open in new tab</a>
                          </div>
                        </>
                      );
                    }
                    return (
                      <div className="w-full h-full flex items-center justify-center p-2">
                        <img
                          src={file.thumbnail?.url || '/pdf-icon.png'}
                          alt={`Preview for ${file.name || 'Techpack'}`}
                          className="max-w-full max-h-full object-contain opacity-80"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = '/pdf-icon.png';
                          }}
                        />
                      </div>
                    );
                  })()}
                  {/* Status Badge - Positioned at top */}
                  <div className="absolute top-2 right-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusClass(file.status)}`}>
                      {file.status}
                      {file.status === 'REJECTED' && (
                        <span className="ml-2 text-red-800">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          0
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                {/* Thumbnail (only when no inline PDF URL available) */}
                {(() => {
                  const inlineUrl = getBestPdfUrl(file);
                  if (inlineUrl) return null;
                  return (
                    <div className="h-48 bg-gray-50 flex items-center justify-center overflow-hidden">
                      {file.thumbnail?.url ? (
                        <img 
                          src={file.thumbnail.url} 
                          alt={`Thumbnail for ${file.name || 'PDF'}`}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            // Fallback to PDF icon if thumbnail fails to load
                            e.target.onerror = null;
                            e.target.src = '/pdf-icon.png';
                          }}
                        />
                      ) : (
                        <div className="flex flex-col items-center">
                          <svg className="w-16 h-16 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm text-gray-400">No preview available</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-medium text-gray-900 truncate">{file.name || 'Untitled'}</h3>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusClass(file.status)}`}>
                      {file.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {file.articleType && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-600">
                        {file.articleType}
                      </span>
                    )}
                    {file.colour && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-600">
                        {file.colour}
                      </span>
                    )}
                    {file.comments && file.comments.length > 0 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-blue-50 text-xs text-blue-700">
                        <FaComment className="mr-1" />
                        {file.comments.length} {file.comments.length === 1 ? 'Comment' : 'Comments'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {viewMode === 'list' && (
          <div className="flex h-[calc(100vh-200px)] relative">
            {/* Left: list of techpacks */}
            <div className="w-1/3 overflow-y-auto border-r border-gray-200 pr-2">
              <div className="divide-y divide-gray-200">
                {filteredFiles.map((file, index) => {
                  const active = detailFile?._id === file._id;
                  return (
                    <div 
                      key={index}
                      className={`px-4 py-3 cursor-pointer space-y-2 ${active ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}
                      onClick={() => openInRightPane(file)}
                    >
                      <div className="flex justify-between items-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${getStatusClass(file.status)}`}>
                          {file.status}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs text-gray-500 truncate">{file.articleType || '—'}</div>
                        <div className="font-medium text-gray-900 truncate">{file.name || 'Untitled'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: detail panel */}
            <div className="w-2/3 overflow-y-auto p-4 absolute right-0 top-0 bottom-0 pr-8">
              {detailFile ? (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold text-gray-900 truncate">{detailFile.name || 'Untitled'}</h2>
                      <div className="text-sm text-gray-500">{detailFile.articleType || '—'} {detailFile.colour ? `• ${detailFile.colour}` : ''} {detailFile.fit ? `• ${detailFile.fit}` : ''}</div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {detailFile.articleType && (<span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{detailFile.articleType}</span>)}
                        {detailFile.colour && (<span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{detailFile.colour}</span>)}
                        {detailFile.fit && (<span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{detailFile.fit}</span>)}
                        {detailFile.gender && (<span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{detailFile.gender}</span>)}
                        {detailFile.printTechnique && (<span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">{detailFile.printTechnique}</span>)}
                      </div>
                    </div>
                    <span className={`ml-3 px-3 py-1 rounded-full text-xs font-semibold ${getStatusClass(detailFile.status)}`}>{detailFile.status}</span>
                  </div>

                  {/* Preview */}
                  <div className="mt-4 bg-gray-50 rounded border overflow-hidden" style={{ minHeight: '420px' }}>
                    {(() => {
                      const url = getBestPdfUrl(detailFile);
                      if (url) {
                        return (
                          <iframe src={url} title={`PDF ${detailFile.name || ''}`} className="w-full h-[520px] border-0" />
                        );
                      }
                      return (
                        <div className="w-full h-[520px] flex items-center justify-center text-gray-400">No preview available</div>
                      );
                    })()}
                  </div>

                  {/* Description & Comments */}
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-1">Description</div>
                      <div className="px-3 py-2 bg-gray-50 rounded text-sm text-gray-900 min-h-[60px]">{detailFile.description || 'No description available'}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2 flex items-center"><FaCommentAlt className="mr-2 text-blue-500" />Comments ({detailFile.comments?.length || 0})</div>
                      <div className="space-y-3 max-h-40 overflow-y-auto pr-2 mb-2">
                        {detailFile.comments?.map((comment, idx) => (
                          <div key={idx} className="bg-blue-50 p-3 rounded-lg">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-medium text-blue-700">{comment.user || 'User'}</span>
                              <span className="text-xs text-gray-500">{new Date(comment.timestamp || comment.createdAt || Date.now()).toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{comment.text || comment.comment}</p>
                          </div>
                        )) || (<p className="text-sm text-gray-500 italic">No comments yet</p>)}
                      </div>
                      {/* Add new comment */}
                      {detailFile._id && (
                        <CommentForm techpackId={detailFile._id} onCommentAdded={() => openInRightPane(detailFile)} />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">Select a tech pack from the list to view details</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* PDF Viewer Modal */}
      {isPDFViewerOpen && selectedFile && (
        <PDFViewer
          file={selectedFile}
          onClose={() => {
            setIsPDFViewerOpen(false);
            setSelectedFile(null);
          }}
        />
      )}

      {/* Comments Sidebar */}
      <ManagerCommentsSidebar
        open={showCommentsSidebar}
        onClose={() => setShowCommentsSidebar(false)}
        manager={selectedManager}
        records={uploadedFiles}
        type="Tech Pack"
        onRecordClick={(record) => {
          setSelectedFile(record);
          setShowCommentsSidebar(false);
        }}
      />
    </div>
  );
});

export default PastUploads; 