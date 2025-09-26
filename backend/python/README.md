# PDF Image Extraction Service

This Python service extracts embedded images from PDF files and stores them in MongoDB using GridFS.

## Features

- Extract embedded images from PDF files
- Store images in MongoDB using GridFS
- REST API endpoints for upload and retrieval
- CORS support for frontend integration
- Automatic image format detection

## Setup

### 1. Install Dependencies

```bash
cd backend/python
pip install -r requirements.txt
```

### 2. Environment Variables

Create a `.env` file in the `backend/python` directory:

```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB=modozo
```

### 3. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# On Windows
mongod

# On macOS/Linux
sudo systemctl start mongod
```

### 4. Run the Service

```bash
cd backend/python
python image_extraction.py
```

The service will start on `http://localhost:5001`

## API Endpoints

### POST /api/extract-pdf

Upload a PDF file to extract embedded images.

**Request:**
- Content-Type: `multipart/form-data`
- Body: PDF file with key `pdf`

**Response:**
```json
{
  "images": ["/api/image/507f1f77bcf86cd799439011", "/api/image/507f1f77bcf86cd799439012"]
}
```

### GET /api/image/{id}

Retrieve an extracted image by its MongoDB ObjectId.

**Response:**
- Image file with appropriate content type

## Integration with Frontend

The service is integrated with the React frontend in `LineSheets.js`. When a user uploads a PDF:

1. The frontend sends the PDF to `/api/extract-pdf`
2. Images are extracted and stored in MongoDB
3. Image URLs are returned to the frontend
4. The frontend displays the extracted images

## Testing

Run the test script to verify the service is working:

```bash
cd backend/python
python test_image_extraction.py
```

## Troubleshooting

### MongoDB Connection Issues

- Ensure MongoDB is running
- Check the MONGO_URI in your .env file
- Verify network connectivity

### Image Extraction Issues

- Ensure the PDF contains embedded images
- Check file size limits (default 10MB)
- Verify PDF format compatibility

### CORS Issues

- The service includes CORS headers for localhost
- For production, update CORS settings in `image_extraction.py`

## Dependencies

- **Flask**: Web framework
- **Flask-CORS**: Cross-origin resource sharing
- **PyMuPDF**: PDF processing and image extraction
- **pymongo**: MongoDB driver
- **python-dotenv**: Environment variable management
- **Werkzeug**: File handling utilities
