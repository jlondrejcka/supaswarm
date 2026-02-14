"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SetupRequired } from "@/components/setup-required"
import { isSupabaseConfigured } from "@/lib/supabase"
import { ArrowLeft, Save, Zap } from "lucide-react"

function generateSkillId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
}

export default function NewSkillPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    skill_id: "",
    description: "",
    instructions: "",
    version: "1.0.0",
  })

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          skill_id: formData.skill_id || generateSkillId(formData.name),
          description: formData.description,
          instructions: formData.instructions || null,
          version: formData.version || "1.0.0",
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create")
      }

      const data = await res.json()
      router.replace(`/skills/${data.skill.id}`)
    } catch (error) {
      console.error("Failed to create skill:", error)
      alert(error instanceof Error ? error.message : "Failed to create")
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) return <SetupRequired />

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <Link href="/skills" className="text-sm text-muted-foreground hover:underline flex items-center gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Skills
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            New Skill
          </CardTitle>
          <CardDescription>Create a new skill for agents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: e.target.value,
                    skill_id: formData.skill_id || generateSkillId(e.target.value),
                  })
                }
                placeholder="Skill name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill_id">Skill ID *</Label>
              <Input
                id="skill_id"
                value={formData.skill_id}
                onChange={(e) => setFormData({ ...formData, skill_id: e.target.value })}
                placeholder="skill_id"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="What does this skill enable?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <textarea
              id="instructions"
              value={formData.instructions}
              onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
              placeholder="Detailed instructions..."
              className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              placeholder="1.0.0"
            />
          </div>

          <Button onClick={handleSave} disabled={saving || !formData.name || !formData.description}>
            <Save className="h-4 w-4" />
            {saving ? "Creating..." : "Create Skill"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
