import React from 'react';

const ManagerCommentsSidebar = ({ open, onClose, manager, records, type, onRecordClick }) => {
  // Debug: log props so we can see whether manager/records are passed when opened
  console.debug('ManagerCommentsSidebar props:', { 
    open, 
    manager, 
    recordsLength: (records || []).length, 
    firstRecord: (records || [])[0],
    allRecords: records
  });
  if (!open) return null;

  // Group comments by record (Pantone, PrintStrike, PreProduction, TechPacks, LineSheets)
  // Only show records that have comments
  const grouped = (records || []).filter(r => {
    const hasComments = r.comments && r.comments.length > 0;
    console.debug('Record filtering:', {
      recordId: r._id,
      hasComments,
      manager: manager,
      recordManager: r.manager,
      recordBrandManager: r.brandManager,
      brandManagerType: typeof r.brandManager,
      brandManagerName: r.brandManager?.name
    });
    
    if (!hasComments) return false;
    
    // Check different manager field formats
    const managerMatch = 
      r.manager === manager || // For Pantone, PrintStrike, PreProduction (string)
      r.brandManager === manager || // For TechPacks (string)
      (r.brandManager && r.brandManager.toString() === manager) || // For LineSheets (ObjectId)
      (r.brandManager && typeof r.brandManager === 'object' && r.brandManager._id === manager) || // Populated brandManager by ID
      (r.brandManager && typeof r.brandManager === 'object' && r.brandManager.name === manager); // Populated brandManager by name
    
    console.debug('Manager match result:', { managerMatch });
    return managerMatch;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-30 transition-opacity duration-300" 
        onClick={onClose}
      ></div>
      {/* Sidebar */}
      <div className="relative w-full max-w-md h-full bg-white shadow-xl p-6 overflow-y-auto transform transition-transform duration-300 ease-in-out">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{type} Comments - {manager}</h2>
          <button onClick={onClose} className="text-2xl font-bold text-gray-400 hover:text-gray-700">&times;</button>
        </div>
        {grouped.length === 0 ? (
          <div className="text-gray-400">No records found for this manager.</div>
        ) : (
          grouped.map((rec, idx) => (
            <div key={rec._id || idx} className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-gray-100 rounded p-2">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h-4a2 2 0 00-2 2v3a2 2 0 002 2h4a2 2 0 002-2V5a2 2 0 00-2-2z" /></svg>
                </div>
                <div 
                  className="font-bold text-lg text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                  onClick={() => onRecordClick && onRecordClick(rec)}
                >
                  {(() => {
                    console.log('Record data:', rec);
                    if (type === 'PreProduction') {
                      return rec.preProductionNumber || rec.preproductionNumber;
                    }
                    if (type === 'PrintStrike') {
                      return rec.printStrikeNumber || rec.printstrike;
                    }
                    if (type === 'Tech Pack') {
                      return rec.name || rec.filename || rec.originalName || 'Tech Pack';
                    }
                    return rec.preProductionNumber || rec.printStrikeNumber || rec.pantoneNumber || rec.name || rec.styleId || 'Record';
                  })()}
                </div>
              </div>
              {(rec.comments && rec.comments.length > 0) ? (
                rec.comments.map((comment, cidx) => (
                  <div key={cidx} className="mb-4 ml-8">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-700">{comment.author || comment.user || 'User'}:</span>
                      <span className="text-xs text-gray-400">{new Date(comment.timestamp || comment.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="text-gray-700 ml-2">{comment.comment || comment.text}</div>
                  </div>
                ))
              ) : (
                <div className="ml-8 text-gray-400">No comments.</div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ManagerCommentsSidebar;
