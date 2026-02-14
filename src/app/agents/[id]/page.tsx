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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Agent, LLMProvider, ProviderModel, Tool, Skill } from "@/lib/supabase-types"
import { syncAgentSkillsAndTools } from "@/lib/skill-inheritance-helper"
import { ArrowLeft, Save, Bot, Zap, Wrench, Star } from "lucide-react"

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export default function AgentDetailPage() {
  const params = useParams()
  const agentId = params.id as string

  const [agent, setAgent] = useState<Agent | null>(null)
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [agentToolInherited, setAgentToolInherited] = useState<Record<string, string>>({})

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    system_prompt: "",
    model: "",
    provider_id: "",
    temperature: "0.7",
    max_tokens: "4096",
    is_default: false,
    role: "",
    memory_mode: "none",
    daily_token_budget: "",
  })

  useEffect(() => {
    if (agentId && agentId !== "new") fetchAgent()
  }, [agentId])

  async function fetchAgent() {
    if (!supabase || !agentId || agentId === "new") return

    setLoading(true)
    try {
      const { data: agentData, error } = await supabase
        .from("agents")
        .select("*")
        .eq("id", agentId)
        .single()

      if (error || !agentData) {
        setAgent(null)
        return
      }

      setAgent(agentData)
      setFormData({
        name: agentData.name,
        slug: agentData.slug,
        description: agentData.description || "",
        system_prompt: agentData.system_prompt || "",
        model: agentData.model || "",
        provider_id: agentData.provider_id || "",
        temperature: String(agentData.temperature ?? 0.7),
        max_tokens: String(agentData.max_tokens ?? 4096),
        is_default: agentData.is_default || false,
        role: agentData.role || "",
        memory_mode: agentData.memory_mode || "none",
        daily_token_budget: agentData.daily_token_budget != null ? String(agentData.daily_token_budget) : "",
      })

      const [
        { data: providersData },
        { data: modelsData },
        { data: toolsData },
        { data: skillsData },
        { data: agentToolsData },
        { data: agentSkillsData },
      ] = await Promise.all([
        supabase.from("llm_providers").select("*").eq("is_active", true),
        supabase.from("provider_models").select("*").eq("is_enabled", true).order("model_name"),
        supabase.from("tools").select("*").eq("is_active", true),
        supabase.from("skills").select("*").eq("is_active", true),
        supabase.from("agent_tools").select("tool_id, inherited_from_skill_id"),
        supabase.from("agent_skills").select("skill_id"),
      ])

      setProviders(providersData || [])
      setProviderModels(modelsData || [])
      setTools(toolsData || [])
      setSkills(skillsData || [])

      const toolIds = (agentToolsData || []).map((r: { tool_id: string }) => r.tool_id)
      const skillIds = (agentSkillsData || []).map((r: { skill_id: string }) => r.skill_id)
      const inheritedMap: Record<string, string> = {}
      agentToolsData?.forEach((r: { tool_id: string; inherited_from_skill_id?: string | null }) => {
        if (r.inherited_from_skill_id) inheritedMap[r.tool_id] = r.inherited_from_skill_id
      })

      setSelectedTools(toolIds)
      setSelectedSkills(skillIds)
      setAgentToolInherited(inheritedMap)
    } catch (error) {
      console.error("Failed to fetch agent:", error)
    } finally {
      setLoading(false)
    }
  }

  function toggleSkill(skillId: string) {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    )
  }

  function toggleTool(toolId: string) {
    if (agentToolInherited[toolId]) return
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    )
  }

  async function handleSave() {
    if (!supabase || !agentId || agentId === "new") return

    setSaving(true)
    try {
      const parsedTemp = parseFloat(formData.temperature)
      const parsedTokens = parseInt(formData.max_tokens)
      const parsedBudget = parseInt(formData.daily_token_budget)

      const payload = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        description: formData.description || null,
        system_prompt: formData.system_prompt,
        model: formData.model || null,
        provider_id: formData.provider_id || null,
        temperature: !isNaN(parsedTemp) ? parsedTemp : 0.7,
        max_tokens: !isNaN(parsedTokens) ? parsedTokens : 4096,
        is_active: true,
        is_default: formData.is_default,
        role: formData.role || null,
        memory_mode: formData.memory_mode || null,
        daily_token_budget: !isNaN(parsedBudget) ? parsedBudget : null,
      }

      const { error } = await supabase.from("agents").update(payload).eq("id", agentId)

      if (error) throw error

      const syncErr = await syncAgentSkillsAndTools(supabase, agentId, selectedSkills, selectedTools)
      if (syncErr.error) throw new Error(syncErr.error)

      await fetchAgent()
    } catch (error) {
      console.error("Failed to save:", error)
      alert(error instanceof Error ? error.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function setAsDefault(e: React.MouseEvent) {
    e.preventDefault()
    if (!supabase) return

    try {
      await supabase.from("agents").update({ is_default: false }).neq("id", agentId)
      await supabase.from("agents").update({ is_default: true }).eq("id", agentId)
      setFormData((prev) => ({ ...prev, is_default: true }))
      setAgent((prev) => (prev ? { ...prev, is_default: true } : null))
    } catch (error) {
      console.error("Failed to set default:", error)
    }
  }

  async function toggleActive() {
    if (!supabase || !agent) return

    if (agent.is_default) {
      alert("Cannot deactivate the default agent. Set another agent as default first.")
      return
    }

    try {
      const { data, error } = await supabase
        .from("agents")
        .update({ is_active: !agent.is_active })
        .eq("id", agentId)
        .select()
        .single()

      if (!error) setAgent(data)
    } catch (error) {
      console.error("Failed to toggle:", error)
    }
  }

  if (!isSupabaseConfigured) return <SetupRequired />

  if (loading && !agent) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="p-6">
        <Link href="/agents" className="text-sm text-muted-foreground hover:underline flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Agents
        </Link>
        <p className="mt-4 text-muted-foreground">Agent not found</p>
      </div>
    )
  }

  const filteredModels = providerModels
    .filter((m) => m.provider_id === formData.provider_id)
    .sort((a, b) => (b.is_latest ? 1 : 0) - (a.is_latest ? 1 : 0))

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <Link href="/agents" className="text-sm text-muted-foreground hover:underline flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Agents
        </Link>
        <div className="flex items-center gap-2">
          {agent.is_default && (
            <Badge className="gap-1">
              <Star className="h-3 w-3" />
              Default
            </Badge>
          )}
          {!agent.is_default && (
            <Button variant="outline" size="sm" onClick={setAsDefault}>
              <Star className="h-4 w-4" />
              Set Default
            </Button>
          )}
          <Switch checked={agent.is_active ?? false} onCheckedChange={toggleActive} />
          <span className="text-sm text-muted-foreground">
            {agent.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Edit Agent
          </CardTitle>
          <CardDescription>{agent.slug}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
                placeholder="My Agent"
              />
            </div>
            <div className="space-y-2">
              <Label>Slug *</Label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="my-agent"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this agent do?"
            />
          </div>

          <div className="space-y-2">
            <Label>System Prompt *</Label>
            <textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
              placeholder="You are a helpful AI assistant..."
              className="flex min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>LLM Provider</Label>
              <Select
                value={formData.provider_id}
                onValueChange={(v) => {
                  const newModels = providerModels.filter((m) => m.provider_id === v)
                  const modelAvailable = newModels.some((m) => m.model_name === formData.model)
                  const defaultModel = providers.find((p) => p.id === v)?.default_model || ""
                  setFormData({
                    ...formData,
                    provider_id: v,
                    model: modelAvailable ? formData.model : defaultModel,
                  })
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Select
                value={formData.model}
                onValueChange={(v) => setFormData({ ...formData, model: v })}
                disabled={!formData.provider_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={formData.provider_id ? "Select model" : "Select provider first"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredModels.map((m) => (
                    <SelectItem key={m.id} value={m.model_name}>
                      <div className="flex items-center gap-2">
                        <span>{m.display_name || m.model_name}</span>
                        {m.is_latest && (
                          <span className="text-[10px] px-1 py-0 rounded bg-green-500/10 text-green-600">
                            Latest
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.model && (() => {
                const m = providerModels.find((pm) => pm.model_name === formData.model)
                return m ? (
                  <p className="text-xs text-muted-foreground">
                    {m.context_window && `${(m.context_window / 1000).toLocaleString()}K context`}
                    {m.input_price_per_million != null &&
                      ` • $${m.input_price_per_million}/$${m.output_price_per_million} per M tokens`}
                  </p>
                ) : null
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperature</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                value={formData.max_tokens}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_tokens: e.target.value.replace(/[^0-9]/g, ""),
                  })
                }
                placeholder="4096"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border">
            <div>
              <Label className="text-sm font-medium">Default Agent</Label>
              <p className="text-xs text-muted-foreground">Use for new tasks by default</p>
            </div>
            <Switch
              checked={formData.is_default}
              onCheckedChange={(c) => setFormData({ ...formData, is_default: c })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="worker">Worker</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="specialist">Specialist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Memory Mode</Label>
              <Select
                value={formData.memory_mode}
                onValueChange={(v) => setFormData({ ...formData, memory_mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="session">Session</SelectItem>
                  <SelectItem value="persistent">Persistent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Daily Token Budget</Label>
            <Input
              type="number"
              value={formData.daily_token_budget}
              onChange={(e) => setFormData({ ...formData, daily_token_budget: e.target.value })}
              placeholder="e.g. 100000"
            />
          </div>

          <Accordion type="multiple" className="w-full">
            <AccordionItem value="skills">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Skills ({selectedSkills.length} selected)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No skills available.</p>
                ) : (
                  <div className="space-y-2">
                    {skills.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedSkills.includes(s.id)}
                          onCheckedChange={() => toggleSkill(s.id)}
                        />
                        <label className="text-sm cursor-pointer flex-1">
                          {s.name}
                          {s.description && (
                            <span className="text-muted-foreground ml-1">- {s.description}</span>
                          )}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tools">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-blue-500" />
                  Tools ({selectedTools.length} selected)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {tools.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tools available.</p>
                ) : (
                  <div className="space-y-2">
                    {tools.map((t) => {
                      const isInherited = agentToolInherited[t.id]
                      const skillName = isInherited && skills.find((s) => s.id === isInherited)?.name
                      return (
                        <div key={t.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedTools.includes(t.id)}
                            onCheckedChange={() => !isInherited && toggleTool(t.id)}
                            disabled={!!isInherited}
                          />
                          <label
                            className={`text-sm flex-1 ${isInherited ? "cursor-not-allowed opacity-90" : "cursor-pointer"}`}
                          >
                            {t.name}
                            {t.description && (
                              <span className="text-muted-foreground ml-1">- {t.description}</span>
                            )}
                            {isInherited && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                from {skillName || "skill"}
                              </Badge>
                            )}
                          </label>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button
            onClick={handleSave}
            disabled={saving || !formData.name || !formData.system_prompt}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
