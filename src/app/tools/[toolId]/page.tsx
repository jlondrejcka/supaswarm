"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Tool, ToolType, Agent, Skill, SpawnContextVariable } from "@/lib/supabase-types"
import { ArrowLeft, Save, Wrench, Zap, Server, Users, CheckCircle, XCircle, Loader2, Plus, Trash2, Bot } from "lucide-react"

const toolTypeLabels: Record<ToolType, string> = {
  internal: "Internal",
  mcp_server: "MCP Server",
  http_api: "HTTP API",
  supabase_rpc: "Supabase RPC",
  spawn: "Sub-Agent",
}

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export default function ToolDetailPage() {
  const params = useParams()
  const toolId = params.toolId as string

  const [tool, setTool] = useState<Tool | null>(null)
  const [linkedSkills, setLinkedSkills] = useState<Skill[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [toolAgentIds, setToolAgentIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
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
  const [mcpUrl, setMcpUrl] = useState("")
  const [mcpApiKey, setMcpApiKey] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    success: boolean
    tools?: Array<{ name: string; description?: string }>
    error?: string
    latency_ms?: number
  } | null>(null)
  const [targetAgentId, setTargetAgentId] = useState("")
  const [spawnSkillId, setSpawnSkillId] = useState("")
  const [spawnInstructions, setSawnInstructions] = useState("")
  const [contextVariables, setContextVariables] = useState<SpawnContextVariable[]>([])

  useEffect(() => {
    if (toolId && toolId !== "new") fetchTool()
    fetchAgentsAndSkills()
  }, [toolId])

  async function fetchTool() {
    if (!toolId || toolId === "new") return

    setLoading(true)
    try {
      const res = await fetch(`/api/tools/${toolId}`)
      const data = await res.json()

      if (!res.ok) {
        setTool(null)
        return
      }

      const t = data.tool
      setTool(t)
      setFormData({
        name: t.name,
        slug: t.slug,
        description: t.description || "",
        type: t.type as ToolType,
        config: JSON.stringify(t.config || {}, null, 2),
        execution_mode: t.execution_mode || "",
        requires_approval: t.requires_approval || false,
        rate_limit_per_min: t.rate_limit_per_min?.toString() || "",
      })

      const config = t.config as Record<string, unknown>
      setMcpUrl((config?.mcp_url as string) || "")
      setMcpApiKey("")
      setVerifyResult(null)

      if (t.type === "spawn") {
        setTargetAgentId((config?.target_agent_id as string) || "")
        setSpawnSkillId((config?.skill_id as string) || "")
        setSawnInstructions((config?.instructions as string) || "")
        setContextVariables((config?.context_variables as SpawnContextVariable[]) || [])
      }

      const skillsRes = await fetch(`/api/tools/${toolId}/skills`)
      const skillsData = await skillsRes.json()
      setLinkedSkills(skillsData.skills || [])

      if (supabase) {
        const { data: at } = await supabase
          .from("agent_tools")
          .select("agent_id")
          .eq("tool_id", toolId)
        setToolAgentIds((at || []).map((r: { agent_id: string }) => r.agent_id))
      }
    } catch (error) {
      console.error("Failed to fetch tool:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAgentsAndSkills() {
    if (!supabase) return
    try {
      const [{ data: agentsData }, { data: skillsData }] = await Promise.all([
        supabase.from("agents").select("*").eq("is_active", true).order("name"),
        supabase.from("skills").select("*").eq("is_active", true),
      ])
      setAgents(agentsData || [])
      setSkills(skillsData || [])
    } catch (error) {
      console.error("Failed to fetch:", error)
    }
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mcp_url: mcpUrl, api_key: mcpApiKey || undefined, tool_id: tool?.id }),
        }
      )
      const result = await response.json()
      setVerifyResult(result)

      if (result.success && result.tools) {
        const newConfig = {
          mcp_url: mcpUrl,
          tools: result.tools,
          server_info: result.server_info,
          last_verified: new Date().toISOString(),
        }
        setFormData((prev) => ({ ...prev, config: JSON.stringify(newConfig, null, 2) }))
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
    if (!toolId || toolId === "new") return

    setSaving(true)
    try {
      let configJson: Record<string, unknown> = {}

      if (formData.type === "spawn") {
        const targetAgent = agents.find((a) => a.id === targetAgentId)
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

      const res = await fetch(`/api/tools/${toolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug || generateSlug(formData.name),
          description: formData.description || null,
          type: formData.type,
          config: configJson,
          execution_mode: formData.execution_mode || null,
          requires_approval: formData.requires_approval,
          rate_limit_per_min: formData.rate_limit_per_min
            ? parseInt(formData.rate_limit_per_min, 10)
            : null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to save")
      }

      const data = await res.json()
      setTool(data.tool)
    } catch (error) {
      console.error("Failed to save:", error)
      alert(error instanceof Error ? error.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!supabase || !tool) return

    const activeAgents = agents.filter((a) => toolAgentIds.includes(a.id) && a.is_active)

    if (tool.is_active && activeAgents.length > 0) {
      alert(
        `Cannot deactivate: used by active agent(s): ${activeAgents.map((a) => a.name).join(", ")}`
      )
      return
    }

    try {
      const res = await fetch(`/api/tools/${toolId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !tool.is_active }),
      })
      if (res.ok) {
        const data = await res.json()
        setTool(data.tool)
      }
    } catch (error) {
      console.error("Failed to toggle:", error)
    }
  }

  function addContextVariable() {
    setContextVariables([
      ...contextVariables,
      { name: "", type: "string", required: false, description: "" },
    ])
  }

  function updateContextVariable(
    index: number,
    field: keyof SpawnContextVariable,
    value: unknown
  ) {
    const updated = [...contextVariables]
    updated[index] = { ...updated[index], [field]: value }
    setContextVariables(updated)
  }

  function removeContextVariable(index: number) {
    setContextVariables(contextVariables.filter((_, i) => i !== index))
  }

  if (!isSupabaseConfigured) return <SetupRequired />

  if (loading && !tool) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!tool && toolId !== "new") {
    return (
      <div className="p-6">
        <Link
          href="/tools"
          className="text-sm text-muted-foreground hover:underline flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tools
        </Link>
        <p className="mt-4 text-muted-foreground">Tool not found</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/tools"
          className="text-sm text-muted-foreground hover:underline flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tools
        </Link>
        {tool && (
          <div className="flex items-center gap-2">
            <Switch checked={tool.is_active ?? false} onCheckedChange={toggleActive} />
            <span className="text-sm text-muted-foreground">
              {tool.is_active ? "Active" : "Inactive"}
            </span>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            Edit Tool
          </CardTitle>
          <CardDescription>{tool?.slug}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: e.target.value,
                    slug: formData.slug || generateSlug(e.target.value),
                  })
                }
                placeholder="My Tool"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="my-tool"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tool Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ ...formData, type: v as ToolType })}
              >
                <SelectTrigger>
                  <SelectValue />
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
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
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
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Requires Approval</Label>
              <p className="text-xs text-muted-foreground">Tool execution requires user approval</p>
            </div>
            <Switch
              checked={formData.requires_approval}
              onCheckedChange={(c) => setFormData({ ...formData, requires_approval: c })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rate_limit">Rate Limit (per min)</Label>
            <Input
              id="rate_limit"
              type="number"
              value={formData.rate_limit_per_min}
              onChange={(e) => setFormData({ ...formData, rate_limit_per_min: e.target.value })}
              placeholder="Optional"
            />
          </div>

          {formData.type === "mcp_server" && (
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 font-medium">
                <Server className="h-4 w-4" />
                MCP Server Configuration
              </div>
              <div className="space-y-2">
                <Label>MCP Endpoint URL *</Label>
                <Input
                  value={mcpUrl}
                  onChange={(e) => setMcpUrl(e.target.value)}
                  placeholder="https://your-mcp-server.com/mcp"
                />
              </div>
              <div className="space-y-2">
                <Label>API Key (optional)</Label>
                <Input
                  type="password"
                  value={mcpApiKey}
                  onChange={(e) => setMcpApiKey(e.target.value)}
                  placeholder="Bearer token"
                />
              </div>
              <Button onClick={handleVerifyMcp} disabled={!mcpUrl || verifying}>
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {verifying ? " Verifying..." : " Verify & Discover Tools"}
              </Button>
              {verifyResult && (
                <div
                  className={`p-3 rounded-md text-sm ${
                    verifyResult.success
                      ? "bg-green-500/10 border border-green-500/20"
                      : "bg-red-500/10 border border-red-500/20"
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {verifyResult.success ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        Connected {verifyResult.latency_ms && `(${verifyResult.latency_ms}ms)`}
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-500" />
                        Failed
                      </>
                    )}
                  </div>
                  {verifyResult.error && (
                    <p className="text-red-600 dark:text-red-400 mt-1">{verifyResult.error}</p>
                  )}
                  {verifyResult.tools && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {verifyResult.tools.map((t) => (
                        <Badge key={t.name} variant="outline" className="text-xs">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {formData.type === "spawn" && (
            <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-2 font-medium">
                <Users className="h-4 w-4" />
                Sub-Agent Configuration
              </div>
              <div className="space-y-2">
                <Label>Target Agent *</Label>
                <Select value={targetAgentId} onValueChange={setTargetAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select sub-agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({a.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Skill (optional)</Label>
                <Select value={spawnSkillId} onValueChange={setSpawnSkillId}>
                  <SelectTrigger>
                    <SelectValue placeholder="No skill" />
                  </SelectTrigger>
                  <SelectContent>
                    {skills.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Instructions</Label>
                <textarea
                  value={spawnInstructions}
                  onChange={(e) => setSawnInstructions(e.target.value)}
                  placeholder="Additional instructions..."
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Context Variables</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addContextVariable}>
                    <Plus className="h-3 w-3" />
                    Add
                  </Button>
                </div>
                {contextVariables.map((v, i) => (
                  <div key={i} className="p-3 rounded border space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Variable {i + 1}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeContextVariable(i)}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder="Name"
                        value={v.name}
                        onChange={(e) => updateContextVariable(i, "name", e.target.value)}
                      />
                      <Select
                        value={v.type}
                        onValueChange={(x) => updateContextVariable(i, "type", x)}
                      >
                        <SelectTrigger>
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
                      placeholder="Description"
                      value={v.description}
                      onChange={(e) => updateContextVariable(i, "description", e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={v.required}
                        onCheckedChange={(c) => updateContextVariable(i, "required", !!c)}
                      />
                      <Label className="text-sm">Required</Label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formData.type !== "spawn" && (
            <div className="space-y-2">
              <Label>Configuration (JSON)</Label>
              <textarea
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
              />
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !formData.name ||
              (formData.type === "spawn" && !targetAgentId)
            }
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Linked Skills
          </CardTitle>
          <CardDescription>Skills that use this tool</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {linkedSkills.map((s) => (
              <Badge key={s.id} variant="outline">
                {s.name}
              </Badge>
            ))}
            {linkedSkills.length === 0 && (
              <p className="text-sm text-muted-foreground">No skills link to this tool</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Associated Agents
          </CardTitle>
          <CardDescription>Agents that have this tool assigned</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {toolAgentIds.map((agentId) => {
              const agent = agents.find((a) => a.id === agentId)
              return agent ? (
                <Badge key={agentId} variant="outline">
                  {agent.name}
                </Badge>
              ) : null
            })}
            {toolAgentIds.length === 0 && (
              <p className="text-sm text-muted-foreground">No agents use this tool</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
