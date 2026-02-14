"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    // Exchange code for session and redirect
    router.push("/")
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Confirming your email...</h1>
        <p className="text-muted-foreground">You'll be redirected shortly.</p>
      </div>
    </div>
  )
}
