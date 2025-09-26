import os
from flask import Flask, request, jsonify, send_file, redirect
from flask_cors import CORS
import fitz  # PyMuPDF
from werkzeug.utils import secure_filename
import boto3
from botocore.exceptions import ClientError
from io import BytesIO
from dotenv import load_dotenv
import uuid

ALLOWED_EXTENSIONS = {'pdf'}

# For debugging: Print current working directory and list files
print(f"[DEBUG] Current working directory: {os.getcwd()}")
print("[DEBUG] Directory contents:", os.listdir('..'))

# Try to load .env from parent directory
env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '.env'))
print(f"[DEBUG] Trying to load .env from: {env_path}")

# Check if file exists
if os.path.exists(env_path):
    print("[DEBUG] .env file exists, loading...")
    load_dotenv(dotenv_path=env_path, override=True)
    print("[DEBUG] Environment variables loaded")
else:
    print("[WARNING] .env file not found at:", env_path)

# Debug: Print all environment variables for AWS
print("\n[DEBUG] AWS Environment Variables:")
for key, value in os.environ.items():
    if 'AWS_' in key or 'S3_' in key:
        print(f"{key}: {'*' * 8 if 'SECRET' in key or 'KEY' in key else value}")

# Directly set credentials (for testing only - remove in production)
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_REGION', 'ap-south-1')
S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME')
S3_BASE_URL = f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com"

# Verify credentials are set
if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET_NAME]):
    print("\n[ERROR] Missing required AWS credentials. Please check your .env file.")
    print(f"S3_BUCKET_NAME: {S3_BUCKET_NAME or 'Not set'}")

app = Flask(__name__)
CORS(app)
# Limit uploads to avoid memory exhaustion (16MB default)
app.config['MAX_CONTENT_LENGTH'] = int(os.environ.get('MAX_CONTENT_LENGTH', 16 * 1024 * 1024))

# Initialize S3 client
try:
    s3_client = boto3.client(
        's3',
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )
    # Test S3 connection by making a simple request that requires minimal permissions
    s3_client.head_bucket(Bucket=S3_BUCKET_NAME)
    print("[DEBUG] Successfully connected to AWS S3 and verified bucket access")
    s3_connected = True
except ClientError as err:
    error_code = err.response.get('Error', {}).get('Code')
    if error_code == '404':
        print(f"[ERROR] Bucket '{S3_BUCKET_NAME}' not found. Please create the bucket first.")
    elif error_code == '403':
        print(f"[ERROR] Access denied to bucket '{S3_BUCKET_NAME}'. Please check permissions.")
    else:
        print(f"[ERROR] Could not connect to AWS S3: {err}")
    print("[NOTE] The application will still start, but S3 operations will fail.")
    s3_connected = False

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok' if s3_connected else 'degraded',
        's3_connected': s3_connected,
        'bucket': S3_BUCKET_NAME if s3_connected else None
    }), 200 if s3_connected else 503

@app.route('/api/extract-pdf', methods=['POST'])
def extract_pdf():
    if not s3_connected:
        return jsonify({'error': 'S3 connection failed'}), 500
    if 'pdf' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['pdf']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if not file or not allowed_file(file.filename):
        return jsonify({'error': 'Invalid file type'}), 400
    
    try:
        filename = secure_filename(file.filename)
        pdf_bytes = file.read()
        base_filename = os.path.splitext(filename)[0]
        doc = None
        
        try:
            # Open the PDF
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            extracted_images = []
            
            # Extract images from each page
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                image_list = page.get_images(full=True)
                
                for img_index, img in enumerate(image_list):
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image['ext']
                    
                    # Generate unique S3 key
                    image_key = f"extracted_images/{base_filename}/page{page_num+1}_img{img_index+1}_{uuid.uuid4().hex}.{image_ext}"
                    
                    # Upload to S3
                    try:
                        s3_client.put_object(
                            Bucket=S3_BUCKET_NAME,
                            Key=image_key,
                            Body=image_bytes,
                            ContentType=f"image/{image_ext}",
                            CacheControl='public, max-age=31536000'  # 1 year cache
                        )
                        
                        # Extract folder name from the key (first part before the first '/')
                        folder = image_key.split('/')[0]
                        file_name = os.path.basename(image_key)
                        extracted_images.append({
                            'name': file_name,
                            'key': image_key,
                            'folder': folder,  
                            'bucket': S3_BUCKET_NAME,
                            'type': f"image/{image_ext}",
                            'format': image_ext,
                            'page': page_num + 1,
                            'index': img_index + 1
                        })
                        
                    except ClientError as e:
                        print(f"[ERROR] Failed to upload image to S3: {e}")
                        continue
            
            return jsonify({
                'status': 'success',
                'filename': filename,
                'page_count': len(doc),
                'images': extracted_images
            })
            
        except Exception as e:
            return jsonify({'error': f'Error processing PDF: {str(e)}'}), 500
            
        finally:
            if doc is not None:
                doc.close()
                
    except Exception as e:
        return jsonify({'error': f'Error processing request: {str(e)}'}), 500

@app.route('/api/image/<path:image_key>', methods=['GET'])
def get_image(image_key):
    """
    Generate a presigned URL for the requested S3 object.
    
    Query Parameters:
    - expires_in: Optional. Time in seconds until the URL expires (default: 1 hour, max: 1 week)
    - content_type: Optional. Override the Content-Type header for the response
    """
    if not s3_connected:
        return jsonify({'error': 'S3 connection failed'}), 500
        
    try:
        expires_in = min(int(request.args.get('expires_in', 3600)), 604800)  # Max 1 week
        content_type = request.args.get('content_type')
        
        params = {
            'Bucket': S3_BUCKET_NAME,
            'Key': image_key
        }
        
        if content_type:
            params['ResponseContentType'] = content_type
            
        # Generate a pre-signed URL for the image
        url = s3_client.generate_presigned_url(
            'get_object',
            Params=params,
            ExpiresIn=expires_in
        )
        
        # Redirect to the presigned URL
        return redirect(url)
        
    except ValueError:
        return jsonify({'error': 'Invalid expires_in parameter'}), 400
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchKey':
            return jsonify({'error': 'Image not found'}), 404
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(port=5001, debug=True)
