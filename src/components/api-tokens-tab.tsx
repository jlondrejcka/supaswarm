"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Copy, Trash2, Plus, RotateCw, Eye, EyeOff, Check, AlertCircle, ExternalLink } from "lucide-react"

interface ApiToken {
  id: string
  name: string
  prefix: string
  scope_type: "service" | "user"
  last_used_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  permissions_count: number
  has_agent_restrictions: boolean
  has_cors_restrictions: boolean
}

interface Permission {
  resource: string
  route_pattern: string
  can_create: boolean
  can_read: boolean
  can_update: boolean
  can_delete: boolean
}

interface PermissionTemplate {
  id: string
  name: string
  description: string
  is_system: boolean
  permissions: Permission[]
}

const RESOURCES = ["agents", "tasks", "sessions", "tools", "skills", "channels"]
const DURATIONS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never expires" },
]

export function ApiTokensTab() {
  const [tokens, setTokens] = useState<ApiToken[]>([])
  const [templates, setTemplates] = useState<PermissionTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [showNewToken, setShowNewToken] = useState(false)
  const [newToken, setNewToken] = useState<{ token: string; prefix: string } | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  // Form state
  const [formName, setFormName] = useState("")
  const [formScopeType, setFormScopeType] = useState<"service" | "user">("service")
  const [formDuration, setFormDuration] = useState("365")
  const [formTemplate, setFormTemplate] = useState("full-access")
  const [formCustomPermissions, setFormCustomPermissions] = useState<Permission[]>([])
  const [useCustom, setUseCustom] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<PermissionTemplate | null>(null)

  useEffect(() => {
    fetchTokens()
    fetchTemplates()
  }, [])

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/tokens")
      if (!res.ok) throw new Error("Failed to fetch tokens")
      const data = await res.json()
      setTokens(data)
    } catch (error) {
      console.error("Error fetching tokens:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/templates")
      if (!res.ok) throw new Error("Failed to fetch templates")
      const data = await res.json()
      setTemplates(data)
      if (data.length > 0) {
        setSelectedTemplate(data.find((t: PermissionTemplate) => t.name === "Full Access"))
      }
    } catch (error) {
      console.error("Error fetching templates:", error)
    }
  }, [])

  const handleCreateToken = async () => {
    if (!formName.trim()) {
      alert("Token name is required")
      return
    }

    try {
      const permissions = useCustom ? formCustomPermissions : selectedTemplate?.permissions || []
      
      const res = await fetch("/api/auth/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          scope_type: formScopeType,
          duration: formDuration,
          permissions,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create token")
      }

      const data = await res.json()
      setNewToken(data)
      setShowNewToken(true)
      setDialogOpen(false)
      resetForm()
      await fetchTokens()
    } catch (error) {
      console.error("Error creating token:", error)
      alert(error instanceof Error ? error.message : "Failed to create token")
    }
  }

  const handleDeleteToken = async (tokenId: string) => {
    if (!confirm("Delete this token? This cannot be undone.")) return

    try {
      const res = await fetch(`/api/auth/tokens/${tokenId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete token")
      await fetchTokens()
    } catch (error) {
      console.error("Error deleting token:", error)
      alert("Failed to delete token")
    }
  }

  const handleRotateToken = async (tokenId: string) => {
    if (!confirm("Generate a new token? The old one will be immediately invalidated.")) return

    try {
      const res = await fetch(`/api/auth/tokens/${tokenId}/rotate`, { method: "POST" })
      if (!res.ok) throw new Error("Failed to rotate token")
      const data = await res.json()
      setNewToken(data)
      setShowNewToken(true)
      await fetchTokens()
    } catch (error) {
      console.error("Error rotating token:", error)
      alert("Failed to rotate token")
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  const resetForm = () => {
    setFormName("")
    setFormScopeType("service")
    setFormDuration("365")
    setFormTemplate("full-access")
    setFormCustomPermissions([])
    setUseCustom(false)
  }

  const togglePermission = (
    resourceIdx: number,
    operation: keyof Omit<Permission, "resource" | "route_pattern">
  ) => {
    setFormCustomPermissions(prev => {
      const updated = [...prev]
      if (updated[resourceIdx]) {
        updated[resourceIdx] = {
          ...updated[resourceIdx],
          [operation]: !updated[resourceIdx][operation],
        }
      }
      return updated
    })
  }

  const initializeCustomPermissions = () => {
    setFormCustomPermissions(
      RESOURCES.map(resource => ({
        resource,
        route_pattern: `/api/${resource}/*`,
        can_create: false,
        can_read: false,
        can_update: false,
        can_delete: false,
      }))
    )
    setUseCustom(true)
  }

  const formatDate = (date: string | null) => {
    if (!date) return "Never"
    const d = new Date(date)
    return d.toLocaleDateString() + " " + d.toLocaleTimeString()
  }

  const getDaysUntilExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return null
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return days
  }

  return (
    <div className="space-y-6">
      {/* New Token Display */}
      {showNewToken && newToken && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="h-5 w-5" />
              Token Created Successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-background rounded border font-mono text-sm break-all">
              {newToken.token}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => copyToClipboard(newToken.token)}
                size="sm"
                variant="outline"
              >
                <Copy className="h-4 w-4 mr-2" />
                {tokenCopied ? "Copied!" : "Copy Token"}
              </Button>
              <Button
                onClick={() => setShowNewToken(false)}
                size="sm"
                variant="outline"
              >
                Done
              </Button>
            </div>
            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded text-sm text-amber-700 dark:text-amber-300 flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>Save this token now. You won't be able to see it again.</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tokens List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>API Tokens</CardTitle>
              <CardDescription>Create and manage API tokens for programmatic access</CardDescription>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Token
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading tokens...</div>
          ) : tokens.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No API tokens yet</p>
              <Button onClick={() => setDialogOpen(true)} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Token
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {tokens.map(token => {
                const daysUntilExpiry = getDaysUntilExpiry(token.expires_at)
                const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7
                
                return (
                  <div key={token.id} className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm bg-muted px-2 py-1 rounded">{token.prefix}***</span>
                        <Badge variant={token.scope_type === "service" ? "default" : "secondary"}>
                          {token.scope_type === "service" ? "Service" : "User"}
                        </Badge>
                        {!token.is_active && <Badge variant="destructive">Revoked</Badge>}
                        {isExpiringSoon && (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                            Expiring soon
                          </Badge>
                        )}
                      </div>
                      <div className="grid gap-2 text-sm">
                        <div>
                          <p className="font-medium">{token.name}</p>
                        </div>
                        <div className="flex gap-4 text-muted-foreground text-xs flex-wrap">
                          <div>Created: {formatDate(token.created_at)}</div>
                          {token.expires_at && (
                            <div>
                              Expires: {formatDate(token.expires_at)}
                              {daysUntilExpiry !== null && daysUntilExpiry > 0 && (
                                <span className="ml-1">({daysUntilExpiry}d)</span>
                              )}
                            </div>
                          )}
                          {token.last_used_at && (
                            <div>Last used: {formatDate(token.last_used_at)}</div>
                          )}
                        </div>
                        {(token.has_agent_restrictions || token.has_cors_restrictions) && (
                          <div className="flex gap-2 flex-wrap">
                            {token.has_agent_restrictions && (
                              <Badge variant="outline" className="text-xs">Agent-scoped</Badge>
                            )}
                            {token.has_cors_restrictions && (
                              <Badge variant="outline" className="text-xs">CORS-restricted</Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRotateToken(token.id)}
                        disabled={!token.is_active}
                        title="Generate new token secret"
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteToken(token.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create API Token</DialogTitle>
            <DialogDescription>
              Generate a new token for programmatic access with specific permissions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Token Name */}
            <div className="space-y-2">
              <Label htmlFor="token-name">Token Name *</Label>
              <Input
                id="token-name"
                placeholder="e.g., Production API"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Unique identifier for your token</p>
            </div>

            {/* Scope Type */}
            <div className="space-y-2">
              <Label htmlFor="scope-type">Token Type</Label>
              <Select value={formScopeType} onValueChange={(v) => setFormScopeType(v as "service" | "user")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service Token (Full Access)</SelectItem>
                  <SelectItem value="user">User Token (RLS-Aware)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Service tokens bypass RLS. User tokens respect row-level security.
              </p>
            </div>

            {/* Duration */}
            <div className="space-y-2">
              <Label htmlFor="duration">Expiration</Label>
              <Select value={formDuration} onValueChange={setFormDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map(d => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Permissions */}
            <div className="space-y-3">
              <Label>Permissions</Label>
              
              {!useCustom ? (
                <div className="space-y-2">
                  <Select value={formTemplate} onValueChange={(v) => {
                    setFormTemplate(v)
                    const template = templates.find(t => t.id === v)
                    if (template) setSelectedTemplate(template)
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedTemplate && (
                    <div className="p-3 bg-muted rounded-lg border space-y-2">
                      <p className="text-sm font-medium">{selectedTemplate.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
                      <div className="space-y-1 pt-2 border-t">
                        {selectedTemplate.permissions.map((p, i) => (
                          <div key={i} className="text-xs text-muted-foreground">
                            <span className="font-mono">{p.resource}</span>: 
                            {" "}
                            {[
                              p.can_create && "C",
                              p.can_read && "R",
                              p.can_update && "U",
                              p.can_delete && "D"
                            ].filter(Boolean).join(", ") || "None"}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={initializeCustomPermissions}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Customize Permissions
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-medium">Custom Permissions</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUseCustom(false)
                        if (selectedTemplate) setFormTemplate(selectedTemplate.id)
                      }}
                    >
                      Use Template
                    </Button>
                  </div>

                  <ScrollArea className="h-64 border rounded p-3">
                    <div className="space-y-3">
                      {formCustomPermissions.map((perm, idx) => (
                        <div key={idx} className="space-y-2 pb-3 border-b last:border-b-0 last:pb-0">
                          <p className="font-mono text-xs font-medium">{perm.resource}</p>
                          <div className="grid grid-cols-4 gap-2">
                            {(["can_create", "can_read", "can_update", "can_delete"] as const).map(op => (
                              <label key={op} className="flex items-center gap-2 text-xs cursor-pointer">
                                <Checkbox
                                  checked={perm[op]}
                                  onCheckedChange={() => togglePermission(idx, op)}
                                />
                                {op === "can_create" && "C"}
                                {op === "can_read" && "R"}
                                {op === "can_update" && "U"}
                                {op === "can_delete" && "D"}
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateToken}>
              <Plus className="h-4 w-4 mr-2" />
              Create Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
