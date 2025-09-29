
import React, { useState, useRef, useEffect } from 'react';
import BrandManagerSelection from './BrandManagerSelection';
import PastUploads from './PastUploads';
import Header from './Header';
import ManagerCommentsSidebar from './ManagerCommentsSidebar';
import AiHelpBot from './AiHelpBot';
import { useSharedPDFs } from '../context/SharedPDFContext';
import socket from '../socket';
import { API_BASE } from '../config';

const TechPacks = () => {
  // Sidebar state
  const [showCommentsSidebar, setShowCommentsSidebar] = useState(false);
  // Header states
  const [isHeaderSeasonOpen, setIsHeaderSeasonOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedHeaderSeason, setSelectedHeaderSeason] = useState('SS 25');
  const [isHelpBotOpen, setIsHelpBotOpen] = useState(false);
  
  // Form states
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showBrandManagerPage, setShowBrandManagerPage] = useState(false);
  const [isFormSeasonOpen, setIsFormSeasonOpen] = useState(false);
  const [isArticleTypeOpen, setIsArticleTypeOpen] = useState(false);
  const [isGenderOpen, setIsGenderOpen] = useState(false);
  const [isBrandOpen, setIsBrandOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [formData, setFormData] = useState({
    season: 'SS 25',
    articleType: '',
    gender: '',
    brand: '',
    brandManager: ''
  });
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [submissionDetails, setSubmissionDetails] = useState({
    count: 0,
    brandManager: ''
  });
  const [fileDetails, setFileDetails] = useState([]);
  const [uploadedTechPacks, setUploadedTechPacks] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);


  // --- PDF Preview Modal State ---
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // --- Manager Cards State ---
  const [managerGroups, setManagerGroups] = useState([]);
  const [selectedManager, setSelectedManager] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'count', direction: 'desc' });

  // Fetch tech packs from backend when component mounts (no pagination)
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchTechPacks = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/tech-packs?t=${Date.now()}`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to fetch tech packs');
        }
        const data = await res.json();
        const items = Array.isArray(data)
          ? data
          : Array.isArray(data.docs)
            ? data.docs
            : Array.isArray(data.items)
              ? data.items
              : [];
        if (isMounted) {
          setUploadedTechPacks(items);
          console.log(`Fetched tech packs: ${items.length}`);
        }
      } catch (err) {
        if (err.name !== 'AbortError' && isMounted) {
          console.error('❌ Error fetching tech packs:', err);
        }
      }
    };

    fetchTechPacks();
    const refreshInterval = setInterval(fetchTechPacks, 30000);
    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(refreshInterval);
    };
  }, []);

  // Refs
  const headerSeasonRef = useRef(null);
  const formSeasonRef = useRef(null);
  const profileRef = useRef(null);
  const fileInputRef = useRef(null);

  const seasons = ['SS 25', 'FW 24', 'SS 24', 'FW 23'];
  const articleTypes = ['T-Shirts', 'Shirts', 'Pants', 'Dresses', 'Jackets', 'Sweaters'];
  const genders = ['Men', 'Women', 'All Genders', 'Kids'];
  const brands = ['Myntra', 'H&M', 'Zara', 'Nike', 'Adidas', 'Puma', 'Levis', 'Tommy Hilfiger', 'Calvin Klein', 'Forever 21'];

  const { addSharedPDF } = useSharedPDFs();

  // Handle sort request
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Get filtered and sorted manager groups
  const getFilteredAndSortedManagerGroups = () => {
    let filteredGroups = managerGroups;

    // Filter by search term
    if (searchTerm) {
      filteredGroups = managerGroups.filter(group =>
        group.manager.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Sort groups
    return [...filteredGroups].sort((a, b) => {
      if (sortConfig.key === 'count') {
        if (sortConfig.direction === 'asc') {
          return a.count - b.count;
        } else {
          return b.count - a.count;
        }
      }
      if (sortConfig.key === 'manager') {
        const aName = a.manager.toLowerCase();
        const bName = b.manager.toLowerCase();
        if (sortConfig.direction === 'asc') {
          return aName.localeCompare(bName);
        } else {
          return bName.localeCompare(aName);
        }
      }
      if (sortConfig.key === 'lastDate') {
        const aDate = a.lastDate || '';
        const bDate = b.lastDate || '';
        if (sortConfig.direction === 'asc') {
          return aDate.localeCompare(bDate);
        } else {
          return bDate.localeCompare(aDate);
        }
      }
      return 0;
    });
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (headerSeasonRef.current && !headerSeasonRef.current.contains(event.target)) {
        setIsHeaderSeasonOpen(false);
      }
      if (formSeasonRef.current && !formSeasonRef.current.contains(event.target)) {
        setIsFormSeasonOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  
  

  // Function to create basic file details
  const createFileDetails = (file) => {
    const previewUrl = URL.createObjectURL(file);
    return {
      name: file.name,
      description: '',
      articleType: formData.articleType || '',
      colour: '',
      fit: '',
      gender: formData.gender || '',
      printTechnique: '',
      status: 'DRAFT',
      previewUrl: previewUrl,
      pdfUrl: previewUrl,
      totalPages: 1
    };
  };

  // File selection handler (PDF only, with validation)
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    const maxFileSize = 500 * 1024 * 1024; // 500MB
    
    // Validate file sizes
    const oversizedFiles = pdfFiles.filter(file => file.size > maxFileSize);
    if (oversizedFiles.length > 0) {
      alert(`The following files exceed the 500MB limit: ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }
    
    setSelectedFiles(pdfFiles);
    const details = pdfFiles.map(file => createFileDetails(file));
    setFileDetails(details);
  };

  // Update remove file handler
  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setFileDetails(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      setIsSubmitting(false);
      setShowBrandManagerPage(true);
    }
  };

  // Submit handler for brand manager
  const handleSubmitToBrandManager = async (submissionData) => {
    setIsSubmitting(true);
    try {
      const results = await Promise.all(fileDetails.map(async (detail, index) => {
        const formData = new FormData();
  
        // Add PDF file
        formData.append('pdf', selectedFiles[index]);
  
        // Basic metadata
        const metadata = {
          name: detail.name || `file-${Date.now()}`,
          description: detail.description || '',
          articletype: detail.articleType || '',
          colour: detail.colour || '',
          fit: detail.fit || '',
          gender: detail.gender || '',
          printtechnique: detail.printTechnique || '',
          brand: (submissionData.brand || detail.brand || ''),
          status: 'SUBMITTED',
          previewUrl: detail.previewUrl || '',
          totalPages: detail.totalPages || 1,
          brandManager: submissionData.brandManager,
          styleId: detail.name || `style-${Date.now()}`,
          timestamp: new Date().toISOString()
        };
  
        formData.append('metadata', JSON.stringify(metadata));
  
        // Send to backend
        const res = await fetch(`${API_BASE}/api/tech-packs`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage = errorData.details || errorData.error || `HTTP ${res.status}: ${res.statusText}`;
          throw new Error(`Upload failed: ${errorMessage}`);
        }
        const saved = await res.json();
        return saved;
      }));
  
      // Files uploaded successfully
  
      // Update state after successful uploads, merging backend file metadata
      setUploadedTechPacks(prev => [
        ...prev,
        ...results.map((saved, idx) => ({
          ...fileDetails[idx],
          _id: saved.id || saved._id,
          file: saved.file,
          s3Key: saved.s3Key,
          bucket: saved.bucket
        }))
      ]);
      setSubmissionDetails({
        count: fileDetails.length,
        brandManager: submissionData.brandManager
      });
      setShowBrandManagerPage(false);
      setShowUploadForm(false);
      setShowSuccessScreen(true);
      setSelectedFiles([]);
      setFileDetails([]);
      setFormData({ season: 'SS 25', articleType: '', gender: '' });
    } catch (err) {
      console.error('❌ Submission failed:', err);
      const errorMessage = err.message || 'Unknown error occurred';
      alert(`Error uploading tech packs: ${errorMessage}\n\nPlease check your internet connection and try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  

  const handleGoToTechPacks = () => {
    setShowSuccessScreen(false);
    // Here you would typically navigate to the Tech Packs page
    // Navigate to Tech Packs page
  };

  // PDF Preview Modal logic
  const openPreview = (index) => {
    setPreviewIndex(index);
    setIsPreviewOpen(true);
  };
  const closePreview = () => setIsPreviewOpen(false);

  // After upload, group by manager for cards
  useEffect(() => {
    if (uploadedTechPacks && uploadedTechPacks.length > 0) {
      const grouped = {};
      uploadedTechPacks.forEach(item => {
        if (!grouped[item.brandManager]) grouped[item.brandManager] = [];
        grouped[item.brandManager].push(item);
      });
      setManagerGroups(Object.entries(grouped).map(([manager, items]) => ({
        manager,
        count: items.length,
        lastDate: items[items.length - 1].createdAt?.slice(0, 10) || '',
      })));
    }
  }, [uploadedTechPacks]);

  if (showSuccessScreen) {
    return (
      <div className="w-full h-[100vh] max-h-screen flex flex-col bg-gray-50">
        {/* Top Header */}
        <div className="w-full bg-white border-b border-gray-200">
          <div className="flex justify-between items-center px-6 py-4">
            {/* Header Season Dropdown */}
            <div className="relative" ref={headerSeasonRef}>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">SEASON</span>
                <div 
                  onClick={() => setIsHeaderSeasonOpen(!isHeaderSeasonOpen)}
                  className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50"
                >
                  <span className="text-sm font-medium">{selectedHeaderSeason}</span>
                  <svg 
                    className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isHeaderSeasonOpen ? 'transform rotate-180' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Header Season Dropdown Menu */}
              {isHeaderSeasonOpen && (
                <div className="absolute mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                  {seasons.map((season) => (
                    <button
                      key={season}
                      onClick={() => {
                        setSelectedHeaderSeason(season);
                        setIsHeaderSeasonOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                        selectedHeaderSeason === season ? 'bg-gray-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      {season}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right Side Icons */}
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <div className="relative">
                <button className="p-2 hover:bg-gray-100 rounded-full">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">2</span>
                </button>
              </div>

              {/* Profile Picture and Dropdown */}
              <div className="relative" ref={profileRef}>
                <button 
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-200 hover:border-gray-300 focus:outline-none focus:border-blue-500"
                >
                  <img
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                </button>

                {/* Profile Dropdown Menu */}
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center">
                      <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Profile
                    </button>
                    <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center">
                      <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                      Change Password
                    </button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 flex items-center">
                      <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Success Message Content */}
        <div className="w-full flex-1 overflow-auto">
          <div className="flex items-center justify-center h-full p-6">
            <div className="w-full max-w-lg text-center">
              {/* Success Icon */}
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              {/* Success Message */}
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {submissionDetails.count} techpacks have been submitted to
              </h2>
              <p className="text-lg font-semibold text-gray-900 mb-4">
                {submissionDetails.brandManager} (Brand Manager)
              </p>

              {/* Status Message */}
              <p className="text-gray-600 mb-8">
                You can track status from Tech Packs page under "Submitted" status.
              </p>

              {/* Action Button */}
              <button
                onClick={handleGoToTechPacks}
                className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200"
              >
                Go to Tech Packs
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showBrandManagerPage) {
    return (
      <BrandManagerSelection
        files={selectedFiles}
        formData={formData}
        onSubmit={handleSubmitToBrandManager}
        onCancel={() => setShowBrandManagerPage(false)}
      />
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

      {/* AI Help Bot Component */}
      <AiHelpBot 
        isOpen={isHelpBotOpen}
        onClose={() => setIsHelpBotOpen(false)}
      />

      {/* Page Header - Fixed */}
      <div className="flex-none bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Tech Packs</h1>
              <p className="text-sm text-gray-600 mt-1">View and manage your tech packs</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUploadForm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Upload Tech Packs
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-auto">
        {showUploadForm ? (
          <div className="p-6">
            <div className="max-w-2xl mx-auto bg-white rounded-lg border border-gray-200">
              {/* Form Header - Fixed */}
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Upload Tech Packs</h2>
              </div>

              {/* Form Content - Scrollable */}
              <div className="p-6">
                <div className="space-y-6">
                  {/* Season, Article Type, Gender Dropdowns */}
                  <div className="space-y-6">
                    {/* Form Season Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Season</label>
                      <div className="relative" ref={formSeasonRef}>
                        <button
                          type="button"
                          className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
                          onClick={() => setIsFormSeasonOpen(!isFormSeasonOpen)}
                        >
                          <span>{formData.season}</span>
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isFormSeasonOpen && (
                          <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                            {seasons.map((season) => (
                              <button
                                key={season}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, season }));
                                  setIsFormSeasonOpen(false);
                                }}
                              >
                                {season}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Article Type Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Article Type</label>
                      <div className="relative">
                        <button
                          type="button"
                          className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
                          onClick={() => setIsArticleTypeOpen(!isArticleTypeOpen)}
                        >
                          <span>{formData.articleType || 'Select article type'}</span>
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isArticleTypeOpen && (
                          <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                            {articleTypes.map((type) => (
                              <button
                                key={type}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, articleType: type }));
                                  setIsArticleTypeOpen(false);
                                }}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Gender Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                      <div className="relative">
                        <button
                          type="button"
                          className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
                          onClick={() => {
                            setIsGenderOpen(!isGenderOpen);
                            setIsBrandOpen(false);
                          }}
                        >
                          <span>{formData.gender || 'Select gender'}</span>
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isGenderOpen && (
                          <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                            {genders.map((gender) => (
                              <button
                                key={gender}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, gender }));
                                  setIsGenderOpen(false);
                                }}
                              >
                                {gender}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Brand Dropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                      <div className="relative">
                        <button
                          type="button"
                          className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
                          onClick={() => {
                            setIsBrandOpen(!isBrandOpen);
                            setIsGenderOpen(false);
                          }}
                        >
                          <span>{formData.brand || 'Select brand'}</span>
                          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isBrandOpen && (
                          <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                            {brands.map((brand) => (
                              <button
                                key={brand}
                                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, brand }));
                                  setIsBrandOpen(false);
                                }}
                              >
                                {brand}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* File Upload Button */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Upload PDFs</label>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="application/pdf"
                      multiple
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current.click()}
                      className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 focus:outline-none"
                    >
                      <div className="flex flex-col items-center">
                        <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="text-sm text-gray-600">Click to select PDFs or drag and drop</span>
                        <span className="text-xs text-gray-500 mt-1">You can select multiple files</span>
                      </div>
                    </button>
                  </div>

                  {/* Selected Files List - Scrollable Container */}
                  {selectedFiles.length > 0 && (
                    <div className="mt-4">
                      <div className="max-h-[40vh] overflow-y-auto border border-gray-200 rounded-lg">
                        {selectedFiles.map((file, index) => (
                          <div
                            key={`${file.name}-${index}`}
                            className="flex items-center justify-between p-4 border-b border-gray-200 last:border-b-0"
                          >
                            <div className="flex items-center space-x-3">
                              <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                                <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openPreview(index)}
                                className="p-1 hover:bg-blue-100 rounded-full flex-shrink-0 text-blue-600 border border-blue-200"
                              >
                                Preview
                              </button>
                            <button
                              onClick={() => removeFile(index)}
                              className="p-1 hover:bg-gray-200 rounded-full flex-shrink-0"
                            >
                              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons and Help Link Container */}
              <div className="border-t border-gray-200">
                {/* Action Buttons */}
                <div className="px-6 py-4 bg-gray-50">
                  <div className="flex space-x-4">
                    <button
                      onClick={() => {
                        setShowUploadForm(false);
                        setSelectedFiles([]);
                      }}
                      className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpload}
                      disabled={!formData.articleType || !formData.gender || selectedFiles.length === 0}
                      className={`flex-1 py-3 px-4 rounded-lg text-white font-medium ${
                        !formData.articleType || !formData.gender || selectedFiles.length === 0
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>

                {/* Help Link - Now positioned below action buttons */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
                  <div className="flex justify-center">
                    <button
                      onClick={() => setIsHelpBotOpen(true)}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center"
                    >
                      <svg 
                        className="w-4 h-4 mr-1" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth="2" 
                          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" 
                        />
                      </svg>
                      Need Help?
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : showBrandManagerPage ? (
          <BrandManagerSelection
            key={`brand-manager-${isSubmitting}`}
            files={selectedFiles}
            formData={formData}
            onSubmit={handleSubmitToBrandManager}
            onCancel={() => setShowBrandManagerPage(false)}
            isSubmitting={isSubmitting}
          />
        ) : !selectedManager ? (
          managerGroups.length > 0 && (
            <div className="p-6">
              {/* Search and Sort Controls */}
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
                <div className="relative">
                  <select
                    className="appearance-none bg-white border border-gray-300 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    value={sortConfig.key}
                    onChange={(e) => requestSort(e.target.value)}
                  >
                    <option value="count">Sort by Count</option>
                    <option value="manager">Sort by Name</option>
                    <option value="lastDate">Sort by Date</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Manager Cards */}
              <div className="flex flex-wrap gap-6 justify-start">
                {getFilteredAndSortedManagerGroups().map(m => (
                  <div
                    key={m.manager}
                    className="bg-white rounded-lg shadow p-6 w-80 border border-gray-200 cursor-pointer hover:shadow-lg"
                    onClick={() => setSelectedManager(m.manager)}
                  >
                    <div className="flex items-center mb-2">
                      <div className="bg-blue-100 p-2 rounded-lg mr-2">
                        <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect width="24" height="24" rx="12" fill="#e0e7ff"/><rect x="7" y="7" width="10" height="10" rx="2" fill="#3b82f6"/><rect x="9" y="9" width="6" height="6" rx="1" fill="#fff"/></svg>
                      </div>
                      <div className="font-semibold text-lg">{m.manager} Manager</div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-4">
                      <div>
                        <div className="font-semibold text-gray-700">TECH PACKS</div>
                        <div>{m.count}</div>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-700">SUBMITTED ON</div>
                        <div>{m.lastDate || '-'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ) : (
          <PastUploads 
            uploadedFiles={uploadedTechPacks} 
            setShowUploadForm={setShowUploadForm}
            isLoading={false}
            selectedManager={selectedManager}
            setSelectedManager={setSelectedManager}
          />
        )}

        {/* PDF Preview Modal */}
        {isPreviewOpen && selectedFiles.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={closePreview}>
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-3xl w-full relative" onClick={e => e.stopPropagation()}>
              <button className="absolute top-2 right-2 text-gray-500 hover:text-gray-700" onClick={closePreview} aria-label="Close">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <h3 className="font-semibold text-lg mb-4">PDF Preview</h3>
              <div className="bg-gray-50 rounded-lg flex items-center justify-center min-h-[400px] max-h-[80vh] w-full relative">
                {selectedFiles.length > 1 && (
                  <button
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-white rounded-full shadow p-2 z-10"
                    onClick={() => setPreviewIndex(i => (i - 1 + selectedFiles.length) % selectedFiles.length)}
                    aria-label="Previous file"
                  >
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
                  </button>
                )}
                <iframe
                  src={URL.createObjectURL(selectedFiles[previewIndex])}
                  title={selectedFiles[previewIndex].name}
                  className="w-full h-[70vh] rounded border bg-white"
                  frameBorder="0"
                />
                {selectedFiles.length > 1 && (
                  <button
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-white rounded-full shadow p-2 z-10"
                    onClick={() => setPreviewIndex(i => (i + 1) % selectedFiles.length)}
                    aria-label="Next file"
                  >
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                  </button>
                )}
              </div>
              {selectedFiles.length > 1 && (
                <div className="mt-2 text-sm text-gray-500">File {previewIndex + 1} of {selectedFiles.length}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TechPacks;