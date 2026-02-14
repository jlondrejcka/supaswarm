"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Play, Pause, Trash2, Clock, CheckCircle, XCircle, StopCircle, ExternalLink } from "lucide-react";

type Agent = {
  id: string;
  name: string;
  slug: string;
};

type ScheduledJob = {
  id: string;
  name: string;
  description: string | null;
  agent_id: string;
  interval_type: string;
  interval_config: Record<string, any>;
  task_message: string;
  task_context: Record<string, any>;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string;
  total_runs: number;
  failed_runs: number;
  created_at: string;
};

type JobTask = {
  id: string;
  status: string;
  created_at: string;
  session_id: string;
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [jobTasks, setJobTasks] = useState<Record<string, JobTask[]>>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formIntervalType, setFormIntervalType] = useState("daily");
  const [formHour, setFormHour] = useState("4");
  const [formMinute, setFormMinute] = useState("0");
  const [formDayOfWeek, setFormDayOfWeek] = useState("1");
  const [formTaskMessage, setFormTaskMessage] = useState("");
  const [formSlackChannel, setFormSlackChannel] = useState("");

  useEffect(() => {
    fetchJobs();
    fetchAgents();
  }, []); // Run once on mount

  // Separate effect for auto-refreshing active tasks
  useEffect(() => {
    if (jobs.length === 0) return;
    
    const interval = setInterval(() => {
      fetchActiveTasks();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [jobs.length]); // Only re-create interval when jobs count changes

  async function fetchJobs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching jobs:", error);
    } else {
      setJobs(data || []);
      // Fetch active tasks with the fresh data
      if (data && data.length > 0) {
        fetchActiveTasksForJobs(data);
      }
    }
    setLoading(false);
  }

  async function fetchActiveTasks() {
    fetchActiveTasksForJobs(jobs);
  }

  async function fetchActiveTasksForJobs(jobsList: ScheduledJob[]) {
    if (jobsList.length === 0) return;

    const jobIds = jobsList.map(j => j.id);
    
    // Get active sessions for these jobs
    const { data: sessions, error: sessionsError } = await supabase
      .from("sessions")
      .select("id, channel_id")
      .eq("channel_type", "cron")
      .in("channel_id", jobIds)
      .in("status", ["active", "idle"]);

    if (sessionsError || !sessions || sessions.length === 0) {
      setJobTasks({});
      return;
    }

    const sessionIds = sessions.map(s => s.id);

    // Get running tasks for these sessions
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, status, created_at, session_id, context")
      .in("session_id", sessionIds)
      .in("status", ["pending", "running", "pending_subtask"]);

    if (tasksError) {
      console.error("Error fetching active tasks:", tasksError);
      return;
    }

    // Group tasks by job_id
    const tasksByJob: Record<string, JobTask[]> = {};
    if (tasks) {
      for (const task of tasks) {
        const session = sessions.find(s => s.id === task.session_id);
        if (session && session.channel_id) {
          if (!tasksByJob[session.channel_id]) {
            tasksByJob[session.channel_id] = [];
          }
          tasksByJob[session.channel_id].push(task);
        }
      }
    }

    setJobTasks(tasksByJob);
  }

  async function fetchAgents() {
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("Error fetching agents:", error);
    } else {
      setAgents(data || []);
      if (data && data.length > 0) {
        setFormAgentId(data[0].id);
      }
    }
  }

  async function handleCreateJob() {
    if (!formName || !formAgentId || !formTaskMessage) {
      alert("Name, agent, and task message are required");
      return;
    }

    const intervalConfig: Record<string, any> = {};
    
    if (formIntervalType === "daily") {
      intervalConfig.hour = parseInt(formHour);
      intervalConfig.minute = parseInt(formMinute);
    } else if (formIntervalType === "weekly") {
      intervalConfig.hour = parseInt(formHour);
      intervalConfig.minute = parseInt(formMinute);
      intervalConfig.day_of_week = parseInt(formDayOfWeek);
    } else if (formIntervalType === "monthly") {
      intervalConfig.hour = parseInt(formHour);
      intervalConfig.minute = parseInt(formMinute);
    }

    const taskContext: Record<string, any> = {};
    if (formSlackChannel) {
      taskContext.delivery_context = {
        channel_type: "slack",
        channel_id: formSlackChannel,
      };
    }

    const { data, error } = await supabase.rpc("upsert_scheduled_job", {
      p_name: formName,
      p_description: formDescription || null,
      p_agent_id: formAgentId,
      p_interval_type: formIntervalType,
      p_interval_config: intervalConfig,
      p_task_message: formTaskMessage,
      p_task_context: taskContext,
      p_is_active: true,
    });

    if (error) {
      console.error("Error creating job:", error);
      alert("Failed to create job");
    } else {
      setIsCreateDialogOpen(false);
      resetForm();
      fetchJobs();
    }
  }

  async function toggleJobActive(jobId: string, currentState: boolean) {
    const { error } = await supabase
      .from("scheduled_jobs")
      .update({ is_active: !currentState })
      .eq("id", jobId);

    if (error) {
      console.error("Error toggling job:", error);
    } else {
      fetchJobs();
    }
  }

  async function deleteJob(jobId: string) {
    if (!confirm("Delete this scheduled job?")) return;

    const { error } = await supabase.rpc("delete_scheduled_job", {
      p_job_id: jobId,
    });

    if (error) {
      console.error("Error deleting job:", error);
    } else {
      fetchJobs();
    }
  }

  async function cancelRunningTasks(jobId: string) {
    const tasks = jobTasks[jobId];
    if (!tasks || tasks.length === 0) {
      alert("No running tasks to cancel");
      return;
    }

    if (!confirm(`Cancel ${tasks.length} running task(s)?`)) return;

    for (const task of tasks) {
      await supabase
        .from("tasks")
        .update({ status: "cancelled" })
        .eq("id", task.id);
    }

    fetchActiveTasks();
  }

  function resetForm() {
    setFormName("");
    setFormDescription("");
    setFormTaskMessage("");
    setFormSlackChannel("");
    setFormIntervalType("daily");
    setFormHour("4");
    setFormMinute("0");
    setFormDayOfWeek("1");
  }

  function formatNextRun(nextRunAt: string) {
    const date = new Date(nextRunAt);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `in ${diffDays}d ${diffHours % 24}h`;
    if (diffHours > 0) return `in ${diffHours}h ${diffMins % 60}m`;
    if (diffMins > 0) return `in ${diffMins}m`;
    return "now";
  }

  function getIntervalLabel(intervalType: string, intervalConfig: Record<string, any>) {
    switch (intervalType) {
      case "minutely":
        return "Every minute";
      case "hourly":
        return "Every hour";
      case "daily":
        return `Daily at ${intervalConfig.hour || 0}:${String(intervalConfig.minute || 0).padStart(2, "0")}`;
      case "weekly":
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return `Weekly on ${days[intervalConfig.day_of_week || 1]} at ${intervalConfig.hour || 0}:${String(intervalConfig.minute || 0).padStart(2, "0")}`;
      case "monthly":
        return `Monthly at ${intervalConfig.hour || 0}:${String(intervalConfig.minute || 0).padStart(2, "0")}`;
      default:
        return intervalType;
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Scheduled Jobs</h1>
          <p className="text-muted-foreground mt-1">Create recurring tasks that run on a schedule</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Job
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Scheduled Job</DialogTitle>
              <DialogDescription>Configure a recurring task that runs automatically</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Job Name</Label>
                <Input
                  id="name"
                  placeholder="Daily Weather Report"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Get weather and send to Slack"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent">Agent</Label>
                <Select value={formAgentId} onValueChange={setFormAgentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interval">Schedule</Label>
                <Select value={formIntervalType} onValueChange={setFormIntervalType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutely">Every Minute</SelectItem>
                    <SelectItem value="hourly">Every Hour</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formIntervalType === "daily" || formIntervalType === "weekly" || formIntervalType === "monthly") && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hour">Hour (0-23)</Label>
                    <Input
                      id="hour"
                      type="number"
                      min="0"
                      max="23"
                      value={formHour}
                      onChange={(e) => setFormHour(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minute">Minute (0-59)</Label>
                    <Input
                      id="minute"
                      type="number"
                      min="0"
                      max="59"
                      value={formMinute}
                      onChange={(e) => setFormMinute(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {formIntervalType === "weekly" && (
                <div className="space-y-2">
                  <Label htmlFor="dayOfWeek">Day of Week</Label>
                  <Select value={formDayOfWeek} onValueChange={setFormDayOfWeek}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                      <SelectItem value="0">Sunday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="message">Task Message</Label>
                <Input
                  id="message"
                  placeholder="Get the weather forecast and send it to me"
                  value={formTaskMessage}
                  onChange={(e) => setFormTaskMessage(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slack">Slack Channel (optional)</Label>
                <Input
                  id="slack"
                  placeholder="C12345678 or #general"
                  value={formSlackChannel}
                  onChange={(e) => setFormSlackChannel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Leave empty to skip Slack delivery</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateJob}>Create Job</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No scheduled jobs</h3>
            <p className="text-muted-foreground mb-4">Create your first recurring task</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>{job.name}</CardTitle>
                      {job.is_active ? (
                        <Badge variant="default" className="bg-green-500">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Paused</Badge>
                      )}
                    </div>
                    {job.description && (
                      <CardDescription className="mt-1">{job.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleJobActive(job.id, job.is_active)}
                    >
                      {job.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteJob(job.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Schedule:</span>{" "}
                      <span className="font-medium">{getIntervalLabel(job.interval_type, job.interval_config)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Next run:</span>{" "}
                      <span className="font-medium">{formatNextRun(job.next_run_at)}</span>
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Task:</span>{" "}
                    <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{job.task_message}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        {job.total_runs} runs
                      </div>
                      {job.failed_runs > 0 && (
                        <div className="flex items-center gap-1">
                          <XCircle className="h-4 w-4 text-red-500" />
                          {job.failed_runs} failed
                        </div>
                      )}
                    </div>
                    {jobTasks[job.id] && jobTasks[job.id].length > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                          {jobTasks[job.id].length} running
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelRunningTasks(job.id)}
                          className="h-7"
                        >
                          <StopCircle className="mr-1 h-3 w-3" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  {jobTasks[job.id] && jobTasks[job.id].length > 0 && (
                    <div className="border-t pt-3 mt-2">
                      <div className="text-xs font-medium mb-2 text-muted-foreground">Active Tasks:</div>
                      <div className="space-y-1">
                        {jobTasks[job.id].map((task) => (
                          <div key={task.id} className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="text-xs">
                              {task.status}
                            </Badge>
                            <a
                              href={`/tasks/${task.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                            >
                              {task.id.slice(0, 8)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <span className="text-muted-foreground">
                              {new Date(task.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
