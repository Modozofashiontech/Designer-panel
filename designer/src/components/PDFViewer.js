import React, { useState, useEffect } from 'react';
import { FaComment, FaPaperPlane } from 'react-icons/fa';
import socket from '../socket';

const PDFViewer = ({ file, onClose }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [viewerReady, setViewerReady] = useState(false);
  const [didTimeout, setDidTimeout] = useState(false);

  // Debug effect to log state changes
  useEffect(() => {
    console.log('New comment input changed:', newComment);
  }, [newComment]);

  useEffect(() => {
    console.log('Comments state updated:', comments);
  }, [comments]);

  // Initialize comments when file changes
  useEffect(() => {
    console.log('File changed, current file:', file);
    
    const initializeComments = () => {
      if (!file?.comments) {
        console.log('No comments found in file, initializing empty array');
        return [];
      }
      
      if (!Array.isArray(file.comments)) {
        console.error('file.comments is not an array:', file.comments);
        return [];
      }
      
      return file.comments.map((comment, index) => {
        // Map the database comment structure to our UI structure
        const safeComment = {
          id: String(comment._id || `comment-${index}-${Date.now()}`),
          _id: String(comment._id || `comment-${index}-${Date.now()}`),
          author: String(comment.sender || 'User'),
          avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.sender || 'U')}`,
          comment: String(comment.message || ''),
          timestamp: String(comment.time || comment.timestamp || new Date().toISOString()),
          role: 'User'  // Default role since it's not in the database
        };
        
        console.log(`Processed comment ${index}:`, safeComment);
        return safeComment;
      });
    };
    
    const initialComments = initializeComments();
    console.log('Initializing comments:', initialComments);
    setComments(initialComments);
    
    // Join the socket room for this line sheet
    if (file?._id) {
      console.log('Joining socket room for tech pack:', file._id);
      socket.emit('join-techpack', file._id);
      
      // Set up socket listener for new comments
      const handleNewComment = (data) => {
        console.log('Received new comment from socket:', data);
        if (data.techpackId === file._id && data.comment) {
          const newComment = {
            id: String(data.comment._id || data.comment.id || `new-${Date.now()}`),
            _id: String(data.comment._id || data.comment.id || `new-${Date.now()}`),
            author: String(data.comment.author || 'User'),
            avatar: data.comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.comment.author || 'U')}&background=0D8ABC&color=fff`,
            comment: String(data.comment.comment || data.comment.text || ''),
            timestamp: String(data.comment.timestamp || new Date().toISOString()),
            role: data.comment.role || 'Designer'
          };
          
          console.log('Adding new comment to UI:', newComment);
          setComments(prev => {
            // Check if comment already exists
            const exists = prev.some(c => c.id === newComment.id || c._id === newComment._id);
            return exists ? prev : [newComment, ...prev];
          });
        }
      };
      
      socket.on('new-comment', handleNewComment);
      
      // Clean up socket listener
      return () => {
        socket.off('new-comment', handleNewComment);
      };
    }
  }, [file, socket]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Join line sheet room and set up comment listeners
  useEffect(() => {
    if (!file?._id) {
      console.log('No file ID, skipping socket setup');
      return;
    }

    console.log('Joining line sheet room for file ID:', file._id);
    
    // Join the specific line sheet room
    socket.emit('join-linesheet', file._id);
    
    const onNewComment = (payload) => {
      console.log('Received new comment payload:', payload);
      
      if (payload.lineSheetId === file._id) {
        // Normalize the comment data structure
        const normalizedComment = {
          id: payload.comment?.id || payload.comment?._id?.toString() || Date.now().toString(),
          _id: payload.comment?._id?.toString() || payload.comment?.id || Date.now().toString(),
          author: payload.comment?.author || 'User',
          avatar: payload.comment?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(payload.comment?.author || 'U')}`,
          comment: payload.comment?.comment || payload.comment?.text || '',
          timestamp: payload.comment?.timestamp || new Date().toISOString(),
          role: payload.comment?.role || 'User'
        };
        
        console.log('Adding new comment to UI:', normalizedComment);
        
        // Update the comments state, ensuring no duplicates
        setComments(prev => {
          // Check if comment already exists
          const exists = prev.some(c => 
            c.id === normalizedComment.id || 
            c._id === normalizedComment._id ||
            (c.timestamp === normalizedComment.timestamp && c.author === normalizedComment.author)
          );
          
          if (exists) {
            console.log('Comment already exists, skipping duplicate');
            return prev;
          }
          
          return [normalizedComment, ...prev];
        });
      }
    };

    // Set up event listeners
    socket.on('new-comment', onNewComment);
    
    // Clean up on unmount or when file ID changes
    return () => {
      console.log('Cleaning up socket listeners for file ID:', file._id);
      socket.off('new-comment', onNewComment);
    };
  }, [file?._id]);

  // Mark viewer as ready after initial render
  useEffect(() => {
    console.log('Viewer ready, file data:', file);
    setViewerReady(true);
  }, []);

  // Safety timeout: if the embedded viewer doesn't load (CORS, etc.), reveal fallback link
  useEffect(() => {
    if (!file?.pdfUrl) return;
    setDidTimeout(false);
    const t = setTimeout(() => setDidTimeout(true), 6000);
    return () => clearTimeout(t);
  }, [file?.pdfUrl]);

  // Early return for no file case
  if (!viewerReady || !file?.pdfUrl) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <p className="text-gray-500">Loading document viewer...</p>
      </div>
    );
  }
  
  console.log('Rendering PDFViewer with comments:', comments);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleDownload = () => {
    if (file?.pdfUrl) {
      const link = document.createElement('a');
      link.href = file.pdfUrl;
      link.download = file.name || 'techpack.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load PDF');
  };

  // Detect if the given url is actually an image rather than a PDF
  const isImage = /\.(png|jpe?g|gif|bmp|webp)$/i.test(file.pdfUrl);

  // Use the provided URL as-is (may be a presigned URL). Do not append params to avoid signature mismatch
  const viewerUrl = file.pdfUrl;

  const handleAddComment = async (e) => {
    e.preventDefault();
    
    // Get the comment text from the input
    const commentText = newComment.trim();
    console.log('=== HANDLING COMMENT SUBMISSION ===');
    console.log('Raw comment text:', newComment);
    console.log('Trimmed comment text:', commentText);
    
    if (!commentText || !file?._id) {
      console.error('Cannot add empty comment or missing file ID');
      return;
    }
    
    // Create a timestamp for consistent timing
    const timestamp = new Date().toISOString();
    const commentId = `client-${Date.now()}`;
    
    // Create a new comment object for the UI
    const newCommentObj = {
      id: commentId,
      _id: commentId,
      author: 'You',
      avatar: 'https://ui-avatars.com/api/?name=You',
      comment: commentText,
      timestamp: timestamp,
      role: 'User',
      isSending: true
    };
    
    console.log('Created new comment object for UI:', JSON.stringify(newCommentObj, null, 2));
    
    try {
      // Optimistic UI update - add to local state immediately
      console.log('Adding comment to local state');
      setComments(prev => {
        const updatedComments = [newCommentObj, ...prev];
        console.log('Updated comments array:', updatedComments);
        return updatedComments;
      });
      
      setNewComment(''); // Clear the input
      setIsSending(true);
      
      // Emit the comment to the server using the correct event for tech packs
      socket.emit('add-comment', {
        techpackId: file._id,
        comment: commentText,
        user: 'You'
      });
      
      console.log('Comment emitted to server, waiting for confirmation...');
      
    } catch (error) {
      console.error('Error in handleAddComment:', error);
      // Remove the optimistic update if there was an error
      setComments(prev => prev.filter(c => c.id !== newCommentObj.id));
      // Show error to the user
      alert('Failed to add comment. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4" 
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex">
        {/* PDF Container */}
        <div className={`${showComments ? 'w-2/3' : 'w-full'} flex flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900 truncate">{file.name || 'Document Viewer'}</h2>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowComments(!showComments)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full relative"
                title={showComments ? 'Hide Comments' : 'Show Comments'}
              >
                <FaComment className="w-5 h-5" />
                {comments.length > 0 && !showComments && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {comments.length}
                  </span>
                )}
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center space-x-1"
                title="Download"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-full"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* PDF Content */}
          <div className="flex-1 bg-gray-50 overflow-hidden relative">
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-white bg-opacity-75">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p>Loading PDF...</p>
                {didTimeout && (
                  <a
                    href={file.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 text-blue-600 hover:underline"
                  >
                    Open in new tab
                  </a>
                )}
              </div>
            )}
            
            {isImage || (error && file.previewUrl) ? (
              <img
                src={isImage ? file.pdfUrl : file.previewUrl}
                alt={file.name || 'Preview'}
                className="w-full h-full object-contain bg-white"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
              />
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <svg className="mx-auto h-16 w-16 text-red-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading PDF</h3>
                <p className="text-gray-600 mb-4">{error}</p>
                <a
                  href={file.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 text-blue-600 hover:underline"
                >
                  Open in new tab
                </a>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Download PDF Instead
                </button>
              </div>
            ) : (
              <iframe
                src={viewerUrl}
                className="w-full h-full border-0"
                title="PDF Viewer"
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                style={{ border: 'none' }}
              >
                <p>Your browser does not support iframes. <a href={file.pdfUrl} target="_blank" rel="noopener noreferrer">Open the PDF</a> or <a href={file.pdfUrl} download>download</a>.</p>
              </iframe>
            )}
          </div>
        </div>

        {/* Comments Sidebar */}
        {showComments && (
          <div className="w-1/3 border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Comments</h3>
            </div>
            
            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!comments || comments.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No comments yet. Be the first to comment!
                </div>
              ) : (
                comments
                  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) // Sort by newest first
                  .map((comment) => {
                    console.log('Rendering comment:', comment); // Debug log
                    return (
                      <div key={comment.id || comment._id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded-lg">
                        <img
                          src={comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'U')}`}
                          alt={comment.author || 'User'}
                          className="h-10 w-10 rounded-full object-cover bg-gray-200"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'U')}`;
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold text-gray-900">
                              {comment.author || 'User'}
                            </h4>
                            {comment.role && (
                              <>
                                <span className="text-xs text-gray-500">•</span>
                                <span className="text-xs text-blue-600 font-medium">
                                  {comment.role}
                                </span>
                              </>
                            )}
                            <span className="text-xs text-gray-500">•</span>
                            <span className="text-xs text-gray-500">
                              {comment.timestamp ? new Date(comment.timestamp).toLocaleString() : 'Just now'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 mt-1 whitespace-pre-line break-words">
                            {(() => {
                              // Debug log the full comment object
                              console.log('=== RENDERING COMMENT ===');
                              console.log('Comment object:', comment);
                              
                              if (!comment) {
                                console.error('Comment is null or undefined');
                                return '[Invalid comment data]';
                              }
                              
                              // Log all properties of the comment
                              console.log('Comment properties:', Object.keys(comment));
                              
                              // Check for comment text in multiple possible fields
                              const possibleTextFields = ['comment', 'text', 'content', 'message', 'body'];
                              let commentText = '';
                              
                              for (const field of possibleTextFields) {
                                if (comment[field] && typeof comment[field] === 'string') {
                                  console.log(`Found text in field '${field}':`, comment[field]);
                                  commentText = comment[field];
                                  break;
                                }
                              }
                              
                              // If still no text, try to find any string property
                              if (!commentText) {
                                for (const [key, value] of Object.entries(comment)) {
                                  if (typeof value === 'string' && value.trim().length > 0) {
                                    console.log(`Found string in property '${key}':`, value);
                                    commentText = value;
                                    break;
                                  }
                                }
                              }
                              
                              if (!commentText) {
                                console.error('No text content found in comment object. Full object:', JSON.stringify(comment, null, 2));
                                return '[No comment text found]';
                              }
                              
                              return commentText;
                            })()}
                          </div>
                          {comment.isSending && (
                            <div className="text-xs text-gray-500 mt-1">Sending...</div>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Add Comment Form */}
            <div className="p-4 border-t border-gray-200">
              <form onSubmit={handleAddComment} className="flex items-start space-x-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => {
                    console.log('Input changed:', e.target.value);
                    setNewComment(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddComment(e);
                    }
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || isSending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isSending ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <FaPaperPlane />
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PDFViewer;