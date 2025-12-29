"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Agent, LLMProvider, Tool, Skill } from "@/lib/supabase-types"
import { Plus, Bot, Settings2, Save, Wrench, Zap, Star } from "lucide-react"

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
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
    is_default: false,
  })
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [agentTools, setAgentTools] = useState<Record<string, string[]>>({})
  const [agentSkills, setAgentSkills] = useState<Record<string, string[]>>({})

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      const [
        { data: agentsData },
        { data: providersData },
        { data: toolsData },
        { data: skillsData },
        { data: agentToolsData },
        { data: agentSkillsData }
      ] = await Promise.all([
        supabase.from("agents").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("llm_providers").select("*").eq("is_active", true),
        supabase.from("tools").select("*").eq("is_active", true),
        supabase.from("skills").select("*").eq("is_active", true),
        supabase.from("agent_tools").select("*"),
        supabase.from("agent_skills").select("*")
      ])
      
      setAgents(agentsData || [])
      setProviders(providersData || [])
      setTools(toolsData || [])
      setSkills(skillsData || [])
      
      const toolsMap: Record<string, string[]> = {}
      agentToolsData?.forEach((at: { agent_id: string; tool_id: string }) => {
        if (!toolsMap[at.agent_id]) toolsMap[at.agent_id] = []
        toolsMap[at.agent_id].push(at.tool_id)
      })
      setAgentTools(toolsMap)
      
      const skillsMap: Record<string, string[]> = {}
      agentSkillsData?.forEach((as: { agent_id: string; skill_id: string }) => {
        if (!skillsMap[as.agent_id]) skillsMap[as.agent_id] = []
        skillsMap[as.agent_id].push(as.skill_id)
      })
      setAgentSkills(skillsMap)
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
      is_default: false,
    })
    setSelectedTools([])
    setSelectedSkills([])
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
      is_default: agent.is_default || false,
    })
    setSelectedTools(agentTools[agent.id] || [])
    setSelectedSkills(agentSkills[agent.id] || [])
    setDialogOpen(true)
  }

  function generateSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  function toggleTool(toolId: string) {
    setSelectedTools(prev => 
      prev.includes(toolId) 
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId]
    )
  }

  function toggleSkill(skillId: string) {
    setSelectedSkills(prev => 
      prev.includes(skillId) 
        ? prev.filter(id => id !== skillId)
        : [...prev, skillId]
    )
  }

  async function setAsDefault(agentId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!supabase) return
    
    try {
      await supabase
        .from("agents")
        .update({ is_default: true })
        .eq("id", agentId)
      await fetchData()
    } catch (error) {
      console.error("Failed to set default agent:", error)
    }
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
        is_default: formData.is_default,
      }

      let agentId: string

      if (editingAgent) {
        const { error } = await supabase
          .from("agents")
          .update(payload)
          .eq("id", editingAgent.id)
        if (error) throw error
        agentId = editingAgent.id
      } else {
        const { data, error } = await supabase
          .from("agents")
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        agentId = data.id
      }

      if (editingAgent) {
        await supabase.from("agent_tools").delete().eq("agent_id", agentId)
        await supabase.from("agent_skills").delete().eq("agent_id", agentId)
      }

      if (selectedTools.length > 0) {
        await supabase.from("agent_tools").insert(
          selectedTools.map(tool_id => ({ agent_id: agentId, tool_id }))
        )
      }

      if (selectedSkills.length > 0) {
        await supabase.from("agent_skills").insert(
          selectedSkills.map(skill_id => ({ agent_id: agentId, skill_id }))
        )
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
          {agents.map((agent) => {
            const toolCount = agentTools[agent.id]?.length || 0
            const skillCount = agentSkills[agent.id]?.length || 0
            return (
              <Card key={agent.id} className={`hover:bg-accent/50 transition-colors cursor-pointer ${agent.is_default ? 'ring-2 ring-primary' : ''}`} onClick={() => openEditDialog(agent)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base" data-testid={`text-agent-name-${agent.id}`}>
                        {agent.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {agent.is_default && (
                        <Badge className="gap-1 bg-primary">
                          <Star className="h-3 w-3" />
                          Default
                        </Badge>
                      )}
                      <Badge variant={agent.is_active ? "default" : "secondary"}>
                        {agent.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {agent.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground font-mono">{agent.slug}</span>
                    {!agent.is_default && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={(e) => setAsDefault(agent.id, e)}
                        data-testid={`button-set-default-${agent.id}`}
                      >
                        <Star className="h-4 w-4" />
                        Set Default
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {toolCount > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Wrench className="h-3 w-3" />
                        {toolCount} tool{toolCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                    {skillCount > 0 && (
                      <Badge variant="outline" className="gap-1">
                        <Zap className="h-3 w-3" />
                        {skillCount} skill{skillCount !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  {agent.model && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Model: {agent.model}
                    </p>
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

            <div className="flex items-center justify-between p-3 rounded-md border">
              <div className="space-y-0.5">
                <Label htmlFor="is_default" className="text-sm font-medium cursor-pointer">Default Agent</Label>
                <p className="text-xs text-muted-foreground">Use this agent for new tasks by default</p>
              </div>
              <Switch
                id="is_default"
                checked={formData.is_default}
                onCheckedChange={(checked) => setFormData({ ...formData, is_default: checked })}
                data-testid="switch-default-agent"
              />
            </div>

            <Accordion type="multiple" className="w-full">
              <AccordionItem value="tools">
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    Tools ({selectedTools.length} selected)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {tools.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tools available. Create tools first.</p>
                  ) : (
                    <div className="space-y-2">
                      {tools.map((tool) => (
                        <div key={tool.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`tool-${tool.id}`}
                            checked={selectedTools.includes(tool.id)}
                            onCheckedChange={() => toggleTool(tool.id)}
                            data-testid={`checkbox-tool-${tool.id}`}
                          />
                          <label htmlFor={`tool-${tool.id}`} className="text-sm cursor-pointer flex-1">
                            {tool.name}
                            {tool.description && (
                              <span className="text-muted-foreground ml-1">- {tool.description}</span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="skills">
                <AccordionTrigger className="text-sm">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Skills ({selectedSkills.length} selected)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {skills.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No skills available. Create skills first.</p>
                  ) : (
                    <div className="space-y-2">
                      {skills.map((skill) => (
                        <div key={skill.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`skill-${skill.id}`}
                            checked={selectedSkills.includes(skill.id)}
                            onCheckedChange={() => toggleSkill(skill.id)}
                            data-testid={`checkbox-skill-${skill.id}`}
                          />
                          <label htmlFor={`skill-${skill.id}`} className="text-sm cursor-pointer flex-1">
                            {skill.name}
                            {skill.description && (
                              <span className="text-muted-foreground ml-1">- {skill.description}</span>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
