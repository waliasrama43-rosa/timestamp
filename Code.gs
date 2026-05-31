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
 * Returns JSON responses via ContentService.
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
      case 'activateSubscription':
        var tier = e.parameter.tier;
        var amount = e.parameter.amount;
        result = { success: true, data: activateSubscription(tier, Number(amount)) };
        break;
      case 'validatePayment':
        var pTier = e.parameter.tier;
        var pAmount = e.parameter.amount;
        var pTxId = e.parameter.transactionId || null;
        result = { success: true, data: validatePayment(pTier, Number(pAmount), pTxId) };
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
