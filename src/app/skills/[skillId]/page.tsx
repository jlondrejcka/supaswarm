"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Skill, Tool, Agent } from "@/lib/supabase-types"
import { ArrowLeft, Save, Zap, Wrench, Bot, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

function generateSkillId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

export default function SkillDetailPage() {
  const params = useParams()
  const router = useRouter()
  const skillId = params.skillId as string

  const [skill, setSkill] = useState<Skill | null>(null)
  const [linkedTools, setLinkedTools] = useState<Tool[]>([])
  const [allTools, setAllTools] = useState<Tool[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [skillAgents, setSkillAgents] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    skill_id: "",
    description: "",
    instructions: "",
    version: "1.0.0",
    metadata: "{}",
  })
  const [toolSearch, setToolSearch] = useState("")

  useEffect(() => {
    if (skillId && skillId !== "new") fetchSkill()
    fetchTools()
  }, [skillId])

  async function fetchSkill() {
    if (!skillId || skillId === "new") return

    setLoading(true)
    try {
      const res = await fetch(`/api/skills/${skillId}`)
      const data = await res.json()

      if (!res.ok) {
        setSkill(null)
        return
      }

      setSkill(data.skill)
      setFormData({
        name: data.skill.name,
        skill_id: data.skill.skill_id,
        description: data.skill.description,
        instructions: data.skill.instructions || "",
        version: data.skill.version || "1.0.0",
        metadata: JSON.stringify(data.skill.metadata || {}, null, 2),
      })

      const toolsRes = await fetch(`/api/skills/${skillId}/tools`)
      const toolsData = await toolsRes.json()
      setLinkedTools(toolsData.tools || [])

      if (!supabase) return
      const [
        { data: agentsData },
        { data: agentSkillsData },
      ] = await Promise.all([
        supabase.from("agents").select("*"),
        supabase.from("agent_skills").select("*"),
      ])

      setAgents(agentsData || [])
      const skillsMap: Record<string, string[]> = {}
      agentSkillsData?.forEach((as: { agent_id: string; skill_id: string }) => {
        if (!skillsMap[as.skill_id]) skillsMap[as.skill_id] = []
        skillsMap[as.skill_id].push(as.agent_id)
      })
      setSkillAgents(skillsMap)
    } catch (error) {
      console.error("Failed to fetch skill:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTools() {
    try {
      const res = await fetch("/api/tools")
      const data = await res.json()
      setAllTools(data.tools || [])
    } catch (error) {
      console.error("Failed to fetch tools:", error)
    }
  }

  async function handleSave() {
    if (!skillId || skillId === "new") return

    setSaving(true)
    try {
      let metadata: Record<string, unknown> = {}
      try {
        metadata = JSON.parse(formData.metadata)
      } catch {
        metadata = {}
      }

      const res = await fetch(`/api/skills/${skillId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          skill_id: formData.skill_id || generateSkillId(formData.name),
          description: formData.description,
          instructions: formData.instructions || null,
          version: formData.version || "1.0.0",
          metadata,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to save")
      }

      const data = await res.json()
      setSkill(data.skill)
    } catch (error) {
      console.error("Failed to save:", error)
      alert(error instanceof Error ? error.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function addTool(toolId: string) {
    if (!skillId || skillId === "new") return

    try {
      const res = await fetch(`/api/skills/${skillId}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool_id: toolId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to add tool")
      }

      const tool = allTools.find((t) => t.id === toolId)
      if (tool) setLinkedTools((prev) => [...prev.filter((t) => t.id !== toolId), tool])
    } catch (error) {
      console.error("Failed to add tool:", error)
      alert(error instanceof Error ? error.message : "Failed to add tool")
    }
  }

  async function removeTool(toolId: string) {
    if (!skillId || skillId === "new") return

    try {
      const res = await fetch(`/api/skills/${skillId}/tools?tool_id=${toolId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to remove tool")
      }

      setLinkedTools((prev) => prev.filter((t) => t.id !== toolId))
    } catch (error) {
      console.error("Failed to remove tool:", error)
      alert(error instanceof Error ? error.message : "Failed to remove tool")
    }
  }

  async function toggleActive() {
    if (!supabase || !skill) return

    const activeAgentIds = skillAgents[skill.id] || []
    const activeAgents = agents.filter((a) => activeAgentIds.includes(a.id) && a.is_active)

    if (skill.is_active && activeAgents.length > 0) {
      alert(`Cannot deactivate: used by active agent(s): ${activeAgents.map((a) => a.name).join(", ")}`)
      return
    }

    try {
      await supabase
        .from("skills")
        .update({ is_active: !skill.is_active })
        .eq("id", skill.id)

      setSkill((prev) => (prev ? { ...prev, is_active: !prev.is_active } : null))
    } catch (error) {
      console.error("Failed to toggle:", error)
    }
  }

  if (!isSupabaseConfigured) return <SetupRequired />

  const availableToAdd = allTools.filter(
    (t) =>
      !linkedTools.some((lt) => lt.id === t.id) &&
      (t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
        t.slug.toLowerCase().includes(toolSearch.toLowerCase()))
  )

  if (loading && !skill) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!skill) {
    return (
      <div className="p-6">
        <Link href="/skills" className="text-sm text-muted-foreground hover:underline flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Skills
        </Link>
        <p className="mt-4 text-muted-foreground">Skill not found</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <Link href="/skills" className="text-sm text-muted-foreground hover:underline flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Skills
        </Link>
        <div className="flex items-center gap-2">
          <Switch
            checked={skill.is_active ?? false}
            onCheckedChange={toggleActive}
          />
          <span className="text-sm text-muted-foreground">
            {skill.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            Edit Skill
          </CardTitle>
          <CardDescription>{skill.skill_id}</CardDescription>
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
                    skill_id: formData.skill_id || generateSkillId(e.target.value),
                  })
                }
                placeholder="Skill name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill_id">Skill ID *</Label>
              <Input
                id="skill_id"
                value={formData.skill_id}
                onChange={(e) => setFormData({ ...formData, skill_id: e.target.value })}
                placeholder="skill_id"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this skill enable?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <textarea
              id="instructions"
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="Detailed instructions for using this skill..."
              className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="1.0.0"
              />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving || !formData.name || !formData.description}>
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Linked Tools
          </CardTitle>
          <CardDescription>Tools that this skill uses. Agents inheriting this skill get these tools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Select onValueChange={(v) => v && addTool(v)}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Add tool..." />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.slice(0, 20).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.type})
                  </SelectItem>
                ))}
                {availableToAdd.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No tools to add
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Input
              placeholder="Search tools..."
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              className="w-48"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {linkedTools.map((t) => (
              <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
                {t.name}
                <span className="text-muted-foreground text-xs">({t.type})</span>
                <button
                  type="button"
                  onClick={() => removeTool(t.id)}
                  className="ml-1 rounded hover:bg-muted p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {linkedTools.length === 0 && (
              <p className="text-sm text-muted-foreground">No tools linked</p>
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
          <CardDescription>Agents that have this skill assigned</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(skillAgents[skill.id] || []).map((agentId) => {
              const agent = agents.find((a) => a.id === agentId)
              return agent ? (
                <Badge key={agentId} variant="outline">
                  {agent.name}
                </Badge>
              ) : null
            })}
            {(skillAgents[skill.id]?.length || 0) === 0 && (
              <p className="text-sm text-muted-foreground">No agents use this skill</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metadata</CardTitle>
          <CardDescription>JSON metadata (advanced)</CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={formData.metadata}
            onChange={(e) => setFormData({ ...formData, metadata: e.target.value })}
            className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
          />
        </CardContent>
      </Card>
    </div>
  )
}
