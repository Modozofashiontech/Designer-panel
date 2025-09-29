import React, { useState, useEffect, useCallback } from 'react';
import socket from '../socket';
import { API_BASE } from '../config';
import CommentSection from './CommentSection';
import Header from './Header';
import FilePreviewModal from './FilePreviewModal';
import ManagerCommentsSidebar from './ManagerCommentsSidebar';
import { useDropzone } from 'react-dropzone';
import { 
  addComment as addCommentUtil, 
  createOptimisticComment, 
  updateDocWithNewComment,
  sortCommentsByDate
} from '../utils/commentUtils';

const PrintStrike = () => {
  const [allRecords, setAllRecords] = useState(null); // all print strike records
  const [managerGroups, setManagerGroups] = useState([]); // [{ manager, count, lastDate }]
  const [selectedManager, setSelectedManager] = useState(null);
  const [managerRecords, setManagerRecords] = useState([]); // records for selected manager
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [search, setSearch] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [step, setStep] = useState(1);
  const [season, setSeason] = useState('');
  const [printStrikeNumber, setPrintStrikeNumber] = useState('');
  const [files, setFiles] = useState([]);
  const [manager, setManager] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('printstrike');
  const [techpacks, setTechpacks] = useState([]);
  const [fetchedTechpack, setFetchedTechpack] = useState(null);
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'printStrikeNumber', direction: 'asc' });

  // Get filtered and sorted records
  const getFilteredAndSortedRecords = useCallback(() => {
    if (!managerRecords) return [];
    
    // Filter records by search term
    const filtered = managerRecords.filter(record => 
      (record.printStrikeNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.season || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.manager || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Sort records
    return [...filtered].sort((a, b) => {
      let aValue = a[sortConfig.key] || '';
      let bValue = b[sortConfig.key] || '';
      
      // Handle different data types for sorting
      if (sortConfig.key === 'createdAt') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [managerRecords, searchTerm, sortConfig]);

  // Handle sort request
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Helper: accept either a techpack id or an object and return the matching techpack
  const getTechpackFor = (selectedTechpack) => {
    if (!selectedTechpack) return null;
    const id = typeof selectedTechpack === 'string' ? selectedTechpack : (selectedTechpack._id || selectedTechpack);
    return techpacks.find(tp => tp._id === id) || (fetchedTechpack && fetchedTechpack._id === id ? fetchedTechpack : null);
  };

  // When user opens the Techpack tab, if the techpack isn't present in `techpacks`, try fetching it by id.
  useEffect(() => {
    if (selectedTab !== 'techpack' || !selectedRecord) return;
    
    const raw = selectedRecord.selectedTechpack;
    const id = typeof raw === 'string' ? raw : (raw && (raw._id || raw));
    if (!id) return;

    // Check if we already have this techpack in our state
    const existingTechpack = techpacks.find(tp => tp._id === id) || fetchedTechpack;
    if (existingTechpack) {
      // Clear any previous fetchedTechpack if it's stale
      if (fetchedTechpack && fetchedTechpack._id === id) {
        setFetchedTechpack(null);
      }
      return;
    }

    let cancelled = false;
    
    // First try the techpacks endpoint
    fetch(`${API_BASE}/api/tech-packs/${id}`)
      .then(res => {
        if (cancelled) return;
        if (res.ok) return res.json();
        throw new Error('Techpack not found');
      })
      .then(data => {
        if (cancelled || !data) return;
        setFetchedTechpack(data);
        setTechpacks(prev => [...prev, data]);
      })
      .catch(() => {
        if (cancelled) return;
        // Fallback to the old endpoint if the first one fails
        return fetch(`${API_BASE}/api/tech-packs/${id}`)
          .then(res => {
            if (!res.ok) throw new Error('Not found');
            return res.json();
          })
          .then(data => {
            if (cancelled) return;
            setFetchedTechpack(data);
            setTechpacks(prev => [...prev, data]);
          })
          .catch(error => {
            console.error('Error fetching techpack:', error);
            setFetchedTechpack(null);
          });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTab, selectedRecord, techpacks, fetchedTechpack]);

  const seasons = ['Spring 2025', 'Summer 2025', 'Fall 2025'];
  const printStrikeNumbers = ['PS-001', 'PS-002', 'PS-003'];
  const allManagers = ['Sridhar', 'Naveen', 'Koushik', 'Rajesh'];

  const fetchRecords = () => {
  fetch(`${API_BASE}/api/printstrike`)
      .then(res => res.json())
      .then(data => {
        setAllRecords(data);
        const grouped = {};
        data.forEach(item => {
          if (!grouped[item.manager]) grouped[item.manager] = [];
          grouped[item.manager].push(item);
        });
        setManagerGroups(Object.entries(grouped).map(([manager, items]) => ({
          manager,
          count: items.length,
          lastDate: (() => {
            const latest = items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
            return latest?.createdAt ? new Date(latest.createdAt).toISOString().slice(0, 10) : '';
          })(),
        })));
      })
      .catch(() => setAllRecords([]));
  };

  // Fetch all techpacks on mount
  useEffect(() => {
  fetch(`${API_BASE}/api/tech-packs`)
      .then(res => res.json())
      .then(data => setTechpacks(data))
      .catch(() => setTechpacks([]));
  }, []);

  // Fetch printstrike records on mount
  useEffect(() => {
    fetchRecords();
  }, []);

  // Join/leave socket room when selectedRecord changes
  useEffect(() => {
    if (!selectedRecord) return;
    socket.emit('join_room', selectedRecord._id);
    return () => {
      socket.emit('leave_room', selectedRecord._id);
    };
  }, [selectedRecord]);

  // Polling effect: refresh comments for selectedRecord unless optimistic comments exist
  useEffect(() => {
    if (!selectedRecord) return;

    let intervalId = null;

    const poll = async () => {
      try {
        if (selectedRecord.comments && selectedRecord.comments.some(c => c.isOptimistic)) return;
  const res = await fetch(`${API_BASE}/api/printstrike/${selectedRecord._id}`);
        if (!res.ok) return;
        const updated = await res.json();

        const oldComments = selectedRecord.comments || [];
        const newComments = updated.comments || [];
        if (JSON.stringify(oldComments) !== JSON.stringify(newComments)) {
          setSelectedRecord(prev => (prev && prev._id === updated._id ? { ...prev, comments: newComments } : prev));
          setManagerRecords(prev => prev.map(r => (r._id === updated._id ? { ...r, comments: newComments } : r)));
          setAllRecords(prev => prev.map(r => (r._id === updated._id ? { ...r, comments: newComments } : r)));
        }
      } catch (err) {
        console.error('Error polling for comments:', err);
      }
    };

    // initial poll then interval
    poll();
    intervalId = setInterval(poll, 5000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [selectedRecord]);

  useEffect(() => {
    const handleRecordUpdate = (updatedRecord) => {
      // Functional state updates to avoid stale state
      const updater = (prevState) => {
        if (!prevState) return [];
        return prevState.map(rec => rec._id === updatedRecord._id ? updatedRecord : rec);
      };
      
      setAllRecords(updater);
      setManagerRecords(updater);
      setSelectedRecord(prev => (prev && prev._id === updatedRecord._id ? updatedRecord : prev));
    };

    socket.on('record_updated', handleRecordUpdate);

    return () => {
      socket.off('record_updated', handleRecordUpdate);
    };
  }, []);

  const onDrop = useCallback(acceptedFiles => {
    setFiles(prevFiles => [...prevFiles, ...acceptedFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/pdf': [] }
  });

  const handleSubmit = async () => {
    setLoading(true);
    const formData = new FormData();
    formData.append('season', season);
    formData.append('printStrikeNumber', printStrikeNumber);
    formData.append('manager', manager);
    files.forEach(file => formData.append('files', file));
    try {
  const res = await fetch(`${API_BASE}/api/printstrike`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setSuccess(true);
      } else {
        alert('Upload failed');
      }
    } catch (err) {
      alert('Upload failed');
    } finally {
      setLoading(false);
    }
  };
  
  const resetForm = () => {
    setShowUploadForm(false);
    setSuccess(false);
    setStep(1);
    setSeason('');
    setPrintStrikeNumber('');
    setFiles([]);
    setManager('');
    fetchRecords(); // Refetch records to show the new data
  };

  // All comments are now posted to the main record only
  const handleCommentSubmit = async (recordId, comment) => {
    try {
      // Optimistic or error update
      if (comment.isOptimistic || comment.isError) {
        setSelectedRecord(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            comments: comment.isError
              ? (prev.comments || []).filter(c => c._id !== comment._id)
              : [...(prev.comments || []), comment]
          };
        });
        return;
      }
      // Post to main record
      await addCommentUtil(recordId, comment.text, comment.user || 'Unknown', 'printstrike');
    } catch (error) {
      console.error('Failed to submit comment:', error);
      throw error;
    }
  };

  const handleAddComment = async (text, inputRef) => {
    if (!text.trim() || !selectedRecord) return;

    const user = 'Alex'; // TODO: replace with real user from auth

    try {
      const optimisticComment = createOptimisticComment(text, user);


      // Optimistically update comments array directly
      setSelectedRecord(prev => ({
        ...prev,
        comments: [...(prev.comments || []), optimisticComment]
      }));
      setManagerRecords(prev => prev.map(r =>
        r._id === selectedRecord._id
          ? { ...r, comments: [...(r.comments || []), optimisticComment] }
          : r
      ));

      if (inputRef) inputRef.value = '';

      try {
  const updatedRecord = await addCommentUtil(selectedRecord._id, null, text, user, 'printstrike');

        setSelectedRecord(prev => ({
          ...prev,
          comments: sortCommentsByDate([
            ...(prev.comments || []).filter(c => c._id !== optimisticComment._id),
            ...((updatedRecord.comments || []).slice(-1))
          ])
        }));

        setManagerRecords(prev => prev.map(r => r._id === selectedRecord._id ? { ...r, comments: updatedRecord.comments } : r));
        setAllRecords(prev => prev.map(r => r._id === selectedRecord._id ? { ...r, comments: updatedRecord.comments } : r));

      } catch (error) {
        setSelectedRecord(prev => ({
          ...prev,
          comments: (prev.comments || []).filter(c => c._id !== optimisticComment._id)
        }));
        alert(error.message || 'Failed to add comment. Please try again.');
      }

    } catch (error) {
      console.error('Error in handleAddComment:', error);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white p-6 rounded-lg shadow-sm min-h-[60vh] max-w-4xl mx-auto mt-8">
          <div className="flex flex-col items-center justify-center w-full py-12">
            <div className="rounded-full bg-green-100 p-6 mb-6 flex items-center justify-center">
              <svg width="48" height="48" fill="none" viewBox="0 0 24 24" className="text-green-500">
                <circle cx="12" cy="12" r="10" fill="#bbf7d0"/>
                <path d="M8 12l2 2 4-4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-2xl font-semibold mb-4 text-center">
              Print Strike-off images have been Submitted to {manager} (Sourcing Manager)
            </h2>
            <p className="text-gray-500 mb-8 text-center max-w-md">
              You can track status from Print Strikes page under "Submitted" status.
            </p>
            <button 
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
              onClick={resetForm}
            >
              Go to Print Strikes
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedManager && managerRecords.length > 0) {
    return (
      <>
        <Header />
        <div className="h-screen flex flex-col">
          <div className="flex-none bg-white border-b border-gray-200"></div>
          <div className="flex-1 overflow-auto bg-gray-50 p-6">
            <div className="flex items-center text-sm text-gray-500 mb-2">
              <button
                onClick={() => { setSelectedManager(null); setSelectedRecord(null); setIsImageModalOpen(false); setModalImageSrc(null); }}
                className="cursor-pointer hover:text-gray-700"
              >
                All Sourcing managers
              </button>
              <span className="mx-1">/</span>
              <span className="font-semibold text-gray-700">{selectedManager}</span>
            </div>
            <div className="mb-6">
              <h1 className="text-3xl font-bold">Print Strikes</h1>
            </div>
            <div className="bg-white p-8 rounded-lg shadow-sm min-h-[60vh]">
              <div className="mb-6">
                <div className="md:flex-row md:items-center md:justify-between mb-4 gap-4">
                  <div className="flex justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      {/* Search Input */}
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                        </div>
                        <input
                          type="text"
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          placeholder="Search Print Strike Id.."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                      
                      {/* Sort Dropdown */}
                      <div className="relative">
                        <select
                          className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={sortConfig.key}
                          onChange={(e) => setSortConfig(prev => ({
                            ...prev,
                            key: e.target.value,
                            direction: 'asc'
                          }))}
                        >
                          <option value="printStrikeNumber">Sort by Number</option>
                          <option value="createdAt">Sort by Date</option>
                          <option value="season">Season</option>
                          <option value="manager">Manager</option>
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
                      <button className="p-2 rounded-md border border-gray-200 bg-yellow-400/70 hover:bg-yellow-400" title="Grid View" type="button">
                        <svg className="w-5 h-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 6v-6h6v6h-6z"/></svg>
                      </button>
                      <button
                        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white text-blue-700 font-medium hover:bg-blue-50"
                        onClick={() => setShowCommentsSidebar(true)}
                        type="button"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10a2 2 0 012-2h2M15 3h-4a2 2 0 00-2 2v3a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2z" /></svg>
                        View Comments
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left: List of Print Strikes for the selected manager */}
                <div className="w-full md:w-72 bg-white rounded-lg p-0 flex flex-col gap-0 border border-gray-200 max-h-[60vh] overflow-y-auto">
                  {getFilteredAndSortedRecords().map((rec) => {
                    const isActive = selectedRecord && selectedRecord._id === rec._id;
                    const techName = rec.selectedTechpack ? (techpacks.find(tp => tp._id === rec.selectedTechpack)?.name || rec.selectedTechpack) : null;
                    return (
                      <button
                        key={rec._id}
                        className={`text-left px-4 py-3 text-sm flex flex-col border-l-4 ${isActive ? 'bg-blue-50 border-blue-600 font-semibold' : 'hover:bg-gray-50 border-transparent'} transition-colors`}
                        onClick={() => setSelectedRecord(rec)}
                        type="button"
                      >
                        <span className="truncate font-mono">{rec.printStrikeNumber || 'Print Strike'}</span>
                        {techName && <span className="text-xs text-gray-500 truncate">{techName}</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Center: Details with Tabs and Right: Lab Dips */}
                {selectedRecord && (
                  <div className="flex-1 bg-white rounded-lg p-6 border border-gray-100 flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="text-xl font-bold font-mono">{selectedRecord.printStrikeNumber || 'Print Strike'}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="border px-3 py-1 rounded text-blue-700 border-blue-200 hover:bg-blue-50">View History</button>
                      </div>
                    </div>
                    <div className="flex gap-6 mb-4 overflow-x-auto">
                      <button
                        className={`font-semibold pb-1 ${selectedTab === 'printstrike' ? 'border-b-2 border-blue-600' : 'text-gray-400'}`}
                        onClick={() => setSelectedTab('printstrike')}
                      >Print Strike Details</button>
                      <button
                        className={`font-semibold pb-1 ${selectedTab === 'techpack' ? 'border-b-2 border-blue-600' : 'text-gray-400'}`}
                        onClick={() => setSelectedTab('techpack')}
                        disabled={!selectedRecord.selectedTechpack}
                      >Tech pack Details</button>
                    </div>
                    {selectedTab === 'printstrike' ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2"><span className="text-gray-400">Print Strike ID</span><span className="font-mono">{selectedRecord._id}</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Season</span><span>{selectedRecord.season}</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Status</span><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">Pending</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Submitted on</span><span>{new Date(selectedRecord.createdAt).toLocaleString()}</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Submitted to</span><span>{selectedRecord.manager} (Sourcing manager)</span></div>
                        </div>
                        <div className="flex flex-col gap-3 w-full">
                          <div className="flex items-center justify-between">
                            <div className="font-semibold">Lab Dips</div>
                            <div className="flex items-center gap-2 text-gray-500">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553 4.553a1 1 0 01-1.414 1.414L13.586 11.9M10 14a4 4 0 100-8 4 4 0 000 8z"/></svg>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553 4.553a1 1 0 01-1.414 1.414L13.586 11.9M10 14a4 4 0 100-8 4 4 0 000 8z"/></svg>
                            </div>
                          </div>
                          <div className="w-full min-h-[18rem] rounded border border-gray-200 bg-gray-50 p-2 flex items-center justify-center">
                            {(() => {
                              if (selectedTab === 'techpack') return null;
                              const fileKey = selectedRecord?.file?.key;
                              const imgSrc = fileKey ? `${API_BASE}/api/file/${encodeURIComponent(fileKey)}` : null;
                              if (!imgSrc) return <div className="w-full h-64 flex items-center justify-center text-gray-400">No files uploaded</div>;
                              return (
                                <div className="w-full cursor-pointer" onClick={() => { setModalImageSrc(imgSrc); setIsImageModalOpen(true); setImageLoading(true); }}>
                                  <img src={imgSrc} alt="Print Strike" className="max-w-full max-h-72 object-contain rounded" />
                                  <div className="text-xs text-center text-gray-500 mt-1">Click to view full screen</div>
                                </div>
                              );
                            })()}
                          </div>
                          <div className="w-full mt-2">
                            <h4 className="font-medium mb-2">Comments</h4>
                            <div className="space-y-4 mb-2 max-h-[300px] overflow-y-auto">
                              {selectedRecord.comments && selectedRecord.comments.length > 0 ? (
                                sortCommentsByDate(selectedRecord.comments).map(comment => (
                                  <div key={comment._id || `temp-${comment.text}`} className={`text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0 ${comment.isOptimistic ? 'opacity-70' : ''}`}>
                                    <div className="flex justify-between items-center mb-1">
                                      <p className="font-semibold">{comment.user || 'Unknown User'}</p>
                                      <p className="text-xs text-gray-500">{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : 'Just now'}{comment.isOptimistic && ' (saving...)'}</p>
                                    </div>
                                    <p className="text-gray-700 break-words">{comment.text}</p>
                                  </div>
                                ))
                              ) : (
                                <p className="text-gray-500 text-sm italic">No comments yet. Be the first to comment!</p>
                              )}
                            </div>
                            <div className="mt-2">
                              <div className="flex items-center gap-2">
                                <input type="text" placeholder="Add a comment..." className="flex-grow border rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { handleAddComment(e.target.value.trim(), e.target); e.preventDefault(); } }} />
                                <button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-semibold hover:bg-blue-700" onClick={(e) => { const input = e.currentTarget.previousElementSibling; if (input.value.trim()) { handleAddComment(input.value.trim(), input); } }}>Send</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full">
                        {(() => {
                          const techpack = getTechpackFor(selectedRecord.selectedTechpack);
                          if (!techpack) {
                            return (
                              <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
                                <p>Loading techpack details...</p>
                              </div>
                            );
                          }
                          return (
                            <div className="w-full">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2"><span className="text-gray-400">Name</span><span>{techpack.name || 'N/A'}</span></div>
                                  <div className="flex items-center gap-2"><span className="text-gray-400">Description</span><span className="text-right">{techpack.description || 'N/A'}</span></div>
                                  <div className="flex items-center gap-2"><span className="text-gray-400">Article Type</span><span>{techpack.articletype || 'N/A'}</span></div>
                                  <div className="flex items-center gap-2"><span className="text-gray-400">Color</span><span>{techpack.colour || 'N/A'}</span></div>
                                  <div className="flex items-center gap-2"><span className="text-gray-400">Fit</span><span>{techpack.fit || 'N/A'}</span></div>
                                  <div className="flex items-center gap-2"><span className="text-gray-400">Gender</span><span>{techpack.gender || 'N/A'}</span></div>
                                  <div className="flex items-center gap-2"><span className="text-gray-400">Print Technique</span><span>{techpack.printtechnique || 'N/A'}</span></div>
                                </div>
                                <div className="mt-2 md:mt-0">
                                  {techpack.pdfUrl ? (
                                    <div className="border rounded overflow-hidden">
                                      <iframe src={techpack.pdfUrl} title="Techpack PDF" className="w-full h-96 border-0" />
                                    </div>
                                  ) : techpack.previewUrl ? (
                                    <img src={techpack.previewUrl} alt={techpack.name || 'Techpack preview'} className="w-full h-96 object-cover rounded" />
                                  ) : (
                                    <div className="text-gray-400">No preview available</div>
                                  )}
                                  {/* Comments Section - only in PDF column */}
                                  <div className="mt-4">
                                    <h4 className="font-medium mb-2">Comments</h4>
                                    <CommentSection
                                      recordId={selectedRecord._id}
                                      file={selectedRecord}
                                      endpoint="printstrike"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-50 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
              <div>
                <h1 className="text-3xl font-bold mb-1">Print Strike</h1>
                <p className="text-gray-500">Track the status and progress of Print Strike records</p>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1 flex items-center bg-white rounded-md border border-gray-200 px-3 py-2">
                <svg className="w-5 h-5 text-gray-400 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
                </svg>
                <input
                  className="flex-1 outline-none bg-transparent text-sm md:text-base"
                  type="text"
                  placeholder="Search Sourcing manager..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-md bg-white text-gray-700 font-medium hover:bg-gray-50 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M6 6h12M9 14h6" />
                </svg>
                <span className="hidden sm:inline">SORT</span>
              </button>
            </div>

            {/* Manager cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {managerGroups
                .filter(m => m.manager.toLowerCase().includes(search.toLowerCase()))
                .map(m => (
                  <div
                    key={m.manager}
                    className="bg-white rounded-lg shadow p-6 w-80 border border-gray-200 cursor-pointer hover:shadow-lg"
                    onClick={() => {
                      setSelectedManager(m.manager);
                      const records = allRecords.filter((r) => r.manager === m.manager);
                      setManagerRecords(records);
                      setSelectedRecord(records[0]);
                    }}
                  >
                    <div className="flex items-center mb-2">
                      <div className="bg-blue-100 p-2 rounded-lg mr-2">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                          <rect width="24" height="24" rx="12" fill="#e0e7ff"/>
                          <rect x="7" y="7" width="10" height="10" rx="2" fill="#3b82f6"/>
                          <rect x="9" y="9" width="6" height="6" rx="1" fill="#fff"/>
                        </svg>
                      </div>
                      <div className="font-semibold text-lg">{m.manager} Sourcing Manager</div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-4">
                      <div>
                        <div className="font-semibold text-gray-700">PRINT STRIKES</div>
                        <div>{m.count}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">LAST UPDATED</div>
                        <div>{m.lastDate}</div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            
            {/* Image Preview Modal */}
            {isImageModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
                <div className="bg-white rounded-lg shadow-lg p-4 max-w-3xl w-full flex flex-col items-center relative">
                  <button
                    className="absolute top-2 right-2 text-gray-600 hover:text-gray-900 text-2xl font-bold"
                    onClick={() => setIsImageModalOpen(false)}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                  {imageLoading && (
                    <div className="flex items-center justify-center h-[80vh] w-full">
                      <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v16a8 8 0 01-8-8z"></path>
                      </svg>
                    </div>
                  )}
                  {!imageLoading && modalImageSrc && (
                    <img 
                      src={modalImageSrc} 
                      alt="Preview" 
                      className="max-h-[80vh] max-w-full object-contain"
                      onLoad={() => setImageLoading(false)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default PrintStrike;
