"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { supabase } from "@/lib/supabase"
import type { LLMProvider } from "@/lib/supabase-types"
import { Settings, Key, Check, X } from "lucide-react"

export default function SettingsPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchProviders() {
      try {
        const { data, error } = await supabase
          .from("llm_providers")
          .select("*")
          .order("display_name")

        if (error) throw error
        setProviders(data || [])
      } catch (error) {
        console.error("Failed to fetch providers:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchProviders()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Settings</h1>
        <p className="text-muted-foreground">Configure LLM providers and platform settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            LLM Providers
          </CardTitle>
          <CardDescription>
            Configure API keys for AI model providers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-md border">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : providers.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No providers configured</p>
          ) : (
            <div className="space-y-3">
              {providers.map((provider) => (
                <div key={provider.id} className="flex items-center gap-4 p-3 rounded-md border">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`text-provider-${provider.id}`}>
                        {provider.display_name}
                      </span>
                      <Badge variant={provider.is_active ? "default" : "secondary"}>
                        {provider.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Default model: {provider.default_model}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.requires_api_key ? (
                      <Badge variant="outline" className="gap-1">
                        <Key className="h-3 w-3" />
                        API Key Required
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Check className="h-3 w-3" />
                        No Key Needed
                      </Badge>
                    )}
                    <Button variant="outline" size="sm" data-testid={`button-configure-${provider.id}`}>
                      <Settings className="h-4 w-4" />
                      Configure
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>
            General platform configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md border">
              <div>
                <p className="font-medium">Supabase Project</p>
                <p className="text-sm text-muted-foreground font-mono">bgqxccmdcpegvbuxmnrf</p>
              </div>
              <Badge variant="outline">Connected</Badge>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border">
              <div>
                <p className="font-medium">Real-time Updates</p>
                <p className="text-sm text-muted-foreground">Subscribe to task and agent changes</p>
              </div>
              <Badge variant="secondary">Coming Soon</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
