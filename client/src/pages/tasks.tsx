import { useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { queryClient } from "@/lib/queryClient"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { 
  ListTodo, 
  Search, 
  ChevronRight, 
  ChevronDown,
  Eye,
  XCircle,
  RefreshCw
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import type { Task, TaskStatus, Agent } from "@/lib/supabase-types"

const statusOptions: { value: string; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "pending_subtask", label: "Pending Subtask" },
  { value: "needs_human_review", label: "Needs Review" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
]

export default function Tasks() {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Task[]
    }
  })

  const { data: agents } = useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agents')
        .select('*')
      if (error) throw error
      return data as Agent[]
    }
  })

  const cancelMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      toast({ title: "Task cancelled successfully" })
    },
    onError: () => {
      toast({ title: "Failed to cancel task", variant: "destructive" })
    }
  })

  const filteredTasks = tasks?.filter(task => {
    const matchesSearch = 
      task.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.agent_slug?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === "all" || task.status === statusFilter
    return matchesSearch && matchesStatus
  }) || []

  const masterTasks = filteredTasks.filter(t => !t.parent_id)
  const getSubtasks = (parentId: string) => filteredTasks.filter(t => t.parent_id === parentId)

  const toggleExpand = (taskId: string) => {
    const newExpanded = new Set(expandedTasks)
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId)
    } else {
      newExpanded.add(taskId)
    }
    setExpandedTasks(newExpanded)
  }

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return null
    return agents?.find(a => a.id === agentId)?.name
  }

  const renderTaskRow = (task: Task, depth: number = 0) => {
    const subtasks = getSubtasks(task.id)
    const hasSubtasks = subtasks.length > 0
    const isExpanded = expandedTasks.has(task.id)

    return (
      <>
        <TableRow 
          key={task.id} 
          className="hover-elevate cursor-pointer"
          onClick={() => setSelectedTask(task)}
          data-testid={`task-row-${task.id}`}
        >
          <TableCell className="font-mono text-xs">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 24}px` }}>
              {hasSubtasks && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleExpand(task.id)
                  }}
                  data-testid={`button-expand-${task.id}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </Button>
              )}
              {!hasSubtasks && depth > 0 && <div className="w-5" />}
              <span className="text-muted-foreground">{task.id.slice(0, 8)}</span>
            </div>
          </TableCell>
          <TableCell>
            {task.agent_slug ? (
              <Badge variant="outline" className="font-mono text-xs">
                {task.agent_slug}
              </Badge>
            ) : (
              <span className="text-muted-foreground text-xs">Unassigned</span>
            )}
          </TableCell>
          <TableCell>
            <StatusBadge status={task.status as TaskStatus} size="sm" />
          </TableCell>
          <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
            {task.created_at && formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedTask(task)
                }}
                data-testid={`button-view-${task.id}`}
              >
                <Eye className="h-4 w-4" />
              </Button>
              {(task.status === 'pending' || task.status === 'running') && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    cancelMutation.mutate(task.id)
                  }}
                  data-testid={`button-cancel-${task.id}`}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
        {isExpanded && subtasks.map(subtask => renderTaskRow(subtask, depth + 1))}
      </>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="View and manage all task executions"
      />

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID or agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-tasks"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button 
          variant="outline" 
          size="icon"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['tasks'] })}
          data-testid="button-refresh-tasks"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          ) : masterTasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No tasks found"
              description="Tasks will appear here when agents start processing workflows."
            />
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Task ID</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masterTasks.map(task => renderTaskRow(task))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Task Details
              {selectedTask && (
                <StatusBadge status={selectedTask.status as TaskStatus} />
              )}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {selectedTask?.id}
            </DialogDescription>
          </DialogHeader>
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground">Agent</label>
                  <p className="text-sm font-medium">
                    {getAgentName(selectedTask.agent_id) || selectedTask.agent_slug || 'Unassigned'}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Created</label>
                  <p className="text-sm">
                    {selectedTask.created_at && new Date(selectedTask.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div>
                <label className="text-xs text-muted-foreground">Input</label>
                <pre className="mt-1 p-3 rounded-md bg-muted text-xs font-mono overflow-x-auto">
                  {JSON.stringify(selectedTask.input, null, 2)}
                </pre>
              </div>

              {selectedTask.output && (
                <div>
                  <label className="text-xs text-muted-foreground">Output</label>
                  <pre className="mt-1 p-3 rounded-md bg-muted text-xs font-mono overflow-x-auto">
                    {JSON.stringify(selectedTask.output, null, 2)}
                  </pre>
                </div>
              )}

              {selectedTask.logs && selectedTask.logs.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground">Logs</label>
                  <ScrollArea className="h-[150px] mt-1">
                    <div className="p-3 rounded-md bg-muted space-y-1">
                      {selectedTask.logs.map((log, i) => (
                        <p key={i} className="text-xs font-mono">{log}</p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTask(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
