#!/bin/bash
#
# Cron Setup Script
# Sets up scheduled jobs for the AI Calling System
#

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}AI Calling System - Cron Setup${NC}"
echo ""

# Check if running from correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the ai-calling-system directory${NC}"
    exit 1
fi

# Get the absolute path
INSTALL_DIR=$(pwd)
NODE_PATH=$(which node)

echo "Installation directory: $INSTALL_DIR"
echo "Node path: $NODE_PATH"
echo ""

# Create cron entries
echo -e "${YELLOW}Setting up cron jobs...${NC}"

# Remove existing entries if they exist
(crontab -l 2>/dev/null | grep -v "ai-calling-system") | crontab -

# Add new entries
(
crontab -l 2>/dev/null
echo "# AI Calling System - Run every hour during business hours"
echo "0 9-17 * * 1-5 cd $INSTALL_DIR && $NODE_PATH $INSTALL_DIR/scripts/call-trigger.js >> $INSTALL_DIR/logs/cron.log 2>&1"
echo ""
echo "# AI Calling System - Daily summary at 6 PM"
echo "0 18 * * * cd $INSTALL_DIR && $NODE_PATH $INSTALL_DIR/scripts/daily-summary.js >> $INSTALL_DIR/logs/cron.log 2>&1"
) | crontab -

echo -e "${GREEN}Cron jobs installed successfully!${NC}"
echo ""
echo "Scheduled jobs:"
echo "  • Call trigger: Every hour, 9 AM - 5 PM, Monday-Friday"
echo "  • Daily summary: Every day at 6 PM"
echo ""
echo "To view your crontab:"
echo "  crontab -l"
echo ""
echo "To remove these jobs:"
echo "  crontab -l | grep -v ai-calling-system | crontab -"
echo ""

# Verify installation
echo -e "${YELLOW}Verifying installation...${NC}"
if crontab -l | grep -q "ai-calling-system"; then
    echo -e "${GREEN}✓ Cron jobs installed${NC}"
else
    echo -e "${RED}✗ Cron jobs not found${NC}"
    exit 1
fi