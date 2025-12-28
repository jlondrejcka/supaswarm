import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Key } from "lucide-react"

export function SetupRequired() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            <CardTitle>Setup Required</CardTitle>
          </div>
          <CardDescription>
            Supabase connection needs to be configured
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            To connect this dashboard to your Supabase project, you need to add the anonymous API key.
          </p>
          <div className="p-3 rounded-md bg-muted">
            <div className="flex items-center gap-2 mb-2">
              <Key className="h-4 w-4" />
              <span className="font-medium text-sm">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Find this in your Supabase dashboard under Project Settings &gt; API &gt; Project API keys &gt; anon/public key
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Add this as a secret in your Replit environment to continue.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
