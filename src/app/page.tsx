"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bot, ListTodo, Wrench, Zap, AlertCircle, CheckCircle, Clock, Activity, Trophy, Crown, Medal } from "lucide-react"
import { useEffect, useState } from "react"
import { supabase, isSupabaseConfigured } from "@/lib/supabase"
import type { Task, Agent, Tool, Skill } from "@/lib/supabase-types"
import { Skeleton } from "@/components/ui/skeleton"
import { SetupRequired } from "@/components/setup-required"

interface Stats {
  totalTasks: number
  runningTasks: number
  completedTasks: number
  pendingReviews: number
  totalAgents: number
  activeAgents: number
  totalTools: number
  totalSkills: number
}

interface LeaderboardItem {
  name: string
  count: number
}

interface Leaderboards {
  agents: LeaderboardItem[]
  skills: LeaderboardItem[]
  tools: LeaderboardItem[]
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [leaderboards, setLeaderboards] = useState<Leaderboards>({ agents: [], skills: [], tools: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!supabase) {
        setLoading(false)
        return
      }
      
      try {
        const [
          { data: tasks },
          { data: agents },
          { data: tools },
          { data: skills },
          { data: skillMessages },
          { data: toolMessages }
        ] = await Promise.all([
          supabase.from("tasks").select("*"),
          supabase.from("agents").select("*"),
          supabase.from("tools").select("*"),
          supabase.from("skills").select("*"),
          supabase.from("task_messages").select("metadata, task_id").eq("type", "skill_load").not("metadata->skill_name", "is", null),
          supabase.from("task_messages").select("metadata, task_id").eq("type", "tool_call")
        ])

        const taskList = tasks || []
        const agentList = agents || []
        const toolList = tools || []
        const skillList = skills || []

        setStats({
          totalTasks: taskList.length,
          runningTasks: taskList.filter(t => t.status === "running").length,
          completedTasks: taskList.filter(t => t.status === "completed").length,
          pendingReviews: taskList.filter(t => t.status === "needs_human_review").length,
          totalAgents: agentList.length,
          activeAgents: agentList.filter(a => a.is_active).length,
          totalTools: toolList.length,
          totalSkills: skillList.length
        })

        setRecentTasks(taskList.slice(0, 5))

        // Build agent leaderboard from tasks
        const agentCounts: Record<string, { name: string; count: number }> = {}
        taskList.forEach(task => {
          if (task.agent_id) {
            const agent = agentList.find(a => a.id === task.agent_id)
            const name = agent?.name || task.agent_slug || "Unknown"
            agentCounts[task.agent_id] = agentCounts[task.agent_id] || { name, count: 0 }
            agentCounts[task.agent_id].count++
          }
        })

        // Build skill leaderboard - count completed tasks where skill was used
        const completedTaskIds = new Set(taskList.filter(t => t.status === 'completed').map(t => t.id))
        const skillTaskSets: Record<string, Set<string>> = {}
        ;(skillMessages || []).forEach((msg) => {
          const metadata = msg.metadata as Record<string, unknown> | null
          const skillName = metadata?.skill_name as string | undefined
          const taskId = msg.task_id
          // Only count if task completed successfully
          if (skillName && taskId && completedTaskIds.has(taskId)) {
            skillTaskSets[skillName] = skillTaskSets[skillName] || new Set()
            skillTaskSets[skillName].add(taskId)
          }
        })
        const skillCounts: Record<string, number> = {}
        Object.entries(skillTaskSets).forEach(([skillName, taskIds]) => {
          skillCounts[skillName] = taskIds.size
        })

        // Build tool leaderboard from task_messages
        const toolCounts: Record<string, number> = {}
        ;(toolMessages || []).forEach((msg) => {
          const metadata = msg.metadata as Record<string, unknown> | null
          const toolName = metadata?.tool_name as string | undefined
          if (toolName) {
            // Clean up tool name (e.g. "exa-search__Exa_Search" -> "Exa Search")
            const cleanName = toolName.split("__").pop()?.replace(/_/g, " ") || toolName
            toolCounts[cleanName] = (toolCounts[cleanName] || 0) + 1
          }
        })

        setLeaderboards({
          agents: Object.values(agentCounts).sort((a, b) => b.count - a.count).slice(0, 5),
          skills: Object.entries(skillCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
          tools: Object.entries(toolCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5)
        })
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (!isSupabaseConfigured) {
    return <SetupRequired />
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="mt-1 h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Dashboard</h1>
        <p className="text-muted-foreground">Monitor your multi-agent orchestration platform</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-tasks">{stats?.totalTasks || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.runningTasks || 0} running, {stats?.completedTasks || 0} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-agents">{stats?.activeAgents || 0}</div>
            <p className="text-xs text-muted-foreground">
              of {stats?.totalAgents || 0} total agents
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Tools Available</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-tools">{stats?.totalTools || 0}</div>
            <p className="text-xs text-muted-foreground">
              MCP servers, HTTP APIs, and more
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reviews</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-reviews">{stats?.pendingReviews || 0}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting human approval
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboards Section */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Trophy className="h-5 w-5 text-amber-500" />
          Usage Leaderboards
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Agents Leaderboard */}
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bot className="h-4 w-4 text-amber-500" />
                Top Agents
              </CardTitle>
              <p className="text-xs text-muted-foreground">Total tasks</p>
            </CardHeader>
            <CardContent>
              {leaderboards.agents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No agent usage yet</p>
              ) : (
                <div className="space-y-3">
                  {leaderboards.agents.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6">
                        {idx === 0 ? <Crown className="h-4 w-4 text-amber-500" /> :
                         idx === 1 ? <Medal className="h-4 w-4 text-slate-400" /> :
                         idx === 2 ? <Medal className="h-4 w-4 text-amber-700" /> :
                         <span className="text-xs text-muted-foreground ml-1">{idx + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                      </div>
                      <span className="text-sm font-bold text-amber-500">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skills Leaderboard */}
          <Card className="border-violet-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-500" />
                Top Skills
              </CardTitle>
              <p className="text-xs text-muted-foreground">Completed tasks</p>
            </CardHeader>
            <CardContent>
              {leaderboards.skills.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No skill usage yet</p>
              ) : (
                <div className="space-y-3">
                  {leaderboards.skills.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6">
                        {idx === 0 ? <Crown className="h-4 w-4 text-violet-500" /> :
                         idx === 1 ? <Medal className="h-4 w-4 text-slate-400" /> :
                         idx === 2 ? <Medal className="h-4 w-4 text-violet-700" /> :
                         <span className="text-xs text-muted-foreground ml-1">{idx + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                      </div>
                      <span className="text-sm font-bold text-violet-500">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tools Leaderboard */}
          <Card className="border-emerald-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wrench className="h-4 w-4 text-emerald-500" />
                Top Tools
              </CardTitle>
              <p className="text-xs text-muted-foreground">Total calls</p>
            </CardHeader>
            <CardContent>
              {leaderboards.tools.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tool usage yet</p>
              ) : (
                <div className="space-y-3">
                  {leaderboards.tools.map((item, idx) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-6">
                        {idx === 0 ? <Crown className="h-4 w-4 text-emerald-500" /> :
                         idx === 1 ? <Medal className="h-4 w-4 text-slate-400" /> :
                         idx === 2 ? <Medal className="h-4 w-4 text-emerald-700" /> :
                         <span className="text-xs text-muted-foreground ml-1">{idx + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.name}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-500">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent tasks</p>
            ) : (
              <div className="space-y-3">
                {recentTasks.map((task) => (
                  <div key={task.id} className="flex items-center gap-3">
                    {task.status === "completed" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : task.status === "running" ? (
                      <Clock className="h-4 w-4 text-blue-500 animate-pulse" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-task-${task.id}`}>
                        Task {task.id.slice(0, 8)}...
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {task.agent_slug || "No agent assigned"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Skills Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-4xl font-bold" data-testid="text-total-skills">{stats?.totalSkills || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Agent Skills Available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
