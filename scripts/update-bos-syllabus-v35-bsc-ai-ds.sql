-- ─────────────────────────────────────────────────────────────────────────────
-- v3.5 Fink's/Capstone import — B.Sc. COMPUTER SCIENCE (AI & DATA SCIENCE)
-- JKKN College of Arts and Science (Self) · AY 2026-27 First Year
--
-- Populates the five v3.5 JSONB columns on bos_course_syllabi from the
-- BoS-approved v3.5 HTML documents (pulled 2026-07-07):
--   26UADC01  CORE-I-DATA STRUCTURES                      (Sem 1)
--   26UADC02  CORE-II-INTRODUCTION ON PYTHON              (Sem 2)
--   26UADCP01 CORE PRACTICAL-I-COMPUTER PROGRAMMING LAB   (Sem 1)
--   26UADCP02 CORE PRACTICAL-II-PYTHON PROGRAMMING LAB    (Sem 2)
--   26UADS01  SEC-I-FUNDAMENTALS OF COMPUTER PROGRAMMING  (Sem 1)
--   26UCSS02  SEC-II-INTRODUCTION TO HTML                 (Sem 2)
--
-- REQUIRES: supabase/migrations/20260709_bos_syllabus_finks_capstone_v35.sql
--           applied first (columns must exist).
-- Targets is_latest=true, is_archived=false rows only; assessment_structure
-- (v1.2) is left untouched.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 0. Sanity: every code resolves to exactly one latest row ────────────────
-- Expect 6 rows, latest_rows = 1 each. If not, ROLLBACK and investigate.
select course_code, count(*) as latest_rows
from public.bos_course_syllabi
where course_code in ('26UADC01','26UADC02','26UADCP01','26UADCP02','26UADS01','26UCSS02')
  and is_latest = true and is_archived = false
group by course_code
order by course_code;

-- ── 1. Canonical v3.5 common blocks (identical across all six) ──────────────
update public.bos_course_syllabi
set
  assessment_pattern = $j${
    "internal_marks": 30,
    "external_marks": 70,
    "components": [
      { "sno": 1, "component": "CIA I, CIA II & Model Examination", "marks": 15 },
      { "sno": 2, "component": "Activities*", "marks": 5 },
      { "sno": 3, "component": "Capstone Project (see below)", "marks": 10 }
    ],
    "activities_note": "* Activities: Assignment / Case study / Field survey / PPT / Group discussion / Subject Viva / Report Writing / Mind map / Flow chart / Model making / Debate / Surprise test / Open book test.",
    "note": "The five Concept Applications are formative Fink's-shaped practice. The summative Fink's assessment is the Capstone Project (10 marks) detailed below."
  }$j$::jsonb,
  capstone_rubric = $j${
    "total_marks": 10,
    "note": "10 marks · common to all 5 options",
    "criteria": [
      { "sno": 1, "criterion": "Specificity of lived engagement (not generic; named places, named people, real measurements, real data)", "marks": 2 },
      { "sno": 2, "criterion": "Quality of disciplinary craft (course-appropriate technique — reasoning, measurement rigour, code, analysis — in service of the subject)", "marks": 3 },
      { "sno": 3, "criterion": "Honest self-reflection (pre-conceptions named, shift documented, courage in saying what is hard)", "marks": 2 },
      { "sno": 4, "criterion": "Continuing commitment OR ethical care (subject consent, give-back, named follow-through where applicable)", "marks": 2 },
      { "sno": 5, "criterion": "Authentic voice + LLC presentation (the Capstone is presented at the Learners Led Conference — clarity, ownership, ability to answer questions; AI use declared if any — Humans are Principals, AI are Agents)", "marks": 1 }
    ]
  }$j$::jsonb,
  llc_conference = $j${
    "title": "End-of-Course Learners Led Conference",
    "subtitle": "cohort audience · faculty + Senior Learner facilitate · no outside guest required",
    "description": "In the final fortnight of the semester, the cohort convenes a Learners Led Conference — JKKN's established learner-run session format — in which every Learner presents their Capstone: a 5–7 minute talk showing what they made, measured, built, or found (the object, the data table, the hand-drawn graph, the running program, the quoted voice, the photograph of the named place) and answering two or three questions from peers and faculty. The Learner is the Principal of the session. Faculty and the Senior Learner facilitate and assess the presentation dimension of the Capstone rubric. This makes each Capstone presentable and public-to-the-cohort without importing Full-tier Public-Exhibition machinery."
  }$j$::jsonb,
  last_modified_at = now()
where course_code in ('26UADC01','26UADC02','26UADCP01','26UADCP02','26UADS01','26UCSS02')
  and is_latest = true and is_archived = false;

-- ── 2a. 26UADC01 · CORE-I-DATA STRUCTURES ───────────────────────────────────
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay. Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      { "sno": 1, "unit": "I", "finks_dimension": "Foundational Knowledge", "task": "Write a small Python class (an ADT you choose — e.g. a Rupee-amount or a Student record) and demonstrate shallow vs deep copy on it with your own example.", "deliverable_notes": "Your running code + the actual output showing the shallow/deep copy difference + 2 lines on when the difference would bite in a real program." },
      { "sno": 2, "unit": "II", "finks_dimension": "Application", "task": "Implement a singly linked list yourself and use it to model a real ordered thing you know (e.g. the bus stops on your route to college, in order). Insert and delete one stop.", "deliverable_notes": "Your code + output showing the list before/after an insert and a delete + the real place names used as data." },
      { "sno": 3, "unit": "III", "finks_dimension": "Application", "task": "Take a real list of ~20 numbers you gather (e.g. the daily temperatures for your town for 20 days, or 20 real prices) and sort them with TWO sorts you code yourself; count the comparisons each makes.", "deliverable_notes": "Your two implementations + the comparison counts on YOUR data + one line on which was cheaper and why." },
      { "sno": 4, "unit": "IV", "finks_dimension": "Application", "task": "Build a binary search tree from a real sequence you choose (e.g. the letters of a named place inserted in order) and hand-draw the resulting tree; then show one insertion that unbalances it.", "deliverable_notes": "Your BST code + your hand-drawn tree (photo) + 2 lines on why insertion order changed the shape." },
      { "sno": 5, "unit": "V", "finks_dimension": "Integration", "task": "Model a small real network as a graph (e.g. 6 named places and the roads between them, with distances you look up) and run your own shortest-path code between two of them.", "deliverable_notes": "Your graph data (real place names + distances) + your code's shortest path + a hand-check of that path against the map." }
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. The assessment focuses on what AI cannot do. Each Capstone has three parts: (1) the AI-proof primary deliverable — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) a short ~400-word reflection — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC) where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      { "option_no": 1, "title": "A Data Structure for Something Real Near Me", "primary": "Choose a real local system (bus routes, a shop's inventory, a family tree, a delivery round) and implement the data structure that fits it — list, tree, or graph — in your own code, loaded with REAL data you collected and named.", "support": "~400 words on why that structure fits and what a wrong choice would cost.", "llc": "Run your program live on your real data and answer 'what if the data grew 10x?'" },
      { "option_no": 2, "title": "Two Sorts, My Own Numbers, Measured", "primary": "Gather a real dataset (20-100 values you collect and name the source of) and implement three sorting algorithms yourself, instrumenting each to count comparisons and swaps on YOUR data.", "support": "~400 words on where the theoretical big-O matched or missed your measurements.", "llc": "Show the counts and defend which sort you'd ship for this data." },
      { "option_no": 3, "title": "The Tree I Grew and Balanced", "primary": "Build a binary search tree and an AVL variant on the same real key sequence you choose, hand-draw both, and demonstrate one rotation fixing an imbalance in your running code.", "support": "~400 words on what balancing buys and costs.", "llc": "Reconstruct a rotation live at the board when an examiner inserts a new key." },
      { "option_no": 4, "title": "A Shortest Path Through Places I Know", "primary": "Model a real neighbourhood as a weighted graph (named places, measured or looked-up distances) and implement a shortest-path algorithm yourself; verify one result against the actual map.", "support": "~400 words on one assumption your model makes that reality breaks.", "llc": "Run it live and answer 'find the path if this road closes.'" },
      { "option_no": 5, "title": "Hashing a Real Directory", "primary": "Build a hash table yourself and load it with a real set of keys (e.g. names and phone numbers you collect with consent, or roll numbers) — then engineer and demonstrate a collision, and your handling of it.", "support": "~400 words on load factor and rehashing evidence from your own runs.", "llc": "Demonstrate a lookup and a collision live." }
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UADC01'
  and is_latest = true and is_archived = false;

-- ── 2b. 26UADC02 · CORE-II-INTRODUCTION ON PYTHON ───────────────────────────
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay. Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      { "sno": 1, "unit": "I", "finks_dimension": "Application", "task": "Watch ONE real hand-done daily routine near you and name whose it is - your mother making filter coffee, a Komarapalayam tea-shop owner making ten teas, an auto-driver's morning start. Write it as a numbered algorithm and draw its flowchart by hand.", "deliverable_notes": "The hand-drawn flowchart (photo, your hand in frame) + the numbered pseudocode. Write 3-4 sentences: whose routine it is and where it happens, the one step that is an 'if' decision, and the step that repeats as a loop." },
      { "sno": 2, "unit": "II", "finks_dimension": "Foundational Knowledge", "task": "Collect 8 real facts about your own household from a named source (your ration card, your family) - names, ages, monthly milk litres, phone number, whether a two-wheeler is owned. In the Python interpreter, store each in a variable and check its type() live.", "deliverable_notes": "A photo of your interpreter session showing each variable, its value and type() output, with print of your name at the top. Add a small table matching each real fact to its Python type (int/float/str/bool). Write 2 sentences on which fact surprised you by its type." },
      { "sno": 3, "unit": "III", "finks_dimension": "Integration", "task": "Photograph ONE real Tamil-or-bilingual signboard or wall-proverb in your area (name the shop or wall). Type its text as a string and write a fruitful function that uses a loop and a conditional to count the words and flag the longest one.", "deliverable_notes": "The signboard photo + the running code (terminal photo, your name printed in the output) + a hand-drawn trace of the loop for the first three words. Write 3 sentences: what the text says, the word count, and one transliteration problem you hit." },
      { "sno": 4, "unit": "IV", "finks_dimension": "Human Dimension", "task": "Walk one named lane in your area (e.g., 3rd Cross, Kavandampatti) and record 10 real households as a dictionary mapping house name/number to number of people (ask politely or use neighbours you know). Also keep a list of the counts and a tuple of the two extreme houses.", "deliverable_notes": "A photo of your hand-written field notes (the raw 10 households) + running code building the dict, list and tuple (terminal photo) + the total and average people-per-house your code prints. Write 3 sentences on your street and what the dictionary let you look up fast." },
      { "sno": 5, "unit": "V", "finks_dimension": "Learning How to Learn", "task": "Teach yourself something not shown in class: save your Unit IV street data into a real .csv file, read it back with the csv module or Numpy, compute the mean people-per-house, and deliberately trigger and catch one real error (a missing-file exception).", "deliverable_notes": "The .csv file contents (photo or paste) + running code showing the file written, read back, mean computed, and one exception caught (terminal photo, your name). Write 2 sentences on what you taught yourself and exactly where you looked it up." }
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. The assessment focuses on what AI cannot do. Each Capstone has three parts: (1) the AI-proof primary deliverable — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) a short ~400-word reflection — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC) where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      { "option_no": 1, "title": "The Program That Runs My Grandmother's Recipe", "primary": "Interview ONE named elder who cooks by feel - get a phone-verifiable contact, their steps and rough measures in their own words. Write a Python program (functions, an if for scaling, a loop) that reproduces and scales the recipe for any guest count, and run it live.", "support": "~400 words linking their hand-knowledge to Units I-IV (algorithm, types, functions, data structures).", "llc": "Run the program before the cohort, quote the elder, and show the one line where their 'if guests are many' became your code." },
      { "option_no": 2, "title": "One Street, Counted by Me", "primary": "Census one NAMED lane in your area (e.g., 2nd Cross, Kavandampatti) - record 12+ real households as a dictionary of house to people. Build a Python tool that stores it, writes it to a CSV, and computes totals and the average with Numpy.", "support": "~400 words justifying your data-structure choices (dict vs list vs tuple), tied to Units IV-V.", "llc": "Show your field notes and run the tool live, answering how you handled a house that refused to share." },
      { "option_no": 3, "title": "The Day-Book I Turned Into Code", "primary": "Copy one real day from a NAMED small shop's sales book (owner's consent, phone-verifiable). Write a Python program that reads the entries from a file, totals the day, finds the best-seller via a dictionary, and catches a bad entry with try/except.", "support": "~400 words connecting the shop's book to Units III-V.", "llc": "Run it on the real day's data, show the best-seller, and defend how your exception handling caught the one messy line." },
      { "option_no": 4, "title": "My Bus, My Algorithm", "primary": "Ride and time ONE real town-bus route you take (name the route and four stops); record arrival times across two days by hand. Write a Python program that stores the timings, computes average gaps, and predicts the next wait.", "support": "~400 words on turning a lived routine into an algorithm and flowchart (Units I-IV).", "llc": "Show your hand-timed sheet, run the predictor live, and say exactly where reality broke your model." },
      { "option_no": 5, "title": "The Word-Count of a Real Wall", "primary": "Photograph one real Tamil text near you - a temple notice, a shop wall, or a song a NAMED person sings (transcribe it). Write a Python string program that counts words, finds the longest, and tallies the most-common letter.", "support": "~400 words on strings and iteration (Unit III) and one transliteration problem you hit.", "llc": "Show the photo, run the counter live, and read the text aloud for the cohort." }
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UADC02'
  and is_latest = true and is_archived = false;

-- ── 2c. 26UADCP01 · CORE PRACTICAL-I-COMPUTER PROGRAMMING LAB ───────────────
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay. Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      { "sno": 1, "unit": "Lab 1-2", "finks_dimension": "Application", "task": "Collect a real set of at least 10 numbers you measure or count yourself - the prices of 10 items at a NAMED Komarapalayam shop, the ages of 10 classmates, or a week of temperatures from a named source. Feed them into your C sum/average/standard-deviation program; run the prime program on a real bill amount.", "deliverable_notes": "Your hand-written raw data sheet (the real 10+ numbers, source named) + a terminal photo of your C program printing the mean and std dev on those numbers (your name printed). Write 2 sentences on what the std dev told you about how spread-out your real data was." },
      { "sno": 2, "unit": "Lab 3-4", "finks_dimension": "Learning How to Learn", "task": "(a) Photograph ONE real thing near you with a Fibonacci-style count (banana-flower bracts, drumstick blossoms, a sunflower head) and count it by hand; run your Fibonacci program to check the sequence reaches your count. (b) Hand-sort 10 real receipts/tickets, tally your swaps, then run your C sort on the same numbers.", "deliverable_notes": "The photo with your hand-count marked + the hand-sort swap tally + both programs' terminal output (your name printed). Write 2 sentences on what hand-tracing taught you that the program output alone did not." },
      { "sno": 3, "unit": "Lab 5", "finks_dimension": "Integration", "task": "Photograph a real signboard or notice in your area (name the shop/place) that mixes Tamil and English. Type one line of it as a string into your C vowel-counter and also count the vowels by hand.", "deliverable_notes": "The signboard photo + terminal output of your vowel count on that real line (your name printed) + your hand-written vowel breakdown. Write 2 sentences on whether the program matched your hand count and any Tamil-transliteration issue you noticed." },
      { "sno": 4, "unit": "Lab 6-7", "finks_dimension": "Human Dimension", "task": "Interview ONE real working person you can name and phone-verify (a shop assistant, college peon, canteen worker, security guard) and record their real details (name, an employee number, department, a rough basic pay they share or you estimate). Model them as your C++ EMPLOYEE object; run the SHAPE virtual-function program too.", "deliverable_notes": "A photo of your interview notes with the person's name + a terminal photo of your EMPLOYEE program printing THEIR details (your name as author printed) + the SHAPE output. Write 3 sentences: who they are, one field hard to fit into a class, and how a virtual function is like one job title doing different work." },
      { "sno": 5, "unit": "Lab 8-10", "finks_dimension": "Application", "task": "Create two real text files from your own life - file1 = your week's actual expenses (one per line), file2 = a NAMED friend's. Use your C++ programs to display each with line numbers and merge them into one; run the overloaded-function matrix program on real integer and float quantities.", "deliverable_notes": "A photo or paste of the two real source files + a terminal photo of the merged file shown with line numbers (your name printed) + the overloaded-function output. Write 2 sentences on what the merged file now shows that the two separate files did not." }
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. The assessment focuses on what AI cannot do. Each Capstone has three parts: (1) the AI-proof primary deliverable — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) a short ~400-word reflection — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC) where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      { "option_no": 1, "title": "A Real Ledger, Compiled", "primary": "Copy one real day from a NAMED shop's sales list (owner consent, phone-verifiable) into a text file. Write a C++ program that reads the file, totals the day, and writes a summary file; bring the source list and both files.", "support": "~400 words on file streams and your loop logic (Labs 1, 9, 10).", "llc": "Compile and run it live on the real data, and defend your total against the shopkeeper's own figure." },
      { "option_no": 2, "title": "The Person Behind the Object", "primary": "Interview ONE real named worker (canteen worker, peon, security guard - phone-verifiable) and record their real details. Model them as a C++ EMPLOYEE class with member functions, and add a virtual function that behaves differently for two roles.", "support": "~400 words on classes, objects and polymorphism (Labs 6-7) tied to a real person.", "llc": "Run the program showing THEIR object, quote them, and defend why one detail did not fit cleanly as a member." },
      { "option_no": 3, "title": "Ten Numbers I Measured, Sorted and Summarised", "primary": "Collect 12+ real numbers you measure or count yourself (prices at a named shop, ages, temperatures). Run your C programs to compute mean and standard deviation and to sort them; hand-trace the sort's swaps first and bring the raw data sheet.", "support": "~400 words on what the std dev and sort revealed (Labs 1, 4).", "llc": "Run both programs, show your hand-swap tally, and defend the one number that skewed the mean." },
      { "option_no": 4, "title": "My Files, Merged", "primary": "Create two real text files from life - your week's expenses and a NAMED friend's - one entry per line. Use your C++ programs to display each with line numbers and merge them into one combined file.", "support": "~400 words on file modes and sequential I/O (Labs 9-10).", "llc": "Run the merge live, show the line-numbered output, and explain what the merged file reveals that the two separate ones hid." },
      { "option_no": 5, "title": "The Shape of a Real Roof", "primary": "Measure ONE real structure you can name and photograph - a temple gopuram tier, a house roof, a water tank. Feed its real dimensions into your C++ SHAPE program (virtual functions) to compute area or volume; bring the photo and your tape measurements.", "support": "~400 words on virtual functions and why one shape's formula differed (Lab 7).", "llc": "Show the structure, run the program, and defend your measurement error." }
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UADCP01'
  and is_latest = true and is_archived = false;

-- ── 2d. 26UADCP02 · CORE PRACTICAL-II-PYTHON PROGRAMMING LAB ────────────────
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay. Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      { "sno": 1, "unit": "Lab 1-3", "finks_dimension": "Foundational Knowledge", "task": "Pick TWO real quantities at home where a common divisor matters - two tile sizes on a floor you measure, or two rope lengths - and find their GCD by hand, then by program. Also measure one longer real length (a wall, a cricket pitch) and compute its square root with your Newton's-method program.", "deliverable_notes": "Your hand-measured numbers (photo of the tape/measurement) + a terminal photo of the GCD, sqrt and power programs running on YOUR numbers (your name printed) + a hand-worked first two Newton iterations on paper. Write 2 sentences comparing the program's root against your tape measure." },
      { "sno": 2, "unit": "Lab 4-5", "finks_dimension": "Application", "task": "Build a real list - your section's marks from a NAMED test, or prices at a named shop - and use your programs to find the highest value and to search for one specific real value. Add a step-counter so linear and binary search each report how many steps they took.", "deliverable_notes": "The real list (hand-written, source named) + a terminal photo showing the max and both searches with their step-counts (your name printed). Write 2 sentences: what value you searched for, and how many fewer steps binary took on YOUR data." },
      { "sno": 3, "unit": "Lab 6-7", "finks_dimension": "Learning How to Learn", "task": "Take a real shuffled pile of 30+ items you physically hold (a deck, dated receipts, library slips). Hand-sort it with insertion sort while tallying your comparisons, then run selection, insertion and merge sort on the same numbers, printing each one's comparison count and timing on YOUR machine.", "deliverable_notes": "Your hand-sort comparison tally sheet (photo) + a terminal photo of the three sorts' counts and timings on your machine (your name printed). Write 2 sentences on which was fastest on your data and one thing hand-sorting taught you that the code hid." },
      { "sno": 4, "unit": "Lab 8-9", "finks_dimension": "Integration", "task": "Model a real weekly purchase as matrices - a quantity vector of what your family bought at a NAMED shop times a price vector - and multiply them with your program to get the total. Separately, generate the first n primes and check which of your real bill amounts are prime.", "deliverable_notes": "The real bill/receipt (photo, shop named) + a terminal photo of your matrix-multiply total beside your prime check (your name printed). Write 2 sentences on whether the code's total matched the real bill and any rounding difference." },
      { "sno": 5, "unit": "Lab 10", "finks_dimension": "Human Dimension", "task": "Get a real piece of text from a NAMED person - transcribe their one-minute WhatsApp voice note, or type out a handwritten note or letter they gave you (with consent). Save it as a .txt file and run your command-line word-count program on it.", "deliverable_notes": "A photo of the source (the letter, or a note of whose voice note plus consent) + a terminal photo of your program counting words, lines and characters via command-line arguments (your name printed). Write 2 sentences on whose words they were and the count." }
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. The assessment focuses on what AI cannot do. Each Capstone has three parts: (1) the AI-proof primary deliverable — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) a short ~400-word reflection — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC) where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      { "option_no": 1, "title": "Sorted on My Own Machine", "primary": "Take a real shuffled pile of 30+ items (dated receipts, cards, slips) you physically hold. Hand-sort with insertion sort, tallying comparisons; then run selection, insertion and merge sort on the same numbers, printing comparison counts and timings on YOUR machine.", "support": "~400 words comparing the three (Labs 6-7).", "llc": "Show your hand-tally, run all three live, and defend which won on your data and why your timings differ from a classmate's." },
      { "option_no": 2, "title": "The Search That Saved Steps", "primary": "Build a real sorted list - a NAMED test's section marks or a named shop's price list. Add step-counters to your linear and binary search programs and search for a real value.", "support": "~400 words on why binary needs sorted data and how many steps it saved on YOUR list (Labs 4-5).", "llc": "Run both searches live with counters visible, and defend what happens when you search for a value that is not there." },
      { "option_no": 3, "title": "My Family's Bill, in Matrices", "primary": "Photograph one real receipt from a NAMED shop. Model it as a quantity vector and a price vector; use your matrix-multiply program to compute the total, check it against the printed bill, and flag which line amounts are prime.", "support": "~400 words on matrix multiplication and any rounding gap (Labs 8-9).", "llc": "Show the receipt, run the program, and defend any mismatch between your total and the bill." },
      { "option_no": 4, "title": "Whose Words? A Word-Count of One Real Voice", "primary": "Get real text from a NAMED person - transcribe their one-minute voice note or type their handwritten note (with consent, phone-verifiable). Save it as a .txt file and run your command-line word-count program on it.", "support": "~400 words on command-line arguments and file reading (Lab 10) and whose words these were.", "llc": "Show the source, run the count from the command line live, and read one line aloud." },
      { "option_no": 5, "title": "Measured, Rooted, Squared", "primary": "Measure two real lengths at home with a tape (two floor tiles, two ropes) and one longer length (a wall). Run your GCD program on the two, and your Newton square-root program on the wall length; check the root against the tape.", "support": "~400 words on the numeric methods (Labs 1-3) and the program-vs-tape difference.", "llc": "Show your measurements, run both programs, and defend Newton's method's first two iterations by hand." }
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UADCP02'
  and is_latest = true and is_archived = false;

-- ── 2e. 26UADS01 · SEC-I-FUNDAMENTALS OF COMPUTER PROGRAMMING ───────────────
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay. Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      { "sno": 1, "unit": "I", "finks_dimension": "Foundational Knowledge", "task": "Collect 8 real facts about ONE named object or vehicle you can photograph - a specific auto-rickshaw (number plate, fare per km, tank litres, seats, whether AC) or your own bicycle. In a C program, declare each as the correct data type (int/float/char) and print them with formatted output.", "deliverable_notes": "A photo of the real object with its details visible (auto number plate, etc.) + a terminal photo of your C program printing the 8 facts with correct types and format specifiers (your name printed) + a hand-written table matching each fact to its C data type. Write 2 sentences on which fact needed a float and why." },
      { "sno": 2, "unit": "II", "finks_dimension": "Application", "task": "Find a real threshold rule you can verify from a NAMED source - a town-bus fare slab, the unit slabs on your real EB bill, or a shop's bulk discount. Write a C program using if-else and a loop over an array of real values (e.g., your last six months' EB units) that applies the rule to each.", "deliverable_notes": "A photo of the real source (EB bill / fare chart) + a terminal photo of your program applying the rule to your real array (your name printed) + a hand-drawn flowchart of the decision. Write 2 sentences on the real rule and the one month that crossed the threshold." },
      { "sno": 3, "unit": "III", "finks_dimension": "Integration", "task": "Model ONE real item from a NAMED local shop as a C++ class - a specific product with its real name, MRP, selling price and stock count, and member functions to display it and to apply a discount. Get the real numbers from the shopkeeper.", "deliverable_notes": "A photo of the real product/shelf with the shop named + a terminal photo of your class printing the item and a discounted price (your name printed). Write 3 sentences: the shop, one detail awkward to fit as a class member, and how a member function is like the shop's own action on the item." },
      { "sno": 4, "unit": "IV", "finks_dimension": "Human Dimension", "task": "Map a REAL hierarchy of people you can name - three generations of your family (grandparent to parent to you), or a named shop's owner to manager to assistant - and model it with C++ inheritance: a base class of shared details, derived classes for the specifics.", "deliverable_notes": "A hand-drawn family/staff tree (photo, real names) + a terminal photo of your inheritance program printing a derived object that also shows inherited base details (your name printed). Write 3 sentences: whose hierarchy it is, what detail belonged in the base class, and what only the derived class needed." },
      { "sno": 5, "unit": "V", "finks_dimension": "Caring", "task": "Choose ONE real record worth preserving that a NAMED person cares about - an elder's daily medicine list, a farmer's plot measurements, a family's important dates. With consent, enter it and write it to a file with your C++ file program; use a pointer to walk and print the records.", "deliverable_notes": "A photo of the source record (or notes with the person named plus consent) + a terminal photo of your program writing and reading back the file, printed via a pointer (your name printed). Write 2 sentences on whose record it is and why keeping it in a file helps them." }
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. The assessment focuses on what AI cannot do. Each Capstone has three parts: (1) the AI-proof primary deliverable — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) a short ~400-word reflection — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC) where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      { "option_no": 1, "title": "The Auto-Rickshaw as a C Program", "primary": "Choose ONE real auto-rickshaw or vehicle you can photograph (number plate visible). Record its real facts (fare/km, tank litres, seats). Write a C program with correct data types and formatted output that computes the fare for a real trip you took.", "support": "~400 words on C types and operators (Unit I) and which fact needed a float.", "llc": "Show the photo, run the fare calculator on your real trip, and defend your type choices." },
      { "option_no": 2, "title": "My EB Bill, Decided by Code", "primary": "Bring your real electricity bill (or a NAMED neighbour's, with consent). Store six months of real unit readings in a C array; write a decision program that applies the actual slab rule to each month.", "support": "~400 words on branching, loops and arrays (Unit II) and the month that crossed a slab.", "llc": "Show the bill, run the program over your real units, and defend the flowchart of your slab logic." },
      { "option_no": 3, "title": "One Shop Item, One Class", "primary": "Pick ONE real product at a NAMED shop; get its real MRP, selling price and stock from the shopkeeper. Model it as a C++ class with member functions to display it and to apply a discount.", "support": "~400 words on classes, objects and member functions (Unit III) and one detail hard to model.", "llc": "Show the product photo, run the class live, and defend why a member function fits the shop's own action." },
      { "option_no": 4, "title": "My Family Tree in Inheritance", "primary": "Map a REAL named hierarchy - three generations of your family, or a named shop's owner to manager to assistant. Model it with C++ inheritance: a base class of shared details, derived classes for specifics.", "support": "~400 words on inheritance and what belonged in the base class (Unit IV).", "llc": "Show your hand-drawn tree with real names, run the derived object showing inherited details, and defend one placement decision." },
      { "option_no": 5, "title": "A Record Worth Keeping", "primary": "With consent, take one real record a NAMED person cares about - an elder's medicine list, a farmer's plot measurements. Write a C++ program that stores it to a file and reads it back, walking the records with a pointer.", "support": "~400 words on pointers and file I/O (Unit V) and why a file helps this person.", "llc": "Show the source record, run the write-and-read live, and explain how the pointer walks the data." }
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UADS01'
  and is_latest = true and is_archived = false;

-- ── 2f. 26UCSS02 · SEC-II-INTRODUCTION TO HTML ──────────────────────────────
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay. Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      { "sno": 1, "unit": "I", "finks_dimension": "Foundational Knowledge", "task": "Hand-write (in a plain text editor, not a builder) a minimal HTML page with correct html/head/body structure that names yourself and your town, and open it in a browser.", "deliverable_notes": "Your .html file's code + a screenshot of it rendering in a real browser + 2 lines on what each structural tag did." },
      { "sno": 2, "unit": "II", "finks_dimension": "Application", "task": "Build a page about one real local person, shop or place (with consent if a person) using headings, paragraphs and at least four text-style tags (bold, italic, strong, etc.) correctly.", "deliverable_notes": "Your code + rendered screenshot + the real subject named + 1 line on one tag you first used wrongly and fixed." },
      { "sno": 3, "unit": "III", "finks_dimension": "Application", "task": "Add to your page an ordered and an unordered list of real content (e.g. steps to reach your college; items sold at a named shop), plus one real image you took and one working hyperlink.", "deliverable_notes": "Your updated code + screenshot showing lists, image and link + confirmation the link works (target named)." },
      { "sno": 4, "unit": "IV", "finks_dimension": "Application", "task": "Create a real HTML table holding data you actually collected (e.g. bus timings, prices, or marks) using rowspan/colspan and cell alignment at least once each.", "deliverable_notes": "Your table code + rendered screenshot + the real data source named + 1 line on where rowspan/colspan helped." },
      { "sno": 5, "unit": "V", "finks_dimension": "Integration", "task": "Build a simple working HTML form (input, textarea, select) that would collect something real (e.g. a feedback form for a named event or shop), and show it rendering.", "deliverable_notes": "Your form code + screenshot + the real use-case named + 2 lines on which inputs you chose and why." }
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. The assessment focuses on what AI cannot do. Each Capstone has three parts: (1) the AI-proof primary deliverable — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) a short ~400-word reflection — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC) where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      { "option_no": 1, "title": "A Real Web Page for Someone I Know", "primary": "Hand-code (no drag-and-drop builders) a small multi-section HTML page for a REAL local subject - a family shop, a self-help group, a relative's service, a campus club you name and get consent from - using structure, text formatting, lists, a real image you took, tables and links.", "support": "~400 words on what you learned about the subject and about markup.", "llc": "Show the live page and edit one tag on request in front of the cohort." },
      { "option_no": 2, "title": "The Table That Holds My Own Data", "primary": "Collect a real dataset yourself (bus timetable, local prices over a week, event schedule) and present it as a well-structured HTML table using spanning and alignment, coded by hand.", "support": "~400 words on the choices you made to keep it readable.", "llc": "Display it live and add a row on request." },
      { "option_no": 3, "title": "A Working Form for a Real Purpose", "primary": "Build, by hand, an HTML form that a named real activity could actually use (event registration, shop enquiry, feedback) with appropriate inputs, and demonstrate it rendering and accepting entries.", "support": "~400 words justifying each field.", "llc": "Demonstrate the form and change one input type live." },
      { "option_no": 4, "title": "From Blank File to Rendered Page — All Mine", "primary": "Produce a page built entirely by your own hand-typed markup that combines every tag family in the course, on a real topic rooted in your locality, and keep a short log of every bug you hit and fixed.", "support": "~400 words walking through two bugs and their fixes.", "llc": "Open your code and the rendered page side by side and answer a 'why doesn't this render?' challenge live." },
      { "option_no": 5, "title": "I Fixed a Broken Page", "primary": "Take a deliberately broken HTML file (one you write wrong on purpose, or a messy real one you find and name) and repair it to render correctly, documenting each structural error you corrected.", "support": "~400 words on the most common mistake and why browsers tolerate some errors.", "llc": "Show before/after and diagnose a fresh broken snippet live." }
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCSS02'
  and is_latest = true and is_archived = false;

-- ── 3. Verify: one row per code, all five columns populated ─────────────────
-- Expect 6 rows: ca/ap/cp/cr/llc all true, n_activities = 5, n_options = 5.
select course_code,
       (concept_applications is not null) as ca,
       (assessment_pattern   is not null) as ap,
       (capstone_project     is not null) as cp,
       (capstone_rubric      is not null) as cr,
       (llc_conference       is not null) as llc,
       jsonb_array_length(concept_applications->'activities') as n_activities,
       jsonb_array_length(capstone_project->'options')        as n_options
from public.bos_course_syllabi
where course_code in ('26UADC01','26UADC02','26UADCP01','26UADCP02','26UADS01','26UCSS02')
  and is_latest = true and is_archived = false
order by course_code;

commit;
