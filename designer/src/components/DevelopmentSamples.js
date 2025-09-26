import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import CommentSection from './CommentSection';
import Header from './Header';
import { API_BASE } from '../config';

const DevelopmentSamples = () => {
  // Header states
  const [isHeaderSeasonOpen, setIsHeaderSeasonOpen] = useState(false);
  const [selectedHeaderSeason, setSelectedHeaderSeason] = useState('SS 25');
  
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [step, setStep] = useState(1);
  const [season, setSeason] = useState('');
  const [techpackFiles, setTechpackFiles] = useState([]);
  const [specsheetFiles, setSpecsheetFiles] = useState([]);
  const [vendor, setVendor] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allRecords, setAllRecords] = useState(null);
  const [vendorGroups, setVendorGroups] = useState([]);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorRecords, setVendorRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [search, setSearch] = useState('');
  const [articleType, setArticleType] = useState('');
  const [gender, setGender] = useState('');

  const seasons = ['Spring 2025', 'Summer 2025', 'Fall 2025'];
  const allVendors = ['Sridhar', 'Naveen', 'Koushik', 'Rajesh']; // Same as brand managers
  const articleTypes = ['Tshirt', 'Shirt', 'Pants', 'Dresses', 'Jackets', 'Sweaters'];
  const genders = ['Male', 'Female', 'Unisex', 'Kids'];

  const fetchRecords = () => {
  fetch(`${API_BASE}/api/developmentsamples`)
      .then(res => res.json())
      .then(data => {
        setAllRecords(data);
        const grouped = {};
        data.forEach(item => {
          if (!grouped[item.vendor]) grouped[item.vendor] = [];
          grouped[item.vendor].push(item);
        });
        setVendorGroups(Object.entries(grouped).map(([vendor, items]) => ({
          vendor,
          count: items.length,
          lastDate: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.createdAt?.slice(0, 10) || '',
        })));
      })
      .catch(() => setAllRecords([]));
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const onDropTechpacks = useCallback(acceptedFiles => {
    setTechpackFiles(prevFiles => [...prevFiles, ...acceptedFiles]);
  }, []);

  const onDropSpecsheets = useCallback(acceptedFiles => {
    setSpecsheetFiles(prevFiles => [...prevFiles, ...acceptedFiles]);
  }, []);

  const { getRootProps: getTechpackRootProps, getInputProps: getTechpackInputProps, isDragActive: isTechpackDragActive } = useDropzone({
    onDrop: onDropTechpacks,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/pdf': [] }
  });

  const { getRootProps: getSpecsheetRootProps, getInputProps: getSpecsheetInputProps, isDragActive: isSpecsheetDragActive } = useDropzone({
    onDrop: onDropSpecsheets,
    accept: { 'image/jpeg': [], 'image/png': [], 'application/pdf': [] }
  });

  const handleSubmit = async () => {
    if (!season || !articleType || !gender || !vendor) {
      alert('Please fill in all required fields');
      return;
    }

    if (techpackFiles.length === 0 && specsheetFiles.length === 0) {
      alert('Please upload at least one file (techpack or specsheet)');
      return;
    }

    setLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('season', season);
      formData.append('articleType', articleType);
      formData.append('gender', gender);
      formData.append('vendor', vendor);
      
      // Process techpack files
      for (const file of techpackFiles) {
        // Ensure we're working with a File object
        if (file instanceof File) {
          formData.append('techpacks', file);
        } else if (file.file) {
          // Handle case where file might be in a file property
          formData.append('techpacks', file.file);
        } else {
          console.warn('Skipping invalid techpack file:', file);
        }
      }
      
      // Process specsheet files
      for (const file of specsheetFiles) {
        // Ensure we're working with a File object
        if (file instanceof File) {
          formData.append('specsheets', file);
        } else if (file.file) {
          // Handle case where file might be in a file property
          formData.append('specsheets', file.file);
        } else {
          console.warn('Skipping invalid specsheet file:', file);
        }
      }

      console.log('Submitting form with data:', {
        season, 
        articleType, 
        gender, 
        vendor,
        techpackFiles: techpackFiles.length,
        specsheetFiles: specsheetFiles.length,
        formData: Array.from(formData.entries())
      });

  const res = await fetch(`${API_BASE}/api/developmentsamples`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - let the browser set it with the correct boundary
      });

      const responseData = await res.json().catch((e) => {
        console.error('Failed to parse response:', e);
        return { error: 'Invalid server response' };
      });
      
      if (res.ok) {
        console.log('Upload successful:', responseData);
        setSuccess(true);
        // Refresh the records after successful submission
        fetchRecords();
      } else {
        console.error('Upload failed with status:', res.status, responseData);
        throw new Error(responseData.error || `Server responded with status ${res.status}`);
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert(`Upload failed: ${err.message || 'Please check console for details'}`);
    } finally {
      setLoading(false);
    }
  };
  
  const resetForm = () => {
    setShowUploadModal(false);
    setSuccess(false);
    setStep(1);
    setSeason('');
    setArticleType('');
    setGender('');
    setTechpackFiles([]);
    setSpecsheetFiles([]);
    setVendor('');
    fetchRecords(); 
  };
  
  const handleCommentSubmit = async (recordId, fileId, comment) => {
    try {
      // Remove any temporary properties from the comment
      const { isOptimistic, isError, ...cleanComment } = comment;
      
      // Make the API call to submit the comment
  const response = await fetch(`${API_BASE}/api/developmentsamples/${recordId}/files/${fileId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanComment),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Failed to submit comment');
      }

      // Refresh the record to get the latest comments
      const updatedRecord = await response.json();
      
      // Update the UI with the updated record
      setSelectedRecord(prev => (prev?._id === updatedRecord._id ? updatedRecord : prev));
      
      // Also update the records list
      setAllRecords(prev => 
        prev?.map(rec => rec._id === updatedRecord._id ? updatedRecord : rec) || []
      );
      
      setVendorRecords(prev => 
        prev?.map(rec => rec._id === updatedRecord._id ? updatedRecord : rec) || []
      );
      
      return updatedRecord;
    } catch (error) {
      console.error('Failed to submit comment:', error);
      throw error;
    }
  };

  const renderUploadModal = () => {
    const isContinueDisabled = 
        (step === 1 && (!season || !articleType || !gender)) ||
        (step === 2 && techpackFiles.length === 0 && specsheetFiles.length === 0);

    return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-4xl relative">
        <button onClick={() => setShowUploadModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-3xl">&times;</button>
        {success ? (
             <div className="flex flex-col items-center justify-center w-full py-10">
               <div className="rounded-full bg-green-100 p-6 mb-6 flex items-center justify-center">
                 <svg width="48" height="48" fill="none" viewBox="0 0 24 24" className="text-green-500"><circle cx="12" cy="12" r="10" fill="#bbf7d0"/><path d="M8 12l2 2 4-4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
               </div>
               <div className="text-xl font-semibold mb-2 text-center">Development Samples submitted to {vendor}</div>
               <div className="text-gray-500 mb-6 text-center">You can track the status from the Development Samples page.</div>
               <button className="bg-blue-600 text-white px-6 py-2 rounded-md" onClick={resetForm}>Done</button>
             </div>
        ) : (
            <>
                <h2 className="text-2xl font-bold mb-6">Upload Dev Samples</h2>
                <div className="w-full mb-8">
                    <div className="flex justify-between">
                        <div className={`text-center w-1/3 ${step >= 1 ? 'text-green-500' : 'text-gray-400'}`}>Details</div>
                        <div className={`text-center w-1/3 ${step >= 2 ? 'text-green-500' : 'text-gray-400'}`}>Files</div>
                        <div className={`text-center w-1/3 ${step >= 3 ? 'text-green-500' : 'text-gray-400'}`}>Vendor</div>
                    </div>
                    <div className="relative w-full h-1 bg-gray-200 mt-2">
                        <div className="absolute top-0 left-0 h-1 bg-green-500" style={{ width: `${((step - 1) / 2) * 100}%` }}></div>
                    </div>
                </div>

                {step === 1 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Input Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-gray-700 mb-2 font-semibold">1. Select Season</label>
                                <select value={season} onChange={e => setSeason(e.target.value)} className="w-full p-3 border rounded-lg">
                                    <option value="">Select season</option>
                                    {seasons.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-gray-700 mb-2 font-semibold">2. Article Type</label>
                                <select value={articleType} onChange={e => setArticleType(e.target.value)} className="w-full p-3 border rounded-lg">
                                    <option value="">Select article type</option>
                                    {articleTypes.map(type => <option key={type} value={type}>{type}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-gray-700 mb-2 font-semibold">3. Gender</label>
                                <select value={gender} onChange={e => setGender(e.target.value)} className="w-full p-3 border rounded-lg">
                                    <option value="">Select gender</option>
                                    {genders.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                )}
                 
                 {step === 2 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-2 text-center">Techpacks</h3>
                            <div {...getTechpackRootProps()} className={`p-10 border-2 border-dashed rounded-lg text-center flex flex-col items-center justify-center h-48 ${isTechpackDragActive ? 'border-blue-500' : 'border-gray-300'}`}>
                                <input {...getTechpackInputProps()} />
                                <p>Drag & drop a Techpack, or <span className="text-blue-500">click to upload</span></p>
                            </div>
                            <aside className="mt-4">
                                <ul className="text-sm">{techpackFiles.map(file => <li key={file.path}>{file.path}</li>)}</ul>
                            </aside>
                        </div>
                         <div>
                            <h3 className="text-lg font-semibold mb-2 text-center">Spec Sheet</h3>
                            <div {...getSpecsheetRootProps()} className={`p-10 border-2 border-dashed rounded-lg text-center flex flex-col items-center justify-center h-48 ${isSpecsheetDragActive ? 'border-blue-500' : 'border-gray-300'}`}>
                                <input {...getSpecsheetInputProps()} />
                                <p>Drag & drop an Spec Sheet, or <span className="text-blue-500">click to upload</span></p>
                            </div>
                            <aside className="mt-4">
                                <ul className="text-sm">{specsheetFiles.map(file => <li key={file.path}>{file.path}</li>)}</ul>
                            </aside>
                        </div>
                    </div>
                 )}

                 {step === 3 && (
                    <div>
                        <h3 className="text-lg font-semibold mb-4">Assign to Vendor</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {allVendors.map(v => <button key={v} onClick={() => setVendor(v)} className={`p-4 border rounded-lg hover:bg-gray-100 ${vendor === v ? 'bg-blue-100 border-blue-300' : ''}`}>{v}</button>)}
                        </div>
                    </div>
                 )}

                 <div className="flex justify-between mt-8">
                    <button onClick={() => setStep(step - 1)} disabled={step === 1} className="text-gray-600 px-6 py-2 rounded-md border disabled:opacity-50">Go back</button>
                    {step < 3 ? (
                        <button onClick={() => setStep(step + 1)} disabled={isContinueDisabled} className="bg-blue-600 text-white px-6 py-2 rounded-md disabled:bg-gray-400">Continue</button>
                    ) : (
                        <button onClick={handleSubmit} disabled={loading || !vendor} className="bg-blue-600 text-white px-6 py-2 rounded-md disabled:bg-gray-400">
                            {loading ? 'Uploading...' : 'Submit'}
                        </button>
                    )}
                </div>
            </>
        )}
      </div>
    </div>
    );
  };

  const renderFiles = (files, title) => (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      {files?.map((file) => (
        <div key={file.fileId || file._id} className="w-full mb-4">
          {file.type.startsWith('image/') ? (
            <img src={`${API_BASE}/api/file/${file.fileId}`} alt={file.name} className="rounded-lg border mb-2 max-h-48 object-contain w-full"/>
          ) : (
            <object data={`${API_BASE}/api/file/${file.fileId}`} type="application/pdf" className="w-full h-48 border rounded mb-2">
              <a href={`${API_BASE}/api/file/${file.fileId}`} target="_blank" rel="noopener noreferrer">{file.name}</a>
            </object>
          )}
          <CommentSection 
            recordId={selectedRecord._id} 
            file={file} 
            onCommentSubmit={handleCommentSubmit} 
            endpoint="developmentsamples"
          />
        </div>
      ))}
    </div>
  );

  if (selectedVendor && vendorRecords.length > 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm min-h-[60vh]">
        <div className="flex items-center text-sm text-gray-500 mb-4">
          <span 
            onClick={() => { setSelectedVendor(null); setSelectedRecord(null); }} 
            className="cursor-pointer text-blue-600 hover:underline flex items-center"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
            </svg>
            Back to Vendors
          </span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="font-semibold text-gray-700">{selectedVendor}</span>
        </div>
        
        <h1 className="text-2xl font-bold mb-6">Development Samples</h1>
        
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-200 p-3 text-sm font-medium text-gray-500">
            <div className="col-span-3">Sample Number</div>
            <div className="col-span-2">Article Type</div>
            <div className="col-span-2">Gender</div>
            <div className="col-span-2">Season</div>
            <div className="col-span-2">Submission Date</div>
            <div className="col-span-1">Files</div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {vendorRecords.map((record) => (
              <div 
                key={record._id}
                className={`grid grid-cols-12 p-3 text-sm items-center hover:bg-gray-50 cursor-pointer ${selectedRecord?._id === record._id ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedRecord(record)}
              >
                <div className="col-span-3 font-medium text-gray-900">
                  {record.developmentSampleNumber}
                </div>
                <div className="col-span-2 text-gray-700">
                  {record.articleType}
                </div>
                <div className="col-span-2 text-gray-700">
                  {record.gender}
                </div>
                <div className="col-span-2 text-gray-700">
                  {record.season}
                </div>
                <div className="col-span-2 text-gray-500">
                  {new Date(record.createdAt).toLocaleDateString()}
                </div>
                <div className="col-span-1 text-blue-600">
                  {(record.techpacks?.length || 0) + (record.specsheets?.length || 0)}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* File list panel */}
        {selectedRecord && (
          <div className="mt-6 bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">
                Files for {selectedRecord.developmentSampleNumber}
              </h3>
            </div>
            
            <div className="divide-y divide-gray-200">
              {/* Techpacks */}
              {selectedRecord.techpacks?.length > 0 && (
                <div className="p-4">
                  <h4 className="font-medium text-gray-700 mb-2">Techpacks</h4>
                  <ul className="space-y-2">
                    {selectedRecord.techpacks.map((file, index) => (
                      <li key={file.fileId || index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                          </svg>
                          <span className="text-sm text-gray-700">{file.name}</span>
                        </div>
                        <a 
                          href={`${API_BASE}/api/file/${file.fileId}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Specsheets */}
              {selectedRecord.specsheets?.length > 0 && (
                <div className="p-4">
                  <h4 className="font-medium text-gray-700 mb-2">Spec Sheets</h4>
                  <ul className="space-y-2">
                    {selectedRecord.specsheets.map((file, index) => (
                      <li key={file.fileId || index} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
                        <div className="flex items-center">
                          <svg className="h-5 w-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                          </svg>
                          <span className="text-sm text-gray-700">{file.name}</span>
                        </div>
                        <a 
                          href={`${API_BASE}/api/file/${file.fileId}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Download
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header - Fixed */}
      <div className="flex-none">
        <Header 
          selectedSeason={selectedHeaderSeason}
          onSeasonChange={setSelectedHeaderSeason}
          isSeasonOpen={isHeaderSeasonOpen}
          setIsSeasonOpen={setIsHeaderSeasonOpen}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="bg-white p-8 rounded-lg shadow-sm min-h-[60vh]">
          {showUploadModal && renderUploadModal()}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-4">
            <div>
              <h1 className="text-3xl font-bold mb-1">Development Samples</h1>
              <p className="text-gray-500">Track the status and progress of Development Samples</p>
            </div>
            <button onClick={() => setShowUploadModal(true)} className="bg-blue-600 text-white px-6 py-2 rounded-md">
                Upload Samples
            </button>
          </div>
      <div className="bg-gray-50 rounded-lg p-4 mb-6 flex items-center">
        <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z"></path></svg>
        <input className="flex-1 outline-none bg-transparent" type="text" placeholder="Search by vendor..." value={search} onChange={e => setSearch(e.target.value)}/>
      </div>
      <div className="flex flex-wrap gap-6">
        {vendorGroups.filter(v => v.vendor.toLowerCase().includes(search.toLowerCase())).map(v => (
          <div
            key={v.vendor}
            className="bg-white rounded-lg shadow p-6 w-80 border border-gray-200 cursor-pointer hover:shadow-lg"
            onClick={() => {
              setSelectedVendor(v.vendor);
              const records = allRecords.filter(r => r.vendor === v.vendor);
              setVendorRecords(records);
              setSelectedRecord(records[0]);
            }}
          >
            <div className="flex items-center mb-2">
              <div className="bg-blue-100 p-2 rounded-lg mr-2">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="24" height="24" rx="12" fill="#e0e7ff"/><rect x="7" y="7" width="10" height="10" rx="2" fill="#3b82f6"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#fff"/></svg>
              </div>
              <div className="font-semibold text-lg">{v.vendor} Sourcing Manager</div>
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-4">
              <div>
                <div className="font-semibold text-gray-700">DEVELOPMENT SAMPLES</div>
                <div>{v.count}</div>
              </div>
              <div>
                <div className="font-semibold text-gray-700">SUBMITTED ON</div>
                <div>{v.lastDate}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
        </div>
      </div>
    </div>
  );
};

export default DevelopmentSamples; 
