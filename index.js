const config = require("./config");
const path = require("path");
const http = require("http");
const https = require("https");
const { promises: fs } = require("fs");
const fsExtra = require("fs-extra");
const puppeteer = require("puppeteer");
const { CronJob } = require("cron");
const sharp = require("sharp");

// keep state of current battery level and whether the device is charging
const batteryStore = {};

(async () => {
  if (config.pages.length === 0) {
    return console.error("Please check your configuration");
  }
  for (const i in config.pages) {
    const pageConfig = config.pages[i];
    if (pageConfig.rotation % 90 > 0) {
      return console.error(
        `Invalid rotation value for entry ${i + 1}: ${pageConfig.rotation}`
      );
    }
  }

  console.log("Starting browser...");
  let browser = await puppeteer.launch({
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      `--lang=${config.language}`,
      config.ignoreCertificateErrors && "--ignore-certificate-errors"
    ].filter((x) => x),
    defaultViewport: null,
    timeout: config.browserLaunchTimeout,
    headless: config.debug !== true
  });

  console.log(`Visiting '${config.baseUrl}' to login...`);
  let page = await browser.newPage();
  await page.goto(config.baseUrl, {
    timeout: config.renderingTimeout
  });

  const hassTokens = {
    hassUrl: config.baseUrl,
    access_token: config.accessToken,
    token_type: "Bearer"
  };

  console.log("Adding authentication entry to browser's local storage...");

  await page.evaluate(
    (hassTokens, selectedLanguage, selectedTheme) => {
      localStorage.setItem("hassTokens", hassTokens);
      localStorage.setItem("selectedLanguage", selectedLanguage);
      localStorage.setItem("selectedTheme", selectedTheme);
    },
    JSON.stringify(hassTokens),
    JSON.stringify(config.language),
    JSON.stringify(config.theme)
  );

  page.close();

  if (config.debug) {
    console.log(
      "Debug mode active, will only render once in non-headless model and keep page open"
    );
    renderAndConvertAsync(browser);
  } else {
    console.log("Starting first render...");
    await renderAndConvertAsync(browser);
    console.log("Starting rendering cronjob...");
    new CronJob(
      String(config.cronJob),
      () => renderAndConvertAsync(browser),
      null,
      true
    );
  }

  const httpServer = http.createServer(async (request, response) => {
    // Parse the request
    const url = new URL(request.url, `http://${request.headers.host}`);
    // Check the page number
    const pageNumberStr = url.pathname;
    // and get the battery level, if any
    // (see https://github.com/sibbl/hass-lovelace-kindle-screensaver/README.md for patch to generate it on Kindle)
    const batteryLevel = parseInt(url.searchParams.get("batteryLevel"));
    const isCharging = url.searchParams.get("isCharging");
    const pageNumber =
      pageNumberStr === "/" ? 1 : parseInt(pageNumberStr.substring(1));
    if (
      isFinite(pageNumber) === false ||
      pageNumber > config.pages.length ||
      pageNumber < 1
    ) {
      console.log(`Invalid request: ${request.url} for page ${pageNumber}`);
      response.writeHead(400);
      response.end("Invalid request");
      return;
    }
    try {
      // Log when the page was accessed
      const n = new Date();
      console.log(`${n.toISOString()}: Image ${pageNumber} was accessed`);

      const pageIndex = pageNumber - 1;
      const configPage = config.pages[pageIndex];

      const outputPathWithExtension = configPage.outputPath + "." + configPage.imageFormat
      const data = await fs.readFile(outputPathWithExtension);
      const stat = await fs.stat(outputPathWithExtension);

      const lastModifiedTime = new Date(stat.mtime).toUTCString();

      response.writeHead(200, {
        "Content-Type": "image/" + configPage.imageFormat,
        "Content-Length": Buffer.byteLength(data),
        "Last-Modified": lastModifiedTime
      });
      response.end(data);

      let pageBatteryStore = batteryStore[pageIndex];
      if (!pageBatteryStore) {
        pageBatteryStore = batteryStore[pageIndex] = {
          batteryLevel: null,
          isCharging: false
        };
      }
      if (!isNaN(batteryLevel) && batteryLevel >= 0 && batteryLevel <= 100) {
        if (batteryLevel !== pageBatteryStore.batteryLevel) {
          pageBatteryStore.batteryLevel = batteryLevel;
          console.log(
            `New battery level: ${batteryLevel} for page ${pageNumber}`
          );
        }

        if (
          (isCharging === "Yes" || isCharging === "1") &&
          pageBatteryStore.isCharging !== true) {
          pageBatteryStore.isCharging = true;
          console.log(`Battery started charging for page ${pageNumber}`);
        } else if (
          (isCharging === "No" || isCharging === "0") &&
          pageBatteryStore.isCharging !== false
        ) {
          console.log(`Battery stopped charging for page ${pageNumber}`);
          pageBatteryStore.isCharging = false;
        }
      }
    } catch (e) {
      console.error(e);
      response.writeHead(404);
      response.end("Image not found");
    }
  });

  const port = config.port || 5000;
  httpServer.listen(port, () => {
    console.log(`Server is running at ${port}`);
  });
})();

async function renderAndConvertAsync(browser) {
  for (let pageIndex = 0; pageIndex < config.pages.length; pageIndex++) {
    const pageConfig = config.pages[pageIndex];
    const pageBatteryStore = batteryStore[pageIndex];

    const url = `${config.baseUrl}${pageConfig.screenShotUrl}`;

    const outputPath = pageConfig.outputPath + "." + pageConfig.imageFormat;
    await fsExtra.ensureDir(path.dirname(outputPath));

    const tempPath = outputPath + ".temp";

    console.log(`Rendering ${url} to image...`);
    await renderUrlToImageAsync(browser, pageConfig, url, tempPath);

    console.log(`Converting rendered screenshot of ${url} to grayscale...`);
    await convertImageToKindleCompatiblePngAsync(
      pageConfig,
      tempPath,
      outputPath
    );

    fs.unlink(tempPath);
    console.log(`Finished ${url}`);

    if (
      pageBatteryStore &&
      pageBatteryStore.batteryLevel !== null &&
      pageConfig.batteryWebHook
    ) {
      sendBatteryLevelToHomeAssistant(
        pageIndex,
        pageBatteryStore,
        pageConfig.batteryWebHook
      );
    }
  }
}

function sendBatteryLevelToHomeAssistant(
  pageIndex,
  batteryStore,
  batteryWebHook
) {
  const batteryStatus = JSON.stringify(batteryStore);
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(batteryStatus)
    },
    rejectUnauthorized: !config.ignoreCertificateErrors
  };
  const url = `${config.baseUrl}/api/webhook/${batteryWebHook}`;
  const httpLib = url.toLowerCase().startsWith("https") ? https : http;
  const req = httpLib.request(url, options, (res) => {
    if (res.statusCode !== 200) {
      console.error(
        `Update device ${pageIndex} at ${url} status ${res.statusCode}: ${res.statusMessage}`
      );
    }
  });
  req.on("error", (e) => {
    console.error(`Update ${pageIndex} at ${url} error: ${e.message}`);
  });
  req.write(batteryStatus);
  req.end();
}

async function renderUrlToImageAsync(browser, pageConfig, url, path) {
  let page;
  try {
    page = await browser.newPage();

    // Add console logging in debug mode
    if (config.debug) {
      page.on('console', msg => console.log(`[BROWSER] ${msg.type().toUpperCase()}: ${msg.text()}`));
      page.on('pageerror', err => console.error(`[PAGE ERROR] ${err.message}`));
      page.on('requestfailed', request => console.warn(`[REQUEST FAILED] ${request.url()}: ${request.failure().errorText}`));
      console.log(`[DEBUG] Browser viewport will be: ${pageConfig.renderingScreenSize.width}x${pageConfig.renderingScreenSize.height}`);
      console.log(`[DEBUG] Timezone: ${config.timezone}, Language: ${config.language}`);
    }

    await page.emulateTimezone(config.timezone);

    await page.emulateMediaFeatures([
      {
        name: "prefers-color-scheme",
        value: `${pageConfig.prefersColorScheme}`
      }
    ]);

    let size = {
      width: Number(pageConfig.renderingScreenSize.width),
      height: Number(pageConfig.renderingScreenSize.height)
    };

    if (pageConfig.rotation % 180 > 0) {
      size = {
        width: size.height,
        height: size.width
      };
    }

    await page.setViewport(size);

    console.log(`Navigating to ${url}...`);
    await page.goto(url, {
      waitUntil: ["domcontentloaded", "load", "networkidle0"],
      timeout: config.renderingTimeout
    });

    console.log(`Waiting for home-assistant element...`);
    await page.waitForSelector("home-assistant", {
      timeout: config.renderingTimeout
    });

    // In debug mode, show additional page information
    if (config.debug) {
      const pageInfo = await page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          userAgent: navigator.userAgent,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hasHomeAssistant: !!document.querySelector('home-assistant'),
          hasLovelace: !!document.querySelector('hui-view, hui-panel-view'),
          themeInfo: {
            selectedTheme: localStorage.getItem('selectedTheme'),
            hasTokens: !!localStorage.getItem('hassTokens')
          }
        };
      });
      console.log(`[DEBUG] Page info:`, JSON.stringify(pageInfo, null, 2));
    }

    await page.addStyleTag({
      content: `
        body {
          zoom: ${pageConfig.scaling * 100}%;
          overflow: hidden;
        }`
    });

    if (pageConfig.renderingDelay > 0) {
      console.log(`Waiting ${pageConfig.renderingDelay}ms before screenshot...`);
      await new Promise(resolve => setTimeout(resolve, pageConfig.renderingDelay));
    }

    console.log(`Taking screenshot...`);
    await page.screenshot({
      path,
      type: 'png',
      captureBeyondViewport: false,
      clip: {
        x: 0,
        y: 0,
        ...size
      }
    });

    console.log(`Successfully rendered screenshot for ${url}`);
  } catch (e) {
    console.error(`Failed to render ${url}:`, e.message);
  } finally {
    if (config.debug === false && page) {
      await page.close();
    }
  }
}

async function convertImageToKindleCompatiblePngAsync(
  pageConfig,
  inputPath,
  outputPath
) {
  try {
    let image = sharp(inputPath);

    // Apply gamma correction if needed
    if (pageConfig.removeGamma) {
      image = image.gamma(1.0 / 2.2);
    }

    // Apply rotation if needed
    const rotation = Number(pageConfig.rotation);
    if (rotation !== 0) {
      image = image.rotate(rotation, { background: '#ffffff' });
    }

    // Convert to grayscale and apply color mode
    if (pageConfig.colorMode === 'GrayScale' || pageConfig.colorMode === 'Grayscale') {
      image = image.grayscale();
    }

    // Apply modulation (saturation adjustment)
    if (pageConfig.saturation !== 1) {
      image = image.modulate({
        saturation: pageConfig.saturation
      });
    }

    // Apply contrast and other adjustments
    if (pageConfig.contrast !== 1) {
      // Sharp uses linear transformation for contrast adjustment
      image = image.linear(pageConfig.contrast, -(128 * pageConfig.contrast) + 128);
    }

    // Apply level adjustments (black and white levels)
    if (pageConfig.blackLevel !== '0%' || pageConfig.whiteLevel !== '100%') {
      // Parse percentage values
      const blackLevel = parseInt(pageConfig.blackLevel.replace('%', '')) / 100;
      const whiteLevel = parseInt(pageConfig.whiteLevel.replace('%', '')) / 100;

      // Apply level adjustment using Sharp's normalize
      if (blackLevel > 0 || whiteLevel < 1) {
        const inputMin = Math.round(blackLevel * 255);
        const inputMax = Math.round(whiteLevel * 255);
        const multiplier = 255 / (inputMax - inputMin);
        const offset = -inputMin * multiplier;

        image = image.linear(multiplier, offset);
      }
    }

    // Apply dithering through Sharp's processing (limited support)
    // Note: Sharp doesn't have direct dithering support like GM
    if (pageConfig.dither) {
      // Apply slight noise to simulate dithering effect for e-ink displays
      image = image.sharpen({ sigma: 0.5, m1: 0.5, m2: 2, x1: 2, y2: 10, y3: 20 });
    }

    // Determine output format and apply format-specific options
    switch (pageConfig.imageFormat.toLowerCase()) {
      case 'png':
        image = image.png({
          quality: 100,
          compressionLevel: 9,
          colours: pageConfig.grayscaleDepth === 1 ? 2 : (pageConfig.grayscaleDepth === 4 ? 16 : 256)
        });
        break;
      case 'bmp':
        image = image.bmp();
        break;
      case 'jpg':
      case 'jpeg':
        image = image.jpeg({ quality: 100 });
        break;
      default:
        image = image.png({ quality: 100 });
    }

    // Write the processed image
    await image.toFile(outputPath);

  } catch (error) {
    throw error;
  }
}
