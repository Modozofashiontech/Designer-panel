# Designer Panel - Complete Setup Guide

This guide will help you set up the complete Designer Panel system with integrated PDF image extraction functionality.

## 🏗️ System Architecture

The system consists of three main components:

1. **React Frontend** (Port 3000) - User interface
2. **Node.js Backend** (Port 5000) - Main API server
3. **Python Service** (Port 5001) - PDF image extraction service

## 📋 Prerequisites

- Node.js (v14 or higher)
- Python (v3.7 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

**Windows:**
```bash
# Double-click or run:
start-services.bat
```

**Linux/Mac:**
```bash
# Make executable and run:
chmod +x start-services.sh
./start-services.sh
```

### Option 2: Manual Setup

#### 1. Install Dependencies

**Frontend Dependencies:**
```bash
npm install
```

**Backend Dependencies:**
```bash
cd backend
npm install
```

**Python Dependencies:**
```bash
cd backend/python
pip install -r requirements.txt
```

#### 2. Environment Configuration

Create a `.env` file in the `backend` directory:
```env
MONGO_URL=mongodb://localhost:27017
NODE_ENV=development
PORT=5000
```

Create a `.env` file in the `backend/python` directory:
```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB=modozo
```

#### 3. Start MongoDB

**Windows:**
```bash
mongod
```

**Linux/Mac:**
```bash
sudo systemctl start mongod
```

#### 4. Start Services

**Terminal 1 - Python Service:**
```bash
cd backend/python
python image_extraction.py
```

**Terminal 2 - Node.js Server:**
```bash
cd backend
npm start
```

**Terminal 3 - React App:**
```bash
npm start
```

## 🔧 Testing the Setup

### 1. Test Python Service

```bash
cd backend/python
python test_image_extraction.py
```

Expected output:
```
🧪 Testing Image Extraction Service
========================================
✅ Service is running
✅ All tests passed! The service is ready to use.
```

### 2. Test Node.js Server

Visit: `http://localhost:5000/api/brand-managers`

Expected response: JSON array of brand managers

### 3. Test React App

Visit: `http://localhost:3000`

Expected: Designer Panel interface loads

## 📁 File Structure

```
designer-panel/
├── src/
│   └── components/
│       └── LineSheets.js          # Main upload interface
├── backend/
│   ├── server.js                  # Node.js API server
│   ├── python/
│   │   ├── image_extraction.py    # Python PDF service
│   │   ├── requirements.txt       # Python dependencies
│   │   ├── test_image_extraction.py
│   │   └── README.md
│   └── models/
│       └── Document.js            # MongoDB schemas
├── start-services.bat             # Windows startup script
├── start-services.sh              # Unix startup script
└── SETUP_GUIDE.md                 # This file
```

## 🔄 How It Works

### PDF Upload Flow

1. **User uploads PDF** → LineSheets.js interface
2. **Frontend processing** → Creates preview and metadata
3. **Python service call** → Sends PDF to `http://localhost:5001/api/extract-pdf`
4. **Image extraction** → Python extracts embedded images using PyMuPDF
5. **MongoDB storage** → Images stored in GridFS with unique IDs
6. **UI update** → Extracted images displayed in the interface
7. **Database storage** → Line sheet data with image references saved

### API Endpoints

**Python Service (Port 5001):**
- `POST /api/extract-pdf` - Extract images from PDF
- `GET /api/image/{id}` - Retrieve extracted image

**Node.js Server (Port 5000):**
- `POST /api/line-sheets` - Upload line sheet with metadata
- `GET /api/line-sheets` - Get all line sheets
- `GET /api/brand-managers` - Get brand managers
- And many more...

## 🛠️ Troubleshooting

### Common Issues

**1. MongoDB Connection Error**
```
Error: Could not connect to MongoDB
```
**Solution:** Ensure MongoDB is running and accessible

**2. Python Service Not Starting**
```
ModuleNotFoundError: No module named 'flask'
```
**Solution:** Install Python dependencies:
```bash
cd backend/python
pip install -r requirements.txt
```

**3. CORS Errors**
```
Access to fetch at 'http://localhost:5001' from origin 'http://localhost:3000' has been blocked by CORS policy
```
**Solution:** Both services have CORS configured. Check if services are running on correct ports.

**4. Port Already in Use**
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Solution:** Kill existing processes or change ports in configuration.

### Debug Mode

**Python Service:**
```bash
cd backend/python
python image_extraction.py
# Debug output will show MongoDB connection status
```

**Node.js Server:**
```bash
cd backend
DEBUG=* npm start
```

## 📊 Monitoring

### Service Status

- **Python Service:** `http://localhost:5001/` (should return 404, but service is running)
- **Node.js Server:** `http://localhost:5000/api/brand-managers`
- **React App:** `http://localhost:3000`

### Logs

- **Python Service:** Check terminal running `image_extraction.py`
- **Node.js Server:** Check terminal running `npm start`
- **React App:** Check browser console and terminal running `npm start`

## 🔒 Security Notes

- Services are configured for development use
- CORS is enabled for localhost
- For production, update CORS settings and add authentication
- MongoDB should be secured with authentication in production

## 📈 Performance

- Python service processes PDFs asynchronously
- Images are stored in MongoDB GridFS for efficient retrieval
- Frontend shows progress indicators during upload
- File size limit: 10MB per PDF (configurable)

## 🆘 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify all services are running on correct ports
3. Check MongoDB connection
4. Review service logs for error messages
5. Test individual components using the test scripts

## 🎯 Next Steps

After successful setup:

1. Upload a PDF through the LineSheets interface
2. Verify images are extracted and displayed
3. Check MongoDB for stored data
4. Explore other features like Tech Packs, Pantone Library, etc.
