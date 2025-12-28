import { Badge } from "@/components/ui/badge"
import { 
  Clock, 
  Play, 
  GitBranch, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Ban,
  Loader2
} from "lucide-react"
import type { TaskStatus } from "@/lib/supabase-types"

const statusConfig: Record<TaskStatus, { 
  label: string
  variant: "default" | "secondary" | "destructive" | "outline"
  icon: React.ComponentType<{ className?: string }>
  className: string
}> = {
  pending: {
    label: "Pending",
    variant: "secondary",
    icon: Clock,
    className: "bg-muted text-muted-foreground"
  },
  running: {
    label: "Running",
    variant: "default",
    icon: Loader2,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
  },
  pending_subtask: {
    label: "Subtask",
    variant: "outline",
    icon: GitBranch,
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
  },
  needs_human_review: {
    label: "Review",
    variant: "outline",
    icon: AlertTriangle,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
  },
  completed: {
    label: "Completed",
    variant: "default",
    icon: CheckCircle,
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
  },
  failed: {
    label: "Failed",
    variant: "destructive",
    icon: XCircle,
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
  },
  cancelled: {
    label: "Cancelled",
    variant: "secondary",
    icon: Ban,
    className: "bg-muted text-muted-foreground"
  }
}

interface StatusBadgeProps {
  status: TaskStatus
  showIcon?: boolean
  size?: "sm" | "default"
}

export function StatusBadge({ status, showIcon = true, size = "default" }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending
  const Icon = config.icon
  
  return (
    <Badge 
      variant="outline" 
      className={`${config.className} ${size === "sm" ? "text-xs px-1.5 py-0" : ""} gap-1 font-medium`}
      data-testid={`badge-status-${status}`}
    >
      {showIcon && (
        <Icon className={`${size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} ${status === "running" ? "animate-spin" : ""}`} />
      )}
      {config.label}
    </Badge>
  )
}
