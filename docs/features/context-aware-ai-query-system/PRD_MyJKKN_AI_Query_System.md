# PRD: MyJKKN Context-Aware AI Query System

| Field       | Detail                                                  |
| :---------- | :------------------------------------------------------ |
| **Version** | [cite_start]1.0 [cite: 2497]                            |
| **Created** | [cite_start]November 29, 2025 [cite: 2497]              |
| **Author**  | [cite_start]Ommsharravana (Director, JKKN) [cite: 2497] |
| **Status**  | [cite_start]Ready for Build [cite: 2497]                |

---

## Section 1: The Problem

### 1.1 Problem Statement

[cite_start]Currently, MyJKKN users (5,200 learners, faculty, and staff across 7 colleges and 2 Schools) struggle with finding and acting on institutional data[cite: 2500]. [cite_start]This is because the current dropdown/filter UI requires users to know which filters exist, what valid values are, and forces multi-step processes for even simple queries[cite: 2500].

[cite_start]This matters because users spend 5-10 minutes on tasks that should take 30 seconds [cite: 2501][cite_start], complex cross-entity queries are impossible [cite: 2501][cite_start], and users don't discover what data is available to them[cite: 2501].

### 1.2 Problem Breakdown

| Component                              | Struggle/Reason                                                                                                                                                                                                                                                                                                      |
| :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WHO is struggling?**                 | [cite_start]All MyJKKN users—learners, faculty, HODs, and admins[cite: 2503, 2504].                                                                                                                                                                                                                                  |
| **WHAT are they struggling with?**     | [cite_start]Finding specific data requires knowing which page has which filters [cite: 2506][cite_start], complex queries are impossible (e.g., "learners below 75% attendance who haven't paid fees") [cite: 2507][cite_start], and the system repeatedly requests context (department, year, section)[cite: 2509]. |
| **WHY is it hard right now?**          | [cite_start]Traditional dropdown UI is designed for developers, not end users [cite: 2512][cite_start], there is no natural language interface [cite: 2513][cite_start], the system doesn't remember user context [cite: 2514][cite_start], and data viewing and actions are separated[cite: 2515].                  |
| **WHAT happens if we don't fix this?** | [cite_start]Staff waste 3-5 hours/week on data retrieval [cite: 2518][cite_start], important patterns go unnoticed [cite: 2519][cite_start], user adoption plateaus [cite: 2520][cite_start], and the IT team is overwhelmed with report requests[cite: 2521].                                                       |

---

## Section 2: Why This Matters

### 2.1 Value to Users

| Metric              | Before AI Query                       | After AI Query                                                        | Savings                                                         |
| :------------------ | :------------------------------------ | :-------------------------------------------------------------------- | :-------------------------------------------------------------- |
| **Time per Lookup** | [cite_start]5-10 minutes [cite: 2531] | [cite_start]30 seconds [cite: 2532]                                   | [cite_start]~7 minutes saved per power user lookup [cite: 2533] |
| **Monthly Hours**   | N/A                                   | [cite_start]1,750 hours/month saved (for 50 power users) [cite: 2534] |

**What users can do AFTER this feature:**

- [cite_start]Ask questions in plain English and get instant answers with real data[cite: 2526].
- [cite_start]Run complex cross-entity queries without knowing database structure[cite: 2527].
- [cite_start]Take immediate action on query results (send SMS, create tickets, export)[cite: 2528].
- [cite_start]Get context-aware responses (system knows who they are, their role, their department)[cite: 2529].

[cite_start]**Real-world example:** Dr. Priya (HOD, Mechanical Engineering) currently spends 20 minutes manually checking attendance defaulters[cite: 2535, 2536]. [cite_start]With this feature, she can type "Show me Mechanical learners below 75% attendance" and get an actionable list in 10 seconds with a one-click "Send Warning SMS" option[cite: 2537].

### 2.2 Value to Business

- [cite_start]**Revenue impact:** Premium analytics and AI features justify higher pricing for enterprise/institutional licenses[cite: 2539]. [cite_start]Estimated **20% price increase potential** for "AI-powered campus management"[cite: 2540].
- [cite_start]**Churn reduction:** Directly addresses the concerns of 3 pilot institutions that requested "easier data access," one of which is evaluating a competitor with a chat interface[cite: 2541, 2542].
- [cite_start]**Competitive advantage:** Provides a **first-mover advantage** as no competing ERP in the Indian education market has a context-aware AI query interface[cite: 2543, 2544].

---

## Section 3: Evidence

### Customer Evidence

| Type          | Evidence                                                                                                             | Source                                                                      |
| :------------ | :------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------- |
| Quote         | [cite_start]"I spend more time finding data than analyzing it" [cite: 2547]                                          | [cite_start]Dr. Priya, HOD Mechanical, User Interview Oct 2025 [cite: 2547] |
| Quote         | [cite_start]"Can you just tell me which learners are at risk? I don't want to click through 10 screens" [cite: 2547] | [cite_start]Prof. Kumar, Faculty, Support Ticket #4521 [cite: 2547]         |
| Request count | [cite_start]47 faculty have requested "easier reporting" in the last 6 months [cite: 2547]                           | [cite_start]Support system analysis [cite: 2547]                            |
| Request count | [cite_start]12 "pull this report for me" requests to IT per week [cite: 2547]                                        | [cite_start]IT ticket tracking [cite: 2547]                                 |

### Usage Data

| Metric             | Finding                                                                                       |
| :----------------- | :-------------------------------------------------------------------------------------------- |
| Filter abandonment | [cite_start]34% of users who open a filter dropdown don't complete the query [cite: 2549]     |
| Page navigation    | [cite_start]Average 4.2 page visits to complete one data lookup task [cite: 2549]             |
| Export usage       | [cite_start]Only 8% of users have ever used the Export feature (hidden, complex) [cite: 2549] |
| Search attempts    | [cite_start]23% of users try typing in filter dropdowns (expecting search) [cite: 2549]       |

### Competitive Analysis

| Competitor       | Has AI Query?                | How They Do It                                       |
| :--------------- | :--------------------------- | :--------------------------------------------------- |
| Fedena           | [cite_start]No [cite: 2551]  | [cite_start]Traditional filters only [cite: 2551]    |
| Entab            | [cite_start]No [cite: 2551]  | [cite_start]Traditional filters only [cite: 2551]    |
| MasterSoft       | [cite_start]No [cite: 2551]  | [cite_start]Traditional filters only [cite: 2551]    |
| Notion (general) | [cite_start]Yes [cite: 2551] | [cite_start]AI query across workspace [cite: 2551]   |
| Salesforce       | [cite_start]Yes [cite: 2551] | [cite_start]Einstein AI for CRM queries [cite: 2551] |

### Support Burden

| Metric                                     | Data                                                                                              |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------ |
| "How do I find X" tickets (last 3 months)  | [cite_start]156 [cite: 2553]                                                                      |
| "Can you run this report for me" tickets   | [cite_start]89 [cite: 2553]                                                                       |
| Average time spent per data-request ticket | [cite_start]25 minutes [cite: 2553]                                                               |
| Common complaint themes                    | [cite_start]"Too many clicks", "Can't find the filter", "Need cross-department view" [cite: 2553] |

---

## Section 4: User Stories

| ID          | Role                  | Goal                                                                                                                                                                                                                                   | Context                                                                                                  |
| :---------- | :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| **Story 1** | **learner**           | [cite_start]To ask questions about my academic data in plain English [cite: 2556][cite_start], so that I can quickly check my attendance, fees, results without navigating multiple pages[cite: 2556]. [cite_start]                    | learners check their data 3-5 times per week[cite: 2557].                                                |
| **Story 2** | **Faculty**           | [cite_start]To query my class data by typing questions like "which learners missed last 3 classes" [cite: 2559][cite_start], so that I can identify at-risk learners without manually cross-referencing attendance sheets[cite: 2559]. | [cite_start]Faculty can't spend 10 minutes on each query[cite: 2561].                                    |
| **Story 3** | **HOD**               | [cite_start]To run complex department-wide queries like "show me final year learners with CGPA below 6 who haven't registered for placement" [cite: 2563][cite_start], so that I can intervene before it's too late[cite: 2563].       | [cite_start]HODs are responsible for department outcomes but currently lack proactive tools[cite: 2564]. |
| **Story 4** | **Admin**             | [cite_start]To query any data across all 7 colleges without restrictions [cite: 2566][cite_start], so that I can generate institution-wide reports and identify cross-college patterns[cite: 2566].                                    | [cite_start]Admins currently must log into each college's view separately[cite: 2567].                   |
| **Story 5** | **Any User - Action** | [cite_start]To take immediate action on results (send notification, export, create ticket) [cite: 2569][cite_start], so that I don't have to copy data and navigate to another page to act on it[cite: 2569].                          | [cite_start]Acting on data currently requires separate workflows[cite: 2570].                            |

---

## Section 5: Features

### 5.1 Must-Have Features (P0)

| ID      | Feature Name                  | Description                                                                                                                      | Serves Stories                      |
| :------ | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------- |
| **F01** | **Chat Query Interface**      | [cite_start]Text input on data pages where users type natural language queries[cite: 2573].                                      | [cite_start]1, 2, 3, 4 [cite: 2573] |
| **F02** | **Context Injection**         | [cite_start]System automatically includes logged-in user's context (role, department, permissions) with every query[cite: 2573]. | [cite_start]1, 2, 3, 4 [cite: 2573] |
| **F03** | **Query Execution via MCP**   | [cite_start]Claude interprets query, calls MCP tools, MCP calls MyJKKN API, returns real data[cite: 2573].                       | [cite_start]1, 2, 3, 4 [cite: 2573] |
| **F04** | **Role-Based Filtering**      | [cite_start]MCP automatically filters results based on user's role and permissions[cite: 2573].                                  | [cite_start]1, 2, 3, 4 [cite: 2573] |
| **F05** | **Result Actions (Tier 1-2)** | [cite_start]One-click actions on query results: Export CSV, Send Notification, Create Ticket[cite: 2573].                        | [cite_start]5 [cite: 2573]          |

### 5.2 Nice-to-Have Features (P1)

| ID      | Feature Name          | Description                                                                    | Why Not P0                                                              |
| :------ | :-------------------- | :----------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| **F06** | **Admin MCP Layer**   | [cite_start]Separate full-access MCP for admins with no filtering[cite: 2575]. | [cite_start]Admins are few, can use standard MCP initially[cite: 2575]. |
| **F07** | **Query History**     | [cite_start]Save and repeat previous queries[cite: 2575].                      | [cite_start]Useful but not launch-critical[cite: 2575].                 |
| **F08** | **Suggested Queries** | [cite_start]Show example queries based on current page context[cite: 2575].    | [cite_start]Enhancement after core works[cite: 2575].                   |
| **F09** | **Voice Input**       | [cite_start]Speak queries instead of typing[cite: 2575].                       | [cite_start]Accessibility enhancement for v2[cite: 2575].               |

### 5.3 Future Features (P2)

| ID      | Feature Name                       | Description                                                                  | Why Later                                                  |
| :------ | :--------------------------------- | :--------------------------------------------------------------------------- | :--------------------------------------------------------- |
| **F10** | **Scheduled Queries**              | [cite_start]Run query automatically daily/weekly, email results[cite: 2577]. | [cite_start]Complex scheduling infrastructure[cite: 2577]. |
| **F11** | **Query Sharing**                  | [cite_start]Share a query with colleagues[cite: 2577].                       | [cite_start]Needs permission model[cite: 2577].            |
| **F12** | **Custom Dashboards from Queries** | [cite_start]Save query results as dashboard widget[cite: 2577].              | [cite_start]Requires dashboard framework[cite: 2577].      |
| **F13** | **Cross-Institution Queries**      | [cite_start]Query across all 7 colleges simultaneously[cite: 2577].          | [cite_start]Data federation complexity[cite: 2577].        |

# PRD: MyJKKN Context-Aware AI Query System - Part 2

## Section 6: User Flow

### 6.1 Happy Path: learner Checks Attendance

[cite_start]**Starting Point:** learner is logged into MyJKKN and is on the Dashboard page[cite: 2580].

| Step  | User Action                                 | System Response                                   | What User Sees                                                                                                                                             |
| :---- | :------------------------------------------ | :------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | Views Dashboard                             | Page loads with existing widgets + new chat input | [cite_start]Dashboard with chat input bar at bottom, placeholder: "Ask me anything about your academics..." [cite: 2582]                                   |
| **3** | Types "What's my attendance this semester?" | Text appears in input field                       | [cite_start]Their typed query [cite: 2582]                                                                                                                 |
| **6** | Views response                              | Response appears in chat area                     | [cite_start]"Your attendance this semester: **78.5%** (47 of 60 classes attended). You're above the 75% requirement. [View Details] [Export]" [cite: 2582] |
| **7** | Clicks "View Details"                       | Expands to show subject-wise breakdown            | [cite_start]Table: Subject, Attended, Total, Percentage [cite: 2582]                                                                                       |

**Behind the Scenes (System Processing):**

1. [cite_start]User context attached: `{user_id: "22PH045", role: "learner", institution_id: 3, ...}`[cite: 2607].
2. [cite_start]Query sent to Claude API with MCP tools available[cite: 2608].
3. [cite_start]Claude calls: `get_learner_attendance(learner_id="22PH045", semester="current")`[cite: 2610].
4. [cite_start]API returns attendance data[cite: 2612].
5. [cite_start]Claude formats the response[cite: 2613].

### 6.2 Happy Path: Faculty Queries Class Data

| Step  | User Action                                       | System Response                    | What User Sees                                                                                                             |
| :---- | :------------------------------------------------ | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| **2** | Types "Which learners have below 75% attendance?" | Query entered                      | [cite_start]Their typed query [cite: 2629]                                                                                 |
| **4** | Views response                                    | Filtered list returned             | [cite_start]"12 learners have attendance below 75%:" followed by table with names, roll numbers, attendance % [cite: 2629] |
| **5** | Sees action options                               | Response includes actions          | [cite_start]Action buttons: [Send Warning SMS] [Email List to Self] [Export CSV] [cite: 2629]                              |
| **6** | Clicks "Send Warning SMS"                         | Tier 2 action - confirmation shown | [cite_start]"Send attendance warning to 12 learners? [Send Now] [Cancel]" [cite: 2629]                                     |

### 6.3 Happy Path: learner Reports Broken Desk (Action Flow)

| Step  | User Action                               | System Response             | What User Sees                                                                                                              |
| :---- | :---------------------------------------- | :-------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **1** | Types "Desk broken in my learning studio" | Query submitted             | [cite_start]Their message [cite: 2632]                                                                                      |
| **3** | Views response                            | Tier 1 action auto-executed | [cite_start]"✓ Complaint #4521 created for Room PH-302... [Send Notification] [Just Track]" [cite: 2632]                    |
| **4** | Clicks "Send Notification"                | Tier 2 action executed      | [cite_start]"✓ Mr. Venkat (Pharmacy Block Maintenance) notified via SMS. Expected resolution: 2 working days." [cite: 2632] |

**Context Used (User Didn't Provide):**

- [cite_start]learner's assigned learning studio: PH-302 (from session)[cite: 2634].
- [cite_start]learning studio's maintenance person: Mr. Venkat (from room-staff mapping)[cite: 2635].

### 6.4 Alternative Flows

- [cite_start]**Ambiguous Query:** If the user types "attendance," the System asks a clarifying question: "Would you like to see: [My Attendance] [Class Attendance] [Department Attendance]"[cite: 2639].
- [cite_start]**Permission Denied:** If a learner tries a faculty query, the System shows: "This information is only available to faculty and administrators." and **DOES NOT reveal that the data exists**[cite: 2647, 2648].

---

## Section 7: Edge Cases

| ID                         | What Should Happen                                                                 | Priority                      | Message to User (Example)                                                                                            |
| :------------------------- | :--------------------------------------------------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| **E01 (No Data)**          | [cite_start]Show empty state with helpful suggestion[cite: 2652].                  | [cite_start]High [cite: 2652] | [cite_start]"No results found. Try: [alternative query suggestion]" [cite: 2652]                                     |
| **E03 (>10 seconds)**      | [cite_start]Show extended loading, allow cancel[cite: 2652].                       | [cite_start]High [cite: 2652] | [cite_start]"Still working on this... [Cancel]" [cite: 2652]                                                         |
| **E06 (Restricted Data)**  | [cite_start]Return permission error **without revealing data exists**[cite: 2652]. | [cite_start]High [cite: 2652] | [cite_start]"This information is only available to [role]." [cite: 2652]                                             |
| **E07 (Can't Understand)** | [cite_start]Ask for clarification[cite: 2652].                                     | [cite_start]High [cite: 2652] | [cite_start]"I didn't understand that. Could you rephrase? Example: 'Show my attendance this semester'" [cite: 2652] |
| **E13 (Bulk Action)**      | [cite_start]Require explicit confirmation[cite: 2652].                             | [cite_start]High [cite: 2652] | [cite_start]"This will notify 147 learners. Are you sure? [Yes, Send to All] [Cancel]" [cite: 2667]                  |

---

## Section 8: Business Rules

### 8.1 Access & Permissions (Role-Based Filtering)

| Rule                    | IF                                   | THEN                                                                                                    |
| :---------------------- | :----------------------------------- | :------------------------------------------------------------------------------------------------------ |
| **learner data access** | User role = learner                  | [cite_start]Can only query **own data** (attendance, fees, results, complaints)[cite: 2671].            |
| **Faculty data access** | User role = faculty                  | [cite_start]Can query own data + learners in **assigned courses**[cite: 2671].                          |
| **HOD data access**     | User role = HOD                      | [cite_start]Can query own data + all learners/faculty in **department**[cite: 2671].                    |
| **Staff privacy**       | Any user queries staff personal data | [cite_start]Block personal info (salary, address), allow professional info (office, email)[cite: 2671]. |

### 8.3 Action Tier Assignment

| Action                                     | Tier | Confirmation Rule                                                                      |
| :----------------------------------------- | :--- | :------------------------------------------------------------------------------------- |
| View own attendance/fees/results           | 1    | [cite_start]None (auto-execute) [cite: 2675]                                           |
| Create own complaint                       | 1    | [cite_start]None [cite: 2675]                                                          |
| Send notification to individual            | 2    | [cite_start]Show action description, require one-click confirmation [cite: 2673, 2675] |
| Send notification to group (>50)           | 3    | [cite_start]Show full details, require explicit confirmation [cite: 2673, 2675]        |
| Delete any record / Financial transactions | 4    | [cite_start]Do not execute, suggest contacting admin [cite: 2673, 2675]                |

### 8.4 Query Rate Limits

- [cite_start]If user makes **>30 queries in 5 minutes**, block new queries for 60 seconds[cite: 2677].
- [cite_start]If query would return **>10,000 rows**, paginate and offer to export instead of display[cite: 2677].

---

## Section 11: Success Metrics

### 11.1 Quantitative Goals

| Metric                       | Target                                                                        | Measurement Method                                                   |
| :--------------------------- | :---------------------------------------------------------------------------- | :------------------------------------------------------------------- |
| **Adoption**                 | [cite_start]40% of active users try chat within first month[cite: 2796].      | [cite_start]Track `chat_query_submitted` event[cite: 2796].          |
| **Retention**                | [cite_start]60% of users who try chat use it again within 7 days[cite: 2796]. | [cite_start]Track repeat `chat_query_submitted` by user[cite: 2796]. |
| **Query success rate**       | [cite_start]85% of queries return useful results[cite: 2796].                 | [cite_start]Track `query_understood` vs `query_failed`[cite: 2796].  |
| **Time to answer**           | [cite_start]Average **<3 seconds** from submit to response[cite: 2796, 2906]. | [cite_start]Track response latency[cite: 2796].                      |
| **Support ticket reduction** | [cite_start]**30% reduction** in "how do I find X" tickets[cite: 2796].       | [cite_start]Compare ticket categories before/after[cite: 2796].      |

---

## Section 12: Non-Goals & Scope Boundaries

### 12.1 Not Building in This Version

| Feature                          | Why Not                                                                          | Future Plans                                       |
| :------------------------------- | :------------------------------------------------------------------------------- | :------------------------------------------------- |
| **General chatbot conversation** | [cite_start]This is query execution, not conversation[cite: 2805].               | [cite_start]Never (different product)[cite: 2803]. |
| **Voice input**                  | [cite_start]Adds complexity, accessibility enhancement[cite: 2803]. [cite_start] | v2[cite: 2803].                                    |
| **Query history/favorites**      | [cite_start]Not launch-critical[cite: 2803]. [cite_start]                        | v1.1[cite: 2803].                                  |
| **Cross-institution queries**    | [cite_start]Data federation is complex[cite: 2803]. [cite_start]                 | v2[cite: 2803].                                    |

### 12.2 Explicit Constraints

- [cite_start]DO NOT build **general conversational AI**—every interaction must be about querying/acting on MyJKKN data[cite: 2805].
- [cite_start]DO NOT allow **free-form data modification** through chat—all writes go through controlled action endpoints[cite: 2806].
- [cite_start]DO NOT expose **raw SQL or API endpoints** to users[cite: 2807].
- [cite_start]DO NOT allow **file uploads** in chat (v1)[cite: 2809].
- [cite_start]DO NOT offer **predictions** (e.g., "Can it predict my grades?")—only current data[cite: 2814].

---

## Section 13: Technical Context

### 13.1 Existing Technology

- [cite_start]**MyJKKN Current Stack:** Frontend: React (Next.js), Backend: Node.js (Express), Database: PostgreSQL, API: REST endpoints exist for all major entities[cite: 2820, 2821, 2822, 2823, 2825].
- [cite_start]**New Technology:** LLM: **Claude API (Anthropic)** [cite: 2827][cite_start], Tool Calling: **MCP (Model Context Protocol)**[cite: 2828].

### 13.2 Architecture Overview

[cite_start]The flow is: **User Interface** $\rightarrow$ **Query Interpreter** (Claude API with MCP tools) $\rightarrow$ **MCP Layer** (Handles permission filtering and tool calls) $\rightarrow$ **MyJKKN API** (Existing REST endpoints) $\rightarrow$ **Database** (PostgreSQL)[cite: 2832, 2837, 2845, 2852, 2859].

### 13.3 MCP Tools Required

| Tool                     | Tier | Description                                            | Parameters                                                             |
| :----------------------- | :--- | :----------------------------------------------------- | :--------------------------------------------------------------------- |
| `get_learner_attendance` | 1    | [cite_start]Get attendance for learner(s)[cite: 2865]. | [cite_start]`learner_id?`, `department_id?`, `threshold?` [cite: 2865] |
| `create_complaint`       | 1    | [cite_start]Create complaint ticket[cite: 2867].       | [cite_start]`category`, `description`, `location?` [cite: 2867]        |
| `send_notification`      | 2    | [cite_start]Send SMS/email/push[cite: 2867].           | [cite_start]`recipient_ids[]`, `message`, `channel` [cite: 2867]       |
| `export_data`            | 1-3  | [cite_start]Export query results[cite: 2867].          | [cite_start]`format`, `data_reference` [cite: 2867]                    |

### 13.4 User Context Object

[cite_start]Every query includes an auto-injected context object with details like: `user_id`, `role` (e.g., "learner" [cite: 2872][cite_start]), `institution_id`, `department_name`, `year`, `learning_studio_id` (e.g., "PH-302" [cite: 2879][cite_start]), `mentor_name`, and `permissions` array[cite: 2870, 2871, 2872, 2873, 2874, 2875, 2876, 2877, 2878, 2879, 2880, 2881, 2882, 2883].

---

## Section 14: Timeline & Dependencies

- [cite_start]**Deadline:** Soft deadline - **End of 5th, December 2025** for pilot launch[cite: 2909].
- [cite_start]**Blocker:** MCP server setup is **In Progress** (Yes, it's a blocker)[cite: 2912].
- [cite_start]**Phased Rollout:** Starts with an internal pilot on the **learners List page only** (Day 1-2) $\rightarrow$ Expands to Dashboard and other pages (Day 3-4) $\rightarrow$ Adds actions (Week 2) $\rightarrow$ Full Rollout to all users (Week 3)[cite: 2918, 2920, 2923, 2926, 2931].

---

## Handoff to Claude Code

[cite_start]The next steps require the following artifacts to be generated[cite: 2939, 2940, 2941, 2942, 2943, 2944, 2945, 2946]:

1.  [cite_start]Technical spec (Part 2)[cite: 2939].
2.  [cite_start]`CLAUDE.md` with session management rules[cite: 2944].
3.  [cite_start]`features.json` from P0 and P1 features[cite: 2945].
4.  [cite_start]`progress.txt` for tracking[cite: 2946].

[cite_start]The build sequence starts with F01 (Chat Query Interface) and proceeds sequentially through F02 (Context Injection), F03 (Query Execution), F04 (Role-Based Filtering), and F05 (Result Actions)[cite: 2948, 2949, 2950, 2951, 2952].
