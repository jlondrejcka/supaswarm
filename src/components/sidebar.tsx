"use client"

import { createContext, useContext, useState, ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  ListTodo, 
  Bot, 
  Wrench, 
  Zap, 
  Settings,
  Users,
  PanelLeftClose,
  PanelLeft
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ThemeToggle } from "@/components/theme-toggle"

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/tasks", icon: ListTodo, label: "Tasks" },
  { href: "/agents", icon: Bot, label: "Agents" },
  { href: "/tools", icon: Wrench, label: "Tools" },
  { href: "/skills", icon: Zap, label: "Skills" },
  { href: "/reviews", icon: Users, label: "Reviews" },
]

interface SidebarContextType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextType | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true)
  
  const toggle = () => setCollapsed(!collapsed)
  
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function SidebarTrigger() {
  const { collapsed, toggle } = useSidebar()
  
  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={toggle}
      data-testid="button-sidebar-toggle"
    >
      {collapsed ? (
        <PanelLeft className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </Button>
  )
}

function NavLink({ 
  href, 
  icon: Icon, 
  label, 
  isActive, 
  collapsed 
}: { 
  href: string
  icon: typeof LayoutDashboard
  label: string
  isActive: boolean
  collapsed: boolean
}) {
  const linkContent = (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        collapsed && "justify-center px-2",
        isActive 
          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      )}
      data-testid={`link-nav-${label.toLowerCase()}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  )
  
  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          {linkContent}
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }
  
  return linkContent
}

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed } = useSidebar()

  return (
    <div 
      className={cn(
        "flex h-full flex-col border-r bg-sidebar transition-all duration-300",
        collapsed ? "w-14" : "w-60"
      )}
    >
      <div className={cn(
        "flex h-14 items-center gap-2 border-b px-4",
        collapsed && "justify-center px-2"
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sidebar-foreground" data-testid="text-app-title">
            SupaSwarm
          </span>
        )}
      </div>
      
      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/" && pathname.startsWith(item.href))
            
            return (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                isActive={isActive}
                collapsed={collapsed}
              />
            )
          })}
        </nav>
        
        <Separator className="my-4" />
        
        <nav className="space-y-1 px-2">
          <NavLink
            href="/settings"
            icon={Settings}
            label="Settings"
            isActive={pathname === "/settings"}
            collapsed={collapsed}
          />
          <div className={cn(
            "flex items-center rounded-md px-3 py-2",
            collapsed && "justify-center px-2"
          )}>
            {collapsed ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <div>
                    <ThemeToggle />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Toggle theme
                </TooltipContent>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-3 w-full">
                <ThemeToggle />
                <span className="text-sm text-sidebar-foreground/70">Theme</span>
              </div>
            )}
          </div>
        </nav>
      </ScrollArea>
    </div>
  )
}
