/**
 * Authentication utilities for multi-user database operations
 */

/**
 * Get the currently authenticated user ID
 * In a real application, this would come from JWT token, session, or request context
 * For development/testing, we can specify the user
 */
function getAuthenticatedUserId() {
  // In production, this would be:
  // return getCurrentUserFromToken() or getCurrentUserFromSession()
  
  // For development - using Carl Kill's user ID
  return 'cmelmfz4k0000r5ilqnba1nml';
}

/**
 * Get user-specific accounts by provider type
 * Ensures accounts belong to the authenticated user
 */
async function getUserAccounts(prisma, userId, providerType) {
  return await prisma.account.findMany({
    where: {
      userId,
      providerType,
      isActive: true
    }
  });
}

/**
 * Get user-specific integrations
 * Ensures integrations belong to the authenticated user
 */
async function getUserIntegrations(prisma, userId) {
  return await prisma.integration.findMany({
    where: { userId },
    include: {
      retellAccount: { select: { provider: true, accountName: true } },
      crmAccount: { select: { provider: true, accountName: true } }
    }
  });
}

module.exports = {
  getAuthenticatedUserId,
  getUserAccounts,
  getUserIntegrations
};