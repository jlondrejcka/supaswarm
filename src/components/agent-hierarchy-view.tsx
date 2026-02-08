"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { Agent, Tool } from "@/lib/supabase-types"
import { Bot, ChevronDown, ChevronRight, Star, Wrench, Zap, Heart } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface AgentNode {
  agent: Agent
  children: AgentNode[]
}

interface AgentHierarchyViewProps {
  agents: Agent[]
  tools: Tool[]
  skills: { id: string; name: string }[]
  agentTools: Record<string, string[]>
  agentSkills: Record<string, string[]>
  onEdit: (agent: Agent) => void
  onSetDefault: (agentId: string, e: React.MouseEvent) => void
  onToggleActive: (agentId: string, currentActive: boolean, isDefault: boolean) => void
}

function buildHierarchy(agents: Agent[], tools: Tool[], agentTools: Record<string, string[]>): AgentNode[] {
  // Map agent id → agent
  const agentMap = new Map<string, Agent>()
  agents.forEach(a => agentMap.set(a.id, a))

  // Find parent→child edges from spawn tools
  // parentId → Set<childId>
  const childSet = new Set<string>()
  const childrenMap = new Map<string, Set<string>>()

  for (const [agentId, toolIds] of Object.entries(agentTools)) {
    for (const toolId of toolIds) {
      const tool = tools.find(t => t.id === toolId)
      if (!tool || tool.type !== "spawn") continue
      const config = tool.config as Record<string, unknown>
      const targetId = config?.target_agent_id as string | undefined
      if (!targetId || !agentMap.has(targetId)) continue

      if (!childrenMap.has(agentId)) childrenMap.set(agentId, new Set())
      childrenMap.get(agentId)!.add(targetId)
      childSet.add(targetId)
    }
  }

  // Build tree nodes recursively
  const visited = new Set<string>()

  function buildNode(agentId: string): AgentNode | null {
    const agent = agentMap.get(agentId)
    if (!agent || visited.has(agentId)) return null
    visited.add(agentId)

    const kids = childrenMap.get(agentId) || new Set()
    const children: AgentNode[] = []
    for (const childId of kids) {
      const node = buildNode(childId)
      if (node) children.push(node)
    }
    return { agent, children }
  }

  // Root agents = not a child of anyone
  const roots: AgentNode[] = []
  for (const agent of agents) {
    if (childSet.has(agent.id)) continue
    const node = buildNode(agent.id)
    if (node) roots.push(node)
  }

  // Any agents not visited (circular refs, etc.) go as roots
  for (const agent of agents) {
    if (!visited.has(agent.id)) {
      roots.push({ agent, children: [] })
    }
  }

  return roots
}

function HierarchyNode({
  node,
  depth,
  tools,
  skills,
  agentTools,
  agentSkills,
  onEdit,
  onSetDefault,
  onToggleActive,
}: {
  node: AgentNode
  depth: number
  tools: Tool[]
  skills: { id: string; name: string }[]
  agentTools: Record<string, string[]>
  agentSkills: Record<string, string[]>
  onEdit: (agent: Agent) => void
  onSetDefault: (agentId: string, e: React.MouseEvent) => void
  onToggleActive: (agentId: string, currentActive: boolean, isDefault: boolean) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const { agent } = node
  const hasChildren = node.children.length > 0

  // Spawn tool names for this agent
  const spawnTargets = useMemo(() => {
    const ids = agentTools[agent.id] || []
    return ids
      .map(tid => tools.find(t => t.id === tid))
      .filter((t): t is Tool => !!t && t.type === "spawn")
      .map(t => {
        const cfg = t.config as Record<string, unknown>
        return cfg?.target_agent_slug as string || t.name
      })
  }, [agent.id, agentTools, tools])

  return (
    <div className={depth > 0 ? "ml-6 border-l border-border pl-4" : ""}>
      <div className="py-1.5">
        <Card
          className={`hover:bg-accent/50 transition-colors cursor-pointer ${agent.is_default ? "ring-2 ring-primary" : ""}`}
          onClick={() => onEdit(agent)}
        >
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button
                  className="p-0.5 rounded hover:bg-accent"
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <Bot className="h-5 w-5 text-primary shrink-0" />
              <CardTitle className="text-base">{agent.name}</CardTitle>

              {agent.role && (
                <Badge className={`text-xs ${
                  agent.role === "worker" ? "bg-blue-500/15 text-blue-600" :
                  agent.role === "supervisor" ? "bg-purple-500/15 text-purple-600" :
                  agent.role === "specialist" ? "bg-amber-500/15 text-amber-600" : ""
                }`}>
                  {agent.role}
                </Badge>
              )}

              {agent.is_default && (
                <Badge className="gap-1 bg-primary">
                  <Star className="h-3 w-3" />
                  Default
                </Badge>
              )}

              <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {agent.status && (
                  <span className="flex items-center gap-1 text-xs">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      agent.status === "active" ? "bg-green-500" :
                      agent.status === "idle" ? "bg-yellow-500" :
                      agent.status === "offline" ? "bg-gray-400" :
                      agent.status === "error" ? "bg-red-500" : ""
                    }`} />
                    <span className={`${
                      agent.status === "active" ? "text-green-600 dark:text-green-400" :
                      agent.status === "idle" ? "text-yellow-600 dark:text-yellow-400" :
                      agent.status === "offline" ? "text-muted-foreground" :
                      agent.status === "error" ? "text-red-600 dark:text-red-400" : ""
                    }`}>{agent.status}</span>
                  </span>
                )}
                <Switch
                  checked={agent.is_active ?? false}
                  onCheckedChange={() => onToggleActive(agent.id, agent.is_active ?? false, agent.is_default ?? false)}
                />
                <span className={`text-xs ${agent.is_active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                  {agent.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 ml-10 flex-wrap">
              <CardDescription className="line-clamp-1 text-xs">
                {agent.description || "No description"}
              </CardDescription>

              {agent.model && (
                <span className="text-xs text-muted-foreground font-mono">{agent.model}</span>
              )}

              {agent.last_heartbeat && (() => {
                const d = new Date(agent.last_heartbeat)
                const stale = Date.now() - d.getTime() > 5 * 60 * 1000
                return (
                  <span className={`text-xs flex items-center gap-1 ${stale ? "text-red-500" : "text-muted-foreground"}`}>
                    <Heart className="h-3 w-3" />
                    {formatDistanceToNow(d, { addSuffix: true })}
                  </span>
                )
              })()}

              {!agent.is_default && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={(e) => onSetDefault(agent.id, e)}>
                  <Star className="h-3 w-3" /> Set Default
                </Button>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-10 flex-wrap">
              {agentSkills[agent.id]?.map((skillId) => {
                const skill = skills.find(s => s.id === skillId)
                return skill ? (
                  <Badge key={skillId} className="gap-1 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                    <Zap className="h-2.5 w-2.5" />
                    {skill.name}
                  </Badge>
                ) : null
              })}
              {agentTools[agent.id]?.map((toolId) => {
                const tool = tools.find(t => t.id === toolId)
                if (!tool || tool.type === "spawn") return null
                return (
                  <Badge key={toolId} className="gap-1 bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px]">
                    <Wrench className="h-2.5 w-2.5" />
                    {tool.name}
                  </Badge>
                )
              })}
            </div>
          </CardHeader>
        </Card>
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <HierarchyNode
              key={child.agent.id}
              node={child}
              depth={depth + 1}
              tools={tools}
              skills={skills}
              agentTools={agentTools}
              agentSkills={agentSkills}
              onEdit={onEdit}
              onSetDefault={onSetDefault}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function AgentHierarchyView({
  agents,
  tools,
  skills,
  agentTools,
  agentSkills,
  onEdit,
  onSetDefault,
  onToggleActive,
}: AgentHierarchyViewProps) {
  const tree = useMemo(() => buildHierarchy(agents, tools, agentTools), [agents, tools, agentTools])

  if (agents.length === 0) return null

  return (
    <div className="space-y-0">
      {tree.map((node) => (
        <HierarchyNode
          key={node.agent.id}
          node={node}
          depth={0}
          tools={tools}
          skills={skills}
          agentTools={agentTools}
          agentSkills={agentSkills}
          onEdit={onEdit}
          onSetDefault={onSetDefault}
          onToggleActive={onToggleActive}
        />
      ))}
    </div>
  )
}
