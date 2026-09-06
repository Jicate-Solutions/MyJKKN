-- ============================================================================
-- BoS DCH / BDS — SYLLABUS PILOT (shape validation)
-- Subject: 4201 Human Anatomy (= PDF "General Anatomy including Embryology and
--          Histology", I Year). Practical code 4201-P noted at the bottom.
-- Source: syllabus bds2017-18-21032018.pdf, pp.4-18.
--
-- ⚠ APPLY-AFTER-MIGRATION. This INSERT targets columns proposed in
--   docs/plans/2026-07-24-bos-dch-bds-course-syllabus-design.md and NOT YET in
--   bos_course_syllabi: academic_model, academic_year, bds_content, exam_scheme.
--   It will fail until that migration (spec §5.0/§5.3) is applied.
--
-- Scope (supplied):
--   institutions_id = e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5  (DCH)
--   board_id        = dcddfa03-d654-4f8e-a1e5-10a0e8072ca6  (BDS)
--   regulation_id   = 747c51f3-01ad-468c-8bc7-5e89bf69c7ee  (2018 / DCI BDS 2017-18)
--   created_by      = 351c76ad-33f2-4a39-8ede-9299465b70f4  (auth.users id)
-- ============================================================================

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
  '4201', 'Human Anatomy', NULL,          -- DCI model: no credits
  'mgr_bds', 1,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The students should gain the knowledge and insight into the functional anatomy of the normal human head and neck, functional histology and an appreciation of the genetic basis of inheritance and disease, and the embryological development of the clinically important structures, so that the relevant anatomical and scientific foundations are laid down for the clinical years of the BDS course.",
    "objectives": {
      "knowledge": [
        "Know the normal disposition of the structures in the body while clinically examining a patient and while conducting clinical procedures",
        "Know the anatomical basis of disease and injury",
        "Know the microscopic structure of the various tissues, a prerequisite for understanding the disease process",
        "Know the nervous system to locate the site of lesion according to the sensory and/or motor deficits encountered",
        "Have an idea about the basis of abnormal development, critical stages of development, effects of teratogens, genetic mutations and environmental hazards",
        "Know the sectional anatomy of the head and neck and brain to read features in radiographs and modern imaging",
        "Know the anatomy of cardiopulmonary resuscitation"
      ],
      "skills": [
        "To locate various structures of the body and to mark the topography of the living anatomy",
        "To identify various tissues under the microscope"
      ],
      "attitude": [
        "Willingness to apply the current knowledge of dentistry in the best interest of the patient and community",
        "Seek to improve awareness and provide possible solutions for oral health problems and needs throughout the community"
      ],
      "integration": [
        "Anatomy taught integrally with other basic sciences and clinical subjects to lay the scientific foundation for a better clinician"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical/personal care per universal protection, and disposal of medical wastes in appropriate modes"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, statistical programmes, operative skills in analysis of data and knowledge of multimedia"
      ]
    },
    "competencies": [
      { "group": "General skills", "items": ["Apply knowledge and skills in day to day practice", "Apply principles of ethics", "Analyze the outcome of treatment", "Evaluate scientific literature to decide treatment", "Self-assessment and willingness to update knowledge and skills", "Basic study of forensic odontology and geriatric dental problems"] },
      { "group": "Practice Management", "items": ["Evaluate practice location, population dynamics and reimbursement mechanism", "Co-ordinate and supervise the activities of allied dental health personnel", "Maintain all records", "Implement and monitor infection control and environmental safety programs"] },
      { "group": "Communication and Community Resources", "items": ["Assess patient goals, values and concerns to establish rapport and guide patient care", "Communicate freely, orally and in writing, with all concerned", "Participate in improving the oral health of the individual"] },
      { "group": "Patient Care - Diagnosis", "items": ["Obtaining patient's history in a methodical way", "Performing thorough clinical examination", "Selection and interpretation of clinical, radiological and other diagnostic information", "Arriving at provisional, differential and final diagnosis"] },
      { "group": "Patient Care - Treatment Planning", "items": ["Integrate multiple disciplines into an individual comprehensive sequenced treatment plan", "Recognition and initial management of medical emergencies during dental treatment", "Administration of all forms of local anaesthesia", "Uncomplicated extraction of teeth"] }
    ],
    "teaching_hours": { "lecture": 100, "practical": 175, "total": 275 },
    "teaching_methodology": [
      "Combination of lectures", "Small group seminars, tutorials", "Dissection and learning from dissected specimens",
      "Microscopic demonstration", "Audio visual aids", "Demonstration of articulated and individual bone specimens",
      "Use of workbook for practical classes", "Drawing histology diagrams in record notebook",
      "Surface anatomy on living individual", "Study of radiographs and other modern imaging techniques",
      "Study of histology slides", "Study of embryology models"
    ],
    "theory_syllabus": [
      { "topic": "Anatomical terminology", "must_know": ["Understanding of the various subdivisions of anatomy", "Anatomical position", "Anatomical planes", "Terms of direction, relation, comparison, laterality and movement"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Introduction to bones", "must_know": ["Composition of bone and bone marrow", "Regional classification of skeleton", "Structural classification of bone", "Distribution of spongy and compact bone", "Classification of bone according to shape and ossification", "Parts of a long bone", "Blood and nerve supply of a long bone"], "desirable_to_know": ["Laws of ossification including direction of nutrient foramen and the growing end of the bone", "Exceptions to the laws of ossification"], "nice_to_know": [] },
      { "topic": "Introduction to joints", "must_know": ["Definition", "Classification by structure (fibrous, cartilaginous, synovial) with subtypes and examples", "Classification by mobility", "Axes of movement", "Complex and compound joints", "Nerve supply of joints - Hilton's law", "Blood supply of joints"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Introduction to the muscular system", "must_know": ["Structural classification of muscle", "Parts of a skeletal muscle", "Differentiate tendon and aponeurosis", "Classification of muscle according to action (agonists, antagonists, synergists, fixators)"], "desirable_to_know": ["Classification of muscle according to direction of muscle fibres and shape"], "nice_to_know": [] },
      { "topic": "Introduction to the cardiovascular system", "must_know": ["Blood vascular system", "Differentiate pulmonary and systemic circulation", "Layers of a blood vessel", "Types of blood vessels; differences between arteries and veins"], "desirable_to_know": ["Concepts of thrombosis, infarction, aneurysm", "Lymphoedema and spread of tumours via lymphatics"], "nice_to_know": [] },
      { "topic": "Embryology - General", "must_know": ["Terms used in embryology", "Mitosis, Meiosis and Gametogenesis", "Oogenesis, Spermatogenesis", "Uterine and ovarian cycles, Ovulation", "Fertilization - definition, phases, results", "Bilaminar and trilaminar germ disc", "Implantation", "Gastrulation, Neurulation, Somites", "Derivatives of the three germ layers"], "desirable_to_know": ["Abnormal implantation", "Chromosomal abnormalities"], "nice_to_know": [] },
      { "topic": "Fetal membranes and Placenta", "must_know": ["Structure, placental circulation, function, placental barrier", "Amnion and umbilical cord - structure and function"], "desirable_to_know": ["Amniotic fluid - hydramnios and oligohydramnios"], "nice_to_know": [] },
      { "topic": "Birth defects", "must_know": ["Face, Palate, Tongue, Branchial apparatus, Pituitary gland, Thyroid gland, Eye"], "desirable_to_know": ["Types of malformation, disruption, deformation, syndrome; Teratogens"], "nice_to_know": ["Facial clefts, First Arch anomalies, developmental anomalies of tongue, Branchial cysts and fistulae, Thyroglossal cyst"] },
      { "topic": "Chromosomes and Karyotyping", "must_know": ["Structure of chromosomes", "Technique of preparing a karyotype", "Reading of karyotypes for normal male, female, Trisomies, Turner and Klinefelter syndromes"], "desirable_to_know": ["Classification of chromosomes based on position of centromere", "Types of banding", "Clinical applications of karyotyping"], "nice_to_know": [] },
      { "topic": "Osteology (skull)", "must_know": ["Anatomical position of skull", "Features seen in Norma frontalis, verticalis, occipitalis, lateralis and basalis", "Cranial cavity - subdivisions, foramina and structures passing through", "Details of Mandible and Maxilla", "Features of typical and atypical cervical vertebrae"], "desirable_to_know": ["Identification and location of individual skull bones in an articulated skull"], "nice_to_know": ["Concept of bones which ossify in membrane and cartilage", "Frankfort plane"] },
      { "topic": "Scalp", "must_know": ["Layers of scalp", "Extent/attachment of each layer", "Surgical importance", "Blood supply, nerve supply and lymphatic drainage"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Face (superficial and deep dissection)", "must_know": ["Muscles of facial expression", "Attachments of orbicularis oculi, orbicularis oris and buccinator", "Sensory innervation of the face", "Facial artery: origin, course and branches", "Facial vein: formation and course"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Neck - triangles", "must_know": ["Boundaries and contents of the anterior and posterior triangles", "Sternocleidomastoid - attachments, relations, nerve supply and actions", "Lymphatic drainage of head and neck"], "desirable_to_know": ["Subclavian and occipital triangles"], "nice_to_know": ["Wry neck"] },
      { "topic": "Cranial cavity", "must_know": ["Cranial fossae: related structures, major foramina and structures passing through", "Dural venous sinuses", "Pituitary gland"], "desirable_to_know": ["Pituitary tumours"], "nice_to_know": ["Clinical importance of dural venous sinuses"] },
      { "topic": "Deep structures of the neck", "must_know": ["Thyroid and Parathyroid glands - location, blood supply", "Trachea; Tracheostomy - structures encountered", "Subclavian artery - origin, parts, course, branches", "Liability of injury to external and recurrent laryngeal nerves during thyroidectomy"], "desirable_to_know": ["Cervical sympathetic chain - components, branches, area of supply", "Deep cervical fascia - parts, extent, attachments", "Deep cervical lymph nodes"], "nice_to_know": [] },
      { "topic": "Mouth, Pharynx, Palate", "must_know": ["Muscles of palate and pharynx - names, position, actions, nerve supply", "Palatine tonsil - position, relations, blood supply", "Waldeyer's lymphatic ring - components and function", "Boundaries and clinical significance of pyriform fossa"], "desirable_to_know": ["Killian's dehiscence"], "nice_to_know": ["Tonsillitis and tonsillectomy, Adenoids"] },
      { "topic": "Nose and Paranasal sinuses", "must_know": ["Nasal septum", "Lateral wall of nasal cavity", "Paranasal sinuses"], "desirable_to_know": ["Little's area - significance in epistaxis", "Maxillary sinus - concept of referred pain"], "nice_to_know": ["Sinusitis, tumours"] },
      { "topic": "Larynx", "must_know": ["Intrinsic and extrinsic muscles of larynx - names, nerve supply and actions", "Cartilages of larynx"], "desirable_to_know": ["Recurrent laryngeal nerve"], "nice_to_know": [] },
      { "topic": "Eyeball and Orbit", "must_know": ["Parts and layers of the eyeball", "Muscles of the eyeball - attachments, nerve supply and actions", "Nerves and vessels in the orbit", "Ciliary ganglion"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Central Nervous System", "must_know": ["External features of brain and spinal cord, meningeal coverings and blood supply", "Spinal cord - external and internal features, organization of grey matter, coverings", "Ascending and descending tracts and their functions", "Upper and lower motor neurons", "Spinal segment and dermatome", "Cerebrum - horizontal section; white fibres (association, commissural, projection)", "Ventricles of the brain, choroid plexus, circulation of CSF", "Blood supply of brain and spinal cord"], "desirable_to_know": ["Midsagittal section of cerebrum"], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Application of ethics to medicine and healthcare: medical, research, environmental and public health ethics", "Ethics of the individual, professional ethics and research ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Gross anatomy dissection - head and neck, neuroanatomy" },
      { "title": "Histology - study of slides" },
      { "title": "Osteology - study of articulated and individual bone specimens" },
      { "title": "Embryology and genetics - study of models and charts" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate teaching materials as specified in DCI regulations.",
    "disciplines": null,
    "_pilot_note": "theory_syllabus is a faithful subset (19 topic rows) for shape validation; a full extraction would carry every grid row from pp.8-16."
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
    "question_pattern": null,
    "practical_exam": {
      "type": "spotters",
      "items": [
        { "name": "Gross anatomy (head and neck, neuroanatomy)", "count": 20, "marks_each": 2, "total": 40 },
        { "name": "Histology spotters",                          "count": 15, "marks_each": 2, "total": 30 },
        { "name": "Osteology (5), embryology (4), genetics (1 chart)", "count": 10, "marks_each": 2, "total": 20 }
      ],
      "spotters_total": 90,
      "viva": { "max": 20, "notes": "Osteology 10 + Embryology 10" },
      "criteria": "One minute per spotter for identification and writing the answer; for histology, mention any two most relevant identification points; two points per spotter for others."
    },
    "internal_assessment": {
      "frequency": "at least 3 times per year, best of two considered",
      "theory": 10, "practical": 10, "total": 20,
      "submission": "submitted to the university once every 3 months"
    }
  }
  $exam$::jsonb,
  -- ---- textbooks (existing column; grouped per spec §5.6) ------------------
  $books$
  {
    "groups": [
      { "group": "Gross Anatomy", "books": ["Cunningham's Manual of Practical Anatomy Vols 1, 2, 3, 15e (GJ Romanes)", "Clinically Oriented Anatomy 7e (Moore KL, Agur AMR, Dalley AF)", "Textbook of Human Anatomy (Head and Neck), Inderbir Singh", "A Textbook of Human Anatomy, 2000 (T.S. Ranganathan)"] },
      { "group": "Neuroanatomy", "books": ["Clinical Neuroanatomy 7e 2009 (Richard S. Snell)", "Essentials of Human Neuroanatomy 4e 2012 (AK Datta)", "Textbook of Clinical Neuroanatomy 2e (Vishram Singh)", "Illustrated Textbook of Neuroanatomy 12e (GP Pal)"] },
      { "group": "Histology", "books": ["Inderbir Singh's Textbook of Human Histology 7e 2014 (Vasudeva Neelam)", "Wheater's Functional Histology 6e (Young, O'Dowd, Woodford)", "Textbook of Histology 2008 (GP Pal)"] },
      { "group": "Embryology", "books": ["Langman's Medical Embryology 13e (T.W. Sadler)"] }
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

-- ----------------------------------------------------------------------------
-- Practical code 4201-P ("Human Anatomy Practical"): per Open item O-7 in the
-- spec, decide whether it gets its OWN syllabus row (course_code='4201-P',
-- carrying only practicals + exam_scheme.practical_exam) or whether the single
-- '4201' row above covers both theory and practical. Not emitted pending that
-- decision.
-- ----------------------------------------------------------------------------
