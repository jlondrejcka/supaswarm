"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
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
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Tool, ToolType, Agent, SpawnContextVariable, Json, Skill } from "@/lib/supabase-types"
import { Plus, Wrench, Globe, Server, Database, Save, Zap, CheckCircle, XCircle, Loader2, Users, Trash2, Bot } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"

const toolTypeIcons: Record<ToolType, typeof Wrench> = {
  internal: Wrench,
  mcp_server: Server,
  http_api: Globe,
  supabase_rpc: Database,
  spawn: Users,
}

const toolTypeLabels: Record<ToolType, string> = {
  internal: "Internal",
  mcp_server: "MCP Server",
  http_api: "HTTP API",
  supabase_rpc: "Supabase RPC",
  spawn: "Sub-Agent",
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ToolType | "all">("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTool, setEditingTool] = useState<Tool | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    type: "mcp_server" as ToolType,
    config: "{}",
    execution_mode: "",
    requires_approval: false,
    rate_limit_per_min: "",
  })
  
  // MCP verification state
  const [mcpUrl, setMcpUrl] = useState("")
  const [mcpApiKey, setMcpApiKey] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    success: boolean
    tools?: Array<{ name: string; description: string }>
    error?: string
    latency_ms?: number
    server_info?: Record<string, unknown>
  } | null>(null)
  
  // Sub-Agent (spawn) configuration state
  const [agents, setAgents] = useState<Agent[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [toolAgents, setToolAgents] = useState<Record<string, string[]>>({})
  const [targetAgentId, setTargetAgentId] = useState("")
  const [spawnSkillId, setSpawnSkillId] = useState("")
  const [spawnInstructions, setSpawnInstructions] = useState("")
  const [contextVariables, setContextVariables] = useState<SpawnContextVariable[]>([])

  useEffect(() => {
    fetchTools()
    fetchAgents()
    fetchSkills()
  }, [])

  async function fetchTools() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      const { data, error } = await supabase
        .from("tools")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setTools(data || [])
    } catch (error) {
      console.error("Failed to fetch tools:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAgents() {
    if (!supabase) return
    
    try {
      const [
        { data: agentsData },
        { data: agentToolsData }
      ] = await Promise.all([
        supabase.from("agents").select("*").eq("is_active", true).order("name"),
        supabase.from("agent_tools").select("*")
      ])

      setAgents(agentsData || [])
      
      // Map tool_id -> array of agent_ids
      const toolsMap: Record<string, string[]> = {}
      agentToolsData?.forEach((at: { agent_id: string; tool_id: string }) => {
        if (!toolsMap[at.tool_id]) toolsMap[at.tool_id] = []
        toolsMap[at.tool_id].push(at.agent_id)
      })
      setToolAgents(toolsMap)
    } catch (error) {
      console.error("Failed to fetch agents:", error)
    }
  }

  async function fetchSkills() {
    if (!supabase) return
    try {
      const { data } = await supabase.from("skills").select("*").eq("is_active", true).order("name")
      setSkills(data || [])
    } catch (error) {
      console.error("Failed to fetch skills:", error)
    }
  }

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  function openCreateDialog() {
    setEditingTool(null)
    setFormData({
      name: "",
      slug: "",
      description: "",
      type: "mcp_server",
      config: "{}",
      execution_mode: "",
      requires_approval: false,
      rate_limit_per_min: "",
    })
    setMcpUrl("")
    setMcpApiKey("")
    setVerifyResult(null)
    // Reset spawn state
    setTargetAgentId("")
    setSpawnSkillId("")
    setSpawnInstructions("")
    setContextVariables([])
    setDialogOpen(true)
  }

  function openEditDialog(tool: Tool) {
    setEditingTool(tool)
    setFormData({
      name: tool.name,
      slug: tool.slug,
      description: tool.description || "",
      type: tool.type as ToolType,
      config: JSON.stringify(tool.config, null, 2),
      execution_mode: tool.execution_mode || "",
      requires_approval: tool.requires_approval || false,
      rate_limit_per_min: tool.rate_limit_per_min?.toString() || "",
    })
    // Extract MCP URL from config if it exists
    const config = tool.config as Record<string, unknown>
    setMcpUrl((config?.mcp_url as string) || "")
    setMcpApiKey("")
    setVerifyResult(null)
    // Extract spawn/handoff config if it exists
    if (tool.type === "spawn" || tool.type === "handoff") {
      setTargetAgentId((config?.target_agent_id as string) || "")
      setSpawnSkillId((config?.skill_id as string) || "")
      setSpawnInstructions((config?.instructions as string) || (config?.handoff_instructions as string) || "")
      setContextVariables((config?.context_variables as SpawnContextVariable[]) || [])
    } else {
      setTargetAgentId("")
      setSpawnSkillId("")
      setSpawnInstructions("")
      setContextVariables([])
    }
    setDialogOpen(true)
  }

  async function handleVerifyMcp() {
    if (!mcpUrl) return
    
    setVerifying(true)
    setVerifyResult(null)
    
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/verify-mcp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mcp_url: mcpUrl,
            api_key: mcpApiKey || undefined,
            tool_id: editingTool?.id,
          }),
        }
      )
      
      const result = await response.json()
      setVerifyResult(result)
      
      // Auto-update config if successful
      if (result.success && result.tools) {
        const newConfig = {
          mcp_url: mcpUrl,
          tools: result.tools,
          server_info: result.server_info,
          last_verified: new Date().toISOString(),
        }
        setFormData(prev => ({
          ...prev,
          config: JSON.stringify(newConfig, null, 2),
        }))
      }
    } catch (error) {
      setVerifyResult({
        success: false,
        error: error instanceof Error ? error.message : "Verification failed",
      })
    } finally {
      setVerifying(false)
    }
  }

  async function handleSave() {
    if (!supabase) return

    setSaving(true)
    try {
      let configJson: Record<string, unknown> = {}
      
      // Build config based on tool type
      if (formData.type === "spawn") {
        const targetAgent = agents.find(a => a.id === targetAgentId)
        configJson = {
          target_agent_id: targetAgentId,
          target_agent_slug: targetAgent?.slug || "",
          skill_id: spawnSkillId || undefined,
          instructions: spawnInstructions || undefined,
          context_variables: contextVariables,
        }
      } else {
        try {
          configJson = JSON.parse(formData.config)
        } catch {
          configJson = {}
        }
      }

      const payload = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        description: formData.description || null,
        type: formData.type,
        config: configJson as Json,
        is_active: true,
        execution_mode: formData.execution_mode || null,
        requires_approval: formData.requires_approval || false,
        rate_limit_per_min: formData.rate_limit_per_min ? parseInt(formData.rate_limit_per_min, 10) : null,
      }

      if (editingTool) {
        const { error } = await supabase
          .from("tools")
          .update(payload)
          .eq("id", editingTool.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("tools")
          .insert(payload)
        if (error) throw error
      }

      await fetchTools()
      setDialogOpen(false)
    } catch (error) {
      console.error("Failed to save tool:", error)
    } finally {
      setSaving(false)
    }
  }

  function addContextVariable() {
    setContextVariables([
      ...contextVariables,
      { name: "", type: "string", required: false, description: "" }
    ])
  }

  function updateContextVariable(index: number, field: keyof SpawnContextVariable, value: unknown) {
    const updated = [...contextVariables]
    updated[index] = { ...updated[index], [field]: value }
    setContextVariables(updated)
  }

  function removeContextVariable(index: number) {
    setContextVariables(contextVariables.filter((_, i) => i !== index))
  }

  async function toggleToolActive(toolId: string, currentActive: boolean) {
    if (!supabase) return
    
    // If trying to deactivate, check if used by active agents
    if (currentActive) {
      const activeAgentIds = toolAgents[toolId] || []
      const activeAgentsUsingTool = agents.filter(a => activeAgentIds.includes(a.id) && a.is_active)
      
      if (activeAgentsUsingTool.length > 0) {
        const agentNames = activeAgentsUsingTool.map(a => a.name).join(", ")
        alert(`Cannot deactivate: tool is used by active agent(s): ${agentNames}`)
        return
      }
    }
    
    try {
      await supabase
        .from("tools")
        .update({ is_active: !currentActive })
        .eq("id", toolId)
      await fetchTools()
    } catch (error) {
      console.error("Failed to toggle tool status:", error)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const filteredTools = filter === "all" 
    ? tools 
    : tools.filter(t => t.type === filter)

  const typeCounts = tools.reduce((acc, tool) => {
    acc[tool.type as ToolType] = (acc[tool.type as ToolType] || 0) + 1
    return acc
  }, {} as Record<ToolType, number>)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Tools</h1>
          <p className="text-muted-foreground">Manage MCP servers, HTTP APIs, and integrations</p>
        </div>
        <Button size="sm" onClick={openCreateDialog} data-testid="button-create-tool">
          <Plus className="h-4 w-4" />
          Add Tool
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          data-testid="button-filter-all"
        >
          All ({tools.length})
        </Button>
        {(["mcp_server", "http_api", "supabase_rpc", "internal", "spawn"] as ToolType[]).map((type) => (
          <Button
            key={type}
            variant={filter === type ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(type)}
            data-testid={`button-filter-${type}`}
          >
            {toolTypeLabels[type]} ({typeCounts[type] || 0})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTools.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {tools.length === 0 ? "No tools configured yet" : "No tools match the selected filter"}
            </p>
            {tools.length === 0 && (
              <Button className="mt-4" onClick={openCreateDialog} data-testid="button-create-first-tool">
                <Plus className="h-4 w-4" />
                Add Your First Tool
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTools.map((tool) => {
            const Icon = toolTypeIcons[tool.type as ToolType] || Wrench
            return (
              <Card key={tool.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => openEditDialog(tool)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base" data-testid={`text-tool-name-${tool.id}`}>
                        {tool.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={tool.is_active ?? false}
                        onCheckedChange={() => toggleToolActive(tool.id, tool.is_active ?? false)}
                        data-testid={`switch-tool-active-${tool.id}`}
                      />
                      <span className={`text-xs ${tool.is_active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {tool.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {tool.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">
                      {toolTypeLabels[tool.type as ToolType] || tool.type}
                    </Badge>
                    {tool.execution_mode && tool.execution_mode !== tool.type && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          tool.execution_mode === "internal" 
                            ? "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30"
                            : tool.execution_mode === "edge_function"
                            ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                            : tool.execution_mode === "mcp_server"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                            : tool.execution_mode === "http_api"
                            ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                            : ""
                        }`}
                      >
                        {tool.execution_mode === "edge_function" ? "Edge Fn" : tool.execution_mode}
                      </Badge>
                    )}
                    {tool.requires_approval && (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        Approval Required
                      </Badge>
                    )}
                    {tool.created_by && (
                      <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                        Agent Created
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">{tool.slug}</span>
                    {tool.type === "mcp_server" && (tool.config as Record<string, unknown>)?.tools && Array.isArray((tool.config as Record<string, unknown>).tools) ? (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {((tool.config as Record<string, unknown>).tools as unknown[]).length} MCP tools
                      </Badge>
                    ) : null}
                    {(tool.type === "spawn" || tool.type === "handoff") && (tool.config as Record<string, unknown>)?.target_agent_slug ? (
                      <Badge variant="secondary" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        → {(tool.config as Record<string, unknown>).target_agent_slug as string}
                      </Badge>
                    ) : null}
                  </div>
                  {tool.rate_limit_per_min && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Rate: {tool.rate_limit_per_min}/min
                    </div>
                  )}
                  {tool.type === "mcp_server" && (tool.config as Record<string, unknown>)?.tools && Array.isArray((tool.config as Record<string, unknown>).tools) ? (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {((tool.config as Record<string, unknown>).tools as Array<{name: string; description?: string}>).map((mcpTool) => (
                        <Badge key={mcpTool.name} variant="outline" className="text-xs gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                          <Wrench className="h-2.5 w-2.5" />
                          {mcpTool.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {toolAgents[tool.id]?.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {toolAgents[tool.id].map((agentId) => {
                        const agent = agents.find(a => a.id === agentId)
                        return agent ? (
                          <Badge key={agentId} className="gap-1 bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30 hover:bg-violet-500/20">
                            <Bot className="h-3 w-3" />
                            {agent.name}
                          </Badge>
                        ) : null
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTool ? "Edit Tool" : "Add New Tool"}</DialogTitle>
            <DialogDescription>
              {editingTool ? "Update the tool configuration" : "Configure a new tool for agents to use"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      name: e.target.value,
                      slug: editingTool ? formData.slug : generateSlug(e.target.value)
                    })
                  }}
                  placeholder="My Tool"
                  data-testid="input-tool-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="my-tool"
                  data-testid="input-tool-slug"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tool Type *</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as ToolType })}>
                  <SelectTrigger data-testid="select-tool-type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mcp_server">MCP Server</SelectItem>
                    <SelectItem value="http_api">HTTP API</SelectItem>
                    <SelectItem value="supabase_rpc">Supabase RPC</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="spawn">Sub-Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="execution_mode">Execution Mode</Label>
                <Select 
                  value={formData.execution_mode} 
                  onValueChange={(v) => setFormData({ ...formData, execution_mode: v })}
                >
                  <SelectTrigger data-testid="select-execution-mode">
                    <SelectValue placeholder="Select execution mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="edge_function">Edge Function</SelectItem>
                    <SelectItem value="mcp_server">MCP Server</SelectItem>
                    <SelectItem value="http_api">HTTP API</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this tool do?"
                data-testid="input-tool-description"
              />
            </div>
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="requires_approval">Requires Approval</Label>
                <p className="text-xs text-muted-foreground">Tool execution requires user approval</p>
              </div>
              <Switch
                id="requires_approval"
                checked={formData.requires_approval}
                onCheckedChange={(checked) => setFormData({ ...formData, requires_approval: checked })}
                data-testid="switch-requires-approval"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate_limit_per_min">Rate Limit</Label>
              <Input
                id="rate_limit_per_min"
                type="number"
                value={formData.rate_limit_per_min}
                onChange={(e) => setFormData({ ...formData, rate_limit_per_min: e.target.value })}
                placeholder="Requests per minute"
                data-testid="input-rate-limit"
              />
            </div>
            {/* MCP Server specific fields */}
            {formData.type === "mcp_server" && (
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Server className="h-4 w-4" />
                  MCP Server Configuration
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="mcp_url">MCP Endpoint URL *</Label>
                  <Input
                    id="mcp_url"
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                    placeholder="https://your-mcp-server.com/mcp"
                    data-testid="input-mcp-url"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="mcp_api_key">API Key (optional)</Label>
                  <Input
                    id="mcp_api_key"
                    type="password"
                    value={mcpApiKey}
                    onChange={(e) => setMcpApiKey(e.target.value)}
                    placeholder="Bearer token for authentication"
                    data-testid="input-mcp-api-key"
                  />
                </div>
                
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleVerifyMcp}
                  disabled={!mcpUrl || verifying}
                  className="w-full"
                  data-testid="button-verify-mcp"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Verify & Discover Tools
                    </>
                  )}
                </Button>
                
                {/* Verification Result */}
                {verifyResult && (
                  <div className={`p-3 rounded-md text-sm ${
                    verifyResult.success 
                      ? "bg-green-500/10 border border-green-500/20" 
                      : "bg-red-500/10 border border-red-500/20"
                  }`}>
                    <div className="flex items-center gap-2 font-medium mb-2">
                      {verifyResult.success ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-green-600 dark:text-green-400">Connected</span>
                          {verifyResult.latency_ms && (
                            <span className="text-muted-foreground font-normal">({verifyResult.latency_ms}ms)</span>
                          )}
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="text-red-600 dark:text-red-400">Failed</span>
                        </>
                      )}
                    </div>
                    
                    {verifyResult.success && verifyResult.tools && (
                      <div className="space-y-1">
                        <p className="text-muted-foreground">
                          Discovered {verifyResult.tools.length} tool(s):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {verifyResult.tools.map((t) => (
                            <Badge key={t.name} variant="outline" className="text-xs">
                              {t.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {verifyResult.error && (
                      <p className="text-red-600 dark:text-red-400">{verifyResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {/* Sub-Agent (spawn) specific fields */}
            {formData.type === "spawn" && (
              <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Sub-Agent Configuration
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="target_agent">Target Agent *</Label>
                  <Select value={targetAgentId} onValueChange={setTargetAgentId}>
                    <SelectTrigger data-testid="select-target-agent">
                      <SelectValue placeholder="Select sub-agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {agents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name} ({agent.slug})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="spawn_skill">Skill (optional)</Label>
                  <Select value={spawnSkillId} onValueChange={setSpawnSkillId}>
                    <SelectTrigger data-testid="select-spawn-skill">
                      <SelectValue placeholder="No skill — use agent defaults" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {skills.map((skill) => (
                        <SelectItem key={skill.id} value={skill.id}>
                          {skill.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Skill instructions are injected into the sub-agent&apos;s prompt
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="spawn_instructions">Instructions (fallback if no skill)</Label>
                  <textarea
                    id="spawn_instructions"
                    value={spawnInstructions}
                    onChange={(e) => setSpawnInstructions(e.target.value)}
                    placeholder="Additional instructions for the sub-agent..."
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    data-testid="input-spawn-instructions"
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Context Variables</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addContextVariable}
                      data-testid="button-add-context-var"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Variable
                    </Button>
                  </div>
                  
                  {contextVariables.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No context variables. Add variables the LLM must extract before delegating.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {contextVariables.map((variable, index) => (
                        <div key={index} className="p-3 rounded-md border bg-background space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Variable {index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeContextVariable(index)}
                              className="h-6 w-6 p-0"
                              data-testid={`button-remove-var-${index}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="Variable name"
                              value={variable.name}
                              onChange={(e) => updateContextVariable(index, "name", e.target.value)}
                              data-testid={`input-var-name-${index}`}
                            />
                            <Select
                              value={variable.type}
                              onValueChange={(v) => updateContextVariable(index, "type", v)}
                            >
                              <SelectTrigger data-testid={`select-var-type-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="string">String</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="boolean">Boolean</SelectItem>
                                <SelectItem value="object">Object</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <Input
                            placeholder="Description (shown to LLM)"
                            value={variable.description}
                            onChange={(e) => updateContextVariable(index, "description", e.target.value)}
                            data-testid={`input-var-description-${index}`}
                          />
                          
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`required-${index}`}
                              checked={variable.required}
                              onCheckedChange={(checked) => updateContextVariable(index, "required", !!checked)}
                              data-testid={`checkbox-var-required-${index}`}
                            />
                            <Label htmlFor={`required-${index}`} className="text-sm">Required</Label>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {formData.type !== "spawn" && (
            <div className="space-y-2">
              <Label htmlFor="config">
                {formData.type === "mcp_server" ? "Configuration (auto-populated)" : "Configuration (JSON)"}
              </Label>
              <textarea
                id="config"
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
                placeholder='{"endpoint": "https://..."}'
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-tool-config"
              />
            </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={saving || !formData.name || (formData.type === "spawn" && !targetAgentId)} 
              data-testid="button-save"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : editingTool ? "Update Tool" : "Add Tool"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
