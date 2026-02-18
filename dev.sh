#!/bin/bash

# AI Calling System - Development Start Script
# Usage: ./dev.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI Calling System - Development Mode  ${NC}"
echo -e "${BLUE}========================================${NC}"
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

# Check if nodemon is installed globally or locally
if ! command -v nodemon &> /dev/null && [ ! -f node_modules/.bin/nodemon ]; then
    echo -e "${YELLOW}Installing nodemon...${NC}"
    npm install --save-dev nodemon
fi

echo -e "${GREEN}✓ Nodemon available${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating from .env.example..."
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit .env with your configuration${NC}"
    else
        echo -e "${RED}Error: .env.example not found${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Environment file found${NC}"

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

echo -e "${GREEN}✓ Dependencies installed${NC}"

# Create logs directory if it doesn't exist
mkdir -p logs

# Get port from .env or use default
PORT=$(grep -E '^PORT=' .env | cut -d'=' -f2 || echo "3000")

echo ""
echo -e "${BLUE}Starting AI Calling System in development mode...${NC}"
echo -e "${BLUE}Environment: development${NC}"
echo -e "${BLUE}Port: $PORT${NC}"
echo -e "${BLUE}Features: Hot reload enabled${NC}"
echo ""

# Determine nodemon command
if [ -f node_modules/.bin/nodemon ]; then
    NODEMON_CMD="./node_modules/.bin/nodemon"
else
    NODEMON_CMD="nodemon"
fi

# Run nodemon with development settings
echo -e "${GREEN}Server will restart automatically on file changes${NC}"
echo -e "${GREEN}Press Ctrl+C to stop${NC}"
echo ""

exec $NODEMON_CMD \
  --watch src \
  --ext js,json \
  --ignore logs/ \
  --delay 1 \
  src/server.js
