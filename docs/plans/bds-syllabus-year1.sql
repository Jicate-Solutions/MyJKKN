-- ============================================================================
-- BoS DCH / BDS — SYLLABUS BATCH: YEAR I  (UPSERT — safe to re-run)
-- ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE.
-- Generated 2026-08-08 from parallel extraction. Scope: DCH / BDS / reg 2018.
-- Requires migration 20260807_bos_syllabus_bds_dental_model.sql.
-- ============================================================================

BEGIN;

-- ── 4202A Physiology ──
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
  '4202A', 'Physiology', NULL,          -- DCI model: no credits
  'mgr_bds', 1,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The broad goal of teaching Human Physiology to undergraduate Dental students is to provide comprehensive knowledge of the normal functions of the organ systems of the body, to facilitate an understanding of the physiological basis of health and disease.",
    "objectives": {
      "knowledge": [
        "Explain the normal functioning of all the organ systems and their interactions for well co-ordinated total body function",
        "Assess the relative contribution of each organ system towards the maintenance of the milieu interior",
        "List the physiological principles underlying the pathogenesis and treatment of disease"
      ],
      "skills": [
        "Conduct experiments designed for the study of physiological phenomena",
        "Interpret experimental and investigative data",
        "Distinguish between normal and abnormal data derived as a result of tests which he/she has performed and observed in the laboratory"
      ],
      "attitude": [
        "To develop the attitude to serve the rural community"
      ],
      "integration": [
        "At the end of the integrated teaching the student shall acquire an integrated knowledge of organ structure and function and its regulatory mechanisms"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes",
        "Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal"
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes, basic operative skills in analysis of data and knowledge of multimedia",
        "Students should utilize a combination of traditional classroom courses and online courses; technological requirements include a laptop/desktop supporting the required operating system, internet browser, reliable internet access, current antivirus software, Microsoft Office and Adobe Reader"
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
    "teaching_hours": { "lecture": 120, "practical": 60, "total": 180 },
    "teaching_methodology": [
      "Lectures",
      "Lecture Demonstrations",
      "Practical exercises",
      "Audio visual aids",
      "Seminar & Small group discussions with regular feedback from the students",
      "Integrated Teaching",
      "Symposium and continuing medical education programmes"
    ],
    "theory_syllabus": [
      { "topic": "Homeostasis and Feedback System", "must_know": ["Describe the concept of maintenance of internal environment", "Recognize that negative feedback is the most common type of physiological control"], "desirable_to_know": [], "nice_to_know": ["State and describe examples of negative feedback", "State and describe instances of positive feedback in human physiology"] },
      { "topic": "Cell Membrane", "must_know": ["Describe with diagram the fluid mosaic model"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Membrane Transport", "must_know": ["Classify transport mechanisms as Passive and active with examples and differentiate between them", "List and describe the following passive transport processes with examples: Simple diffusion of respiratory gases through lipid film; Diffusion of ions through ion channels; Sodium, potassium, calcium and chloride channels; Non-gated, voltage gated, ligand-gated and mechano-gated channels; Facilitated diffusion - Glucose transporters (GluTs); Osmosis", "Describe the following active transport processes: Primary active transport - sodium-potassium pump; Secondary active transport - sodium-glucose co-transport (SGLT) and sodium-amino acid co-transport", "Describe the following transport processes by formation of membrane vesicles: Endocytosis, Exocytosis"], "desirable_to_know": ["Describe the differences between channel and carrier-mediated transport processes", "State Fick's law of diffusion", "Describe the following active transport processes: Primary active transport - Proton pumps - V type H ATPase, H/K ATPase; Secondary active transport - sodium hydrogen exchangers, sodium calcium exchangers, Na/2Cl/K symport"], "nice_to_know": [] },
      { "topic": "Membrane Potential", "must_know": ["Describe the mechanisms involved in genesis of resting membrane potential (RMP) in a prototype cell", "Recognise the RMP in a nerve or cardiac cell", "Nernst or equilibrium potential", "Action potentials in neuron, skeletal muscle cell, Sino atrial node and cardiac ventricular cell"], "desirable_to_know": [], "nice_to_know": ["Patch Clamp Technique", "Cathode Ray Oscilloscope", "Equilibrium potential"] },
      { "topic": "Blood - Introduction", "must_know": ["Describe the normal composition of blood", "Describe the composition of plasma", "State the difference between plasma and serum"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Plasma Proteins (Integration with Biochemistry)", "must_know": ["State the site of production, normal range and describe the functions of Albumin", "Discuss causes for decrease in serum Albumin levels with specific examples of disease conditions", "Explain what is plasma oncotic pressure", "Discuss the production, various types and role of Globulins (alpha, beta and gamma globulins)"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Erythrocyte Sedimentation Rate (ESR)", "must_know": ["Define and state normal values for ESR in men and women", "Describe the factors influencing ESR (fibrinogen particularly)", "Discuss the significance of ESR in disease states"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "RBC", "must_know": ["Describe the physical characteristics of red blood cells", "List causes and give explanation for physiological variations of the normal RBC count", "Explain the functions of RBCs", "List the changes in sites of erythropoiesis with age", "Illustrate the major changes that take place during the stages of erythropoiesis", "Describe the factors regulating/affecting erythropoiesis", "Discuss the normal life span and destruction of RBCs"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Hemoglobin", "must_know": ["State the components of Hb, the various types of Hb and normal range of Hb in men and women", "Briefly discuss the synthesis of haemoglobin", "What is reduced hemoglobin", "Define and describe cyanosis", "Discuss the types of jaundice", "Abnormal Hemoglobin"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Anaemia", "must_know": ["Define anaemia", "Classify anaemia based on etiology and morphology", "Discuss the principles of treating anemias", "Describe major symptoms, signs and effects of anemia"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Platelet", "must_know": ["Describe the formation, structure, life span & removal of platelets", "State the normal platelet count", "Describe the functions of platelets", "Discuss the causes and effects of thrombocytopenia"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Hemostasis", "must_know": ["Describe the processes involved in hemostasis such as: vasoconstriction, Platelet plug formation, Clotting or coagulation pathways, Clot retraction", "Describe anticlotting and fibrinolytic mechanisms in the body", "List anticoagulants and their mechanism of action", "List the clotting factors and Explain the pathways of coagulation", "Explain various causes for abnormal hemostasis", "Perform and interpret simple tests of hemostasis like bleeding time by Duke's method and clotting time by capillary method of Wright on oneself by collecting blood using finger prick method using aseptic method", "Explain Lee and White's method for determining clotting time"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Blood groups & Blood banking", "must_know": ["Describe the importance of blood groups", "Explain the genetic determination of blood groups", "Describe the ABO system of blood grouping", "State the frequency of different blood groups", "Describe the Rh system of blood grouping", "Explain the mechanism and consequence of ABO and Rh incompatibility", "Explain the condition Erythroblastosis Fetalis, state preventive measure and treatment option for the same"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Body fluids", "must_know": ["List the different body fluid compartments - state the volume, osmolarity and electrolyte composition of each of the following compartments: Total body water, extracellular, intracellular, plasma, intravascular", "Describe the term transcellular fluid", "Measurement of volumes of compartments", "Describe the Starling's forces that govern fluid exchange across the membranes separating the various compartments", "Define Donnan effect and equilibrium", "Use the Concept of electroneutrality in the fluid compartments to calculate 'Anion gap'", "Define anion gap as the term referring to unmeasured anions in plasma"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "WBC", "must_know": ["State the normal Total and Differential count", "Classify types of WBC as granulocytes, agranulocytes", "Describe the morphology and functions of neutrophils, eosinophils, basophils, mast cells; Lymphocytes, monocytes", "Perform and interpret total leucocyte count on their own blood / provided blood using aseptic precautions", "List Conditions in which total leucocyte counts is increased or decreased", "List conditions in which counts of each type of WBC are increased or decreased", "Describe the various cells that constitute the monocyte-macrophage system and state their function"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Leucopoiesis", "must_know": ["Outline the process of maturation of white blood cells"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Lymph", "must_know": ["Describe the formation and composition of lymph", "Illustrate the lymphatic circulation", "Discuss functions of lymph"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Reticulo endothelial system", "must_know": ["Functions of reticulo endothelial system"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Skeletal Muscle Morphology", "must_know": ["Describe and draw the structure of sarcomere marking actin filament, myosin filament, I band, A band, H band, Z line and sarcomere", "Describe the functions of contractile and regulatory proteins involved in muscle contraction", "Draw and describe the structure of the sarco-tubular system"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Neuromuscular junction", "must_know": ["Draw and Describe the structure of the neuromuscular junction", "Describe the events involved in neuromuscular transmission", "Describe the pathophysiology of diseases affecting the neuromuscular junction like myasthenia gravis", "Describe the mechanism of action of cholinesterase inhibitors", "Motor Unit"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Muscle Contraction", "must_know": ["Describe the molecular Basis of muscle contraction, events involved in excitation contraction coupling", "Explain the types of Muscle contraction", "Describe the sliding filament theory of muscle contraction; Role of ATP and calcium pumps in the mechanism of relaxation of the muscle", "Describe the Factors affecting the force of contraction"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Smooth Muscle", "must_know": ["Structure, distribution, types, molecular mechanism of contraction"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Factors modulating smooth muscle contraction and Properties", "must_know": ["List the various factors that modulate smooth muscle contraction like stretch, sympathetic nervous system, circulating substances etc.", "Describe the special properties of smooth muscle like latch-bridge mechanism and plasticity"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Salivary Glands", "must_know": ["Name the Salivary Glands; composition", "Functions of saliva", "Describe the regulation of salivary secretion"], "desirable_to_know": [], "nice_to_know": ["Deficient salivation - Xerostomia"] },
      { "topic": "Stomach", "must_know": ["Describe the composition and functions of gastric secretion", "Describe the mechanism of gastric acid Secretion", "Discuss regulation of gastric secretion"], "desirable_to_know": [], "nice_to_know": ["Proton pump inhibitor", "Pernicious anemia"] },
      { "topic": "Exocrine Pancreas", "must_know": ["Describe the composition and functions of pancreatic secretion", "Explain the regulation of pancreatic secretion"], "desirable_to_know": [], "nice_to_know": ["Reason for the alkaline pH of pancreatic secretion and its importance"] },
      { "topic": "Liver & Gall Bladder", "must_know": ["Describe the composition and functions of Bile", "Regulation of secretion"], "desirable_to_know": [], "nice_to_know": ["Gall Stones", "Jaundice"] },
      { "topic": "Small Intestine", "must_know": ["Discuss the secretions of small intestine and their functions & regulation of secretion"], "desirable_to_know": [], "nice_to_know": ["Malabsorption syndrome"] },
      { "topic": "Large intestine", "must_know": ["Explain the functions of large intestine and formation of faeces"], "desirable_to_know": [], "nice_to_know": ["dietary fibre", "Constipation"] },
      { "topic": "GI Motility", "must_know": ["Mastication, deglutition, vomiting, gastric filling and emptying, movements of small intestine, large intestine, defaecation"], "desirable_to_know": [], "nice_to_know": ["State what is basic electrical rhythm of the gastrointestinal tract and its role"] },
      { "topic": "Excretory System - Functional Anatomy of Kidney and Structure of Nephron", "must_know": ["Structure & functions of kidney and its functional Renal circulation", "Describe the structure of the juxtaglomerular apparatus"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Glomerular filtration", "must_know": ["Glomerular filtration rate - definition, determination, factors influencing GFR"], "desirable_to_know": [], "nice_to_know": ["Concept of Renal Clearance"] },
      { "topic": "Tubular reabsorption & secretion", "must_know": ["Reabsorption of sodium, glucose, water & other substances", "Secretion of urea, hydrogen and other substances"], "desirable_to_know": [], "nice_to_know": ["The concept of the transport maximum for glucose, renal threshold"] },
      { "topic": "Concentration of Urine", "must_know": ["Countercurrent Mechanism", "Countercurrent Multiplier", "Countercurrent Exchanger", "Role of Urea"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Regulation of Acid base balance", "must_know": ["Blood buffers", "Role of Respiratory system and kidneys in maintaining acid base balance"], "desirable_to_know": [], "nice_to_know": ["Anion gap"] },
      { "topic": "Micturition", "must_know": ["Describe the innervation of Bladder and reflex pathway of micturition"], "desirable_to_know": [], "nice_to_know": ["cystometrogram"] },
      { "topic": "Endocrinology - Introduction", "must_know": ["Define Hormone", "Classify and list the hormones based on chemical nature", "Mechanism of negative and positive feedback regulation of hormone release"], "desirable_to_know": [], "nice_to_know": ["Describe the mechanism of action of hormones including the receptors and second messengers"] },
      { "topic": "Hypothalamus", "must_know": ["Describe the relationship between hypothalamus and pituitary including the Hypothalamohypophyseal tract and the hypothalamohypophyseal portal circulation", "List the various releasing and inhibiting hormones released by the hypothalamus"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Pituitary Gland", "must_know": ["List the various types of secretory cells of Anterior and Posterior Pituitary", "List the Hormones secreted by the anterior and posterior pituitary", "Growth hormone: List the important actions of growth hormone, its effects on growth and metabolism", "Describe the regulation of growth hormone secretion", "List important stimuli that increases or decreases the secretion of GH", "Prolactin: Describe the actions and regulation of prolactin secretion", "List the features of excess Prolactin secretion", "Antidiuretic hormone (ADH): Explain the synthesis, release and mechanism, functions and regulation of actions of ADH", "Discuss the disorders of ADH secretion - Diabetes Insipidus", "Oxytocin: Explain the synthesis, release mechanism, functions and regulation of Oxytocin; List the functions of Oxytocin; Role in milk ejection reflex and parturition"], "desirable_to_know": ["Describe the physiological basis and important features of abnormalities of growth hormone secretion like Gigantism, acromegaly and pituitary dwarfism", "Describe the mechanism of action of Growth hormone (JAK-STAT Pathway)", "Explain how Insulin like growth factor (IGF) or Somatomedin mediates the actions of growth hormone", "Types of Diabetes Insipidus", "Panhypopituitarism", "Shehan's Syndrome", "Postpartum Pituitary Necrosis"], "nice_to_know": [] },
      { "topic": "Thyroid Gland (Horizontal and Vertical Integration)", "must_know": ["Explain the functional Anatomy of Thyroid Gland", "List the steps involved in the synthesis of thyroid hormones", "Explain the mechanism of release of Thyroid Hormone", "Explain the transport actions of thyroid hormone", "Describe the regulation of thyroid hormone secretion", "List the causes and features of Hyposecretion of thyroid hormones - Myxedema and Cretinism, Goitre and features of Hypothyroidism", "List the causes and features Hypersecretion of thyroid hormones - Gigantism and Acromegaly", "Calcitonin: Secretion and action of Calcitonin"], "desirable_to_know": ["Explain the physiological basis for Simple Goitre", "List the differences between dwarfism and cretinism"], "nice_to_know": [] },
      { "topic": "Adrenal Gland", "must_know": ["List the hormones secreted by the different layers of Adrenal Cortex", "Describe the Functional Anatomy of Adrenal Cortex", "Describe the mechanism of action, functions and regulation of action of Mineralocorticoids, Glucocorticoids and sex steroids", "Discuss the causes and features of Cushing's Syndrome and Addison's Disease", "Adrenal medulla: Synthesis and physiological effects of epinephrine and nor-epinephrine on various systems of the body", "Factors that regulate the secretion of adrenal medullary hormones"], "desirable_to_know": ["Disorders produced by the deficiency of enzymes involved in adrenocortical hormone synthesis", "Diseases related to Mineralocorticoids", "Conn's Syndrome", "Aldosterone Escape", "Atrial Natriuretic Peptide (ANP)"], "nice_to_know": [] },
      { "topic": "Endocrine Pancreas", "must_know": ["Name the different cells present in the Islets of Langerhans", "Physiological stimulus for Insulin secretion", "List the target cells of Insulin and the cells that do not require insulin action for glucose uptake", "Mention the mechanism of action of Insulin on its receptor", "List the important actions of insulin", "List the various factors that regulate insulin secretion", "Describe the features of hyper secretion of Insulin and Hypoglycemia", "Glucagon: List the important actions of glucagon"], "desirable_to_know": ["Describe the steps in biosynthesis of Insulin and the origin of the C-peptide (Connecting peptide)", "Diabetes Mellitus: Discuss the Pathophysiology of Diabetes mellitus", "List the hormones that raise blood sugar level"], "nice_to_know": [] },
      { "topic": "Reproductive System - Sex Determination", "must_know": ["Differentiate between Genetic sex, Gonadal sex and phenotypic sex", "Describe the role of SRY gene and testis determining factor in development of gonads", "Describe the role of testosterone and Mullerian inhibiting substance in the development of male and female internal genitalia"], "desirable_to_know": ["Discuss the role of dihydrotestosterone in the development of external genitalia"], "nice_to_know": [] },
      { "topic": "Male Reproductive Physiology", "must_know": ["Describe the functional anatomy of the male reproductive tract (Testis seminiferous tubules, Sertoli cells, Leydig cells, Blood Testis barrier, Epididymis, Vas deferens, Seminal vesicle, Prostate gland)", "Describe the blood-testis barrier and its function", "Discuss factors that regulate Spermatogenesis", "Describe the structure of spermatozoa", "Describe the source, mechanism of action and functions of testosterone and dihydrotestosterone", "State the source and functions of inhibin", "Discuss the hypothalamic and pituitary control on testicular function and Feedback control of testicular hormones on hypothalamus and pituitary", "Describe the role of prostate, seminal vesicles in reproductive function", "Describe the mechanisms that cause erection and ejaculation", "State what is capacitation and discuss the changes that occur during capacitation"], "desirable_to_know": ["Outline the steps involved in spermatogenesis", "State the composition of semen and recognize use of semen analysis as a test to evaluate infertility", "Discuss about abnormalities of the male reproductive system: Hypogonadism, Cryptorchidism"], "nice_to_know": [] },
      { "topic": "Puberty, Menopause, Pituitary Gonadotropins (FSH, LH) and Prolactin", "must_know": ["Describe the mechanism of action, functions and regulation of secretion of pituitary gonadotropins and prolactin", "Explain the changes that occur during puberty and describe the mechanism of onset of puberty", "Define menopause and describe the physiological changes during menopause"], "desirable_to_know": ["Discuss causes of precocious and delayed puberty"], "nice_to_know": [] },
      { "topic": "Female reproductive system", "must_know": ["Describe the Functional anatomy of the female reproductive system", "Outline the stages of Oogenesis", "State differences between oogenesis and spermatogenesis", "Describe the development of ovarian follicles (Stages of follicle development, ovulation, luteinisation, luteal regression)", "Describe the control of follicular development, ovulation and luteinisation (role of FSH, estrogen and LH)", "Describe the process of follicle attrition", "List the hormones produced by the ovary", "Illustrate the synergistic role of thecal and granulosa cells in steroidogenesis", "Discuss the mechanism of action and functions of estrogen and progesterone", "Describe the feedback regulation of ovarian function", "Describe the physiological changes occurring in ovaries, uterus, cervix, vagina and breast during a menstrual cycle", "Discuss and illustrate the hormonal changes during the menstrual cycle (changes in FSH, LH, estrogen and progesterone)"], "desirable_to_know": ["Discuss the physiological basis of use of synthetic estrogens and progestins as oral contraceptives", "Describe the mechanism of ovulation", "State the tests for ovulation and their physiological basis", "Common causes of anovulatory cycles (physiological, PCOD)", "Protein hormones produced by the ovary and state their source and functions"], "nice_to_know": [] },
      { "topic": "Physiology of Pregnancy", "must_know": ["Outline the process of fertilization, implantation and placental formation", "Discuss the importance of corpus luteum of pregnancy", "Discuss the functions of placenta", "Discuss the secretion and function of hCG from the placenta", "Describe the role of hormonal and mechanical factors influencing labor", "Describe the changes that occur in the various organ systems in the mother during pregnancy"], "desirable_to_know": ["Physiological basis of immunological tests for pregnancy based on hCG", "Parturition", "Source and functions of relaxin", "Describe the fetoplacental unit"], "nice_to_know": [] },
      { "topic": "Lactation", "must_know": ["Describe the Role of estrogen and progesterone in breast development", "Describe the mechanism that causes initiation of lactation after delivery", "Describe the role of Prolactin and prolactin inhibitory factor (Dopamine) in lactation", "Describe the Milk ejection reflex"], "desirable_to_know": ["Role of prolactin inhibitory factor (Dopamine) in lactation", "Discuss the effect of lactation on menstrual cycle"], "nice_to_know": [] },
      { "topic": "Contraception", "must_know": ["Classify male & female contraceptive methods (temporary and permanent)", "Describe the physiological basis of the various methods of contraception"], "desirable_to_know": ["Details of contraceptive devices, side effects"], "nice_to_know": [] },
      { "topic": "Cardiovascular System - Introduction to CVS", "must_know": ["Functional anatomy and innervation of heart"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Conducting system of Heart / SA Node", "must_know": ["Origin and propagation of cardiac impulse; ventricular cell action potential (fast AP)", "Describe how the action potential leads to an increase in cytosolic calcium concentration", "Describe excitation-contraction coupling", "State the basic concepts of the sliding filament theory of contraction"], "desirable_to_know": ["Intrinsic rate of the SA node and influence of autonomic nervous system, hormones and temperature", "Sinus arrhythmia, sinus bradycardia, sinus tachycardia", "Record respiration with a stethograph or respiration belt transducer, as well as ECG or pulse simultaneously, to demonstrate respiratory sinus arrhythmia", "Sodium-calcium exchanger (NCX)"], "nice_to_know": [] },
      { "topic": "Cells of conducting pathway", "must_know": ["State the type of action potential of: AV node AP - similar to SA nodal cell (slow AP); His Bundle cell - fast AP; Purkinje fibres - fast AP"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Properties of Cardiac Muscle", "must_know": ["Automaticity", "Excitability", "Conductivity", "Contractility"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Cardiac Cycle", "must_know": ["Describe with a diagram, the chronological relationship of the following events shown on the same time axis: ECG, Valvular events, Heart sounds, Pressure curves (Left ventricular pressure, Atrial pressure and aortic pressure), Ventricular Volume curve (volume changes in ventricles), JVP, Arterial pulse"], "desirable_to_know": ["Concept of Murmurs", "Timing of Murmurs", "State the timing of murmurs in various valvular and congenital heart defects", "Cardiac Catheterization"], "nice_to_know": [] },
      { "topic": "ECG", "must_know": ["Describe the 12 Leads in which ECG is recorded", "State the rationale of recording from multiple leads", "Identify the lead which is commonly used to monitor patients continuously", "Describe the P, QRS, T and U waves of an ECG in lead II configuration and describe the electrical events responsible for these waves", "Describe PR and QT intervals and state what they represent", "Describe the significance of ST segment being on the isoelectric line in a normal ECG", "Record an ECG in a human subject in all 12 leads", "Calculate rate from a normal ECG tracing", "Identify if every QRS complex is preceded by a P wave and if every P wave is followed by a QRS complex", "State in what conditions the above will not happen"], "desirable_to_know": ["Hyperkalemia", "Ventricular tachycardia", "State the causes for PR prolongation", "Describe the types of Heart block as represented by ECG changes", "Arrhythmias", "Vector cardiogram", "Calculation of axis", "His bundle electrogram"], "nice_to_know": [] },
      { "topic": "Cardiac Output", "must_know": ["Definition of Stroke Volume, Cardiac Index, EDV, ESV, and EF", "Discuss the determinants of cardiac output", "Describe the regulation of cardiac output", "Discuss high output and low output states"], "desirable_to_know": ["Methods of Measuring Cardiac Output"], "nice_to_know": [] },
      { "topic": "Heart Rate", "must_know": ["Innervation of Heart - Parasympathetic and Sympathetic", "Normal Values", "Regulation of Heart Rate", "Factors affecting Heart Rate"], "desirable_to_know": ["Tachycardia", "Bradycardia", "Arrythmias"], "nice_to_know": [] },
      { "topic": "Blood Pressure", "must_know": ["Define the following terms: Mean arterial blood pressure, Systolic pressure, Diastolic pressure, pulse pressure", "Describe the determinants of blood pressure", "Discuss the short-term (neural and hormonal) and long term (renal) mechanisms regulating blood pressure (with special reference to shock and exercise)", "Demonstrate the method of measurement of blood pressure using a sphygmomanometer", "Describe the principle of measuring blood pressure by sphygmomanometry", "Discuss other methods of measuring blood pressure by sphygmomanometer", "Cardiovascular changes during exercise and postural changes"], "desirable_to_know": ["Hypertension", "Hypotension"], "nice_to_know": [] },
      { "topic": "Cardiovascular homeostasis", "must_know": ["Features and regulation of the following circulations: Coronary; Changes in blood flow during different phases of cardiac cycle"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Coronary circulation", "must_know": ["Features and regulation of the following circulations: Coronary", "Changes in blood flow during different phases of cardiac cycle", "Methods for measuring coronary blood flow", "Sympathetic regulation versus local metabolic factors in the regulation of the regional circulations mentioned above"], "desirable_to_know": [], "nice_to_know": ["Angina pectoris", "Myocardial infarction"] },
      { "topic": "Hypertension", "must_know": ["State the normal ranges for systolic and diastolic blood pressures in the various age groups", "Define hypertension"], "desirable_to_know": ["Discuss the risk factors for essential hypertension and causes of secondary hypertension"], "nice_to_know": [] },
      { "topic": "Respiratory System - Functional Anatomy", "must_know": ["Functional Anatomy of the respiratory tract", "Functions of nose and para-nasal sinuses", "Conducting zone and respiratory zone", "Pulmonary vasculature", "Structure of alveolus & alveolo capillary membrane"], "desirable_to_know": ["Examination of respiratory system"], "nice_to_know": [] },
      { "topic": "Muscles of Respiration", "must_know": ["Muscles of Inspiration and Expiration", "Accessory Muscles of respiration"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Surface Tension and Surfactant", "must_know": ["Surface Tension in air liquid interface", "Law of Laplace", "Role of surfactant"], "desirable_to_know": ["Respiratory Distress Syndrome"], "nice_to_know": [] },
      { "topic": "Mechanics of respiration / Pulmonary Ventilation", "must_know": ["State the normal respiratory rate and define inspiration & expiration", "List the muscles of inspiration, expiration & accessory muscles of respiration", "Describe the movements of chest wall and the changes in chest wall dimensions produced by respiratory muscles", "Recognise the difference between quiet breathing and forceful breathing", "Discuss the factors affecting airflow between the atmosphere and alveoli", "State the recoil nature of Lungs and chest wall", "State the values of intra alveolar pressure, Intra pleural pressure", "Discuss the changes in alveolar and intra pleural pressures during respiration", "Identify the sites of air way resistance", "Indicate changes in airway resistance with inspiration and expiration", "Explain the action of autonomic nervous system on bronchial tone", "List histamine as a bronchoconstrictor", "Recognise that airway resistance is increased in obstructive lung diseases", "Define lung compliance and relate it to clinical conditions in which it is altered", "State clinical conditions in which work of breathing is increased"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Lung Volumes and Capacities", "must_know": ["Define the lung volumes and capacities; state the normal values and discuss their physiological variations", "Explain the recording of the Spirogram with a diagram and recognize the volumes and capacities which cannot be measured by spirometry", "Record the lung volumes and capacities of a normal subject using a spirometer", "Discuss the physiological significance of the Residual volume & functional residual capacity", "Describe the forced expiratory spirogram and describe FEV1, FVC and the FEV1/FVC ratio and its variations in obstructive and restrictive lung diseases", "Define peak expiratory flow & state its normal value", "Record peak expiratory flow in abnormal subject", "Record FEV1, FVC and calculate the FEV1/FVC ratio in a normal subject", "Interpret altered values of absolute lung volumes, peak expiratory flow and FEV1/FVC ratio in restrictive and obstructive lung diseases", "Define minute ventilation, anatomical dead space, physiological dead space & alveolar ventilation", "Discuss the effect of changes in respiratory rate and tidal volume on alveolar ventilation"], "desirable_to_know": ["List the common causes, Pathology & clinical features of obstructive and restrictive lung diseases: Asthma, COPD, Emphysema, Chronic bronchitis", "State the physiological basis of tests to differentiate them", "Recognize the flow-volume curves", "Methods of determining FRC and RV; Helium dilution method", "Whole body plethysmography", "Measurement of dead space"], "nice_to_know": [] },
      { "topic": "Alveolar Ventilation", "must_know": ["Total ventilation = Tidal Volume x Respiratory Rate", "Dead Space and Classification", "Alveolar Ventilation", "Factors affecting alveolar ventilation"], "desirable_to_know": ["Measurement of Dead Space"], "nice_to_know": [] },
      { "topic": "Gas Exchange", "must_know": ["Discuss the factors that affect rate of gas exchange at lung & tissue level, with application to clinical conditions", "State Fick's law of diffusion", "Discuss normal composition of atmospheric, tracheal and alveolar air and recognize the conditions which can affect it", "Discuss the normal partial pressures of gases in blood entering and leaving lung", "Explain oxygen uptake and carbon dioxide elimination by lungs & tissues and state the normal rates of the same", "Define respiratory exchange ratio and state its normal values", "State normal time taken for gas equilibration & its application in exercise", "State the physiological causes for normal alveolar-arterial oxygen difference", "Explain the dependence of carbon dioxide elimination on ventilation", "Define physiological shunt"], "desirable_to_know": ["Define Type I respiratory failure and state the common causes", "Explain Type I respiratory failure due to unequal V/Q distribution even when total ventilation and perfusion may be normal", "State the Alveolar gas equation and discuss its application", "Recognize that arterial PCO2 is equal to alveolar PCO2 and that arterial PCO2 can be used in the alveolar gas equation", "State the causes for abnormal Alveolar-arterial oxygen difference", "Distinguish between intrapulmonary and extrapulmonary right to left shunts"], "nice_to_know": [] },
      { "topic": "Transport of Oxygen", "must_know": ["Explain the forms of oxygen transport in blood", "Discuss hemoglobin affinity for oxygen", "Explain & illustrate oxygen hemoglobin dissociation curve and discuss the factors affecting it and the physiological advantages of the curve", "Explain Bohr effect", "Discuss oxygen carrying capacity of blood", "Differentiate between oxygen content of blood & % oxygen saturation of hemoglobin", "Define hypoxemia and hypoxia; explain the physiological basis of types of hypoxia with examples", "Define cyanosis and differentiate between conditions in which it occurs and may not occur"], "desirable_to_know": ["State the physiological basis of oxygen therapy as treatment for the different types of hypoxias"], "nice_to_know": [] },
      { "topic": "Transport of Carbon dioxide", "must_know": ["Explain the forms of carbon dioxide transport in blood", "Explain the role of chloride shift and Haldane effect"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Regulation of Respiration", "must_know": ["Express the concept of the sensors, central controller in brain & effectors in the respiratory control system", "Describe the location and functions of the respiratory centres in brain; describe the current explanation for the basic rhythm of respiration", "Describe the effects of neural inputs on respiration in terms of the voluntary cortical control, motor cortical input, limbic input, peripheral afferent inputs (Hering-breuer reflexes, J receptor input, proprioceptor input, and other peripheral inputs)", "Express the aim of chemical control of respiration; explain the role of peripheral and central chemoreceptors; explain the feedback control of ventilation to regulate gas exchange & maintain normal levels of arterial blood gases and pH", "Discuss and compare the influence of arterial carbon dioxide and oxygen on ventilation in health and in disease", "Describe Cheyne-stokes breathing, state its causes, explain the physiological and pathophysiological mechanisms that produce it; state the abnormality in Biot's breathing", "Demonstrate the effect of apnoea & hyperventilation on respiration; demonstrate the effect of breathing through a tube and the effect of speech & cough on respiration"], "desirable_to_know": ["State the normal values of arterial blood gases (ABG) and interpret altered values", "Define hypercapnoea and hypocapnoea", "State the causes of asphyxia"], "nice_to_know": [] },
      { "topic": "Pulmonary Function Tests", "must_know": ["Spirometry", "Arterial Blood Gas Analysis", "Peak Flow Meter", "Pulseoxymetry"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Central Nervous System - Organization of the nervous system", "must_know": ["CNS", "PNS", "Somatic NS", "Autonomic NS", "Enteric NS"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Neuronal organization at spinal cord level", "must_know": ["Neural Tissue", "Nerve Fibres", "Electrical properties of the nerve cell membrane"], "desirable_to_know": ["Numerical classification of sensory fibres", "Mechanism of axoplasmic transport", "Wallerian degeneration", "Neurotransmitters"], "nice_to_know": [] },
      { "topic": "Synapse, receptors, reflexes, sensations and tracts", "must_know": ["Define the structure and properties of synapse; classification of reflexes; ascending and descending tracts; Types of sensations"], "desirable_to_know": ["Pathway for proprioception"], "nice_to_know": [] },
      { "topic": "Physiology of pain", "must_know": ["Pathway for transmission of pain, fast pain & slow pain, referred pain"], "desirable_to_know": ["Endogenous Analgesic system and gate control theory"], "nice_to_know": [] },
      { "topic": "Cerebellum, Thalamus, Hypothalamus, Cerebral cortex", "must_know": ["Structure, functions, connections and applied aspects of cerebellum, thalamus, hypothalamus, cerebral cortex"], "desirable_to_know": ["cerebellar lesions", "cerebellar function tests", "thalamic syndrome", "corpus callosum"], "nice_to_know": [] },
      { "topic": "CSF", "must_know": ["Describe the composition, Secretion, Circulation, Drainage and Functions"], "desirable_to_know": ["Papilledema", "Hydrocephalus"], "nice_to_know": [] },
      { "topic": "Autonomic nervous system", "must_know": ["Organization of sympathetic and parasympathetic nervous system"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Special Senses - Vision, Hearing, Taste and Smell", "must_know": ["Fundamental knowledge of Vision, Hearing, Taste and Smell"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Bioethics is the application of ethics to the field of medicine and healthcare. Bioethics includes medical ethics (issues in health care), research ethics (issues in the conduct of research), environmental ethics (issues pertaining to the relationship between human activities and the environment), and public health ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Procedure: Enumeration of Red Blood Cells" },
      { "title": "Procedure: Enumeration of White Blood Cells" },
      { "title": "Procedure: Differential leucocyte counts" },
      { "title": "Procedure: Determination of Haemoglobin" },
      { "title": "Procedure: Determination of blood group" },
      { "title": "Procedure: Determination of bleeding time and clotting time" },
      { "title": "Procedure: Examination of pulse" },
      { "title": "Procedure: Recording of blood pressure" },
      { "title": "Demonstration: Determination of packed cell volume and erythrocyte sedimentation rate" },
      { "title": "Demonstration: Determination of specific gravity of blood" },
      { "title": "Demonstration: Determination of erythrocyte fragility" },
      { "title": "Demonstration: Determination of vital capacity and timed vital capacity" },
      { "title": "Demonstration: Skeletal muscle experiments - study of laboratory appliances in experimental physiology; Frog's gastrocnemius sciatic preparation; Simple muscle curve; effects of two successive stimuli; effects of increasing strength of stimuli; effects of temperature; genesis of fatigue and tetanus; effect of after load and free load on muscle contraction; calculation of work done" },
      { "title": "Demonstration: Electrocardiography - recording of normal Electrocardiogram" },
      { "title": "Demonstration: Clinical examination of cardiovascular and respiratory system" }
    ],
    "record_log_book": "Record shall be maintained and assessed periodically by faculty and HOD. Institution shall provide adequate number of cases / teaching materials as specified in Dental Council of India regulation for the students during clinical/practical training and examinations.",
    "disciplines": null,
    "_note": "Practicals are classified as Procedures (performed by students; included in the University practical examination) and Demonstrations (shown to students; not included in the University examination, but questions based on them are given as charts, graphs and calculations for interpretation)."
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
      "duration_hours": null,
      "sections": [
        { "name": "Essay",         "count": 1, "marks_each": 10, "total": 10 },
        { "name": "Short Essay",   "count": 3, "marks_each": 5,  "total": 15 },
        { "name": "Short Answers", "count": 5, "marks_each": 2,  "total": 10 }
      ],
      "total_marks": 35
    },
    "practical_exam": {
      "type": "exercises",
      "items": [
        { "name": "Major", "marks": 20, "exercises": ["Enumeration of Red Blood Cells", "Enumeration of White Blood Cells", "Differential leucocyte counts", "Recording of blood pressure"] },
        { "name": "Minor", "marks": 15, "exercises": ["Determination of Haemoglobin", "Determination of blood group", "Determination of bleeding time and clotting time"] },
        { "name": "OSPE",  "marks": 4,  "exercises": ["Recording Blood Pressure by Palpatory Method", "Examining Radial Pulse"] },
        { "name": "Chart", "marks": 6,  "exercises": [] }
      ],
      "practical_total": 45,
      "viva": { "max": 10, "notes": "Listed under the Practical/Clinical Examination section; the summary marks matrix places this 10-mark viva in the Theory row." }
    },
    "internal_assessment": {
      "theory": 5,
      "practical": 5,
      "total": 10,
      "frequency": "Continuing assessment (Theory and Practical) held at least 3 times in a particular year; best of two examinations considered. Internal Assessment marks submitted to the university once in every three months and displayed on the notice board.",
      "topics": ["General Physiology, Blood, Nerve and Muscle Physiology", "Gastro intestinal Tract", "Cardiovascular System", "Respiratory System", "Excretory System, Endocrinology and Reproductive System", "Central Nervous System and Special Senses"]
    }
  }
  $exam$::jsonb,
  -- ---- textbooks ----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": ["A.K. Jain - Human Physiology for BDS students", "Chaudhuri - Concise Medical Physiology"] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": ["Guyton - Textbook of Physiology", "Berne & Levy - Physiology, 2nd edition", "West - Best & Taylor's Physiological Basis of Medical Practice, 11th edition"] }
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

-- ── 4202B Biochemistry ──
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
  '4202B', 'Biochemistry', NULL,
  'mgr_bds', 1,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "The broad goal of the teaching of undergraduate students in biochemistry is to make them understand the scientific basis of the life processes at the molecular level and to orient them towards the application of the knowledge acquired in solving dental oriented clinical problems.",
    "objectives": {
      "knowledge": [
        "describe the molecular and functional organization of a cell and list its subcellular components",
        "delineate structure, function and inter-relationships of biomolecules and consequences of deviation from normal",
        "summarize the fundamental aspects of enzymology and clinical application wherein regulation of enzymatic activity is altered",
        "describe digestion and assimilation of nutrients and consequences of malnutrition",
        "integrate the various aspects of metabolism and their regulatory pathways",
        "explain the biochemical basis of inherited disorders with their associated sequelae",
        "describe mechanisms involved in maintenance of body fluid and pH homeostasis",
        "outline the molecular mechanisms of gene expression and regulation, the principles of genetic engineering and their application in dentistry",
        "summarize the molecular concepts of body defence and their application in dentistry",
        "outline the biochemical basis of environmental health hazards, biochemical basis of cancer and carcinogenesis",
        "explain the principles of various conventional and specialized laboratory investigations and instrumentation analysis and interpretation of a given data relevant to dentistry",
        "suggest experiments to support theoretical concepts and clinical diagnosis"
      ],
      "skills": [
        "make use of conventional techniques/instruments to perform biochemical analysis relevant to clinical screening and diagnosis",
        "analyze and interpret investigative data",
        "demonstrate the skills of solving scientific and clinical problems and decision making in dentistry"
      ],
      "attitude": [
        "understand the biochemical basis of the health and diseases"
      ],
      "integration": [
        "The knowledge acquired in biochemistry should help the students to integrate molecular events with structure and function of the human body"
      ],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area/personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal."
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses, and online courses."
      ]
    },
    "competencies": [
      { "group": "General skills", "items": ["Apply knowledge & skills in day to day practice", "Apply principles of ethics", "Analyze the outcome of treatment", "Evaluate the scientific literature and information to decide the treatment", "Participate and involve in professional bodies", "Self-assessment & willingness to update the knowledge & skills from time to time", "Involvement in simple research projects", "Minimum computer proficiency to enhance knowledge and skills", "Refer patients for consultation and specialized treatment", "Basic study of forensic odontology and geriatric dental problems"] },
      { "group": "Practice Management", "items": ["Evaluate practice location, population dynamics & reimbursement mechanism", "Co-ordinate & supervise the activities of allied dental health personnel", "Maintain all records", "Implement & monitor infection control and environmental safety programs", "Practice within the scope of one's competence"] },
      { "group": "Communication and Community Resources", "items": ["Assess patients goals, values and concerns to establish rapport and guide patient care", "Able to communicate freely, orally and in writing with all concerned", "Participate in improving the oral health of the individuals through community activities"] },
      { "group": "Patient Care - Diagnosis", "items": ["Obtaining patient's history in a methodical way", "Performing thorough clinical examination", "Selection and interpretation of clinical, radiological and other diagnostic information", "Obtaining appropriate consultation", "Arriving at provisional, differential and final diagnosis"] },
      { "group": "Patient Care - Treatment Planning", "items": ["Integrate multiple disciplines into an individual comprehensive sequence treatment plan using diagnostic and prognostic information", "Ability to order appropriate investigations", "Recognition and initial management of medical emergencies that may occur during dental treatment", "Perform basic cardiac life support", "Management of pain including post operative", "Administration of all forms of local anaesthesia", "Administration of intra muscular and venous injections", "Prescription of drugs, pre operative, prophylactic and therapeutic requirements", "Uncomplicated extraction of teeth", "Transalveolar extractions and removal of simple impacted teeth", "Minor oral surgical procedures", "Management of oro-facial infections", "Simple orthodontic appliance therapy", "Taking, processing and interpretation of various types of intra oral radiographs", "Various kinds of motivative procedures using different materials available", "Simple endodontic procedures", "Removable and fixed prosthodontics", "Various kinds of periodontal therapy"] },
      { "group": "Ethics", "items": ["Introduction to ethics", "Ethics of the individual", "Profession ethics", "Research ethics"] }
    ],
    "teaching_hours": { "lecture": 70, "practical": 60, "total": 130 },
    "teaching_methodology": [
      "Lectures", "Tutorials", "Seminars", "Small group discussions", "Integrated teaching modules",
      "Use of charts (paper-based clinical scenarios) for case discussions", "Practical exercises and demonstrations"
    ],
    "theory_syllabus": [
      { "topic": "Chemistry of Bio-Organic Molecules", "must_know": ["Cell: structure & function of cellular components. Structure of membranes and transport. Exocytosis and endocytosis", "Chemistry of Carbohydrates: Definition, biological importance and classification. Monosaccharides - Isomerism, anomerism. Sugar derivatives, Disaccharides. Polysaccharides. Components of starch and glycogen", "Chemistry of Lipids: Definition, biological importance and classification. Fats and fatty acids. Introduction to compound lipids. Hydrophobic and hydrophilic groups. Cholesterol. Bile salts. Micelle", "Chemistry of Proteins: Biological importance. Classification and properties of amino acids & proteins. Peptides. Introduction to protein structure. Denaturation. Fibrous protein: Collagen and elastin. Glycosaminoglycans. Classification, separation & functions of Plasma proteins", "Chemistry of Nucleic acids: Biological importance of nucleic acids. Outline structure of DNA and RNA"], "desirable_to_know": ["Glycosaminoglycans"], "nice_to_know": [] },
      { "topic": "Macro Nutrients and Digestion", "must_know": ["Digestion and absorption of carbohydrates, proteins & lipids"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Micro Nutrients", "must_know": ["Vitamins: Definition, classification, daily requirement, sources, biochemical functions and deficiency symptoms of Vitamin A, Vitamin D, Vitamin E, Vitamin K, Vitamin B and Vitamin C", "Minerals: Classification, sources, absorption, functions and daily requirement of Calcium, phosphorus, Iron, Iodine and Fluoride", "Nutrition: Energy needs: Basal metabolic rate. Dietary fibres. Nitrogen balance. Essential amino acids. Protein calorie malnutrition"], "desirable_to_know": ["Introduction to antivitamins and hypervitaminosis", "Iodine: source, absorption & functions", "Other trace elements"], "nice_to_know": ["Balanced diet"] },
      { "topic": "Energy Metabolism", "must_know": ["Electron Transport Chain And Oxidative Phosphorylation: Components of respiratory chain, Oxidative Phosphorylation & mechanism of ATP generation, Inhibitors & uncouplers of ETC, & Clinical aspects", "Carbohydrate Metabolism: Glycolysis, pyruvate oxidation, citric acid cycle and Gluconeogenesis. Lactate metabolism. Introduction to glycogenesis, glycogenolysis. Importance of pentose phosphate pathway. Formation of glucuronic acid. Regulation of blood glucose. Diabetes mellitus and related disorders. Evaluation of glycemic status", "Lipid Metabolism: Beta oxidation of fatty acids, Ketone body formation and utilisation, Outlines of cholesterol synthesis and breakdown", "Protein Metabolism: Ammonia metabolism. Urea formation"], "desirable_to_know": ["Glycogen storage disorders, glucose 6-phosphate dehydrogenase deficiency", "fatty acid synthesis, lipogenesis and lipolysis"], "nice_to_know": [] },
      { "topic": "Special aspects of Metabolism", "must_know": ["Importance of pentose phosphate pathway. Formation of glucuronic acid. Phosphocreatine formation. Transmethylation"], "desirable_to_know": ["Biogenic Amines. Introduction to other functions of amino acids including one carbon transfer"], "nice_to_know": ["Detoxication: Typical reactions. Examples of toxic compounds. Oxygen Toxicity"] },
      { "topic": "Biochemical Genetics and Protein Synthesis", "must_know": ["Structure and functions of DNA & RNA"], "desirable_to_know": ["Antimetabolites and antibiotics interfering in replication, transcription and translation. Introduction to cancer, viruses and oncogen"], "nice_to_know": [] },
      { "topic": "Enzyme and Metabolic Regulation", "must_know": ["Enzymes: Definition, classification, specificity and active site. Cofactors. Effect of pH, temperature and substrate concentration. Introduction to enzyme inhibitors, proenzymes and isoenzymes. Introduction to allosteric regulation, covalent modification and regulation by induction/repression. Serum enzymes in diagnosis", "Hormones: Brief introduction to thyroid hormones. Hyperthyroidism and hypothyroidism: Biochemical evaluation", "Acid base regulation & electrolyte balance: Normal pH of blood and its regulation"], "desirable_to_know": ["Introduction to second messengers, cyclic AMP, calcium ion, inositol triphosphate", "Approaches to treatment"], "nice_to_know": ["Mechanism of action of steroid hormones, epinephrine, glucagon and insulin in brief"] },
      { "topic": "Structural Components and Blood Proteins", "must_know": ["Connective tissue: Collagen and elastin, Bone structure, Introduction to cytoskeleton", "Haemoglobin & Immunoglobulins: Structure & functions of Heme & Immunoglobulins. Heme degradation. Introduction to heme synthesis", "Other plasma proteins"], "desirable_to_know": [], "nice_to_know": ["Myofibril and muscle contraction", "Plasma lipoproteins"] },
      { "topic": "Medical Biochemistry", "must_know": ["Regulation of blood glucose, Diabetes mellitus & related disorders, Evaluation of glycemic index", "Hyperthyroidism and hypothyroidism: Biochemical evaluation. Approaches to treatment", "Hyperlipoproteinemias and atherosclerosis", "Jaundice: Classification and evaluation. Liver function tests: Plasma protein pattern, serum enzymes levels", "Kidney function tests & gastric function tests", "Disorders of Acid base balance & Electrolyte balance", "Ethics: To sensitise the students on the ethical issues in the form of Lectures - Introduction to ethics, Ethics of the individual, Profession ethics, Research ethics"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Bioethics is the application of ethics to the field of medicine and healthcare. Bioethics includes medical ethics, which focuses on issues in health care; research ethics, which focuses on issues in the conduct of research; environmental ethics, which focuses on issues pertaining to the relationship between human activities and the environment, and public health ethics"], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Qualitative analysis of carbohydrates - Identification of reducing & non reducing sugar", "hours": 8 },
      { "title": "Colour reactions of proteins and amino acids", "hours": 8 },
      { "title": "Normal constituents of urine (Demonstration) - organic constituents", "hours": 4 },
      { "title": "Normal constituents of urine (Demonstration) - inorganic constituents", "hours": 4 },
      { "title": "Abnormal constituents of urine", "hours": 11 },
      { "title": "Analysis of saliva including amylase by qualitative methods", "hours": 4 },
      { "title": "Blood glucose estimation - GOD/POD method", "hours": 4 },
      { "title": "Serum total protein estimation - Biuret method", "hours": 4 },
      { "title": "Urine creatinine estimation (Demonstration)", "hours": 2 },
      { "title": "Charts (Discussion of clinical case scenarios) - Paper electrophoresis charts/clinical data evaluation", "hours": 2 },
      { "title": "Charts (Discussion of clinical case scenarios) - Glucose tolerance test profiles", "hours": 4 },
      { "title": "Charts (Discussion of clinical case scenarios) - Serum lipid profiles", "hours": 1 },
      { "title": "Charts (Discussion of clinical case scenarios) - Profiles of hypothyroidism and hyperthyroidism", "hours": 2 },
      { "title": "Charts (Discussion of clinical case scenarios) - Acid base disorder", "hours": 2 }
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
      "duration_hours": null,
      "sections": [
        { "name": "Essay",         "count": 1, "marks_each": 10, "total": 10 },
        { "name": "Short Notes",   "count": 3, "marks_each": 5,  "total": 15 },
        { "name": "Short Answers", "count": 5, "marks_each": 2,  "total": 10 }
      ],
      "total_marks": 35
    },
    "practical_exam": {
      "type": "exercises",
      "items": [
        { "name": "Quantitative estimation of analyst (Glucose, Protein)", "total": 20 },
        { "name": "Qualitative analysis of abnormal constituents in urine", "total": 15 },
        { "name": "Chart", "count": 2, "marks_each": 3, "total": 6 },
        { "name": "OSPE (performance stations)", "count": 2, "marks_each": 2, "total": 4 }
      ],
      "exercises_total": 45,
      "viva": { "max": 10, "notes": "Viva listed separately in source (10 marks); the marks matrix shows practical viva as '-' and practical examination total 45." }
    },
    "internal_assessment": {
      "theory": 5,
      "practical": 5,
      "total": 10,
      "frequency": "Continuing assessment (Theory/Practical) held at least 3 times in a year, best of two considered; marks submitted to the university once every three months. Topics grouped into 6 assessments (Cell & chemistry of carbohydrates/lipids/proteins; Enzymes, vitamins and minerals; Metabolism of carbohydrates, lipids and proteins; Hemoglobin, immunoglobulin, Nutrition and acid base disorders; Hormones, connective tissue, metabolism of xenobiotics and oxygen toxicity; Molecular biology)."
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": ["D.M Vasudevan, Text book of Biochemistry for Dental students", "Ambika Shanmugam's Text book of Biochemistry"] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": ["Harper's Illustrated Biochemistry", "Lippincott's Illustrated reviews", "Text book of Biochemistry with clinical correlations 1997, T.N. Pattabiraman", "Basic and applied Dental Biochemistry, 1979, R.A.D. Williams & J.C. Elliot"] }
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

-- ── 4203 Dental Anatomy ──
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
  '4203', 'Dental Anatomy', NULL,          -- DCI model: no credits
  'mgr_bds', 1,
  1, true, false,
  'Dental',
  -- ---- bds_content ---------------------------------------------------------
  $bds$
  {
    "goal": "To produce a dental graduate and clinician who is competent in examining, understanding and treating common oral disorders/diseases, alleviate pain, swelling, stomatodynia, stomatopyrosis, dysphagia and dysarthrosis using the best available evidence as per current knowledge and understanding of common oral diseases process; to employ reliable diagnostic modalities including but not limited to radiology, sialogram and to refer to a competent specialist in case of oral diseases with uncommon presentations, signs and symptoms.",
    "objectives": {
      "knowledge": [
        "To acquire an understanding of how cells, tissues, and organs develop and function in order to gain a clear perspective of these structures as a basis for understanding oral biology/ecology",
        "To develop a comprehension of the principles of embryogenesis and human development with emphasis on the face and structures of the oral cavity",
        "To understand, comprehend, describe, compare, and illustrate the histologic characteristics of oral tissues in health and diseased states",
        "To develop a professional vocabulary of terminology related to the head and neck, the oral complex, and the teeth so as to apply in clinical scenario",
        "To identify, locate, and relate the gross anatomical structures of the head and neck to include various teeth, the bones of the skull, musculature, major nerves, glands and the circulatory and lymphatic systems.",
        "To identify the histologic and anatomic features of the extra-oral and intraoral structures.",
        "To compare and contrast the human dentition in relationship to location, function, and morphology",
        "To identify, comprehend, describe the sequence and eruption patterns of primary and permanent teeth and their implications on future oral and overall health",
        "To understand the oral physiology, unique biochemical basis behind of oral musculature, glands and movements",
        "To be able to clinically apply and incorporate knowledge of tooth morphology, dental occlusion, head and neck anatomy, histology, and embryology into patient assessment, preventive management, treatment planning, and patient education in future"
      ],
      "skills": [
        "Able to carve and reproduce the morphology of human permanent teeth in wax blocks",
        "Able to identify different oral hard tissues in clinical situations",
        "Able to differentiate normal from abnormal and diseased states",
        "Able to identify various types of human teeth based on their morphology",
        "Able to appreciate the influence of age, gender and race on oral and para-oral structures",
        "Able to locate the different areas/surfaces of the teeth",
        "Able to understand the implications of the disease process and ageing on normal oral structures",
        "Able to appreciate the eruption and shedding pattern of human teeth",
        "Able to appreciate and integrate the concept of occlusion, range of human jaw movements in preclinical and clinical situations",
        "Able to use effectively the terminologies and anatomical terms for clinical and patient communications"
      ],
      "attitude": [],
      "integration": [],
      "infection_control": [
        "Knowledge about asepsis - disinfection and sterilization of instruments, clinical area / personal care as per universal protection, and disposal of medical wastes in the appropriate modes. Students should be aware of the rules and regulations pertaining to maintenance of clinical set up and waste disposal."
      ],
      "computer_proficiency": [
        "Basic knowledge of Computers, MS Office, Window 2000, Statistical Programmes. Basic operative skills in analysis of data and knowledge of multimedia. Students should utilize a combination of traditional classroom courses, and online courses."
      ]
    },
    "competencies": [
      { "group": "General skills", "items": ["Apply knowledge & skills in day to day practice", "Apply principles of ethics", "Analyze the outcome of treatment", "Evaluate the scientific literature and information to decide the treatment", "Participate and involve in professional bodies", "Self-assessment & willingness to update the knowledge & skills from time to time", "Involvement in simple research projects", "Minimum computer proficiency to enhance knowledge and skills", "Refer patients for consultation and specialized treatment", "Basic study of forensic odontology and geriatric dental problems"] },
      { "group": "Practice Management", "items": ["Evaluate practice location, population dynamics & reimbursement mechanism", "Co-ordinate & supervise the activities of allied dental health personnel", "Maintain all records", "Implement & monitor infection control and environmental safety programs", "Practice within the scope of one's competence"] },
      { "group": "Communication and Community Resources", "items": ["Assess patients goals, values and concerns to establish rapport and guide patient care", "Able to communicate freely, orally and in writing with all concerned", "Participate in improving the oral health of the individuals through community activities."] },
      { "group": "Patient Care - Diagnosis", "items": ["Obtaining patient's history in a methodical way", "Performing thorough clinical examination", "Selection and interpretation of clinical, radiological and other diagnostic information", "Obtaining appropriate consultation", "Arriving at provisional, differential and final diagnosis"] },
      { "group": "Patient Care - Treatment Planning", "items": ["Integrate multiple disciplines into an individual comprehensive sequence treatment plan using diagnostic and prognostic information", "Ability to order appropriate investigations", "Recognition and initial management of medical emergencies that may occur during dental treatment", "Perform basic cardiac life support", "Management of pain including post operative", "Administration of all forms of local anaesthesia", "Administration of intra muscular and venous injections", "Prescription of drugs, pre operative, prophylactic and therapeutic requirements", "Uncomplicated extraction of teeth", "Transalveolar extractions and removal of simple impacted teeth", "Minor oral surgical procedures", "Management of oro-facial infections", "Simple orthodontic appliance therapy", "Taking, processing and interpretation of various types of intra oral radiographs", "Various kinds of motivative procedures using different materials available", "Simple endodontic procedures", "Removable and fixed prosthodontics", "Various kinds of periodontal therapy"] },
      { "group": "Competencies specific to the subject", "items": ["To gain knowledge about the microscopic configuration of normal histological structure of both soft and hard tissues."] }
    ],
    "teaching_hours": { "lecture": 105, "practical": 250, "total": null },
    "teaching_methodology": [
      "Lecture", "Demonstration", "Group Discussion", "Seminar presentation by the students"
    ],
    "theory_syllabus": [
      { "topic": "Introduction to tooth morphology", "must_know": ["Human dentition: types and functions", "Notation systems: Palmer's, FDI system, Universal and Victor-Haderup system", "Tooth surfaces, their junctions - line angles and point angles", "Definition in terms used in dental morphology", "Contact areas and embrasures - clinical significance"], "desirable_to_know": ["Dental formula"], "nice_to_know": ["Evolution of human dentition"] },
      { "topic": "Morphology of permanent teeth", "must_know": ["Description of individual teeth, along with their endodontic anatomy and including a note on their chronology of development, differences between similar classes of teeth and identification of individual teeth.", "Variations and anomalies commonly seen in individual teeth."], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Morphology of deciduous teeth", "must_know": ["Difference between deciduous and permanent teeth", "Description of individual deciduous teeth, including their chronology and development", "Differences between deciduous and permanent dentition", "Identification of individual deciduous teeth"], "desirable_to_know": ["Endodontic anatomy"], "nice_to_know": [] },
      { "topic": "Occlusion", "must_know": ["Definition, factors influencing occlusion - basal bone, arch, individual teeth, external and internal forces and sequence of eruption", "Centric relation and centric occlusion - protrusive, retrusive and lateral occlusion"], "desirable_to_know": ["Inclination of individual teeth - and compensatory curves"], "nice_to_know": ["Introduction to and classification of malocclusion", "Clinical significance of normal occlusion"] },
      { "topic": "Oral Embryology", "must_know": ["Brief review of development of face, jaws, lips, palate and tongue with applied aspect"], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Development of teeth", "must_know": ["Epithelial mesenchymal interaction", "Detailed study of different stages of development of crown, root and supporting tissue of teeth and detailed study of formation of calcified tissues.", "Applied aspects of disorders in development of teeth."], "desirable_to_know": ["Deviation or aberration in tooth formation"], "nice_to_know": ["Exposure to microscopic slides"] },
      { "topic": "Eruption of deciduous and permanent teeth", "must_know": ["Mechanisms in tooth eruption", "Theories and histology of eruption, formation of Dentogingival junction, role of gubernacular chord in eruption of permanent teeth. Clinical or applied aspect of disorders of eruption."], "desirable_to_know": ["Physiological tooth movement - Preeruptive, Eruptive and Posteruptive tooth movements"], "nice_to_know": [] },
      { "topic": "Shedding of teeth", "must_know": ["Factors and mechanism of shedding of deciduous teeth", "Complications of shedding"], "desirable_to_know": ["Root resorption and resorptive cell"], "nice_to_know": [] },
      { "topic": "Oral Histology - Enamel", "must_know": ["Detailed microscopic study"], "desirable_to_know": ["Age changes"], "nice_to_know": ["Fluoride applications", "Etching", "Clinical and forensic significance"] },
      { "topic": "Dentin", "must_know": ["Detailed microscopic study", "Dentin hypersensitivity", "Reaction of pulp tissue to varying insults on exposed dentin"], "desirable_to_know": [], "nice_to_know": ["Clinical and forensic significance"] },
      { "topic": "Cementum", "must_know": ["Detailed microscopic study"], "desirable_to_know": ["Hypercementosis", "Repair"], "nice_to_know": ["Clinical and forensic significance"] },
      { "topic": "Pulp", "must_know": ["Detailed microscopic study", "Functions", "Age changes and Pulp calcification"], "desirable_to_know": ["Pulp anatomy - pulp cavity, pulp chamber, pulp horn, pulp canal, apical and lateral foramen"], "nice_to_know": ["Clinical significance"] },
      { "topic": "Periodontal ligament and Alveolar bone", "must_know": ["Detailed microscopic study", "Functions", "Age changes"], "desirable_to_know": ["Histological changes in periodontal ligament and bone in normal and orthodontic tooth movement"], "nice_to_know": ["Applied aspects of alveolar bone resorption"] },
      { "topic": "Oral mucosa", "must_know": ["Detailed microscopic study", "Variation in structure in relation to functional requirements", "Mechanisms of keratinisation", "Clinical parts of gingiva", "Dentogingival and Mucocutaneous junctions", "Lingual papillae"], "desirable_to_know": ["Age changes and clinical considerations"], "nice_to_know": [] },
      { "topic": "Salivary glands", "must_know": ["Detailed microscopic study of acini and ductal system.", "Age changes and clinical considerations."], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "TM Joint", "must_know": ["Review of basic anatomical aspects, microscopic study and clinical considerations."], "desirable_to_know": [], "nice_to_know": [] },
      { "topic": "Oral Physiology - Saliva", "must_know": ["Composition of saliva - variations, formation of saliva", "Functions", "Role of saliva in dental caries and applied aspects of hyper and hypo salivation."], "desirable_to_know": ["Mechanism of secretion, salivary reflexes, brief review of secretomotor pathway"], "nice_to_know": [] },
      { "topic": "Mastication", "must_know": ["Peculiarities of masticatory muscles"], "desirable_to_know": ["Masticatory cycle, masticatory reflex and neural control of mastication"], "nice_to_know": ["Masticatory force and its measurement, need of mastication"] },
      { "topic": "Deglutition", "must_know": ["Stages of deglutition, swallow in infants"], "desirable_to_know": ["Neural control of deglutition and dysphagia"], "nice_to_know": [] },
      { "topic": "Calcium, phosphorous and fluoride metabolism", "must_know": ["Source, requirements, absorption, distribution, function and excretion, clinical considerations"], "desirable_to_know": ["Hypocalcemia and hypercalcemia, hyper-phosphatemia and hypophosphatemia and fluorosis"], "nice_to_know": [] },
      { "topic": "Theories of mineralisation", "must_know": ["Definition, mechanism, theories and their drawbacks"], "desirable_to_know": ["Applied aspects of physiology of mineralisation"], "nice_to_know": ["Pathological considerations - calculus formation"] },
      { "topic": "Physiology of taste", "must_know": ["Innervation of taste buds and taste pathway", "Physiological basis of taste sensation", "Age changes"], "desirable_to_know": [], "nice_to_know": ["Applied aspects - taste disorders"] },
      { "topic": "Physiology of speech", "must_know": ["Review of basic anatomy of larynx and vocal chords"], "desirable_to_know": ["Voice production, resonators, production of vowels and different consonants - role of palate, teeth and tongue. Effects of dental prosthesis and appliances of speech and basic speech disorders"], "nice_to_know": [] },
      { "topic": "Bioethics", "must_know": ["Bioethics is the application of ethics to the field of medicine and healthcare. Bioethics includes medical ethics, which focuses on issues in health care; research ethics, which focuses on issues in the conduct of research; environmental ethics, which focuses on issues pertaining to the relationship between human activities and the environment; public health ethics; and cadaver ethics."], "desirable_to_know": [], "nice_to_know": [] }
    ],
    "practicals": [
      { "title": "Drawing and wax carving of permanent tooth except maxillary second, mandibular first, maxillary second and third molars." },
      { "title": "Microscopic study of tooth germ, enamel, dentin, pulp, cementum, periodontal ligament, alveolar bone, salivary glands and oral mucosa including papillae and taste buds." }
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
        { "section": "I",  "instruction": "Elaborate on",   "questions": 2,  "marks_each": 10, "total": 20 },
        { "section": "II", "instruction": "Write Notes on",  "questions": 10, "marks_each": 5,  "total": 50 }
      ],
      "total": 70
    },
    "practical_exam": {
      "type": "spotters",
      "items": [
        { "name": "Carving", "total": 30 },
        { "name": "Spotters and microscopic identification of slides", "total": 60 }
      ],
      "spotters_total": 90,
      "viva": { "max": 20, "notes": "Emphasis on tooth numbering systems, chronology of eruption, nerve and blood supply, mechanism of dental pain and dentine sensitivity, calcium and phosphate metabolism, bone, shedding and eruption of teeth with molecular basis." }
    },
    "internal_assessment": {
      "theory": 10, "practical": 10, "total": 20,
      "frequency": "Continuing assessment examination (both Theory/Practical) held at least 3 times in a particular year, best of two examinations considered; Internal Assessment marks submitted to the university once in every three months."
    }
  }
  $exam$::jsonb,
  -- ---- textbooks -----------------------------------------------------------
  $books$
  {
    "groups": [
      { "group": "Text Books", "books": [
        "Orban's Oral histology and embryology - S.N. Bhaskar, 10th Ed",
        "Ten Cate's Oral histology - A Nanci, 8th ed",
        "Oral development and histology - James and Avery",
        "Wheeler's dental anatomy, physiology and occlusion - Major M. Ash",
        "Dental anatomy - its relevance to dentistry - Woelfel and Scheid",
        "Applied physiology of mouth - Lavelle",
        "Physiology and biochemistry of mouth - Jenkins"
      ] }
    ],
    "reference_groups": [
      { "group": "Reference Books", "books": [
        "Fundamentals of Oral Histology and Physiology.",
        "Sicher and DuBrul's Oral Anatomy.",
        "Orban's Oral Histology & Embryology - S.N. Bhaskar",
        "Oral Development & Histology - James & Avery",
        "Wheeler's Dental Anatomy, physiology & Occlusion - Major M. Ash",
        "Dental Anatomy - its relevance to dentistry - Woelfel & Scheid",
        "Applied Physiology of the mouth - Lavelle",
        "Physiology & Biochemistry of the mouth - Jenkins"
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
