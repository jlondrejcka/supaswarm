"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Agent, Tool, Skill } from "@/lib/supabase-types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { AgentHierarchyView } from "@/components/agent-hierarchy-view"
import { Plus, Bot, Wrench, Zap, Star, Heart, LayoutGrid, GitBranch, EyeOff } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

export default function AgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [tools, setTools] = useState<Tool[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [agentTools, setAgentTools] = useState<Record<string, string[]>>({})
  const [agentSkills, setAgentSkills] = useState<Record<string, string[]>>({})
  const [viewMode, setViewMode] = useState<"cards" | "hierarchy">("cards")
  const [hideInactive, setHideInactive] = useState(false)

  const filteredAgents = useMemo(
    () => hideInactive ? agents.filter(a => a.is_active) : agents,
    [agents, hideInactive]
  )

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
        { data: toolsData },
        { data: skillsData },
        { data: agentToolsData },
        { data: agentSkillsData }
      ] = await Promise.all([
        supabase.from("agents").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("tools").select("*").eq("is_active", true),
        supabase.from("skills").select("*").eq("is_active", true),
        supabase.from("agent_tools").select("*"),
        supabase.from("agent_skills").select("*")
      ])
      
      setAgents(agentsData || [])
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

  async function setAsDefault(agentId: string, e: React.MouseEvent) {
    e.preventDefault()
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

  async function toggleAgentActive(agentId: string, currentActive: boolean, isDefault: boolean) {
    if (!supabase) return
    
    // Can't deactivate the default agent
    if (currentActive && isDefault) {
      alert("Cannot deactivate the default agent. Set another agent as default first.")
      return
    }
    
    try {
      await supabase
        .from("agents")
        .update({ is_active: !currentActive })
        .eq("id", agentId)
      await fetchData()
    } catch (error) {
      console.error("Failed to toggle agent status:", error)
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
        <Button size="sm" asChild data-testid="button-create-agent">
          <Link href="/agents/new">
            <Plus className="h-4 w-4" />
            New Agent
          </Link>
        </Button>
      </div>

      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "hierarchy")}>
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="cards" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </TabsTrigger>
            <TabsTrigger value="hierarchy" className="gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              Hierarchy
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Switch
              id="hide-inactive"
              checked={hideInactive}
              onCheckedChange={setHideInactive}
            />
            <Label htmlFor="hide-inactive" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1.5">
              <EyeOff className="h-3.5 w-3.5" />
              Hide inactive
            </Label>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
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
        ) : filteredAgents.length === 0 ? (
          <Card className="mt-4">
            <CardContent className="p-8 text-center">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {hideInactive && agents.length > 0 ? "All agents are inactive" : "No agents configured yet"}
              </p>
              {agents.length === 0 && (
                <Button className="mt-4" asChild data-testid="button-create-first-agent">
                  <Link href="/agents/new">
                    <Plus className="h-4 w-4" />
                    Create Your First Agent
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <TabsContent value="cards">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredAgents.map((agent) => (
                    <Link key={agent.id} href={`/agents/${agent.id}`}>
                    <Card className={`hover:bg-accent/50 transition-colors cursor-pointer h-full ${agent.is_default ? 'ring-2 ring-primary' : ''}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Bot className="h-5 w-5 text-primary" />
                            <CardTitle className="text-base" data-testid={`text-agent-name-${agent.id}`}>
                              {agent.name}
                            </CardTitle>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {agent.is_default && (
                              <Badge className="gap-1 bg-primary">
                                <Star className="h-3 w-3" />
                                Default
                              </Badge>
                            )}
                            <div className="flex items-center gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                              <Switch
                                checked={agent.is_active ?? false}
                                onCheckedChange={() => toggleAgentActive(agent.id, agent.is_active ?? false, agent.is_default ?? false)}
                                data-testid={`switch-agent-active-${agent.id}`}
                              />
                              <span className={`text-xs ${agent.is_active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                {agent.is_active ? "Active" : "Inactive"}
                              </span>
                              {agent.status && (
                                <span className="flex items-center gap-1 text-xs">
                                  <span className={`inline-block h-2 w-2 rounded-full ${
                                    agent.status === 'active' ? 'bg-green-500' :
                                    agent.status === 'idle' ? 'bg-yellow-500' :
                                    agent.status === 'offline' ? 'bg-gray-400' :
                                    agent.status === 'error' ? 'bg-red-500' : ''
                                  }`} />
                                  <span className={`${
                                    agent.status === 'active' ? 'text-green-600 dark:text-green-400' :
                                    agent.status === 'idle' ? 'text-yellow-600 dark:text-yellow-400' :
                                    agent.status === 'offline' ? 'text-muted-foreground' :
                                    agent.status === 'error' ? 'text-red-600 dark:text-red-400' : ''
                                  }`}>
                                    {agent.status}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {agent.role && (
                          <Badge className={`text-xs w-fit ${
                            agent.role === 'worker' ? 'bg-blue-500/15 text-blue-600' :
                            agent.role === 'supervisor' ? 'bg-purple-500/15 text-purple-600' :
                            agent.role === 'specialist' ? 'bg-amber-500/15 text-amber-600' : ''
                          }`}>
                            {agent.role}
                          </Badge>
                        )}
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
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAsDefault(agent.id, e); }}
                              data-testid={`button-set-default-${agent.id}`}
                            >
                              <Star className="h-4 w-4" />
                              Set Default
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {agentSkills[agent.id]?.map((skillId) => {
                            const skill = skills.find(s => s.id === skillId)
                            return skill ? (
                              <Badge key={skillId} className="gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
                                <Zap className="h-3 w-3" />
                                {skill.name}
                              </Badge>
                            ) : null
                          })}
                          {agentTools[agent.id]?.map((toolId) => {
                            const tool = tools.find(t => t.id === toolId)
                            return tool ? (
                              <Badge key={toolId} className="gap-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 hover:bg-blue-500/20">
                                <Wrench className="h-3 w-3" />
                                {tool.name}
                              </Badge>
                            ) : null
                          })}
                        </div>
                        {agent.model && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Model: {agent.model}
                          </p>
                        )}
                        {agent.last_heartbeat && (() => {
                          const heartbeatDate = new Date(agent.last_heartbeat)
                          const isStale = Date.now() - heartbeatDate.getTime() > 5 * 60 * 1000
                          return (
                            <p className={`text-xs mt-1 flex items-center gap-1 ${isStale ? 'text-red-500' : 'text-muted-foreground'}`}>
                              <Heart className="h-3 w-3" />
                              {formatDistanceToNow(heartbeatDate, { addSuffix: true })}
                            </p>
                          )
                        })()}
                        {agent.daily_token_budget != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Budget: {agent.daily_token_budget.toLocaleString()} tokens/day
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    </Link>
                  )
                )}
              </div>
            </TabsContent>

            <TabsContent value="hierarchy">
              <AgentHierarchyView
                agents={filteredAgents}
                tools={tools}
                skills={skills}
                agentTools={agentTools}
                agentSkills={agentSkills}
                onEdit={(agent) => router.push(`/agents/${agent.id}`)}
                onSetDefault={setAsDefault}
                onToggleActive={toggleAgentActive}
              />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
