function getEnvironmentVariable(key, suffix, fallbackValue) {
  const value = process.env[key + suffix];
  if (value !== undefined) return value;
  return fallbackValue || process.env[key];
}

function getPagesConfig() {
  const pages = [];
  let i = 0;
  while (++i) {
    const suffix = i === 1 ? "" : `_${i}`;
    const screenShotUrl = process.env[`HA_SCREENSHOT_URL${suffix}`];
    if (!screenShotUrl) return pages;
    pages.push({
      screenShotUrl,
      imageFormat: getEnvironmentVariable("IMAGE_FORMAT", suffix) || "png",
      outputPath: getEnvironmentVariable(
        "OUTPUT_PATH",
        suffix,
        `output/cover${suffix}`
      ),
      renderingDelay: Number(getEnvironmentVariable("RENDERING_DELAY", suffix)) || 0,
      renderingScreenSize: {
        height:
          Number(getEnvironmentVariable("RENDERING_SCREEN_HEIGHT", suffix)) || 800,
        width: Number(getEnvironmentVariable("RENDERING_SCREEN_WIDTH", suffix)) || 600,
      },
      grayscaleDepth: Number(getEnvironmentVariable("GRAYSCALE_DEPTH", suffix)) || 8,
      removeGamma: getEnvironmentVariable("REMOVE_GAMMA", suffix) === "true" || false,
      blackLevel: getEnvironmentVariable("BLACK_LEVEL", suffix) || "0%",
      whiteLevel: getEnvironmentVariable("WHITE_LEVEL", suffix) || "100%",
      dither: getEnvironmentVariable("DITHER", suffix) === "true" || false,
      colorMode: getEnvironmentVariable("COLOR_MODE", suffix) || "GrayScale",
      prefersColorScheme: getEnvironmentVariable("PREFERS_COLOR_SCHEME", suffix) || "light",
      rotation: Number(getEnvironmentVariable("ROTATION", suffix)) || 0,
      scaling: Number(getEnvironmentVariable("SCALING", suffix)) || 1,
      batteryWebHook: getEnvironmentVariable("HA_BATTERY_WEBHOOK", suffix) || null,
      saturation: Number(getEnvironmentVariable("SATURATION", suffix)) || 1,
      contrast: Number(getEnvironmentVariable("CONTRAST", suffix)) || 1,
    });
  }
  return pages;
}

module.exports = {
  baseUrl: process.env.HA_BASE_URL,
  accessToken: process.env.HA_ACCESS_TOKEN,
  cronJob: process.env.CRON_JOB || "* * * * *",
  pages: getPagesConfig(),
  port: process.env.PORT || 5000,
  renderingTimeout: process.env.RENDERING_TIMEOUT || 10000,
  browserLaunchTimeout: process.env.BROWSER_LAUNCH_TIMEOUT || 30000,
  language: process.env.LANGUAGE || "en",
  theme: process.env.HA_THEME || "",
  debug: process.env.DEBUG === "true",
  ignoreCertificateErrors:
    process.env.UNSAFE_IGNORE_CERTIFICATE_ERRORS === "true",
  timezone: process.env.TZ || "Europe/Berlin"
};
