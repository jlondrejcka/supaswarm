# SupaSwarm Design Guidelines

## Design Approach

**System:** Linear/Vercel-inspired developer dashboard aesthetic
**Rationale:** Developer-focused, data-intensive monitoring platform requiring clarity, efficiency, and real-time observability. Function over decoration, but with refined polish.

**Core Principles:**
- Information density without clutter
- Instant visual feedback for real-time updates
- Scannable hierarchies for complex task trees
- Developer-centric efficiency

---

## Typography System

**Font Family:** Inter (Google Fonts CDN)

**Hierarchy:**
- Page Headers: text-2xl to text-3xl, font-semibold
- Section Headers: text-lg, font-semibold
- Card/Component Titles: text-base, font-medium
- Body Text: text-sm, font-normal
- Secondary/Metadata: text-xs, font-normal
- Code/Technical: JetBrains Mono for IDs, slugs, JSON (text-xs/sm, font-mono)

---

## Layout System

**Spacing Primitives:** Tailwind units of 2, 4, 6, 8, 12, 16
- Component padding: p-4 to p-6
- Section gaps: gap-4 to gap-8
- Card spacing: space-y-4
- Generous whitespace between major sections: mb-8 to mb-12

**Container Strategy:**
- Dashboard shell: Full viewport with fixed sidebar
- Content areas: max-w-7xl with px-6 to px-8
- Forms/Detail views: max-w-4xl centered

---

## Core Layout Structure

### Navigation
**Left Sidebar (fixed, w-64):**
- Logo/branding at top (h-16)
- Primary navigation sections with icons (Heroicons):
  - Dashboard (home icon)
  - Tasks (queue-list icon)
  - Agents (user-group icon)
  - Tools (wrench-screwdriver icon)
  - Skills (academic-cap icon)
  - Settings (cog icon)
- Active states with subtle background treatment
- Collapsible for mobile

**Top Bar (sticky):**
- Breadcrumb navigation for nested views
- Real-time status indicator (pulsing dot)
- User menu (right-aligned)
- Quick actions dropdown

### Main Content Area
**Dashboard View:**
- Stats overview cards (4-column grid on desktop, 2 on tablet, 1 on mobile)
- Recent activity timeline (2-column: timestamp + content)
- Active master jobs table with expandable rows

**List Views (Tasks/Agents/Tools):**
- Filters bar (sticky below top bar): search, status dropdowns, date range
- Data table with sortable columns
- Row actions (3-dot menu, right-aligned)
- Pagination footer

**Detail Views:**
- Two-column layout (60/40 split on desktop):
  - Left: Primary content (form/details)
  - Right: Metadata sidebar (timestamps, relationships, actions)
- Tabbed sections for complex entities (Overview, Logs, Subtasks, Configuration)

---

## Component Library

### Cards
- Rounded corners (rounded-lg)
- Subtle border treatment
- Padding: p-4 to p-6
- Hover state for interactive cards (slight elevation change)
- Header with title + action button pattern

### Status Badges
**Task Statuses:** Small pills (px-2 py-1, rounded-full, text-xs, font-medium)
- Pending, Running, Pending Subtask, Needs Review, Completed, Failed, Cancelled
- Icon + text for critical states (running, failed)

### Tables
- Zebra striping for readability
- Fixed header row (sticky)
- Monospace for IDs/slugs
- Expandable rows for nested data (chevron indicator)
- Empty states with centered illustration placeholder + CTA

### Forms
- Label above input pattern
- Full-width inputs with consistent height (h-10)
- Helper text below inputs (text-xs)
- Grouped sections with dividers (border-t, pt-6, mt-6)
- Inline validation messages
- Sticky action footer for long forms

### Real-time Updates
- Toast notifications (top-right corner, stack vertically)
- Pulsing indicators on active tasks
- Live log streaming area (max-h-96, overflow-auto, monospace, line numbers)
- WebSocket connection status banner (when disconnected)

### Data Visualization
**Task Hierarchy Tree:**
- Indented structure with connecting lines
- Expand/collapse controls
- Status indicators at each level
- Depth levels visually distinct via indentation (ml-6 per level)

**Agent Configuration:**
- Two-panel layout: available tools (left) vs assigned tools (right)
- Drag-to-assign or click-to-toggle pattern
- Tool cards showing name, type badge, and connection status

### Modals/Overlays
- Centered modal (max-w-2xl)
- Backdrop blur
- Close button (top-right)
- Sticky header and footer for scrollable content
- Slide-out panels for quick edits (from right, w-1/3)

---

## Icons
**Library:** Heroicons (outline style for navigation, solid for inline indicators)
**CDN:** Link in HTML head

**Key Icon Mappings:**
- Tasks: QueueListIcon
- Agents: UserGroupIcon
- Tools: WrenchScrewdriverIcon
- Skills: AcademicCapIcon
- Success: CheckCircleIcon
- Error: XCircleIcon
- Running: ArrowPathIcon (with rotation animation)
- Review: ExclamationTriangleIcon

---

## Responsive Behavior

**Breakpoints:**
- Mobile (base): Stacked layouts, collapsed sidebar (hamburger menu)
- Tablet (md): 2-column grids, persistent sidebar
- Desktop (lg+): Full multi-column layouts, fixed sidebar

**Mobile Priorities:**
- Bottom navigation bar for primary actions
- Collapsible filter sections
- Full-width cards
- Simplified tables (hide secondary columns, tap to expand)

---

## Accessibility

- Focus indicators on all interactive elements (ring-2)
- ARIA labels for icon-only buttons
- Proper heading hierarchy (h1 → h2 → h3)
- Keyboard navigation for tables and trees
- Loading states with sr-only text
- Sufficient contrast for all text (WCAG AA)

---

## Images
**Not Applicable** - This is a data-intensive dashboard application. All visual communication through typography, data visualization, and iconography. No hero images or decorative photography needed.