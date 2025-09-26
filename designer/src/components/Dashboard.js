import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

const Dashboard = () => {
  const location = useLocation();
  const menuItems = [
    { name: 'Dashboard', path: '/dashboard' },
    { 
      section: 'DESIGN',
      items: [
        {name: 'Pantone Library', path: '/pantone-library'},
        { name: 'Line Sheets', path: '/line-sheets' },
        { name: 'Tech Packs', path: '/tech-packs' },
        { name: 'Development Samples', path: '/development-samples' },
      ]
    },
    {
      section: 'SAMPLES',
      items: [
        { name: 'Assortment Plans', path: '/assortment-plans' },
        { name: 'Pantone', path: '/pantone' },
        { name: 'Print Strike', path: '/print-strike' },
        { name: 'Pre-Production', path: '/pre-production' },
      ]
    },
  ]
  
  return (
    <div className="flex min-h-screen overflow-hidden">
      <div className="w-64 bg-[rgb(15,23,42)] text-white fixed h-full overflow-y-auto hidden sm:block">
        <div className="p-4">
          <div className="mb-8">
            <img src="/Modozo logo 1.png" alt="Modozo" className="h-17  mt-5"/>
          </div>
          <nav>
            {menuItems.map((item, index) => (
              item.section ? (
                <div key={item.section} className="mb-6">
                  <h2 className="text-sm font-medium text-gray-400 mb-2">{item.section}</h2>
                  <ul className="space-y-2">
                    {item.items.map((subItem) => (
                      <li key={subItem.name}>
                        <Link
                          to={subItem.path}
                          className={`block px-4 py-2 rounded-lg transition-colors duration-200 ${location.pathname === subItem.path ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}
                        >
                          {subItem.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div key={item.name} className="mb-6">
                  <Link
                    to={item.path}
                    className={`block px-4 py-2 rounded-lg transition-colors duration-200 ${location.pathname === item.path ? 'bg-blue-600 text-white' : 'hover:bg-slate-700'}`}
                  >
                    {item.name}
                  </Link>
                </div>
              )
            ))}
          </nav>
        </div>
      </div>

  <div className="flex-1 ml-0 sm:ml-64 min-h-screen overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
};

export default Dashboard; 