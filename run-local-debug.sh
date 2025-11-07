#!/bin/bash

# Local development script with debug mode enabled
# This will show the browser window so you can see what Puppeteer is rendering

echo "Setting up local development environment..."

# Create output directory
mkdir -p output

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo "Loading environment variables from .env file..."
    set -a  # automatically export variables
    source .env
    set +a  # stop automatically exporting
else
    echo "No .env file found, using defaults..."
fi

# Ensure debug mode is enabled
export DEBUG=true

echo "Configuration:"
echo "  Home Assistant URL: $HA_BASE_URL"
echo "  Screenshot URL: $HA_SCREENSHOT_URL"
echo "  Output: $OUTPUT_PATH.$IMAGE_FORMAT"
echo "  Language: $LANGUAGE"
echo "  Timezone: $TZ"
echo "  Rendering Delay: ${RENDERING_DELAY}ms"
echo "  Screen Size: ${RENDERING_SCREEN_WIDTH}x${RENDERING_SCREEN_HEIGHT}"
echo "  Scaling: $SCALING"
echo "  Debug Mode: $DEBUG (browser will stay open)"
echo ""

# Check if HA_ACCESS_TOKEN is set
if [ -z "$HA_ACCESS_TOKEN" ] || [ "$HA_ACCESS_TOKEN" = "your-token-here" ]; then
    echo "⚠️  WARNING: Please set your HA_ACCESS_TOKEN in the .env file"
    echo "   Edit the .env file and update the HA_ACCESS_TOKEN value"
    echo ""
fi

echo "Starting application in debug mode..."
echo "The browser window will stay open so you can see what Puppeteer renders"
echo "Press Ctrl+C to stop"
echo ""

node index.js