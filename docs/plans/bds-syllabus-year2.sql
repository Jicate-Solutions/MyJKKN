-- ============================================================================
-- BoS DCH / BDS — SYLLABUS BATCH: YEAR II  (UPSERT — safe to re-run)
-- ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE.
-- Generated 2026-08-08 from parallel extraction. Scope: DCH / BDS / reg 2018.
-- Requires migration 20260807_bos_syllabus_bds_dental_model.sql.
-- ============================================================================

BEGIN;

-- ── 4206A General Pathology ──
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
  '4206A', 'General Pathology', NULL,          -- DCI model: no credits
  'mgr_bds', 2,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "At the end of the course the student should be competent to: Apply the scientific study of disease processes, which result in morphological and functional alterations in cells, tissues and organs to the study of pathology and the practice of dentistry.",
    "objectives": {
      "knowledge": [
        "To demonstrate and analyze pathological changes at macroscopic and microscopic levels and explain their observations in terms of disease processes.",
        "To integrate knowledge from the basic sciences, clinical medicine and dentistry in the study of Pathology.",
        "To demonstrate understanding of the capabilities and limitations of morphological pathology in its contribution to medicine, dentistry and biological research.",
        "To demonstrate ability to consult resource materials outside lectures, laboratory and tutorial classes."
      ],
      "skills": [
        "A dental graduate should be able to identify the abnormal diseases like tumor, non tumours and also to arrive what are the investigations needed for the diagnosis of the diseases.",
        "Carry out certain investigations and ability to interpret lab findings."
      ],
      "attitude": [
        "A dental student must be willing to apply the knowledge gained in pathology in the best interest of the patient and the community.",
        "Maintain a high standard of professional ethics in patient care and also in carrying out the diagnostic modalities.",
        "Willing to update knowledge in pathological conditions and diagnostic investigations from time to time."
      ],
      "integration": [
        "The dental student must be able to integrate the pathological aspects with the diseases so that it helps to understand the disease nature and management of the disease."
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal."
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses and online courses."
      ]
    },
    "competencies": [
      { "group": "General skills", "items": [] },
      { "group": "Practice Management", "items": [] },
      { "group": "Communication and Community Resources", "items": [] },
      { "group": "Patient Care - Diagnosis", "items": [] },
      { "group": "Patient Care - Treatment Planning", "items": [] },
      { "group": "Competencies specific to subject", "items": [] }
    ],
    "teaching_hours": { "lecture": 55, "practical": 55, "total": 110 },
    "teaching_methodology": [
      "Lectures, symposiums, vertical and horizontal integrated teachings, viva voce, CMEs etc.",
      "Lectures",
      "Lecture Demonstrations",
      "Practical exercises",
      "Audio visual aids",
      "Small group discussions with regular feedback from the students",
      "Integrated Teaching",
      "Symposium and continuing medical education programmes"
    ],
    "theory_syllabus": [
      {
        "topic": "Introduction",
        "must_know": [
          "Cellular responses to stress & noxious stimuli, cellular adaptation of growth & differentiation (hyperplasia, hypertrophy, atrophy & metaplasia)",
          "Cell injury and cell death (cause & mechanism of reversible & irreversible injury)",
          "Morphology of cell injury (reversible & necrosis), examples of cell injury and necrosis (ischemic, hypoxic, reperfusion and chemical injuries)",
          "Apoptosis and sub-cellular responses to injury",
          "Intracellular accumulation, calcification & cellular aging (Lipid, protein, glycogen and pigment accumulation; pathologic calcification; ageing)"
        ],
        "desirable_to_know": [],
        "nice_to_know": [
          "Historical aspects; definition of terms; introduction to pathology, its applications and role in patient management."
        ]
      },
      {
        "topic": "Inflammation / Repair",
        "must_know": [
          "Introduction to body's immune response (innate & adaptive immunity; cells and tissues of immune system; cytokines; structure & function of HLA)",
          "General features of inflammation; history; stimuli for acute inflammation; vascular events; cellular events - leucocyte adhesion and transmigration",
          "Continuation of cellular events (chemotaxis, phagocytosis, defects of leucocyte function); termination of acute inflammatory response; outcome of acute inflammation; morphological patterns of acute inflammation",
          "Chemical mediators (vasoactive amines; plasma proteins; AA metabolites; PAF; cytokines; chemokines; leucotrienes; NO; free radicals & neuropeptides)",
          "Chronic inflammation (cause, morphological features; cells of chronic inflammation; granuloma; systemic effects of inflammation; consequences of excessive/defective inflammation)",
          "Repair (healing; scar formation; cutaneous wound healing)",
          "Repair (continued) (healing at special sites; factors affecting wound healing)"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "Haemodynamic disturbances",
        "must_know": [
          "Oedema, Hypotension, congestion, haemorrhage & haemostasis",
          "Thrombosis & embolism, Infarction, Shock"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "Disorders of Immunity",
        "must_know": [
          "Disorders of immunity - mechanisms of hypersensitivity, Graft Rejection",
          "Autoimmunity - SLE",
          "Primary & secondary immunodeficiency"
        ],
        "desirable_to_know": [],
        "nice_to_know": [
          "Rheumatoid arthritis, systemic sclerosis, Sjogren's, MCD, Amyloidosis"
        ]
      },
      {
        "topic": "Neoplasia",
        "must_know": [
          "Definition, nomenclature, biology of tumour growth, differences between benign & malignant tumours",
          "Tumour spread & epidemiology",
          "Molecular basis of Neoplasia (essential alterations for malignant transformation, oncogenes, suppressor genes)",
          "Evasion of apoptosis; defects in DNA repair, telomerase and angiogenesis; invasion & metastasis; dysregulation of genes",
          "Carcinogenesis (carcinogenic agents, molecular basis of carcinogenesis)",
          "Host defense, tumour immunity, clinical features, and laboratory diagnosis."
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "Infectious diseases",
        "must_know": [
          "Mycobacterial infections - tuberculosis",
          "Fungal & parasitic infections"
        ],
        "desirable_to_know": [
          "HIV & Hepatitis Viruses and others",
          "Pathology of common viral & bacterial infections (CMV, EBV, HPV, viruses, gram positive & negative bacterial infections)"
        ],
        "nice_to_know": [
          "Typhoid, syphilis",
          "General principles (categories, transmission & dissemination of microbes, mechanisms of microbial disease, immune evasion, infections in immunosuppressed hosts, tissue response to microbes)"
        ]
      },
      {
        "topic": "Nutritional diseases",
        "must_know": [
          "Nutritional diseases"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "RBC & bleeding disorders",
        "must_know": [
          "Development of haematopoietic cells, bone marrow, classification of anaemia",
          "Iron deficiency anaemia, Megaloblastic anaemia",
          "Bleeding disorders - classification, disorders of platelets",
          "Coagulation disorders"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "WBC, lymph node, spleen",
        "must_know": [
          "Leukaemia - classification, aetiology, acute leukaemias.",
          "Chronic leukaemias, MDS, other chronic myeloproliferative disorders including myelofibrosis",
          "Hodgkin Lymphoma",
          "Blood banking"
        ],
        "desirable_to_know": [
          "Non-neoplastic quantitative and qualitative disorders of leucocytes",
          "Non-neoplastic disorders of lymph node, spleen & thymus; classification of lymphoma"
        ],
        "nice_to_know": []
      },
      {
        "topic": "Systemic Pathology",
        "must_know": [
          "Atherosclerosis",
          "Hypertension, vasculitis"
        ],
        "desirable_to_know": [],
        "nice_to_know": [
          "Congenital anomalies, aneurysms, tumors."
        ]
      },
      {
        "topic": "The Heart",
        "must_know": [
          "Ischemic heart disease & myocardial infarction",
          "Rheumatic fever; Infective endocarditic"
        ],
        "desirable_to_know": [],
        "nice_to_know": [
          "Congenital heart disease, diseases of the myocardium, tumors of the heart; diseases of the pericardium"
        ]
      },
      {
        "topic": "Head and neck",
        "must_know": [
          "Benign and malignant lesions of head and neck including oral cavity, salivary glands"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "Kidney",
        "must_know": [
          "Nephrotic syndrome - pathogenesis and pathology"
        ],
        "desirable_to_know": [],
        "nice_to_know": [
          "Normal structure, congenital anomalies, cystic disease, laboratory tests in renal disease."
        ]
      },
      {
        "topic": "Endocrine system",
        "must_know": [
          "Diabetes mellitus"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "Bone & Joints",
        "must_know": [
          "Infections, metabolic disease of bone",
          "Bone tumours / Jaw tumours"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      },
      {
        "topic": "Bioethics",
        "must_know": [
          "Bioethics is the application of ethics to the field of medicine and healthcare. Bioethics includes medical ethics, which focuses on issues in health care; research ethics, which focuses issues in the conduct of research; Environmental ethics, which focuses on issues pertaining to the relationship between human activities and the environment and public health ethics."
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      }
    ],
    "practicals": [
      { "title": "Procedure: Urine - Tests for Abnormal constituents (Sugar, albumin, ketone bodies, Blood, bile salts, bile pigments)" },
      { "title": "Procedure: Haemoglobin (Hb) estimation as OSPE" },
      { "title": "Procedure: Total WBC count from the peripheral smear" },
      { "title": "Procedure: Differential WBC Count and commenting on the peripheral smear" },
      { "title": "Procedure: Blood grouping as OSPE" },
      { "title": "Demonstration: Packed Cell Volume (PCV), Erythrocyte Sedimentation Rate (ESR)" },
      { "title": "Demonstration: Bleeding Time & Clotting Time" },
      { "title": "Demonstration: Histopathology Tissue Processing & Staining" },
      { "title": "Demonstration: Histopathology slides" },
      { "title": "Histopathology slides for study: Acute appendicitis, Granulation tissue, Fatty liver, CVC lung, CVC liver, CVC Spleen, Lipoma, Teratoma, Tuberculosis of Lymph node, Maduramycosis, Actinomycosis, Rhinosporidiosis, Basal cell Carcinoma, Squamous cell Carcinoma, Malignant melanoma, Ameloblastoma, Squamous papilloma, Hodgkins Lymphoma, Pleomorphic adenoma, Cavernous hemangioma, Capillary hemangioma, Osteosarcoma, Osteoclastoma" },
      { "title": "Haematology slides for study: Iron deficiency anemia, Acute Myeloid Leukemia, Chronic Myeloid Leukemia, Eosinophilia" },
      { "title": "List of specimens: Acute appendicitis, Fatty liver, CVC lung, CVC Liver, Infarct spleen, TB lymph Node, Lipoma, Myxoma, Chondroma, Squamous cell carcinoma, Pleomorphic adenoma, Teratoma, Malignant Melanoma" },
      { "title": "Instruments: RBC Pipette, WBC Pipette, ESR Westergren's tube, SAHLI'S haemoglobinometer, PCV tube, Bone marrow biopsy needle, Bone marrow aspiration needle" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
    "disciplines": null
  }
  $bds$::jsonb,
  -- ---- exam_scheme ---------------------------------------------------------
  $exam$
  {
    "components": [
      { "stream": "Theory",    "examination": 35, "internal_assessment": 5, "viva": 10,   "total": 50 },
      { "stream": "Practical", "examination": 45, "internal_assessment": 5, "viva": null, "total": 50 }
    ],
    "grand_total": 100,
    "no_theory_exam": false,
    "question_pattern": {
      "part": "Part A - Pathology",
      "sections": [
        { "type": "Essay",         "count": 1, "marks_each": 10, "total": 10 },
        { "type": "Short notes",   "count": 3, "marks_each": 5,  "total": 15 },
        { "type": "Short Answers", "count": 5, "marks_each": 2,  "total": 10 }
      ],
      "total": 35
    },
    "practical_exam": {
      "type": "experiments_ospe_spotters",
      "lab_experiments_total": 45,
      "items": [
        { "name": "Major experiment - Haematology: Peripheral smear / DC", "marks": 15, "duration": "45 Minutes" },
        { "name": "Urine analysis", "marks": 10, "duration": "30 Minutes" },
        { "name": "Minor experiment (OSPE) for Hb%", "marks": 10, "duration": "20 Minutes" },
        { "name": "Spotters", "marks": 10, "duration": "20 Minutes" }
      ],
      "spotters": ["Histopathology slides", "Haematology slides", "Gross specimens", "Instruments"],
      "viva": { "max": 10 }
    },
    "internal_assessment": {
      "theory": 5,
      "practical": 5,
      "total": 10,
      "frequency": "Continuing assessment (both Theory/Practical) held at least 3 times per year, best of two considered; Internal Assessment marks submitted to the University once every three months.",
      "topics": [
        "Cell injury and adaptations, Inflammation, wound healing",
        "Hemodynamic changes, Neoplasia",
        "Infectious diseases, Nutritional disorders",
        "Disorders of circulations, Immunity, Diseases of oral cavity",
        "Diseases of the salivary glands, Bones, cardiovascular system",
        "Hematology (RBC, WBC and platelets, lymph node, spleen and thymus)"
      ]
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": [
        "Robbins BASIC PATHOLOGY - by Kumar, Abbas and Aster - 1st South Asia edition",
        "Text book of Pathology by Harsh Mohan, 7th Edition",
        "Anderson's Pathology Volume 1 and 2 by Ivan Damjanov & James Linder",
        "Wintrobe's Clinical Hematology by Lee, Bithell, Forster"
      ] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": [
        "Robbins - Pathologic Basis of Diseases by Kumar and Kotran, 10th Edition",
        "Ackermann Surgical Pathology",
        "Microbiology - Prescott, et al.",
        "Microbiology - Bernard D. Davis, et al.",
        "Clinical & Pathogenic Microbiology - Barbara J Howard, et al.",
        "Mechanisms of Microbial diseases - Moselio Schechter, et al.",
        "Immunology an Introduction - Tizard",
        "Immunology 3rd edition - Evan Roitt, et al."
      ] }
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

-- ── 4206B Microbiology ──
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
  '4206B', 'Microbiology', NULL,          -- DCI model: no credits
  'mgr_bds', 2,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
{
  "goal": "To introduce the students to the exciting world of microbes and to provide an understanding of various branches of Microbiology, in order to deal with the etiology, pathogenesis, laboratory diagnosis, treatment, control and prevention of infections in dental practice.",
  "objectives": {
    "knowledge": [
      "Understand the basics of various branches of Microbiology and able to apply the knowledge relevantly.",
      "Apply the knowledge gained in related medical subjects like General Medicine and General Surgery and Dental subjects like Oral Pathology, Community Dentistry, Periodontics, Oral Surgery, Pedodontics, Conservative Dentistry and Oral Medicine in higher classes.",
      "Understand and practice various methods of Sterilisation and disinfection in dental clinics.",
      "Have a sound understanding of various infectious diseases and lesions in the oral cavity.",
      "Awareness of Health care associated infections and their prevention in dental practice"
    ],
    "skills": [
      "Student should have acquired the skill to diagnose, differentiate various oral lesions.",
      "Should be able to select, collect and transport clinical specimens to the laboratory.",
      "Should be able to carry out proper aseptic procedures in the dental clinic.",
      "Interpretation of antimicrobial susceptibility tests and to make right choice of antibiotic based on spectrum of infection and ensure appropriate use to avoid antibiotic resistance."
    ],
    "attitude": [
      "To apply knowledge in the interest of the individual patient and community.",
      "Maintain high standards of professional ethics in patient care and in carrying out diagnostic tests.",
      "To update knowledge from time to time with regard to diagnostics and immunoprophylaxis."
    ],
    "integration": [
      "At the end of integrated teaching the student shall acquire integrated knowledge from different disciplines which includes etiology, morphology, pathogenesis, clinical features, laboratory diagnosis, treatment, prevention and control of infectious diseases."
    ],
    "infection_control": [
      "Knowledge about asepsis – disinfection and sterilisation: of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes.",
      "Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal."
    ],
    "computer_proficiency": [
      "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses and online courses.",
      "Technological Requirements for all Graduate Students: a laptop or desktop computer that supports operating system requirements, internet browser requirements, reliable and consistent access to the internet, antivirus software which is current and consistently updated, Microsoft Office, and Adobe Reader (or equivalent to view PDF files)."
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
      "group": "Communication to Community Resources",
      "items": []
    },
    {
      "group": "Patient Care – Diagnosis",
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
    "lecture": 65,
    "practical": 50,
    "total": 115
  },
  "teaching_methodology": [
    "Lectures",
    "Lecture Demonstrations",
    "Practical exercises",
    "Audio visual aids",
    "Small group discussions with regular feed back from the students",
    "Integrated Teaching",
    "Symposium and continuing medical education programmes."
  ],
  "theory_syllabus": [
    {
      "topic": "Introduction, History and Morphology",
      "must_know": [
        "Noble laureates and their contributions to medical microbiology, Detailed contributions of Louis Pasteur, and Robert Koch",
        "Morphology, physiology, classification of bacteria, different methods of staining",
        "Sterilization and disinfection including sterilization controls",
        "Different types of culture media and culture techniques including anaerobic culture methods.",
        "Specimen Collection, Transport processing and Identification of bacteria",
        "Infection - source, mode of transmission and types of infectious disease"
      ],
      "desirable_to_know": [
        "Bacterial genetics and drug resistance in bacteria"
      ],
      "nice_to_know": [
        "Testing of disinfectants"
      ]
    },
    {
      "topic": "Immunology",
      "must_know": [
        "Immunity",
        "Antigen",
        "Immunoglobulins",
        "Structure and functions of immune system",
        "Antigen - Antibody reactions",
        "Immune response",
        "Hypersensitivity",
        "Auto immunity, classification with special reference to autoimmune disorders involving oral cavity.",
        "Immunodeficiency disorders - various types and disorders relevant to dentistry",
        "Immunology of transplantation and malignancy"
      ],
      "desirable_to_know": [
        "Complement system",
        "Immunohaematology"
      ],
      "nice_to_know": [
        "Flow cytometry in the diagnosis of malignancies",
        "Vaccines against tumors"
      ]
    },
    {
      "topic": "Systematic bacteriology",
      "must_know": [
        "Gram positive cocci - Staphylococcus, Streptococcus with special reference to Viridans group, Pneumococcus",
        "Gram negative cocci – Meningococcus and Gonococcus",
        "Corynebacterium diphtheria including immunoprophylaxis",
        "Clostridium – Gas Gangrene, Tetanus and food poisoning",
        "Mycobacteria - M.tuberculosis and M.leprae",
        "Non sporing anaerobes – classification, pathogenesis, Laboratory diagnosis and treatment.",
        "Spirochaetes - Treponema, Borrelia vincenti",
        "Actinomycetes",
        "Normal flora of oral cavity"
      ],
      "desirable_to_know": [
        "Enterobacteriaceae",
        "Vibrio cholera"
      ],
      "nice_to_know": [
        "MDR and XDR TB",
        "Agents of Bioterrorism"
      ]
    },
    {
      "topic": "Virology",
      "must_know": [
        "General properties, resistance cultivation of viruses, host virus interactions with special reference to interferon",
        "Laboratory diagnosis, Viral vaccines",
        "Herpes virus",
        "Measles, Mumps and Rubella",
        "Rabies virus",
        "Hepatitis B and Hepatitis C virus, HBV vaccine",
        "Human Immunodeficiency virus"
      ],
      "desirable_to_know": [
        "Bacteriophage structure and significance",
        "Cultivation of viruses"
      ],
      "nice_to_know": [
        "Influenza A and B viruses"
      ]
    },
    {
      "topic": "Mycology",
      "must_know": [
        "Introduction, classification, Laboratory diagnosis",
        "Candidosis, Rhinosporidiosis",
        "Systemic mycoses and associated oral lesions."
      ],
      "desirable_to_know": [
        "Opportunistic fungal infections"
      ],
      "nice_to_know": [
        "Antifungal susceptibility testing methods"
      ]
    },
    {
      "topic": "Parasitology",
      "must_know": [
        "Introduction, different modes of transmission and prevention",
        "Entamoeba histolytica, Entamoeba gingivalis",
        "Malarial parasites",
        "Leishmania including L.brasiliensis",
        "Common helminthic infections – Tape worms, Ascaris lumbricoides, Ancylostoma duodenale, Trichuris trichura and Enterobius vermicularis."
      ],
      "desirable_to_know": [
        "Protozoa Giardia intestinalis, Trichomonas species.",
        "Wuchereria bancrofti"
      ],
      "nice_to_know": [
        "Parasitic infections in HIV"
      ]
    },
    {
      "topic": "Applied Microbiology",
      "must_know": [
        "Standard precautions",
        "Infection control measures in dental setting",
        "Significance of antibiotic susceptibility testing, its interpretation",
        "Bio medical waste management guidelines",
        "Vaccination for Health care providers",
        "Needle stick injury and post exposure prophylaxis",
        "Blood borne infections"
      ],
      "desirable_to_know": [
        "STD infections",
        "Infective endocarditis",
        "Emerging and Re emerging infections"
      ],
      "nice_to_know": [
        "Antibiotic resistance (MRSA, ESBL etc.)"
      ]
    },
    {
      "topic": "Bioethics",
      "must_know": [
        "Bioethics is the application of ethics to the field of medicine and healthcare, including medical ethics, research ethics, environmental ethics and public health ethics.",
        "In microbiology, the maintenance of confidentiality is very important for the laboratory to gain confidence from the patients. Confidentiality is mandatory in certain tests like HIV testing.",
        "Counselling has to be given both before and after testing in HIV / AIDS setting.",
        "Written consent has to be always obtained from the patient for any procedure that can potentially harm the individual, particularly invasive techniques.",
        "Quarantining of people is done under special circumstances, adhering to ethical guidelines so that quarantine and isolation measures achieve their public health goals and promote the well-being of individuals."
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    }
  ],
  "practicals": [
    {
      "title": "Procedure: Simple stain, Hanging drop"
    },
    {
      "title": "Procedure: Grams stain"
    },
    {
      "title": "Procedure: Ziehl Neilsen's stain"
    },
    {
      "title": "Demonstration: Microscopy - Different types, parts, maintenance and usage"
    },
    {
      "title": "Demonstration: Sterilization and disinfection"
    },
    {
      "title": "Demonstration: Culture media including anaerobic culture media and transport media"
    },
    {
      "title": "Demonstration: Anaerobic culture methods"
    },
    {
      "title": "Demonstration: Biochemical reactions in the identification of bacteria"
    },
    {
      "title": "Demonstration: Virus models"
    }
  ],
  "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases / teaching materials as specified in Dental Council of India regulation for the students during clinical / practical training and examinations.",
  "disciplines": null
}
  $bds$::jsonb,
  -- ---- exam_scheme ---------------------------------------------------------
  $exam$
{
  "components": [
    {
      "stream": "Theory",
      "examination": 35,
      "internal_assessment": 5,
      "viva": 10,
      "total": 50
    },
    {
      "stream": "Practical",
      "examination": 45,
      "internal_assessment": 5,
      "viva": null,
      "total": 50
    }
  ],
  "grand_total": 100,
  "no_theory_exam": false,
  "question_pattern": {
    "part": "Part B – Microbiology",
    "essay": "1 X 10 = 10 Marks",
    "short_notes": "3 X 5 = 15 Marks",
    "short_answers": "5 X 2 = 10 Marks",
    "total": 35,
    "notes": "Essay from Systematic Bacteriology / Virology, General bacteriology, Immunology. Short Notes from Systematic bacteriology, Virology, Mycology, Parasitology, Applied Microbiology. Short Answers from General bacteriology, Immunology, Systematic bacteriology, Virology, Mycology, Parasitology and Applied Microbiology."
  },
  "practical_exam": {
    "type": "spotters",
    "items": [
      {
        "name": "Spotters",
        "count": 10,
        "marks_each": 2,
        "total": 20,
        "time": "30 mts"
      },
      {
        "name": "Gram staining (GPC, GNB, Mixture)",
        "total": 10,
        "time": "45 mts"
      },
      {
        "name": "Ziehl Neilsen's staining",
        "total": 10,
        "time": "60 mts"
      },
      {
        "name": "OSPE",
        "total": 5,
        "time": "45 mts"
      }
    ],
    "total": 45,
    "time": "180 mts (3 hrs)",
    "viva": {
      "max": 10,
      "notes": "To be conducted in the afternoon with appropriate time interval."
    },
    "ospe_note": "For OSPE, key to be prepared and made available to the examiners. e.g. Hand washing Technique, Bio medical waste segregation OR any other relevant topic of choice."
  },
  "internal_assessment": {
    "frequency": "The continuing assessment examination (both Theory / Practical) held at least 3 times in a particular year and best of two examinations shall be considered; Internal Assessment marks submitted to the university once every 3 months.",
    "theory": 5,
    "practical": 5,
    "total": 10
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
        "Text book of Microbiology – R.Ananthanarayan & C.K.Jayaram Paniker.",
        "Medical Microbiology – David Greenwood et al.",
        "Textbook of parasitology – K.D.Chatterjee",
        "Paniker's Text book of Medical Parasitology"
      ]
    }
  ],
  "reference_groups": [
    {
      "group": "Books for Further Reading / Reference",
      "books": [
        "Microbiology – Prescott, et al.",
        "Microbiology – Bernard D. Davis, et al.",
        "Clinical & Pathogenic Microbiology – Barbara J Howard, et al.",
        "Mechanisms of Microbial diseases – Moselio Schaechter, et al.",
        "Immunology – Donald M Weir",
        "Immunology 3rd edition – Evan Roitt, et al.",
        "Oral microbiology and infectious diseases – Burnett and Scherp",
        "Jawetz text book of microbiology"
      ]
    }
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

-- ── 4207 Pharmacology ──
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
  '4207', 'Pharmacology', NULL,          -- DCI model: no credits
  'mgr_bds', 2,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
{
  "goal": "The broad goal of teaching undergraduate students in pharmacology is to inculcate rational and scientific basis of therapeutics keeping in view of dental curriculum and profession.",
  "objectives": {
    "knowledge": [
      "Describe the pharmacokinetics and pharmacodynamics of essential and commonly used drugs in general and in dentistry in particular",
      "List the indications, contraindications, interactions and adverse reactions of commonly used drugs with reason",
      "Tailor the use of appropriate drugs in disease with consideration to its cost, efficacy, safety for individual and mass therapy needs",
      "Indicate special care in prescribing common and essential drugs in special medical situations such as pregnancy, lactation, old age, renal, hepatic damage and immunocompromised patients",
      "Integrate the rational drug therapy in clinical pharmacology",
      "Indicate the principles underlying the concepts of \"Essential drugs\""
    ],
    "skills": [
      "Prescribe drugs for common medical and dental ailments",
      "Appreciate adverse reactions and drug interactions of commonly used drugs",
      "Observe experiments designed for study of effects of drugs",
      "Critically evaluate drug formulations and be able to interpret the clinical pharmacology of marketed preparations commonly used in dentistry"
    ],
    "attitude": [
      "To develop the attitude to serve the rural community"
    ],
    "integration": [
      "Practical knowledge of use of drugs in clinical practice will be acquired through integrated teaching with clinical departments"
    ],
    "infection_control": [
      "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection and disposal of medical wastes in the appropriate modes",
      "Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
    ],
    "computer_proficiency": [
      "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes",
      "Basic operative skills in analysis of data and knowledge of multimedia",
      "Students should utilize a combination of traditional classroom courses and online courses; required technology validation includes a laptop or desktop supporting the operating system, internet browser, reliable internet access, current antivirus software, Microsoft Office and Adobe Reader (or equivalent to view PDF files)"
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
      "group": "Competencies Specific to the subject",
      "items": []
    }
  ],
  "teaching_hours": {
    "lecture": 70,
    "practical": 20,
    "total": 90
  },
  "teaching_methodology": [
    "Lectures",
    "Lecture Demonstrations",
    "Practical exercises",
    "Audio visual aids",
    "Small group discussions with regular feed back from the students",
    "Integrated Teaching",
    "Symposium and continuing medical education programmes"
  ],
  "theory_syllabus": [
    {
      "topic": "General Pharmacology (Introduction)",
      "must_know": [
        "New drug development - clinical trials, biomedical ethics",
        "Pharmacoeconomics",
        "Pharmacovigilance"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Systemic Pharmacology",
      "must_know": [
        "General Pharmacology",
        "Antibiotics",
        "NSAIDs",
        "Drugs acting on GI tract",
        "Local anesthetics",
        "Drugs acting on autonomic nervous system",
        "Insulin and oral hypoglycaemic drugs",
        "Corticosteroids",
        "Antiseptics and disinfectants"
      ],
      "desirable_to_know": [
        "Drugs acting on cardiovascular system",
        "Drugs acting on central nervous system",
        "Diuretics",
        "Drugs acting on blood",
        "General anesthetics",
        "Antineoplastic agents"
      ],
      "nice_to_know": [
        "Vitamins: Water soluble vitamins, vitamin D, vitamin K, vitamin E, implications of vitamins in clinical dentistry",
        "Vaccines"
      ]
    },
    {
      "topic": "Bioethics",
      "must_know": [
        "Bioethics is the application of ethics to the field of medicine and healthcare",
        "Includes medical ethics (issues in health care), research ethics (conduct of research), environmental ethics (relationship between human activities and the environment) and public health ethics"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    }
  ],
  "practicals": [
    {
      "title": "Procedures and demonstrations to familiarize the student with prescription writing and dispensing"
    },
    {
      "title": "Rationale of drug combinations of marketed drugs"
    }
  ],
  "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases / teaching materials as specified in Dental Council of India regulation for the students during clinical / practical training and examinations.",
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
    "total_marks": 70,
    "sections": [
      {
        "type": "Elaborate on",
        "count": 2,
        "marks_each": 10,
        "total": 20
      },
      {
        "type": "Write notes",
        "count": 10,
        "marks_each": 5,
        "total": 50
      }
    ]
  },
  "practical_exam": {
    "type": "Dispensing pharmacy, Prescription and OSPE",
    "items": [
      {
        "name": "Dispensing pharmacy",
        "count": 2,
        "marks_each": 25,
        "total": 50
      },
      {
        "name": "Prescription",
        "count": 2,
        "marks_each": 10,
        "total": 20
      },
      {
        "name": "OSPE",
        "count": 2,
        "marks_each": 10,
        "total": 20
      }
    ],
    "total": 90,
    "viva": {
      "max": 20
    }
  },
  "internal_assessment": {
    "theory": 10,
    "practical": 10,
    "total": 20,
    "frequency": "Continuing assessment examination (both Theory/Practical) held at least 3 times in a particular year, best of two examinations considered; internal assessment marks displayed on notice board and submitted to the university once in every three months"
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
        "Tripathi K D - Essentials of Medical Pharmacology",
        "R S Satoskar - Pharmacology and Pharmacotherapeutics",
        "Bertram G Katzung - Basic and Clinical Pharmacology"
      ]
    }
  ],
  "reference_groups": [
    {
      "group": "Reference Books",
      "books": [
        "Goodman and Gilman - The Pharmacological Basis of Therapeutics",
        "R.S. Satoskar, Kale Bhandarkar's Pharmacology and Pharmacotherapeutics, 10th Edition, Bombay Popular Prakashan 1991",
        "Bertram G Katzung, Basic and Clinical Pharmacology, 6th ed., Appleton & Lange 1997",
        "Laurence D.R., Clinical Pharmacology, 8th ed., Churchill Livingstone 1997",
        "Satoskar R.S. & Bhandarkar S.D., Pharmacology and Pharmacotherapeutics part I & part II, 13th, Popular Prakashan Bombay 1993",
        "Tripathi K.D., Essentials of Medical Pharmacology, 4th ed., Jaypee Brothers 1999"
      ]
    }
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

-- ── 4204 Dental Materials ──
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
  '4204', 'Dental Materials', NULL,
  'mgr_bds', 2,
  1, true, false,
  'Dental',
  $bds$
{
  "goal": "The dental graduates during training in the institutions should acquire adequate knowledge, necessary skills and such attitudes which are required for carrying out all the activities appropriate to general dental practice involving the prevention, diagnosis and treatment of anomalies and diseases of the teeth, mouth, jaws and associated tissues. The aim of the course is to present the basic chemical and physical properties of dental materials as they are related to their manipulation, to give a sound educational background about the various materials. The broad goal of the teaching of undergraduate students in Dental Materials aims at providing adequate fundamental knowledge about the materials available in the Dental science.",
  "objectives": {
    "knowledge": [
      "Adequate knowledge of the scientific foundations on which dentistry is based and good understanding of various relevant scientific methods and principles of biological functions",
      "Ability to evaluate and analyse scientifically various established facts and data",
      "Understand the evolution and development of the science of dental materials",
      "Know about the manipulation technique of various restorative materials"
    ],
    "skills": [
      "Develop skills in the management of various materials in dentistry",
      "Know about the physical and chemical properties of the dental materials"
    ],
    "attitude": [
      "Willing to apply current knowledge of dentistry in the best interest of the patients and the community",
      "Maintain a high standard of professional ethics and conduct and apply these in all aspects of professional life",
      "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community",
      "Willingness to participate in the continuing education programmes to update knowledge and professional skills from time to time",
      "To help and to participate in the implementation of National Health Programmes"
    ],
    "integration": [],
    "infection_control": [
      "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes",
      "Awareness of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
    ],
    "computer_proficiency": [
      "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes",
      "Basic operative skills in analysis of data and knowledge of multimedia",
      "Utilize a combination of traditional classroom courses and online courses; technological requirements include a laptop or desktop supporting the required operating system, internet browser, reliable internet access, current antivirus software, Microsoft Office and Adobe Reader"
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
    "lecture": 80,
    "practical": 240,
    "total": 320
  },
  "teaching_methodology": [
    "Lecture",
    "Demonstration",
    "Practical exercises",
    "Audio Video aids",
    "Group discussion",
    "Integrated teaching"
  ],
  "theory_syllabus": [
    {
      "topic": "Introduction",
      "must_know": [
        "Brief history of the development of the science of Dental Materials",
        "Aim of studying the subject of Dental Materials",
        "Scope and requirements of Dental materials",
        "Spectrum of materials - Classification",
        "Clinical and laboratory applications"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Structure of matter, and principles of adhesion",
      "must_know": [
        "Change of state, inter atomic primary bonds, inter atomic secondary bonds, inter atomic bond distance and bonding energy",
        "Thermal energy, crystalline structure, non crystalline structures, diffusion",
        "Adhesion and bonding and adhesion to tooth structures"
      ],
      "desirable_to_know": [
        "Change of state",
        "Interatomic bonds",
        "Crystalline structure",
        "Non crystalline solids and their structure"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Important Physical properties applicable to dental Materials",
      "must_know": [
        "Hue, value, chrome and translucency; physical properties based on laws of optics, dealing with phenomena of light, vision and sight",
        "Thermal conductivity and coefficient of thermal expansion",
        "Physical properties based on laws of thermodynamics",
        "Stress, strain, proportional limit, elastic limit, yield strength, modulus of elasticity, flexibility, resilience, impact, impact strength, permanent deformation, strength, flexure strength",
        "Fatigue, static fatigue, toughness, brittleness, ductility and malleability, hardness, abrasion resistance, relaxation, rheology, thixotropic, creep, static creep, dynamic creep, flow",
        "Colour, three dimensional colour - hue, values, chrome, Munsell system, metamerism, fluorescence"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Biological considerations in use of dental materials",
      "must_know": [
        "Classification of materials from perspective of biological compatibility"
      ],
      "desirable_to_know": [
        "Micro leakage",
        "Thermal changes",
        "Galvanism, toxic effect of materials"
      ],
      "nice_to_know": [
        "Biological evaluation for systemic toxicity, skin irritation, mutagenicity and carcinogenicity"
      ]
    },
    {
      "topic": "Gypsum & gypsum products",
      "must_know": [
        "Gypsum - its origin, chemical formula",
        "Dental plaster, Dental stone, Die stone, high strength, high expansion stone",
        "Application and manufacturing procedure of each; macroscopic and microscopic structure of each; Commercial names",
        "Chemistry of setting, setting reaction, theories of setting, gauging water, microscopic structure of set material",
        "Setting time and working time; measurement of setting time and factors controlling setting time",
        "Setting expansion, hygroscopic setting expansion; factors affecting each",
        "Strength: wet strength, dry strength, factors affecting strength",
        "ADA classification of gypsum products; description of impression plaster and dental investment",
        "Manipulation",
        "Disinfection: infection control, liquids, sprays, radiation; method of use of disinfectants",
        "Storage of material - shelf life"
      ],
      "desirable_to_know": [
        "Recent methods or advanced methods"
      ],
      "nice_to_know": [
        "Disinfection of dental materials for infection control",
        "Any recent advancements in material and mixing devices"
      ]
    },
    {
      "topic": "Impression materials used in dentistry",
      "must_know": [
        "Impression plaster, impression compound, zinc oxide eugenol impression paste and bite registration paste including non eugenol paste",
        "Hydrocolloids, reversible and irreversible",
        "Elastomeric impression materials: Polysulphide, Condensation silicones, Addition silicones, Polyether",
        "Definition of impression; purpose of making impression; ideal properties required and application of material",
        "Classification as per ADA specification, general and individual impression material; application and their uses in different disciplines",
        "Type of impression trays required, adhesion to tray, manipulation, instruments and equipment required",
        "Techniques of impression, storage of impression, working time, setting time, flow, accuracy, strength, flexibility, tear strength, dimensional stability",
        "Compatibility with cast and die materials including electroplating",
        "Biological properties: tissue reaction; shelf life and storage of material",
        "Infection control - disinfection; advantages and disadvantages of each material"
      ],
      "desirable_to_know": [
        "Visible light cure polyether urethane dimethacrylate",
        "Historical background, development of each impression material"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Synthetic resins used in dentistry",
      "must_know": [
        "Classification of resins, dental resins; requirements of dental resins, applications, polymerisation, polymerisation mechanism",
        "Stages in addition polymerisation, inhibition of polymerisation, copolymerisation, molecular weight, crosslinking, plasticisers",
        "Physical properties of polymers, polymer structures, types of resins",
        "Acrylic resins - mode of polymerisation: heat activated, chemically activated, light activated; mode of supply, application, composition, polymerisation reaction of each; physical properties of denture base resin",
        "Composite restorative resin - mode of supply, composition, polymerisation mechanisms (chemically activated, light activated, dual cure); degree of conversion, polymerisation shrinkage",
        "Classification of composites: application, composition and properties of each",
        "Biocompatibility - micro leakage, pulpal reaction, pulpal protection; manipulation of composites",
        "Techniques of insertion of chemically activated, light activated, dual cure polymerisation; finishing and polishing of restoration",
        "Direct bonding: need for bonding, acid etch technique, enamel bonding, dentin bonding agents; mode of bonding, bond strength, sandwich technique - indication and procedure"
      ],
      "desirable_to_know": [
        "Historical background and development of material",
        "Miscellaneous resins and techniques: repair resins, relining and rebasing",
        "Infection control in detail, biological properties and allergic reactions",
        "Measurement of bond strength and micro leakage",
        "Amalgam bonding",
        "Pit and fissure sealants",
        "Restorative resins - depth of cure, degree of conversion, dual cure resins"
      ],
      "nice_to_know": [
        "Short term and long-term soft-liners, temporary crown and bridge resins, resin impression trays, tray materials, resin teeth, materials in maxillofacial prosthesis, denture cleansers",
        "Composites of posterior teeth, prosthodontics resins for veneering",
        "Repair of composite",
        "Extended application for composites: resins for restoring eroded teeth, pit and fissure sealing, resin inlay system",
        "Indirect and direct, core build up, orthodontic applications",
        "Restorative resins - curing lamps, depth of cure, reduction of residual stresses"
      ]
    },
    {
      "topic": "Metal and alloys",
      "must_know": [
        "Structure and behaviour of metals",
        "Classification of casting alloys: by function and description",
        "Alloys for crown and bridge, metal ceramic and removable partial denture; composition, function, constituents and application"
      ],
      "desirable_to_know": [
        "Historical background, desirable properties of casting alloys",
        "Factors affecting success of amalgam"
      ],
      "nice_to_know": [
        "An alternative to metal casting process; CAD-CAM process for metal and ceramic inlays"
      ]
    },
    {
      "topic": "Dental Amalgam",
      "must_know": [
        "Composition, manufacturing of alloy powder, amalgamation, dimensional stability, strength, creep, clinical performance, proportioning, trituration, condensation, carving and finishing, dimensional change, mercury hygiene"
      ],
      "desirable_to_know": [
        "Side effects of mercury",
        "Repair of amalgam restoration"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Direct filling gold",
      "must_know": [
        "Properties of pure gold",
        "Classification and forms of DFG (direct filling gold)",
        "Removal of surface impurities"
      ],
      "desirable_to_know": [
        "History, compaction",
        "Direct gold restoration"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Dental casting alloys",
      "must_know": [
        "Classification of casting alloys: by function and description",
        "Recent classification: High noble (HN), Noble (N) and predominantly base metal (PB)",
        "Alloys for crown and bridge, metal ceramic and removable partial denture; composition, function, constituents and application, each alloy both noble and base metal",
        "Properties of alloys: melting range, mechanical properties, hardness, elongation, modulus of elasticity, tarnish and corrosion",
        "Casting shrinkage and compensation of casting shrinkage",
        "Biocompatibility - handling hazards and precautions of base metal alloys, casting investments used",
        "Heat treatment: softening and hardening heat treatment"
      ],
      "desirable_to_know": [
        "Historical background, desirable properties of casting alloys"
      ],
      "nice_to_know": [
        "Alternatives to cast metal technology: direct filling gold, amalgam, mercury free, condensable intermetallic compound - an alternative to metal casting process",
        "CAD-CAM process for metal and ceramic inlays without need for impression of teeth or casting procedure; pure titanium, most bio compatible metal which is difficult to cast can be made into crowns with the aid of CAD-CAM technology",
        "Another method of making copings - by copy milling (without casting) procedures"
      ]
    },
    {
      "topic": "Dental waxes including inlay casting wax",
      "must_know": [
        "Introduction and importance of waxes",
        "Sources of natural waxes and their chemical nature",
        "Classification of waxes; properties of dental wax, inlay wax",
        "Mode of supply, composition, ideal requirements; properties: melting range, thermal expansion, mechanical properties, flow and residual stresses, ductility",
        "Dental wax - inlay wax: classification and composition",
        "Ideal requirements; properties of inlay wax: flow, thermal properties; wax distortion and its causes"
      ],
      "desirable_to_know": [],
      "nice_to_know": [
        "Manipulation of inlay wax: instruments and equipment required",
        "Impression wax for corrective impressions, bite registration wax"
      ]
    },
    {
      "topic": "Dental casting investments",
      "must_know": [
        "Definition, requirements, classification; gypsum bonded - classification; phosphate bonded, silica bonded",
        "Mode of supply, composition, application, setting mechanism, setting time and factors controlling it",
        "Expansions: setting expansion, hygroscopic setting expansion and thermal expansion",
        "Factors affecting; properties: strength, porosity, fineness and storage; technical considerations"
      ],
      "desirable_to_know": [],
      "nice_to_know": [
        "Casting procedure, preparation of die, wax pattern, spruing, investing, and control of shrinkage compensation, wax burnout, and heating the invested ring, casting",
        "Casting machines, source of heat for melting the alloy; defects in casting"
      ]
    },
    {
      "topic": "Soldering, brazing and welding",
      "must_know": [
        "Need of joining dental appliances, temperature, and application",
        "Mode of supply of solders, composition and selection, properties",
        "Tarnish and corrosion resistance, mechanical properties, microstructure of soldered joint",
        "Fluxes and anti fluxes: definition, function, types, commonly used fluxes and their selection",
        "Welding: definition, application, requirements, and procedure"
      ],
      "desirable_to_know": [
        "Technique of soldering and brazing: free hand soldering and investment, steps and procedure"
      ],
      "nice_to_know": [
        "Weld decay - causes and how to avoid it; laser welding",
        "Titanium alloys - application, composition, properties, welding, corrosion resistance"
      ]
    },
    {
      "topic": "Wrought base metal alloys",
      "must_know": [
        "Applications and different alloys used mainly for orthodontics purpose: 1. Stainless steel 2. Cobalt chromium nickel 3. Nickel titanium 4. Beta titanium",
        "Properties required for orthodontic wires: working range, springiness, stiffness, resilience, formability, ductility, ease of joining, corrosion resistance, stability in oral environment, biocompatibility",
        "Stainless steels: description, type, composition and properties of each type; sensitisation and stabilisation; mechanical properties - strength, tensile, yield strength, KHN; braided and twisted wires their need; solders for stainless steel, fluxes, welding",
        "Wrought cobalt chromium nickel alloys: composition, allocation, properties, heat treatment, physical properties",
        "Nickel-Titanium alloys: shape, memory and super elastic"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Dental cements",
      "must_know": [
        "Application, classification (general and individual), setting mechanism, mode of supply, properties, factors affecting setting, special emphasis on critical procedures of manipulation and protection of cement, mode of adhesion, biomechanism of caries inhibition; agents for pulpal protection",
        "Definition and ideal requirements",
        "Fluoride releasing cements",
        "Luting cements",
        "Agents for pulp protection",
        "Zinc Phosphate cement",
        "Zinc Polycarboxylate cement",
        "Glass ionomer cement",
        "Resin cements",
        "Zinc oxide eugenol cement",
        "Calcium Hydroxide"
      ],
      "desirable_to_know": [],
      "nice_to_know": [
        "Modifications and recent advances, principles of cementation",
        "Special emphasis on cavity liners and cement bases and luting agents"
      ]
    },
    {
      "topic": "Dental ceramics",
      "must_know": [
        "General applications; dental ceramics: properties, definition, classification, application, mode of supply, manufacturing procedure, methods of strengthening",
        "Properties of fused ceramic: strength and factors affecting, modulus of elasticity, surface hardness, wear resistance, thermal properties, specific gravity, chemical stability, aesthetic properties, biocompatibility, technical considerations",
        "Metal Ceramics (PFM): alloys - types and composition of alloys; ceramic - type and composition"
      ],
      "desirable_to_know": [
        "Historical background",
        "Methods of strengthening",
        "Metal Ceramics (PFM); Metal Ceramic Bond - nature of bond; bonding using electro deposition, foil copings, bonded platinum foil, swaged gold alloy foil coping",
        "Technical considerations of porcelain and porcelain fused metal restorations"
      ],
      "nice_to_know": [
        "Recent advances - all porcelain restorations, manganese core, injection moulded, castable ceramics, glass infiltrated alumina core ceramic (In ceram), ceramic veneers, inlays and onlays, and CAD-CAM ceramic"
      ]
    },
    {
      "topic": "Abrasion & polishing agents",
      "must_know": [
        "Definition of abrasion and polishing; need of abrasion and polishing",
        "Types of abrasives: finishing, polishing and cleaning",
        "Types of abrasives: diamond, emery, aluminium oxides, garnet, pumice, kieselguhr, tripoli, rouge, tin oxide, chalk, chromic oxide, sand, carbides, diamond, zirconium silicate, zinc oxide",
        "Desirable characteristics of an abrasive, rate of abrasion, size of particle, pressure, grading of abrasive and polishing agents; binder; polishing materials and procedures"
      ],
      "desirable_to_know": [
        "Technical consideration - material and procedure used for abrasion and polishing"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Die and counter die materials",
      "must_know": [
        "Types - gypsum products, electroforming, epoxy resin, amalgam"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Mechanics of cutting",
      "must_know": [
        "Burs and points"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Dental implants",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": [
        "Evolution of dental implants - types and materials"
      ]
    },
    {
      "topic": "Bioethics",
      "must_know": [
        "Bioethics is the application of ethics to the field of medicine and healthcare",
        "Includes medical ethics (issues in health care), research ethics (conduct of research), environmental ethics (relationship between human activities and the environment), and public health ethics",
        "Bio-ethics principles: respect human life with dignity; refrain from supporting crimes against humanity; treat the sick with compassion; protect the privacy of the patient; educate the public; fight for socio economical changes; teaching and mentoring those who follow us"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    }
  ],
  "practicals": [
    {
      "title": "Demonstration of manipulation of all materials"
    },
    {
      "title": "Manipulation of gypsum materials and alginate - identify setting time and working time with reference to proportion, water temperature, and spatulation time"
    },
    {
      "title": "Self-cure and heat cure acrylic resin manipulation and curing"
    },
    {
      "title": "Cements - manipulation and studying setting time and working time for luting, base and restoration (zinc oxide eugenol, zinc phosphate, glass ionomer)"
    },
    {
      "title": "Silver amalgam - manipulation, trituration"
    },
    {
      "title": "Impression material manipulation (First BDS)",
      "hours": 20
    },
    {
      "title": "Gypsum products (First BDS)",
      "hours": 20
    }
  ],
  "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases / teaching materials as specified in Dental Council of India regulation for the students during clinical / practical training and examinations.",
  "disciplines": null
}
  $bds$::jsonb,
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
    "total_marks": 70,
    "sections": [
      {
        "type": "Elaborate on",
        "count": 2,
        "marks_each": 10,
        "total": 20,
        "note": "One Elaborate question from Conservative Dentistry topics and one from Prosthodontics topics"
      },
      {
        "type": "Write Notes",
        "count": 10,
        "marks_each": 5,
        "total": 50,
        "note": "Four questions from Conservative and four from Prosthetic topics and two questions from Metallurgy and Orthodontia"
      }
    ]
  },
  "practical_exam": {
    "type": "spotters + manipulation exercises",
    "items": [
      {
        "name": "Spotters - identify and write the composition and two important uses",
        "count": 20,
        "marks_each": 2,
        "total": 40,
        "time": "2 minutes each"
      },
      {
        "name": "Exercise No.1 (any one): manipulation of dental plaster and stone / alginate impression material / zinc oxide eugenol impression paste / heat cure acrylic resin",
        "marks": 25
      },
      {
        "name": "Exercise No.2 (manipulation of any one dental cement): ZOE (luting and filling consistency) / Zinc Phosphate cement (luting and base consistency) / Glass Ionomer cement Type I/II (luting/filling consistency) / Silver Amalgam trituration",
        "marks": 25
      }
    ],
    "examination_total": 90,
    "timing": "2-5 minutes allotted for each mixing exercise",
    "viva": null,
    "viva_note": "A 20-mark viva is listed under the practical/clinical examination; the marks summary table records this 20-mark viva under the Theory total (100 = 70 + 10 IA + 20 viva).",
    "spotters_list": {
      "conservative": [
        "Amalgam Alloy Powder",
        "Mercury",
        "Amalgam Capsule",
        "Acid Etchant",
        "Dentin Bonding Agent",
        "Cavity Varnish",
        "Dentin Conditioner",
        "Composite Resin",
        "Zinc Oxide Eugenol Cement",
        "Modified Zinc Oxide Eugenol Cement (IRM - Intermediate Restorative Material)",
        "Zinc Phosphate Cement",
        "Zinc Polycarboxylate Cement",
        "Glass Ionomer Cement Type I",
        "Glass Ionomer Cement Type II",
        "Calcium Hydroxide",
        "Inlay Wax",
        "Base Metal Alloy Pellets",
        "Casting Ring",
        "Gypsum Bonded Investment",
        "Phosphate Bonded Investment",
        "Dental Bur",
        "Wooden Wedges",
        "Gutta Percha Points",
        "Gutta Percha Sticks",
        "Mortar and Pestle",
        "Glass Slab",
        "Cement Spatula",
        "Agate Spatula"
      ],
      "prosthodontics": [
        "Plaster of paris",
        "Die stone",
        "Dental stone",
        "Gypsum bonded investment",
        "Zinc oxide eugenol impression paste",
        "Rubber base materials",
        "Alginate",
        "Impression compound",
        "Low fusing compound",
        "Sticky wax",
        "Shellac base plate",
        "Modelling wax",
        "Heat cure resin",
        "Self cure resin",
        "Metal pellets",
        "Casting ring",
        "Stainless steel wire",
        "Acrylic trimmers",
        "Separating media",
        "Acrylic teeth set",
        "Cotton puff",
        "Woollen puff",
        "Metal ceramic bridge"
      ],
      "miscellaneous": [
        "Infection control",
        "Artificial tooth material",
        "Separating media",
        "Die spacers",
        "Tray adhesives",
        "Petroleum jelly",
        "Articulating paper",
        "Pressure indicating paste",
        "Endodontic materials",
        "Comparative studies between metallic and nonmetallic denture base Bioglass",
        "Sprues",
        "Setting expansion, hygroscopic expansion, thermal expansion",
        "Dentifrices"
      ]
    }
  },
  "internal_assessment": {
    "theory": 10,
    "practical": 10,
    "total": 20,
    "frequency": "Continuing assessment examination (both theory and practical) held at least 3 times in a particular year and best of two examinations considered; internal assessment marks submitted to the university once every three months"
  }
}
  $exam$::jsonb,
  $books$
{
  "groups": [
    {
      "group": "Text Books",
      "books": [
        "Science of Dental Materials - Kennet J. Anusavice, 11th edn, 2007, W.B. Saunder's Company, USA",
        "Notes on Dental Materials - E.C. Combe, 6th edn, 1992, Churchill Livingstone, UK",
        "Applied Dental Material - John F. Mc.Cabe, 7th edn, 1992, Oxford Blackwell Scientific Publications, London",
        "Text Book of Dental Material - Craig, O'Brien, 6th edn, 1996, Mosby, USA",
        "Restorative Dental - Craig, 11th edn, 2002, Mosby, USA"
      ]
    }
  ],
  "reference_groups": [
    {
      "group": "Reference Books",
      "books": [
        "Phillips Science of Dental Materials - 10th edn - Kenneth J. Anusavice",
        "Restorative Dental Material - 10th edn - Robert G. Craig",
        "Notes on Dental Materials - E.C. Combe"
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

-- ── 4210 Preclinical Conservative ──
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
  '4210', 'Preclinical Conservative', NULL,
  'mgr_bds', 2,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The IInd year BDS undergraduate students during the training in the preclinical conservative dentistry should acquire adequate knowledge, skills and attitude which are required for carrying out appropriate activities in dental practice which involves diagnosis treatment and prevention of disease of teeth. During the training program they should be able to identify and use instruments which are used in conservative dentistry and Endodontics. They should also be aware of various restorative procedures with emphasize on tooth conservation.",
    "objectives": {
      "knowledge": [
        "The student should acquire adequate knowledge during this period of training.",
        "Knowledge of the scientific foundation of conservative dentistry and understanding of various treatment procedures carried out in conservative dentistry with emphasize on biological principal to be followed during these treatment procedures",
        "To acquire knowledge of various instruments and materials used in restorative procedures",
        "They should also be aware of various manipulative techniques of restorative material"
      ],
      "skills": [
        "To develop skills in manipulation of various materials used in conservative dentistry",
        "To develop skills in preparation of various cavities and to perform various restorative procedures"
      ],
      "attitude": [
        "The student should be able to apply the current knowledge of various materials used in dentistry in the interest of patients and the community in general",
        "To be aware of recent developments in instruments and materials used in conservative dentistry and update his/her knowledge by attaining various continuing education programmes",
        "Should be aware of both benefits and health hazards of various restorative materials used in conservative dentistry",
        "Should maintain high standard of professional ethics and apply those in all aspects of professional life"
      ],
      "integration": [
        "The dental student must be able to identify the healthy and diseased state of the teeth, thereby enabling them to better understand the diseased state and to plan an ideal treatment protocol for the same"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes",
        "Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes",
        "Basic operative skills in analysis of data and knowledge of multimedia",
        "Students should utilize a combination of traditional classroom courses, and online courses"
      ]
    },
    "competencies": [
      { "group": "General skills", "items": [] },
      { "group": "Practice Management", "items": [] },
      { "group": "Communication and Community Resources", "items": [] },
      { "group": "Patient Care - Diagnosis", "items": [] },
      { "group": "Patient Care - Treatment Planning", "items": [] },
      { "group": "Competencies Specific to the Subject", "items": [] }
    ],
    "teaching_hours": { "lecture": 25, "practical": 200, "total": 225 },
    "teaching_methodology": [
      "Audio Visual Aids: LCD projectors",
      "Identification of instruments used in preclinical dentistry",
      "Demonstration of various procedures in conservative dentistry",
      "Demonstration of endodontic procedures in single rooted teeth"
    ],
    "theory_syllabus": [
      { "topic": "Introduction to conservative dentistry", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Definition and scope of conservative dentistry and Endodontics", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Classification of cavities", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Nomenclature", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Various chair side positions", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Tooth numbering", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental caries", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Restoration - Definition and objectives", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Instrument classification, nomenclature design formula of hand cutting instrument, grasps and rests", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Rotary cutting instruments, bur design, abrasives and various speeds in rotary instruments", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Principle of cavity preparation", "must_know": ["Silver amalgam", "Cast gold inlays", "Composite resin", "Glass ionomer"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Matrices, Retainers and wedges", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Separators - Different methods of separation", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Finishing and polishing of restorations", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Management of deep carious lesions - pulp capping and pulpotomy", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Access cavity preparation and brief introduction of instruments used endodontics", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Infection control", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Conservative aesthetic procedures", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bleaching", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Complex amalgam restorations", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Direct filling gold", "must_know": [], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Bioethics is the application of ethics to the field of medicine and healthcare. Bioethics includes medical ethics (issues in health care), research ethics (conduct of research), environmental ethics (relationship between human activities and the environment), and public health ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Preparation of 1 inch cube in plaster of paris - 4 Nos" },
      { "title": "Preparation of geometric cavities in prepared cubes" },
      { "title": "Preparation of tooth models in plaster and preparation of cavities and restoration with modelling wax: Incisors - 3 Nos; Upper Premolars - 2 Nos; Lower Premolars - 2 Nos; Upper Molars - 4 Nos; Lower Molars - 4 Nos" },
      { "title": "Preparation of Cavities on Extracted Natural Teeth - Class I, Class II and MOD and Class V Cavity Preparation, Base Application, Matrix and Wedge Placement, Placement of restoration" },
      { "title": "Cavities (Preparation and Restoration): Class I - 5/5; Class I with extensions - 2/2; Class II DO conventional / MO conventional (Conservative preparation in Upper molar) - 10/10; Class II MOD - 2/2; Class III and V - 4/4 (glass ionomer); Class V - 2/2 (amalgam)" },
      { "title": "Finishing and polishing of above restorations" },
      { "title": "Inlay preparation: Class II preparation, Wax pattern, Sprue attachment, Investment, Casting and finishing" },
      { "title": "Endodontics: Identification of basic endodontic instruments, Access cavity preparation in upper central incisors, Working length determination, Cleaning and shaping, Obturation of the root canal, Access seal" },
      { "title": "Demonstration of class III, class V and incisal edge restoration on extracted teeth with composite resin; Finishing and polishing of the restorations" },
      { "title": "Identification and manipulation of cavity varnishes, bases like zinc phosphate, zinc poly carboxylate, zinc oxide eugenol cement" },
      { "title": "Manipulation of glass ionomer cement" },
      { "title": "Manipulation of amalgam" },
      { "title": "Identification and demonstration of placement of different types matrix retainers, matrices and tooth seperators" },
      { "title": "Demonstration of light cure composite and glass ionomer Restoration" },
      { "title": "Endodontics demonstration: (a) Pulp capping direct/indirect on extracted teeth; (b) Pulpotomy on extracted posterior teeth; (c) Root canal access cavity opening on upper Central Incisor (extracted teeth); Demonstration of instrumentation and obturation of root canal" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical / practical training and examinations.",
    "disciplines": null
  }
  $bds$::jsonb,
  -- ---- exam_scheme ---------------------------------------------------------
  $exam$
  {
    "components": [
      { "stream": "Practical", "examination": 60, "internal_assessment": 20, "viva": 20, "total": 100 }
    ],
    "grand_total": 100,
    "no_theory_exam": true,
    "question_pattern": null,
    "practical_exam": {
      "type": "Preparation of class II cavity for Silver amalgam in maxillary or mandibular molar tooth (typhodont tooth)",
      "items": [
        { "name": "Cavity Preparation", "marks": 30, "time": "45 Minutes" },
        { "name": "Base and Matrix", "marks": 10, "time": "15 Minutes" },
        { "name": "Restoration and Finishing", "marks": 20, "time": "30 Minutes" }
      ],
      "practical_total": 60,
      "viva": { "max": 20 }
    },
    "internal_assessment": {
      "theory": null,
      "practical": null,
      "total": 20,
      "frequency": "at least 3 times per year, best of two considered; submitted to the university once every three months"
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books Recommended", "books": ["Sturdevant's Art and Science of Operative Dentistry, ELSEVIER", "Pre - Clinical Manual of Conservative Dentistry, Dr.V.Gopikrishna, ELSEVIER"] }
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

-- ── 4209 Preclinical Prosthodontics ──
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
  '4209', 'Preclinical Prosthodontics', NULL,   -- DCI model: no credits
  'mgr_bds', 2,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The dental graduates during training in the institutions should acquire adequate knowledge, necessary skills and reasonable attitudes which are required for carrying out all activities appropriate to general dental practice involving prevention, diagnosis and treatment of anomalies and diseases of the teeth, mouth, jaws and associated tissues. The graduate also should understand the concept of community oral health education and be able to participate in the rural health care delivery programmes existing in the country.",
    "objectives": {
      "knowledge": [
        "Adequate knowledge of the scientific foundations on which dentistry is based and good understanding of various relevant scientific methods, principles of biological functions, ability to evaluate and analyse scientifically various established facts and deals",
        "Adequate knowledge of the development, structure and function of the teeth, mouth and jaws and associated tissues both in health and disease and their relationship and effect on general state of health and also bearing on physical and social well being of the patient",
        "Adequate knowledge of clinical disciplines and methods which provide a coherent picture of anomalies, lesions and diseases of the teeth, mouth and jaws and preventive diagnostic and therapeutic aspects of dentistry",
        "Adequate clinical experience required for the general dental practice",
        "Adequate knowledge of the constitution, biological functions and behaviour of persons in health and sickness as well as the influence of the natural and social environment on the state of health in so far as it affect dentistry"
      ],
      "skills": [
        "Diagnose and manage various common dental problems encountered in general dental practice keeping in mind the expectations and the right of the society to receive the best possible treatment available wherever possible",
        "Prevent and manage complications if encountered while carrying out various surgical and other procedures",
        "Carry out certain investigative procedures and ability to interpret laboratory findings",
        "Promote oral health and help prevent oral disease where possible",
        "Control pain and anxiety among the patients during dental treatment"
      ],
      "attitude": [
        "Willingness to apply the current knowledge of dentistry in the best interest of the patient and community",
        "Maintain a high standard of professional ethics and conduct and apply these in all aspects of professional life",
        "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community",
        "Willingness to participate in the CPED programmes to update knowledge and professional skill time to time",
        "Help and participate in the implementation of the national oral health policy"
      ],
      "integration": [
        "Integrated knowledge about all the divisions in Prosthodontics (CD, RPD, FPD, IMPLANTS etc)"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses, and online courses"
      ]
    },
    "competencies": [
      { "group": "General skills", "items": [] },
      { "group": "Practice Management", "items": [] },
      { "group": "Communication and Community Resources", "items": [] },
      { "group": "Patient Care - Diagnosis", "items": [] },
      { "group": "Patient Care - Treatment Planning", "items": [] },
      { "group": "Competencies Specific to the Subject", "items": [] }
    ],
    "teaching_hours": { "lecture": 25, "practical": 200, "total": 225 },
    "teaching_methodology": [
      "Lectures",
      "Lecture Demonstrations",
      "Practical exercises",
      "Audio visual aids",
      "Small group discussions with regular feed back from the students",
      "Integrated Teaching",
      "Symposium and continuing medical education programmes and Computer Aided Study"
    ],
    "theory_syllabus": [
      { "topic": "I. Introduction to Prosthodontics - Scope and Definition", "must_know": ["Masticatory apparatus and function: Maxillae & Mandible with & without teeth", "Masticatory apparatus and function: Muscles of mastication and accessory muscles of mastication", "Masticatory apparatus and function: Brief anatomy of TMJ", "Masticatory apparatus and function: Mandibular movements", "Masticatory apparatus and function: Functions of teeth", "Various branches of Prosthodontics and prosthesis: Scope & limitation", "Various branches of Prosthodontics and prosthesis: Appliances v/s prosthesis", "Various branches of Prosthodontics and prosthesis: Dental prosthesis v/s non-dental prosthesis", "Effect of loss of teeth: On general health", "Effect of loss of teeth: On masticatory apparatus", "Effect of loss of teeth: Need to replace lost teeth", "Outline of Prosthodontics: Types of Prosthesis", "Outline of Prosthodontics: Requirements of prosthesis - Physical, biological, esthetic considerations"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "II. Introduction to components of Prosthesis", "must_know": ["Complete Denture Prosthesis: Various surfaces (Border and surface anatomy)", "Complete Denture Prosthesis: Components - Base and Teeth", "Removable Partial Denture: Classification", "Removable Partial Denture: Major and minor Connectors", "Removable Partial Denture: Direct retainers", "Removable Partial Denture: Rests", "Removable Partial Denture: Indirect retainers", "Removable Partial Denture: Denture base", "Removable Partial Denture: Artificial teeth", "Fixed Partial Denture: Classification", "Fixed Partial Denture: Retainers", "Fixed Partial Denture: Pontics", "Fixed Partial Denture: Connectors"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "III. All related definitions and terminologies from glossary", "must_know": ["Model", "Cast", "Impression", "Occlusion rim", "Temporary denture base", "Permanent denture base", "Occlusion", "Face Bow & Articulator", "Jaw relation - orientation, vertical and centric", "Christensen's phenomenon", "Key of occlusion", "Balanced occlusion", "Abutment etc"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "IV. Introduction to mouth preparation - in brief", "must_know": ["Complete Dentures: General considerations", "Complete Dentures: Pre-prosthetic surgery", "Removable partial dentures: General considerations", "Removable partial dentures: Occlusal rest preparation", "Removable partial dentures: Modifying contours of the abutments", "Removable partial dentures: Guide planes", "Removable partial dentures: Elimination of undercuts", "Fixed Partial Dentures: Principles of tooth preparation - in brief", "Fixed Partial Dentures: Retainers in brief"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "V. Introduction to all steps involved in fabrication of Prosthesis (Clinical steps in brief and laboratory steps in detail)", "must_know": ["Impression Making: Definition and requirements and types of impressions", "Impression Making: Various materials used for different impressions", "Impression Making: Different theories of impression making", "Impression Trays: Definition, classification, materials, advantages and disadvantages", "Impression Trays: Selection of trays", "Impression Trays: Special trays", "Impression Trays: Spacer design", "Introduction to jaw relation record: Definition and type", "Introduction to jaw relation record: Temporary denture base - Indications, Advantages, Disadvantages, materials used", "Introduction to jaw relation record: Occlusion rims - materials, shape, dimensions", "Introduction to jaw relation record: Clinical procedures of jaw relation recording in brief", "Articulators and Face bow: Basic outline", "Articulators and Face bow: Need for articulators", "Articulators and Face bow: Definition, classification, parts, advantages, disadvantages of articulators", "Articulators and Face bow: Definitions, classification, parts, advantages, disadvantages and purpose of face bow transfer", "Articulators and Face bow: Demonstration of face bow transfer to an articulator on a dummy", "Selection of Teeth: Various guidelines for selection of teeth including dentogenic concept", "Selection of Teeth: Arrangement of teeth in detail with various factors of esthetics, overjet, overbite etc", "Occlusion: Balanced Occlusion - need and advantages", "Occlusion: Various factors of balanced occlusion", "Try in Procedures: Anterior try-in", "Try in Procedures: Posterior try-in", "Try in Procedures: Waxing, carving, polishing and final try-in", "Processing Procedures: Flasking", "Processing Procedures: Dewaxing", "Processing Procedures: Packing", "Processing Procedures: Curing", "Processing Procedures: Finishing and polishing of acrylic dentures"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "VI. Casting Procedures", "must_know": ["Preparation of die", "Wax pattern", "Investing", "Burnout", "Casting", "Finishing and polishing"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Application of ethics to the field of medicine and healthcare, including medical ethics (issues in health care), research ethics (issues in the conduct of research), environmental ethics (relationship between human activities and the environment) and public health ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Preparation of special trays" },
      { "title": "Preparation of temporary and permanent denture bases" },
      { "title": "Preparation of occlusion rims" },
      { "title": "Orientation of occlusion rims on articulator" },
      { "title": "Arrangement of teeth" },
      { "title": "Processing of complete dentures" },
      { "title": "Arrangement of teeth - Must Know" },
      { "title": "Surveying of partially edentulous models and preparing modified master cast - Desirable to Know" },
      { "title": "Preparing of wax patterns spruing, casting and finishing (in batches of students not more than 8) - Desirable to Know" },
      { "title": "Preparation of plaster models of various preparation of teeth to receive retainers for FPD - Desirable to Know" },
      { "title": "Prepare wax patterns for minimum of 3 unit FPD and investing, casting and porcelain facing (for batch of 8 students) - Desirable to Know" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate teaching number of cases / teaching materials as specified in Dental Council of India regulation for the students during clinical / practical training and examinations. Note: Students shall submit one processed denture mounted on an articulator to present on university practical exam along with record book; Exercises of RPD and FPD to be submitted in groups along with the record book.",
    "disciplines": null
  }
  $bds$::jsonb,
  -- ---- exam_scheme ---------------------------------------------------------
  $exam$
  {
    "components": [
      { "stream": "Practical", "examination": 60, "internal_assessment": 20, "viva": 20, "total": 100 }
    ],
    "grand_total": 100,
    "no_theory_exam": true,
    "question_pattern": null,
    "practical_exam": {
      "type": "practical exercise",
      "items": [
        { "name": "Practical Exercise: Arrangement of teeth in class I relation, Waxing, Carving, Polishing", "duration": "3 hrs", "marks": 60 }
      ],
      "viva": { "max": 20, "name": "Viva-Voce" }
    },
    "internal_assessment": {
      "theory": null,
      "practical": 20,
      "total": 20,
      "frequency": "continuing assessment examination held at least 3 times in a particular year, best of two examinations considered; marks submitted to the university once in every three months"
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": ["Essentials of Complete Denture Prosthodontics - Winkler", "Prosthodontic Treatment for Edentulous Patients - Zarb Bolender", "Clinical Removable Partial Denture - Stewart", "Fundamentals of Fixed Prosthodontics - Shillingburg", "Text Book of Prosthodontics - Deepak Nallaswamy"] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": ["Impression Techniques for Complete Denture - Bernard Levin", "Removable Partial Prosthodontics - Mc Cracken", "Contemporary Fixed Partial Denture - Rosenstiel", "Syllabus of Complete Denture - Charles M. Heartwell Jr. and Arthur O. Rahn", "Boucher's Prosthodontic Treatment for Edentulous Patients", "Essentials of Complete Denture Prosthodontics - Sheldon Winkler", "Maxillofacial Prosthetics - William R. Laney", "McCracken's Removable Partial Prosthodontics", "Removable Partial Prosthodontics - Ernest L. Miller and Joseph E. Grasso"] }
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
