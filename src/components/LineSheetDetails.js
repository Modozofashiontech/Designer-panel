import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from './Header';
import { useSharedPDFs } from '../context/SharedPDFContext';
import ManagerCommentsSidebar from './ManagerCommentsSidebar';
import TechPackGenerator from './TechPackGenerator';
import axios from 'axios';
import socket from '../socket';
import { API_BASE } from '../config';
import {
  ChatBubbleLeftRightIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const LineSheetDetails = () => {
  const navigate = useNavigate();
  const { managerId } = useParams();
  const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;
  const { updatePDFStatus } = useSharedPDFs();
  const [uploadedSheets, setUploadedSheets] = useState([]);
  const [selectedHeaderSeason, setSelectedHeaderSeason] = useState('SS 25');
  const [isHeaderSeasonOpen, setIsHeaderSeasonOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPDF, setSelectedPDF] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [commentPosition, setCommentPosition] = useState(null); // {x, y} coordinates of clicked location
  const [activeCommentImage, setActiveCommentImage] = useState(null); // Index of the image where comment was clicked
  const [showTechPackGenerator, setShowTechPackGenerator] = useState(false);
  const [brandManagers, setBrandManagers] = useState([]);
  const [currentManager, setCurrentManager] = useState(null);
  // Helper function to get file URL with folder support
  const getFileUrl = (fileObj, folder = '') => {
    if (!fileObj) return null;
    
    // If it's already a URL, return it
    if (typeof fileObj === 'string' && 
        (fileObj.startsWith('http') || fileObj.startsWith('blob:'))) {
      return fileObj;
    }

    // Handle both direct key and file object with key property
    const key = fileObj.key || fileObj;
    if (!key) return null;

    // Clean the key and folder
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    const cleanFolder = folder ? `${folder.replace(/^\/+|\/+$/g, '')}` : '';
    
    // Build the URL with folder parameter if provided
    const url = new URL(`${API_BASE_URL}/file/${encodeURIComponent(cleanKey)}`);
    if (cleanFolder) {
      url.searchParams.append('folder', cleanFolder);
    }
    
    return url.toString();
  };

  // Removed presigned URL fetching; images will be served via /api/file/<key>
  
  // Fetch comments when a PDF is selected
  useEffect(() => {
    const fetchComments = async () => {
      if (!selectedPDF?._id) return;
      
      try {
        const lineSheetId = selectedPDF._id || selectedPDF.id;
        const response = await axios.get(`${API_BASE_URL}/line-sheets/${lineSheetId}`);
        if (response.data) {
          const formattedComments = response.data.comments.map(comment => {
            const commentText = comment.comment || comment.message || '';
            const author = comment.author || comment.sender || 'User';
            return {
              id: comment.id || comment._id || `comment-${Date.now()}`,
              _id: comment.id || comment._id,
              author: author,
              avatar: comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(author)}&background=0D8ABC&color=fff`,
              comment: commentText,
              message: commentText, // Keep both for backward compatibility
              timestamp: comment.timestamp || comment.time || new Date().toISOString(),
              role: comment.role || 'User'
            };
          });
          setComments(formattedComments);
        } else {
          setComments([]);
        }
      } catch (error) {
        console.error('Error fetching comments:', error);
        setComments([]);
      }
    };

    fetchComments();

    // Socket listener moved to the second useEffect to avoid scope issues

    // Join the line sheet room for real-time updates
    if (selectedPDF?._id) {
      const lineSheetId = selectedPDF._id || selectedPDF.id;
      socket.emit('join-linesheet', lineSheetId);
    }

    // Clean up handled in the second useEffect
  }, [selectedPDF?._id]);

  const handleBackClick = () => {
    navigate('/line-sheets');
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    const commentText = newComment.trim();
    if (!commentText || !selectedPDF?._id) return;

    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    // Create a temporary comment for immediate UI update
    const tempComment = {
      _id: tempId,
      id: tempId,
      author: 'You',
      avatar: 'https://ui-avatars.com/api/?name=You&background=0D8ABC&color=fff',
      comment: commentText,
      timestamp: timestamp,
      role: 'Brand Manager',
      isSending: true
    };

    // Optimistically update the UI
    setComments(prev => [tempComment, ...prev]);
    setNewComment('');
    setIsSending(true);

    try {
      // Emit the comment to the server with the expected structure
      // Use the MongoDB _id field, not the custom id field
      const lineSheetId = selectedPDF._id || selectedPDF.id;
      socket.emit('add-linesheet-comment', {
        lineSheetId: lineSheetId,
        comment: {
          id: tempId,
          author: 'You',
          comment: commentText,
          timestamp: timestamp,
          role: 'Brand Manager'
        }
      });
    } catch (error) {
      console.error('Error adding comment:', error);
      // Remove the optimistic update if there was an error
      setComments(prev => prev.filter(c => c.id !== tempId));
      alert('Failed to add comment. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const fetchSheets = async () => {
    try {
      console.log('🔍 Fetching data for managerId:', managerId, 'Type:', typeof managerId);
      const [bmRes, lsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/brand-managers?t=${Date.now()}`, { 
          headers: { 
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Expires': '0'
          } 
        }),
        managerId ? axios.get(`${API_BASE_URL}/line-sheets/manager/${managerId}`) : axios.get(`${API_BASE_URL}/line-sheets`)
      ]);

      console.log('📊 Brand managers response:', bmRes.data);
      console.log('📊 Brand managers status:', bmRes.status);
      console.log('📊 Brand managers headers:', bmRes.headers);
      console.log('📋 Line sheets response:', lsRes.data);

      setBrandManagers(bmRes.data || []);
      // Normalize response shape for line-sheets API (manager route returns array, general route returns { data, pagination })
      let sheets = Array.isArray(lsRes.data) ? lsRes.data : (lsRes.data?.data || []);

      // Fallback: if manager endpoint returns empty, load all
      if (managerId && Array.isArray(sheets) && sheets.length === 0) {
        const fallbackRes = await axios.get(`${API_BASE_URL}/line-sheets`);
        sheets = fallbackRes.data || [];
      }

      setUploadedSheets(sheets);
      
      // Find and set current manager
      if (managerId && bmRes.data) {
        console.log('🔍 Looking for manager with ID:', managerId);
        console.log('📝 Available managers:', bmRes.data.map(m => ({ 
          id: m._id?.toString() || m.id?.toString(), 
          objectId: m._id, 
          name: m.name 
        })));
        // Try different matching strategies
        let manager = bmRes.data.find(m => {
          const mId = m._id?.toString() || m.id?.toString();
          return mId === managerId || m._id === managerId || m.id === managerId;
        });
        if (!manager) {
          // Try matching by name if managerId is actually a name
          manager = bmRes.data.find(m => m.name && m.name.toLowerCase() === managerId.toLowerCase());
        }
        if (!manager) {
          // Try matching by name containing the managerId
          manager = bmRes.data.find(m => m.name && m.name.toLowerCase().includes(managerId.toLowerCase()));
        }
        console.log('✅ Found manager:', manager);
        setCurrentManager(manager);
      }
    } catch (err) {
      console.error('❌ Error fetching data', err);
    }
  };

  useEffect(() => {
    fetchSheets();
  }, [managerId]);



  // Socket connection and event debugging
  useEffect(() => {
    // Log socket connection status
    console.log('Socket connected:', socket.connected);
    
    const onConnect = () => {
      console.log('Socket connected!');
      console.log('Socket ID:', socket.id);
    };

    const onDisconnect = () => {
      console.log('Socket disconnected!');
    };

    // Define handleNewComment in this scope
    const handleNewComment = (data) => {
      console.log('📨 Received socket comment:', data);
      const currentLineSheetId = selectedPDF?._id || selectedPDF?.id;
      console.log('🔍 Comparing IDs - Current:', currentLineSheetId, 'Received:', data.lineSheetId);
      
      if (data.lineSheetId === currentLineSheetId && data.comment) {
        const commentText = data.comment.comment || data.comment.message || '';
        const author = data.comment.author || data.comment.sender || 'User';
        const newComment = {
          id: data.comment.id || data.comment._id || `new-${Date.now()}`,
          _id: data.comment.id || data.comment._id,
          author: author,
          avatar: data.comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(author)}&background=0D8ABC&color=fff`,
          comment: commentText,
          message: commentText, // Keep both for backward compatibility
          timestamp: data.comment.timestamp || data.comment.time || new Date().toISOString(),
          role: data.comment.role || 'User'
        };
        
        setComments(prev => {
          // Remove any temporary comment with the same ID or from the same author if it's a temporary comment
          const filtered = prev.filter(c => 
            !(c.id === newComment.id || (c.isSending && c.author === newComment.author))
          );
          // Add the new comment at the top
          return [newComment, ...filtered];
        });
      }
    };

    const handleLineSheetUpdate = (updated) => {
      if (updated._id === selectedPDF?._id) {
        console.log('Received linesheet update:', updated);
        // Process extractedImages to ensure proper URLs
        if (updated.extractedImages?.length) {
          updated.extractedImages = updated.extractedImages.map(img => ({
            ...img,
            // Ensure URL is properly formatted
            url: img.url || (img.key ? `/api/file/${encodeURIComponent(img.key)}` : '')
          }));
        }
        
        setSelectedPDF(prev => ({
          ...prev,
          ...updated,
          // Preserve existing comments if not provided in update
          comments: updated.comments || prev?.comments || []
        }));
      }
    };

    // Set up event listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('linesheet-comment', handleNewComment);
    socket.on('linesheet-updated', handleLineSheetUpdate);

    // Clean up event listeners
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('linesheet-comment', handleNewComment);
      socket.off('linesheet-updated', handleLineSheetUpdate);
    };

    // Log all socket events for debugging
    const originalEmit = socket.emit;
    socket.emit = function(event, ...args) {
      console.log('Emitting event:', event, args);
      return originalEmit.apply(socket, [event, ...args]);
    };

    // Clean up
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('linesheet-comment', handleNewComment);
      socket.emit = originalEmit; // Restore original emit
    };
  }, [selectedPDF]);

  const filteredPDFs = uploadedSheets.filter(pdf => {
    const searchLower = searchQuery.toLowerCase();
    return pdf.name.toLowerCase().includes(searchLower) || 
           pdf.styleId?.toLowerCase().includes(searchLower);
  });

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Header */}
      <div className="flex-none bg-white border-b border-gray-200">
        <Header 
          selectedSeason={selectedHeaderSeason}
          onSeasonChange={setSelectedHeaderSeason}
          isSeasonOpen={isHeaderSeasonOpen}
          setIsSeasonOpen={setIsHeaderSeasonOpen}
        />
      </div>

      {/* Breadcrumb and Header */}
      <div className="flex-none bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center text-sm text-gray-500 mb-4">
            <button onClick={handleBackClick} className="hover:text-gray-700">Brand Managers</button>
            <span className="mx-2">/</span>
            <span className="text-gray-900">
              {currentManager ? `${currentManager.name} Brand manager` : 
               (managerId ? `Manager ${managerId.slice(-6)}` : 'Brand manager')}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Line Sheet Details</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCommentsSidebar(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 mr-2"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Comments
              </button>
              <button
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload Line Sheet
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {/* Search and Filter Bar */}
        <div className="flex-none p-6 border-b border-gray-200 bg-white">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search Style ID..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>FILTER</span>
            </button>
            <button className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center space-x-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <span>STATUS</span>
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 bg-white p-4 rounded-lg border border-gray-200">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    <option value="">All Status</option>
                    <option value="submitted">Submitted</option>
                    <option value="accepted">Accepted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                  <select className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                    <option value="">All Time</option>
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Content Area with Left Sidebar and Main View */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Left Sidebar - PDF List */}
          <div className="w-full md:w-80 flex-none border-r border-gray-200 bg-white overflow-y-auto">
            {filteredPDFs.map((pdf) => (
              <div
                key={pdf.id}
                onClick={() => setSelectedPDF(pdf)}
                className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
                  selectedPDF?.id === pdf.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center">
                  <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                    pdf.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' : 
                    pdf.status === 'SUBMITTED' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {pdf.status}
                  </div>
                </div>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  {pdf.name || pdf.pdfOriginalName || pdf.styleId || 'Unnamed Document'}
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  {pdf.articletype ? `${pdf.articletype} • ` : ''}
                  {pdf.gender || ''}
                  {!pdf.articletype && !pdf.gender && 'No additional details'}
                </p>
              </div>
            ))}
          </div>

          {/* Main Content Area - PDF Preview */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {selectedPDF ? (
              <div className="p-6">
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  {/* Preview: use row images grid if present */}
                  <div className="flex flex-col items-center w-full">
                    {(() => {
                      let imagesArr = [];
                      let fromPython = false;
                      // Handle different image sources with priority to extractedImages
                      if (Array.isArray(selectedPDF.extractedImages) && selectedPDF.extractedImages.length > 0) {
                        // Use the extracted images from S3
                        imagesArr = selectedPDF.extractedImages.map(img => {
                          // Create a new object to avoid modifying the original
                          const newImg = { ...img };
                          
                          // Only generate URL if one doesn't already exist
                          if (!newImg.url) {
                            newImg.url = getFileUrl(img);
                          }
                          return newImg;
                        });
                        fromPython = true;
                      } else if (Array.isArray(selectedPDF.rowImages) && selectedPDF.rowImages.length > 0) {
                        // Fallback to rowImages if available
                        imagesArr = selectedPDF.rowImages;
                      } else if (Array.isArray(selectedPDF.rows) && selectedPDF.rows.length) {
                        // Fallback to rows if available
                        imagesArr = selectedPDF.rows.flat();
                      }

                      if (imagesArr.length > 0) {
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 w-full">
                            {imagesArr.map((ri, idx) => (
                              <div key={idx} className="relative group">
                                <div className="relative w-full h-64 bg-gray-100 rounded-lg overflow-hidden">
                                  <img
                                    src={(() => {
                                      try {
                                        // Handle different possible structures like in Pantone.js
                                        const imgSrc = ri?.img || ri?.url || ri;
                                        if (!imgSrc) return '';
                                        
                                        // If it's already a full URL, use it directly
                                        if (typeof imgSrc === 'string' && 
                                            (imgSrc.startsWith('http') || imgSrc.startsWith('blob:') || imgSrc.startsWith('/api/') || imgSrc.startsWith('/file/'))) {
                                          return imgSrc;
                                        }
                                        
                                        // Otherwise use getFileUrl
                                        return getFileUrl(imgSrc) || '';
                                      } catch (error) {
                                        console.error('Error processing image URL:', error, ri);
                                        return ''; // Will trigger onError
                                      }
                                    })()}
                                    alt={`Garment Image ${idx + 1}`}
                                    className="w-full h-full object-contain p-2"
                                    onError={(e) => {
                                      const target = e.target;
                                      console.error('Image failed to load:', target.src, 'Image data:', ri);
                                      
                                      // If we already tried the fallback, show placeholder
                                      if (target.dataset.fallback) {
                                        console.log('Fallback already attempted, showing placeholder');
                                        target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOENBMEI5IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiLz48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSIvPjxwYXRoIGQ9Ik0yMSAxNWwtNS02LTUgNkgydjVoMjB2LTV6Ii8+PC9zdmc+';
                                        target.alt = 'Image not available';
                                        return;
                                      }
                                      
                                      // Try alternative URL formats
                                      if (ri && (ri.key || ri.url)) {
                                        console.log('Trying fallback URL for:', ri);
                                        target.dataset.fallback = 'true';
                                        
                                        try {
                                          // Try to get fallback URL using the same method as above
                                          const fallbackSrc = ri?.key || ri?.url || ri;
                                          if (fallbackSrc) {
                                            // If it's already a URL, use it directly
                                            if (typeof fallbackSrc === 'string' && 
                                                (fallbackSrc.startsWith('http') || fallbackSrc.startsWith('blob:') || fallbackSrc.startsWith('/api/') || fallbackSrc.startsWith('/file/'))) {
                                              console.log('Using fallback URL:', fallbackSrc);
                                              target.src = fallbackSrc;
                                            } else {
                                              const fallbackUrl = getFileUrl(fallbackSrc);
                                              if (fallbackUrl) {
                                                console.log('Using fallback URL:', fallbackUrl);
                                                target.src = fallbackUrl;
                                              }
                                            }
                                          }
                                        } catch (error) {
                                          console.error('Error in fallback URL generation:', error, ri);
                                        }
                                        return;
                                      }
                                      
                                      // Final fallback: Show placeholder
                                      console.log('No fallback available, showing placeholder');
                                      target.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjOENBMEI5IiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiLz48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSIvPjxwYXRoIGQ9Ik0yMSAxNWwtNS02LTUgNkgydjVoMjB2LTV6Ii8+PC9zdmc+';
                                      target.alt = 'Image not available';
                                    }}
                                  />
                                  {fromPython && ri.page && (
                                    <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                      Page {ri.page}
                                    </div>
                                  )}
                                </div>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Get relative position within the image
                                    const rect = e.currentTarget.closest('.group').getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    const y = e.clientY - rect.top;
                                    
                                    setCommentPosition({ x, y });
                                    setActiveCommentImage(idx);
                                    setNewComment(`Re: Image ${idx + 1} `);
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-white/80 rounded-full shadow-sm hover:bg-blue-50 transition-colors"
                                  title="Add comment"
                                >
                                  <ChatBubbleLeftRightIcon className="w-5 h-5 text-gray-600 hover:text-blue-600" />
                                </button>
                                
                                {/* Show comments at clicked location */}
                                {commentPosition && activeCommentImage === idx && (
                                  <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                                    <div 
                                      className="absolute bg-white rounded-lg shadow-lg w-full max-w-xs sm:max-w-sm md:w-80"
                                      style={{
                                        left: `${commentPosition.x}px`,
                                        top: `${commentPosition.y}px`,
                                        transform: 'translate(-50%, -100%)',
                                        maxWidth: 'calc(100vw - 2rem)'
                                      }}
                                    >
                                      {/* Header */}
                                      <div className="flex items-center justify-between p-3 border-b border-gray-200">
                                        <h3 className="text-sm font-medium text-gray-900">Comments ({comments.length})</h3>
                                        <button 
                                          onClick={() => {
                                            setCommentPosition(null);
                                            setActiveCommentImage(null);
                                          }}
                                          className="text-gray-400 hover:text-gray-500"
                                        >
                                          <XMarkIcon className="h-5 w-5" />
                                        </button>
                                      </div>
                                      
                                      {/* Comments list */}
                                      <div className="max-h-96 overflow-y-auto p-3 space-y-4">
                                        {comments.length > 0 ? (
                                          comments.map((comment) => (
                                            <div key={comment.id} className="flex gap-3">
                                              <img
                                                className="h-8 w-8 rounded-full"
                                                src={comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'U')}`}
                                                alt={comment.author}
                                              />
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-sm font-medium text-gray-900">
                                                    {comment.author || 'User'}
                                                  </span>
                                                  <span className="text-xs text-gray-500">
                                                    {new Date(comment.timestamp || comment.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                  </span>
                                                </div>
                                                <p className="mt-1 text-sm text-gray-700">
                                                  {comment.comment || comment.message}
                                                </p>
                                                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                                  <button className="hover:text-gray-700">Reply</button>
                                                  <span>•</span>
                                                  <button className="hover:text-gray-700">Edit</button>
                                                  <span>•</span>
                                                  <button className="hover:text-red-500">Delete</button>
                                                </div>
                                              </div>
                                            </div>
                                          ))
                                        ) : (
                                          <div className="text-center py-4 text-sm text-gray-500">
                                            No comments yet
                                          </div>
                                        )}
                                      </div>
                                      
                                      {/* Comment form */}
                                      <div className="border-t border-gray-200 p-3">
                                        <div className="relative">
                                          <input
                                            type="text"
                                            value={newComment}
                                            onChange={(e) => setNewComment(e.target.value)}
                                            className="block w-full rounded-md border-0 py-2 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                                            placeholder="Add a comment..."
                                          />
                                          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                            <button type="button" className="text-gray-400 hover:text-gray-500">
                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                              </svg>
                                            </button>
                                          </div>
                                        </div>
                                        <div className="mt-2 flex justify-end">
                                          <button
                                            type="button"
                                            onClick={handleAddComment}
                                            disabled={!newComment.trim() || isSending}
                                            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm ${
                                              !newComment.trim() || isSending
                                                ? 'bg-gray-300 cursor-not-allowed'
                                                : 'bg-blue-600 hover:bg-blue-700'
                                            }`}
                                          >
                                            {isSending ? 'Posting...' : 'Post'}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      
                      return (
                        <div className="relative w-full">
                          <img
                            src={selectedPDF.previewUrl}
                            alt="PDF Preview"
                            className="max-w-full w-full object-contain rounded-lg border border-gray-200"
                          />
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              // Get relative position within the image
                              const rect = e.currentTarget.closest('.relative').getBoundingClientRect();
                              const x = e.clientX - rect.left;
                              const y = e.clientY - rect.top;
                              
                              setCommentPosition({ x, y });
                              setActiveCommentImage(null);
                              setNewComment('');
                            }}
                            className="absolute top-4 right-4 p-2 bg-white/80 rounded-full shadow-sm hover:bg-blue-50 transition-colors"
                            title="Add comment"
                          >
                            <ChatBubbleLeftRightIcon className="w-6 h-6 text-gray-600 hover:text-blue-600" />
                          </button>
                          
                          {/* Show comments at clicked location */}
                          {commentPosition && activeCommentImage === null && (
                            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                              <div 
                                className="absolute bg-white rounded-lg shadow-lg w-full max-w-xs sm:max-w-sm md:w-80"
                                style={{
                                  left: `${commentPosition.x}px`,
                                  top: `${commentPosition.y}px`,
                                  transform: 'translate(-50%, -100%)',
                                  maxWidth: 'calc(100vw - 2rem)'
                                }}
                              >
                                {/* Header */}
                                <div className="flex items-center justify-between p-3 border-b border-gray-200">
                                  <h3 className="text-sm font-medium text-gray-900">Comments ({comments.length})</h3>
                                  <button 
                                    onClick={() => {
                                      setCommentPosition(null);
                                      setActiveCommentImage(null);
                                    }}
                                    className="text-gray-400 hover:text-gray-500"
                                  >
                                    <XMarkIcon className="h-5 w-5" />
                                  </button>
                                </div>
                                
                                {/* Comments list */}
                                <div className="max-h-96 overflow-y-auto p-3 space-y-4">
                                  {comments.length > 0 ? (
                                    comments.map((comment) => (
                                      <div key={comment.id} className="flex gap-3">
                                        <img
                                          className="h-8 w-8 rounded-full"
                                          src={comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'U')}`}
                                          alt={comment.author}
                                        />
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-900">
                                              {comment.author || 'User'}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                              {new Date(comment.timestamp || comment.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          </div>
                                          <p className="mt-1 text-sm text-gray-700">
                                            {comment.comment || comment.message}
                                          </p>
                                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                            <button className="hover:text-gray-700">Reply</button>
                                            <span>•</span>
                                            <button className="hover:text-gray-700">Edit</button>
                                            <span>•</span>
                                            <button className="hover:text-red-500">Delete</button>
                                          </div>
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-center py-4 text-sm text-gray-500">
                                      No comments yet
                                    </div>
                                  )}
                                </div>
                                
                                {/* Comment form */}
                                <div className="border-t border-gray-200 p-3">
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={newComment}
                                      onChange={(e) => setNewComment(e.target.value)}
                                      className="block w-full rounded-md border-0 py-2 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6"
                                      placeholder="Add a comment..."
                                    />
                                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                      <button type="button" className="text-gray-400 hover:text-gray-500">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={handleAddComment}
                                      disabled={!newComment.trim() || isSending}
                                      className={`rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm ${
                                        !newComment.trim() || isSending
                                          ? 'bg-gray-300 cursor-not-allowed'
                                          : 'bg-blue-600 hover:bg-blue-700'
                                      }`}
                                    >
                                      {isSending ? 'Posting...' : 'Post'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="mt-6 w-full flex justify-between items-center">
                      <div className="text-sm text-gray-500">
                        {selectedPDF.comments?.length > 0 && (
                          <button 
                            onClick={() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' })}
                            className="flex items-center text-blue-600 hover:text-blue-800"
                          >
                            <ChatBubbleLeftRightIcon className="w-4 h-4 mr-1" />
                            {selectedPDF.comments.length} {selectedPDF.comments.length === 1 ? 'comment' : 'comments'}
                          </button>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => setShowTechPackGenerator(true)}
                          className="p-2 text-gray-400 hover:text-blue-600"
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                        </button>
                        <button className="p-2 text-gray-400 hover:text-gray-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                        <button className="p-2 text-gray-400 hover:text-gray-600">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                        <button 
                          className="p-2 text-gray-400 hover:text-gray-600"
                          onClick={() => updatePDFStatus(selectedPDF.id, selectedPDF.status === 'ACCEPTED' ? 'SUBMITTED' : 'ACCEPTED')}
                        >
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Tech Pack Generator Modal */}
                    {showTechPackGenerator && (
                      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
                        <div className="relative top-20 mx-auto p-5 border w-4/5 shadow-lg rounded-md bg-white">
                          <TechPackGenerator 
                            lineSheet={selectedPDF}
                            allLineSheets={uploadedSheets}
                            onClose={() => setShowTechPackGenerator(false)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Comments Section */}
                  <div id="comments-section" className="mt-12">
                    <div className="border-b border-gray-200 pb-4 mb-6">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <ChatBubbleLeftRightIcon className="w-5 h-5 mr-2 text-gray-500" />
                        Comments
                        {comments.length > 0 && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {comments.length}
                          </span>
                        )}
                      </h3>
                    </div>
                    
                    {/* Add Comment Form */}
                    <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-200">
                      <form onSubmit={handleAddComment}>
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0">
                            <img
                              className="h-10 w-10 rounded-full bg-white border border-gray-200"
                              src="https://ui-avatars.com/api/?name=You&background=0D8ABC&color=fff"
                              alt="Your profile"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="border-b border-gray-200 focus-within:border-blue-500">
                              <label htmlFor="comment" className="sr-only">
                                Add your comment
                              </label>
                              <textarea
                                rows={3}
                                name="comment"
                                id="comment"
                                className="block w-full border-0 border-b border-transparent p-0 pb-2 resize-none focus:ring-0 focus:border-blue-500 sm:text-sm bg-transparent"
                                placeholder="Add your comment..."
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                              />
                            </div>
                            <div className="flex justify-between items-center pt-2">
                              <div className="flex space-x-2">
                                <button
                                  type="button"
                                  className="p-1.5 rounded-full text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                                >
                                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                  </svg>
                                </button>
                              </div>
                              <div>
                                <button
                                  type="submit"
                                  disabled={!newComment.trim() || isSending}
                                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white ${
                                    !newComment.trim() || isSending ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                                >
                                  {isSending ? 'Posting...' : 'Post Comment'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </form>
                    </div>

                    {/* Comments Section */}
                    <div className="space-y-6">
                      {selectedPDF && comments.length > 0 ? (
                        comments.map((comment) => (
                          <div key={comment.id} className="flex space-x-4">
                            <div className="flex-shrink-0">
                              <img
                                className="h-10 w-10 rounded-full bg-white border border-gray-200"
                                src={comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || comment.sender || 'U')}&background=0D8ABC&color=fff`}
                                alt={comment.author || comment.sender || 'User'}
                                onError={(e) => {
                                  e.target.onerror = null;
                                  e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || comment.sender || 'U')}&background=0D8ABC&color=fff`;
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0 bg-white rounded-lg border border-gray-200 p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium text-gray-900">{comment.author || comment.sender || 'User'}</span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    {comment.role || 'User'}
                                  </span>
                                </div>
                                <span className="text-xs text-gray-500">
                                  {new Date(comment.timestamp || comment.time || new Date().toISOString()).toLocaleString()}
                                </span>
                              </div>
                              {console.log('Rendering comment:', comment)}
                              <p className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                                {comment.comment || comment.message || 'No message content'}
                              </p>
                              <div className="mt-3 flex items-center text-xs text-gray-500 space-x-4">
                                <button className="hover:text-blue-600 flex items-center">
                                  <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                  </svg>
                                  Reply
                                </button>
                                {(comment.sender === 'You' || comment.author === 'You') && (
                                  <React.Fragment>
                                    <button className="hover:text-blue-600 flex items-center">
                                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                      Edit
                                    </button>
                                    <button className="hover:text-red-600 flex items-center">
                                      <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete
                                    </button>
                                  </React.Fragment>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-gray-400" />
                          <h3 className="mt-2 text-sm font-medium text-gray-900">No comments yet</h3>
                          <p className="mt-1 text-sm text-gray-500">Be the first to comment on this line sheet.</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Generate as Tech-pack Button */}
                    <div className="flex justify-end">
                      <button
                        className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200"
                        onClick={() => setShowTechPackGenerator(true)}
                      >
                        Generate as Tech-pack
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <p className="text-gray-500">Select a line sheet to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showTechPackGenerator && (
        <TechPackGenerator
          lineSheet={selectedPDF}
          allLineSheets={filteredPDFs}
          onClose={() => setShowTechPackGenerator(false)}
        />
      )}

      {/* Comments Sidebar */}
      <ManagerCommentsSidebar
        open={showCommentsSidebar}
        onClose={() => setShowCommentsSidebar(false)}
        manager={currentManager?.name || managerId || "Manager"}
        records={uploadedSheets}
        type="Line Sheet"
        onRecordClick={(record) => {
          setSelectedPDF(record);
          setShowCommentsSidebar(false);
        }}
      />
      
      {/* Debug: Log data when sidebar opens */}
      {showCommentsSidebar && console.log('LineSheetDetails Debug:', {
        managerId,
        uploadedSheetsCount: uploadedSheets.length,
        firstSheet: uploadedSheets[0],
        sheetsWithComments: uploadedSheets.filter(s => s.comments && s.comments.length > 0)
      })}
    </div>
  );
};

export default LineSheetDetails; 