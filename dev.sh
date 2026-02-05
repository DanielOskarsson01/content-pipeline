#!/bin/bash
# dev.sh - Clean start for content-pipeline development
# Kills zombie processes and starts fresh

echo "Killing processes on ports 3000 and 5173..."

# Kill processes on port 3000 (API)
lsof -ti :3000 | xargs kill -9 2>/dev/null

# Kill processes on port 5173 (Vite)
lsof -ti :5173 | xargs kill -9 2>/dev/null

# Also kill any lingering node/vite processes related to this project
pkill -f "content-pipeline" 2>/dev/null
pkill -f "vite.*content-pipeline" 2>/dev/null

echo "Waiting 1 second..."
sleep 1

# Verify ports are free
if lsof -i :3000 -i :5173 2>/dev/null | grep -q LISTEN; then
    echo "WARNING: Ports still in use:"
    lsof -i :3000 -i :5173 2>/dev/null | grep LISTEN
    echo "Try running: sudo lsof -ti :3000 :5173 | xargs kill -9"
    exit 1
fi

echo "Ports clear. Starting development servers..."
echo ""
echo "  API:   http://localhost:3000"
echo "  UI:    http://localhost:5173  <-- USE THIS"
echo ""

npm run dev
