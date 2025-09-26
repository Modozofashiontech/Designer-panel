import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Header from './Header';
import ManagerCard from './ManagerCard';

const API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:5000/api`;

const AssortmentPlans = () => {
  const [selectedHeaderSeason, setSelectedHeaderSeason] = useState('All');
  const [isHeaderSeasonOpen, setIsHeaderSeasonOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showDetailView, setShowDetailView] = useState(false);
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assortmentPlans, setAssortmentPlans] = useState([]);
  const [detailedData, setDetailedData] = useState([]);

  // Fetch assortment plans on component mount
  useEffect(() => {
    const fetchAssortmentPlans = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get(`${API_BASE_URL}/assortment-plans`);
        setAssortmentPlans(response.data);
      } catch (err) {
        console.error('Error fetching assortment plans:', err);
        setError('Failed to load assortment plans. Please try again later.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssortmentPlans();
  }, []);

  // Fetch detailed data when a plan is selected
  useEffect(() => {
    if (selectedPlan) {
      const fetchPlanDetails = async () => {
        try {
          const response = await axios.get(`${API_BASE_URL}/assortment-plans/${selectedPlan._id}`);
          setDetailedData(response.data.details || []);
        } catch (err) {
          console.error('Error fetching plan details:', err);
          setError('Failed to load plan details. Please try again.');
          setDetailedData([]);
        }
      };

      fetchPlanDetails();
    }
  }, [selectedPlan]);

  // Filter plans based on search and season
  const filteredPlans = assortmentPlans.filter(plan => {
    const searchLower = searchQuery.toLowerCase();
    const title = plan?.title?.toString() || '';
    const season = plan?.season?.toString() || '';
    
    const matchesSearch = title.toLowerCase().includes(searchLower);
    const matchesSeason = selectedHeaderSeason === 'All' || season === selectedHeaderSeason;
    return matchesSearch && matchesSeason;
  });

  // Get unique seasons for filter
  const seasons = ['All', ...new Set(assortmentPlans.map(plan => plan.season))];

  const handlePlanClick = async (plan) => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/assortment-plans/${plan._id}`);
      setSelectedPlan(response.data);
      setShowDetailView(true);
    } catch (err) {
      console.error('Error fetching plan details:', err);
      setError('Failed to load plan details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackClick = () => {
    setShowDetailView(false);
    setSelectedPlan(null);
    setDetailSearchQuery('');
    setShowFilters(false);
  };

  const filteredDetailedData = detailedData.filter(item => {
    if (!detailSearchQuery) return true;
    
    const searchLower = detailSearchQuery.toLowerCase();
    const category = item?.category?.toString() || '';
    const range = item?.range?.toString() || '';
    const ppSegment = item?.ppSegment?.toString() || '';
    const basicFashion = item?.basicFashion?.toString() || '';
    
    return (
      category.toLowerCase().includes(searchLower) ||
      range.toLowerCase().includes(searchLower) ||
      ppSegment.toLowerCase().includes(searchLower) ||
      basicFashion.toLowerCase().includes(searchLower)
    );
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

      {/* Loading and Error States */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg m-4">
          {error}
        </div>
      )}

      {/* Page Header */}
      <div className="flex-none bg-white border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            {showDetailView ? (
              <div className="flex items-center">
                <button
                  onClick={handleBackClick}
                  className="mr-4 text-gray-600 hover:text-gray-900"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {selectedPlan?.title}
                  </h1>
                  <p className="text-sm text-gray-600 mt-1">View detailed assortment plan</p>
                </div>
              </div>
            ) : (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Assortment Plans</h1>
                <p className="text-sm text-gray-600 mt-1">View all assortment plans and their statuses</p>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {showDetailView ? (
          <div>
            {/* Search and Filter Bar */}
            <div className="mb-6 flex items-center space-x-4">
              <div className="flex-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by category, range, segment..."
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={detailSearchQuery}
                  onChange={(e) => setDetailSearchQuery(e.target.value)}
                />
              </div>
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex justify-between w-32 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  onClick={() => setIsHeaderSeasonOpen(!isHeaderSeasonOpen)}
                >
                  {selectedHeaderSeason}
                  <svg className="w-5 h-5 ml-2 -mr-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                {isHeaderSeasonOpen && (
                  <div className="absolute z-10 w-32 mt-1 bg-white rounded-md shadow-lg">
                    <div className="py-1 max-h-60 overflow-auto" role="menu" aria-orientation="vertical">
                      {seasons.map((season) => (
                        <button
                          key={season}
                          className={`block w-full text-left px-4 py-2 text-sm ${selectedHeaderSeason === season ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
                          onClick={() => {
                            setSelectedHeaderSeason(season);
                            setIsHeaderSeasonOpen(false);
                          }}
                        >
                          {season}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span>Filter</span>
              </button>
            </div>

            {/* Filter Panel */}
            {showFilters && (
              <div className="mb-6 bg-white p-4 rounded-lg border border-gray-200">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                    <select className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                      <option value="">All Categories</option>
                      <option value="sweatshirt">SweatShirt</option>
                      <option value="tshirt">T-Shirt</option>
                      <option value="polo">Polo</option>
                      <option value="hoodie">Hoodie</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Range</label>
                    <select className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                      <option value="">All Ranges</option>
                      <option value="roadster">Roadster</option>
                      <option value="hrx">HRX</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">PP Segment</label>
                    <select className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                      <option value="">All Segments</option>
                      <option value="elpp">ELPP</option>
                      <option value="mass">MASS</option>
                      <option value="mass-premium">MASS PREMIUM</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                    <select className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                      <option value="">All Types</option>
                      <option value="basic">Basic</option>
                      <option value="fashion">Fashion</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-white rounded-lg border border-gray-200">
              {/* Table Header */}
              <div className="grid grid-cols-10 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200">
                <div className="text-sm font-medium text-gray-500">Category</div>
                <div className="text-sm font-medium text-gray-500">Range</div>
                <div className="text-sm font-medium text-gray-500">MRP</div>
                <div className="text-sm font-medium text-gray-500">MIX</div>
                <div className="text-sm font-medium text-gray-500">ASRP</div>
                <div className="text-sm font-medium text-gray-500">PP Segment</div>
                <div className="text-sm font-medium text-gray-500">Basic/Fashion</div>
                <div className="text-sm font-medium text-gray-500">Discount</div>
                <div className="text-sm font-medium text-gray-500">Depth</div>
                <div className="text-sm font-medium text-gray-500">Qty</div>
              </div>

              {/* Table Body */}
              {filteredDetailedData.map((row, index) => (
                <div key={index} className="grid grid-cols-10 gap-4 px-6 py-4 border-b border-gray-200 hover:bg-gray-50">
                  <div className="text-sm text-gray-900">{row.category}</div>
                  <div className="text-sm text-gray-900">{row.range}</div>
                  <div className="text-sm text-gray-900">{row.mrp}</div>
                  <div className="text-sm text-gray-900">{row.mix}</div>
                  <div className="text-sm text-gray-900">{row.asrp}</div>
                  <div className="text-sm text-gray-900">{row.ppSegment}</div>
                  <div className="text-sm text-gray-900">{row.basicFashion}</div>
                  <div className="text-sm text-gray-900">{row.discount}</div>
                  <div className="text-sm text-gray-900">{row.depth}</div>
                  <div className="text-sm text-gray-900">{row.qty}</div>
                  </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search Assortment"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Assortment Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {assortmentPlans.map((plan) => (
        <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-200 cursor-pointer flex flex-col justify-between h-full min-w-0" key={plan.id} onClick={() => handlePlanClick(plan)}>
                  <div className="flex items-start justify-between mb-6">
          <img src={plan.icon || '/vendor-logo-placeholder.png'} alt="icon" className="w-8 h-8 object-contain" />
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="font-semibold text-lg text-gray-900 mb-6">Assortment Plan {plan.id}</div>
                  <div className="bg-gray-50 rounded-lg px-4 py-3 grid grid-cols-2 gap-4 items-center">
                    <div>
                      <div className="flex items-center text-xs text-gray-400 font-semibold tracking-widest mb-1">
                        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                        SEASON
                      </div>
                      <div className="text-sm font-medium text-gray-900">{plan.season}</div>
                    </div>
                    <div>
                      <div className="flex items-center text-xs text-gray-400 font-semibold tracking-widest mb-1">
                        <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        ADDED DATE
                      </div>
                      <div className="text-sm font-medium text-gray-900">{plan.addedDate}</div>
                    </div>
                  </div>
                </div>
              ))}
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AssortmentPlans;
