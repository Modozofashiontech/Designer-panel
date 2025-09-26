#!/bin/bash

echo "========================================"
echo "Starting Designer Panel Services"
echo "========================================"
echo

echo "Starting Python Image Extraction Service..."
cd backend/python
python image_extraction.py &
PYTHON_PID=$!

echo "Waiting 3 seconds for Python service to start..."
sleep 3

echo "Starting Node.js Server..."
cd ../..
cd backend
npm start &
NODE_PID=$!

echo
echo "========================================"
echo "Services are starting..."
echo "========================================"
echo "Python Service: http://localhost:5001"
echo "Node.js Server: http://localhost:5000"
echo "React App: http://localhost:3000"
echo
echo "Press Ctrl+C to stop all services..."

# Function to cleanup on exit
cleanup() {
    echo
    echo "Stopping services..."
    kill $PYTHON_PID 2>/dev/null
    kill $NODE_PID 2>/dev/null
    echo "Services stopped."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait
