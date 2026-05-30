/**
 * TrustMark - Photo Timestamp PWA
 * Google Apps Script Backend
 */

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

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('TrustMark')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * Includes the content of an HTML file. Used for templating.
 * @param {string} filename - The name of the file to include.
 * @return {string} The raw content of the file.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
