import React, { useState, useRef, useEffect } from 'react';

const BrandManagerSelection = ({ files, formData, onSubmit, onCancel, isSubmitting: propIsSubmitting = false }) => {
  // Brand Manager states
  const [isBrandManagerOpen, setIsBrandManagerOpen] = useState(false);
  const [selectedBrandManager, setSelectedBrandManager] = useState('');
  const [localIsSubmitting, setLocalIsSubmitting] = useState(false);
  const isSubmitting = propIsSubmitting || localIsSubmitting;
  
  // Header states
  const [isHeaderSeasonOpen, setIsHeaderSeasonOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedHeaderSeason, setSelectedHeaderSeason] = useState('SS 25');

  // Refs
  const brandManagerRef = useRef(null);
  const headerSeasonRef = useRef(null);
  const profileRef = useRef(null);

  const brandManagers = ['Sridhar', 'Naveen', 'Koushik', 'Rajesh'];
  const seasons = ['SS 25', 'FW 24', 'SS 24', 'FW 23'];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (brandManagerRef.current && !brandManagerRef.current.contains(event.target)) {
        setIsBrandManagerOpen(false);
      }
      if (headerSeasonRef.current && !headerSeasonRef.current.contains(event.target)) {
        setIsHeaderSeasonOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debug: Log when isSubmitting changes
  // Debug: Log when isSubmitting changes
  useEffect(() => {
    console.log('isSubmitting changed:', isSubmitting);
  }, [isSubmitting]);

  const handleSubmit = async () => {
    setLocalIsSubmitting(true);
    try {
      await onSubmit({
        ...formData,
        files,
        brandManager: selectedBrandManager
      });
    } finally {
      setLocalIsSubmitting(false);
    }
  };

  const handleDownloadSample = () => {
    // Here you would handle the sample file download
    console.log('Downloading sample file...');
  };

  return (
    <div className="min-h-screen overflow-y-auto bg-gray-50">
      {/* Top Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
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

      {/* Main Content */}
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Select Brand Manager</h1>
            <p className="text-gray-600 mt-2">Choose a brand manager to review your tech packs</p>
          </div>

          {/* Main Content */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            {/* Upload Summary */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Summary</h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Season:</span>
                  <span className="font-medium">{formData.season}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Article Type:</span>
                  <span className="font-medium">{formData.articleType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Gender:</span>
                  <span className="font-medium">{formData.gender}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Files:</span>
                  <span className="font-medium">{files.length} Tech Pack{files.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>

            {/* Brand Manager Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Brand Manager</label>
              <div className="relative" ref={brandManagerRef}>
                <button
                  type="button"
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-50"
                  onClick={() => setIsBrandManagerOpen(!isBrandManagerOpen)}
                >
                  <span>{selectedBrandManager || 'Select Brand Manager'}</span>
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isBrandManagerOpen && (
                  <div className="absolute mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                    {brandManagers.map((manager) => (
                      <button
                        key={manager}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                        onClick={() => {
                          setSelectedBrandManager(manager);
                          setIsBrandManagerOpen(false);
                        }}
                      >
                        {manager}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Download Sample */}
            <div className="mb-8">
              <button
                onClick={handleDownloadSample}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Sample Tech Pack
              </button>
            </div>

            {/* Actions */}
            <div className="flex space-x-4">
              <button
                onClick={onCancel}
                className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedBrandManager || isSubmitting}
                className={`flex-1 py-3 px-4 rounded-lg text-white font-medium flex items-center justify-center ${
                  !selectedBrandManager || isSubmitting
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrandManagerSelection; 