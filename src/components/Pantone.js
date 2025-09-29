import React, { useState, useEffect, useCallback, useRef } from 'react';
import socket from '../socket';
import { API_BASE } from '../config';
import CommentSection from './CommentSection';
import Header from './Header';
import FilePreviewModal from './FilePreviewModal';
import ManagerCommentsSidebar from './ManagerCommentsSidebar';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker path for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const Pantone = () => {
  const [allRecords, setAllRecords] = useState(null); // all pantone records
  const [managerGroups, setManagerGroups] = useState([]); // [{ manager, count, lastDate }]
  const [selectedManager, setSelectedManager] = useState(null);
  const [managerRecords, setManagerRecords] = useState([]); // records for selected manager
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('pantone'); // 'pantone' or 'techpack'
  const [techpacks, setTechpacks] = useState([]); // techpack list
  const [selectedTechpackDetail, setSelectedTechpackDetail] = useState(null); // full techpack
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [allManagerComments, setAllManagerComments] = useState([]);
  const [pdfUrls, setPdfUrls] = useState({}); // Store PDF URLs for rendering
  const [isFileModalOpen, setIsFileModalOpen] = useState(false);
  const [modalFileUrl, setModalFileUrl] = useState(null);
  const [modalFileType, setModalFileType] = useState(null);
  const [modalFileName, setModalFileName] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });

  // Memoize the filtered and sorted manager groups
  const getSortedAndFilteredManagerGroups = useCallback(() => {
    if (!allRecords) return [];
    
    // Group by manager
    const grouped = {};
    allRecords.forEach(item => {
      if (!grouped[item.manager]) grouped[item.manager] = [];
      grouped[item.manager].push(item);
    });
    
    // Filter by search term
    const filteredGroups = Object.entries(grouped)
      .filter(([manager]) => 
        manager.toLowerCase().includes(searchTerm.toLowerCase()) ||
        managerGroups.some(g => 
          g.manager === manager && 
          g.count.toString().includes(searchTerm)
        )
      )
      .map(([manager, items]) => ({
        manager,
        count: items.length,
        lastDate: items.length > 0 ? new Date(items[items.length - 1].createdAt).toISOString().slice(0, 10) : '',
        items
      }));
    
    // Sort groups
    return [...filteredGroups].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [allRecords, searchTerm, sortConfig, managerGroups]);

  // Ensure selectedManager is set when opening the sidebar
  const openCommentsSidebar = () => {
    if (!selectedManager && selectedRecord && selectedRecord.manager) {
      setSelectedManager(selectedRecord.manager);
    }
    setShowCommentsSidebar(true);
  };

  // Helper function to get file URL from S3
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

    // Use the file serving endpoint
    return `${API_BASE}/api/file/${encodeURIComponent(key)}`;
  };

  // Function to load PDF URL for rendering
  const loadPdfUrl = async (fileObj, recordId) => {
    if (!fileObj) return;
    
    try {
      const url = getFileUrl(fileObj);
      if (url) {
        setPdfUrls(prev => ({
          ...prev,
          [recordId]: url
        }));
      }
    } catch (error) {
      console.error('Error loading PDF URL:', error);
    }
  };

  // Load PDF URLs when selectedRecord changes
  useEffect(() => {
    if (selectedRecord?.file && selectedRecord.file.type === 'application/pdf') {
      loadPdfUrl(selectedRecord.file, selectedRecord._id);
    }
  }, [selectedRecord]);

  // Function to handle file preview in modal
  const handleFilePreview = (fileObj, fileName) => {
    if (!fileObj) return;
    
    const url = getFileUrl(fileObj);
    if (url) {
      setModalFileUrl(url);
      setModalFileType(fileObj.type || 'application/octet-stream');
      setModalFileName(fileName || 'File Preview');
      setIsFileModalOpen(true);
    }
  };

  // Refs to track if data has been loaded
  const hasFetchedPantone = useRef(false);
  const hasFetchedTechpacks = useRef(false);

  // Memoized function to fetch pantone data
  const fetchPantoneData = useCallback(async () => {
    // Skip if already loaded
    if (hasFetchedPantone.current) return;
    hasFetchedPantone.current = true;
    
    try {
      const response = await fetch(`${API_BASE}/api/pantone`);
      if (!response.ok) {
        throw new Error('Failed to fetch pantone data');
      }
      const data = await response.json();
      
      // Group by manager
      const grouped = data.reduce((acc, item) => {
        if (!acc[item.manager]) acc[item.manager] = [];
        acc[item.manager].push(item);
        return acc;
      }, {});
      
      const managerGroupsData = Object.entries(grouped).map(([manager, items]) => ({
        manager,
        count: items.length,
        lastDate: (() => {
          const latest = items[items.length - 1];
          return latest?.createdAt ? new Date(latest.createdAt).toISOString().slice(0, 10) : '';
        })(),
      }));
      
      // Batch state updates
      setAllRecords(data);
      setManagerGroups(managerGroupsData);
      
    } catch (error) {
      console.error('Error fetching pantone data:', error);
      setAllRecords([]);
    }
  }, [API_BASE]); // Added API_BASE to dependencies

  // Memoized function to fetch techpacks
  const fetchTechpacks = useCallback(async () => {
    // Skip if already loaded
    if (hasFetchedTechpacks.current) return;
    hasFetchedTechpacks.current = true;
    
    try {
      const response = await fetch(`${API_BASE}/api/tech-packs`);
      const data = await response.ok ? await response.json() : [];
      setTechpacks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching techpacks:', error);
      setTechpacks([]);
    }
  }, [API_BASE]); // Added API_BASE to dependencies
  
  // Fetch initial data once on mount
  useEffect(() => {
    fetchPantoneData();
    fetchTechpacks();
    
    // Cleanup function
    return () => {
      hasFetchedPantone.current = false;
      hasFetchedTechpacks.current = false;
    };
  }, [fetchPantoneData, fetchTechpacks]);

  // Fetch selected techpack details when Techpack tab is opened
  useEffect(() => {
    const id = selectedRecord?.selectedTechpack;
    if (activeTab !== 'techpack' || !id) {
      setSelectedTechpackDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tech-packs/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSelectedTechpackDetail(data);
      } catch (_) {
        if (!cancelled) setSelectedTechpackDetail(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, selectedRecord?.selectedTechpack]);

  // Effect to fetch and aggregate all comments for the selected manager
  useEffect(() => {
    if (!selectedManager) {
      setAllManagerComments([]);
      return;
    }

    const fetchAllComments = async () => {
      try {
        // Fetch all records for the current manager
  const res = await fetch(`${API_BASE}/api/pantone/manager/${selectedManager}`, {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        if (res.ok) {
          const records = await res.json();
          
          // Flatten all comments from all records and add recordId to each comment
          const allComments = records.flatMap(record => {
            const recordComments = record.comments || [];
            return recordComments.map(comment => ({
              ...comment,
              recordId: record._id
            }));
          }).sort((a, b) => 
            new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt)
          );
          
          setAllManagerComments(allComments);
          
          // Update manager records
          setManagerRecords(records);
          
          // Update selected record if it exists in the updated records
          if (selectedRecord) {
            const updatedRecord = records.find(r => r._id === selectedRecord._id);
            if (updatedRecord) {
              setSelectedRecord(updatedRecord);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching manager comments:', error);
      }
    };

    // Initial fetch
    fetchAllComments();
    
    // Set up polling
    const intervalId = setInterval(fetchAllComments, 10000); // Poll every 10 seconds
    
    return () => clearInterval(intervalId);
  }, [selectedManager, selectedRecord?._id]);

  useEffect(() => {
    if (selectedRecord) {
      socket.emit('join_room', selectedRecord._id);
    }
    return () => {
      if (selectedRecord) {
        socket.emit('leave_room', selectedRecord._id);
      }
    };
  }, [selectedRecord]);

  useEffect(() => {
    const handleRecordUpdate = (updatedRecord) => {
      console.log('Received record update:', updatedRecord);
      
      // Functional state updates to avoid stale state
      const updater = (prevState) => {
        if (!prevState) return [];
        return prevState.map(rec => {
          if (rec._id === updatedRecord._id) {
            console.log('Updating record:', rec._id);
            // Preserve any local state that shouldn't be overwritten
            return {
              ...updatedRecord,
              // Add any local state that should be preserved
              isSelected: rec.isSelected,
              isExpanded: rec.isExpanded
            };
          }
          return rec;
        });
      };
      
      setAllRecords(updater);
      setManagerRecords(updater);
      
      // Update the selected record if it's the one being updated
      setSelectedRecord(prev => {
        if (prev && prev._id === updatedRecord._id) {
          console.log('Updating selected record with comments:', updatedRecord.files?.[0]?.comments);
          return {
            ...updatedRecord,
            // Preserve any local state from the selected record
            isSelected: prev.isSelected,
            isExpanded: prev.isExpanded
          };
        }
        return prev;
      });
    };

    // Set up socket event listeners
    socket.on('record_updated', handleRecordUpdate);
    socket.on('connect', () => {
      console.log('Socket connected');
      // Rejoin room if we have a selected record
      if (selectedRecord) {
        socket.emit('join_room', selectedRecord._id);
      }
    });
    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return () => {
      // Clean up event listeners
      socket.off('record_updated', handleRecordUpdate);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('error');
    };
  }, [selectedRecord?._id]); // Only recreate if selectedRecord._id changes

  const handleCommentSubmit = async (recordId, fileId, comment) => {
    try {
      // If this is an optimistic update or error, update the UI directly
      if (comment.isOptimistic || comment.isError) {
        setSelectedRecord(prev => {
          if (!prev) return prev;
          
          const updatedFiles = prev.files.map(file => {
            if (file._id !== fileId) return file;
            
            // If this is an error, remove the optimistic comment
            if (comment.isError) {
              const filteredComments = (file.comments || []).filter(
                c => c._id !== comment._id
              );
              return { ...file, comments: filteredComments };
            }
            
            // Otherwise, add or update the comment
            const existingIndex = file.comments?.findIndex(c => c._id === comment._id) ?? -1;
            
            if (existingIndex >= 0) {
              // Update existing comment
              const updatedComments = [...file.comments];
              updatedComments[existingIndex] = comment;
              return { ...file, comments: updatedComments };
            } else {
              // Add new comment
              return { 
                ...file, 
                comments: [...(file.comments || []), comment] 
              };
            }
          });
          
          return { ...prev, files: updatedFiles };
        });
        
        return;
      }
      
      // For regular comments, the actual update will come through the socket.io update
  await fetch(`${API_BASE}/api/pantone/${recordId}/files/${fileId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment),
      });
    } catch (error) {
      console.error('Failed to submit comment:', error);
      throw error; // Re-throw to be handled by the CommentSection
    }
  };

  // --- Manager detail view ---
  if (selectedManager && managerRecords.length > 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <ManagerCommentsSidebar
          open={showCommentsSidebar}
          onClose={() => setShowCommentsSidebar(false)}
          manager={selectedManager}
          records={allRecords}
          type="Pantone"
          onRecordClick={(record) => {
            setSelectedRecord(record);
            setShowCommentsSidebar(false);
          }}
        />
        <div className="flex-none bg-white border-b border-gray-200">
          <Header />
        </div>
        <div className="flex-1 overflow-auto bg-gray-50 p-6">
          <div className="flex items-center text-sm text-gray-500 mb-2">
            <button
              onClick={() => { setSelectedManager(null); setSelectedRecord(null); }}
              className="cursor-pointer hover:text-gray-700"
            >
              All Sourcing managers
            </button>
            <span className="mx-1">/</span>
            <span className="font-semibold text-gray-700">{selectedManager}</span>
          </div>
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Pantones</h1>
          </div>
          <div className="bg-white p-8 rounded-lg shadow-sm min-h-[60vh]">
            <div className="mb-6">
              <div className="md:flex-row md:items-center md:justify-between mb-4 gap-4">
                <div className="flex justify-between gap-4 flex-wrap">
                  {/* Search Input */}
                  <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Search Pantone Id.."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  {/* Sort Dropdown */}
                  <div className="relative">
                    <select
                      className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={sortConfig.key}
                      onChange={(e) => requestSort(e.target.value)}
                    >
                      <option value="pantoneNumber">Sort by Number</option>
                      <option value="createdAt">Sort by Date</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  </div>
                  {/* Right side icon buttons */}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      className="p-2 rounded-md border border-gray-200 bg-yellow-400/70 hover:bg-yellow-400"
                      title="Grid View"
                      type="button"
                    >
                      <svg className="w-5 h-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 6v-6h6v6h-6z"/></svg>
                    </button>
                    <button
                      className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white text-blue-700 font-medium hover:bg-blue-50"
                      onClick={() => setShowCommentsSidebar(true)}
                      type="button"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10a2 2 0 012-2h2M15 3h-4a2 2 0 00-2 2v3a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2z" />
                      </svg>
                      View Comments
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col md:flex-row gap-6">
              {/* Left: List of Pantone Numbers */}
              <div className="w-full md:w-72 bg-white rounded-lg p-0 flex flex-col gap-0 border border-gray-200 max-h-[60vh] overflow-y-auto">
                {managerRecords.map((rec) => {
                  const isActive = selectedRecord && selectedRecord._id === rec._id;
                  return (
                    <button
                      key={rec._id}
                      className={`text-left px-4 py-3 text-sm flex items-center justify-between border-l-4 ${isActive ? 'bg-blue-50 border-blue-600 font-semibold' : 'hover:bg-gray-50 border-transparent'} transition-colors`}
                      onClick={() => setSelectedRecord(rec)}
                      type="button"
                    >
                      <span className="truncate font-mono">{rec.pantoneNumber}</span>
                      {rec.moreCount ? (
                        <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">+{rec.moreCount} more</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {/* Center: Details with Tabs */}
              {selectedRecord && (
                <div className="flex-1 bg-white rounded-lg p-6 border border-gray-100 flex flex-col gap-2 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="text-xl font-bold font-mono">{selectedRecord.pantoneNumber}</div>
                      {selectedRecord.moreCount ? (
                        <span className="px-2 py-0.5 text-xs rounded-md bg-gray-100 border border-gray-200 text-gray-600">+{selectedRecord.moreCount} more</span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <button className="border px-3 py-1 rounded text-blue-700 border-blue-200 hover:bg-blue-50">View History</button>
                      
                    </div>
                  </div>
                  <div className="flex gap-6 mb-4 overflow-x-auto">
                    <button
                      className={`font-semibold pb-1 ${activeTab === 'pantone' ? 'border-b-2 border-blue-600' : 'text-gray-400'}`}
                      onClick={() => setActiveTab('pantone')}
                    >Pantone Details</button>
                    <button
                      className={`font-semibold pb-1 ${activeTab === 'techpack' ? 'border-b-2 border-blue-600' : 'text-gray-400'}`}
                      onClick={() => setActiveTab('techpack')}
                    >Tech pack Details</button>
                  </div>
                  {activeTab === 'pantone' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2"><span className="text-gray-400">Pantone ID</span><span className="font-mono">{selectedRecord._id}</span></div>
                        <div className="flex items-center gap-2"><span className="text-gray-400">Vendor ID</span><span className="font-mono">X987654</span></div>
                        <div className="flex items-center gap-2"><span className="text-gray-400">Season</span><span>{selectedRecord.season}</span></div>
                        <div className="flex items-center gap-2"><span className="text-gray-400">Color Name</span><span>Griffin</span></div>
                        <div className="flex items-center gap-2"><span className="text-gray-400">Submitted on</span><span>{new Date(selectedRecord.createdAt).toLocaleString()}</span></div>
                        <div className="flex items-center gap-2"><span className="text-gray-400">Submitted to</span><span>{selectedRecord.manager} (Sourcing manager)</span></div>
                      </div>
                      {/* Right: Lab Dips panel with preview inside */}
                      <div className="flex flex-col gap-3 w-full">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">Lab Dips</div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553 4.553a1 1 0 01-1.414 1.414L13.586 11.9M10 14a4 4 0 100-8 4 4 0 000 8z"/></svg>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553 4.553a1 1 0 01-1.414 1.414L13.586 11.9M10 14a4 4 0 100-8 4 4 0 000 8z"/></svg>
                          </div>
                        </div>
                        <div className="w-full min-h-[18rem] rounded border border-gray-200 bg-gray-50 p-2 flex items-center justify-center">
                          {selectedRecord.file ? (
                            <div className="w-full cursor-pointer" onClick={() => handleFilePreview(selectedRecord.file, `Pantone ${selectedRecord.pantoneNumber} ${selectedRecord.file.type === 'application/pdf' ? 'PDF' : 'Image'}`)}>
                              {selectedRecord.file.type === 'application/pdf' ? (
                                pdfUrls[selectedRecord._id] ? (
                                  <iframe
                                    src={`${window.location.origin}/pdfjs/web/viewer.html?file=${encodeURIComponent(pdfUrls[selectedRecord._id])}`}
                                    className="w-full h-72 border-0 rounded"
                                    title="PDF Viewer"
                                  />
                                ) : (
                                  <div className="w-full h-72 flex items-center justify-center text-gray-500">Loading PDF...</div>
                                )
                              ) : selectedRecord.file.type?.startsWith('image/') ? (
                                <img
                                  src={getFileUrl(selectedRecord.file)}
                                  alt={`Pantone ${selectedRecord.pantoneNumber}`}
                                  className="max-w-full max-h-72 object-contain rounded"
                                  onError={(e) => {
                                    console.error('Error loading image:', e.target.src);
                                  }}
                                />
                              ) : (
                                <div className="w-full h-64 flex items-center justify-center text-gray-400">Unsupported file type</div>
                              )}
                              <div className="text-xs text-center text-gray-500 mt-1">Click to view full screen</div>
                            </div>
                          ) : (
                            <div className="w-full h-64 flex items-center justify-center text-gray-400">No files available</div>
                          )}
                        </div>
                        {/* Comments Section */}
                        <div className="w-full mt-2">
                          <h4 className="font-medium mb-2">Comments</h4>
                          <CommentSection
                            recordId={selectedRecord._id}
                            file={selectedRecord}
                            endpoint="pantone"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {activeTab === 'techpack' && (
                    (() => {
                      const techpack = (selectedTechpackDetail) || techpacks.find(tp => tp._id === selectedRecord.selectedTechpack);
                      if (!techpack) {
                        return (
                          <div className="p-8 text-center text-gray-400">
                            <div className="text-lg font-semibold mb-2">Techpack Details</div>
                            <div>No techpack details found.</div>
                          </div>
                        );
                      }
                      return (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2"><span className="text-gray-400">Name</span><span>{techpack.name}</span></div>
                            <div className="flex items-center gap-2"><span className="text-gray-400">Description</span><span>{techpack.description}</span></div>
                            <div className="flex items-center gap-2"><span className="text-gray-400">Article Type</span><span>{techpack.articletype}</span></div>
                            <div className="flex items-center gap-2"><span className="text-gray-400">Colour</span><span>{techpack.colour}</span></div>
                            <div className="flex items-center gap-2"><span className="text-gray-400">Fit</span><span>{techpack.fit}</span></div>
                            <div className="flex items-center gap-2"><span className="text-gray-400">Gender</span><span>{techpack.gender}</span></div>
                            <div className="flex items-center gap-2"><span className="text-gray-400">Print Technique</span><span>{techpack.printtechnique}</span></div>
                          </div>
                          <div className="flex flex-col gap-2 items-center w-full">
                            <div className="font-semibold mb-2">Techpack Files</div>
                            {(() => {
                              // Prefer presigned pdfUrl
                              if (typeof techpack.pdfUrl === 'string' && techpack.pdfUrl) {
                                return (
                                  <div className="w-full">
                                    <div className="border rounded overflow-hidden">
                                      <iframe
                                        src={techpack.pdfUrl}
                                        className="w-full h-96 border-0"
                                        title="Techpack PDF"
                                      />
                                    </div>
                                    <div className="text-xs text-center text-gray-500 mt-2">
                                      Having trouble viewing the PDF?{' '}
                                      <a href={techpack.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open in new tab</a>
                                    </div>
                                  </div>
                                );
                              }
                              // Fallbacks: file object, s3Key, legacy previewUrl
                              const fileObj = techpack.file;
                              const urlFromFile = fileObj ? getFileUrl(fileObj) : null;
                              const urlFromKey = techpack.s3Key ? `${API_BASE}/api/file/${encodeURIComponent(techpack.s3Key)}` : null;
                              const preview = typeof techpack.previewUrl === 'string' ? techpack.previewUrl : null;
                              const chosenUrl = urlFromFile || urlFromKey || preview;
                              if (chosenUrl) {
                                return (
                                  <div className="w-full flex justify-center">
                                    <img
                                      src={chosenUrl}
                                      alt={techpack.name}
                                      className="max-w-full max-h-96 object-contain border rounded hover:opacity-90 transition-opacity"
                                      style={{ maxWidth: '100%', maxHeight: '384px' }}
                                    />
                                  </div>
                                );
                              }
                              return (
                                <div className="w-full h-64 flex items-center justify-center bg-gray-100 rounded border border-gray-200">
                                  <span className="text-gray-400">No files available</span>
                                </div>
                              );
                            })()}
                            {/* Comments Section */}
                            <div className="w-full mt-4">
                              <h4 className="font-medium mb-2">Comments</h4>
                              <CommentSection
                                recordId={selectedRecord._id}
                                file={selectedRecord}
                                endpoint="pantone"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
    );
  }


  // Handle sort request
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // --- Manager cards ---
  return (
    <>
      <ManagerCommentsSidebar
        open={showCommentsSidebar}
        onClose={() => setShowCommentsSidebar(false)}
        manager={selectedManager}
        records={allRecords}
        type="Pantone"
        onRecordClick={(record) => {
          setSelectedRecord(record);
          setShowCommentsSidebar(false);
        }}
      />
      <div className="h-screen flex flex-col">
        <div className="flex-none bg-white border-b border-gray-200">
          <Header />
        </div>
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-1">Pantones</h1>
              <p className="text-gray-500">Track the status and progress of the Pantones</p>
            </div>
          </div>
        <div className="bg-white p-8 rounded-lg shadow-sm min-h-[60vh]">
        <div className="bg-gray-50 rounded-lg p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1 flex items-center bg-white rounded-md border border-gray-200 px-3 py-2">
              <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"></path>
              </svg>
              <input
                type="text"
                placeholder="Search managers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 outline-none bg-transparent"
              />
            </div>
            <button className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-md bg-white text-gray-700 font-medium">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M6 6h12M9 14h6" /></svg>
              SORT
            </button>
          </div>
          {/* Manager Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {getSortedAndFilteredManagerGroups().map((group, index) => (
                <div
                  key={group.manager}
                  className="bg-white rounded-lg shadow p-6 w-80 border border-gray-200 cursor-pointer hover:shadow-lg"
                  onClick={() => {
                    setSelectedManager(group.manager);
                    const records = allRecords.filter(r => r.manager === group.manager);
                    setManagerRecords(records);
                    if (records.length > 0) {
                      setSelectedRecord(records[0]);
                    }
                  }}
                >
                  <div className="flex items-center mb-2">
                    <div className="bg-blue-100 p-2 rounded-lg mr-2">
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="24" height="24" rx="12" fill="#e0e7ff"/><rect x="7" y="7" width="10" height="10" rx="2" fill="#3b82f6"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#fff"/></svg>
                    </div>
                    <div className="font-semibold text-lg">{group.manager} Sourcing Manager</div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-4">
                    <div>
                      <div className="font-semibold text-gray-700">PRINT STRIKES</div>
                      <div>{group.count} Pantones</div>
                    </div>
                    <div>
                      <div className="font-semibold text-gray-700">SUBMITTED ON</div>
                      <div>Last updated: {group.lastDate || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
      
      {/* File Preview Modal */}
      {isFileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="bg-white rounded-lg shadow-lg p-4 max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{modalFileName}</h3>
              <button
                onClick={() => {
                  setIsFileModalOpen(false);
                  setModalFileUrl(null);
                  setModalFileType(null);
                  setModalFileName(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg 
                  className="w-6 h-6" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {modalFileType === 'application/pdf' ? (
                <iframe
                  src={`https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodeURIComponent(modalFileUrl)}`}
                  title="PDF Preview"
                  className="w-full h-full min-h-[600px]"
                  frameBorder="0"
                />
              ) : modalFileType?.startsWith('image/') ? (
                <img
                  src={modalFileUrl}
                  alt="Preview"
                  className="max-w-full h-auto mx-auto"
                  onError={(e) => {
                    console.error('Image failed to load:', modalFileUrl);
                    e.target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="text-center text-gray-500">
                  <p>Unsupported file type: {modalFileType}</p>
                  <a 
                    href={modalFileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline mt-2 inline-block"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
      <ManagerCommentsSidebar
        open={showCommentsSidebar}
        onClose={() => setShowCommentsSidebar(false)}
        manager={selectedManager || selectedRecord?.manager}
        records={allManagerComments}
        type="Pantone"
        onRecordClick={(record) => {
          setSelectedRecord(record);
          setShowCommentsSidebar(false);
        }}
      />
    </>
  );
};

export default Pantone;