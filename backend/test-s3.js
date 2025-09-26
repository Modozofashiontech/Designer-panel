require('dotenv').config();
const { S3Client, ListBucketsCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

async function testS3Connection() {
  console.log('🔧 Testing S3 Configuration:');
  console.log('- Region:', process.env.AWS_REGION);
  console.log('- Bucket:', process.env.S3_BUCKET_NAME);
  console.log('- Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 8) + '...' : 'MISSING');
  console.log('- Secret Key:', process.env.AWS_SECRET_ACCESS_KEY ? 'Present' : 'MISSING');
  console.log();

  try {
    // Test 1: List buckets
    console.log('📋 Test 1: Listing S3 buckets...');
    const listCommand = new ListBucketsCommand({});
    const listResult = await s3Client.send(listCommand);
    
    console.log('✅ Successfully connected to S3');
    console.log('- Found buckets:', listResult.Buckets?.length || 0);
    
    const targetBucket = process.env.S3_BUCKET_NAME;
    const bucketExists = listResult.Buckets?.some(bucket => bucket.Name === targetBucket);
    console.log(`- Target bucket "${targetBucket}" exists:`, bucketExists);
    
    if (!bucketExists) {
      console.log('❌ Target bucket not found in your account');
      return;
    }

    // Test 2: Upload a test file
    console.log('\n📤 Test 2: Uploading test file...');
    const testKey = `test-uploads/test-${Date.now()}.txt`;
    const testContent = 'This is a test file to verify S3 upload functionality';
    
    const uploadCommand = new PutObjectCommand({
      Bucket: targetBucket,
      Key: testKey,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain'
    });
    
    const uploadResult = await s3Client.send(uploadCommand);
    console.log('✅ Test file uploaded successfully');
    console.log('- ETag:', uploadResult.ETag);
    console.log('- Key:', testKey);
    console.log('- URL:', `https://${targetBucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${testKey}`);
    
  } catch (error) {
    console.error('❌ S3 Test Failed:', {
      message: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId
    });
  }
}

testS3Connection();
