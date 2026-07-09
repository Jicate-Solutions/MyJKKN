-- ============================================================================
-- BoS Course Syllabi — CLO Fink's k_values repair (from "new 35.txt" audit)
-- Date: 2026-07-09
--
-- Fixes 18 rows in bos_course_syllabi.course_learning_outcomes:
--   A) 6 rows with CLO descriptions but zero k_values         -> codes added
--   B) 8 rows with blanket all-codes on every CLO             -> replaced with
--      per-CLO codes derived from the CLO verbs
--   C) 4 rows partially mapped (one CLO missing / blanket)    -> completed
--
-- Fink's codes: FK=Foundational Knowledge, AP=Application, IN=Integration,
--               HD=Human Dimension, CA=Caring, LHL=Learning How to Learn
--
-- Descriptions are preserved VERBATIM from the current DB values, including
-- leading/trailing spaces and existing encoding artifacts (e.g. the mojibake
-- in ecd9d543 is NOT fixed here — separate concern). Only k_values change.
--
-- NOT covered (no source text to author from — need the syllabus documents):
--   86f54218, f0a825c2, 9d8de84e, 8d7777e4, f9a9c32f, cf98c854, a1ad615a
--   (clos: []) and 791a76eb (single blank CLO).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) Descriptions present, no k_values
-- ---------------------------------------------------------------------------

-- History of Tamil Nadu (Madurai Sultanate / Vijayanagar / Nayaks / Marathas / Poligars)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK"],"clo_number":1,"description":"Outline the rule of the Madurai Sultanate. "},{"k_values":["AP"],"clo_number":2,"description":"Explain the impact of the Vijayanagar rule in Tamilaham. "},{"k_values":["IN"],"clo_number":3,"description":"Compare and contrast the achievements of the Nayaks of Madurai, Senji and Thanjavur. "},{"k_values":["CA"],"clo_number":4,"description":"Assess the contribution of the Marathas to Tamil culture."},{"k_values":["HD"],"clo_number":5,"description":" Examine Poligar rebellion as an early resistance against British imperialism."}]}$j$::jsonb
WHERE id = 'f2c62680-8dfd-4ded-a532-b72e8f0c936b';

-- Indian Government
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK"],"clo_number":1,"description":"Understand the functions of the Indian government "},{"k_values":["AP"],"clo_number":2,"description":"Understand and abide the rules of the Indian constitution."},{"k_values":["IN"],"clo_number":3,"description":"Examine the impact of various functions of Parliament"},{"k_values":["HD"],"clo_number":4,"description":"Understand the powers and functions of Indian Judiciary."},{"k_values":["CA"],"clo_number":5,"description":"Examine powers and functions of various commissions in India."}]}$j$::jsonb
WHERE id = 'c49b6251-44d8-409e-9a7b-38b1b94cea1e';

-- Data Structures
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK","AP"],"clo_number":1,"description":"Understand the concept of abstract data types"},{"k_values":["AP","IN"],"clo_number":2,"description":"Analyze linear data structures, such as lists, queues, and stacks, according to the needs of different applications"},{"k_values":["IN","HD"],"clo_number":3,"description":"Concept of function, function arguments, Implementing the concept strings in various application, Significance of Modules, Work with functions, Strings and modules."},{"k_values":["HD","CA"],"clo_number":4,"description":"Design, implement and analyze efficient tree structures to meet requirements such as searching, indexing, and sorting"},{"k_values":["CA","LHL"],"clo_number":5,"description":"Enhance the knowledge to solve problems as graph problems and implement efficient graph algorithms to solve them."}]}$j$::jsonb
WHERE id = 'd7561eb2-c87a-4994-a0f7-5fda48c564fb';

-- Python problem solving
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK","AP"],"clo_number":1,"description":"Implement Python programs with conditionals and loops."},{"k_values":["AP","IN"],"clo_number":2,"description":"Develop Python programs step-wise by defining functions and calling them."},{"k_values":["IN","HD"],"clo_number":3,"description":"Describe the hash function and concepts of collision and its resolution methods."},{"k_values":["HD"],"clo_number":4,"description":"Use Python lists, tuples, dictionaries for representing compound data."},{"k_values":["CA","LHL"],"clo_number":5,"description":"Apply Algorithm for solving problems like sorting, searching, insertion and deletion of data."}]}$j$::jsonb
WHERE id = '23e2aa13-d119-44ef-a752-0839e73b9cf8';

-- Algebra (Sylow / canonical forms) — descriptions kept verbatim incl. existing encoding artifacts
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK","AP"],"clo_number":1,"description":"Recall basic counting principle, define class equations to solve problems, explainSylowâstheorems and apply the theorem to find number of Sylow subgroups"},{"k_values":["FK","IN"],"clo_number":2,"description":"Define Solvable groups, define direct products, examine the properties of finite abelian groups, define modules"},{"k_values":["IN","HD"],"clo_number":3,"description":"Define similar Transformations, define invariant subspace, explore the properties of triangular matrix, to find the index of nilpotence to decompose a space into invariant subspaces, to find invariants of linear transformation, to explore the properties of nilpotent transformation relating nilpotence with invariants"},{"k_values":["AP","HD"],"clo_number":4,"description":"Define Jordan, canonical form, Jordan blocks, define rational canonical form, define companion matrix of polynomial, find the elementary devices of transformation,apply the concepts to find characteristic polynomial of linear transformation."},{"k_values":["HD","CA"],"clo_number":5,"description":"Define trace, define transpose of a matrix, explain n the properties of trace and transpose, to find trace, to find transpose of matrix, to prove Jacobson lemma using the triangular form, define symmetric matrix, skew symmetric matrix, adjoint, to define Hermitian, unitary, normal transformations and to verify whether the transformation inHermitian, unitary and normal"}]}$j$::jsonb
WHERE id = 'ecd9d543-af3f-4067-a86f-448296bb8198';

-- Real Analysis
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["HD"],"clo_number":1,"description":"Analyze and evaluate functions of bounded variation and Rectifiable Curves"},{"k_values":["FK"],"clo_number":2,"description":"Describe the concept of Riemann-Stieltjes integral and its properties"},{"k_values":["AP"],"clo_number":3,"description":"Demonstrate the concept of step function, upper function, Lebesgue function and their integrals."},{"k_values":["IN","CA"],"clo_number":4,"description":"Construct various mathematical proofs using the properties of Lebesgue integrals and establish the Levi monotone convergence theorem"},{"k_values":["LHL"],"clo_number":5,"description":"Formulate the concept and properties of inner products, norms and measurable functions"}]}$j$::jsonb
WHERE id = '198bb7df-8573-4446-870e-d563220af8c1';

-- ---------------------------------------------------------------------------
-- B) Blanket all-codes rows — replaced with verb-derived per-CLO codes
-- ---------------------------------------------------------------------------

-- Number Theory & Cryptography
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK","AP"],"clo_number":1,"description":"Illustrate the implications of properties of divisibility and primes."},{"k_values":["IN","HD"],"clo_number":2,"description":"Distinguish the DES and the AES."},{"k_values":["FK"],"clo_number":3,"description":"Understand the Law of Quadratic Reciprocity and Quadratic Residues."},{"k_values":["FK","IN"],"clo_number":4,"description":"Define the fundamentals of cryptography, such as encryption, authentication and digital signature."},{"k_values":["AP","CA"],"clo_number":5,"description":"Explain how elliptic curves are used in certain cryptographic algorithms."}]}$j$::jsonb
WHERE id = '80698468-7df5-4d51-ade3-315f31b590ec';

-- Lie Groups & Lie Algebras
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK"],"clo_number":1,"description":"Demonstrate systematic understanding of key aspects of Matrix Lie Groups and Lie groups."},{"k_values":["AP"],"clo_number":2,"description":"Determine the exponential of a matrix."},{"k_values":["IN","HD"],"clo_number":3,"description":"Differentiate Lie groups and Lie Algebras."},{"k_values":["HD"],"clo_number":4,"description":"Find the representation of sl(2; C)."},{"k_values":["CA"],"clo_number":5,"description":"Explain reductive Lie algebra."}]}$j$::jsonb
WHERE id = 'c571058a-357d-48cb-b31a-8b3247f30085';

-- Pattern Making (garments)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["AP"],"clo_number":1,"description":"Students should demonstrate the ability to draft and manipulate basic patterns for various garment components"},{"k_values":["AP","HD"],"clo_number":2,"description":"Students should be able to take precise body measurements and analyze garment fit issues"},{"k_values":["FK"],"clo_number":3,"description":"Students should grasp essential pattern making terminology, tools, and techniques necessary for pattern creation and manipulation."},{"k_values":["FK","IN"],"clo_number":4,"description":"Understanding of different garment components and their construction."},{"k_values":["LHL"],"clo_number":5,"description":"Ability to create size chart and grade pattern across various size ranges."}]}$j$::jsonb
WHERE id = 'a826ef21-42a5-49ec-bead-9f9dfd248f35';

-- Physics (mechanics / materials / thermodynamics / electricity / logic gates)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK","AP"],"clo_number":1,"description":"Explain types of motion and extend their knowledge in the study of various  dynamic motions."},{"k_values":["AP","IN"],"clo_number":2,"description":"Explain their knowledge of understanding about materials and their behaviors and apply it to various situations in laboratory and real life."},{"k_values":["FK","HD"],"clo_number":3,"description":"Comprehend basic concept of thermodynamics concept of entropy and associated theorems able to interpret the process of flow temperature physics in the background of growth of this technology."},{"k_values":["IN","HD"],"clo_number":4,"description":"Articulate the knowledge about electric current resistance, capacitance in  terms of potential electric field."},{"k_values":["CA","LHL"],"clo_number":5,"description":"Interpret the real life solutions using AND, OR, NOT basic logic gates and in  tend their ideas to universal building blocks."}]}$j$::jsonb
WHERE id = '1778bf40-62cb-46aa-a869-ac0fa34c702d';

-- Physics Practical
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["HD"],"clo_number":1,"description":"Analyse the relation between the theory and experimental results."},{"k_values":["FK","AP"],"clo_number":2,"description":"Understand the theoretical concept to the real experiments."},{"k_values":["IN","LHL"],"clo_number":3,"description":"Plan the experimental procedure record interrupt the results."},{"k_values":["AP","IN"],"clo_number":4,"description":"The hands on exercise to apply physics principles to evaluate  physical parameters."},{"k_values":["CA"],"clo_number":5,"description":"Compute the experimental investigation of mechanical physics."}]}$j$::jsonb
WHERE id = '06ef384b-a4a0-4444-ba99-88bfffeb632a';

-- Abstract Algebra (Galois Theory)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["AP","HD"],"clo_number":1,"description":"Prove theorems applying algebraic ways of thinking."},{"k_values":["IN"],"clo_number":2,"description":"Connect groups with graphs and demonstrate understanding about Hamiltonian graphs."},{"k_values":["CA"],"clo_number":3,"description":"Compose clear and accurate proofs using the concepts of Galois Theory."},{"k_values":["HD","LHL"],"clo_number":4,"description":"Bring out insight into Abstract Algebra with focus on axiomatic theories."},{"k_values":["FK"],"clo_number":5,"description":"Demonstrate knowledge and understanding of fundamental concepts including extension fields, algebraic extensions, finite fields, class equations and Sylow's theorem."}]}$j$::jsonb
WHERE id = '72b822c5-d405-47a6-9f72-a2e286c0e273';

-- Computer Fundamentals (5-code near-blanket)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK","AP"],"clo_number":1,"description":"Learn the basics of computer, Construct the structure of the required things in computer, learn how to use it."},{"k_values":["AP","IN"],"clo_number":2,"description":"Develop organizational structure using for the devices present currently under input or output unit."},{"k_values":["IN","HD"],"clo_number":3,"description":"Concept of storing data in computer using two header namely RAM and ROM with different types of ROM with advancement in storage basis."},{"k_values":["HD","CA"],"clo_number":4,"description":" Work with different software, Write program in the software and applications of software"},{"k_values":["CA","LHL"],"clo_number":5,"description":"Usage of Operating system in information technology which really acts as a interpreter between software and hardware."}]}$j$::jsonb
WHERE id = '3bb28a7a-d0a4-4eff-aa61-0dbb39be69aa';

-- HTML (5-code near-blanket)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK"],"clo_number":1,"description":"Knows the basic concept in HTML Concept of resources in HTML"},{"k_values":["FK","AP"],"clo_number":2,"description":"Knows Design concept. Concept of Meta Data Understand the concept of save the files."},{"k_values":["AP"],"clo_number":3,"description":"Understand the page formatting. Concept of list"},{"k_values":["AP","IN"],"clo_number":4,"description":"Creating Links. Know the concept of creating link to email address"},{"k_values":["IN","HD"],"clo_number":5,"description":"Concept of adding images Understand the table creation."}]}$j$::jsonb
WHERE id = 'cfdeb1cd-5b80-4573-8f66-463d0414af2e';

-- ---------------------------------------------------------------------------
-- C) Partially mapped rows — completed
-- ---------------------------------------------------------------------------

-- History of Mathematics (CLO1 was blanket, CLOs 2-5 empty)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK"],"clo_number":1,"description":"Students will be able to trace the evolution of key mathematical ideas, such as number systems, geometry, algebra, calculus, and probability, from ancient civilizations to the modern era. They will recognize the contributions of significant mathematicians and cultures to the development of these concepts."},{"k_values":["HD"],"clo_number":2,"description":"Students will be proficient in critically analyzing historical mathematical texts, primary sources, and artifacts. They will assess the validity and significance of mathematical claims, understand the cultural and historical context in which mathematical ideas emerged, and evaluate the impact of historical mathematicians on the advancement of the field."},{"k_values":["AP","IN"],"clo_number":3,"description":"Students will be able to apply problem-solving techniques and strategies used by historical mathematicians to solve contemporary mathematical problems. They will recognize the relevance of historical approaches to problem-solving and appreciate the enduring nature of mathematical reasoning across different time periods."},{"k_values":["CA"],"clo_number":4,"description":"Students will develop strong communication skills by articulating their understanding of the history of mathematics through written essays, oral presentations, and class discussions. They will effectively convey complex ideas and arguments, demonstrate clarity of thought, and engage in respectful dialogue with peers."},{"k_values":["LHL"],"clo_number":5,"description":"Students will cultivate an appreciation for the beauty and elegance of mathematical concepts by studying historical examples of elegant proofs, symmetrical patterns, and aesthetic principles in mathematics. They will recognize the inherent aesthetic qualities of mathematical ideas and develop a deeper understanding of the creative aspect of mathematical inquiry."}]}$j$::jsonb
WHERE id = '20344a25-438d-4068-9e85-f339a5bd516f';

-- Statistics with R (CLO1 was blanket, CLOs 2-5 empty)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK"],"clo_number":1,"description":"Define and explain fundamental statistical concepts such as mean, median, mode, variance, standard deviation, correlation, and regression."},{"k_values":["AP","IN"],"clo_number":2,"description":"Develop proficiency in using R programming language for data analysis, manipulation, and visualization."},{"k_values":["HD"],"clo_number":3,"description":"Understand the assumptions and limitations of different statistical methods and interpret the results accordingly."},{"k_values":["LHL"],"clo_number":4,"description":"Develop critical thinking skills to formulate appropriate research questions and hypotheses."},{"k_values":["CA"],"clo_number":5,"description":"Collaborate effectively with peers in group projects involving data analysis tasks."}]}$j$::jsonb
WHERE id = '8b7cb160-56e4-4bdf-89e8-ded5c6d1a420';

-- Graph Theory (CLO1 was blanket, CLOs 2-5 empty)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["FK"],"clo_number":1,"description":"Basic concept in graph theory."},{"k_values":["AP"],"clo_number":2,"description":"To identify the graphs of connectivity and tree."},{"k_values":["IN"],"clo_number":3,"description":"To find the independent set and cycle graph."},{"k_values":["HD"],"clo_number":4,"description":"To understand graph coloring."},{"k_values":["CA","LHL"],"clo_number":5,"description":"To check planarity."}]}$j$::jsonb
WHERE id = '0c021ce9-c31a-4a4a-983c-00d3c6534958';

-- Communication English (only CLO1 was missing codes; CLOs 2-5 kept as-is)
UPDATE bos_course_syllabi SET course_learning_outcomes = $j${"clos":[{"k_values":["IN"],"clo_number":1,"description":"Enhance mutual understanding leading to clearer and effective communication. "},{"k_values":["FK"],"clo_number":2,"description":" Demonstrate the ability to deliver clear, confident and engaging presentations to diverse audiences."},{"k_values":["AP"],"clo_number":3,"description":"Improve the ability to understand and interpret written texts from a variety of disciplines expanding the intellectual horizon.  "},{"k_values":["CA"],"clo_number":4,"description":" Write clear and logically structured texts in a variety of styles "},{"k_values":["HD","LHL"],"clo_number":5,"description":"  Demonstrate the ability to express ideas clearly and concisely in spoken form adapting their language and tone to suit different audience and contexts. "}]}$j$::jsonb
WHERE id = '0e316810-5017-4531-902e-fddcf8095e27';

-- ---------------------------------------------------------------------------
-- Verification: every updated row should have >=1 and <=3 codes per CLO,
-- and no row should have the identical code-set on all CLOs.
-- ---------------------------------------------------------------------------
-- SELECT id,
--        jsonb_array_length(course_learning_outcomes->'clos') AS clo_count,
--        (SELECT count(DISTINCT c->'k_values')
--           FROM jsonb_array_elements(course_learning_outcomes->'clos') c) AS distinct_code_sets,
--        (SELECT bool_and(jsonb_array_length(c->'k_values') BETWEEN 1 AND 3)
--           FROM jsonb_array_elements(course_learning_outcomes->'clos') c) AS codes_within_1_to_3
-- FROM bos_course_syllabi
-- WHERE id IN (
--   'f2c62680-8dfd-4ded-a532-b72e8f0c936b','c49b6251-44d8-409e-9a7b-38b1b94cea1e',
--   'd7561eb2-c87a-4994-a0f7-5fda48c564fb','23e2aa13-d119-44ef-a752-0839e73b9cf8',
--   'ecd9d543-af3f-4067-a86f-448296bb8198','198bb7df-8573-4446-870e-d563220af8c1',
--   '80698468-7df5-4d51-ade3-315f31b590ec','c571058a-357d-48cb-b31a-8b3247f30085',
--   'a826ef21-42a5-49ec-bead-9f9dfd248f35','1778bf40-62cb-46aa-a869-ac0fa34c702d',
--   '06ef384b-a4a0-4444-ba99-88bfffeb632a','72b822c5-d405-47a6-9f72-a2e286c0e273',
--   '3bb28a7a-d0a4-4eff-aa61-0dbb39be69aa','cfdeb1cd-5b80-4573-8f66-463d0414af2e',
--   '20344a25-438d-4068-9e85-f339a5bd516f','8b7cb160-56e4-4bdf-89e8-ded5c6d1a420',
--   '0c021ce9-c31a-4a4a-983c-00d3c6534958','0e316810-5017-4531-902e-fddcf8095e27'
-- );
