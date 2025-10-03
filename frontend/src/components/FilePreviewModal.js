import React from 'react';
import { API_BASE } from '../config';

/**
 * Generic modal to preview an uploaded file (image or PDF).
 * Props:
 *  - file: { name, fileId, type }
 *  - onClose: function
 */
const FilePreviewModal = ({ file, onClose }) => {
  if (!file) return null;

  const isPdf = (file.type === 'application/pdf') || (file.name && file.name.toLowerCase().endsWith('.pdf'));
  const isImage = (file.type && file.type.startsWith('image/')) || (file.name && /\.(jpg|jpeg|png|gif)$/i.test(file.name));

  const src = `${API_BASE}/api/file/${file.fileId}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70" onClick={onClose}>
      <div className="bg-white p-4 rounded shadow-lg max-w-full max-h-full overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold truncate max-w-md" title={file.name}>{file.name}</h2>
          <button onClick={onClose} className="text-gray-600 hover:text-black text-xl leading-none">&times;</button>
        </div>
        {isImage && (
          <img src={src} alt={file.name} className="max-w-full max-h-[80vh] object-contain" />
        )}
        {isPdf && (
          <object data={src} type="application/pdf" className="w-[80vw] h-[80vh]">
            <p>Your browser does not support PDF preview. <a href={src} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Download</a></p>
          </object>
        )}
        {!isPdf && !isImage && (
          <a href={src} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Open file</a>
        )}
      </div>
    </div>
  );
};

export default FilePreviewModal;
