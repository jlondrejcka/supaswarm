import { Button } from "@/components/ui/button"
import { Plus, LucideIcon } from "lucide-react"

interface PageHeaderProps {
  title: string
  description?: string
  actionLabel?: string
  actionIcon?: LucideIcon
  onAction?: () => void
  children?: React.ReactNode
}

export function PageHeader({ 
  title, 
  description, 
  actionLabel, 
  actionIcon: ActionIcon = Plus,
  onAction,
  children 
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="page-title">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1" data-testid="page-description">
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {children}
        {actionLabel && onAction && (
          <Button onClick={onAction} data-testid="button-page-action">
            <ActionIcon className="h-4 w-4 mr-2" />
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
