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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import { syncAgentSkillsAndTools } from "@/lib/skill-inheritance-helper"
import type { LLMProvider, ProviderModel, Tool, Skill } from "@/lib/supabase-types"
import { ArrowLeft, Save, Bot, Zap, Wrench } from "lucide-react"

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

export default function NewAgentPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    system_prompt: "You are a helpful AI assistant.",
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
    if (supabase) {
      supabase.from("llm_providers").select("*").eq("is_active", true).then(({ data }) => setProviders(data || []))
      supabase
        .from("provider_models")
        .select("*")
        .eq("is_enabled", true)
        .then(({ data }) => setProviderModels(data || []))
      supabase.from("tools").select("*").eq("is_active", true).then(({ data }) => setTools(data || []))
      supabase.from("skills").select("*").eq("is_active", true).then(({ data }) => setSkills(data || []))
    }
  }, [])

  function toggleSkill(skillId: string) {
    setSelectedSkills((prev) =>
      prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]
    )
  }

  function toggleTool(toolId: string) {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId]
    )
  }

  async function handleSave() {
    if (!supabase) return

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

      const { data: newAgent, error } = await supabase.from("agents").insert(payload).select().single()

      if (error) throw error

      const syncErr = await syncAgentSkillsAndTools(
        supabase,
        newAgent.id,
        selectedSkills,
        selectedTools
      )
      if (syncErr.error) throw new Error(syncErr.error)

      router.replace(`/agents/${newAgent.id}`)
    } catch (error) {
      console.error("Failed to create:", error)
      alert(error instanceof Error ? error.message : "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) return <SetupRequired />

  const filteredModels = providerModels
    .filter((m) => m.provider_id === formData.provider_id)
    .sort((a, b) => (b.is_latest ? 1 : 0) - (a.is_latest ? 1 : 0))

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <Link href="/agents" className="text-sm text-muted-foreground hover:underline flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Agents
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            New Agent
          </CardTitle>
          <CardDescription>Configure a new AI agent for task orchestration</CardDescription>
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
              className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                      {m.display_name || m.model_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperature</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.temperature}
                onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                value={formData.max_tokens}
                onChange={(e) =>
                  setFormData({ ...formData, max_tokens: e.target.value.replace(/[^0-9]/g, "") })}
                placeholder="4096"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border">
            <Label className="text-sm font-medium">Default Agent</Label>
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

          <Accordion type="multiple">
            <AccordionItem value="skills">
              <AccordionTrigger className="text-sm">
                <Zap className="h-4 w-4 text-amber-500 mr-2" />
                Skills ({selectedSkills.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {skills.map((s) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedSkills.includes(s.id)}
                        onCheckedChange={() => toggleSkill(s.id)}
                      />
                      <label className="text-sm cursor-pointer">{s.name}</label>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tools">
              <AccordionTrigger className="text-sm">
                <Wrench className="h-4 w-4 text-blue-500 mr-2" />
                Tools ({selectedTools.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {tools.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedTools.includes(t.id)}
                        onCheckedChange={() => toggleTool(t.id)}
                      />
                      <label className="text-sm cursor-pointer">{t.name}</label>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button
            onClick={handleSave}
            disabled={saving || !formData.name || !formData.system_prompt}
          >
            <Save className="h-4 w-4" />
            {saving ? "Creating..." : "Create Agent"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
