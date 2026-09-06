-- ============================================================================
-- BoS DCH / BDS — SYLLABUS BATCH: 4208A/4208B DENTAL MATERIALS SPLITS (clones of 4204; optional)  (UPSERT — safe to re-run)
-- ON CONFLICT (regulation_id, course_code, version_number) DO UPDATE.
-- Generated 2026-08-08 from parallel extraction. Scope: DCH / BDS / reg 2018.
-- Requires migration 20260807_bos_syllabus_bds_dental_model.sql.
-- ============================================================================

BEGIN;

-- ── 4204 Dental Materials Conservative (clone of 4204) ──
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
  '4208A', 'Dental Materials Conservative', NULL,
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

-- ── 4204 Dental Materials Prosthodontics (clone of 4204) ──
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
  '4208B', 'Dental Materials Prosthodontics Theory', NULL,
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


COMMIT;
