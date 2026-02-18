#!/bin/bash

# AI Calling System - Production Start Script
# Usage: ./start.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  AI Calling System - Production Start  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js v18 or higher"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Error: Node.js version $NODE_VERSION is not supported${NC}"
    echo "Please upgrade to Node.js v18 or higher"
    exit 1
fi

echo -e "${GREEN}✓ Node.js version: $(node --version)${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit .env with your configuration before running again${NC}"
        exit 1
    else
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Environment file found${NC}"

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install --production
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if port is already in use
PORT=$(grep -E '^PORT=' .env | cut -d'=' -f2 || echo "3000")
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Port $PORT is already in use${NC}"
    echo "Attempting to stop existing process..."
    # Try to find and kill the process
    PID=$(lsof -Pi :$PORT -sTCP:LISTEN -t)
    if [ -n "$PID" ]; then
        kill $PID 2>/dev/null || true
        sleep 2
    fi
fi

echo ""
echo -e "${GREEN}Starting AI Calling System...${NC}"
echo -e "${GREEN}Environment: production${NC}"
echo -e "${GREEN}Port: $PORT${NC}"
echo ""

# Start the server
NODE_ENV=production exec node src/server.js
