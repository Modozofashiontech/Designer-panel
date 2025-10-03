import React from 'react';

const ManagerCard = ({ name, avatar }) => (
  <div className="flex items-center space-x-4">
    <img
      src={avatar || '/vendor-logo-placeholder.png'}
      alt={name}
      className="w-10 h-10 rounded-full object-cover border border-gray-200 bg-white"
      onError={e => { e.target.src = '/vendor-logo-placeholder.png'; }}
    />
    <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
  </div>
);

export default ManagerCard; 