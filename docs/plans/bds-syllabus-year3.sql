-- ============================================================================
-- BoS DCH / BDS — SYLLABUS BATCH: YEAR III  (UPSERT — safe to re-run)
-- ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE.
-- Generated 2026-08-08 from parallel extraction. Scope: DCH / BDS / reg 2018.
-- Requires migration 20260807_bos_syllabus_bds_dental_model.sql.
-- ============================================================================

BEGIN;

-- ── 4211 General Medicine ──
INSERT INTO public.bos_course_syllabi (
  institutions_id, board_id, regulation_id,
  course_code, course_name, course_credits,
  academic_model, academic_year,
  version_number, is_latest, is_archived,
  stream,
  bds_content, exam_scheme, textbooks,
  created_by
) VALUES (
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
  'dcddfa03-d654-4f8e-a1e5-10a0e8072ca6',
  '747c51f3-01ad-468c-8bc7-5e89bf69c7ee',
  '4211', 'General Medicine Theory', NULL,
  'mgr_bds', 3,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
{
  "goal": "The broad goal of the teaching of undergraduate BDS students in General Medicine aims at providing comprehensive knowledge of both the normal physiology as well as the abnormal pathology to provide a basis for understanding the clinical manifestations in the various disease presentations.",
  "objectives": {
    "knowledge": [
      "Describe the etiology, pathogenesis, clinical signs and symptoms and complications of various disease processes",
      "Know of the various pre-requisite settings for the various diseases to occur including a knowledge of the various co-morbidities especially lifestyle diseases such as Hypertension, Diabetes Mellitus",
      "Awareness of the oral manifestations of various systemic disorders",
      "Knowledge of the medical conditions requiring screening and evaluation prior to dental procedures",
      "To be aware of BLS steps in cases of medical emergencies while undergoing dental procedures"
    ],
    "skills": [
      "Take a proper history from the patient",
      "Do a complete general physical examination including build and nourishment",
      "Assess the vitals - recording the details of Pulse, recording the BP, temperature, checking capillary blood glucose and oxygen saturation",
      "Look for cyanosis, clubbing, pallor, icterus, pedal edema, lymphadenopathy, rashes, ecchymosis",
      "Able to examine the CVS, RS, abdomen and the facial nerve",
      "Interpret the elicited signs and symptoms of various systemic disease processes",
      "Interpreting lab reports such as importance of CBC, RFT, ECG, BT, CT, PT, INR etc",
      "To be trained in simple procedures such as giving intramuscular, intravenous Injection as well as starting an IV line",
      "To be trained in basic life support",
      "Writing prescriptions"
    ],
    "attitude": [
      "Willingness to apply the current knowledge of dentistry in the best interest of the patient and community",
      "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community"
    ],
    "integration": [
      "From the integrated teaching of other clinical sciences, the student shall be able to describe the various signs and symptoms and interpret the clinical manifestation of disease processes. Horizontal integration can be done in common with basic science departments, and vertical integration can be done with clinical departments. For example, horizontal integration can be the interpretation of lab results with Biochemistry and biopsy reports with Pathology; and vertical integration can be the study of oropharyngeal pathology along with ENT and oral surgical procedures with General surgery"
    ],
    "infection_control": [
      "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
    ],
    "computer_proficiency": [
      "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes, Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses, and online courses",
      "Technological Requirements for all Graduate Students: a laptop or desktop computer that supports operating system requirements, internet browser requirements, reliable and consistent access to the internet, antivirus software which is current and consistently updated, Microsoft Office, and Adobe Reader (or equivalent to view PDF files)"
    ]
  },
  "competencies": [
    {
      "group": "General skills",
      "items": []
    },
    {
      "group": "Practice Management",
      "items": []
    },
    {
      "group": "Communication and Community Resources",
      "items": []
    },
    {
      "group": "Patient Care - Diagnosis",
      "items": []
    },
    {
      "group": "Patient Care - Treatment Planning",
      "items": []
    },
    {
      "group": "Competencies specific to the subject",
      "items": []
    }
  ],
  "teaching_hours": {
    "lecture": 60,
    "practical": 90,
    "total": 150
  },
  "teaching_methodology": [
    "Didactic Lecture - with a problem solving approach, with discussions of relevant clinical problems",
    "Interactive Lecture (include buzz groups, self-assessment questions, quizzes, MCQs, One minute paper)",
    "Seminar",
    "Symposium",
    "Role play and discussion on medical ethics topics",
    "Self-directed learning"
  ],
  "theory_syllabus": [
    {
      "topic": "Aim Of Medicine",
      "must_know": [
        "Know about signs symptoms",
        "Diagnosis, differential diagnosis",
        "investigation",
        "treatment and prognosis"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Infections",
      "must_know": [
        "Mumps, measles",
        "varicella",
        "HIV/AIDS",
        "Hand, foot and mouth disease",
        "Swine flu",
        "Syphilis",
        "Diphtheria",
        "Enteric fever",
        "Leptospirosis",
        "Hansen's disease",
        "Tuberculosis",
        "Dengue",
        "Malaria",
        "Candidiasis"
      ],
      "desirable_to_know": [
        "Herpes zoster/ rubella",
        "Herpes Simples infections",
        "Oral Hairy lecoplakia",
        "Infectious mononucleosis",
        "Nasopharyngeal Ca",
        "Sepsis",
        "Amoebiasis",
        "Filariasis",
        "Mucormycosis"
      ],
      "nice_to_know": [
        "EBV",
        "chikungunya",
        "Yellow fever",
        "PUO"
      ]
    },
    {
      "topic": "Vitamin & micronutrient Deficiencies",
      "must_know": [
        "B1, B2, B3, B6, B12",
        "Vitamin C and D",
        "Fluoride",
        "Zinc",
        "Iron"
      ],
      "desirable_to_know": [
        "Vitamin K",
        "Selenium",
        "Chromium"
      ],
      "nice_to_know": [
        "Balanced diet",
        "PEM"
      ]
    },
    {
      "topic": "Endocrine",
      "must_know": [
        "Diabetes Melltus",
        "Acromegaly",
        "Calcium metabolism and Parathyroid",
        "Addison's disease",
        "Cushing's disease",
        "Hypothyroidism",
        "Hyperthyroidism"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "CVS",
      "must_know": [
        "Acute Rheumatic fever",
        "Rheumatic valvular heart disease",
        "Infective Endocarditis",
        "Hypertension",
        "Ischemic heart disease",
        "Common Arrhythmias",
        "Congestive cardiac failure"
      ],
      "desirable_to_know": [
        "Bronchiectesis",
        "Lung abscess",
        "Pleural effusion",
        "Pneumothorax",
        "Bronchogenic Ca"
      ],
      "nice_to_know": []
    },
    {
      "topic": "RS",
      "must_know": [
        "COPD",
        "Broncial asthma",
        "Pulmonary TB",
        "Pneumonia"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Renal system",
      "must_know": [
        "Acute renal failure",
        "Chronic Renal failure",
        "Nephritis",
        "Nephrotis syndrome"
      ],
      "desirable_to_know": [
        "Diarrhoea",
        "Dysentery",
        "Amoebiaisis",
        "Malabsorption"
      ],
      "nice_to_know": []
    },
    {
      "topic": "GIT",
      "must_know": [
        "Stomatitis",
        "Gingival hyperplasia",
        "Dysphagia",
        "Acid peptic Disease",
        "GERD",
        "Jaundice",
        "Acute hepatitis",
        "Chronic Hepatitis",
        "Cirrhosis of liver",
        "Ascites"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Haematology",
      "must_know": [
        "Anaemias",
        "Bleeding and clotting disorders",
        "Leukemias and lymphomas",
        "Agranulocytosis",
        "Splenomegaly",
        "Generalized lymphadenopathy",
        "Oral manifestations of Haematological disorders"
      ],
      "desirable_to_know": [
        "Meningitis"
      ],
      "nice_to_know": []
    },
    {
      "topic": "CNS",
      "must_know": [
        "Facial palsy",
        "Facial pain including trigeminal neuralgia",
        "Headache including migraine",
        "Epilepsy",
        "Lower cranial nerves"
      ],
      "desirable_to_know": [
        "Acute pulmonary edema",
        "ARDS"
      ],
      "nice_to_know": [
        "Examination of comatose patient"
      ]
    },
    {
      "topic": "Critical Care",
      "must_know": [
        "Syncope",
        "Cardiac Arrest",
        "CPR",
        "Shock"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Bioethics",
      "must_know": [
        "Bioethics is the application of ethics to the field of medicine and healthcare",
        "Medical ethics, which focuses on issues in health care",
        "Research ethics, which focuses on issues in the conduct of research",
        "Environmental ethics, which focuses on issues pertaining to the relationship between human activities and the environment",
        "Public health ethics"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    }
  ],
  "practicals": [
    {
      "title": "System wise case presentation"
    },
    {
      "title": "Demonstration of clinical signs"
    },
    {
      "title": "Small group discussion of clinical manifestations, diagnosis, differential diagnosis, investigations and treatment"
    },
    {
      "title": "Demonstration of BLS"
    },
    {
      "title": "Confirming cardiac arrest"
    },
    {
      "title": "Checking carotid pulse"
    },
    {
      "title": "Manual Inline stabilization of cervical spine"
    },
    {
      "title": "Establishing airway patency during CPR"
    },
    {
      "title": "Applying chest compression in CPR"
    }
  ],
  "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
  "disciplines": null
}
  $bds$::jsonb,
  -- ---- exam_scheme ---------------------------------------------------------
  $exam$
{
  "components": [
    {
      "stream": "Theory",
      "examination": 70,
      "internal_assessment": 10,
      "viva": 20,
      "total": 100
    },
    {
      "stream": "Practical",
      "examination": 90,
      "internal_assessment": 10,
      "viva": null,
      "total": 100
    }
  ],
  "grand_total": 200,
  "no_theory_exam": false,
  "question_pattern": {
    "duration": "3 Hours",
    "sections": [
      {
        "type": "Elaborate on",
        "questions": 2,
        "marks_each": 10,
        "total": 20
      },
      {
        "type": "Write notes on",
        "questions": 10,
        "marks_each": 5,
        "total": 50
      }
    ],
    "total": 70
  },
  "practical_exam": {
    "components": [
      {
        "name": "Long case",
        "count": 1,
        "marks": 50
      },
      {
        "name": "Short case",
        "count": 1,
        "marks": 30
      },
      {
        "name": "Spotter",
        "marks": 10
      }
    ],
    "total": 90,
    "viva": {
      "marks": 20
    },
    "long_case": [
      "Complete case sheet writing including History Taking",
      "General Examination",
      "Examination of system involved as the case may be - CVS, RS, Abdomen, Facial nerve",
      "Examination of other systems",
      "Diagnosis / Differential Diagnosis",
      "Investigations",
      "Treatment"
    ],
    "short_case": [
      "Only General examination and examination of system involved",
      "Discussion of case findings, diagnosis and treatment",
      "No case sheet writing"
    ],
    "spotters_examples": [
      "Facial palsy - Unilateral / bilateral facial palsy",
      "Herpes",
      "Oral pigmentations of systemic diseases",
      "Cervical Lymphadenopathy",
      "Cyanosis",
      "Clubbing / koilonychia",
      "Pallor",
      "Icterus"
    ],
    "viva_topics": {
      "instruments": [
        "BP apparatus",
        "IV cannula",
        "Pulse oximeter",
        "Thermometer",
        "Glucometer",
        "Ryle tube",
        "Urinary catheter",
        "AMBU bag",
        "Endotracheal tube",
        "Lab reports - CBC, BT, CT, PT, aPTT, INR"
      ],
      "xrays": [
        "Normal Chest Xray",
        "Xrays of CVS like cardiomegaly",
        "Xrays of RS like that of COPD"
      ],
      "drugs": [
        "Management of hypotension with IV saline",
        "Management of cardiogenic shock with Inj Adrenaline & Inj Atropine",
        "Management of seizures with Inj Diazepam / Inj Phenytoin",
        "Inj Soda bicarb",
        "Inj Hydrocotisone",
        "Management of pulmonary edema with Inj Morphine / Inj Furosemide",
        "Management of hypocalcemia with Inj Calcium gluconate",
        "Managment of bleeding with Inj Vit K / Inj Adrenochrome",
        "Management of hypoglycemia with Inj 25 % dextrose",
        "Management of asthma with bronchodilators"
      ]
    }
  },
  "internal_assessment": {
    "theory": 10,
    "practical": 10,
    "total": 20,
    "frequency": "The continuing assessment examination (both Theory/Practical) held at least 3 times in a particular year and best of two examinations should be considered",
    "submission": "The Internal Assessment marks to be submitted to the University once in every three months. The marks scored by the students shall be displayed on the Notice board, a copy forwarded by HOD shall be sent to the University once in every 3 months"
  }
}
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
{
  "groups": [
    {
      "group": "Text Books",
      "books": [
        "Davidson's Principle and Practice of Medicine",
        "Hutchison's clinical methods"
      ]
    }
  ]
}
  $books$::jsonb,
  '351c76ad-33f2-4a39-8ede-9299465b70f4'
)
ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE SET
  course_name      = EXCLUDED.course_name,
  course_credits   = EXCLUDED.course_credits,
  academic_model   = EXCLUDED.academic_model,
  academic_year    = EXCLUDED.academic_year,
  is_latest        = EXCLUDED.is_latest,
  is_archived      = EXCLUDED.is_archived,
  stream           = EXCLUDED.stream,
  bds_content      = EXCLUDED.bds_content,
  exam_scheme      = EXCLUDED.exam_scheme,
  textbooks        = EXCLUDED.textbooks,
  last_modified_by = EXCLUDED.created_by,
  last_modified_at = now();

-- ── 4212 General Surgery ──
INSERT INTO public.bos_course_syllabi (
  institutions_id, board_id, regulation_id,
  course_code, course_name, course_credits,
  academic_model, academic_year,
  version_number, is_latest, is_archived,
  stream,
  bds_content, exam_scheme, textbooks,
  created_by
) VALUES (
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
  'dcddfa03-d654-4f8e-a1e5-10a0e8072ca6',
  '747c51f3-01ad-468c-8bc7-5e89bf69c7ee',
  '4212', 'General Surgery Theory', NULL,   -- DCI model: no credits
  'mgr_bds', 3,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The students should gain the knowledge and insight into the basic surgical principles, common surgical conditions of Head & Neck and its management.",
    "objectives": {
      "knowledge": [
        "Know the surgical anatomy, physiology and pathological basis of diseases of head and neck",
        "Know the basic surgical principles",
        "Know the common surgical conditions of Head & Neck",
        "Know eliciting History and to do Clinical examination and to arrive at a Provisional diagnosis",
        "Know about Radiological and blood investigations to arrive at a diagnosis"
      ],
      "skills": [
        "Know the interpretation of Radiological films of Head and Neck",
        "Know the Operative procedures, Post operative complications and Post operative management",
        "To differentiate between Benign and Malignant diseases of Head & Neck",
        "Know to perform minor surgical procedures such as Draining an Abscess and taking a Biopsy"
      ],
      "attitude": [
        "Willingness to apply the current knowledge of dentistry in the best interest of the patient and community",
        "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community"
      ],
      "integration": [
        "By emphasizing on the relevant information and sound knowledge of Basic Science, to acquaint the student with various diseases, which may require surgical expertise and to train the student to analyse the history and be able to do a thorough clinical examination of the patient"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per Universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes, Basic operative skills in analysis of data and knowledge of multimedia"
      ]
    },
    "competencies": [
      { "group": "General skills", "items": [] },
      { "group": "Practice Management", "items": [] },
      { "group": "Communication and Community Resources", "items": [] },
      { "group": "Patient Care - Diagnosis", "items": [] },
      { "group": "Patient Care - Treatment Planning", "items": [] },
      { "group": "Competencies specific to the subject", "items": [] }
    ],
    "teaching_hours": { "lecture": 60, "practical": 90, "total": 150 },
    "teaching_methodology": [
      "Combination of Lectures",
      "Small group seminars, tutorials",
      "Observing treatment in out patient department and in General wards",
      "Observing Operative procedures in theatres",
      "Audio visual aids"
    ],
    "theory_syllabus": [
      { "topic": "History of surgery", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "General Principles of Surgery", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Wounds", "must_know": ["Classification", "types", "healing", "Repair", "Treatment"], "desirable_to_know": ["Medicolegal aspect", "Complications"], "nice_to_know": [] },
      { "topic": "Inflammation", "must_know": ["Acute and chronic infections of soft tissues, causative organisms and complications & treatment"], "desirable_to_know": ["Transmissable viral infections"], "nice_to_know": [] },
      { "topic": "Shock & hemorrhage", "must_know": ["Definition", "Classification", "causes", "Clinical features", "Management"], "desirable_to_know": ["Blood groups", "Hemophilias", "Transfusion, blood products"], "nice_to_know": [] },
      { "topic": "Tumours, Ulcers, Cysts, Sinus, Fistulae", "must_know": ["Classification", "Clinical examination", "treatment"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Diseases of lymphatic System", "must_know": ["TB", "Secondaries"], "desirable_to_know": ["Lymphoma"], "nice_to_know": ["Leukemia"] },
      { "topic": "Diseases of Oral Cavity", "must_know": ["Oral Infections", "Premalignant malignant diseases of oral cavity", "Salivary gland"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Diseases of larynx & Nasopharynx", "must_know": ["Infective and malignant diseases"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Trachea", "must_know": ["Tracheostomy"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Nervous system", "must_know": ["Facial nerve", "Trigeminal neuralgia"], "desirable_to_know": ["Principles of peripheral nerve injuries, regeneration, treatment"], "nice_to_know": [] },
      { "topic": "Fractures", "must_know": ["Mandible", "Le Fort fracture"], "desirable_to_know": ["General principles of fractures, clinical presentation and treatment"], "nice_to_know": ["Newer methods"] },
      { "topic": "Principles of operative surgery", "must_know": ["Minor surgical procedures"], "desirable_to_know": ["Asepsis", "Antiseptics"], "nice_to_know": ["Sterlisation"] },
      { "topic": "Principles of anaesthesia", "must_know": [], "desirable_to_know": ["Sutures, Drains"], "nice_to_know": [] },
      { "topic": "Principles of tissue replacement", "must_know": [], "desirable_to_know": ["Diathermy"], "nice_to_know": ["Laser"] },
      { "topic": "Anomalies of Development of Face", "must_know": ["Cleft lip and cleft palate"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Thyroid and Parathyroid", "must_know": ["Thyroid disorders"], "desirable_to_know": ["Malignancy"], "nice_to_know": ["Parathyroid Disorders"] },
      { "topic": "Jaw Swellings", "must_know": ["Differential diagnosis and management"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Biopsy", "must_know": ["Different types of biopsies"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Application of ethics to the field of medicine and healthcare - includes medical ethics, research ethics, environmental ethics and public health ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Clinical demonstration in OPD", "hours": 40 },
      { "title": "Bedside clinics", "hours": 35 },
      { "title": "Operation Theatre observation", "hours": 10 },
      { "title": "Demonstration of emergency trauma care", "hours": 5 }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases as specified in Dental Council of India regulation for the students during clinical training and examinations.",
    "disciplines": null
  }
  $bds$::jsonb,
  -- ---- exam_scheme ---------------------------------------------------------
  $exam$
  {
    "components": [
      { "stream": "Theory",    "examination": 70, "internal_assessment": 10, "viva": 20,   "total": 100 },
      { "stream": "Practical", "examination": 90, "internal_assessment": 10, "viva": null, "total": 100 }
    ],
    "grand_total": 200,
    "no_theory_exam": false,
    "question_pattern": {
      "duration_hours": 3,
      "sections": [
        { "type": "Elaborate on",   "count": 2,  "marks_each": 10, "total": 20 },
        { "type": "Write notes on", "count": 10, "marks_each": 5,  "total": 50 }
      ],
      "total": 70,
      "notes": "The questions should cover different topics of General surgery"
    },
    "practical_exam": {
      "type": "cases and OSCE",
      "items": [
        { "name": "Long case",  "count": 1, "marks_each": 50, "total": 50 },
        { "name": "Short case", "count": 1, "marks_each": 30, "total": 30 },
        { "name": "OSCE",       "count": 2, "marks_each": 5,  "total": 10 }
      ],
      "total": 90,
      "viva": { "max": 20, "notes": "Instruments 10 + X rays and Specimen 10" },
      "criteria": "Long case 45 minutes - candidate should write case sheet with Provisional Diagnosis, Investigations and Treatment; Short case 15 minutes - only physical examination of patient is sufficient; OSCE each station 3 minutes."
    },
    "internal_assessment": {
      "frequency": "at least 3 times per year, best of two considered",
      "theory": 10, "practical": 10, "total": 20,
      "submission": "submitted to the University once every three months"
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": ["Bailey and Love 26th Edition", "Das Clinical Surgery", "Short Cases surgery Das"] }
    ]
  }
  $books$::jsonb,
  '351c76ad-33f2-4a39-8ede-9299465b70f4'   -- created_by (auth.users id)
)
ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE SET
  course_name      = EXCLUDED.course_name,
  course_credits   = EXCLUDED.course_credits,
  academic_model   = EXCLUDED.academic_model,
  academic_year    = EXCLUDED.academic_year,
  is_latest        = EXCLUDED.is_latest,
  is_archived      = EXCLUDED.is_archived,
  stream           = EXCLUDED.stream,
  bds_content      = EXCLUDED.bds_content,
  exam_scheme      = EXCLUDED.exam_scheme,
  textbooks        = EXCLUDED.textbooks,
  last_modified_by = EXCLUDED.created_by,
  last_modified_at = now();

-- ── 4213 Oral Pathology ──
INSERT INTO public.bos_course_syllabi (
  institutions_id, board_id, regulation_id,
  course_code, course_name, course_credits,
  academic_model, academic_year,
  version_number, is_latest, is_archived,
  stream,
  bds_content, exam_scheme, textbooks,
  created_by
) VALUES (
  'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
  'dcddfa03-d654-4f8e-a1e5-10a0e8072ca6',
  '747c51f3-01ad-468c-8bc7-5e89bf69c7ee',
  '4213', 'Oral Pathology Theory', NULL,
  'mgr_bds', 3,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The dental graduates during training in the institutions should acquire adequate knowledge, necessary skills and reasonable attitudes which are required for carrying out all activities appropriate to general dental practice involving prevention, diagnosis and treatment of anomalies and diseases, of the teeth, mouth, jaws and associated tissues. The graduate also should understand the concept of community oral health education and be able to participate in the rural health care delivery programmes existing in the country.",
    "objectives": {
      "knowledge": [
        "Adequate knowledge of the scientific foundations on which dentistry is based and good understanding of various relevant scientific methods, principles of biological functions; ability to evaluate and analyse scientifically various established facts and data",
        "Adequate knowledge of the development, structure and function of the teeth, mouth and jaws and associated tissues both in health and disease and their relationship and effect on general state of health and also bearing on physical and social well-being of the patient",
        "Adequate knowledge of clinical disciplines and methods which provide a coherent picture of anomalies, lesions and diseases of the teeth, mouth and jaws and preventive diagnostic and therapeutic aspects of dentistry",
        "Adequate clinical experience required for general dental practice",
        "Adequate knowledge of the constitution, biological function and behavior of persons in health and sickness as well as the influence of the natural and social environment on the state of health in so far as it affects dentistry"
      ],
      "skills": [
        "Diagnose and manage various common dental problems encountered in general dental practice keeping in mind the expectations and the right of the society to receive the best possible treatment available wherever possible",
        "Prevent and manage complications if encountered while carrying out various surgical and other procedures",
        "Carry out certain investigative procedures and ability to interpret laboratory findings",
        "Promote oral health and help prevent oral diseases where possible",
        "Control pain and anxiety among the patients during dental treatment"
      ],
      "attitude": [
        "Willingness to apply the current knowledge of dentistry in the best interest of the patient and community",
        "Maintain a high standard of professional ethics and conduct and apply these in all aspects of professional life",
        "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community",
        "Willingness to participate in the CPED Programmes to update knowledge and professional skill from time to time",
        "Help and participate in the implementation of the national oral health policy"
      ],
      "integration": [
        "To understand the process of disease mechanism and consequential outcome",
        "To interpret radiological and/or laboratory features to make reliable pathological diagnosis, and thereby, to manage human health and disease",
        "In addition by integration of sound basic knowledge into clinical practice will enable students to develop and advance their skills for the betterment of patient care by applying scientific method either for critical appraisal of evidence based medicine or to pursue independent research relevant to medical/dental practice"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses and online courses"
      ]
    },
    "competencies": [
      { "group": "General skills", "items": [] },
      { "group": "Practice Management", "items": [] },
      { "group": "Communication and Community Resources", "items": [] },
      { "group": "Patient Care - Diagnosis", "items": [] },
      { "group": "Patient Care - Treatment Planning", "items": [] },
      { "group": "Competencies specific to the subject", "items": [] }
    ],
    "teaching_hours": { "lecture": 145, "practical": 130, "total": 275, "note": "Lecture: 25 hours (2nd BDS) + 120 hours (3rd BDS) = 145. Practical/clinical: 50 hours (2nd BDS) + 80 hours (3rd BDS) = 130." },
    "teaching_methodology": [
      "Class room lecture",
      "Slide demonstration",
      "Tutorials",
      "Problem-solving"
    ],
    "theory_syllabus": [
      { "topic": "Introduction", "must_know": ["A bird's eye view of the different pathological processes involving the oral cavity & oral cavity involvement in systemic diseases to be brought out", "Interrelationship between General Medicine, General Surgery and Oral Pathology is to be emphasised"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Developmental disturbances of teeth, jaws and soft tissues of oral and paraoral region: Introduction to developmental disturbances - Hereditary, Familial mutation, Hormonal etc. causes to be highlighted", "must_know": ["Developmental disturbances of teeth - Etiopathogenesis, clinical features, radiological features and histopathological features as appropriate", "The size, shape, number, structure and eruption of teeth and clinical significance of the anomalies to be emphasized", "Forensic Odontology", "Developmental disturbances of the jaws - size and shape of the jaws", "Developmental disturbances of oral and paraoral soft tissues - lip and palate - clefts, tongue, gingival, mouth, salivary glands and face"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental caries", "must_know": ["Definition", "Clinical features", "Clinical types", "Diagnosis", "Caries microbiology", "Aetiopathogenesis - Theories of caries with emphasis on ecologic plaque hypothesis, specific and non-specific plaque hypothesis", "Histopathology", "Immunology", "Complication/sequelae of dental caries"], "desirable_to_know": ["Caries preventive measures"], "nice_to_know": [] },
      { "topic": "Pulp and periapical pathology and osteomyelitis", "must_know": ["Aetiopathogenesis and their interrelationship", "Clinical features", "Types of pulpitis", "Microbiology", "Radiology", "Histopathology", "Periapical diseases", "Definition, classification, clinical features and diagnosis of osteomyelitis", "Sequelae of periapical abscess - summary of space infections, systemic complications and significance"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Periodontal disease", "must_know": ["Aetiopathogeneis and interrelationship", "Clinical features", "Radiology", "Microbiology", "Histopathology", "Gingivitis", "Desquamative gingivitis", "Gingival enlargements", "Periodontitis"], "desirable_to_know": ["Basic immunological mechanisms of periodontal disease to be highlighted"], "nice_to_know": [] },
      { "topic": "Microbial infection of soft tissue: Microbiology, defence mechanisms including immunological aspects, oral manifestation, Histopathology and laboratory diagnosis of common bacterial, viral and fungal infections namely", "must_know": ["Bacterial: Tuberculosis, syphilis, ANUG and its complications, Cancrum Oris, Actinomycosis", "Viral: Herpes Simplex infections, Varicella Zoster, Measles, Mumps, Epstein-Barr virus, HIV infection", "Fungal: Relevant superficial mycosis", "Aphthous ulcers"], "desirable_to_know": ["Relevant deep mycosis"], "nice_to_know": [] },
      { "topic": "Common non-inflammatory diseases involving jaws", "must_know": ["Aetiopathogenesis, clinical features, radiological and laboratory values in diagnosis of: Osteogenesis imperfecta, Rickets, Cleidocranial dysplasia, Achondroplasia, Marfan's syndrome, Down's syndrome"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Diseases of TM Joint", "must_know": ["Ankylosis, summary of different types of arthritis and other developmental malformations, traumatic injuries and myofascial pain dysfunction syndrome"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Cysts of oral and paraoral region. Cysts of odontogenic origin, non-odontogenic cysts, pseudocysts of jaws and soft tissue cysts of oral and paraoral region", "must_know": ["Epidemiology", "Classification", "Histogenesis", "Aetiopathogenesis", "Definition", "Clinical features", "Radiology", "Histopathology", "Laboratory features"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Tumors of the oral cavity", "must_know": ["Classification of odontogenic tumors, non-odontogenic tumors and Salivary gland tumors with reference to: Epidemiology, Classification, Histogenesis, Aetiopathogenesis, Definition, Clinical features, Radiology, Histopathology, Laboratory features"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Odontogenic Tumors - All Lesions", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Non-Odontogenic Tumors", "must_know": ["Benign Epithelial (Papilloma, Keratoacanthoma and Naevi)", "Malignant epithelial (Basal cell carcinoma, Verrucous Carcinoma, Squamous Cell Carcinoma and Malignant Melanoma)"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Mesenchymal Tumors", "must_know": ["Benign Tumors: Fibroma, Aggressive fibrous lesions, Lipoma, Haemangioma, Lymphangioma, Neurofibroma, Schwannoma, Chondroma, Osteoma, Tori"], "desirable_to_know": ["Malignant Tumors: Fibrosarcoma, Osteosarcoma, Giant cell tumor, Chondrosarcoma, Angiosarcoma, Kaposi sarcoma, Lymphomas, Ewing's sarcoma"], "nice_to_know": ["Others such as osteoid osteoma / osteoblastoma / Osteochondroma"] },
      { "topic": "Salivary Gland Tumors", "must_know": ["Benign Tumors: Pleomorphic adenoma", "Malignant Tumors: Adenoid cystic carcinoma, Mucoepidermoid carcinoma"], "desirable_to_know": ["Oncocytoma", "Warthins tumor"], "nice_to_know": ["Acinic cell carcinoma", "Adenocarcinoma NOS"] },
      { "topic": "Tumors of disputed origin", "must_know": ["Melanotic neuroectodermal tumor of infancy", "Congenital epulis", "Granular cell myoblastoma"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Metastatic tumors to and from oral cavity and their routes of metastasis", "must_know": ["General characteristics"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Fibro-osseous / Giant cell / and related lesions", "must_know": ["Fibrous dysplasia", "Cemento-osseous dysplasia", "Ossifying fibroma", "Paget's disease", "Central giant cell granuloma", "Aneurysmal bone cyst", "Cherubism", "Hyperparathyroidism"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Traumatic, reactive and regressive lesions of oral cavity", "must_know": ["Pyogenic granuloma, exostoses, fibrous hyperplasia, traumatic ulcer and traumatic neuroma", "Attrition, abrasion, erosion, bruxism, hypercementosis, dentinal changes, pulp calcifications and resorption of teeth", "Radiation effects of oral cavity, summary of physical and chemical injuries including allergic reactions of the oral cavity", "Healing of oral wounds and complications - Dry socket"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Non neoplastic salivary gland diseases", "must_know": ["Definition", "Classification", "Epidemiology", "Pathogenesis", "Clinical features", "Histopathology of the following: Sialolithiasis, Sialosis, Sialadenitis, Xerostomia, Ptyalism"], "desirable_to_know": ["Necrotizing sialometaplasia", "Sjogren's syndrome"], "nice_to_know": [] },
      { "topic": "Systemic diseases involving oral cavity: Brief review and oral manifestations, diagnosis and significance of common blood, nutritional, hormonal and metabolic diseases of oral cavity", "must_know": ["White blood cell diseases", "Red blood cell diseases", "Thyroid diseases", "Hyperparathyroidism", "Vitamin A", "Vitamin B complex", "Vitamin C deficiency", "Vitamin D deficiency", "Recurrent Apthous disease"], "desirable_to_know": ["Progressive systemic sclerosis", "Wegener's granulomatosis", "Orofacial granulomatosis", "Sarcoidosis"], "nice_to_know": [] },
      { "topic": "Mucocutaneous lesions", "must_know": ["Lichen planus", "Pemphigus", "Pemphigoid", "Lupus erythematosus", "Erythema multiforme"], "desirable_to_know": ["Psoriasis", "Scleroderma", "Ectodermal dysplasia", "Epidermolysis bullous", "White sponge nevus"], "nice_to_know": [] },
      { "topic": "Diseases of nerves: Facial neuralgias", "must_know": ["Trigeminal", "Glossopharyngeal", "VII nerve paralysis", "Burning mouth syndrome"], "desirable_to_know": ["Causalgia", "Psychogenic facial pain"], "nice_to_know": [] },
      { "topic": "Pigmentation of oral and paraoral region and discolouration of teeth", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Diseases of maxillary sinus", "must_know": ["Traumatic injuries to sinus, sinusitis, cysts and tumors involving antrum"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Oral Precancer-Cancer", "must_know": ["Epidemiology", "Aetiology", "Clinical and Histopathological features", "TNM classification"], "desirable_to_know": ["Recent advances in diagnosis, management and prevention", "Biopsy: Types of biopsy, Value of biopsy, Cytology"], "nice_to_know": ["Histochemistry and frozen sections in diagnosis of oral diseases"] },
      { "topic": "Principles of Basic Forensic Odontology", "must_know": ["Introduction, definition, aims and scope", "Sex and ethnic (racial) differences in tooth morphology and histological age estimation", "Determination of sex and blood groups from buccal mucosa/saliva", "DNA methods", "Bite marks, rugae pattern and lip prints", "Dental importance of poisons and corrosives", "Overview of forensic"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Introduction to ethics", "Ethics of the individual", "Professional ethics"], "desirable_to_know": ["Research ethics", "Ethical workshop of cases"], "nice_to_know": ["Gathering all scientific factors", "Gathering all value factors", "Identifying working our criteria towards decisions"] },
      { "topic": "Jurisprudence", "must_know": ["Medical negligence and liability", "Informed consent and confidentiality", "Rights and duties of doctors and patients", "Medical and dental ethics (as per Dentists' Act and Medical Council Acts, etc)"], "desirable_to_know": ["Fundamentals of law and the constitution", "Medical legislation and statutes (Dental Council Acts, etc)", "Basics of civil law (including torts, contracts and consumer protection act)", "Criminal and civil procedure code (including expert witness requirement)", "Assessment and quantification of dental injuries in courts of law"], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Procedures - Histopathological slides of relevant diseases" },
      { "title": "Demonstrations - Spotters/specimens/radiographs" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching material as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
    "disciplines": null
  }
  $bds$::jsonb,
  -- ---- exam_scheme ---------------------------------------------------------
  $exam$
  {
    "components": [
      { "stream": "Theory",     "examination": 70, "internal_assessment": 10, "viva": 20,   "total": 100 },
      { "stream": "Practicals", "examination": 90, "internal_assessment": 10, "viva": null, "total": 100 }
    ],
    "grand_total": 200,
    "no_theory_exam": false,
    "question_pattern": {
      "duration": "3 Hours",
      "sections": [
        { "type": "Elaborate on",  "count": 2,  "marks_each": 10, "total": 20 },
        { "type": "Write Notes on", "count": 10, "marks_each": 5,  "total": 50 }
      ],
      "total": 70
    },
    "practical_exam": {
      "items": [
        { "name": "Slides",  "count": 12, "marks_each": 5, "total": 60 },
        { "name": "Spotter", "count": 6,  "marks_each": 5, "total": 30 }
      ],
      "total": 90,
      "viva": { "max": 20 }
    },
    "internal_assessment": {
      "theory": 10,
      "practical": 10,
      "total": 20,
      "frequency": "Continuing assessment examination (both Theory/Practical) held at least 3 times in a particular year and best of two examinations should be considered. Internal Assessment marks submitted to the University once in every three months."
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Textbooks", "books": ["Oral Pathology - Soames & Southam", "Contemporary Oral and Maxillofacial pathology - Sapp, Eversole, Wysocki"] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": ["A Text Book of Oral Pathology - Shafer, Hine & Levy", "Oral Pathology - Regezi & Sciubba", "Oral Pathology in trophics - Prabhu, Wilson, Johnson & Daftary", "Oral & Maxillofacial Pathology - Neville, Damm, Allen & Chi", "Medical Ethics - Francis", "Oral pathology - Soames & Southam"] }
    ]
  }
  $books$::jsonb,
  '351c76ad-33f2-4a39-8ede-9299465b70f4'   -- created_by (auth.users id)
)
ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE SET
  course_name      = EXCLUDED.course_name,
  course_credits   = EXCLUDED.course_credits,
  academic_model   = EXCLUDED.academic_model,
  academic_year    = EXCLUDED.academic_year,
  is_latest        = EXCLUDED.is_latest,
  is_archived      = EXCLUDED.is_archived,
  stream           = EXCLUDED.stream,
  bds_content      = EXCLUDED.bds_content,
  exam_scheme      = EXCLUDED.exam_scheme,
  textbooks        = EXCLUDED.textbooks,
  last_modified_by = EXCLUDED.created_by,
  last_modified_at = now();


COMMIT;
