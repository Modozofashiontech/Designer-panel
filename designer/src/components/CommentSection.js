import React, { useState, useEffect, useRef } from 'react';
import { 
  addComment as addCommentUtil, 
  createOptimisticComment, 
  updateDocWithNewComment,
  sortCommentsByDate,
  validateComment
} from '../utils/commentUtils';

const CommentSection = ({ recordId, file, onCommentSubmit, endpoint }) => {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const comments = sortCommentsByDate(file.comments || []);
  const commentEndRef = useRef(null);

  // Auto-scroll to bottom when comments change
  useEffect(() => {
    if (commentEndRef.current) {
      commentEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate comment
    const validation = validateComment(comment);
    if (!validation.isValid) {
      setError(validation.error);
      return;
    }
    
    // For demo purposes, using 'Designer' as the user
    // In a real app, this would come from auth context
    const user = 'Designer';
    const text = comment.trim();
    
    // Create optimistic comment before the try block
    const optimisticComment = createOptimisticComment(text, user);
    
    try {
      setIsSubmitting(true);
      setError('');
      
      // Update UI optimistically
      if (onCommentSubmit) {
        onCommentSubmit(recordId, file._id, optimisticComment);
      }
      
      // Clear input
      setComment('');
      
      // Submit to backend
      await addCommentUtil(recordId, file._id, text, user, endpoint);
      
      // The actual update will come through the socket.io update
      
    } catch (err) {
      console.error('Failed to submit comment:', err);
      setError('Failed to submit comment. Please try again.');
      
      // Revert optimistic update
      if (onCommentSubmit) {
        onCommentSubmit(recordId, file._id, {
          ...optimisticComment,
          isError: true,
          error: 'Failed to save comment'
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
      <h4 className="font-semibold text-sm mb-2">Comments</h4>
      <div className="space-y-3 max-h-48 overflow-y-auto mb-4">
        {comments.length > 0 ? (
          comments.map((c) => (
            <div 
              key={c._id || `temp-${c.timestamp}`} 
              className={`flex items-start gap-2 text-xs ${c.isOptimistic ? 'opacity-70' : ''} ${c.isError ? 'text-red-500' : ''}`}
            >
              <img 
                src={`https://ui-avatars.com/api/?name=${c.user?.charAt(0)}&background=random`} 
                alt={c.user} 
                className="w-8 h-8 rounded-full flex-shrink-0" 
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold">
                  {c.user} 
                  <span className="text-gray-400 font-normal ml-2">
                    {new Date(c.createdAt || c.timestamp).toLocaleString()}
                    {c.isOptimistic && ' (saving...)'}
                  </span>
                </p>
                <p className="text-gray-700 break-words">
                  {c.text}
                  {c.isError && c.error && (
                    <span className="text-red-500 text-xs block mt-1">{c.error}</span>
                  )}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-gray-500 italic">No comments yet. Be the first to comment!</p>
        )}
        <div ref={commentEndRef} />
      </div>
      
      <form onSubmit={handleSubmit} className="mt-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (error) setError('');
            }}
            placeholder="Add a comment..."
            className={`flex-1 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500`}
            disabled={isSubmitting}
          />
          <button 
            type="submit" 
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!comment.trim() || isSubmitting}
          >
            {isSubmitting ? 'Sending...' : 'Send'}
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
      </form>
    </div>
  );
};

export default CommentSection;