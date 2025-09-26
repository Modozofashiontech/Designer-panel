/**
 * Utility functions for handling comments in the designer panel
 * Syncs with vendor panel comment system
 */

import { API_BASE } from '../config';

/**
 * Adds a comment to a document
 * @param {string} documentId - The ID of the document to add the comment to
 * @param {string} fileId - The ID of the file to add the comment to (optional)
 * @param {string} text - The comment text
 * @param {string} user - The user adding the comment
 * @param {string} endpoint - The API endpoint (e.g., 'pantone', 'printstrike', 'preproduction')
 * @returns {Promise<Object>} The updated document with the new comment
 */
export const addComment = async (...args) => {
  let documentId, fileId = null, text, user, endpoint;
  if (args.length === 5) {
    [documentId, fileId, text, user, endpoint] = args;
  } else if (args.length === 4) {
    [documentId, text, user, endpoint] = args;
  } else {
    throw new Error('addComment expects 4 or 5 arguments');
  }

  try {
    const baseUrl = `${API_BASE}/api/${endpoint}/${documentId}`;
    const url = fileId ? `${baseUrl}/files/${fileId}/comments` : `${baseUrl}/comments`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, user }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'Failed to add comment');
    }

    const result = await response.json();
    
    // Ensure the response has the expected structure
    if (!result.document) {
      // If the server doesn't return the full document, construct it
      return {
        ...result,
        document: {
          ...(result.document || {}),
          comments: result.comments || []
        }
      };
    }
    
    return result;
  } catch (error) {
    console.error('Error adding comment:', error);
    throw error;
  }
};

/**
 * Creates an optimistic comment object for immediate UI update
 * @param {string} text - The comment text
 * @param {string} user - The user adding the comment
 * @returns {Object} A comment object with a temporary ID
 */
export const createOptimisticComment = (text, user) => ({
  _id: `temp-${Date.now()}`,
  text,
  user,
  createdAt: new Date().toISOString(),
  isOptimistic: true,
});

/**
 * Updates the selected document and list after adding a comment
 * @param {Object} selectedDoc - The currently selected document
 * @param {string} fileId - The ID of the file to update
 * @param {Object} newComment - The new comment to add
 * @param {Function} setSelectedDoc - State setter for the selected document
 * @param {Function} setList - State setter for the document list
 * @returns {Object} The updated document
 */
export const updateDocWithNewComment = (...args) => {
  // Supports two signatures:
  // 1) (selectedDoc, fileId, newComment, setSelectedDoc, setList)
  // 2) (selectedDoc, newComment, setSelectedDoc, setList)  // document-level comments
  let selectedDoc, fileId, newComment, setSelectedDoc, setList;
  if (args.length === 5) {
    [selectedDoc, fileId, newComment, setSelectedDoc, setList] = args;
  } else if (args.length === 4) {
    [selectedDoc, newComment, setSelectedDoc, setList] = args;
    fileId = null;
  } else {
    // Unexpected usage; no-op
    return args[0];
  }

  if (!selectedDoc) return selectedDoc;
  const updatedDoc = { ...selectedDoc };

  if (fileId) {
    const files = Array.isArray(updatedDoc.files) ? [...updatedDoc.files] : [];
    const fileIndex = files.findIndex(f => f && f._id === fileId);
    if (fileIndex !== -1) {
      const file = { ...(files[fileIndex] || {}) };
      file.comments = [ ...(file.comments || []), newComment ];
      files[fileIndex] = file;
      updatedDoc.files = files;
    }
  } else {
    updatedDoc.comments = [ ...(updatedDoc.comments || []), newComment ];
  }

  if (typeof setSelectedDoc === 'function') setSelectedDoc(updatedDoc);

  if (typeof setList === 'function') {
    setList(prevList => {
      if (!Array.isArray(prevList)) return prevList;
      return prevList.map(doc => (doc && doc._id === updatedDoc._id ? updatedDoc : doc));
    });
  }

  return updatedDoc;
};

/**
 * Validates a comment before submission
 * @param {string} text - The comment text to validate
 * @returns {{isValid: boolean, error: string}} Validation result
 */
export const validateComment = (text) => {
  if (!text || text.trim().length === 0) {
    return { isValid: false, error: 'Comment cannot be empty' };
  }
  if (text.length > 1000) {
    return { isValid: false, error: 'Comment is too long (max 1000 characters)' };
  }
  return { isValid: true, error: '' };
};

/**
 * Sorts comments by date (newest first)
 * @param {Array} comments - Array of comment objects
 * @returns {Array} Sorted array of comments
 */
export const sortCommentsByDate = (comments = []) => {
  return [...comments].sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
};
