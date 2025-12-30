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
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Skill, Agent } from "@/lib/supabase-types"
import { Plus, Zap, Save, Bot } from "lucide-react"
import { Switch } from "@/components/ui/switch"

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [skillAgents, setSkillAgents] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    skill_id: "",
    description: "",
    instructions: "",
    version: "1.0.0",
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
      const [
        { data: skillsData },
        { data: agentsData },
        { data: agentSkillsData }
      ] = await Promise.all([
        supabase.from("skills").select("*").order("created_at", { ascending: false }),
        supabase.from("agents").select("*"),
        supabase.from("agent_skills").select("*")
      ])

      setSkills(skillsData || [])
      setAgents(agentsData || [])
      
      // Map skill_id -> array of agent_ids
      const skillsMap: Record<string, string[]> = {}
      agentSkillsData?.forEach((as: { agent_id: string; skill_id: string }) => {
        if (!skillsMap[as.skill_id]) skillsMap[as.skill_id] = []
        skillsMap[as.skill_id].push(as.agent_id)
      })
      setSkillAgents(skillsMap)
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setLoading(false)
    }
  }

  function generateSkillId(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  }

  function openCreateDialog() {
    setEditingSkill(null)
    setFormData({
      name: "",
      skill_id: "",
      description: "",
      instructions: "",
      version: "1.0.0",
    })
    setDialogOpen(true)
  }

  function openEditDialog(skill: Skill) {
    setEditingSkill(skill)
    setFormData({
      name: skill.name,
      skill_id: skill.skill_id,
      description: skill.description,
      instructions: skill.instructions || "",
      version: skill.version || "1.0.0",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!supabase) return

    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        skill_id: formData.skill_id || generateSkillId(formData.name),
        description: formData.description,
        instructions: formData.instructions || null,
        version: formData.version || "1.0.0",
        is_active: true,
      }

      if (editingSkill) {
        const { error } = await supabase
          .from("skills")
          .update(payload)
          .eq("id", editingSkill.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from("skills")
          .insert(payload)
        if (error) throw error
      }

      await fetchData()
      setDialogOpen(false)
    } catch (error) {
      console.error("Failed to save skill:", error)
    } finally {
      setSaving(false)
    }
  }

  async function toggleSkillActive(skillId: string, currentActive: boolean) {
    if (!supabase) return
    
    // If trying to deactivate, check if used by active agents
    if (currentActive) {
      const activeAgentIds = skillAgents[skillId] || []
      const activeAgentsUsingSkill = agents.filter(a => activeAgentIds.includes(a.id) && a.is_active)
      
      if (activeAgentsUsingSkill.length > 0) {
        const agentNames = activeAgentsUsingSkill.map(a => a.name).join(", ")
        alert(`Cannot deactivate: skill is used by active agent(s): ${agentNames}`)
        return
      }
    }
    
    try {
      await supabase
        .from("skills")
        .update({ is_active: !currentActive })
        .eq("id", skillId)
      await fetchData()
    } catch (error) {
      console.error("Failed to toggle skill status:", error)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Skills</h1>
          <p className="text-muted-foreground">Manage agent skills and capabilities</p>
        </div>
        <Button size="sm" onClick={openCreateDialog} data-testid="button-create-skill">
          <Plus className="h-4 w-4" />
          Add Skill
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
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No skills configured yet</p>
            <Button className="mt-4" onClick={openCreateDialog} data-testid="button-create-first-skill">
              <Plus className="h-4 w-4" />
              Add Your First Skill
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <Card key={skill.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => openEditDialog(skill)}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base" data-testid={`text-skill-name-${skill.id}`}>
                      {skill.name}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={skill.is_active ?? false}
                      onCheckedChange={() => toggleSkillActive(skill.id, skill.is_active ?? false)}
                      data-testid={`switch-skill-active-${skill.id}`}
                    />
                    <span className={`text-xs ${skill.is_active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                      {skill.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
                <CardDescription className="line-clamp-2">
                  {skill.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">{skill.skill_id}</span>
                  {skill.version && (
                    <Badge variant="outline" className="text-xs">v{skill.version}</Badge>
                  )}
                </div>
                {skillAgents[skill.id]?.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {skillAgents[skill.id].map((agentId) => {
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
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSkill ? "Edit Skill" : "Add New Skill"}</DialogTitle>
            <DialogDescription>
              {editingSkill ? "Update the skill configuration" : "Define a new skill for agents"}
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
                      skill_id: editingSkill ? formData.skill_id : generateSkillId(e.target.value)
                    })
                  }}
                  placeholder="Code Review"
                  data-testid="input-skill-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill_id">Skill ID *</Label>
                <Input
                  id="skill_id"
                  value={formData.skill_id}
                  onChange={(e) => setFormData({ ...formData, skill_id: e.target.value })}
                  placeholder="code_review"
                  data-testid="input-skill-id"
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
                data-testid="input-skill-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions</Label>
              <textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                placeholder="Detailed instructions for using this skill..."
                className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                data-testid="input-skill-instructions"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                placeholder="1.0.0"
                data-testid="input-skill-version"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name || !formData.description} data-testid="button-save">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : editingSkill ? "Update Skill" : "Add Skill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
