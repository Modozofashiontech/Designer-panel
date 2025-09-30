import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const DashboardContent = () => {
  const [statusFilter, setStatusFilter] = useState('TECH-PACKS');
  const [progressFilter, setProgressFilter] = useState('MONTHLY');
  const [dispatchFilter, setDispatchFilter] = useState('Monthly');
  const [metrics, setMetrics] = useState({
    lineSheets: 0,
    techPacks: 0,
    colors: 0,
    ppSamples: 0
  });
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Create an axios instance with base URL
        const api = axios.create({
          baseURL: 'http://localhost:8080' // Update this with your actual backend URL if different
        });
        
        // Fetch data in parallel
        const [lineSheetsResponse, techPacksResponse] = await Promise.all([
          api.get('/api/line-sheets', {
            params: {
              limit: 1000,
              _t: Date.now()
            },
            timeout: 10000
          }),
          api.get('/api/tech-packs', {
            params: {
              limit: 1, // We only need the count
              _t: Date.now()
            },
            timeout: 10000
          }).catch(() => ({ data: { data: [], pagination: { total: 0 } } })) // Handle if endpoint doesn't exist
        ]);
        
        console.log('API Responses:', { lineSheetsResponse, techPacksResponse });
        
        // Process line sheets
        const lineSheets = Array.isArray(lineSheetsResponse.data?.data) ? 
          lineSheetsResponse.data.data : [];
        
        // Get tech packs count (handle both array and paginated responses)
        let techPacksCount = 0;
        if (techPacksResponse.data?.pagination?.total !== undefined) {
          // Paginated response
          techPacksCount = techPacksResponse.data.pagination.total;
        } else if (Array.isArray(techPacksResponse.data?.data)) {
          // Array response
          techPacksCount = techPacksResponse.data.data.length;
        } else if (Array.isArray(techPacksResponse.data)) {
          // Direct array response
          techPacksCount = techPacksResponse.data.length;
        }
        
        console.log('Counts:', { lineSheets: lineSheets.length, techPacksCount });
        
        // Calculate metrics
        const lineSheetsCount = lineSheets.length;
        const colorsCount = 0; // Replace with actual colors count when endpoint is available
        
        // Get pending actions
        const pendingActions = [];
        if (lineSheetsCount === 0) {
          pendingActions.push({
            id: 'no-actions',
            message: 'No pending actions',
            type: 'info'
          });
        } else {
          // Example: Add line sheets that need attention
          lineSheets.forEach(sheet => {
            if (sheet.status === 'pending') {
              pendingActions.push({
                id: sheet._id || Math.random().toString(36).substr(2, 9),
                message: `Line sheet "${sheet.name || 'Unnamed'}" is pending review`,
                type: 'pending',
                link: `/line-sheets/${sheet._id}`
              });
            }
          });
        }
        
        setMetrics({
          lineSheets: lineSheetsCount,
          techPacks: techPacksCount,
          colors: colorsCount,
          ppSamples: 0 // Replace with actual PP samples count when endpoint is available
        });
        
        setActions(pendingActions);
        setLoading(false);
        
      } catch (error) {
        console.error('Dashboard data fetch error:', {
          message: error.message,
          response: error.response ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          } : 'No response',
          config: {
            url: error.config?.url,
            method: error.config?.method,
            params: error.config?.params
          }
        });
        
        setError('Failed to load dashboard data. Please try again later.');
        setLoading(false);
      }
    };
    
    fetchDashboardData();
  }, []);
  
  if (loading) {
    return (
      <div className="flex-1 bg-gray-50 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex-1 bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-gray-50 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, Alex. Let's pick up where you left off and make something beautiful today.
          </h1>
        </div>
        <div className="flex items-center space-x-4">
          <button className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5 5v-5z" />
            </svg>
          </button>
          <button className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          <button className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            FILTER
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Line Sheets</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.lineSheets}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Tech-packs</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.techPacks}</p>
              <p className="text-sm text-green-600">+0</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Colors</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.colors}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total PP Samples</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.ppSamples}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Charts and Actions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Status Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Status Distribution</h3>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option>TECH-PACKS</option>
              <option>LINE-SHEETS</option>
              <option>COLORS</option>
            </select>
          </div>
          
          {/* Pie Chart Placeholder */}
          <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg mb-4">
            <div className="text-center">
              <div className="w-32 h-32 rounded-full bg-gradient-to-r from-green-400 via-blue-500 to-orange-500 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">Tech-packs Completed: 200</p>
            </div>
          </div>
          
          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              <span>Approved</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
              <span>Pending to Upload</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              <span>Commented</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              <span>Rejected</span>
            </div>
          </div>
        </div>

        {/* Actions to be taken */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions to be taken</h3>
          <div className="space-y-3">
            {actions.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                No pending actions
              </div>
            ) : (
              actions.map((action) => (
                <div 
                  key={action.id} 
                  className={`flex justify-between items-center p-3 rounded-lg ${
                    action.type === 'pending' ? 'bg-yellow-50' : 'bg-gray-50'
                  }`}
                >
                  <span className="text-sm">{action.message}</span>
                  {action.link ? (
                    <Link 
                      to={action.link} 
                      className="text-blue-600 text-sm hover:underline"
                    >
                      {action.type === 'pending' ? 'REVIEW' : 'VIEW'}
                    </Link>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Progress Trends and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Progress Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Progress Trends</h3>
            <select 
              value={progressFilter} 
              onChange={(e) => setProgressFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option>MONTHLY</option>
              <option>WEEKLY</option>
              <option>YEARLY</option>
            </select>
          </div>
          
          {/* Line Chart Placeholder */}
          <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg mb-4">
            <div className="text-center">
              <div className="w-full h-32 bg-gradient-to-r from-blue-400 via-orange-400 to-yellow-400 rounded mb-2"></div>
              <p className="text-sm text-gray-600">Linesheets Uploaded: 1000</p>
            </div>
          </div>
          
          {/* Chart Legend */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
              <span>Linesheets</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-orange-500 rounded mr-2"></div>
              <span>Techpacks</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-cyan-500 rounded mr-2"></div>
              <span>Colors</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded mr-2"></div>
              <span>PP Samples Review</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-4">
            <Link to="/line-sheets" className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">Upload Linesheets</h4>
                  <p className="text-sm text-gray-600">Add or manage seasonal product layouts</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
            
            <Link to="/tech-packs" className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">Upload Techpack</h4>
                  <p className="text-sm text-gray-600">Add technical details for product development</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
            
            <Link to="/pantone" className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">Upload Colors</h4>
                  <p className="text-sm text-gray-600">Review and approve seasonal color palettes</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
            
            <Link to="/pre-production" className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">PP Sample Review</h4>
                  <p className="text-sm text-gray-600">Evaluate pre-production samples for quality</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dispatch Overview */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Dispatch Overview</h3>
            <select 
              value={dispatchFilter} 
              onChange={(e) => setDispatchFilter(e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option>Monthly</option>
              <option>Weekly</option>
              <option>Yearly</option>
            </select>
          </div>
          
          {/* Bar Chart Placeholder */}
          <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg mb-4">
            <div className="text-center">
              <div className="w-full h-32 bg-gradient-to-r from-blue-400 via-orange-400 to-red-400 rounded mb-2"></div>
              <p className="text-sm text-gray-600">Jan Dropped Qty: 800</p>
            </div>
          </div>
          
          {/* Chart Legend */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded mr-2"></div>
              <span>Dispatched Quantity</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-orange-500 rounded mr-2"></div>
              <span>Pending to Dispatch</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded mr-2"></div>
              <span>Dropped Quantity</span>
            </div>
          </div>
        </div>

        {/* Production & Style Metrics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Production & Style Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">120</p>
              <p className="text-sm text-gray-600">Production Planned Quantity</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">150</p>
              <p className="text-sm text-gray-600">No of Styles</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">400</p>
              <p className="text-sm text-gray-600">No of Options</p>
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <p className="text-2xl font-bold text-orange-600">120</p>
              <p className="text-sm text-gray-600">Dispatched Quantity</p>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <p className="text-2xl font-bold text-yellow-600">120</p>
              <p className="text-sm text-gray-600">Pending to Dispatch</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">60</p>
              <p className="text-sm text-gray-600">Dropped Quantity</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardContent;
