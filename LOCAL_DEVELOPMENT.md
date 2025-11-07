# Local Development Setup

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set your Home Assistant credentials:**
   ```bash
   export HA_BASE_URL=http://your-homeassistant:8123
   export HA_ACCESS_TOKEN=your-long-lived-access-token
   ```

3. **Run in debug mode:**
   ```bash
   ./run-local-debug.sh
   ```

## What Debug Mode Does

When `DEBUG=true` is set:
- **Browser stays open**: You can see exactly what Puppeteer is rendering
- **Only renders once**: No cron job, just a single render for testing
- **Visible browser window**: The Chromium browser will open and stay open
- **Detailed logging**: More verbose output to help debug issues

## Environment Variables

Copy `.env.example` to `.env` and customize:

### Required
- `HA_BASE_URL`: Your Home Assistant URL
- `HA_ACCESS_TOKEN`: Long-lived access token from HA

### Optional
- `HA_SCREENSHOT_URL`: Lovelace path (default: `/lovelace/default`)
- `RENDERING_DELAY`: Wait time before screenshot (default: 0ms, try 2000ms if elements are missing)
- `RENDERING_SCREEN_WIDTH`: Browser width (default: 600px)
- `RENDERING_SCREEN_HEIGHT`: Browser height (default: 800px)
- `TZ`: Timezone (default: `Europe/Berlin`)
- `LANGUAGE`: Language code (default: `en`)

## Debugging Rendering Issues

If the output looks different from your browser:

1. **Check the browser window**: In debug mode, you can see exactly what Puppeteer sees
2. **Increase rendering delay**: Some components need time to load
   ```bash
   export RENDERING_DELAY=3000
   ```
3. **Check console output**: Look for JavaScript errors or failed requests
4. **Verify authentication**: Make sure your access token is valid
5. **Check theme**: Ensure the theme exists in your HA instance

## Common Issues

- **White/blank output**: Usually authentication or URL issues
- **Missing elements**: Try increasing `RENDERING_DELAY`
- **Different colors**: Check if `PREFERS_COLOR_SCHEME` matches your HA theme
- **Wrong timezone**: Set `TZ` environment variable

## Output

Generated images are saved to `output/cover.png` by default.