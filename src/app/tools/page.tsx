"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import { SetupRequired } from "@/components/setup-required"
import type { Tool, ToolType, Agent } from "@/lib/supabase-types"
import { Plus, Wrench, Globe, Server, Database, Users, Bot, CheckCircle } from "lucide-react"
import { Switch } from "@/components/ui/switch"

const toolTypeIcons: Record<ToolType, typeof Wrench> = {
  internal: Wrench,
  mcp_server: Server,
  http_api: Globe,
  supabase_rpc: Database,
  spawn: Users,
}

const toolTypeLabels: Record<ToolType, string> = {
  internal: "Internal",
  mcp_server: "MCP Server",
  http_api: "HTTP API",
  supabase_rpc: "Supabase RPC",
  spawn: "Sub-Agent",
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ToolType | "all">("all")
  const [agents, setAgents] = useState<Agent[]>([])
  const [toolAgents, setToolAgents] = useState<Record<string, string[]>>({})

  useEffect(() => {
    fetchTools()
    fetchAgents()
  }, [])

  async function fetchTools() {
    if (!supabase) {
      setLoading(false)
      return
    }
    
    try {
      const { data, error } = await supabase
        .from("tools")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      setTools(data || [])
    } catch (error) {
      console.error("Failed to fetch tools:", error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAgents() {
    if (!supabase) return

    try {
      const [
        { data: agentsData },
        { data: agentToolsData }
      ] = await Promise.all([
        supabase.from("agents").select("*").eq("is_active", true).order("name"),
        supabase.from("agent_tools").select("*")
      ])

      setAgents(agentsData || [])

      const toolsMap: Record<string, string[]> = {}
      agentToolsData?.forEach((at: { agent_id: string; tool_id: string }) => {
        if (!toolsMap[at.tool_id]) toolsMap[at.tool_id] = []
        toolsMap[at.tool_id].push(at.agent_id)
      })
      setToolAgents(toolsMap)
    } catch (error) {
      console.error("Failed to fetch agents:", error)
    }
  }

  async function toggleToolActive(toolId: string, currentActive: boolean) {
    if (!supabase) return
    
    // If trying to deactivate, check if used by active agents
    if (currentActive) {
      const activeAgentIds = toolAgents[toolId] || []
      const activeAgentsUsingTool = agents.filter(a => activeAgentIds.includes(a.id) && a.is_active)
      
      if (activeAgentsUsingTool.length > 0) {
        const agentNames = activeAgentsUsingTool.map(a => a.name).join(", ")
        alert(`Cannot deactivate: tool is used by active agent(s): ${agentNames}`)
        return
      }
    }
    
    try {
      await supabase
        .from("tools")
        .update({ is_active: !currentActive })
        .eq("id", toolId)
      await fetchTools()
    } catch (error) {
      console.error("Failed to toggle tool status:", error)
    }
  }

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  const filteredTools = filter === "all" 
    ? tools 
    : tools.filter(t => t.type === filter)

  const typeCounts = tools.reduce((acc, tool) => {
    acc[tool.type as ToolType] = (acc[tool.type as ToolType] || 0) + 1
    return acc
  }, {} as Record<ToolType, number>)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Tools</h1>
          <p className="text-muted-foreground">Manage MCP servers, HTTP APIs, and integrations</p>
        </div>
        <Button size="sm" asChild data-testid="button-create-tool">
          <Link href="/tools/new">
            <Plus className="h-4 w-4" />
            Add Tool
          </Link>
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          data-testid="button-filter-all"
        >
          All ({tools.length})
        </Button>
        {(["mcp_server", "http_api", "supabase_rpc", "internal", "spawn"] as ToolType[]).map((type) => (
          <Button
            key={type}
            variant={filter === type ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(type)}
            data-testid={`button-filter-${type}`}
          >
            {toolTypeLabels[type]} ({typeCounts[type] || 0})
          </Button>
        ))}
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
      ) : filteredTools.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {tools.length === 0 ? "No tools configured yet" : "No tools match the selected filter"}
            </p>
            {tools.length === 0 && (
              <Button className="mt-4" asChild data-testid="button-create-first-tool">
                <Link href="/tools/new">
                  <Plus className="h-4 w-4" />
                  Add Your First Tool
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTools.map((tool) => {
            const Icon = toolTypeIcons[tool.type as ToolType] || Wrench
            return (
              <Link key={tool.id} href={`/tools/${tool.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base" data-testid={`text-tool-name-${tool.id}`}>
                        {tool.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                      <Switch
                        checked={tool.is_active ?? false}
                        onCheckedChange={() => toggleToolActive(tool.id, tool.is_active ?? false)}
                        data-testid={`switch-tool-active-${tool.id}`}
                      />
                      <span className={`text-xs ${tool.is_active ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {tool.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {tool.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">
                      {toolTypeLabels[tool.type as ToolType] || tool.type}
                    </Badge>
                    {tool.execution_mode && tool.execution_mode !== tool.type && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          tool.execution_mode === "internal" 
                            ? "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30"
                            : tool.execution_mode === "edge_function"
                            ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                            : tool.execution_mode === "mcp_server"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
                            : tool.execution_mode === "http_api"
                            ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30"
                            : ""
                        }`}
                      >
                        {tool.execution_mode === "edge_function" ? "Edge Fn" : tool.execution_mode}
                      </Badge>
                    )}
                    {tool.requires_approval && (
                      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                        Approval Required
                      </Badge>
                    )}
                    {tool.created_by && (
                      <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                        Agent Created
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">{tool.slug}</span>
                    {tool.type === "mcp_server" && (tool.config as Record<string, unknown>)?.tools && Array.isArray((tool.config as Record<string, unknown>).tools) ? (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {((tool.config as Record<string, unknown>).tools as unknown[]).length} MCP tools
                      </Badge>
                    ) : null}
                    {(tool.type === "spawn" || tool.type === "handoff") && (tool.config as Record<string, unknown>)?.target_agent_slug ? (
                      <Badge variant="secondary" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        → {(tool.config as Record<string, unknown>).target_agent_slug as string}
                      </Badge>
                    ) : null}
                  </div>
                  {tool.rate_limit_per_min && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Rate: {tool.rate_limit_per_min}/min
                    </div>
                  )}
                  {tool.type === "mcp_server" && (tool.config as Record<string, unknown>)?.tools && Array.isArray((tool.config as Record<string, unknown>).tools) ? (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {((tool.config as Record<string, unknown>).tools as Array<{name: string; description?: string}>).map((mcpTool) => (
                        <Badge key={mcpTool.name} variant="outline" className="text-xs gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                          <Wrench className="h-2.5 w-2.5" />
                          {mcpTool.name}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {toolAgents[tool.id]?.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {toolAgents[tool.id].map((agentId) => {
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
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
