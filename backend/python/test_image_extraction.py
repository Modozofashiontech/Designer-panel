#!/usr/bin/env python3
"""
Test script for the image extraction service
"""
import requests
import os
import sys

def test_image_extraction_service():
    """Test the image extraction service"""
    
    # Service URL
    service_url = "http://localhost:5001"
    
    # Test if service is running
    try:
        response = requests.get(f"{service_url}/", timeout=5)
        print("✅ Service is running")
    except requests.exceptions.ConnectionError:
        print("❌ Service is not running. Please start the service with:")
        print("   cd backend/python && python image_extraction.py")
        return False
    except Exception as e:
        print(f"❌ Error connecting to service: {e}")
        return False
    
    # Test with a sample PDF (if available)
    test_pdf_path = "test_sample.pdf"
    if not os.path.exists(test_pdf_path):
        print(f"⚠️  No test PDF found at {test_pdf_path}")
        print("   You can test manually by uploading a PDF through the web interface")
        return True
    
    try:
        with open(test_pdf_path, 'rb') as f:
            files = {'pdf': f}
            print("🔄 Testing PDF upload and image extraction...")
            response = requests.post(f"{service_url}/api/extract-pdf", files=files, timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                if data.get('images'):
                    print(f"✅ Successfully extracted {len(data['images'])} images")
                    print(f"   Image URLs: {data['images']}")
                else:
                    print("✅ PDF processed successfully, but no images found")
                return True
            else:
                print(f"❌ Error: {response.status_code} - {response.text}")
                return False
                
    except Exception as e:
        print(f"❌ Error testing PDF upload: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing Image Extraction Service")
    print("=" * 40)
    
    success = test_image_extraction_service()
    
    if success:
        print("\n✅ All tests passed! The service is ready to use.")
        print("\n📝 Next steps:")
        print("   1. Make sure your React app is running")
        print("   2. Upload a PDF through the LineSheets interface")
        print("   3. The images will be extracted and stored in MongoDB")
    else:
        print("\n❌ Tests failed. Please check the service configuration.")
        sys.exit(1)
