import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { StatsCard } from "@/components/stats-card"
import { StatusBadge } from "@/components/status-badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  ListTodo, 
  Bot, 
  Wrench, 
  Sparkles, 
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Task, TaskStatus } from "@/lib/supabase-types"

export default function Dashboard() {
  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as Task[]
    }
  })

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
      if (error) throw error
      return data
    }
  })

  const { data: tools, isLoading: toolsLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tools')
        .select('*')
      if (error) throw error
      return data
    }
  })

  const { data: skills, isLoading: skillsLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skills')
        .select('*')
      if (error) throw error
      return data
    }
  })

  const isLoading = tasksLoading || agentsLoading || toolsLoading || skillsLoading

  const tasksByStatus = tasks?.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  const runningTasks = tasksByStatus['running'] || 0
  const pendingReview = tasksByStatus['needs_human_review'] || 0
  const completedTasks = tasksByStatus['completed'] || 0
  const failedTasks = tasksByStatus['failed'] || 0

  const recentTasks = tasks?.slice(0, 10) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor your multi-agent workflows in real-time
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Tasks"
          value={runningTasks}
          description={`${pendingReview} awaiting review`}
          icon={Activity}
          isLoading={isLoading}
        />
        <StatsCard
          title="Total Agents"
          value={agents?.filter(a => a.is_active).length || 0}
          description={`${agents?.length || 0} registered`}
          icon={Bot}
          isLoading={isLoading}
        />
        <StatsCard
          title="Available Tools"
          value={tools?.filter(t => t.is_active).length || 0}
          description={`${tools?.filter(t => t.type === 'mcp_server').length || 0} MCP servers`}
          icon={Wrench}
          isLoading={isLoading}
        />
        <StatsCard
          title="Loaded Skills"
          value={skills?.filter(s => s.is_active).length || 0}
          description="Agent capabilities"
          icon={Sparkles}
          isLoading={isLoading}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              Recent Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                ))}
              </div>
            ) : recentTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No tasks yet. Create your first task to get started.
              </div>
            ) : (
              <ScrollArea className="h-[280px]">
                <div className="space-y-2">
                  {recentTasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="flex items-center justify-between gap-3 p-2 rounded-md hover-elevate"
                      data-testid={`task-row-${task.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <code className="text-xs text-muted-foreground font-mono truncate max-w-[80px]">
                          {task.id.slice(0, 8)}
                        </code>
                        <span className="text-sm truncate">
                          {task.agent_slug || 'Unassigned'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {task.created_at && formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                        </span>
                        <StatusBadge status={task.status as TaskStatus} size="sm" />
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Task Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Pending</span>
                  </div>
                  <span className="text-sm font-medium">{tasksByStatus['pending'] || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Running</span>
                  </div>
                  <span className="text-sm font-medium">{runningTasks}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm">Needs Review</span>
                  </div>
                  <span className="text-sm font-medium">{pendingReview}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Completed</span>
                  </div>
                  <span className="text-sm font-medium">{completedTasks}</span>
                </div>
                {failedTasks > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-red-500">
                      <Activity className="h-4 w-4" />
                      <span className="text-sm">Failed</span>
                    </div>
                    <span className="text-sm font-medium text-red-500">{failedTasks}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
