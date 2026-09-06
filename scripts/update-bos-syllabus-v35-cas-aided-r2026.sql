-- ─────────────────────────────────────────────────────────────────────
-- v3.5 Fink's/Capstone import — JKKN CAS (Aided) · R-2026 First Year · AY 2026-27
-- Generated from C:/tmp/jkkn-cas-aided-ay2026-27-R2026 (81 courses,
-- 9 programmes). Bold **markers** pre-stamped (matches
-- update-bos-syllabus-v35-bold-markers.sql output).
-- REQUIRES: supabase/migrations/20260709_bos_syllabus_finks_capstone_v35.sql applied.
-- Targets is_latest=true, is_archived=false rows only; assessment_structure untouched.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ── 0. Sanity: every code resolves to exactly one latest row ──
-- Expect 81 rows, latest_rows = 1 each. If not, ROLLBACK and investigate.
select course_code, count(*) as latest_rows
from public.bos_course_syllabi
where course_code in ('24UDIM01','26UENC01','26UENC02','26UENC03','26UENC04','26UENDE1','26UENDE2','26UENNM1','26UENNM2','26UENS01','26UENS02','26UGEN01','26UGEN02','26UHIC01','26UHIC02','26UHIC03','26UHIC04','26UHINM1','26UHINM2','26UHIS01','26UHIS02','26UBOGE01','26UBOGE02','26UCHC01','26UCHC02','26UCHCP01','26UCHCP02','26UCHGE1','26UCHGE2','26UCHGEP01','26UCHGEP02','26UCHNM1','26UCHNM2','26UCHS01','26UCHS02','26UGEGE1','26UGEGE2','26UMAC01','26UMAC02','26UMAC03','26UMAC04','26UMADE1','26UMADE2','26UMADEP01','26UMADEP02','26UMAGE2','26UMAGEP01','26UMANM1','26UMANM2','26UMAS01','26UMAS02','26USTDE1','26USTDE2','26USTDEP01','26USTDEP02','26UZOC01','26UZOC02','26UZOC03','26UZOCPO1','26UZOCP02','26UZOFC1','26UZOA01','26UZOGE02','26UZOAP01','26UZONM1','26UZONM2','26UZONM3','26UZONM4','26UZOS01','26UCMC01','26UCMC02','26UCMC03','26UCMC04','26UCMNM1','26UCMNM2','26UCMS01','26UCMS02','26UECGE1','26UECGE4','26UGTA01','26UGTA02')
  and is_latest = true and is_archived = false
group by course_code
order by course_code;

-- ── 1. Canonical v3.5 common blocks (identical across all courses) ──
update public.bos_course_syllabi
set
  assessment_pattern = $j${
  "internal_marks": 30,
  "external_marks": 70,
  "components": [
    {
      "sno": 1,
      "component": "CIA I, CIA II & Model Examination",
      "marks": 15
    },
    {
      "sno": 2,
      "component": "Activities*",
      "marks": 5
    },
    {
      "sno": 3,
      "component": "Capstone Project (see below)",
      "marks": 10
    }
  ],
  "activities_note": "* Activities: Assignment / Case study / Field survey / PPT / Group discussion / Subject Viva / Report Writing / Mind map / Flow chart / Model making / Debate / Surprise test / Open book test.",
  "note": "The five Concept Applications are formative Fink's-shaped practice. The summative Fink's assessment is the Capstone Project (10 marks) detailed below."
}$j$::jsonb,
  capstone_rubric = $j${
  "total_marks": 10,
  "note": "10 marks · common to all 5 options",
  "criteria": [
    {
      "sno": 1,
      "criterion": "Specificity of lived engagement (not generic; named places, named people, real measurements, real data)",
      "marks": 2
    },
    {
      "sno": 2,
      "criterion": "Quality of disciplinary craft (course-appropriate technique — reasoning, measurement rigour, code, analysis — in service of the subject)",
      "marks": 3
    },
    {
      "sno": 3,
      "criterion": "Honest self-reflection (pre-conceptions named, shift documented, courage in saying what is hard)",
      "marks": 2
    },
    {
      "sno": 4,
      "criterion": "Continuing commitment OR ethical care (subject consent, give-back, named follow-through where applicable)",
      "marks": 2
    },
    {
      "sno": 5,
      "criterion": "Authentic voice + LLC presentation (the Capstone is presented at the Learners Led Conference — clarity, ownership, ability to answer questions; AI use declared if any — Humans are Principals, AI are Agents)",
      "marks": 1
    }
  ]
}$j$::jsonb,
  llc_conference = $j${
  "title": "End-of-Course Learners Led Conference",
  "subtitle": "cohort audience · faculty + Senior Learner facilitate · no outside guest required",
  "description": "In the final fortnight of the semester, the cohort convenes a **Learners Led Conference** — JKKN's established learner-run session format — in which **every Learner presents their Capstone**: **a 5–7 minute talk** showing what they made, measured, built, or found (the object, the data table, the hand-drawn graph, the running program, the quoted voice, the photograph of the named place) and answering two or three questions from peers and faculty. The Learner is the Principal of the session. Faculty and the Senior Learner facilitate and assess the presentation dimension of the Capstone rubric. This makes each Capstone presentable and public-to-the-cohort without importing Full-tier Public-Exhibition machinery."
}$j$::jsonb,
  last_modified_at = now()
where course_code in ('24UDIM01','26UENC01','26UENC02','26UENC03','26UENC04','26UENDE1','26UENDE2','26UENNM1','26UENNM2','26UENS01','26UENS02','26UGEN01','26UGEN02','26UHIC01','26UHIC02','26UHIC03','26UHIC04','26UHINM1','26UHINM2','26UHIS01','26UHIS02','26UBOGE01','26UBOGE02','26UCHC01','26UCHC02','26UCHCP01','26UCHCP02','26UCHGE1','26UCHGE2','26UCHGEP01','26UCHGEP02','26UCHNM1','26UCHNM2','26UCHS01','26UCHS02','26UGEGE1','26UGEGE2','26UMAC01','26UMAC02','26UMAC03','26UMAC04','26UMADE1','26UMADE2','26UMADEP01','26UMADEP02','26UMAGE2','26UMAGEP01','26UMANM1','26UMANM2','26UMAS01','26UMAS02','26USTDE1','26USTDE2','26USTDEP01','26USTDEP02','26UZOC01','26UZOC02','26UZOC03','26UZOCPO1','26UZOCP02','26UZOFC1','26UZOA01','26UZOGE02','26UZOAP01','26UZONM1','26UZONM2','26UZONM3','26UZONM4','26UZOS01','26UCMC01','26UCMC02','26UCMC03','26UCMC04','26UCMNM1','26UCMNM2','26UCMS01','26UCMS02','26UECGE1','26UECGE4','26UGTA01','26UGTA02')
  and is_latest = true and is_archived = false;

-- ── 2. Per-course blocks ──
-- ── 24UDIM01 · b-a-english (kit code 25UDIM01 → live 24UDIM01) ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Identify one real disaster (natural or man-made) that has affected your region and record its impact from a reliable source or an elder's account.","deliverable_notes":"The named disaster + its real impact (sourced/interview) + 1 line on why studying disaster management matters locally."},
      {"sno":2,"unit":"II","finks_dimension":"Foundational Knowledge","task":"Classify three real hazards present in your own area (natural, man-made, planetary) with evidence.","deliverable_notes":"Your three real local hazards classified + 1 line on the most likely one."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Do a real vulnerability/risk assessment of your home or campus for one hazard, naming specific weak points.","deliverable_notes":"Your assessment with specific real weak points + 1 line on the highest-priority risk."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Find one real example of information technology used in disaster management (an alert app, a warning system) and describe how it works.","deliverable_notes":"The named IT tool + how it works + 1 line on who it reaches and who it misses."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Design one realistic risk-reduction/mitigation measure for your home/campus and identify the first step to implement it.","deliverable_notes":"Your measure + the first step + who must be involved + 1 line on its feasibility."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Disaster Plan for a Place I Know","primary":"conduct a real hazard, vulnerability and risk assessment of a named place (home, campus, neighbourhood), and produce a concrete, feasible disaster-preparedness and mitigation plan.","support":"~400 words on preparedness grounded in real risk.","llc":"present the plan and defend your top priority live."},
      {"option_no":2,"title":"The Hazards Around Me","primary":"map and classify the real hazards of your locality with evidence, ranking them by likelihood and impact.","support":"~400 words on hazard assessment.","llc":"assess a fresh hazard live."},
      {"option_no":3,"title":"Technology That Saves Lives","primary":"study real IT/early-warning systems used in disaster management, assess their reach and gaps, and propose one improvement for your area.","support":"~400 words on IT in disaster management.","llc":"defend your improvement live."},
      {"option_no":4,"title":"A Real Disaster, Learned From","primary":"study one real disaster that affected your region (sources + consented interviews), reconstruct what happened and extract preparedness lessons.","support":"~400 words on learning from disaster.","llc":"present the lessons and answer a preparedness question live."},
      {"option_no":5,"title":"Reducing a Real Risk","primary":"identify one specific real risk and design, and if possible begin, a mitigation measure, documenting the start.","support":"~400 words on risk reduction.","llc":"present the measure and answer 'how would you scale it?' live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '24UDIM01'
  and is_latest = true and is_archived = false;

-- ── 26UENC01 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Ask one named elder in your street or family to sing a folk song, lullaby (thaalattu), or old cinema song they hold by heart. Clap along and count the beats in one line.","deliverable_notes":"A phone recording of the named singer + a hand-marked scansion of two lines (mark stressed / and unstressed x beats) + 3-4 sentences: whose song it is, how many beats per line, and which English form (sonnet, ode, elegy line) it sits closest to."},
      {"sno":2,"unit":"II","finks_dimension":"Caring","task":"Walk to one real memorial you can name near Kavandampatti, Sankagiri, or Komarapalayam - a hero-stone (nadukal), a roadside samadhi, an old gravestone, or a garlanded photo in a home. Ask one person whose it is.","deliverable_notes":"A photo of the memorial with your hand in frame + the name you learned + 3-4 sentences linking it to Gray's 'mute inglorious' villagers, Milton's patience in loss, or Keats's longing - one felt line, not a plot summary."},
      {"sno":3,"unit":"III","finks_dimension":"Learning How to Learn","task":"For five days keep a hand-written reading log, testing one Bacon maxim from 'Of Studies' ('some books are to be tasted, others swallowed') on your own textbooks and phone-reading.","deliverable_notes":"A photo of the five-day handwritten log + a count of how many things you 'tasted' versus 'chewed' + 3-4 sentences on which Bacon line actually changed how you read this week."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"With two or three named classmates, rehearse and act ONE short scene from Lamb's Tales (the lovers' quarrel in A Midsummer Night's Dream, or Viola in disguise in Twelfth Night) in your own words, in the corridor or classroom.","deliverable_notes":"A 2-3 minute phone video of the acted scene + the list of who played whom + 3-4 sentences on one line that felt different when spoken aloud versus silently read."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Interview one real married couple you know (grandparents, neighbours) about their FIRST impression of each other and how the match was made.","deliverable_notes":"The couple's names + one quoted sentence from each (their own words) + 3-4 sentences comparing their 'first impression' to Elizabeth's and Darcy's in Pride & Prejudice, and whether pride or prejudice appears."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Song My Street Already Sings","primary":"record ONE named elder singing a folk song, lullaby, or old song they carry only in memory; transcribe two stanzas in their language and mark the metre by hand; name the English form it echoes (ballad, elegy, ode).","support":"~400 words linking the song's metre and theme to Unit I prosody and one Unit II poem.","llc":"play thirty seconds of the recording and clap the metre live for the cohort. AI can define metre; it cannot record your grandmother's voice."},
      {"option_no":2,"title":"The Forgotten Stone","primary":"photograph a real neglected memorial (nadukal, roadside samadhi, garlanded photo) near your village; ask a NAMED local whose it is and one true fact about their life.","support":"~400 words connecting that unremembered person to Gray's Elegy and its unsung villagers.","llc":"show the photo and tell the cohort the name and the one fact you learned. AI can summarise the elegy; it cannot find your village's forgotten dead."},
      {"option_no":3,"title":"Of Studies, Tested on Me","primary":"keep a seven-day hand-written reading log applying three of Bacon's maxims to your own real reading; bring the physical log to defend.","support":"~400 words on which maxim held and which failed for a first-year learner.","llc":"hold up the log and read one day's entry aloud. AI can paraphrase Bacon; it cannot log the way YOU actually read this week."},
      {"option_no":4,"title":"Two People, One Match","primary":"interview one real married couple (named, phone-verifiable) about first impressions and how they met or were matched; quote both in their words.","support":"~400 words comparing their story to the pride, prejudice, and class of Austen's novel.","llc":"play or read the two quotes and say what surprised you. AI can retell Pride & Prejudice; it cannot interview YOUR neighbours."},
      {"option_no":5,"title":"The Scene We Dared to Speak","primary":"with named classmates, stage and film a three-minute scene from Lamb's Tales; you must appear and speak in it.","support":"~400 words on how acting the part changed your reading of one character.","llc":"play sixty seconds of the video and answer why you delivered one line the way you did. AI can describe the play; it cannot put your voice in the role."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENC01'
  and is_latest = true and is_archived = false;

-- ── 26UENC02 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Go to a real river, canal, tank, or field you can name - the Cauvery at Bhavani, a Komarapalayam tank, your village kulam. Sit for ten minutes and notice, as Parthasarathy does in 'River, Once' and Naidu in 'The Village Song'.","deliverable_notes":"One photo of the place (you in frame) + four hand-written lines you wrote there in the poet's manner + 3-4 sentences naming one image you borrowed from a Unit I poem and one you saw with your own eyes."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Find one real trace of India's freedom or reform story near you - a Gandhi or Bharathi statue, a Quit India plaque, a road named for a leader, or a NAMED elder who remembers Independence-era stories.","deliverable_notes":"A photo of the statue/plaque OR the elder's name and one remembered line + 3-4 sentences linking it to Gandhi's confession in 'Steal and Atonement', Vivekananda's Chicago address, or Aurobindo's writing."},
      {"sno":3,"unit":"III","finks_dimension":"Human Dimension","task":"Spend ten quiet minutes really watching one person usually judged by looks - a bus conductor, a rough-spoken vendor, an old or blind traveller - as in Bond's 'The Eyes Are Not Here' and Abbas's 'Sparrows'. Notice one gentle or hidden thing.","deliverable_notes":"Three sentences describing what you observed (no photo of a face without consent - describe instead) + the place and time + 3-4 sentences on how Bond or Abbas revealed an inner life behind a hard surface."},
      {"sno":4,"unit":"IV","finks_dimension":"Caring","task":"Do ONE small real act of service this week, as Sudha Murty served the women in 'Three Thousand Stitches' - help a worker, teach a child a letter, mend or give something needed.","deliverable_notes":"A photo of the thing you did or made (a mended item, a child's practised page) + who it was for + 3-4 sentences on the dignity you witnessed, linked to Murty's account."},
      {"sno":5,"unit":"V","finks_dimension":"Learning How to Learn","task":"Read Living Smile Vidya's 'I am Vidya' or C.K. Janu's 'Mother Forest'. BEFORE reading, hand-write three things you assume about that person's life; AFTER, write what you actually learned.","deliverable_notes":"The hand-written before/after list + 3-4 sentences on which assumption broke and how the writer's own voice (not a summary) taught you to listen to a life unlike yours."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The River That Remembers Me","primary":"at a real named river, tank, or field, photograph the place and hand-write an original twelve-line poem in the manner of a Unit I poet, rooted in what you saw and heard there.","support":"~400 words on the poetic devices you borrowed and the real details only you could observe.","llc":"read your poem aloud and show the photo. AI can imitate Naidu; it cannot stand at your Bhavani riverbank."},
      {"option_no":2,"title":"The Elder Who Remembers Freedom","primary":"interview one NAMED elder (phone-verifiable) about a memory of Independence, an old struggle, or a reformer they admired; record their voice with consent.","support":"~400 words linking their memory to Gandhi, Vivekananda, or Aurobindo in Unit II.","llc":"play the recording and tell what it taught you. AI can summarise the freedom movement; it cannot interview YOUR elder."},
      {"option_no":3,"title":"The Face I Misread","primary":"over a week, respectfully observe (no secret photos of faces) one person society judges by appearance, and keep a hand-written field note of their hidden inner life, as Abbas did in 'Sparrows'.","support":"~400 words connecting to Bond and Abbas.","llc":"read your field note and say what you first assumed. AI can describe empathy; it cannot watch YOUR bus conductor for you."},
      {"option_no":4,"title":"Three Thousand Stitches, One of Mine","primary":"perform one real, photographable act of service and document it (the mended cloth, the taught child, the fed worker) with the person's first name.","support":"~400 words on dignity and service through Sudha Murty's chapter.","llc":"show the artefact or photo and describe the moment. AI can define service; it cannot do YOUR act of kindness."},
      {"option_no":5,"title":"The Voice Unlike Mine","primary":"read Janu's 'Mother Forest' or Vidya's 'I am Vidya' and keep a hand-written dialogue-journal - your questions in one column, the writer's own quoted lines answering in the other.","support":"~400 words on assumptions the book broke.","llc":"read one question-and-answer pair aloud. AI can paraphrase the book; it cannot record how it changed YOUR listening."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENC02'
  and is_latest = true and is_archived = false;

-- ── 26UENC03 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Pick one real object or plant near you - a red hibiscus, a well-rope, a cattle bell, a mobile charger. Build an extended comparison (conceit) between it and love or time, as Donne likens lovers to saints and Burns to 'a red, red rose'.","deliverable_notes":"The object (or a photo, hand in frame) + your four-to-six-line hand-written conceit + 3-4 sentences on which poet's device you copied and whether your comparison held or broke down."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Ask two NAMED elders in your home or street for three superstitions or old beliefs they still keep (about crows, salt, Tuesdays, the evil eye), as Addison collects in 'Household Superstitions'.","deliverable_notes":"The two elders' names + a hand-written list of the beliefs in their own words + 3-4 sentences linking them to Addison's essay and to what each belief protects against or fears."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Observe one real situation where surface and truth differ - a polished advertisement versus the actual product, a leader's promise versus the road outside. Note both sides honestly.","deliverable_notes":"A photo of the surface (the poster, the promise) + one sentence on the reality you saw + 3-4 sentences linking the gap to Webster's 'white devil' - evil that wears a fair face."},
      {"sno":4,"unit":"IV","finks_dimension":"Caring","task":"Interview one NAMED person who chased a big dream - a business, a migration abroad, a hard degree - and ask what it COST them, not only what it gave.","deliverable_notes":"The person's name + one quoted sentence on the price they paid + 3-4 sentences connecting their bargain to Faustus selling his soul for power and knowledge."},
      {"sno":5,"unit":"V","finks_dimension":"Learning How to Learn","task":"Notice one real small absurdity in your town - a rule everyone breaks, a queue that means nothing, a sign no one reads. Describe it as a Lilliputian traveller from Gulliver's Travels would.","deliverable_notes":"A photo of the absurd thing + four-to-six hand-written lines in mock-serious Gulliver style + 3-4 sentences on what the satire let you see that a plain complaint could not."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Red, Red Rope: My Own Conceit","primary":"choose a real named local object; build a sustained metaphysical conceit of twelve or more hand-written lines linking it to love, time, or death in the manner of Donne, Marvell, or Burns; bring the object.","support":"~400 words on the device and where the comparison strains.","llc":"hold up the object and read the conceit. AI can list metaphysical tricks; it cannot hold your well-rope."},
      {"option_no":2,"title":"The Beliefs My Elders Keep","primary":"interview two NAMED elders and record (with consent) five living superstitions or old customs in their own words.","support":"~400 words connecting them to Addison's and Steele's essays on everyday life.","llc":"play or read one belief and say what it guards against. AI can invent superstitions; it cannot capture YOUR elders' actual words."},
      {"option_no":3,"title":"The White Devil Next Door","primary":"document one real gap between a fair surface and a darker reality (an advertisement versus the product, a promise versus the pothole) with a photo and a verified fact.","support":"~400 words via Webster's tragedy of beautiful evil.","llc":"show the photo and name the gap. AI can explain the play's theme; it cannot photograph the promise on YOUR street."},
      {"option_no":4,"title":"What the Dream Cost","primary":"interview one NAMED person about a great ambition and its true price; quote them exactly.","support":"~400 words linking their bargain to Faustus's pact.","llc":"play or read the quote and say whether the price was worth it. AI can retell Dr Faustus; it cannot interview YOUR dreamer."},
      {"option_no":5,"title":"A Traveller in My Own Town","primary":"write an original one-page Swiftian satire of one real local absurdity you photographed and observed.","support":"~400 words on how satire, unlike a rant, reveals the folly.","llc":"read a paragraph aloud and name the real thing behind it. AI can produce generic satire; it cannot see the absurdity YOU stood in front of."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENC03'
  and is_latest = true and is_archived = false;

-- ── 26UENC04 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Collect one real public text from your life - a temple festival notice, a government proclamation, a wedding invitation letter, or an old family letter. Identify its genre (proclamation, letter, notice, narrative).","deliverable_notes":"A photo of the real document + a hand-written label of its genre and its audience + 3-4 sentences comparing it to an early American genre (a Puritan sermon, the Declaration's proclamation, a personal letter)."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Find one real tree, field, or spot from your childhood you can name. Stand there and write a short 'Birches'-style memory poem, or a four-line elegy for someone or something lost, after Whitman, Poe, or Dickinson.","deliverable_notes":"A photo of the place (you in frame) + six-to-eight hand-written lines + 3-4 sentences naming which Unit II poet's music you followed and one real memory only you hold."},
      {"sno":3,"unit":"III","finks_dimension":"Caring","task":"Write your OWN one-paragraph 'I have a dream' for one real problem in your village or campus (water, a broken road, a girl's schooling). Read it aloud to one person and note their reaction.","deliverable_notes":"The hand-written dream-paragraph + the name of who you read it to and their one-line response + 3-4 sentences linking your dream to King's rhetoric or Emerson's self-reliance."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Ask one family member about a hope or plan of theirs that did not work out (a job, a marriage, a move), as Amanda and Tom carry broken hopes in The Glass Menagerie.","deliverable_notes":"The person's relation and name + one quoted sentence + 3-4 sentences on how Williams shows disappointment through Laura's glass animals or Tom's escape, and what you saw in your own family."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Notice one real way your community marks or labels a person (a nickname, gossip, 'that family'). Observe respectfully and name no one publicly.","deliverable_notes":"A hand-written note of the label and how it is used (no real names) + 3-4 sentences linking it to Hester Prynne's scarlet 'A' and the community acting as judge in The Scarlet Letter."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Notice on My Wall","primary":"collect three real public texts from your life (a proclamation, a letter, a notice) and hand-annotate each for genre, audience, and purpose.","support":"~400 words tying them to early American genres - sermon, Declaration, slave or captivity narrative, letter.","llc":"show the three real documents and read your labels. AI can define the genres; it cannot pull the notice off YOUR wall."},
      {"option_no":2,"title":"The Tree I Still Climb in My Mind","primary":"at a real named childhood place, write an original memory poem in the manner of Frost, or an elegy after Whitman or Dickinson; photograph the place.","support":"~400 words on the poet's device and your real memory.","llc":"read the poem and show the photo. AI can mimic Frost; it cannot climb YOUR childhood tree."},
      {"option_no":3,"title":"My Village Has a Dream","primary":"write and deliver aloud (record it) an original 'I have a dream' speech for one real local injustice, and get one named listener's reaction.","support":"~400 words via King's rhetoric and Emerson's self-reliance.","llc":"perform a sixty-second excerpt live. AI can echo King; it cannot dream YOUR village's specific wound."},
      {"option_no":4,"title":"The Hope That Broke","primary":"interview one NAMED family member about a hope that did not come true; record with consent.","support":"~400 words linking it to Amanda, Tom, and Laura in The Glass Menagerie.","llc":"play or read the quote and connect it to a character. AI can retell the play; it cannot interview YOUR family."},
      {"option_no":5,"title":"The Letter My Town Pins","primary":"keep a week-long, respectful, hand-written field journal of how your community labels and shames people (no real names).","support":"~400 words via Hawthorne's scarlet letter and communal judgment.","llc":"read one journal entry and name the mechanism of shame. AI can summarise the novel; it cannot watch how YOUR town judges."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENC04'
  and is_latest = true and is_archived = false;

-- ── 26UENDE1 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Pick one real local institution - a temple, the Erode market, a village, a mill - and map its 'social ladder' from top to bottom, as Tudor England ran from monarch down to peasant.","deliverable_notes":"A hand-drawn ladder or pyramid of the real roles you observed (owner to supervisor to worker, or trustee to priest to devotee) + the place named + 3-4 sentences comparing it to Tudor estates (crown, nobles, commoners)."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Ask one NAMED elder about a reform they saw in their lifetime - a temple opened to all, a ritual dropped, a custom changed. Note who resisted and who pushed.","deliverable_notes":"The elder's name + a hand-written before/after of the custom + 3-4 sentences linking it to the English Reformation's push against old religious authority."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Trace ONE real local product - Erode turmeric, Komarapalayam carpet, Bhavani jamakkalam, Tiruchengode rig-bore - from its maker to its buyer. Ask one seller where it finally goes.","deliverable_notes":"A photo of the product + the named seller and the farthest place it reaches + 3-4 sentences linking this trade to England's colonial expansion and the rise of merchant wealth."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Interview one NAMED handloom weaver, farmer, or old worker about how a machine (power-loom, tractor, flour mill) changed their work and wages.","deliverable_notes":"The worker's name + one quoted sentence on what the machine gave and what it took + 3-4 sentences linking it to the Industrial and Agrarian Revolutions in England."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"Find one real local effort to help or reform - a self-help group, an anti-liquor or cleanliness drive, a free meal (annadhanam), a night school. Meet one person in it.","deliverable_notes":"The effort's name and one participant's name + a photo or the person's one-line reason for joining + 3-4 sentences linking it to Methodism and the humanitarian movements that reformed England."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Ladder in My Market","primary":"at one real named local institution, observe and hand-draw its full social hierarchy, verifying each rung by asking a real person their role.","support":"~400 words comparing the local order to Tudor England's estates.","llc":"show the drawing and name each rung. AI can list Tudor classes; it cannot map YOUR Erode market."},
      {"option_no":2,"title":"The Reform My Elder Lived","primary":"interview one NAMED elder (phone-verifiable) about a religious or social reform in their lifetime; record with consent.","support":"~400 words linking their story to the English Reformation and Counter-Reformation.","llc":"play or read the memory and name who resisted. AI can explain the Reformation; it cannot interview YOUR elder."},
      {"option_no":3,"title":"How My Turmeric Travels","primary":"trace one real local product from maker to distant buyer, photographing it and interviewing a named trader about its reach.","support":"~400 words connecting local trade to England's colonial commercial expansion.","llc":"show the product and draw its route on the board. AI can describe mercantilism; it cannot follow YOUR town's turmeric."},
      {"option_no":4,"title":"The Loom the Machine Replaced","primary":"interview one NAMED weaver, farmer, or worker about a machine that changed their livelihood, recording the wage-and-work change in their words.","support":"~400 words via the Industrial and Agrarian Revolutions.","llc":"play the quote and connect it to enclosure or the factory system. AI can summarise industrialisation; it cannot interview YOUR weaver."},
      {"option_no":5,"title":"The Small Reform Near Me","primary":"visit one real local humanitarian or reform effort, photograph it, and interview one named participant.","support":"~400 words linking it to Methodism and the English humanitarian movements.","llc":"show the photo and name what it reforms. AI can define reform; it cannot join YOUR village's effort."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENDE1'
  and is_latest = true and is_archived = false;

-- ── 26UENDE2 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Integration","task":"Find one real 'union' near you - two hamlets under one panchayat, a farmers' cooperative, a self-help federation. Ask how and why they joined together.","deliverable_notes":"The union's name + a simple hand-drawn map of what joined + 3-4 sentences comparing it to the Union of England and Scotland and the pooling of land and labour in the Agrarian and Industrial Revolutions."},
      {"sno":2,"unit":"II","finks_dimension":"Caring","task":"Meet one NAMED person whose faith drives them to serve - a temple, church, or mosque volunteer, or a bhajan or annadhanam group member. Ask why they serve.","deliverable_notes":"The person's name + a photo of the service (or the food or thing given) + 3-4 sentences linking their faith-led service to the Methodist movement and other humanitarian movements in England."},
      {"sno":3,"unit":"III","finks_dimension":"Human Dimension","task":"Interview one NAMED elder about a big political upheaval they lived through - the Emergency of 1975, a bandh, a large protest, or Partition stories they heard.","deliverable_notes":"The elder's name + one quoted sentence on how ordinary life changed + 3-4 sentences linking it to the upheavals of the American War of Independence and the French Revolution."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Look at one real democratic-rights object or event - a voter ID, an electoral roll page, a panchayat election notice, a polling booth. Note who can and cannot vote.","deliverable_notes":"A photo of the real object or notice (hide personal numbers) + the polling place named + 3-4 sentences linking widening suffrage to the English Reform Bills and the Victorian expansion of the vote."},
      {"sno":5,"unit":"V","finks_dimension":"Learning How to Learn","task":"Ask three people of different ages (a grandparent, a parent, and yourself) how they sent an URGENT message and how they studied at your age.","deliverable_notes":"A hand-written three-generation table (letter / landline / smartphone; slate / book / phone) with the named people + 3-4 sentences linking the change to Victorian schooling, railways, and the telegraph."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Union Near My Village","primary":"study one real local union or cooperative, hand-map what joined, and interview a named member about why.","support":"~400 words via the Union of England and Scotland and the pooling of land and labour.","llc":"show the map and name the reason they united. AI can define union; it cannot map YOUR cooperative."},
      {"option_no":2,"title":"Faith That Feeds","primary":"document one real faith-driven service effort with a photo and a named participant's own reason for serving.","support":"~400 words linking it to Methodism and English humanitarian reform.","llc":"show the photo and name who is served. AI can describe charity; it cannot meet YOUR annadhanam volunteer."},
      {"option_no":3,"title":"The Upheaval My Elder Survived","primary":"interview one NAMED elder about a political upheaval they lived through; record with consent.","support":"~400 words connecting it to the American and French Revolutions.","llc":"play or read the memory and name the parallel. AI can narrate revolutions; it cannot interview YOUR elder."},
      {"option_no":4,"title":"Who Gets to Vote","primary":"photograph and study one real democratic-rights object (an electoral roll page, a voter ID, a polling notice) and record the real rules of who may vote.","support":"~400 words via the Reform Bills and the Victorian franchise expansion.","llc":"show the artefact and explain the rule. AI can list the Reform Acts; it cannot photograph YOUR polling booth."},
      {"option_no":5,"title":"Three Generations, Three Ways to Reach Me","primary":"build a real, hand-written three-generation table (named people) of how messages and learning travelled - letter, landline, smartphone; slate, book, screen.","support":"~400 words via Victorian education, railways, and communication.","llc":"present the table and name the biggest leap. AI can list inventions; it cannot interview YOUR grandparents."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENDE2'
  and is_latest = true and is_archived = false;

-- ── 26UENNM1 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Proofread a real piece of writing (a notice, a message, your own draft) and correct 10 errors, naming the rule for each.","deliverable_notes":"The real text + your 10 corrections with rules + 1 line on your most frequent error."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Observe one real conversation/interaction and note three non-verbal signals and how they changed the meaning.","deliverable_notes":"Your notes on the real interaction + the three signals + 1 line on verbal vs non-verbal."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Write a real resume for yourself and one real message/agenda/minutes for an actual small meeting or event.","deliverable_notes":"Your resume + the message/agenda/minutes + 1 line on the format rule you applied."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Write a real formal email and deliver a short real presentation (record it or get peer sign-off).","deliverable_notes":"Your email + evidence of the presentation + 1 line on your biggest delivery weakness."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Use an AI tool to draft one piece, then improve it yourself; document what the AI did well and badly and one ethical concern.","deliverable_notes":"The AI draft + your improved version + 1 line on an ethical/societal implication you noticed."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"My Communication Portfolio","primary":"build a real portfolio of workplace communication you produce for genuine purposes — resume, formal email, meeting minutes, a recorded presentation — refined through real feedback.","support":"~400 words on what makes communication effective.","llc":"deliver a short piece live and take questions."},
      {"option_no":2,"title":"AI as a Drafting Assistant, Honestly","primary":"use AI tools to draft communication, then critically improve and fact-check the output, documenting where AI helped, failed, and the ethics of using it.","support":"~400 words on human-in-the-loop writing.","llc":"improve a fresh AI draft live."},
      {"option_no":3,"title":"The Errors I Learned to Fix","primary":"assemble and correct a corpus of real writing errors (from signage, notices, drafts), building a personal error taxonomy.","support":"~400 words on common English errors.","llc":"correct a fresh sentence and name the rule live."},
      {"option_no":4,"title":"Reading the Unspoken","primary":"study real interactions for non-verbal communication and its effect on meaning, with documented observations.","support":"~400 words on verbal vs non-verbal.","llc":"interpret a non-verbal cue live."},
      {"option_no":5,"title":"A Presentation That Lands","primary":"prepare and deliver a real presentation for a genuine audience, gather feedback, and evidence improvement.","support":"~400 words on presentation skills.","llc":"present a segment live and take a question."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENNM1'
  and is_latest = true and is_archived = false;

-- ── 26UENNM2 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Watch one real film scene and identify three elements of 'the language of cinema' (a shot, a cut, a sound choice) and their effect.","deliverable_notes":"The named film/scene + the three elements + 1 line on how they shaped meaning."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Take one real film sequence and break down its shot scale (close-up to long shot) and what each shot achieves.","deliverable_notes":"Your shot-by-shot breakdown of the real sequence + 1 line on the most expressive shot."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Watch one real documentary/short/animation and analyse how its form differs from a mainstream feature.","deliverable_notes":"The named film + your form analysis + 1 line on what the form let it do."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Compare one real book/story with its film adaptation and assess fidelity and what the adaptation changed and why.","deliverable_notes":"The named book+film + your comparison + 1 line on a change that worked or failed."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Write your own real film review of a film you watch, with a clear evaluation supported by specific scenes.","deliverable_notes":"Your review + 1 line on the single strongest reason for your verdict."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Film, Read Closely","primary":"analyse one real film in depth — cinematic language, shot design, form, and (if adapted) fidelity — supported by specific scenes you cite, culminating in your own reasoned review.","support":"~400 words on reading film as a text.","llc":"analyse a fresh scene's technique live."},
      {"option_no":2,"title":"The Shot That Tells the Story","primary":"dissect real film sequences by shot scale and editing, showing how visual choices create meaning.","support":"~400 words on film grammar.","llc":"read a fresh sequence's shots live."},
      {"option_no":3,"title":"Book to Screen","primary":"compare a real literary work with its adaptation, analysing fidelity, changes and their effects.","support":"~400 words on adaptation.","llc":"judge a fresh adaptation choice live."},
      {"option_no":4,"title":"Beyond the Mainstream","primary":"study real documentary/short/animation/experimental films and analyse how their form expands what cinema can do.","support":"~400 words on film forms.","llc":"analyse a fresh non-feature film live."},
      {"option_no":5,"title":"The Critic's Voice","primary":"write a set of real film reviews with evidence-based evaluation, developing your critical voice.","support":"~400 words on film criticism.","llc":"defend a verdict live with scene evidence."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENNM2'
  and is_latest = true and is_archived = false;

-- ── 26UENS01 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Learning How to Learn","task":"Listen to one real spoken source fully - a bus-stand or railway announcement, a Tamil or English news bulletin, or a shopkeeper giving directions. Catch five facts WITHOUT writing during, then recall them.","deliverable_notes":"A hand-written note of the five facts + where and when you heard it + 3-4 sentences on what you missed the first time and the listening trick that helped you catch it."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Actually DO one real spoken act with a named person - introduce yourself to a new classmate, make a real phone inquiry, or give a proper vote of thanks. Ask them for one line of honest feedback.","deliverable_notes":"A short phone recording OR the named person and their one-line feedback + 3-4 sentences on what felt hard and one phrase from Unit II (introducing, apologising, thanking) that you actually used."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Take one real dense document - a mobile plan, a government form, a medicine leaflet - and scan it for three specific facts in under two minutes.","deliverable_notes":"A photo of the document + the three facts you scanned out + 3-4 sentences on the difference between skimming and scanning you felt, linked to how you read Khushwant Singh's 'Karma'."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Write ONE real, sendable document by hand or typed - a leave letter to your HOD, an email inquiry, or your own first CV - using real names and real details (do not actually send without permission).","deliverable_notes":"The finished document (photo or printout) + who it is addressed to + 3-4 sentences on the format rules you followed (salutation, body, close) from Unit IV."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"Watch one real speaker for five minutes - a lecturer, a vendor, a preacher - and note their body language, use of space, and voice changes. Then try one of their moves yourself.","deliverable_notes":"A hand-written note of three body or voice signals you saw + the speaker and place + 3-4 sentences on which one you copied and whether it made your listener more at ease."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Five Facts I Caught by Ear","primary":"record yourself recalling five facts from one real live announcement, news bulletin, or set of directions you only LISTENED to; verify them against the source.","support":"~400 words on your listening strategy and what you missed.","llc":"play your recall and name the source. AI can transcribe audio; it cannot prove that YOU listened."},
      {"option_no":2,"title":"The Call I Actually Made","primary":"make one real spoken act - a phone inquiry, an introduction, a vote of thanks - with a named person, and record it with consent.","support":"~400 words on the speaking phrases you used and the nerves you felt.","llc":"play thirty seconds and reflect on the feedback you received. AI can script a call; it cannot make YOUR voice speak to a real person."},
      {"option_no":3,"title":"Reading Against the Clock","primary":"bring one real dense document and demonstrate LIVE scanning of three specific facts under two minutes, timed.","support":"~400 words comparing skimming and scanning, tied to how you read 'Karma'.","llc":"do a live ninety-second scan for the cohort. AI can read a document instantly; it cannot show YOUR reading skill improving."},
      {"option_no":4,"title":"My First Real CV","primary":"write your own genuine CV or resume and one formal letter or report using real details; bring the printed artefact.","support":"~400 words on the format conventions of each document.","llc":"show the CV and defend one formatting choice. AI can generate a CV; it cannot list YOUR real life and choices."},
      {"option_no":5,"title":"The Speaker I Studied","primary":"observe one real skilled speaker's kinesics, use of space, and voice, note it by hand, then record yourself using one technique.","support":"~400 words on body language and voice modulation.","llc":"demonstrate the borrowed technique live for sixty seconds. AI can describe body language; it cannot make YOUR body perform it."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENS01'
  and is_latest = true and is_archived = false;

-- ── 26UENS02 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Take one real physical document - a grandmother's recipe, an old certificate, a handwritten note - and digitize it (photograph or scan, then type it out). Note what got lost or gained.","deliverable_notes":"The original photo + the typed digital version side by side + 3-4 sentences on one thing digitizing preserved and one thing it lost (a smudge, a margin note, the handwriting)."},
      {"sno":2,"unit":"II","finks_dimension":"Caring","task":"Find one real piece of misinformation or a scam message in your WhatsApp or family group. Check one fact in it against a reliable source and note who could be harmed.","deliverable_notes":"A screenshot of the message (hide personal numbers) + the fact you checked and the truth + 3-4 sentences on the ethics of forwarding and who a false message can hurt."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Create ONE real short media artefact about your town - a sixty-second vlog of the Erode market, a blog paragraph, or an e-post about a local festival - and actually make it.","deliverable_notes":"The saved or published artefact (link or screenshot) + which medium you chose + 3-4 sentences on why that medium (vlog versus blog versus email) suited your message."},
      {"sno":4,"unit":"IV","finks_dimension":"Learning How to Learn","task":"Interview one NAMED student or teacher about one app or tool they use to learn or teach (YouTube, a coaching app, Google). Ask what it helps with and what it cannot replace.","deliverable_notes":"The person's name + their one-line answer + 3-4 sentences on how digital tools change learning and one thing a screen cannot teach, drawn from your interview."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Meet one NAMED person who struggles with digital life - an elder confused by UPI, someone with no smartphone, a parent afraid of scams. Sit with them through one task.","deliverable_notes":"The person's name and relation + the exact task they struggled with + 3-4 sentences on the real digital divide you saw, in their words, not as a textbook definition."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Recipe I Saved from Paper","primary":"digitize one real family or heirloom document (a recipe, certificate, or letter), keeping both the original photo and your typed version.","support":"~400 words on what digitizing preserves and destroys.","llc":"show both versions and name the loss. AI can define digitization; it cannot scan YOUR grandmother's recipe."},
      {"option_no":2,"title":"The Lie in My Family Group","primary":"capture one real misinformation or scam message, fact-check it against a verifiable source, and identify who it could harm.","support":"~400 words on digital ethics and responsible forwarding.","llc":"show the message and the truth, and name the harm. AI can explain misinformation; it cannot catch the lie in YOUR family group."},
      {"option_no":3,"title":"My Town in 60 Seconds","primary":"create one real media artefact (a vlog, blog, or e-post) about a named local place or event; bring the actual file or link.","support":"~400 words on why the chosen medium fit the message.","llc":"play or show the artefact and defend the format. AI can describe media types; it cannot film YOUR Erode market."},
      {"option_no":4,"title":"What the App Cannot Teach","primary":"interview one NAMED student or teacher about a learning app and record their view.","support":"~400 words on digital literacy in education.","llc":"play or read the quote and name one thing the screen cannot do. AI can list ed-tech tools; it cannot interview YOUR teacher."},
      {"option_no":5,"title":"The Divide at My Doorstep","primary":"sit with one NAMED person who struggles with digital access and document the exact task and struggle (with consent, hiding personal data).","support":"~400 words on the digital divide and its human cost.","llc":"describe the moment and name what would actually help them. AI can define the digital divide; it cannot sit with YOUR neighbour."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UENS02'
  and is_latest = true and is_archived = false;

-- ── 26UGEN01 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Read the prescribed self-awareness/positive-thinking text (e.g. Malala) and connect one idea to a real decision in your own life.","deliverable_notes":"The text + your real-life connection + 1 line on what the reading changed in your thinking."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Read the empathy poem/story and act on it: do one small real act of empathy and record what happened.","deliverable_notes":"The text + your real act + 1 line linking it to the reading."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Respond to the critical/creative-thinking poems by producing your own short creative piece on a 'thing not done before'.","deliverable_notes":"Your original creative piece + 1 line on the poem that sparked it."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Take a real paragraph you write and correct/label its parts of speech (articles, nouns, prepositions, etc.).","deliverable_notes":"Your paragraph with parts of speech labelled + 1 line on a grammar rule you applied."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Write one descriptive and one persuasive paragraph on real topics, and answer comprehension questions on a real passage.","deliverable_notes":"Your two paragraphs + comprehension answers + 1 line on the difference between the two writing modes."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Reading That Changed Something","primary":"engage deeply with the prescribed texts and translate one into a real action or decision in your life, documenting the reading, the act, and the reflection.","support":"~400 words on literature meeting life.","llc":"present the connection and answer a question on the text live."},
      {"option_no":2,"title":"My Own Writing, Across Modes","primary":"produce a portfolio of your own descriptive, expository, persuasive and narrative writing on real topics, refined through feedback.","support":"~400 words on writing for purpose.","llc":"write a short piece live in a named mode."},
      {"option_no":3,"title":"Grammar in My Own Words","primary":"take your own writing and rigorously analyse and correct its grammar (parts of speech, articles), building a personal accuracy guide.","support":"~400 words on grammar serving clarity.","llc":"correct and label a fresh sentence live."},
      {"option_no":4,"title":"Creative Response to a Poem","primary":"create original creative work in genuine response to the prescribed poems, showing your reading in your making.","support":"~400 words on the poems and your response.","llc":"read your piece and connect it to the source live."},
      {"option_no":5,"title":"Empathy in Action","primary":"turn the empathy readings into a real, consented act of empathy in your community and reflect honestly on it.","support":"~400 words on literature and empathy.","llc":"present the experience and connect it to the text live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UGEN01'
  and is_latest = true and is_archived = false;

-- ── 26UGEN02 · b-a-english ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Read the perseverance poems/stories (e.g. Don't Quit) and document one real situation where you applied their message.","deliverable_notes":"The text + the real situation + 1 line on what the reading gave you."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Take one prescribed short story and write an alternative ending or a character's diary, grounded in the text.","deliverable_notes":"Your creative response + 1 line on how it stays true to the story."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Read the prose/autobiography (e.g. Sudha Murthy) and connect its lesson to a real person you know.","deliverable_notes":"The text + the real-person connection + 1 line on the value it illustrates."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Take your own writing and correct its verbs, adverbs, concord and modals, naming each rule.","deliverable_notes":"Your corrected text with rules + 1 line on a concord error you fixed."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Write a real email (invitation/enquiry), a circular, a memo and minutes for an actual small event.","deliverable_notes":"Your four real documents + 1 line on the format rule each follows."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Literature I Made My Own","primary":"engage with the prescribed texts and produce genuine creative and reflective responses (alternative ending, diary, connection to real people/events), showing understanding through making.","support":"~400 words on reading actively.","llc":"present a response and connect it to the source live."},
      {"option_no":2,"title":"Workplace Writing for Real","primary":"produce a portfolio of real functional documents (email, circular, memo, minutes) for genuine small events, correct in format and grammar.","support":"~400 words on functional English.","llc":"draft a document live to a brief."},
      {"option_no":3,"title":"Grammar That Holds Up","primary":"analyse and correct verbs, concord, and modals in your own real writing, building a personal accuracy guide.","support":"~400 words on advanced grammar for clarity.","llc":"correct a fresh sentence and name the rule live."},
      {"option_no":4,"title":"A Story's Lesson, Lived","primary":"connect a prescribed prose/autobiography to real people and situations you know, drawing out its value with honesty.","support":"~400 words on literature and life.","llc":"present the connection and answer a text question live."},
      {"option_no":5,"title":"Perseverance, Documented","primary":"apply the perseverance texts to a real challenge you face, documenting the attempt and reflection.","support":"~400 words on the readings and your experience.","llc":"present and connect it to the text live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UGEN02'
  and is_latest = true and is_archived = false;

-- ── 26UHIC01 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Visit or find a real ancient/archaeological site, museum artefact, or megalith near you (named) and document what it tells us about early Indian life.","deliverable_notes":"Your photo/notes of the real site/artefact (place named) + 1 line on what it evidences about the period."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Take one primary-source excerpt (an Ashokan edict, a classical account — sourced) and analyse what it reveals and what it hides.","deliverable_notes":"The sourced excerpt + your analysis + 1 line on the source's bias or gap."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Study one real Gupta/Satavahana-era artefact, coin image, or temple feature (from a museum/site/reliable source) and describe its cultural significance.","deliverable_notes":"The named object + your description + 1 line on what it says about the society."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Map the territory of one post-Gupta dynasty on a real map and connect one place to a surviving monument or town today.","deliverable_notes":"Your annotated map + the modern place-monument link + 1 line on the continuity."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Find one local tradition, place-name, or story near you that connects to an early-medieval event/ruler and record it.","deliverable_notes":"The named local element + the historical connection + 1 line on how history survives in memory."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"History Under My Feet","primary":"study one real historical site, monument, artefact or local tradition near you, connect it rigorously to ancient Indian history using primary/secondary sources and your own fieldwork, and reconstruct what it reveals.","support":"~400 words on doing history from real evidence.","llc":"present your evidence and answer a 'how do you know?' question live."},
      {"option_no":2,"title":"Reading a Primary Source","primary":"analyse a set of real primary sources (edicts, accounts, coins) for what they reveal and their biases, building an evidence-based mini-account.","support":"~400 words on source criticism.","llc":"interpret a fresh source live."},
      {"option_no":3,"title":"A Dynasty on the Map","primary":"reconstruct one dynasty's territory and legacy on real maps, linking historical places to present-day towns/monuments.","support":"~400 words on historical geography.","llc":"place a historical event on the map live."},
      {"option_no":4,"title":"The Civilisation in an Artefact","primary":"study a real ancient artefact/monument in depth and reconstruct the society behind it from its features.","support":"~400 words on material culture as evidence.","llc":"read a fresh artefact live."},
      {"option_no":5,"title":"History in Local Memory","primary":"through consented elder interviews and local traditions/place-names, trace how an ancient/early-medieval past survives in your community's memory, checked against the record.","support":"~400 words on memory and history.","llc":"present a tradition and its historical basis live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHIC01'
  and is_latest = true and is_archived = false;

-- ── 26UHIC02 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Find one real Sangam-age or ancient-Tamil evidence near you (a hero-stone, an old temple, a place-name, a museum piece) and document it.","deliverable_notes":"The named evidence (place) + 1 line on what it shows about ancient Tamil life."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Read one Sangam poem excerpt (in translation, sourced) and extract what it reveals about early Tamil society, economy or values.","deliverable_notes":"The sourced excerpt + your reading + 1 line on the society it reflects."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Visit or study a real Pallava monument/temple (Mamallapuram, a local Pallava-style temple) or reliable images, and describe one architectural feature.","deliverable_notes":"The named monument + the feature + 1 line on Pallava art's contribution."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Study one real Chola temple or bronze near you (or via museum/source) and connect it to Chola administration or overseas trade.","deliverable_notes":"The named Chola artefact/temple + the connection + 1 line on Chola achievement."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Trace one surviving Tamil tradition, festival, or craft to its early medieval roots through observation or a consented elder interview.","deliverable_notes":"The named tradition + its historical root + 1 line on the continuity."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Tamil Past Near Me","primary":"study a real Tamil historical site, temple, bronze, inscription or living tradition, and reconstruct its Sangam/Pallava/Chola/Pandya context through fieldwork and sources.","support":"~400 words on Tamil history from real evidence.","llc":"present your evidence and answer 'which period and how do you know?' live."},
      {"option_no":2,"title":"A Chola Legacy, Traced","primary":"study a real Chola temple/bronze/inscription and connect it to Chola administration, art or overseas expansion with evidence.","support":"~400 words on the Chola achievement.","llc":"read a Chola feature live."},
      {"option_no":3,"title":"Sangam Society in Its Poems","primary":"mine several Sangam poem excerpts (sourced translations) for a reconstruction of early Tamil society, economy and values.","support":"~400 words on literature as historical source.","llc":"interpret a fresh excerpt live."},
      {"option_no":4,"title":"Pallava Stone","primary":"study real Pallava architecture (site or reliable images) and analyse its features and innovations.","support":"~400 words on Pallava art.","llc":"read a fresh architectural feature live."},
      {"option_no":5,"title":"A Tradition's Deep Roots","primary":"trace a living Tamil tradition/craft/festival to its early-medieval roots through observation and consented interview, checked against the record.","support":"~400 words on continuity in Tamil culture.","llc":"present the link live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHIC02'
  and is_latest = true and is_archived = false;

-- ── 26UHIC03 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Study one real Sultanate-era monument or feature (a mosque, fort, tomb — site or reliable source) and describe its style and purpose.","deliverable_notes":"The named monument + style/purpose + 1 line on Indo-Islamic architecture."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Investigate one real Bhakti/Sufi saint connected to your region and their surviving influence (a shrine, songs, a community).","deliverable_notes":"The named saint + the surviving influence + 1 line on the movement's social impact."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Study one real Mughal monument, painting, or administrative legacy (site/source) and connect it to Mughal governance or art.","deliverable_notes":"The named Mughal element + the connection + 1 line on Mughal achievement."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Reconstruct one episode of Maratha or Mughal history from at least two sources and note where they disagree.","deliverable_notes":"The episode + the two sources + 1 line on the disagreement and how you'd weigh it."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Study the real position of women or a social group in the medieval period from primary/secondary evidence, avoiding presentist judgement.","deliverable_notes":"Your evidence-based account + 1 line on a source limitation you noticed."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Medieval Monument, Decoded","primary":"study a real medieval monument/artefact (Sultanate/Mughal/Vijayanagar) through fieldwork or reliable sources and reconstruct its historical, political and cultural meaning.","support":"~400 words on reading monuments as history.","llc":"read a fresh monument feature live."},
      {"option_no":2,"title":"Bhakti/Sufi in My Region","primary":"trace a real Bhakti or Sufi tradition connected to your region — saint, shrine, songs, community — and its social impact, through observation and sources.","support":"~400 words on the movements' significance.","llc":"present the living legacy live."},
      {"option_no":3,"title":"Two Sources, One Event","primary":"reconstruct a medieval episode from multiple sources, foreground their disagreements, and reach a defensible account.","support":"~400 words on historical method with conflicting sources.","llc":"adjudicate a fresh source conflict live."},
      {"option_no":4,"title":"Mughal Governance and Art","primary":"study a real Mughal administrative or artistic legacy and connect it to how the empire worked.","support":"~400 words on Mughal statecraft/art.","llc":"read a fresh Mughal feature live."},
      {"option_no":5,"title":"Society Without Presentism","primary":"reconstruct the real position of a social group in medieval India from evidence, carefully avoiding present-day judgement.","support":"~400 words on historical empathy and source limits.","llc":"defend an interpretation against a presentist challenge live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHIC03'
  and is_latest = true and is_archived = false;

-- ── 26UHIC04 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Study one real monument or legacy of the Madurai Sultanate/Nayak period near you (a temple gopuram, a fort, a tank) and document it.","deliverable_notes":"The named site + 1 line on the period it belongs to and its purpose."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Investigate one Nayak-era cultural contribution (Thirumalai Nayak's architecture, temple expansion) through a real site or source.","deliverable_notes":"The named contribution + 1 line on its cultural significance."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Study the real Poligar system or a local Poligar/zamindar legacy (a fort, a story, a place) in your region.","deliverable_notes":"The named local legacy + 1 line on how the Poligar system worked."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Document one real Maratha-Tamil cultural contribution (Saraswathi Mahal Library, Tanjore art) via visit or reliable source.","deliverable_notes":"The named contribution + 1 line on the Maratha imprint on Tamil culture."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Trace one local place, family, or tradition to the Nawab/early-colonial transition through observation or a consented elder interview.","deliverable_notes":"The named local link + 1 line on the historical transition it reflects."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"My Region's Early-Modern History","primary":"study a real local monument, institution, or tradition from the Madurai Sultanate–Nayak–Maratha–Nawab era and reconstruct its history through fieldwork and sources.","support":"~400 words on regional history from real evidence.","llc":"present your evidence and place it in period live."},
      {"option_no":2,"title":"The Nayak Imprint","primary":"study a real Nayak-period contribution (architecture, temple, institution) and analyse its significance.","support":"~400 words on Nayak cultural achievement.","llc":"read a fresh Nayak feature live."},
      {"option_no":3,"title":"Poligars and Power","primary":"investigate a real Poligar/local-chief legacy in your region and reconstruct how power and society worked then.","support":"~400 words on the Poligar system.","llc":"explain a local power structure live."},
      {"option_no":4,"title":"Maratha Tanjore","primary":"study a real Maratha-Tamil cultural legacy (library, art, temple) and its lasting imprint.","support":"~400 words on cultural synthesis.","llc":"read a fresh legacy live."},
      {"option_no":5,"title":"The Eve of Colonial Rule","primary":"trace how your locality experienced the Nawab/early-colonial transition through place, family or tradition, using observation, interview and sources.","support":"~400 words on a society on the cusp of change.","llc":"present the transition live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHIC04'
  and is_latest = true and is_archived = false;

-- ── 26UHINM1 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Read the actual Preamble of the Constitution aloud once. Then list five ordinary things you did this week that a Fundamental Right or Duty made possible (speaking, worshipping, studying, moving freely).","deliverable_notes":"A photo of you holding or reading the Preamble + a hand-written list matching each act to a specific Right or Duty + 3-4 sentences on one right you had not noticed you use daily."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Find out your REAL Lok Sabha constituency and current MP, and one real law or scheme passed recently. Verify the MP's name from a public source.","deliverable_notes":"The named constituency and MP + one real law or scheme + 3-4 sentences on the path a bill takes through the Lok Sabha and Rajya Sabha to become that law."},
      {"sno":3,"unit":"III","finks_dimension":"Human Dimension","task":"Identify your REAL MLA and ward member or panchayat president. Ask one person (or the ward office) about a live local issue they are handling.","deliverable_notes":"The named MLA and ward member + the real local issue + 3-4 sentences on how the state legislature and local executive act on a road, water, or drainage problem you can actually see."},
      {"sno":4,"unit":"IV","finks_dimension":"Learning How to Learn","task":"Read one real, recent news item about an Indian court decision or a court backlog. Note how judicial review or appeal worked, and one line on AI helping courts.","deliverable_notes":"The case or news item named and dated + a hand-written note of the court level (district, High, Supreme) + 3-4 sentences on how the judiciary corrects errors and where AI might speed or endanger justice."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"Find one real body that protects rights or shapes votes near you - a voter-awareness camp, a farmers' or workers' union office, a human-rights or women's helpline poster.","deliverable_notes":"A photo of the office, poster, or camp + its name + 3-4 sentences on whether it is a commission, a party, or a pressure group, and whose interest it defends."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Rights I Used Without Knowing","primary":"read the actual Preamble aloud (record it) and keep a three-day hand-written log matching your daily acts to specific Fundamental Rights and Duties.","support":"~400 words on the Constituent Assembly, the Preamble, and the Directive Principles.","llc":"read one Preamble line and one logged right aloud. AI can quote the Constitution; it cannot log YOUR week."},
      {"option_no":2,"title":"My Own MP, My Own Law","primary":"identify and verify your real constituency, MP, and one real recent law or scheme from a public source; bring the printed proof.","support":"~400 words on the Union legislature and how a bill becomes law.","llc":"name your MP and trace the bill's path. AI can explain Parliament; it cannot verify YOUR representative for you."},
      {"option_no":3,"title":"The People Who Fix My Street","primary":"identify your real MLA and ward member and interview one named person about a live local issue.","support":"~400 words on the state legislature and executive.","llc":"name the representatives and the issue, and say who is responsible. AI can describe state government; it cannot interview YOUR ward member."},
      {"option_no":4,"title":"How the Court Corrects Itself","primary":"track one real, dated Indian court case or a verified court-backlog figure; hand-note the court hierarchy and the review path, plus AI's emerging role.","support":"~400 words on the judiciary and judicial review.","llc":"present the case and argue where AI helps or harms justice. AI can summarise court structure; it cannot follow the real case YOU chose."},
      {"option_no":5,"title":"Who Speaks for Us","primary":"photograph and identify one real commission, party, or pressure-group presence near you, and interview a named person or read its notice.","support":"~400 words distinguishing commissions, parties, and pressure groups.","llc":"show the photo and classify the body and whose interest it serves. AI can define these bodies; it cannot find the one on YOUR street."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHINM1'
  and is_latest = true and is_archived = false;

-- ── 26UHINM2 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Collect five real news items from today's paper and classify each by type; judge one against the news-value criteria.","deliverable_notes":"Your five real classified items + the news-value judgement + 1 line on what made one newsworthy."},
      {"sno":2,"unit":"II","finks_dimension":"Foundational Knowledge","task":"Map the structure of one real newspaper (sections, sources, likely audience) from an actual copy.","deliverable_notes":"Your structure map of the named paper + 1 line on its target audience."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Report one real small event you witness (campus/local) as a news story with a proper lead, inverted-pyramid structure.","deliverable_notes":"Your written news report of the real event + 1 line on why you led with what you did."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Conduct one real, consented interview and write it up as an interview-based piece or feature.","deliverable_notes":"Your interview piece (interviewee named, consented) + 1 line on an ethical choice you made."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Edit and design a headline, caption and simple layout for your own report; add one infographic.","deliverable_notes":"Your headline/caption/layout + the infographic + 1 line on how the headline draws the reader honestly."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Real Story, Reported and Edited","primary":"report a genuine local event or issue end-to-end — reporting, consented interviews, writing to structure, headline, layout and an infographic — producing a publishable piece.","support":"~400 words on the journalistic choices and ethics involved.","llc":"read your piece and defend an editorial choice live."},
      {"option_no":2,"title":"The Interview That Told a Story","primary":"conduct real, ethical, consented interviews and craft an interview-based feature that reveals something true.","support":"~400 words on interviewing and fairness.","llc":"answer how you'd handle a difficult interviewee live."},
      {"option_no":3,"title":"News Judgement","primary":"analyse real news coverage for news-values, framing and bias across sources on one story, and write a balanced version.","support":"~400 words on what makes news and how framing works.","llc":"judge a fresh item's newsworthiness live."},
      {"option_no":4,"title":"Editing for the Reader","primary":"take raw copy (yours or a peer's) and edit it — structure, headline, caption, layout, infographic — for clarity and honesty.","support":"~400 words on the editor's craft.","llc":"edit a fresh paragraph live."},
      {"option_no":5,"title":"A Feature With Impact","primary":"write a real feature/travelogue/review grounded in genuine observation and reporting.","support":"~400 words on feature writing.","llc":"read and defend a passage live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHINM2'
  and is_latest = true and is_archived = false;

-- ── 26UHIS01 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Interview one real person about a trip they took (consented) and classify their travel motivations as push/pull.","deliverable_notes":"3–4 quoted sentences + your push/pull classification + 1 line on what really drove the trip."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Identify one real tourism site of each type near you (leisure, pilgrimage, special-interest) and note who visits.","deliverable_notes":"Your three named local sites by type + 1 line on the visitor each attracts."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Visit or research one real travel agency/tour operator and document one service it provides and how it earns.","deliverable_notes":"The named agency + the service + 1 line on its revenue model."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Design a real one-day local itinerary for a visitor to your area, with timings, costs and logistics you verify.","deliverable_notes":"Your itinerary with real verified costs/timings + 1 line on the biggest logistical constraint."},
      {"sno":5,"unit":"V","finks_dimension":"Foundational Knowledge","task":"List the real travel documents needed for one international trip you research (passport, visa, health, insurance) and their purpose.","deliverable_notes":"Your document checklist for the named trip + 1 line on the role of IT in getting them."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Real Itinerary for My Region","primary":"design a genuinely usable tourist itinerary for your locality — real sites, verified timings, costs, logistics and a target visitor — and, if possible, test one segment.","support":"~400 words on planning tourism for real constraints.","llc":"present the itinerary and adapt it for a new visitor type live."},
      {"option_no":2,"title":"Why People Travel","primary":"through consented interviews, study real travel motivations and classify them, drawing conclusions about your local tourism market.","support":"~400 words on push/pull motivation.","llc":"classify a fresh traveller's motivation live."},
      {"option_no":3,"title":"Inside a Travel Business","primary":"study a real travel agency/tour operator's services and business model through research or a consented interview.","support":"~400 words on the travel trade.","llc":"explain its revenue model live."},
      {"option_no":4,"title":"My Region as a Destination","primary":"audit your locality's real tourism assets by type, assess their appeal and gaps, and propose one improvement.","support":"~400 words on destination potential.","llc":"defend your improvement live."},
      {"option_no":5,"title":"The Paperwork of Travel","primary":"build a real, accurate travel-documentation guide for a chosen international trip, including the role of technology.","support":"~400 words on travel formalities.","llc":"answer a fresh documentation question live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHIS01'
  and is_latest = true and is_archived = false;

-- ── 26UHIS02 · b-a-history ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Read the actual Preamble and identify which of its ideals you can see (or see missing) in one real situation around you.","deliverable_notes":"The Preamble ideal + your real-world observation + 1 line on the gap or fulfilment."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Identify one real instance where a Fundamental Right or Directive Principle is exercised or violated in daily life around you.","deliverable_notes":"The named right/principle + the real instance + 1 line on the duty that pairs with it."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Trace how one real law or decision moved through the Union government structure (Parliament, President, Court) using a sourced example.","deliverable_notes":"The real example + the path through the structure + 1 line on a check that applied."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Identify your real state's Governor, Chief Minister and one recent state action, and place them in the state-government structure.","deliverable_notes":"The named officeholders + the action + 1 line on state vs union powers."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Attend or research one real local-government body (panchayat/municipality) and describe one thing it actually decides.","deliverable_notes":"The named local body + a real decision it makes + 1 line on why local government matters."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Constitution in My Daily Life","primary":"document real instances around you where constitutional rights, duties and principles are lived, exercised or violated, and analyse them against the text.","support":"~400 words on the Constitution as a living document.","llc":"analyse a fresh real situation constitutionally live."},
      {"option_no":2,"title":"Local Government, Up Close","primary":"study a real local-government body (panchayat/municipality) through attendance or interview, documenting what it actually decides and how.","support":"~400 words on grassroots democracy.","llc":"explain a local-government power live."},
      {"option_no":3,"title":"How a Law Travels","primary":"trace a real law or decision through the constitutional machinery (legislature, executive, judiciary), identifying the checks.","support":"~400 words on separation of powers.","llc":"trace a fresh example live."},
      {"option_no":4,"title":"Rights and Duties, Paired","primary":"investigate a real situation involving a Fundamental Right and its corresponding duty, and reason about the balance.","support":"~400 words on rights and responsibilities.","llc":"reason about a fresh rights case live."},
      {"option_no":5,"title":"State and Union in Action","primary":"study a real issue that involves both state and union roles, mapping the division of powers with evidence.","support":"~400 words on federalism.","llc":"assign a fresh power to the right level live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UHIS02'
  and is_latest = true and is_archived = false;

-- ── 26UBOGE01 · b-sc-botany ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Find a real example of bacterial/viral action in daily life (curd setting, a plant disease, spoilage) and document the evidence.","deliverable_notes":"The real example (photo) + 1 line on the microbe's role and one economic importance."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Collect a real algal sample (pond scum, a seaweed from a market) and make a labelled drawing of what you observe under a lens.","deliverable_notes":"Your labelled drawing from the real sample (place named) + 1 line on one economic use of algae."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Find a real moss or fern near you (named place) and make a labelled drawing showing its structure and habitat.","deliverable_notes":"Your labelled drawing of the real bryophyte/pteridophyte + 1 line on its adaptation to a moist habitat."},
      {"sno":4,"unit":"IV","finks_dimension":"Foundational Knowledge","task":"Observe real plant cells under a microscope (onion peel/leaf) and draw the cell and one organelle you can identify.","deliverable_notes":"Your labelled cell drawing from the real slide + 1 line on prokaryotic vs eukaryotic difference."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Work one monohybrid and one dihybrid cross by hand and connect it to a real inherited trait you can observe (in plants/people).","deliverable_notes":"Your cross ratios + the real trait + 1 line on what the test cross would show."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Plant Group I Collected and Drew","primary":"build a small real herbarium/observation set across the lower plant groups (algae, moss, fern) with your own labelled drawings and habitat notes, plus one economic-importance link.","support":"~400 words on plant diversity seen firsthand.","llc":"identify a fresh specimen's group live."},
      {"option_no":2,"title":"Genetics I Can See","primary":"work monohybrid/dihybrid crosses by hand and connect the ratios to a real observable inherited trait you document (in plants or a consented family trait).","support":"~400 words on Mendelian inheritance made concrete.","llc":"solve a fresh cross live."},
      {"option_no":3,"title":"The Cell Under My Microscope","primary":"prepare and observe real plant cells, draw and label structures, and compare prokaryotic and eukaryotic organisation from evidence.","support":"~400 words on cell structure.","llc":"identify a structure in a fresh slide live."},
      {"option_no":4,"title":"Microbes at Work in My Home","primary":"document real bacterial/viral/algal processes in daily life (fermentation, disease, spoilage, blooms), explaining the biology and economic importance.","support":"~400 words on microbes and human life.","llc":"explain a fresh microbial process live."},
      {"option_no":5,"title":"From Spore to Plant","primary":"study the real structure and life cycle of a bryophyte/pteridophyte you collect, with drawings and habitat analysis.","support":"~400 words on alternation of generations.","llc":"place a stage in the life cycle live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UBOGE01'
  and is_latest = true and is_archived = false;

-- ── 26UBOGE02 · b-sc-botany ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Collect real leaves and an inflorescence from named local plants and classify their phyllotaxy, leaf type and inflorescence type.","deliverable_notes":"Your real specimens (photos) + classifications + 1 line on a morphology–function link."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Identify one real plant to family using Bentham–Hooker characters, and note its economic importance.","deliverable_notes":"The named plant + your character-based identification + 1 line on its economic use."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Make a thin section (or use a prepared slide) of a real dicot/monocot stem or root and draw the tissue arrangement.","deliverable_notes":"Your labelled anatomy drawing from the real section + 1 line on a dicot–monocot difference."},
      {"sno":4,"unit":"IV","finks_dimension":"Foundational Knowledge","task":"Study a real flower's reproductive parts (dissect one) and relate them to pollination and fertilisation.","deliverable_notes":"Your labelled flower dissection drawing + 1 line on the pollination mechanism you infer."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Run one simple real physiology demonstration (osmosis in a potato, transpiration, phototropism) and record the result.","deliverable_notes":"Your experiment (photo) + the observed result + 1 line on the physiological process shown."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Plant, Fully Studied","primary":"take one real local flowering plant and study it across morphology, taxonomy, anatomy (a section), reproduction (a dissection) and one physiological demonstration — your own specimens and drawings.","support":"~400 words on integrating botanical study.","llc":"answer a live question on any part of your plant."},
      {"option_no":2,"title":"Identifying by Characters","primary":"identify several real local plants to family using taxonomic characters, building a small evidence-based key.","support":"~400 words on classification in practice.","llc":"identify a fresh plant's family live."},
      {"option_no":3,"title":"Physiology I Demonstrated","primary":"run a set of real plant-physiology demonstrations (osmosis, transpiration, photosynthesis evidence, tropism), documenting results and explaining the mechanisms.","support":"~400 words on plant function.","llc":"predict a demonstration's outcome live."},
      {"option_no":4,"title":"Inside the Stem","primary":"study real plant anatomy through sections you prepare/observe, comparing dicot and monocot tissue systems with drawings.","support":"~400 words on plant anatomy.","llc":"identify a tissue in a fresh section live."},
      {"option_no":5,"title":"The Flower's Reproduction","primary":"dissect and study real flowers, document reproductive structures, pollination and fertilisation, with drawings.","support":"~400 words on plant reproduction.","llc":"infer a flower's pollination mode live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UBOGE02'
  and is_latest = true and is_archived = false;

-- ── 26UCHC01 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Build a physical model (beads/clay/wire) of the Bohr atom for one element you choose (name it), showing shells and electron count; photograph it beside your hand for scale.","deliverable_notes":"Your photo of the real model + the element's electron configuration written by hand + 1 line on what Bohr's model explains that Thomson's did not."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"For one atom, work out by hand the four quantum numbers of every electron and sketch the shape of one s and one p orbital yourself.","deliverable_notes":"Your hand-worked quantum-number table + your two orbital sketches + 1 line on what the quantum numbers forbid."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Construct the Born–Haber cycle for one named ionic compound (e.g. NaCl) by hand using real tabulated values you look up, and compute its lattice energy.","deliverable_notes":"Your hand-drawn cycle with the real values (source noted) + the computed lattice energy + 1 line on why the compound is stable."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Draw the MO diagram for one diatomic molecule (O2, N2 or CO) by hand and predict its bond order and magnetism; state a real property this predicts.","deliverable_notes":"Your hand MO diagram + bond order + magnetism prediction + 1 line linking it to a real observable (e.g. O2 is paramagnetic)."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Classify five real reactions you find (from a textbook, kitchen, or lab) by their bond-cleavage type and reagent (electrophile/nucleophile/radical), giving a reason for each.","deliverable_notes":"Your five real examples with classification + reasoning + 1 line on the one you were least sure of and why."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Atom I Built and Defended","primary":"choose one element, build a physical model of its atomic and electronic structure, and produce by hand its full quantum-number account and bonding tendencies.","support":"~400 words on what the model makes visible and where it lies.","llc":"present the model and answer a live 'what changes for the next element?' challenge."},
      {"option_no":2,"title":"Why This Salt Is Stable","primary":"pick one ionic compound, build its Born–Haber cycle by hand from real thermodynamic data, compute the lattice energy, and connect the number to a physical property you can observe (melting, solubility).","support":"~400 words on the energy bookkeeping.","llc":"defend one term when an examiner changes the ion."},
      {"option_no":3,"title":"Bonding, Predicted and Checked","primary":"for a set of small molecules, predict geometry and magnetism by VB and MO theory by hand, then verify at least one prediction against a real, cited property.","support":"~400 words on where VB and MO disagree and which wins.","llc":"draw a fresh MO diagram live."},
      {"option_no":4,"title":"Reaction Detective","primary":"collect five real chemical changes (kitchen, garden, lab), classify each mechanistically (cleavage type, reagent), and support one with a simple test you actually run.","support":"~400 words on reading a reaction from its conditions.","llc":"classify a reaction the audience names."},
      {"option_no":5,"title":"A Concept I Can Prove","primary":"select one structural idea from the course (aromaticity readiness, hybridisation, lattice energy) and produce your own derivation/explanation plus a worked example you constructed.","support":"~400 words on the step that tested you.","llc":"present and answer 'why is this valid?' unscripted."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHC01'
  and is_latest = true and is_archived = false;

-- ── 26UCHC02 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Measure the pH of five real household solutions (name them — lemon, soap, milk, etc.) with pH paper or a meter, and rank them; classify each as acid/base by a named concept.","deliverable_notes":"Your five real pH readings (photo of the strips) + the ranking + 1 line applying Bronsted–Lowry to one of them."},
      {"sno":2,"unit":"II","finks_dimension":"Foundational Knowledge","task":"Observe or safely demonstrate one real property of an s-block element or its compound (e.g. flame colour of a sodium/potassium salt in a kitchen flame) and record it.","deliverable_notes":"Your photo/observation of the real flame or reaction + the element named + 1 line on the periodic trend it illustrates."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Find a real everyday use of one p-block element or compound (halogens in bleach, phosphates in fertiliser) and explain the chemistry behind that use.","deliverable_notes":"The named real product + the element/compound + 2 sentences on the property that makes it useful."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Work the mechanism of one alkene addition reaction by hand (with your chosen substrate), applying Markovnikov's rule, and predict the major product.","deliverable_notes":"Your hand-drawn mechanism + predicted major product + 1 line on why Markovnikov's rule points there."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Using Huckel's rule, decide by hand whether three ring systems you pick are aromatic; check benzene against a real property (its unusual stability/smell/uses).","deliverable_notes":"Your three aromaticity decisions with electron counts + 1 line linking benzene's aromaticity to a real fact."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The pH of My Household","primary":"measure and map the acidity of 10+ real substances in your home, rank them, and explain the strong/weak pattern with acid–base theory, testing one prediction (e.g. mixing two).","support":"~400 words on Bronsted–Lowry in daily life.","llc":"predict and then measure a fresh solution live."},
      {"option_no":2,"title":"A Flame That Names the Metal","primary":"perform safe flame tests on several real salts you source, photograph the colours, and connect each to its s-block metal and electronic transitions.","support":"~400 words on why elements colour flames.","llc":"identify an unknown salt's metal by its flame live."},
      {"option_no":3,"title":"A Mechanism I Own","primary":"choose one addition or elimination reaction, work its full mechanism by hand with regio/stereochemistry, and — where safe — run a simple version and observe the outcome.","support":"~400 words on E1 vs E2 or Markovnikov reasoning.","llc":"reconstruct the mechanism at the board when the substrate is changed."},
      {"option_no":4,"title":"Aromaticity in the Real World","primary":"build an evidence case for aromaticity across several ring systems by hand (Huckel counts), and tie benzene's aromatic stability to a real industrial or biological fact you research.","support":"~400 words on what aromaticity buys.","llc":"judge a fresh ring's aromaticity live."},
      {"option_no":5,"title":"An Element's Chemistry, End to End","primary":"pick one s- or p-block element and build a complete profile — periodic position, key compounds, one real use — verified with a simple observation or cited data.","support":"~400 words on the trend it exemplifies.","llc":"present and field a periodic-trend question."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHC02'
  and is_latest = true and is_archived = false;

-- ── 26UCHCP01 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Caring","task":"Write your own lab-safety risk assessment for the titration bench you use — name three real hazards present and the control for each.","deliverable_notes":"Your risk assessment for the actual bench + 1 line on the hazard you had underestimated."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Perform an acid–base titration (e.g. HCl vs standard oxalic acid) yourself; record every burette reading in your own hand and compute the concentration with an error estimate.","deliverable_notes":"Your raw titration table (signed/dated) + the computed concentration + 1 line on your largest error source."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Estimate the hardness of a real water sample you collect (named source — your tap, a well) by EDTA complexometry, and state whether it is hard or soft.","deliverable_notes":"Your titration data for the named water + the hardness value + 1 line on what causes that water's hardness."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Carry out a permanganometry estimation (e.g. iron or oxalate) and note the self-indicating end point you observe.","deliverable_notes":"Your observation table + result + 1 line describing the exact colour change at the end point."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Prepare one inorganic compound yourself, record the yield, and compute your percentage yield honestly.","deliverable_notes":"The compound prepared + your actual and theoretical yield + percentage + 1 line on where product was lost."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Concentration I Can Trust","primary":"determine an unknown concentration by titration with full replicate readings and a real error analysis, and defend the reliability of your number.","support":"~400 words on precision vs accuracy in your own data.","llc":"present your table and answer 'how do you know this is right?'"},
      {"option_no":2,"title":"How Hard Is My Water?","primary":"measure the hardness of real water from named local sources by EDTA titration, compare them, and connect the differences to their origin and to everyday effects (soap, scaling).","support":"~400 words on the chemistry of hardness.","llc":"defend a reading when a parameter is questioned."},
      {"option_no":3,"title":"A Compound I Made and Weighed","primary":"prepare an inorganic compound, characterise it simply (colour, form, a confirmatory test), and report an honest percentage yield with an account of losses.","support":"~400 words on the preparation chemistry.","llc":"show the product and explain a yield-improving change."},
      {"option_no":4,"title":"The End Point I Learned to See","primary":"across several titration types (acid–base, redox, complexometric), document the distinct end-point signals you observed and what indicator chemistry drives each.","support":"~400 words on reading end points reliably.","llc":"call an end point live on a fresh titration."},
      {"option_no":5,"title":"My Titration Notebook, Defended","primary":"keep a rigorous hand-written record for at least four experiments with raw data, calculations and errors, and select the result you can most confidently defend.","support":"~400 words on experimental discipline.","llc":"present that experiment and answer a probing question on its reliability."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHCP01'
  and is_latest = true and is_archived = false;

-- ── 26UCHCP02 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Caring","task":"Identify, by inspecting the real organic-chemistry bench you use, the correct handling for one flammable and one corrosive reagent present, and the first-aid for each.","deliverable_notes":"Your named reagents + handling + first-aid + 1 line on the glassware you must not heat directly."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Perform the detection of special elements (N, S, or halogen) on one real organic sample via the Lassaigne test and record your observations.","deliverable_notes":"Your observation for the named sample + the element detected + 1 line on the colour/precipitate that confirmed it."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Run functional-group tests on one unknown organic compound you are given and narrow it to a functional group by your own results.","deliverable_notes":"Your sequence of tests and results + the functional group concluded + 1 line on the test that was decisive."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Carry out one organic preparation (nitration, halogenation, oxidation or hydrolysis) and record the yield and appearance of your product.","deliverable_notes":"The reaction done + your product's appearance + percentage yield + 1 line on the colour/state change observed."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Purify one solid by crystallization and determine its melting point yourself; comment on purity from the sharpness of the melting range.","deliverable_notes":"Your melting-point reading (range) + 1 line judging purity from the range width."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Unknown I Identified","primary":"take an unknown organic compound and, through your own systematic tests (elements → saturation → functional group), narrow it as far as your evidence allows, documenting each step.","support":"~400 words on deductive analysis from wet tests.","llc":"run one confirmatory test live and justify your conclusion."},
      {"option_no":2,"title":"A Molecule I Made","primary":"prepare an organic compound by a named reaction, purify it, confirm it (melting point / a test), and report an honest yield with losses.","support":"~400 words on the reaction and purification chemistry.","llc":"show the product and answer how you'd raise the yield."},
      {"option_no":3,"title":"Purity You Can Measure","primary":"purify a chosen solid by crystallization and use melting-point behaviour to demonstrate the improvement in purity, with before/after data.","support":"~400 words on why melting range signals purity.","llc":"judge a fresh sample's purity from its melting range live."},
      {"option_no":4,"title":"The Test That Never Lies","primary":"assemble your own reliable scheme of functional-group tests, validated on real known compounds, and present it as a usable identification key.","support":"~400 words on false positives you guarded against.","llc":"identify a functional group in an unknown live."},
      {"option_no":5,"title":"Safe Hands in the Organic Lab","primary":"produce a genuinely usable safety-and-technique guide for the organic bench, grounded in the real reagents and glassware you work with and one incident (yours or observed) you learned from.","support":"~400 words on why organic labs demand specific care.","llc":"walk the cohort through one procedure's safety points."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHCP02'
  and is_latest = true and is_archived = false;

-- ── 26UCHGE1 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Draw the MO diagram of H2 (and one other simple molecule) by hand and classify its orbitals as bonding/antibonding/nonbonding; predict bond order.","deliverable_notes":"Your hand MO diagrams + bond orders + 1 line on what antibonding population would do."},
      {"sno":2,"unit":"II","finks_dimension":"Foundational Knowledge","task":"Compute the nuclear binding energy per nucleon of one named nuclide by hand from its mass defect, using real cited masses.","deliverable_notes":"Your hand computation (masses sourced) + binding energy per nucleon + 1 line on stability."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Build ball-and-stick (or drawn) models of methane, ethylene and acetylene showing the hybridisation, and measure/estimate the bond angles.","deliverable_notes":"Your three models/drawings with hybridisation + estimated angles + 1 line linking hybridisation to shape."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Work the mechanism of one electrophilic aromatic substitution (nitration/halogenation) on benzene by hand and identify the electrophile.","deliverable_notes":"Your hand mechanism + the electrophile named + 1 line on why benzene resists addition but allows substitution."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Find three real polymer products around you (name them) and classify each as addition/condensation and natural/synthetic, giving the monomer where you can.","deliverable_notes":"Your three real polymers with classification + monomer + 1 line on a property that fits its use."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Bonding You Can Hold","primary":"build physical or careful drawn models for a set of molecules spanning ionic, covalent and coordinate bonding, and predict a real property for each from its bonding.","support":"~400 words on how bonding dictates behaviour.","llc":"predict a fresh molecule's shape live."},
      {"option_no":2,"title":"The Energy in the Nucleus","primary":"compute binding-energy-per-nucleon for a family of nuclides by hand, plot the curve, and connect its peak to real fission/fusion facts.","support":"~400 words on nuclear stability.","llc":"defend one computation and answer which reaction releases energy."},
      {"option_no":3,"title":"Polymers All Around Me","primary":"survey the real polymer products in your home/campus, classify each by mechanism and origin, identify monomers, and test one property (stretch, melt, solubility).","support":"~400 words on structure–property links.","llc":"classify a mystery polymer from a simple test live."},
      {"option_no":4,"title":"An Aromatic Mechanism, Mine","primary":"produce a fully worked electrophilic-substitution mechanism by hand and connect it to a real aromatic product's synthesis you research.","support":"~400 words on aromaticity's role.","llc":"re-draw the mechanism live for a new electrophile."},
      {"option_no":5,"title":"A Physical-Science Chemistry Idea I Prove","primary":"pick one concept (hybridisation, MO bond order, binding energy) and produce your own derivation/model plus a checked real-world instance.","support":"~400 words on the hardest step.","llc":"present and answer 'why valid?'"}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHGE1'
  and is_latest = true and is_archived = false;

-- ── 26UCHGE2 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Name and draw one real coordination compound (e.g. in a vitamin, dye or catalyst) and identify its ligands, coordination number and geometry.","deliverable_notes":"Your drawing of the real complex + ligands/CN/geometry + 1 line on where it occurs in real life."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Perform a simple test that distinguishes glucose from another sugar (e.g. a real fruit juice vs table sugar) and record the result.","deliverable_notes":"Your test and observation on the named real samples + 1 line on the structural difference it detects."},
      {"sno":3,"unit":"III","finks_dimension":"Human Dimension","task":"Research one real drug from the syllabus classes (a sulpha drug, penicillin, chloramphenicol) — its mode of action and one real-world impact — from named sources.","deliverable_notes":"The drug + its mode of action in your words + 1 line on a real public-health impact (sourced)."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Observe one real photochemical change (photography paper, sunprint, fading of a dye in sunlight) and relate it to the Grotthus–Draper / Stark–Einstein laws.","deliverable_notes":"Your photo of the real photochemical effect + 2 sentences applying a photochemistry law."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Build a simple galvanic cell (e.g. lemon/potato or Zn–Cu) and measure its voltage; compare with the standard-potential prediction.","deliverable_notes":"Your cell photo + measured voltage + the predicted EMF + 1 line on why they differ."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Cell I Built and Measured","primary":"construct one or more real galvanic cells, measure their voltages, and reconcile the readings with standard-electrode-potential predictions, exploring one variable.","support":"~400 words on why measured EMF departs from ideal.","llc":"predict and then measure a new cell live."},
      {"option_no":2,"title":"The Drug and Its Mechanism","primary":"study one chemotherapeutic agent in depth from named sources — chemistry, mode of action, resistance, real impact — and present an honest account.","support":"~400 words on chemistry serving medicine.","llc":"field a 'how does it act?' question unscripted."},
      {"option_no":3,"title":"Light Doing Chemistry","primary":"capture and analyse a real photochemical process you can run (sunprint, dye fading, a photo reaction), quantifying the effect over exposure and applying photochemical laws.","support":"~400 words on quantum yield and the laws.","llc":"predict the effect of changing light live."},
      {"option_no":4,"title":"Sugar Chemistry in the Kitchen","primary":"use real foods to demonstrate and distinguish carbohydrate types with simple tests, and connect structure to a real property (sweetness, reducing behaviour, browning).","support":"~400 words on carbohydrate structure.","llc":"identify a sugar by test live."},
      {"option_no":5,"title":"Coordination in Real Life","primary":"find coordination chemistry in real materials (haemoglobin, chlorophyll, a dye, a catalyst), characterise the complex, and explain why the metal centre matters.","support":"~400 words on Werner's insight applied.","llc":"identify ligands/geometry for a fresh complex live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHGE2'
  and is_latest = true and is_archived = false;

-- ── 26UCHGEP01 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Standardise one solution yourself against a primary standard and record the titre readings in your own hand.","deliverable_notes":"Your standardisation table (signed) + the exact concentration + 1 line on why a primary standard is needed."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Estimate the amount of one substance by acid–base volumetric analysis and compute your result with an error estimate.","deliverable_notes":"Your data + result + error + 1 line on your dominant uncertainty."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Repeat one estimation three times and quantify the spread (mean and range) of your titres.","deliverable_notes":"Your three concordant titres + mean + range + 1 line on whether they are concordant and why."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Compare a self-indicating titration with an indicator-based one you perform, noting how you judged each end point.","deliverable_notes":"Your notes on both end points + 1 line on which was easier to call and why."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"Document safe disposal of the real waste from one of your titrations and one good-practice you follow at the bench.","deliverable_notes":"Your disposal note for the named waste + 1 line on a safety habit you keep."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Standard Solution I Can Vouch For","primary":"prepare and standardise a solution with replicate titres and full error analysis, and demonstrate its use in a real estimation.","support":"~400 words on the chain of trust from primary standard to result.","llc":"defend your concentration against a probing question."},
      {"option_no":2,"title":"Concordance, Proven","primary":"study the reproducibility of one volumetric estimation across many trials, analyse the spread, and identify the technique change that tightens it.","support":"~400 words on random vs systematic error.","llc":"present your spread and propose an improvement live."},
      {"option_no":3,"title":"Reading the End Point","primary":"across contrasting titration types, document the end-point signals and indicator chemistry, building a practical guide to calling them correctly.","support":"~400 words on end-point detection.","llc":"call an end point on a fresh titration live."},
      {"option_no":4,"title":"An Estimation, Start to Finish","primary":"take one analyte from sampling to reported concentration with honest error, treating measurement quality as the object.","support":"~400 words on measurement reliability.","llc":"answer 'how do you know this number is right?'"},
      {"option_no":5,"title":"The Bench I Keep Safe","primary":"produce a real safety-and-waste protocol for the volumetric bench you use, grounded in the actual reagents and one near-miss.","support":"~400 words on lab responsibility.","llc":"walk the cohort through your protocol."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHGEP01'
  and is_latest = true and is_archived = false;

-- ── 26UCHGEP02 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Perform functional-group tests to identify whether one real sample contains a phenol, acid, amine, aldehyde or amide, recording each test result.","deliverable_notes":"Your test sequence and observations + the group concluded + 1 line on the decisive test."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Detect a special element (N/S/halogen) in one organic sample and record the confirming observation.","deliverable_notes":"Your Lassaigne observation + element detected + 1 line on the confirming colour/precipitate."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Test one real food or household substance for glucose (or an aldehyde) and interpret the result.","deliverable_notes":"The named substance + your test + result + 1 line on what a positive result means chemically."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Build your own decision-tree (flowchart) for identifying an unknown from the tests you performed.","deliverable_notes":"Your hand-drawn identification flowchart + 1 line on the branch you found most reliable."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"Note one safety precaution specific to a reagent used in your functional-group tests and why it matters.","deliverable_notes":"The reagent + precaution + 1 line on the consequence of ignoring it."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Unknown, Cracked","primary":"identify the functional group(s) of an unknown organic sample through your own systematic tests, documenting the evidence chain.","support":"~400 words on wet-test deduction.","llc":"run a decisive test live and defend the call."},
      {"option_no":2,"title":"My Identification Key","primary":"build and validate (on knowns) a practical functional-group identification key, then apply it to an unknown.","support":"~400 words on the false positives you designed around.","llc":"identify a group in a fresh sample live."},
      {"option_no":3,"title":"Chemistry in a Food Sample","primary":"apply functional-group and element tests to real foods to reveal their chemistry (sugars, proteins, fats), reporting honest results.","support":"~400 words on what wet tests can and cannot tell you.","llc":"test a food live and interpret."},
      {"option_no":4,"title":"Detecting the Hidden Element","primary":"reliably detect N, S and halogens across several real organic samples, documenting the chemistry of each confirmatory test.","support":"~400 words on the Lassaigne fusion logic.","llc":"detect an element live."},
      {"option_no":5,"title":"Safe and Systematic","primary":"produce a combined safety + systematic-analysis protocol for organic qualitative work, grounded in your real bench practice.","support":"~400 words on disciplined analysis.","llc":"walk through your protocol on a sample."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHGEP02'
  and is_latest = true and is_archived = false;

-- ── 26UCHNM1 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Test one real food for a common adulterant (e.g. water in milk with a lactometer/drop test, starch in a spice with iodine) and record the result.","deliverable_notes":"The named food + your adulteration test + result + 1 line on health impact if adulterated."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Read the pesticide/food-safety label or a news report on one real food and summarise the chemical hazard and its first-aid.","deliverable_notes":"The real food/report (sourced) + the hazard + 1 line of correct first-aid."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Read the ingredient labels of five real packaged foods and identify the additives (sweetener, colour, preservative, emulsifier) in each.","deliverable_notes":"Your five real labels (photos) + the additives identified + 1 line on the one you'd most want to reduce."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Investigate the chemistry of one real beverage you drink (carbonation, acidity, sugar) with a simple test (pH, fizz) and relate it to a health effect.","deliverable_notes":"The named beverage + your measurement + 1 line linking it to a real effect on the body."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Compare two real cooking oils by a simple observation (smoke behaviour, label iodine value, saturated/unsaturated claim) and relate to MUFA/PUFA.","deliverable_notes":"The two named oils + your comparison + 1 line on which is better for the heart and why."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Is My Food Adulterated?","primary":"run simple adulteration tests on several real staple foods you buy (milk, oil, spices, honey), document results honestly, and report which passed.","support":"~400 words on food-adulteration chemistry and its public-health stakes.","llc":"run one test live and interpret."},
      {"option_no":2,"title":"Reading the Label Like a Chemist","primary":"audit the additives in your household's real packaged foods, classify each by function and safety, and produce an evidence-based 'reduce/keep' guide.","support":"~400 words on additive chemistry.","llc":"decode a fresh label live."},
      {"option_no":3,"title":"The Chemistry of What I Drink","primary":"investigate several real beverages' chemistry (acidity, sugar, carbonation) with simple measurements, and connect to real health effects.","support":"~400 words on beverage chemistry.","llc":"measure and interpret a drink live."},
      {"option_no":4,"title":"Good Fat, Bad Fat","primary":"compare real cooking oils/fats through labels and simple observations, relate saturation to health, and make a household recommendation.","support":"~400 words on fats chemistry and the heart.","llc":"defend your recommendation when a cost/taste trade-off is raised."},
      {"option_no":5,"title":"A Food-Safety Guide for My Home","primary":"turn your tests and reading into a real, usable food-safety guide for your household, each point backed by your own evidence.","support":"~400 words on chemistry protecting health.","llc":"present the guide and answer a challenge to one claim."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHNM1'
  and is_latest = true and is_archived = false;

-- ── 26UCHNM2 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Measure a real physical property of milk you buy (density with a lactometer, or fat by the cream line after standing) and record it.","deliverable_notes":"The named milk + your measurement + 1 line on which constituent it reflects."},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Observe a real processing change in milk at home (boiling skin formation, souring) and explain the physico-chemical change behind it.","deliverable_notes":"Your observation (photo) + 2 sentences on the chemistry (protein denaturation / fermentation)."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Separate cream from real milk by standing or a simple method, estimate the cream fraction, and relate to the creaming process.","deliverable_notes":"Your method + estimated cream fraction + 1 line on gravitational vs centrifugal separation."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Read the label of one real standardised/flavoured/vitaminised milk and identify what was added or adjusted and why.","deliverable_notes":"The named product's label (photo) + what was standardised/added + 1 line on the consumer reason."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Make one fermented milk product at home (curd/yoghurt) with a real culture, note the conditions, and observe the change (thickening, sourness, pH).","deliverable_notes":"Your process notes + the observed change (pH or texture) + 1 line on the fermentation chemistry."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Milk, Measured","primary":"characterise several real milks (different brands/sources) by simple physical measurements (density, fat, pH) and relate the numbers to composition and quality.","support":"~400 words on milk's colloidal chemistry.","llc":"measure and interpret a milk sample live."},
      {"option_no":2,"title":"Fermentation I Ran","primary":"produce a fermented milk product at home under controlled conditions you vary, tracking the change (pH/texture/time) and explaining the microbiology–chemistry.","support":"~400 words on culturing chemistry.","llc":"present your data and predict a condition change's effect."},
      {"option_no":3,"title":"From Milk to Cream and Butter","primary":"separate cream and (if feasible) make butter from real milk, quantify yields, and explain the creaming and churning chemistry.","support":"~400 words on emulsions and phase inversion.","llc":"show the product and explain a step."},
      {"option_no":4,"title":"What's Really in Processed Milk","primary":"audit real processed-milk products (standardised, flavoured, vitaminised) by label and simple tests, and assess the claims.","support":"~400 words on processing chemistry and nutrition.","llc":"decode a product live."},
      {"option_no":5,"title":"A Dairy Process, Understood","primary":"choose one dairy process (pasteurisation, homogenisation, fermentation), reproduce or observe it for real, and build a clear chemical account.","support":"~400 words on the chemistry behind the process.","llc":"answer 'what if this step were skipped?'"}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHNM2'
  and is_latest = true and is_archived = false;

-- ── 26UCHS01 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Caring","task":"Walk your real chemistry lab and photograph three glasswares, naming each and one correct use and one misuse to avoid; note one carcinogenic/toxic chemical stored there.","deliverable_notes":"Your labelled photos + uses/misuses + the named hazardous chemical + 1 line on its safe handling."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Take five real organic compounds (from food/medicine labels) and write their IUPAC or class names and identify the functional group in each.","deliverable_notes":"Your five real compounds with names + functional groups + 1 line on the group you met most often."},
      {"sno":3,"unit":"III","finks_dimension":"Foundational Knowledge","task":"Draw the shapes of s, p and d orbitals by hand and place three named elements correctly on a blank periodic table you fill in.","deliverable_notes":"Your orbital sketches + your filled periodic-table placements + 1 line on a periodic trend you can state."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Take five real measurements (mass, volume, temperature) with lab or kitchen instruments and express each with correct units and significant figures.","deliverable_notes":"Your five measurements with units + sig figs + 1 line on how you decided the sig figs."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Work one real stoichiometry problem by hand (e.g. from a recipe or a reaction) computing mole ratios and a limiting reagent.","deliverable_notes":"Your hand calculation + the limiting reagent + 1 line on what runs out first and why."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Lab, Learned Safely","primary":"produce a real orientation guide to your chemistry lab — glassware, storage, hazards, first-aid — grounded in the actual room, verified against a safety standard.","support":"~400 words on why foundational lab discipline matters.","llc":"give the cohort a safety walkthrough of one procedure."},
      {"option_no":2,"title":"Naming the World's Molecules","primary":"collect real compounds from labels around you and build a correctly-named, functional-group-classified catalogue, verifying nomenclature rules.","support":"~400 words on why systematic naming matters.","llc":"name a fresh structure live."},
      {"option_no":3,"title":"Measurement I Can Defend","primary":"take a set of real measurements with proper units, significant figures and error, and demonstrate why sloppy figures mislead.","support":"~400 words on significant figures and units.","llc":"judge the sig figs of a fresh measurement live."},
      {"option_no":4,"title":"Stoichiometry That Runs Out","primary":"model a real reaction or recipe as a stoichiometry problem, compute limiting reagent and yield, and test it in practice where feasible.","support":"~400 words on the mole concept made concrete.","llc":"solve a fresh limiting-reagent problem live."},
      {"option_no":5,"title":"A Foundation Concept, Owned","primary":"pick one foundation idea (orbitals, periodicity, mole concept) and produce your own clear explanation plus a worked real example.","support":"~400 words on the step you found hardest.","llc":"present and answer a 'why?' question."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHS01'
  and is_latest = true and is_archived = false;

-- ── 26UCHS02 · b-sc-chemistry ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Read the ingredient list of one real face cream/lotion you own and identify the cleansing, moisturising and preservative roles of three ingredients.","deliverable_notes":"The named product's ingredients (photo) + your three role assignments + 1 line on the moisturiser's mechanism."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Compare the ingredient lists of two real shampoos (or a shampoo and a toothpaste) and identify the surfactant/active in each.","deliverable_notes":"The two named products + the surfactant/active identified + 1 line on what it does chemically."},
      {"sno":3,"unit":"III","finks_dimension":"Foundational Knowledge","task":"For one real colour cosmetic (lipstick, eyeliner, foundation), identify the pigment/base type from its label or a reliable source.","deliverable_notes":"The named product + the pigment/base type + 1 line on why that base suits the purpose."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Trace one real perfume/fragrance ingredient to its natural (plant/animal) or synthetic origin using a reliable source, noting any ethical consideration.","deliverable_notes":"The ingredient + its origin (sourced) + 1 line on an ethical or sustainability point."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Make one simple real personal-care product at home (a face mask, a scrub, a lip balm) from named ingredients and note the function of each.","deliverable_notes":"Your made product (photo) + the ingredient list with functions + 1 line on the chemistry of one ingredient."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Product I Formulated","primary":"formulate a simple, safe personal-care product yourself (mask, scrub, balm, cleanser) from named ingredients, justify each ingredient's chemical function, and test it.","support":"~400 words on formulation chemistry.","llc":"present the product and defend an ingredient choice."},
      {"option_no":2,"title":"Decoding the Cosmetic Shelf","primary":"audit the real cosmetics in your home, classify each by type and key active/pigment/surfactant, and separate marketing claims from chemistry.","support":"~400 words on cosmetic chemistry.","llc":"decode a fresh product's label live."},
      {"option_no":3,"title":"Natural vs Synthetic, Honestly","primary":"investigate the origins of ingredients in real fragrance/skincare products, weigh natural vs synthetic on evidence (safety, sustainability, cost), and reach a reasoned position.","support":"~400 words avoiding the 'natural = safe' fallacy.","llc":"defend your position against a challenge."},
      {"option_no":4,"title":"The Surfactant Story","primary":"study how real cleansing products (shampoo, soap, toothpaste, face wash) work chemically, compare their surfactants, and demonstrate one cleaning action.","support":"~400 words on surfactant chemistry.","llc":"explain a cleaning result live."},
      {"option_no":5,"title":"Care Chemistry I Can Trust","primary":"turn your formulation and label work into a real, evidence-based personal-care guide (what works, what's hype, what to avoid), each claim backed.","support":"~400 words on chemistry vs marketing.","llc":"present the guide and answer a challenge to one claim."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCHS02'
  and is_latest = true and is_archived = false;

-- ── 26UGEGE1 · b-sc-geography ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"On a real physical map of India, mark and describe three major relief features and connect one to a real place you know of.","deliverable_notes":"Your annotated map + the three features + 1 line linking one to a real region."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Track real weather data for your location for several days and relate it to India's climate pattern/monsoon.","deliverable_notes":"Your dated weather record + 1 line connecting it to the monsoon system."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Identify one real natural resource (river, mineral, forest, soil) important to a named Indian region and its use.","deliverable_notes":"The named resource+region + its use + 1 line on a sustainability concern."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Use real census/population data to describe one population feature (density, distribution) of a region and a reason for it.","deliverable_notes":"The cited data + the feature + 1 line on a geographic reason."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Connect one real economic activity in your area (farming, industry, trade) to its geographic basis (soil, water, location).","deliverable_notes":"The real activity + its geographic basis + 1 line on how geography shapes it."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"India in Maps I Made","primary":"build a set of your own annotated maps of India (relief, climate, resources, population) tied to real data and, where possible, to places and activities you know.","support":"~400 words on reading India geographically.","llc":"locate and explain a feature on a blank map live."},
      {"option_no":2,"title":"The Monsoon Where I Live","primary":"track real local weather over time and connect it to India's monsoon and climate systems with data.","support":"~400 words on the monsoon.","llc":"interpret a fresh weather pattern live."},
      {"option_no":3,"title":"Geography Behind an Economy","primary":"analyse how geography (relief, soil, water, location) shapes a real economic activity in a region you study, with evidence.","support":"~400 words on geography and economy.","llc":"explain a fresh activity's geographic basis live."},
      {"option_no":4,"title":"A Resource and Its Region","primary":"study one real natural resource of an Indian region — its distribution, use and sustainability — with data.","support":"~400 words on resource geography.","llc":"reason about a fresh resource live."},
      {"option_no":5,"title":"People on the Land","primary":"use real population data to explain the distribution and density of a region and its geographic causes.","support":"~400 words on population geography.","llc":"interpret a fresh population map live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UGEGE1'
  and is_latest = true and is_archived = false;

-- ── 26UGEGE2 · b-sc-geography ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Mark on a Tamil Nadu map the major relief/coast features and locate your own town/district; describe its physical setting.","deliverable_notes":"Your annotated TN map + your district's physical setting + 1 line on a feature that affects local life."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Study one real Tamil Nadu river (Cauvery, Vaigai, or a local one) and its role in your region's water/agriculture.","deliverable_notes":"The named river + its real role + 1 line on a water-sharing or scarcity issue."},
      {"sno":3,"unit":"III","finks_dimension":"Human Dimension","task":"Observe and document one real geographic feature of your own district (a landform, soil type, crop pattern) by fieldwork.","deliverable_notes":"Your field observation (place named, photo) + 1 line on how geography shapes local livelihood."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Connect one real Tamil Nadu resource or industry (Neyveli lignite, Tirupur textiles, coastal fisheries) to its geographic location.","deliverable_notes":"The named resource/industry + its geographic basis + 1 line on why it is located there."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Use real local data (rainfall, crop, population) to describe one geographic characteristic of your district.","deliverable_notes":"The cited local data + the characteristic + 1 line on a geographic reason."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"My District, Geographically","primary":"produce a real geographic study of your own district — physical setting, rivers/water, soils, crops, industry and population — from fieldwork, maps and local data.","support":"~400 words on knowing your place geographically.","llc":"explain a feature of your district on a map live."},
      {"option_no":2,"title":"A Tamil Nadu River's Story","primary":"study a real TN river's geography and its role in water, agriculture and any conflict, with data and observation.","support":"~400 words on rivers and life.","llc":"reason about a fresh water issue live."},
      {"option_no":3,"title":"Where Industry Meets Geography","primary":"analyse why a real TN industry/resource sits where it does, connecting location to geographic factors, with evidence.","support":"~400 words on economic geography of TN.","llc":"explain a fresh location choice live."},
      {"option_no":4,"title":"Tamil Nadu in Maps I Made","primary":"build annotated maps of Tamil Nadu (relief, rivers, resources, districts) tied to real data and your own locality.","support":"~400 words on reading TN geographically.","llc":"locate and explain a feature live."},
      {"option_no":5,"title":"Fieldwork in My Locality","primary":"conduct real geographic fieldwork in your area (a landform, land-use, water body) with documented observation and analysis.","support":"~400 words on doing geography in the field.","llc":"present your fieldwork and answer a question live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UGEGE2'
  and is_latest = true and is_archived = false;

-- ── 26UMAC01 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Take one reciprocal equation you write down, solve it by hand using the standard-form method (increase/decrease roots, remove a term), and verify one root by substitution.","deliverable_notes":"Your full hand solution + the verified root + 1 line on which reduction step helped most."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Expand one function by the binomial/exponential/logarithmic series by hand to four terms and check the approximation against a calculator value.","deliverable_notes":"Your hand expansion + the numeric comparison + 1 line on the error at four terms."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"For a 3×3 matrix you choose, find eigenvalues and eigenvectors by hand and verify the Cayley–Hamilton theorem for it.","deliverable_notes":"Your hand-worked eigenvalues/vectors + the Cayley–Hamilton verification + 1 line on what the eigenvalues tell you."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Expand sin nθ or cos nθ in powers of sin θ/cos θ by hand for a chosen n and verify at one angle numerically.","deliverable_notes":"Your hand expansion + the numeric check at one angle + 1 line on where De Moivre entered."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Compute the logarithm of one complex quantity by hand using hyperbolic/circular relations, and plot the point.","deliverable_notes":"Your hand computation + the plotted complex number + 1 line relating circular and hyperbolic forms."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Matrix I Fully Analysed","primary":"choose a 3×3 matrix and by hand find its characteristic equation, eigenvalues, eigenvectors, verify Cayley–Hamilton and compute its inverse via the theorem.","support":"~400 words on what the eigen-structure reveals.","llc":"reproduce a step at the board when an entry is changed."},
      {"option_no":2,"title":"Series I Can Trust","primary":"expand several functions by binomial/exponential/log series by hand, quantify the approximation error term-by-term against exact values, and state where each series is valid.","support":"~400 words on convergence in your examples.","llc":"expand a fresh function live."},
      {"option_no":3,"title":"Solving the Reciprocal Equation","primary":"build and solve a family of reciprocal/higher equations by hand using root transformations, verifying every root.","support":"~400 words on why the standard-form tricks work.","llc":"solve a fresh equation live."},
      {"option_no":4,"title":"Trigonometric Expansions, Derived","primary":"derive several sin/cos/tan multiple-angle expansions by hand and validate them numerically at chosen angles.","support":"~400 words on the De Moivre engine behind them.","llc":"derive one live."},
      {"option_no":5,"title":"Into the Complex Plane","primary":"work several logarithms/inverse-hyperbolic values of complex quantities by hand, plot them, and explain the multi-valued nature.","support":"~400 words on complex logarithms.","llc":"compute one live and place it on the plane."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAC01'
  and is_latest = true and is_archived = false;

-- ── 26UMAC02 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Find the nth derivative of one function you choose by hand (via standard results/partial fractions) and verify it for n=1,2 by direct differentiation.","deliverable_notes":"Your nth-derivative formula + the n=1,2 checks + 1 line on the pattern you spotted."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"For a real two-variable function you model (e.g. area/volume of something you measure), compute partial derivatives and the total differential by hand.","deliverable_notes":"The real quantity modelled + your partial derivatives + 1 line on what the total differential estimates."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Find the maxima/minima of a function of two variables by hand and, if it models something real (a cost/area), interpret the optimum.","deliverable_notes":"Your hand optimisation + the critical point classified + 1 line on the real meaning if applicable."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Find the envelope of a family of curves by hand and sketch several members plus the envelope.","deliverable_notes":"Your envelope derivation + the sketch showing it touching the family + 1 line on what the envelope represents."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Compute the radius and centre of curvature at a point of a curve by hand and draw the osculating circle to scale.","deliverable_notes":"Your curvature computation + the scaled drawing of curve and osculating circle + 1 line on what curvature measures."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Curvature I Can Draw","primary":"for a curve you choose, compute radius and centre of curvature at several points by hand and draw the osculating circles to scale, showing how curvature varies.","support":"~400 words on the geometry of curvature.","llc":"compute curvature at a fresh point live."},
      {"option_no":2,"title":"An Optimum That Means Something","primary":"model a real two-variable situation you can measure (area, cost, yield), find its optimum by hand, and check it against reality.","support":"~400 words on multivariable optimisation.","llc":"re-optimise with a changed constraint live."},
      {"option_no":3,"title":"The nth Derivative Pattern","primary":"derive nth-derivative formulas for several functions by hand, prove one by induction, and verify numerically.","support":"~400 words on Leibnitz and standard results.","llc":"find an nth derivative live."},
      {"option_no":4,"title":"Envelopes, Constructed","primary":"construct envelopes for several curve families by hand with accurate drawings, and explain the touching condition.","support":"~400 words on the envelope idea.","llc":"find an envelope live."},
      {"option_no":5,"title":"Partial Derivatives in the Real World","primary":"take a real multivariable relationship you measure and use partial derivatives and the total differential to estimate a change, checking against a real measurement.","support":"~400 words on sensitivity via partials.","llc":"estimate a change live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAC02'
  and is_latest = true and is_archived = false;

-- ── 26UMAC03 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Convert a set of real points (e.g. positions you measure on graph paper) between polar and Cartesian coordinates by hand and compute a triangle's area both ways.","deliverable_notes":"Your conversions + the area computed two ways + 1 line confirming they agree."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"For a conic l/r = 1+e cos θ you choose, find the equation of a chord and its asymptotes by hand and sketch them.","deliverable_notes":"Your hand derivation + the sketch + 1 line on the eccentricity's effect."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Compute the length of the perpendicular from a point to a plane and the orthogonal projection by hand for a case you set up.","deliverable_notes":"Your computation + a 3D sketch + 1 line on what the projection represents."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"For two lines in space you define, determine by hand whether they are coplanar and find the angle/shortest distance between them.","deliverable_notes":"Your coplanarity test + angle/distance + 1 line on what coplanar means geometrically."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Find the equation of a sphere through given points and its section by a plane by hand; identify the circle of section.","deliverable_notes":"Your sphere equation + the section circle + 1 line on the tangent-plane condition."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Geometry in Three Dimensions, by Hand","primary":"build a small 3D geometry problem set (planes, lines, spheres) that you solve entirely by hand with accurate sketches, including one real-space interpretation.","support":"~400 words on visualising 3D analytically.","llc":"solve a fresh 3D problem live."},
      {"option_no":2,"title":"Conics from the Focus","primary":"study the polar conic l/r=1+e cos θ across eccentricities by hand — chords, asymptotes, shape — with drawings.","support":"~400 words on eccentricity and conic type.","llc":"sketch a conic for a given e live."},
      {"option_no":3,"title":"Lines That May or May Not Meet","primary":"investigate coplanarity, angles and shortest distances for several line pairs in space by hand, verifying with sketches/models.","support":"~400 words on skew vs coplanar lines.","llc":"test a fresh pair live."},
      {"option_no":4,"title":"A Sphere and Its Sections","primary":"derive spheres through given points and their plane sections by hand, and physically model one section.","support":"~400 words on sphere-plane geometry.","llc":"find a section circle live."},
      {"option_no":5,"title":"Coordinates, Two Ways","primary":"work a set of problems in both polar and Cartesian systems by hand, showing when each is simpler, grounded in real measured points.","support":"~400 words on choosing coordinates.","llc":"convert and solve live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAC03'
  and is_latest = true and is_archived = false;

-- ── 26UMAC04 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"A reduction formula steps a power down again and again until it hits a base case — exactly like walking down a staircase two steps at a time until you reach the ground. Go to ONE named staircase you can photograph (a temple flight, a well's steps, your college block, a known Kavandampatti / Erode / Salem landmark) and count its steps yourself.","deliverable_notes":"Bring a photo of the named staircase with your hand or foot in frame + the exact step-count you counted. Use that count as the power n and hand-work ONE reduction-formula integral (e.g. ∫sin^n x dx) all the way down to its base case on paper. Write 3-4 sentences: how many times you applied the formula, where it bottomed out, and how each application is one step down the stairs."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Pick ONE real flat region you can reach and measure with a tape — a named house terrace, a vegetable plot, a shop floor, a cricket-pitch strip near you. Measure its boundaries in metres yourself and note which named place it is.","deliverable_notes":"Bring a photo of the region with a tape or your foot in frame for scale + your measured dimensions written by hand. Set up the area as a double integral ∬ dx dy with limits taken from YOUR measurements, evaluate it by hand, then check it against a rough length×breadth. Write 3-4 sentences on any gap between the two numbers and why the region's shape caused it."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Find ONE real round object in your home shaped on a wheel or lathe — a clay kuja, a brass lota, a grinding-stone roller (ammikkal), a steel tumbler. Treat it as a solid of revolution and measure its radius at 5-6 equal heights up the side.","deliverable_notes":"Bring a photo of the object beside a ruler + your table of height-vs-radius. Set up the volume as an integral of πr² dh, evaluate it by hand, then FILL the object with water and measure the real capacity in millilitres. Write 3-4 sentences comparing your integrated volume to the measured water and explaining what caused the difference."},
      {"sno":4,"unit":"IV","finks_dimension":"Learning How to Learn","task":"The Gamma function is the factorial idea (n! = n×(n−1)×…×1) stretched to fill the gaps between whole numbers, and it obeys the same recurrence Γ(n+1)=nΓ(n). Count a real whole number from your surroundings you can photograph — bangles on a named shop's rod, houses on your street, members in your family, sacks in a godown.","deliverable_notes":"Bring a photo of the counted real things + the count n. Compute n! two ways by hand: as the direct product, AND by unrolling the Gamma recurrence Γ(n+1)=nΓ(n) down to Γ(1). Show the two answers match. Write 3-4 sentences on what Gamma adds that plain factorial cannot — that it also gives values at half-numbers like Γ(1/2)=√π."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Go to ONE real irregular piece of ground you can walk — a named farmer's field, a pond, a temple tank, an odd-shaped plot. Lay a baseline and measure the width (offset) across it at 6-8 equal steps. Then ask the NAMED owner or caretaker how THEY judge its area.","deliverable_notes":"Bring your offset table + a photo of the ground + the owner's name and a phone-verifiable contact. Compute the area by BOTH the Trapezoidal and Simpson's rule by hand. Write 3-4 sentences comparing your two answers to the owner's traditional estimate and saying which number you trust and why."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Volume of a Vessel My Family Owns","primary":"choose ONE turned or moulded vessel your family owns — brass kuja, clay pot, steel vessel. Measure its radius at several equal heights, model it as a solid of revolution, and integrate by hand for its volume. Then fill it with water and measure the true capacity. Bring the vessel and both numbers.","support":"~400 words linking your profile data, integral, and the water gap to Units II-III.","llc":"show the vessel and defend the discrepancy before cohort and faculty."},
      {"option_no":2,"title":"How Big Is That Field, Really?","primary":"pick ONE real irregular plot — a named farmer's field, pond, or temple tank. Survey it: lay a baseline, measure offsets at equal steps, and interview the NAMED owner (phone-verifiable) about how they estimate its area. Compute the area by Trapezoidal AND Simpson's rule by hand.","support":"~400 words comparing the two rules and the owner's traditional method, tied to Unit V.","llc":"present all three area figures and defend which is trustworthy before cohort and faculty."},
      {"option_no":3,"title":"A Day of Accumulation","primary":"choose ONE real quantity that builds over a day — your home's water-tank level, the electricity meter, or vehicles passing a named junction. Read it yourself at equal time intervals and log each reading with timestamps. Integrate the readings numerically (Trapezoidal / Simpson's) to get the total accumulated, then verify against the meter's own total.","support":"~400 words on numerical integration and error, tied to Unit V.","llc":"show your handwritten log and defend your accumulated total before cohort and faculty."},
      {"option_no":4,"title":"Reduction, Round by Round","primary":"document ONE real repeated, round-based task in your community — a cook grinding batches, a mason laying brick courses, a rope coiled layer by layer, a shop refilling a measure. Photograph each round and tally how many rounds reduce the work to nothing. Map this recursion to a reduction-formula integral you hand-solve to its base case.","support":"~400 words connecting the real recursion to Unit I.","llc":"show your round photos and defend the analogy before cohort and faculty."},
      {"option_no":5,"title":"The Factorial of My Street","primary":"count ONE real collection you can photograph — houses on your street, bangles on a named shop's rod, items a named vendor arranges. Compute its factorial two ways by hand: direct product, and by unrolling the Gamma recurrence. Then interview a NAMED person who arranges things (shopkeeper, priest, cook) about how many orderings they picture.","support":"~400 words on how Gamma generalizes factorial, tied to Unit IV.","llc":"present your count, both computations, and the interview before cohort and faculty."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAC04'
  and is_latest = true and is_archived = false;

-- ── 26UMADE1 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Convert five real numbers (e.g. today's date, your roll number) between decimal, binary, octal and hexadecimal by hand and verify one with a tool.","deliverable_notes":"Your five hand conversions + one tool-verified + 1 line on where BCD differs from binary."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Simplify one Boolean expression by hand using the postulates/laws and build its truth table to confirm.","deliverable_notes":"Your simplification steps + the confirming truth table + 1 line on the law that did the most work."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Design a small logic circuit (e.g. a half/full adder) on paper from gates and verify its truth table by hand.","deliverable_notes":"Your gate diagram + the verified truth table + 1 line on how the carry is produced."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Create one real formatted document in MS Word (a project cover or letter) using at least five formatting features, and save it.","deliverable_notes":"Screenshot of your real document + the five features used + 1 line on the feature you found most useful."},
      {"sno":5,"unit":"V","finks_dimension":"Foundational Knowledge","task":"Use a real web browser to research one topic, record the URLs, and note how you judged a source's reliability.","deliverable_notes":"Your topic + the real sources + 1 line on your reliability check."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Numbers in Every Base","primary":"build a hand-worked conversion workbook across decimal/binary/octal/hex/BCD for real numbers, prove one conversion algorithm, and cross-check with a tool.","support":"~400 words on why computers use binary/hex.","llc":"convert a fresh number across bases live."},
      {"option_no":2,"title":"A Circuit from Boolean Logic","primary":"design and paper-verify a small useful digital circuit (adder, comparator) from a Boolean specification you simplify by hand.","support":"~400 words on Boolean-to-gates.","llc":"build a truth table for a fresh gate combination live."},
      {"option_no":3,"title":"A Real Document, Well Made","primary":"produce a genuinely useful formatted document (report/newsletter/mail-merge) for a real purpose, demonstrating a range of office features.","support":"~400 words on what good formatting communicates.","llc":"reproduce one feature live."},
      {"option_no":4,"title":"Boolean Simplification, Proven","primary":"simplify a set of Boolean expressions by hand and prove each simplification with truth tables, building a mini reference.","support":"~400 words on the algebra of switching.","llc":"simplify a fresh expression live."},
      {"option_no":5,"title":"Finding Reliable Information","primary":"research a real question using the web, document your sources and a reasoned reliability assessment of each, and present a sourced answer.","support":"~400 words on evaluating online sources.","llc":"assess a fresh source's reliability live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMADE1'
  and is_latest = true and is_archived = false;

-- ── 26UMADE2 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Build a real Excel workbook holding data you collect (e.g. 20 days of a measurement), with proper sheet/row/column organisation.","deliverable_notes":"Screenshot of your real workbook + the data source named + 1 line on how you structured it."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Perform basic worksheet operations on your data (sort, filter, freeze panes) and record what each reveals.","deliverable_notes":"Before/after screenshots + 1 line on an insight sorting/filtering gave you."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Format your worksheet as a table and apply conditional formatting to highlight a real pattern in your data.","deliverable_notes":"Screenshot showing the formatted table + 1 line on the pattern the formatting exposed."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Write at least five formulas/functions (SUM, AVERAGE, IF, VLOOKUP, a statistical one) that compute something meaningful from your real data.","deliverable_notes":"Screenshot of the formulas and results + 1 line on the function you found most powerful."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Create a chart from your real data that tells an honest story, choosing the chart type deliberately.","deliverable_notes":"Your chart (screenshot) + 1 line justifying the chart type for your data."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Spreadsheet That Answers a Real Question","primary":"collect real data yourself, build an Excel workbook that cleans, computes and charts it to answer a genuine question, using formulas and a deliberate visualisation.","support":"~400 words on your analysis choices.","llc":"modify a formula live and explain the effect."},
      {"option_no":2,"title":"The Honest Chart in Excel","primary":"from real data, produce both an honest and a misleading chart in Excel and explain exactly what technique deceives.","support":"~400 words on chart integrity.","llc":"spot the trick in a fresh chart live."},
      {"option_no":3,"title":"Formulas Doing Real Work","primary":"build a workbook where formulas/functions automate a real calculation (marks, budget, inventory) you'd otherwise do by hand, and verify against a manual check.","support":"~400 words on spreadsheet logic.","llc":"write a formula live for a new requirement."},
      {"option_no":4,"title":"From Raw Data to Insight","primary":"take a messy real dataset and use Excel operations (sort/filter/pivot/format) to extract and present one honest insight.","support":"~400 words on the analysis path.","llc":"extract an insight from a fresh sheet live."},
      {"option_no":5,"title":"A Tool Someone Could Use","primary":"build a genuinely reusable Excel tool (a calculator, tracker, gradebook) for a real user you name, and get their feedback.","support":"~400 words on designing for a user.","llc":"demonstrate the tool and adapt it live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMADE2'
  and is_latest = true and is_archived = false;

-- ── 26UMADEP01 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Create a formatted college project cover page yourself and save the file; keep the source and a screenshot.","deliverable_notes":"Your cover-page file + screenshot + 1 line on the layout choice you made."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Build and format a real marks table for 10 people (real or realistic), aligning and styling it properly.","deliverable_notes":"Screenshot of your formatted table + 1 line on an alignment/formatting decision."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Perform a real mail-merge to generate personalised letters/certificates for a named list.","deliverable_notes":"Screenshot of the merged output + the data source + 1 line on how merge fields worked."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Create a short PowerPoint on a real topic with at least five slides using transitions/formatting.","deliverable_notes":"Screenshot of your slides + 1 line on a design choice you made for clarity."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Combine skills: produce one real deliverable (a formatted report with an embedded table and a chart) end to end.","deliverable_notes":"Your combined document + 1 line on the hardest integration step."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Office Deliverable, Start to Finish","primary":"produce a genuinely usable office deliverable (report + mail-merged letters + a presentation) for a real purpose you name, demonstrating the full toolset.","support":"~400 words on what you learned about the software.","llc":"reproduce one technique (e.g. mail-merge) live."},
      {"option_no":2,"title":"Mail-Merge for Real","primary":"run a real mail-merge task (certificates, invitations) for a named list, troubleshooting field issues, and deliver the output.","support":"~400 words on data-driven documents.","llc":"set up a merge field live."},
      {"option_no":3,"title":"A Presentation That Communicates","primary":"build a real presentation on a topic you know, applying design principles, and present it.","support":"~400 words on slide design for clarity.","llc":"fix a cluttered slide live."},
      {"option_no":4,"title":"The Formatted Document","primary":"create a polished, correctly-formatted multi-element document for a real need, keeping a log of the features used.","support":"~400 words on formatting as communication.","llc":"apply a formatting feature live."},
      {"option_no":5,"title":"My Office-Skills Portfolio","primary":"assemble a portfolio of real office deliverables you produced, each solving a genuine small task.","support":"~400 words on office literacy.","llc":"demonstrate any one deliverable's key technique live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMADEP01'
  and is_latest = true and is_archived = false;

-- ── 26UMADEP02 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Create a real student-information workbook and perform data entry, editing, saving and reopening; keep the file.","deliverable_notes":"Your workbook + screenshot + 1 line on a data-entry safeguard you used."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Perform worksheet operations (sort, filter, name ranges) on real data and record an insight.","deliverable_notes":"Before/after screenshots + 1 line on the insight."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Use formulas/functions to compute results from your data and verify one against a hand calculation.","deliverable_notes":"Screenshot of formulas + your hand-check of one + 1 line confirming agreement."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Build a chart from your real data and format it for clarity.","deliverable_notes":"Your chart + 1 line on the chart-type choice."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Produce one small mathematical-computing task in Excel (e.g. iterate a formula, solve numerically) and document it.","deliverable_notes":"Screenshot of the computation + 1 line on what Excel automated for you."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Mathematical Computing in a Spreadsheet","primary":"use Excel to solve a real mathematical-computing task (root-finding by iteration, tabulating a function, a numerical sum) and verify against hand calculation.","support":"~400 words on spreadsheets as computing tools.","llc":"build a computation live."},
      {"option_no":2,"title":"A Data Workbook I Built","primary":"create and analyse a real data workbook end to end (entry → operations → formulas → chart), answering a genuine question.","support":"~400 words on your workflow.","llc":"extend the workbook live."},
      {"option_no":3,"title":"Verified by Hand","primary":"build spreadsheet computations and rigorously verify a sample against hand calculation, documenting any discrepancy.","support":"~400 words on trusting automated results.","llc":"verify a fresh formula live."},
      {"option_no":4,"title":"Charts That Tell the Truth","primary":"visualise real data honestly in Excel with a justified chart type, contrasting with a misleading version.","support":"~400 words on visualisation ethics.","llc":"judge a chart live."},
      {"option_no":5,"title":"A Reusable Spreadsheet Tool","primary":"build a reusable Excel tool for a real user and gather their feedback.","support":"~400 words on user-centred design.","llc":"adapt the tool live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMADEP02'
  and is_latest = true and is_archived = false;

-- ── 26UMAGE2 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Form and solve one first-order differential equation modelling a real situation you can observe (cooling tea, filling tank) by hand.","deliverable_notes":"The real situation + your ODE and solution + 1 line comparing prediction to observation."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Solve one second-order linear ODE with constant coefficients by hand and interpret the solution's behaviour.","deliverable_notes":"Your hand solution + 1 line on whether it grows/decays/oscillates and why."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Find the Laplace transform of two functions by hand from the definition/table and state one use.","deliverable_notes":"Your two transforms + 1 line on why Laplace turns calculus into algebra."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Solve one initial-value ODE using Laplace transforms by hand and verify the solution satisfies the equation.","deliverable_notes":"Your Laplace solution + the verification + 1 line on the advantage over the classical method."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Take a real time-series you record (a decaying/growing quantity) and fit a differential-equation model, estimating the rate.","deliverable_notes":"Your real data + the fitted model + rate + 1 line on the fit quality."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Differential Equation for Something Real","primary":"observe and measure a real changing quantity, model it with a differential equation, solve by hand and by Laplace where suitable, and test the prediction against your data.","support":"~400 words on modelling change.","llc":"adjust the model for a new condition live."},
      {"option_no":2,"title":"Laplace as a Tool","primary":"solve a set of initial-value problems by Laplace transforms by hand, verifying each, and explain why the method is powerful.","support":"~400 words on transform methods.","llc":"solve a fresh IVP by Laplace live."},
      {"option_no":3,"title":"Growth and Decay, Measured","primary":"track a real exponential-type process, fit the ODE, extract the rate, and assess where the model breaks.","support":"~400 words on rate constants.","llc":"predict a value live."},
      {"option_no":4,"title":"Second-Order Behaviour","primary":"solve and classify several second-order ODEs by hand (growth/decay/oscillation), tying one to a real oscillating system.","support":"~400 words on the roots-behaviour link.","llc":"classify a fresh equation's behaviour live."},
      {"option_no":5,"title":"From Definition to Transform","primary":"derive Laplace transforms of several functions from the definition by hand and build a small verified table.","support":"~400 words on the transform integral.","llc":"transform a fresh function live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAGE2'
  and is_latest = true and is_archived = false;

-- ── 26UMAGEP01 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Perform matrix operations (multiply, invert a 3×3) by hand and verify one with a tool.","deliverable_notes":"Your hand matrix work + tool check + 1 line on where errors creep in."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Apply the Leibnitz formula to find an nth derivative by hand and check for small n.","deliverable_notes":"Your Leibnitz computation + the small-n check + 1 line on the pattern."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Compute partial derivatives of a two-variable function by hand and interpret one geometrically.","deliverable_notes":"Your partials + 1 line on the geometric meaning of one."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Compute the divergence and curl of a vector field by hand for a field you write down.","deliverable_notes":"Your divergence and curl + 1 line on what each tells you physically."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Take one practical from above and repeat it with a different input to build confidence in the method.","deliverable_notes":"Your second worked example + 1 line on what stayed the same and what changed."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Vector Calculus by Hand","primary":"build a worked set of divergence/curl/gradient computations by hand for fields you define, with physical interpretations, verified where possible.","support":"~400 words on what div and curl mean.","llc":"compute div/curl of a fresh field live."},
      {"option_no":2,"title":"Matrices, Worked and Checked","primary":"perform a suite of matrix computations by hand (products, inverses, eigen where feasible) and verify with a tool, analysing error sources.","support":"~400 words on matrix computation.","llc":"invert a fresh matrix live."},
      {"option_no":3,"title":"Higher Derivatives via Leibnitz","primary":"apply Leibnitz's formula across several products by hand, prove one case, and verify numerically.","support":"~400 words on the formula.","llc":"apply Leibnitz live."},
      {"option_no":4,"title":"Partial Derivatives, Understood","primary":"compute and geometrically interpret partial derivatives for several surfaces, with sketches.","support":"~400 words on multivariable slopes.","llc":"interpret a partial derivative live."},
      {"option_no":5,"title":"A Practical Method Mastered","primary":"choose one practical technique from the course, work it across varied inputs to fluency, and document the method as a mini-guide.","support":"~400 words on the technique.","llc":"apply it to a fresh input live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAGEP01'
  and is_latest = true and is_archived = false;

-- ── 26UMANM1 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Solve 10 real number-system/arithmetic aptitude questions by hand (from a named source) and time yourself.","deliverable_notes":"Your 10 worked solutions + your time + 1 line on the trick that saved the most time."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Solve 10 percentage/ratio/average problems by hand and identify the one shortcut you now rely on.","deliverable_notes":"Your 10 solutions + the shortcut + 1 line on where it applies."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Work 10 time-speed-distance or time-work problems by hand, checking each answer.","deliverable_notes":"Your 10 solutions + 1 line on the most common mistake you catch yourself making."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Take a real timed mini-mock (20 mixed questions, sourced) and analyse your accuracy and speed honestly.","deliverable_notes":"Your score + time + 1 line on your weakest topic."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Build your own 10-question practice set with worked answers for one topic you find hard.","deliverable_notes":"Your question set + answer key + 1 line on why these test the concept."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"My Competitive-Maths Question Bank","primary":"build a genuine, worked practice bank across the arithmetic/aptitude topics from real sources, with an answer key you can defend, and track your own improvement.","support":"~400 words on which methods sped you up.","llc":"solve one of your questions at the board and justify the shortcut."},
      {"option_no":2,"title":"Speed I Can Prove","primary":"run timed mini-mocks over weeks, log accuracy and speed honestly, and demonstrate measurable improvement on a topic.","support":"~400 words on deliberate practice.","llc":"solve a timed question live."},
      {"option_no":3,"title":"The Shortcut Collection","primary":"assemble and prove the arithmetic shortcuts that actually work, each validated on real problems.","support":"~400 words on why the shortcuts are valid.","llc":"apply a shortcut to a fresh problem live."},
      {"option_no":4,"title":"My Weakest Topic, Conquered","primary":"identify your genuinely weakest aptitude topic, drill it with real problems, and evidence the turnaround.","support":"~400 words on the learning process.","llc":"solve a fresh problem in that topic live."},
      {"option_no":5,"title":"Teaching to Learn","primary":"create a clear worked tutorial for one hard topic that a peer could learn from, and test it on a real peer.","support":"~400 words on the topic and on teaching it.","llc":"explain the method live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMANM1'
  and is_latest = true and is_archived = false;

-- ── 26UMANM2 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Solve 10 real data-interpretation questions (tables/graphs from a named source) by hand.","deliverable_notes":"Your 10 solutions + 1 line on how you read the chart efficiently."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Work 10 algebra/equations aptitude problems by hand and verify each.","deliverable_notes":"Your 10 solutions + 1 line on the method you standardised on."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Solve 10 permutation/combination/probability aptitude questions by hand.","deliverable_notes":"Your 10 solutions + 1 line on the counting principle you use most."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Attempt a real full timed section (sourced), then analyse your errors by type.","deliverable_notes":"Your score + an error-type breakdown + 1 line on the pattern in your mistakes."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Create a 10-question mixed set with solutions targeting your error pattern.","deliverable_notes":"Your set + answer key + 1 line on why it targets your weakness."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Data Interpretation, Mastered","primary":"build a worked DI practice set from real charts/tables, develop and prove efficient reading methods, and evidence your speed gain.","support":"~400 words on reading data under time pressure.","llc":"interpret a fresh chart live."},
      {"option_no":2,"title":"Counting Without Fear","primary":"assemble a permutation/combination/probability practice bank with careful worked solutions, and validate on real questions.","support":"~400 words on the counting principles.","llc":"solve a fresh counting problem live."},
      {"option_no":3,"title":"My Error Log, Turned Around","primary":"keep a genuine error log across timed practice, categorise mistakes, target them, and evidence the reduction.","support":"~400 words on error-driven improvement.","llc":"solve a fresh problem in a former weak area live."},
      {"option_no":4,"title":"A Timed Section, Analysed","primary":"take real timed sections, analyse accuracy/speed/error-type rigorously, and build a personal strategy.","support":"~400 words on exam strategy from data.","llc":"solve a timed question and narrate strategy live."},
      {"option_no":5,"title":"The Set I Made for a Peer","primary":"build and test a targeted practice set that helps a real peer improve on a topic.","support":"~400 words on the topic and teaching it.","llc":"explain a solution method live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMANM2'
  and is_latest = true and is_archived = false;

-- ── 26UMAS01 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Write and run a SageMath program yourself to do arithmetic/algebraic simplification, and compare its result with your hand calculation.","deliverable_notes":"Your code + output + your hand-check + 1 line on a case where you had to fix the code."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Write SageMath code to solve equations or work with matrices and verify one result by hand.","deliverable_notes":"Your running code + output + the hand verification + 1 line on what Sage automated."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Use SageMath to plot a function and locate a feature (root, max) and confirm it analytically.","deliverable_notes":"Your plot + code + the analytic confirmation + 1 line on the feature."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Write a small Sage program that does calculus (a derivative/integral) and check it by hand.","deliverable_notes":"Your code + output + hand-check + 1 line on a limitation you noticed."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Combine your programs into one small Sage 'notebook' solving a real multi-step problem you choose.","deliverable_notes":"Your notebook + result + 1 line on the hardest step to code."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A SageMath Notebook I Built","primary":"write, run and debug your own SageMath programs to solve a real multi-step mathematical problem, verifying key results by hand.","support":"~400 words on where computation helped and where hand-work was needed.","llc":"modify your code live for a new input."},
      {"option_no":2,"title":"Code That Checks My Maths","primary":"use SageMath to verify a set of your own hand computations (algebra, calculus, matrices), reconciling any disagreement.","support":"~400 words on computer algebra as a check.","llc":"verify a fresh computation live."},
      {"option_no":3,"title":"Plot, Then Prove","primary":"use Sage to explore functions graphically, form conjectures about features, and confirm them analytically by hand.","support":"~400 words on graphical-to-analytic reasoning.","llc":"explore a fresh function live."},
      {"option_no":4,"title":"Automating a Calculation","primary":"identify a tedious real calculation and write Sage code to automate it correctly, validated against hand results.","support":"~400 words on when to automate.","llc":"extend the automation live."},
      {"option_no":5,"title":"Debugging Mathematics Code","primary":"keep a real log of bugs you hit writing Sage code and how you fixed each, ending with clean working programs.","support":"~400 words on debugging as problem-solving.","llc":"fix a broken snippet live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAS01'
  and is_latest = true and is_archived = false;

-- ── 26UMAS02 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"In GeoGebra, plot a function and locate its roots graphically; confirm one root's interval by a sign check by hand.","deliverable_notes":"Your GeoGebra plot + the root intervals + your hand sign-check + 1 line on reading roots graphically."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Apply the Bisection method (in GeoGebra or by hand steps you record) to find a root to a set tolerance.","deliverable_notes":"Your iteration table + the root + 1 line on how many steps the tolerance needed."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Apply Newton–Raphson to the same root and compare its speed with bisection.","deliverable_notes":"Your Newton iterations + comparison to bisection + 1 line on why Newton converged faster."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Use a numerical method to solve one real problem you set up (a break-even, an intersection) and interpret the answer.","deliverable_notes":"Your setup + numerical solution + 1 line on the real meaning."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Compare two numerical methods on the same problem for accuracy and effort.","deliverable_notes":"Your comparison table + 1 line on which you'd choose and why."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Roots, Found Numerically","primary":"solve a real root-finding problem by multiple numerical methods in GeoGebra/by hand, compare convergence, and verify the root.","support":"~400 words on numerical vs analytic solving.","llc":"run an iteration live and predict the next."},
      {"option_no":2,"title":"Bisection vs Newton, Measured","primary":"apply bisection and Newton–Raphson to the same equations, record iterations and errors, and characterise when each is better.","support":"~400 words on convergence rates.","llc":"choose and apply a method to a fresh equation live."},
      {"option_no":3,"title":"A Real Problem, Solved Numerically","primary":"model a real situation as an equation with no easy closed form and solve it numerically, interpreting the result.","support":"~400 words on when numerics are necessary.","llc":"re-solve with a changed parameter live."},
      {"option_no":4,"title":"Visual Numerical Analysis","primary":"use GeoGebra to make numerical methods visible (converging intervals, tangent steps) and explain the geometry.","support":"~400 words on seeing convergence.","llc":"demonstrate a method's geometry live."},
      {"option_no":5,"title":"Method Selection, Justified","primary":"build a comparison of numerical methods across problems on accuracy and effort, and produce a selection guide.","support":"~400 words on trade-offs.","llc":"justify a method choice for a fresh problem live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UMAS02'
  and is_latest = true and is_archived = false;

-- ── 26USTDE1 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Define a random variable from a real repeatable situation you can observe (dice, queue, coin), tabulate its distribution from actual trials, and compute the mean by hand.","deliverable_notes":"Your real trial data + distribution + hand-computed expectation + 1 line comparing to the theoretical mean."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Fit a Binomial or Poisson distribution to a real count you collect (e.g. defects, arrivals) by hand and judge the fit.","deliverable_notes":"Your real counts + the fitted distribution + 1 line on how well it fit."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Collect a real dataset (20+ values you gather) and compute mean, median, mode, SD and coefficient of variation by hand.","deliverable_notes":"Your real data (source named) + the five measures + 1 line on what the CV tells you."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Collect paired real data and compute Karl Pearson's correlation by hand; draw the scatter diagram.","deliverable_notes":"Your paired data + the correlation coefficient + scatter plot + 1 line interpreting the strength/direction."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Fit a straight line to your paired data by least squares by hand and predict one value.","deliverable_notes":"Your regression line + a prediction + 1 line on the prediction's reliability."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Statistical Study I Ran","primary":"design, collect (real data you gather), and analyse a genuine statistical study — distribution, central tendency, dispersion, correlation and regression — all computed by hand and honestly interpreted.","support":"~400 words on your data's story and its limits.","llc":"defend a computed value against a 'could this be chance?' challenge."},
      {"option_no":2,"title":"Does This Distribution Fit?","primary":"collect real count data and test whether a Binomial/Poisson model fits by hand, judging the fit honestly.","support":"~400 words on why these models arise.","llc":"fit a distribution to fresh counts live."},
      {"option_no":3,"title":"Correlation From My Own Data","primary":"gather real paired data, compute and visualise the correlation by hand, and reason carefully about correlation vs causation in your case.","support":"~400 words on interpreting correlation.","llc":"compute a correlation for fresh data live."},
      {"option_no":4,"title":"A Line Through the Points","primary":"fit least-squares lines/curves to real data by hand, make a prediction, and assess its reliability.","support":"~400 words on regression and its assumptions.","llc":"fit a line to fresh data live."},
      {"option_no":5,"title":"Central Tendency That's Honest","primary":"on a real skewed dataset you collect, compute all central-tendency and dispersion measures by hand and argue which honestly summarise it.","support":"~400 words on choosing the right measure.","llc":"defend a choice on fresh data live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26USTDE1'
  and is_latest = true and is_archived = false;

-- ── 26USTDE2 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"For a simple estimator on real small data, check unbiasedness/consistency by hand reasoning and computation.","deliverable_notes":"Your estimator + the property check + 1 line on what unbiasedness means practically."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Derive the maximum-likelihood estimate for a Binomial/Poisson parameter from real count data by hand.","deliverable_notes":"Your MLE derivation + the estimate from real data + 1 line on what MLE optimises."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"State a real null and alternative hypothesis about something you can test, and identify the Type I/II errors in context.","deliverable_notes":"Your hypotheses for the real question + the two error meanings in context + 1 line on which error is costlier."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Perform one large-sample test (mean or proportion) on real or realistic data by hand and state the conclusion.","deliverable_notes":"Your test statistic and decision + 1 line on the real conclusion."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Perform a chi-square test of independence on a real 2×2 (or larger) contingency table you build from data.","deliverable_notes":"Your table + chi-square value + decision + 1 line on whether the attributes are associated."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Hypothesis I Actually Tested","primary":"pose a real, testable question, collect data, perform the appropriate significance test by hand, and reach an honest conclusion with its error risks.","support":"~400 words on what the test does and doesn't prove.","llc":"defend your conclusion against a 'what about the assumptions?' challenge."},
      {"option_no":2,"title":"Estimation From Real Data","primary":"derive and compute MLEs for a parameter from real count data by hand, and discuss the estimator's properties.","support":"~400 words on good estimators.","llc":"estimate a parameter from fresh data live."},
      {"option_no":3,"title":"Association or Independence?","primary":"build a real contingency table from data you collect and test independence by chi-square, interpreting the result carefully.","support":"~400 words on categorical association.","llc":"run a chi-square on fresh counts live."},
      {"option_no":4,"title":"Small Samples, Careful Tests","primary":"apply t-tests/F-tests to real small-sample data by hand, respecting the assumptions, and interpret.","support":"~400 words on small-sample inference.","llc":"choose and run a small-sample test live."},
      {"option_no":5,"title":"The Errors Behind the Decision","primary":"for a real testing scenario, analyse Type I/II errors and power concretely, and advise on the decision.","support":"~400 words on the cost of each error.","llc":"reason about errors for a fresh scenario live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26USTDE2'
  and is_latest = true and is_archived = false;

-- ── 26USTDEP01 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"For a real random variable you observe, compute its distribution function and expectation by hand.","deliverable_notes":"Your data + distribution function + expectation + 1 line on the interpretation."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Fit a theoretical distribution (Binomial/Poisson/Normal) to real data and test goodness of fit by hand.","deliverable_notes":"Your fit + goodness-of-fit statistic + 1 line on the verdict."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Compute all central-tendency and dispersion measures for a real dataset by hand.","deliverable_notes":"Your measures + 1 line on which best summarises the data."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Fit a straight line and a second-degree curve to real data by least squares by hand and compare.","deliverable_notes":"Both fits + a comparison + 1 line on which fits better and why."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Compute correlation and both regression equations for real paired data by hand.","deliverable_notes":"Your correlation + two regression lines + 1 line on why the two regression lines differ."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Full Statistical Analysis, by Hand","primary":"take a real dataset you collect and produce a complete hand analysis — distributions, fits, central tendency, correlation, regression — with honest interpretation.","support":"~400 words on the analysis and its limits.","llc":"defend a result against a challenge live."},
      {"option_no":2,"title":"Goodness of Fit, Judged","primary":"fit theoretical distributions to real data and test the fit rigorously by hand, deciding honestly whether the model holds.","support":"~400 words on model fitting.","llc":"judge a fit on fresh data live."},
      {"option_no":3,"title":"Two Regression Lines, One Truth","primary":"compute both regression lines and correlation for real data by hand, explain why they differ, and predict with the right one.","support":"~400 words on regression direction.","llc":"compute a regression live."},
      {"option_no":4,"title":"Curve Fitting, Compared","primary":"fit linear and quadratic models to real data by hand, compare residuals, and choose.","support":"~400 words on model choice.","llc":"fit a curve to fresh data live."},
      {"option_no":5,"title":"Summarising Real Data Honestly","primary":"compute the full battery of descriptive statistics for a real dataset by hand and argue what honestly represents it.","support":"~400 words on descriptive statistics.","llc":"summarise fresh data live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26USTDEP01'
  and is_latest = true and is_archived = false;

-- ── 26USTDEP02 · b-sc-mathematics ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"For a real small dataset, examine an estimator's consistency/unbiasedness/efficiency by hand.","deliverable_notes":"Your estimator analysis + 1 line on what makes it 'good'."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Compute a maximum-likelihood estimate and a confidence interval for a parameter from real data by hand.","deliverable_notes":"Your MLE + interval + 1 line on what the interval means."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Set up and carry out one test of significance on real data by hand, stating the critical region.","deliverable_notes":"Your test + decision + 1 line on the meaning of the critical region."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Perform a large-sample test of means/proportions on real data by hand.","deliverable_notes":"Your test statistic + conclusion + 1 line on the assumption you relied on."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Perform a paired t-test / F-test / chi-square on real data you collect by hand.","deliverable_notes":"Your chosen small-sample test + result + 1 line on why that test fit the data."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Inference on Data I Collected","primary":"collect real data and carry out estimation and hypothesis testing by hand end-to-end, with honest conclusions and error discussion.","support":"~400 words on inference from your own data.","llc":"defend a test choice and conclusion live."},
      {"option_no":2,"title":"Confidence, Quantified","primary":"compute point and interval estimates for real-data parameters by hand and explain what the confidence level really means.","support":"~400 words on interval estimation.","llc":"build an interval for fresh data live."},
      {"option_no":3,"title":"The Right Test for the Data","primary":"across several real small datasets, select and correctly apply the appropriate test (t/F/chi-square) by hand, justifying each choice.","support":"~400 words on test selection.","llc":"choose and run a test for fresh data live."},
      {"option_no":4,"title":"Paired Differences","primary":"design a real before/after comparison, run a paired t-test by hand, and interpret honestly.","support":"~400 words on paired designs.","llc":"run a paired test on fresh data live."},
      {"option_no":5,"title":"Estimators, Compared","primary":"examine competing estimators for a parameter on real data by hand for bias/efficiency and recommend one.","support":"~400 words on estimator quality.","llc":"reason about an estimator live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26USTDEP02'
  and is_latest = true and is_archived = false;

-- ── 26UZOC01 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Collect a real drop of pond/puddle water from a named local place, observe it (hand lens or microscope), and make a labelled drawing of one protozoan or microscopic invertebrate you actually see.","deliverable_notes":"Your labelled drawing from the real sample + the place named + 1 line on how it moves/feeds."},
      {"sno":2,"unit":"II","finks_dimension":"Foundational Knowledge","task":"Find a real sponge or a colonial/coelenterate structure (a bath sponge, or Hydra/coral image from a specimen you access) and identify its body-plan features by direct observation.","deliverable_notes":"Your sketch/photo of the real specimen + labelled features (ostia/spicules or polyp) + 1 line on its level of organisation."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Observe a real flatworm/roundworm example you can access safely (e.g. a preserved specimen, or earthworm gut parasites in a dissection you witness) and note one adaptation to its life.","deliverable_notes":"Your observation/drawing + the adaptation named + 1 line on how it suits parasitic or free-living life."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Collect and observe a real earthworm from a named local soil; make a labelled external drawing showing segmentation, clitellum and setae.","deliverable_notes":"Your labelled earthworm drawing from the real specimen + place named + 1 line on why metamerism matters."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Build a comparative table of the invertebrate groups you observed this course, ranking them by one real feature (symmetry, body cavity, or organisation) using your OWN observations.","deliverable_notes":"Your comparison table built from your own specimens + 1 line on the evolutionary trend it shows."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Invertebrate I Studied for Real","primary":"choose one locally-available invertebrate (earthworm, snail, insect, pond organism), study it through your own repeated observation and labelled drawings, and build an account of its structure and adaptations.","support":"~400 words on what direct observation taught you beyond the textbook.","llc":"present your drawings and answer a live 'how is it adapted to...?' question."},
      {"option_no":2,"title":"The Pond in a Drop","primary":"sample water from named local ponds/puddles over time, document the microscopic invertebrate life you actually find with labelled drawings, and compare the sites.","support":"~400 words on microhabitats and organisation levels.","llc":"show your drawings and identify a fresh organism's group."},
      {"option_no":3,"title":"From Simple to Complex","primary":"assemble a specimen-based comparison across the invertebrate phyla you can access, ranking them by real structural features you observed, and argue the evolutionary trend.","support":"~400 words on grades of organisation.","llc":"place a fresh specimen in the sequence and justify."},
      {"option_no":4,"title":"A Drawing That Proves I Looked","primary":"produce a portfolio of your own labelled drawings of at least four real invertebrate specimens, each with a scale and one observed adaptation.","support":"~400 words on scientific drawing as a way of seeing.","llc":"defend one drawing's accuracy when questioned."},
      {"option_no":5,"title":"Adaptation in a Local Animal","primary":"pick one real local invertebrate and investigate one adaptation (feeding, movement, defence) by observing its actual behaviour/structure, not just reading.","support":"~400 words connecting form to function in your specimen.","llc":"present the evidence and answer a challenge."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOC01'
  and is_latest = true and is_archived = false;

-- ── 26UZOC02 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Catch (and release) or find a real arthropod near you (insect, spider, crab, millipede — name it and the place); make a labelled drawing showing its body divisions and appendages.","deliverable_notes":"Your labelled drawing from the real animal + place named + 1 line on how many body regions and legs distinguish its group."},
      {"sno":2,"unit":"II","finks_dimension":"Foundational Knowledge","task":"Examine a real mollusc shell you collect (snail, mussel, from a named place or market) and describe its structure and the animal's likely mode of life.","deliverable_notes":"Your photo/sketch of the real shell + structural notes + 1 line inferring how the animal lived."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Observe a real insect's mouthparts or wings (a housefly, mosquito, butterfly you find) under a lens and relate the structure to how it feeds/flies.","deliverable_notes":"Your drawing of the real mouthparts/wings + 1 line linking structure to feeding or flight."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"For one real echinoderm or minor-phylum specimen you can access (a starfish image/specimen, from a named source), note its symmetry and one unique feature.","deliverable_notes":"Your observation + the symmetry named + 1 line on the water-vascular or unique system."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Identify one real economically or medically important invertebrate in your area (a crop pest, a disease vector, a seafood mollusc) and its human impact.","deliverable_notes":"The named animal + its real local impact + 1 line on how the impact is managed."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Arthropods Around Me","primary":"survey the real arthropods of a named local habitat (garden, field, home) over time, document them with labelled drawings and a simple key you build, and note their roles.","support":"~400 words on why arthropods dominate.","llc":"identify a fresh specimen to group live using your key."},
      {"option_no":2,"title":"A Shell's Story","primary":"collect real mollusc shells from named local sources, reconstruct each animal's structure and mode of life from the shell, and compare the diversity.","support":"~400 words on molluscan body plans.","llc":"infer an unknown shell's owner's life live."},
      {"option_no":3,"title":"Form Follows Feeding","primary":"investigate how mouthpart/appendage structure predicts feeding across several real insects you observe, with drawings and evidence.","support":"~400 words on structure–function.","llc":"predict a fresh insect's diet from its mouthparts live."},
      {"option_no":4,"title":"A Pest or Vector, Investigated","primary":"study one real local pest or disease-vector invertebrate — its biology, its human impact, and how it is managed — through observation and a consented interview (farmer/health worker).","support":"~400 words on the biology behind the problem.","llc":"present and answer a management question."},
      {"option_no":5,"title":"Invertebrate Diversity, Documented","primary":"build a specimen-based record of the invertebrate diversity of one named place, with your own drawings and classification, honest about what you could and couldn't identify.","support":"~400 words on biodiversity in a familiar place.","llc":"defend one classification when challenged."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOC02'
  and is_latest = true and is_archived = false;

-- ── 26UZOC03 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Identify the chordate features in a real fish you buy at a named local market (notochord region, gills, fins) and make a labelled external drawing.","deliverable_notes":"Your labelled fish drawing from the real specimen + market named + 1 line on a chordate hallmark you can point to."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Observe a real amphibian or reptile in your area (frog, lizard, gecko — name it and place) and note two adaptations to its habitat.","deliverable_notes":"Your observation/photo + the two adaptations + 1 line on how it differs from a fish."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Watch a real local bird for 15 minutes (named species and place) and record how its beak and feet suit its feeding and habitat.","deliverable_notes":"Your dated observation notes + beak/feet description + 1 line linking form to niche."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Compare one real mammal you observe (a pet, cattle, a squirrel) with a bird you observed, on two features (covering, limbs, teeth) from your own observation.","deliverable_notes":"Your comparison from real observation + 1 line on a key mammalian feature you confirmed."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Build your own labelled evolutionary sequence of the vertebrate classes using one real specimen/observation you made for each class you could access.","deliverable_notes":"Your specimen-anchored vertebrate sequence + 1 line on the trend (e.g. towards terrestrial life) it shows."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Vertebrate I Know Well","primary":"choose one locally-accessible vertebrate (a market fish, a garden bird, a pet), study it through your own repeated observation and drawings, and build an account of its chordate features and adaptations.","support":"~400 words on direct observation vs textbook.","llc":"present and answer an adaptation question live."},
      {"option_no":2,"title":"Beaks, Feet and Niches","primary":"observe several real local birds, document how beak and foot structure predicts diet and habitat, and build an evidence-based field note.","support":"~400 words on adaptive radiation you can see locally.","llc":"predict a fresh bird's diet from its features live."},
      {"option_no":3,"title":"The Vertebrate Story, in Real Specimens","primary":"assemble a specimen/observation-based journey across the vertebrate classes you can access, drawing the trend towards complexity/terrestrial life from your own evidence.","support":"~400 words on vertebrate evolution grounded in what you saw.","llc":"place a fresh animal in the sequence."},
      {"option_no":4,"title":"From Water to Land","primary":"contrast a real fish, amphibian and reptile/bird you observe on the specific adaptations that mark the move to land (respiration, skin, limbs, eggs).","support":"~400 words on the water-to-land transition.","llc":"defend one adaptation claim when challenged."},
      {"option_no":5,"title":"A Local Vertebrate Census","primary":"record the vertebrates of one named local area over time (birds, reptiles, mammals, fish), classify them, and reflect on the diversity and any conservation concern.","support":"~400 words on local vertebrate biodiversity.","llc":"present your census and answer a classification question."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOC03'
  and is_latest = true and is_archived = false;

-- ── 26UZOCPO1 · b-sc-zoology (kit code 26UZOCP01 → live 26UZOCPO1) ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"For one 'major' invertebrate practical you perform (dissection/mount you actually do), record the procedure and make a labelled drawing of what you exposed.","deliverable_notes":"Your labelled drawing from the actual practical (signed/dated) + 1 line on the structure you found hardest to expose."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Prepare or examine one 'minor' practical mount (a permanent slide, a part) and record its identifying features.","deliverable_notes":"Your drawing/notes of the real mount + the features that identify it + 1 line on its function."},
      {"sno":3,"unit":"III","finks_dimension":"Foundational Knowledge","task":"Identify five 'spotter' specimens in your real lab collection by their diagnostic features, in your own words.","deliverable_notes":"Your five spotter IDs with the ONE diagnostic feature each + 1 line on the one you nearly got wrong."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Complete the extension activity — visit a real animal house or museum (named) and submit observations of two specimens not in your syllabus.","deliverable_notes":"Your visit report (place named, dated) + two specimen observations + 1 line on something new you learned."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"Write the correct, ethical handling and disposal practice for the biological material used in your invertebrate lab.","deliverable_notes":"Your handling/disposal note grounded in the real lab + 1 line on the ethical principle behind it."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"My Invertebrate Lab Record","primary":"assemble a rigorous practical record of your invertebrate dissections/mounts and spotters with your own labelled drawings and diagnostic notes, and select the specimen you can most confidently defend.","support":"~400 words on what hands-on dissection taught you.","llc":"identify and defend a spotter live."},
      {"option_no":2,"title":"The Museum Report That Went Deeper","primary":"turn the animal-house/museum visit into a real study of several specimens (named, photographed where allowed), connecting them to the invertebrate groups of the course.","support":"~400 words on what museums preserve that books can't.","llc":"present your specimens and answer a classification question."},
      {"option_no":3,"title":"A Spotter Key I Can Use","primary":"build a practical spotter-identification key from your real lab collection, validated by testing it on specimens, honest about ambiguous ones.","support":"~400 words on diagnostic features.","llc":"key out a fresh spotter live."},
      {"option_no":4,"title":"Drawing to Understand","primary":"produce a portfolio of accurate, scaled, labelled drawings from your own invertebrate practicals, each showing one functional structure.","support":"~400 words on drawing as scientific observation.","llc":"defend a drawing's accuracy when questioned."},
      {"option_no":5,"title":"Ethics at the Dissection Table","primary":"develop a real ethical-handling and specimen-use protocol for the invertebrate lab, grounded in your practice and a considered position on specimen use.","support":"~400 words on responsibility to living material.","llc":"present and defend your protocol."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOCPO1'
  and is_latest = true and is_archived = false;

-- ── 26UZOCP02 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"For one chordate 'major' practical you perform (e.g. a fish/dissection or study you actually do), record the procedure and make a labelled drawing of a system you exposed.","deliverable_notes":"Your labelled drawing from the actual practical (signed) + 1 line on the system's function."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Examine one 'minor' practical mount or bone/part and record its identifying and functional features.","deliverable_notes":"Your notes/drawing of the real part + features + 1 line on what it does for the animal."},
      {"sno":3,"unit":"III","finks_dimension":"Foundational Knowledge","task":"Identify five chordate 'spotter' specimens in your lab by diagnostic features, in your own words.","deliverable_notes":"Your five spotter IDs with the ONE diagnostic feature each + 1 line on a confusing pair."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Complete the extension visit (animal house/museum, named) and report two chordate specimens, noting one adaptation each.","deliverable_notes":"Your dated visit report + two specimens + adaptations + 1 line on something new."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"State the correct ethical sourcing/handling of chordate specimens in your lab and one alternative (model/image) where dissection is avoidable.","deliverable_notes":"Your handling note + one named alternative + 1 line on the ethical trade-off."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"My Chordate Lab Record","primary":"assemble a rigorous chordate practical record with your own labelled drawings, systems and spotters, and select the specimen/system you can best defend.","support":"~400 words on what dissection/observation taught you.","llc":"identify and defend a spotter or system live."},
      {"option_no":2,"title":"A System, Traced by Hand","primary":"study one organ system in a real chordate specimen you work with, drawing and explaining its parts and function from direct observation.","support":"~400 words on structure–function in that system.","llc":"reconstruct the system at the board when questioned."},
      {"option_no":3,"title":"The Chordate Spotter Key","primary":"build and test a spotter-identification key for your chordate collection, honest about hard cases.","support":"~400 words on diagnostic features across classes.","llc":"key a fresh spotter live."},
      {"option_no":4,"title":"Ethical Zoology","primary":"develop a real, considered protocol for ethical specimen use in the chordate lab, weighing learning value against alternatives (models, images, virtual).","support":"~400 words on responsibility and modern alternatives.","llc":"defend your position against a challenge."},
      {"option_no":5,"title":"Museum to Class","primary":"deepen the museum/animal-house visit into a real comparative study of chordate specimens, tying each to the course's classes and adaptations.","support":"~400 words on what preserved specimens reveal.","llc":"present and answer a comparison question."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOCP02'
  and is_latest = true and is_archived = false;

-- ── 26UZOFC1 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Visit or contact one real economically-important animal enterprise near you (a poultry farm, fishery, apiary, silk unit — named, with consent) and record what it produces and how.","deliverable_notes":"The named enterprise + what it produces + 1 line on the animal's economic value."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Identify one real crop or stored-product pest in your area (named), observe the damage it causes, and note one control method actually used.","deliverable_notes":"The named pest + photo/observation of real damage + the control method + 1 line on its effectiveness."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Study one real beneficial animal (earthworm for compost, honeybee for pollination, fish for food) in action locally and quantify one benefit you can observe.","deliverable_notes":"The named animal + your observed/estimated benefit + 1 line on why it matters economically."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Interview one real practitioner (farmer, fisher, beekeeper — named, consented) about the animals central to their livelihood and one challenge they face.","deliverable_notes":"3–4 quoted sentences from the named person + 1 line on the biological/economic challenge they described."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"For one economic animal you studied, note one sustainability or welfare issue and a realistic improvement.","deliverable_notes":"The animal + the issue + a realistic improvement + 1 line on the trade-off involved."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Enterprise Built on an Animal","primary":"study one real local animal-based enterprise (apiculture, sericulture, fishery, poultry, vermiculture) through a consented visit/interview, documenting the biology, the process, the economics and one challenge.","support":"~400 words on zoology as livelihood.","llc":"present the enterprise and answer a biology-meets-economics question."},
      {"option_no":2,"title":"The Pest and Its Price","primary":"investigate one real local pest — its biology, the damage and cost it causes, and the control methods actually used — with observation and a farmer interview.","support":"~400 words on integrated pest management realities.","llc":"propose and defend a control approach live."},
      {"option_no":3,"title":"A Beneficial Animal, Quantified","primary":"pick one beneficial animal (bee, earthworm, fish, predator) and quantify a real local benefit it provides through your own observation/measurement.","support":"~400 words on ecosystem/economic services.","llc":"defend your estimate when questioned."},
      {"option_no":4,"title":"Voices from a Livelihood","primary":"through consented interviews with real practitioners, document how an animal-based livelihood works and the biological knowledge it depends on.","support":"~400 words on indigenous/practitioner knowledge.","llc":"present the voices and connect them to zoology."},
      {"option_no":5,"title":"Sustainable Economic Zoology","primary":"assess one economic-animal practice for sustainability and welfare using real local evidence, and propose a realistic improvement.","support":"~400 words on balancing yield, welfare and sustainability.","llc":"defend your proposal against a cost objection."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOFC1'
  and is_latest = true and is_archived = false;

-- ── 26UZOA01 · b-sc-zoology (kit code 26UZOGE01 → live 26UZOA01) ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Observe and make a labelled drawing of one real animal you can access (named, local) showing the level of organisation of its body.","deliverable_notes":"Your labelled drawing from the real animal + place named + 1 line on its grade of organisation."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Document one real animal adaptation you can observe (camouflage, feeding, movement) in a named local species, with evidence.","deliverable_notes":"Your photo/notes of the real adaptation + 1 line on the survival advantage it gives."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Record one real animal's response to a stimulus you can safely observe (light, food, sound) and describe the behaviour.","deliverable_notes":"Your dated observation of the real response + 1 line on whether it is innate or learned."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Compare two named local animals on one biological feature (diet, habitat, reproduction) from your own observation.","deliverable_notes":"Your comparison from real observation + 1 line on why the difference exists."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Identify one animal important to people in your locality and describe its ecological or economic role.","deliverable_notes":"The named animal + its real role + 1 line on what would happen locally without it."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Animal, Truly Observed","primary":"choose one accessible local animal and study it deeply through your own repeated observation, drawings and notes — structure, behaviour, adaptations, role.","support":"~400 words on what patient observation revealed.","llc":"present and answer a live question about its biology."},
      {"option_no":2,"title":"Adaptation I Can Point To","primary":"document several real adaptations in named local animals with evidence, building an illustrated account of form-meets-function.","support":"~400 words on natural selection made visible.","llc":"explain a fresh animal's adaptation live."},
      {"option_no":3,"title":"Behaviour in the Wild (Nearby)","primary":"conduct a small real behaviour study on a local animal (feeding, territory, activity timing) with dated observations and a simple analysis.","support":"~400 words on watching behaviour scientifically.","llc":"present your data and predict a behaviour."},
      {"option_no":4,"title":"Two Animals, One Question","primary":"pose a real comparative question about two local animals and answer it from your own observations and evidence.","support":"~400 words on comparative biology.","llc":"defend your comparison when a variable is questioned."},
      {"option_no":5,"title":"An Animal My Locality Depends On","primary":"investigate one animal ecologically/economically important to your community, through observation and a consented conversation, and assess its role.","support":"~400 words on animals and human life.","llc":"present and answer 'what if it disappeared?'"}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOA01'
  and is_latest = true and is_archived = false;

-- ── 26UZOGE02 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Investigate one real physiological process in an animal you can observe (breathing rate, heartbeat via a pet, response to temperature) and record measurements.","deliverable_notes":"Your measurements of the real process (animal named) + 1 line on the system responsible."},
      {"sno":2,"unit":"II","finks_dimension":"Foundational Knowledge","task":"Observe one real reproductive or developmental stage you can access (eggs, tadpoles, larvae, a life cycle in your area) and document it.","deliverable_notes":"Your photo/drawing of the real stage + the animal + 1 line on where it sits in the life cycle."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Study one real ecological interaction near you (predator–prey, host–parasite, mutualism) and describe the roles of both partners.","deliverable_notes":"The named interaction and place + the two roles + 1 line on the benefit/cost to each."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Build a simple food chain/web from animals and plants you actually observe in one named local habitat.","deliverable_notes":"Your observation-based food web + 1 line on what happens if one link is removed."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Identify one real environmental pressure on animal life in your area (pollution, habitat loss, plastic) and one thing being or that could be done.","deliverable_notes":"The named pressure with evidence + a real/possible action + 1 line on who must act."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Life Cycle I Followed","primary":"track a real animal life cycle or developmental sequence you can access (frog, butterfly, mosquito, fish) over time with dated documentation.","support":"~400 words on development observed vs described.","llc":"present your sequence and predict a next stage."},
      {"option_no":2,"title":"An Interaction in the Field","primary":"study one real ecological interaction (predation, parasitism, mutualism) in a named local habitat with your own evidence, mapping the roles and outcomes.","support":"~400 words on interactions structuring communities.","llc":"analyse a fresh interaction live."},
      {"option_no":3,"title":"The Web Where I Live","primary":"construct a real food web for one named local habitat from your own observations, and analyse its vulnerability to the loss of one species.","support":"~400 words on ecological connectivity.","llc":"defend a link when challenged."},
      {"option_no":4,"title":"Physiology I Measured","primary":"measure one physiological variable in a real animal under different conditions you set, and interpret the response.","support":"~400 words on how physiology responds to environment.","llc":"predict a response to a new condition live."},
      {"option_no":5,"title":"Pressure on Local Wildlife","primary":"investigate a real environmental threat to animals in your area with evidence, assess its impact, and propose a realistic local response.","support":"~400 words on conservation at the local scale.","llc":"defend your proposal against a feasibility objection."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOGE02'
  and is_latest = true and is_archived = false;

-- ── 26UZOAP01 · b-sc-zoology (kit code 26UZOGEP01 → live 26UZOAP01) ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities anchored to the lab experiments, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"For one 'major' GE practical you perform, record the procedure and make a labelled drawing of what you observed.","deliverable_notes":"Your labelled drawing from the actual practical (signed) + 1 line on the key structure."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Examine one 'minor' practical mount/preparation and note its identifying features.","deliverable_notes":"Your notes/drawing of the real preparation + 1 line on its function."},
      {"sno":3,"unit":"III","finks_dimension":"Foundational Knowledge","task":"Identify five 'spotter' specimens in the GE collection by their diagnostic features in your own words.","deliverable_notes":"Your five spotter IDs with one diagnostic feature each + 1 line on a hard pair."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Complete the extension activity with a real observation (field/museum/animal-house, named) and report one specimen.","deliverable_notes":"Your dated report + one specimen observation + 1 line on something learned."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"State the correct safe and ethical handling for the material used in your GE zoology practical.","deliverable_notes":"Your handling note grounded in the real lab + 1 line on the principle behind it."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"My GE Zoology Practical Record","primary":"assemble a careful practical record with your own labelled drawings, preparations and spotters, and select the one you can best defend.","support":"~400 words on hands-on zoology.","llc":"identify and defend a spotter live."},
      {"option_no":2,"title":"Drawing What I Observed","primary":"produce a portfolio of accurate, scaled, labelled drawings from your own GE practicals.","support":"~400 words on drawing as observation.","llc":"defend a drawing's accuracy live."},
      {"option_no":3,"title":"A Spotter Key of My Own","primary":"build and test a spotter key from the real GE collection, honest about ambiguous specimens.","support":"~400 words on diagnostic features.","llc":"key a fresh spotter live."},
      {"option_no":4,"title":"Beyond the Lab Bench","primary":"deepen the extension activity into a real field/museum study of several specimens tied to the course.","support":"~400 words on learning outside the lab.","llc":"present and answer a question on a specimen."},
      {"option_no":5,"title":"Responsible Practical Work","primary":"develop an ethical and safe handling protocol for the GE zoology lab grounded in your practice.","support":"~400 words on lab responsibility.","llc":"present and defend your protocol."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOAP01'
  and is_latest = true and is_archived = false;

-- ── 26UZONM1 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Observe how one real local animal responds to its environment (temperature, light, shelter) over a few sessions and record the pattern.","deliverable_notes":"Your dated observations of the named animal + 1 line on the environmental cue driving the behaviour."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Document one complex behaviour in a real animal you can watch (nest-building, foraging strategy, communication) with evidence.","deliverable_notes":"Your notes/photo of the real complex behaviour + 1 line on what makes it 'complex'."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Observe one real social behaviour (in ants, birds, dogs, cattle you can access) and interpret it in terms of a possible survival/evolutionary benefit.","deliverable_notes":"Your observation of the real social behaviour + 1 line on its adaptive value."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Compare a clearly innate behaviour with a clearly learned one in a real animal you observe, and justify the classification.","deliverable_notes":"Your two real examples + classification + 1 line on how you told them apart."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Track one real biological rhythm (an animal's daily activity, a plant's leaf movement, your own sleep) over several days and plot it.","deliverable_notes":"Your dated rhythm data + a simple plot + 1 line on the period and its likely cue."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Ethogram I Built","primary":"choose one accessible animal and build a real ethogram — a catalogue of its behaviours from your own timed observations — then analyse one behaviour's function.","support":"~400 words on watching behaviour scientifically (sampling, bias).","llc":"present your ethogram and interpret a behaviour live."},
      {"option_no":2,"title":"Innate or Learned?","primary":"design a simple, ethical observation to distinguish innate from learned behaviour in a real animal, gather evidence, and defend your conclusion.","support":"~400 words on the nature–nurture question in behaviour.","llc":"classify a fresh behaviour with reasoning live."},
      {"option_no":3,"title":"The Rhythm of a Living Thing","primary":"track a biological rhythm (activity, feeding, sleep) in a real subject over at least a week, plot it, and identify its period and likely zeitgeber.","support":"~400 words on chronobiology from your own data.","llc":"predict the rhythm under a changed cue live."},
      {"option_no":4,"title":"Social Life, Observed","primary":"study a real social behaviour (dominance, cooperation, communication) in a group of animals you can watch, documenting it and arguing its adaptive value.","support":"~400 words on why sociality evolves.","llc":"interpret a fresh social interaction live."},
      {"option_no":5,"title":"Behaviour Meets Environment","primary":"investigate how one environmental factor changes a real animal's behaviour through your own repeated observation under varying conditions.","support":"~400 words on behaviour as adaptation.","llc":"predict a behavioural response to a new condition live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZONM1'
  and is_latest = true and is_archived = false;

-- ── 26UZONM2 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Find and document a real mulberry plant or a silk-rearing setup near you (named place); if none, interview someone who has seen sericulture and record what they describe.","deliverable_notes":"Your photo/notes of the real mulberry/rearing OR the named person's account + 1 line on the food-plant link."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Study the real life cycle of the silkworm (from a rearing unit, a school project, or documented local practice) and record the stages and their durations.","deliverable_notes":"Your stage-by-stage record (sourced/observed) + 1 line on the stage that produces silk."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Examine a real cocoon or silk thread (buy or source one) and describe its structure and how silk is drawn from it.","deliverable_notes":"Your photo/notes of the real cocoon/thread + 1 line on the reeling idea."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Estimate the simple economics of one real sericulture cycle (cost of eggs/leaves vs cocoon value) from local figures you gather.","deliverable_notes":"Your rough cost–return figures (source named) + 1 line on whether it is profitable and why."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Interview one real person involved in or knowledgeable about sericulture (farmer, extension officer, seller) about one challenge in the trade.","deliverable_notes":"3–4 quoted sentences from the named person + 1 line on the biological/market challenge."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Silk from Start to Thread","primary":"build a real, evidence-based account of one sericulture cycle — mulberry, silkworm life cycle, cocoon, reeling — from a consented visit/interview and real materials (leaf, cocoon, thread) you source.","support":"~400 words on biology serving an ancient industry.","llc":"present your materials and answer a life-cycle question live."},
      {"option_no":2,"title":"The Economics of a Cocoon","primary":"work out the real economics of a local sericulture cycle from figures you gather, and assess its viability for a small farmer.","support":"~400 words on the biology–economics link.","llc":"defend your numbers when a cost changes."},
      {"option_no":3,"title":"The Silkworm's Life, Documented","primary":"document the silkworm life cycle stage by stage from real observation or a rearing unit, with timings and the silk-producing stage explained.","support":"~400 words on metamorphosis and silk.","llc":"place a stage in the cycle live."},
      {"option_no":4,"title":"Voices from Sericulture","primary":"through consented interviews, capture how real people practise sericulture and the knowledge and challenges involved.","support":"~400 words on practitioner knowledge.","llc":"present the voices and connect to the biology."},
      {"option_no":5,"title":"From Leaf to Livelihood","primary":"trace the full chain from mulberry leaf to marketable silk using real local evidence, identifying where biology determines quality and value.","support":"~400 words on the value chain.","llc":"answer where in the chain a problem would hurt most."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZONM2'
  and is_latest = true and is_archived = false;

-- ── 26UZONM3 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Identify one real protected area, sanctuary or even a local green space near you (named) and record what wildlife it supports and one threat to it.","deliverable_notes":"The named place + wildlife it supports + 1 real threat + 1 line on why the area matters."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Document one real wild species in your locality (bird, reptile, mammal) and assess its status (common/declining) from your observation and a reliable source.","deliverable_notes":"The named species + your status assessment + 1 line on the evidence."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Investigate one real human–wildlife conflict or conservation issue in your region (crop raiding, roadkill, poaching, habitat loss) with evidence.","deliverable_notes":"The named issue with real evidence + 1 line on who is affected."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Study one real conservation measure in action (a plantation, a ban, a community effort) and assess whether it is working.","deliverable_notes":"The named measure + your honest assessment + 1 line on one improvement."},
      {"sno":5,"unit":"V","finks_dimension":"Caring","task":"Design one realistic conservation action you could actually take or promote locally, and identify who must be involved.","deliverable_notes":"Your action + the people/bodies needed + 1 line on the first step."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Local Conservation Study","primary":"study wildlife and its threats in one real named local area through your own observation, records and a consented conversation, and produce an honest conservation assessment.","support":"~400 words on conservation where you live.","llc":"present findings and defend a recommendation live."},
      {"option_no":2,"title":"A Species Worth Saving","primary":"choose one real local species under pressure, document its status and threats with evidence, and build a realistic conservation case.","support":"~400 words on the biology behind its decline.","llc":"defend your case against a development-priority objection."},
      {"option_no":3,"title":"Human vs Wildlife","primary":"investigate a real human–wildlife conflict in your region through evidence and interviews, and propose a fair, workable resolution.","support":"~400 words on coexistence.","llc":"defend your resolution when both sides' interests are raised live."},
      {"option_no":4,"title":"Does This Measure Work?","primary":"evaluate a real conservation measure near you against evidence of outcomes, and recommend keep/change/stop.","support":"~400 words on evidence-based conservation.","llc":"defend your verdict when questioned."},
      {"option_no":5,"title":"An Action I Can Lead","primary":"design and, if possible, begin a real small conservation action locally (awareness, cleanup, planting, monitoring), documenting the start.","support":"~400 words on individual and community action.","llc":"present the action and answer 'how would you scale it?'"}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZONM3'
  and is_latest = true and is_archived = false;

-- ── 26UZONM4 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Observe real honeybees at work (on flowers, at a named place) for 15 minutes and record what they do; identify the caste if you can.","deliverable_notes":"Your dated observation of real bees + place + 1 line on the job you saw them doing."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Visit or contact a real apiary or beekeeper near you (named, consented); if none, source real honey and document its label/origin.","deliverable_notes":"The named apiary/beekeeper account OR the real honey's origin + 1 line on hive management or honey type."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Study the real pollination service of bees by observing bee visits to a flowering plant and noting the plants that depend on them.","deliverable_notes":"Your observation of bee–flower visits (named plant/place) + 1 line on the crop/plant value of pollination."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Examine a real honey or bee product (honey, wax, propolis) and describe one physical property and one use.","deliverable_notes":"The named product + one property you observe + 1 line on a real use."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Estimate the simple economics of one real hive (cost vs honey/pollination value) from figures you gather locally.","deliverable_notes":"Your rough figures (source named) + 1 line on whether beekeeping pays and how."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Bees, Watched and Understood","primary":"study honeybees through real observation (foraging, castes if visible) and a consented beekeeper interview, building an account of colony life and management.","support":"~400 words on social-insect biology seen firsthand.","llc":"present observations and answer a colony-biology question live."},
      {"option_no":2,"title":"The Pollination Service","primary":"document, through your own observations, how bees pollinate real local plants/crops and estimate the value of that service.","support":"~400 words on why pollinators matter economically and ecologically.","llc":"defend your value estimate live."},
      {"option_no":3,"title":"From Hive to Honey","primary":"trace the real chain from hive to honey product through a beekeeper visit and real bee products you examine, explaining the biology at each step.","support":"~400 words on the biology behind the product.","llc":"answer a question on hive management live."},
      {"option_no":4,"title":"The Economics of Beekeeping","primary":"work out the real economics of a local hive/apiary from gathered figures and assess viability for a small keeper.","support":"~400 words on biology meeting livelihood.","llc":"defend your numbers when a cost changes."},
      {"option_no":5,"title":"A Beekeeper's Knowledge","primary":"through consented interviews, capture the practical biological knowledge real beekeepers use and one challenge (disease, absconding, market).","support":"~400 words on practitioner expertise.","llc":"connect a practitioner practice to the underlying biology live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZONM4'
  and is_latest = true and is_archived = false;

-- ── 26UZOS01 · b-sc-zoology ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Study one real marine or brackish organism you can access (from a fish market, an aquarium, a coast visit — named) and make a labelled drawing.","deliverable_notes":"Your labelled drawing of the real marine organism + source named + 1 line on one marine adaptation."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Examine real seafood at a named market and identify which are fish, molluscs, crustaceans; note one feature of each group.","deliverable_notes":"Your market survey (named) with the group of 3+ items + one feature each + 1 line on the most abundant group."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Describe one real marine food chain from primary producers (plankton/algae) to a fish you can name from your market/coast observation.","deliverable_notes":"Your marine food chain grounded in real named organisms + 1 line on the plankton base."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Investigate one real marine issue affecting your region or country (overfishing, plastic, coral/mangrove loss) with a sourced fact.","deliverable_notes":"The named issue + a sourced fact + 1 line on its impact on people or wildlife."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Interview one real person connected to the sea (a fish seller, fisher, coastal resident — named, consented) about a change they have seen in marine life or catch.","deliverable_notes":"3–4 quoted sentences from the named person + 1 line on the marine-biology reason behind the change."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Sea at My Market","primary":"study marine biodiversity through a real named fish market — identify, classify and draw the organisms, and reconstruct the food chains and habitats they come from.","support":"~400 words on marine life reaching inland.","llc":"identify and place a market specimen live."},
      {"option_no":2,"title":"A Marine Food Web","primary":"build a real marine food web from named organisms you can observe or source, from plankton to top fish, and analyse the effect of removing one link (e.g. overfishing).","support":"~400 words on marine trophic structure.","llc":"defend a link when challenged."},
      {"option_no":3,"title":"A Marine Organism, Drawn and Understood","primary":"study one real marine/brackish organism in depth through observation and drawing, explaining its adaptations to the marine environment.","support":"~400 words on life in seawater (salt, pressure, buoyancy).","llc":"present and answer an adaptation question live."},
      {"option_no":4,"title":"The Threatened Ocean","primary":"investigate one real marine conservation issue with sourced evidence and, where possible, a coastal/fisher interview, and propose a realistic response.","support":"~400 words on marine conservation.","llc":"defend your response against a livelihood objection."},
      {"option_no":5,"title":"Voices from the Coast","primary":"through consented interviews with people connected to the sea, document real observed changes in marine life or catch and interpret them biologically.","support":"~400 words on local marine knowledge.","llc":"present the voices and connect them to marine biology."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UZOS01'
  and is_latest = true and is_archived = false;

-- ── 26UCMC01 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Record five real transactions from your own life or a family shop (with consent) as journal entries by hand and post them to ledger accounts.","deliverable_notes":"Your five real transactions journalised + posted to ledgers + 1 line on the double-entry logic of one."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Prepare a simple Trading and Profit & Loss account and Balance Sheet by hand from a small realistic trial balance (or a real micro-business's figures).","deliverable_notes":"Your final accounts + 1 line on what the net profit and one adjustment revealed."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"For a real club/association or hostel mess you know, prepare a Receipts & Payments and Income & Expenditure account from actual/realistic figures.","deliverable_notes":"Your two statements + 1 line on the difference between them for that body."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Prepare a Bank Reconciliation Statement by hand reconciling a real (or realistic) passbook and cash-book difference; identify the causes.","deliverable_notes":"Your BRS + the causes of difference + 1 line on why reconciliation matters."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Compute depreciation on one real asset (a family vehicle/appliance) by straight-line and WDV and compare.","deliverable_notes":"The real asset + both depreciation schedules + 1 line on which suits it and why."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"The Books of a Real Small Business","primary":"with consent, keep or reconstruct a simple set of accounts for a real micro-business or household over a period — journal, ledger, trial balance, final accounts — from actual transactions.","support":"~400 words on what the accounts revealed about the business.","llc":"explain one statement and answer 'where did the profit go?' live."},
      {"option_no":2,"title":"Reconciling to the Rupee","primary":"reconcile a real (or realistic) bank statement with a cash book by hand, diagnosing every difference.","support":"~400 words on why records diverge.","llc":"reconcile a fresh difference live."},
      {"option_no":3,"title":"Depreciation That Matters","primary":"build depreciation schedules for real assets by multiple methods, and advise which method suits each asset and why.","support":"~400 words on depreciation's effect on profit/tax.","llc":"depreciate a fresh asset live."},
      {"option_no":4,"title":"From Transactions to Statements","primary":"take a real stream of transactions and carry them all the way to final accounts by hand, verifying the trial balance ties.","support":"~400 words on the accounting cycle.","llc":"post and defend an entry live."},
      {"option_no":5,"title":"Accounts for a Real Association","primary":"prepare non-trading accounts (Receipts & Payments, Income & Expenditure) for a real club/mess/association you know, from actual figures.","support":"~400 words on non-profit accounting.","llc":"explain a surplus/deficit live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMC01'
  and is_latest = true and is_archived = false;

-- ── 26UCMC02 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Identify the levels of management in a real organisation you can access (a shop, college dept, small firm) and who sits where.","deliverable_notes":"The named organisation + its management levels with real roles + 1 line on management vs administration there."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Write a real short plan for something you must organise (an event, a study schedule, a small venture) using a named planning tool.","deliverable_notes":"Your plan + the tool used + 1 line on one contingency you built in."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Draw the actual organisation chart of a real body you know and identify formal vs informal structures in it.","deliverable_notes":"Your org chart of the real body + 1 line on an informal relationship that matters."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Interview one real person about how they were recruited/selected for a job (consented) and map it to the staffing process.","deliverable_notes":"3–4 quoted sentences + your mapping to the staffing steps + 1 line on a gap between theory and their reality."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Observe or interview about a real leader/supervisor you know and classify their leadership style with evidence.","deliverable_notes":"The named leader + the style with evidence + 1 line on why it fits (or doesn't) their team."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Management in a Real Organisation","primary":"study one real accessible organisation (shop, firm, department) through observation and consented interviews, mapping its planning, organising, staffing and leading against management theory — and where reality diverges.","support":"~400 words on theory vs practice.","llc":"present your findings and defend one observation."},
      {"option_no":2,"title":"A Plan I Made and Ran","primary":"plan and actually execute a real small undertaking, documenting the planning process and what deviated.","support":"~400 words on planning under uncertainty.","llc":"explain a planning decision live."},
      {"option_no":3,"title":"The Org Chart Behind the Scenes","primary":"map the formal and informal structure of a real organisation you access, showing how informal ties shape real work.","support":"~400 words on formal vs informal organisation.","llc":"explain a structural choice live."},
      {"option_no":4,"title":"A Leader, Analysed","primary":"study a real leader/supervisor through observation and interview, classify and evaluate their style against outcomes.","support":"~400 words on leadership theory applied.","llc":"analyse a fresh leadership scenario live."},
      {"option_no":5,"title":"Recruitment in Reality","primary":"through consented interviews, document how real people were actually recruited and selected, comparing with the textbook staffing process.","support":"~400 words on the hiring reality.","llc":"map a fresh hiring story to the process live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMC02'
  and is_latest = true and is_archived = false;

-- ── 26UCMC03 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Prepare branch accounts (stock-and-debtor or debtor system) by hand for a realistic branch scenario you set up.","deliverable_notes":"Your branch account + 1 line on how head office tracks the branch's profit."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Prepare departmental accounts by hand allocating common expenses on a stated basis for a two-department business.","deliverable_notes":"Your departmental accounts + the allocation basis + 1 line on why the basis is fair."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Convert a real/realistic single-entry set of records into double entry (statement of affairs / conversion method) by hand.","deliverable_notes":"Your conversion + the profit found + 1 line on the risk of single-entry records."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Prepare partnership adjustment entries for one event (admission/retirement/death) by hand with goodwill treatment.","deliverable_notes":"Your adjustment entries + 1 line on how goodwill is shared."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Apply the Garner v. Murray rule to a partner-insolvency scenario by hand and do a piecemeal distribution.","deliverable_notes":"Your distribution schedule + 1 line on what Garner v. Murray protects."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Accounting for a Partnership Event","primary":"build a realistic partnership and work a full admission/retirement/death adjustment including goodwill and capital rebalancing by hand, verifying the books.","support":"~400 words on the fairness logic.","llc":"adjust for a fresh event live."},
      {"option_no":2,"title":"Single Entry to Double Entry","primary":"take a genuinely incomplete set of records (a real small trader's, with consent, or realistic) and convert to proper accounts by hand, finding the true profit.","support":"~400 words on why complete records matter.","llc":"convert a fresh case live."},
      {"option_no":3,"title":"Branch and Department Profits","primary":"prepare branch and departmental accounts for a realistic multi-unit business by hand, with justified expense allocation.","support":"~400 words on unit-level profitability.","llc":"allocate an expense and defend the basis live."},
      {"option_no":4,"title":"When a Partner Can't Pay","primary":"work an insolvency/piecemeal-distribution scenario applying Garner v. Murray by hand, protecting the solvent partners correctly.","support":"~400 words on the rule's rationale.","llc":"distribute a fresh insolvency case live."},
      {"option_no":5,"title":"Standards and Judgement","primary":"take one accounting-standard area and show, with a worked example, how it changes the reported numbers and why the standard exists.","support":"~400 words on financial reporting standards.","llc":"apply the standard to a fresh case live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMC03'
  and is_latest = true and is_archived = false;

-- ── 26UCMC04 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Analyse how one real local product/shop markets itself and identify which marketing concept (production/selling/marketing) it follows.","deliverable_notes":"The named product/shop + the concept with evidence + 1 line on how you could tell."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Identify the target segment and positioning of one real brand you use, and observe one consumer-behaviour factor in your own purchase.","deliverable_notes":"The brand + its segment/positioning + 1 line on a factor that drove your own buying."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Map the full 7Ps marketing mix of one real local business you can observe.","deliverable_notes":"Your 7Ps map for the named business + 1 line on its strongest P."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Analyse one real advertisement (named, sourced) — its medium, appeal and objective — and judge its effectiveness.","deliverable_notes":"The real ad + your analysis + 1 line on whether it would work on you and why."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Examine one real business's digital/social-media marketing and identify two techniques it uses.","deliverable_notes":"The named business's digital presence + two techniques + 1 line on one improvement."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A Real Business's Marketing, Decoded","primary":"study one real local business through observation and a consented owner interview, map its full marketing mix and strategy, and propose one evidence-based improvement.","support":"~400 words on marketing as you saw it practised.","llc":"pitch your improvement and defend it live."},
      {"option_no":2,"title":"The Advertisement, Analysed","primary":"collect and analyse several real advertisements across media for appeal, targeting and effectiveness, then design one ad for a real local product.","support":"~400 words on what makes ads work.","llc":"critique a fresh ad live."},
      {"option_no":3,"title":"Segmenting a Real Market","primary":"for one real product category, identify actual local segments and positioning through observation/mini-survey, and recommend a target.","support":"~400 words on segmentation in practice.","llc":"defend your target choice live."},
      {"option_no":4,"title":"Digital Marketing in the Wild","primary":"audit the real digital/social marketing of a local business, assess what works, and build a concrete improvement plan.","support":"~400 words on digital marketing.","llc":"present the audit and defend a recommendation live."},
      {"option_no":5,"title":"The 7Ps of a Shop I Know","primary":"fully map and evaluate the 7Ps of a real local business, identifying its strongest and weakest P with evidence.","support":"~400 words on the marketing mix.","llc":"strengthen a weak P live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMC04'
  and is_latest = true and is_archived = false;

-- ── 26UCMNM1 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Identify three real businesses near you and classify each by type; note one social responsibility each does or should do.","deliverable_notes":"The three named businesses classified + a CSR point for one + 1 line on business vs profession."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Find real local examples of a sole trader, a partnership and (if possible) a company, and note one advantage of each form observed.","deliverable_notes":"Your three real examples by form + an advantage each + 1 line on why the owner likely chose that form."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Study one real co-operative society or public enterprise you can access and describe how it differs from a private firm.","deliverable_notes":"The named body + the key difference + 1 line on whom it serves."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Explain, using a real recent example you find, how a stock exchange or a business combination affected a company.","deliverable_notes":"The real example (sourced) + 1 line on the effect."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Contact or research one real trade association or chamber of commerce and note two things it does for members.","deliverable_notes":"The named body + two functions + 1 line on why members join."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Forms of Business Around Me","primary":"survey real local businesses, classify them by organisational form, and through a consented owner interview understand why one chose its form and the trade-offs.","support":"~400 words on choosing a business form.","llc":"advise a fresh would-be owner on a form live."},
      {"option_no":2,"title":"A Co-operative, Understood","primary":"study one real co-operative/public enterprise you can access, documenting how its ownership and purpose differ from a private firm and whom it serves.","support":"~400 words on co-operative principles.","llc":"contrast it with a private firm live."},
      {"option_no":3,"title":"The Association That Helps Business","primary":"investigate a real trade association/chamber and what it actually does for members through research or a consented conversation.","support":"~400 words on collective business action.","llc":"present its role and answer a member's-eye question live."},
      {"option_no":4,"title":"Business and Its Responsibilities","primary":"examine the real social responsibility (or its absence) of local businesses you observe, and propose a realistic responsible practice for one.","support":"~400 words on business responsibility.","llc":"defend your proposal against a cost objection live."},
      {"option_no":5,"title":"How a Combination Reshaped a Company","primary":"research one real business combination/stock-market event and trace its effects on the firm and stakeholders.","support":"~400 words on combinations.","llc":"explain the effects live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMNM1'
  and is_latest = true and is_archived = false;

-- ── 26UCMNM2 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Collect five real advertisements across different media and identify the medium, objective and one element in each.","deliverable_notes":"Your five real ads + the analysis + 1 line on which medium suited its message."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Research one real advertising agency (or a local one) and note its type and one client relationship it manages.","deliverable_notes":"The named agency + type + 1 line on client-relationship management."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Find one real ad that raises a social/ethical issue and one that reflects Indian values; explain each.","deliverable_notes":"The two real ads + your explanation + 1 line on advertising's social influence."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Analyse one real ad through the AIDA model and assess how it builds brand image.","deliverable_notes":"Your AIDA breakdown of the real ad + 1 line on the brand impression it creates."},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Write your own advertising copy and layout for one real local product, applying a named execution style.","deliverable_notes":"Your copy + layout sketch + the style used + 1 line on your headline choice."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"An Ad Campaign I Created","primary":"design a small real advertising campaign for an actual local product/cause — copy, layout, media plan, AIDA logic — and test it on real people for response.","support":"~400 words on your creative and strategic choices.","llc":"present the campaign and defend a choice live."},
      {"option_no":2,"title":"Advertising and Society","primary":"analyse real advertisements for their social, ethical and cultural influence with evidence, and take a reasoned position.","support":"~400 words on advertising's responsibilities.","llc":"critique a fresh ad's ethics live."},
      {"option_no":3,"title":"The Anatomy of Real Ads","primary":"dissect a set of real ads across media (medium, appeal, AIDA, brand-building) and derive what makes them effective.","support":"~400 words on ad effectiveness.","llc":"analyse a fresh ad live."},
      {"option_no":4,"title":"Copy That Sells","primary":"write and refine advertising copy for real local products across execution styles, testing clarity and appeal on real readers.","support":"~400 words on copywriting craft.","llc":"write a headline live for a given product."},
      {"option_no":5,"title":"Inside an Agency","primary":"research a real advertising agency's structure and client work (via sources or a consented contact) and present how agencies operate.","support":"~400 words on the agency model.","llc":"answer an agency-operations question live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMNM2'
  and is_latest = true and is_archived = false;

-- ── 26UCMS01 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Find one real local example of each industrial revolution's technology still in use around you (a hand tool, a machine, a computer, a connected device).","deliverable_notes":"Your four real examples (photos) + 1 line placing each in its revolution."},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Identify one real task in your life now done (or replaceable) by AI, and note one thing AI does well and one it does badly there.","deliverable_notes":"The real task + the AI good/bad points + 1 line on the human role that remains."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Find one real service you use that runs on 'big data' (a recommendation, a map) and identify what data it likely uses.","deliverable_notes":"The named service + the data it uses + 1 line on a privacy concern."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Identify one real IoT device near you (smart meter, fitness band, connected appliance) and describe what it senses and controls.","deliverable_notes":"The named device + what it senses/controls + 1 line on a benefit and a risk."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Interview one real worker/shopkeeper about how technology has changed their work in the last five years.","deliverable_notes":"3–4 quoted sentences from the named person + 1 line linking it to an Industry 4.0 technology."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Industry 4.0 in My Own World","primary":"document the real presence of Industry 4.0 technologies (AI, big data, IoT) in your locality through observation and a consented worker interview, assessing benefits and risks honestly.","support":"~400 words on technology changing work.","llc":"present your findings and answer a 'what's next?' question live."},
      {"option_no":2,"title":"What AI Can and Can't Do Here","primary":"investigate real tasks in your community that AI is changing, mapping honestly what it does well, badly, and the human role that remains.","support":"~400 words on AI's real limits.","llc":"judge a fresh task's AI-suitability live."},
      {"option_no":3,"title":"The Data Behind a Service","primary":"pick a real data-driven service you use, reverse-engineer what data powers it and how, and assess the privacy trade-off.","support":"~400 words on big data in daily life.","llc":"analyse a fresh service's data use live."},
      {"option_no":4,"title":"An IoT Device, Opened Up","primary":"study a real IoT device you can access — its sensing, connectivity, control, and the benefit/risk balance.","support":"~400 words on IoT.","llc":"assess a fresh device live."},
      {"option_no":5,"title":"Technology and a Real Worker","primary":"through a consented interview, capture how Industry 4.0 has actually changed one person's work, and reflect on the human impact.","support":"~400 words on tech and livelihoods.","llc":"present the story and connect it to the technology live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMS01'
  and is_latest = true and is_archived = false;

-- ── 26UCMS02 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Human Dimension","task":"Identify one real South-Indian textile product from your region (Bhavani Jamakkalam, Tirupur knitwear, Kanchipuram silk, Coimbatore cotton) and document where and how it is made.","deliverable_notes":"The named product + its cluster/place + 1 line on what makes it distinctive (e.g. GI tag)."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Observe or document a real loom/weaving method (handloom/powerloom) at a named place, or a real textile item, and describe the method.","deliverable_notes":"Your photo/notes of the real loom/product + 1 line on handloom vs powerloom trade-offs."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Use a free AI tool to draft a product description for a real South-Indian textile, then correct it against reality — noting what the AI got wrong.","deliverable_notes":"The AI draft + your corrected version + 1 line on the factual error the AI made."},
      {"sno":4,"unit":"IV","finks_dimension":"Human Dimension","task":"Interview one real handloom/powerloom worker or textile trader (named, consented, ethical) about income and one challenge they face.","deliverable_notes":"3–4 quoted sentences from the named person + 1 line on the challenge (income/health/market)."},
      {"sno":5,"unit":"V","finks_dimension":"Integration","task":"Research one real internship/livelihood option in the local textile sector (a cooperative, unit, showroom, Co-optex) and what it involves.","deliverable_notes":"The named option + what it involves + 1 line on the skill it needs."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"A South-Indian Textile, Traced","primary":"study one real regional textile product end to end — its cluster, making, workers and market — through a site visit/observation and a consented, ethical worker/trader interview.","support":"~400 words on the craft, the economics and the people behind it.","llc":"present your study and answer a livelihood question live."},
      {"option_no":2,"title":"Handloom vs Powerloom","primary":"compare real handloom and powerloom production you observe/document on quality, cost, and worker livelihood, reaching an honest view.","support":"~400 words on the trade-offs.","llc":"defend your view against an economic objection live."},
      {"option_no":3,"title":"Where AI Gets the Textile Wrong","primary":"use AI tools to generate textile product content, then rigorously fact-check and correct it against real products/workers, documenting AI's errors.","support":"~400 words on why local, real knowledge beats generated text.","llc":"correct a fresh AI claim live."},
      {"option_no":4,"title":"Voices from the Loom","primary":"through ethical, consented interviews, document the real lives, incomes and challenges of textile workers, told with respect.","support":"~400 words on the human side of the textile economy.","llc":"present the voices and connect to the business."},
      {"option_no":5,"title":"A Path Into the Textile Trade","primary":"research and map a real entry route into the local textile sector (cooperative/unit/showroom/Co-optex), including the skills and realities.","support":"~400 words on the opportunity and its demands.","llc":"present the path and answer a 'how would you start?' question live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UCMS02'
  and is_latest = true and is_archived = false;

-- ── 26UECGE1 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Using a real, cited indicator (per-capita income, HDI), compare economic growth vs development for India across two recent years.","deliverable_notes":"Your two cited figures + 1 line distinguishing growth from development in the numbers."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Find real local evidence of one characteristic of a developing economy (informal work, population pressure, dualism) in your area.","deliverable_notes":"Your observed evidence + 1 line linking it to the demographic-transition idea."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Look up India's real sectoral contribution to national income and compare it with what you observe in your own locality's economy.","deliverable_notes":"The cited sector shares + your local observation + 1 line on the match or mismatch."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Identify one real direct and one real indirect tax you or your family pay, and note who ultimately bears each.","deliverable_notes":"The two real taxes + the incidence of each + 1 line on which is more regressive."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Track the real price of five everyday items over a short period (or find inflation data) and relate it to inflation concepts.","deliverable_notes":"Your five real prices/data + 1 line on the inflation you can see."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Development I Can See","primary":"build an evidence-based picture of economic development in your own locality — indicators, sectors, informal work, and one development gap — using real observation and cited data.","support":"~400 words on growth vs development where you live.","llc":"defend an indicator choice live."},
      {"option_no":2,"title":"Who Really Pays the Tax","primary":"trace real direct and indirect taxes in your household's spending, analyse incidence and regressivity, and reflect on fairness.","support":"~400 words on public finance and equity.","llc":"reason about a fresh tax's incidence live."},
      {"option_no":3,"title":"Inflation in My Basket","primary":"track real prices of a basket of goods over time (or use cited data), compute a simple price change, and connect it to inflation causes and effects.","support":"~400 words on inflation felt vs measured.","llc":"interpret a fresh price change live."},
      {"option_no":4,"title":"India's Structure, and Mine","primary":"compare India's real sectoral economic structure with your locality's observed economy, explaining the differences.","support":"~400 words on structural change.","llc":"explain a structural feature live."},
      {"option_no":5,"title":"Population and the Economy","primary":"investigate one real population-economy link in your area (labour, dependency, migration) with evidence and the demographic-transition lens.","support":"~400 words on population and development.","llc":"reason about a demographic effect live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UECGE1'
  and is_latest = true and is_archived = false;

-- ── 26UECGE4 · bachelor-of-commerce ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Foundational Knowledge","task":"Find five real imported and five real exported goods around you (labels/'made in') and note the country for each.","deliverable_notes":"Your ten real traded goods with countries + 1 line on a comparative-advantage pattern you notice."},
      {"sno":2,"unit":"II","finks_dimension":"Application","task":"Using a real, cited figure, describe one component of India's balance of trade/payments and whether it is in surplus or deficit.","deliverable_notes":"The cited figure + 1 line on what a deficit there means."},
      {"sno":3,"unit":"III","finks_dimension":"Application","task":"Track the real exchange rate of the rupee against one currency over a short period and note one effect of a change on a real good.","deliverable_notes":"Your two exchange-rate readings (dated) + 1 line on the effect on an import/export you know."},
      {"sno":4,"unit":"IV","finks_dimension":"Integration","task":"Identify one real trade policy or barrier (a tariff, ban, FTA) in the news and explain who it helps and hurts.","deliverable_notes":"The real policy (sourced) + winners and losers + 1 line on the trade-off."},
      {"sno":5,"unit":"V","finks_dimension":"Human Dimension","task":"Interview one real trader/shopkeeper who deals in imported/exported goods about how global prices or rates affect them.","deliverable_notes":"3–4 quoted sentences from the named person + 1 line on the global-local link."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Trade on My Shelf","primary":"document the real international trade visible in your daily life (imports/exports, origins), and analyse the comparative-advantage and exchange-rate forces behind it, with a consented trader interview.","support":"~400 words on trade made concrete.","llc":"explain a trade pattern live."},
      {"option_no":2,"title":"The Rupee and Real Prices","primary":"track the rupee's real exchange rate and connect its movements to actual price changes in goods you know, with data.","support":"~400 words on exchange rates and daily life.","llc":"predict a rate change's effect live."},
      {"option_no":3,"title":"A Trade Policy, Weighed","primary":"analyse one real current trade policy/barrier for its winners and losers with evidence, and take a reasoned position.","support":"~400 words on trade policy trade-offs.","llc":"defend your position against an opposing interest live."},
      {"option_no":4,"title":"Balance of Payments, Grounded","primary":"explain a real component of India's balance of payments with cited data and connect it to something tangible (fuel, gold, remittances).","support":"~400 words on the BoP.","llc":"interpret a fresh BoP figure live."},
      {"option_no":5,"title":"Global Forces on a Local Trader","primary":"through a consented interview and data, show how global trade/rates actually affect a real local trader's business.","support":"~400 words on the global-local link.","llc":"present and answer a 'what could they do?' question live."}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UECGE4'
  and is_latest = true and is_archived = false;

-- ── 26UGTA01 · tamil-part-i-language ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Read the prescribed Sangam poems (Natrinai/Kurunthogai/Ainkurunuru) aloud; record your recitation and note the Thinai (landscape) and one real place near you that fits that landscape.","deliverable_notes":"Your recitation (audio) + the Thinai identified + a real local landscape that matches + 1 line in Tamil or English on the imagery. [Faculty: verify Tamil]"},
      {"sno":2,"unit":"II","finks_dimension":"Human Dimension","task":"Take one Thirukkural/Naladiyar couplet and find a real situation in your life or community where it applies; note it.","deliverable_notes":"The couplet (as printed) + the real situation + 1 line on how the couplet's ethic played out."},
      {"sno":3,"unit":"III","finks_dimension":"Integration","task":"Read the prescribed epic excerpt (Silapathikaram/Manimekalai) and connect one value or event to a real Tamil tradition still practised.","deliverable_notes":"The excerpt reference + the living tradition + 1 line on the continuity."},
      {"sno":4,"unit":"IV","finks_dimension":"Application","task":"Recite one Thevaram/Thiruvasagam devotional verse and document where such verses are still sung near you (a named temple/occasion).","deliverable_notes":"Your recitation (audio) + the named temple/occasion + 1 line on the verse's living use."},
      {"sno":5,"unit":"V","finks_dimension":"Foundational Knowledge","task":"Make your own hand-drawn timeline of Tamil literary history (Sangam → ethical → epic) placing the texts you studied.","deliverable_notes":"Your literary-history timeline + 1 line on what defines each era."}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Tamil Classics, Alive Today","primary":"take the prescribed classical Tamil texts and connect them to living tradition through recitation (recorded), real local landscapes/temples/customs, and a consented conversation with an elder or reciter — showing the literature as living, not archived.","support":"~400 words (English acceptable) on the text and its continuity.","llc":"recite a passage and explain its meaning and living relevance live. [Faculty: verify all Tamil.]"},
      {"option_no":2,"title":"An Ethic I Tested","primary":"take several Thirukkural/Naladiyar verses and document real situations in your community where their ethics hold or fail, with honest observation.","support":"~400 words on Tamil ethical literature applied.","llc":"apply a couplet to a fresh situation live. [Faculty: verify Tamil citations.]"},
      {"option_no":3,"title":"The Landscapes of Sangam Poetry","primary":"connect the Thinai (landscape conventions) of real Sangam poems to actual landscapes you photograph near you, with recitation.","support":"~400 words on Sangam poetics and place.","llc":"match a poem to a landscape live. [Faculty: verify Tamil.]"},
      {"option_no":4,"title":"Devotion Still Sung","primary":"document where and how Thevaram/Thiruvasagam verses are still recited in your area (named temples/occasions), with your own recitation and a consented conversation.","support":"~400 words on the living devotional tradition.","llc":"recite and explain a verse live. [Faculty: verify Tamil.]"},
      {"option_no":5,"title":"A Map of Tamil Literature","primary":"build a rich, evidence-based timeline/anthology of the Tamil literary tradition covered, with your own notes on each work's significance.","support":"~400 words on Tamil literary history.","llc":"place a work in the tradition and justify live. [Faculty: verify Tamil.]"}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UGTA01'
  and is_latest = true and is_archived = false;

-- ── 26UGTA02 · tamil-part-i-language ──
update public.bos_course_syllabi
set
  concept_applications = $j${
    "intro_note": "Five short Fink's-shaped activities, one per Unit, conducted as formative learning during the semester. Not separately graded as line items; faculty may credit toward the Activities row (5 marks) at the BoS Chairman's discretion. They build the practice that culminates in the Capstone. **The deliverable for each is the evidence — a photo, a reading, a hand-drawn sketch, a data table, a quoted voice, running code — plus three or four sentences, not an essay.** Every task requires a named local place, a named person, a real measurement, or a hand-made artefact that an AI cannot fabricate.",
    "activities": [
      {"sno":1,"unit":"I","finks_dimension":"Application","task":"Recite one Bharathiyar/Bharathidasan poem (record it) and connect its theme (freedom, social reform) to a real present-day issue.","deliverable_notes":"Your recitation (audio) + the present-day connection + 1 line on the poet's continuing relevance. [Faculty: verify Tamil.]"},
      {"sno":2,"unit":"II","finks_dimension":"Integration","task":"Read one prescribed modern Tamil short story and connect its social theme to a real situation you observe.","deliverable_notes":"The story reference + the real situation + 1 line on the theme's truth today."},
      {"sno":3,"unit":"III","finks_dimension":"Human Dimension","task":"Explore one minor-literature form (Kuravanji/Parani etc.) and find a living folk/performance tradition near you that echoes it.","deliverable_notes":"The form + the named living tradition/place + 1 line on the echo."},
      {"sno":4,"unit":"IV","finks_dimension":"Foundational Knowledge","task":"Make a chart of the minor-literature (Chitrilakkiyam) forms with one real example each you can find or recall.","deliverable_notes":"Your chart of forms with real examples + 1 line on what distinguishes two of them. [Faculty: verify Tamil.]"},
      {"sno":5,"unit":"V","finks_dimension":"Application","task":"Collect 10 real instances of the common word-usage/spelling confusions listed (e.g. கறுப்பு/கருப்பு) from real signage/writing around you and give the correct form.","deliverable_notes":"Your 10 real examples (photos) with corrections + 1 line on the most common error you saw. [Faculty: verify Tamil.]"}
    ]
  }$j$::jsonb,
  capstone_project = $j${
    "intro_note": "Choose ONE of FIVE — Solo · 10 marks (Internal) · spans the semester · presented at the end-of-course Learners Led Conference. The Senior Learner introduces all five Capstones to the cohort in week 1. **The assessment focuses on what AI cannot do.** Each Capstone has three parts: (1) **the AI-proof primary deliverable** — a real measured object, a hand-drawn graph, a named-source interview with a phone-verifiable contact, running code, a real dataset, or a thing you built, as the option specifies; (2) **a short ~400-word reflection** — deliberately brief, enough to show your thinking, too short to be worth generating; and (3) **a 5–7 minute presentation at the end-of-course Learners Led Conference (LLC)** where you show the real thing and answer unscripted questions. A long polished essay is exactly what a language model produces best, so it is not the deliverable. No outside-community Public Exhibition — the LLC audience is the cohort and faculty.",
    "options": [
      {"option_no":1,"title":"Modern Tamil Voices, Today","primary":"engage with the prescribed modern Tamil poetry/stories/drama through recitation (recorded) and connect their social themes to real present-day issues you observe, with a consented conversation.","support":"~400 words (English acceptable) on the literature and its relevance.","llc":"recite/present and connect to a current issue live. [Faculty: verify all Tamil.]"},
      {"option_no":2,"title":"Language Used Rightly","primary":"collect real Tamil usage/spelling errors from signage and writing in your area, correct them, and build a usage guide.","support":"~400 words on correct Tamil usage.","llc":"correct a fresh usage error live. [Faculty: verify Tamil.]"},
      {"option_no":3,"title":"A Living Folk Form","primary":"connect a minor/folk Tamil literary form to a living performance tradition near you through observation and a consented conversation with a performer.","support":"~400 words on folk literature alive today.","llc":"present the tradition and its literary link live. [Faculty: verify Tamil.]"},
      {"option_no":4,"title":"Bharathi and the Present","primary":"take Bharathiyar's/Bharathidasan's themes and connect them to real present-day social realities, with recitation and evidence.","support":"~400 words on the poets' continuing power.","llc":"recite and connect a verse to now live. [Faculty: verify Tamil.]"},
      {"option_no":5,"title":"The Forms of Tamil Literature","primary":"build a rich, exampled guide to the modern and minor Tamil literary forms studied, with your own notes.","support":"~400 words on Tamil literary forms.","llc":"identify and place a form live. [Faculty: verify Tamil.]"}
    ]
  }$j$::jsonb,
  last_modified_at = now()
where course_code = '26UGTA02'
  and is_latest = true and is_archived = false;

-- ── 3. Verify: one row per code, all five columns populated ──
select course_code,
       (concept_applications is not null) as ca,
       (assessment_pattern   is not null) as ap,
       (capstone_project     is not null) as cp,
       (capstone_rubric      is not null) as cr,
       (llc_conference       is not null) as llc,
       jsonb_array_length(concept_applications->'activities') as n_activities,
       jsonb_array_length(capstone_project->'options')        as n_options
from public.bos_course_syllabi
where course_code in ('24UDIM01','26UENC01','26UENC02','26UENC03','26UENC04','26UENDE1','26UENDE2','26UENNM1','26UENNM2','26UENS01','26UENS02','26UGEN01','26UGEN02','26UHIC01','26UHIC02','26UHIC03','26UHIC04','26UHINM1','26UHINM2','26UHIS01','26UHIS02','26UBOGE01','26UBOGE02','26UCHC01','26UCHC02','26UCHCP01','26UCHCP02','26UCHGE1','26UCHGE2','26UCHGEP01','26UCHGEP02','26UCHNM1','26UCHNM2','26UCHS01','26UCHS02','26UGEGE1','26UGEGE2','26UMAC01','26UMAC02','26UMAC03','26UMAC04','26UMADE1','26UMADE2','26UMADEP01','26UMADEP02','26UMAGE2','26UMAGEP01','26UMANM1','26UMANM2','26UMAS01','26UMAS02','26USTDE1','26USTDE2','26USTDEP01','26USTDEP02','26UZOC01','26UZOC02','26UZOC03','26UZOCPO1','26UZOCP02','26UZOFC1','26UZOA01','26UZOGE02','26UZOAP01','26UZONM1','26UZONM2','26UZONM3','26UZONM4','26UZOS01','26UCMC01','26UCMC02','26UCMC03','26UCMC04','26UCMNM1','26UCMNM2','26UCMS01','26UCMS02','26UECGE1','26UECGE4','26UGTA01','26UGTA02')
  and is_latest = true and is_archived = false
order by course_code;

commit;
