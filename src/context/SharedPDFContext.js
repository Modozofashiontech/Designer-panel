import React, { createContext, useContext, useState } from 'react';

const SharedPDFContext = createContext();

export const SharedPDFProvider = ({ children }) => {
  const [sharedPDFs, setSharedPDFs] = useState([]);

  const addSharedPDF = (pdf) => {
    setSharedPDFs(prevPDFs => [...prevPDFs, {
      ...pdf,
      id: Date.now(),
      status: 'SUBMITTED',
      timestamp: new Date().toISOString()
    }]);
  };

  const updatePDFStatus = (pdfId, newStatus) => {
    setSharedPDFs(prevPDFs =>
      prevPDFs.map(pdf =>
        pdf.id === pdfId ? { ...pdf, status: newStatus } : pdf
      )
    );
  };

  return (
    <SharedPDFContext.Provider value={{ sharedPDFs, addSharedPDF, updatePDFStatus }}>
      {children}
    </SharedPDFContext.Provider>
  );
};

export const useSharedPDFs = () => {
  const context = useContext(SharedPDFContext);
  if (!context) {
    throw new Error('useSharedPDFs must be used within a SharedPDFProvider');
  }
  return context;
}; 