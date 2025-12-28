import { Badge } from "@/components/ui/badge"
import { Cpu, Globe, Server, Database } from "lucide-react"
import type { ToolType } from "@/lib/supabase-types"

const typeConfig: Record<ToolType, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  className: string
}> = {
  internal: {
    label: "Internal",
    icon: Cpu,
    className: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20"
  },
  mcp_server: {
    label: "MCP",
    icon: Server,
    className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
  },
  http_api: {
    label: "HTTP API",
    icon: Globe,
    className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
  },
  supabase_rpc: {
    label: "RPC",
    icon: Database,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
  }
}

interface ToolTypeBadgeProps {
  type: ToolType
  showIcon?: boolean
}

export function ToolTypeBadge({ type, showIcon = true }: ToolTypeBadgeProps) {
  const config = typeConfig[type] || typeConfig.internal
  const Icon = config.icon
  
  return (
    <Badge 
      variant="outline" 
      className={`${config.className} gap-1 font-medium`}
      data-testid={`badge-tool-type-${type}`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  )
}
