/**
 * Permission Checking
 * Validates route access based on token permissions
 */

import { TokenPermission } from './validate-token'

/**
 * Check if token has permission to access a route
 */
export function checkRoutePermission(
  permissions: TokenPermission[],
  path: string,
  method: string
): boolean {
  // Extract resource from path
  // e.g., "/api/agents/123" -> "agents"
  const resource = extractResource(path)
  if (!resource) return false
  
  // Find matching permissions
  const matches = permissions.filter(p => 
    p.resource === resource && 
    matchesRoutePattern(path, p.route_pattern)
  )
  
  if (matches.length === 0) return false
  
  // Map HTTP method to permission field
  const permissionField = methodToPermissionField(method)
  if (!permissionField) return false
  
  // Check if any matching permission grants access
  return matches.some(p => p[permissionField] === true)
}

/**
 * Extract resource name from API path
 * /api/agents/123 -> "agents"
 * /api/tasks -> "tasks"
 */
function extractResource(path: string): string | null {
  const match = path.match(/^\/api\/([^\/]+)/)
  return match ? match[1] : null
}

/**
 * Check if path matches route pattern
 * Pattern syntax:
 * - /api/agents - exact match
 * - /api/agents/* - wildcard (matches /api/agents/123, /api/agents/123/tools)
 * - /api/agents/:id - parameter (matches /api/agents/123 but not /api/agents/123/tools)
 */
function matchesRoutePattern(path: string, pattern: string): boolean {
  // Exact match
  if (path === pattern) return true
  
  // Wildcard pattern: /api/agents/*
  if (pattern.endsWith('/*')) {
    const basePattern = pattern.slice(0, -2)
    return path.startsWith(basePattern)
  }
  
  // Parameter pattern: /api/agents/:id
  if (pattern.includes(':')) {
    const regex = new RegExp(
      '^' + pattern.replace(/:[^\/]+/g, '[^/]+') + '$'
    )
    return regex.test(path)
  }
  
  return false
}

/**
 * Map HTTP method to permission field
 */
function methodToPermissionField(method: string): keyof TokenPermission | null {
  const map: Record<string, keyof TokenPermission> = {
    'GET': 'can_read',
    'POST': 'can_create',
    'PUT': 'can_update',
    'PATCH': 'can_update',
    'DELETE': 'can_delete'
  }
  return map[method.toUpperCase()] || null
}

/**
 * Check CORS origin restrictions
 */
export function checkCorsOrigin(
  allowedOrigins: string[] | undefined,
  requestOrigin: string | null
): boolean {
  // No origin header = server-to-server (allow)
  if (!requestOrigin) return true
  
  // No restrictions = allow all
  if (!allowedOrigins || allowedOrigins.length === 0) return true
  
  // Check for wildcard
  if (allowedOrigins.includes('*')) return true
  
  // Check exact match or subdomain wildcard
  return allowedOrigins.some(allowed => {
    // Exact match
    if (allowed === requestOrigin) return true
    
    // Subdomain wildcard: *.example.com matches app.example.com
    if (allowed.startsWith('*.')) {
      const domain = allowed.substring(2)
      return requestOrigin.endsWith(domain)
    }
    
    return false
  })
}

/**
 * Check if token is allowed to access specific agent
 * For service tokens with agent restrictions
 */
export function checkAgentAccess(
  allowedAgentIds: string[] | undefined,
  requestedAgentId: string | null
): boolean {
  // No restrictions = allow all agents
  if (!allowedAgentIds || allowedAgentIds.length === 0) return true
  
  // No agent specified in request = allow
  if (!requestedAgentId) return true
  
  // Check if agent is in allowed list
  return allowedAgentIds.includes(requestedAgentId)
}

/**
 * Extract agent ID from request path or body
 */
export function extractAgentId(path: string, body?: any): string | null {
  // From URL: /api/agents/123
  const urlMatch = path.match(/^\/api\/agents\/([^\/]+)/)
  if (urlMatch) return urlMatch[1]
  
  // From body: { agent_id: "123" }
  if (body?.agent_id) return body.agent_id
  if (body?.agent_slug) return body.agent_slug
  
  return null
}
