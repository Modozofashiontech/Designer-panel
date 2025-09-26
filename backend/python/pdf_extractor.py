# To run this application, you need to install the following dependencies:
# pip install fastapi[all] python-multipart uvicorn uvicorn[standard] PyMuPDF colorthief Pillow opencv-python-headless pytesseract

import os
import re
import uuid
import shutil
import tempfile
import base64
import cv2
import numpy as np
import uvicorn
from io import BytesIO
from typing import List, Tuple, Any, Dict

# FastAPI and dependencies
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import fitz  # PyMuPDF
from colorthief import ColorThief
from PIL import Image

# Check for pytesseract and handle its absence gracefully
TESSERACT_AVAILABLE = False
try:
    import pytesseract
    pytesseract.get_tesseract_version()
    TESSERACT_AVAILABLE = True
except (pytesseract.TesseractNotFoundError, EnvironmentError):
    print("[WARNING] Tesseract OCR is not installed or not in PATH. Text recognition from images will be disabled.")


# --- FastAPI Application Setup ---
app = FastAPI(
    title="PDF T-shirt and Asset Extractor",
    description="An API to extract t-shirt images, colors, and text from PDF files.",
    version="2.0.0"
)

# --- Configuration ---
# Directory to save extracted images
EXTRACTED_IMAGES_DIR = "extracted_images"
# Ensure the directory exists at the start of the application
os.makedirs(EXTRACTED_IMAGES_DIR, exist_ok=True)

# Extended list of known color names to be matched with OCR text
KNOWN_COLORS = [
    # Basic colors
    "Black", "White", "Red", "Blue", "Green", "Yellow", "Orange", "Purple", "Pink", "Brown", "Gray", "Grey",
    # Common colors
    "Beige", "Ivory", "Cream", "Gold", "Silver", "Bronze", "Copper", "Maroon", "Mustard", "Khaki", "Olive",
    "Tan", "Camel", "Burgundy", "Wine", "Magenta", "Lavender", "Lilac", "Mint", "Emerald", "Jade", "Navy",
    "Peach", "Sky", "Rust", "Cyan", "Teal", "Coral", "Charcoal", "Sand", "Mauve", "Turquoise", "Apricot",
    "Salmon", "Plum", "Ochre", "Denim", "Indigo", "Amber", "Lime", "Sapphire", "Pearl", "Slate", "Azure",
    "Rose", "Berry", "Blush", "Vanilla", "Chocolate", "Mocha", "Haute Red", "Mediterrania",
    # Additional common color names
    "Brick", "Crimson", "Fuchsia", "Lemon", "Lime", "Olive", "Peach", "Ruby", "Scarlet", "Tangerine",
    "Violet", "Amethyst", "Aqua", "Aquamarine", "Azure", "Beige", "Bisque", "Blue", "Brown", "Chartreuse",
    "Coral", "Crimson", "Cyan", "Gold", "Green", "Indigo", "Ivory", "Khaki", "Lavender", "Lime", "Magenta",
    "Maroon", "Navy", "Olive", "Orange", "Orchid", "Pink", "Purple", "Red", "Salmon", "Silver", "Tan", "Teal",
    "Tomato", "Turquoise", "Violet", "Wheat", "Yellow"
]
COLOR_REGEX = re.compile(r'\b(' + '|'.join(re.escape(c) for c in KNOWN_COLORS) + r')\b', re.IGNORECASE)

# Mount the directory to serve extracted images
app.mount("/extracted_images", StaticFiles(directory=EXTRACTED_IMAGES_DIR), name="extracted_images")

# --- Helper Functions ---

def render_page_as_image(page: fitz.Page, zoom: float = 3.0) -> Tuple[bytes, int, int]:
    """Render a PDF page as a high-resolution PNG image."""
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    return pix.tobytes("png"), pix.width, pix.height

def _detect_color_names(img_bytes: bytes) -> list[str]:
    """
    Detect color names using OCR on the provided image bytes.
    Returns a list of detected color names in title case.
    """
    # Try OCR if available
    if TESSERACT_AVAILABLE:
        try:
            pil = Image.open(BytesIO(img_bytes)).convert("RGB")
            # Increase contrast to improve OCR accuracy
            pil = pil.point(lambda p: p * 1.3)
            data = pytesseract.image_to_data(pil, output_type=pytesseract.Output.DICT)
            
            words = []
            for w, conf in zip(data.get("text", []), data.get("conf", [])):
                if not w or w.isspace():
                    continue
                try:
                    conf_val = float(conf)
                except ValueError:
                    conf_val = 0.0
                # Filter out words with low confidence
                if conf_val < 60:
                    continue
                w_clean = w.strip().upper()
                if len(w_clean) < 3:
                    continue
                words.append(w_clean)

            joined = " ".join(words)
            candidates = set()
            for c in COLOR_REGEX.findall(joined):
                candidates.add(c.title())
            
            if candidates:
                print(f"[DEBUG] Extracted color names via OCR: {candidates}")
                return list(candidates)
            print("[DEBUG] No colors found via OCR, falling back to dominant color detection")
                
        except Exception as e:
            print(f"[WARNING] OCR-based color detection failed: {e}")
    
    # Fallback: Extract dominant color and map to closest named color
    print("[DEBUG] Attempting dominant color detection...")
    try:
        from colorthief import ColorThief
        
        # Simple color name mapping (RGB values to color names)
        COLOR_MAP = {
            (0, 0, 0): 'Black',
            (255, 255, 255): 'White',
            (255, 0, 0): 'Red',
            (0, 0, 255): 'Blue',
            (0, 255, 0): 'Green',
            (255, 255, 0): 'Yellow',
            (255, 165, 0): 'Orange',
            (128, 0, 128): 'Purple',
            (255, 192, 203): 'Pink',
            (165, 42, 42): 'Brown',
            (128, 128, 128): 'Gray',
            (0, 128, 0): 'Dark Green',
            (0, 0, 128): 'Navy',
            (128, 0, 0): 'Maroon',
            (128, 128, 0): 'Olive'
        }
        print("[DEBUG] Using color map with", len(COLOR_MAP), "colors")
        
        # Get dominant color
        color_thief = ColorThief(BytesIO(img_bytes))
        dominant_rgb = color_thief.get_color(quality=3)
        
        # Find closest color from our map
        def color_distance(c1, c2):
            return sum((a - b) ** 2 for a, b in zip(c1, c2))
            
        closest_color = min(COLOR_MAP.items(), key=lambda x: color_distance(x[0], dominant_rgb))[1]
        print(f"[DEBUG] Extracted color via dominant color: {closest_color}")
        return [closest_color]
        
    except Exception as err:
        print(f"[WARNING] Color detection failed: {err}")
        return []

def is_tshirt_like_dimensions(width: int, height: int, min_size: int = 200) -> bool:
    """Heuristic to check if an image has t-shirt-like dimensions."""
    if height == 0:
        return False
    aspect_ratio = width / height
    # T-shirts usually have a width-to-height ratio between 0.5 and 2.0
    # and a minimum size to distinguish them from small icons or noise.
    return (0.5 <= aspect_ratio <= 2.0 and width >= min_size and height >= min_size)

def _create_tshirt_template():
    """Generates an idealized t-shirt contour for template matching."""
    # Create a simple t-shirt shape as a contour
    template_points = np.array([
        [100, 0], [150, 50], [250, 50], [300, 0],  # Neck and shoulders
        [350, 50], [350, 200], [250, 250], [150, 250],  # Sleeves and side
        [50, 200], [50, 50], [100, 50] # Other sleeve and side
    ], dtype=np.int32)
    
    # Reshape to a format that OpenCV understands for contours
    template_contour = np.array(template_points).reshape((-1, 1, 2))
    return template_contour

def _is_tshirt_like_shape_with_template(contour, template_contour, threshold=0.15):
    """
    Analyzes a contour using template matching to determine if its shape
    resembles the t-shirt template. A stricter threshold is now used.
    """
    if cv2.contourArea(contour) < 500:
        return False

    # Match shapes using a metric (e.g., Hu moments). Lower values mean a better match.
    match_value = cv2.matchShapes(template_contour, contour, cv2.CONTOURS_MATCH_I1, 0.0)
    print(f"Match value: {match_value}")
    
    return match_value < threshold

def _extract_from_pdf(pdf_bytes: bytes) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extracts images and text colors from a PDF. It first attempts to extract
    embedded images, then falls back to a robust rasterization and contour
    detection method to capture all other visual elements.
    
    Args:
        pdf_bytes: Binary content of the PDF file
        
    Returns:
        Tuple containing:
        - List of page data (text, colors, etc.)
        - List of processed rows with images and metadata
    """
    print(f"[DEBUG] Starting PDF extraction, PDF size: {len(pdf_bytes)} bytes")
    
    if not pdf_bytes or len(pdf_bytes) < 100:  # Minimum PDF header size
        print("[ERROR] Invalid or empty PDF content")
        return [], []
        
    processed_images = {}  # Use dict to deduplicate images
    tshirt_images = []
    other_images = []
    
    # Create the t-shirt template once
    tshirt_template = _create_tshirt_template()
    
    # Using a temporary file is more robust for libraries like PyMuPDF
    tmp_pdf_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_pdf:
            tmp_pdf.write(pdf_bytes)
            tmp_pdf_path = tmp_pdf.name
            print(f"[DEBUG] Saved PDF to temporary file: {tmp_pdf_path}")

        with fitz.open(tmp_pdf_path) as doc:
            if not doc.page_count:
                print("[WARNING] PDF has no pages")
                return [], []
                
            print(f"[DEBUG] Opened PDF with {doc.page_count} pages")
            page = doc[0]  # Process only first page for now
            
            # --- 1. Extract Colors from Text (OCR) ---
            print("\n[DEBUG] ====== TEXT EXTRACTION ======")
            print("[DEBUG] Extracting text from PDF...")
            try:
                full_text = page.get_text()
                print(f"[DEBUG] Extracted text (first 1000 chars):\n{full_text[:1000]}...")
                
                color_matches = COLOR_REGEX.findall(full_text)
                print(f"[DEBUG] Raw color matches: {color_matches}")
                
                unique_colors = list(dict.fromkeys([c.title() for c in color_matches if c.strip()]))
                
                page_data = {
                    "page": 1,
                    "text_colours": unique_colors,
                }
                print(f"[DEBUG] Extracted {len(unique_colors)} unique text colors: {unique_colors}")
                
            except Exception as e:
                print(f"[ERROR] Error extracting text colors: {str(e)}")
                import traceback
                traceback.print_exc()
                page_data = {
                    "page": 1,
                    "text_colours": [],
                    "error": f"Text extraction error: {str(e)}"
                }

            # --- 2. Extract only t-shirt images ---
            print("\n[DEBUG] ====== T-SHIRT IMAGE EXTRACTION ======")
            print(f"[INFO] Attempting to extract t-shirt images from page {page.number + 1}")
            
            # First, try to find t-shirt images in embedded images
            image_list = page.get_images(full=True)
            tshirt_found = False
            
            print(f"[DEBUG] Found {len(image_list)} embedded images in PDF")
            if image_list:
                print(f"[DEBUG] Scanning embedded images for t-shirt designs...")
            
            if image_list:
                for img_index, img in enumerate(image_list, 1):
                    try:
                        xref = img[0]
                        print(f"[DEBUG] Extracting image {img_index} with xref {xref}")
                        
                        base_image = doc.extract_image(xref)
                        if not base_image or "image" not in base_image:
                            print(f"[WARNING] Could not extract image data for xref {xref}")
                            continue
                            
                        image_bytes = base_image["image"]
                        if not image_bytes or len(image_bytes) < 10:  # Minimum size check
                            print(f"[WARNING] Empty or invalid image data for xref {xref}")
                            continue
                            
                        width = base_image.get("width", 0)
                        height = base_image.get("height", 0)
                        ext = base_image.get("ext", "png").lower()
                        
                        print(f"[DEBUG] Extracted image {img_index}: {width}x{height}px, format: {ext}, size: {len(image_bytes)} bytes")
                        
                        # Simple hash to deduplicate images
                        img_hash = uuid.uuid5(uuid.NAMESPACE_URL, str(image_bytes)).hex
                        if img_hash in processed_images:
                            print(f"[DEBUG] Skipping duplicate image with hash: {img_hash}")
                            continue
                            
                        is_tshirt = is_tshirt_like_dimensions(width, height, min_size=200)
                        
                    except Exception as e:
                        print(f"[ERROR] Error processing image {img_index}: {str(e)}")
                        continue
                    
                    filename = f"embedded_{img_index}_{uuid.uuid4().hex[:6]}.{ext}"
                    file_path = os.path.join(EXTRACTED_IMAGES_DIR, filename)
                    
                    try:
                        os.makedirs(os.path.dirname(file_path), exist_ok=True)
                        with open(file_path, "wb") as f:
                            f.write(image_bytes)
                    except IOError as e:
                        print(f"[ERROR] Failed to save embedded image {filename}: {e}")
                        continue  

                    dominant_rgb = ColorThief(BytesIO(image_bytes)).get_color(quality=3)
                    ocr_colours = _detect_color_names(image_bytes)
                    
                    image_data = {
                        "filename": filename,
                        "path": f"/extracted_images/{filename}",
                        "width": width,
                        "height": height,
                        "format": ext.upper(),
                        "size_kb": len(image_bytes) / 1024,
                        "is_tshirt": is_tshirt,
                        "aspect_ratio": round(width / height if height > 0 else 0, 2),
                        "dominant_rgb": dominant_rgb,
                        "ocr_colours": ocr_colours,
                        "source": "embedded",
                        "base64": f"data:image/png;base64,{base64.b64encode(image_bytes).decode('utf-8')}"
                    }
                    if is_tshirt:
                        tshirt_images.append(image_data)
                    else:
                        other_images.append(image_data)

                    processed_images[img_hash] = True
                print(f"[INFO] Successfully extracted {len(tshirt_images) + len(other_images)} embedded images.")

            # --- 3. Rasterize and find all contours to get all other visual elements ---
            print("[INFO] Rasterizing page and detecting contours for all visual elements.")
            
            try:
                raster_bytes, raster_width, raster_height = render_page_as_image(page, zoom=3.0)
                if not raster_bytes or len(raster_bytes) < 100:  # Minimum size check
                    print("[WARNING] Rasterization produced empty or invalid image")
                else:
                    print(f"[DEBUG] Rasterized page to {raster_width}x{raster_height} image, {len(raster_bytes)} bytes")
                
                pil_img = Image.open(BytesIO(raster_bytes)).convert("RGB")
                img_array = np.array(pil_img)
                
                # Use adaptive thresholding and find a hierarchical tree of contours
                print("[DEBUG] Detecting contours...")
                gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
                blurred = cv2.GaussianBlur(gray, (5, 5), 0)
                thresh = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 11, 2)
                
                contours, hierarchy = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
                print(f"[DEBUG] Found {len(contours)} contours in the image")
                
            except Exception as e:
                print(f"[ERROR] Error during page rasterization/contour detection: {str(e)}")
                contours = []
                hierarchy = None
            
            # Process contours to find t-shirt images
            for idx, contour in enumerate(contours, 1):
                x, y, w, h = cv2.boundingRect(contour)
                
                # Skip small or very large contours
                if w < 100 or h < 100 or w > raster_width * 0.9 or h > raster_height * 0.9:
                    continue
                
                # Skip if not t-shirt like dimensions
                if not is_tshirt_like_dimensions(w, h, min_size=100):
                    continue
                        
                # Use a stricter threshold for shape matching
                if not _is_tshirt_like_shape_with_template(contour, tshirt_template, threshold=0.15):
                    continue
                        
                print(f"[DEBUG] Found potential t-shirt at position ({x},{y}) with size {w}x{h}")
                tshirt_found = True
                
                # Crop the original rasterized image to the contour's bounding box
                cropped_img = pil_img.crop((x, y, x + w, y + h))
                cropped_bytes_io = BytesIO()
                cropped_img.save(cropped_bytes_io, format="PNG")
                cropped_bytes = cropped_bytes_io.getvalue()
                
                img_hash = uuid.uuid5(uuid.NAMESPACE_URL, str(cropped_bytes)).hex
                if img_hash in processed_images:
                    continue
                
                # Generate a unique filename and path for database requirements
                filename = f"raster_{idx}_{uuid.uuid4().hex[:6]}.png"
                file_path = f"/extracted_images/{filename}"
                
                # Convert image bytes to base64
                base64_image = base64.b64encode(cropped_bytes).decode('utf-8')
                
                dominant_rgb = ColorThief(BytesIO(cropped_bytes)).get_color(quality=3)
                ocr_colours = _detect_color_names(cropped_bytes)
                
                image_metadata = {
                    "id": f"img_{uuid.uuid4().hex[:8]}",
                    "filename": filename,
                    "path": file_path,
                    "width": w,
                    "height": h,
                    "format": "PNG",
                    "size_kb": len(cropped_bytes) / 1024,
                    "is_tshirt": is_tshirt,
                    "aspect_ratio": round(w / h, 2) if h > 0 else 0,
                    "dominant_rgb": dominant_rgb,
                    "ocr_colours": ocr_colours,
                    "source": "rasterized",
                    "base64": f"data:image/png;base64,{base64_image}"
                }
                if is_tshirt:
                    tshirt_images.append(image_metadata)
                else:
                    other_images.append(image_metadata)
                processed_images[img_hash] = True
            
            print(f"[INFO] Extracted {len(tshirt_images)} t-shirt images and {len(other_images)} other images.")


            # Extract colors only from t-shirt images
            all_colors = []
            
            # Only process colors if we found a t-shirt
            if tshirt_found and (tshirt_images or other_images):
                # Add colors from t-shirt images first
                for img in tshirt_images + other_images:
                    # Add dominant color
                    if 'dominant_rgb' in img and img['dominant_rgb']:
                        all_colors.append({
                            'name': img.get('dominant_color_name', 'Unknown'),
                            'source': 'image',
                            'confidence': 0.9
                        })
                    
                    # Add OCR colors
                    for color_name in img.get('ocr_colours', []):
                        all_colors.append({
                            'name': color_name,
                            'source': 'image_ocr',
                            'confidence': 0.7
                        })
            
            # Add colors from image extraction
            for img in tshirt_images + other_images:
                # Add dominant color
                if 'dominant_rgb' in img and img['dominant_rgb']:
                    all_colors.append({
                        'name': 'Dominant Color',
                        'rgb': {'r': img['dominant_rgb'][0], 'g': img['dominant_rgb'][1], 'b': img['dominant_rgb'][2]},
                        'source': 'image',
                        'confidence': 0.8
                    })
                
                # Add OCR-detected colors
                for color_name in img.get('ocr_colours', []):
                    all_colors.append({
                        'name': color_name,
                        'source': 'image_ocr',
                        'confidence': 0.7
                    })
            
            # Remove duplicates (same name and similar RGB if present)
            unique_colors = []
            seen = set()
            for color in all_colors:
                # Create a unique key for each color
                if 'rgb' in color:
                    key = f"{color['name'].lower()}_{color['rgb']['r']}_{color['rgb']['g']}_{color['rgb']['b']}"
                else:
                    key = color['name'].lower()
                
                if key not in seen:
                    seen.add(key)
                    unique_colors.append(color)
            
            # Update page data with colors
            page_data['colors'] = unique_colors
            
            # Prepare the final output
            processed_rows = [{
                "row_index": 0,
                "tshirt_images": tshirt_images,
                "other_images": other_images,
                "image_count": len(tshirt_images) + len(other_images)
            }]

            return [page_data], processed_rows

    except Exception as e:
        print(f"[ERROR] Error in _extract_from_pdf: {str(e)}")
        import traceback
        traceback.print_exc()
        return [], []
        
    finally:
        # Clean up temporary file if it exists
        if tmp_pdf_path:
            try:
                if os.path.exists(tmp_pdf_path):
                    os.unlink(tmp_pdf_path)
                    print(f"[DEBUG] Removed temporary file: {tmp_pdf_path}")
            except Exception as e:
                print(f"[WARNING] Could not remove temporary file {tmp_pdf_path}: {e}")

# ----------------------- API Endpoints -------------------------

@app.get("/")
async def root():
    return {"message": "PDF Extractor API is running", "status": "ok"}

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"\n[REQUEST] {request.method} {request.url}")
    print(f"[HEADERS] {dict(request.headers)}")
    
    try:
        response = await call_next(request)
        print(f"[RESPONSE] Status: {response.status_code}")
        return response
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        raise

@app.post("/api/extract-pdf")
async def extract_pdf(pdf: UploadFile = File(...)):
    """
    Compatible endpoint for LineSheets integration.
    Extracts images and returns them in the expected format.
    """
    try:
        if pdf.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="File must be a PDF")

        print(f"[INFO] Processing PDF via /api/extract-pdf: {pdf.filename}")
        pdf_bytes = await pdf.read()
        pages, processed_rows = _extract_from_pdf(pdf_bytes)
        
        # Extract images in the format expected by LineSheets
        all_images = []
        image_groups = [[], []]  # [products, swatches]
        
        for row in processed_rows:
            # Add t-shirt images to products group
            for img in row.get('tshirt_images', []):
                image_path = img.get('path', '')
                if image_path:
                    all_images.append(image_path)
                    image_groups[0].append(image_path)
            
            # Add other images to swatches group
            for img in row.get('other_images', []):
                image_path = img.get('path', '')
                if image_path:
                    all_images.append(image_path)
                    image_groups[1].append(image_path)
        
        response_data = {
            "success": True,
            "images": all_images,
            "image_groups": image_groups,
            "metadata": {
                "filename": pdf.filename,
                "total_images": len(all_images),
                "products": len(image_groups[0]),
                "swatches": len(image_groups[1])
            }
        }
        
        return JSONResponse(content=response_data)
        
    except Exception as e:
        print(f"[ERROR] /api/extract-pdf failed: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": "Failed to process PDF", "details": str(e)}
        )

@app.post("/extract-assets")
async def extract_assets(pdf: UploadFile = File(...)):
    """
    Analyzes an uploaded PDF, extracts potential t-shirt images and color information.
    
    Returns:
        JSONResponse: A JSON object containing metadata, extracted pages, and images.
    """
    print("\n" + "="*80)
    print("[DEBUG] ====== NEW PDF UPLOAD ======")
    print(f"[DEBUG] File: {pdf.filename}")
    print(f"[DEBUG] Content-Type: {pdf.content_type}")
    print(f"[DEBUG] Current working directory: {os.getcwd()}")
    print(f"[DEBUG] Extracted images directory: {os.path.abspath(EXTRACTED_IMAGES_DIR)}")
    print("="*80 + "\n")
    
    # Ensure the output directory exists
    os.makedirs(EXTRACTED_IMAGES_DIR, exist_ok=True)
    print(f"[DEBUG] Output directory exists: {os.path.isdir(EXTRACTED_IMAGES_DIR)}")
    print(f"[DEBUG] Output directory writable: {os.access(EXTRACTED_IMAGES_DIR, os.W_OK)}")
    try:
        if pdf.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="File must be a PDF")

        print(f"[INFO] Processing PDF: {pdf.filename}")
        pdf_bytes = await pdf.read()
        pages, processed_rows = _extract_from_pdf(pdf_bytes)
        
        # Log summary for debugging and monitoring
        print("\n[EXTRACTION SUMMARY]")
        print("=" * 70)
        total_colors = sum(len(page.get('text_colours', [])) for page in pages)
        total_images = sum(len(row.get('tshirt_images', [])) + len(row.get('other_images', [])) for row in processed_rows)
        print(f"Total pages processed: {len(pages)}")
        print(f"Total colors extracted: {total_colors}")
        print(f"Total images extracted: {total_images}")
        print("-" * 70)
        
        # Extract all colors from pages and processed rows
        colors = []
        text_colors = []
        images = []
        
        # Get colors from pages (text colors)
        for page in pages:
            for color in page.get('text_colours', []):
                if color and color not in text_colors:
                    text_colors.append(color)
                    
        # Get colors and images from processed rows
        for row in processed_rows:
            # Add t-shirt images
            for img in row.get('tshirt_images', []):
                if img not in images:
                    images.append(img)
                    # Add dominant color from t-shirt images
                    if 'dominant_rgb' in img and img['dominant_rgb']:
                        rgb = img['dominant_rgb']
                        # Only store the color name
                        color_name = img.get('dominant_color_name', 'Unknown')
                        colors.append({
                            'name': color_name,
                            'source': 'image',
                            'confidence': 0.9
                        })
            
            # Add other images
            for img in row.get('other_images', []):
                if img not in images:
                    images.append(img)
                    # Add dominant color from other images
                    if 'dominant_rgb' in img and img['dominant_rgb']:
                        rgb = img['dominant_rgb']
                        # Only store the color name
                        color_name = img.get('dominant_color_name', 'Unknown')
                        colors.append({
                            'name': color_name,
                            'source': 'image',
                            'confidence': 0.8
                        })
        
        # Add text colors to the colors list
        for color_name in text_colors:
            colors.append({
                'name': color_name,
                'source': 'text',  # This is a valid enum value
                'confidence': 0.9
            })
            
        # Add OCR colors from images with 'image' source (not 'image_ocr')
        for img in images:
            for ocr_color in img.get('ocr_colours', []):
                colors.append({
                    'name': ocr_color,
                    'source': 'image',  # Use 'image' instead of 'image_ocr' to match schema
                    'confidence': 0.7
                })
        
        # Prepare the response data
        response_data = {
            "success": True,
            "metadata": {
                "filename": pdf.filename,
                "file_size_kb": len(pdf_bytes) / 1024,
            },
            "colors": colors,
            "text_colors": text_colors,
            "images": [
                {**img, "base64": img.get("base64", "")} 
                for img in images
            ],
            "pages": pages,  # Keep original data for debugging
            "processed_rows": processed_rows  # Keep original data for debugging
        }
        
        return JSONResponse(content=response_data)
        
    except Exception as e:
        print(f"\n=== ERROR in /extract-assets ===")
        import traceback
        error_trace = traceback.format_exc()
        print(error_trace)
        print("=" * 70)
        
        # Return error details in the response for debugging
        error_response = {
            "error": "Failed to process PDF",
            "details": str(e),
            "traceback": error_trace.split('\n')
        }
        return JSONResponse(
            status_code=500,
            content=error_response
        )
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/extracted_images/{filename}")
async def get_image(filename: str):
    """Serves an extracted image file by its filename."""
    image_path = os.path.join(EXTRACTED_IMAGES_DIR, filename)
    
    # Security check: Prevent directory traversal attacks
    if not os.path.normpath(image_path).startswith(os.path.normpath(EXTRACTED_IMAGES_DIR)):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")
        
    return FileResponse(image_path, media_type="image/png")

# --- Example Image Extraction Endpoint (for testing a single image) ---
def _extract_from_image(img_bytes: bytes) -> dict[str, Any]:
    """Extract dominant colour and optional OCR colour names from a single image."""
    dominant_rgb = ColorThief(BytesIO(img_bytes)).get_color(quality=3)
    ocr_names = _detect_color_names(img_bytes)

    return {
        "dominant_rgb": dominant_rgb,
        "ocr_colours": ocr_names,
    }

@app.post("/extract-image")
async def extract_image(image: UploadFile = File(...)):
    """Accept a single image file and return its dominant colour (and OCR colour names if available)."""
    if image.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
        raise HTTPException(status_code=400, detail="Uploaded file must be a PNG or JPEG image")

    try:
        img_bytes = await image.read()
        result = _extract_from_image(img_bytes)
        return JSONResponse(content=result)
    except Exception as err:
        import traceback
        print("=== ERROR in /extract-image ===")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal error: {str(err)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)