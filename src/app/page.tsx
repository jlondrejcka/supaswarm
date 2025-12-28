"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Bot, ListTodo, Wrench, Zap, AlertCircle, CheckCircle, Clock, Activity } from "lucide-react"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Task, Agent, Tool, Skill } from "@/lib/supabase-types"
import { Skeleton } from "@/components/ui/skeleton"

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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentTasks, setRecentTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [
          { data: tasks },
          { data: agents },
          { data: tools },
          { data: skills }
        ] = await Promise.all([
          supabase.from("tasks").select("*"),
          supabase.from("agents").select("*"),
          supabase.from("tools").select("*"),
          supabase.from("skills").select("*")
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
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

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
