/**
 * TrustMark - Backend Service
 * Server-side payment validation and subscription management
 * Uses PropertiesService for persistent per-user storage
 */

// ==================== SUBSCRIPTION TIERS ====================
var TIER_CONFIG = {
  basic: { amount: 3000, duration: 24 * 3600 * 1000, label: 'Basic' },
  pro: { amount: 15000, duration: 30 * 24 * 3600 * 1000, label: 'Pro' }
};

// Allowed variance for unique payment suffix (1-99)
var PAYMENT_VARIANCE = 99;

// ==================== SUBSCRIPTION MANAGEMENT ====================

/**
 * Checks the current user's subscription status from server-side storage.
 * Called on app load to sync server state with client.
 * @return {Object|null} Subscription object or null if no active subscription
 */
function checkSubscription() {
  var userProps = PropertiesService.getUserProperties();
  var email = Session.getActiveUser().getEmail();
  var subJson = userProps.getProperty('subscription_' + email);

  if (!subJson) {
    return null;
  }

  try {
    var sub = JSON.parse(subJson);
    var now = Date.now();
    var active = sub.expiry && now < sub.expiry;

    return {
      tier: sub.tier,
      expiry: sub.expiry,
      active: active,
      amount_paid: sub.amount_paid || 0,
      activated_at: sub.activated_at || null,
      user_email: sub.user_email || email,
      transaction_id: sub.transaction_id || null
    };
  } catch (e) {
    Logger.log('Error parsing subscription for ' + email + ': ' + e.message);
    return null;
  }
}

/**
 * Simplified subscription status check for quick lookups.
 * @return {Object} Status object with tier and active flag
 */
function getSubscriptionStatus() {
  var sub = checkSubscription();
  if (!sub || !sub.active) {
    return { tier: 'free', active: false };
  }
  return { tier: sub.tier, active: true, expiry: sub.expiry };
}

/**
 * Activates a subscription for the current user.
 * Validates tier and amount before storing.
 * Prevents replay by checking if user already has an active subscription
 * for the same or higher tier.
 * @param {string} tier - The subscription tier ('basic' or 'pro')
 * @param {number} amount - The amount paid
 * @return {Object} The activated subscription object
 */
function activateSubscription(tier, amount) {
  // Validate tier
  if (!tier || !TIER_CONFIG[tier]) {
    throw new Error('Invalid subscription tier: ' + tier);
  }

  var config = TIER_CONFIG[tier];

  // Validate amount (must be base amount + 1 to 99 unique suffix)
  var numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < config.amount || numAmount > config.amount + PAYMENT_VARIANCE) {
    throw new Error('Invalid payment amount for tier ' + tier + ': ' + amount);
  }

  // Replay protection: check if user already has an active subscription
  // for the same or higher tier
  var existingSub = checkSubscription();
  if (existingSub && existingSub.active) {
    var tierRank = { basic: 1, pro: 2 };
    var existingRank = tierRank[existingSub.tier] || 0;
    var requestedRank = tierRank[tier] || 0;
    if (existingRank >= requestedRank) {
      throw new Error('User already has an active ' + existingSub.tier + ' subscription (expires ' + new Date(existingSub.expiry).toISOString() + ')');
    }
  }

  var email = Session.getActiveUser().getEmail();
  var now = Date.now();
  var expiry = now + config.duration;
  var transactionId = generateTransactionId();

  var subscription = {
    tier: tier,
    expiry: expiry,
    amount_paid: numAmount,
    activated_at: now,
    user_email: email,
    transaction_id: transactionId
  };

  // Store in user properties
  var userProps = PropertiesService.getUserProperties();
  userProps.setProperty('subscription_' + email, JSON.stringify(subscription));

  Logger.log('Subscription activated: ' + email + ' -> ' + tier + ' (Rp ' + numAmount + ')');

  return {
    tier: subscription.tier,
    expiry: subscription.expiry,
    active: true,
    amount_paid: subscription.amount_paid,
    activated_at: subscription.activated_at,
    user_email: subscription.user_email,
    transaction_id: subscription.transaction_id
  };
}

/**
 * Validates a payment and activates the subscription.
 * Checks transaction ID for replay prevention.
 * @param {string} tier - The subscription tier
 * @param {number} amount - The payment amount
 * @param {string} transactionId - Client-provided transaction reference (optional)
 * @return {Object} The activated subscription object
 */
function validatePayment(tier, amount, transactionId) {
  // Validate tier
  if (!tier || !TIER_CONFIG[tier]) {
    throw new Error('Invalid tier for payment validation: ' + tier);
  }

  // Validate amount
  var config = TIER_CONFIG[tier];
  var numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < config.amount || numAmount > config.amount + PAYMENT_VARIANCE) {
    throw new Error('Payment amount mismatch for tier ' + tier);
  }

  // Check for replay if transactionId provided
  if (transactionId) {
    var scriptProps = PropertiesService.getScriptProperties();
    var existingTx = scriptProps.getProperty('tx_' + transactionId);
    if (existingTx) {
      throw new Error('Transaction already processed: ' + transactionId);
    }
    // Store transaction to prevent replay
    scriptProps.setProperty('tx_' + transactionId, JSON.stringify({
      tier: tier,
      amount: numAmount,
      timestamp: Date.now(),
      user: Session.getActiveUser().getEmail()
    }));
  }

  // Activate the subscription
  return activateSubscription(tier, numAmount);
}

/**
 * Generates a unique transaction ID using timestamp and random component.
 * Stores in ScriptProperties to prevent replay attacks.
 * @return {string} Unique transaction ID
 */
function generateTransactionId() {
  var timestamp = Date.now().toString(36);
  var random = Math.random().toString(36).substring(2, 8);
  var txId = 'TM-' + timestamp + '-' + random;

  // Store in script properties for replay prevention
  var scriptProps = PropertiesService.getScriptProperties();
  scriptProps.setProperty('tx_' + txId, JSON.stringify({
    generated: Date.now(),
    user: Session.getActiveUser().getEmail()
  }));

  return txId;
}

// ==================== CLOUD STORAGE (GOOGLE DRIVE) ====================

/**
 * Finds or creates the TrustMark folder in the user's Google Drive root.
 * Caches the folder ID in UserProperties for efficiency.
 * @return {Folder} The TrustMark folder object
 */
function getTrustMarkFolder() {
  var userProps = PropertiesService.getUserProperties();
  var folderId = userProps.getProperty('trustmark_folder_id');
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      // Folder may have been deleted, recreate below
    }
  }
  var folders = DriveApp.getRootFolder().getFoldersByName('TrustMark');
  if (folders.hasNext()) {
    var folder = folders.next();
    userProps.setProperty('trustmark_folder_id', folder.getId());
    return folder;
  }
  var newFolder = DriveApp.getRootFolder().createFolder('TrustMark');
  userProps.setProperty('trustmark_folder_id', newFolder.getId());
  return newFolder;
}

/**
 * Saves a photo to the user's Google Drive TrustMark folder.
 * Requires an active Pro subscription.
 * @param {string} base64Data - Base64-encoded JPEG image data (without data URI prefix)
 * @param {string} filename - The filename for the saved image
 * @param {Object} metadata - Metadata object with location, dateTime, title, vrfCode
 * @return {Object} File info: { fileId, fileName, fileUrl, createdAt }
 */
function savePhotoToDrive(base64Data, filename, metadata) {
  // Verify Pro subscription
  var sub = checkSubscription();
  if (!sub || !sub.active || sub.tier !== 'pro') {
    throw new Error('Cloud storage requires Pro subscription');
  }

  // Decode base64 and create blob
  var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', filename);

  // Get or create the TrustMark folder
  var folder = getTrustMarkFolder();

  // Save file to folder
  var file = folder.createFile(blob);

  // Set description as JSON metadata
  if (metadata) {
    file.setDescription(JSON.stringify(metadata));
  }

  return {
    fileId: file.getId(),
    fileName: file.getName(),
    fileUrl: file.getUrl(),
    createdAt: new Date().toISOString()
  };
}

/**
 * Lists saved photos from the TrustMark Drive folder with pagination.
 * Requires an active Pro subscription.
 * Limits file iteration to prevent GAS execution timeout.
 * @param {number} page - Page number (1-based), default 1
 * @param {number} pageSize - Number of items per page, default 12
 * @return {Array} Array of photo objects: { id, name, url, thumbnailUrl, createdDate, description }
 */
function getPhotoHistory(page, pageSize) {
  // Verify Pro subscription
  var sub = checkSubscription();
  if (!sub || !sub.active || sub.tier !== 'pro') {
    throw new Error('Photo history requires an active Pro subscription');
  }

  page = page || 1;
  pageSize = pageSize || 12;

  var folder = getTrustMarkFolder();
  var files = folder.getFilesByType('image/jpeg');

  // Collect files with a hard limit to prevent GAS timeout
  var MAX_FILES = 100;
  var allFiles = [];
  while (files.hasNext() && allFiles.length < MAX_FILES) {
    allFiles.push(files.next());
  }

  // Sort by date created (newest first)
  allFiles.sort(function(a, b) {
    return b.getDateCreated().getTime() - a.getDateCreated().getTime();
  });

  // Paginate
  var offset = (page - 1) * pageSize;
  var pagedFiles = allFiles.slice(offset, offset + pageSize);

  var results = [];
  for (var i = 0; i < pagedFiles.length; i++) {
    var f = pagedFiles[i];
    results.push({
      id: f.getId(),
      name: f.getName(),
      url: f.getUrl(),
      thumbnailUrl: f.getUrl(),
      createdDate: f.getDateCreated().toISOString(),
      description: f.getDescription() || ''
    });
  }

  return results;
}

/**
 * Deletes a photo from the TrustMark Drive folder.
 * Requires an active Pro subscription.
 * Verifies the file is actually in the TrustMark folder before deletion.
 * @param {string} fileId - The Google Drive file ID to delete
 * @return {Object} Success indicator: { success: true }
 */
function deletePhotoFromDrive(fileId) {
  // Verify Pro subscription
  var sub = checkSubscription();
  if (!sub || !sub.active || sub.tier !== 'pro') {
    throw new Error('Deleting photos requires an active Pro subscription');
  }

  var folder = getTrustMarkFolder();
  var file = DriveApp.getFileById(fileId);

  // Security check: verify file is in the TrustMark folder
  var parents = file.getParents();
  var inFolder = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.getId()) {
      inFolder = true;
      break;
    }
  }

  if (!inFolder) {
    throw new Error('File is not in the TrustMark folder');
  }

  file.setTrashed(true);
  return { success: true };
}

/**
 * Returns basic storage info for the TrustMark folder.
 * Limits file iteration to prevent GAS execution timeout.
 * @return {Object} Storage info: { photoCount, folderUrl }
 */
function getStorageInfo() {
  var folder = getTrustMarkFolder();
  var files = folder.getFilesByType('image/jpeg');

  // Count with a hard limit to prevent GAS timeout
  var MAX_COUNT = 100;
  var count = 0;
  while (files.hasNext() && count < MAX_COUNT) {
    files.next();
    count++;
  }

  return {
    photoCount: count,
    folderUrl: folder.getUrl()
  };
}
