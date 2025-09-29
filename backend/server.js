require('dotenv').config();
const express = require('express');

// Load environment variables with defaults
const config = {
  port: process.env.PORT || 5000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URL || 'mongodb://localhost:27017/designer_panel',
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:5001',
  api: {
    maxFileSize: parseInt(process.env.API_MAX_FILE_SIZE) || 1000 * 1024 * 1024, // 1000MB
    requestTimeout: parseInt(process.env.API_REQUEST_TIMEOUT) || 300000, // 300 seconds
    pagination: {
      defaultLimit: parseInt(process.env.API_DEFAULT_LIMIT) || 1000,
      maxLimit: parseInt(process.env.API_MAX_LIMIT) || 1000,
      defaultPage: 1
    }
  },
  security: {
    cors: {
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Expires', 'Cache-Control', 'Pragma'],
      exposedHeaders: ['Content-Range', 'X-Content-Range']
    },
    socket: {
      pingTimeout: 10000,
      pingInterval: 25000,
      cookie: false
    }
  },
  ui: {
    defaultAvatar: 'https://ui-avatars.com/api/?name=U&background=0D8ABC&color=fff'
  }
};

// Silence noisy logging and timers globally to improve performance during bulk uploads.
// Keep console.error for critical failures.
const __noop = () => {};
console.log = __noop;
console.info = __noop;
console.debug = __noop;
console.warn = __noop;
console.time = __noop;
console.timeEnd = __noop;

// Validate required environment variables
const requiredEnvVars = ['MONGO_URL'];
const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Techpack, AssortmentPlan, BrandManager, LineSheet, Pantone, PrintStrike, PreProduction, DevelopmentSample, PantoneLibrary } = require('./models/Document');

// Helper function to ensure S3 URLs are properly formatted and accessible
const ensureSecureS3Url = (url) => {
  // Return null/undefined if input is falsy or not a string
  if (url === null || url === undefined) return url;
  
  // Convert to string if it's a number or other primitive
  if (typeof url !== 'string') {
    try {
      url = String(url);
      // If the stringified version is just '[object Object]', return as-is
      if (url === '[object Object]') return url;
    } catch (e) {
      console.warn('Could not convert URL to string:', url);
      return url;
    }
  }
  
  // If empty string after conversion, return as-is
  if (url.trim() === '') return url;
  
  try {
    // Decode any percent-encoded forward slashes to avoid double-encoding in clients
    const decodeSlashes = (str) => str.replace(/%252F/gi, '/').replace(/%2F/gi, '/');

    // If it's already a full URL, ensure it's HTTPS
    if (typeof url === 'string' && url.startsWith('http')) {
      // Convert http to https if needed
      if (url.startsWith('http://')) {
        url = 'https://' + url.substring(7);
      }
      return decodeSlashes(url);
    }
    
    // If it's a path that starts with /, remove the leading slash
    if (typeof url === 'string' && url.startsWith('/')) {
      url = url.substring(1);
    }
    
    // Handle different S3 URL formats
    if (url.includes('s3.amazonaws.com/')) {
      // Convert from s3://bucket-name/path to https://bucket-name.s3.region.amazonaws.com/path
      const match = url.match(/s3\.amazonaws\.com\/([^/]+)\/(.*)/);
      if (match) {
        return decodeSlashes(`https://${match[1]}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${match[2]}`);
      }
    }
    
    // Default case: construct full URL from just the key
    return decodeSlashes(`https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${url}`);
  } catch (error) {
    console.error('Error processing URL:', url, error);
    return url; // Return original URL if there's an error
  }
};
const { ObjectId } = require('mongodb');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const pdf = require('pdf-parse');

// Enhanced function to extract specific fields from tech pack PDFs
function extractField(text, fieldName, possibleFieldNames) {
  if (!text) return '';
  
  // Special handling for specific fields
  switch(fieldName) {
    case 'styleId':
      // Look for style patterns like GLI-AUG25-TS-060
      const styleMatch = text.match(/\b[A-Z]{2,3}-[A-Z0-9]{2,5}-[A-Z0-9-]+\b/);
      if (styleMatch) return styleMatch[0];
      // Fall back to filename if no style ID found
      if (possibleFieldNames.includes('filename') && possibleFieldNames.filename) {
        return possibleFieldNames.filename.replace(/\.[^/.]+$/, '');
      }
      return '';
      
    case 'printTechnique':
      // Try multiple patterns in sequence to find print technique
      const printPatterns = [
        // Pattern 1: "PRINT TECHNIQUE: value" or "PRINT: value"
        /\b(?:print(?:\s*technique)?|technique)[\s:—\-]+([^\n,;]+)/i,
        // Pattern 2: "PRINT\nvalue" (next line)
        /\b(?:print|technique)[\s:—\-]*\s*\n\s*([^\n,;]+)/i,
        // Pattern 3: "PRINT" in a table cell, value in next cell
        /\b(?:print|technique)\b[\s\|]*(?:\n|\|)[\s\|]*([^\n\|,;]+)/i,
        // Pattern 4: Common print techniques mentioned elsewhere
        /\b(screen\s*print(?:ing)?|digital\s*print(?:ing)?|sublimation|dtg|direct\s*to\s*garment|embroidery|heat\s*transfer|vinyl|foil|gid\s*print|plasto\s*print|discharge(?:\s*print)?|pigment(?:\s*print)?|reactive(?:\s*print)?|silk\s*screen|pad\s*print|water\s*based|rubber\s*print|flock\s*print|glitter\s*print|puff\s*print|high\s*density|metallic\s*print|glow\s*in\s*dark|reflective\s*print|3d\s*(?:print|puff))\b/i
      ];
      
      for (const pattern of printPatterns) {
        const match = text.match(pattern);
        if (match) {
          let rawValue = match[1] || match[0]; // Handle both capturing groups
          
          // Clean up the value
          const cleanedValue = rawValue
            .replace(/^[=:—\-\s\|]+/, '')  // Remove leading separators
            .split(/[\n,;]|\b(?:color|colour|placement|gsm|fabric|material|composition)\b/i)[0] // Stop at next field
            .replace(/\b(?:print|technique|method|type|style)[\s:]*/gi, '') // Remove label words
            .replace(/\s+/g, ' ')  // Collapse multiple spaces
            .trim()
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
            
          // Skip common false positives
          const skipWords = ['Yes', 'No', 'Na', 'N/A', 'None', 'Not', 'Applicable', 'Color', 'Colour'];
          if (cleanedValue && !skipWords.some(word => cleanedValue.includes(word)) && cleanedValue.length > 2) {
            return cleanedValue;
          }
        }
      }
      
      // If we still can't find anything, check if there's a color mentioned
      // as sometimes prints are just referred to by color
      const colorMatch2 = text.match(/\b(?:color|colour)[\s:]+([^\n,;]+)/i);
      if (colorMatch2) {
        return 'Color: ' + colorMatch2[1].trim();
      }
      
      // Default to Not Specified if nothing else found
      return 'Not Specified';
      
    case 'colour':
      // First try to find color codes like 18-4140 TCX
      const colorCodeMatch = text.match(/\b(\d{1,2}-\d{3,4})\s*([A-Z]+\b)?/i);
      if (colorCodeMatch) {
        return colorCodeMatch[1] + (colorCodeMatch[2] ? ' ' + colorCodeMatch[2] : '');
      }
      
      // Look for color names after 'color' or 'colour'
      const colorMatch = text.match(/(?:color|colour)[\s:]+([^\n,;]+?)(?=\n|print|color|$)/i);
      if (colorMatch) {
        const colorText = colorMatch[1].trim()
          .replace(/^[=:]+\s*/, '')
          .split(/[\n,;]|print color/)[0]
          .trim();
          
        // Extract common color names if present
        const commonColors = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'gray', 'grey', 'navy', 'teal'];
        for (const color of commonColors) {
          if (colorText.toLowerCase().includes(color)) {
            return color.charAt(0).toUpperCase() + color.slice(1);
          }
        }
        return colorText;
      }
      
      // Look for color in the first few lines where it's commonly specified
      const firstFewLines = text.split('\n').slice(0, 5).join(' ');
      const firstColorMatch = firstFewLines.match(/\b(?:color|colour)[\s:]+([^\n,;]+)/i);
      if (firstColorMatch) {
        return firstColorMatch[1].trim()
          .replace(/^[=:]+\s*/, '')
          .split(/[\n,;]|print color/)[0]
          .trim();
      }
      return '';
      
    case 'fit':
      // Try multiple patterns in sequence
      const patterns = [
        // Pattern 1: "FIT: value" or "FIT - value"
        /\bFIT[\s\-:—]+([^\n,;]+)/i,
        // Pattern 2: "FIT\nvalue" (next line)
        /\bFIT[\s\-:—]*\s*\n\s*([^\n,;]+)/i,
        // Pattern 3: "FIT" in a table cell, value in next cell
        /\bFIT\b[\s\|]*(?:\n|\|)[\s\|]*([^\n\|,;]+)/i
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        
        if (match) {
          let rawValue = match[1].trim();
          
          // Clean up the value
          const cleanedValue = rawValue
            .replace(/^[=:—\-\s\|]+/, '')  // Remove leading separators
            .split(/[\n,;]|\b(?:license|trend|gender|style|size|brand|color|fabric|material|gsm)\b/i)[0] // Stop at next field
            .replace(/\s+/g, ' ')  // Collapse multiple spaces
            .trim()
            .toUpperCase();
            
          if (cleanedValue) {
            return cleanedValue;
          }
        }
      }
      
      // If no explicit FIT: pattern found, try line-by-line scan as fallback
      const explicitFitMatch = text.match(/\\bfit\\s*[\-:]\\s*([^\n,;]+)/i);
      if (explicitFitMatch) {
        const fitValue = explicitFitMatch[1]
          .replace(/^[=:\\—\\-\\s]+/, '')  // Clean leading separators
          .split(/[\n,;]|(?:LICENSE|TREND|GENDER|STYLE|SIZE|BRAND|COLOR|FABRIC|MATERIAL|GSM)/i)[0]
          .replace(/\\s+/g, ' ')
          .trim();
          
        if (fitValue) {
          return fitValue.toUpperCase();
        }
      }
      
      // Next, scan line-by-line around the FIT label. This handles formats like:
      // "FIT : Oversized" or table cells where value appears on the next line.
      // Supports various separators (colon/dash/pipe/unicode variants) and spacing.
      try {
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/\bfit\b/i.test(line)) {
            // Try to grab value from the same line after the label
            const sameLine = line
              .replace(/^.*\bfit\b\s*[\:：\-—–|]*\s*/i, '')  // Get everything after FIT:
              .replace(/\s*(?:license|licence|trend)\s*:.*$/i, '')  // Remove any license/trend text at the end
              .replace(/\s*\|.*$/, '')  // Remove anything after a pipe
              .replace(/\s{2,}.*/, '')  // Remove anything after multiple spaces
              .trim();
            
            const stopWords = /^(?:gender|license|licence|fabric|material|composition|trend|style|size|sizes?)\b/i;
            const cleanedSameLine = sameLine
              .replace(/^[=\:\-—–|]+\s*/, '')  // Remove any leading separators
              .replace(/\s*\|\s*.*$/, '')      // Remove anything after a pipe
              .replace(/\s{2,}.*/, '')          // Remove anything after multiple spaces
              .replace(/\b(?:license|licence|trend)\s*:.*$/i, '')  // Final cleanup of any remaining license/trend text
              .split(/[\n,;]/)[0]  // Take only the first part if there are multiple segments
              .trim();
            if (cleanedSameLine && !stopWords.test(cleanedSameLine)) {
              return sanitizeFit(cleanedSameLine)
                .replace(/[\s\-]+/g, ' ')
                .replace(/\s*\/\s*/g, '/')
                .toUpperCase();
            }

            // Otherwise, look at the immediate next non-empty line as the value cell
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            if (j < lines.length) {
              const nextLineRaw = lines[j].trim();
              const nextLine = nextLineRaw
                .replace(/^[=:\-—–|]+\s*/, '')
                // stop at any following label on same line/cell
                .split(/\b(?:license|licence|trend|gender|style|size|sizes?|print|color|colour|fabric|material|composition|gsm)\b\s*[:\-]?/i)[0]
                .replace(/\s*\|\s*.*$/, '')
                .replace(/\s{2,}.*/, '')
                .trim();
              if (nextLine && !stopWords.test(nextLine)) {
                return sanitizeFit(nextLine)
                  .replace(/[\s\-]+/g, ' ')
                  .replace(/\s*\/\s*/g, '/')
                  .toUpperCase();
              }
            }
          }
        }
      } catch (_) { /* ignore line-scan errors and continue */ }
      

      
      // Fallback to extracting fit from fabric/gsm section if not found yet
      const fitSection = text.split(/print|color|colour|embroider/i)[0] || '';
      const fabricFitMatch = fitSection.match(/(?:fit|fabric|material|gsm)[\s:]+([^\n,;]+)/i);
      if (fabricFitMatch) {
        const fitText = fabricFitMatch[1].trim()
          .replace(/^[=:]+\s*/, '')
          .split(/[\n,;]|gsm|g\/m²/)[0]  // Stop at common fabric specs
          .replace(/\d+\s*(?:gsm|g\/m²)/i, '') // Remove GSM values
          .trim();
          
        // Clean up common patterns
        return fitText.replace(/[\s-]+/g, '/')  // Convert spaces/dashes to slashes
                     .replace(/\//g, '/')      // Ensure consistent slashes
                     .toUpperCase();
      }
      
      return '';
      
    case 'fabric':
      // Extract fabric information, focusing on the main fabric type
      const fabricSection = text.split(/print|color|embroider|trims/i)[0] || '';
      const fabricMatch = fabricSection.match(/(?:fabric|material|composition)[\s:]+([^\n,;]+)/i) ||
                        fabricSection.match(/(\d+\s*gsm[^\n,;]*)/i);
      if (fabricMatch) {
        return fabricMatch[1].trim()
          .replace(/^[=:]+\s*/, '')
          .split(/[\n,;]|print|color|embroider/)[0]
          .replace(/\b(?:fabric|material|composition|gsm)[\s:]*/gi, '')
          .trim();
      }
      return '';
      
    case 'brand':
      // Look for brand information before any technical specifications
      const brandSection = text.split(/print|color|embroider|trims|label/i)[0] || '';
      const brandMatch = brandSection.match(/(?:brand|designer)[\s:]+([^\n,;]+)/i);
      if (brandMatch) {
        return brandMatch[1].trim()
          .replace(/^[=:]+\s*/, '')
          .split(/[\n,;]|by |for /)[0]
          .trim();
      }
      return '';
  }
  
  // Fallback to general field extraction
  const normalizedText = text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, '\n')
    .toLowerCase();
    
  for (const field of possibleFieldNames) {
    const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const patterns = [
      new RegExp(`\\b${escapedField}\\s*[=:]+\\s*([^\\n,;]+)`, 'i'),
      new RegExp(`\\b${escapedField}\\s+([^\\n,;]+)`, 'i'),
      new RegExp(`\\b${escapedField}\\s*-\\s*([^\\n,;]+)`, 'i')
    ];
    
    for (const pattern of patterns) {
      const match = normalizedText.match(pattern);
      if (match && match[1]) {
        return match[1].trim()
          .replace(/^[=:-]+\s*/, '')
          .replace(/\s*[,\n;]\s*$/, '');
      }
    }
  }
  
  return '';
}

// Configure AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Helper: derive S3 object key from a given URL or key-like string
const deriveS3BucketAndKeyFromUrl = (input) => {
  if (!input) return { bucket: null, key: null };
  try {
    // If it's not a full URL, treat it as a key/path with known bucket (env)
    if (typeof input === 'string' && !/^https?:\/\//i.test(input)) {
      return { bucket: process.env.S3_BUCKET_NAME || null, key: input.replace(/^\/+/, '') };
    }

    const u = new URL(input);
    const host = u.hostname;
    let path = u.pathname || '';
    path = path.startsWith('/') ? path.substring(1) : path;

    // bucket.s3.<region>.amazonaws.com/key
    const sub = host.split('.');
    if (sub.length >= 5 && sub[1] === 's3' && sub[sub.length - 2] === 'amazonaws' && sub[sub.length - 1] === 'com') {
      const bucket = sub[0];
      return { bucket, key: path };
    }

    // s3.amazonaws.com/bucket/key
    if (host === 's3.amazonaws.com') {
      const parts = path.split('/');
      if (parts.length >= 2) {
        const bucket = parts[0];
        const key = parts.slice(1).join('/');
        return { bucket, key };
      }
    }

    // Otherwise fallback to env bucket
    return { bucket: process.env.S3_BUCKET_NAME || null, key: path };
  } catch (e) {
    return { bucket: process.env.S3_BUCKET_NAME || null, key: String(input).replace(/^\/+/, '') };
  }
};

// Function to upload file to S3
const uploadToS3 = async (file, key) => {
  // Validate inputs
  if (!file || !file.buffer) {
    throw new Error('Invalid file object - missing buffer');
  }
  
  if (!key || typeof key !== 'string') {
    throw new Error('Invalid S3 key provided');
  }

  // Validate environment variables
  if (!process.env.S3_BUCKET_NAME) {
    throw new Error('S3_BUCKET_NAME environment variable is not set');
  }
  
  if (!process.env.AWS_REGION) {
    throw new Error('AWS_REGION environment variable is not set');
  }

  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/pdf',
    ServerSideEncryption: 'AES256' // Server-side encryption
    // Removed ACL as the bucket has ACLs disabled
  };

  try {
    const command = new PutObjectCommand(params);
    const result = await s3Client.send(command);
    
    // Extract folder name from key (first part before the first '/')
    const folder = key.split('/')[0];
    
    // Construct a bucket-style S3 URL without encoding path separators
    const fileUrl = `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    console.log('✅ S3 Upload completed:')
    
    return { 
      ...result, 
      Location: fileUrl, 
      Key: key,
      Bucket: params.Bucket,
      Folder: folder
    };
  } catch (error) {
    console.error('❌ S3 Upload Error:', {
      message: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      bucket: params.Bucket,
      key: params.Key
    });
    
    // Re-throw with more context
    const enhancedError = new Error(`S3 Upload failed: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.bucket = params.Bucket;
    enhancedError.key = params.Key;
    throw enhancedError;
  }
};

const app = express();

// Parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));

// Configure CORS for all routes
app.use(cors({
  origin: config.frontendUrl,
  methods: config.security.cors.allowedMethods,
  allowedHeaders: config.security.cors.allowedHeaders,
  exposedHeaders: config.security.cors.exposedHeaders,
  credentials: true
}));

// Handle preflight requests
app.options('*', cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.frontendUrl,
    methods: config.security.cors.allowedMethods,
    allowedHeaders: config.security.cors.allowedHeaders,
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: config.security.socket.pingTimeout,
  pingInterval: config.security.socket.pingInterval,
  cookie: config.security.socket.cookie
});

// Handle socket connections
io.on('connection', (socket) => {
  // connection established

  // Handle joining rooms
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
  });

  // Handle leaving rooms
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
  });

  socket.on('disconnect', () => {
    // disconnected
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Disposition']
}));

// Handle preflight requests
app.options('*', cors());
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve files from S3 by key or URL-like input
app.get('/file/*', async (req, res) => {
  try {
    // Capture everything after /api/file/
    const raw = req.params[0] || '';
    const decoded = decodeURIComponent(raw);

    // Derive bucket and key from input (supports full URLs and plain keys)
    const { bucket: derivedBucket, key } = deriveS3BucketAndKeyFromUrl(decoded);
    const bucket = req.query.bucket || derivedBucket || process.env.S3_BUCKET_NAME;

    if (!bucket || !key) {
      return res.status(400).json({ error: 'Missing bucket or key' });
    }

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const object = await s3Client.send(command);

    // Set headers if available
    if (object.ContentType) res.setHeader('Content-Type', object.ContentType);
    if (object.ContentLength) res.setHeader('Content-Length', object.ContentLength.toString());
    if (object.ETag) res.setHeader('ETag', object.ETag);
    if (object.LastModified) res.setHeader('Last-Modified', object.LastModified.toUTCString());

    // Stream body
    object.Body.pipe(res);
  } catch (err) {
    const code = err.$metadata?.httpStatusCode || 500;
    if (code === 404 || err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'File not found' });
    }
    console.error('Error serving S3 file:', err);
    return res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// Multer for memory storage (for GridFS)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { 
    fileSize: 5000 * 1024 * 1024,  // 500MB file size limit
    fieldSize: 500 * 1024 * 1024,  // 50MB field size limit for metadata
    fieldNameSize: 100,            // 100 bytes for field name
    fields: 10                     // Maximum 10 fields
  } 
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('✅ MongoDB connected');
}).catch(err => console.error(err));


// Socket.IO logic
io.on('connection', (socket) => {
  // connected

  socket.on('join_room', (recordId) => {
    socket.join(recordId);
  });

  socket.on('leave_room', (recordId) => {
    socket.leave(recordId);
  });

  // Join a room for a specific techpack
  socket.on('join-techpack', (techpackId) => {
    socket.join(`techpack-${techpackId}`);
  });

  // Handle tech pack comments (separate from line sheet comments)
  socket.on('add-comment', async ({ techpackId, comment, user }) => {
    try {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(techpackId)) {
        console.error('Invalid techpack ObjectId format:', techpackId);
        return socket.emit('error', { message: 'Invalid tech pack ID format' });
      }
      
      // Find the tech pack
      const techpack = await Techpack.findById(techpackId);
      if (!techpack) {
        console.error('Tech pack not found:', techpackId);
        return socket.emit('error', { message: 'Tech pack not found' });
      }

      // Ensure comments array exists
      if (!Array.isArray(techpack.comments)) {
        techpack.comments = [];
      }

      // Create the comment object matching the schema
      const newComment = {
        _id: new mongoose.Types.ObjectId(),
        user: user || 'User',
        text: comment || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add comment to tech pack
      techpack.comments.push(newComment);
      await techpack.save();

      // Broadcast to all clients in the tech pack room
      const commentToBroadcast = {
        _id: newComment._id.toString(),
        id: newComment._id.toString(),
        author: newComment.user,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newComment.user)}&background=0D8ABC&color=fff`,
        comment: newComment.text,
        timestamp: newComment.createdAt,
        role: 'Designer'
      };

      io.to(`techpack-${techpackId}`).emit('new-comment', {
        techpackId,
        comment: commentToBroadcast
      });
    } catch (error) {
      console.error('Error adding tech pack comment:', error);
      socket.emit('error', { message: 'Failed to add comment' });
    }
  });

  // Handle joining a line sheet room
  socket.on('join-linesheet', (lineSheetId) => {
    socket.join(`linesheet-${lineSheetId}`);
  });

  // Handle new line sheet comments
  socket.on('add-linesheet-comment', async ({ lineSheetId, comment }) => {
    try {
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(lineSheetId)) {
        console.error('Invalid ObjectId format:', lineSheetId, 'Length:', lineSheetId.length);
        return socket.emit('error', { message: 'Invalid line sheet ID format' });
      }
      
      // Find the line sheet
      const lineSheet = await LineSheet.findById(lineSheetId);
      if (!lineSheet) {
        console.error('Line sheet not found:', lineSheetId);
        return socket.emit('error', { message: 'Line sheet not found' });
      }

      // Ensure comments array exists
      if (!Array.isArray(lineSheet.comments)) {
        lineSheet.comments = [];
      }

      // Create a properly structured comment object
      const commentId = comment.id || new mongoose.Types.ObjectId().toString();
      const commentText = comment.comment || '';
      
      if (!commentText) {
        console.error('Comment text is empty, not saving');
        return socket.emit('error', { message: 'Comment text is required' });
      }
      
      // Generate a new ObjectId for the comment instead of using the potentially invalid commentId
      const commentObjectId = new mongoose.Types.ObjectId();
      
      const newComment = {
        _id: commentObjectId,
        id: commentObjectId.toString(),
        user: comment.author || 'User', // Map author to user for schema compatibility
        text: commentText, // Map comment to text for schema compatibility
        author: comment.author || 'User', // Keep for frontend compatibility
        avatar: comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.author || 'U')}`,
        comment: commentText, // Keep for frontend compatibility
        timestamp: new Date().toISOString(),
        role: comment.role || 'User'
      };
      
      // Add the new comment to the array
      lineSheet.comments.push(newComment);
      
      // Save the document with validation
      const savedDoc = await lineSheet.save({ validateBeforeSave: true });

      // Get the saved comment (should be the last one in the array)
      const savedComment = savedDoc.comments[savedDoc.comments.length - 1];
      
      // Prepare the comment for broadcasting - map DB fields to frontend expected fields
      const commentToBroadcast = {
        _id: savedComment._id?.toString(),
        id: savedComment.id || savedComment._id?.toString(),
        author: savedComment.user || 'User', // Use 'user' field from DB
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(savedComment.user || 'U')}&background=0D8ABC&color=fff`,
        comment: savedComment.text || '', // Use 'text' field from DB
        timestamp: savedComment.createdAt || savedComment.updatedAt || new Date().toISOString(),
        role: 'Brand Manager', // Set appropriate role
        isSending: false
      };

      // Broadcast to all clients in the specific line sheet room
      io.to(`linesheet-${lineSheetId}`).emit('linesheet-comment', {
        lineSheetId,
        comment: commentToBroadcast
      });
    } catch (error) {
      console.error('Error adding line sheet comment:', error);
      socket.emit('error', { message: 'Failed to add comment', error: error.message });
    }
  });

  socket.on('disconnect', () => {
    // disconnected
  });

  // Example event: manually emit if needed
  socket.on('techpack-updated', (data) => {
    socket.broadcast.emit('techpack-update', data);
  });
});

// Create Techpack with file upload to S3
app.post('/api/tech-packs', upload.single('pdf'), async (req, res) => {
  
  // Start total request timer
  console.time('TOTAL_TECHPACK_REQUEST');
  
  try {
    const { metadata } = req.body;
    if (!metadata || !req.file) {
      console.log('❌ Missing required data:', { hasMetadata: !!metadata, hasFile: !!req.file });
      return res.status(400).json({ error: 'Missing metadata or PDF file' });
    }

    const parsed = JSON.parse(metadata);
    console.log('📋 Parsed metadata:', parsed);
    
    // Generate a unique key for the S3 object
    const fileExtension = req.file.originalname.split('.').pop();
    const s3Key = `techpacks/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
    
    // Extract and process text from PDF
    let extractedText = '';
    console.time('EXTRACT_PDF_TIME');
    try {
      console.log('📄 Extracting and processing text from PDF...');
      
      // Extract text with more detailed parsing options
      const data = await pdf(req.file.buffer, {
        pagerender: pageData => {
          // Custom renderer to better handle text extraction
          const renderOptions = {
            normalizeWhitespace: true,
            disableCombineTextItems: false,
            includeMarkedContent: true
          };
          return pageData.getTextContent(renderOptions)
            .then(textContent => {
              // Store text items with their positions
              const items = [];
              
              // First pass: collect all text items with their positions
              for (const item of textContent.items) {
                const tx = item.transform[4]; // x position
                const ty = Math.round(item.transform[5]); // y position
                items.push({ text: item.str, x: tx, y: ty });
              }
              
              // Sort items by y position (top to bottom) and then by x position (left to right)
              items.sort((a, b) => {
                if (Math.abs(a.y - b.y) < 5) { // Consider items on the same line if y is close enough
                  return a.x - b.x;
                }
                return a.y - b.y;
              });
              
              // Group items into lines based on y position
              const lines = [];
              let currentLine = [];
              let lastY = -100;
              
              for (const item of items) {
                if (Math.abs(item.y - lastY) > 5) { // New line if y position changes significantly
                  if (currentLine.length > 0) {
                    lines.push(currentLine.map(i => i.text).join(' '));
                  }
                  currentLine = [item];
                  lastY = item.y;
                } else { // Same line
                  // Add space between items if they're not overlapping
                  const lastItem = currentLine[currentLine.length - 1];
                  if (lastItem && (item.x - (lastItem.x + lastItem.text.length * 5) > 5)) {
                    currentLine.push({...item, text: ' ' + item.text});
                  } else {
                    currentLine.push(item);
                  }
                }
              }
              
              // Add the last line
              if (currentLine.length > 0) {
                lines.push(currentLine.map(i => i.text).join(' '));
              }
              
              return lines.join('\n');
            });
        }
      });
      
      const fullText = data.text;
      console.log('📝 Raw extracted text length:', fullText.length);
      console.timeEnd('EXTRACT_PDF_TIME');
      
      // Extract specific fields with improved handling for tech pack format
      const fields = {
        // Basic Information
        styleId: extractField(
          fullText, 
          'styleId', 
          ['style', 'style no', 'style number', 'article no', { filename: req.file.originalname }]
        ),
        
        // Product Information
        productName: (() => {
          // First try to find a product name in the first few lines
          const firstLines = fullText.split('\n').slice(0, 5).join('\n');
          
          // Look for common product name patterns
          const nameMatch = firstLines.match(/^([^\n]{5,50})\s*\n/);
          if (nameMatch) {
            const potentialName = nameMatch[1].trim();
            // Check if it's a valid product name (not a style ID or other metadata)
            if (!/^[A-Z0-9-]+$/.test(potentialName) && potentialName.length > 3) {
              return potentialName;
            }
          }
          
          // Fall back to extractField if no good match found
          return extractField(fullText, 'productName', ['product name', 'style name', 'item name', 'description']);
        })(),
        description: (() => {
          // First, try to find a dedicated description section with common labels
          const descPatterns = [
            // Pattern 1: "DESCRIPTION: value" or "DESCRIPTION - value"
            /(?:description|product[\s-]?details?|details|style[\s-]?description|product[\s-]?description)[\s:—\-]+([^\n,;]+?)(?=\n\w|$)/i,
            // Pattern 2: "DESCRIPTION\nvalue" (next line)
            /(?:description|details)[\s:—\-]*\s*\n\s*([^\n,;]+)/i,
            // Pattern 3: "DESCRIPTION" in a table cell, value in next cell
            /(?:description|details)\b[\s\|]*(?:\n|\|)[\s\|]*([^\n\|,;]+)/i,
            // Pattern 4: Look for a paragraph after common section headers
            /(?:about|product[\s-]?info|style[\s-]?info)[\s:—\-]*\n+([^#*\n][^\n]+(?:\n[^#*\n][^\n]+)*)/i
          ];
          
          // Try patterns first
          for (const pattern of descPatterns) {
            const match = fullText.match(pattern);
            if (match) {
              const desc = match[1].trim()
                .replace(/^[=:—\-\s\|]+/, '')
                .replace(/[\[\](){}]+/g, '')
                .replace(/\s+/g, ' ')
                .trim();
                
              if (desc && desc.length > 10) {
                return desc;
              }
            }
          }
          
          // If no pattern matched, try to find a meaningful paragraph
          const lines = fullText.split('\n').filter(line => line.trim().length > 0);
          for (let i = 0; i < Math.min(10, lines.length); i++) {
            const line = lines[i].trim();
            if (/^[A-Z0-9-]+$/.test(line) || 
                line.length < 20 || 
                /^(?:style|color|fabric|fit|print|size|gender|material|composition|gsm|qty|quantity|measurements?|specs?|notes?)[\s:]/i.test(line)) {
              continue;
            }
            
            if (/[a-zA-Z]/.test(line) && line.split(/\s+/).length > 2) {
              return line;
            }
          }
          
          // As last resort, build from other fields
          const features = [];
          const addFeature = (label, value) => {
            if (value && value !== 'Not Specified' && value !== 'N/A' && value !== 'None' && value !== '') {
              features.push(`${label}: ${value}`);
            }
          };
          
          // Add available features
          addFeature('Fabric', fields.fabric);
          addFeature('Color', fields.colour);
          addFeature('Fit', fields.fit);
          
          // Handle print technique if available
          if (fields.printTechnique && fields.printTechnique !== 'Not Specified') {
            const cleanPrint = fields.printTechnique
              .replace(/\b(print|technique|method|type)[\s:]*/gi, '')
              .trim()
              .split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            if (cleanPrint) {
              features.push(`Print: ${cleanPrint}`);
            }
          }
          
          // Add article type if available
          if (fields.articleType) {
            addFeature('Type', fields.articleType);
          }
          
          // Return combined features or a default message
          return features.length > 0 
            ? features.join(' | ')
            : 'No description available. Please add product details.';
        })(),
        
        // Technical Details - Enhanced color extraction
        colour: extractField(fullText, 'colour', [
          'colour', 'color', 'shade', 'pantone', 'pms',
          'c: ', 'c:', // Common color prefix in some documents
          'shade no', 'shade no:', 'shade number',
          'colour code', 'color code', 'colourway'
        ]),
        fit: extractField(fullText, 'fit', ['fit', 'fit type', 'sizing', 'fabric', 'material']),
        printTechnique: extractField(fullText, 'printTechnique', ['print technique', 'print', 'printing method']),
        fabric: extractField(fullText, 'fabric', ['fabric', 'material', 'composition', 'gsm']),
        
        // Branding
        brand: extractField(fullText, 'brand', ['brand', 'brand name', 'label']),
        collection: extractField(fullText, 'collection', ['collection', 'season']),
        
        // Extract care instructions more precisely
        careInstructions: (() => {
          const careMatch = fullText.match(/(?:care|wash)[\s:]+([^\n]+?)(?=\n\w|$)/i);
          return careMatch ? careMatch[1].trim() : '';
        })()
      };
      
      // Clean up and validate extracted fields
      if (fields.fit) {
        fields.fit = fields.fit
          // cut off before any subsequent labels that might have been concatenated
          .split(/\b(?:license|licence|trend|gender|style|size|sizes?|brand|color|colour|print|printing|fabric|material|composition|gsm)\b\s*[:\-–—]?/i)[0]
          // Remove measurements and GSM tokens that sometimes ride along
          .split(/\d+\s*(?:cm|inch|\"|gsm)/i)[0]
          // Remove any leading occurrences of fabric-related labels
          .replace(/\b(?:fabric|material|composition|gsm)[\s:]*/gi, '')
          // Trim table artifacts
          .replace(/\s*\|\s*.*$/, '')
          .replace(/\s{2,}.*/, '')
          .replace(/^[=:\-—–|]+\s*/, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // Enhanced color field cleaning and validation
      if (fields.colour) {
        // First clean common issues
        let cleanColor = fields.colour
          .replace(/[\r\n\t]+/g, ' ') // Replace newlines and tabs with spaces
          .replace(/\s+/g, ' ')         // Collapse multiple spaces
          .trim();

        // Remove common prefixes and suffixes
        cleanColor = cleanColor
          .replace(/^[=:]+\s*/, '')     // Remove leading = or :
          .replace(/[\[\](){}]+/g, '')  // Remove brackets and parentheses
          .replace(/\b(?:color|colour|shade|pantone|pms|code|no|number|name|:)[\s:]*/gi, '') // Remove common labels
          .trim();

        // Handle Pantone colors specifically
        const pantoneMatch = cleanColor.match(/(?:pantone|pms)[\s:]*(\d+-?\d*[a-z]?)/i);
        if (pantoneMatch) {
          cleanColor = 'PANTONE ' + pantoneMatch[1].toUpperCase();
        } else {
          // For non-Pantone colors, clean up further
          cleanColor = cleanColor
            .split(/[\n,;|]|\b(?:and|or|\/)\b/i)[0]  // Take first color if multiple
            .replace(/\s*\d+\s*(?:cm|inch|\"|gsm|%)\b/gi, '')  // Remove measurements
            .replace(/\s*\b(?:print|placement|embroidery|print|graphic)[^,;]*/gi, '') // Remove print/placement info
            .trim();
        }

        // If we still have 'ar twork' or other artifacts, try to find a better match
        if (cleanColor.toLowerCase().includes('ar twork') || cleanColor.length > 50 || !/\w{2,}/.test(cleanColor)) {
          // Look for color patterns in the full text
          const colorPatterns = [
            /(?:color|colour|pantone|pms|shade)[\s:]+([^\n,;]+)/i,  // Standard color: prefix
            /\b(?:pantone|pms)[\s:]*([\d-]+[a-z]?)\b/i,  // Pantone format
            /\b(?:rgb|hsl|hex|#)[\s:]*([^\s,;]+)/i,     // Color codes
            /\b(?:shade|color|colour)[\s:]*[#:]?\s*([^\n,;]+)/i  // More flexible matching
          ];

          for (const pattern of colorPatterns) {
            const match = fullText.match(pattern);
            if (match) {
              const potentialColor = match[1].trim()
                .replace(/^[=:]+\s*/, '')
                .replace(/[\[\](){}]+/g, '')
                .trim();
              
              if (potentialColor && potentialColor.length > 1 && !potentialColor.toLowerCase().includes('ar twork')) {
                cleanColor = potentialColor;
                break;
              }
            }
          }
        }

        // Final cleanup and validation
        cleanColor = cleanColor
          .replace(/^[^\w#]+/, '')  // Remove leading non-word characters
          .replace(/[^\w#\s-]+/g, '') // Remove special characters but keep dashes and spaces
          .replace(/\s+/g, ' ')
          .trim();

        // If we still don't have a valid color, use a default
        if (!cleanColor || cleanColor.length < 2) {
          cleanColor = 'Not Specified';
        }

        fields.colour = cleanColor;
      }
      
      // Clean up fabric field
      if (fields.fabric) {
        fields.fabric = fields.fabric
          .split(/\d+\s*(?:cm|inch|\"|gsm)/i)[0]  // Remove measurements
          .replace(/\b(?:fabric|material|composition|gsm)[\s:]*/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      // Clean up brand field
      if (fields.brand) {
        fields.brand = fields.brand
          .split(/[\n,;]|by |for |label|designer/i)[0]  // Take first part before any labels
          .replace(/\b(?:brand|designer|label)[\s:]*/gi, '')
          .trim();
      }
      
      // Clean up the extracted data
      if (fields.printTechnique && fields.printTechnique.length > 100) {
        // If print technique is too long, try to extract just the first relevant part
        const cleanPrint = fields.printTechnique.split(/[\n;,]|\b(?:and|or)\b/)[0].trim();
        if (cleanPrint) fields.printTechnique = cleanPrint;
      }
      
      // Special handling for style ID from filename if not found in text
      if (!fields.styleId && req.file.originalname) {
        const filename = req.file.originalname.replace(/\.[^/.]+$/, ''); // Remove extension
        fields.styleId = filename;
      }
      
      // Update the parsed metadata with extracted fields if they're not already set
      const updatedMetadata = { ...parsed };
      Object.entries(fields).forEach(([key, value]) => {
        if (value && (!updatedMetadata[key] || updatedMetadata[key] === 'Not specified')) {
          updatedMetadata[key] = value;
        }
      });
      
      // Format the extracted fields for storage
      extractedText = Object.entries(fields)
        .filter(([_, value]) => value && value.trim() !== '') // Remove empty fields
        .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
        .join('\n');
        
      console.log('✅ Extracted specific fields from PDF:');
      console.log(extractedText);
      
      // Update the parsed metadata for database storage
      Object.assign(parsed, updatedMetadata);
    } catch (extractError) {
      console.error('⚠️ Failed to extract text from PDF:', extractError.message);
      // Continue with upload even if text extraction fails
      console.timeEnd('EXTRACT_PDF_TIME');
    }
    
    // Upload file to S3
    try {
      console.time('S3_UPLOAD_TIME');
      // Validate file buffer before upload
      if (!req.file.buffer || req.file.buffer.length === 0) {
        throw new Error('File buffer is empty or invalid');
      }
      
      console.log('📤 Calling uploadToS3 function...');
      s3UploadResult = await uploadToS3(req.file, s3Key);
      
      // Double-check the result has required fields
      if (!s3UploadResult.Location || !s3UploadResult.Key) {
        throw new Error('S3 upload result missing required fields');
      }
      
      console.log('✅ File uploaded successfully');
      console.timeEnd('S3_UPLOAD_TIME');
    } catch (s3Error) {
      console.timeEnd('S3_UPLOAD_TIME');
      console.error('❌ S3 upload failed:', {
        error: s3Error.message,
        code: s3Error.code,
        statusCode: s3Error.$metadata?.httpStatusCode,
        requestId: s3Error.$metadata?.requestId,
        originalError: s3Error.originalError?.message,
        stack: s3Error.stack
      });
      
      // Return error immediately - do not save to database
      console.timeEnd('TOTAL_TECHPACK_REQUEST');
      return res.status(500).json({ 
        error: 'Failed to process PDF',
        details: s3Error.message,
        code: s3Error.code
      });
    }
    
    // Final verification of S3 upload result
    if (!s3UploadResult || !s3UploadResult.Location || !s3UploadResult.Key) {
      console.error('❌ S3 upload result validation failed:', {
        hasResult: !!s3UploadResult,
        hasLocation: !!s3UploadResult?.Location,
        hasKey: !!s3UploadResult?.Key,
        result: s3UploadResult
      });
      return res.status(500).json({ 
        error: 'S3 upload validation failed - missing required fields'
      });
    }
    
    console.log('✅ S3 upload validation passed, proceeding to database save...');
    
    // Create techpack data with S3 bucket, key, and thumbnails
    const techpackData = {
      name: parsed.name || req.file.originalname,
      description: parsed.description || 'No description provided',
      // Ensure articletype has a default value if not provided
      articletype: parsed.articleType || parsed.articletype || 'Other',
      colour: parsed.colour || 'Not Specified',
      gender: parsed.gender || 'Unisex',
      fit: parsed.fit || 'Regular',
      printTechnique: parsed.printTechnique || parsed.printtechnique || '',
      fabric: parsed.fabric || '',
      brand: parsed.brand || 'Unknown',
      designer: 'Yusuf', // Set default designer name
      collection: parsed.collection || 'Default',
      careInstructions: parsed.careInstructions || 'Follow standard care instructions',
      styleId: parsed.styleId || `ID-${Date.now()}`,
      brandManager: parsed.brandManager || null,
      s3BucketName: process.env.S3_BUCKET_NAME,
      s3Key: s3UploadResult.Key,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      extractedText: extractedText,
      metadata: parsed.metadata || {},
      // Thumbnail generation removed (server-side). Keep schema fields with safe defaults.
      
      // Use parsed totalPages if provided from client, otherwise default to 1
      totalPages: parsed.totalPages || 1,
      pdfOriginalName: req.file.originalname,
      s3BucketName: process.env.S3_BUCKET_NAME || 'mozodo-data-storage',
      s3Key: s3Key,
      // Attach Pantone-style file object for uniformity across modules
      file: {
        name: req.file.originalname,
        key: s3Key,
        folder: s3Key.split('/')[0], // Extract folder from key (e.g., 'techpacks' from 'techpacks/12345-filename.pdf')
        bucket: process.env.S3_BUCKET_NAME,
        size: req.file.size,
        type: req.file.mimetype
      },
      // Initialize empty arrays for extracted data
      extractedImages: [],
      extractedColors: [],
      imageCount: 0,
      tshirtImages: [],
      // Default status
      status: parsed.status || 'draft',
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const techpack = new Techpack(techpackData);
    console.time('DB_SAVE_TIME');
    await techpack.save();
    console.timeEnd('DB_SAVE_TIME');
    // Emit notifications
    const notification = {
      type: 'techpack',
      action: 'uploaded',
      item: {
        id: techpack._id,
        name: techpack.name || 'Unnamed Tech Pack',
        description: techpack.description || '',
        brandManager: techpack.brandManager,
        timestamp: new Date()
      },
      message: `New tech pack "${techpack.name || 'Unnamed Tech Pack'}" has been uploaded`
    };
    
    io.emit('notification', notification);
    io.emit('techpack-updated', techpack);
    
    // Success: end total timer before responding
    console.timeEnd('TOTAL_TECHPACK_REQUEST');
    res.status(201).json({ 
      success: true, 
      id: techpack._id,
      file: techpack.file,
      s3Key: techpack.s3Key,
      bucket: techpack.s3BucketName,
      message: 'Tech pack created successfully'
    });
  } catch (err) {
    console.error('❌ Error saving techpack:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    // End total timer on error path
    console.timeEnd('TOTAL_TECHPACK_REQUEST');
    res.status(500).json({ 
      error: 'Failed to upload techpack',
      details: err.message
    });
  }
});

// Update Techpack
app.put('/api/tech-packs/:id', async (req, res) => {
  try {
  // PUT /api/tech-packs/:id - Request received
  // Request body logged
    
    const { id } = req.params;
    const updates = req.body;

    // Get the current document to check for status changes
    const current = await Techpack.findById(id);
    if (!current) {
  // Techpack not found
      return res.status(404).json({ error: 'Not found' });
    }

  // Current techpack status and requested update logged

    const updated = await Techpack.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) {
  // Failed to update techpack
      return res.status(404).json({ error: 'Not found' });
    }

  // Techpack updated
    
    // Check if status was updated
    if (updates.status && current.status !== updates.status) {
  // Status changed
      const notification = {
        type: 'techpack',
        action: 'status_updated',
        item: {
          id: updated._id,
          name: updated.name || 'Unnamed Tech Pack',
          status: updates.status,
          previousStatus: current.status,
          timestamp: new Date()
        },
        message: `Tech pack "${updated.name || 'Unnamed Tech Pack'}" status changed from ${current.status || 'N/A'} to ${updates.status}`
      };
  // Emitting notification
      io.emit('notification', notification);
    } else {
    // No status change detected or no status in update
    }
    
    // Emit the general update event
    io.emit('techpack-updated', updated);

    res.json(updated);
  } catch (err) {
    console.error("❌ Update error:", err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Get a single tech pack by ID with transformed comments
app.get('/api/tech-packs/:id', async (req, res) => {
  try {
    const techpack = await Techpack.findById(req.params.id);
    if (!techpack) {
      return res.status(404).json({ error: 'Techpack not found' });
    }

    // Transform comments to match frontend expectations
    const transformedComments = (techpack.comments || []).map(comment => ({
      id: comment._id.toString(),
      _id: comment._id.toString(),
      author: comment.user || 'User',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user || 'U')}&background=0D8ABC&color=fff`,
      comment: comment.text || '',
      message: comment.text || '', // Keep both for compatibility
      timestamp: comment.createdAt || comment.updatedAt || new Date().toISOString(),
      role: 'Designer'
    }));

    const obj = techpack.toObject();
    
    // Generate presigned URL on-demand using stored bucket and key
    obj.pdfUrl = undefined;
    try {
      if (obj.s3Key && obj.s3BucketName) {
        const command = new GetObjectCommand({
          Bucket: obj.s3BucketName,
          Key: obj.s3Key
        });
        // Generate presigned URL with 1 hour expiration
        const signed = await getSignedUrl(s3Client, command, { expiresIn: 60 * 60 }); // 1 hour
        obj.pdfUrl = signed;
      } else {
        console.warn('⚠️ Missing S3 bucket or key for tech pack:', obj._id);
      }
    } catch (signErr) {
      console.error('❌ Could not generate presigned URL:', {
        error: signErr.message,
        bucket: obj.s3BucketName,
        key: obj.s3Key,
        techpackId: obj._id
      });
    }

    res.json({
      ...obj,
      comments: transformedComments
    });
  } catch (error) {
    console.error('Error fetching tech pack:', error);
    res.status(500).json({ error: 'Failed to fetch tech pack' });
  }
});

// Get comments for a techpack
app.get('/api/tech-packs/:id/comments', async (req, res) => {
  try {
    const techpack = await Techpack.findById(req.params.id).select('comments');
    if (!techpack) {
      return res.status(404).json({ error: 'Techpack not found' });
    }
    
    // Transform comments to match frontend expectations
    const transformedComments = (techpack.comments || []).map(comment => ({
      id: comment._id.toString(),
      _id: comment._id.toString(),
      author: comment.user || 'User',
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user || 'U')}&background=0D8ABC&color=fff`,
      comment: comment.text || '',
      message: comment.text || '', // Keep both for compatibility
      timestamp: comment.createdAt || comment.updatedAt || new Date().toISOString(),
      role: 'Designer'
    }));
    
    res.json(transformedComments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Add a comment to a techpack
app.post('/api/tech-packs/:id/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    const techpack = await Techpack.findById(req.params.id);
    
    if (!techpack) {
      return res.status(404).json({ error: 'Techpack not found' });
    }

    if (!techpack.comments) {
      techpack.comments = [];
    }

    const newComment = {
      user: user || 'Anonymous',
      text,
      timestamp: new Date()
    };

    techpack.comments.push(newComment);
    await techpack.save();

    // Emit the new comment via Socket.IO
    io.to(`techpack-${req.params.id}`).emit('new-comment', {
      techpackId: req.params.id,
      comment: newComment
    });

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Add a comment to a PrintStrike record
app.post('/api/printstrike/:id/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    const printStrike = await PrintStrike.findById(req.params.id);
    if (!printStrike) {
      return res.status(404).json({ error: 'PrintStrike not found' });
    }
    if (!printStrike.comments) {
      printStrike.comments = [];
    }
    const newComment = {
      user: user || 'Anonymous',
      text,
      timestamp: new Date()
    };
    printStrike.comments.push(newComment);
    await printStrike.save();
    // Emit the new comment via Socket.IO (optional, adjust as needed)
    io.to(`printstrike-${req.params.id}`).emit('new-comment', {
      printStrikeId: req.params.id,
      comment: newComment
    });
    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error adding comment to PrintStrike:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Add a comment to a PreProduction record
app.post('/api/preproduction/:id/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    const preProduction = await PreProduction.findById(req.params.id);
    if (!preProduction) {
      return res.status(404).json({ error: 'PreProduction not found' });
    }
    if (!preProduction.comments) {
      preProduction.comments = [];
    }
    const newComment = {
      user: user || 'Anonymous',
      text,
      timestamp: new Date()
    };
    preProduction.comments.push(newComment);
    await preProduction.save();
    // Emit the new comment via Socket.IO (optional, adjust as needed)
    io.to(`preproduction-${req.params.id}`).emit('new-comment', {
      preProductionId: req.params.id,
      comment: newComment
    });
    res.status(201).json(newComment);
  } catch (error) {
    console.error('Error adding comment to PreProduction:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get all tech packs (singular path kept for legacy)
app.get('/api/tech-pack', async (req, res) => {
  try {
  // Fetching tech packs
    // Fetch documents in small batches and sort in memory
    const batchSize = 500;
    let allTechpacks = [];
    
    // First get the total count
    const total = await Techpack.countDocuments();
  // total techpacks: computed

    // Fetch in batches
    for (let i = 0; i < total; i += batchSize) {
      const batch = await Techpack.find()
        .skip(i)
        .limit(batchSize);
      allTechpacks = [...allTechpacks, ...batch];
    }

    // Sort in memory
    const sortedTechpacks = allTechpacks.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    ).slice(0, 100);

  // Found and sorted techpacks
    res.json(sortedTechpacks);
  } catch (err) {
    console.error('❌ Error fetching tech packs:', {
      message: err.message,
      stack: err.stack,
      name: err.name
    });
    res.status(500).json({ 
      error: 'Failed to fetch tech packs',
      details: err.message 
    });
  }
});

// Alias: plural route for frontend compatibility
app.get('/api/tech-packs', async (req, res) => {
  try {
    const { folder } = req.query;

    // Build query with optional folder filter
    const query = {};
    if (folder) {
      // Match S3 keys that start with the folder name
      query.s3Key = new RegExp(`^${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/`);
    }

    // Return only essential fields for listing view (no pagination/limit)
    const techpacks = await Techpack.find(query)
      .select('name description articletype colour gender fit printTechnique status brandManager s3BucketName s3Key createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance

    // Generate presigned URLs on-demand and normalize field names
    const normalized = await Promise.all(techpacks.map(async (tp) => {
      const articleType = tp.articleType || tp.articletype || tp.article_type;
      const status = (tp.status || 'DRAFT').toUpperCase();
      
      // Generate presigned URL on-demand
      let pdfUrl = null;
      try {
        if (tp.s3Key && tp.s3BucketName) {
          const command = new GetObjectCommand({
            Bucket: tp.s3BucketName,
            Key: tp.s3Key
          });
          // Generate presigned URL with 1 hour expiration
          pdfUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 60 }); // 1 hour
        }
      } catch (signErr) {
        console.error('❌ Could not generate presigned URL for list:', {
          error: signErr.message,
          bucket: tp.s3BucketName,
          key: tp.s3Key,
          techpackId: tp._id
        });
      }

      return {
        ...tp,
        articleType,
        status,
        pdfUrl
      };
    }));

    res.json(normalized);
  } catch (err) {
    console.error('❌ Error fetching tech packs:', err);
    res.status(500).json({ error: 'Failed to fetch tech packs', details: err.message });
  }
});

// -------------  Line Sheet Endpoints ----------------------

// Create Line Sheet with Image Extraction
app.post('/api/line-sheets', upload.single('pdf'), async (req, res) => {
  try {
    const { metadata } = req.body;
    if (!metadata || !req.file) {
      return res.status(400).json({ error: 'Missing metadata or PDF file' });
    }

    const parsed = JSON.parse(metadata);

    // Upload the original PDF to S3 and produce a uniform file object
    let lineSheetFile = null;
    try {
      const fileExtension = req.file.originalname.split('.').pop();
      const lsS3Key = `linesheets/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
      const s3Upload = await uploadToS3(req.file, lsS3Key);
      if (!s3Upload || !s3Upload.Key) {
        throw new Error('S3 upload for line sheet failed');
      }
      lineSheetFile = {
        name: req.file.originalname,
        key: lsS3Key,
        folder: s3Upload.Folder || lsS3Key.split('/')[0],
        bucket: process.env.S3_BUCKET_NAME,
        size: req.file.size,
        type: req.file.mimetype
      };
    } catch (uploadErr) {
      console.error('❌ Line sheet S3 upload error:', uploadErr);
      return res.status(500).json({ error: 'Failed to upload line sheet PDF to S3', details: uploadErr.message });
    }

    // Handle brand manager reference
    let brandManagerId = undefined;
    if (parsed.brandManager) {
      try {
        // First try to find the brand manager by name
        let managerDoc = await BrandManager.findOne({ name: parsed.brandManager });
        
        // If not found, create a new one
        if (!managerDoc) {
          managerDoc = new BrandManager({
            name: parsed.brandManager,
            total: 1
          });
          await managerDoc.save();
        } else {
          // If found, increment the total
          managerDoc.total += 1;
          await managerDoc.save();
        }
        
  brandManagerId = managerDoc._id;
      } catch (managerError) {
        console.error('⚠️ Error handling brand manager:', {
          error: managerError.message,
          brandManager: parsed.brandManager
        });
        // Continue without brand manager if there's an error
      }
    }

    // Extract images using Python service
    let extractedImages = [];
    let imageCount = 0;
    try {
      // Extracting images from PDF using Python service
      
      // Create form data for Python service using in-memory buffer
      const FormData = require('form-data');
      const axios = require('axios');
      
      const formData = new FormData();
      formData.append('pdf', req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });

  const pythonServiceUrl = 'http://localhost:5001';
      
      let extractResponse;
      try {
        extractResponse = await axios.post(`${pythonServiceUrl}/api/extract-pdf`, formData, {
          headers: {
            ...formData.getHeaders(),
            'Content-Type': 'multipart/form-data'
          },
          maxBodyLength: 100 * 1024 * 1024, // 100MB max body size
          maxContentLength: 100 * 1024 * 1024, // 100MB max content length
          timeout: 30000 // 30 second timeout
        });
      } catch (axiosError) {
        console.error('❌ Axios error calling Python service:', {
          message: axiosError.message,
          code: axiosError.code,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
          config: {
            url: axiosError.config?.url,
            method: axiosError.config?.method,
            headers: axiosError.config?.headers,
            data: typeof axiosError.config?.data === 'string' ? 
                  axiosError.config.data.substring(0, 200) + '...' : 
                  '[Buffer]',
            timeout: axiosError.config?.timeout
          }
        });
        throw axiosError;
      }

      // Process the response from Python service
      if (extractResponse.data && extractResponse.data.images) {
        // Process each image and create proper URLs
        extractedImages = extractResponse.data.images.map((img, idx) => {
          // Ensure we have the required fields with defaults
          const imageKey = img.key || `extracted_images/Linesheets/page1_img${idx + 1}_${Date.now()}.png`;
          const imageName = img.name || `page1_img${idx + 1}.png`;
          const imageFormat = (img.format || 'png').toLowerCase();
          const imageFolder = img.folder || imageKey.split('/')[0];
          
          // Create a clean image object with all required fields
          const imageObj = {
            folder: imageFolder,
            
            key: imageKey,
            bucket: img.bucket || process.env.S3_BUCKET_NAME || 'mozodo-data-storage',
            name: imageName,
            format: imageFormat,
            page: parseInt(img.page) || 1,
            size: parseInt(img.size) || 0,
            type: `image/${imageFormat}`,
            index: parseInt(img.index) || idx + 1,
            width: parseInt(img.width) || 0,
            height: parseInt(img.height) || 0,
            uploadedAt: new Date()
          };
          
          console.log('Processed image:', JSON.stringify(imageObj, null, 2));
          return imageObj;
        });
        
        imageCount = extractedImages.length;
        console.log(`✅ Processed ${imageCount} images from Python service`);
        
        if (imageCount === 0) {
          console.warn('⚠️ No valid images found in PDF extraction response');
        }
      } else {
        console.warn('⚠️ No images array found in PDF extraction response');
      }
    } catch (extractError) {
      console.error('⚠️ Image extraction failed:', {
        message: extractError.message,
        code: extractError.code,
        response: extractError.response?.data,
        stack: extractError.stack
      });
      
    
      
      // Continue with empty images if extraction fails but service is running
      extractedImages = [];
    }

    // Generate custom name format: FWD_SS25_MW_TST_XXXXX
    const generateCustomName = (season) => {
      const randomSuffix = Math.floor(10000 + Math.random() * 90000); // 5-digit random number
      const seasonCode = season ? season.replace(/\s+/g, '') : 'SS25'; // Remove spaces, default to SS25
      return `FWD_${seasonCode}_MW_TST_${randomSuffix}`;
    };

    // Create the line sheet document with extracted images and custom name
    const customName = generateCustomName(parsed.season);

    // Prepare line sheet data with extracted images
    const lineSheetData = {
      ...parsed,
      name: customName, // Override with custom generated name
      brandManager: brandManagerId, // always use ObjectId or undefined
      status: parsed.status || 'DRAFT',
      timestamp: new Date(),
      // Attach Pantone-style file reference for the uploaded PDF
      file: lineSheetFile,
      // Store the full image objects including URLs and metadata
      extractedImages: extractedImages,
      imageCount: extractedImages.length,
      brand: parsed.brand || '', // Add brand from form data, default to empty string
      // Store the first image as preview if available
      previewUrl: extractedImages.length > 0 ? extractedImages[0].url : null
    };
    
    const lineSheet = new LineSheet(lineSheetData);

  await lineSheet.save();

    // Emit to all clients with notification
    const notification = {
      type: 'linesheet',
      action: 'uploaded',
      item: {
        id: lineSheet._id,
        name: lineSheet.name || 'Unnamed Line Sheet',
        description: lineSheet.description || '',
        brandManager: lineSheet.brandManager,
        imageCount: imageCount,
        timestamp: new Date()
      },
      message: `New line sheet "${lineSheet.name || 'Unnamed Line Sheet'}" has been uploaded with ${imageCount} extracted images`
    };
    
    io.emit('notification', notification);
    io.emit('linesheet-updated', lineSheet);
    res.status(201).json({ 
      success: true, 
      id: lineSheet._id,
      file: lineSheet.file,
      extractedImages: extractedImages,
      imageCount: imageCount
    });
  } catch (err) {
    console.error('❌ Error saving line sheet:', err);
    res.status(500).json({ error: 'Failed to upload line sheet' });
  }
});

// Get all Line Sheets with filtering, searching, and pagination
app.get('/api/line-sheets', async (req, res) => {
  try {
    const { managerId, status, search, page = 1, limit = 20 } = req.query;
    const query = {};
    
    // Filter by brand manager if provided
    if (managerId) {
      query.brandManager = managerId;
    }
    
    // Add status filter if provided
    if (status) {
      query.status = status;
    }
    
    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { season: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filter by status if provided
    if (status) {
      query.status = status.toUpperCase();
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { styleId: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } },
        { articletype: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get total count for pagination
    const total = await LineSheet.countDocuments(query);
    
    // Fetch line sheets with pagination, sorting, and populated brand manager
    const lineSheets = await LineSheet.find(query)
      .populate('brandManager', 'name _id')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean(); // Convert to plain JavaScript objects
    
    // Process line sheets to use direct file paths
    const processedLineSheets = lineSheets.map(sheet => {
      // Create a new object to avoid mutating the original
      const processedSheet = { ...sheet };
      
      // Process extracted images
      if (Array.isArray(processedSheet.extractedImages)) {
        processedSheet.extractedImages = processedSheet.extractedImages.map(img => {
          const sanitized = { ...img };
          // Use the key directly if available, otherwise use the URL
          const key = img.key || (img.url ? img.url.split('/').pop() : null);
          if (key) {
            sanitized.url = `/api/file/${key}`;
          }
          // Keep the key property for frontend use
          return sanitized;
        });
      }

      // Process previewUrl
      if (processedSheet.previewUrl) {
        const key = processedSheet.previewUrl.split('/').pop();
        processedSheet.previewUrl = `/api/file/${key}`;
      }
      
      return processedSheet;
    });
    
    res.json({
      data: processedLineSheets,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error('❌ Error fetching line sheets:', err);
    res.status(500).json({ error: 'Failed to fetch line sheets' });
  }
});
app.get('/api/line-sheets/:id', async (req, res) => {
  try {
    const lineSheet = await LineSheet.findById(req.params.id)
      .populate('brandManager', 'name _id')
      .lean(); // Convert to plain JavaScript object
      
    if (!lineSheet) {
      return res.status(404).json({ error: 'Line sheet not found' });
    }
    
    // Process extracted images to use direct file paths
    if (Array.isArray(lineSheet.extractedImages)) {
      lineSheet.extractedImages = lineSheet.extractedImages.map(img => {
        const sanitized = { ...img };
        // Use the key directly if available, otherwise use the URL
        const key = img.key || (img.url ? img.url.split('/').pop() : null);
        if (key) {
          sanitized.url = `/file/${key}`;
        }
        // Keep the key property for frontend use
        return sanitized;
      });
    }
    
    // Process image fields to use direct file paths
    const imageFields = ['previewUrl', 'thumbnailUrl', 'mainImage'];
    imageFields.forEach(field => {
      if (lineSheet[field]) {
        const key = lineSheet[field].split('/').pop();
        lineSheet[field] = `/api/file/${key}`;
      }
    });
    
    // Ensure comments array exists and transform comments
    if (!Array.isArray(lineSheet.comments)) {
      lineSheet.comments = [];
    }
    
    const transformedComments = lineSheet.comments.map(comment => ({
      id: comment._id?.toString() || `temp-${Date.now()}`,
      _id: comment._id?.toString() || `temp-${Date.now()}`,
      author: comment.user || comment.author || 'User',
      avatar: comment.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user || comment.author || 'U')}&background=0D8ABC&color=fff`,
      comment: comment.text || comment.comment || '',
      message: comment.text || comment.comment || '',
      timestamp: comment.createdAt || comment.updatedAt || comment.timestamp || new Date().toISOString(),
      role: comment.role || 'Brand Manager'
    }));
    
    // Process all image URLs and s3FileSchema objects in the line sheet
    const processImageUrls = (obj) => {
      if (!obj) return obj;
      
      // Handle arrays of images or file objects
      if (Array.isArray(obj)) {
        return obj.map(processImageUrls);
      }
      
      // Handle s3FileSchema objects
      if (obj.key && obj.bucket) {
        // If it's already in s3FileSchema format, ensure the URL is set
        if (!obj.url) {
          // Construct the URL using the API endpoint
          obj.url = `/file/${encodeURIComponent(obj.key)}`;
        }
        return obj;
      }
      
      // Handle nested objects
      if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          // Process nested objects and arrays
          if (value && typeof value === 'object') {
            result[key] = processImageUrls(value);
          } 
          // Process URL fields (case-insensitive check)
          else if (key.toLowerCase().includes('url') || key.toLowerCase().includes('image')) {
            result[key] = value ? ensureSecureS3Url(value) : value;
          } else {
            result[key] = value;
          }
        }
        return result;
      }
      
      // Handle string URLs
      if (typeof obj === 'string') {
        // If it's already a full URL to our API, return as is
        if (obj.startsWith('/file/')) {
          return obj;
        }
        // If it's an S3 key, convert to API URL
        if (obj.startsWith('extracted_images/') || obj.startsWith('techpacks/') || obj.startsWith('uploads/')) {
          return `/file/${encodeURIComponent(obj)}`;
        }
        // If it's a full URL, ensure it's secure
        if (obj.startsWith('http')) {
          return ensureSecureS3Url(obj);
        }
      }
      
      return obj;
    };
    
    // Format the response (lineSheet is already a plain object due to .lean())
    let response = processImageUrls({
      ...lineSheet,
      id: lineSheet._id,
      articleType: lineSheet.articletype,
      comments: transformedComments,
      extractedImages: lineSheet.extractedImages || [],
      imageCount: lineSheet.extractedImages?.length || 0,
      previewUrl: lineSheet.previewUrl || (lineSheet.extractedImages?.[0]?.url || null)
    });

    // Sign previewUrl and other top-level image fields if possible
    if (lineSheet.__pendingToSign && Array.isArray(lineSheet.__pendingToSign)) {
      for (const item of lineSheet.__pendingToSign) {
        try {
          const command = new GetObjectCommand({ Bucket: item.bucket || process.env.S3_BUCKET_NAME, Key: item.key });
          const signed = await getSignedUrl(s3Client, command, { expiresIn: 60 * 60 * 24 * 7 }); // 7 days
          response[item.field] = signed;
        } catch (e) {
          response[item.field] = ensureSecureS3Url(response[item.field]);
        }
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching line sheet:', error);
    res.status(500).json({ error: 'Failed to fetch line sheet' });
  }
});


// Update Line Sheet
app.put('/api/line-sheets/:id', async (req, res) => {
  try {
    // PUT /api/line-sheets/:id - Request received
    // Request body logged
    
    const { id } = req.params;
    const updates = req.body;

    // Get the current document to check for status changes
    const current = await LineSheet.findById(id);
    if (!current) {
  // Line sheet not found
      return res.status(404).json({ error: 'Line sheet not found' });
    }

  // Current line sheet status and requested update logged

    const updated = await LineSheet.findByIdAndUpdate(id, updates, { new: true });
    if (!updated) {
  // Failed to update line sheet
      return res.status(404).json({ error: 'Line sheet not found' });
    }

  // Line sheet updated
    
    // Check if status was updated
    if (updates.status && current.status !== updates.status) {
  // Status changed
      const notification = {
        type: 'linesheet',
        action: 'status_updated',
        item: {
          id: updated._id,
          name: updated.name || 'Unnamed Line Sheet',
          status: updates.status,
          previousStatus: current.status,
          brandManager: updated.brandManager,
          timestamp: new Date()
        },
        message: `Line sheet "${updated.name || 'Unnamed Line Sheet'}" status changed from ${current.status || 'N/A'} to ${updates.status}`
      };
  // Emitting notification
      io.emit('notification', notification);
    } else {
  // No status change detected or no status in update
    }
    
    // Emit the general update event
    io.emit('linesheet-updated', updated);

    res.json(updated);
  } catch (err) {
    console.error("❌ Line sheet update error:", err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Get Line Sheets by Brand Manager (expects managerId)
app.get('/api/line-sheets/manager/:managerId', async (req, res) => {
  try {
    const { managerId } = req.params;
    const isObjectId = /^[a-fA-F0-9]{24}$/.test(managerId);
    let filter = {};
    if (isObjectId) {
      filter = { brandManager: managerId };
    } else {
      // find brand manager by name first
      const bm = await BrandManager.findOne({ name: managerId });
      if (bm) {
        filter = { brandManager: bm._id };
      } else {
        filter = { tempNoMatch: true }; // ensures empty result
      }
    }

    const docs = await LineSheet.find(filter).populate('brandManager', 'name').sort({ createdAt: -1 }).lean();

    // Process line sheets to use direct file paths
    const processedLineSheets = docs.map(sheet => {
      // Process extracted images
      if (Array.isArray(sheet.extractedImages)) {
        sheet.extractedImages = sheet.extractedImages.map(img => {
          const sanitized = { ...img };
          // Use the key directly if available, otherwise use the URL
          const key = img.key || (img.url ? img.url.split('/').pop() : null);
          if (key) {
            sanitized.url = `/api/file/${key}`;
          }
          // Keep the key property for frontend use
          return sanitized;
        });
      }

      // Process previewUrl
      if (sheet.previewUrl) {
        const key = sheet.previewUrl.split('/').pop();
        sheet.previewUrl = `/api/file/${key}`;
      }
      return sheet;
    });

    res.json(processedLineSheets);
  } catch (err) {
    console.error('❌ Error fetching line sheets by manager:', err);
    res.status(500).json({ error: 'Failed to fetch line sheets by manager' });
  }
});

// Start Express app
app.use('/api', (req, res, next) => {
  // Request received
  next();
});

// Brand Manager Endpoints

// Get all brand managers
app.get('/api/brand-managers', async (req, res) => {
  try {
  // Fetching brand managers
    const grouped = await BrandManager.aggregate([
      {
        $group: {
          _id: { $toLower: '$name' },
          name: { $first: '$name' },
          total: { $sum: '$total' },
          createdAt: { $first: '$date' },
          firstId: { $first: '$_id' }
        }
      },
      {
        $project: {
          _id: '$firstId',
          name: 1,
          total: 1,
          createdAt: 1
        }
      },
      { $sort: { name: 1 } }
    ]);
  // Brand managers found
    
    // Disable caching
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.json(grouped);
  } catch (err) {
    console.error('❌ Error fetching brand managers:', err);
    res.status(500).json({ error: 'Failed to fetch brand managers' });
  }
});

// Create or update a brand manager
app.post('/api/brand-managers', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const manager = await BrandManager.findOneAndUpdate(
      { name },
      { $inc: { total: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(201).json(manager);
  } catch (err) {
    console.error('❌ Error creating/updating brand manager:', err);
    res.status(500).json({ error: 'Failed to create/update brand manager' });
  }
});

// Get tech packs by brand manager
app.get('/api/tech-packs/manager/:managerName', async (req, res) => {
  try {
    const { managerName } = req.params;
  // Fetching tech packs for manager
    
    const techPacks = await Techpack.find({ brandManager: managerName })
      .sort({ createdAt: -1 });
      
  // Found tech packs for manager
    res.json(techPacks);
  } catch (err) {
    console.error('❌ Error fetching tech packs by manager:', err);
    res.status(500).json({ error: 'Failed to fetch tech packs by manager' });
  }
});

// Get a single assortment plan by ID
app.get('/api/assortment-plans/:id', async (req, res) => {
  try {
    const plan = await AssortmentPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Assortment plan not found' });
    }
    res.json(plan);
  } catch (err) {
    console.error('❌ Error fetching assortment plan:', err);
    res.status(500).json({ error: 'Failed to fetch assortment plan' });
  }
});

// Get all Pantone records
app.get('/api/pantone', async (req, res) => {
  try {
    const docs = await Pantone.find();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
 
// Add a comment to Pantone record at document level (preferred)

app.post('/api/pantone/:id/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!text || !user) {
      return res.status(400).json({ error: 'User and text are required' });
    }
    const pantone = await Pantone.findById(req.params.id);
    if (!pantone) return res.status(404).json({ error: 'Not found' });

    const newComment = { user, text, createdAt: new Date() };
    pantone.comments = [...(pantone.comments || []), newComment];
    await pantone.save();

    res.json({ comments: pantone.comments });
  } catch (err) {
    console.error('Error adding comment to pantone:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Fallback: legacy route with files/:fileId/comments to support existing frontend
app.post('/api/pantone/:id/files/:fileId/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!text || !user) {
      return res.status(400).json({ error: 'User and text are required' });
    }
    const pantone = await Pantone.findById(req.params.id);
    if (!pantone) return res.status(404).json({ error: 'Not found' });

    const newComment = { user, text, createdAt: new Date() };
    pantone.comments = [...(pantone.comments || []), newComment];
    await pantone.save();

    res.json({ comments: pantone.comments });
  } catch (err) {
    console.error('Error adding comment to pantone (legacy route):', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get single Pantone by id
app.get('/api/pantone/:id', async (req, res) => {
  try {
    const pantone = await Pantone.findById(req.params.id);
    if (!pantone) return res.status(404).json({ error: 'Not found' });
    res.json(pantone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment to PrintStrike record (document-level)
app.post('/api/printstrike/:id/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!user || !text) return res.status(400).json({ error: 'User and text are required' });
    const ps = await PrintStrike.findById(req.params.id);
    if (!ps) return res.status(404).json({ error: 'Not found' });
    const newComment = { user, text, createdAt: new Date() };
    ps.comments = [...(ps.comments || []), newComment];
    await ps.save();
    res.json({ comments: ps.comments });
  } catch (err) {
    console.error('Error adding comment to printstrike:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Legacy route for existing frontend (file-level path)
app.post('/api/printstrike/:id/files/:fileId/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!user || !text) return res.status(400).json({ error: 'User and text are required' });
    const ps = await PrintStrike.findById(req.params.id);
    if (!ps) return res.status(404).json({ error: 'Not found' });
    const newComment = { user, text, createdAt: new Date() };
    ps.comments = [...(ps.comments || []), newComment];
    await ps.save();
    res.json({ comments: ps.comments });
  } catch (err) {
    console.error('Error adding comment to printstrike (legacy):', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get all PrintStrike records
app.get('/api/printstrike', async (req, res) => {
  try {
    const docs = await PrintStrike.find();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add comment to PreProduction record (document-level)
app.post('/api/preproduction/:id/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!user || !text) return res.status(400).json({ error: 'User and text are required' });
    const pp = await PreProduction.findById(req.params.id);
    if (!pp) return res.status(404).json({ error: 'Not found' });
    const newComment = { user, text, createdAt: new Date() };
    pp.comments = [...(pp.comments || []), newComment];
    await pp.save();
    res.json({ comments: pp.comments });
  } catch (err) {
    console.error('Error adding comment to preproduction:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Legacy route for preproduction file path
app.post('/api/preproduction/:id/files/:fileId/comments', async (req, res) => {
  try {
    const { user, text } = req.body;
    if (!user || !text) return res.status(400).json({ error: 'User and text are required' });
    const pp = await PreProduction.findById(req.params.id);
    if (!pp) return res.status(404).json({ error: 'Not found' });
    const newComment = { user, text, createdAt: new Date() };
    pp.comments = [...(pp.comments || []), newComment];
    await pp.save();
    res.json({ comments: pp.comments });
  } catch (err) {
    console.error('Error adding comment to preproduction (legacy):', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Get all PreProduction records
app.get('/api/preproduction', async (req, res) => {
  try {
    const docs = await PreProduction.find();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all DevelopmentSample records
app.get('/api/developmentsamples', async (req, res) => {
  try {
    const docs = await DevelopmentSample.find();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all assortment plans
app.get('/api/assortment-plans', async (req, res) => {
  try {
    const plans = await AssortmentPlan.find();
    res.json(plans);
  } catch (err) {
    console.error('❌ Error fetching assortment plans:', err);
    res.status(500).json({ error: 'Failed to fetch assortment plans' });
  }
});

// Get all Techpack managers (grouped)
app.get('/api/techpack/managers', async (req, res) => {
  try {
    const grouped = await Techpack.aggregate([
      {
        $group: {
          _id: { $toLower: '$brandManager' },
          name: { $first: '$brandManager' },
          total: { $sum: '$total' },
          createdAt: { $first: '$createdAt' },
          firstId: { $first: '$_id' }
        }
      },
      {
        $project: {
          _id: '$firstId',
          name: 1,
          total: 1,
          createdAt: 1
        }
      },
      { $sort: { name: 1 } }
    ]);
    res.json(grouped);
  } catch (err) {
    console.error('❌ Error fetching techpack managers:', err);
    res.status(500).json({ error: 'Failed to fetch techpack managers' });
  }
});

// DevelopmentSample upload
app.post('/api/developmentsamples', upload.fields([{ name: 'techpacks', maxCount: 10 }, { name: 'specsheets', maxCount: 10 }]), async (req, res) => {
  try {
    const { season, articleType, gender, vendor } = req.body;
    if (!season || !articleType || !gender || !vendor) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if ((!req.files.techpacks || req.files.techpacks.length === 0) && (!req.files.specsheets || req.files.specsheets.length === 0)) {
      return res.status(400).json({ error: 'No files were uploaded' });
    }

    const techpacks = req.files.techpacks ? await mapFilesGridFS(req.files.techpacks) : [];
    const specsheets = req.files.specsheets ? await mapFilesGridFS(req.files.specsheets) : [];

    const developmentSample = new DevelopmentSample({
      season,
      articleType,
      gender,
      vendor,
      techpacks,
      specsheets
    });
    const doc = await developmentSample.save();
    io.emit('record_created', { type: 'developmentsample', data: doc });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Failed to upload files', details: err.message });
  }
});

// Development Samples Routes
app.post('/api/developmentsamples', upload.fields([
  { name: 'techpacks', maxCount: 10 },
  { name: 'specsheets', maxCount: 10 }
]), async (req, res) => {
  // New Development Sample Request
  
  // Received files info
  
  try {
    const { season, articleType, gender, vendor } = req.body;
    
    // Validate required fields
    const missingFields = [];
    if (!season) missingFields.push('season');
    if (!articleType) missingFields.push('articleType');
    if (!gender) missingFields.push('gender');
    if (!vendor) missingFields.push('vendor');
    
    if (missingFields.length > 0) {
      const error = `Missing required fields: ${missingFields.join(', ')}`;
      console.error('Validation error:', error);
      return res.status(400).json({ 
        success: false,
        error,
        missingFields
      });
    }

    try {
      // Process file uploads if any
      let techpacks = [];
      let specsheets = [];

      if (req.files?.techpacks?.length) {
        techpacks = await mapFilesGridFS(req.files.techpacks);
      }
      
      if (req.files?.specsheets?.length) {
        specsheets = await mapFilesGridFS(req.files.specsheets);
      }

      if (techpacks.length === 0 && specsheets.length === 0) {
        console.warn('No valid files were uploaded');
      }

      // Create new development sample
      const developmentSample = new DevelopmentSample({
        developmentSampleNumber: `DS-${Date.now().toString().slice(-6)}`,
        season,
        articleType,
        gender,
        vendor,
        techpacks,
        specsheets,
        status: 'Pending',
        createdAt: new Date()
      });

  const savedSample = await developmentSample.save();

      // Return the saved document
      return res.status(201).json({
        success: true,
        message: 'Development sample created successfully',
        data: savedSample
      });
      
    } catch (uploadError) {
      console.error('\nFile upload or processing error:', uploadError);
      console.error('Error details:', {
        message: uploadError.message,
        stack: uploadError.stack,
        name: uploadError.name
      });
      
      return res.status(500).json({
        success: false,
        error: `File processing failed: ${uploadError.message}`,
        details: process.env.NODE_ENV === 'development' ? uploadError.stack : undefined
      });
    }
    
  } catch (error) {
    console.error('\nUnexpected error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return res.status(500).json({ 
      success: false,
      error: error.message || 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all development samples
app.get('/api/developmentsamples', async (req, res) => {
  try {
    const samples = await DevelopmentSample.find().sort({ createdAt: -1 });
    res.json(samples);
  } catch (error) {
    console.error('Error fetching development samples:', error);
    res.status(500).json({ error: 'Failed to fetch development samples' });
  }
});

// Pantone Library upload endpoint
app.post('/api/pantone-library', upload.single('pdf'), async (req, res) => {
  try {
    const metadata = JSON.parse(req.body.metadata);
  // Received pantones logged
    // Save file info if needed (for now, just store name and previewUrl)
    const fileInfo = {
      name: req.file ? req.file.originalname : metadata.name,
      fileId: req.file ? req.file.id : undefined,
      previewUrl: metadata.previewUrl,
      totalPages: metadata.totalPages
    };
    // Prepare pantones array: [{pantoneNumber, colorName, hex}]
    const pantones = (metadata.pantones || []).map(p => ({
      pantoneNumber: p.code || p.pantoneNumber || '-',
      colorName: p.name || p.colorName || '-',
      hex: p.hex || undefined
    }));
    const doc = new PantoneLibrary({
      season: metadata.season,
      pantones,
      file: fileInfo
    });
    await doc.save();
    res.json({ success: true, id: doc._id });
  } catch (err) {
    console.error('Error uploading Pantone Library file:', err);
    res.status(500).json({ error: 'Failed to upload Pantone Library file' });
  }
});

// Pantone Library list endpoint
app.get('/api/pantone-library', async (req, res) => {
  try {
    const records = await PantoneLibrary.find().sort({ uploadedAt: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Pantone Library records' });
  }
});

// File serving endpoint: GET /api/file/:key
// Helper function to determine content type from file extension
const getContentType = (key) => {
  const ext = key.split('.').pop().toLowerCase();
  const types = {
    // Images
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    
    // Documents
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    
    // Text
    txt: 'text/plain',
    csv: 'text/csv',
    json: 'application/json',
    
    // Archives
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    
    // Default
    default: 'application/octet-stream'
  };
  
  return types[ext] || types.default;
};

// Serve files from S3 with proper content types and caching
// This endpoint handles both /api/file/... and /file/... to prevent double /api issues
app.get('/api/file/:key(*)', async (req, res) => {
  try {
    const { key } = req.params;
    const { folder } = req.query;
    
    if (!key) {
      return res.status(400).json({ error: 'File key is required' });
    }
    
    // Decode the key in case it was URL-encoded
    const decodedKey = decodeURIComponent(key);
    
    // If folder is provided, prepend it to the key
    const fullKey = folder ? `${folder.replace(/\/+$/, '')}/${decodedKey.replace(/^\/+/, '')}` : decodedKey;
    
    // Determine content type based on file extension
    const contentType = getContentType(decodedKey);
    
    // Set CORS headers to allow access from any origin
    res.set('Access-Control-Allow-Origin', '*');
    
    // Set cache control headers (1 day for images, 1 hour for other files)
    const isImage = contentType.startsWith('image/');
    res.set('Cache-Control', `public, max-age=${isImage ? 86400 : 3600}`);
    res.set('Content-Type', contentType);
    
    // For images, allow embedding and set proper disposition
    if (isImage) {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Disposition', 'inline');
    }
    // For PDFs, allow embedding and set proper disposition
    else if (contentType === 'application/pdf') {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Disposition', `inline; filename="${decodedKey.split('/').pop()}"`);
    }
    
    // Get the bucket name from environment variables
    const bucket = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || 'mozodo-data-storage';
    if (!bucket) {
      throw new Error('S3 bucket name is not configured');
    }
    
    console.log(`Serving file from S3: ${fullKey} from bucket ${bucket}`);
    
    // Create a command to get the S3 object
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: fullKey,
      ResponseContentType: contentType,
      ResponseContentDisposition: `inline; filename="${decodedKey.split('/').pop()}"`
    });
    
    // Get the S3 object
    const { Body } = await s3Client.send(command);
    
    // Stream the file directly from S3
    Body.pipe(res);
    
    // Handle stream errors
    Body.on('error', (err) => {
      console.error('Error streaming file from S3:', {
        error: err.message,
        bucket,
        key: fullKey,
        originalKey: key,
        folder
      });
      
      if (!res.headersSent) {
        res.status(500).json({ 
          error: 'Error streaming file',
          details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
      }
    });
    
  } catch (error) {
    console.error('Error serving file:', {
      error: error.message,
      stack: error.stack,
      key: req.params.key,
      folder: req.query.folder
    });
    
    // Handle specific AWS errors
    if (error.name === 'NoSuchKey' || error.code === 'NoSuchKey') {
      return res.status(404).json({ 
        error: 'File not found',
        details: process.env.NODE_ENV === 'development' ? `Key: ${req.params.key}, Folder: ${req.query.folder}` : undefined
      });
    }
    
    if (error.name === 'AccessDenied' || error.code === 'AccessDenied') {
      return res.status(403).json({ 
        error: 'Access denied',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to retrieve file',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});




const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error handling middleware:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});
