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
