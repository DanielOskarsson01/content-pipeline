/**
 * Shared browser utility for Playwright-based page fetching
 * Used when simple HTTP fetch fails (CSR sites, bot protection, etc.)
 */

const { chromium } = require('playwright');

let browserInstance = null;
let browserLaunchPromise = null;

/**
 * Get or create a shared browser instance
 * Uses lazy initialization and singleton pattern for efficiency
 */
async function getBrowser() {
  if (browserInstance) {
    return browserInstance;
  }

  // Prevent multiple simultaneous launches
  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  browserLaunchPromise = chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ]
  });

  browserInstance = await browserLaunchPromise;
  browserLaunchPromise = null;

  return browserInstance;
}

/**
 * Fetch a URL using a real browser (handles CSR and bot protection)
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} options.timeout - Timeout in ms (default: 30000)
 * @param {boolean} options.waitForNetworkIdle - Wait for network to be idle (default: false)
 * @param {string} options.waitForSelector - CSS selector to wait for (optional)
 * @returns {Promise<{content: string, status: number, url: string}>}
 */
async function fetchWithBrowser(url, options = {}) {
  const {
    timeout = 30000,
    waitForNetworkIdle = false,
    waitForSelector = null
  } = options;

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US'
  });

  const page = await context.newPage();

  try {
    // Set extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    const response = await page.goto(url, {
      timeout,
      waitUntil: waitForNetworkIdle ? 'networkidle' : 'domcontentloaded'
    });

    // Wait for specific selector if provided
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: timeout / 2 });
    }

    // Small delay to let any final JS execute
    await page.waitForTimeout(500);

    const content = await page.content();
    const status = response?.status() || 200;
    const finalUrl = page.url();

    return {
      content,
      status,
      url: finalUrl,
      usedBrowser: true
    };
  } finally {
    await context.close();
  }
}

/**
 * Fetch with automatic fallback: try simple fetch first, use browser if blocked
 *
 * @param {string} url - URL to fetch
 * @param {Object} options - Options
 * @param {number} options.simpleTimeout - Timeout for simple fetch (default: 15000)
 * @param {number} options.browserTimeout - Timeout for browser fetch (default: 30000)
 * @param {Function} options.logger - Optional logger object with info/warn methods
 * @returns {Promise<{content: string, status: number, url: string, usedBrowser: boolean}>}
 */
async function fetchWithFallback(url, options = {}) {
  const {
    simpleTimeout = 15000,
    browserTimeout = 30000,
    logger = console
  } = options;

  // Try simple fetch first
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), simpleTimeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    clearTimeout(timeoutId);

    // Check for bot protection responses
    const content = await response.text();
    const lowerContent = content.toLowerCase();

    // Detect common bot protection patterns
    const isBlocked =
      response.status === 403 ||
      response.status === 429 ||
      response.status === 503 ||
      lowerContent.includes('captcha') ||
      lowerContent.includes('cloudflare') ||
      lowerContent.includes('please enable javascript') ||
      lowerContent.includes('browser check') ||
      lowerContent.includes('ddos protection') ||
      (content.length < 1000 && lowerContent.includes('blocked'));

    if (isBlocked) {
      logger.info?.(`[browser] Simple fetch blocked for ${url}, falling back to browser`);
      return await fetchWithBrowser(url, { timeout: browserTimeout });
    }

    return {
      content,
      status: response.status,
      url: response.url,
      usedBrowser: false
    };
  } catch (err) {
    // If simple fetch fails, try browser
    logger.info?.(`[browser] Simple fetch failed for ${url}: ${err.message}, trying browser`);
    return await fetchWithBrowser(url, { timeout: browserTimeout });
  }
}

/**
 * Close the shared browser instance
 * Call this when shutting down the application
 */
async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// Cleanup on process exit
process.on('beforeExit', closeBrowser);
process.on('SIGINT', async () => {
  await closeBrowser();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await closeBrowser();
  process.exit(0);
});

module.exports = {
  getBrowser,
  fetchWithBrowser,
  fetchWithFallback,
  closeBrowser
};
