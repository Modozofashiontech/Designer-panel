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

const PreProduction = () => {
  const [allRecords, setAllRecords] = useState(null); // all preproduction records
  const [managerGroups, setManagerGroups] = useState([]); // [{ manager, count, lastDate }]
  const [selectedManager, setSelectedManager] = useState(null);
  const [managerRecords, setManagerRecords] = useState([]); // records for selected manager
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [search, setSearch] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [step, setStep] = useState(1);
  const [season, setSeason] = useState('');
  const [preProductionNumber, setPreProductionNumber] = useState('');
  const [files, setFiles] = useState([]);
  const [manager, setManager] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('preproduction');
  const [techpacks, setTechpacks] = useState([]);
  const [fetchedTechpack, setFetchedTechpack] = useState(null);
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [allManagerComments, setAllManagerComments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });
  
  // Ensure selectedManager is set when opening the sidebar
  const openCommentsSidebar = () => {
    if (!selectedManager && selectedRecord && selectedRecord.manager) {
      setSelectedManager(selectedRecord.manager);
    }
    setShowCommentsSidebar(true);
  };

  const seasons = ['SS 25', 'FW 24', 'SS 24', 'FW 23'];
  const preProductionNumbers = ['PP-001', 'PP-002', 'PP-003'];
  const allManagers = ['Sridhar', 'Naveen', 'Koushik', 'Rajesh'];

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

  const fetchRecords = () => {
    fetch(`${API_BASE}/api/preproduction`)
      .then(res => res.json())
      .then(data => {
        setAllRecords(data);
        const groupedByManager = {};
        data.forEach(item => {
          if (!groupedByManager[item.manager]) groupedByManager[item.manager] = [];
          groupedByManager[item.manager].push(item);
        });
        const groupsArr = Object.entries(groupedByManager).map(([manager, items]) => {
          const latest = items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
          return {
            manager,
            count: items.length,
            lastDate: latest?.createdAt ? new Date(latest.createdAt).toISOString().slice(0, 10) : ''
          };
        });
        setManagerGroups(groupsArr);
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

  // Helper to normalize and get a techpack by id or object
  const getTechpackFor = (selectedTechpack) => {
    if (!selectedTechpack) return null;
    const id = typeof selectedTechpack === 'string' ? selectedTechpack : (selectedTechpack._id || selectedTechpack);
    return techpacks.find(tp => tp._id === id) || (fetchedTechpack && fetchedTechpack._id === id ? fetchedTechpack : null);
  };

  // When user opens the Techpack tab, fetch detail if not present
  useEffect(() => {
    if (selectedTab !== 'techpack' || !selectedRecord) return;

    const raw = selectedRecord.selectedTechpack;
    const id = typeof raw === 'string' ? raw : (raw && (raw._id || raw));
    if (!id) return;

    // If already have, do nothing (and clear stale fetched)
    const existing = techpacks.find(tp => tp._id === id) || fetchedTechpack;
    if (existing) {
      if (fetchedTechpack && fetchedTechpack._id === id) setFetchedTechpack(null);
      return;
    }

    let cancelled = false;
    fetch(`${API_BASE}/api/tech-packs/${id}`)
      .then(res => {
        if (cancelled) return;
        if (res.ok) return res.json();
        throw new Error('Not found');
      })
      .then(data => {
        if (cancelled || !data) return;
        setFetchedTechpack(data);
        setTechpacks(prev => [...prev, data]);
      })
      .catch(err => {
        console.error('Error fetching techpack:', err);
        setFetchedTechpack(null);
      });

    return () => { cancelled = true; };
  }, [selectedTab, selectedRecord, techpacks, fetchedTechpack]);

  // Effect to fetch and aggregate all comments for the selected manager
  useEffect(() => {
    if (!selectedManager) {
      setAllManagerComments([]);
      return;
    }

    const fetchAllComments = async () => {
      try {
        // Fetch all records for the current manager
  const res = await fetch(`${API_BASE}/api/preproduction/manager/${selectedManager}`, {
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
              recordTechpack: record.selectedTechpack,
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

  // Effect for polling comments for the selected record
  useEffect(() => {
    if (!selectedRecord) return;

    const intervalId = setInterval(async () => {
      if (selectedRecord.comments && selectedRecord.comments.some(c => c.isOptimistic)) {
        return;
      }

      try {
  const res = await fetch(`${API_BASE}/api/preproduction/${selectedRecord._id}`);
        if (res.ok) {
          const updatedRecord = await res.json();
          const oldComments = selectedRecord.comments || [];
          const newComments = updatedRecord.comments || [];
          if (JSON.stringify(oldComments) !== JSON.stringify(newComments)) {
            setSelectedRecord(prev => (prev && prev._id === updatedRecord._id ? { ...prev, comments: newComments } : prev));
            setManagerRecords(prev => prev.map(r => (r._id === updatedRecord._id ? { ...r, comments: newComments } : r)));
            setAllRecords(prev => prev.map(r => (r._id === updatedRecord._id ? { ...r, comments: newComments } : r)));
          }
        }
      } catch (error) {
        console.error('Error polling for comments:', error);
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [selectedRecord]);

  const handleAddComment = async (text, inputRef) => {
    if (!text.trim() || !selectedRecord) return;
    
    const user = 'Alex'; // In a real app, get from auth context
    
    try {
      // 1. Create and add optimistic comment
      const optimisticComment = createOptimisticComment(text, user);
      
      // 2. Update UI optimistically
      updateDocWithNewComment(
        selectedRecord,
        optimisticComment,
        setSelectedRecord,
        setManagerRecords
      );
      
      // 3. Clear input
      if (inputRef) inputRef.value = '';
      
      try {
        // 4. Send to server
        const response = await addCommentUtil(selectedRecord._id, text, user, 'preproduction');
        
        // 5. Update with server response
        const serverComment = response.comment || response;
        const updatedDoc = response.document || selectedRecord;
        
        // 6. Replace optimistic comment with server response
        setSelectedRecord(prev => ({
          ...prev,
          comments: (prev.comments || []).map(c => 
            c._id === optimisticComment._id 
              ? { ...serverComment, isOptimistic: false } 
              : c
          )
        }));
        
        // 7. Update manager records
        setManagerRecords(prev => 
          Array.isArray(prev) 
            ? prev.map(r => 
                r._id === selectedRecord._id 
                  ? { ...r, comments: updatedDoc.comments || [] }
                  : r
              )
            : prev
        );
        
      } catch (error) {
        // 8. Revert on error
        setSelectedRecord(prev => ({
          ...prev,
          comments: (prev.comments || []).filter(c => c._id !== optimisticComment._id)
        }));
        
        // 9. Show error to user
        console.error('Failed to save comment:', error);
        alert(error.message || 'Failed to save comment. Please try again.');
      }
      
    } catch (error) {
      console.error('Error in handleAddComment:', error);
      alert('An unexpected error occurred. Please try again.');
    }  
  };

  useEffect(() => {
    fetchRecords();
  }, []);

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
    formData.append('preProductionNumber', preProductionNumber);
    formData.append('manager', manager);
    files.forEach(file => formData.append('files', file));
    try {
  const res = await fetch(`${API_BASE}/api/preproduction`, {
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
    setPreProductionNumber('');
    setFiles([]);
    setManager('');
    fetchRecords();
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
      await addCommentUtil(recordId, comment.text, comment.user || 'Unknown', 'preproduction');
    } catch (error) {
      console.error('Failed to submit comment:', error);
      throw error;
    }
  };

  if (success) {
    return (
      <div className="bg-white p-8 rounded-lg shadow-sm flex flex-col items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center justify-center w-full">
          <div className="rounded-full bg-green-100 p-6 mb-6 flex items-center justify-center">
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" className="text-green-500"><circle cx="12" cy="12" r="10" fill="#bbf7d0"/><path d="M8 12l2 2 4-4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold">Pre-Production</h1>
                      <button
                        className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-md bg-white text-blue-700 font-medium hover:bg-blue-50"
                        onClick={openCommentsSidebar}
                      >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10a2 2 0 012-2h2M15 3h-4a2 2 0 00-2 2v3a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2z" /></svg>
                View Comments
              </button>
            </div>
          <div className="text-gray-500 mb-6 text-center">You can track status from Pre-Production page under "Submitted" status.</div>
          <button className="bg-blue-600 text-white px-6 py-2 rounded-md" onClick={() => window.location.href = '/preproduction'}>Go to Pre-Production page</button>
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
              <button onClick={() => { setSelectedManager(null); setSelectedRecord(null); setIsImageModalOpen(false); setModalImageSrc(null); }} className="cursor-pointer hover:text-gray-700">All Sourcing managers</button>
              <span className="mx-1">/</span>
              <span className="font-semibold text-gray-700">{selectedManager}</span>
            </div>
            <div className="mb-6"><h1 className="text-3xl font-bold">Pre-Production</h1></div>
            <div className="bg-white p-8 rounded-lg shadow-sm min-h-[60vh]">
              <div className="md:flex-row md:items-center md:justify-between mb-6 gap-4">
                <div className="flex justify-between gap-4 flex-wrap">
                  <div className='flex items-center gap-4'>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      </div>
                      <input type="text" placeholder="Search Pre-Production Id.." className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <div className="relative">
                      <select className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" value={sortConfig.key} onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}>
                        <option value="manager">Sort by Manager</option>
                        <option value="count">Sort by Count</option>
                        <option value="lastDate">Sort by Date</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none"><svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <button className="p-2 rounded-md border border-gray-200 bg-yellow-400/70 hover:bg-yellow-400" title="Grid View" type="button"><svg className="w-5 h-5 text-gray-700" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 6v-6h6v6h-6z"/></svg></button>
                    <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md bg-white text-blue-700 font-medium hover:bg-blue-50" onClick={openCommentsSidebar} type="button"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V10a2 2 0 012-2h2M15 3h-4a2 2 0 00-2 2v3a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2z" /></svg>View Comments</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-72 bg-white rounded-lg p-0 flex flex-col gap-0 border border-gray-200 max-h-[60vh] overflow-y-auto">
                  {getSortedAndFilteredManagerGroups()
                    .filter(group => { if (!selectedManager) return true; const rec = group.items ? group.items[0] : group; return rec.manager === selectedManager; })
                    .map((group, idx) => { const rec = group.items ? group.items[0] : group; const isActive = selectedRecord && selectedRecord._id === rec._id; const techName = rec.selectedTechpack ? (techpacks.find(tp => tp._id === rec.selectedTechpack)?.name || rec.selectedTechpack) : null; return (
                      <button key={rec._id || idx} className={`text-left px-4 py-3 text-sm flex flex-col border-l-4 ${isActive ? 'bg-blue-50 border-blue-600 font-semibold' : 'hover:bg-gray-50 border-transparent'} transition-colors`} onClick={() => setSelectedRecord(rec)} type="button">
                        <span className="truncate font-mono">{rec.preProductionNumber || 'Pre-Production'}</span>
                        {techName && <span className="text-xs text-gray-500 truncate">{techName}</span>}
                      </button>
                    );})}
                </div>
                {selectedRecord && (
                  <div className="flex-1 bg-white rounded-lg p-6 border border-gray-100 flex flex-col gap-2 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3"><div className="text-xl font-bold font-mono">{selectedRecord.preProductionNumber || 'Pre-Production'}</div></div>
                      <div className="flex gap-2"><button className="border px-3 py-1 rounded text-blue-700 border-blue-200 hover:bg-blue-50">View History</button></div>
                    </div>
                    <div className="flex gap-6 mb-4 overflow-x-auto">
                      <button className={`font-semibold pb-1 ${selectedTab === 'preproduction' ? 'border-b-2 border-blue-600' : 'text-gray-400'}`} onClick={() => setSelectedTab('preproduction')}>Pre-Production Details</button>
                      <button className={`font-semibold pb-1 ${selectedTab === 'techpack' ? 'border-b-2 border-blue-600' : 'text-gray-400'}`} onClick={() => setSelectedTab('techpack')} disabled={!selectedRecord.selectedTechpack}>Tech pack Details</button>
                    </div>
                    {selectedTab === 'preproduction' ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2"><span className="text-gray-400">Pre-Production ID</span><span className="font-mono">{selectedRecord._id}</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Season</span><span>{selectedRecord.season}</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Status</span><span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">Pending</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Submitted on</span><span>{new Date(selectedRecord.createdAt).toLocaleString()}</span></div>
                          <div className="flex items-center gap-2"><span className="text-gray-400">Submitted to</span><span>{selectedRecord.manager} (Sourcing manager)</span></div>
                        </div>
                        <div className="flex flex-col gap-3 w-full">
                          <div className="flex items-center justify-between"><div className="font-semibold">Lab Dips</div><div className="flex items-center gap-2 text-gray-500"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553 4.553a1 1 0 01-1.414 1.414L13.586 11.9M10 14a4 4 0 100-8 4 4 0 000 8z"/></svg><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553 4.553a1 1 0 01-1.414 1.414L13.586 11.9M10 14a4 4 0 100-8 4 4 0 000 8z"/></svg></div></div>
                          <div className="w-full min-h-[18rem] rounded border border-gray-200 bg-gray-50 p-2 flex items-center justify-center">
                            {(() => { const fileKey = selectedRecord?.file?.key; const imgSrc = fileKey ? `${API_BASE}/api/file/${encodeURIComponent(fileKey)}` : null; if (!imgSrc) return <div className="w-full h-64 flex items-center justify-center text-gray-400">No files uploaded</div>; return (<div className="w-full cursor-pointer" onClick={() => { setModalImageSrc(imgSrc); setIsImageModalOpen(true); setImageLoading(true); }}><img src={imgSrc} alt="Pre-Production" className="max-w-full max-h-72 object-contain rounded" /><div className="text-xs text-center text-gray-500 mt-1">Click to view full screen</div></div>); })()}
                          </div>
                          <div className="w-full mt-2">
                            <h4 className="font-medium mb-2">Comments</h4>
                            <div className="space-y-4 mb-2 max-h-[300px] overflow-y-auto">
                              {selectedRecord.comments && selectedRecord.comments.length > 0 ? (
                                sortCommentsByDate(selectedRecord.comments).map(comment => (
                                  <div key={comment._id || `temp-${comment.text}`} className={`text-sm border-b border-gray-100 pb-3 last:border-0 last:pb-0 ${comment.isOptimistic ? 'opacity-70' : ''}`}>
                                    <div className="flex justify-between items-center mb-1"><p className="font-semibold">{comment.user || 'Unknown User'}</p><p className="text-xs text-gray-500">{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : 'Just now'}{comment.isOptimistic && ' (saving...)'}</p></div>
                                    <p className="text-gray-700 break-words">{comment.text}</p>
                                  </div>
                                ))
                              ) : (<p className="text-gray-500 text-sm italic">No comments yet. Be the first to comment!</p>)}
                            </div>
                            <div className="mt-2"><div className="flex items-center gap-2"><input type="text" placeholder="Add a comment..." className="flex-grow border rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { handleAddComment(e.target.value.trim(), e.target); e.preventDefault(); } }} /><button className="bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-semibold hover:bg-blue-700" onClick={(e) => { const input = e.currentTarget.previousElementSibling; if (input.value.trim()) { handleAddComment(input.value.trim(), input); } }}>Send</button></div></div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      (() => { const techpack = getTechpackFor(selectedRecord.selectedTechpack); if (!techpack) return <div className="text-gray-400">No techpack details found.</div>; return (<div className="w-full"><div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm"><div className="flex flex-col gap-2"><div className="flex items-center gap-2"><span className="text-gray-400">Name</span><span>{techpack.name}</span></div><div className="flex items-center gap-2"><span className="text-gray-400">Description</span><span>{techpack.description}</span></div><div className="flex items-center gap-2"><span className="text-gray-400">Article Type</span><span>{techpack.articletype}</span></div><div className="flex items-center gap-2"><span className="text-gray-400">Colour</span><span>{techpack.colour}</span></div><div className="flex items-center gap-2"><span className="text-gray-400">Fit</span><span>{techpack.fit}</span></div><div className="flex items-center gap-2"><span className="text-gray-400">Gender</span><span>{techpack.gender}</span></div><div className="flex items-center gap-2"><span className="text-gray-400">Print Technique</span><span>{techpack.printtechnique}</span></div></div><div className="mt-2 md:mt-0">{techpack.pdfUrl ? (<div className="border rounded overflow-hidden"><iframe src={techpack.pdfUrl} title="Techpack PDF" className="w-full h-96 border-0" /></div>) : techpack.previewUrl ? (<img src={techpack.previewUrl} alt={techpack.name || 'Techpack preview'} className="w-full h-96 object-cover rounded" />) : (<div className="text-gray-400">No preview available</div>)}<div className="mt-4"><h4 className="font-medium mb-2">Comments</h4><CommentSection recordId={selectedRecord._id} file={selectedRecord} endpoint="preproduction" /></div></div></div></div>); })()
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <ManagerCommentsSidebar open={showCommentsSidebar} onClose={() => setShowCommentsSidebar(false)} manager={selectedManager || selectedRecord?.manager} records={allRecords} type="Pre-Production" onRecordClick={(record) => { setSelectedRecord(record); setShowCommentsSidebar(false); }} />
      </>
    );
  }

  return (
    <div className="bg-white p-8 rounded-lg shadow-sm min-h-[60vh]">
      <Header />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
        <div>
          {selectedRecord ? (
            <h1 className="text-3xl font-bold mb-1">
              {`Pre-Production / ${selectedRecord.manager} Sourcing Manager`}
            </h1>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-1">Pre-Production</h1>
              <p className="text-gray-500">Track the status and progress of Pre-Production samples</p>
            </>
          )}
        </div>
      </div>
      <div className="bg-gray-50 rounded-lg p-4 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1 flex items-center bg-white rounded-md border border-gray-200 px-3 py-2">
          <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"></path></svg>
          <input
            className="flex-1 outline-none bg-transparent"
            type="text"
            placeholder="Search Sourcing manager.."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="flex items-center gap-1 px-4 py-2 border border-gray-200 rounded-md bg-white text-gray-700 font-medium">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M6 6h12M9 14h6" /></svg>
          SORT
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
                const records = allRecords.filter(r => r.manager === m.manager);
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
                  <div className="font-semibold text-gray-700">PRE-PRODUCTION</div>
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
                <span className="text-gray-400">Loading...</span>
              </div>
            )}
            <img
              src={modalImageSrc}
              alt="Preview"
              className="max-h-[80vh] w-auto object-contain rounded"
              style={{ display: imageLoading ? 'none' : 'block' }}
              onLoad={() => setImageLoading(false)}
            />
          </div>
        </div>
      )}
            <ManagerCommentsSidebar
        open={showCommentsSidebar}
        onClose={() => setShowCommentsSidebar(false)}
        manager={selectedManager || selectedRecord?.manager}
        records={allRecords}
        type="Pre-Production"
        onRecordClick={(record) => {
          setSelectedRecord(record);
          setShowCommentsSidebar(false);
        }}
      />
    </div>
  );
}

export default PreProduction;