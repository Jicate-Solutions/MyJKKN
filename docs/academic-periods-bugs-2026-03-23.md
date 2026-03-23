# Bug Reports — academic › periods

> Exported: 2026-03-23 | Total: 2 bugs

---

# Bug Report: BUG-003015

```yaml
id: af26afed-97db-4a1f-ab82-0bbc9b933ec6
display_id: BUG-003015
status: new
module: academic / periods
category: bug
reported_at: 2026-03-10T09:45:03.589083+00:00
```

## Reporter
- **Name:** DR. VIJAYTHIYAGARAJAN J
- **Email:** vijaythiyagarajan.j@jkkn.ac.in
- **Role:** hod

## Page URL
`https://www.jkkn.ai/academic/periods/e104839b-dd46-4542-a527-e0c9afcc4606/edit`

**Institution:** JKKN Dental College and Hospital

## Description
failed to load data, unable to edit.

## Console Logs
```
[LOG] All permissions are false - showing only Dashboard
[WARN] [learner-profile-service] Error finding or deleting learner user profile: TypeError: Failed to fetch
[LOG] [learner-profile-service] Successfully deleted learner record: a1b6c3a2-ff82-4237-9ef2-ae627e32b94b
[WARN] Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.
[LOG] [learner-profile-service] Successfully deleted learner record: 3a450717-b02c-4cc5-a36b-76d0787d4a6e
[LOG] [learner-profile-service] Successfully deleted learner record: eccc7c5c-4698-45b1-a5e6-6289619091f8
[LOG] [learner-profile-service] Successfully deleted learner record: f3acc3b1-5c6c-4ece-afa7-a1cc4fb3bcea
[WARN] [academic/timetables] No staff planning courses found - returning empty {}
[INFO] [academic/timetables] Recovered date ranges from RANGE keys in timetable_data {"rangeCount":1,"ranges":["RANGE:2026-02-20:2026-03-26"]}
[WARN] [academic/timetables] No staff planning courses found - returning empty {"timetableProgram":"aea1e367-65ad-442d-9b11-ab0277d93a83","timetableDepartment":"4679e9da-15ad-4a1a-95e3-622f18728239","timetableSemester":"0f115110-37e9-48fe-adc9-6463971e5b3c","timetableAcademicYear":"7847e67c-ed20-45f4-bab3-df1907c10809"}
[ERROR] [academic/periods] Error fetching period {"code":"22P02","details":null,"hint":null,"message":"invalid input syntax for type uuid: \"%%drp:id:25d80f6f6a137%%\""}
[DEBUG] #1 0ms Starting document clone with size 1280x551 scrolled to 0,0
[DEBUG] #1 599ms Document cloned, using foreign object rendering
[DEBUG] #1 599ms EXPERIMENTAL ForeignObject renderer initialized (1280x551 at 0,0) with scale 1.5
[DEBUG] #1 865ms Finished rendering
```

## Screenshot
![Screenshot](https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/bug-reports/af26afed-97db-4a1f-ab82-0bbc9b933ec6/screenshot.jpg)

---
# Bug Report: BUG-002558

```yaml
id: 4b959cb6-e8b4-4eaa-9f27-e8a25de835e1
display_id: BUG-002558
status: new
module: academic / periods
category: feature_request
reported_at: 2026-02-04T04:30:25.868817+00:00
```

## Reporter
- **Name:** DR. VIJAYTHIYAGARAJAN J
- **Email:** vijaythiyagarajan.j@jkkn.ac.in
- **Role:** hod

## Page URL
`https://www.jkkn.ai/academic/periods?institution_id=e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5&page=2`

**Institution:** JKKN Dental College and Hospital

## Description
Need access to edit/delete the academic period

## Console Logs
```
[WARN] Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.
[WARN] [academic/timetables] No staff planning courses found - returning empty {}
[WARN] [academic/timetables] No staff planning courses found - returning empty {"timetableProgram":"aea1e367-65ad-442d-9b11-ab0277d93a83","timetableDepartment":"4679e9da-15ad-4a1a-95e3-622f18728239","timetableSemester":"8e15676c-e3e8-4569-aa94-a4fd103bfede","timetableAcademicYear":"7847e67c-ed20-45f4-bab3-df1907c10809"}
[DEBUG] #1 0ms Starting document clone with size 1265x1064 scrolled to 0,0
[DEBUG] #1 1054ms Document cloned, using foreign object rendering
[DEBUG] #1 1055ms EXPERIMENTAL ForeignObject renderer initialized (1265x1064 at 0,0) with scale 1.5
[DEBUG] #1 1599ms Finished rendering
```

## Screenshot
![Screenshot](https://kvizhngldtiuufknvehv.supabase.co/storage/v1/object/public/bug-reports/4b959cb6-e8b4-4eaa-9f27-e8a25de835e1/screenshot.jpg)

---
