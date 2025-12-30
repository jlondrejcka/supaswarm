# Task 3: Dashboard Leaderboard

## Goal
Add usage leaderboards showing most-used Agents, Skills, and Tools

## Data Sources
- **Agents**: COUNT tasks per agent from `tasks` table
- **Skills**: COUNT DISTINCT task_id from `task_messages` WHERE type='skill_load'
- **Tools**: COUNT from `task_messages` WHERE type='tool_call', extract `metadata.tool_name`

## Implementation
1. Add leaderboard state to dashboard page
2. Query task_messages for skill/tool usage
3. Query tasks for agent usage  
4. Display in 3 leaderboard cards (Agent, Skill, Tool)

## Progress
- [x] Analyzed database schema
- [x] Found task_messages has tool_call (3) and skill_load (1461) entries
- [x] Add queries to dashboard
- [x] Build leaderboard UI
- [x] Fixed: skill count now uses unique tasks (not total loads)
- [x] Tested - working!

## Skill Usage Tracking

### Current Implementation
- Count DISTINCT task_id WHERE status='completed' per skill
- Shows "skill contributed to successful task completion"
- SpongeBob Joke Writer: 9 completed tasks

### What counts as "skill used"
- Skill was loaded into agent context
- Task completed successfully
- This means skill contributed to output (was available during generation)

### Future options if needed
- **Semantic analysis** - detect skill-specific patterns in output
- **Explicit tracking** - add `skill_used` message type when skill influences response

## Notes
- tool_call metadata: `metadata.tool_name` (e.g. "exa-search__Exa_Search")
- skill_load content: `content.skill_name`, task_id for unique counting

