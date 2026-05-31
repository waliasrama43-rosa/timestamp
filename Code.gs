/**
 * TrustMark - Photo Timestamp PWA
 * Google Apps Script Backend
 */

/**
 * TrustMark 192x192 SVG icon.
 * NOTE: Some older Android WebViews (pre-Chromium 92) may not render SVG manifest icons
 * and will fall back to the browser's generic app icon. Raster PNG fallback could be
 * added in a future iteration if needed.
 */
var ICON_SVG_192 = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">'
  + '<rect width="192" height="192" rx="19.2" ry="19.2" fill="#1B3A5C"/>'
  + '<path d="M96 32 L144 56 L144 104 Q144 140 96 160 Q48 140 48 104 L48 56 Z" fill="#D4A841"/>'
  + '<text x="96" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="bold" fill="#FFFFFF">TM</text>'
  + '</svg>';

/** TrustMark 512x512 SVG icon */
var ICON_SVG_512 = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">'
  + '<rect width="512" height="512" rx="51.2" ry="51.2" fill="#1B3A5C"/>'
  + '<path d="M256 85 L384 149 L384 277 Q384 373 256 427 Q128 373 128 277 L128 149 Z" fill="#D4A841"/>'
  + '<text x="256" y="314" text-anchor="middle" font-family="Arial, sans-serif" font-size="128" font-weight="bold" fill="#FFFFFF">TM</text>'
  + '</svg>';

/**
 * Serves the main web app or special resources based on query parameter.
 * @param {Object} e - The event object from a GET request.
 * @return {HtmlOutput|TextOutput} The HTML page or text resource.
 */
function doGet(e) {
  var page = e && e.parameter && e.parameter.page;

  if (page === 'manifest') {
    return ContentService.createTextOutput(
      HtmlService.createHtmlOutputFromFile('manifest').getContent()
    ).setMimeType(ContentService.MimeType.JSON);
  }

  if (page === 'sw') {
    return ContentService.createTextOutput(
      HtmlService.createHtmlOutputFromFile('sw').getContent()
    ).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  if (page === 'icon-192') {
    return ContentService.createTextOutput(ICON_SVG_192)
      .setMimeType(ContentService.MimeType.XML);
  }

  if (page === 'icon-512') {
    return ContentService.createTextOutput(ICON_SVG_512)
      .setMimeType(ContentService.MimeType.XML);
  }

  if (page === 'api') {
    return handleApiRequest(e);
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('TrustMark')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Handles API requests routed via ?page=api&action=...
 * Only read-only actions are exposed via GET to prevent CSRF.
 * State-mutating operations (activateSubscription, validatePayment) are only
 * accessible via google.script.run which has built-in CSRF protection.
 * @param {Object} e - The event object from a GET request.
 * @return {TextOutput} JSON response.
 */
function handleApiRequest(e) {
  var action = e && e.parameter && e.parameter.action;
  var result;

  try {
    switch (action) {
      case 'checkSubscription':
        result = { success: true, data: checkSubscription() };
        break;
      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { success: false, error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Includes the content of an HTML file. Used for templating.
 * @param {string} filename - The name of the file to include.
 * @return {string} The raw content of the file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
