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
import type { Agent, LLMProvider } from "@/lib/supabase-types"
import { Plus, Bot, Settings2, Save } from "lucide-react"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    system_prompt: "",
    model: "",
    provider_id: "",
    temperature: "0.7",
    max_tokens: "4096",
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      const [{ data: agentsData }, { data: providersData }] = await Promise.all([
        supabase.from("agents").select("*").order("created_at", { ascending: false }),
        supabase.from("llm_providers").select("*").eq("is_active", true)
      ])
      setAgents(agentsData || [])
      setProviders(providersData || [])
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setLoading(false)
    }
  }

  function openCreateDialog() {
    setEditingAgent(null)
    setFormData({
      name: "",
      slug: "",
      description: "",
      system_prompt: "You are a helpful AI assistant.",
      model: "",
      provider_id: "",
      temperature: "0.7",
      max_tokens: "4096",
    })
    setDialogOpen(true)
  }

  function openEditDialog(agent: Agent) {
    setEditingAgent(agent)
    setFormData({
      name: agent.name,
      slug: agent.slug,
      description: agent.description || "",
      system_prompt: agent.system_prompt,
      model: agent.model || "",
      provider_id: agent.provider_id || "",
      temperature: String(agent.temperature || 0.7),
      max_tokens: String(agent.max_tokens || 4096),
    })
    setDialogOpen(true)
  }

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  async function handleSave() {
    if (!supabase) return

    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        description: formData.description || null,
        system_prompt: formData.system_prompt,
        model: formData.model || null,
        provider_id: formData.provider_id || null,
        temperature: parseFloat(formData.temperature) || 0.7,
        max_tokens: parseInt(formData.max_tokens) || 4096,
        is_active: true,
      }

      if (editingAgent) {
        const { error } = await supabase
          .from("agents")
          .update(payload)
          .eq("id", editingAgent.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("agents")
          .insert(payload)
        if (error) throw error
      }

      await fetchData()
      setDialogOpen(false)
    } catch (error) {
      console.error("Failed to save agent:", error)
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Agents</h1>
          <p className="text-muted-foreground">Configure and manage AI agents</p>
        </div>
        <Button size="sm" onClick={openCreateDialog} data-testid="button-create-agent">
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
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
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No agents configured yet</p>
            <Button className="mt-4" onClick={openCreateDialog} data-testid="button-create-first-agent">
              <Plus className="h-4 w-4" />
              Create Your First Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => openEditDialog(agent)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base" data-testid={`text-agent-name-${agent.id}`}>
                      {agent.name}
                    </CardTitle>
                  </div>
                  <Badge variant={agent.is_active ? "default" : "secondary"}>
                    {agent.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">
                  {agent.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground font-mono">{agent.slug}</span>
                  <Button variant="ghost" size="icon" data-testid={`button-settings-${agent.id}`}>
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </div>
                {agent.model && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Model: {agent.model}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent ? "Edit Agent" : "Create New Agent"}</DialogTitle>
            <DialogDescription>
              {editingAgent ? "Update the agent configuration" : "Configure a new AI agent for task orchestration"}
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
                      slug: editingAgent ? formData.slug : generateSlug(e.target.value)
                    })
                  }}
                  placeholder="My Agent"
                  data-testid="input-agent-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="my-agent"
                  data-testid="input-agent-slug"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this agent do?"
                data-testid="input-agent-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="system_prompt">System Prompt *</Label>
              <textarea
                id="system_prompt"
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                placeholder="You are a helpful AI assistant..."
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-agent-prompt"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider">LLM Provider</Label>
                <Select value={formData.provider_id} onValueChange={(v) => setFormData({ ...formData, provider_id: v })}>
                  <SelectTrigger data-testid="select-provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  placeholder="grok-4-1-fast-reasoning"
                  data-testid="input-agent-model"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature</Label>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  data-testid="input-agent-temperature"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_tokens">Max Tokens</Label>
                <Input
                  id="max_tokens"
                  type="number"
                  value={formData.max_tokens}
                  onChange={(e) => setFormData({ ...formData, max_tokens: e.target.value })}
                  data-testid="input-agent-max-tokens"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name || !formData.system_prompt} data-testid="button-save">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : editingAgent ? "Update Agent" : "Create Agent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
