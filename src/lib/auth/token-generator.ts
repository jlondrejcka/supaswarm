/**
 * API Token Generation & Validation
 * Secure token generation with bcrypt hashing
 */

import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 10
const TOKEN_PREFIX = 'ss_live_'
const TOKEN_ENTROPY_BYTES = 32 // 256 bits

export interface GeneratedToken {
  token: string      // Full token to show user ONCE
  hash: string       // bcrypt hash for storage
  prefix: string     // First 16 chars for identification
}

/**
 * Generate a new API token
 * Format: ss_live_<43-char-base64url-string>
 */
export function generateApiToken(): GeneratedToken {
  // Generate cryptographically secure random bytes
  const randomBytes = crypto.randomBytes(TOKEN_ENTROPY_BYTES)
  const tokenSecret = randomBytes.toString('base64url')
  
  // Create full token with prefix
  const token = `${TOKEN_PREFIX}${tokenSecret}`
  
  // Hash for storage (never store plaintext)
  const hash = bcrypt.hashSync(token, BCRYPT_ROUNDS)
  
  // Extract prefix for quick lookup
  const prefix = token.substring(0, 16) // "ss_live_xxxxxxxx"
  
  return { token, hash, prefix }
}

/**
 * Verify a token against its stored hash
 * Uses constant-time comparison to prevent timing attacks
 */
export function verifyToken(token: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(token, hash)
  } catch (error) {
    console.error('[token-generator] Hash comparison error:', error)
    return false
  }
}

/**
 * Validate token format
 */
export function isValidTokenFormat(token: string): boolean {
  if (!token.startsWith(TOKEN_PREFIX)) return false
  
  // Should be prefix + 43 chars
  const expectedLength = TOKEN_PREFIX.length + 43
  if (token.length !== expectedLength) return false
  
  return true
}

/**
 * Extract prefix from token for database lookup
 */
export function extractTokenPrefix(token: string): string | null {
  if (!isValidTokenFormat(token)) return null
  return token.substring(0, 16)
}

/**
 * Calculate expiration date based on duration
 */
export function calculateExpirationDate(duration: string): Date | null {
  const now = new Date()
  
  switch (duration) {
    case '7':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    case '30':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    case '90':
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    case '180':
      return new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)
    case '365':
      return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    case 'never':
      return null // No expiration
    default:
      throw new Error(`Invalid duration: ${duration}`)
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false // Never expires
  return new Date(expiresAt) < new Date()
}
