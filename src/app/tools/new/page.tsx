"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import type { ToolType, Agent, Skill, SpawnContextVariable } from "@/lib/supabase-types"
import { ArrowLeft, Save, Wrench, Users, Plus, Trash2 } from "lucide-react"

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export default function NewToolPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
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
  const [targetAgentId, setTargetAgentId] = useState("")
  const [spawnSkillId, setSpawnSkillId] = useState("")
  const [spawnInstructions, setSpawnInstructions] = useState("")
  const [contextVariables, setContextVariables] = useState<SpawnContextVariable[]>([])

  useEffect(() => {
    if (supabase) {
      supabase.from("agents").select("*").eq("is_active", true).then(({ data }) => setAgents(data || []))
      supabase.from("skills").select("*").eq("is_active", true).then(({ data }) => setSkills(data || []))
    }
  }, [])

  function addContextVariable() {
    setContextVariables([
      ...contextVariables,
      { name: "", type: "string", required: false, description: "" },
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

  async function handleSave() {
    setSaving(true)
    try {
      let config: Record<string, unknown> = {}

      if (formData.type === "spawn") {
        const targetAgent = agents.find((a) => a.id === targetAgentId)
        config = {
          target_agent_id: targetAgentId,
          target_agent_slug: targetAgent?.slug || "",
          skill_id: spawnSkillId || undefined,
          instructions: spawnInstructions || undefined,
          context_variables: contextVariables,
        }
      } else {
        try {
          config = JSON.parse(formData.config)
        } catch {
          config = {}
        }
      }

      const res = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug || generateSlug(formData.name),
          description: formData.description || null,
          type: formData.type,
          config,
          execution_mode: formData.execution_mode || null,
          requires_approval: formData.requires_approval,
          rate_limit_per_min: formData.rate_limit_per_min
            ? parseInt(formData.rate_limit_per_min, 10)
            : null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create")
      }

      const data = await res.json()
      router.replace(`/tools/${data.tool.id}`)
    } catch (error) {
      console.error("Failed to create tool:", error)
      alert(error instanceof Error ? error.message : "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) return <SetupRequired />

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <Link
        href="/tools"
        className="text-sm text-muted-foreground hover:underline flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tools
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary" />
            New Tool
          </CardTitle>
          <CardDescription>Configure a new tool for agents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
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
              <Label>Slug *</Label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="my-tool"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tool Type *</Label>
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
              <Label>Execution Mode</Label>
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
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this tool do?"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label>Requires Approval</Label>
            <Switch
              checked={formData.requires_approval}
              onCheckedChange={(c) => setFormData({ ...formData, requires_approval: c })}
            />
          </div>

          <div className="space-y-2">
            <Label>Rate Limit (per min)</Label>
            <Input
              type="number"
              value={formData.rate_limit_per_min}
              onChange={(e) => setFormData({ ...formData, rate_limit_per_min: e.target.value })}
              placeholder="Optional"
            />
          </div>

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
                  onChange={(e) => setSpawnInstructions(e.target.value)}
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
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
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
            {saving ? "Creating..." : "Create Tool"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
