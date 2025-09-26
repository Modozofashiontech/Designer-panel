import React, { useState, useRef, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { FaCalendarAlt, FaUser, FaBox, FaRuler, FaClipboardList, FaInfoCircle, FaComment, FaPaperPlane } from 'react-icons/fa';
import axios from 'axios';
import socket from '../socket';
import { API_BASE } from '../config';
import pantoneColors from '../utils/pantoneColors.json';

const CommentForm = ({ techpackId, onCommentAdded }) => {
  const [comment, setComment] = useState('');
  const [user, setUser] = useState('Designer'); // Default or get from auth context

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;

    try {
      // Emit via Socket.IO for real-time
      socket.emit('add-comment', {
        techpackId,
        comment: comment.trim(),
        user
      });

  // Also save via HTTP for persistence
  await axios.post(`${API_BASE}/api/tech-packs/${techpackId}/comments`, {
        text: comment.trim(),
        user
      });

      setComment('');
      if (onCommentAdded) onCommentAdded();
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex items-center">
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment..."
        className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded-l-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="bg-blue-500 text-white px-3 py-1 rounded-r-lg hover:bg-blue-600 transition-colors text-sm"
      >
        <FaPaperPlane />
      </button>
    </form>
  );
};

// Helper function for Pantone lookup by code or name
const getPantoneDetails = (input) => {
  if (!input) return { hex: '#fff', name: '-', code: '-' };
  const normalized = input.trim().toUpperCase();
  if (pantoneColors[normalized]) {
    return { ...pantoneColors[normalized], code: normalized };
  }
  const found = Object.entries(pantoneColors).find(
    ([code, { name }]) => name.toUpperCase() === normalized
  );
  if (found) {
    const [code, details] = found;
    return { ...details, code };
  }
  return { hex: '#fff', name: '-', code: '-' };
};

const TechPackGenerator = ({ lineSheet, allLineSheets, onClose }) => {
  const [selectedStyle, setSelectedStyle] = useState(lineSheet || allLineSheets[0]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  
  // Handle navigation between line sheets
  const navigateImage = (direction) => {
    if (!allLineSheets.length) return;
    
    setCurrentImageIndex(prevIndex => {
      if (direction === 'next') {
        return (prevIndex + 1) % allLineSheets.length;
      } else {
        return (prevIndex - 1 + allLineSheets.length) % allLineSheets.length;
      }
    });
    
    setSelectedStyle(allLineSheets[currentImageIndex]);
  };
  const [form, setForm] = useState({
    special : 'CONTRAST RIB',
    macroTheme: 'MOTOCROSS',
    sample: 'M',
    fabricType: 'French Terry',
    gender: 'Female',
    trimSpec: 'Main Label',
    styleSpec: '100% Cotton',
    bodyLength: '100',
    color: 'Brown',
  }); 
  
  const [pantoneLibraries, setPantoneLibraries] = useState([]);
  // Fetch uploaded Pantone libraries on mount
  useEffect(() => {
    axios
      .get(`${API_BASE}/pantone-library`)
      .then((res) => setPantoneLibraries(res.data || []))
      .catch((err) => console.error('Error fetching Pantone libraries', err));
  }, []);

  // Helper to lookup Pantone details from the uploaded libraries, falling back to static JSON
  const getPantoneDetails = (input) => {
    if (!input) return { hex: '#fff', name: '-', code: '-', previewUrl: null };

    let normalized = input.trim().toUpperCase();
    // Try direct match
    if (pantoneColors[normalized]) {
      return { ...pantoneColors[normalized], code: normalized, previewUrl: null };
    }
    // Try removing spaces
    let noSpace = normalized.replace(/\s+/g, '');
    let found = Object.entries(pantoneColors).find(
      ([code]) => code.replace(/\s+/g, '').toUpperCase() === noSpace
    );
    if (found) {
      const [code, details] = found;
      return { ...details, code, previewUrl: null };
    }
    // Try switching TCX/TPG suffixes
    if (normalized.endsWith('TCX')) {
      let tpg = normalized.replace('TCX', 'TPG');
      if (pantoneColors[tpg]) return { ...pantoneColors[tpg], code: tpg, previewUrl: null };
    } else if (normalized.endsWith('TPG')) {
      let tcx = normalized.replace('TPG', 'TCX');
      if (pantoneColors[tcx]) return { ...pantoneColors[tcx], code: tcx, previewUrl: null };
    }
    // Try matching by name
    const foundStatic = Object.entries(pantoneColors).find(
      ([code, { name }]) => name.toUpperCase() === normalized
    );
    if (foundStatic) {
      const [code, details] = foundStatic;
      return { ...details, code, previewUrl: null };
    }
    return { hex: '#fff', name: '-', code: normalized, previewUrl: null };
  };

  const [comments, setComments] = useState([]);
  const commentsEndRef = useRef(null);
  const [pantoneInput, setPantoneInput] = useState('');

  const pantoneDetails = getPantoneDetails(pantoneInput);

  // Fetch comments when selectedStyle changes
  useEffect(() => {
  const fetchComments = async () => {
      if (selectedStyle?._id) {
        try {
      const response = await axios.get(`${API_BASE}/api/tech-packs/${selectedStyle._id}/comments`);
          setComments(response.data || []);
        } catch (error) {
          console.error('Error fetching comments:', error);
        }
      }
    };

    fetchComments();

    // Join the techpack room for real-time updates
    if (selectedStyle?._id) {
      socket.emit('join-techpack', selectedStyle._id);
    }

    // Listen for new comments
    const handleNewComment = ({ techpackId, comment }) => {
      if (techpackId === selectedStyle?._id) {
        setComments(prev => [...prev, comment]);
        // Scroll to bottom when new comment is added
        setTimeout(() => {
          if (commentsEndRef.current) {
            commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      }
    };

    socket.on('new-comment', handleNewComment);

    return () => {
      socket.off('new-comment', handleNewComment);
    };
  }, [selectedStyle?._id]);

  const handleCommentAdded = () => {
    // Scroll to bottom after adding a comment
    setTimeout(() => {
      if (commentsEndRef.current) {
        commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Placeholder: update form fields as needed
  const handleFormChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const pdfRef = useRef(null);

  // Helper function to get file URL - matches LineSheetDetails.js pattern exactly
  const getFileUrl = (fileObj) => {
    if (!fileObj) return null;
    
    // If it's already a URL, return it
    if (typeof fileObj === 'string' && 
        (fileObj.startsWith('http') || fileObj.startsWith('blob:'))) {
      return fileObj;
    }

    // Handle both direct key and file object with key property
    const key = fileObj.key || fileObj;
    if (!key) return null;

    // Use the file serving endpoint directly (it will redirect to presigned URL)
    // Remove any leading slashes from the key to prevent double slashes
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    return `${API_BASE}/file/${encodeURIComponent(cleanKey)}`;
  };

  // Get front and back images using the same logic as LineSheetDetails
  const getImageSource = (type = 'front') => {
    if (!selectedStyle) return type === 'front' ? '/placeholder-front.png' : '/placeholder-back.png';
    
    // Try to get from extractedImages first
    if (Array.isArray(selectedStyle.extractedImages) && selectedStyle.extractedImages.length > 0) {
      const imgIndex = type === 'front' ? 0 : Math.min(1, selectedStyle.extractedImages.length - 1);
      const img = selectedStyle.extractedImages[imgIndex];
      if (img) return getFileUrl(img) || (type === 'front' ? '/placeholder-front.png' : '/placeholder-back.png');
    }
    
    // Fallback to specific image properties
    if (type === 'front') {
      return getFileUrl(selectedStyle.frontView || selectedStyle.frontImage || selectedStyle.image || selectedStyle.imageUrl || selectedStyle.previewUrl) || '/placeholder-front.png';
    } else {
      return getFileUrl(selectedStyle.backView || selectedStyle.backImage || selectedStyle.imageBack || selectedStyle.imageUrl || selectedStyle.previewUrl) || '/placeholder-back.png';
    }
  };
  
  const frontSrc = getImageSource('front');
  const backSrc = getImageSource('back');

  // Get extracted swatch images if available
  const extractedSwatches = selectedStyle.extractedSwatches || [];
  const extractedPantones = selectedStyle.extractedPantones || [];
  console.log('Extracted swatches:', extractedSwatches);
  console.log('Extracted pantones:', extractedPantones);
  console.log('Selected style data:', selectedStyle);

  const handleExportPDF = async () => {
    const input = pdfRef.current;
    const canvas = await html2canvas(input, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Calculate dimensions to fit A4
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 295; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    let heightLeft = imgHeight;
    let position = 0;
    
    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add new pages if the content is longer than one page
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Save the PDF
    pdf.save(`techpack-${selectedStyle.styleId || selectedStyle.name}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between px-8 py-4 border-b">
        <h2 className="text-xl font-semibold">Generating Tech Packs for {allLineSheets.length} Styles</h2>
        <div className="flex items-center space-x-4">
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2"
            onClick={handleExportPDF}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export as a PDF
          </button>
          <button
            className="text-2xl text-gray-400 hover:text-gray-600"
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <div className="w-60 border-r bg-gray-50 overflow-y-auto">
          {allLineSheets.map((ls) => (
            <button
              key={ls.id}
              onClick={() => setSelectedStyle(ls)}
              className={`w-full text-left px-4 py-3 border-b hover:bg-blue-50 ${selectedStyle.id === ls.id ? 'bg-blue-100 font-bold' : ''}`}
            >
              {ls.styleId || ls.name}
            </button>
          ))}
        </div>
        {/* Main Content */}
        <div className="flex-1 flex flex-col md:flex-row p-8 gap-8 overflow-auto">
          {/* Form */}
          <div className="w-full md:w-1/2 max-w-md">
            <h3 className="text-lg font-semibold mb-4">Enter the Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">SPECIAL FEATURE</label>
                <select className="w-full border rounded p-2" value={form.special} onChange={e => handleFormChange('special', e.target.value)}>
                  <option>CONTRAST RIB</option>
                  <option>CONTRAST RIB</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">MACRO THEME</label>
                <select className="w-full border rounded p-2" value={form.macroTheme} onChange={e => handleFormChange('macroTheme', e.target.value)}>
                  <option>MOTOCROSS</option>
                  <option>STREET</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">SAMPLE SIZE</label>
                <input className="w-full border rounded p-2" value={form.sample} onChange={e => handleFormChange('sample', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">BINNING THEME</label>
                <select className="w-full border rounded p-2" value={form.fabricType} onChange={e => handleFormChange('fabricType', e.target.value)}>
                  <option>FRENCH TERRY</option>
                  <option>COTTON</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">FIT</label>
                <select className="w-full border rounded p-2" value={form.gender} onChange={e => handleFormChange('gender', e.target.value)}>
                  <option>SLIM</option>
                  <option>REGULAR</option>
                  <option>OVERSIZED</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PRODUCT DESCRIPTION</label>
                <input className="w-full border rounded p-2" value={form.trimSpec} onChange={e => handleFormChange('trimSpec', e.target.value)} />
              </div>  
              <div>
                <label className="block text-sm font-medium mb-1">BODY LENGTH</label>
                <input className="w-full border rounded p-2" value={form.bodyLength} onChange={e => handleFormChange('bodyLength', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">BASIC FABRIC </label>
                <input className="w-full border rounded p-2" value={form.color} onChange={e => handleFormChange('color', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PANTONE CODE OR NAME</label>
                <input
                  className="w-full border rounded p-2"
                  value={pantoneInput}
                  onChange={e => setPantoneInput(e.target.value)}
                  placeholder="e.g. 19-4517 TCX or MEDITERRANEA"
                />
              </div>
            </div>
            <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-400 text-blue-800 rounded">
              <div className="font-semibold mb-1">You're Almost Done</div>
              <ul className="list-disc ml-5 text-sm">
                <li>Some details have been pre-filled from the linesheet.</li>
                <li>Please review the information and manually fill in any missing details.</li>
                <li>Once done, click Save & Continue to proceed.</li>
              </ul>
            </div>
            <button className="mt-8 w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200">
              Save & Continue
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center overflow-auto pl-4">
            <div ref={pdfRef} style={{ background: 'white', width: 880, minHeight: 720, fontFamily: 'Arial, sans-serif', fontSize: 14, border: '1px solid #222', margin: 0, padding: 0 }}>
              {/* --- BEGIN TRUE PIXEL-PERFECT PREVIEW LAYOUT --- */}
              {/* Purple Header */}
              <div style={{ background: '#b6a6d6', height: 56, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  
                  
                </div>
                
              </div>
              {/* Info Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', margin: 0, fontSize: 15, fontFamily: 'Arial, sans-serif' }}>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', width: 120, background: '#f6f3fa' }}>STYLE NO:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px', width: 180 }}>{selectedStyle.styleId || selectedStyle.name || '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', width: 120, background: '#f6f3fa' }}>DESIGNER:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px', width: 120 }}>{selectedStyle.designer || 'TONY'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', width: 160, background: '#f6f3fa' }}>TREND SPECIFICATION</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px', width: 120 }}></td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', width: 120, background: '#f6f3fa' }}>SPECIAL FEATURE:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px', width: 120 }}>{form.special || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>STYLE SPECIFICATION</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}></td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>ARTICLE:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{selectedStyle.gender || '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>MACRO THEME:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{form.macroTheme || '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>AT TREND 1:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{selectedStyle.trend1 || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>STYLE SPEC:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{form.styleSpec || '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>RELEASE DATE:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{selectedStyle.releaseDate || '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>BINNING THEME:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{form.fabricType || '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>AT TREND 2:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{selectedStyle.trend2 || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>SAMPLE SIZE:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{form.sample|| '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>FIT:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{form.gender || '-'}</td>
                    <td style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa' }}>BODY LENGTH:</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }}>{form.bodyLength || '-'}</td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px' }} colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
              {/* Product Description */}
              <div style={{ border: '1px solid #222', borderTop: 'none', padding: 0, margin: 0 }}>
                <div style={{ fontWeight: 'bold', borderBottom: '1px solid #222', padding: '4px 8px', background: '#f6f3fa' }}>PRODUCT DESCRIPTION:</div>
                <div style={{ padding: '8px 8px', minHeight: 32 }}>{form.trimSpec || selectedStyle.description || '-'}</div>
              </div>
              {/* Base Fabric */}
              <div style={{ border: '1px solid #222', borderTop: 'none', padding: 0, margin: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ fontWeight: 'bold', padding: '4px 8px', width: 180, background: '#f6f3fa', borderRight: '1px solid #222' }}>BASE FABRIC:</div>
                <div style={{ padding: '4px 8px' }}>{form.color || selectedStyle.baseFabric || '-'}</div>
              </div>
              {/* Colour/Neck Rib Table */}
              <table style={{ width: 480, borderCollapse: 'collapse', margin: '0 0 0 0', marginTop: 0, marginBottom: 0, float: 'left' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa', width: 180 }}>COLOUR</th>
                    <th style={{ border: '1px solid #222', fontWeight: 'bold', padding: '4px 8px', background: '#f6f3fa', width: 120 }}>NECK RIB</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #222', padding: '4px 8px', verticalAlign: 'top' }}>
                      {extractedSwatches.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {extractedSwatches.map((swatch, index) => (
                            <div key={index} style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 'bold', fontSize: 10 }}>{swatch.code || `S${index + 1}`}</div>
                              <img 
                                src={`http://localhost:5001${swatch.imageUrl || swatch.url || swatch}`} 
                                alt={swatch.code || `Swatch ${index + 1}`} 
                                style={{ 
                                  width: 32, 
                                  height: 32, 
                                  objectFit: 'cover', 
                                  border: '1px solid #333', 
                                  margin: '2px 0' 
                                }} 
                              />
                              <div style={{ fontSize: 8 }}>{swatch.name || '-'}</div>
                            </div>
                          ))}
                        </div>
                      ) : extractedPantones.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {extractedPantones.map((pantone, index) => (
                            <div key={index} style={{ textAlign: 'center' }}>
                              <div style={{ fontWeight: 'bold', fontSize: 10 }}>{pantone.code || `P${index + 1}`}</div>
                              <img 
                                src={`http://localhost:5001${pantone.imageUrl || pantone.url}`} 
                                alt={pantone.code || `Pantone ${index + 1}`} 
                                style={{ 
                                  width: 32, 
                                  height: 32, 
                                  objectFit: 'cover', 
                                  border: '1px solid #333', 
                                  margin: '2px 0' 
                                }} 
                              />
                              <div style={{ fontSize: 8 }}>{pantone.name || '-'}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div>
                          <div style={{ fontWeight: 'bold' }}>{pantoneDetails.code}</div>
                          {pantoneDetails.previewUrl ? (
                            <img src={pantoneDetails.previewUrl} alt={pantoneDetails.code} style={{ width: 32, height: 32, objectFit: 'contain', border: '1px solid #333', margin: '4px 0' }} />
                          ) : (
                            <div style={{ width: 32, height: 32, background: pantoneDetails.hex && pantoneDetails.hex !== '#fff' ? pantoneDetails.hex : '#d1d5db', border: '1px solid #333', margin: '4px 0' }}></div>
                          )}
                          <div style={{ fontSize: 12 }}>{pantoneDetails.code}<br/>{pantoneDetails.name}</div>
                        </div>
                      )}
                    </td>
                    <td style={{ border: '1px solid #222', padding: '4px 8px', verticalAlign: 'top' }}>
                      <div style={{ width: 32, height: 32, background: '#fff', border: '1px solid #333', margin: '4px 0' }}></div>
                      <div style={{ fontSize: 12 }}>-<br/>-</div>
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* Garment Illustration Section */}
              <div style={{ marginLeft: 480, paddingTop: 16, textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 80 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>FRONT</div>
                    <img 
  src={frontSrc} 
  alt="Front View" 
  onError={(e) => {
    e.target.onerror = null;
    e.target.src = '/placeholder-front.png';
  }}
  style={{ 
    height: 260, 
    width: 260, 
    objectFit: 'contain', 
    border: '1px solid #ccc', 
    background: 'white',
    maxWidth: '100%',
    maxHeight: '100%'
  }} 
/>
                    <div style={{ fontWeight: 'bold', fontSize: 16, marginTop: 8 }}>OPTION A</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>BACK</div>
                    <img 
  src={backSrc} 
  alt="Back View"
  onError={(e) => {
    e.target.onerror = null;
    e.target.src = '/placeholder-back.png';
  }}
  style={{ 
    height: 260, 
    width: 260, 
    objectFit: 'contain', 
    border: '1px solid #ccc', 
    background: 'white',
    maxWidth: '100%',
    maxHeight: '100%'
  }} 
/>
                    <div style={{ fontWeight: 'bold', fontSize: 16, marginTop: 8 }}>OPTION B</div>
                  </div>
                </div>
              </div>
              {/* --- END TRUE PIXEL-PERFECT PREVIEW LAYOUT --- */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechPackGenerator;