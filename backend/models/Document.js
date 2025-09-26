const mongoose = require('mongoose');

// Comment Schema
const commentSchema = new mongoose.Schema({
  user: { type: String, required: true },
  text: { type: String, required: true },
}, { timestamps: true });

// Reusable S3 file schema (kept _id: false for embedding)
const s3FileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  key: { type: String, required: true },
  folder: { type: String, required: true }, // e.g. 'techpacks', 'linesheets', 'extracted-images'
  bucket: { type: String, default: process.env.S3_BUCKET_NAME || 'mozodo-data-storage' },
  size: { type: Number, required: true },
  type: { type: String, required: true }
}, { _id: false });

const techpackSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  articletype: { type: String, required: true },
  colour: { type: String, required: true },
  fit: String,
  gender: { type: String, required: true },
  status: { type: String, default: 'DRAFT' },
  printTechnique: String, // Making this optional
  brandManager: String,
  brand: { type: String, default: '' },
  designer: { type: String, default: 'Yusuf' },
  styleId: String,
  timestamp: { type: Date, default: Date.now },
  totalPages: Number,
  pdfOriginalName: String,
  
  // S3 storage fields - store bucket and key separately
  s3BucketName: { type: String, default: 'mozodo-data-storage' }, // S3 bucket name
  s3Key: String, // S3 key for the uploaded PDF (e.g., /techpacks/1756210586275-vpzv5hq8r98.pdf)
  
  // Thumbnail information
  thumbnail: {
    url: String,
    key: String
  },
  
  // All page thumbnails
  thumbnails: [{
    url: String,
    key: String,
    pageNumber: Number
  }],
  
  totalPages: { type: Number, default: 1 },
  
  // Embedded S3 file object for uniformity with Pantone
  file: s3FileSchema,
  
  // Extracted data from PDF processing - matches Python service structure
  extractedImages: [{
    name: { type: String, required: true },
    key: { type: String, required: true },
    bucket: { type: String, default: process.env.S3_BUCKET_NAME || 'mozodo-data-storage' },
    size: { type: Number, default: 0 },
    type: { type: String, required: true }, // MIME type
    format: { type: String, required: true }, // file extension
    page: { type: Number, default: 1 },
    index: { type: Number, default: 0 },
    // Keep URL for backward compatibility
    url: { type: String },
    // Keep uploadedAt for tracking
    uploadedAt: { type: Date, default: Date.now }
  }],
  extractedColors: [String],
  imageCount: { type: Number, default: 0 },
  tshirtImages: [String],
  comments: [commentSchema], // Add comments array
  extractedText: { type: String, default: '' }, // Store extracted text from PDF
  createdAt: { type: Date, default: Date.now, index: true } // Add index for sorting
});

const Techpack = mongoose.model('tech--packs', techpackSchema);

const assortmentDetailSchema = new mongoose.Schema({
  category: String,
  range: String,
  mrp: String,
  mix: String,
  asrp: String,
  ppSegment: String,
  basicFashion: String,
  discount: String,
  depth: String,
  qty: String,
  // Add more fields as needed for your table structure
}, { _id: false });
 
const assortmentPlanSchema = new mongoose.Schema({
  id: String,
  season: String,
  addedDate: String,
  details: [assortmentDetailSchema]
});
 
const AssortmentPlan = mongoose.model('AssortmentPlan', assortmentPlanSchema);

// Brand Manager Schema
const brandManagerSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  total: { type: Number, default: 0 },
  date: { type: Date, default: Date.now }
});

const BrandManager = mongoose.model('BrandManager', brandManagerSchema);

// Line Sheet Schema
const lineSheetSchema = new mongoose.Schema({
  id: String,
  season: String,
  addedDate: String,
  details: [assortmentDetailSchema],

  // Metadata / PDF fields
  name: String,
  description: String,
  articletype: String,
  gender: String,
  brand: { type: String, default: '' },
  status: { type: String, default: 'DRAFT' },
  brandManager: { type: mongoose.Schema.Types.ObjectId, ref: 'BrandManager' },
  styleId: String,
  timestamp: { type: Date, default: Date.now },
  totalPages: Number,
  previewUrl: String,
  pdfPath: String,
  pdfOriginalName: String,
  // New: embedded S3 file object for the uploaded PDF
  file: s3FileSchema,
  
  // Extracted images from Python service with S3 metadata
  extractedImages: [{
    folder: { type: String },
    key: { type: String, required: true },
    bucket: { type: String, default: process.env.S3_BUCKET_NAME || 'mozodo-data-storage' },
    name: { type: String, required: true },
    format: { type: String, default: 'jpeg' },
    page: { type: Number, default: 1 },
    
    type: { type: String, default: 'image/jpeg' },
    index: { type: Number, default: 0 },
    
  }],
  imageCount: { type: Number, default: 0 }, // Number of extracted images
  
  // Legacy fields (for backward compatibility)
  rows: [mongoose.Schema.Types.Mixed], // Keep for backward compatibility
  
  comments: [commentSchema], // Add comments array to line sheet as well
  createdAt: { type: Date, default: Date.now, index: true }
});

const LineSheet = mongoose.model('line--sheets', lineSheetSchema);

const fileSchema = new mongoose.Schema({
  name: String,
  fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'attachments.files' },
  type: String,
  comments: [commentSchema]
});

// Dedicated file schema for Pantone records stored in S3
const pantoneFileSchema = new mongoose.Schema({
  name: { type: String, required: true },  // Original filename
  key: { type: String, required: true },   // S3 object key (e.g., 'pantones/filename.jpg')
  bucket: {
    type: String,
    default: process.env.S3_BUCKET_NAME || 'mozodo-data-storage'
  },
  size: { type: Number, required: true },  // File size in bytes
  type: { type: String, required: true }   // MIME type
}, { _id: false });

const PantoneSchema = new mongoose.Schema({
  season: { type: String, required: true },
  pantoneNumber: { type: String },
  file: pantoneFileSchema,                   // S3 file reference (Pantone-specific)
  manager: { type: String, required: true },
  selectedTechpack: { type: String },
  comments: [commentSchema],
  uploadedBy: { type: String, default: 'System' },
  status: {
    type: String,
    enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'],
    default: 'DRAFT'
  }
}, {
  timestamps: true,
  collection: 'pantones',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

const Pantone = mongoose.model('Pantone', PantoneSchema);

// Schema for Print Strike-off samples.
const PrintStrikeSchema = new mongoose.Schema({
  season: { type: String, required: true },
  printStrikeNumber: { type: String }, // Now optional
  file: pantoneFileSchema,
  manager: { type: String, required: true },
  selectedTechpack: { type: String },
  comments: [commentSchema], // Thread of comments for this record.
}, { timestamps: true, collection: 'printstrikes' });

const PrintStrike = mongoose.model('PrintStrike', PrintStrikeSchema);

// Schema for Pre-Production samples.
const PreProductionSchema = new mongoose.Schema({
  season: { type: String, required: true },
  preProductionNumber: { type: String },
  file: pantoneFileSchema,
  manager: { type: String, required: true },
  selectedTechpack: { type: String },
  comments: [commentSchema], // Thread of comments for this record.
}, { timestamps: true, collection: 'preproductions' });

const PreProduction = mongoose.model('PreProduction', PreProductionSchema);

const DevelopmentSampleSchema = new mongoose.Schema({
  season: { type: String, required: true },
  articleType: { type: String, required: true },
  gender: { type: String, required: true },
  techpacks: [fileSchema],
  specsheets: [fileSchema],
  vendor: { type: String, required: true },
}, { timestamps: true, collection: 'developmentsamples' });

const DevelopmentSample = mongoose.model('DevelopmentSample', DevelopmentSampleSchema);

const pantoneLibraryPantoneSchema = new mongoose.Schema({
  pantoneNumber: { type: String, required: true },
  colorName: { type: String, required: true },
  hex: { type: String },
});

const PantoneLibrarySchema = new mongoose.Schema({
  season: { type: String, required: true },
  pantones: [pantoneLibraryPantoneSchema], // Array of {pantoneNumber, colorName, hex}
  file: {
    name: String,
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'attachments.files' },
    previewUrl: String,
    totalPages: Number
  },
  uploadedAt: { type: Date, default: Date.now }
}, { collection: 'pantoneLibraries' });

const PantoneLibrary = mongoose.model('PantoneLibrary', PantoneLibrarySchema);

module.exports = {
  Techpack,
  AssortmentPlan,
  BrandManager,
  LineSheet,
  Pantone,
  PrintStrike,
  PreProduction,
  DevelopmentSample,
  PantoneLibrary,
};
