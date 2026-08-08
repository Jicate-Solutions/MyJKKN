-- ============================================================================
-- BoS DCH / BDS — SYLLABUS BATCH: YEAR IV  (UPSERT — safe to re-run)
-- ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE.
-- Generated 2026-08-08 from parallel extraction. Scope: DCH / BDS / reg 2018.
-- Requires migration 20260807_bos_syllabus_bds_dental_model.sql.
-- ============================================================================

BEGIN;

-- ── 4216 Oral Medicine ──
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
  '4216', 'Oral Medicine Theory', NULL,
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
{
  "goal": "The dental graduates during training in the institutions should acquire adequate knowledge, necessary skills and such attitudes which are required for carrying out all the activities appropriate to general dental practice involving the prevention, diagnosis and treatment of anomalies and diseases of the teeth, mouth, jaws and associated tissues and Radiological skills. The graduate should also understand the concept of community oral health education and be able to participate in the rural health care delivery programmes existing in the country.",
  "objectives": {
    "knowledge": [
      "Adequate knowledge of the scientific foundations on which dentistry is based and good understanding of various relevant scientific methods, principles of biological functions and should be able to evaluate and analyse scientifically various established facts and data",
      "Adequate knowledge of the development, structure and function of the teeth, mouth and jaws and associated tissues both in health and disease and their relationship and effect on general state of health and also the bearing on physical and social well-being of the patient",
      "Adequate knowledge of clinical disciplines and methods, which provide a coherent picture of anomalies, lesions and diseases of the teeth, mouth and jaws and preventive, diagnostic and therapeutic aspects of dentistry",
      "Adequate clinical experience required for general dental practice",
      "Adequate knowledge of biological function and behaviour of persons in health and sickness as well as the influence of the natural and social environment on the state of health so far as it affects dentistry"
    ],
    "skills": [
      "Able to diagnose and manage various common dental problems encountered in general dental practice, keeping in mind the expectations and the right of the society to receive the best possible treatment available wherever possible",
      "Acquire skill to prevent and manage complications if encountered while carrying out various dental surgical and other procedures",
      "Possess skill to carry out required investigative procedures including clinical and radiological investigations and ability to interpret laboratory findings",
      "Promote oral health and help to prevent oral diseases wherever possible",
      "Accurate planning of treatment",
      "Competent in control of pain and anxiety during dental treatment"
    ],
    "attitude": [
      "Willing to apply current knowledge of dentistry in the best interest of the patients and the community",
      "Maintain a high standard of professional ethics and conduct and apply these in all aspects of professional life",
      "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community",
      "Willingness to participate in the continuing education programmes to update knowledge and professional skills from time to time",
      "To help and to participate in the implementation of national health programmes"
    ],
    "integration": [
      "From the integrated teaching, the student shall be able to describe the various signs and symptoms and interpret the clinical manifestation of disease processes",
      "Horizontal integration can be done in common with basic science departments, and vertical integration can be done with clinical departments"
    ],
    "infection_control": [
      "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in the appropriate modes; students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
    ],
    "computer_proficiency": [
      "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes; basic operative skills in analysis of data and knowledge of multimedia; students should utilize a combination of traditional classroom courses and online courses",
      "Technological requirements: a laptop or desktop computer supporting operating system requirements, internet browser requirements, reliable and consistent access to the internet, current and consistently updated antivirus software, Microsoft Office, and Adobe Reader (or equivalent to view PDF files)"
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
      "items": [
        "Should be able to identify precancerous and cancerous lesions of the oral cavity and refer to the concerned speciality for their management",
        "Should have an adequate knowledge about common laboratory investigation and interpretation of their results",
        "Should have adequate knowledge about medical complications that can arise while treating systemically compromised patients and take prior precautions, consent from the concerned medical specialists",
        "Have adequate knowledge about radiation health hazards, radiation safety and protection",
        "Competent to take intra-oral radiographs and interpret the radiographic findings",
        "Gain adequate knowledge of various extra-oral radiographic procedures, TMJ radiography and Sialography",
        "Be aware of the importance of intra- and extra-oral radiograph in forensic identification and age estimation",
        "Should be familiar with jurisprudence, ethical and understand the significance of dental records with respect to law"
      ]
    }
  ],
  "teaching_hours": {
    "lecture": 65,
    "practical": 170,
    "total": 235
  },
  "teaching_methodology": [
    "Interactive and Group teaching",
    "Demonstrations and Teaching with LCD (Advanced audiovisual System), microphone and facilities for slide, overhead and multi-media projection",
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
      "topic": "Oral medicine and diagnostic aids; Diagnostic Methods",
      "must_know": [
        "Definition and importance of Diagnosis and various types of diagnosis",
        "Method of clinical examinations: General Physical examination by inspection",
        "Oro-facial region by inspection, palpation and other means",
        "Importance, role and use of saliva and techniques of diagnosis of saliva as part of oral disease",
        "Examination of lesions like swellings, ulcers, erosions, sinus, fistula, growths, pigmented lesions, white and red patches",
        "Examination of lymph nodes",
        "Investigations: Biopsy and exfoliative cytology",
        "Hematological, Microbiological and other tests and investigations necessary for diagnosis and prognosis"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Diagnosis, Differential Diagnosis",
      "must_know": [
        "Teeth: Developmental abnormalities, causes of destruction of teeth and their sequelae and discoloration of teeth",
        "Inflamation: Injury, infection and spread of infection, fascial space infections, osteoradionecrosis",
        "Temparomandibular joint: Developmental abnormalities of the condyle; Rheumatoid arthritis, Osteoarthritis, Subluxation and luxation",
        "Periodontal diseases: Gingival hyperplasia, gingivitis, periodontitis, pyogenic granuloma",
        "Common cysts and Tumors - Cysts: Cysts of soft tissue (Mucocele and Ranula); Cysts of bone (Odontogenic and nonodontogenic)",
        "Tumors - Soft Tissue: Epithelial (Papilloma, Carcinoma, Melanoma); Connective tissue (Fibroma, Lipoma, Fibrosarcoma); Vascular (Haemangioma, Lymphangioma); Nerve Tissue (Neurofibroma, Traumatic Neuroma, Neurofibromatosis); Salivary Glands (Pleomorphic adenoma, Adenocarcinoma, Warthin's Tumor, Adenoid cystic carcinoma)",
        "Tumors - Hard Tissue: Non Odontogenic (Osteoma, Osteosarcoma, Osteoclastoma, Chondroma, Chandrosarcoma, Central giant cell tumor, Central haemangioma); Odontogenic (Enameloma, Ameloblastoma, Calcifying Epithelial Odontogenic tumor, Adenomatoid Odontogenic tumor, Periapical cemental dysphasia, Odontomas)"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Oral medicines and therapeutics (Infections of the oral cavity)",
      "must_know": [
        "Bacterial: Streptococcal, tuberculosis, syphillis, vincents, leprosy, actinomycosis, diphtheria and tetanus",
        "Fungal: Candida albicans",
        "Virus: Herpes simplex, herpes zoster, ramsay hunt syndrome, measles, herpangina, mumps, infectious mononucleosis, AIDS and hepatitis-B"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Important common mucosal lesions",
      "must_know": [
        "White lesions: Chemical burns, leukodema, leukoplakia, fordyce spots, stomatitis nicotina palatinus, white sponge nevus, candidiasis, lichen planus, discoid lupus erythematosis",
        "Veiculo-bullous lesions: Herpes simplex, herpes zoster, herpangina, bullous lichen planus, pemphigus, cicatricial pemphigoid, erythema multiforme",
        "Ulcers: Acute and chronic ulcers",
        "Pigmented lesions: Exogenous and endogenous",
        "Red lesions: Erythroplakia, stomatitis venenata and medicamentosa, erosive lesions and denture sore mouth",
        "Cervico-facial lymphadenopathy"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Facial pain; Organic pain",
      "must_know": [
        "Organic pain: Pain arising from the diseases of orofacial tissues like teeth, pulp, gingival, periodontal tissue, mucosa, tongue, muscles, blood vessels, lymph tissue, bone, paranasal sinus, salivary glands etc.",
        "Tongue in local and systemic disorders: Aglossia, ankyloglossia, bifid tongue, fissured tongue, scrotal tongue, macroglossia, microglossia, geographic tongue, median rhomboid glossitis, depapillation of tongue, hairy tongue, atrophic tongue, reactive lymphoid hyperplasia, glossodynia, glossopyrosis, ulcers, white and red patches etc."
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Oral manifestations of systemic diseases",
      "must_know": [
        "Metabolic disorders: (a) Porphyria (b) Haemochromatosis (c) Histocytosis X diseases",
        "Endocrine disorders: Pituitary (Gigantism, acromegaly, hypopitutarism); Adrenal cortex (Addison's disease - Hypofunction, Cushing's syndrome - Hyperfunction); Parathyroid glands (Hyperparathyroidism); Thyroid gland (Hypothyroidism - Cretinism, myxedema); Pancreas (Diabetes)",
        "Nutritional deficiency: Vitamins - riboflavin, nicotinic acid, folic acid, Vitamin B12, Vitamin C (Scurvy)",
        "Blood disorders: (a) Red blood cell diseases - Deficiency anemias (Iron deficiency, plummer-vinson syndrome, pernicious anemia), Haemolytic anemias (Thalassemia, sickle cell anemia, erythroblastosis fetalis), Aplastic anemia, Polycythemia; (b) White Blood cell diseases - Neutropenia, cyclic neutropenia, agranulocytosis, infectious mononeucleosis and leukemias; (c) Haemorrhagic disorders - Thrombocytopenia, purpura, hemophillia, chrismas disease and von willebrand's disease"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Disease of salivary glands",
      "must_know": [
        "Development disturbances: Aplasia, atresia and aberration",
        "Functional disturbances: Xerostomia, ptyalism",
        "Inflammatory conditions: Nonspecific sialadenitis, mumps, sarcoidosis, heerdfort's syndrome (Uveoparotid fever), Necrotising sialometaplasia",
        "Cysts and tumors: Mucocele, ranula, pleomorphic adenoma, mucoepidermoid carcinoma",
        "Miscellaneous: Sialolithiasis, Sjogren's syndrome, mikuliez's disease and sialosis"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Dermatological diseases with oral manifestations",
      "must_know": [
        "Ectodermal dysplasia",
        "Hyperkerotosis palmarplantaris with periodontopathy",
        "Scleroderma",
        "Lichen planus including ginspan's syndrome",
        "Lupus erythematosus",
        "Pemphigus",
        "Erythema multiforme",
        "Psoriasis"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Immunological diseases with oral manifestations",
      "must_know": [
        "Leukemia",
        "Lymphomas",
        "Multiple mycloma",
        "AIDS - clinical manifestations, opportunistic infections, neoplasms",
        "Thrombcytopenia",
        "Lupus erythematosus",
        "Scleroderma",
        "dermatomyositis",
        "Submucous fibrosis",
        "Rhemtoid arthritis",
        "Recurrent oral ulcerations including behcet's syndrome and reiter's syndrome"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Allergy",
      "must_know": [
        "Local allergic reactions, anaphylaxis, serum sickness (local and systemic allergic manifestations to food, drugs and chemicals)"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Foci of oral infection and their ill effects on general health",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Management of dental problems in medically comrpomised persons",
      "must_know": [
        "Physiological changes: Puberty, pregnancy and menopause",
        "The patients suffering with cardiac, respiratory, liver, kidney and bleeding disorders, hypertension, diabetes and AIDS; Post-irradiated patients",
        "Precancerous lesions and conditions",
        "Neuralgic pain due to unknown causes: Trigeminal neuralgia",
        "Myofacial Pain Dysfunction Syndrome (MPDS), Bell's palsy"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Diseases of bone and Osteodystrophies",
      "must_know": [],
      "desirable_to_know": [
        "Development disorders: Anomalies, Exostosis and tori, infantile cortical hyperostosis, osteogenisis imperfecta, Marfans syndrome, osteopetrosis",
        "Metabolic disorders: Histiocytosis",
        "Endocrine: Acromegaly and hyperparathyroidism",
        "Miscellaneous: Paget's disease, Mono and polyostotic fibrous dysplasia, Cherubism",
        "Granulomatous diseases: Tuberculosis, Sarcoidosis, Midline lethal granuloma, Crohn's Disease and Histiocytosis X",
        "Miscellaneous Disorders: Burkitt lymphoma, sturge-Weber syndrome, CREST syndrome, rendu-osler-weber disease"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Pain arising due to C.N.S. diseases",
      "must_know": [],
      "desirable_to_know": [
        "Pain due to intracranial and extracranial involvement of cranial nerves (Multiple sclerosis, cerebrovascular diseases, trotter's syndrome etc.)",
        "Neuralgic pain due to unknown causes: glossopharyngeal neuralgia, sphenopalatine ganglion neuralgia, periodic migrainous neuralgia and atypical facial pain",
        "Referred pain: Pain arising from distant tissues like heart, spine etc.",
        "Altered sensations: paresthesia, halitosis"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Nerve and muscle diseases",
      "must_know": [],
      "desirable_to_know": [
        "Nerves: (a) Neuropraxia (b) Neurotemesis (c) Neuritis (d) Facial nerve paralysis including Heerfordt's syndrome, Melkerson Rosenthel syndrome and ramsay hunt syndrome (e) Neuroma (f) Neurofibromatosis (g) Frey's syndrome",
        "Muscles: (a) Myositis ossificans (b) Myofascial pain dysfunction syndrome (c) Trismus"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Therapeutics",
      "must_know": [],
      "desirable_to_know": [
        "General therapeutic measures - drugs commonly used in oral medicine viz., antibiotics, chemotherapeutic agents, anti-inflammatory and analgesic drugs, astringents, mouth washes, styptics, demelucents, local surface anaesthetic, sialogogues, antisialogogues and drugs used in the treatment of malignancy"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Recent advancements in Field of Oral Medicine and Oral Diagnosis; Clinical significance of laboratory values; Forensic examination",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": [
        "Procedures for post-mortem dental examination",
        "Maintaining dental records and their use in dental practice and post-mortem identification",
        "Jurisprudence and ethics",
        "Forensic odontology: (a) Medicolegal aspects of orofacial injuries (b) Identification of bite marks (c) Determination of age and sex (d) Identification of cadavers by dental appliances, Restorations and tissue remanants"
      ]
    },
    {
      "topic": "Oral Radiology - Scope of the subject and history of origin",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Physics of radiation",
      "must_know": [
        "(a) Nature and types of radiations (b) Source of radiations (c) Production of X-rays (d) Properties of X-rays (e) Compton effect (f) Photoelectric effect (g) Radiation measuring units"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Biological effects of radiation",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Radiation safety and protection measures",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Principles of image production",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Radiographic techniques",
      "must_know": [
        "Intra-Oral: (a) Periapical radiographs (Bisecting and parallel technics) (b) Bite wing radiographs (c) Occlusal radiographs",
        "Extra-oral: (a) Lateral projections of skull and jaw bones and paranasal sinuses (c) Cephalograms (d) Orthopantomograph (e) Projections of temperomandibular joint and condyle of mandible (f) Projections for Zygomatic arches",
        "Specialised techniques: (a) Sialography (b) Xeroradiography (c) Tomography"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Factors in production of good radiographs",
      "must_know": [
        "(a) K.V.P. and mAs of X-ray machine (b) Filters (c) Collimations (d) Intensifying screens (e) Grids (f) Xray films (g) Exposure time (h) Techniques (i) Dark room (j) Developer and fixer solutions (k) Film processing"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Radiographic normal anatomical landmarks",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Faculty radiographs and artefacts in radiographs",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Interpretation of radiographs in various abnormalities of teeth, bones and other orofacial tissue",
      "must_know": [],
      "desirable_to_know": [
        "Principles of radiotherapy of orofacial malignancies and complications of radiotherapy",
        "Contrast radiography and basic knowledge of radio-active isotopes"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Radiography in Forensic Odontology",
      "must_know": [],
      "desirable_to_know": [],
      "nice_to_know": [
        "Radiographic age estimation and post-mortem radiographic methods",
        "Recent advancements in Field of Oral and Maxillofacial Radiology"
      ]
    },
    {
      "topic": "Bioethics",
      "must_know": [
        "Bioethics is the application of ethics to the field of medicine and healthcare; it includes medical ethics (issues in health care), research ethics (conduct of research), environmental ethics (relationship between human activities and the environment), and public health ethics"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    }
  ],
  "practicals": [
    {
      "title": "Orientation Postings in Oral Medicine and Radiology"
    },
    {
      "title": "Introduction to clinical armamentarium"
    },
    {
      "title": "Demonstration of Patient registration"
    },
    {
      "title": "Orientation and visit to paramedical departments like Laboratory and Pharmacy"
    },
    {
      "title": "Writing of case sheets"
    },
    {
      "title": "Methods of arriving at Diagnosis"
    },
    {
      "title": "Treatment planing"
    },
    {
      "title": "Follow up"
    },
    {
      "title": "Demonstration of Intraoral, extraoral and Digital radiography"
    },
    {
      "title": "Training in Radiation protection methods"
    },
    {
      "title": "Interpretation of Pathology"
    },
    {
      "title": "Student should undergo Basic Life Support and Biomedical waste management training"
    }
  ],
  "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
  "disciplines": null,
  "_extraction_note": "Section 12 'ORAL MEDICINE AND RADIOLOGY' (pp.166-185) spans III and Final BDS; captured as one Final-BDS (academic_year 4) Oral Medicine Theory syllabus. teaching_hours are the subject-total minimum working hours (65/170/235); source also gives year splits (3rd BDS 20/70/90; 4th BDS 45/100/145). Tier placement (must/desirable/nice) follows the column each cell occupies in the source grid."
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
    "duration_hours": 3,
    "sections": [
      {
        "type": "Elaborate on",
        "count": 2,
        "marks_each": 10,
        "total": 20
      },
      {
        "type": "Write Notes on",
        "count": 10,
        "marks_each": 5,
        "total": 50
      }
    ],
    "total": 70
  },
  "practical_exam": {
    "components": [
      {
        "name": "Clinicals in Oral Medicine (recording of Long Case)",
        "total": 60,
        "breakup": [
          {
            "item": "Case History taking",
            "marks": 30
          },
          {
            "item": "Diagnosis & Differential Diagnosis",
            "marks": 10
          },
          {
            "item": "Investigations",
            "marks": 10
          },
          {
            "item": "Management",
            "marks": 10
          }
        ]
      },
      {
        "name": "Clinicals in Radiology (One Intra Oral Periapical Radiograph to be taken)",
        "total": 30,
        "breakup": [
          {
            "item": "Technique",
            "marks": 10
          },
          {
            "item": "Processing",
            "marks": 10
          },
          {
            "item": "Interpretation",
            "marks": 10
          }
        ]
      }
    ],
    "examination_total": 90,
    "viva": null
  },
  "internal_assessment": {
    "theory": 10,
    "practical": 10,
    "total": 20,
    "frequency": "Continuing assessment examination (both Theory/Practical) held at least 3 times in a particular year, best of two examinations considered; Internal Assessment marks submitted to the University once in every three months"
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
        "Burket's Oral Medicine, 12th Edition",
        "Differential Diagnosis of Oral and Maxillofacial Lesions, 5e (Norman K Wood, Paul W Goaz)",
        "White and Pharoah, Oral Radiology Principles and Interpretation: First South Asia Edition",
        "Essentials of Dental Radiography and Radiology, 4e by Eric Whaites",
        "Oral and Maxillofacial Pathology: First South Asia Edition by Neville",
        "Shafer's Textbook of Oral Pathology, 8th Edition"
      ]
    }
  ],
  "reference_groups": [
    {
      "group": "Oral Diagnosis, Oral Medicine & Oral Pathology",
      "books": [
        "Burkit - Oral Medicine - J.B. Lippincott Company",
        "Principles of Oral Diagnosis, Coleman, Mosby Year Book",
        "Oral Manifestations of Systemic Diseases, Jones, W.B. Saunders company",
        "Oral Diagnosis & Oral Medicine, Mitchell",
        "Oral Diagnosis, Kerr",
        "Oral Diagnosis & Treatment, Miller",
        "Clinical Methods, Hutchinson",
        "Oral Pathology, Shafers",
        "Principles and practice of Oral Medicine, Sonis.S.T., Fazio.R.C. and Fang.L"
      ]
    },
    {
      "group": "Oral Radiology",
      "books": [
        "Oral Radiology, White & Goaz, Mosby year Book",
        "Dental Radiology, Weahrman, C.V. Mosby Company",
        "Oral Roentgenographs Diagnosis, Stafne, W.B. Saunders Co",
        "Fundementals of Dental radiology, Sikri, CBS Publishing"
      ]
    },
    {
      "group": "Forensic Odontology",
      "books": [
        "Practical Forensic Odontology, Derek H. Clark, Butterworth-Heinemann",
        "Manual of Forensic Odontology, C Michael Bowers, Gary Bell"
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

-- ── 4217 Paedodontics ──
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
  '4217', 'Paedodontics Theory', NULL,     -- DCI model: no credits
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The dental graduates during training in the institutions should acquire adequate knowledge, necessary skills and reasonable attitudes which are required for carrying out all activities appropriate to general dental practice involving prevention, diagnosis and treatment of anomalies and diseases, of the teeth, mouth, jaws and associated tissues. The graduate also should understand the concept of community oral health education and be able to participate in the rural health care delivery programmes existing in the country.",
    "objectives": {
      "knowledge": [
        "Adequate knowledge of the scientific foundations on which dentistry is based and good understanding of various relevant scientific methods, principles of biological functions; ability to evaluate and analyze scientifically various established facts and data",
        "Adequate knowledge of the development, structure and function of the teeth, mouth and jaws and associated tissues both in health and disease and their relationship and effect on general state of health and also bearing on physical and social well being of the patient",
        "Adequate knowledge of clinical disciplines and methods which provide a coherent picture of anomalies, lesions and diseases of the teeth, mouth and jaws and preventive diagnostic and therapeutic aspects of dentistry",
        "Adequate clinical experience required for general dental practice",
        "Adequate knowledge of the constitution, biological function and behaviour of persons in health and sickness as well as the influence of the natural and social environment on the state of health in so far as it affect dentistry"
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
        "A graduate should have good knowledge and should be able to apply the different concepts and manage the patient as a whole"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in the appropriate modes; awareness of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes; basic operative skills in analysis of data and knowledge of multimedia; students should utilize a combination of traditional classroom courses and online courses"
      ]
    },
    "competencies": [
      { "group": "General skill", "items": [] },
      { "group": "Practice Management", "items": [] },
      { "group": "Communication and Community Resources", "items": [] },
      { "group": "Patient Care - Diagnosis", "items": [] },
      { "group": "Patient Care - Treatment Planning", "items": [] },
      { "group": "Competencies specific to the subject", "items": [
        "Able to instill a positive attitude and behaviour in children towards oral health and understand the principles of prevention and preventive dentistry - right from birth to adolescence",
        "Able to guide and counsel the guardian/parents with regard to various treatment modalities including different facets of preventive dentistry",
        "Able to treat dental diseases occurring in the child patient",
        "Able to manage the physically and mentally challenged/disabled children effectively and efficiently, tailored to the needs of individual requirement and conditions"
      ] }
    ],
    "teaching_hours": { "lecture": 65, "practical": 170, "total": 235 },
    "teaching_methodology": [
      "Lectures - powerpoint presentations, ohp sheets, interactive sessions",
      "Seminars",
      "Evaluation of clinical skills during their practical hours",
      "CDE programs",
      "Evaluation of clinical case presentations"
    ],
    "theory_syllabus": [
      { "topic": "Introduction to Pedodontics And Preventive Dentistry", "must_know": ["Definition, Scope, Objectives And Importance"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Growth And Development", "must_know": ["Importance of Study of Growth and Development In Pedodontics", "Prenatal and Postnatal Factors In Growth and Development", "Theories Of Growth And Development", "Development Of Maxilla And Mandible and Related Age Changes"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Development of Occlusion From Birth Through Adolescence", "must_know": ["Study Of Variations And Abnormalities"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Anatomy And Histology", "must_know": ["Development of Teeth and Associated Structures", "Eruption and Shedding of Teeth", "Teething Disorders and their Management", "Chronology Of Eruption Of Teeth", "Differences Between Deciduous And Permanent Teeth", "Importance Of First Permanent Molar"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Radiology Related To Pedodontics", "must_know": ["Dental Radiology Related To Pedodontics"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Oral Surgical Procedures In Children", "must_know": ["Indications And Contraindications of Extractions Of Primary And Permanent Teeth In Children", "Knowledge Of Local And General Anesthesia", "Minor Surgical Procedures In Children"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Caries", "must_know": ["Historical Background", "Definition, Etiology And Pathogenesis", "Caries Pattern In Primary, Young Permanent And Permanent Teeth In Children", "Rampant Caries, Early Childhood Caries and Extensive Caries: Definition, Etiology, Pathogenesis, Clinical Features, Complications And Management", "Role of Diet and Nutrition In Dental Caries", "Dietary Modifications and Diet Counseling", "Caries Activity Tests, Caries Prediction, Caries Susceptibility And Their Clinical Application"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Gingival And Periodontal Diseases In Children", "must_know": ["Normal Gingiva and Periodontium In Children", "Definition, Etiology and Pathogenesis", "Prevention And Management of Gingival and Periodontal Diseases"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Child Psychology", "must_know": ["Definition", "Theories of Child Psychology", "Psychological Development of Children With Age", "Principles of Psychological Growth and Development While Managing Child Patient", "Dental Fear And Its Management", "Factors Affecting Child's Reaction To Dental Treatment"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Behaviour Management", "must_know": ["Definitions", "Types of Behavior Encountered In The Dental Clinic", "Non-Pharmacological And Pharmacological Methods Of Behavior Management"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Pediatric Operative Dentistry", "must_know": ["Principles of Pediatric operative Dentistry", "Modifications Required For Cavity Preparation In Primary And Young Permanent Teeth", "Various Isolation Procedures", "Restorations Of Decayed Primary, Young Permanent And Permanent Teeth In Children Using Various Restorative Materials Like Glass Ionomer, Composites And Silver Amalgam", "Stainless Steel, Polycarbonate And Resin Crowns"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Pediatric Endodontics", "must_know": ["Principles And Diagnosis", "Classification Of Pulpal Pathology In Primary, Young Permanent And Permanent Teeth", "Management of Pulpally Involved Primary, Young Permanent and Permanent Teeth: Direct And Indirect Pulp Capping, Pulpotomy, Pulpectomy, Apexogenesis And Apexification", "Obturation Techniques And Materials Used For Primary, Young Permanent and Permanent Teeth In Children"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Traumatic Injuries In Children", "must_know": ["Classification And Importance", "Sequelae And Reaction of Teeth To Trauma", "Management Of Traumatized Teeth"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Preventive and Interceptive Orthodontics", "must_know": ["Definitions", "Problems Encountered During Primary and Mixed Dentition Phases and their Management", "Serial Extractions", "Space Management"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Oral Habits In Children", "must_know": ["Definition, Etiology And Classification", "Clinical Features Of Digit Sucking, Tongue Thrusting, Mouth Breathing and Various Secondary Habits", "Management Of Oral Habits In Children"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Care Of Children With Special Needs", "must_know": ["Definition, Etiology, Classification, Behavioural and Clinical Features and Management of Children With: Physically Handicapping Conditions, Mentally Handicapping Conditions, Medically Compromising Conditions And Genetic Disorders"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Congenital Abnormalities In Children", "must_know": ["Definition, Classification, Clinical Features And Management"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Emergencies In Children And Their Management", "must_know": ["Dental Emergencies In Children and their Management"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Materials Used In Pediatric Dentistry", "must_know": ["Dental Materials Used In Pediatric Dentistry"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Preventive Dentistry", "must_know": ["Definition", "Principles And Scope", "Types Of Prevention", "Different Preventive Measures Used In Pediatric Dentistry Including Pit and Fissure Sealants and Caries Vaccine"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Health Education And School Dental Health Programs", "must_know": ["Dental Health Education And School Dental Health Programs"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Fluorides", "must_know": ["Historical Background", "Systemic And Topical Fluorides", "Mechanism Of Action", "Toxicity And Management", "Defluoridation Techniques"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Case History Recording", "must_know": ["Outline Of Principles Of Examination, Diagnosis And Treatment Planning"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Setting up of Pedodontics Clinic", "must_know": [], "desirable_to_know": ["Genetics", "Growth and development with regard to advanced theory and its applications to patient management", "Management of child abuse and neglect", "Modifications of spacemaintainers and space management in children", "Advanced Oral surgical considerations in young child", "Advanced behavior management strategies", "Ethics - Introduction, ethics of an individual, profession ethics, research ethics, gathering all scientific factors, gathering all value factors, identifying areas of value conflict, setting of priorities and working our criteria towards decisions"], "nice_to_know": ["Pediatric dental implants in children", "Applications of lasers in pediatric Dentistry", "Regenerative Endodontics for primary teeth", "Orthopaedic appliances for children", "Management and Corrective surgical procedures for children with cleft lip and palate"] },
      { "topic": "Bioethics", "must_know": ["Bioethics is the application of ethics to the field of medicine and healthcare. Bioethics includes medical ethics, which focuses on issues in health care; research ethics, which focuses issues in the conduct of research; environmental ethics, which focuses on issues pertaining to the relationship between human activities and the environment, and public health ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Restorations - Class I & II only : 45" },
      { "title": "Preventive measures e.g. Oral Prophylaxis - 20" },
      { "title": "Fluoride applications - 10" },
      { "title": "Extractions - 25" },
      { "title": "Case History Recording & Treatment Planning - 10" },
      { "title": "Education & motivation of the patients using disclosing agents. Educating patients about oral hygiene measures like tooth brushing, flossing etc." }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
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
        { "type": "Elaborate on", "count": 2, "marks_each": 10, "total": 20 },
        { "type": "Write notes on", "count": 10, "marks_each": 5, "total": 50 }
      ],
      "total": 70
    },
    "practical_exam": {
      "title": "Management of child patient in the dental clinic",
      "total": 90,
      "components": [
        { "name": "Case history",   "marks": 30 },
        { "name": "Diagnosis",      "marks": 20 },
        { "name": "Treatment plan", "marks": 10 },
        { "name": "Treatment",      "marks": 30 }
      ]
    },
    "internal_assessment": {
      "frequency": "continuing assessment (Theory/Practical) held at least 3 times in a particular year, best of two considered; submitted to the University once every three months",
      "theory": 10, "practical": 10, "total": 20
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": [
        "Pediatric Dentistry (Infancy through Adolescences) - Pinkham",
        "Clinical Use of Fluorides - Stephen H. Wei",
        "Understanding of Dental Caries - Nikiforuk",
        "Handbook of Clinical Pedodontics - Kenneth. D.",
        "Dentistry for the Child and Adolescence - McDonald",
        "Pediatric Dentistry - Damle S. G.",
        "Behaviour Management - Wright",
        "Traumatic Injuries - Andreason",
        "Textbook of Pedodontics - Shobha Tandon"
      ] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": [
        "Paediatric Dentistry (Infancy through Adolescences) - Pinkham",
        "Kennedy's Pediatric Operative Dentistry - Kennedy & Curzon",
        "Occlusal guidance in Paediatric Dentistry - Stephen H. Wei",
        "Clinical Use of Fluorides - Stephen H. Wei",
        "Paediatric Oral & Maxillofacial Surgery - Kaban",
        "Paediatric Medical Emergencies - P. S. Whatt",
        "Understanding of Dental Caries - Niki Foruk",
        "An Atlas of Glass Ionomer cements - G. J. Mount",
        "Clinical Pedodontics - Finn",
        "Textbook of Pediatric Dentistry - Braham Morris",
        "Primary Preventive Dentistry - Norman O. Harris",
        "Handbook of Clinical Pedodontics - Kenneth. D.",
        "Preventive Dentistry - Forrester",
        "The Metabolism and Toxicity of Fluoride - Garry M. Whitford",
        "Dentistry for the Child and Adolescent - Mc. Donald",
        "Pediatric Dentistry - Damle S.G.",
        "Behaviour Management - Wright",
        "Pediatric Dentistry - Mathewson",
        "Traumatic Injuries - Andreason",
        "Occlusal guidance in Pediatric Dentistry - Nakata",
        "Pediatric Drug Therapy - Tomare",
        "Contemporary Orthodontics - Profitt",
        "Preventive Dentistry - Depaola",
        "Metabolism & Toxicity of Fluoride - Whitford. G. M.",
        "Endodontic Practice - Grossman",
        "Principles of Endodontics - Munford",
        "Endodontics - Ingle",
        "Pathways of Pulp - Cohen",
        "Management of Traumatized anterior Teeth - Hargreaves"
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

-- ── 4218 Orthodontics ──
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
  '4218', 'Orthodontics Theory', NULL,      -- DCI model: no credits
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
{
  "goal": "Practice the respective speciality efficiently and effectively, backed by scientific knowledge and skill; exercise empathy and a caring attitude and maintain high ethical standards; continue to evince keen interest in professional education in the speciality and allied specialities whether in teaching or practice; be willing to share the knowledge and skills with any learner, junior or a colleague; and develop the faculty for critical analysis and evaluation of various concepts and views and to adopt the most rational approach.",
  "objectives": {
    "knowledge": [
      "Demonstrate understanding of basic sciences relevant to speciality",
      "Describe aetiology, pathophysiology, principles of diagnosis and management of common problems within the speciality in adults and children",
      "Identify social, economic, environmental and emotional determinants in a given case and take them into account for planned treatment",
      "Recognise conditions that may be outside the area of speciality or competence and to refer them to the concerned specialist",
      "Keep up knowledge by self study and by attending courses, conferences and seminars pertaining to speciality",
      "Undertake audit, use information technology and carry out research in both basic and clinical fields with the aim of publishing or presenting the work at various scientific gatherings"
    ],
    "skills": [
      "Take a proper clinical history, examine the patient, perform essential diagnostic procedures and order relevant tests and interpret them to come to a reasonable diagnosis about the condition",
      "Acquire adequate skills and competence in performing various procedures as required in the speciality"
    ],
    "attitude": [
      "Adopt ethical principles in all aspects of practice",
      "Foster professional honesty and integrity",
      "Deliver patient care irrespective of social status, caste, creed, or religion of the patient",
      "Develop communication skills, to explain various options available and obtain a true informed consent from the patient",
      "Provide leadership and get the best out of his team in a congenial working atmosphere",
      "Apply high moral and ethical standards while carrying out human or animal research",
      "Be humble and accept the limitations in his knowledge and skill and to ask for help from colleagues when needed",
      "Respect patient's rights and privileges including the patient's right to information and right to seek a second opinion"
    ],
    "integration": [
      "Students should have a holistic understanding of each pathological situation and be able to frame a comprehensive treatment plan and deliver treatment to the limitations of what she/he is trained and efficient in, and at the same time refer to the concerned specialists thereafter for opinion / further management"
    ],
    "infection_control": [
      "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in the appropriate modes; awareness of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
    ],
    "computer_proficiency": [
      "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes; basic operative skills in analysis of data and knowledge of multimedia; utilize a combination of traditional classroom courses and online courses"
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
    "lecture": 50,
    "practical": 170,
    "total": 220
  },
  "teaching_methodology": [
    "Group discussions",
    "Seminars",
    "Role play",
    "Field visits",
    "Demonstrations",
    "Peer interactions etc.",
    "Integrated teaching to achieve horizontal and vertical integration across different phases, de-emphasising compartmentalisation of disciplines"
  ],
  "theory_syllabus": [
    {
      "topic": "Growth and Development: In general",
      "must_know": [
        "Definition",
        "Growth spurts and differential growth",
        "Factors influencing growth and development",
        "Methods of measuring growth",
        "Growth theories (Genetic, Sicher's, Scott's, Moss's, Petrovics, Multifactorial)",
        "Genetic and Epigenetic factors in growth",
        "Cephalocaudal gradient in growth"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Morphologic development of craniofacial structures",
      "must_know": [
        "Methods of bone growth",
        "Prenatal growth of craniofacial structures",
        "Postnatal growth and development of: Cranial base, Maxilla, Mandible, Dental arches and occlusion"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Functional development of dental arches and occlusion",
      "must_know": [
        "Factors influencing functional development of dental arches and occlusion",
        "Forces of occlusion",
        "Wolfe's law of transformation of bone",
        "Trajectories of forces"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Clinical application of growth and development; Malocclusion - In general",
      "must_know": [
        "Concept of normal occlusion",
        "Definition of Malocclusion",
        "Description of different types of dental, skeletal and functional malocclusion"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Classification of Malocclusion: Principle, description, advantages and disadvantages of classification of malocclusion by Angle's, Simon's, Lischer's and Ackerman and Proffitt's; Normal and abnormal function of Stomatognathic system; Aetiology of malocclusion",
      "must_know": [
        "Definition, importance, classification, local and general etiological factors",
        "Etiology of following different types of malocclusion"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Diagnosis and diagnostic aids - Midline diastema, Spacing, Crowding, Cross bite: anterior/posterior, Class III malocclusion, Class II malocclusion, Deep bite, Open bite",
      "must_know": [
        "Definition, importance and classification of diagnostic aids",
        "Importance of case history and clinical examination in orthodontics",
        "Study models: importance and uses - preparation and prevention of study models",
        "Importance of intraoral X-rays in orthodontics",
        "Cephalometrics: Its advantage and disadvantage"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Definition; Description and use of cephalostat; Description and use of anatomic landmarks, lines and angles used in cephalometric analysis; Analysis - Steiner's, Down's, Tweed's, Ricket's-E-line",
      "must_know": [
        "Panoramic radiograph - Principles, advantage, disadvantage and uses",
        "Electromyography and its uses in orthodontics",
        "Wrist X-rays and its importance in orthodontics"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "General principles in orthodontic treatment planning of dental and skeletal malocclusion; Anchorage in orthodontics - definition, classification, types and stability of anchorage; Biomechanical principles in orthodontic tooth movement",
      "must_know": [
        "Different types of tooth movement",
        "Tissue response to orthodontic force application",
        "Age factor in orthodontic tooth movement"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Preventive orthodontics",
      "must_know": [
        "Definition",
        "Different procedures undertaken in preventive orthodontics and their limitation"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Interceptive orthodontics",
      "must_know": [
        "Definition",
        "Different procedures undertaken in interceptive orthodontics and their limitations",
        "Serial extractions: Definition, indication, contra indication, technique, advantages and disadvantages",
        "Role of muscle exercises as an interceptive procedure"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Corrective orthodontics",
      "must_know": [
        "Definition, factors to be considered during treatment planning",
        "Model analysis: Pont's, Ashley Howe's, Bolton, Carey's, Moyer's mixed dentition analysis",
        "Methods of gaining space in the arch: Indications, relative merits and demerits of proximal stripping, arch expansion and extractions, molar distalisation",
        "Extractions in orthodontics - indications and selection of teeth for extraction"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Orthodontic appliances: General",
      "must_know": [
        "Requisites for orthodontic appliances",
        "Classification, indications of removable and functional appliances",
        "Methods of force applications",
        "Material used in construction of various orthodontic appliances - uses of stainless steel, technical consideration in curing of acrylic, principles of welding and soldering, fluxes and antifluxes",
        "Preliminary knowledge of acid etching and direct bonding"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Ethics in practice of dentistry and patient care; Removable Orthodontic Appliances",
      "must_know": [
        "Components of removable appliances",
        "Different types of clasps and their uses",
        "Different types of labial bows and their uses",
        "Different types of springs and their uses",
        "Expansion appliances in orthodontics: Principles; Indications of arch expansion; Descriptions of expansion appliances and different types of expansion devices and their uses; Rapid maxillary expansion"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Fixed Orthodontic Appliances",
      "must_know": [
        "Definition, Indications and Contraindications",
        "Component parts and their uses",
        "Basic principles of different techniques: Edgewise, Begg's, straight wire"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Extra Oral Appliances",
      "must_know": [
        "Headgears",
        "Chin cups",
        "Reverse pull headgear"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Myo Functional Appliances",
      "must_know": [
        "Definition and principles",
        "Muscle exercises and their uses in orthodontics",
        "Functional appliances: Activator, Oral screens, Frankel's functional regulator, Bionator, Twin block, Lip bumper",
        "Inclined planes - upper and lower"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Orthodontic management of Cleft lip and palate; Principles of surgical orthodontics",
      "must_know": [
        "Brief knowledge of correction of: Mandibular Prognathism and Retrognathism",
        "Maxillary prognathism and retrognathism",
        "Anterior open bite and deep bite",
        "Cross bite"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Principles, differential diagnosis and the methods of treatment of:",
      "must_know": [
        "Midline diastema",
        "Cross bite",
        "Deep bite",
        "Open bite",
        "Spacing",
        "Crowding",
        "Class II - Division 1, Division 2",
        "Class III Malocclusion - True and Pseudo class III"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Retention and Relapse",
      "must_know": [
        "Definition",
        "Need for retention",
        "Cause of relapse",
        "Methods of retention",
        "Different types of retention devices",
        "Duration of retention",
        "Theories of retention"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Clinicals and Practicals in Orthodontics",
      "must_know": [],
      "desirable_to_know": [
        "Model Analysis: Pont's, Ashley Howe's, Carey's, Boltons, Moyers"
      ],
      "nice_to_know": []
    },
    {
      "topic": "Cephalometric Analysis",
      "must_know": [],
      "desirable_to_know": [
        "Down's, Steiners, Tweeds"
      ],
      "nice_to_know": [
        "Implants In Orthodontics",
        "Cbct - Applications",
        "Hand Wrist Xray Tracing",
        "Digital Records",
        "Orthodontic Clinical Set Up",
        "Sterilisation In Orthodontics",
        "Soft Wares Applications In Orthodontics",
        "Accelerated Orthodontics",
        "Adult Orthodontics"
      ]
    },
    {
      "topic": "Bioethics",
      "must_know": [
        "Bioethics is the application of ethics to the field of medicine and healthcare; it includes medical ethics (issues in health care), research ethics (conduct of research), environmental ethics (relationship between human activities and the environment), and public health ethics"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    }
  ],
  "practicals": [
    {
      "title": "Discussion of 5 clinical cases, each of a different type: Dentoalveolar Malocclusion (Class I/II/III with proclination / spacing / deep bite / open bite etc.); Skeletal Class II - growing individuals requiring growth modification; Skeletal Class II - non-growing requiring surgical correction; Skeletal Class III - growing individuals requiring growth modification; Skeletal Class III - non-growing requiring surgical correction"
    },
    {
      "title": "Fabrication and delivery of 5 removable appliances"
    },
    {
      "title": "Mixed dentition analysis"
    },
    {
      "title": "Permanent dentition space analysis"
    },
    {
      "title": "Demonstration of welding and soldering"
    },
    {
      "title": "Demonstration of cephalometric tracing"
    },
    {
      "title": "Demonstration of fixed appliance"
    },
    {
      "title": "Basic wire bending exercise (Gauge 22 or 0.7mm): Straightening of wire (4 Nos); Bending of an equilateral triangle; Bending of a rectangle; Bending of a square; Bending of a circle; Bending of U.V."
    },
    {
      "title": "Labial bows: Short labial bow; Long labial bow; Robert's retractor; Split labial bow; High labial bow with apron spring"
    },
    {
      "title": "Construction of clasps (both sides upper/lower, Gauge 22 or 0.7mm): 3/4 clasp (C-Clasp); Full clasp (Jackson's Crib); Adam's clasp; Triangular clasp"
    },
    {
      "title": "Construction of springs (on upper both sides, Gauge 24 or 0.5mm): Finger spring; Single cantilever spring; Double cantilever spring (Z-spring)"
    },
    {
      "title": "Construction of canine retractors: Buccal canine retractor; Helical canine retractor; U loop canine retractor; Palatal canine retractor"
    },
    {
      "title": "Appliances: Upper Hawley's appliance; Upper Hawley's appliance with anterior bite plane; Upper Hawley's appliance with tongue spikes; Upper Hawley's retainer appliance"
    }
  ],
  "record_log_book": "Record shall be maintained as per University norms and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
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
    "total": 70,
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
    ]
  },
  "practical_exam": {
    "total": 90,
    "components": [
      {
        "name": "Clinicals / OSCE / OSPE / Spotters (10 stations)",
        "calc": "10 x 3",
        "marks": 30
      },
      {
        "name": "Clinical Case Discussion",
        "breakup": [
          {
            "name": "Intra & Extra Oral Findings",
            "marks": 10
          },
          {
            "name": "Diagnosis",
            "marks": 10
          },
          {
            "name": "Treatment Plan",
            "marks": 10
          }
        ],
        "marks": 30
      },
      {
        "name": "Working Skill - Wire Bending",
        "breakup": [
          {
            "name": "Adam's Clasp",
            "marks": 10
          },
          {
            "name": "Labial Bow",
            "marks": 10
          },
          {
            "name": "Spring",
            "marks": 10
          }
        ],
        "marks": 30
      }
    ]
  },
  "internal_assessment": {
    "theory": 10,
    "practical": 10,
    "total": 20,
    "frequency": "Continuing assessment (theory and practical) held at least 3 times per year, best of two examinations considered; IA marks submitted to the University once every three months, displayed on the notice board and a copy forwarded by HOD to the University once every 3 months",
    "based_on": [
      "Wire bending exercise / assignment completion",
      "Attendance in lab classes and clinical",
      "Clinical assignment completion on time",
      "Patient care - ethics, communication, behaviour, responsibility"
    ]
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
        "Essentials of Orthodontics - Neil T Reske",
        "Removable Orthodontic Appliances - Philip Adams",
        "Textbook of Orthodontics - Samir E Bishara",
        "Wire Bending - Dickson",
        "Dental Materials - Anu Savice",
        "Understanding Orthodontics - Perry",
        "Orthodontic Notes - Walter & Houston",
        "Handbook of Facial Growth - Enlow & Hans",
        "A Text Book of Orthodontics - WJB Houston, Stephans, Tilley",
        "Removable Orthodontic Appliance - Isaacson",
        "Principles and Practice of Orthodontics - J R E Mills"
      ]
    }
  ],
  "reference_groups": [
    {
      "group": "Reference Books",
      "books": [
        "Contemporary Orthodontics - William Proffit",
        "Orthodontics for Dental Students - White and Gardiner",
        "Handbook of Orthodontics - Moyers",
        "Orthodontics - Principles and Practice - Graber",
        "Design, Construction and Use of Removable Orthodontic Appliances - C. Philip Adams",
        "Clinical Orthodontics: Vol 1 & 2 - Salzmann"
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

-- ── 4219 Periodontics ──
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
  '4219', 'Periodontics Theory', NULL,       -- DCI model: no credits
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "To impart optimal knowledge to the students within the preview of the curriculum designed by the DCI - under the following guidelines - must know - desirable to know - nice to know.",
    "objectives": {
      "knowledge": [
        "To have adequate knowledge and understanding of the basic periodontal tissues, etiology, pathophysiology, diagnosis and treatment planning for various periodontal disease/ problem"
      ],
      "skills": [
        "To chart a proper clinical history after thorough examination of the patient, able to perform diagnostic procedure; able to interpret laboratory investigation; arrive at a provisional / definitive diagnosis regarding the periodontal problem in question"
      ],
      "attitude": [
        "To develop the right attitude to store his knowledge and the willingness to learn newer concept so as to keep pace with current technology and development; also to seek opinion from an allied Medical Dental specialist as and when required"
      ],
      "integration": [
        "From the integrated teaching of other clinical sciences, the students shall be able to describe the various signs, and symptoms and interpret the clinical manifestations of disease processes"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/ personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
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
      { "group": "Competencies specific to the subject", "items": [] }
    ],
    "teaching_hours": { "lecture": 80, "practical": 170, "total": 250 },
    "teaching_methodology": [
      "Third BDS (during clinical posting): Infection control",
      "Third BDS (during clinical posting): Periodontal instruments and instrumentation",
      "Third BDS (during clinical posting): Chair position, ergonomics, principles of instrumentation; maintenance of instruments",
      "Third BDS (during clinical posting): Basic tissues - gingiva, periodontal ligament, cementum, alveolar bone",
      "Third BDS (during clinical posting): Plaque control - both mechanical and chemical",
      "Third BDS (during clinical posting): Motivation of patients - oral hygiene instructions & education with typhodont",
      "Final BDS (during clinical posting): Revision of third BDS tutorial",
      "Final BDS (during clinical posting): Diagnosis / classification of periodontal disease",
      "Final BDS (during clinical posting): Determination of prognosis and treatment plan",
      "Final BDS (during clinical posting): Radiographic interpretation and lab diagnosis",
      "Final BDS (during clinical posting): Ultrasonic instrumentation",
      "Final BDS (during clinical posting): Principles of periodontal surgery",
      "Final BDS (during clinical posting): Periodontal surgical procedure and suturing technique",
      "Final BDS (during clinical posting): Concepts of local drug delivery",
      "Final BDS (during clinical posting): Occlusion - correction & management",
      "Final BDS (during clinical posting): Splinting techniques",
      "Final BDS (during clinical posting): Treatment of dental hypersensitivity",
      "Final BDS (during clinical posting): Implants - basics"
    ],
    "theory_syllabus": [
      {
        "topic": "Third BDS (lecture classes: 40 hours)",
        "must_know": [
          "Instruments and instructions",
          "Gingiva",
          "Junctional epithelium, gingival pigmentation",
          "GCF & saliva",
          "Cementum",
          "Periodontal ligament",
          "Ageing and the periodontal & alveolar bone",
          "Classification of periodontal disease",
          "Epidemiology of gingival and periodontal disease",
          "Plaque - introduction, properties, structure and formation",
          "Plaque - Microbial specificity, micro organisms associated with periodontal disease",
          "Calculus",
          "Immunology - basic concepts",
          "Immunology - microbial host interaction",
          "Gingivitis",
          "Acute lesions of gingiva",
          "Gingival enlargements",
          "Gingival bleeding",
          "Gingival recession",
          "Gingival disease in childhood",
          "Mechanical plaque control",
          "Chemical plaque control",
          "Systemic administration of drugs in periodontal therapy",
          "Chronic & aggressive periodontitis",
          "Periodontal pocket",
          "Abscesses of the periodontium - gingival, periodontal & pericoronal",
          "HIV & the periodontium",
          "Bone loss and patterns of bone destruction",
          "Trauma from occlusion",
          "Furcation involvement",
          "Tooth mobility",
          "Halitosis & Hypersensitivity"
        ],
        "desirable_to_know": [
          "Genetic factors associated with periodontal disease"
        ],
        "nice_to_know": [
          "Desquamative gingivitis",
          "Influence of endocrine disorders & hormonal changes on the periodontium",
          "Influence of haematological disorders & immune deficiencies on the periodontium",
          "Stress & psychosomatic disorders and the periodontium",
          "Nutritional influences on the periodontium",
          "Smoking and periodontal disease"
        ]
      },
      {
        "topic": "Final BDS",
        "must_know": [
          "Periodontal medicine",
          "Clinical diagnosis",
          "Radiographic and diagnostic aids in the diagnosis of periodontal disease",
          "Risk factors & risk assessment",
          "Determination of prognosis",
          "Treatment plan",
          "Periodontal treatment of medically compromised patient",
          "Iatrogenic factors in the etiology of periodontitis",
          "Ortho-perio inter-relationship",
          "Endo-perio inter-relationship",
          "Prostho-perio inter-relationship",
          "Host modulation & therapy",
          "Non-surgical therapy",
          "Local drug delivery",
          "Splinting",
          "Surgical anatomy & general principles of periodontal surgery",
          "Gingival surgical techniques - periodontal dressing",
          "Periodontal flap surgery",
          "Gingivectomy and gingivoplasty",
          "Resective osseous surgery",
          "Regeneration in periodontal therapy",
          "Healing in periodontal therapy",
          "Failures in periodontal therapy",
          "Supportive periodontal therapy",
          "Periodontal plastic and esthetic surgery",
          "Multi-disciplinary approach for the management of periodontal disease",
          "Diagnosis and treatment of periodontal emergencies",
          "Implant basics and diagnosis, treatment planning",
          "Peri-implant disease and management"
        ],
        "desirable_to_know": [
          "Advanced regenerative procedure in periodontics",
          "Recent advances in periodontal surgery",
          "Periodontal plastic and esthetic surgery",
          "Application of micro surgery in periodontics",
          "Implants - surgical concepts",
          "Supportive implant treatment"
        ],
        "nice_to_know": [
          "Advanced diagnostic technique - microbiological, immunological & radiographic",
          "Mucogingival surgery",
          "Lasers in periodontics"
        ]
      },
      {
        "topic": "Bioethics",
        "must_know": [
          "Bioethics is the application of ethics to the field of medicine and healthcare. Bioethics includes medical ethics, which focuses on issues in health care; research ethics, which focuses issues in the conduct of research; environmental ethics, which focuses on issues pertaining to the relationship between human activities and the environment, and public health ethics"
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      }
    ],
    "practicals": [
      { "title": "Case history taking followed by discussion" },
      { "title": "Final BDS: 5 long cases, 10 short cases" },
      { "title": "Oral prophylaxis - Handscaling - 75 cases" },
      { "title": "Demonstration of surgical procedure" },
      { "title": "Maintenance therapy" }
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
      "duration": "3 Hours",
      "sections": [
        { "type": "Elaborate on",  "count": 2,  "marks_each": 10, "total": 20 },
        { "type": "Write notes on", "count": 10, "marks_each": 5,  "total": 50 }
      ],
      "total": 70
    },
    "practical_exam": {
      "total": 90,
      "procedures": [
        "Case sheet writing for the given case",
        "Scaling",
        "Spotters - Instruments, Radiographic interpretation, chair side clinical diagnosis"
      ],
      "components": [
        { "name": "Case Sheet Writing", "marks": 10 },
        { "name": "Scaling",            "marks": 50 },
        { "name": "Spotters",           "marks": 20 },
        { "name": "Chairside viva",     "marks": 10 }
      ],
      "viva": { "max": 20 }
    },
    "internal_assessment": {
      "theory": 10, "practical": 10, "total": 20,
      "frequency": "held at least 3 times in a particular year, best of two examinations considered; marks submitted to the University once in every three months"
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": ["Carranza's Clinical Periodontology"] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": [
        "Clinical Periodontology & implantology by Jan Lindhe",
        "Contemporary Periodontics by Robert Genco, Henry Goldman",
        "Essentials of Periodontology and periodontics - Torquil MacPhee",
        "Contemporary Periodontics - Cohen",
        "Periodontal therapy - Goldman",
        "Orbans' periodontics - Orban",
        "Oral Health Survey - W.H.O.",
        "Preventive Periodontics - Young and Stiffler",
        "Public Health Dentistry - Slack",
        "Advanced Periodontal Disease - John Prichard",
        "Preventive Dentistry - Forrest",
        "Periodontics - Baer & Morris"
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

-- ── 4220 Prosthodontics ──
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
  '4220', 'Prosthodontics Theory', NULL,          -- DCI model: no credits
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The dental graduates during training in the institutions should acquire adequate knowledge, necessary skills and reasonable attitudes which are required for carrying out all activities appropriate to general dental practice involving prevention, diagnosis and treatment of anomalies and diseases of the teeth, mouth, jaws and associated tissues. The graduate also should understand the concept of community oral health education and be able to participate in the rural health care delivery programmes existing in the country.",
    "objectives": {
      "knowledge": [
        "Adequate knowledge of the scientific foundations on which dentistry is based and good understanding of various relevant scientific methods, principles of biological functions, ability to evaluate and analyze scientifically various established facts and deals.",
        "Adequate knowledge of the development, structure and function of the teeth, mouth and jaws and associated tissues both in health and disease and their relationship and effect on general state of health and also bearing on physical and social well being of the patient.",
        "Adequate knowledge of clinical disciplines and methods which provide a coherent picture of anomalies, lesions and diseases of the teeth, mouth and jaws and preventive diagnostic and therapeutic aspects of dentistry.",
        "Adequate clinical experience required for the general dental practice.",
        "Adequate knowledge of the constitution, biological functions and behavior of persons in health and sickness as well as the influence of the natural and social environment on the state of health in so far as it affects dentistry."
      ],
      "skills": [
        "Diagnose and mange various common dental problems encountered in general dental practice keeping in mind the expectations and the right of the society to receive the best possible treatment available wherever possible.",
        "Prevent and manage complications if encountered while carrying out various surgical and other procedures.",
        "Carry out certain investigative procedures and ability to interpret laboratory findings.",
        "Promote oral health and help prevent oral disease where possible.",
        "Control pain and anxiety among the patients during dental treatment."
      ],
      "attitude": [
        "Willingness to apply the current knowledge of dentistry in the best interest of the patient and community.",
        "Maintain a high standard of professional ethics and conduct and apply these in all aspects of professional life.",
        "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community.",
        "Willingness to participate in the CPED programmes to update knowledge and professional skill time to time.",
        "Help and participate in the implementation of the National Oral Health Policy."
      ],
      "integration": [
        "Integrated knowledge about all the divisions in Prosthodontics (CD, RPD, FPD, IMPLANTS etc)"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal."
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses, and online courses."
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
    "teaching_hours": { "lecture": 110, "practical": 370, "total": 480 },
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
      {
        "topic": "Under graduate student must have the following knowledge",
        "must_know": [
          "Diagnosis and Treatment Planning in Complete Denture.",
          "History and Patient Evaluation in Complete Denture.",
          "Anatomical Landmarks in Maxilla and Mandible.",
          "Principles and Objectives of Impression Making.",
          "Special Tray Fabrication and Secondary Impression.",
          "Record Base Fabrication and Occlusal Rims.",
          "Recording Centric Jaw Relation.",
          "Articulators.",
          "Arrangement of Artificial Teeth.",
          "Fabrication of Complete Denture - Lab Procedure",
          "Relining and Rebasing Procedures.",
          "Classification of Partially Edentulous Arch.",
          "Major Connectors and Minor Connectors.",
          "Retainers in RPD.",
          "Construction of Removable Denture.",
          "Indication and Contraindication of FPD.",
          "Parts of Fixed Partial Denture.",
          "Principles of Tooth Preparation.",
          "Types of FPD.",
          "Impression Making in FPD.",
          "Soldering and Welding Techniques.",
          "Luting Cements.",
          "Types of Maxillofacial Defects.",
          "Materials Used in Maxillofacial Prosthesis.",
          "Diagnosis and Treatment Planing for Implant",
          "Oseointegration.",
          "Titanium.",
          "Classification of Implants.",
          "Temporomandibular joint Anatomy.",
          "Temporomandiibular joint Disorders."
        ],
        "desirable_to_know": [
          "Mouth Preparation in Complete Denture Fabrication.",
          "Single Complete Denture.",
          "Over Dentures.",
          "Recording Neutral Zone.",
          "Surveying in RPD",
          "Cast Partial Dentures.",
          "Attachments in RPD.",
          "Principles in RPD.",
          "Immediate Dentures.",
          "Materials in FPD.",
          "Fluid Control and Soft Tissue Management.",
          "Resin Bonded Bridges.",
          "Lab Procedures in FPD Fabrication.",
          "Extraoral defects, Intra oral defects and its Managements.",
          "Stents in Implant Placement.",
          "Instruments and Parts of Implant.",
          "Surgical Procedures in Implant Placement."
        ],
        "nice_to_know": [
          "Balancing in Complete Dentures",
          "Semi Adjustable and Fully Adjustable Articulators.",
          "Interocclusal Records in Complete Denture.",
          "Implant Supported Complete Denture.",
          "RPI concept in RPD.",
          "Occlusion in FPD.",
          "Implant Abutments.",
          "Laminate and Veneers.",
          "Obturators.",
          "Implant retained Prosthesis.",
          "Cleft Lip and Cleft Palate Management.",
          "Implant Prosthesis",
          "Grating Techniques in Implant Surgery.",
          "Loading Protocol in Implants."
        ]
      },
      {
        "topic": "Bio-Ethics",
        "must_know": [
          "Respect human life and the dignity of every individual.",
          "Refrain from supporting or committing crimes against humanity and codemn all such acts.",
          "Treat the sick and injured with competence and compassion and without prejudice and apply the knowledge and skills when needed.",
          "Protect the privacy and confidentiality of those for whom we care and breach that confidence only when keeping it would seriously threaten their health and safety or that of others.",
          "Work freely with colleagues to discover, develop, and promote advances in medicine and public health that ameliorate suffering and contribute to human well being.",
          "Educate the public about present and future threats to the health of humanity.",
          "Advocate for social, economic, educational and political changes that ameliorate suffering and contribute to human well being.",
          "Teach and mentor those who follow us, for they are the future of our caring profession."
        ],
        "desirable_to_know": [],
        "nice_to_know": []
      }
    ],
    "practicals": [
      { "title": "Procedures - fabrication of Complete Dentures (5)" },
      { "title": "Procedures - fabrication of Removable Partial Dentures (30)" },
      { "title": "Demonstration of steps in Complete Denture Fabrication" },
      { "title": "Demonstration of tooth preparation in artificial teeth" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
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
      "total": 70,
      "sections": [
        { "type": "Elaborate on",   "count": 2,  "marks_each": 10, "total": 20 },
        { "type": "Write notes on", "count": 10, "marks_each": 5,  "total": 50 }
      ]
    },
    "practical_exam": {
      "type": "OSCE/OSPE",
      "total": 90,
      "year": "Final Year",
      "sections": [
        {
          "group": "Complete Denture",
          "items": [
            { "name": "Case history and Discussion with Instrumentation", "marks": 10, "time": "15 Minutes" },
            { "name": "Border molding with special tray", "marks": 15, "time": "30 Minutes" },
            { "name": "Master impression (patient may be completely edentulous or single edentulous arch)", "marks": 20, "time": "15 Minutes" }
          ]
        },
        {
          "group": "Fixed Prosthodontics",
          "items": [
            { "name": "Articulated Model and Instrumentation", "marks": 10, "time": "10 Minutes" },
            { "name": "Tooth preparation in Articulated artificial teeth", "marks": 25, "time": "45 Minutes" }
          ]
        },
        {
          "group": "Spotters",
          "marks": 10,
          "time": "20 Minutes",
          "items": [
            "Cast partial denture",
            "Identification of Kennedys Class in RPD",
            "Elastomeric materials",
            "Semi Adjustable Articulators",
            "Mean Value and Hinge Articulators",
            "Face Bow",
            "Surgical Obturator",
            "Feeding Plate",
            "Abrasives and Polishing agents",
            "Acrylic, Metal Ceramic, Full metal Crowns and Bridges"
          ]
        }
      ],
      "viva": 20
    },
    "internal_assessment": {
      "theory": 10,
      "practical": 10,
      "total": 20,
      "frequency": "Continuing assessment examination (both Theory/Practical) held at least 3 times in a particular year and best of two examinations considered. Internal Assessment marks submitted to the University once in every three months."
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": [
        "Essential of Complete Denture Prosthodontics - Winkler",
        "Prosthodontic Treatment for Edentluous Patients - Zarb Bolender",
        "Clinical Removable Partial Denture - Stewart",
        "Fundamentals of Fixed Prosthodontics - Shillingburg",
        "Text Book of Prosthodontics - Deepak Nallaswam"
      ] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": [
        "Impression Techniques for Complete Denture - Bernard Levin",
        "Removable Partial Prosthodontics - Mc Cracken",
        "Contemporary Fixed Partial Denture - Rosenstiel",
        "Syllabus of Complete denture by - Charles M. Heartwell Jr. and Arthur O. Rahn.",
        "Boucher's Prosthodontic treatment for edentulous patients",
        "Essentials of complete denture prosthodontics by - Sheldon Winkler",
        "Maxillofacial prosthetics by - Willam R. Laney",
        "McCraken's Removable partial prosthodontics",
        "Removable partial prosthdontics by - Ernest L. Miller and Joseph E. Grasso."
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

-- ── 4221 Conservative Dentistry ──
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
  '4221', 'Conservative Dentistry Theory', NULL,
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
{
  "goal": "To acquire adequate knowledge, necessary skills and attitudes which are required for carrying out all the activities appropriate to general dental practice involving the prevention, diagnosis and treatment of anomalies and diseases of the teeth, mouth, jaws and associated tissues. To provide critical knowledge and understanding of conservative dentistry and endodontics. To train the undergraduate students and equip with knowledge, attitude and skills necessary to carry out procedures in conservative dentistry and endodontics.",
  "objectives": {
    "knowledge": [
      "Adequate knowledge and understanding of Etiology, Diagnosis and Treatment procedures.",
      "Adequate knowledge of the scientific foundations on which dentistry is based and good understanding of various relevant scientific methods, principles of biological functions and should be able to evaluate and analyze scientifically various established facts and data.",
      "Adequate knowledge of the development, structure and function of the teeth, mouth and jaws and associated tissues both in health and disease and their relationship and effect on general-state of health and also the bearing on physical and social well-being of the patient.",
      "Adequate knowledge of clinical disciplines and methods, which provide a coherent picture of anomalies, lesions and diseases of the teeth, mouth and jaws and preventive, diagnostic and therapeutic aspects of dentistry.",
      "Adequate clinical experience required for general dental practice.",
      "Adequate knowledge of biological function and behavior of persons in health and sickness as well as the influence of the natural and social environment on the state of health so far as it affects dentistry."
    ],
    "skills": [
      "Able to diagnose and manage various common dental problems encountered in general dental practice, keeping in mind the expectations and the right of the society to receive the best possible treatment available wherever possible.",
      "Acquire skill to prevent and manage complications if encountered while carrying out various dental surgical and other procedures.",
      "Possess skill to carry out required investigative procedures and ability to interpret laboratory findings.",
      "Promote oral health and help to prevent oral diseases wherever possible.",
      "Competent in control of pain and anxiety during dental treatment."
    ],
    "attitude": [
      "Have empathy for the patient and do the best possible as situation demands.",
      "Willing to apply current knowledge of dentistry in the best interest of the patients and the community.",
      "Maintain a high standard of professional ethics and conduct and apply these in all aspects of professional life.",
      "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community.",
      "Willingness to participate in the continuing education programmes to update knowledge and professional skills from time to time.",
      "To help and to participate in the implementation of national health programmes."
    ],
    "integration": [
      "At the conclusion of the course the student should be able to diagnose and treat the disease efficiently.",
      "Should integrate interdisciplinary approach and management."
    ],
    "infection_control": [
      "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal."
    ],
    "computer_proficiency": [
      "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses, and online courses.",
      "Technological Requirements for all Graduate Students.",
      "A laptop or desktop computer that supports the following requirements: Operating system requirements; Internet browser requirements; Reliable and consistent access to the internet; Antivirus software which is current and consistently updated; Microsoft Office; Adobe Reader (or equivalent to view PDF files)."
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
      "items": [
        "Competent to diagnose all carious lesions.",
        "Competent to perform class 1 and class 2 cavities and restoration with amalgam.",
        "Competent to perform class 3 and class 4 cavities and restoration with glass ionomer cement.",
        "Competent to perform anterior root canal treatment.",
        "Take proper chair side history, examine the patient and perform medical and dental diagnostic procedures and order as well as perform relevant tests and interpret them.",
        "To come to a reasonable diagnosis about the dental condition in general and Conservative Dentistry - Endodontics in particular and undertake complete patient monitoring including preoperative as well as post operative care of the patient."
      ]
    }
  ],
  "teaching_hours": {
    "lecture": 110,
    "practical": 370,
    "total": 480
  },
  "teaching_methodology": [
    "To be more interactive.",
    "Student should come with sufficient information to be able to receive the applied concepts and skills better.",
    "Student should be keen to learn and demonstrate.",
    "Lectures",
    "Lecture Demonstrations",
    "Practical exercises",
    "Audio visual aids",
    "Small group discussions with regular feedback from the students",
    "Integrated Teaching",
    "Symposium and continuing medical education programmes."
  ],
  "theory_syllabus": [
    {
      "topic": "1.",
      "must_know": [
        "Class 1 Amalgam",
        "Class 1 amalgam With Buccal and Palatal Extensions",
        "Class 2 Amalgam",
        "Class 3 And Class 5 Gic",
        "Management Of Deep Caries - Temporary Restorations"
      ],
      "desirable_to_know": [
        "Anterior Root Canal Treatment",
        "Class 4 Composite",
        "Observations/Demonstrations of Vitality Assessment - EPT, WL Assessment, Apex Locators, Periapical Surgery, Midline Diastema, Bleaching, Cast/Fibre Post, Avulsed Tooth Management (Holding Medium, Splinting)",
        "Rubber Dam Application"
      ],
      "nice_to_know": [
        "Indirect Restorations - Casting Procedures",
        "Observations/Demonstrations of Magnification - Loupes, RVG, Rotary Endodontics, Thermoplastisized Gutta Percha, Ceramic Processing, Management of Trauma, Rubber Base Impression Procedures"
      ]
    },
    {
      "topic": "2. Additional Topics",
      "must_know": [],
      "desirable_to_know": [
        "Biofilms",
        "Magnification - Microscopes, Microscopic Surgery, Loupes",
        "Recent Classification Of Trauma",
        "Newer Concepts In Caries",
        "Rotary Endodontic Techniques",
        "Veneers",
        "Light Cure Lamps, Bleaching Lights",
        "Core Build Up Materials"
      ],
      "nice_to_know": []
    },
    {
      "topic": "3.",
      "must_know": [
        "Anterior RCT",
        "Class IV Composite",
        "Midline Diastema and Space Management",
        "BLS Course (Basic Life Support) - 3 Days"
      ],
      "desirable_to_know": [
        "Premolar RCT",
        "Full Crown"
      ],
      "nice_to_know": [
        "Magnification Loupes",
        "Management of Avulsed/Subluxated Tooth"
      ]
    },
    {
      "topic": "Lecture Classes",
      "must_know": [
        "Introduction To Operative Dentistry",
        "Glossary & Its Significance.",
        "Tooth Designation & System Followed.",
        "Classification of Caries",
        "Basic Principles In Cavity Preparation",
        "Instruments & Equipment for Tooth Preparation.",
        "Cavity Preparation for Amalgam.",
        "Cavity Preparation for Inlay",
        "Tooth Preparation for Tooth Colored Materials",
        "Matrices and Retainers",
        "Deep Caries Management",
        "Introduction to Root Canal Treatment and Pulpotomy.",
        "Operators Position, and Chair Position for the Patient.",
        "Basic aspects of Sterilization of Instruments and Equipment",
        "Basic aspects of Management of Various Restorative Materials. (Amalgam, Cement, Glass Ionomer, Composites)"
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Conservative Dentistry",
      "must_know": [
        "Definition & Scope, Oral Hygiene in Relation to Conservative Dentistry. Instruments - Nomenclature, Design and Formulae, Care and Sterilization, Examination, Diagnosis and Treatment Planning, Charting and Recording of Cases, Cavities Classification and Nomenclature, Choice of Filling Materials.",
        "Principles of Cavity Preparation.",
        "Control of Pain, Prevention of Damages to Hard and Soft Tissues During Operative Procedures.",
        "Methods Employed for Exclusion of Saliva.",
        "Bio Mechanics of Cavity Design and Restoration with Filling Materials, Pulp and Soft Tissue Protection.",
        "Airotors and High Speed Equipment.",
        "Cavity Preparation for Various Types of Restorations Including Inlays and Onlays. Restorative Procedures, Matrices, Drugs Used In The Conservative Dentistry, Fractured Teeth and Their Treatment, Hypersensitivity and its Treatment, Ceramics In Conservative Dentistry."
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Endodontics",
      "must_know": [
        "Rationale of Endodontic Therapy, Diagnostic Aids In Endodontics, Care and Sterilization of Instrument for Endodontic Treatment of Vital and Non-Vital Pulp, Tests for Sterility of the Root Canal, Drugs Used In Root Canal Therapy.",
        "Bleaching of Teeth.",
        "Restoration of Endodontically Treated Teeth, Surgical Endodontics."
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    },
    {
      "topic": "Biomedical Ethics",
      "must_know": [
        "Respect Human Life and the Dignity of Human Individual.",
        "Refrain From Supporting or Commiting Crimes against Humanity and Condemn all such acts.",
        "Treat the Sick and Injured with Competence and Compassion.",
        "Protect the Privacy and Confidentiality of those whom we care.",
        "Work Freely with Colleagues.",
        "Educate The Public.",
        "Teach and Mentor those who follow us."
      ],
      "desirable_to_know": [],
      "nice_to_know": []
    }
  ],
  "practicals": [
    {
      "title": "Preclinical exercises - II Year B.D.S. Exercise I: Excavation of Deep Caries & Indirect Pulp capping"
    },
    {
      "title": "Exercise II: Excavation of Deep Caries & Direct Pulp capping"
    },
    {
      "title": "Exercise III: Pulpotomy"
    },
    {
      "title": "Exercise IV: Class preparations to receive Silver Amalgam - One Lower Molar with Buccal Extension (1), One Lower Premolar (1), One Upper Molar (1)"
    },
    {
      "title": "Exercise V: Class II preparation for Silver Amalgam - One Lower Molar (Mesio Occlusal) (1), One Lower Premolar (Disto Occlusal) (1), One Upper Molar (Disto Occlusal) (1)"
    },
    {
      "title": "Exercise VI: Class III preparation for tooth Coloured Material - One Upper Central Incisor (Palatal Approach) (1), One Lower Central Incisor (Labial Approach) (1)"
    },
    {
      "title": "Exercise VII: Class V Preparations - One Upper Canine (Tooth coloured Material) (1), One Lower Molar (Amalgam)"
    },
    {
      "title": "Exercise VIII: Inlay Preparation - One Lower Molar (Mesio Occluso Distal) (1), One Upper Molar (Occlusal) (1)"
    },
    {
      "title": "Exercise IX: Access cavity preparation - One Upper Lateral Incisor (1)"
    },
    {
      "title": "Exercise X: Observation on Fractured teeth"
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
    "duration_hours": 3,
    "total_marks": 70,
    "sections": [
      {
        "section": "Elaborate on",
        "questions": 2,
        "marks_each": 10,
        "total": 20,
        "note": "One Essay in Conservative Dentistry and One Essay in Endodontics"
      },
      {
        "section": "Write notes on",
        "questions": 10,
        "marks_each": 5,
        "total": 50,
        "note": "Four questions in Conservative Dentistry, Four questions in Endodontics, One question in Dental Materials and One question in Esthetic Dentistry"
      }
    ]
  },
  "practical_exam": {
    "clinical_exercise_choices": [
      "Preparation for class II amalgam and restoration OR Preparation for Class I amalgam with buccal / palatal extension",
      "Anterior composite restoration",
      "Root canal treatment for anterior tooth up to WL determination"
    ],
    "options": [
      {
        "name": "Class I / Class II amalgam restoration",
        "components": [
          {
            "item": "Case history recording, examination, diagnosis and treatment planning",
            "marks": 10
          },
          {
            "item": "Tooth preparation",
            "marks": 35
          },
          {
            "item": "Base and matrix",
            "marks": 15
          },
          {
            "item": "Restoration and carving",
            "marks": 30
          }
        ],
        "total": 90
      },
      {
        "name": "Anterior composite restoration",
        "components": [
          {
            "item": "Case history recording, examination, diagnosis and treatment planning",
            "marks": 10
          },
          {
            "item": "Tooth preparation",
            "marks": 35
          },
          {
            "item": "Lining and matrix",
            "marks": 15
          },
          {
            "item": "Restoration",
            "marks": 20
          },
          {
            "item": "Finishing",
            "marks": 10
          }
        ],
        "total": 90
      },
      {
        "name": "Anterior RCT",
        "components": [
          {
            "item": "Case history recording, examination, diagnosis and treatment planning",
            "marks": 10
          },
          {
            "item": "Access preparation",
            "marks": 35
          },
          {
            "item": "Working length",
            "marks": 15
          },
          {
            "item": "Cleaning and shaping, Master cone selection",
            "marks": 30
          }
        ],
        "total": 90
      }
    ],
    "viva": 20,
    "total": 90
  },
  "internal_assessment": {
    "theory": 10,
    "practical": 10,
    "total": 20,
    "frequency": "Continuing assessment (Theory/Practical) held at least 3 times in a particular year, best of two considered; Internal Assessment marks submitted to the University once every three months."
  }
}
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
{
  "groups": [
    {
      "group": "Dental Materials",
      "books": [
        "Restorative Dental Materials - Robert G. Craig",
        "Notes on Dental Materials - E.C. Combe"
      ]
    },
    {
      "group": "Conservative Dentistry and Endodontics",
      "books": [
        "The Art & Science of Operative Dentistry - Sturdevant, Mosby U.S.A",
        "Pickard's Manual of Operative Dentistry",
        "Principle & Practice of Operative Dentistry - Charbeneu, Varghese Publishing, Mumbai",
        "Grossman's Endodontic Practice - B. Suresh Chandra & V. Gopikrishna, Wolters Kluwer"
      ]
    }
  ],
  "reference_groups": [
    {
      "group": "Reference Books",
      "books": [
        "Introduction to Dental Materials - Van Noort",
        "Applied Dental Materials - McCabe",
        "Ingle's Textbook of Endodontics",
        "Cohen's Pathways of the Pulp",
        "Fundamentals of Operative Dentistry: A Contemporary Approach - James B. Summit"
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

-- ── 4222 Oral Surgery ──
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
  '4222', 'Oral Surgery Theory', NULL,      -- DCI model: no credits
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "To produce a graduate who is competent in performing extraction of teeth under both local and general anaesthesia, prevent and manage related complications, acquire a reasonable knowledge and understanding of the various diseases, injuries, infections occurring in the Oral & Maxillofacial region and offer solutions to such of those common conditions and has an exposure into the in-patient management of maxillofacial problems.",
    "objectives": {
      "knowledge": [
        "Apply the knowledge gained in the related medical subjects like pathology, microbiology and general medicine in the management of patients with oral surgical problems",
        "Diagnose, manage and treat (understand the principles of treatment) patients with oral surgical problems",
        "Gain knowledge of a range of surgical treatments",
        "Be able to decide the requirement of a patient to have oral surgical specialist opinion or treatment",
        "Understand the principles of in-patient management",
        "Understand the management of major oral surgical procedures and principles involved in patient management",
        "Know the ethical issues and have communication ability"
      ],
      "skills": [
        "Acquire the skill to examine any patient with an oral surgical problem in an orderly manner, understand requisition of various clinical and laboratory investigations and be capable of formulating differential diagnosis",
        "Be competent in the extraction of teeth under both local and general anaesthesia",
        "Be able to carry out certain minor oral surgical procedures under LA like frenectomy, alveolar procedures & biopsy etc.",
        "Ability to assess, prevent and manage various complications during and after surgery",
        "Able to provide primary care and manage medical emergencies in the dental office",
        "Understand the management of major oral surgical problems and principles involved in in-patient management"
      ],
      "attitude": [
        "Willingness to apply the current knowledge of dentistry in the best interest of the patient and community",
        "Maintain a high standard of professional ethics and conduct and apply these in all aspects of professional life",
        "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community",
        "Willingness to participate in the CDE programmes to update knowledge and professional skill from time to time",
        "Help and participate in the implementation of the national oral health policy"
      ],
      "integration": [
        "Horizontal integration - provision of learning within the structure where individual departments/subject areas contribute to the development and delivery of learning in a meaningful, holistic manner, with links made between different subject areas",
        "Vertical integration - combination of basic and clinical sciences such that the traditional divide between preclinical and clinical studies is broken down, with basic science represented explicitly within clinical environments across all years of undergraduate education and beyond",
        "Example: all students studied a case of oral cancer - the second-year student prepared the pathology part while the intern correlated it with the case presentation, a first year explained the anatomy and the final year explained the signs, symptoms, grading and staging, and the surgical part was correlated with anatomy by the postgraduate"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in appropriate modes; awareness of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of computers, MS Office, Windows 2000 and statistical programmes; basic operative skills in analysis of data and knowledge of multimedia; use of a combination of traditional classroom courses and online courses, with technological requirements (laptop/desktop with OS, internet browser, reliable internet, antivirus, Microsoft Office, Adobe Reader) completed"
      ]
    },
    "competencies": [
      { "group": "General skills", "items": [] },
      { "group": "Practice Management", "items": [] },
      { "group": "Communication and Community Resources", "items": [] },
      { "group": "Patient Care - Diagnosis", "items": [] },
      { "group": "Patient Care - Treatment Planning", "items": [] },
      { "group": "Competencies specific to the subject", "items": [
        "Able to apply the knowledge gained in the basic medical and clinical subjects in the management of patients with surgical problems",
        "Able to diagnose, manage and treat patients with basic oral surgical problems",
        "Have a broad knowledge of maxillofacial surgery and oral implantology",
        "Should be familiar with legal, ethical and moral issues pertaining to patient care and communication skill",
        "Should have acquired the skill to examine any patient with an oral surgical problem in an orderly manner",
        "Understand and practice the basic principles of asepsis and sterilization",
        "Should be competent in the extraction of teeth under both local and general anaesthesia",
        "Competent to carry out certain minor oral surgical procedures under LA like trans-alveolar extraction, frenectomy, dento-alveolar procedures, simple impaction, biopsy etc.",
        "Competent to assess, prevent and manage common complications that arise during and after minor oral surgery",
        "Able to provide primary care and manage medical emergencies in the dental office",
        "Familiar with the management of major oral surgical problems and principles involved in the in-patient management"
      ] }
    ],
    "teaching_hours": { "lecture": 70, "practical": 270, "total": 340 },
    "teaching_methodology": [
      "Combination of lectures",
      "Small group seminars, tutorials",
      "Clinical skills laboratory sessions",
      "Supervised clinical activity",
      "Problem based curriculum in problem solving and diagnosis"
    ],
    "theory_syllabus": [
      { "topic": "Introduction", "must_know": ["Definition, aims & objectives and scope of Oral and Maxillofacial surgery"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Diagnosis in oral surgery", "must_know": ["History taking", "Clinical examination", "Investigations"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Infection control", "must_know": ["Principles of infection control; asepsis - definition and measures to prevent infection during surgery", "Preparation of the patient; measures to be taken by operator", "Sterilisation of instruments - various methods of sterilisation", "Cross infection, HIV/AIDS and hepatitis"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Local Anaesthesia and General anaesthesia", "must_know": ["Neurology of facial pain", "Historical aspects, definition, types of LA, indications, contraindications, advantages and disadvantages; concept of LA", "Local anaesthetic drugs and classification; ideal requirements of LA solutions, composition and mode of action; types of LA; choice of particular mode of anaesthesia", "Complications of LA, prevention and management", "Anaesthesia technique - Mandible: pterygomandibular space boundaries and contents, inferior dental nerve block techniques and complications, mental foramen nerve block", "Anaesthesia technique - Maxilla: infraorbital nerve block, posterior superior alveolar nerve block", "Use of vasoconstrictors in local anaesthetic solution - advantages, contraindications, various vasoconstrictors used", "Concept of general anaesthesia; indications of GA in dentistry; pre-anaesthetic evaluation of the patient; pre-anaesthetic medication - advantages, drugs used; commonly used anaesthetic agents", "Complications during and after GA; IV sedation with Diazepam and Midazolam - indications, mode of action, technique", "Cardiopulmonary resuscitation; use of oxygen and emergency drugs; tracheostomy"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Exodontia", "must_know": ["Ideal extraction - introduction, indications, contraindications", "Extraction in medically compromised individuals"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Methods of extraction", "must_know": ["Forceps or intra-alveolar or closed method - principles, types of movement and force", "Trans-alveolar, surgical or open method - indications, surgical procedure", "Dental elevators - uses, classification, principles in the use of elevators, commonly used elevators"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Complications of exodontia", "must_know": ["Complications during exodontia, common to both maxilla and mandible; postoperative complications; prevention and management of complications"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Medical Emergency / Medical Compromised Patients", "must_know": ["Primary care of medical emergencies in dental practice particularly - (a) cardiovascular (b) respiratory (c) endocrine (d) anaphylactic reaction (e) epilepsy"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Painless Surgery", "must_know": ["Pre-anaesthetic considerations; pre-medication - purpose, drugs used", "Anaesthetic considerations - (a) local (b) local with IV sedation", "Use of general anaesthetic"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Principles of oral surgery", "must_know": ["Access - intra-oral: mucoperiosteal flaps, principles, commonly used intra-oral incisions", "Bone removal - methods of bone removal; use of burs (advantages & precautions); bone cutting instruments (principles of using); chisel & osteotome", "Access - extra-oral: skin incisions - principles, various extra-oral incisions to expose the facial skeleton (submandibular, pre-auricular, incision to expose maxilla & orbit, bicoronal)", "Control of haemorrhage during surgery - normal haemostasis, local measures to control bleeding, hypotensive anaesthesia", "Drainage and debridement - purpose of drainage in surgical wounds; debridement - purpose, soft tissue and bone", "Closure of wounds - suturing: principles, suture material, classification, body response to various materials", "Post-operative care - post-operative instructions; physiology of cold and heat; control of pain (analgesics), infection (antibiotics) and swelling (anti-inflammatory drugs); long term post-operative follow up and its significance"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Ethics", "must_know": ["Introduction to ethics - what is ethics; values and norms; forming a value system in personal and professional life", "Hippocratic oath; Declaration of Helsinki; WHO declaration of Geneva; International code of ethics; D.C.I. code of ethics", "Ethics of the individual - the patient as a person, right to be respected, truth and confidentiality, autonomy of decision, doctor-patient relationship", "Professional ethics - code of conduct, contract and confidentiality, charging of fees, fee splitting, prescription of drugs, over-investigating the patient, malpractice and negligence", "Research ethics - animal and experimental research/humanness, human experimentation, human volunteer research and informed consent, drug trials; ethical workshop of cases (gathering scientific and value factors, identifying areas of value-conflict, setting priorities, working out criteria towards decisions)"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dental Jurisprudence", "must_know": ["Basic principles of law; contract laws - dentist-patient relationships & legal forms of practice", "Dental malpractice; person identification through dentistry; legal protection for practicing dentist; consumer protection act"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Dento-alveolar Surgery", "must_know": ["Trans-alveolar extraction; impacted teeth - general factors, incidence, aetiology, classification", "Indications; assessment - clinical & radiological; anaesthetic considerations; surgical procedures", "Endodontic surgery - introduction, classification, apicoectomy, replantation"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Impacted teeth", "must_know": ["Incidence, definition, aetiology", "(a) Impacted mandibular third molar - classification, reasons for removal, assessment (clinical and radiological), surgical procedures for removal, complications during and after removal, prevention and management", "(b) Maxillary third molar - indications for removal, classification, surgical procedure for removal", "(c) Impacted maxillary canine - reasons for canine impaction, localisation, indications for removal, methods of management, labial and palatal approach, surgical exposure, transplantation, removal"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Infection of oral cavity", "must_know": ["Introduction, factors responsible for infection, course of odontogenic infections, spread of odontogenic infections through various facial spaces", "Dento-alveolar abscess - aetiology, clinical features and management", "Osteomyelitis of the jaws - definition, aetiology, predisposing factors, classification, clinical features and management", "Ludwig's angina - definition, aetiology, clinical features, management and complications", "Hepatitis B and HIV"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Cystic lesions of jaws", "must_know": ["Definition, classification, pathogenesis", "Diagnosis - clinical features, radiological, aspiration biopsy, use of contrast media and histopathology", "Management - types of surgical procedures, rationale of the technique, indications, procedure and complications"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Tumours of the oral Cavity", "must_know": ["General considerations; carcinoma of oral cavity; TNM classification", "Non-odontogenic benign tumours - lipoma, fibroma, papilloma, ossifying fibroma, myoma etc.", "Ameloblastoma - clinical features, radiographic features, methods of management", "Biopsy - types", "Outline of management of squamous cell carcinoma - surgery, radiotherapy, chemotherapy", "Role of dental surgeons in the prevention and early detection of oral cancer"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Fractures of the jaws", "must_know": ["General considerations, types of fractures, aetiology, clinical features and general principles; dento-alveolar fractures - methods of management", "Mandibular fractures - applied anatomy, classification, diagnosis (clinical and radiological features), management (open and closed fixation), immobilisation methods, outline of rigid and semi-rigid internal fixation", "Management of fracture of condyle - aetiology, classification, clinical features and general principles of management, reduction and fixation", "Fractures of middle third of the face - definition of mid-face, applied surgical anatomy, classification, clinical features and outline of management", "Orbital fractures & fractures of zygomatic complex - classification, clinical features, indications for treatment, various methods of reduction and fixation", "Alveolar fractures - methods of management", "Complications - delayed union, non-union and malunion"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "TMJ disorders", "must_know": ["Surgical anatomy; dislocation - types, aetiology, clinical features and management", "Ankylosis - definition, aetiology, clinical features and management", "Myofunctional pain dysfunction syndrome - aetiology, clinical features, management (nonsurgical and surgical)", "Internal derangement & arthritis and other disorders"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Diseases of maxillary Sinus", "must_know": ["Surgical anatomy; acute & chronic sinusitis", "Surgical approach of sinusitis - Caldwell-Luc procedure, removal of root from the sinus", "Oro-antral fistula - aetiology, clinical features and various surgical methods of closure"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Pre-prosthetic surgery", "must_know": ["Introduction, aims; definition, classification of procedures", "(a) Corrective procedures - alveoloplasty, reduction of maxillary tuberosity, frenectomies and removal of tori", "(b) Ridge extension or sulcus extension procedures - indications and various surgical procedures", "(c) Ridge augmentation and reconstruction - indications, use of bone grafts, hydroxyapatite", "Implants - concept of osseo-integration; knowledge of various types of implants and surgical procedure to place implants"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Salivary gland diseases", "must_know": ["Diagnosis of salivary gland diseases - sialography, contrast media, procedure", "Salivary calculi and infections of the salivary glands; sialolithiasis - submandibular and parotid duct - clinical features and management", "Salivary fistulae; common tumours of salivary glands like pleomorphic adenoma including minor salivary glands", "Tumours of the salivary gland and management"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Neurological disorders", "must_know": ["Trigeminal neuralgia - definition, aetiology, clinical features and methods of management including surgery", "Glossopharyngeal and facial paralysis - aetiology, clinical features", "Nerve injuries - classification, neurorrhaphy etc."], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Cleft lip and cleft palate", "must_know": ["Aetiology of the clefts, incidence, classification", "Role of dental surgeon in the management of cleft patients; outline of the closure procedures"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Developmental deformities", "must_know": ["Basic forms - prognathism, retrognathism and open bite", "Reasons for correction; outline of surgical methods carried out on maxilla and mandible"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Oral Implantology", "must_know": ["Principles of implantology"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Medical emergency in dental practice", "must_know": ["Primary care of medical emergencies in dental practice particularly - (a) cardiovascular (b) respiratory (c) endocrine (d) anaphylactic reaction (e) epilepsy"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Emergency drugs", "must_know": ["Intramuscular and IV injections - applied anatomy, ideal location of giving these injections, techniques etc."], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Third Year - Case history taking" },
      { "title": "Third Year - Observe cases in the casualty" },
      { "title": "Third Year - Examination of the patient" },
      { "title": "Third Year - Recording blood pressure" },
      { "title": "Third Year - Use of different instruments in Oral & Maxillofacial surgery" },
      { "title": "Third Year - Various local anaesthetic injection techniques on patients" },
      { "title": "Third Year clinical quota - Extraction of maxillary teeth (25 cases)" },
      { "title": "Third Year clinical quota - Wiring techniques on models (1 exercise)" },
      { "title": "Third Year clinical quota - Suturing techniques on models (1 exercise)" },
      { "title": "Final Year - Case history taking; examination of the patient; recording blood pressure; use of different instruments; various local anaesthetic injection techniques on patients", "hours": 200 },
      { "title": "Final Year - Extraction of mobile and firm teeth" },
      { "title": "Final Year - Trans-alveolar extraction of root stumps" },
      { "title": "Final Year - Surgical removal of simple impacted teeth" },
      { "title": "Final Year - Management of dento-alveolar fractures with arch bar fixation, eyelets and inter-maxillary fixations" },
      { "title": "Final Year - Training in basic life support skills" },
      { "title": "Final Year clinical quota - Extraction of teeth (60 cases, Do)" },
      { "title": "Final Year clinical quota - Trans-alveolar method of extraction with suturing (5 cases)" },
      { "title": "Final Year clinical quota - IM & IV injection techniques (5 cases)" },
      { "title": "Final Year clinical quota - Major surgical procedures under general anaesthesia (5 cases)" },
      { "title": "Final Year clinical quota - Training in handling medical emergencies, CPR and basic life support" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases/teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
    "disciplines": null,
    "_extraction_note": "theory_syllabus carries every topic row of the section 6 grid (28 rows, III + IV Year). The source grid has MUST KNOW / DESIRABLE TO KNOW / NICE TO KNOW columns, but the two-column PDF page layout scrambled the column boundaries; to avoid fabricating tier assignments, all captured content is consolidated into must_know (per the flat-list rule) with desirable_to_know and nice_to_know left empty. Content wording follows the clean topic-by-topic reproduction in section 10 (Formative/Internal Assessment). CRI internship posting schedule (section 14) is intern-level and not part of this course syllabus."
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
      "duration": "3 hours",
      "total": 70,
      "sections": [
        { "type": "Elaborate on", "questions": 2, "marks_each": 10, "total": 20 },
        { "type": "Write notes on", "questions": 10, "marks_each": 5, "total": 50 }
      ]
    },
    "practical_exam": {
      "title": "Clinicals in Oral Surgery",
      "total": 90,
      "components": [
        { "name": "Case history", "marks": 20 },
        { "name": "Local anaesthesia technique", "marks": 30 },
        { "name": "Extraction of firm tooth (maxillary/mandibular) and management of the patient", "marks": 20 },
        { "name": "Wiring techniques on models", "marks": 10 },
        { "name": "Suturing techniques on models", "marks": 10 }
      ],
      "viva": { "name": "Viva Voce", "max": 20 },
      "note": "Section 9: A (70 marks) = Case history 20 + Local anaesthesia technique 30 + Extraction of firm tooth and management 20; B (20 marks) = Wiring on models 10 + Suturing on models 10; A + B = 90. C. Viva Voce = 20 marks (listed separately). The summary table records Practicals as examination 90 + internal assessment 10 = total 100."
    },
    "internal_assessment": {
      "theory": 10,
      "practical": 10,
      "total": 20,
      "frequency": "Continuing assessment examination (both theory and practical) held at least 3 times per year, best of two considered. Internal assessment marks submitted to the University once every three months, displayed on the notice board and a copy forwarded by HOD to the University once every 3 months. Schedule: First - November, Second - February, Third - May, Model Exam - July."
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": [
        "Alling John F et al - Impacted teeth",
        "Srinivasan B - Textbook of Oral and Maxillofacial Surgery",
        "Malamed S F - Handbook of medical emergencies in the dental office",
        "Banks P - Killey's fracture of mandible",
        "Banks P - Killey's fracture of middle third of the facial skeleton",
        "McGovanda - The Maxillary sinus and its dental implication",
        "Seward G R et al - Killey and Kays outline of oral surgery Part I",
        "Mc Carthy F M - Essentials of safe dentistry for the medically compromised patients",
        "Laskin D M - Oral and Maxillofacial Surgery",
        "Howe G L - Extraction of teeth",
        "Howe G L - Minor oral surgery",
        "Balaji S M - Textbook of Oral & Maxillofacial Surgery"
      ] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": [
        "Peterson L J et al - Principles of Oral and Maxillofacial Surgery Vol 1, 2 & 3",
        "Peterson L J et al - Contemporary Oral and Maxillofacial Surgery",
        "Topazian R G & Goldberg M H - Oral and Maxillofacial infections",
        "Alling John F et al - Impacted teeth",
        "Srinivasan B - Text book of oral and maxillofacial surgery",
        "Malamed S F - Handbook of medical emergencies in the dental office",
        "Banks P - Killey's Fractures of the mandible",
        "Banks P - Killey's fractures of the middle 3rd of the facial skeleton",
        "McGovanda - The maxillary sinus and its dental implications",
        "Seward G R et al - Killey and Kays outline of oral surgery Part I",
        "Mc Carthy F M - Essentials of safe dentistry for the medically compromised patients",
        "Laskin D M - Oral & maxillofacial surgery Vol 2",
        "Howe G L - Extraction of teeth",
        "Howe G L - Minor Oral Surgery",
        "Peterson L J et al - Contemporary oral and maxillofacial surgery",
        "Topazian R C & Goldberg M H - Oral and maxillofacial infections"
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

-- ── 4223 Public Health Dentistry ──
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
  '4223', 'PHD Theory', NULL,          -- DCI model: no credits
  'mgr_bds', 4,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "To provide critical knowledge and understanding of public health dentistry. To develop students' understanding of the major oral health problems of community. To equip students with the ability to critically analyze dental public health problems and develop practical solutions to protect and promote the oral health for the community. To enable students to understand and undertake health services research and to apply key findings into dental public health practice.",
    "objectives": {
      "knowledge": [
        "Apply basic sciences knowledge regarding etiology, diagnosis and management of all the oral conditions at the individual and community level",
        "Identify social, economic, environmental and emotional determinants in a given individual patient or a community for the purpose of planning and execution of community oral health programme",
        "Ability to conduct oral health surveys in order to identify all the oral health problems affecting the community and find solutions using multi-disciplinary approach",
        "Ability to act as a consultant in Community Oral Health and take part in research (both basic and clinical), present and publish the outcome at various scientific conferences and journals, both national and international"
      ],
      "skills": [
        "Take history, conduct clinical examination including all diagnostic procedures to arrive at diagnosis at the individual level and conduct survey of the community at a state and national level of all conditions related to oral health to arrive at community diagnosis",
        "Plan and perform all necessary treatment, prevention, and promotion of Oral Health at the individual and community level",
        "Plan appropriate Community Oral Health Programme, conduct the programme and evaluate, at the community level",
        "Ability to make use of knowledge of epidemiology to identify causes and plan appropriate preventive and control measures",
        "Develop appropriate person power at various levels and their effective utilization",
        "Conduct survey and use appropriate methods to impart Oral Health Education",
        "Develop ways of helping the community towards easy payment plan, followed by evaluation of their oral health care needs",
        "Develop the planning, implementation, evaluation and administrative skills to carry out successful Community Oral Health programmes"
      ],
      "attitude": [
        "Adopt ethical principles in all aspects of Community Oral Health activities",
        "To apply ethical and moral standards while carrying out epidemiological research",
        "Develop communication skills, in particular to explain the causes and prevention of oral health diseases to the patient",
        "Be humble and accept the limitations in his knowledge and skill and to ask for help from colleagues when needed and promote teamwork approach",
        "Respect patient's rights and privileges including patient's right to information and right to seek a second opinion"
      ],
      "integration": [
        "At the conclusion of the course the student should be able to communicate the needs of the community efficiently, inform the society of all the recent methodologies in preventing oral disease"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in the appropriate modes",
        "Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes",
        "Basic operative skills in analysis of data and knowledge of multimedia",
        "Students should utilize a combination of traditional classroom courses and online courses",
        "Technological requirements for all graduate students: a laptop or desktop computer supporting the required operating system, internet browser, reliable and consistent internet access, current and consistently updated antivirus software, Microsoft Office, and Adobe Reader (or equivalent to view PDF files)"
      ]
    },
    "competencies": [
      { "group": "General skills", "items": ["Apply knowledge & skills in day to day practice", "Apply principles of ethics", "Analyze the outcome of treatment", "Evaluate the scientific literature and information to decide the treatment", "Participate and involve in professional bodies", "Self-assessment & willingness to update the knowledge & skills from time to time", "Involvement in simple research projects", "Minimum computer proficiency to enhance knowledge and skills", "Refer patients for consultation and specialized treatment", "Basic study of forensic odontology and geriatric dental problems"] },
      { "group": "Practice Management", "items": ["Evaluate practice location, population dynamics & reimbursement mechanism", "Co-ordinate & supervise the activities of allied dental health personnel", "Maintain all records", "Implement & monitor infection control and environmental safety programs", "Practice within the scope of one's competence"] },
      { "group": "Communication and Community Resources", "items": ["Assess patients goals, values and concerns to establish rapport and guide patient care", "Able to communicate freely, orally and in writing with all concerned", "Participate in improving the oral health of the individuals through community activities"] },
      { "group": "Patient Care - Diagnosis", "items": ["Obtaining patient's history in a methodical way", "Performing thorough clinical examination", "Selection and interpretation of clinical, radiological and other diagnostic information", "Obtaining appropriate consultation", "Arriving at provisional, differential and final diagnosis"] },
      { "group": "Patient Care - Treatment Planning", "items": ["Integrate multiple disciplines into an individual comprehensive sequence treatment plan using diagnostic and prognostic information", "Ability to order appropriate investigations", "Recognition and initial management of medical emergencies that may occur during dental treatment", "Perform basic cardiac life support", "Management of pain including post operative", "Administration of all forms of local anaesthesia", "Administration of intra muscular and venous injections", "Prescription of drugs, pre operative, prophylactic and therapeutic requirements", "Uncomplicated extraction of teeth", "Transalveolar extractions and removal of simple impacted teeth", "Minor oral surgical procedures", "Management of oro-facial infections", "Simple orthodontic appliance therapy", "Taking, processing and interpretation of various types of intra oral radiographs", "Various kinds of motivative procedures using different materials available", "Simple endodontic procedures", "Removable and fixed prosthodontics", "Various kinds of periodontal therapy"] },
      { "group": "Competencies specific to the subject", "items": [] }
    ],
    "teaching_hours": { "lecture": 60, "practical": 200, "total": 260 },
    "teaching_methodology": [
      "Lectures",
      "Group discussion"
    ],
    "theory_syllabus": [
      { "topic": "Introduction to Dentistry", "must_know": ["Definition of Dentistry, History of dentistry", "Scope, aims and objectives of Dentistry"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Public Health", "must_know": ["Health & Disease: Concepts, Philosophy, Definition and Characteristics", "Public Health: Definition, Concepts, History of public health, General", "Epidemiology: Definition, objectives, methods", "Environmental Health: Concepts, principles, protection, sources, purification, environmental sanitation of water, disposal of waste, sanitation, role in mass disaster", "Health care delivery system: Centre and state, oral health policy, primary health care, national programmes, health organisations"], "desirable_to_know": ["Screening of disease", "Public Health Administration: Priority, Establishment, Manpower, private Practice Management, Hospital management", "Ethics and Jurisprudence: Professional liabilities, negligence, malpractice, consents, evidence, contracts and methods of identification in forensic dentistry", "Health Education: Definition, concepts, principles, methods, and health education aids"], "nice_to_know": ["Nutrition in oral diseases", "Behavioural science: Definition of sociology, anthropology and psychology and their relevance in dental practice and community"] },
      { "topic": "Dental Public Health", "must_know": ["Definition and difference between community and clinical health", "Epidemiology of dental diseases - dental caries, periodontal diseases, malocclusion, dental fluorosis, oral cancer & TMJ", "Survey procedures: Planning, implementation and evaluation, WHO oral health survey methods 1997, indices for dental diseases", "Delivery of dental care: Dental auxiliaries, operational and non-operational, incremental and comprehensive healthcare, school dental health", "Payments of dental care: Methods of payments and dental insurance, Government plans", "Preventive Dentistry - definition, Levels, role of individual, Community and profession, fluorides in dentistry, plaque control programmes"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bio Statistics", "must_know": ["Bio Statistics: Introduction, collection of data, presentation of data, Measures of Central tendency, measures of dispersion, Tests of significance, Sampling and sampling techniques - types, errors, bias, blind trials and calibration"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Research Methodology", "must_know": ["Research Methodology: Definition, types of research, designing a written protocol"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Health Information", "must_know": ["Health Information: Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Practice Management", "must_know": ["Dentist Act 1948", "Dental Council of India", "Indian Dental Association"], "desirable_to_know": ["Maintenance of records/accounts/audit", "Consumer Protection Act"], "nice_to_know": ["Place and locality", "Premises & layout"] },
      { "topic": "Bioethics", "must_know": ["Bioethics is the application of ethics to the field of medicine and healthcare", "Bioethics includes medical ethics (issues in health care), research ethics (conduct of research), environmental ethics (relationship between human activities and the environment), and public health ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Collection of statistical data (demographic) on population in India, birth rates, morbidity and mortality, literacy, per capita income" },
      { "title": "Incidence and prevalence of common oral diseases like dental caries, periodontal disease, oral cancer, fluorosis at national and international levels" },
      { "title": "Preparation of oral health education material - posters, models, slides, lectures, play acting skits etc." },
      { "title": "Oral health status assessment of the community using indices and WHO basic oral health Survey methods" },
      { "title": "Exploring and planning setting of private dental clinics in rural, semi urban and urban locations, availment of finances for dental practices - preparing project report" },
      { "title": "Visit to primary health centre - to acquaint with activities and primary health care delivery" },
      { "title": "Visit to water purification plant / public health laboratory / centre for treatment of waste and sewage water" },
      { "title": "Visit to schools - to assess the oral health status of school children, emergency treatment and health education including possible preventive care at school (tooth brushing technique demonstration and oral rinse programme etc.)" },
      { "title": "Visit to institution for the care of handicapped, physically, mentally, or medically compromised patients" },
      { "title": "Preventive dentistry: in the department application of pit and fissure sealants, fluoride gel application procedure, A.R.T., Comprehensive health for 5 patients (at least 2 patients complete case history)" },
      { "title": "Indices: OHI-S simplified and original (Green and Vermillion), Plaque index (Silness and Loe), Gingival Index (Loe and Silness), Periodontal Index (CPI and Russell), Dental Caries index (DMFT and DMFS, dft and dfs), Fluorosis index (Dean)" },
      { "title": "Health Education: make one audio-visual aid; make a health talk" },
      { "title": "Practical work: pit and fissure sealant; topical fluoride application" }
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
      "duration": "3 Hours",
      "total_marks": 70,
      "sections": [
        { "type": "Elaborate on", "questions": 2,  "marks_each": 10, "total": 20 },
        { "type": "Write Notes on", "questions": 10, "marks_each": 5,  "total": 50 }
      ]
    },
    "practical_exam": {
      "components": [
        { "name": "Complete case history with two Oral indices", "marks": 90 },
        { "name": "Viva Voce", "marks": 20 }
      ]
    },
    "internal_assessment": {
      "theory": 10,
      "practical": 10,
      "total": 20,
      "frequency": "Continuing assessment (both Theory/Practical) held at least 3 times per year, best of two considered; Internal Assessment marks submitted to the University once every three months; marks displayed on Notice board and a copy forwarded by HOD to the University once in three months"
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": [
        "Dentistry Dental Practice and Community by David F. Striffler and Brian A. Burt, Edn. 1983, W. B. Saunders company",
        "Principles of Dental Public Health by James Morse Dunning, IV Edition 1986, Harvard University Press",
        "Dental Public Health and Community Ed by Anthony Jong, Publication by the C.V. Mosby company, 1981",
        "Community Oral Health - A system approach by Patricia P. Cormier and Joyce I. Levy, published by Appleton-Century-Crofts / New York, 1981",
        "Community Dentistry - A problem oriented approach by P.C. Dental Hand book series vol. 8 by Stephen L. Silverman and Ames F. Tryon, series editor - Alvin F. Gardener, PSG Publishing company Inc. Littleton Massachusetts, 1980",
        "Dental Public Health - An introduction to public health dentistry, Edition by Geoffrey L. Slack and Brian Burt, Published by John Wright and sons, Bristol, 1980",
        "Oral Health Surveys - Basic methods, 2013, Published by WHO Geneva, available at the regional office New Delhi",
        "Preventive Medicine and Hygiene - By Maxcy and Rosenau, Published by Appleton Century Crofts, 1986",
        "Preventive Dentistry - By J.O. Forrest, published by John Wright and Sons, Bristol, 1980",
        "Preventive Dentistry by Murray, 1997",
        "Introduction to Bio-statistics by B.A. Mahajan",
        "Research Methodology and Bio-statistics",
        "Introduction to Statistical Methods by Grewal",
        "Text Book of Preventive and Social Medicine by Park and Park, 24th edition",
        "Community Dentistry by Dr. Soben Peter, 5th Edition"
      ] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": [
        "Dentistry Dental Practice and Community by David F. Striffler and Brian A. Burt, Edn. 1983, W.B. Saunders company",
        "Principles of Dental Public Health by James Morse Dunning, IV Edition, 1986, Harvard University Press",
        "Dental Public Health and Community Dentistry Ed by Anthony Jong, publication by The C.V. Mosby Company, 1981",
        "Community Oral Health - A system approach by Patricia P. Cormier and Joyce I. Levy, published by Appleton - Century - Crofts / New York, 1981",
        "Community Dentistry - A problem oriented approach by P.C. Dental hand book series Vol 8 by Stephen L. Silverman and Ames F. Tryon, Series editor - Alvin F. Gardner, PSG Publishing company Inc. Littleton Massachusetts, 1980",
        "Dental Public Health - An Introduction to Community Dentistry, Edited by Geoffrey L. Slack and Brian Burt, Published by John Wright and sons, Bristol, 1980",
        "Oral Health Surveys - Basic Methods, 4th edition, 1997, Published by W.H.O. Geneva, available at the regional office New Delhi",
        "Preventive Medicine and Hygiene - By Maxcy and Rosenau, published by Appleton Century Crofts, 1986",
        "Preventive Dentistry - by J.O. Forrest, published by John Wright and sons, Bristol, 1980",
        "Preventive Dentistry by Murray, 1997",
        "Text Book of Preventive and Social Medicine by Park and Park, 14th edition",
        "Community Dentistry by Dr. Soben Peter",
        "Introduction to Bio-statistics by B.K. Mahajan",
        "Research methodology and Bio-statistics",
        "Introduction to Statistical Methods by Grewal"
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


COMMIT;
