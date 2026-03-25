# Bug Reports — learners › leave-onduty

> Exported: 2026-03-24 | Total: 3 bugs

---

# Bug Report: BUG-003125

```yaml
id: 5d7b70b0-be7a-43b6-b31d-113c648a0b3c
display_id: BUG-003125
status: new
module: learners / leave-onduty
category: bug
reported_at: 2026-03-24T07:23:57.988603+00:00
```

## Reporter
- **Name:** ABISHEK FLEMING A
- **Email:** abishekfleming.dp@jkkn.ac.in
- **Role:** student

## Page URL
`https://www.jkkn.ai/learners/leave-onduty/apply`

**Institution:** JKKN College of Pharmacy

## Description
After uploading the document..it get refreshed and all get erased

## Console Logs
```
[LOG] All permissions are false - showing only Dashboard
[LOG] [ApplyPage] Learner data fetched: {"learner":{"id":"a1d70b8d-af87-4f5c-9e32-795d0101cb6f","institution_id":"5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334","section_id":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semester_id":"b8f51b77-5c81-4e14-890c-686f94fa9f5a"},"learnerError":null,"profileLearnerId":"a1d70b8d-af87-4f5c-9e32-795d0101cb6f"}
[LOG] [ApplyPage] Setting learner data: {"id":"a1d70b8d-af87-4f5c-9e32-795d0101cb6f","institutionId":"5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334","sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a"}
[LOG] [ApplicationForm] Props: {"learnerId":"a1d70b8d-af87-4f5c-9e32-795d0101cb6f","institutionId":"5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334","sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a"}
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"fullday","selectedPeriods":[]}
[LOG] [PeriodSelector] Query result: {"isLoading":true,"error":null}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","date":"2026-03-24","periodType":"fullday"}
[LOG] [LeaveOndutyService.getPeriodsForDate] Timetable query result: {"timetable":{"id":"fc77334f-ed9b-4c3e-a917-533b043ea386","section_id":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semester_id":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","is_active":true},"timetableError":null,"timetableDataKeys":["FRIDAY","MONDAY","TUESDAY","SATURDAY","THURSDAY","WEDNESDAY"]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Date analysis: {"date":"2026-03-24","selectedDate":"2026-03-24T00:00:00.000Z","dayOfWeek":"TUESDAY","timetableDataKeys":["FRIDAY","MONDAY","TUESDAY","SATURDAY","THURSDAY","WEDNESDAY"]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Day periods: {"dayOfWeek":"TUESDAY","allPeriodsCount":4,"allPeriodIds":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"samplePeriod":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":""}}
[LOG] [LeaveOndutyService.getPeriodsForDate] Enrichment data: {"periodsFound":4,"coursesFound":4,"periodMapKeys":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"courseMapKeys":["0197799f-a1bc-4854-93d5-0ccadb81361d","2e98625a-1dd2-4f4c-af2a-8fcd57de7b77","b8b1e994-bf8e-4e7e-a1ed-73b399c19a17","b9d4961a-675b-44ee-82d2-26060e8a36c0"]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Enriched periods: {"sampleEnriched":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"0c068ff5-480b-450c-be30-970cf253781e","period_name":"COP 5","start_time":"14:20:00","end_time":"15:20:00","is_break":false,"course_name":"Pharmacology 2","course_code":"383831"}}
[LOG] [PeriodSelector] Query result: {"periodDetection":{"valid":true,"periods":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"timetable":{"0c068ff5-480b-450c-be30-970cf253781e":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"0c068ff5-480b-450c-be30-970cf253781e","period_name":"COP 5","start_time":"14:20:00","end_time":"15:20:00","is_break":false,"course_name":"Pharmacology 2","course_code":"383831"},"4f897756-8155-4209-bd19-7de0dc8db534":{"slot_id":"9832173b-e962-4f8c-b7a4-8972004cdf42","course_id":"b9d4961a-675b-44ee-82d2-26060e8a36c0","slot_date":null,"staff_ids":["26248722-d063-44bf-915f-41d94f3ed8bc"],"sub_slots":[],"created_at":"2026-02-05 05:12:59.092443+00","updated_at":"2026-02-05 05:12:59.092443+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"26248722-d063-44bf-915f-41d94f3ed8bc","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"4f897756-8155-4209-bd19-7de0dc8db534","period_name":"Morning Practical","start_time":"09:05:00","end_time":"12:15:00","is_break":false,"course_name":"Pharmaceutical Formulations","course_code":"383836"},"5e13353b-f15e-4009-b9e1-8f2bba513cce":{"slot_id":"b6032569-19fe-4fb6-8c7b-40c45f8a02cf","course_id":"2e98625a-1dd2-4f4c-af2a-8fcd57de7b77","slot_date":null,"staff_ids":["0faee871-f051-4093-a920-9b608f1860e1"],"sub_slots":[],"created_at":"2026-02-05 05:15:41.962736+00","updated_at":"2026-02-05 05:15:41.962736+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"0faee871-f051-4093-a920-9b608f1860e1","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"5e13353b-f15e-4009-b9e1-8f2bba513cce","period_name":"COP 4","start_time":"13:20:00","end_time":"14:20:00","is_break":false,"course_name":"Medicinal Chemistry","course_code":"383835"},"88117f75-c60a-43d3-a19e-ed9fc0ffb803":{"slot_id":"a5aaf7df-2fbd-4a8e-a512-d92be0dd5825","course_id":"b8b1e994-bf8e-4e7e-a1ed-73b399c19a17","slot_date":null,"staff_ids":["cfdc9074-287d-47c6-8f3f-a3b06fed1b9f"],"sub_slots":[],"created_at":"2026-02-05 05:16:00.838267+00","updated_at":"2026-02-05 05:16:00.838267+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"cfdc9074-287d-47c6-8f3f-a3b06fed1b9f","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"88117f75-c60a-43d3-a19e-ed9fc0ffb803","period_name":"COP 6","start_time":"15:30:00","end_time":"16:30:00","is_break":false,"course_name":"Pharmaceutical Analysis","course_code":"383832"}}},"isLoading":false,"error":null}
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"fullday","selectedPeriods":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"]}
[LOG] [ApplicationForm] Restoring saved form data
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"afternoon","selectedPeriods":[]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","date":"2026-03-24","periodType":"afternoon"}
[LOG] [PeriodSelector] Query result: {"periodDetection":{"valid":true,"periods":["0c068ff5-480b-450c-be30-970cf253781e","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"timetable":{"0c068ff5-480b-450c-be30-970cf253781e":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"0c068ff5-480b-450c-be30-970cf253781e","period_name":"COP 5","start_time":"14:20:00","end_time":"15:20:00","is_break":false,"course_name":"Pharmacology 2","course_code":"383831"},"4f897756-8155-4209-bd19-7de0dc8db534":{"slot_id":"9832173b-e962-4f8c-b7a4-8972004cdf42","course_id":"b9d4961a-675b-44ee-82d2-26060e8a36c0","slot_date":null,"staff_ids":["26248722-d063-44bf-915f-41d94f3ed8bc"],"sub_slots":[],"created_at":"2026-02-05 05:12:59.092443+00","updated_at":"2026-02-05 05:12:59.092443+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"26248722-d063-44bf-915f-41d94f3ed8bc","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"4f897756-8155-4209-bd19-7de0dc8db534","period_name":"Morning Practical","start_time":"09:05:00","end_time":"12:15:00","is_break":false,"course_name":"Pharmaceutical Formulations","course_code":"383836"},"5e13353b-f15e-4009-b9e1-8f2bba513cce":{"slot_id":"b6032569-19fe-4fb6-8c7b-40c45f8a02cf","course_id":"2e98625a-1dd2-4f4c-af2a-8fcd57de7b77","slot_date":null,"staff_ids":["0faee871-f051-4093-a920-9b608f1860e1"],"sub_slots":[],"created_at":"2026-02-05 05:15:41.962736+00","updated_at":"2026-02-05 05:15:41.962736+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"0faee871-f051-4093-a920-9b608f1860e1","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"5e13353b-f15e-4009-b9e1-8f2bba513cce","period_name":"COP 4","start_time":"13:20:00","end_time":"14:20:00","is_break":false,"course_name":"Medicinal Chemistry","course_code":"383835"},"88117f75-c60a-43d3-a19e-ed9fc0ffb803":{"slot_id":"a5aaf7df-2fbd-4a8e-a512-d92be0dd5825","course_id":"b8b1e994-bf8e-4e7e-a1ed-73b399c19a17","slot_date":null,"staff_ids":["cfdc9074-287d-47c6-8f3f-a3b06fed1b9f"],"sub_slots":[],"created_at":"2026-02-05 05:16:00.838267+00","updated_at":"2026-02-05 05:16:00.838267+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"cfdc9074-287d-47c6-8f3f-a3b06fed1b9f","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"88117f75-c60a-43d3-a19e-ed9fc0ffb803","period_name":"COP 6","start_time":"15:30:00","end_time":"16:30:00","is_break":false,"course_name":"Pharmaceutical Analysis","course_code":"383832"}}},"isLoading":false,"error":null}
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"forenoon","selectedPeriods":[]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","date":"2026-03-24","periodType":"forenoon"}
[LOG] [PeriodSelector] Query result: {"periodDetection":{"valid":true,"periods":["4f897756-8155-4209-bd19-7de0dc8db534"],"timetable":{"0c068ff5-480b-450c-be30-970cf253781e":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"0c068ff5-480b-450c-be30-970cf253781e","period_name":"COP 5","start_time":"14:20:00","end_time":"15:20:00","is_break":false,"course_name":"Pharmacology 2","course_code":"383831"},"4f897756-8155-4209-bd19-7de0dc8db534":{"slot_id":"9832173b-e962-4f8c-b7a4-8972004cdf42","course_id":"b9d4961a-675b-44ee-82d2-26060e8a36c0","slot_date":null,"staff_ids":["26248722-d063-44bf-915f-41d94f3ed8bc"],"sub_slots":[],"created_at":"2026-02-05 05:12:59.092443+00","updated_at":"2026-02-05 05:12:59.092443+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"26248722-d063-44bf-915f-41d94f3ed8bc","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"4f897756-8155-4209-bd19-7de0dc8db534","period_name":"Morning Practical","start_time":"09:05:00","end_time":"12:15:00","is_break":false,"course_name":"Pharmaceutical Formulations","course_code":"383836"},"5e13353b-f15e-4009-b9e1-8f2bba513cce":{"slot_id":"b6032569-19fe-4fb6-8c7b-40c45f8a02cf","course_id":"2e98625a-1dd2-4f4c-af2a-8fcd57de7b77","slot_date":null,"staff_ids":["0faee871-f051-4093-a920-9b608f1860e1"],"sub_slots":[],"created_at":"2026-02-05 05:15:41.962736+00","updated_at":"2026-02-05 05:15:41.962736+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"0faee871-f051-4093-a920-9b608f1860e1","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"5e13353b-f15e-4009-b9e1-8f2bba513cce","period_name":"COP 4","start_time":"13:20:00","end_time":"14:20:00","is_break":false,"course_name":"Medicinal Chemistry","course_code":"383835"},"88117f75-c60a-43d3-a19e-ed9fc0ffb803":{"slot_id":"a5aaf7df-2fbd-4a8e-a512-d92be0dd5825","course_id":"b8b1e994-bf8e-4e7e-a1ed-73b399c19a17","slot_date":null,"staff_ids":["cfdc9074-287d-47c6-8f3f-a3b06fed1b9f"],"sub_slots":[],"created_at":"2026-02-05 05:16:00.838267+00","updated_at":"2026-02-05 05:16:00.838267+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"cfdc9074-287d-47c6-8f3f-a3b06fed1b9f","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"88117f75-c60a-43d3-a19e-ed9fc0ffb803","period_name":"COP 6","start_time":"15:30:00","end_time":"16:30:00","is_break":false,"course_name":"Pharmaceutical Analysis","course_code":"383832"}}},"isLoading":false,"error":null}
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"forenoon","selectedPeriods":["4f897756-8155-4209-bd19-7de0dc8db534"]}
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"periodwise","selectedPeriods":["4f897756-8155-4209-bd19-7de0dc8db534"]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","date":"2026-03-24","periodType":"periodwise"}
[DEBUG] #1 0ms Starting document clone with size 980x2000 scrolled to 0,0
[DEBUG] #1 1860ms Document cloned, using foreign object rendering
[DEBUG] #1 1865ms EXPERIMENTAL ForeignObject renderer initialized (980x2000 at 0,0) with scale 1.5
[DEBUG] #1 2757ms Finished rendering
```

## Screenshot
![Screenshot](https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/bug-reports/5d7b70b0-be7a-43b6-b31d-113c648a0b3c/screenshot.jpg)

---
# Bug Report: BUG-003124

```yaml
id: 22c2d204-8f64-4b9b-815f-4f5f2f3952ed
display_id: BUG-003124
status: new
module: learners / leave-onduty
category: performance
reported_at: 2026-03-24T07:18:36.923196+00:00
```

## Reporter
- **Name:** DARSINI V A
- **Email:** darsiniva.dp@jkkn.ac.in
- **Role:** student

## Page URL
`https://www.jkkn.ai/learners/leave-onduty/apply`

**Institution:** JKKN College of Pharmacy

## Description
Can't apply on duty.There is problem in selecting on duty type

## Console Logs
```
[LOG] All permissions are false - showing only Dashboard
[WARN] Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
[LOG] [ApplyPage] Learner data fetched: {"learner":{"id":"92ecd599-2e8e-4b96-8745-0f5f0dd8124e","institution_id":"5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334","section_id":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semester_id":"b8f51b77-5c81-4e14-890c-686f94fa9f5a"},"learnerError":null,"profileLearnerId":"92ecd599-2e8e-4b96-8745-0f5f0dd8124e"}
[LOG] [ApplyPage] Setting learner data: {"id":"92ecd599-2e8e-4b96-8745-0f5f0dd8124e","institutionId":"5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334","sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a"}
[LOG] [ApplicationForm] Props: {"learnerId":"92ecd599-2e8e-4b96-8745-0f5f0dd8124e","institutionId":"5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334","sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a"}
[LOG] [ApplicationForm] Props: {"learnerId":"92ecd599-2e8e-4b96-8745-0f5f0dd8124e","institutionId":"5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334","sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a"}
[LOG] [ApplicationForm] Restoring saved form data
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"fullday","selectedPeriods":[]}
[LOG] [PeriodSelector] Query result: {"isLoading":true,"error":null}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","date":"2026-03-24","periodType":"fullday"}
[LOG] [LeaveOndutyService.getPeriodsForDate] Timetable query result: {"timetable":{"id":"fc77334f-ed9b-4c3e-a917-533b043ea386","section_id":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semester_id":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","is_active":true},"timetableError":null,"timetableDataKeys":["FRIDAY","MONDAY","TUESDAY","SATURDAY","THURSDAY","WEDNESDAY"]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Date analysis: {"date":"2026-03-24","selectedDate":"2026-03-24T00:00:00.000Z","dayOfWeek":"TUESDAY","timetableDataKeys":["FRIDAY","MONDAY","TUESDAY","SATURDAY","THURSDAY","WEDNESDAY"]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Day periods: {"dayOfWeek":"TUESDAY","allPeriodsCount":4,"allPeriodIds":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"samplePeriod":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":""}}
[LOG] [LeaveOndutyService.getPeriodsForDate] Enrichment data: {"periodsFound":4,"coursesFound":4,"periodMapKeys":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"courseMapKeys":["0197799f-a1bc-4854-93d5-0ccadb81361d","2e98625a-1dd2-4f4c-af2a-8fcd57de7b77","b8b1e994-bf8e-4e7e-a1ed-73b399c19a17","b9d4961a-675b-44ee-82d2-26060e8a36c0"]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Enriched periods: {"sampleEnriched":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"0c068ff5-480b-450c-be30-970cf253781e","period_name":"COP 5","start_time":"14:20:00","end_time":"15:20:00","is_break":false,"course_name":"Pharmacology 2","course_code":"383831"}}
[LOG] [PeriodSelector] Query result: {"periodDetection":{"valid":true,"periods":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"timetable":{"0c068ff5-480b-450c-be30-970cf253781e":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"0c068ff5-480b-450c-be30-970cf253781e","period_name":"COP 5","start_time":"14:20:00","end_time":"15:20:00","is_break":false,"course_name":"Pharmacology 2","course_code":"383831"},"4f897756-8155-4209-bd19-7de0dc8db534":{"slot_id":"9832173b-e962-4f8c-b7a4-8972004cdf42","course_id":"b9d4961a-675b-44ee-82d2-26060e8a36c0","slot_date":null,"staff_ids":["26248722-d063-44bf-915f-41d94f3ed8bc"],"sub_slots":[],"created_at":"2026-02-05 05:12:59.092443+00","updated_at":"2026-02-05 05:12:59.092443+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"26248722-d063-44bf-915f-41d94f3ed8bc","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"4f897756-8155-4209-bd19-7de0dc8db534","period_name":"Morning Practical","start_time":"09:05:00","end_time":"12:15:00","is_break":false,"course_name":"Pharmaceutical Formulations","course_code":"383836"},"5e13353b-f15e-4009-b9e1-8f2bba513cce":{"slot_id":"b6032569-19fe-4fb6-8c7b-40c45f8a02cf","course_id":"2e98625a-1dd2-4f4c-af2a-8fcd57de7b77","slot_date":null,"staff_ids":["0faee871-f051-4093-a920-9b608f1860e1"],"sub_slots":[],"created_at":"2026-02-05 05:15:41.962736+00","updated_at":"2026-02-05 05:15:41.962736+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"0faee871-f051-4093-a920-9b608f1860e1","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"5e13353b-f15e-4009-b9e1-8f2bba513cce","period_name":"COP 4","start_time":"13:20:00","end_time":"14:20:00","is_break":false,"course_name":"Medicinal Chemistry","course_code":"383835"},"88117f75-c60a-43d3-a19e-ed9fc0ffb803":{"slot_id":"a5aaf7df-2fbd-4a8e-a512-d92be0dd5825","course_id":"b8b1e994-bf8e-4e7e-a1ed-73b399c19a17","slot_date":null,"staff_ids":["cfdc9074-287d-47c6-8f3f-a3b06fed1b9f"],"sub_slots":[],"created_at":"2026-02-05 05:16:00.838267+00","updated_at":"2026-02-05 05:16:00.838267+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"cfdc9074-287d-47c6-8f3f-a3b06fed1b9f","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"88117f75-c60a-43d3-a19e-ed9fc0ffb803","period_name":"COP 6","start_time":"15:30:00","end_time":"16:30:00","is_break":false,"course_name":"Pharmaceutical Analysis","course_code":"383832"}}},"isLoading":false,"error":null}
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"fullday","selectedPeriods":["0c068ff5-480b-450c-be30-970cf253781e","4f897756-8155-4209-bd19-7de0dc8db534","5e13353b-f15e-4009-b9e1-8f2bba513cce","88117f75-c60a-43d3-a19e-ed9fc0ffb803"]}
[LOG] [PeriodSelector] Props: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","selectedDate":"2026-03-24","periodType":"afternoon","selectedPeriods":[]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"356415aa-744f-44b7-b5fb-d8b20f579dc4","semesterId":"b8f51b77-5c81-4e14-890c-686f94fa9f5a","date":"2026-03-24","periodType":"afternoon"}
[LOG] [PeriodSelector] Query result: {"periodDetection":{"valid":true,"periods":["0c068ff5-480b-450c-be30-970cf253781e","88117f75-c60a-43d3-a19e-ed9fc0ffb803"],"timetable":{"0c068ff5-480b-450c-be30-970cf253781e":{"slot_id":"6e528170-028f-4e23-b196-3504feecdbb6","course_id":"0197799f-a1bc-4854-93d5-0ccadb81361d","slot_date":null,"staff_ids":["5a4e3be9-f84b-488b-a654-2a3c2aee3e40"],"sub_slots":[],"created_at":"2026-02-05 05:15:51.514445+00","updated_at":"2026-02-05 05:15:51.514445+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"5a4e3be9-f84b-488b-a654-2a3c2aee3e40","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"0c068ff5-480b-450c-be30-970cf253781e","period_name":"COP 5","start_time":"14:20:00","end_time":"15:20:00","is_break":false,"course_name":"Pharmacology 2","course_code":"383831"},"4f897756-8155-4209-bd19-7de0dc8db534":{"slot_id":"9832173b-e962-4f8c-b7a4-8972004cdf42","course_id":"b9d4961a-675b-44ee-82d2-26060e8a36c0","slot_date":null,"staff_ids":["26248722-d063-44bf-915f-41d94f3ed8bc"],"sub_slots":[],"created_at":"2026-02-05 05:12:59.092443+00","updated_at":"2026-02-05 05:12:59.092443+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"26248722-d063-44bf-915f-41d94f3ed8bc","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"4f897756-8155-4209-bd19-7de0dc8db534","period_name":"Morning Practical","start_time":"09:05:00","end_time":"12:15:00","is_break":false,"course_name":"Pharmaceutical Formulations","course_code":"383836"},"5e13353b-f15e-4009-b9e1-8f2bba513cce":{"slot_id":"b6032569-19fe-4fb6-8c7b-40c45f8a02cf","course_id":"2e98625a-1dd2-4f4c-af2a-8fcd57de7b77","slot_date":null,"staff_ids":["0faee871-f051-4093-a920-9b608f1860e1"],"sub_slots":[],"created_at":"2026-02-05 05:15:41.962736+00","updated_at":"2026-02-05 05:15:41.962736+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"0faee871-f051-4093-a920-9b608f1860e1","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"5e13353b-f15e-4009-b9e1-8f2bba513cce","period_name":"COP 4","start_time":"13:20:00","end_time":"14:20:00","is_break":false,"course_name":"Medicinal Chemistry","course_code":"383835"},"88117f75-c60a-43d3-a19e-ed9fc0ffb803":{"slot_id":"a5aaf7df-2fbd-4a8e-a512-d92be0dd5825","course_id":"b8b1e994-bf8e-4e7e-a1ed-73b399c19a17","slot_date":null,"staff_ids":["cfdc9074-287d-47c6-8f3f-a3b06fed1b9f"],"sub_slots":[],"created_at":"2026-02-05 05:16:00.838267+00","updated_at":"2026-02-05 05:16:00.838267+00","is_combined":false,"period_mode":"standard","section_ids":["356415aa-744f-44b7-b5fb-d8b20f579dc4"],"is_break_slot":false,"is_subdivided":false,"practical_config":null,"primary_staff_id":"cfdc9074-287d-47c6-8f3f-a3b06fed1b9f","subdivision_mode":null,"subdivision_type":null,"break_description":"","period_id":"88117f75-c60a-43d3-a19e-ed9fc0ffb803","period_name":"COP 6","start_time":"15:30:00","end_time":"16:30:00","is_break":false,"course_name":"Pharmaceutical Analysis","course_code":"383832"}}},"isLoading":false,"error":null}
[DEBUG] #1 1ms Starting document clone with size 360x1622 scrolled to 0,0
[DEBUG] #1 1083ms Document cloned, using foreign object rendering
[DEBUG] #1 1089ms EXPERIMENTAL ForeignObject renderer initialized (360x1622 at 0,0) with scale 1.5
[DEBUG] #1 1444ms Finished rendering
```

## Screenshot
![Screenshot](https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/bug-reports/22c2d204-8f64-4b9b-815f-4f5f2f3952ed/screenshot.jpg)

---
# Bug Report: BUG-003099

```yaml
id: b8520870-8470-4ca1-824e-74b8f82df751
display_id: BUG-003099
status: new
module: learners / leave-onduty
category: bug
reported_at: 2026-03-17T09:25:31.475763+00:00
```

## Reporter
- **Name:** ABHINAYA MOUL S
- **Email:** abhinayamoul25nur@jkkn.ac.in
- **Role:** student

## Page URL
`https://www.jkkn.ai/learners/leave-onduty/apply`

**Institution:** JKKN College of Nursing and Research

## Description
I can't created for the odds and it not showings for the active timetables

## Console Logs
```
[LOG] All permissions are false - showing only Dashboard
[LOG] [ApplyPage] Learner data fetched: {"learner":{"id":"eb2c466c-6194-4b7e-89f8-8d315bc30630","institution_id":"70e54e51-9b98-4e07-9534-a85310609bfd","section_id":"9256b192-8472-476f-8e1c-277796482be3","semester_id":"6ab30be0-e77b-49bb-919e-b40b837ab9f0"},"learnerError":null,"profileLearnerId":"eb2c466c-6194-4b7e-89f8-8d315bc30630"}
[LOG] [ApplyPage] Setting learner data: {"id":"eb2c466c-6194-4b7e-89f8-8d315bc30630","institutionId":"70e54e51-9b98-4e07-9534-a85310609bfd","sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0"}
[LOG] [ApplicationForm] Props: {"learnerId":"eb2c466c-6194-4b7e-89f8-8d315bc30630","institutionId":"70e54e51-9b98-4e07-9534-a85310609bfd","sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0"}
[LOG] [PeriodSelector] Props: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","selectedDate":"2026-03-17","periodType":"fullday","selectedPeriods":[]}
[LOG] [PeriodSelector] Query result: {"isLoading":true,"error":null}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","date":"2026-03-17","periodType":"fullday"}
[LOG] [LeaveOndutyService.getPeriodsForDate] Timetable query result: {"timetable":null,"timetableError":null,"timetableDataKeys":[]}
[LOG] [LeaveOndutyService.getPeriodsForDate] No timetable found for section/semester
[LOG] [PeriodSelector] Query result: {"periodDetection":{"valid":false,"periods":[],"error":"No active timetable found for this section"},"isLoading":false,"error":null}
[LOG] [PeriodSelector] Props: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","selectedDate":"2026-03-17","periodType":"periodwise","selectedPeriods":[]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","date":"2026-03-17","periodType":"periodwise"}
[LOG] [PeriodSelector] Props: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","selectedDate":"2026-03-17","periodType":"forenoon","selectedPeriods":[]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","date":"2026-03-17","periodType":"forenoon"}
[LOG] [PeriodSelector] Props: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","selectedDate":"2026-03-17","periodType":"afternoon","selectedPeriods":[]}
[LOG] [LeaveOndutyService.getPeriodsForDate] Input: {"sectionId":"9256b192-8472-476f-8e1c-277796482be3","semesterId":"6ab30be0-e77b-49bb-919e-b40b837ab9f0","date":"2026-03-17","periodType":"afternoon"}
[DEBUG] #1 0ms Starting document clone with size 393x1660 scrolled to 0,0
[DEBUG] #1 1580ms Document cloned, using foreign object rendering
[DEBUG] #1 1583ms EXPERIMENTAL ForeignObject renderer initialized (393x1660 at 0,0) with scale 1.5
[DEBUG] #1 2069ms Finished rendering
```

## Screenshot
![Screenshot](https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/bug-reports/b8520870-8470-4ca1-824e-74b8f82df751/screenshot.jpg)

---
