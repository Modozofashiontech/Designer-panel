require('dotenv').config();
const { S3Client, PutBucketPolicyCommand, PutBucketCorsCommand, GetBucketPolicyCommand, PutPublicAccessBlockCommand } = require('@aws-sdk/client-s3');

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const bucketName = process.env.S3_BUCKET_NAME;

// Bucket policy to allow public read access
const bucketPolicy = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": `arn:aws:s3:::${bucketName}/*`
    }
  ]
};

// CORS configuration
const corsConfiguration = {
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "HEAD", "PUT", "POST"],
      "AllowedOrigins": [
        "http://localhost:3000",
        "http://localhost:5000",
        "https://your-production-domain.com",
        "*"
      ],
      "ExposeHeaders": [
        "x-amz-server-side-encryption",
        "x-amz-request-id",
        "x-amz-id-2",
        "ETag",
        "Content-Type",
        "Content-Length"
      ],
      "MaxAgeSeconds": 86400
    }
  ]
};

async function configureS3Bucket() {
  console.log(`🔧 Configuring S3 bucket: ${bucketName}`);
  
  try {
    // Step 1: Disable public access block (required for public bucket policy)
    console.log('📝 Step 1: Disabling public access block...');
    const publicAccessBlockCommand = new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false
      }
    });
    
    await s3Client.send(publicAccessBlockCommand);
    console.log('✅ Public access block disabled');

    // Step 2: Apply bucket policy
    console.log('📝 Step 2: Applying bucket policy...');
    const policyCommand = new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy, null, 2)
    });
    
    await s3Client.send(policyCommand);
    console.log('✅ Bucket policy applied');

    // Step 3: Apply CORS configuration
    console.log('📝 Step 3: Applying CORS configuration...');
    const corsCommand = new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: corsConfiguration
    });
    
    await s3Client.send(corsCommand);
    console.log('✅ CORS configuration applied');

    // Step 4: Verify bucket policy
    console.log('📝 Step 4: Verifying bucket policy...');
    const getPolicyCommand = new GetBucketPolicyCommand({
      Bucket: bucketName
    });
    
    const policyResult = await s3Client.send(getPolicyCommand);
    console.log('✅ Bucket policy verified:', JSON.parse(policyResult.Policy));

    console.log('\n🎉 S3 bucket configuration completed successfully!');
    console.log(`📁 Bucket: ${bucketName}`);
    console.log('🌐 Public access: Enabled');
    console.log('🔒 CORS: Configured');
    
  } catch (error) {
    console.error('❌ Error configuring S3 bucket:', {
      message: error.message,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode
    });
    
    if (error.code === 'AccessDenied') {
      console.log('\n💡 Possible solutions:');
      console.log('1. Ensure your AWS credentials have S3 admin permissions');
      console.log('2. Check if bucket exists and you have access to it');
      console.log('3. Verify the bucket name is correct in your .env file');
    }
  }
}

configureS3Bucket();
