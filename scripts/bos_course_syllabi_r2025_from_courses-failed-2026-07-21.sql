BEGIN;
-- Auto-generated upsert SQL for bos_course_syllabi (R-2025 failed courses)
-- Failed list: c:\tmp\CURRICULUM & SYLLABUS\courses-failed-2026-07-21.xlsx
-- Source folder: c:\tmp\CURRICULUM & SYLLABUS\REG-2025
-- Generated: 2026-07-21T11:41:39.623Z
-- Emitted: 87 | Failed: 48

-- CP25C01 | ADVANCED DATA STRUCTURES AND ALGORITHMS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CP25C01'))
		LIMIT 1
	),
	'CP25C01', 'ADVANCED DATA STRUCTURES AND ALGORITHMS',
	$r2025_5_obj${"objectives":[{"number":1,"description":"1. To explore advanced linear, tree, and graph data structures and their applications. 2. To design efficient algorithms using appropriate algorithmic paradigms. 3. To evaluate computational complexity and identify tractable vs. intractable problems."}]}$r2025_5_obj$::jsonb,
	$r2025_5_clos${"clos":[{"clo_number":1,"description":"Describe data structures and implement algorithmic\nsolutions for complex computational problems.\n-- --","k_values":[]},{"clo_number":2,"description":"Analyze the time complexity and efficiency of\nalgorithms for various computing problems.","k_values":[]},{"clo_number":3,"description":"Evaluate algorithmic techniques and data structures\nto determine their suitability for different\napplications.","k_values":[]},{"clo_number":4,"description":"Design optimized solutions for real-world problems\nusing appropriate algorithms and data structures.","k_values":[]}]}$r2025_5_clos$::jsonb,
	$r2025_5_content${"units":[{"unit_id":"I","unit_title":"Linear Data Structures and Memory Optimization","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Advanced arrays: Sparse arrays,"},{"number":2,"title":"dynamic arrays, cache-aware structures, Linked lists: Skip lists, unrolled linked lists, XOR"},{"number":3,"title":"linked lists, Stacks and Queues: Priority queues, double-ended queues, circular buffers,"}]}],"remarks":""},{"unit_id":"II","unit_title":"Hashing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Perfect hashing, cuckoo hashing, extendible hashing."},{"number":2,"title":"Practical: Implement skip lists and measure performance compared with balanced BST. •"},{"number":3,"title":"Practical: Experiment with cache-aware data structures and analyze memory utilization."}]}],"remarks":""},{"unit_id":"III","unit_title":"Advanced Tree Data Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Balanced Trees: AVL, Red-Black Trees, Splay Trees,"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Treaps, Multi-way Trees","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"B-Trees, B+ Trees, R-Trees, Segment Trees, Fenwick Trees, Suffix"},{"number":2,"title":"Trees and Tries for string processing, Applications in indexing, text retrieval, computational"},{"number":3,"title":"geometry."},{"number":4,"title":"Practical: Implement B+ tree for database indexing use-case."},{"number":5,"title":"Practical: Design a suffix tree-based algorithm for DNA sequence matching."}]}],"remarks":""},{"unit_id":"V","unit_title":"Graph Data Structures and Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Representation: Adjacency list/matrix, incidence"},{"number":2,"title":"matrix, compressed storage, Traversals: DFS, BFS with applications, Shortest Path"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Dijkstra, Bellman-Ford, Floyd-Warshall, Johnson’s algorithm, Minimum"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Spanning Trees","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Prim’s, Kruskal’s, Borůvka’s algorithm, Network Flow Algorithms:"},{"number":2,"title":"Ford-Fulkerson, Edmonds-Karp, Push-Relabel."},{"number":3,"title":"Practical: Implement Johnson’s algorithm for sparse graph shortest paths."},{"number":4,"title":"Practical: Demonstration of Maximum flow in traffic or network routing simulation."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Algorithm Design and Paradigms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Divide and Conquer: Karatsuba’s multiplication,"},{"number":2,"title":"Strassen’s algorithm, Greedy Methods: Huffman coding, interval scheduling, set cover"},{"number":3,"title":"approximation, Dynamic Programming: Matrix chain multiplication, Floyd-Warshall,"},{"number":4,"title":"knapsack variants, Backtracking and Branch-and-Bound, Randomized Algorithms and"},{"number":5,"title":"Probabilistic Analysis."},{"number":6,"title":"Practical: Implement Strassen’s algorithm and compare with naive matrix multiplication. •"},{"number":7,"title":"Practical: Develop a randomized algorithm for primality testing (Miller–Rabin)."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Computational Complexity and Approximation Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Complexity Classes: P, NP,"}]}],"remarks":""},{"unit_id":"X","unit_title":"NP-Complete, NP-Hard, Reductions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Polynomial-time reductions, Cook-Levin theorem"},{"number":2,"title":"(overview), Approximation Algorithms: Vertex cover, set cover, TSP, k-center problem,"}]}],"remarks":""},{"unit_id":"XI","unit_title":"Heuristic Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Local search, simulated annealing, genetic algorithms."},{"number":2,"title":"Practical: Implement approximation algorithm for vertex cover."},{"number":3,"title":"Practical: Complexity analysis of a chosen NP-hard problem and implement a heuristic."}]}],"remarks":""}]}$r2025_5_content$::jsonb,
	$r2025_5_books${"primary":[],"references":[{"title":"Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2009). Introduction to","author":""},{"title":"La Rocca, M. (2021). Advanced algorithms and data structures. Manning Publications.","author":""},{"title":"Goodrich, M. T., Tamassia, R., & Mount, D. M. (2011). Data structures and algorithms in","author":""},{"title":"Weiss, M. A. (2014). Data structures and algorithm analysis in C++. Pearson Education.","author":""},{"title":"Drozdek, A. (2013). Data structures and algorithms in C++. Cengage Publications.","author":""}]}$r2025_5_books$::jsonb,
	$r2025_5_web${"resources":[{"title":"theiotacademy.co","url":"https://www.theiotacademy.co/blog/data-structures-and-algorithms-in-c/"},{"title":"theiotacademy.co","url":"https://www.theiotacademy.co/blog/data-structures-and-algorithms-in-c/"},{"title":"github.com","url":"https://github.com/afrid18/Data_structures_and_algorithms_in_cpp"},{"title":"udemy.com","url":"https://www.udemy.com/course/introduction-to-algorithms-and-data-structures"}]}$r2025_5_web$::jsonb,
	$r2025_5_ped${"methods":["Assignments (15)","Quiz and gamification","Virtual Demo (20)","Flipped classroom"]}$r2025_5_ped$::jsonb,
	$r2025_5_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO3":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"1"},"psos":{"PSO1":"3"}}]}$r2025_5_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CP25C01 Advanced Data Structures and Algorithms .docx - Google Docs.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CP25C02 | ADVANCED DATABASE TECHNOLOGIES
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CP25C02'))
		LIMIT 1
	),
	'CP25C02', 'ADVANCED DATABASE TECHNOLOGIES',
	$r2025_6_obj${"objectives":[{"number":1,"description":"To strengthen the understanding of enhanced ER models and their transformation into relational models with indexing and file structures."},{"number":2,"description":"To understand object-oriented and object-relational database concepts and querying using OQL."},{"number":3,"description":"To explore techniques in query processing, execution, and optimization strategies."}]}$r2025_6_obj$::jsonb,
	$r2025_6_clos${"clos":[{"clo_number":1,"description":"Elaborate different database models for effective database\ndesign.\n-- --","k_values":[]},{"clo_number":2,"description":"Implement advanced database features for optimized data\nretrieval.","k_values":[]},{"clo_number":3,"description":"Evaluate query processing and optimization strategies to\nimprove system performance.","k_values":[]},{"clo_number":4,"description":"Design solutions using advanced database models to\naddress complex data-intensive applications.","k_values":[]}]}$r2025_6_clos$::jsonb,
	$r2025_6_content${"units":[{"unit_id":"I","unit_title":"Entity Relationship Model","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Entity Relationship Model Revised-Subclasses, Superclasses"},{"number":2,"title":"and Inheritance -Specialization and Generalization-Union Types-Aggregation."},{"number":3,"title":"Activity: Design ER Model for a specific use case."}]}],"remarks":""},{"unit_id":"II","unit_title":"Enhanced Entity Relational Model","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Relational Model Revised, Converting ER and EER"},{"number":2,"title":"Model to Relational Model-SQL and Advanced Features, File Structures, Hashing, and"},{"number":3,"title":"Indexing."},{"number":4,"title":"Activity: Demonstration of SQL Implementation."}]}],"remarks":""},{"unit_id":"III","unit_title":"Object Relational Databases","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Object Database Concepts-Object Database Extensions to"},{"number":2,"title":"SQL, The ODMG Object Model and ODL, Object Database Conceptual Design-Object Query"},{"number":3,"title":"Language OQL-Language Binding in the ODMG Standard."},{"number":4,"title":"Activity: Demonstration of Object Query Language."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Query Processing and Optimization","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Query Processing, Query Trees and Heuristics,"},{"number":2,"title":"Query Execution Plans, Cost Based Optimization."},{"number":3,"title":"Activity: Design of Query Evaluation Plans."}]}],"remarks":""},{"unit_id":"V","unit_title":"Distributed Databases","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Real-Time Bidding, E-mail Marketing, Affiliate Marketing, Social"},{"number":2,"title":"Marketing Mobile Marketing, Distributed Database Concepts, Data Fragmentation,"},{"number":3,"title":"Replication and Allocation, Distributed Database Design Techniques, Distributed Database"},{"number":4,"title":"Design Techniques, Distributed Database Architectures."},{"number":5,"title":"Activity: Demonstration of Concurrency and Transactions."}]}],"remarks":""},{"unit_id":"VI","unit_title":"NOSQL Systems and Bigdata","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to NOSQL Systems-The CAP Theorem,"},{"number":2,"title":"Document, based NOSQL Systems, Key-value Stores, Column-Based or Wide Column"},{"number":3,"title":"NOSQL Systems, NOSQL Graph Databases and Neo4j."},{"number":4,"title":"Activity: Design application with MongoDB."}]}],"remarks":""}]}$r2025_6_content$::jsonb,
	$r2025_6_books${"primary":[],"references":[{"title":"Elmasri, R., & Navathe, S. B. (2016). Fundamentals of database systems. Pearson","author":""},{"title":"Silberschatz, A., Korth, H. F., & Sudarshan, S. (2020). Database system concepts, McGraw","author":""},{"title":"Ceri, S., & Pelagatti, G. Distributed databases: Principles and systems. McGraw Hill.","author":""},{"title":"Ramakrishnan, R., & Gehrke, J. (2004). Database management systems. McGraw Hill.","author":""}]}$r2025_6_books$::jsonb,
	$r2025_6_web${"resources":[{"title":"edx.org","url":"https://www.edx.org/learn/sql/stanford-university-databases-advanced-topics-in-sql"},{"title":"edx.org","url":"https://www.edx.org/learn/sql/stanford-university-databases-advanced-topics-in-sql"},{"title":"coursera.org","url":"https://www.coursera.org/courses?query=sql&productDifficultyLevel=Advanced"}]}$r2025_6_web$::jsonb,
	$r2025_6_ped${"methods":["Assignments (15)","Quiz and gamification","Virtual Demo (20)","Flipped classroom"]}$r2025_6_ped$::jsonb,
	$r2025_6_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO3":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"1"},"psos":{"PSO1":"3"}}]}$r2025_6_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CP25C02 Advanced Database Technologies .docx - Google Docs.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CP25C03 | ADVANCED OPERATING SYSTEMS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CP25C03'))
		LIMIT 1
	),
	'CP25C03', 'ADVANCED OPERATING SYSTEMS',
	$r2025_7_obj${"objectives":[{"number":1,"description":"To analyze the architectures and design issues of advanced operating systems. • To develop the model for process synchronization and recovery in complex environments."},{"number":2,"description":"To evaluate algorithms for distributed coordination, resource management, fault tolerance, and security."}]}$r2025_7_obj$::jsonb,
	$r2025_7_clos${"clos":[{"clo_number":1,"description":"Describe operating system concepts for memory and resource\nmanagement.\n-- --","k_values":[]},{"clo_number":2,"description":"Analyse virtualization and distributed OS mechanisms for\nscalability and performance.","k_values":[]},{"clo_number":3,"description":"Evaluate OS security and resource handling strategies in diverse\nenvironments.","k_values":[]},{"clo_number":4,"description":"Design innovative OS solutions using modern tools and\ntechniques.","k_values":[]}]}$r2025_7_clos$::jsonb,
	$r2025_7_content${"units":[{"unit_id":"I","unit_title":"Advanced Process and Thread Management","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Multithreading models, thread pools, context"},{"number":2,"title":"switching, Synchronization issues and solutions: semaphores, monitors, lock free data"},{"number":3,"title":"structures, CPU scheduling in multi-core systems"},{"number":4,"title":"Activity: CPU scheduler simulation for multicore systems."}]}],"remarks":""},{"unit_id":"II","unit_title":"Memory and Resource Management in Modern OS","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual memory, demand paging, page"},{"number":2,"title":"replacement policies-Huge pages, NUMA-aware memory management-Resource allocation in"},{"number":3,"title":"cloud-native environments"},{"number":4,"title":"Activity: Simulate demand paging and page replacement algorithms."}]}],"remarks":""},{"unit_id":"III","unit_title":"Virtualization and Containerization","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Hypervisors (Type I & II), KVM, QEMU, Xen"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Containers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Docker, LXC, systemd-nspawn-OS-level virtualization and namespaces"},{"number":2,"title":"Activity: Deploy and configure Docker containers with various images."}]}],"remarks":""},{"unit_id":"V","unit_title":"Distributed Operating Systems and File Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Distributed scheduling, communication,"},{"number":2,"title":"and synchronization-Distributed file systems: NFS, GFS, HDFS Transparency issues and fault"},{"number":3,"title":"tolerance"},{"number":4,"title":"Activity: Simulate distributed process synchronization."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Security and Trust in Operating Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Access control models: DAC, MAC, RBAC-OS"},{"number":2,"title":"hardening techniques, sandboxing, SELinux, AppArmor-Secure boot, rootkit detection, trusted"},{"number":3,"title":"execution environments"},{"number":4,"title":"Activity: Implement Role-Based Access Control (RBAC) using Linux user and group"},{"number":5,"title":"permissions."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Real-Time and Embedded Operating Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Real-time scheduling algorithms (EDF,"},{"number":2,"title":"RM)-POSIX RT extensions, RTOS architecture-TinyOS, FreeRTOS case studies"},{"number":3,"title":"Activity: Analyze FreeRTOS task scheduling behavior."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Edge and Cloud OS","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Future Paradigms: Serverless OS, unikernels, lightweight OS for edge"},{"number":2,"title":"computing-Mobile OS internals (Android, iOS)-OS for quantum and neuromorphic computing"},{"number":3,"title":"(intro)"},{"number":4,"title":"Activity: Analyze Android’s system architecture using emulator tools."}]}],"remarks":""}]}$r2025_7_content$::jsonb,
	$r2025_7_books${"primary":[],"references":[{"title":"Tanenbaum, A. S., & Bos, H. (2023). Modern operating systems. Pearson. 2. Buyya, R., et","author":""},{"title":"Silberschatz, A., Galvin, P. B., & Gagne, G. (2022). Operating system concepts. Wiley.","author":""},{"title":"Anderson, T., & Dahlin, M. (2021). Operating systems: Principles and practice. Recursive","author":""},{"title":"Arpaci-Dusseau, R. H., & Arpaci-Dusseau, A. C. (2020). Operating systems: Three easy","author":""}]}$r2025_7_books$::jsonb,
	$r2025_7_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc22_cs80/preview"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106104182"}]}$r2025_7_web$::jsonb,
	$r2025_7_ped${"methods":["Assignments (15)","Quiz and gamification","Virtual Demo (20)","Flipped classroom"]}$r2025_7_ped$::jsonb,
	$r2025_7_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO3":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"1"},"psos":{"PSO1":"3"}}]}$r2025_7_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CP25C03 Advanced Operating Systems.docx - Google Docs.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CP25C04 | ADVANCED COMPILER DESIGN
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CP25C04'))
		LIMIT 1
	),
	'CP25C04', 'ADVANCED COMPILER DESIGN',
	$r2025_8_obj${"objectives":[{"number":1,"description":"To analyze the theory and principles of modern compiler design and advanced optimization techniques."},{"number":2,"description":"To design and implement efficient front-end and back-end compiler components for programming languages."},{"number":3,"description":"To evaluate code optimization strategies and runtime environment management in contemporary architectures."}]}$r2025_8_obj$::jsonb,
	$r2025_8_clos${"clos":[{"clo_number":1,"description":"Explain intermediate control flow techniques in\ncompiler design.\n-- --","k_values":[]},{"clo_number":2,"description":"Apply program analysis techniques and advanced\noptimizations for design of compilers.","k_values":[]},{"clo_number":3,"description":"Develop compiler features and machine learning\ntechniques for optimization.","k_values":[]},{"clo_number":4,"description":"Evaluate secure compilation strategies for quantum and\nmulti-target compilation.","k_values":[]}]}$r2025_8_clos$::jsonb,
	$r2025_8_content${"units":[{"unit_id":"I","unit_title":"Intermediate Representations and Control Flow Analysis","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Static single assignment (SSA)"},{"number":2,"title":"form- Context-Free Grammer (CFG) construction-dominance relations Intermediate"},{"number":3,"title":"Representation (IR) design for functional and imperative languages-Static single assignment"},{"number":4,"title":"and def-use chains"},{"number":5,"title":"Activities:"},{"number":6,"title":"1. Convert source code to SSA form using LLVM IR."},{"number":7,"title":"2. Visualize control flow graphs from SSA using LLVM tools."}]}],"remarks":""},{"unit_id":"II","unit_title":"Program Analysis and Transformations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Data flow analysis- live variable analysis reaching"},{"number":2,"title":"definitions-Alias analysis and dependence analysis-Loop optimizations and transformations"},{"number":3,"title":"Activities:"},{"number":4,"title":"1. Perform loop unrolling and strength reduction."},{"number":5,"title":"2. Conduct live variable analysis and visualize data flow graphs."}]}],"remarks":""},{"unit_id":"III","unit_title":"Advanced Optimizations and Polyhedral Compilation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Polyhedral model for loop"},{"number":2,"title":"nests-Tiling, skewing, fusion, and vectorization-Profile-guided and feedback-directed"},{"number":3,"title":"optimizations"},{"number":4,"title":"Activities:"},{"number":5,"title":"1. Implement loop tiling and loop skewing on a matrix multiplication program. 2."},{"number":6,"title":"Analyze the effect on loop-intensive code with LLVM optimization flags."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Just-in-Time (JIT) and Runtime Compilation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"JIT compilation models: tracing,"},{"number":2,"title":"method-based-GraalVM architecture, Java HotSpot internals-LLVM JIT and dynamic"},{"number":3,"title":"language support"},{"number":4,"title":"Activities:"},{"number":5,"title":"1. Develop a basic JIT-enabled interpreter with LLVM or GraalVM. 2."},{"number":6,"title":"Implement dynamic dispatch using LLVM JIT API."}]}],"remarks":""}]}$r2025_8_content$::jsonb,
	$r2025_8_books${"primary":[],"references":[{"title":"Cooper, K. D., & Torczon, L. (2023). Engineering a compiler. Morgan Kaufmann. 2. Grune,","author":""},{"title":"Aho, A. V., Lam, M. S., Sethi, R., & Ullman, J. D. (2006). Compilers: Principles,","author":""},{"title":"Völter, M. (2013). DSL engineering: Designing, implementing and using domain specific","author":""},{"title":"Sarda, S., & Pandey, M. (2015). LLVM essentials. Packt Publishing.","author":""}]}$r2025_8_books$::jsonb,
	$r2025_8_web${"resources":[{"title":"cse.iitk.ac.in","url":"https://www.cse.iitk.ac.in/users/karkare/Courses/cs738/"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_cs07/preview”"}]}$r2025_8_web$::jsonb,
	$r2025_8_ped${"methods":["Assignments (15)","Quiz and gamification","Virtual Demo (20)","Flipped classroom"]}$r2025_8_ped$::jsonb,
	$r2025_8_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO3":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"1"},"psos":{"PSO1":"3"}}]}$r2025_8_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CP25C04 Advanced Compiler Design.docx - Google Docs.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C01 | COMPUTER PROGRAMMING: C
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C01'))
		LIMIT 1
	),
	'CS25C01', 'COMPUTER PROGRAMMING: C',
	$r2025_16_obj${"objectives":[{"number":1,"description":"To equip engineering students with the foundational knowledge and practical skills in ‘C’ programming to analyse and solve computational problems effectively."},{"number":2,"description":"To foster problem-solving, critical thinking, and modular programming skills essential for engineering domains."}]}$r2025_16_obj$::jsonb,
	$r2025_16_clos${"clos":[{"clo_number":1,"description":"Explain the potential usage of ‘C’ in engineering\napplications","k_values":[]},{"clo_number":2,"description":"To apply the concepts of ‘C’ in solving engineering\nproblems and formulate new projects.","k_values":[]},{"clo_number":3,"description":"To interpret the data and effectively communicate in\ngroups.","k_values":[]},{"clo_number":4,"description":"Adapt new programming concepts and technologies in\nthe profession.","k_values":[]}]}$r2025_16_clos$::jsonb,
	$r2025_16_content${"units":[{"unit_id":"I","unit_title":"Introduction to C","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Problem Solving, Problem Analysis Chart, Developing an"},{"number":2,"title":"Algorithm, Flowchart and Pseudocode, program structure, Compilation & Execution"},{"number":3,"title":"process, Interactive and Script mode, Comments, Indentation, Error messages,"},{"number":4,"title":"Primitive data types, Constants, Variables, Reserved words, Arithmetic, Relational,"},{"number":5,"title":"Logical, Bitwise, Assignment, Conditional operators, Input/Output Functions, Built-in"},{"number":6,"title":"Functions."},{"number":7,"title":"Practical: Create Problem Analysis Charts, Flowcharts and Pseudocode for simple"},{"number":8,"title":"C programs (Minimum three)."}]}],"remarks":""},{"unit_id":"II","unit_title":"Control Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"if, if-else, nested if, switch-case, while, do-while, for, nested loops,"},{"number":2,"title":"Jump statements."},{"number":3,"title":"Practical: Usage of conditional logics in programs. (Minimum three)"}]}],"remarks":""},{"unit_id":"III","unit_title":"Functions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Function Declaration, Definition and Calling, Function Parameters and"},{"number":2,"title":"Return Types, Call by Value and Call by Reference, Recursive Functions, Scope and"},{"number":3,"title":"Lifetime of Variables, Header files and Modular Programming."},{"number":4,"title":"Practical: Usage of functions in programs. (Minimum three)"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Strings & Pointers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"One-dimensional and Multi-dimensional Arrays, Array operations"},{"number":2,"title":"and traversals, String Handling: String declaration, input/output, string library functions,"},{"number":3,"title":"Pointer arithmetic, Pointers and Arrays, Pointers to function, Dynamic memory"},{"number":4,"title":"allocation."},{"number":5,"title":"Practical: Programs using pointers, dynamic memory, pointer arithmetic, string"},{"number":6,"title":"manipulations, array operations. (Minimum three)"}]}],"remarks":""},{"unit_id":"V","unit_title":"Structures & Unions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Defining and using structures, Array of structures, Pointers"},{"number":2,"title":"to structures, Unions and their uses, Enumerations."},{"number":3,"title":"Practical: Program to use structures and unions"}]}],"remarks":""},{"unit_id":"VI","unit_title":"File Operations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Open, read, write, close file operations, Binary vs Text files, File"},{"number":2,"title":"pointers, Error handling in file operations."},{"number":3,"title":"Practical: Programs reading/writing data in text and binary files (Minimum three)."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Standard Libraries & Header Files","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Using standard libraries like stdio.h, stdlib.h,"},{"number":2,"title":"string.h, math.h, Creating and using user-defined header files and libraries."},{"number":3,"title":"Practical: Use of standard and user-defined libraries in solving problems. (Minimum"},{"number":4,"title":"three), Project (Minimum Two)"}]}],"remarks":""}]}$r2025_16_content$::jsonb,
	$r2025_16_books${"primary":[],"references":[{"title":"Thareja, R. (2021). Programming in C. Oxford University Press.","author":""},{"title":"Balagurusamy, E. (2019). Programming in ANSI C. McGraw Hill Education.","author":""},{"title":"Kanetkar, Y. (2020). Let us C. BPB Publications.","author":""},{"title":"Kalicharan, N. (2022). Learn to program with C: An introduction to programming","author":""},{"title":"Forouzan, B. A., & Afyouni, H. (2023). Computer science: A structured","author":""}]}$r2025_16_books$::jsonb,
	$r2025_16_web${"resources":[{"title":"learn-c.org","url":"https://www.learn-c.org/"},{"title":"learn-c.org","url":"https://www.learn-c.org/"},{"title":"geeksforgeeks.org","url":"https://www.geeksforgeeks.org/c-programming-language/"},{"title":"gnu.org","url":"https://www.gnu.org/software/libc/manual/"},{"title":"gnu.org","url":"https://www.gnu.org/software/libc/manual/"},{"title":"onlinecourses.swayam2.ac.in","url":"https://onlinecourses.swayam2.ac.in/imb25_mg71/"}]}$r2025_16_web$::jsonb,
	$r2025_16_ped${"methods":["Quiz and gamification","Project (15%)","Assignment Programs (25%)"]}$r2025_16_ped$::jsonb,
	$r2025_16_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO5":"2"},"psos":{"PSO1":"3","PSO3":"1"}},{"co_id":"CO3","pos":{"PO2":"3","PO8":"1","PO9":"1"},"psos":{"PSO2":"3","PSO3":"1"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO2":"1","PSO3":"3"}}]}$r2025_16_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CS25C01 Computer Programming C.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C02 | COMPUTER PROGRAMMING: PYTHON
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C02'))
		LIMIT 1
	),
	'CS25C02', 'COMPUTER PROGRAMMING: PYTHON',
	$r2025_17_obj${"objectives":[{"number":1,"description":"To equip engineering students with the foundational knowledge and practical skills in Python programming to analyse and solve computational problems effectively."},{"number":2,"description":"To foster problem-solving, critical thinking, and modular programming skills essential for engineering domains."}]}$r2025_17_obj$::jsonb,
	$r2025_17_clos${"clos":[{"clo_number":1,"description":"Explain the potential usage of Python in\nengineering applications","k_values":[]},{"clo_number":2,"description":"To apply the concepts of Python in solving\nengineering problems and formulate new\nprojects.","k_values":[]},{"clo_number":3,"description":"To interpret the data and effectively\ncommunicate in groups.","k_values":[]},{"clo_number":4,"description":"Adapt new programming concepts and\ntechnologies in the profession.","k_values":[]}]}$r2025_17_clos$::jsonb,
	$r2025_17_content${"units":[{"unit_id":"I","unit_title":"Introduction to Python","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Problem Solving, Problem Analysis Chart, Developing"},{"number":2,"title":"an Algorithm, Flowchart and Pseudocode, Interactive and Script Mode,"},{"number":3,"title":"Indentation, Comments, Error messages, Variables, Reserved Words, Data"},{"number":4,"title":"Types, Arithmetic operators and expressions, Built-in Functions, Importing from"},{"number":5,"title":"Packages."},{"number":6,"title":"Practical: Problem Analysis Chart, Flowchart and Pseudocode Practices."},{"number":7,"title":"(Minimum three)"}]}],"remarks":""},{"unit_id":"II","unit_title":"Control Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"if, if-else, nested if, multi-way if-elif statements, while loop, for"},{"number":2,"title":"loop, nested loops, pass statements."},{"number":3,"title":"Practical: Usage of conditional logics in programs. (Minimum three)"}]}],"remarks":""},{"unit_id":"III","unit_title":"Functions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Hiding redundancy, complexity; Parameters, arguments and return"},{"number":2,"title":"values; formal vs actual arguments, named arguments, Recursive & Lambda"},{"number":3,"title":"Functions."},{"number":4,"title":"Practical: Usage of functions in programs. (Minimum three)"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Strings & Collections","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"String Comparison, Formatting, Slicing, Splitting, Stripping,"},{"number":2,"title":"Lists, tuples, and dictionaries, basic list operators, searching and sorting lists;"},{"number":3,"title":"dictionary literals, adding and removing keys, accessing and replacing values."},{"number":4,"title":"Practical: String manipulations and operations on lists, tuples, sets, and"},{"number":5,"title":"dictionaries. (Minimum three)"}]}],"remarks":""},{"unit_id":"V","unit_title":"File Operations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Create, Open, Read, Write, Append and Close files. Manipulating"},{"number":2,"title":"directories, OS and Sys modules, reading/writing text and numbers, from/to a file;"},{"number":3,"title":"creating and reading a formatted file (csv, tab-separated, etc.)."},{"number":4,"title":"Practical: Opening, closing, reading and writing in formatted file format and sort"},{"number":5,"title":"data. (Minimum three)"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Packages","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Built-in modules, User-Defined modules, Numpy, SciPy, Pandas, Scikit-"},{"number":2,"title":"learn."},{"number":3,"title":"Practical: Usage of modules and packages to solve problems. (Minimum three),"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Project (Minimum Two)","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""}]}$r2025_17_content$::jsonb,
	$r2025_17_books${"primary":[],"references":[{"title":"Matthes, E. (2019). Python crash course: A hands-on, project-based","author":""},{"title":"Brown, M. C. (2018). Python: The complete reference (4th ed.). McGraw Hill","author":""},{"title":"Guttag, J. V. (2016). Introduction to computation and programming using","author":""},{"title":"McKinney, W. (2017). Python for data analysis: Data wrangling with pandas,","author":""}]}$r2025_17_books$::jsonb,
	$r2025_17_web${"resources":[{"title":"docs.python.org","url":"https://docs.python.org/3/"},{"title":"docs.python.org","url":"https://docs.python.org/3/"},{"title":"w3schools.com","url":"https://www.w3schools.com/python/"},{"title":"w3schools.com","url":"https://www.w3schools.com/python/"},{"title":"numpy.org","url":"https://numpy.org/doc/"},{"title":"numpy.org","url":"https://numpy.org/doc/"},{"title":"scipy.org","url":"https://scipy.org/"},{"title":"scipy.org","url":"https://scipy.org/"},{"title":"developers.google.com","url":"https://developers.google.com/edu/python/"},{"title":"developers.google.com","url":"https://developers.google.com/edu/python/"}]}$r2025_17_web$::jsonb,
	$r2025_17_ped${"methods":["Quiz and gamification","Project (15%)","Assignment Programs"]}$r2025_17_ped$::jsonb,
	$r2025_17_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO5":"2"},"psos":{"PSO2":"2","PSO3":"1"}},{"co_id":"CO3","pos":{"PO2":"3","PO8":"1","PO9":"1"},"psos":{"PSO3":"2"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO2":"2"}}]}$r2025_17_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CS25C02-Computer Programming Python.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C03 | ESSENTIALSOFCOMPUTING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C03'))
		LIMIT 1
	),
	'CS25C03', 'ESSENTIALSOFCOMPUTING',
	$r2025_18_obj${"objectives":[{"number":1,"description":"1. To introduce the basic components and operations of computers. 2. To develop problem-solving and computational thinking skills. 3. To enable learners to design simple solutions using algorithms and flowcharts. 4. To provide hands-on experience in visual programming and basic app development."}]}$r2025_18_obj$::jsonb,
	$r2025_18_clos${"clos":[{"clo_number":1,"description":"Describe the basic components and functioning\nof computers, number systems, and data representation.","k_values":[]},{"clo_number":2,"description":"Apply computational thinking and problem-solving\ntechniques to design simple algorithms for real-world\nproblems","k_values":[]},{"clo_number":3,"description":"Design and represent solutions using\nflowcharts, pseudocode, and basic visual programming\ntools.","k_values":[]},{"clo_number":4,"description":"Demonstrate the ability to independently learn new\ncomputing tools and practices essential for life-long\nlearning","k_values":[]}]}$r2025_18_clos$::jsonb,
	$r2025_18_content${"units":[{"unit_id":"I","unit_title":"Computers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Computer, Characteristics of Computers, History of Computers,"},{"number":2,"title":"Classification of Computers, Applications of Computers, Basic Organization of a"},{"number":3,"title":"Computer. Data Representation, Using spread sheets for basic operations on data and"},{"number":4,"title":"visualize the data."},{"number":5,"title":"Practical: 1. Office Software for documentation and presentation"},{"number":6,"title":"Practical: 2. Spread sheets for calculations and data. Visualization"}]}],"remarks":""},{"unit_id":"II","unit_title":"Computational Thinking","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"What is Computational Thinking, Decomposition,"},{"number":2,"title":"Abstraction, Real World Information to Computable Data, Number Systems,"},{"number":3,"title":"Conversions among Number systems, what is Logic, Boolean Logic, Applications of"},{"number":4,"title":"Propositional Logic."},{"number":5,"title":"Activities:"},{"number":6,"title":"1. Solving problems based on number systems and logics."},{"number":7,"title":"2. Virtual Demonstration of Computational thinking"}]}],"remarks":""},{"unit_id":"III","unit_title":"Problem Solving Basics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Problem Definition, Logical Reasoning, Decomposition,"},{"number":2,"title":"Software Design Concept of an Algorithm, Algorithm Representation – Algorithm"},{"number":3,"title":"Discovery – Iterative Structures – Recursive Structures – Efficiency and Correctness -"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Implementation of Algorithms - Fundamental Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Exchanging the values of two"},{"number":2,"title":"variables, Counting, Summation of a set of numbers, Factorial computation,"},{"number":3,"title":"Generation of Fibonacci Sequence, Reversing the digits of an Integer, Base"},{"number":4,"title":"Conversion."}]}],"remarks":""},{"unit_id":"V","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Algorithm Development for simple mathematical problems"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Programming Languages","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Program Development Life Cycle, Program Design Tools,"},{"number":2,"title":"Algorithms, Flowcharts, Pseudocodes, Role of Algorithms, Programming Languages,"},{"number":3,"title":"Programming Paradigms Traditional Programming Concepts, Procedural Units,"},{"number":4,"title":"Language Implementation, Declarative Programming."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Flowchart design for simple mathematical problems"}]}],"remarks":""}]}$r2025_18_content$::jsonb,
	$r2025_18_books${"primary":[],"references":[{"title":"Thareja, R. (2020). Fundamentals of computers. Oxford University Press.","author":""},{"title":"Rajaraman, V., & Adabala, N. (2014). Fundamentals of computers. PHI Learning.","author":""},{"title":"Brookshear, J. G., & Brylow, D. (2015). Computer science: An overview. Pearson.","author":""},{"title":"Dromey, R. G. (1982). How to solve it by computer. Prentice Hall International.","author":""},{"title":"Marji, M. (2014). Learn to program with Scratch: A visual introduction to","author":""},{"title":"Riley, D. D., & Hunt, K. A. (2014). Computational thinking for the modern problem","author":""},{"title":"Venkatesh, G., & Mukund, M. (2021). Computational thinking. Notion Press.","author":""}]}$r2025_18_books$::jsonb,
	$r2025_18_web${"resources":[{"title":"scratched.gse.harvard.edu","url":"https://scratched.gse.harvard.edu/ct/files/AERA2012.pd"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=2WtPyqwTLKM"},{"title":"teachinglondoncomputing.org","url":"https://teachinglondoncomputing.org/resources/developing-computational-thinking/"},{"title":"teachinglondoncomputing.org","url":"https://teachinglondoncomputing.org/resources/developing-computational-thinking/"},{"title":"scratch.mit.edu","url":"https://scratch.mit.edu/"},{"title":"scratch.mit.edu","url":"https://scratch.mit.edu/"},{"title":"appinventor.mit.edu","url":"https://appinventor.mit.edu/"},{"title":"appinventor.mit.edu","url":"https://appinventor.mit.edu/"}]}$r2025_18_web$::jsonb,
	$r2025_18_ped${"methods":["Assignments (10%)","Quiz and gamification","Project based learning"]}$r2025_18_ped$::jsonb,
	$r2025_18_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO2":"3","PSO3":"1"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO2":"1","PSO3":"3"}}]}$r2025_18_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CS25C03 Essentials of Computing.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C04 | DATA STRUCTURES AND ALGORITHMS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C04'))
		LIMIT 1
	),
	'CS25C04', 'DATA STRUCTURES AND ALGORITHMS',
	$r2025_19_obj${"objectives":[{"number":1,"description":"To provide the fundamentals of data organization and algorithms."}]}$r2025_19_obj$::jsonb,
	$r2025_19_clos${"clos":[{"clo_number":1,"description":"Explain fundamental concepts of data\nstructures and Algorithms.","k_values":[]},{"clo_number":2,"description":"Implement the data structures in\ndifferent Applications.","k_values":[]},{"clo_number":3,"description":"Evaluate and compare different\nsearching and sorting algorithms","k_values":[]},{"clo_number":4,"description":"Demonstrate in continuous learning in\ninterdisciplinary projects involving AI,\nML, Data Science, or other technology\ndomains.","k_values":[]}]}$r2025_19_clos$::jsonb,
	$r2025_19_content${"units":[{"unit_id":"I","unit_title":"Data Types","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Abstract Data Types (ADTs), ADTs and classes, introduction to OOP,"},{"number":2,"title":"Classes in Python, Inheritance, Namespaces, Shallow and Deep Copying."},{"number":3,"title":"Practical: Implement simple ADTs as Python classes"}]}],"remarks":""},{"unit_id":"II","unit_title":"Linear Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"List ADT, array-based implementations, linked list"},{"number":2,"title":"implementations, singly linked lists, circularly linked lists, doubly linked lists, Stack"},{"number":3,"title":"ADT, Queue ADT, double ended queues, applications"},{"number":4,"title":"Practical: List ADT using Python arrays, Linked list, Stack and Queue ADTs and"},{"number":5,"title":"Applications."}]}],"remarks":""},{"unit_id":"III","unit_title":"Tree Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Tree ADT, Binary Tree ADT, tree traversals, binary search trees,"},{"number":2,"title":"AVL trees, heaps, multi-way search trees"},{"number":3,"title":"Practical: Tree representation and traversal algorithms, Binary Search Trees, Heaps."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Graph Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Graph ADT, representations of graph, graph traversals, DAG,"},{"number":2,"title":"topological ordering, greedy algorithms, dynamic programming, shortest paths,"},{"number":3,"title":"minimum spanning trees, introduction to complexity classes and intractability"},{"number":4,"title":"Practical: Graph representation and Traversal algorithms, Single source shortest"},{"number":5,"title":"path algorithm, Minimum spanning tree algorithms."}]}],"remarks":""},{"unit_id":"V","unit_title":"Algorithm","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Analysis of algorithms, Asymptotic notations, Divide & Conquer,"},{"number":2,"title":"Recursion, Recursive Algorithms"},{"number":3,"title":"Practical: Implement recursive algorithms in Python."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Sorting and Searching","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Bubble sort, Selection sort, Insertion sort, Merge sort, Quick sort, Analysis of sorting"},{"number":2,"title":"algorithms, Linear & Binary search, Hashing, Hash functions, Collision handling, Load"},{"number":3,"title":"factors, Rehashing, and Efficiency"},{"number":4,"title":"Practical: Sorting and searching algorithms, Hash tables."}]}],"remarks":""}]}$r2025_19_content$::jsonb,
	$r2025_19_books${"primary":[],"references":[{"title":"Goodrich, M. T., Tamassia, R., & Goldwasser, M. H. (2021). Data structures &","author":""},{"title":"Lee, K. D., & Hubbard, S. (2015). Data structures and algorithms with Python.","author":""},{"title":"Necaise, R. D. (2011). Data structures and algorithms using Python. John Wiley","author":""},{"title":"Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2002). Introduction to","author":""},{"title":"Weiss, M. A. (2014). Data structures and algorithm analysis in C++. Pearson","author":""}]}$r2025_19_books$::jsonb,
	$r2025_19_web${"resources":[]}$r2025_19_web$::jsonb,
	$r2025_19_ped${"methods":["Quiz and gamification","Assignments (30%) Review of GATE"]}$r2025_19_ped$::jsonb,
	$r2025_19_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"}},{"co_id":"CO3","pos":{"PO1":"3","PO2":"1"}},{"co_id":"CO4","pos":{"PO11":"1"}}]}$r2025_19_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CS25C04-DATA STRUCTURES AND ALGORITHMS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C05 | DATA STRUCTURES USING C++
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C05'))
		LIMIT 1
	),
	'CS25C05', 'DATA STRUCTURES USING C++',
	$r2025_20_obj${"objectives":[{"number":1,"description":"1. To explore advanced linear, tree, and graph data structures and their applications. 2. To design efficient algorithms using appropriate algorithmic paradigms. 3. To evaluate computational complexity and identify tractable vs. intractable problems."}]}$r2025_20_obj$::jsonb,
	$r2025_20_clos${"clos":[{"clo_number":1,"description":"Describe data structures and implement algorithmic\nsolutions for complex computational problems.\n-- --","k_values":[]},{"clo_number":2,"description":"Analyze the time complexity and efficiency of\nalgorithms for various computing problems.","k_values":[]},{"clo_number":3,"description":"Evaluate algorithmic techniques and data structures\nto determine their suitability for different\napplications.","k_values":[]},{"clo_number":4,"description":"Design optimized solutions for real-world problems\nusing appropriate algorithms and data structures.","k_values":[]}]}$r2025_20_clos$::jsonb,
	$r2025_20_content${"units":[{"unit_id":"I","unit_title":"Linear Data Structures and Memory Optimization","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Advanced arrays: Sparse arrays,"},{"number":2,"title":"dynamic arrays, cache-aware structures, Linked lists: Skip lists, unrolled linked lists, XOR"},{"number":3,"title":"linked lists, Stacks and Queues: Priority queues, double-ended queues, circular buffers,"}]}],"remarks":""},{"unit_id":"II","unit_title":"Hashing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Perfect hashing, cuckoo hashing, extendible hashing."},{"number":2,"title":"Practical: Implement skip lists and measure performance compared with balanced BST. •"},{"number":3,"title":"Practical: Experiment with cache-aware data structures and analyze memory utilization."}]}],"remarks":""},{"unit_id":"III","unit_title":"Advanced Tree Data Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Balanced Trees: AVL, Red-Black Trees, Splay Trees,"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Treaps, Multi-way Trees","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"B-Trees, B+ Trees, R-Trees, Segment Trees, Fenwick Trees, Suffix"},{"number":2,"title":"Trees and Tries for string processing, Applications in indexing, text retrieval, computational"},{"number":3,"title":"geometry."},{"number":4,"title":"Practical: Implement B+ tree for database indexing use-case."},{"number":5,"title":"Practical: Design a suffix tree-based algorithm for DNA sequence matching."}]}],"remarks":""},{"unit_id":"V","unit_title":"Graph Data Structures and Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Representation: Adjacency list/matrix, incidence"},{"number":2,"title":"matrix, compressed storage, Traversals: DFS, BFS with applications, Shortest Path"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Dijkstra, Bellman-Ford, Floyd-Warshall, Johnson’s algorithm, Minimum"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Spanning Trees","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Prim’s, Kruskal’s, Borůvka’s algorithm, Network Flow Algorithms:"},{"number":2,"title":"Ford-Fulkerson, Edmonds-Karp, Push-Relabel."},{"number":3,"title":"Practical: Implement Johnson’s algorithm for sparse graph shortest paths."},{"number":4,"title":"Practical: Demonstration of Maximum flow in traffic or network routing simulation."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Algorithm Design and Paradigms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Divide and Conquer: Karatsuba’s multiplication,"},{"number":2,"title":"Strassen’s algorithm, Greedy Methods: Huffman coding, interval scheduling, set cover"},{"number":3,"title":"approximation, Dynamic Programming: Matrix chain multiplication, Floyd-Warshall,"},{"number":4,"title":"knapsack variants, Backtracking and Branch-and-Bound, Randomized Algorithms and"},{"number":5,"title":"Probabilistic Analysis."},{"number":6,"title":"Practical: Implement Strassen’s algorithm and compare with naive matrix multiplication. •"},{"number":7,"title":"Practical: Develop a randomized algorithm for primality testing (Miller–Rabin)."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Computational Complexity and Approximation Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Complexity Classes: P, NP,"}]}],"remarks":""},{"unit_id":"X","unit_title":"NP-Complete, NP-Hard, Reductions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Polynomial-time reductions, Cook-Levin theorem"},{"number":2,"title":"(overview), Approximation Algorithms: Vertex cover, set cover, TSP, k-center problem,"}]}],"remarks":""},{"unit_id":"XI","unit_title":"Heuristic Algorithms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Local search, simulated annealing, genetic algorithms."},{"number":2,"title":"Practical: Implement approximation algorithm for vertex cover."},{"number":3,"title":"Practical: Complexity analysis of a chosen NP-hard problem and implement a heuristic."}]}],"remarks":""}]}$r2025_20_content$::jsonb,
	$r2025_20_books${"primary":[],"references":[{"title":"Cormen, T. H., Leiserson, C. E., Rivest, R. L., & Stein, C. (2009). Introduction to","author":""},{"title":"La Rocca, M. (2021). Advanced algorithms and data structures. Manning Publications.","author":""},{"title":"Goodrich, M. T., Tamassia, R., & Mount, D. M. (2011). Data structures and algorithms in","author":""},{"title":"Weiss, M. A. (2014). Data structures and algorithm analysis in C++. Pearson Education.","author":""},{"title":"Drozdek, A. (2013). Data structures and algorithms in C++. Cengage Publications.","author":""}]}$r2025_20_books$::jsonb,
	$r2025_20_web${"resources":[{"title":"theiotacademy.co","url":"https://www.theiotacademy.co/blog/data-structures-and-algorithms-in-c/"},{"title":"theiotacademy.co","url":"https://www.theiotacademy.co/blog/data-structures-and-algorithms-in-c/"},{"title":"github.com","url":"https://github.com/afrid18/Data_structures_and_algorithms_in_cpp"},{"title":"udemy.com","url":"https://www.udemy.com/course/introduction-to-algorithms-and-data-structures"}]}$r2025_20_web$::jsonb,
	$r2025_20_ped${"methods":["Assignments (15)","Quiz and gamification","Virtual Demo (20)","Flipped classroom"]}$r2025_20_ped$::jsonb,
	$r2025_20_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO3":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"1"},"psos":{"PSO1":"3"}}]}$r2025_20_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CP25C01 Advanced Data Structures and Algorithms .docx - Google Docs.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C06 | DIGITAL PRINCIPLES AND COMPUTER
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C06'))
		LIMIT 1
	),
	'CS25C06', 'DIGITAL PRINCIPLES AND COMPUTER',
	$r2025_21_obj${"objectives":[{"number":1,"description":"To impart knowledge on digital logic and provide functional concepts of computer systems with necessary illustrations."}]}$r2025_21_obj$::jsonb,
	$r2025_21_clos${"clos":[{"clo_number":1,"description":"Identify basic digital components and their functions in a\ncomputer system","k_values":[]},{"clo_number":2,"description":"Apply Boolean algebra and number systems to design\nsimple digital circuits and simulate them using tools","k_values":[]},{"clo_number":3,"description":"Analyze instruction sets, arithmetic units, and performance\nmetrics to evaluate processor design","k_values":[]},{"clo_number":4,"description":"Engage in continuous learning to update with\nadvancements through evolving computing trends.","k_values":[]}]}$r2025_21_clos$::jsonb,
	$r2025_21_content${"units":[{"unit_id":"I","unit_title":"Digital Logic","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Digital Systems, Integer Arithmetic, Addition and Subtraction of Signed"},{"number":2,"title":"Numbers, Boolean Algebra, Theorems and Postulates, Functions, Truth Table,"},{"number":3,"title":"Canonical and Standard Forms, Simplification using K-Maps, Digital Logic Gates,"},{"number":4,"title":"Universal gates, Implementation of Logic Gates, Integrated Circuits."},{"number":5,"title":"Activities:"},{"number":6,"title":"Assignment on Karnaugh Map."},{"number":7,"title":"Build logic circuits."},{"number":8,"title":"Virtual demonstration of logical gates."}]}],"remarks":""},{"unit_id":"II","unit_title":"Computer System","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Basic structure of a computer, Classes of Computer, Functional"},{"number":2,"title":"units - Interconnection of components, Von Neumann architecture and Harvard"},{"number":3,"title":"architecture - Instruction execution cycle, Performance metrics: MIPS, MFLOPS, CPI,"},{"number":4,"title":"throughput."},{"number":5,"title":"Activities:"},{"number":6,"title":"MIPS, MFLOPS, and CPI calculations."},{"number":7,"title":"Preparations of report on comparison of two CPU from different manufacturing."}]}],"remarks":""},{"unit_id":"III","unit_title":"Arithmetic and Logic Unit","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Combinational Circuits: Adders, Binary Adder, Binary"},{"number":2,"title":"Parallel Adder, Subtractor, Multiplexers, Decoders, Design of Fast Adder, Multiplication"},{"number":3,"title":"of Signed and Unsigned Numbers, Fast Multiplication - Integer Division, Floating Point"},{"number":4,"title":"Numbers and Operations, Booth’s algorithm for signed multiplication, Sequential"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Flip-Flops, Registers, Counters."},{"number":2,"title":"Activities:"},{"number":3,"title":"Virtual demonstration on Binary adder."},{"number":4,"title":"Build a parallel order."}]}],"remarks":""},{"unit_id":"V","unit_title":"Processing and Pipelining","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Instruction Set Architecture: RISC vs CISC, Addressing"},{"number":2,"title":"modes, Hardwired control and Micro programmed control unit, Concepts of Pipelining,"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Pipeline stages and Timing diagram, Hazards","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Structural, Data and Control Hazards,"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Instruction-level parallelism, Parallel processing concepts","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"SIMD, MIMD, Superscalar"},{"number":2,"title":"processors, Vector and Array Processor."},{"number":3,"title":"Activities:"},{"number":4,"title":"Comparison of RISC-V and x86 ISAs; present findings on their relevance to AI"},{"number":5,"title":"accelerators."},{"number":6,"title":"Spot and resolve different types of pipeline hazards in given scenarios."}]}],"remarks":""}]}$r2025_21_content$::jsonb,
	$r2025_21_books${"primary":[],"references":[{"title":"Mano, M. M., & Ciletti, M. D. (2018). Digital design: With an introduction to the Verilog","author":""},{"title":"Patterson, D. A., & Hennessy, J. L. (2012). Computer organization and design: The","author":""},{"title":"Stallings, W. (2015). Computer organization and architecture: Designing for","author":""}]}$r2025_21_books$::jsonb,
	$r2025_21_web${"resources":[]}$r2025_21_web$::jsonb,
	$r2025_21_ped${"methods":["Quiz and gamification","Assignments (10%)","Flipped classroom"]}$r2025_21_ped$::jsonb,
	$r2025_21_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO2":"3","PSO3":"1"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO3":"3"}}]}$r2025_21_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CS25C06_Digital Principles and Computer Organization.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C07 | OBJECT ORIENTED PROGRAMMING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C07'))
		LIMIT 1
	),
	'CS25C07', 'OBJECT ORIENTED PROGRAMMING',
	$r2025_22_obj${"objectives":[{"number":1,"description":"To impart the principles of object-oriented programming and their advantages over procedural programming."},{"number":2,"description":"To develop problem-solving skills by creating real-world applications using OOP features."}]}$r2025_22_obj$::jsonb,
	$r2025_22_clos${"clos":[{"clo_number":1,"description":"Understand the core OOP concepts and applications","k_values":[]},{"clo_number":2,"description":"Apply Object Oriented Paradigms to solve problems using\nC++","k_values":[]},{"clo_number":3,"description":"Design and Analyze solutions involving code reusability\nand complexity management","k_values":[]},{"clo_number":4,"description":"Demonstrate life-long learning skills through application\ndevelopment","k_values":[]}]}$r2025_22_clos$::jsonb,
	$r2025_22_content${"units":[{"unit_id":"I","unit_title":"Principles of Object-Oriented Programming","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Characteristics of object-oriented"},{"number":2,"title":"languages, C++ Program structure, Procedure Oriented Programming vs Object"},{"number":3,"title":"Oriented Programming, C++ constructs and syntax, tokens, variables, data-types, type"},{"number":4,"title":"conversion, operators, Expressions, Namespace, flow Control and decision, making"},{"number":5,"title":"statements."},{"number":6,"title":"Practical: 1. Simple programs to using Operators, and type conversion."},{"number":7,"title":"Practical: 2. Programs using Conditional and Loop statements and loops."}]}],"remarks":""},{"unit_id":"II","unit_title":"Classes and Objects","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Abstraction mechanism: Classes, Objects, member data,"},{"number":2,"title":"member functions - Constructors and types - destructors, inline function, friend"},{"number":3,"title":"function, array of objects, objects as function arguments - memory allocation for"},{"number":4,"title":"objects, static members static data and static function."},{"number":5,"title":"Practical: 1. Programs using in-line and friend functions."},{"number":6,"title":"Practical: 2. Programs using constructors and destructors"}]}],"remarks":""},{"unit_id":"III","unit_title":"Inheritance and Compile Time Polymorphism","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Inheritance: Derived Classes –"},{"number":2,"title":"Single inheritance – Multilevel Inheritance – Multiple Inheritance - Hierarchical"},{"number":3,"title":"inheritance – Hybrid inheritance. Operator Overloading: Compile time Polymorphism –"},{"number":4,"title":"Overloading Functions, Overloading Operators, Overloading Unary Operators –"},{"number":5,"title":"Overloading Binary Operators – Operator Overloading with Friend Functions."},{"number":6,"title":"Practical: 1. Programs for inheritance and its types."},{"number":7,"title":"Practical: 2. Programs using friend function and operator overloading."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Pointers and Runtime Polymorphism","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Pointers with arithmetic operations - this"},{"number":2,"title":"pointer – Pointers to Derived classes and Base classes - Compile time versus Runtime"},{"number":3,"title":"Polymorphism - Virtual functions - Late Binding - Abstract classes- Pure virtual"},{"number":4,"title":"functions and Virtual Destructors - Virtual base class."},{"number":5,"title":"Practical: 1. Programs for pointer manipulation."},{"number":6,"title":"Practical: 2. Programs for virtual functions."}]}],"remarks":""}]}$r2025_22_content$::jsonb,
	$r2025_22_books${"primary":[],"references":[{"title":"Deitel, P., & Deitel, H. (2024). C++ how to program: An objects-natural approach.","author":""},{"title":"Bronson, G. (2011). A first book of C++. Course Technology Inc.","author":""},{"title":"Balagurusamy, E. (2020). Object oriented programming with C++. McGraw Hill","author":""}]}$r2025_22_books$::jsonb,
	$r2025_22_web${"resources":[]}$r2025_22_web$::jsonb,
	$r2025_22_ped${"methods":["Quiz and gamification","Assignments (10%)","Flipped classroom"]}$r2025_22_ped$::jsonb,
	$r2025_22_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"1","PSO2":"3"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO3":"3"}}]}$r2025_22_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CS25C07 Object Oriented Programming.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CS25C08 | DATASTRUCTURES
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CS25C08'))
		LIMIT 1
	),
	'CS25C08', 'DATASTRUCTURES',
	$r2025_23_obj${"objectives":[{"number":1,"description":"This course presents various data structures and their importance to provide a comprehensive view about problem solving skills."}]}$r2025_23_obj$::jsonb,
	$r2025_23_clos${"clos":[{"clo_number":1,"description":"Describe the concepts and operations of data structures\nfor efficient data organization and manipulation.\n-- --","k_values":[]},{"clo_number":2,"description":"Analyze data structures to understand their performance\nand application suitability.","k_values":[]},{"clo_number":3,"description":"Evaluate data structure algorithms in terms of time and\nspace complexity for solving computational problems.","k_values":[]},{"clo_number":4,"description":"Design appropriate data structures and algorithms for\nreal-world problem scenarios.","k_values":[]},{"clo_number":5,"description":"Develop the ability to apply emerging data structures\nthrough continuous self-learning and practice.","k_values":[]}]}$r2025_23_clos$::jsonb,
	$r2025_23_content${"units":[{"unit_id":"I","unit_title":"Linear Data Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Abstract Data Types- Internal Representation of Primitive"},{"number":2,"title":"Data Structures- One Dimensional and Multi-Dimensional Arrays- linear lists- Singly,"},{"number":3,"title":"doubly, Circular linked lists- Applications"}]}],"remarks":""},{"unit_id":"II","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Single and Multidimensional arrays"},{"number":2,"title":"Singly, Doubly and Circular Linked Lists"}]}],"remarks":""},{"unit_id":"III","unit_title":"Stacks and Queues","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Stack: Representations – Operations – Implementations –"},{"number":2,"title":"Applications. Queue: Representations – Operations – Implementations – Types -"},{"number":3,"title":"Applications."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"String reverse operations and Expression evaluation"},{"number":2,"title":"Circular Queue and Priority Queue"},{"number":3,"title":"Trees"},{"number":4,"title":"Representations – Types – Binary Search Trees (BSTs) - AVL Tree – Operations:"},{"number":5,"title":"Search, Traversals, Rotations - Balanced BSTs- Splay trees- B-trees- Binary Heaps."}]}],"remarks":""},{"unit_id":"V","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Traversal operation"},{"number":2,"title":"AVL Tree rotations"},{"number":3,"title":"Query and Update operations on Balanced BSTs"},{"number":4,"title":"Sorting, Searching & Hashing Techniques:"},{"number":5,"title":"Linear and Binary Search - Bubble Sort - Insertion Sort- Merge Sort- Bucket Sort-"},{"number":6,"title":"Quick Sort- Heap sort- Hashing techniques- Dictionaries- Hash function- Collision -"},{"number":7,"title":"Separate chaining- open addressing"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Quick and Heap Sort"},{"number":2,"title":"Binary Search and Hashing"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Graphs","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Representation"},{"number":2,"title":"Types – Operations"},{"number":3,"title":"Prim’s, Kruskal algorithms"},{"number":4,"title":"Dijikstra’s algorithm"},{"number":5,"title":"– Connected and Biconnected Components"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"BFS and DFS algorithms"},{"number":2,"title":"Minimum Spanning Tree and shortest path algorithms"}]}],"remarks":""}]}$r2025_23_content$::jsonb,
	$r2025_23_books${"primary":[],"references":[{"title":"Gilberg, R. F., & Forouzan, B. A, “Data Structures: A Pseudocode Approach”,","author":""},{"title":"Mark Allen Weiss, “Data Structures and Algorithm Analysis in C++”, 4th Edition,","author":""},{"title":"Alfred V. Aho, John E. Hopcroft, Jeffrey D. Ullman, “Data Structures and","author":""},{"title":"D.S. Malik, Data Structures Using C++, 2nd Edition, Cengage, 2012.","author":""}]}$r2025_23_books$::jsonb,
	$r2025_23_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106102064"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105085"},{"title":"leetcode.com","url":"https://leetcode.com/"}]}$r2025_23_web$::jsonb,
	$r2025_23_ped${"methods":["Mandated Activities with marks:"]}$r2025_23_ped$::jsonb,
	$r2025_23_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO3":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"1"},"psos":{"PSO1":"3"}},{"co_id":"CO5","pos":{"PO11":"2"}}]}$r2025_23_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CS25C08 Data Structures.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CW25201 | COMPUTER ORGANIZATION AND ARCHITECTURE
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CW25201'))
		LIMIT 1
	),
	'CW25201', 'COMPUTER ORGANIZATION AND ARCHITECTURE',
	$r2025_24_obj${"objectives":[{"number":1,"description":"To introduce the fundamental components of digital computer systems."},{"number":2,"description":"To explain various Instruction Set Architecture (ISA) types and instruction execution processes."},{"number":3,"description":"To impart knowledge on system performance metrics and evaluation techniques."}]}$r2025_24_obj$::jsonb,
	$r2025_24_clos${"clos":[{"clo_number":1,"description":"Describe the functional units and instruction set\narchitectures of a computer system.","k_values":[]},{"clo_number":2,"description":"Apply knowledge of processor functionality to implement\nand analyze the internal operations of a computer\nsystem.","k_values":[]},{"clo_number":3,"description":"Design and analyze basic digital systems and control\nunits for efficient instruction execution","k_values":[]},{"clo_number":4,"description":"Recognize the importance of learning advancements to\nkeep up with evolving computer architecture","k_values":[]}]}$r2025_24_clos$::jsonb,
	$r2025_24_content${"units":[{"unit_id":"I","unit_title":"Introduction","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Functional Units of a Digital Computer, Classes of Computer Systems,"},{"number":2,"title":"Hardware-Software Interface, Operation and Operands of Computer Hardware,"},{"number":3,"title":"Instruction Set Architecture, RISC and CISC Architectures, Addressing Modes,"},{"number":4,"title":"Assembly Language Programming, Translation from High-Level Language to Machine"},{"number":5,"title":"Language, Performance Metrics, Benchmarks, Transition from Uniprocessors to"},{"number":6,"title":"Multiprocessors"},{"number":7,"title":"Activities:"},{"number":8,"title":"C code to machine code mapping."},{"number":9,"title":"Assembly of computer system components"}]}],"remarks":""},{"unit_id":"II","unit_title":"Arithmetic for Computers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Integer Arithmetic, Binary Parallel Adder, Carry"},{"number":2,"title":"Lookahead Adder, Carry Save Adder, Fast Adders, Binary Multiplication, Booth’s"},{"number":3,"title":"Algorithm, Bit Pair Recoding, Binary Division, Restoring and Non-Restoring Division,"},{"number":4,"title":"Floating Point Numbers (Single and Double Precision), Floating Point Representation,"},{"number":5,"title":"Arithmetic Operations on Floating Point Numbers, ALU Design, Parallelism and"},{"number":6,"title":"Computer Arithmetic."},{"number":7,"title":"Activities:"},{"number":8,"title":"Arithmetic Operations"},{"number":9,"title":"Restoring / non-restoring division"}]}],"remarks":""},{"unit_id":"III","unit_title":"Processor Design","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Design Conventions of a Processor, Datapath Design, Building"},{"number":2,"title":"the Datapath, Implementation of Basic MIPS ISA, Designing the Control Unit, Simple"},{"number":3,"title":"Implementation Scheme and Drawbacks, Execution of a Complete Instruction,"},{"number":4,"title":"Hardwired and Microprogrammed Control, Instruction Level Parallelism, Basic"},{"number":5,"title":"Concepts of Pipelining, Pipelined Datapath and Control, Performance, Pipeline"},{"number":6,"title":"Hazards – Structural, Data, and Control Hazards, Handling Exceptions."},{"number":7,"title":"Activities:"},{"number":8,"title":"CPU datapath analysis."},{"number":9,"title":"Pipeline hazard analysis."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Memory and I/O","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Types of Memories, Need for a Hierarchical Memory System, Cache"},{"number":2,"title":"Memories, Memory Mapping, Measuring and Improving Cache Performance, Virtual"},{"number":3,"title":"Memory, Paging and Segmentation, TLB, Implementing Protection with Virtual"},{"number":4,"title":"Memory, Memory Management Techniques, Associative Memories, Introduction to"},{"number":5,"title":"Virtual Machines, Memory and I/O Devices, Interfacing I/O Devices to the Processor,"},{"number":6,"title":"Memory and Operating System, Programmed Input/Output, Interrupts, Direct Memory"},{"number":7,"title":"Access"},{"number":8,"title":"(DMA), RAID."}]}],"remarks":""}]}$r2025_24_content$::jsonb,
	$r2025_24_books${"primary":[],"references":[{"title":"Stallings, W. (2016). Computer organization and architecture: Designing for","author":""},{"title":"Hennessy, J. L., & Patterson, D. A. (2019). Computer architecture: A quantitative","author":""},{"title":"Hayes, J. P. (2017). Computer organization and architecture. Tata McGraw Hill.","author":""},{"title":"Sarangi, S. R. (2023). Next-gen computer architecture. White Falcon Publishing.","author":""},{"title":"Patterson, D. A., & Hennessy, J. L. (2020). Computer organization and design: The","author":""},{"title":"Heuring, V. P., & Jordan, H. F. (2004). Computer systems design and architecture.","author":""}]}$r2025_24_books$::jsonb,
	$r2025_24_web${"resources":[]}$r2025_24_web$::jsonb,
	$r2025_24_ped${"methods":["Assignments (10%)","Quiz and gamification","Project based learning"]}$r2025_24_ped$::jsonb,
	$r2025_24_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"1","PSO2":"2"}},{"co_id":"CO4","pos":{"PO11":"3"},"psos":{"PSO3":"3"}}]}$r2025_24_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CW25201 Computer Organization and Architecture.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- IT25201 | FOUNDATIONSOFDATASCIENCEUSING PYTHON
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('IT25201'))
		LIMIT 1
	),
	'IT25201', 'FOUNDATIONSOFDATASCIENCEUSING PYTHON',
	$r2025_25_obj${"objectives":[{"number":1,"description":"To equip students with a strong foundational understanding of data science concepts."},{"number":2,"description":"To collect, clean, manipulate, and analyse data using Python libraries"},{"number":3,"description":"To perform data operations and derive insights from real-world datasets."}]}$r2025_25_obj$::jsonb,
	$r2025_25_clos${"clos":[{"clo_number":1,"description":"Develop simple programs in Python with built-in data\nstructures.","k_values":[]},{"clo_number":2,"description":"Apply NumPy and Pandas libraries to organize and\nmanipulate data efficiently.","k_values":[]},{"clo_number":3,"description":"Design and analyze solutions involving APIs, databases,\nand real-world datasets","k_values":[]},{"clo_number":4,"description":"Enhance life-long learning skills to explore new data\nscience tools and libraries beyond the classroom","k_values":[]}]}$r2025_25_clos$::jsonb,
	$r2025_25_content${"units":[{"unit_id":"I","unit_title":"Python Language Basics and Data Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Python Language Basics - Scalar"},{"number":2,"title":"Types - Control Flow. Data Structures and Sequences: Tuple - List - Built-in Sequence"},{"number":3,"title":"Functions - dict - set- List, Set, and Dict Comprehensions. Functions: Namespaces,"},{"number":4,"title":"Scope, and Local Functions - Returning Multiple Values - Functions Are Objects - Files"},{"number":5,"title":"and the Operating System."},{"number":6,"title":"Practical: 1. Programs using Data Frames"},{"number":7,"title":"Practical: 2. Programs using functions and files3."}]}],"remarks":""},{"unit_id":"II","unit_title":"Numpy Basics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"The NumPy ndarray: A Multidimensional Array Object"},{"number":2,"title":"Universal"}]}],"remarks":""},{"unit_id":"III","unit_title":"Functions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Fast Element-Wise Array Functions"},{"number":2,"title":"Array-Oriented Programming with"},{"number":3,"title":"Arrays - File Input and Output with Arrays - Linear Algebra - Pseudorandom Number"},{"number":4,"title":"Generation."},{"number":5,"title":"Practical: 1. Programs using numpy"},{"number":6,"title":"Practical: 2. Programs to solve linear algebra problems with numpy functions"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Pandas Basics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to pandas Data Structures –Loading and Understanding"},{"number":2,"title":"Data- Data aggregation for computing Descriptive Statistics- Data Cleaning and"},{"number":3,"title":"Preprocessing"},{"number":4,"title":"Practical: 1. Programs using numpy"},{"number":5,"title":"Practical: 2. Solving linear algebra problems"}]}],"remarks":""},{"unit_id":"V","unit_title":"Data Loading, Storage, and File Formats","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Reading and Writing Data in Text Format"},{"number":2,"title":"Binary Data Formats - Interacting with Web APIs - Interacting with Databases"},{"number":3,"title":"Practical: 1. Data and Databases"},{"number":4,"title":"Practical: 2. Web APIs"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Data Exploration","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Data Transformation - String Manipulation. Data Wrangling:"},{"number":2,"title":"Hierarchical Indexing - Combining and Merging Datasets - Reshaping and Pivoting."},{"number":3,"title":"Practical: 1. String manipulations"},{"number":4,"title":"Practical: 2. Data wrangling"}]}],"remarks":""}]}$r2025_25_content$::jsonb,
	$r2025_25_books${"primary":[],"references":[{"title":"McKinney, W. (2017). Python for data analysis: Data wrangling with pandas,","author":""},{"title":"Mukhiya, S. K., & Ahmed, U. (2020). Hands-on exploratory data analysis with","author":""},{"title":"VanderPlas, J. (2017). Python data science handbook: Essential tools for working","author":""},{"title":"Cielen, D., Meysman, A. D. B., & Ali, M. (2016). Introducing data science.","author":""},{"title":"Ward, M. O., Grinstein, G., & Keim, D. (2015). Interactive data visualization:","author":""}]}$r2025_25_books$::jsonb,
	$r2025_25_web${"resources":[]}$r2025_25_web$::jsonb,
	$r2025_25_ped${"methods":["Assignments (10%)","Quiz and gamification","Project based learning"]}$r2025_25_ped$::jsonb,
	$r2025_25_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2","PO3":"2"},"psos":{"PSO1":"1","PSO2":"3"}},{"co_id":"CO4","pos":{"PO11":"3"},"psos":{"PSO3":"3"}}]}$r2025_25_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: IT25201 Foundations of Data Science Using Python.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- IT25202 | DIGITALPRINCIPLESANDSYSTEM DESIGN
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('IT25202'))
		LIMIT 1
	),
	'IT25202', 'DIGITALPRINCIPLESANDSYSTEM DESIGN',
	$r2025_26_obj${"objectives":[{"number":1,"description":"To understand the basics of number systems and Boolean algebra."},{"number":2,"description":"To learn how to design and analyze combinational and sequential logic circuits."},{"number":3,"description":"To use hardware description languages (HDL) for implementing digital systems"}]}$r2025_26_obj$::jsonb,
	$r2025_26_clos${"clos":[{"clo_number":1,"description":"Identify number systems and basic logic gates.","k_values":[]},{"clo_number":2,"description":"Apply Boolean algebra and Karnaugh maps to simplify\nand\nimplement combinational logic circuits","k_values":[]},{"clo_number":3,"description":"Design and analyze digital systems with sequential\ncomponents using HDL and hardware tools","k_values":[]},{"clo_number":4,"description":"Explore modern tools and resources to keep learning\nabout digital system design","k_values":[]}]}$r2025_26_clos$::jsonb,
	$r2025_26_content${"units":[{"unit_id":"I","unit_title":"Boolean Algebra","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Number Systems, Binary, Octal, Hexadecimal, Representation of"},{"number":2,"title":"negative numbers, 1’s and 2’s Complements, Arithmetic Operations, Binary Codes."},{"number":3,"title":"Boolean Algebra, Theorems and Postulates, Functions, Truth Table, Logic Gates,"},{"number":4,"title":"Universal gates"},{"number":5,"title":"Practical: 1. Simple functions using gates"},{"number":6,"title":"Practical: 2. implementation of Boolean functions"}]}],"remarks":""},{"unit_id":"II","unit_title":"Canonical Functions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Canonical and Standard Forms, Minterms and Maxterms, Sum of"},{"number":2,"title":"Products and Product of Sums, Conversions and Expansion."},{"number":3,"title":"Practical: Simplification and expansion of standard Boolean functions"}]}],"remarks":""},{"unit_id":"III","unit_title":"Karnaugh Map and Combinational Logic","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Simplification of Boolean Functions,"},{"number":2,"title":"Karnaugh Map, 2,3,4 variables, NAND / NOR Implementations, Combinational Circuits,"},{"number":3,"title":"Arithmetic Circuits, Half and Full Adders, Subtractors. Introduction to HDL"},{"number":4,"title":"Practical: 1. Implementation of combinational circuits using gates for arbitrary functions."},{"number":5,"title":"Practical: 2. Implementation of Arithmetic circuits and extended operations."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Combinational Logic Design","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Binary Parallel adder, Carry Look-ahead Adder, BCD"},{"number":2,"title":"Adder, Binary multiplier, Magnitude Comparator, Code Converters, Decoder, Encoder,"},{"number":3,"title":"Priority Encoder, Mux/Demux, Applications, Introduction to HDL and HDL for these"},{"number":4,"title":"circuits"},{"number":5,"title":"Practical: 1. Combinational circuits using code converters."},{"number":6,"title":"Practical: 2. BCD adder, encoder and decoder circuits."}]}],"remarks":""},{"unit_id":"V","unit_title":"Sequential Logic Design","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"R – S Latch, D Latch, Flip flops, SR, JK, T, D, Master /Slave"},{"number":2,"title":"Flip Flop, Flip flop excitation tables, Analysis of clocked sequential circuits, Moore /Mealy"},{"number":3,"title":"models, Registers, Shift Registers, Universal Shift Register. Counters, Asynchronous"},{"number":4,"title":"Ripple Counters, Synchronous Counters- Ring Counter, Johnson Counter,"},{"number":5,"title":"Practical: Design of a digital circuit for solving practical problems."}]}],"remarks":""}]}$r2025_26_content$::jsonb,
	$r2025_26_books${"primary":[],"references":[{"title":"Mano, M. M., & Ciletti, M. D. (2018). Digital design. Pearson Education.","author":""},{"title":"Roth, C. H., Jr. (2003). Fundamentals of logic design. Jaico Publishing House.","author":""},{"title":"Wakerly, J. F. (2007). Digital design principles and practices. Pearson Education.","author":""},{"title":"Givone, D. D. (2003). Digital principles and design. Tata McGraw-Hill.","author":""},{"title":"Kharate, G. K. (2010). Digital electronics. Oxford University Press.","author":""}]}$r2025_26_books$::jsonb,
	$r2025_26_web${"resources":[]}$r2025_26_web$::jsonb,
	$r2025_26_ped${"methods":["Assignments (10%)","Quiz and gamification","Project based learning"]}$r2025_26_ped$::jsonb,
	$r2025_26_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"1"},"psos":{"PSO1":"1","PSO2":"2"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO3":"3"}}]}$r2025_26_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: IT25202 Digital Principles and System Design.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- IT25301 | WEBTECHNOLOGIES
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'b6c507f8-6f01-4111-b9c3-577037229286'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '161f61e7-eb65-47ff-9673-61d48afecec3'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('IT25301'))
		LIMIT 1
	),
	'IT25301', 'WEBTECHNOLOGIES',
	$r2025_27_obj${"objectives":[{"number":1,"description":"The objective of this course is to illustrate how the Internet works and how it is used in the real world. Students will learn to make web pages interactive using HTML, CSS, and JavaScript and build dynamic websites using both client-side and server-side tools."}]}$r2025_27_obj$::jsonb,
	$r2025_27_clos${"clos":[{"clo_number":1,"description":"Describe the fundamental concepts of web technologies\nused in developing modern web applications.","k_values":[]},{"clo_number":2,"description":"Analyze web technologies, to understand performance,\nand interoperability in web-based systems.","k_values":[]},{"clo_number":3,"description":"Evaluate web development approaches to assess\neffectiveness in building scalable and secure web\napplications.","k_values":[]},{"clo_number":4,"description":"Design web-based applications with\nappropriate technologies and frameworks for real-world\ndeployment.","k_values":[]},{"clo_number":5,"description":"Engage in continuous learning to keep pace with\nevolving industry practices for professional development.","k_values":[]}]}$r2025_27_clos$::jsonb,
	$r2025_27_content${"units":[{"unit_id":"I","unit_title":"Introduction","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"World wide web and its evolution"},{"number":2,"title":"E-mail, Telnet, FTP, E–commerce, Cloud"},{"number":3,"title":"Computing, Video conferencing - Internet service providers, IP Address, URL, Domain Name"},{"number":4,"title":"Servers - Web Browsers, Search Engine -Web Server vs Application Server."}]}],"remarks":""},{"unit_id":"II","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Use Telnet to connect to a remote host and execute simple commands."},{"number":2,"title":"Set up a Web Server and demonstrate serving static content."}]}],"remarks":""},{"unit_id":"III","unit_title":"HTML 5","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"HTML Tags, Structure, HTML Coding Conventions"},{"number":2,"title":"Block Elements, Text"},{"number":3,"title":"Elements, Code Related Elements, Character References - Lists, Images, section, article,"},{"number":4,"title":"and aside Elements - nav and a Elements - header and footer Elements-Audio & Video"},{"number":5,"title":"Support-HTML Forms & Controls - Document Object Model (DOM)"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Creation of registration or feedback form using form controls."},{"number":2,"title":"Development of personal portfolio website."},{"number":3,"title":"Cascading Style Sheets (CSS) and Responsive Web Design"},{"number":4,"title":"CSS Rules, Syntax and Style - Class Selectors, ID Selectors, span and div Elements -"},{"number":5,"title":"Cascading, style Attribute, style Container, External CSS Files - CSS Properties- - UI"},{"number":6,"title":"Scripting-Bootstrap, Bootstrap Grid System, Grid Classes, Basic Structure of a Bootstrap"},{"number":7,"title":"Grid, Typography, Components, Forms, Inputs, Bootstrap Themes, Templates Bootstrap"},{"number":8,"title":"Themes, Templates"}]}],"remarks":""},{"unit_id":"V","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"CSS Styling Methods."},{"number":2,"title":"Responsive website Design."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Client-Side Scripting and Modern Javascript","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Buttons, Functions, Variables, Identifiers"},{"number":2,"title":"Assignment Statements and Objects"},{"number":3,"title":"Document"},{"number":4,"title":"Object Model, Forms - reset and focus Methods – Event Handler Attributes- External"},{"number":5,"title":"JavaScript Files-Manipulating CSS with JavaScript- Using z-index to Stack"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Elements-Textarea Controls - Pull-Down Menus- JSON","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"JavaScript Object Notation (JSON) –"},{"number":2,"title":"jQuery."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Practicals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Perform Client-side validation and Event handling."},{"number":2,"title":"Create an interactive To-Do List application."}]}],"remarks":""}]}$r2025_27_content$::jsonb,
	$r2025_27_books${"primary":[],"references":[{"title":"Paul Deitel, Harvey Deitel, Abbey Deitel, Internet and World Wide Web, 5e, Pearson,","author":""},{"title":"Juha Hinkula, Full Stack Development with Spring Boot 3 and React, Packt, 2023.","author":""},{"title":"Frank Zammetti, Modern Full-Stack Development, Apress, 2023.","author":""}]}$r2025_27_books$::jsonb,
	$r2025_27_web${"resources":[]}$r2025_27_web$::jsonb,
	$r2025_27_ped${"methods":["Mandated Activities with marks:"]}$r2025_27_ped$::jsonb,
	$r2025_27_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO3":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"1"},"psos":{"PSO1":"3"}},{"co_id":"CO5","pos":{"PO11":"2"}}]}$r2025_27_po$::jsonb,
	'79ff83d0-f9d1-4a28-97f5-e7ea8de7c7df'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: IT25301 Web Technologies.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C01 | ELECTRON DEVICES
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C01'))
		LIMIT 1
	),
	'EC25C01', 'ELECTRON DEVICES',
	$r2025_28_obj${"objectives":[{"number":1,"description":"The course introduces students to the physical principles and operational characteristics of electronic devices such as diodes, BJTs, and FETs. Through laboratory-integrated lectures, students will apply these concepts in designing and analyzing rectifiers, amplifiers, and switching circuits. The course emphasizes problem-solving and hands-on skills needed for analog circuit implementation."}]}$r2025_28_obj$::jsonb,
	$r2025_28_clos${"clos":[{"clo_number":1,"description":"Explain semiconductor physics and analyze the\ncharacteristics of diodes and their applications.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze and design BJT-based circuits including\nbiasing and single-stage amplifiers.","k_values":[]},{"clo_number":3,"description":"Analyze FET characteristics and design amplifier and\nswitching circuits using JFET and MOSFET.","k_values":[]},{"clo_number":4,"description":"Evaluate frequency response and design power\namplifiers for various applications.","k_values":[]},{"clo_number":5,"description":"Apply feedback concepts and design oscillators and\nelectronic circuits for practical implementations.","k_values":[]}]}$r2025_28_clos$::jsonb,
	$r2025_28_content${"units":[{"unit_id":"I","unit_title":"Semiconductor Physics and Diodes","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Energy bands, carrier generation and"},{"number":2,"title":"recombination, drift and diffusion currents. PN junction operation, ideal and real diode"},{"number":3,"title":"characteristics. Diode Applications: Rectifiers, clippers, clampers, and voltage"},{"number":4,"title":"regulators."}]}],"remarks":""},{"unit_id":"II","unit_title":"Bipolar Junction Transistors (BJTS)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Structure and modes of operation: Active,"},{"number":2,"title":"Cutoff, Saturation. BJT biasing techniques and stability analysis. Small signal analysis"},{"number":3,"title":"and single-stage amplifier design."}]}],"remarks":""},{"unit_id":"III","unit_title":"Field Effect Transistors (FETs)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"JFET and MOSFET structures, characteristics and"},{"number":2,"title":"parameters. FET biasing methods and analog switching applications. Common"},{"number":3,"title":"source amplifier design and multistage configurations."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Frequency Response and Power Amplifiers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Frequency response of amplifiers:"},{"number":2,"title":"low, mid, and high frequency. Decibel gain, Bode plots, gain-bandwidth trade-"},{"number":3,"title":"off.Power amplifiers: Class A, B, AB, C – operation and efficiency."}]}],"remarks":""},{"unit_id":"V","unit_title":"Feedback Amplifiers and Oscillators","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Positive and negative feedback, feedback"},{"number":2,"title":"topologies, gain enhancement. Oscillators – Colpitts, Hartley, Crystal – design and"},{"number":3,"title":"analysis."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Task 1","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Semiconductor Energy Band Analysis"},{"number":2,"title":"Explain:"},{"number":3,"title":"o Conduction band"},{"number":4,"title":"o Valence band"},{"number":5,"title":"o Forbidden energy gap"},{"number":6,"title":"Compare:"},{"number":7,"title":"o Conductors"},{"number":8,"title":"o Semiconductors"},{"number":9,"title":"o Insulators"}]}],"remarks":""},{"unit_id":"VII","unit_title":"T2","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Design and analyze:"},{"number":2,"title":"Half-wave rectifier"},{"number":3,"title":"Full-wave rectifier"},{"number":4,"title":"Bridge rectifier"},{"number":5,"title":"T3: Design:"},{"number":6,"title":"o Positive clipper"},{"number":7,"title":"o Negative clipper"}]}],"remarks":""}]}$r2025_28_content$::jsonb,
	$r2025_28_books${"primary":[],"references":[{"title":"Salivahanan, S., & Suresh Kumar, N. (2023). Electronic devices and circuits","author":""},{"title":"Bell, D. A. (2008). Electronic devices and circuits (5th ed.). Oxford University","author":""},{"title":"Mehta, V. K., & Mehta, R. (2020). Principles of electronics (12th ed.). S.","author":""},{"title":"Boylestad, R. L., & Nashelsky, L. (2012). Electronic devices and circuit theory","author":""},{"title":"Donal Neamen (2006). Electronic circuits: Analysis and design (3rd ed.). Tata","author":""}]}$r2025_28_books$::jsonb,
	$r2025_28_web${"resources":[{"title":"be-iitkgp.vlabs.ac.in","url":"https://be-iitkgp.vlabs.ac.in/"},{"title":"nptel.ac.in","url":"http://nptel.ac.in/courses/117103063/"}]}$r2025_28_web$::jsonb,
	$r2025_28_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_28_ped$::jsonb,
	$r2025_28_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO5","pos":{},"psos":{"PSO2":"3"}}]}$r2025_28_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C05-ELECTRONIC DEVICES AND CIRCUITS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C02 | CIRCUITS AND NETWORK ANALYSIS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C02'))
		LIMIT 1
	),
	'EC25C02', 'CIRCUITS AND NETWORK ANALYSIS',
	$r2025_29_obj${"objectives":[{"number":1,"description":"Covers diode, BJT, and MOSFET circuits for designing amplifiers, feedback systems, and waveform generators using simulation and application-based problem solving. Diode and Filter Circuits: Diode circuits - clipper, clamper, voltage doubler, voltage quadrupler, half-wave rectifier, centre-tapped full-wave rectifier, and bridge rectifier circuits. Power supply design. Regulators – Voltage regulator circuits using Zener diode. Passive filters – analysis of RC, RL, RLC filters. BJT Circuits: Load-line analysis, different biasing techniques of BJT, bias stabilization, and early effect, RC-coupled and transformer-coupled multistage amplifiers, and current mirror circuits. MOSFET Circuits: Biasing by fixing VGS, biasing by fixing VG, and connecting a resistor in the source, Biasing using a drain-to-gate feedback resistor, and biasing using a current source. Analysis and design of common source, common drain, common gate amplifier configurations. Frequency Response of Amplifiers: Frequency response of amplifiers – Low frequency response of BJT and FET amplifiers, lower cut off frequency - hybrid π equivalent circuit of BJT - high frequency response of BJT amplifiers –upper cut off frequency – transition frequency - Miller effect, high frequency response of FET amplifiers. Wide band amplifiers - Wide banding techniques – CC–CE /CD-CS cascade, cascode amplifier, Darlington pair. Feedback Amplifiers and Waveform Generators: Feedback and stability- negative and positive feedback in amplifiers, analysis of four feedback topologies, loop gain. Oscillators - Barkhausen criterion, effect of feedback on amplifier poles, Bode plots, gain and phase margins; positive feedback and sinusoidal oscillators using BJT - Wein bridge oscillator, RC phase shift oscillator, Hartley and Colpitts oscillators. Multivibrators using BJT – Astable, Monostable, and bistable circuits. Power Amplifiers and Wideband Techniques: Power amplifiers –Analysis of Class A, B, AB, C, D & S power amplifiers, Conversion efficiency and relative performance, Total Harmonic Distortion (THD), Relationship Between Total Power and THD, Heat sinks."}]}$r2025_29_obj$::jsonb,
	$r2025_29_clos${"clos":[{"clo_number":1,"description":"Define and explain diode circuits, BJT and MOSFET\ncircuits, amplifier characteristics, feedback, oscillators,\nand power amplifiers.\n- -","k_values":[]},{"clo_number":2,"description":"Apply circuit analysis techniques to design and solve\nproblems involving rectifiers, filters, biasing circuits,\namplifiers, and oscillators","k_values":[]},{"clo_number":3,"description":"Analyze frequency response, feedback mechanisms,\nstability, and performance parameters of electronic\ncircuits using appropriate models and methods.","k_values":[]},{"clo_number":4,"description":"Design and develop analog circuits and adapt to modern\ntools and emerging technologies for real-world\napplications.","k_values":[]}]}$r2025_29_clos$::jsonb,
	$r2025_29_content${"units":[{"unit_id":"I","unit_title":"Suggested activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Quiz, problem-solving assignments, circuit simulation using"},{"number":2,"title":"SPICE tools."}]}],"remarks":""}]}$r2025_29_content$::jsonb,
	$r2025_29_books${"primary":[],"references":[{"title":"Sedra, A. S., & Smith, K. C. (2020). Microelectronic circuits (8th ed.). Oxford","author":""},{"title":"Neamen, D. A. (2021). Microelectronics: Circuit analysis and design (5th ed.).","author":""},{"title":"Razavi, B. (2016). Fundamentals of microelectronics (2nd ed.). Wiley.","author":""},{"title":"Bell, D. A. (2008). Electronic devices and circuits (5th ed.). Oxford University","author":""},{"title":"Boylestad, R. L., & Nashelsky, L. (2021). Electronic devices and circuit theory.","author":""}]}$r2025_29_books$::jsonb,
	$r2025_29_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"}]}$r2025_29_web$::jsonb,
	$r2025_29_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_29_ped$::jsonb,
	$r2025_29_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{}},{"co_id":"CO4","pos":{}}]}$r2025_29_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C05- Electronic Circuits and Analysis.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C03 | DEVICES AND CIRCUITS LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C03'))
		LIMIT 1
	),
	'EC25C03', 'DEVICES AND CIRCUITS LABORATORY',
	$r2025_30_obj${"objectives":[{"number":1,"description":"The course introduces students to the physical principles and operational characteristics of electronic devices such as diodes, BJTs, and FETs. Through laboratory-integrated lectures, students will apply these concepts in designing and analyzing rectifiers, amplifiers, and switching circuits. The course emphasizes problem-solving and hands-on skills needed for analog circuit implementation."}]}$r2025_30_obj$::jsonb,
	$r2025_30_clos${"clos":[{"clo_number":1,"description":"Explain semiconductor physics and analyze the\ncharacteristics of diodes and their applications.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze and design BJT-based circuits including\nbiasing and single-stage amplifiers.","k_values":[]},{"clo_number":3,"description":"Analyze FET characteristics and design amplifier and\nswitching circuits using JFET and MOSFET.","k_values":[]},{"clo_number":4,"description":"Evaluate frequency response and design power\namplifiers for various applications.","k_values":[]},{"clo_number":5,"description":"Apply feedback concepts and design oscillators and\nelectronic circuits for practical implementations.","k_values":[]}]}$r2025_30_clos$::jsonb,
	$r2025_30_content${"units":[{"unit_id":"I","unit_title":"Semiconductor Physics and Diodes","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Energy bands, carrier generation and"},{"number":2,"title":"recombination, drift and diffusion currents. PN junction operation, ideal and real diode"},{"number":3,"title":"characteristics. Diode Applications: Rectifiers, clippers, clampers, and voltage"},{"number":4,"title":"regulators."}]}],"remarks":""},{"unit_id":"II","unit_title":"Bipolar Junction Transistors (BJTS)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Structure and modes of operation: Active,"},{"number":2,"title":"Cutoff, Saturation. BJT biasing techniques and stability analysis. Small signal analysis"},{"number":3,"title":"and single-stage amplifier design."}]}],"remarks":""},{"unit_id":"III","unit_title":"Field Effect Transistors (FETs)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"JFET and MOSFET structures, characteristics and"},{"number":2,"title":"parameters. FET biasing methods and analog switching applications. Common"},{"number":3,"title":"source amplifier design and multistage configurations."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Frequency Response and Power Amplifiers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Frequency response of amplifiers:"},{"number":2,"title":"low, mid, and high frequency. Decibel gain, Bode plots, gain-bandwidth trade-"},{"number":3,"title":"off.Power amplifiers: Class A, B, AB, C – operation and efficiency."}]}],"remarks":""},{"unit_id":"V","unit_title":"Feedback Amplifiers and Oscillators","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Positive and negative feedback, feedback"},{"number":2,"title":"topologies, gain enhancement. Oscillators – Colpitts, Hartley, Crystal – design and"},{"number":3,"title":"analysis."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Task 1","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Semiconductor Energy Band Analysis"},{"number":2,"title":"Explain:"},{"number":3,"title":"o Conduction band"},{"number":4,"title":"o Valence band"},{"number":5,"title":"o Forbidden energy gap"},{"number":6,"title":"Compare:"},{"number":7,"title":"o Conductors"},{"number":8,"title":"o Semiconductors"},{"number":9,"title":"o Insulators"}]}],"remarks":""},{"unit_id":"VII","unit_title":"T2","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Design and analyze:"},{"number":2,"title":"Half-wave rectifier"},{"number":3,"title":"Full-wave rectifier"},{"number":4,"title":"Bridge rectifier"},{"number":5,"title":"T3: Design:"},{"number":6,"title":"o Positive clipper"},{"number":7,"title":"o Negative clipper"}]}],"remarks":""}]}$r2025_30_content$::jsonb,
	$r2025_30_books${"primary":[],"references":[{"title":"Salivahanan, S., & Suresh Kumar, N. (2023). Electronic devices and circuits","author":""},{"title":"Bell, D. A. (2008). Electronic devices and circuits (5th ed.). Oxford University","author":""},{"title":"Mehta, V. K., & Mehta, R. (2020). Principles of electronics (12th ed.). S.","author":""},{"title":"Boylestad, R. L., & Nashelsky, L. (2012). Electronic devices and circuit theory","author":""},{"title":"Donal Neamen (2006). Electronic circuits: Analysis and design (3rd ed.). Tata","author":""}]}$r2025_30_books$::jsonb,
	$r2025_30_web${"resources":[{"title":"be-iitkgp.vlabs.ac.in","url":"https://be-iitkgp.vlabs.ac.in/"},{"title":"nptel.ac.in","url":"http://nptel.ac.in/courses/117103063/"}]}$r2025_30_web$::jsonb,
	$r2025_30_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_30_ped$::jsonb,
	$r2025_30_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO5","pos":{},"psos":{"PSO2":"3"}}]}$r2025_30_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C05-ELECTRONIC DEVICES AND CIRCUITS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C17 | EMBEDDED SYSTEMS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C17'))
		LIMIT 1
	),
	'EC25C17', 'EMBEDDED SYSTEMS',
	$r2025_31_obj${"objectives":[{"number":1,"description":"This course introduces students to embedded system architecture, microcontrollers, and real-time operating systems. Students learn programming in C and Python, peripheral interfacing, and communication protocols to design and implement embedded applications for real-world automation systems."}]}$r2025_31_obj$::jsonb,
	$r2025_31_clos${"clos":[{"clo_number":1,"description":"Explain the architecture, components,\nprogramming, and communication protocols of\nembedded systems.\n— —","k_values":[]},{"clo_number":2,"description":"Apply embedded C/Python programming and\nperipheral interfacing techniques to implement\nembedded applications.","k_values":[]},{"clo_number":3,"description":"Analyze embedded systems for performance,\ntask scheduling, and peripheral\ncommunication using real-time operating\nsystems.","k_values":[]},{"clo_number":4,"description":"Evaluate efficiency, reliability, and suitability of\nembedded systems, communication protocols,\nand RTOS-based solutions.","k_values":[]}]}$r2025_31_clos$::jsonb,
	$r2025_31_content${"units":[{"unit_id":"I","unit_title":"Embedded Hardware Architecture","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"CISC Architecture: Introduction to MCS51"},{"number":2,"title":"Family, 8051 Microcontroller – Architecture, Timers, Interrupts, Serial Data"},{"number":3,"title":"Communication."}]}],"remarks":""},{"unit_id":"II","unit_title":"RISC Architecture","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Overview of PIC16F487x family, PIC16F877A – Architecture,"},{"number":2,"title":"Timers, Interrupts, Serial ports."},{"number":3,"title":"Activity: Simulate and compare basic programs (timers/interrupts) on 8051 and PIC"},{"number":4,"title":"microcontrollers."}]}],"remarks":""},{"unit_id":"III","unit_title":"Arm And Embedded Software Development Tools","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to ARM –"},{"number":2,"title":"LPC4088 Architecture. Software Development Tools: IDE Tools, ISP Tools, ARM"},{"number":3,"title":"Development Tools."},{"number":4,"title":"Activity: Develop and debug a simple embedded application using an ARM-based"},{"number":5,"title":"IDE and development tools."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Wired Communication Interfaces","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Wired Communication Protocols: Serial –"},{"number":2,"title":"RS232, RS485, I2C, SPI, USB; Parallel – IEEE 488."},{"number":3,"title":"Activity: Implement serial communication (UART/I2C/SPI) between a"},{"number":4,"title":"microcontroller and an external device."}]}],"remarks":""},{"unit_id":"V","unit_title":"Wireless Communication Interfaces","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Wireless Communication Protocols:"},{"number":2,"title":"Bluetooth Classic, BLE, IEEE 802.15.4, Zigbee, IEEE 802.11, LoRaWAN."},{"number":3,"title":"Activity: Demonstrate wireless data transmission using a module (e.g.,"},{"number":4,"title":"Bluetooth/Zigbee/Wi-Fi)."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Real-Time Operating System","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Operating System Basics: The Kernel and its"},{"number":2,"title":"subsystems, Kernel Space and User Space. Types and Functions of RTOS: Task,"},{"number":3,"title":"Process and Threads, Interrupt Handling, Multiprocessing and Multitasking, Task"},{"number":4,"title":"Scheduling. Comparative study of various RTOSs."},{"number":5,"title":"Activity: Simulate task scheduling and interrupt handling using an RTOS"},{"number":6,"title":"environment."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Embedded Programming and Peripheral Interfacing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Embedded C and Python"},{"number":2,"title":"Programming for Embedded Applications. Peripheral Interfacing: Input and Output"},{"number":3,"title":"Devices, ADC, DAC, PWM Generation, Sensor Interface."},{"number":4,"title":"Activity: Develop an embedded application interfacing sensors/actuators using open"},{"number":5,"title":"source tool."}]}],"remarks":""}]}$r2025_31_content$::jsonb,
	$r2025_31_books${"primary":[],"references":[{"title":"Raj Kamal, Embedded Systems: Architecture, Programming and Design, 3rd","author":""},{"title":"James K. Peckol, Embedded Systems: A Contemporary Design Tool, 2nd","author":""},{"title":"Tammy Noergaard, Embedded Systems Architecture: A Comprehensive Guide","author":""},{"title":"Han-Way Huang, Embedded System Design Using C8051, 1st Edition, Cengage","author":""},{"title":"Rajib Mall, Real-Time Systems: Theory and Practice, 2nd Edition, Pearson","author":""},{"title":"Shibu K. V., Introduction to Embedded Systems, 3rd Edition, McGraw Hill","author":""}]}$r2025_31_books$::jsonb,
	$r2025_31_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108105057"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108105057"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105193"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105193"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105172"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105172"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105193"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105193"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105159"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106105159"}]}$r2025_31_web$::jsonb,
	$r2025_31_ped${"methods":["Quiz and gamification","Assignments (25%)","Review of GATE/ESE"]}$r2025_31_ped$::jsonb,
	$r2025_31_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO5":"2"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO1":"2","PO3":"2","PO5":"2"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO4","pos":{"PO1":"2","PO2":"2","PO5":"2"},"psos":{"PSO1":"2","PSO2":"2","PSO3":"2"}}]}$r2025_31_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: Embedded Systems.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25C05 | RE-ENGINEERING FOR INNOVATION
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25C05'))
		LIMIT 1
	),
	'ME25C05', 'RE-ENGINEERING FOR INNOVATION',
	$r2025_32_obj${"objectives":[{"number":1,"description":"To cultivate foundational skills in prototyping, and automation for development of prototypes with real-world applications."},{"number":2,"description":"To provide a comprehensive, hands-on exposure to product development through reverse engineering concepts."}]}$r2025_32_obj$::jsonb,
	$r2025_32_clos${"clos":[{"clo_number":1,"description":"Understand the product development lifecycle,\nincluding stages such as concept generation,\ndesign, prototyping, and testing.","k_values":[]},{"clo_number":2,"description":"Apply reverse engineering techniques to analyze\nand document existing products.","k_values":[]},{"clo_number":3,"description":"Collaborate in teams to fabricate prototypes using\nappropriate tools.","k_values":[]},{"clo_number":4,"description":"Engage in independent learning and continuously\nadapt to emerging technologies in product design","k_values":[]}]}$r2025_32_clos$::jsonb,
	$r2025_32_content${"units":[{"unit_id":"I","unit_title":"Bootcamp 1","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to Product Development, Reverse Engineering,"},{"number":2,"title":"Overview of the product lifecycle, Hands-on disassembly of simple products,"},{"number":3,"title":"Practice of basic measurements and sketching, Introduction to CAD modeling of"},{"number":4,"title":"disassembled parts, Virtual assembly of parts."}]}],"remarks":""},{"unit_id":"II","unit_title":"Bootcamp 2","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Embedded System Programming (Open-source platforms), Practice"},{"number":2,"title":"of interfacing sensors, reading data, automation in home, healthcare and"},{"number":3,"title":"agriculture."}]}],"remarks":""},{"unit_id":"III","unit_title":"Reverse Engineering","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Sketch and prototype alternative designs, Group"},{"number":2,"title":"brainstorming sessions, Manufacture prototype parts using 3D printing and / or"},{"number":3,"title":"workshop tools, Assemble prototype product."}]}],"remarks":""}]}$r2025_32_content$::jsonb,
	$r2025_32_books${"primary":[],"references":[{"title":"Wang, W. (2010). Reverse engineering: Mechanisms, structures, systems &","author":""},{"title":"Margolis, M. (2020). Arduino cookbook: Recipes to begin, expand, and enhance","author":""}]}$r2025_32_books$::jsonb,
	$r2025_32_web${"resources":[{"title":"grabcad.com","url":"https://grabcad.com/"},{"title":"grabcad.com","url":"https://grabcad.com/"},{"title":"github.com","url":"https://github.com/"},{"title":"github.com","url":"https://github.com/"}]}$r2025_32_web$::jsonb,
	$r2025_32_ped${"methods":["Project (30%)","Assignment (10%)","Practical (30%)"]}$r2025_32_ped$::jsonb,
	$r2025_32_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3","PO2":"2"},"psos":{"PSO1":"2"}},{"co_id":"CO3","pos":{"PO5":"2","PO8":"1","PO9":"1"},"psos":{"PSO3":"3"}},{"co_id":"CO4","pos":{"PO11":"2"},"psos":{"PSO2":"2","PSO3":"2"}}]}$r2025_32_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: ME25C05 Re-Engineering for Innovation.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25401 | ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25401'))
		LIMIT 1
	),
	'EC25401', 'ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING',
	$r2025_33_obj${"objectives":[{"number":1,"description":"To provide foundational AI/ML knowledge covering core techniques and enable real- world application using modern tools and frameworks."}]}$r2025_33_obj$::jsonb,
	$r2025_33_clos${"clos":[{"clo_number":1,"description":"Explain fundamental concepts of control systems and model\nphysical systems using transfer functions, block diagrams,\nand signal flow graphs.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze time domain response, steady-state error, and\nsystem performance using standard test signals and\nspecifications.","k_values":[]},{"clo_number":3,"description":"Analyze system stability using Routh-Hurwitz criterion, root\nlocus, and frequency domain techniques like Bode and\nNyquist plots.","k_values":[]},{"clo_number":4,"description":"Design controllers and compensators and apply state-space\ntechniques for modern control system analysis and design.","k_values":[]}]}$r2025_33_clos$::jsonb,
	$r2025_33_content${"units":[{"unit_id":"I","unit_title":"Introduction To AI","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"II","unit_title":"Artificial Intelligence","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction, Applications, Problem types. Problem formulation,"}]}],"remarks":""},{"unit_id":"III","unit_title":"Intelligent Agents","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Types, Architectures, and Environments, PEAS framework."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Reasoning and Logic","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Propositional Logic, First-order Logic, Inference techniques"},{"number":2,"title":"including Forward and Backward Chaining"}]}],"remarks":""},{"unit_id":"V","unit_title":"Search Strategies","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Solving problems by searching, Design issues in search algorithms. Uninformed Search:"},{"number":2,"title":"BFS, DFS. Heuristic Search: Generate-and-Test, Hill Climbing, Best-First Search, A*,"},{"number":3,"title":"Alpha-Beta pruning. Advanced methods: Problem Reduction, AO* Algorithm, Constraint"},{"number":4,"title":"Satisfaction, Means-Ends Analysis."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Artificial Neural Networks","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to Neural Networks, Activation Functions, Optimization Algorithms: Gradient"},{"number":2,"title":"Descent. Architectures: Perceptrons, Adaline, Multilayer Perceptrons. Training:"},{"number":3,"title":"Backpropagation, Procedures, Network Tuning."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Machine Learning Basics","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VIII","unit_title":"Machine Learning","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Basics, Applications. Comparison with Data Mining and Big Data"},{"number":2,"title":"Analytics. Supervised Learning: Naive Bayes, KNN, Decision Trees. Unsupervised"}]}],"remarks":""},{"unit_id":"IX","unit_title":"Learning","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"k-means clustering. Introduction to Reinforcement Learning."}]}],"remarks":""},{"unit_id":"X","unit_title":"Forecasting, Advanced Learning & Ensemble Methods","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"XI","unit_title":"Forecasting","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Non-linear and Logistic Regression, Random Forests, Bayesian Networks,"},{"number":2,"title":"Bias-Variance Tradeoff, Tuning and Model Selection. Clustering: EM Algorithm,"},{"number":3,"title":"Hierarchical Clustering, Post-Clustering Supervised Learning. Kernel Methods: SVM,"},{"number":4,"title":"Soft Margins, Kernel Trick. Ensemble Methods: Bagging, Boosting, Stacking, AdaBoost,"},{"number":5,"title":"Cross-Validation. Dimensionality Reduction: PCA, LDA, MDS, Feature Selection"},{"number":6,"title":"Techniques."},{"number":7,"title":"Suggested Experiments:"},{"number":8,"title":"1.Implementation of a simple intelligent agent simulation"},{"number":9,"title":"2. Solving AI problems using BFS and DFS algorithms"},{"number":10,"title":"3. Implementing heuristic search strategies (A*, Hill Climbing)"},{"number":11,"title":"4. Design and train a perceptron for basic classification"},{"number":12,"title":"5. Building a multi-layer neural network using backpropagation"}]}],"remarks":""}]}$r2025_33_content$::jsonb,
	$r2025_33_books${"primary":[],"references":[{"title":"Stuart Russell and Peter Norvig, Artificial Intelligence: A Modern Approach, 4th","author":""},{"title":"Tom M. Mitchell, Machine Learning, McGraw Hill Education, 2017.","author":""},{"title":"Ian Goodfellow, YoshuaBengio, and Aaron Courville, Deep Learning, MIT Press,","author":""},{"title":"Pattern Recognition and Machine Learning. By Christopher M. Bishop, Springer,","author":""},{"title":"Hands-On Machine Learning with Scikit-Learn, Keras, and TensorFlow. By","author":""}]}$r2025_33_books$::jsonb,
	$r2025_33_web${"resources":[]}$r2025_33_web$::jsonb,
	$r2025_33_ped${"methods":["Quiz and gamification","Project (15%)","Assignment Programs (25%)"]}$r2025_33_ped$::jsonb,
	$r2025_33_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_33_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25401 Artificial Intelligence and Machine Learning.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C04 | SIGNALS AND SYSTEMS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C04'))
		LIMIT 1
	),
	'EC25C04', 'SIGNALS AND SYSTEMS',
	$r2025_34_obj${"objectives":[{"number":1,"description":"The course builds foundational skills for analyzing continuous and discrete-time signals, including their classification and properties, and explores key transforms (Fourier, Laplace, Z, DTFT). Introduction to Signals and Systems: Definition of Signals and Systems, Classification of Signals, Operations on signals, Singularity functions and related functions. Analogy between vectors and signals, orthogonal signal space, complete set of orthogonal functions, Parseval’s relations. Fourier Series Analysis: Fourier series representation of continuous time periodic signals, Trigonometric and Exponential Fourier series, Properties of Fourier series. Fourier Transform & Laplace Transform: Fourier transform of aperiodic signals, standard signals and periodic signals, Properties of Fourier transforms. Hilbert transform and its properties. Laplace transforms, RoC, properties. Inverse Laplace transform. Continuous-Time LTI Systems: Continuous time Systems and its properties. Linear time invariant (LTI) system, Impulse response. Convolution. Analysis of LTI System using Laplace and Fourier transforms. Sampling, Quantization & Discrete-Time Systems: Sampling and reconstruction of band limited signals. Low pass and band pass sampling theorems. Aliasing. Anti-aliasing filter. Practical Sampling-aperture effect. Quantization. Discrete-time signals and systems. Discrete Fourier series, DTFT, Z-transform and its properties. Analysis of LTI systems using Z – transform."}]}$r2025_34_obj$::jsonb,
	$r2025_34_clos${"clos":[{"clo_number":1,"description":"Define and classify continuous-time and discrete-time\nsignals, systems, and their fundamental properties.\n- -","k_values":[]},{"clo_number":2,"description":"Apply Fourier Series techniques to analyze periodic\nsignals and interpret their frequency domain\ncharacteristics.","k_values":[]},{"clo_number":3,"description":"Analyze Linear Time-Invariant (LTI) systems using\nconvolution and transform methods.","k_values":[]},{"clo_number":4,"description":"Develop and adapt solutions using sampling,\nquantization, and discrete-time signal processing\ntechniques for real-world applications and continuous\nlearning.","k_values":[]}]}$r2025_34_clos$::jsonb,
	$r2025_34_content${"units":[{"unit_id":"I","unit_title":"Suggested activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Quiz based on competitive examination problems (GATE, IES),"},{"number":2,"title":"Simulation Assignment."}]}],"remarks":""}]}$r2025_34_content$::jsonb,
	$r2025_34_books${"primary":[],"references":[]}$r2025_34_books$::jsonb,
	$r2025_34_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_ee28/preview"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_ee28/preview"}]}$r2025_34_web$::jsonb,
	$r2025_34_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_34_ped$::jsonb,
	$r2025_34_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3","PSO2":"2"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3","PSO2":"2","PSO3":"2"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"1","PSO3":"3"}}]}$r2025_34_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C04-signals and systems.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C05 | ELECTRONIC CIRCUITS AND ANALYSIS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C05'))
		LIMIT 1
	),
	'EC25C05', 'ELECTRONIC CIRCUITS AND ANALYSIS',
	$r2025_35_obj${"objectives":[{"number":1,"description":"Covers diode, BJT, and MOSFET circuits for designing amplifiers, feedback systems, and waveform generators using simulation and application-based problem solving. Diode and Filter Circuits: Diode circuits - clipper, clamper, voltage doubler, voltage quadrupler, half-wave rectifier, centre-tapped full-wave rectifier, and bridge rectifier circuits. Power supply design. Regulators – Voltage regulator circuits using Zener diode. Passive filters – analysis of RC, RL, RLC filters. BJT Circuits: Load-line analysis, different biasing techniques of BJT, bias stabilization, and early effect, RC-coupled and transformer-coupled multistage amplifiers, and current mirror circuits. MOSFET Circuits: Biasing by fixing VGS, biasing by fixing VG, and connecting a resistor in the source, Biasing using a drain-to-gate feedback resistor, and biasing using a current source. Analysis and design of common source, common drain, common gate amplifier configurations. Frequency Response of Amplifiers: Frequency response of amplifiers – Low frequency response of BJT and FET amplifiers, lower cut off frequency - hybrid π equivalent circuit of BJT - high frequency response of BJT amplifiers –upper cut off frequency – transition frequency - Miller effect, high frequency response of FET amplifiers. Wide band amplifiers - Wide banding techniques – CC–CE /CD-CS cascade, cascode amplifier, Darlington pair. Feedback Amplifiers and Waveform Generators: Feedback and stability- negative and positive feedback in amplifiers, analysis of four feedback topologies, loop gain. Oscillators - Barkhausen criterion, effect of feedback on amplifier poles, Bode plots, gain and phase margins; positive feedback and sinusoidal oscillators using BJT - Wein bridge oscillator, RC phase shift oscillator, Hartley and Colpitts oscillators. Multivibrators using BJT – Astable, Monostable, and bistable circuits. Power Amplifiers and Wideband Techniques: Power amplifiers –Analysis of Class A, B, AB, C, D & S power amplifiers, Conversion efficiency and relative performance, Total Harmonic Distortion (THD), Relationship Between Total Power and THD, Heat sinks."}]}$r2025_35_obj$::jsonb,
	$r2025_35_clos${"clos":[{"clo_number":1,"description":"Define and explain diode circuits, BJT and MOSFET\ncircuits, amplifier characteristics, feedback, oscillators,\nand power amplifiers.\n- -","k_values":[]},{"clo_number":2,"description":"Apply circuit analysis techniques to design and solve\nproblems involving rectifiers, filters, biasing circuits,\namplifiers, and oscillators","k_values":[]},{"clo_number":3,"description":"Analyze frequency response, feedback mechanisms,\nstability, and performance parameters of electronic\ncircuits using appropriate models and methods.","k_values":[]},{"clo_number":4,"description":"Design and develop analog circuits and adapt to modern\ntools and emerging technologies for real-world\napplications.","k_values":[]}]}$r2025_35_clos$::jsonb,
	$r2025_35_content${"units":[{"unit_id":"I","unit_title":"Suggested activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Quiz, problem-solving assignments, circuit simulation using"},{"number":2,"title":"SPICE tools."}]}],"remarks":""}]}$r2025_35_content$::jsonb,
	$r2025_35_books${"primary":[],"references":[{"title":"Sedra, A. S., & Smith, K. C. (2020). Microelectronic circuits (8th ed.). Oxford","author":""},{"title":"Neamen, D. A. (2021). Microelectronics: Circuit analysis and design (5th ed.).","author":""},{"title":"Razavi, B. (2016). Fundamentals of microelectronics (2nd ed.). Wiley.","author":""},{"title":"Bell, D. A. (2008). Electronic devices and circuits (5th ed.). Oxford University","author":""},{"title":"Boylestad, R. L., & Nashelsky, L. (2021). Electronic devices and circuit theory.","author":""}]}$r2025_35_books$::jsonb,
	$r2025_35_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"}]}$r2025_35_web$::jsonb,
	$r2025_35_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_35_ped$::jsonb,
	$r2025_35_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{}},{"co_id":"CO4","pos":{}}]}$r2025_35_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C05- Electronic Circuits and Analysis.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C06 | ELECTRO MAGNETIC FIELDS AND TRANSMISSION LINES
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C06'))
		LIMIT 1
	),
	'EC25C06', 'ELECTRO MAGNETIC FIELDS AND TRANSMISSION LINES',
	$r2025_36_obj${"objectives":[{"number":1,"description":"Covers static electric and magnetic field laws, Maxwell’s equations, and electromagnetic wave propagation across media, transmission lines, and waveguides."}]}$r2025_36_obj$::jsonb,
	$r2025_36_clos${"clos":[{"clo_number":1,"description":"Define and explain the fundamental concepts of\nelectrostatics and magnetostatics including Coulomb’s law,\nGauss’s law, Ampere’s law, and Biot–Savart law.\n- -","k_values":[]},{"clo_number":2,"description":"Apply Maxwell’s equations and boundary conditions to\nanalyze electric and magnetic fields in static and time-\nvarying conditions.","k_values":[]},{"clo_number":3,"description":"Analyze electromagnetic wave propagation in conducting\nand dielectric media using wave equations and uniform\nplane wave concepts and determine modes (TEM, TE, TM)\nand cutoff frequencies for rectangular waveguides","k_values":[]},{"clo_number":4,"description":"Use modern engineering tools (simulation software/field\nvisualization tools) to model electrostatic and\nmagnetostatic problems.","k_values":[]}]}$r2025_36_clos$::jsonb,
	$r2025_36_content${"units":[{"unit_id":"I","unit_title":"Coordinate Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Fundamentals of scalars and vectors, Coordinate systems."},{"number":2,"title":"Electrostatics:"},{"number":3,"title":"Coulomb’s Law, Gauss’s Law, Electric Scalar Potential, Electric Boundary Conditions,"},{"number":4,"title":"Capacitance, Electrostatic Potential Energy."},{"number":5,"title":"Magnetostatic:"},{"number":6,"title":"Ampere Circuital law- Biot–Savart Law, Magnetic Forces and Torques, Maxwell’s"},{"number":7,"title":"Magnetostatic Equations, Vector Magnetic Potential, Magnetic Boundary Conditions,"},{"number":8,"title":"Inductance, Magnetic Energy."},{"number":9,"title":"Maxwell’s equations:"},{"number":10,"title":"Equation of continuity, Maxwell’s equations for time varying fields, boundary conditions."},{"number":11,"title":"Wave equation, EM waves in conducting medium and dielectric medium , Uniform plane"},{"number":12,"title":"wave equation."}]}],"remarks":""},{"unit_id":"II","unit_title":"Transmission Lines","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Transmission Lines, types, two-wire line-Equivalent circuit , characteristic impedance,"},{"number":2,"title":"propagation constant, input impedance, VSWR, reflection and transmission coefficients,"},{"number":3,"title":"return loss, quarter-wave transformer -impedance matching using smith chart."}]}],"remarks":""},{"unit_id":"III","unit_title":"Waveguide","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Parallel plate, TEM-TM-TE-Cut off frequency, rectangular waveguide, parameters"},{"number":2,"title":"related to waveguides."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Suggested activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"GATE Questions, Assignments, and Project-based learning"}]}],"remarks":""}]}$r2025_36_content$::jsonb,
	$r2025_36_books${"primary":[],"references":[{"title":"D.K. Cheng, Field and wave electromagnetics, 2nd ed., Pearson (India), 2002.","author":""},{"title":"M.N.O.Sadiku and S.V. Kulkarni, Principles of electromagnetics, 6th ed.,","author":""},{"title":"Edward C. Jordan & Keith G. Balmain,Electromagnetic waves and Radiating","author":""},{"title":"W.H. Hayt and J.A. Buck, Engineering electromagnetics, 7th ed., McGraw-Hill","author":""},{"title":"B.M. Notaros, Electromagnetics, Pearson: New Jersey, 2011.","author":""}]}$r2025_36_books$::jsonb,
	$r2025_36_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_ee83/"},{"title":"feynmanlectures.caltech.edu","url":"https://www.feynmanlectures.caltech.edu/I_toc.html"},{"title":"digimat.in","url":"http://www.digimat.in/nptel/courses/video/117101056/L10.html"}]}$r2025_36_web$::jsonb,
	$r2025_36_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_36_ped$::jsonb,
	$r2025_36_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3","PSO2":"2"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3","PSO3":"2"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_36_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C06 -Electromagnetic Fields and Transmission Lines.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C07 | DIGITAL SYSTEM DESIGN
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C07'))
		LIMIT 1
	),
	'EC25C07', 'DIGITAL SYSTEM DESIGN',
	$r2025_37_obj${"objectives":[{"number":1,"description":"This course aims to create a strong foundation for Digital Electronics. The students are taught the basic components of digital systems and the processes of their implementation. The students are also taught Boolean algebra, logic gates, the basics of memories, and the implementation of combinational and sequential digital circuits using logic gates. Students are trained to employ the principles of digital electronics to implement digital design for the given problem. Boolean Algebra: Revisiting Boolean algebra and minimization, 4-variable Karnaugh Maps, SOP and POS Minimization using Karnaugh Maps-Introduction to Verilog HDL, Data Types and"}]}$r2025_37_obj$::jsonb,
	$r2025_37_clos${"clos":[{"clo_number":1,"description":"Explain fundamental concepts of digital electronics,\nincluding Boolean algebra, logic gates, and digital\ncircuit classifications.\n- -","k_values":[]},{"clo_number":2,"description":"Apply logic design techniques and minimization\nmethods to develop optimized solutions for digital\ncircuits.","k_values":[]},{"clo_number":3,"description":"Analyze practical problems and design appropriate\ndigital solutions using components such as\nmultiplexers, encoders, latches, counters, and code\nconverters.","k_values":[]},{"clo_number":4,"description":"Develop and verify digital circuit designs using digital\ntrainer kits and Hardware Description Language\n(HDL) programming.","k_values":[]}]}$r2025_37_clos$::jsonb,
	$r2025_37_content${"units":[{"unit_id":"I","unit_title":"Operators-Different types of Modeling","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Combinational Digital Circuits:"},{"number":2,"title":"Introduction to combinational circuits, realization of logic expressions using AOI, NOR,"},{"number":3,"title":"and NAND gates. Adders, Subtractors, Multiplexers, De-multiplexers, Encoders,"},{"number":4,"title":"Decoders, Priority encoders, Arithmetic circuits, such as multipliers, Ripple adders,"},{"number":5,"title":"Code-converters –Programming using Verilog HDL."},{"number":6,"title":"Sequential Digital Circuits:"},{"number":7,"title":"Introduction to sequential circuits, Moore and Mealy machine, Flip-flops and Latches,"},{"number":8,"title":"realization of flip-flops using S-R flip-flop, master slave flip-flop, JK flip-flop, T and D flip-"},{"number":9,"title":"flops, Realization of flip-flops using logic gates, introduction to shift registers, realization"},{"number":10,"title":"of different types of shift registers, introduction to counters, realization of different types"},{"number":11,"title":"of counters, Introduction to different types of memories Programming using Verilog HDL."},{"number":12,"title":"Finite State Machines:"},{"number":13,"title":"Need for FSM, Elements of FSM, Components in FSM, FSM in HDL, Issues in FSM"},{"number":14,"title":"design, Case studies: Sequence detector, Odd parity Checker, Vending Machine"},{"number":15,"title":"FPGA Architecture:"},{"number":16,"title":"Introduction to FPGA Architecture, Components of FPGA Architectures – Programming"},{"number":17,"title":"Technologies, Logic elements and Look-up Tables, Dedicated multipliers, Distributed"},{"number":18,"title":"RAM, Shift registers, Digital Clock Managers, Altera FPGA and AMD Xilinx FPGA"},{"number":19,"title":"architectures and design flow-AMD Spartan, Virtex, Altera Cyclone, Arria and Agilex"},{"number":20,"title":"architectures-Introduction to IP Cores- AMD Microblaze V and Altera NIOS V Soft core"},{"number":21,"title":"processors"}]}],"remarks":""}]}$r2025_37_content$::jsonb,
	$r2025_37_books${"primary":[],"references":[{"title":"Fletcher, W. I. (2015). An engineering approach to digital design (1st ed.).","author":""},{"title":"Floyd, T. L. (2015). Digital fundamentals (11th ed., Global ed.). Pearson.","author":""},{"title":"Mano, M. M., & Ciletti, M. D. (2019). Digital design: With an introduction to the","author":""},{"title":"Roth, C. H., Jr., Kinney, L. L., & John, E. B. (2019). Fundamentals of logic design","author":""},{"title":"Tocci, R. J., Widmer, N. S., & Moss, G. L. (2010). Digital systems: Principles and","author":""},{"title":"Wakerly, J. F. (2018). Digital design: Principles and practices (5th ed.). Pearson","author":""}]}$r2025_37_books$::jsonb,
	$r2025_37_web${"resources":[{"title":"altera.com","url":"https://www.altera.com/fpga"},{"title":"fpgacademy.org","url":"https://fpgacademy.org/"}]}$r2025_37_web$::jsonb,
	$r2025_37_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_37_ped$::jsonb,
	$r2025_37_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3","PSO2":"2"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3","PSO3":"2"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_37_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C07- Digital System Design.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C08 | DIGITAL SYSTEM DESIGN LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C08'))
		LIMIT 1
	),
	'EC25C08', 'DIGITAL SYSTEM DESIGN LABORATORY',
	$r2025_38_obj${"objectives":[{"number":1,"description":"To develop hands-on skills in designing, implementing, and verifying combinational and sequential digital circuits using HDL and hardware platforms for real-world applications. List of Experiments: 1. Verification of De Morgan’s Theorem, sum-of product and product-of- sum expressions using basic and universal gates. 2. Design, construction and verification of a BCD to Excess-3 and Excess-3 to BCD code converters 3. Design, construction and verification of a Binary to Gray and Gray to Binary code converters 4. Design and implementation of Multiplexer and De-multiplexer circuits using ICs and verification of their functions 5. Design and implementation of an encoder and decoder circuit using ICs. 6. Design and construction of Magnitude Comparator using appropriate IC 7. Construction and verification of the functions of S-R latch, S-R, J-K, T and D Flip- Flops using NAND and NOR gates. 8. Design and verify 3 bit counter using Verilog HDL 9. Design and verify 3-bit Ripple carry adder using Verilog HDL"}]}$r2025_38_obj$::jsonb,
	$r2025_38_clos${"clos":[{"clo_number":1,"description":"Define and explain the operation of basic logic gates,\ncombinational circuits, sequential circuits, and\nCMOS/PLD-based digital systems.\n- -","k_values":[]},{"clo_number":2,"description":"Apply HDL/simulation tools to implement\ncombinational and sequential circuits for given\nspecifications.","k_values":[]},{"clo_number":3,"description":"Analyze the behavior and performance of digital\ncircuits including FSMs, counters, hazards, and timing\nissues using appropriate methods.","k_values":[]},{"clo_number":4,"description":"Design and realize digital systems using modern\nEDA tools and hardware platforms for real-world\napplications.","k_values":[]}]}$r2025_38_clos$::jsonb,
	$r2025_38_content${"units":[{"unit_id":"I","unit_title":"Page 62 of 80","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"CO CO Description PO PSO"},{"number":2,"title":"CO1"},{"number":3,"title":"Define and explain the operation of basic logic gates,"},{"number":4,"title":"combinational circuits, sequential circuits, and"},{"number":5,"title":"CMOS/PLD-based digital systems."},{"number":6,"title":"-"},{"number":7,"title":"CO2"}]}],"remarks":""},{"unit_id":"II","unit_title":"Apply HDL/simulation tools to implement","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"combinational and sequential circuits for given"},{"number":2,"title":"specifications."},{"number":3,"title":"PO1,"},{"number":4,"title":"PO2,"},{"number":5,"title":"PO3,"},{"number":6,"title":"PO4"},{"number":7,"title":"PSO3 (3)"},{"number":8,"title":"CO3"}]}],"remarks":""},{"unit_id":"III","unit_title":"Analyze the behavior and performance of digital","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"circuits including FSMs, counters, hazards, and timing"},{"number":2,"title":"issues using appropriate methods."},{"number":3,"title":"PO1,"},{"number":4,"title":"PO2,"},{"number":5,"title":"PO4"}]}],"remarks":""},{"unit_id":"IV","unit_title":"PSO2 (3)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"CO4 Design and realize digital systems using modern"},{"number":2,"title":"EDA tools and hardware platforms for real-world"},{"number":3,"title":"applications."},{"number":4,"title":"PO3,"},{"number":5,"title":"PO4,"},{"number":6,"title":"PO5"}]}],"remarks":""},{"unit_id":"V","unit_title":"PSO3 (3)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"T3 Design and implement data routing and coding circuits using Multiplexers,"},{"number":2,"title":"Demultiplexers, Encoders, and Decoders with standard ICs."},{"number":3,"title":"T4 Design and verify sequential logic circuits including S-R Latch, S-R Flip-Flop, J-K"},{"number":4,"title":"Flip-Flop, T Flip-Flop, and D Flip-Flop using NAND and NOR gates."},{"number":5,"title":"T5 Design, implement, and verify a 3-bit Ripple Carry Adder and a 3-bit Counter using"},{"number":6,"title":"Verilog HDL and simulation tools."}]}],"remarks":""}]}$r2025_38_content$::jsonb,
	$r2025_38_books${"primary":[],"references":[{"title":"Fletcher, W. I. (2015). An engineering approach to digital design (1st ed.). Pearson","author":""},{"title":"Floyd, T. L. (2015). Digital fundamentals (11th ed., Global ed.). Pearson.","author":""},{"title":"Mano, M. M., & Ciletti, M. D. (2019). Digital design: With an introduction to the","author":""},{"title":"Roth, C. H., Jr., Kinney, L. L., & John, E. B. (2019). Fundamentals of logic design","author":""},{"title":"Tocci, R. J., Widmer, N. S., & Moss, G. L. (2010). Digital systems: Principles and","author":""},{"title":"Wakerly, J. F. (2018). Digital design: Principles and practices (5th ed.). Pearson","author":""}]}$r2025_38_books$::jsonb,
	$r2025_38_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_ee39/preview"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_ee39/preview"},{"title":"elearn.nptel.ac.in","url":"https://elearn.nptel.ac.in/shop/iit-workshops/ongoing/digital-system-design-and-"},{"title":"elearn.nptel.ac.in","url":"https://elearn.nptel.ac.in/shop/iit-workshops/ongoing/digital-system-design-and-"},{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/117/105/117105080/"},{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/117/105/117105080/"}]}$r2025_38_web$::jsonb,
	$r2025_38_ped${"methods":["Project (30%)","Assignment (10%)","Practical (30%)","Internal"]}$r2025_38_ped$::jsonb,
	$r2025_38_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO3":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_38_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C08- Digital System Design Laboratory.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C09 | ELECTRONIC CIRCUITS LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C09'))
		LIMIT 1
	),
	'EC25C09', 'ELECTRONIC CIRCUITS LABORATORY',
	$r2025_39_obj${"objectives":[{"number":1,"description":"To develop hands-on skills in designing and analyzing electronic circuits including amplifiers, oscillators, and related applications."}]}$r2025_39_obj$::jsonb,
	$r2025_39_clos${"clos":[{"clo_number":1,"description":"Define and explain the operation of diode circuits,\ntransistor biasing, amplifiers, feedback systems,\noscillators, and power amplifiers.\n- -","k_values":[]},{"clo_number":2,"description":"Apply circuit principles to design and implement\nrectifiers, filters, biasing circuits, amplifiers, and\noscillators using simulation tools.","k_values":[]},{"clo_number":3,"description":"Analyze the performance of electronic circuits in terms\nof gain, frequency response, stability, and efficiency.","k_values":[]},{"clo_number":4,"description":"Design and evaluate advanced circuit behavior,\nincluding feedback effects, distortion, and power\namplifier performance under practical conditions.","k_values":[]}]}$r2025_39_clos$::jsonb,
	$r2025_39_content${"units":[{"unit_id":"I","unit_title":"List of Experiments","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"1. Study and simulation of clipper and clamper circuits."},{"number":2,"title":"2. Design and analysis of rectifiers (HWR, FWR, Bridge) with filters."},{"number":3,"title":"3. Design of Zener diode voltage regulator and power supply."},{"number":4,"title":"4. Design and analysis of BJT biasing circuits and RC-coupled amplifier."},{"number":5,"title":"5. Design and analysis of MOSFET biasing circuits."},{"number":6,"title":"6. Implementation of common source (CS), common drain (CD), and common gate"},{"number":7,"title":"(CG) amplifiers."},{"number":8,"title":"7. Frequency response analysis of BJT/FET amplifiers."},{"number":9,"title":"8. Design and simulation of RC phase shift and Wien bridge oscillators."},{"number":10,"title":"9. Study of multivibrator circuits (Astable and Monostable)."},{"number":11,"title":"10. Analysis of Class A and Class B power amplifiers with efficiency calculation."}]}],"remarks":""},{"unit_id":"II","unit_title":"Tools Required","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Diodes, IC- Resistors, Capacitor, LT spice open-source software,"},{"number":2,"title":"Regulated power supply, Digital storage oscilloscope."}]}],"remarks":""}]}$r2025_39_content$::jsonb,
	$r2025_39_books${"primary":[],"references":[{"author":"Sedra, A. S., & Smith, K. C.","title":"Microelectronic Circuits (Oxford University Press)"},{"author":"Boylestad, R. L., & Nashelsky, L.","title":"Electronic Devices and Circuit Theory"},{"author":"Neamen, D. A.","title":"Microelectronics: Circuit Analysis and Design (McGraw-Hill)"},{"author":"Razavi, B.","title":"Fundamentals of Microelectronics (Wiley)"}]}$r2025_39_books$::jsonb,
	$r2025_39_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"}]}$r2025_39_web$::jsonb,
	$r2025_39_ped${"methods":["Project (30%)","Assignment (10%)","Practical (30%)","Internal"]}$r2025_39_ped$::jsonb,
	$r2025_39_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3","PSO3":"2"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_39_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C09 -Electronic Circuit Laboratory.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C10 | MICROCONTROLLER AND PERIPHERAL INTERFACING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C10'))
		LIMIT 1
	),
	'EC25C10', 'MICROCONTROLLER AND PERIPHERAL INTERFACING',
	$r2025_40_obj${"objectives":[{"number":1,"description":"To equip students with the knowledge of embedded systems, ARM-based architectures, peripheral interfacing, and emerging AI processor technologies for designing modern intelligent electronic systems."}]}$r2025_40_obj$::jsonb,
	$r2025_40_clos${"clos":[{"clo_number":1,"description":"Define the fundamentals of microprocessors,\nmicrocontrollers, embedded systems, processor\narchitectures, memory technologies, and their applications\nin embedded systems. Understand AI processors, AI\naccelerator types, future trends, and applications.\n– –","k_values":[]},{"clo_number":2,"description":"Apply Embedded C programming concepts, 8051\narchitecture, memory organization, and basic assembly\ninstructions to develop simple embedded applications.","k_values":[]},{"clo_number":3,"description":"Analyze ARM Cortex-M architecture, memory map,\ninterrupt handling, clock systems, DMA, and security\nfeatures for embedded system design.","k_values":[]},{"clo_number":4,"description":"Design and implement peripheral interfacing solutions\nusing GPIO, UART, timers, clocks, and communication\nprotocols for embedded applications.","k_values":[]}]}$r2025_40_clos$::jsonb,
	$r2025_40_content${"units":[{"unit_id":"I","unit_title":"Course Content","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to Microprocessor, Microcontroller and Embedded System"},{"number":2,"title":"Introduction to Microprocessor and Microcontrollers, comparison and usage of"},{"number":3,"title":"Microprocessor and Microcontroller. Introduction to embedded systems, understanding"},{"number":4,"title":"of code region, data region – and various components of an embedded system."},{"number":5,"title":"Understanding of Embedded Processor Architecture and Memory Technology"},{"number":6,"title":"RISC vs. CISC, Harvard vs. Von Neumann, brief on RISC-V, Memory Technologies:"},{"number":7,"title":"SRAM, DRAM, NOR/NAND Flash, EEPROM and its usage in embedded system."},{"number":8,"title":"Eight-bit Microcontroller and Introduction to Embedded C programming"},{"number":9,"title":"8051 Architecture & Memory Map - I/O, Pin Functions and basic understanding of"},{"number":10,"title":"assembly instructions.Embedded C Programming Basics - Data types, control"},{"number":11,"title":"structures - Bitwise operators - Memory qualifiers (volatile, static, etc.) - Pointer"},{"number":12,"title":"basics and structures - Storage class in C (auto, static, extern, register) , C-program"},{"number":13,"title":"Qualifiers (const, volatile), Understanding of C program Memory map"}]}],"remarks":""},{"unit_id":"II","unit_title":"ARM Processor and Architecture","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Cortex-M Programmer's Model (M23/ARMv8-M)"},{"number":2,"title":"Registers, memory map, stack,"},{"number":3,"title":"vector table - secure and non-secure mode of processor, understanding of the"},{"number":4,"title":"access permission between these zones. - Understand details about Oscillators,"},{"number":5,"title":"PLL and peripheral clocks distributions. Timers & DMA Overview - Interrupt Handling"},{"number":6,"title":"& NVIC - Understanding of interrupts – General interrupt mechanism (example"},{"number":7,"title":"narrate 8051) and interrupt working on ARM in presence of Interrupt controller."},{"number":8,"title":"Understand the need of special interrupt controller – use case NVIC"},{"number":9,"title":"Peripheral Interfacing – GPIO, Clocks, UART"},{"number":10,"title":"GPIO - Usage as an Analog pin, Digital pin, General purpose I/O, Concept of GPIO port"},{"number":11,"title":"block. Clock system module in PIC32CM LSx or equivalent STM32 ARM Cortex-M3"},{"number":12,"title":"based core- UART Fundamentals - Baud rate, framing, register configuration,"},{"number":13,"title":"understand internal registers of UART in the processor, configure and demonstrate the"},{"number":14,"title":"UART transmission of data between two devices for various baud rates like"},{"number":15,"title":"9600,115200 etc. Advantages and disadvantages of UART."}]}],"remarks":""},{"unit_id":"III","unit_title":"Intro to AI Processor Technology","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Traditional CPU vs AI Processor – Need of AI Processor"},{"number":2,"title":"AI processors and its types-"},{"number":3,"title":"GPU, Neural Processing Unit (NPU) and Introduction to Field Programmable Gate"},{"number":4,"title":"Arrays (FPGA). Components of an AI processor, Overview of AI processors and how"},{"number":5,"title":"fast computation is accomplished in AI accelerator or AI processor – Emergence of new"},{"number":6,"title":"fast memory – Overview of High Bandwidth Memory (HBM), Overview about the Matrix"},{"number":7,"title":"Multiplication Unit and future trends in AI Processor - Application areas of AI processors"},{"number":8,"title":"in the market."}]}],"remarks":""}]}$r2025_40_content$::jsonb,
	$r2025_40_books${"primary":[],"references":[{"title":"A Beginner’s Guide to Designing Embedded System Applications on Arm","author":""},{"author":"Computer Architecture: A Quantitative Approach","title":"John L. Hennessy and David"},{"title":"Embedded Systems Made Easy: From Basics to AI Hardware by Dr. Dinesh","author":""}]}$r2025_40_books$::jsonb,
	$r2025_40_web${"resources":[{"title":"arm.com","url":"https://www.arm.com/resources/education/books"},{"title":"arm.com","url":"https://www.arm.com/resources/education/books/efficient-embedded-systems"}]}$r2025_40_web$::jsonb,
	$r2025_40_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_40_ped$::jsonb,
	$r2025_40_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO3":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3","PSO4":"2"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_40_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C10 Microcontroller and Peripheral Interfacing.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C11 | ANALOG AND DIGITAL COMMUNICATION
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C11'))
		LIMIT 1
	),
	'EC25C11', 'ANALOG AND DIGITAL COMMUNICATION',
	$r2025_41_obj${"objectives":[{"number":1,"description":"To impart knowledge in analog and digital modulation and demodulation techniques, and to introduce the applications of communication systems."}]}$r2025_41_obj$::jsonb,
	$r2025_41_clos${"clos":[{"clo_number":1,"description":"Define and explain the fundamental concepts,\nprinciples, and signal representations used in analog\nand digital communication systems.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze analog modulation techniques (AM, FM, PM),\ndigital baseband schemes, and signal characteristics to\nunderstand system performance in communication\nsystems.","k_values":[]},{"clo_number":3,"description":"Evaluate source coding, channel coding, and bandpass\nsignaling techniques to assess their effectiveness in\nreliable data transmission.","k_values":[]},{"clo_number":4,"description":"Design communication system modules by selecting\nappropriate modulation schemes, coding techniques,\nand signal processing methods for real-world\napplications.","k_values":[]}]}$r2025_41_clos$::jsonb,
	$r2025_41_content${"units":[{"unit_id":"I","unit_title":"Analog Modulation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Review of Fourier and Hilbert Transforms-Amplitude Modulation – AM, DSBSC, SSBSC,"},{"number":2,"title":"VSB– Spectral analysis of modulated signal, Angle modulation and demodulation:"},{"number":3,"title":"Narrow band, Wideband FM - Spectral analysis of modulated signal."}]}],"remarks":""},{"unit_id":"II","unit_title":"Digital Baseband Modulation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Schematic of digital communication systems, Sampling"},{"number":2,"title":"Quantization – Uniform and"},{"number":3,"title":"non-uniform quantization – Quantization noise– Speech Coders: Companding laws of"},{"number":4,"title":"speech signals, PCM, DPCM, ADPCM, DM, ADM."}]}],"remarks":""},{"unit_id":"III","unit_title":"Source Coding and Channel Coding","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Measure of information – Entropy – Source Coding: Source coding theorem, Shannon-"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Fano coding, Huffman Coding - Channel Coding","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Shannon-Hartley law, Linear block"},{"number":2,"title":"codes, Cyclic codes, syndrome decoding, Convolutional codes, Viterbi decoding"}]}],"remarks":""},{"unit_id":"V","unit_title":"Base Band Signaling","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VI","unit_title":"Line codes","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"RZ, NRZ, Manchester, Binary N-zero substitution codes"},{"number":2,"title":"PSDs, ISI, Pulse"},{"number":3,"title":"shaping, Eye diagram"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Band Pass Signaling","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VIII","unit_title":"Generation and detection of coherent schemes","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"BPSK, BFSK, QPSK- BER and Power"},{"number":2,"title":"Spectral Density Comparison- Generation and detection of non-coherent schemes:"},{"number":3,"title":"BFSK, DPSK, Overview of QAM, MSK."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Suggested Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Quiz, simulations, assignment, project."}]}],"remarks":""}]}$r2025_41_content$::jsonb,
	$r2025_41_books${"primary":[],"references":[{"title":"Hsu, H. P. (2006). Analog and digital communications (Schaum’s outline series).","author":""},{"title":"Sklar, B. (2007). Digital communications: Fundamentals and applications (2nd","author":""},{"title":"Roddy, D., & Coolen, J. (2006). Electronic communications (4th ed.). Prentice","author":""},{"title":"Chandra Sekar, V. (2012). Analog communication. Oxford University Press.","author":""}]}$r2025_41_books$::jsonb,
	$r2025_41_web${"resources":[]}$r2025_41_web$::jsonb,
	$r2025_41_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_41_ped$::jsonb,
	$r2025_41_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_41_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C11 Analog and Digital Communication.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C12 | CONTROL SYSTEMS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C12'))
		LIMIT 1
	),
	'EC25C12', 'CONTROL SYSTEMS',
	$r2025_42_obj${"objectives":[{"number":1,"description":"Model physical systems using differential equations, transfer functions, and state-space, then analyze time/frequency behavior to design stable, high-performance controllers."}]}$r2025_42_obj$::jsonb,
	$r2025_42_clos${"clos":[{"clo_number":1,"description":"Define and Explain fundamental concepts of control\nsystems and model physical systems using transfer\nfunctions, block diagrams, and signal flow graphs.\n- -","k_values":[]},{"clo_number":2,"description":"Apply the concepts of time domain response, steady-\nstate error, and system performance using standard test\nsignals and specifications.","k_values":[]},{"clo_number":3,"description":"Analyze system stability using Routh-Hurwitz criterion,\nroot locus, and frequency domain techniques like Bode\nand Nyquist plots.","k_values":[]},{"clo_number":4,"description":"Design controllers and compensators and apply state-\nspace techniques for modern control system analysis\nand design.","k_values":[]}]}$r2025_42_clos$::jsonb,
	$r2025_42_content${"units":[{"unit_id":"I","unit_title":"Introduction To Control System","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"II","unit_title":"Fundamental concepts of Control Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"open loop and closed loop systems –"},{"number":2,"title":"Control system Terminology – Applications."},{"number":3,"title":"Modelling of Physical Systems:"},{"number":4,"title":"Transfer function – Modelling of Electric systems, Translational and rotational"},{"number":5,"title":"mechanical systems, Electrical analogous systems. Block diagram reduction, signal flow"},{"number":6,"title":"graphs, multivariable control system."}]}],"remarks":""},{"unit_id":"III","unit_title":"Time Domain Response","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Transient and Steady state response"},{"number":2,"title":"Standard test inputs"},{"number":3,"title":"Time response of first and"},{"number":4,"title":"second order systems - Time domain specifications. Effect of moving the pole in the s-"},{"number":5,"title":"plane, Effect of adding real pole and zero. Steady state error, error constants and system"},{"number":6,"title":"type."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Stability Analysis","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Concept of stability, characteristic equation, location of poles. Routh Hurwitz stability"},{"number":2,"title":"criterion - Root locus technique."}]}],"remarks":""},{"unit_id":"V","unit_title":"Frequency Domain Response","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VI","unit_title":"Frequency response","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Frequency response of standard second order system -"},{"number":2,"title":"Frequency domain specifications - Relationship between Frequency and time domain"},{"number":3,"title":"specifications – Plots: Bode and Polar - Nyquist stability criterion."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Controller and Compensator Design","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VIII","unit_title":"Controllers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"P, PI, PD, PID"},{"number":2,"title":"Analytical design of controllers. Compensators: needs and"},{"number":3,"title":"its types - Design of lag, lead, lag-lead compensators using root locus and bode plot."}]}],"remarks":""},{"unit_id":"IX","unit_title":"State Space Representation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Concept of state, state variable and state model. Conversion: Transfer function from"},{"number":2,"title":"state equation, State equation to Transfer function. Solutions of state equations,"},{"number":3,"title":"Controllability and Observability."}]}],"remarks":""}]}$r2025_42_content$::jsonb,
	$r2025_42_books${"primary":[],"references":[{"title":"Dukkipati, R. V. (2022). MATLAB for control system engineers (2nd ed.). New","author":""},{"title":"Golnaraghi, F., & Kuo, B. C. (2017). Automatic control systems (10th ed.).","author":""},{"title":"Nagrath, J., & Gopal, M. (2021). Control system engineering (7th ed.). New Age","author":""},{"title":"Nise, N. S. (2019). Control systems engineering. John Wiley & Sons.","author":""},{"title":"Ogata, K. (2020). Modern control engineering (5th ed.). Pearson Education India.","author":""},{"title":"Shankar Ram, C. S. (n.d.). Control systems [Video lectures]. NPTEL, IIT Madras.","author":""}]}$r2025_42_books$::jsonb,
	$r2025_42_web${"resources":[]}$r2025_42_web$::jsonb,
	$r2025_42_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_42_ped$::jsonb,
	$r2025_42_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_42_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C12 Control Systems.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C13 | ANALOG AND DIGITAL COMMUNICATION LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C13'))
		LIMIT 1
	),
	'EC25C13', 'ANALOG AND DIGITAL COMMUNICATION LABORATORY',
	$r2025_43_obj${"objectives":[{"number":1,"description":"Demonstrate communication link architecture and technique comparison via case studies, simulations, policies, and socio-economic impact."}]}$r2025_43_obj$::jsonb,
	$r2025_43_clos${"clos":[{"clo_number":1,"description":"Explain fundamental concepts of control systems and\nmodel physical systems using transfer functions, block\ndiagrams, and signal flow graphs.\n-","k_values":[]},{"clo_number":2,"description":"Apply time domain response, steady-state error, and\nsystem performance using standard test signals and\nspecifications.","k_values":[]},{"clo_number":3,"description":"Analyze system stability using Routh-Hurwitz criterion, root\nlocus, and frequency domain techniques like Bode and\nNyquist plots.","k_values":[]}]}$r2025_43_clos$::jsonb,
	$r2025_43_content${"units":[{"unit_id":"I","unit_title":"List of Experiments","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"1. AM / FM Modulator and Demodulator"},{"number":2,"title":"2. Time Division Multiplexing"},{"number":3,"title":"3. Signal Sampling and reconstruction"},{"number":4,"title":"4. Pulse Code Modulation and Demodulation"},{"number":5,"title":"5. Delta Modulation and Demodulation"},{"number":6,"title":"6. Line coding schemes (Simulation)"},{"number":7,"title":"7. FSK, PSK and DPSK schemes (Simulation)"},{"number":8,"title":"8. Error control coding schemes (Simulation)"},{"number":9,"title":"9. Symbol Timing Synchronization"},{"number":10,"title":"10. Spread spectrum communication (Simulation)"},{"number":11,"title":"11. Communication link simulation"}]}],"remarks":""},{"unit_id":"II","unit_title":"Tools Required","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"GNU Radio software , MATLAB or Equivalent S/w – 15 User License"},{"number":2,"title":"Task"},{"number":3,"title":"T1 Design and simulate AM/FM communication systems including modulation and"},{"number":4,"title":"demodulation techniques for reliable signal transmission and reception."},{"number":5,"title":"T2 Design a multiplexed communication system using Time Division Multiplexing (TDM)"},{"number":6,"title":"and analyze channel sharing efficiency."},{"number":7,"title":"T3 Design and implement digital communication systems using Sampling, Pulse Code"},{"number":8,"title":"Modulation (PCM), and Delta Modulation (DM) techniques for signal transmission and"},{"number":9,"title":"reconstruction."},{"number":10,"title":"T4 Design and simulate digital data transmission schemes using Line Coding, FSK,"},{"number":11,"title":"PSK, and DPSK modulation techniques, and compare their performance."},{"number":12,"title":"T5 Design and evaluate a complete communication link incorporating Error Control"},{"number":13,"title":"Coding, Symbol Timing Synchronization, and Spread Spectrum Communication"},{"number":14,"title":"techniques through simulation."}]}],"remarks":""}]}$r2025_43_content$::jsonb,
	$r2025_43_books${"primary":[],"references":[]}$r2025_43_books$::jsonb,
	$r2025_43_web${"resources":[]}$r2025_43_web$::jsonb,
	$r2025_43_ped${"methods":["Project (30%)","Assignment (10%)","Practical (30%)","Internal"]}$r2025_43_ped$::jsonb,
	$r2025_43_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}}]}$r2025_43_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C13 Analog and Digital Communication Laboratory.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EC25C14 | MICROCONTROLLER AND PERIPHERAL INTERFACING LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '7437c682-1f5c-4225-abfb-2ad0c1d4bb8d'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '2f96f838-9205-481e-a071-d5bbb4d1c8bb'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EC25C14'))
		LIMIT 1
	),
	'EC25C14', 'MICROCONTROLLER AND PERIPHERAL INTERFACING LABORATORY',
	$r2025_44_obj${"objectives":[{"number":1,"description":"To develop practical skills in embedded system programming, debugging, peripheral interfacing, interrupt handling, DMA, security mechanisms, and UART communication using ARM-based microcontrollers and development tools."}]}$r2025_44_obj$::jsonb,
	$r2025_44_clos${"clos":[{"clo_number":1,"description":"Describe the architecture, development environment,\ncompilation process, memory organization, and debugging\nfeatures of ARM-based microcontrollers and embedded\nsystems.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze embedded C programs involving functions, pointers,\nvariable qualifiers, memory access, and assembly-level\nexecution to understand software–hardware interaction.","k_values":[]},{"clo_number":3,"description":"Implement and evaluate GPIO, timer, SysTick, and interrupt-\nbased applications for real-time embedded system operation.","k_values":[]},{"clo_number":4,"description":"Design and develop peripheral interfacing applications using\nUART, DMA, and interrupt-driven communication techniques\nfor efficient embedded system communication.","k_values":[]}]}$r2025_44_clos$::jsonb,
	$r2025_44_content${"units":[{"unit_id":"I","unit_title":"List of Experiments","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"1. Understand and explore the Integrated Development Environment (IDE) of a"},{"number":2,"title":"particular family of Microcontrollers and try to create a project and compile for a"},{"number":3,"title":"32 bit environment."},{"number":4,"title":"2. Write an embedded system program using a infinite while loop, perform a simple"},{"number":5,"title":"mathematical computation, and understand the compilation process including the"},{"number":6,"title":"compiler used, output generated like elf file, map file, lst file (if generated) and"},{"number":7,"title":"understand address mapping of the functions."},{"number":8,"title":"3. Write an embedded system program using an infinite while loop, perform a simple"},{"number":9,"title":"Mathematical computation, and demonstrate single stepping, watch and try"},{"number":10,"title":"modifying the variables contents in data memory region and examine the"},{"number":11,"title":"outcome. Also examine the assembly code of the C program."},{"number":12,"title":"4. Write a C program function to swap two number using call by value and call by"},{"number":13,"title":"reference. Examine the difference of these functions in assembly code, and"},{"number":14,"title":"explain the difference the way code is generated internally on any ARM 32bit IDE."},{"number":15,"title":"5. a) Write a C program function and demonstrate the behaviour of post and pre-"},{"number":16,"title":"increment of a variable with appropriate values. Examine and explain the"},{"number":17,"title":"behaviour with a right example on any ARM 32bit IDE."},{"number":18,"title":"b) Describe the purpose of the volatile qualifier in C. Using an example program,"},{"number":19,"title":"illustrate how the behaviour differs when a variable is declared with and without"},{"number":20,"title":"volatile, and examine the generated assembly code to justify the difference on"},{"number":21,"title":"any ARM 32bit IDE."},{"number":22,"title":"6. Train students to read datasheets and identify pin functions"},{"number":23,"title":"Identify LED pin mapping."}]}],"remarks":""},{"unit_id":"II","unit_title":"Distinguish analog vs digital pins","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduce basic GPIO programming and timing via software loops. Toggle LEDs"},{"number":2,"title":"with 500 ms delay using for-loops"},{"number":3,"title":"7. Configure the timer registers to generate a 500 ms delay and use the hardware"},{"number":4,"title":"timer to toggle an LED. Explain how precise delays are achieved when compared"},{"number":5,"title":"to hardware timers Vs software delays"},{"number":6,"title":"8. Generate a 1ms interrupts, blink LED by using sysTick for system programming."},{"number":7,"title":"Ask questions about sysTick and its significance."},{"number":8,"title":"9. Transfer data from a specified memory to UART using DMA. Demonstrate with a"},{"number":9,"title":"program."},{"number":10,"title":"10. Demonstrate access violation between secure/non-secure zones and show valid"},{"number":11,"title":"operations within same zone."},{"number":12,"title":"11. Explain how a switch state is read using GPIO pins and displayed using an LED."},{"number":13,"title":"Describe the switch debouncing problem and the methods used to handle it."},{"number":14,"title":"12. UART Polling Mode, Configure UART on at 9600 bps, transmit/receive"},{"number":15,"title":"characters, and echo back"}]}],"remarks":""}]}$r2025_44_content$::jsonb,
	$r2025_44_books${"primary":[],"references":[]}$r2025_44_books$::jsonb,
	$r2025_44_web${"resources":[]}$r2025_44_web$::jsonb,
	$r2025_44_ped${"methods":["Evaluation of Students’ work","Observation","Record."]}$r2025_44_ped$::jsonb,
	$r2025_44_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO3":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_44_po$::jsonb,
	'5b6c8eaf-4e76-4b24-8431-0286fa7eef14'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C14 Microcontroller and Peripheral Interfacing.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25301 | DIGITAL ELECTRONICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25301'))
		LIMIT 1
	),
	'EE25301', 'DIGITAL ELECTRONICS',
	$r2025_45_obj${"objectives":[{"number":1,"description":"This course aims to provide a strong foundation in the principles of digital systems and logic design. It introduces number systems, Boolean algebra, and techniques for designing combinational and sequential circuits. The course also explores memory devices and programmable logic components essential for modern digital systems."}]}$r2025_45_obj$::jsonb,
	$r2025_45_clos${"clos":[{"clo_number":1,"description":"Explain number systems, binary codes, Boolean\nalgebra, and logic gate operations.\n- -","k_values":[]},{"clo_number":2,"description":"Design and simplify combinational logic circuits using\nK-Maps and MSI devices.","k_values":[]},{"clo_number":3,"description":"Analyze and design synchronous and asynchronous\nsequential circuits.","k_values":[]},{"clo_number":4,"description":"Apply memory devices and programmable logic\nconcepts for real-time digital system applications.","k_values":[]},{"clo_number":5,"description":"Design digital circuits using HDL","k_values":[]}]}$r2025_45_clos$::jsonb,
	$r2025_45_content${"units":[{"unit_id":"I","unit_title":"Digital Fundamentals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Number Systems – Decimal, Binary, Octal, Hexadecimal, 1‘s"},{"number":2,"title":"and 2‘s complements, Codes – Binary, BCD, Excess 3, Gray, Alphanumeric codes,"},{"number":3,"title":"Boolean theorems, Logic gates, Universal gates, Sum of products and product of"},{"number":4,"title":"sums, Min terms and Max terms, Karnaugh map Minimization and QuineMcCluskey"},{"number":5,"title":"method of minimization."}]}],"remarks":""},{"unit_id":"II","unit_title":"Combinational Logic Design","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Design of Half and Full Adders, Half and Full"},{"number":2,"title":"Subtractors, Binary Parallel Adder – Carry look ahead Adder, BCD Adder, Binary"},{"number":3,"title":"Multiplier, Multiplexer, Demultiplexer, Magnitude Comparator, Decoder, Encoder,"}]}],"remarks":""},{"unit_id":"III","unit_title":"Priority Encoder","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"IV","unit_title":"Synchronous Sequential Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Flip flops – SR, JK, T, D, Master/Slave. FF"},{"number":2,"title":"operation and excitation tables, Triggering of FF, Analysis and design of clocked"},{"number":3,"title":"sequential circuits – Moore/Mealy models, state minimization, state assignment,"},{"number":4,"title":"circuit implementation – Design of Counters- Ripple Counters: Binary, BCD, Modulo"},{"number":5,"title":"n, Up/Down counters-Counter for Random Sequence - Shift registers: -"},{"number":6,"title":"UniversalShiftRegister–SynchronouscountersRingcounter–Johnsoncounter."}]}],"remarks":""},{"unit_id":"V","unit_title":"Asynchronous Sequential Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Analysis and Design of Asynchronous"},{"number":2,"title":"Sequential Circuits-Reduction of Flow Tables- Stable and Unstable states, state"},{"number":3,"title":"reduction, output specifications, cycles and races, race free assignments, Hazards:"},{"number":4,"title":"Essential Hazards, Pulse mode sequential circuits, Design of Hazard free circuits"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Memory and Programmable Logic Devices","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"ROM -PROM – EPROM – EEPROM"},{"number":2,"title":"–EAPROM, RAM –- Programmable Logic Devices – Programmable Logic Array"},{"number":3,"title":"(PLA) - Programmable Array Logic (PAL) – Field Programmable Gate Arrays (FPGA)"},{"number":4,"title":"Implementation of combinational logic circuits using PLA, PAL,CPLD’s. TTL and"}]}],"remarks":""},{"unit_id":"VII","unit_title":"CMOS Logic families","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VIII","unit_title":"Hardware Description Language","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to Verilog: Structure of Verilog"},{"number":2,"title":"module, Operators, data types, Styles of description- Data flow description,"},{"number":3,"title":"Implement logic gates, half adder and full adder using Verilog data flow description."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Behavioral description","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Structure, variable assignment statement, sequential"},{"number":2,"title":"statements, loop statements, Verilog behavioral description of Multiplexers"},{"number":3,"title":"(2:1,4:1,8:1) and De-multiplexers -Encoders (8 to 3), Decoders (2 to 4). latches-"},{"number":4,"title":"flipflops ."}]}],"remarks":""}]}$r2025_45_content$::jsonb,
	$r2025_45_books${"primary":[],"references":[]}$r2025_45_books$::jsonb,
	$r2025_45_web${"resources":[]}$r2025_45_web$::jsonb,
	$r2025_45_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_45_ped$::jsonb,
	$r2025_45_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO5","pos":{},"psos":{"PSO2":"2"}}]}$r2025_45_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25301-DIGITAL ELECTRONICS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25302 | ELECTRIC CIRCUIT ANALYSIS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25302'))
		LIMIT 1
	),
	'EE25302', 'ELECTRIC CIRCUIT ANALYSIS',
	$r2025_46_obj${"objectives":[{"number":1,"description":"To Apply the basic circuit solving techniques for both AC and DC circuits. To know the applications of various network theorems, transient analysis. Resonance, two port networks and Three phase circuits Introduction to DC And AC Circuits: Types of sources, Review of Mesh and Nodal Analysis. Mesh and Nodal analysis with dependent sources applied to DC and AC Circuits- Super mesh and Super node analysis applied to DC and AC Circuits. Locus Diagrams. Phasors and AC Steady State Analysis: Concept of phasors, phasor relationships for R, L and C, Concept of impedance and admittance, sinusoidal steady state analysis using phasors, phasor diagrams. Network Reduction Techniques: Review of Series parallel circuits; star and delta transformation. Network Theorems: Superposition, Reciprocity, Compensation, Thevenin’s, Norton’s and Maximum Power Transfer Theorems; Analysis with dependent and independent sources- Application to DC and AC networks. Solution of First and Second Order Networks: Solution of first and second order differential equations for Series and Parallel R-L, R- C, R-L-C circuits, initial and final conditions in network elements, forced and free response, time constants, steady state and transient state response. Application of Laplace transforms and inverse Laplace transforms for electrical circuits. Resonance and Two Port Networks: Resonant circuits-series, parallel, series-parallel circuits-effect of variation of Q on resonance. Relations between circuit parameters- Q, resonant frequency and bandwidth. Two Port Networks, terminal pairs, relationship of two port variables, impedance parameters, admittance parameters, transmission parameters and hybrid parameters, interconnections of two port networks"}]}$r2025_46_obj$::jsonb,
	$r2025_46_clos${"clos":[{"clo_number":1,"description":"Apply basic circuit analysis techniques to solve DC and\nAC circuits using mesh and nodal methods.","k_values":[]},{"clo_number":2,"description":"Analyze electrical networks using network theorems\nand reduction techniques.","k_values":[]},{"clo_number":3,"description":"Evaluate transient and steady-state responses of first\nand second order circuits using differential equations\nand Laplace transforms.","k_values":[]},{"clo_number":4,"description":"Analyze resonance phenomena and two-port network\nparameters in electrical circuits.","k_values":[]},{"clo_number":5,"description":"Analyze balanced and unbalanced three-phase\ncircuits and apply concepts to practical power systems.","k_values":[]}]}$r2025_46_clos$::jsonb,
	$r2025_46_content${"units":[{"unit_id":"I","unit_title":"Three Phase Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Three phase balanced / unbalanced circuits, phase sequence – analysis of three"},{"number":2,"title":"phase 3-wire and 4-wire circuits with star and delta connected loads, balanced & un"},{"number":3,"title":"balanced loads – phasor diagram of voltages and currents – power and power factor"},{"number":4,"title":"measurements in three phase circuits."}]}],"remarks":""}]}$r2025_46_content$::jsonb,
	$r2025_46_books${"primary":[],"references":[{"title":"Nahvi, M., & Edminister, J. A. (2009). Electric circuits (4th ed., Schaum’s","author":""},{"title":"Alexander, C. K., & Sadiku, M. N. O. (2013). Fundamentals of electric circuits","author":""},{"title":"Rahmani-Andebili, M. (2020). DC electrical circuit analysis: Practice problems,","author":""},{"title":"Sudhakar, A., & Shyammohan, S. P. (2015). Circuits and Networks: Analysis","author":""},{"title":"\"Engineering Circuit Analysis\" by Hayt, Kemmerle, 9th edition,2020","author":""}]}$r2025_46_books$::jsonb,
	$r2025_46_web${"resources":[{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/108/104/108104139/"},{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/108/104/108104139/"}]}$r2025_46_web$::jsonb,
	$r2025_46_ped${"methods":["Quiz and gamification","Project (15%)","Assignment Programs (25%)"]}$r2025_46_ped$::jsonb,
	$r2025_46_po${"mappings":[{"co_id":"CO1","pos":{},"psos":{"PSO1":"2"}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO5","pos":{},"psos":{"PSO1":"3"}}]}$r2025_46_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25302-ELECTRIC CIRCUIT ANALYSIS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25303 | ELECTRIC CIRCUIT LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25303'))
		LIMIT 1
	),
	'EE25303', 'ELECTRIC CIRCUIT LABORATORY',
	$r2025_47_obj${"objectives":[{"number":1,"description":"To develop hands-on skills in designing and analyzing electronic circuits including amplifiers, oscillators, and related applications."}]}$r2025_47_obj$::jsonb,
	$r2025_47_clos${"clos":[{"clo_number":1,"description":"Define and explain the operation of diode circuits,\ntransistor biasing, amplifiers, feedback systems,\noscillators, and power amplifiers.\n- -","k_values":[]},{"clo_number":2,"description":"Apply circuit principles to design and implement\nrectifiers, filters, biasing circuits, amplifiers, and\noscillators using simulation tools.","k_values":[]},{"clo_number":3,"description":"Analyze the performance of electronic circuits in terms\nof gain, frequency response, stability, and efficiency.","k_values":[]},{"clo_number":4,"description":"Design and evaluate advanced circuit behavior,\nincluding feedback effects, distortion, and power\namplifier performance under practical conditions.","k_values":[]}]}$r2025_47_clos$::jsonb,
	$r2025_47_content${"units":[{"unit_id":"I","unit_title":"List of Experiments","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"1. Study and simulation of clipper and clamper circuits."},{"number":2,"title":"2. Design and analysis of rectifiers (HWR, FWR, Bridge) with filters."},{"number":3,"title":"3. Design of Zener diode voltage regulator and power supply."},{"number":4,"title":"4. Design and analysis of BJT biasing circuits and RC-coupled amplifier."},{"number":5,"title":"5. Design and analysis of MOSFET biasing circuits."},{"number":6,"title":"6. Implementation of common source (CS), common drain (CD), and common gate"},{"number":7,"title":"(CG) amplifiers."},{"number":8,"title":"7. Frequency response analysis of BJT/FET amplifiers."},{"number":9,"title":"8. Design and simulation of RC phase shift and Wien bridge oscillators."},{"number":10,"title":"9. Study of multivibrator circuits (Astable and Monostable)."},{"number":11,"title":"10. Analysis of Class A and Class B power amplifiers with efficiency calculation."}]}],"remarks":""},{"unit_id":"II","unit_title":"Tools Required","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Diodes, IC- Resistors, Capacitor, LT spice open-source software,"},{"number":2,"title":"Regulated power supply, Digital storage oscilloscope."}]}],"remarks":""}]}$r2025_47_content$::jsonb,
	$r2025_47_books${"primary":[],"references":[{"author":"Sedra, A. S., & Smith, K. C.","title":"Microelectronic Circuits (Oxford University Press)"},{"author":"Boylestad, R. L., & Nashelsky, L.","title":"Electronic Devices and Circuit Theory"},{"author":"Neamen, D. A.","title":"Microelectronics: Circuit Analysis and Design (McGraw-Hill)"},{"author":"Razavi, B.","title":"Fundamentals of Microelectronics (Wiley)"}]}$r2025_47_books$::jsonb,
	$r2025_47_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/108102112"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"},{"title":"ngspice.sourceforge.io","url":"https://ngspice.sourceforge.io/"}]}$r2025_47_web$::jsonb,
	$r2025_47_ped${"methods":["Project (30%)","Assignment (10%)","Practical (30%)","Internal"]}$r2025_47_ped$::jsonb,
	$r2025_47_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3","PSO3":"2"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO3":"3"}}]}$r2025_47_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EC25C09 -Electronic Circuit Laboratory.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25401 | TRANSMISSION AND DISTRIBUTION
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25401'))
		LIMIT 1
	),
	'EE25401', 'TRANSMISSION AND DISTRIBUTION',
	$r2025_48_obj${"objectives":[{"number":1,"description":"This course introduces fundamental concepts and analysis of electrical power transmission and distribution systems. It covers modeling of transmission lines for AC and DC, including calculation of inductance and capacitance for various conductor configurations. Sag and tension calculations under different environmental conditions are discussed in detail. The course also examines types overhead line insulators used for different voltage levels, potential distribution, corona effects with mitigation techniques and underground cables. Overall, this course equips students with essential analytical skills for reliable power delivery."}]}$r2025_48_obj$::jsonb,
	$r2025_48_clos${"clos":[{"clo_number":1,"description":"Explain transmission line modeling and compute\nresistance, inductance and capacitance for various\nconductor configurations.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze performance of transmission lines using\ndifferent models and evaluate parameters such as\nvoltage regulation, efficiency and ABCD constants.","k_values":[]},{"clo_number":3,"description":"Apply mechanical design concepts including sag and\ntension calculations, and analyze insulators and\ncorona effects.","k_values":[]},{"clo_number":4,"description":"Evaluate underground cables and AC distribution\nsystems for efficient and reliable power delivery.","k_values":[]}]}$r2025_48_clos$::jsonb,
	$r2025_48_content${"units":[{"unit_id":"I","unit_title":"Modeling of Transmission Lines","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"AC and DC transmission systems, Resistance,"},{"number":2,"title":"Inductance and Capacitance Calculations, Single phase transmission lines, two wire"},{"number":3,"title":"system and composite conductors, Three phase transmission lines with"},{"number":4,"title":"unsymmetrical spacing, transposition of conductors, double circuit line, Bundled"},{"number":5,"title":"conductors Skin effect, Proximity effect."}]}],"remarks":""},{"unit_id":"II","unit_title":"Performance of Transmission Lines","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Short, Medium and Long transmission lines"},{"number":2,"title":"with Nominal-T, π and rigorous methods, ABCD constants, Power Circle diagram,"},{"number":3,"title":"Ferranti effect, Compensators - Series and Shunt."}]}],"remarks":""},{"unit_id":"III","unit_title":"Sag and Tension Calculations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Overview of mechanical design aspects, Line"},{"number":2,"title":"Supports, Types of poles and towers, Classification and selection criteria, Sag and"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Tension Calculations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Supports at equal heights, Supports at unequal heights,"},{"number":2,"title":"Effects of wind and ice loading on conductor weight, Use of sag templates and safety"},{"number":3,"title":"clearances."}]}],"remarks":""},{"unit_id":"V","unit_title":"Insulators and Concepts of Corona","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Overhead line insulators, Types of Insulators,"},{"number":2,"title":"Methods of Improving String Efficiency. Corona – mitigation methods, Grounding"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Underground Cables","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Underground cables - Construction and types - Single core"},{"number":2,"title":"and multi core cables -Capacitance, Insulation resistance, Electric stresses and"},{"number":3,"title":"Dielectric loss – Grading of Cables, Capacitance Grading and Inter-sheath Grading."}]}],"remarks":""},{"unit_id":"VII","unit_title":"AC Distribution Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Voltage Drop Calculations in AC Distributors for the"},{"number":2,"title":"following cases: Power Factors referred to receiving end voltage and with respect"},{"number":3,"title":"to respective load voltages."},{"number":4,"title":"Tasks:"},{"number":5,"title":"T1: Compare AC and DC transmission systems with advantages and"},{"number":6,"title":"disadvantages."},{"number":7,"title":"T2: Derive inductance equations for:"},{"number":8,"title":"Single-phase two-wire systems"}]}],"remarks":""}]}$r2025_48_content$::jsonb,
	$r2025_48_books${"primary":[],"references":[{"title":"Kothari, D. P., & Nagrath, I. J. (2019). Power system engineering (3rd ed.).","author":""},{"title":"Singh, S. N. (2008). Electric power generation, transmission and distribution","author":""},{"title":"Wadhwa, C. L. (2010). Electrical power system (6th ed.). New Age","author":""},{"title":"Hardy, J. B., & Bayliss, C. R. (2011). Transmission and distribution in","author":""},{"title":"Wadhwa, C. L. (2006). Generation, distribution and utilization of electrical","author":""}]}$r2025_48_books$::jsonb,
	$r2025_48_web${"resources":[]}$r2025_48_web$::jsonb,
	$r2025_48_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_48_ped$::jsonb,
	$r2025_48_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}}]}$r2025_48_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25401-TRANSMISSION AND DISTRIBUTION.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25402 | DC MACHINES AND TRANSFORMERS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25402'))
		LIMIT 1
	),
	'EE25402', 'DC MACHINES AND TRANSFORMERS',
	$r2025_49_obj${"objectives":[{"number":1,"description":"To educate the students about the concept of electromechanical energy conversion system , construction and different types of DC generator and its characteristics. To impart knowledge on the principle of operation, starting and speed control methods of DC motor. To facilitate the students regarding the working principle of single phase Transformers and various tests involved . To make the students to understand the working of auto transformer and three phase transformers."}]}$r2025_49_obj$::jsonb,
	$r2025_49_clos${"clos":[{"clo_number":1,"description":"Explain principles of electromechanical energy\nconversion and magnetic circuits.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze the performance and characteristics of DC\ngenerators under various operating conditions.","k_values":[]},{"clo_number":3,"description":"Evaluate the operation, control, and testing methods\nof DC motors.","k_values":[]},{"clo_number":4,"description":"Analyze single-phase, auto, and three-phase\ntransformers including testing, performance, and\napplications.","k_values":[]}]}$r2025_49_clos$::jsonb,
	$r2025_49_content${"units":[{"unit_id":"I","unit_title":"Electro Mechanical Energy Conversion","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principle of Energy conversion – Review"},{"number":2,"title":"of magnetic circuit–Faraday's law of induced EMF - Hysteresis and Eddy Current"},{"number":3,"title":"losses – AC operation of magnetic circuits - Singly and Doubly Excited magnetic field"},{"number":4,"title":"systems – Torque production in rotating machines"}]}],"remarks":""},{"unit_id":"II","unit_title":"DC Generators","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principle of operation, constructional details, armature windings and"},{"number":2,"title":"its types, EMF equation, armature reaction, demagnetizing and cross magnetizing"},{"number":3,"title":"Ampere turns, compensating winding, commutation, methods of improving"},{"number":4,"title":"commutation, interpoles, OCC and load characteristics of different types of DC"},{"number":5,"title":"Generators. Parallel operation of DC Generators, equalizing connections -"},{"number":6,"title":"applications of DC Generators."}]}],"remarks":""},{"unit_id":"III","unit_title":"DC Motors","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principle of operation, significance of back emf, torque equations and"},{"number":2,"title":"power developed by armature, speed control of DC motors, starting methods of DC"},{"number":3,"title":"motors, load characteristics of DC motors, losses and efficiency in DC machine,"},{"number":4,"title":"condition for maximum efficiency. -applications of DC motors."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Testing of DC Machines","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Brake test, Swinburne’s test, Hopkinson's test, Field test,"}]}],"remarks":""},{"unit_id":"V","unit_title":"Retardation test, Separation of core losses -","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VI","unit_title":"Single Phase Transformers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Construction and principle of operation, equivalent"},{"number":2,"title":"circuit, phasor diagrams, testing - polarity test, open circuit and short circuit tests,"},{"number":3,"title":"voltage regulation, losses and efficiency, all day efficiency, back-to- back test,"},{"number":4,"title":"separation of core losses, parallel operation of single-phase transformers,"},{"number":5,"title":"applications of single-phase transformer."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Auto Transformer and Three Phase Transformer","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Construction and working of"},{"number":2,"title":"auto transformer, comparison with two winding transformers, applications of"},{"number":3,"title":"autotransformer. Three Phase Transformer - Construction, types of connections and"},{"number":4,"title":"their comparative features, Scott connection, applications of Scott connection."},{"number":5,"title":"Tasks:"},{"number":6,"title":"T1. Analyze series and parallel magnetic circuits."},{"number":7,"title":"T2:Observe effect of: Flux variation, Number of turns, Frequency in Faraday’s Law of"},{"number":8,"title":"Induced EMF"}]}],"remarks":""}]}$r2025_49_content$::jsonb,
	$r2025_49_books${"primary":[],"references":[{"title":"Kothari, D. P., & Nagrath, I. L. (2021). Electric machines (5th ed., fully revised).","author":""},{"title":"Bimbhra, P. S. (2021). Electrical machinery (2nd ed.). Khanna Publishers.","author":""},{"title":"Fitzgerald, A. E., & Kingsley, C. (2017). Electric machinery (6th ed.). McGraw Hill","author":""},{"title":"Clayton, A. E., & Hancock, N. N. (2018). Performance and design of DC machines.","author":""},{"title":"Say, M. G. (2008). Performance and design of AC machines (1st ed.). CBS","author":""}]}$r2025_49_books$::jsonb,
	$r2025_49_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/Electrical"}]}$r2025_49_web$::jsonb,
	$r2025_49_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_49_ped$::jsonb,
	$r2025_49_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}}]}$r2025_49_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25402 -DC MACHINES AND TRANSFORMERS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25403 | DC MACHINES AND TRANSFORMERS LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25403'))
		LIMIT 1
	),
	'EE25403', 'DC MACHINES AND TRANSFORMERS LABORATORY',
	$r2025_50_obj${"objectives":[{"number":1,"description":"To educate the students about the concept of electromechanical energy conversion system , construction and different types of DC generator and its characteristics. To impart knowledge on the principle of operation, starting and speed control methods of DC motor. To facilitate the students regarding the working principle of single phase Transformers and various tests involved . To make the students to understand the working of auto transformer and three phase transformers."}]}$r2025_50_obj$::jsonb,
	$r2025_50_clos${"clos":[{"clo_number":1,"description":"Explain principles of electromechanical energy\nconversion and magnetic circuits.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze the performance and characteristics of DC\ngenerators under various operating conditions.","k_values":[]},{"clo_number":3,"description":"Evaluate the operation, control, and testing methods\nof DC motors.","k_values":[]},{"clo_number":4,"description":"Analyze single-phase, auto, and three-phase\ntransformers including testing, performance, and\napplications.","k_values":[]}]}$r2025_50_clos$::jsonb,
	$r2025_50_content${"units":[{"unit_id":"I","unit_title":"Electro Mechanical Energy Conversion","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principle of Energy conversion – Review"},{"number":2,"title":"of magnetic circuit–Faraday's law of induced EMF - Hysteresis and Eddy Current"},{"number":3,"title":"losses – AC operation of magnetic circuits - Singly and Doubly Excited magnetic field"},{"number":4,"title":"systems – Torque production in rotating machines"}]}],"remarks":""},{"unit_id":"II","unit_title":"DC Generators","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principle of operation, constructional details, armature windings and"},{"number":2,"title":"its types, EMF equation, armature reaction, demagnetizing and cross magnetizing"},{"number":3,"title":"Ampere turns, compensating winding, commutation, methods of improving"},{"number":4,"title":"commutation, interpoles, OCC and load characteristics of different types of DC"},{"number":5,"title":"Generators. Parallel operation of DC Generators, equalizing connections -"},{"number":6,"title":"applications of DC Generators."}]}],"remarks":""},{"unit_id":"III","unit_title":"DC Motors","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principle of operation, significance of back emf, torque equations and"},{"number":2,"title":"power developed by armature, speed control of DC motors, starting methods of DC"},{"number":3,"title":"motors, load characteristics of DC motors, losses and efficiency in DC machine,"},{"number":4,"title":"condition for maximum efficiency. -applications of DC motors."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Testing of DC Machines","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Brake test, Swinburne’s test, Hopkinson's test, Field test,"}]}],"remarks":""},{"unit_id":"V","unit_title":"Retardation test, Separation of core losses -","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VI","unit_title":"Single Phase Transformers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Construction and principle of operation, equivalent"},{"number":2,"title":"circuit, phasor diagrams, testing - polarity test, open circuit and short circuit tests,"},{"number":3,"title":"voltage regulation, losses and efficiency, all day efficiency, back-to- back test,"},{"number":4,"title":"separation of core losses, parallel operation of single-phase transformers,"},{"number":5,"title":"applications of single-phase transformer."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Auto Transformer and Three Phase Transformer","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Construction and working of"},{"number":2,"title":"auto transformer, comparison with two winding transformers, applications of"},{"number":3,"title":"autotransformer. Three Phase Transformer - Construction, types of connections and"},{"number":4,"title":"their comparative features, Scott connection, applications of Scott connection."},{"number":5,"title":"Tasks:"},{"number":6,"title":"T1. Analyze series and parallel magnetic circuits."},{"number":7,"title":"T2:Observe effect of: Flux variation, Number of turns, Frequency in Faraday’s Law of"},{"number":8,"title":"Induced EMF"}]}],"remarks":""}]}$r2025_50_content$::jsonb,
	$r2025_50_books${"primary":[],"references":[{"title":"Kothari, D. P., & Nagrath, I. L. (2021). Electric machines (5th ed., fully revised).","author":""},{"title":"Bimbhra, P. S. (2021). Electrical machinery (2nd ed.). Khanna Publishers.","author":""},{"title":"Fitzgerald, A. E., & Kingsley, C. (2017). Electric machinery (6th ed.). McGraw Hill","author":""},{"title":"Clayton, A. E., & Hancock, N. N. (2018). Performance and design of DC machines.","author":""},{"title":"Say, M. G. (2008). Performance and design of AC machines (1st ed.). CBS","author":""}]}$r2025_50_books$::jsonb,
	$r2025_50_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/Electrical"}]}$r2025_50_web$::jsonb,
	$r2025_50_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_50_ped$::jsonb,
	$r2025_50_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}}]}$r2025_50_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25402 -DC MACHINES AND TRANSFORMERS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25404 | LINEAR INTEGRATED CIRCUITS LABORATORY
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25404'))
		LIMIT 1
	),
	'EE25404', 'LINEAR INTEGRATED CIRCUITS LABORATORY',
	$r2025_51_obj${"objectives":[{"number":1,"description":"A linear integrated circuit is a solid-state analog device capable of operating across a continuous range of input levels, offering theoretically infinite operating states. These circuits are commonly used in applications such as audio amplifiers, analog-to-digital converters, averaging amplifiers, differentiators, DC amplifiers, integrators, multivibrators, oscillators, audio filters, and sweep generators."}]}$r2025_51_obj$::jsonb,
	$r2025_51_clos${"clos":[{"clo_number":1,"description":"Explain the fabrication, classification, and basic\nconcepts of integrated circuits including op-amps and\nlinear ICs.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze and design basic operational amplifier circuits\nsuch as inverting, non-inverting, summing, differential,\nintegrator, and differentiator circuits.","k_values":[]},{"clo_number":3,"description":"Design and implement advanced op-amp applications\nincluding precision rectifiers, instrumentation\namplifiers, and active filters.","k_values":[]},{"clo_number":4,"description":"Understand and apply the working principles of D/A\nand A/D converters, PLL, and other linear IC\napplications.","k_values":[]}]}$r2025_51_clos$::jsonb,
	$r2025_51_content${"units":[{"unit_id":"I","unit_title":"Introduction","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Integrated circuits – Classification, Thin and thick film techniques,"},{"number":2,"title":"SMT(Surface Mount Technology) Monolithic technique - wafer preparation, Epitaxial"},{"number":3,"title":"growth, Oxidation, Photolithography, Diffusion, Ion Implantation, Isolation,"},{"number":4,"title":"Metallization and Packaging, Fabrication of Integrated resistors, capacitors and"},{"number":5,"title":"inductors -Bipolar and MOSFET devices fabrication techniques"}]}],"remarks":""},{"unit_id":"II","unit_title":"Operational Amplifier","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Basic concepts"},{"number":2,"title":"differential amplifiers"},{"number":3,"title":"block diagram-ideal"},{"number":4,"title":"op-amp parameters - Basic op-amp applications Scale changer, Inverting and non-"},{"number":5,"title":"inverting amplifiers, summer and subtractor, Log and antilog amplifiers - multiplier,"},{"number":6,"title":"Divider, differentiator, Integrator. Instrumentation amplifier"}]}],"remarks":""},{"unit_id":"III","unit_title":"OP-Amp Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"V to I and I to V converters- Precision rectifier-Clipper and"},{"number":2,"title":"clamper- Sample and hold circuits - Active filters: first order and second order LPF"},{"number":3,"title":"and HPF- Band Pass and Band Reject Filters - Comparators - Regenerative"},{"number":4,"title":"comparator (Schmitt Trigger)- Square wave and Triangular wave generators- Sine"},{"number":5,"title":"wave generators: RC Phase shift and Wein bridge oscillators."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Other Linear ICS","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"IC voltage regulators – Fixed and Variable voltage regulators-"},{"number":2,"title":"78XX and 79XX series regulators, LM317 voltage regulator -Switching Regulator- 555"},{"number":3,"title":"timer IC: Astable and Monostable modes – Phase locked loop - Operation,"},{"number":4,"title":"Characteristics & Application."}]}],"remarks":""},{"unit_id":"V","unit_title":"D/A and A/D Converters","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"weighted resistor and R-2R ladder- A/D converters:"},{"number":2,"title":"Successive approximation, Counter type, Flash type and Delta-sigma-"},{"number":3,"title":"T1: Classification of Integrated Circuits"},{"number":4,"title":"Compare:"},{"number":5,"title":"o Analog ICs"},{"number":6,"title":"o Digital ICs"},{"number":7,"title":"o Mixed signal ICs"},{"number":8,"title":"Explain applications of each category"},{"number":9,"title":"T2: Thin Film and Thick Film Techniques"},{"number":10,"title":"Differentiate between:"},{"number":11,"title":"o Thin film IC fabrication"},{"number":12,"title":"o Thick film IC fabrication"}]}],"remarks":""}]}$r2025_51_content$::jsonb,
	$r2025_51_books${"primary":[],"references":[{"title":"Roy Choudhury, D., & Jain, S. B. (2018). Linear integrated circuits (5th ed.). Wiley","author":""},{"title":"Gayakwad, R. A. (2015). Op-amps and linear integrated circuits (4th ed.). Pearson","author":""},{"title":"Botkar, K. R. (2008). Integrated circuits (10th ed.). Hanna Publishers.","author":""},{"title":"Millman, J., & Halkias, C. C. (2017). Integrated electronics (2nd ed.). McGraw Hill","author":""},{"title":"Driscoll, F. F., & Coughlin, R. F. (1997). Operational amplifiers and linear","author":""}]}$r2025_51_books$::jsonb,
	$r2025_51_web${"resources":[]}$r2025_51_web$::jsonb,
	$r2025_51_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_51_ped$::jsonb,
	$r2025_51_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}}]}$r2025_51_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C09-LINEAR INTEGRATED CIRCUITS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25C01 | BASICELECTRICALANDELECTRONICS ENGINEERING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25C01'))
		LIMIT 1
	),
	'EE25C01', 'BASICELECTRICALANDELECTRONICS ENGINEERING',
	$r2025_52_obj${"objectives":[{"number":1,"description":"To impart foundational knowledge in principles and applications of electrical and electronics engineering."}]}$r2025_52_obj$::jsonb,
	$r2025_52_clos${"clos":[{"clo_number":1,"description":"Understand and explain basic electrical and\nelectronic concepts.","k_values":[]},{"clo_number":2,"description":"Apply and analyse electrical circuits in real-time\napplications.","k_values":[]},{"clo_number":3,"description":"Identify and utilise key electronic devices used in\nengineering applications","k_values":[]}]}$r2025_52_clos$::jsonb,
	$r2025_52_content${"units":[{"unit_id":"I","unit_title":"DC Fundamentals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Current and Voltage sources, Resistance, Inductance and"},{"number":2,"title":"Capacitance; Ohm’s law, Kirchhoff’s law, Series parallel combination of R, L and C"},{"number":3,"title":"components, Voltage Divider and Current Divider Rules."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual Demonstration of electrical laws & circuits, Hands-on"},{"number":2,"title":"Breadboarding, Solving GATE questions."}]}],"remarks":""},{"unit_id":"III","unit_title":"AC Fundamentals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Faraday’s Laws of Electro-magnetic Induction, Definition of Self"},{"number":2,"title":"and Mutual Inductances, Generation of sinusoidal voltage, Instantaneous & RMS"},{"number":3,"title":"values of sinusoidal signals, Introduction to 3-phase systems, Electrical Safety, Fuses"},{"number":4,"title":"and Earthing."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual Demonstration of electromagnetic induction, Measurement of"},{"number":2,"title":"instantaneous and RMS values of AC signals, Solving GATE questions."}]}],"remarks":""},{"unit_id":"V","unit_title":"Electric Machines","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"DC Machines, Transformers, Star and delta Connections, Three"},{"number":2,"title":"phase Induction motors, Synchronous Generators, Single Phase Induction Motors,"},{"number":3,"title":"Stepper Motor, Universal Motor and BLDC motor."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of step-up and step-down transformers, Virtual"},{"number":2,"title":"working models of Universal and BLDC motors, Solving GATE questions."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Semiconductor Devices","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"PN junction diodes, Zener Diode, Voltage regulator, BJT &"},{"number":2,"title":"FET Transistors, Timers, Operational Amplifiers."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of V-I characteristics of PN junction and Zener diodes"},{"number":2,"title":"using simulation, inverting/non-inverting amplifiers, Solving GATE questions."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Digital Electronics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Boolean algebra, Basic and Universal Gates, adders,"},{"number":2,"title":"multiplexers, demultiplexers and flip-flops."},{"number":3,"title":"Activity: Online logic gate simulators, Solving GATE questions."}]}],"remarks":""},{"unit_id":"X","unit_title":"Microcontrollers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction, Architecture, Potential Applications."}]}],"remarks":""},{"unit_id":"XI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Physical demonstration of a microcontroller and online simulation of"},{"number":2,"title":"microcontroller."}]}],"remarks":""}]}$r2025_52_content$::jsonb,
	$r2025_52_books${"primary":[],"references":[]}$r2025_52_books$::jsonb,
	$r2025_52_web${"resources":[{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/108/106/108106172/"},{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/108/106/108106172/"},{"title":"falstad.com","url":"https://www.falstad.com/circuit/"},{"title":"falstad.com","url":"https://www.falstad.com/circuit/"}]}$r2025_52_web$::jsonb,
	$r2025_52_ped${"methods":["Quiz and gamification","Assignments (25%)","GATE Questions (20%)"]}$r2025_52_ped$::jsonb,
	$r2025_52_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3","PO2":"1"},"psos":{"PSO1":"2"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"2"}}]}$r2025_52_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C01 Basic Electrical and Electronics Engineering.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25C03 | FUNDAMENTALS OF ELECTRICAL AND ELECTRONICS ENGINEERING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25C03'))
		LIMIT 1
	),
	'EE25C03', 'FUNDAMENTALS OF ELECTRICAL AND ELECTRONICS ENGINEERING',
	$r2025_53_obj${"objectives":[{"number":1,"description":"To impart the foundational concepts of electrical circuits and digital electronics in various applications"}]}$r2025_53_obj$::jsonb,
	$r2025_53_clos${"clos":[{"clo_number":1,"description":"Explain core electrical engineering\nconcepts.","k_values":[]},{"clo_number":2,"description":"Apply basic engineering calculations in\nelectrical systems.","k_values":[]},{"clo_number":3,"description":"Identify common various components\nand its applications in various electrical\ncircuits","k_values":[]}]}$r2025_53_clos$::jsonb,
	$r2025_53_content${"units":[{"unit_id":"I","unit_title":"DC Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"DC Circuits: Circuit Components: Resistor, Inductor, Capacitor,"},{"number":2,"title":"Independent and Dependent Sources, Ohm’s Law, Kirchhoff’s Laws, Series and"}]}],"remarks":""},{"unit_id":"II","unit_title":"Parallel Circuits, Simple problems","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"III","unit_title":"AC Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to AC Circuits (R, RL, RLC) and Parameters: Waveforms,"},{"number":2,"title":"Average value, RMS Value, Peak Value, Form Factor, Power factor."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Magnetic Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to Magnetic Circuits, Types -Basic definitions, Flux"},{"number":2,"title":"Linkage, Inductance, fringing, Properties of Magnetic materials, AC excitation,"},{"number":3,"title":"Hysteresis and Eddy Current losses. Analysis of simple composite magnetic circuits-"}]}],"remarks":""},{"unit_id":"V","unit_title":"Simple Problems, Applications of Magnetic circuits","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VI","unit_title":"Basics of Power Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction, Types of Distribution Systems, Generation:"},{"number":2,"title":"Hydro, Thermal, Atomic, Wind and Solar power plants (Qualitative Analysis) One-line"},{"number":3,"title":"diagram, Operating voltages in Power Systems."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Domestic Wiring","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Types of Domestic wiring, Cleat, Wooden/PVC, Toughened"},{"number":2,"title":"Rubber Sheath and Conduit wiring. Specifications of Wires, Types of Cables, Earthing"},{"number":3,"title":"system, Fuses and HRC fuses, Conductor and Insulating Materials, Classification,"},{"number":4,"title":"Properties."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Analog And Digital Electronics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Operation and Characteristics of electronic"},{"number":2,"title":"devices: PN Junction Diodes, Zener Diode and BJT. Applications: Diode Bridge"},{"number":3,"title":"Rectifier and Shunt Regulator. Digital Electronics: Basics Logic Gates-Flip Flops."}]}],"remarks":""}]}$r2025_53_content$::jsonb,
	$r2025_53_books${"primary":[],"references":[{"title":"Del Toro. (2022). Electrical engineering fundamentals. Pearson Education.","author":""},{"title":"Ghosh, S. (2010). Fundamentals of electrical and electronics engineering.","author":""},{"title":"Prasad, R. (2014). Fundamentals of electrical engineering. Prentice Hall of India.","author":""},{"title":"Sharma, S. (2019). Basics of electrical engineering. Wiley.","author":""},{"title":"Wadhwa, C. L. (2007). Fundamentals of electrical engineering. New Age","author":""},{"title":"Mittal, V., & Mittal, A. (2017). Basic electrical engineering. McGraw Hill.","author":""}]}$r2025_53_books$::jsonb,
	$r2025_53_web${"resources":[]}$r2025_53_web$::jsonb,
	$r2025_53_ped${"methods":["Quiz and gamification","Assignments (40%)","Internal"]}$r2025_53_ped$::jsonb,
	$r2025_53_po${"mappings":[{"co_id":"CO1","pos":{},"psos":{"PSO1":"1","PSO3":"1"}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2","PSO3":"1"}},{"co_id":"CO3","pos":{"PO2":"3"},"psos":{"PSO1":"1","PSO3":"1"}}]}$r2025_53_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C03-FEEE.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25C04 | BASIC ELECTRONICS AND ELECTRICAL ENGINEERING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25C04'))
		LIMIT 1
	),
	'EE25C04', 'BASIC ELECTRONICS AND ELECTRICAL ENGINEERING',
	$r2025_54_obj${"objectives":[{"number":1,"description":"1. To introduce the fundamental concepts of electric, magnetic, and electromagnetic fields 2. To develop the ability to analyze field behavior, field distributions, and electromagnetic wave propagation using basic mathematical and engineering principles. 3. To enhance problem-solving and visualization skills through graphical representation, analytical methods, and practical applications of electromagnetics."}]}$r2025_54_obj$::jsonb,
	$r2025_54_clos${"clos":[{"clo_number":1,"description":"Apply vector calculus tools and coordinate systems to\nrepresent and analyze basic electromagnetic field\nquantities.\n- -","k_values":[]},{"clo_number":2,"description":"Apply electrostatic laws to determine electric field\nintensity, electric potential, capacitance, and dielectric\nbehavior in simple configurations.","k_values":[]},{"clo_number":3,"description":"Analyze magnetic fields and magnetic circuits using\nBiot–Savart law and Ampere’s circuital law.","k_values":[]},{"clo_number":4,"description":"Interpret Maxwell’s equations and explain the\nbehavior of time-varying electromagnetic fields and\ninduction phenomena. .","k_values":[]},{"clo_number":5,"description":"Describe electromagnetic wave propagation\ncharacteristics in free space and different media for\nbasic engineering applications","k_values":[]}]}$r2025_54_clos$::jsonb,
	$r2025_54_content${"units":[{"unit_id":"I","unit_title":"Electrostatics I","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Sources, effects and exposure limits of electromagnetic fields, Coordinate systems,"},{"number":2,"title":"Vector calculus-Gradient, Divergence and Curl, theorems and applications, Coulomb’s"},{"number":3,"title":"Law – Electric field intensity – Electric Field due to discrete and continuous charges –"},{"number":4,"title":"Gauss’s law and applications."},{"number":5,"title":"Activity: "},{"number":6,"title":"Graphical Representation and interpretation of fields (using Mathematical"}]}],"remarks":""},{"unit_id":"II","unit_title":"Development Tool)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Computation, graphical representation and interpretation of Vector addition,"},{"number":2,"title":"subtraction, multiplication - dot product and cross product in 2-D and 3-D Gradient"},{"number":3,"title":"fields, Divergence fields & Curl fields."}]}],"remarks":""},{"unit_id":"III","unit_title":"Electrostatics II","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Electric potential – Electric fields and equipotential plots, Uniform and Non-Uniform"},{"number":2,"title":"fields, Utilization factor – Electric field in free space, conductors, dielectric -Dielectric"},{"number":3,"title":"polarization – Dielectric strength , Electric fields in multiple dielectrics – Boundary"},{"number":4,"title":"conditions, capacitance, Energy density, Poisson’s and Laplace’s equations,"},{"number":5,"title":"Applications."},{"number":6,"title":"Activity: "},{"number":7,"title":"Sketch equipotential lines, E-field lines, and verify boundary conditions at dielectric"},{"number":8,"title":"interfaces for parallel plate, coaxial, and point charge geometries on graph paper."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Magnetostatics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Lorentz force, magnetic field intensity (H) – Biot– Savart’s Law"},{"number":2,"title":"Ampere’s Circuit Law-"},{"number":3,"title":"H due to straight conductors, circular loop, infinite sheet of current– Magnetic flux"},{"number":4,"title":"density (B) – B in free space, conductor, magnetic materials – Magnetization, Magnetic"},{"number":5,"title":"field in multiple media – Boundary conditions, Scalar and vector potential, Poisson’s"},{"number":6,"title":"Equation, Magnetic force, Torque, Inductance and mutual inductance, Energy density,"},{"number":7,"title":"Applications."}]}],"remarks":""}]}$r2025_54_content$::jsonb,
	$r2025_54_books${"primary":[],"references":[{"title":"Mathew N. O. Sadiku, S.V. Kulkarni, ‘Principles of Electromagnetics’, 6th Edition,","author":""},{"title":"Bhag Singh Guru and Hüseyin R. Hiziroglu “Electromagnetic field theory","author":""},{"title":"Joseph. A. Edminister, ‘Schaum’s Outline of Electromagnetics, Third Edition","author":""},{"title":"William H. Hayt and John A. Buck, ‘Engineering Electromagnetics’, Tata McGraw","author":""},{"title":"Kraus and Fleisch, ‘Electromagnetics with Applications’, McGraw Hill International","author":""},{"title":"Karl E.Lonngren, Sava V. Savov, Randy J. Jost, ‘Fundamentals of","author":""}]}$r2025_54_books$::jsonb,
	$r2025_54_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/111108066"}]}$r2025_54_web$::jsonb,
	$r2025_54_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_54_ped$::jsonb,
	$r2025_54_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO5","pos":{},"psos":{"PSO2":"3"}}]}$r2025_54_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C04-ELECTROMAGNETIC THEORY.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25C05 | ELECTRONIC DEVICES AND CIRCUITS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25C05'))
		LIMIT 1
	),
	'EE25C05', 'ELECTRONIC DEVICES AND CIRCUITS',
	$r2025_55_obj${"objectives":[{"number":1,"description":"The course introduces students to the physical principles and operational characteristics of electronic devices such as diodes, BJTs, and FETs. Through laboratory-integrated lectures, students will apply these concepts in designing and analyzing rectifiers, amplifiers, and switching circuits. The course emphasizes problem-solving and hands-on skills needed for analog circuit implementation."}]}$r2025_55_obj$::jsonb,
	$r2025_55_clos${"clos":[{"clo_number":1,"description":"Explain semiconductor physics and analyze the\ncharacteristics of diodes and their applications.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze and design BJT-based circuits including\nbiasing and single-stage amplifiers.","k_values":[]},{"clo_number":3,"description":"Analyze FET characteristics and design amplifier and\nswitching circuits using JFET and MOSFET.","k_values":[]},{"clo_number":4,"description":"Evaluate frequency response and design power\namplifiers for various applications.","k_values":[]},{"clo_number":5,"description":"Apply feedback concepts and design oscillators and\nelectronic circuits for practical implementations.","k_values":[]}]}$r2025_55_clos$::jsonb,
	$r2025_55_content${"units":[{"unit_id":"I","unit_title":"Semiconductor Physics and Diodes","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Energy bands, carrier generation and"},{"number":2,"title":"recombination, drift and diffusion currents. PN junction operation, ideal and real diode"},{"number":3,"title":"characteristics. Diode Applications: Rectifiers, clippers, clampers, and voltage"},{"number":4,"title":"regulators."}]}],"remarks":""},{"unit_id":"II","unit_title":"Bipolar Junction Transistors (BJTS)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Structure and modes of operation: Active,"},{"number":2,"title":"Cutoff, Saturation. BJT biasing techniques and stability analysis. Small signal analysis"},{"number":3,"title":"and single-stage amplifier design."}]}],"remarks":""},{"unit_id":"III","unit_title":"Field Effect Transistors (FETs)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"JFET and MOSFET structures, characteristics and"},{"number":2,"title":"parameters. FET biasing methods and analog switching applications. Common"},{"number":3,"title":"source amplifier design and multistage configurations."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Frequency Response and Power Amplifiers","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Frequency response of amplifiers:"},{"number":2,"title":"low, mid, and high frequency. Decibel gain, Bode plots, gain-bandwidth trade-"},{"number":3,"title":"off.Power amplifiers: Class A, B, AB, C – operation and efficiency."}]}],"remarks":""},{"unit_id":"V","unit_title":"Feedback Amplifiers and Oscillators","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Positive and negative feedback, feedback"},{"number":2,"title":"topologies, gain enhancement. Oscillators – Colpitts, Hartley, Crystal – design and"},{"number":3,"title":"analysis."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Task 1","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Semiconductor Energy Band Analysis"},{"number":2,"title":"Explain:"},{"number":3,"title":"o Conduction band"},{"number":4,"title":"o Valence band"},{"number":5,"title":"o Forbidden energy gap"},{"number":6,"title":"Compare:"},{"number":7,"title":"o Conductors"},{"number":8,"title":"o Semiconductors"},{"number":9,"title":"o Insulators"}]}],"remarks":""},{"unit_id":"VII","unit_title":"T2","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Design and analyze:"},{"number":2,"title":"Half-wave rectifier"},{"number":3,"title":"Full-wave rectifier"},{"number":4,"title":"Bridge rectifier"},{"number":5,"title":"T3: Design:"},{"number":6,"title":"o Positive clipper"},{"number":7,"title":"o Negative clipper"}]}],"remarks":""}]}$r2025_55_content$::jsonb,
	$r2025_55_books${"primary":[],"references":[{"title":"Salivahanan, S., & Suresh Kumar, N. (2023). Electronic devices and circuits","author":""},{"title":"Bell, D. A. (2008). Electronic devices and circuits (5th ed.). Oxford University","author":""},{"title":"Mehta, V. K., & Mehta, R. (2020). Principles of electronics (12th ed.). S.","author":""},{"title":"Boylestad, R. L., & Nashelsky, L. (2012). Electronic devices and circuit theory","author":""},{"title":"Donal Neamen (2006). Electronic circuits: Analysis and design (3rd ed.). Tata","author":""}]}$r2025_55_books$::jsonb,
	$r2025_55_web${"resources":[{"title":"be-iitkgp.vlabs.ac.in","url":"https://be-iitkgp.vlabs.ac.in/"},{"title":"nptel.ac.in","url":"http://nptel.ac.in/courses/117103063/"}]}$r2025_55_web$::jsonb,
	$r2025_55_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_55_ped$::jsonb,
	$r2025_55_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO5","pos":{},"psos":{"PSO2":"3"}}]}$r2025_55_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C05-ELECTRONIC DEVICES AND CIRCUITS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25C07 | CONTROL SYSTEMS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25C07'))
		LIMIT 1
	),
	'EE25C07', 'CONTROL SYSTEMS',
	$r2025_57_obj${"objectives":[{"number":1,"description":"The objective of this course is to equip students with a fundamental understanding of control systems by modelling physical systems using transfer functions and state-space methods."},{"number":2,"description":"The course aims to develop analytical skills to evaluate system behavior in both time and frequency domains, assess system stability, and design appropriate controllers and compensators to meet desired performance specifications."},{"number":3,"description":"Through theoretical concepts and design techniques, students will gain the ability to model, analyse, and control dynamic systems effectively."}]}$r2025_57_obj$::jsonb,
	$r2025_57_clos${"clos":[{"clo_number":1,"description":"Model physical systems using transfer function and\nblock diagram representations.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze system performance in time and frequency\ndomains and evaluate stability using appropriate\ntechniques.","k_values":[]},{"clo_number":3,"description":"Apply root locus and frequency response methods for\nstability analysis and system design.","k_values":[]},{"clo_number":4,"description":"Design controllers and compensators using classical\nand state-space techniques to meet desired\nspecifications.","k_values":[]}]}$r2025_57_clos$::jsonb,
	$r2025_57_content${"units":[{"unit_id":"I","unit_title":"Transfer Function Modelling of the Physical Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Systems - open and closed"},{"number":2,"title":"loop systems configurations - Modelling: electrical, mechanical and electro-"},{"number":3,"title":"mechanical systems - Block Diagram Reduction techniques-Signal Flow Graph."}]}],"remarks":""},{"unit_id":"II","unit_title":"Time Domain Analysis of the System","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Standard test signals - Time response"},{"number":2,"title":"analysis of first and second order systems – Time domain specifications - Steady"},{"number":3,"title":"State Error - Generalized error series."}]}],"remarks":""},{"unit_id":"III","unit_title":"Stability Analysis and Root Locus","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Routh Hurwitz Criteria - Root Locus: concepts"},{"number":2,"title":"and construction rules - Effect of addition of poles and Zeros – Analysis of system"},{"number":3,"title":"using Root Locus."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Frequency Domain Analysis of the System","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Frequency domain analysis -"},{"number":2,"title":"specifications -Correlation between time domain and frequency domain –Open loop"},{"number":3,"title":"frequency response: Bode Plot - Polar Plot."}]}],"remarks":""},{"unit_id":"V","unit_title":"State Space Analysis of the System","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"State Space model Representation – State"},{"number":2,"title":"space from transfer function: Phase variable, Canonical variable – Block diagram"},{"number":3,"title":"representation of state space model – Solution of state equations – controllability,"},{"number":4,"title":"observability and stability analysis of the system."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Design Of Compensator and Controller","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Design specifications - Compensator"},{"number":2,"title":"network and types - Design of Lag compensator, Lead Compensator and Lag-Lead"},{"number":3,"title":"Compensator using Bode plot – PID control algorithms - Ziegler-Nichols based PID"},{"number":4,"title":"controller design - Design of State Feedback controller using pole placement."},{"number":5,"title":"Tasks:"},{"number":6,"title":"T1: Derive the transfer function of: RLC series circuit"},{"number":7,"title":"T2: Model a DC motor and derive transfer function relating: Armature voltage →"},{"number":8,"title":"Angular speed"}]}],"remarks":""}]}$r2025_57_content$::jsonb,
	$r2025_57_books${"primary":[],"references":[{"title":"Nise, N. S. (2020). Control systems engineering (8th ed.). John Wiley.","author":""},{"title":"Nagrath, I. J., & Gopal, M. (2016). Control systems engineering (5th ed.,","author":""},{"title":"Dorf, R. C., & Bishop, R. H. (2022). Modern control systems (14th ed.).","author":""},{"title":"Ogata, K. (2010). Modern control engineering (5th ed.). Prentice Hall Private","author":""},{"title":"Kuo, B. C., & Golnaraghi, F. (2017). Automatic control systems (10th ed.).","author":""}]}$r2025_57_books$::jsonb,
	$r2025_57_web${"resources":[{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/108/106/108106098/"},{"title":"ce-dei.vlabs.ac.in","url":"https://ce-dei.vlabs.ac.in/"},{"title":"ce-dei.vlabs.ac.in","url":"https://ce-dei.vlabs.ac.in/"}]}$r2025_57_web$::jsonb,
	$r2025_57_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_57_ped$::jsonb,
	$r2025_57_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}}]}$r2025_57_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C07-CONTROL SYSTEMS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25C08 | APPLIED DATA SCIENCE
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25C08'))
		LIMIT 1
	),
	'EE25C08', 'APPLIED DATA SCIENCE',
	$r2025_58_obj${"objectives":[{"number":1,"description":"The Students will be equipped with data science competencies to analyze complex electrical systems through machine learning and statistical modelling, and foster application-based problem solving for optimizing smart grid operations, load forecasting, and renewable energy integration. This course enables to design of IoT- driven frameworks for real-time monitoring and anomaly detection in modern power networks, facilitates to develop industry-oriented skills in predictive maintenance and fault diagnosis for enhancing data-driven decision-making within digital energy ecosystems."}]}$r2025_58_obj$::jsonb,
	$r2025_58_clos${"clos":[{"clo_number":1,"description":"Understand data science concepts in electrical\nsystems - -","k_values":[]},{"clo_number":2,"description":"Apply preprocessing and statistical analysis to\nelectrical data","k_values":[]},{"clo_number":3,"description":"Analyze data using regression and hypothesis\ntesting","k_values":[]},{"clo_number":4,"description":"Develop ML models for forecasting and fault\ndetection","k_values":[]},{"clo_number":5,"description":"Apply signal analytics for power quality and\nmaintenance","k_values":[]},{"clo_number":6,"description":"Design data-driven solutions for smart grids and\nenergy systems","k_values":[]}]}$r2025_58_clos$::jsonb,
	$r2025_58_content${"units":[{"unit_id":"I","unit_title":"Foundations of Data Science","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"II","unit_title":"Data science lifecycle, Electrical engineering data","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"sensor, SCADA, IoT, Data"},{"number":2,"title":"preprocessing and visualization, Data Science Context- Prerequisites for a Data"},{"number":3,"title":"Scientist – Tools and Skills required."},{"number":4,"title":"Activity – Microsoft Visio / MATLAB Simulink"},{"number":5,"title":"1. Smart Meter Data Cleaning"},{"number":6,"title":"2. Transformer Temperature Monitoring"}]}],"remarks":""},{"unit_id":"III","unit_title":"Statistical Methods in Electrical Engineering","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Probability and distributions- Statistical analysis of load uncertainty and renewable"},{"number":2,"title":"energy variability in power systems. Correlation and linear regression models for"},{"number":3,"title":"prediction of electrical parameters and energy consumption, Hypothesis testing"},{"number":4,"title":"Activity – Preparation of Cheat Sheet/Microsoft Visio / MATLAB Simulink"},{"number":5,"title":"1. Fault Detection using Statistical Analysis"},{"number":6,"title":"2. Load vs Temperature Correlation Analysis"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Machine Learning Applications in Electrical Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Supervised and unsupervised learning techniques for power systems and smart grids,"},{"number":2,"title":"Regression methods for load and energy prediction, Classification algorithms for fault"},{"number":3,"title":"detection and system state identification, Clustering techniques for load pattern analysis"},{"number":4,"title":"and anomaly detection, and model evaluation using accuracy, precision, recall, and F1-"},{"number":5,"title":"score."},{"number":6,"title":"Activity – Quiz, Reproduction of research paper."}]}],"remarks":""},{"unit_id":"V","unit_title":"Signal Processing and Data Analytics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Time series analysis of electrical signals for trend and forecasting, Fourier transform"},{"number":2,"title":"and FFT for frequency and harmonic analysis, feature extraction from signals for"},{"number":3,"title":"condition monitoring, and application of signal analytics for power quality assessment"},{"number":4,"title":"and predictive maintenance."},{"number":5,"title":"Activity – Project Based Learning/Research writing"},{"number":6,"title":"1. Power Quality Analysis to detect harmonics."},{"number":7,"title":"2. Predictive Maintenance to analyze motor vibration data."}]}],"remarks":""}]}$r2025_58_content$::jsonb,
	$r2025_58_books${"primary":[],"references":[{"title":"Le Xie, Yang Weng, Ram Rajagopal (2023). Data Science and Applications for","author":""},{"title":"S. Vijayalakshmi, Lekha J., Lija Jacob, Savita Dahiya, R. Gunavathi (Eds.) (2025).","author":""},{"title":"B. Vinoth Kumar, P. Sivakumar, M.M. Rajan Singaravel, K. Vijayakumar (Eds.)","author":""},{"title":"Bhargav Appasani, Nicu Bizon (Eds.) (2023). Smart Grid 3.0: Computational and","author":""}]}$r2025_58_books$::jsonb,
	$r2025_58_web${"resources":[{"title":"microsoft.com","url":"https://www.microsoft.com/visio"},{"title":"microsoft.com","url":"https://www.microsoft.com/visio"}]}$r2025_58_web$::jsonb,
	$r2025_58_ped${"methods":[]}$r2025_58_ped$::jsonb,
	$r2025_58_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO5","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO6","pos":{},"psos":{"PSO2":"3"}}]}$r2025_58_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C08-APPLIED DATA SCIENCE.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EE25C09 | LINEAR INTEGRATED CIRCUITS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EE25C09'))
		LIMIT 1
	),
	'EE25C09', 'LINEAR INTEGRATED CIRCUITS',
	$r2025_59_obj${"objectives":[{"number":1,"description":"A linear integrated circuit is a solid-state analog device capable of operating across a continuous range of input levels, offering theoretically infinite operating states. These circuits are commonly used in applications such as audio amplifiers, analog-to-digital converters, averaging amplifiers, differentiators, DC amplifiers, integrators, multivibrators, oscillators, audio filters, and sweep generators."}]}$r2025_59_obj$::jsonb,
	$r2025_59_clos${"clos":[{"clo_number":1,"description":"Explain the fabrication, classification, and basic\nconcepts of integrated circuits including op-amps and\nlinear ICs.\n- -","k_values":[]},{"clo_number":2,"description":"Analyze and design basic operational amplifier circuits\nsuch as inverting, non-inverting, summing, differential,\nintegrator, and differentiator circuits.","k_values":[]},{"clo_number":3,"description":"Design and implement advanced op-amp applications\nincluding precision rectifiers, instrumentation\namplifiers, and active filters.","k_values":[]},{"clo_number":4,"description":"Understand and apply the working principles of D/A\nand A/D converters, PLL, and other linear IC\napplications.","k_values":[]}]}$r2025_59_clos$::jsonb,
	$r2025_59_content${"units":[{"unit_id":"I","unit_title":"Introduction","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Integrated circuits – Classification, Thin and thick film techniques,"},{"number":2,"title":"SMT(Surface Mount Technology) Monolithic technique - wafer preparation, Epitaxial"},{"number":3,"title":"growth, Oxidation, Photolithography, Diffusion, Ion Implantation, Isolation,"},{"number":4,"title":"Metallization and Packaging, Fabrication of Integrated resistors, capacitors and"},{"number":5,"title":"inductors -Bipolar and MOSFET devices fabrication techniques"}]}],"remarks":""},{"unit_id":"II","unit_title":"Operational Amplifier","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Basic concepts"},{"number":2,"title":"differential amplifiers"},{"number":3,"title":"block diagram-ideal"},{"number":4,"title":"op-amp parameters - Basic op-amp applications Scale changer, Inverting and non-"},{"number":5,"title":"inverting amplifiers, summer and subtractor, Log and antilog amplifiers - multiplier,"},{"number":6,"title":"Divider, differentiator, Integrator. Instrumentation amplifier"}]}],"remarks":""},{"unit_id":"III","unit_title":"OP-Amp Circuits","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"V to I and I to V converters- Precision rectifier-Clipper and"},{"number":2,"title":"clamper- Sample and hold circuits - Active filters: first order and second order LPF"},{"number":3,"title":"and HPF- Band Pass and Band Reject Filters - Comparators - Regenerative"},{"number":4,"title":"comparator (Schmitt Trigger)- Square wave and Triangular wave generators- Sine"},{"number":5,"title":"wave generators: RC Phase shift and Wein bridge oscillators."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Other Linear ICS","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"IC voltage regulators – Fixed and Variable voltage regulators-"},{"number":2,"title":"78XX and 79XX series regulators, LM317 voltage regulator -Switching Regulator- 555"},{"number":3,"title":"timer IC: Astable and Monostable modes – Phase locked loop - Operation,"},{"number":4,"title":"Characteristics & Application."}]}],"remarks":""},{"unit_id":"V","unit_title":"D/A and A/D Converters","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"weighted resistor and R-2R ladder- A/D converters:"},{"number":2,"title":"Successive approximation, Counter type, Flash type and Delta-sigma-"},{"number":3,"title":"T1: Classification of Integrated Circuits"},{"number":4,"title":"Compare:"},{"number":5,"title":"o Analog ICs"},{"number":6,"title":"o Digital ICs"},{"number":7,"title":"o Mixed signal ICs"},{"number":8,"title":"Explain applications of each category"},{"number":9,"title":"T2: Thin Film and Thick Film Techniques"},{"number":10,"title":"Differentiate between:"},{"number":11,"title":"o Thin film IC fabrication"},{"number":12,"title":"o Thick film IC fabrication"}]}],"remarks":""}]}$r2025_59_content$::jsonb,
	$r2025_59_books${"primary":[],"references":[{"title":"Roy Choudhury, D., & Jain, S. B. (2018). Linear integrated circuits (5th ed.). Wiley","author":""},{"title":"Gayakwad, R. A. (2015). Op-amps and linear integrated circuits (4th ed.). Pearson","author":""},{"title":"Botkar, K. R. (2008). Integrated circuits (10th ed.). Hanna Publishers.","author":""},{"title":"Millman, J., & Halkias, C. C. (2017). Integrated electronics (2nd ed.). McGraw Hill","author":""},{"title":"Driscoll, F. F., & Coughlin, R. F. (1997). Operational amplifiers and linear","author":""}]}$r2025_59_books$::jsonb,
	$r2025_59_web${"resources":[]}$r2025_59_web$::jsonb,
	$r2025_59_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_59_ped$::jsonb,
	$r2025_59_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{},"psos":{"PSO2":"3"}},{"co_id":"CO4","pos":{},"psos":{"PSO2":"3"}}]}$r2025_59_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EE25C09-LINEAR INTEGRATED CIRCUITS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25C04 | MAKERSPACE
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '26eb4fbf-9130-4b89-92e5-25f22c50191a'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'a014f727-be4e-4647-a0d6-d90447e6a2dc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25C04'))
		LIMIT 1
	),
	'ME25C04', 'MAKERSPACE',
	$r2025_60_obj${"objectives":[{"number":1,"description":"1. To impart practical skills in the assembly, disassembly, and welding of components using appropriate tools and techniques. 2. To provide hands-on training in electrical wiring practices, and the use of electronic components, sensors, and actuators."}]}$r2025_60_obj$::jsonb,
	$r2025_60_clos${"clos":[{"clo_number":1,"description":"Demonstrate proper use and handling of basic hand\nand power tools.","k_values":[]},{"clo_number":2,"description":"Carry out electrical wiring installations and repairs,\napplying safety measures in domestic applications.","k_values":[]},{"clo_number":3,"description":"Develop solid innovative models through software.","k_values":[]},{"clo_number":4,"description":"Adapt and follow safety protocols in the work\nenvironment.","k_values":[]}]}$r2025_60_clos$::jsonb,
	$r2025_60_content${"units":[{"unit_id":"I","unit_title":"List of Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"(A). Dis-assembly & Assembly Practices"},{"number":2,"title":"i. Tools and its handling techniques."},{"number":3,"title":"ii. Dis-assembly and assembly of home appliances – Grinder Mixer"},{"number":4,"title":"Grinder, Ceiling Fan, Table Fan & Washing Machine."},{"number":5,"title":"iii. Dis-assembly and assembly of Air-Conditioners & Refrigerators."},{"number":6,"title":"iv. Dis-assembly and assembly of a Bicycle."},{"number":7,"title":"(B). Welding Practices"},{"number":8,"title":"i. Welding Procedure, Selection & Safety Measures."},{"number":9,"title":"ii. Power source of Arc Welding – Gas Metal Arc Welding & Gas"},{"number":10,"title":"Tungsten Arc Welding processes."},{"number":11,"title":"iii. Hands-on session of preparing base material & Joint groove for welding."},{"number":12,"title":"iv. Hands-on session of MAW, GMAW, GTAW, on Carbon Steel &"},{"number":13,"title":"Stainless Stell plates / pipes, for fabrication of a simple part."},{"number":14,"title":"(C). Electrical Wiring Practices"},{"number":15,"title":"i. Electrical Installation tools, equipment & safety measures."},{"number":16,"title":"ii. Hands-on session of basic electrical connections for Fuses, Miniature"},{"number":17,"title":"Circuit Breakers and Distribution Box."},{"number":18,"title":"iii. Hands-on session of electrical connections for Lightings, Fans,"},{"number":19,"title":"Calling Bells."},{"number":20,"title":"iv. Hands-on session of electrical connections for Motors &"},{"number":21,"title":"Uninterruptible Power Supply."},{"number":22,"title":"(D). Electronics Components / Equipment Practices"},{"number":23,"title":"i. Electronic components, equipment & safety measures."},{"number":24,"title":"ii. Dis-assembly and assembly of Computers."},{"number":25,"title":"iii. Hands-on session of Soldering Practices in a Printed Circuit Board."},{"number":26,"title":"iv. Hands-on session of Bridge Rectifier, Op-Amp and Transimpedance"},{"number":27,"title":"amplifier."},{"number":28,"title":"v. Hands-on session of integration of sensors and actuators with a"},{"number":29,"title":"Microcontroller."},{"number":30,"title":"vi. Demonstration of Programmable Logic Control Circuit."}]}],"remarks":""}]}$r2025_60_content$::jsonb,
	$r2025_60_books${"primary":[],"references":[{"title":"Stephen Christena, Learn to Weld: Beginning MIG Welding and Metal Fabrication","author":""},{"author":"H. Lipson, Fabricated","title":"The New World of 3D Printing, Wiley, 1st edition, 2013."},{"title":"Code of Practice for Electrical Wiring Installations (IS 732:2019)","author":""}]}$r2025_60_books$::jsonb,
	$r2025_60_web${"resources":[]}$r2025_60_web$::jsonb,
	$r2025_60_ped${"methods":[]}$r2025_60_ped$::jsonb,
	$r2025_60_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO2":"1"}},{"co_id":"CO3","pos":{"PO5":"2"},"psos":{"PSO2":"2"}},{"co_id":"CO4","pos":{"PO11":"2"},"psos":{"PSO3":"2"}}]}$r2025_60_po$::jsonb,
	'30fd6f11-bdf0-460f-83ff-130d3a07fa36'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: ME25C04 Makerspace.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25103 | INDIAN ETHOS AND BUSINESS ETHICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25103'))
		LIMIT 1
	),
	'MB25103', 'INDIAN ETHOS AND BUSINESS ETHICS',
	$r2025_61_obj${"objectives":[{"number":1,"description":"This course is designed to provide a deep understanding of Indian ethos, ethical practices, and value-based decision-making in Business. It emphasizes the integration of traditional Indian wisdom with contemporary management practices."}]}$r2025_61_obj$::jsonb,
	$r2025_61_clos${"clos":[{"clo_number":1,"description":"Demonstrate conceptual knowledge of Indian ethos, ethical\nprinciples, business ethics, individual ethics, CSR, and\nchallenges in cyber ethics and global business.","k_values":[]},{"clo_number":2,"description":"Interpret and relate Indian philosophy, learning systems,\nethical codes of conduct, personal values, CSR principles,\nand cyber and IPR laws to build a comprehensive\nunderstanding of business ethics.","k_values":[]},{"clo_number":3,"description":"Apply Indian ethos and wisdom, ethical decision-making\nframeworks, personal values, and principles of CSR to\naddress ethical issues and dilemmas in organizational,\ndigital, and global contexts.","k_values":[]},{"clo_number":4,"description":"Analyze ethical issues, individual moral development, CSR\nand sustainability practices, and the ethical implications of\ntechnology and globalization to ensure socially conscious\nand responsible business operations.","k_values":[]},{"clo_number":5,"description":"Evaluate traditional Indian wisdom, ethical decision-making\nmodels, CSR strategies, and ethical challenges in the digital\nage to foster a responsible and culturally conscious\nleadership approach","k_values":[]},{"clo_number":6,"description":"Develop a framework for ethical and sustainable business\npractices by integrating Indian ethos, ethical principles, CSR,\nand a responsible approach to cyber ethics and global\nchallenges to cultivate a values-based organizational culture.","k_values":[]}]}$r2025_61_clos$::jsonb,
	$r2025_61_content${"units":[{"unit_id":"I","unit_title":"Foundations of Indian Ethos in Management","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Concepts of Indian ethos and cultural intelligence"},{"number":2,"title":"Indian philosophy and ethical principles in leadership"},{"number":3,"title":"Work ethos and ethics for professional managers"},{"number":4,"title":"Indian values and value systems, Dharma, Karma, Nishkama Karma"},{"number":5,"title":"Wisdom for modern managers from scriptures (Gita, Upanishads)"}]}],"remarks":""},{"unit_id":"II","unit_title":"Indian Learning Systems and Holistic Growth","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Gurukul system and its relevance today"},{"number":2,"title":"Law of Humility, Law of Growth, Law of Responsibility"},{"number":3,"title":"Ancient learning methods and their modern parallels"},{"number":4,"title":"Spiritual quotient in leadership development"},{"number":5,"title":"Personality development through Indian ethos"}]}],"remarks":""},{"unit_id":"III","unit_title":"Business Ethics in Contemporary Organizations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Definition, scope, and need for Business ethics"},{"number":2,"title":"Ethical codes of conduct and governance"},{"number":3,"title":"Ethical decision-making models and frameworks"},{"number":4,"title":"Organizational values and trust-building"},{"number":5,"title":"Ethics in leadership and strategic decisions"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Individual Ethics and Moral Development","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Personal values and ethical behavior at work"},{"number":2,"title":"Integrity, honesty, empathy, and loyalty"},{"number":3,"title":"Conflict between personal and professional ethics"},{"number":4,"title":"Emotional intelligence and ethical maturity"},{"number":5,"title":"Building personal ethical frameworks"},{"number":6,"title":"Corporate Social Responsibility (CSR and Sustainability"},{"number":7,"title":"Concept and scope of CSR in India"},{"number":8,"title":"Corporate accountability and stakeholder perspectives"},{"number":9,"title":"Ethical CSR practices in Indian corporates"},{"number":10,"title":"Sustainable development and ESG goals"},{"number":11,"title":"Triple bottom line and ethical supply chain management"}]}],"remarks":""},{"unit_id":"V","unit_title":"Cyber Ethics, IPR, and Global Ethical Challenges","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Ethics in technology and the digital age"},{"number":2,"title":"Cyber law and ethical issues in e-commerce"},{"number":3,"title":"Intellectual property rights and ethical considerations"},{"number":4,"title":"Ethical concerns in AI, automation, and surveillance"},{"number":5,"title":"Cross-cultural Business ethics and globalization"},{"number":6,"title":"NOTE:"},{"number":7,"title":"The following is the list of topics suggested for preparation and presentation by students twice"},{"number":8,"title":"during the semester."},{"number":9,"title":"This will be evaluated by the faculty member(s) handling the course and the final marks are"}]}],"remarks":""}]}$r2025_61_content$::jsonb,
	$r2025_61_books${"primary":[],"references":[{"title":"Fernando, C. (2019). Business ethics: An Indian perspective (3rd ed.). Pearson Education.","author":""},{"title":"Nandagopal, R., & Sankar, A. (2015). Indian ethos and values in management. Tata","author":""},{"title":"Balachandran, S. (2018). Ethics, Indian ethos and management. PHI Learning.","author":""},{"title":"Hartman, L. P., DesJardins, J., et al. (2023). Business ethics: Decision making for personal","author":""},{"title":"Ranganathananda, S. Universal message of the Bhagavad Gita. Advaita Ashrama.","author":""},{"title":"Drucker, P. (2010). Managing for results. HarperBusiness.","author":""}]}$r2025_61_books$::jsonb,
	$r2025_61_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc22_mg54/"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc22_mg54/"},{"title":"plato.stanford.edu","url":"https://plato.stanford.edu/entries/ethics-business"},{"title":"unglobalcompact.org","url":"https://unglobalcompact.org"},{"title":"unglobalcompact.org","url":"https://unglobalcompact.org"}]}$r2025_61_web$::jsonb,
	$r2025_61_ped${"methods":[]}$r2025_61_ped$::jsonb,
	$r2025_61_po${"mappings":[{"co_id":"CO1","pos":{"PO3":"3","PO5":"3"}},{"co_id":"CO2","pos":{"PO2":"2","PO3":"3","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"2","PO2":"3","PO3":"3","PO4":"1"}},{"co_id":"CO4","pos":{"PO2":"3","PO3":"3"}},{"co_id":"CO5","pos":{"PO2":"3","PO3":"3"}},{"co_id":"CO6","pos":{"PO2":"3","PO3":"3"}}]}$r2025_61_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25103 Indian Ethos and Business Ethics.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25C05 | CONTEMPORARY BUSINESS COMMUNICATION
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25C05'))
		LIMIT 1
	),
	'MB25C05', 'CONTEMPORARY BUSINESS COMMUNICATION',
	$r2025_65_obj${"objectives":[{"number":1,"description":"This course aims to equip essential business communication skills required for modern managerial roles. It emphasizes both oral and written communication for various Business contexts such as interviews, meetings, presentations, professional correspondence.."}]}$r2025_65_obj$::jsonb,
	$r2025_65_clos${"clos":[{"clo_number":1,"description":"Demonstrate effective verbal and non-verbal communication\nskills, including public speaking, written correspondence,\ninterviewing, professional networking, and report writing, in\nvarious business contexts.","k_values":[]},{"clo_number":2,"description":"Interpret and relate the principles of effective communication,\nbusiness writing, presentation techniques, job preparedness,\nand professional networking to develop\nclear and persuasive communication strategies.","k_values":[]},{"clo_number":3,"description":"Apply communication fundamentals, business writing\ntechniques, public speaking skills, interviewing strategies,\nnetworking etiquette, and report writing principles to solve\nreal-world business communication challenges.","k_values":[]},{"clo_number":4,"description":"Analyze business communication scenarios, including\nmanagerial speeches, written correspondence, interviews,\nand networking interactions, to adapt communication styles\nfor different audiences and purposes.","k_values":[]},{"clo_number":5,"description":"Evaluate the effectiveness of various communication\nmethods, including presentations, professional\ncorrespondence, and reports, to build a personal brand,\nfoster professional relationships, and enhance business\ncommunication.","k_values":[]},{"clo_number":6,"description":"Develop a comprehensive communication plan and strategy\nby integrating knowledge of communication fundamentals,\nwritten correspondence, public speaking, job preparedness,\nnetworking, and analytical reporting to effectively lead and\nmanage in a modern business environment.","k_values":[]}]}$r2025_65_clos$::jsonb,
	$r2025_65_content${"units":[{"unit_id":"I","unit_title":"Communication Fundamentals and Managerial Speech Practice","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to Business"}]}],"remarks":""},{"unit_id":"II","unit_title":"Communication","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principles of effective communication, Target group profile, Barriers of"},{"number":2,"title":"Communication, Reading Skills, Listening, Feedback., Principles of Nonverbal Communication:"},{"number":3,"title":"Professional dressing and body language. Role Playing, Debates and Quiz. Types of managerial"},{"number":4,"title":"speeches - Presentations and Extempore, speech of introduction, speech of thanks, occasional"},{"number":5,"title":"speech, theme speech., Group communication: Meetings, group discussions. , Other Aspects of"}]}],"remarks":""},{"unit_id":"III","unit_title":"Communication","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Cross Cultural Dimensions of Business Communication Technology and"},{"number":2,"title":"Communication, Ethical & Legal Issues in Business Communication."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Business Writing and Corporate Communication Tools","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Business letters, Routine letters, Bad"},{"number":2,"title":"news and persuasion letters, sales letters, collection letters, Maintaining a Diary, Resume/CV, job"},{"number":3,"title":"application letters, proposals. Internal communication through, notices, circulars, memos, agenda"},{"number":4,"title":"and minutes, reports. Case Studies. Exercises on Corporate Writing, Executive Summary of"},{"number":5,"title":"Documents, Creative Writing, Poster Making, Framing Advertisements, Slogans, Captions,"}]}],"remarks":""},{"unit_id":"V","unit_title":"Preparing Press Release and Press Notes","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VI","unit_title":"Presentation and Public Speaking Skills","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principles of Effective Presentations, Principles"},{"number":2,"title":"governing the use of audiovisual media."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Interviewing and Job Preparedness","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Mastering the art of giving interviews in, selection or"},{"number":2,"title":"placement interviews, discipline interviews, appraisal interviews, exit interviews, web /video"},{"number":3,"title":"conferencing, tele-meeting."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Business Networking and Personal Branding","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Business networking techniques – Ice-breakers,"},{"number":2,"title":"small talk, digital etiquette – Conversational intelligence – Professional dining etiquette – Social"},{"number":3,"title":"media presence and grooming – Self-confidence and image management – Real-life simulations"},{"number":4,"title":"and feedback."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Report Writing and Analytical Communication","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Objectives of report, types of report, Report"},{"number":2,"title":"Planning, Types of Reports, Developing an outline, Nature of Headings, Ordering of Points,"},{"number":3,"title":"Logical Sequencing, Graphs, Charts, Executive Summary, List of Illustration, Report Writing."}]}],"remarks":""},{"unit_id":"X","unit_title":"Note","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"The emphasis of the entire subject should be on practical aspects."},{"number":2,"title":"Practical: This module introduces both written and spoken communication skills to students to build"},{"number":3,"title":"their confidence in delivering clear and logical messages to their audience. They will develop written"},{"number":4,"title":"communication skills through crafting Business messages such as Business letters, emails, and"},{"number":5,"title":"meeting minutes. In addition, students will work through presentations and simulated"},{"number":6,"title":"meetings to refine their spoken communication skills, discussion techniques and people skills."},{"number":7,"title":"Practical: This module builds on the foundation of Business Communication 1 and creates"},{"number":8,"title":"opportunities for students to strengthen their oral and written communication. Students will be"},{"number":9,"title":"required to enhance their presentation skills through impromptu speeches. Students will also learn"},{"number":10,"title":"how to prepare a formal Business report. Job hunting and employment skills will be introduced to"},{"number":11,"title":"prepare students for a positive start to their careers. Students will be taught to write application"},{"number":12,"title":"letters and resumes. Additionally, students will learn job interview techniques through"},{"number":13,"title":"role-plays and simulations"},{"number":14,"title":"Practical: This practical module aims to help students be persuasive in the Business world."},{"number":15,"title":"Students will learn listening and data gathering skills to better understand their target audience’s"}]}],"remarks":""}]}$r2025_65_content$::jsonb,
	$r2025_65_books${"primary":[],"references":[{"title":"Pal, R., & Korlahalli, J. S. (2011). Essentials of business communication (13th rev. ed.).","author":""},{"title":"Raman, M., & Singh, P. (2012). Business communication (2nd ed.). Oxford.","author":""},{"title":"Sharma, R. C., & Mohan, K. (2020). Business correspondence & report writing (6th ed.).","author":""},{"title":"Goodale, M. Professional presentations: Developing communication skills. Cambridge","author":""},{"title":"Adair, J. Effective communication. Pan Macmillan.","author":""},{"title":"Thill, J. V., & Bovee, G. L. (2023/2024). Excellence in business communication (14th ed.).","author":""}]}$r2025_65_books$::jsonb,
	$r2025_65_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_hs76"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc21_hs76"},{"title":"youtube.com","url":"https://www.youtube.com"},{"title":"youtube.com","url":"https://www.youtube.com"}]}$r2025_65_web$::jsonb,
	$r2025_65_ped${"methods":[]}$r2025_65_ped$::jsonb,
	$r2025_65_po${"mappings":[{"co_id":"CO1","pos":{"PO2":"3","PO5":"3"}},{"co_id":"CO2","pos":{"PO2":"3","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"1","PO2":"3","PO4":"2"}},{"co_id":"CO4","pos":{"PO2":"3"}},{"co_id":"CO5","pos":{"PO2":"3","PO3":"2","PO5":"3"}},{"co_id":"CO6","pos":{"PO2":"3","PO3":"2"}}]}$r2025_65_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25C05 Contemporary Business Communications.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25101 | ACCOUNTING FOR DECISION MAKING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25101'))
		LIMIT 1
	),
	'MB25101', 'ACCOUNTING FOR DECISION MAKING',
	$r2025_86_obj${"objectives":[{"number":1,"description":"This course equips a comprehensive understanding of financial, cost, and management accounting principles. It emphasizes the analysis and interpretation of financial statements to support informed decision-making. Through practical exposure to accounting techniques such as ratio analysis, costing methods, marginal costing, and budgeting."}]}$r2025_86_obj$::jsonb,
	$r2025_86_clos${"clos":[{"clo_number":1,"description":"Demonstrate conceptual knowledge of financial, cost, and\nmanagement accounting principles, financial statement\nanalysis, costing systems, marginal costing techniques,\nbudgeting, performance management, and relevant\naccounting standards.","k_values":[]},{"clo_number":2,"description":"Interpret and relate accounting principles from financial and\ncost accounting, analyze financial statements using various\ntechniques, understand marginal costing applications, and\nexplain the significance of budgetary control and accounting\nstandards in financial disclosures.","k_values":[]},{"clo_number":3,"description":"Apply the principles of financial accounting to prepare\nstatements, utilize financial analysis tools and various costing\nsystems for decision-making, and use budgeting and\nvariance analysis for performance management in\naccordance with accounting standards.","k_values":[]},{"clo_number":4,"description":"Analyze financial statements, cost accounting data, and\nmarginal costing reports to evaluate business performance,\nassess strategic decisions, and interpret the implications of\ndifferent accounting standards and ethical issues.","k_values":[]},{"clo_number":5,"description":"Evaluate the effectiveness of various financial analysis tools,\ncosting methods, budgetary controls, and performance\nmanagement techniques to support strategic decision-\nmaking and identify ethical issues and financial statement\nfraud.","k_values":[]},{"clo_number":6,"description":"Develop contemporary accounting practices and models by\nintegrating knowledge of financial reporting, cost\nmanagement, marginal costing, budgeting, performance\nmeasurement, and accounting standards to make strategic\nbusiness decisions and detect fraud.","k_values":[]}]}$r2025_86_clos$::jsonb,
	$r2025_86_content${"units":[{"unit_id":"I","unit_title":"Introduction to Financial Accounting and Reporting","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to Financial, Cost and"},{"number":2,"title":"Management Accounting, Generally accepted accounting principles– Double Entry System,"},{"number":3,"title":"Preparation of Journal, Ledger and Trial Balance Preparation of Final Accounts: Trading, Profit and"},{"number":4,"title":"Loss Account and Balance Sheet (Problem) - Reading the financial statements"}]}],"remarks":""},{"unit_id":"II","unit_title":"Financial Statement Analysis","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Financial ratio analysis (Problem), Interpretation of ratio for financial"},{"number":2,"title":"decisions- Dupont Ratios, Comparative statements - common size statements. Cash flow (as per"},{"number":3,"title":"Accounting Standard 3) and Funds flow statement analysis (Problem), Trend Analysis."}]}],"remarks":""},{"unit_id":"III","unit_title":"Cost Accounting Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Cost Accounts, Classification of costs, Job cost sheet, Job order"},{"number":2,"title":"costing, Process costing, (excluding Interdepartmental Transfers and equivalent production), Joint"},{"number":3,"title":"and By Product Costing, Activity Based Costing, Target Costing."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Marginal Costing and Decision-Making","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Marginal Costing and profit planning, Cost, Volume, Profit"},{"number":2,"title":"Analysis, Break Even Analysis, Decision making problems -Make or Buy decisions - Determination"},{"number":3,"title":"of sales mix (Problem) - Exploring new markets, Add or drop products -Expand or contract."}]}],"remarks":""},{"unit_id":"V","unit_title":"Budgeting and Performance Management","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Budgetary Control, Sales, Production, Cash flow, fixed"},{"number":2,"title":"and flexible budget (Problem), Standard costing and Variance Analysis, (excluding overhead"},{"number":3,"title":"costing) -Accounting standards and accounting disclosure practices in India."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Accounting Standards and Strategic Applications","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Accounting standards and disclosures in"},{"number":2,"title":"India, Overview of IFRS and convergence, Ethical issues in accounting, Financial statement fraud"},{"number":3,"title":"detection, Use of accounting in strategic Business decision-making, Role of analytics in finance and"},{"number":4,"title":"accounting.."}]}],"remarks":""}]}$r2025_86_content$::jsonb,
	$r2025_86_books${"primary":[],"references":[{"title":"Narayanaswamy, R. (2022). Financial accounting (7th ed.). PHI.","author":""},{"title":"Khan, M. Y., & Jain, P. K. (2021). Management accounting (8th ed.). Tata McGraw Hill.","author":""},{"title":"Singhvi, N. M., & Bodhanwala, R. J. (2018). Management accounting, Text and cases (3rd","author":""},{"title":"Stice, E. K., & Stice, J. D. (2024). Financial accounting, reporting & analysis (9th ed.).","author":""},{"title":"Bhattacharya, A. K. (2012). Introduction to financial statement analysis. Elsevier/PHI.","author":""},{"title":"Reddy, T. S., & Murthy, A. (2024). Financial accounting (latest ed.). Margham Publications.","author":""}]}$r2025_86_books$::jsonb,
	$r2025_86_web${"resources":[{"title":"icai.org)","url":"https://www.icai.org)"},{"title":"icai.org)","url":"https://www.icai.org)"},{"title":"ifrs.org).","url":"https://www.ifrs.org)."},{"title":"ifrs.org).","url":"https://www.ifrs.org)."}]}$r2025_86_web$::jsonb,
	$r2025_86_ped${"methods":["Written Test I & II (60%) Assignment","PowerPoint presentation","Case study","Quiz and gamification"]}$r2025_86_ped$::jsonb,
	$r2025_86_po${"mappings":[{"co_id":"CO1","pos":{"PO5":"3"}},{"co_id":"CO2","pos":{"PO1":"1","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"3","PO4":"2"}},{"co_id":"CO4","pos":{"PO1":"3","PO3":"1","PO4":"2"}},{"co_id":"CO5","pos":{"PO1":"3","PO3":"2"}},{"co_id":"CO6","pos":{"PO1":"3","PO3":"2"}}]}$r2025_86_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25101 Accounting for Decision Making.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25102 | INFORMATION MANAGEMENT
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25102'))
		LIMIT 1
	),
	'MB25102', 'INFORMATION MANAGEMENT',
	$r2025_87_obj${"objectives":[{"number":1,"description":"This course equips the foundational and advanced knowledge of how information systems contribute to strategic Business decisions and operations. It introduces the key concepts of data, system design, databases, and information security and integrates recent IT advancements such as AI, IoT, blockchain, and quantum computing."}]}$r2025_87_obj$::jsonb,
	$r2025_87_clos${"clos":[{"clo_number":1,"description":"Demonstrate conceptual knowledge of information systems\nfundamentals, system analysis and design techniques,\ndatabase management systems, information security,\nemerging technologies, and their strategic applications in\nbusiness.","k_values":[]},{"clo_number":2,"description":"Interpret and relate the evolution and types of information\nsystems, system development methodologies, database\nconcepts, the integration of integrated systems, the impact of\nemerging technologies, and the strategic role of IT\ngovernance to inform managerial decisions.","k_values":[]},{"clo_number":3,"description":"Apply system analysis and design techniques, database\nmanagement principles, security practices, and emerging\ntechnologies to solve business problems and support\nstrategic decision-making across enterprise and functional\ninformation systems.","k_values":[]},{"clo_number":4,"description":"Analyze the functional and hierarchical aspects of information\nsystems, evaluate system design methodologies, examine\nthe role of database management and data warehousing, and\nassess the strategic implications of integrated systems,\nemerging technologies, and IT\ngovernance for business.","k_values":[]},{"clo_number":5,"description":"Evaluate the effectiveness of different information systems,\nsystem design models, database management systems,\nsecurity measures, and emerging technologies (like AI, IoT,\nblockchain) to assess their impact on business\ntransformation and ethical and legal compliance.","k_values":[]},{"clo_number":6,"description":"Develop strategic information management plans and\nbusiness solutions by synthesizing knowledge of information\nsystems fundamentals, system design, database\nmanagement, security, and emerging technologies to\nachieve business objectives and enhance organizational\nperformance.","k_values":[]}]}$r2025_87_clos$::jsonb,
	$r2025_87_content${"units":[{"unit_id":"I","unit_title":"Fundamentals of Information Systems in Business","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Data, Information, Information System,"},{"number":2,"title":"evolution, types based on functions and hierarchy, Enterprise and functional information systems."}]}],"remarks":""},{"unit_id":"II","unit_title":"Systems Analysis and Design Techniques","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"The work of a system analyst- SDLC-System design,"},{"number":2,"title":"AGILE Model, Waterfall Model, Spiral Model, Iterative and Incremental Model - RAD Model -"},{"number":3,"title":"Requirement analysis - Data flow diagram, relationship diagram, UML diagram, design-"}]}],"remarks":""},{"unit_id":"III","unit_title":"Implementation-Evaluation and maintenance of MIS, Database System","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Overview of Database-"},{"number":2,"title":"Components-advantages and disadvantages of database; Data Warehousing and Data Mining;"},{"number":3,"title":"Business Intelligence; Artificial Intelligence; Expert System; Big Data; Cyber Safety and Security-"},{"number":4,"title":"Cryptography; RSA Model of Encryption; Data Science - Block Chain Technology; E-commerce"},{"number":5,"title":"and E-Business models; IOT - RFID."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Database Management Systems and Warehousing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"DBMS, types and evolution, RDBMS,"},{"number":2,"title":"OODBMS, RODBMS, Data warehousing, Data Mart, Data mining - Association rule mining -"},{"number":3,"title":"Clustering - Pattern matching."}]}],"remarks":""},{"unit_id":"V","unit_title":"Integrated Systems and Information Security","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Knowledge based decision support systems,"},{"number":2,"title":"Integrating social media and mobile technologies in Information system, Security, IS Vulnerability,"},{"number":3,"title":"Disaster Management, Computer Crimes, Securing the Web."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Emerging Information Technologies","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Machine learning - Deep learning, Big data, Pervasive"},{"number":2,"title":"Computing, Cloud computing, Advancements in AI, IoT, Block chain, Crypto currency, Quantum"},{"number":3,"title":"computing"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Managerial Applications and Strategic Use","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Strategic role of IT in Business, Role of CIO and IT"},{"number":2,"title":"governance, Aligning IT with Business objectives, Legal and ethical issues in information"},{"number":3,"title":"management, Technology adoption models, IT project management, Role of information systems"},{"number":4,"title":"in Business analytics and decision science."}]}],"remarks":""}]}$r2025_87_content$::jsonb,
	$r2025_87_books${"primary":[],"references":[{"title":"Laudon, K. C., & Laudon, J. P. (2022). Management information systems (17th ed.).","author":""},{"author":"Schultheis, R., & Sumner, M. Management information systems","title":"The manager’s view."},{"title":"(Note: No edition/year available; if you find one, I can update it.)","author":""},{"title":"Panneerselvam, R. (2018). Database management systems (3rd ed.). PHI Learning.","author":""},{"title":"Laudon, K. C., Turban, E., & Traver, C. G. (2023). E-commerce: Business, technology,","author":""},{"title":"Loshin, D. (2021). Big data analytics (2nd ed.). Elsevier.","author":""},{"title":"Han, J., Kamber, M., & Pei, J. (2012). Data mining: Concepts and techniques (3rd ed.).","author":""}]}$r2025_87_books$::jsonb,
	$r2025_87_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in"},{"title":"weforum.org","url":"https://www.weforum.org/"},{"title":"weforum.org","url":"https://www.weforum.org/"}]}$r2025_87_web$::jsonb,
	$r2025_87_ped${"methods":["Written Test I & II (60%) Assignment","PowerPoint presentation","Case study"]}$r2025_87_ped$::jsonb,
	$r2025_87_po${"mappings":[{"co_id":"CO1","pos":{"PO5":"3"}},{"co_id":"CO2","pos":{"PO1":"1","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"3","PO4":"3"}},{"co_id":"CO4","pos":{"PO1":"3","PO3":"1","PO4":"2"}},{"co_id":"CO5","pos":{"PO1":"2","PO3":"3","PO4":"2"}},{"co_id":"CO6","pos":{"PO1":"3","PO3":"2","PO4":"3"}}]}$r2025_87_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25102 Information Management.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25C01 | STATISTICS FOR MANAGEMENT
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25C01'))
		LIMIT 1
	),
	'MB25C01', 'STATISTICS FOR MANAGEMENT',
	$r2025_92_obj${"objectives":[{"number":1,"description":"This course aims to provide statistical tools for data-driven decision-making, emphasizing the application of probability, hypothesis testing, regression analysis, parametric and non-parametric methods to enhance analytical skills in business scenarios."}]}$r2025_92_obj$::jsonb,
	$r2025_92_clos${"clos":[{"clo_number":1,"description":"Demonstrate conceptual knowledge of probability, sampling\nand estimation, parametric and non-parametric hypothesis\ntesting, correlation, regression, and their application in\nbusiness analytics and software tools.","k_values":[]},{"clo_number":2,"description":"Interpret and relate probability distributions, sampling\ntechniques, the outcomes of parametric and non-parametric\nhypothesis tests, correlation and regression analyses, and\nthe output from statistical software to derive meaningful\nbusiness insights.","k_values":[]},{"clo_number":3,"description":"Apply statistical concepts, including probability theory,\nsampling methods, various hypothesis tests, and correlation\nand regression models, to solve real-world business\nproblems and make data-driven decisions.","k_values":[]},{"clo_number":4,"description":"Analyze probability distributions, sampling data, the results of\nparametric and non-parametric tests, and regression models\nto evaluate business scenarios and assess the\nvalidity of statistical conclusions.","k_values":[]},{"clo_number":5,"description":"Evaluate the effectiveness of different statistical tools and\ntechniques, such as various hypothesis tests and regression\nmodels, to select the most appropriate method for a given\nbusiness problem and critically appraise statistical findings..","k_values":[]},{"clo_number":6,"description":"Develop data-driven solutions and strategic insights by\nintegrating knowledge of probability, sampling, hypothesis\ntesting, correlation, and regression, and effectively use\nstatistical software for business analytics and data\nstorytelling.","k_values":[]}]}$r2025_92_clos$::jsonb,
	$r2025_92_content${"units":[{"unit_id":"I","unit_title":"Probability and Probability Distributions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Basic definitions and rules for probability, conditional"},{"number":2,"title":"probability independence of events, Baye‘s theorem, (Theory and Problem) and random variables,"}]}],"remarks":""},{"unit_id":"II","unit_title":"Probability distributions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Binomial, Poisson, Uniform and Normal distributions (Problem)."}]}],"remarks":""},{"unit_id":"III","unit_title":"Sampling and Estimation Techniques","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction to sampling distributions, sampling distribution"},{"number":2,"title":"of mean and proportion, application of central limit theorem (Theory and Problem), sampling"},{"number":3,"title":"techniques (Problem). Estimation: Point and Interval estimates for population parameters of large"},{"number":4,"title":"sample and small samples, determining the sample size (Problem)."},{"number":5,"title":"Hypothesis Testing – Parametric Methods (Problem): Hypothesis testing: one sample and two"},{"number":6,"title":"sample tests for means and proportions of large samples (z- test), one sample and two sample tests"},{"number":7,"title":"for means of small samples (t-test), F-test for two sample standard deviations. ANOVA one and two"},{"number":8,"title":"way"},{"number":9,"title":"Hypothesis Testing – Non-Parametric Methods (Problem): Chi-square test for single sample"},{"number":10,"title":"standard deviation. Chi-square tests for independence of attributes and goodness of fit. Sign test for"},{"number":11,"title":"paired data. Rank sum test. Kolmogorov-Smirnov, test for goodnessof fit, comparing two"},{"number":12,"title":"populations. Mann, Whitney U test and Kruskal Wallis test. One sample run test."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Correlation and Regression Analysis (Problem)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Correlation, Coefficient of Determination, Rank"},{"number":2,"title":"Correlation, Regression, Estimation of Regressionline, Method of Least Squares, Standard Error of"},{"number":3,"title":"estimate."}]}],"remarks":""},{"unit_id":"V","unit_title":"Business Analytics Applications & Software Tools","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Application of statistics - data visualization"},{"number":2,"title":"and decision making - Case studies using Excel/SPSS/R, Interpretation of output - Business"},{"number":3,"title":"scenarios - applying regression, correlation, and hypothesis tests - Introduction to data-driven"},{"number":4,"title":"storytelling -dashboarding techniques (Theory and Problem)"}]}],"remarks":""}]}$r2025_92_content$::jsonb,
	$r2025_92_books${"primary":[],"references":[{"title":"Levin, R. I., Rubin, D. S., Siddiqui, M. H., & Rastogi, S. (2023). Statistics for management","author":""},{"title":"Mann, P. S. (2020). Introductory statistics (10th ed.). Wiley Publications.","author":""},{"title":"Srivastava, T. N., & Rego, S. (2017). Statistics for management (3rd ed.). Tata McGraw","author":""},{"title":"Black, K. (2023). Applied business statistics (11th ed.). Wiley India.","author":""},{"title":"Anderson, D. R., Sweeney, D. J., Williams, T. A., Camm, J. D., & Cochran, J. J. (2024).","author":""},{"title":"Gupta, S. C., & Kapoor, V. K. (2024). Fundamentals of applied statistics. Sultan Chand &","author":""}]}$r2025_92_books$::jsonb,
	$r2025_92_web${"resources":[{"title":"nptel.ac.in)","url":"https://nptel.ac.in)"},{"title":"nptel.ac.in)","url":"https://nptel.ac.in)"},{"title":"cran.r-project.org)","url":"https://cran.r-project.org)"},{"title":"cran.r-project.org)","url":"https://cran.r-project.org)"}]}$r2025_92_web$::jsonb,
	$r2025_92_ped${"methods":["Written Test I & II (60%) Assignment","PowerPoint presentation","Case study","Quiz and gamification"]}$r2025_92_ped$::jsonb,
	$r2025_92_po${"mappings":[{"co_id":"CO1","pos":{"PO5":"3"}},{"co_id":"CO2","pos":{"PO1":"1","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"3"}},{"co_id":"CO4","pos":{"PO1":"3"}},{"co_id":"CO5","pos":{"PO1":"3"}},{"co_id":"CO6","pos":{"PO1":"3","PO2":"2"}}]}$r2025_92_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25C01 Statistics for Management.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25C02 | MANAGEMENT CONCEPTS AND ORGANIZATIONAL BEHAVIOR
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25C02'))
		LIMIT 1
	),
	'MB25C02', 'MANAGEMENT CONCEPTS AND ORGANIZATIONAL BEHAVIOR',
	$r2025_93_obj${"objectives":[{"number":1,"description":"This course aims to provides foundational understanding of management principles and organizational behavior. It equips them to analyze individual and group dynamics, and apply management theories to real-world business problems."}]}$r2025_93_obj$::jsonb,
	$r2025_93_clos${"clos":[{"clo_number":1,"description":"Demonstrate conceptual knowledge of management\ntheories, planning, organizing, organization design and\ncontrol, organizational behaviour, groups and leadership,and\ncontemporary practices in organization behaviour.","k_values":[]},{"clo_number":2,"description":"Interpret and relate to management theories, planning and\norganizing processes, perform organization design and\nexecute control, organisational behavioural theories, groups,\nleadership, culture and contemporary practices in\norganization behaviour","k_values":[]},{"clo_number":3,"description":"Apply theories and concepts of management to planning,\norganising, execution, design, control and individual and\ngroup behavior in organizations.","k_values":[]},{"clo_number":4,"description":"Analyze management theories, planning, organizing, design,\nexecution and control methodologies in organizational\nsettings along with organizational behavioral practices.","k_values":[]},{"clo_number":5,"description":"Evaluate the theories related to management and\norganizational behaviour to build model related toplanning,\norganising, designs, execution, control and to group\ndynamics, team structures, and leadership styles for\nenhancing organizational performance.","k_values":[]},{"clo_number":6,"description":"Develop contemporary practices, adapt and modify\nmanagement theories, concept to all functions of\nmanagement and to both individual and group behaviors to\nsuit cross-cultural behaviour, diversity, and global workforce\nmanagement.","k_values":[]}]}$r2025_93_clos$::jsonb,
	$r2025_93_content${"units":[{"unit_id":"I","unit_title":"Fundamentals of Management and Evolutionary Theories","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Evolution of management Thought-"},{"number":2,"title":"Classical, Behavioral and Management Science Approaches Management- meaning, levels,"},{"number":3,"title":"management as an art or science, Managerial functions and Roles, Evolution of Management"},{"number":4,"title":"Theory- Classical era- Contribution of F.W.Taylor, Henri Fayol, NeoClassical-Mayo & Hawthorne"},{"number":5,"title":"Experiments. Modern era, system & contingency approach Managerial Skills.."}]}],"remarks":""},{"unit_id":"II","unit_title":"Planning, Decision-Making and Organizing for Effectiveness","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Planning - Steps in Planning"},{"number":2,"title":"Process - Scope and Limitations - Forecasting and types of Planning - Characteristics of a sound"},{"number":3,"title":"Plan - Management by OBJECTIVE (MBO) - PoliciesandStrategiesScopeandFormulation-"},{"number":4,"title":"DecisionMaking-Types,Techniques and Processes. Organisation Structure and Design - Authority"},{"number":5,"title":"and Responsibility Relationships - Delegation of Authority and Decentralisation -Interdepartmental"},{"number":6,"title":"Coordination - - Impact of Technology on Organisational design - Mechanistic vs Adoptive"},{"number":7,"title":"Structures - Formal and Informal Organisation. Control: meaning, function, Process and types of"},{"number":8,"title":"Control."}]}],"remarks":""},{"unit_id":"III","unit_title":"Fundamentals of Control and Modern Approaches","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Impact of Technology on Organisational"},{"number":2,"title":"design - Mechanistic vs Adoptive Structures - Formal and Informal Organisation. Control: meaning,"},{"number":3,"title":"function, Process and types of Control."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Individual Behavior in Organizations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Meaning of Organizational behavior, contributing"},{"number":2,"title":"disciplines, importance of organizational behavior, Perception and Learning - Personality and"},{"number":3,"title":"Individual Differences - Motivation theories and Job Performance - Values, Attitudes and Beliefs -"},{"number":4,"title":"Communication Types-Process - Barriers - Making Communication Effective."}]}],"remarks":""},{"unit_id":"V","unit_title":"Group Dynamics, Leadership and Organizational Culture","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Groups and Teams: Definition,"},{"number":2,"title":"Difference between groups and teams, Stages of Group Development, Group Cohesiveness, Types"},{"number":3,"title":"of teams, Group Dynamics - Leadership - Styles - Approaches - Power and Politics - Organisational"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Structure - Organisational Climate and Culture, Conflict","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"concept, sources, Types, Stages of"},{"number":2,"title":"conflict, Management of conflict Organisational Change and Development."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Contemporary Perspectives in Organizational Behavior","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Comparative Management Styles and"},{"number":2,"title":"approaches - Japanese Management Practices Organisational Creativity and Innovation -"},{"number":3,"title":"Organizational behavior across cultures- Conditions affecting cross cultural organizational"},{"number":4,"title":"operations, Managing International Workforce, Productivity and cultural contingencies, Cross"},{"number":5,"title":"cultural communication, Management of Diversity."}]}],"remarks":""}]}$r2025_93_content$::jsonb,
	$r2025_93_books${"primary":[],"references":[{"title":"DuBrin, A. J. (2020). Essentials of management (11th ed.). Thomson South Western.","author":""},{"title":"Certo, S. C., & Certo, T. L. (2021). Modern management: Concepts & skills (16th ed.).","author":""},{"title":"Koontz, H., & Weihrich, H. (2020). Essentials of management: An international &","author":""},{"title":"Robbins, S. P. (2023). Organizational behavior (19th ed.). PHI Learning/Pearson","author":""},{"title":"Luthans, F. (2015). Organizational behavior (14th ed.). McGraw Hill.","author":""},{"author":"Nelson, D. L., Quick, J. C., & Khandelwal, P. (2018). ORGB","title":"An innovative approach to"},{"title":"Pareek, U. (2020). Understanding organizational behavior (4th ed.). Oxford Higher","author":""}]}$r2025_93_books$::jsonb,
	$r2025_93_web${"resources":[{"title":"nptel.ac.in)","url":"https://nptel.ac.in)"},{"title":"nptel.ac.in)","url":"https://nptel.ac.in)"}]}$r2025_93_web$::jsonb,
	$r2025_93_ped${"methods":["Written Test I & II (60%) Assignment","PowerPoint presentation","Case study"]}$r2025_93_ped$::jsonb,
	$r2025_93_po${"mappings":[{"co_id":"CO1","pos":{"PO5":"1"}},{"co_id":"CO2","pos":{"PO1":"1","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"3","PO2":"2"}},{"co_id":"CO4","pos":{"PO1":"3"}},{"co_id":"CO5","pos":{"PO1":"3","PO2":"2"}},{"co_id":"CO6","pos":{"PO3":"2","PO4":"3"}}]}$r2025_93_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25C02 Management Concepts and Organizational Behavior.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25C03 | MANAGERIAL ECONOMICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25C03'))
		LIMIT 1
	),
	'MB25C03', 'MANAGERIAL ECONOMICS',
	$r2025_94_obj${"objectives":[{"number":1,"description":"The course is designed to provide a strong foundation in economic principles and tools applicable to managerial decision-making. It introduces the concepts of scarcity, efficiency, and market mechanisms in both micro and macroeconomic settings."}]}$r2025_94_obj$::jsonb,
	$r2025_94_clos${"clos":[{"clo_number":1,"description":"Demonstrate conceptual knowledge of managerial\neconomics, fundamental concepts, demand and supply,\nproduction, costs, market structures, factor pricing,\nmacroeconomic performance indicators, and monetary and\nfiscal policies.","k_values":[]},{"clo_number":2,"description":"Interpret and relate foundational concepts, consumer\nbehavior, production and cost functions, different market\nstructures, macroeconomic aggregates, and the role of\nmonetary and fiscal policies in influencing the business\nenvironment.","k_values":[]},{"clo_number":3,"description":"Apply theories and concepts of management to planning,\norganising, execution, design, control and individual and\ngroup behavior in organizations.","k_values":[]},{"clo_number":4,"description":"Analyze fundamental economic problems, consumer\nbehavior, market structures, firm-level costs and pricing,\nmacroeconomic indicators, and the effects of monetary and\nfiscal policies on business cycles.","k_values":[]},{"clo_number":5,"description":"Evaluate the theories related to scarcity and efficiency,\nconsumer demand, market structures, factor pricing, and\nmacroeconomic policy frameworks to assess their impact on\nbusiness performance in global and Indian contexts..","k_values":[]},{"clo_number":6,"description":"Develop economic reasoning and apply contemporary\npractices to adapt managerial economic principles to address\nreal-world business problems across various market\nstructures, macroeconomic conditions, and policy\nlandscapes.","k_values":[]}]}$r2025_94_clos$::jsonb,
	$r2025_94_content${"units":[{"unit_id":"I","unit_title":"Introduction to Managerial Economics and Fundamental Concepts","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"The themes of economics,"},{"number":2,"title":"scarcity and efficiency, three fundamental economic problems, CREDITS: 3 8 society’s capability,"},{"number":3,"title":"Production possibility frontiers (PPF), Productive efficiency Vs economic efficiency, economic"},{"number":4,"title":"growth & stability, Micro economics and Macro economics, the role of markets and government,"},{"number":5,"title":"Positive Vs negative externalities."}]}],"remarks":""},{"unit_id":"II","unit_title":"Demand, Supply and Consumer Behavior","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Market, Demand and Supply, Determinants, Market"},{"number":2,"title":"equilibrium, elasticity of demand and supply, consumer behavior, consumer equilibrium,"}]}],"remarks":""},{"unit_id":"III","unit_title":"Approaches to consumer behavior","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"IV","unit_title":"Production, Costs and Firm-Level Analysis","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Production, Short-run and long-run Production"},{"number":2,"title":"Function, Returns to scale, economics Vs dis-economics of scale, Analysis of cost, Short-run and"},{"number":3,"title":"long-run cost function, Relation between Production and cost function - Production Pricing Model -"}]}],"remarks":""},{"unit_id":"V","unit_title":"Types of Pricing Model","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"VI","unit_title":"Market Structures and Factor Pricing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Product market–perfect and imperfect market–different"},{"number":2,"title":"market structures–Firm’s equilibrium and supply, Market efficiency, Economic costs of imperfect"},{"number":3,"title":"competition, factor market–Land, Labour and capital–Demand and supply–determination of factor"},{"number":4,"title":"price–Interaction of product and factor market–General equilibrium and efficiency of competitive"},{"number":5,"title":"markets."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Macroeconomic Performance Indicators","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Macro-economic aggregates, circular flow of"},{"number":2,"title":"macroeconomic activity, National income determination, Aggregate demand and supply,"},{"number":3,"title":"Macroeconomic equilibrium, Components of aggregate demand and national income, multiplier"},{"number":4,"title":"effect, Demand side management, Fiscal policy in theory."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Monetary Economics and Supply-Side Perspectives","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Short-run and Long-run supply curve–"},{"number":2,"title":"Unemployment and its impact–Okun’s law, Inflation and the impact–reasons for inflation–Demand"},{"number":3,"title":"Vs Supply factors–Inflation Vs unemployment trade off, Phillips curve –short- run and long-run –"},{"number":4,"title":"Supply side Policy and management- Money market- Demand and supply of money, money-market"},{"number":5,"title":"equilibrium and national income, the role of monetary policy."}]}],"remarks":""}]}$r2025_94_content$::jsonb,
	$r2025_94_books${"primary":[],"references":[{"title":"Samuelson, P. A., Nordhaus, W. D., Chaudhuri, S., & Sen, A. (2019). Economics (20th","author":""},{"title":"Boyes, W., & Melvin, M. Text book of economics. Biztantra.","author":""},{"title":"Mankiw, N. G. (2022). Principles of economics (8th ed., India release). Thomson","author":""},{"title":"Lipsey, R., & Chrystal, A. (2015). Economics (13th ed.). Oxford University Press.","author":""},{"title":"Case, K. E., & Fair, R. C. (2019). Principles of economics (13th global ed.). Pearson","author":""},{"title":"Panneerselvam, R. (2013). Engineering economics (2nd ed.). PHI Learning.","author":""}]}$r2025_94_books$::jsonb,
	$r2025_94_web${"resources":[{"title":"nptel.ac.in)","url":"https://nptel.ac.in)"},{"title":"nptel.ac.in)","url":"https://nptel.ac.in)"},{"title":"rbi.org.in)","url":"https://rbi.org.in)"},{"title":"rbi.org.in)","url":"https://rbi.org.in)"}]}$r2025_94_web$::jsonb,
	$r2025_94_ped${"methods":["Written Test I & II (60%) Assignment","PowerPoint presentation","Case study","Quiz and gamification"]}$r2025_94_ped$::jsonb,
	$r2025_94_po${"mappings":[{"co_id":"CO1","pos":{"PO5":"3"}},{"co_id":"CO2","pos":{"PO1":"1","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"3","PO4":"2"}},{"co_id":"CO4","pos":{"PO1":"3","PO3":"1","PO4":"2"}},{"co_id":"CO5","pos":{"PO1":"3"}},{"co_id":"CO6","pos":{"PO3":"2","PO4":"2"}}]}$r2025_94_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25C03 Managérial Economics.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25C04 | LEGAL ASPECTS OF BUSINESS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25C04'))
		LIMIT 1
	),
	'MB25C04', 'LEGAL ASPECTS OF BUSINESS',
	$r2025_95_obj${"objectives":[{"number":1,"description":"This course introduces the key Business laws and their practical applications across commercial contracts, company operations, industry regulations, taxation (including GST), and cyber laws in managing risks. It helps learners gain critical awareness of the legal framework. Commercial Laws and Business Contracts:"}]}$r2025_95_obj$::jsonb,
	$r2025_95_clos${"clos":[{"clo_number":1,"description":"Demonstrate conceptual knowledge of commercial laws,\ncompany law, industrial relations and labor legislation,\ncorporate taxation (including GST), consumer protection,\ncyber laws, and intellectual property rights (IPR)..","k_values":[]},{"clo_number":2,"description":"Interpret and relate key legal principles from contract law,\ncompany regulations, industrial acts, taxation frameworks,\nconsumer protection laws, and intellectual property statutes\nto understand the legal environment of business.","k_values":[]},{"clo_number":3,"description":"Apply legal principles and frameworks from commercial and\ncompany law, labor legislation, tax laws, and IPR to evaluate\nbusiness contracts, corporate governance\npractices, compliance requirements, and the protection of\nbusiness innovations.","k_values":[]},{"clo_number":4,"description":"Analyze legal and regulatory frameworks, including\ncompetition law, industrial relations acts, corporate tax and\nGST provisions, cyber laws, and IPR, to assess their impact\non business operations, risk management, and strategic\ndecision-making.","k_values":[]},{"clo_number":5,"description":"Evaluate the effectiveness of various legal provisions and\nframeworks, such as consumer protection and cyber laws,\nand IPR, to build compliance strategies, mitigate legal risks,\nand ensure ethical and sustainable business practices.","k_values":[]},{"clo_number":6,"description":"Develop contemporary legal compliance and risk\nmanagement strategies by integrating knowledge of\ncommercial law, company law, industrial relations, taxation,\nand cyber and IPR laws to ensure effective and ethical\nbusiness operations in a global context.","k_values":[]}]}$r2025_95_clos$::jsonb,
	$r2025_95_content${"units":[{"unit_id":"I","unit_title":"The Indian Contract Act 1872","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Definition of contract, essentials elements and types of a contract,"},{"number":2,"title":"Formation of a contract, performance of contracts, breach of contract and its remedies, Quasi"},{"number":3,"title":"contracts - Contract OfAgency: Nature of agency, Creation and types of agents, Authority and"},{"number":4,"title":"liability of Agent and principal: Rights and duties of principal and agents, termination of agency."}]}],"remarks":""},{"unit_id":"II","unit_title":"The Sale of Goods Act 1930","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Nature of Sales contract, Documents of title, risk of loss, Guarantees"},{"number":2,"title":"and Warranties, performance of sales contracts, conditional sales and rights of an unpaid seller -"}]}],"remarks":""},{"unit_id":"III","unit_title":"Negotiable Instruments Act 1881","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Nature and requisites of negotiable instruments. Types of"},{"number":2,"title":"negotiable instruments, liability of parties, holder in due course, special rules for Cheque and drafts,"},{"number":3,"title":"discharge of negotiable instruments - The payment and settlement systems Act, 2007."},{"number":4,"title":"Company Law and Competition Regulations:"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Company Act 1956 & 2013","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Major principles, Nature and types of companies, Formation,"},{"number":2,"title":"Memorandum and Articles of Association, Prospectus, Power, duties and liabilities of Directors,"},{"number":3,"title":"winding up of companies, Corporate Governance. Competition Act 2002 - Introduction, Definitions,"},{"number":4,"title":"Enquiry into Certain Agreements and Dominant Position of Enterprise and Combinations."}]}],"remarks":""},{"unit_id":"V","unit_title":"Industrial Relations and Labour Legislation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"An Overview of Factories Act - Payment of Wages"},{"number":2,"title":"Act - Payment of Bonus Act - Industrial Disputes Act."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Corporate Taxation and Goods & Services Tax (GST)","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Corporate Tax Planning, Corporate"},{"number":2,"title":"Taxes and Overview of Latest Developments in Indirect tax Laws relating to GST: An introduction"},{"number":3,"title":"including constitutional aspects, Levy and collection of CGST & IGST, Basic concept of time and"},{"number":4,"title":"value of supply, Input tax credit, Computation of GST Liability, Registration, Tax Invoice, Credit &"},{"number":5,"title":"Debit Notes, Electronic Way bill, Returns, Payment of taxes including Reverse Charge."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Consumer Protection and Cyber Laws","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Consumer Protection Act, Consumer rights, Procedures"},{"number":2,"title":"for Consumer grievances redressal, Types of consumer Redressal Machineries and Forums--"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Cyber crimes, IT Act 2000 and 2002, Cyber Laws","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"IX","unit_title":"Intellectual Property Rights (IPR) in Business","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction of IPR Intellectual Property Laws-"},{"number":2,"title":"Introduction, Legal Aspects of Patents, Filing of Patent Applications, Rights from Patents,"},{"number":3,"title":"Infringement of Patents, Copyright and its Ownership, Infringement of Copyright, Civil Remedies"},{"number":4,"title":"for Infringement– Copy rights, Trade marks, Patent Act. Introduction, Right to Information Act, 2005."}]}],"remarks":""}]}$r2025_95_content$::jsonb,
	$r2025_95_books${"primary":[],"references":[{"title":"Kapoor, N. D. (2024). Elements of mercantile law (39th rev. ed.). Sultan Chand and","author":""},{"title":"Goel, P. K. (2023/24). Business law for managers (2nd ed.). Biztantra Publishers.","author":""},{"title":"Pathak, A. (2022). Legal aspects of business (8th ed.). Tata McGraw Hill.","author":""},{"title":"Kumar, R. (2016). Legal aspects of business (4th ed.). Cengage Learning.","author":""},{"title":"Sinha, P. K., & Singhania, V. (2017/18). Text book of indirect tax. Taxmann Publication.","author":""},{"title":"Taxmann. (2023). GST manual with GST law guide & digest of landmark rulings (12th ed.).","author":""}]}$r2025_95_books$::jsonb,
	$r2025_95_web${"resources":[{"title":"mca.gov.in","url":"https://www.mca.gov.in"},{"title":"mca.gov.in","url":"https://www.mca.gov.in"},{"title":"gst.gov.in","url":"https://www.gst.gov.in"},{"title":"gst.gov.in","url":"https://www.gst.gov.in"},{"title":"wipo.int","url":"https://www.wipo.int"},{"title":"wipo.int","url":"https://www.wipo.int"}]}$r2025_95_web$::jsonb,
	$r2025_95_ped${"methods":["Written Test I & II (60%) Assignment","PowerPoint presentation","Case study"]}$r2025_95_ped$::jsonb,
	$r2025_95_po${"mappings":[{"co_id":"CO1","pos":{"PO5":"3"}},{"co_id":"CO2","pos":{"PO1":"1","PO5":"3"}},{"co_id":"CO3","pos":{"PO1":"3","PO4":"3"}},{"co_id":"CO4","pos":{"PO1":"3","PO3":"1","PO4":"2"}},{"co_id":"CO5","pos":{"PO1":"2","PO3":"3"}},{"co_id":"CO6","pos":{"PO1":"3","PO3":"2"}}]}$r2025_95_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25C04 Legal Aspects of Business.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MB25C11 | OPERATIONS MANAGEMENT
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'e7904ebb-339b-45b8-ac87-746f7fe54bdb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '728fa81f-9c43-4107-9c3e-6e1a107605cc'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MB25C11'))
		LIMIT 1
	),
	'MB25C11', 'OPERATIONS MANAGEMENT',
	$r2025_101_obj${"objectives":[{"number":1,"description":"This course provides a holistic understanding of operations management as a vital function in achieving strategic and operational excellence in organizations. It covers tools, techniques, and strategies to design, plan, control, and improve manufacturing and service operations. Emphasis is placed on capacity planning, product design, supply chain strategies, quality management, and lean operations. Students will explore recent trends including digital operations, sustainable practices, and data-driven decision-making to gain competitive advantage in the global market."}]}$r2025_101_obj$::jsonb,
	$r2025_101_clos${"clos":[{"clo_number":1,"description":"3 2 3 3 2 2 2","k_values":[]},{"clo_number":2,"description":"3 3 3 2 3 3 2","k_values":[]},{"clo_number":3,"description":"3 2 3 3 3 2 3","k_values":[]},{"clo_number":4,"description":"3 3 3 2 3 3 3","k_values":[]},{"clo_number":5,"description":"3 3 3 3 2 3 2\n-- 3 of 4 --\nCO","k_values":[]},{"clo_number":6,"description":"3 3 3 3 3 3 3\nNote: 1 – Low, 2 – Medium, 3 – High\n-- 4 of 4 --","k_values":[]}]}$r2025_101_clos$::jsonb,
	$r2025_101_content${"units":[{"unit_id":"I","unit_title":"Course Content","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Overview of Operations Management and Strategic Alignment"},{"number":2,"title":"Operations Management – Nature, Importance, historical development, transformation processes,"},{"number":3,"title":"differences between services and goods, a system perspective, functions, challenges, current"},{"number":4,"title":"priorities, recent trends. Operations Strategy – Strategic fit, framework. Productivity; World-class"},{"number":5,"title":"manufacturing practices"}]}],"remarks":""},{"unit_id":"II","unit_title":"Capacity, Facility and Supply Chain Decisions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Capacity Planning – Long range, Types, Developing capacity alternatives, tools for capacity"},{"number":2,"title":"planning. Facility Location – Theories, Steps in Selection, Location Models. Sourcing and"},{"number":3,"title":"procurement - Strategic sourcing, make or buy decision, procurement process, managing vendors."}]}],"remarks":""}]}$r2025_101_content$::jsonb,
	$r2025_101_books${"primary":[],"references":[{"title":"Richard B. Chase, Ravi Shankar, F. Robert Jacobs, Operations and Supply Chain","author":""},{"title":"B. Mahadevan, Operations Management: Theory and Practice, Pearson, 4th Ed., 2018","author":""},{"title":"William J. Stevenson, Operations Management, McGraw Hill, 14th Ed., 2022","author":""},{"title":"Cecil C. Bozarth & Robert B. Handfield, Introduction to Operations and Supply Chain","author":""},{"title":"Norman Gaither & Gregory Frazier, Operations Management, Cengage, 11th Ed., 2022","author":""},{"title":"R. Paneerselvam, Production and Operations Management, PHI Learning, 3rd Ed., 2017","author":""},{"title":"Nigel Slack, Operations Management, Pearson, 10th Ed., 2023","author":""},{"title":"S. Chopra & P. Meindl, Supply Chain Management: Strategy, Planning, and Operation,","author":""},{"title":"Russel & Taylor, Operations Management, Wiley, 11th Ed., 2022","author":""}]}$r2025_101_books$::jsonb,
	$r2025_101_web${"resources":[]}$r2025_101_web$::jsonb,
	$r2025_101_ped${"methods":[]}$r2025_101_ped$::jsonb,
	$r2025_101_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{}},{"co_id":"CO3","pos":{}},{"co_id":"CO4","pos":{}},{"co_id":"CO5","pos":{}},{"co_id":"CO6","pos":{}}]}$r2025_101_po$::jsonb,
	'2c799b9d-293a-422c-b047-9531a3586f5d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MB25C11 Operations Management.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CE25C11 | STRENGTH OF MATERIALS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CE25C11'))
		LIMIT 1
	),
	'CE25C11', 'STRENGTH OF MATERIALS',
	$r2025_103_obj${"objectives":[{"number":1,"description":"To understand the behaviour of materials under different loading conditions and analyze stresses, strains, bending, torsion, deflection, columns, and pressure vessels."}]}$r2025_103_obj$::jsonb,
	$r2025_103_clos${"clos":[{"clo_number":1,"description":"Describe fundamental concepts of stress, strain,\ndeformation, bending, torsion, deflection, columns,\nand pressure vessels to demonstrate overall\nunderstanding of strength of materials.\n— —","k_values":[]},{"clo_number":2,"description":"Calculate stresses, strains, deformation, shear force,\nbending moment, and load-carrying capacity of\nstructural members using relevant theories.","k_values":[]},{"clo_number":3,"description":"Analyze beams, shafts, springs, and columns under\nvarious loading conditions to determine stress\ndistribution and structural response.","k_values":[]},{"clo_number":4,"description":"Evaluate strength, stability, and performance of\nstructural components and develop suitable solutions\nfor engineering applications involving deformation\nand failure analysis.","k_values":[]}]}$r2025_103_clos$::jsonb,
	$r2025_103_content${"units":[{"unit_id":"I","unit_title":"Stress, Strain and Deformation of Solids","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Rigid bodies and deformable solids,"},{"number":2,"title":"Tension, Compression and Shear Stresses, Deformation of simple and compound"},{"number":3,"title":"bars, Thermal stresses, Elastic constants, Volumetric strains, Stresses on inclined"},{"number":4,"title":"planes, Principal stresses and principal planes, Mohr’s circle of stress."},{"number":5,"title":"Activity: Assignments and Quiz problems on stress, strain and deformation of"},{"number":6,"title":"solids."}]}],"remarks":""},{"unit_id":"II","unit_title":"Practical","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"1. Tensile test on mild steel rod."},{"number":2,"title":"2. Hardness test on metals (Rockwell and Brinell Hardness Tests)"}]}],"remarks":""},{"unit_id":"III","unit_title":"Transverse Loading on Beams and Stresses In Beam","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Beams, Types,"},{"number":2,"title":"Transverse loading on beams, Shear force and Bending moment in beams,"},{"number":3,"title":"Cantilever, Simply-supported and over-hanging beams. Theory of simple bending"},{"number":4,"title":"Bending stress distribution, Load carrying capacity, Proportioning of sections,"},{"number":5,"title":"Flitched beams, Shear stress distribution."},{"number":6,"title":"Activity: Demonstration of practical applications of transverse loading on"},{"number":7,"title":"beams, Simulation of Shear Force and Bending Moment Diagrams using web-"},{"number":8,"title":"based analysis tools."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Practical","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"1. Double shear tests on metal rod"},{"number":2,"title":"2. Impact test on metal specimen (Izod and Charpy)"}]}],"remarks":""},{"unit_id":"V","unit_title":"Torsion","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Theory of Torsion, Stresses and Deformations in Solid and Hollow"},{"number":2,"title":"Circular Shafts, Combined bending moment and torsion of shafts, Power"},{"number":3,"title":"transmitted to shaft, Shaft in series and parallel, Closed and Open Coiled helical"},{"number":4,"title":"springs – springs in series and parallel."},{"number":5,"title":"Activity: Assignments on torsion of solid and hollow circular shafts."},{"number":6,"title":"Practical: Torsion test on mild steel rod."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Deflection of Beams and Springs","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Elastic curve, Governing differential equation,"},{"number":2,"title":"Double integration method, Macaulay's method, Area moment method, Conjugate"},{"number":3,"title":"beam method for computation of slope and deflection of determinant beams,"},{"number":4,"title":"Strain energy method for determinate beams, Maxwell’s reciprocal theorem, Leaf"},{"number":5,"title":"springs."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Practical","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"1. Deflection test on metal beam. Verification of Maxwell’s reciprocal theorem."},{"number":2,"title":"2. Deflection test on carriage spring."}]}],"remarks":""}]}$r2025_103_content$::jsonb,
	$r2025_103_books${"primary":[],"references":[{"title":"R. K. Bansal, A Textbook of Strength of Materials, 7th Edition, Laxmi","author":""},{"title":"R. K. Rajput, Strength of Materials: Mechanics of Solids, Revised Edition, S.","author":""},{"title":"S. Ramamrutham and R. Narayanan, Strength of Materials, Revised Enlarged","author":""},{"title":"R. Subramanian, Strength of Materials, 3rd Edition, Oxford University Press,","author":""},{"title":"S. S. Rattan, Strength of Materials, 4th Edition, McGraw Hill Education, New","author":""},{"title":"B. S. Basavarajaiah and P. Mahadevappa, Strength of Materials in SI Units,","author":""},{"title":"S. P. Timoshenko and D. H. Young, Elements of Strength of Materials, 5th","author":""}]}$r2025_103_books$::jsonb,
	$r2025_103_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc25_ce25/preview"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc25_ce25/preview"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112107147"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112107147"},{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/105/105/105105108/"},{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/105/105/105105108/"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/3-11-mechanics-of-materials-fall-1999/"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/3-11-mechanics-of-materials-fall-1999/"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/3-11-mechanics-of-materials-fall-"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/3-11-mechanics-of-materials-fall-"},{"title":"vlab.co.in","url":"https://www.vlab.co.in/ba-nptel-labs-mechanical-engineering"},{"title":"vlab.co.in","url":"https://www.vlab.co.in/ba-nptel-labs-mechanical-engineering"},{"title":"solidmechanics.org","url":"https://solidmechanics.org/"},{"title":"solidmechanics.org","url":"https://solidmechanics.org/"},{"title":"engineeringtoolbox.com","url":"https://www.engineeringtoolbox.com/stress-strain-d_950.html"},{"title":"engineeringtoolbox.com","url":"https://www.engineeringtoolbox.com/stress-strain-d_950.html"},{"title":"engineeringtoolbox.com","url":"https://www.engineeringtoolbox.com/beam-stress-deflection-d_1312.html"},{"title":"engineeringtoolbox.com","url":"https://www.engineeringtoolbox.com/beam-stress-deflection-d_1312.html"}]}$r2025_103_web$::jsonb,
	$r2025_103_ped${"methods":[]}$r2025_103_ped$::jsonb,
	$r2025_103_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO2":"2"},"psos":{"PSO1":"2"}},{"co_id":"CO3","pos":{"PO1":"2","PO2":"2","PO4":"2"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"2","PO3":"2","PO5":"2"},"psos":{"PSO1":"2","PSO2":"2","PSO3":"1"}}]}$r2025_103_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: Strength of Materials.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- GE25C01 | BASIC CIVIL AND MECHANICAL ENGINEERING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('GE25C01'))
		LIMIT 1
	),
	'GE25C01', 'BASIC CIVIL AND MECHANICAL ENGINEERING',
	$r2025_104_obj${"objectives":[{"number":1,"description":"To impart major fundamental concept of civil & mechanical engineering & provide the insight with regard to applications."}]}$r2025_104_obj$::jsonb,
	$r2025_104_clos${"clos":[{"clo_number":1,"description":"Understand the scope and significance of\ncivil and mechanical engineering in societal\nand industrial development.","k_values":[]},{"clo_number":2,"description":"Apply basic technical knowledge in the field\nof civil and mechanical engineering.","k_values":[]},{"clo_number":3,"description":"Develop an appreciation for\ninterdisciplinary roles of civil and\nmechanical engineers in solving real-world\nproblems.","k_values":[]}]}$r2025_104_clos$::jsonb,
	$r2025_104_content${"units":[{"unit_id":"I","unit_title":"Historical Evaluation of Engineering","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"History, Structural, Construction,"},{"number":2,"title":"Geotechnical, Environmental, Transportation and Water Resources Engineering,"},{"number":3,"title":"Role for infrastructure development, Buildings, Types and Terminologies, Impact on"},{"number":4,"title":"environment."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Visit to construction sites, Energy consumption in building."}]}],"remarks":""},{"unit_id":"III","unit_title":"Building Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Types, selection criteria, Bricks and Blocks, Composition- Fly"},{"number":2,"title":"ash brick, FRP bricks, Types of Cements, Mortar, Thermal and Acoustic Insulating"},{"number":3,"title":"Materials, Decorative Panels, Water Proofing Materials."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of cement manufacturing, virtual demonstration of"},{"number":2,"title":"heat infiltration to the building."}]}],"remarks":""},{"unit_id":"V","unit_title":"Building Components","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Foundations, Types, Bearing capacity and settlement, Brick"},{"number":2,"title":"masonry, Stone Masonry, Beams, Columns, Lintels and Rain Water Harvesting,"},{"number":3,"title":"concept of Green Buildings."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of foundations, Erection of transformers."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Power Plants","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Classifications, Working principle of steam, Gas, Diesel, Hydro,"},{"number":2,"title":"electric and Nuclear Power plants. Renewable energy scenario."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of Power plants."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Thermal systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Classifications, Working of IC Engines and its applications,"},{"number":2,"title":"Turbines and Pumps. Working of HVAC systems."}]}],"remarks":""},{"unit_id":"X","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of IC Engines, Turbines and Pumps, Case study on"},{"number":2,"title":"energy consumption in Refrigeration systems."}]}],"remarks":""},{"unit_id":"XI","unit_title":"Manufacturing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Welding, Machining, Forming and Additive manufacturing."}]}],"remarks":""},{"unit_id":"XII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of any machining processes."}]}],"remarks":""}]}$r2025_104_content$::jsonb,
	$r2025_104_books${"primary":[],"references":[{"title":"Shanmugam, G., & Palanichamy, M. S. (2015). Basic Civil and Mechanical","author":""}]}$r2025_104_books$::jsonb,
	$r2025_104_web${"resources":[]}$r2025_104_web$::jsonb,
	$r2025_104_ped${"methods":["Quiz and gamification","Assignments (40%) & Internal"]}$r2025_104_ped$::jsonb,
	$r2025_104_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"}},{"co_id":"CO3","pos":{"PO11":"1"}}]}$r2025_104_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: GE25C01-BASIC CIVIL AND MECHANICAL ENGINEERING.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25301 | ENGINEERING THERMODYNAMICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25301'))
		LIMIT 1
	),
	'ME25301', 'ENGINEERING THERMODYNAMICS',
	$r2025_105_obj${"objectives":[{"number":1,"description":"This course introduces the fundamental principles and laws of thermodynamics related to energy, heat, work, and properties of pure substances. It develops the ability to analyze thermodynamic systems using the First and Second Laws, and to evaluate system performance using entropy, exergy, and property relations. The course also emphasizes solving engineering problems through analytical approaches."}]}$r2025_105_obj$::jsonb,
	$r2025_105_clos${"clos":[{"clo_number":1,"description":"Explain fundamentals of thermodynamics including\nlaws, properties of pure substances, and\nthermodynamic relations.\n— —","k_values":[]},{"clo_number":2,"description":"Apply thermodynamic principles to calculate heat,\nwork, energy interactions, efficiencies, and\nproperties.","k_values":[]},{"clo_number":3,"description":"Analyze thermodynamic systems using energy,\nentropy, and property relations\nto determine behavior and performance.","k_values":[]},{"clo_number":4,"description":"Evaluate performance, efficiency, and irreversibility\nof thermodynamic systems and develop\nengineering solutions.","k_values":[]}]}$r2025_105_clos$::jsonb,
	$r2025_105_content${"units":[{"unit_id":"I","unit_title":"Basic Concepts","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Continuum and macroscopic approach; thermodynamic systems"},{"number":2,"title":"(closed and open); thermodynamic properties and equilibrium; state of a system,"},{"number":3,"title":"state postulate for simple compressible substances, state diagrams, paths and"},{"number":4,"title":"processes on state diagrams, ideal gas equation of state; concept of temperature,"},{"number":5,"title":"zeroth law of thermodynamics, thermodynamic temperature scale."},{"number":6,"title":"Activities:"},{"number":7,"title":"Identify and report closed and open thermodynamic systems from daily life."},{"number":8,"title":"Fabricate a transparent plunger–cylinder setup to demonstrate an adiabatic"},{"number":9,"title":"process."},{"number":10,"title":"Demonstrate Boyle’s law and Charles’s law."}]}],"remarks":""},{"unit_id":"II","unit_title":"First Law of Thermodynamics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Concept of energy and its various forms, concepts"},{"number":2,"title":"of heat, work and different modes of work; reversible and irreversible processes,"},{"number":3,"title":"concept of moving boundary work; first law applied to elementary processes, closed"},{"number":4,"title":"systems and control volumes, steady and unsteady flow analysis."},{"number":5,"title":"Activities:"},{"number":6,"title":"Develop a program to compute moving boundary work for different polytropic"},{"number":7,"title":"processes and plot P–V diagrams."}]}],"remarks":""},{"unit_id":"III","unit_title":"Second Law of Thermodynamics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Limitations of the first law of thermodynamics,"},{"number":2,"title":"concepts of heat engines and heat pumps/refrigerators, Kelvin-Planck and Clausius"},{"number":3,"title":"statements and their equivalence; perpetual motion machines, Carnot cycle and"},{"number":4,"title":"Carnot principles/theorems; Clausius inequality and concept of entropy; microscopic"},{"number":5,"title":"interpretation of entropy, the principle of increase of entropy, T-s diagrams; second"},{"number":6,"title":"law analysis of control volume; exergy analysis of closed and open systems; basics"},{"number":7,"title":"of third law of thermodynamics."},{"number":8,"title":"Activities:"},{"number":9,"title":"Develop a program to generate P–v and T–s diagrams for a Carnot cycle and"},{"number":10,"title":"evaluate heat transfer, work, and efficiency."},{"number":11,"title":"Develop a program to analyze energy balance, exergy balance, exergy"},{"number":12,"title":"destruction, and second-law efficiency of steady-flow systems."}]}],"remarks":""}]}$r2025_105_content$::jsonb,
	$r2025_105_books${"primary":[],"references":[{"title":"Cengel. Y. A. and Boles. M. A., “Thermodynamics: An Engineering Approach”,","author":""},{"title":"Moran. M. J., Shapiro. H. N., Boettner. D. D. and Bailey. M. B., “Fundamentals of","author":""},{"title":"Nag. P. K., “Engineering Thermodynamics”, 7th Edition, McGraw-Hill Education,","author":""}]}$r2025_105_books$::jsonb,
	$r2025_105_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112105220"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112105220"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112105123"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112105123"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106310"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106310"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106320"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106320"}]}$r2025_105_web$::jsonb,
	$r2025_105_ped${"methods":["Quiz and gamification","Assignments (25%)","Review of GATE/ESE"]}$r2025_105_ped$::jsonb,
	$r2025_105_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO2":"2"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO1":"2","PO2":"2","PO4":"2"},"psos":{"PSO1":"3","PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"2","PO3":"2","PO4":"2"},"psos":{"PSO1":"2","PSO2":"2"}}]}$r2025_105_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: Engineering Thermodynamics.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25C01 | ENGINEERING DRAWING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25C01'))
		LIMIT 1
	),
	'ME25C01', 'ENGINEERING DRAWING',
	$r2025_106_obj${"objectives":[{"number":1,"description":"To impart knowledge on dimensions and drawing standards."},{"number":2,"description":"To explore the orthographic projection of lines and solids."},{"number":3,"description":"To provide the understanding of orthographic, isometric and perspective views."}]}$r2025_106_obj$::jsonb,
	$r2025_106_clos${"clos":[{"clo_number":1,"description":"Explain the advantages of engineering drawing\nin engineering applications","k_values":[]},{"clo_number":2,"description":"Apply the concepts of projections in formulating\nvarious solid parts in engineering systems.","k_values":[]},{"clo_number":3,"description":"Analyse the various view and interpret the\nengineering drawings.","k_values":[]},{"clo_number":4,"description":"Use CAD tools for creation of various models.","k_values":[]},{"clo_number":5,"description":"Critically think and develop innovative models.","k_values":[]}]}$r2025_106_clos$::jsonb,
	$r2025_106_content${"units":[{"unit_id":"I","unit_title":"Fundamentals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Drawing instruments, Drawing standards (BIS), Lettering in"},{"number":2,"title":"engineering, Sheet layout, elements of dimensioning, Systems of dimensioning. Free"},{"number":3,"title":"hand sketching of 2D & 3D objects, Conics – Ellipse, Parabola and Hyperbola."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual Demonstration of Conics and Cycloids."}]}],"remarks":""},{"unit_id":"III","unit_title":"Orthographic Projection","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"First angle projection, Projection of points, straight lines"},{"number":2,"title":"and planes."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Projection of Solids","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Simple Solids, Section of Solids, Development of Surfaces"}]}],"remarks":""},{"unit_id":"V","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Development of models of various solids and virtual demonstration of"},{"number":2,"title":"sectioning, CAD modelling of 2D objects."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Isometric Projection","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Isometric Scale, Projection of Simple solids."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Conversion of 3D into 2D orthographic views, CAD modelling of 3D"},{"number":2,"title":"objects."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Perspective Projection","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Simple solids projection"}]}],"remarks":""},{"unit_id":"IX","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of perspective views."}]}],"remarks":""},{"unit_id":"X","unit_title":"Project","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Development of 2D objects and 3D objects using CAD tools."}]}],"remarks":""}]}$r2025_106_content$::jsonb,
	$r2025_106_books${"primary":[],"references":[{"title":"Natarajan, K. V. (2025). A Text Book of Engineering Graphics. Dhanalakshmi","author":""},{"title":"Venugopal, K., & Prabhu Raja, V. (2022). Engineering Drawing + AutoCAD. New","author":""}]}$r2025_106_books$::jsonb,
	$r2025_106_web${"resources":[{"title":"freecadweb.org","url":"https://www.freecadweb.org/"},{"title":"freecadweb.org","url":"https://www.freecadweb.org/"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc22_me105/preview"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/2-007-design-and-manufacturing-i-spring-"}]}$r2025_106_web$::jsonb,
	$r2025_106_ped${"methods":[]}$r2025_106_ped$::jsonb,
	$r2025_106_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2"}},{"co_id":"CO3","pos":{"PO2":"3"},"psos":{"PSO1":"2"}},{"co_id":"CO4","pos":{"PO3":"1"},"psos":{"PSO2":"2"}},{"co_id":"CO5","pos":{"PO11":"1"},"psos":{"PSO3":"1"}}]}$r2025_106_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: ME25C01-ENGINEERING DRAWING.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25C02 | ENGINEERING MECHANICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25C02'))
		LIMIT 1
	),
	'ME25C02', 'ENGINEERING MECHANICS',
	$r2025_107_obj${"objectives":[{"number":1,"description":"To introduce the fundamental concepts and principles of statics related to forces acting on particles and rigid bodies."},{"number":2,"description":"To develop the ability to formulate and apply equilibrium equations for particles and rigid bodies in two and three dimensions."},{"number":3,"description":"To enable students to analyse force systems through vector resolution and calculation of moments and couples."}]}$r2025_107_obj$::jsonb,
	$r2025_107_clos${"clos":[{"clo_number":1,"description":"Explain the principles of statics in determination\nof forces acting on particles and rigid bodies.","k_values":[]},{"clo_number":2,"description":"Apply equilibrium conditions to predict the\nbehaviour of particles and rigid bodies under\nvarious force configurations","k_values":[]},{"clo_number":3,"description":"Analyse various systems through resolution of\nforces and moments.","k_values":[]},{"clo_number":4,"description":"Demonstrate the ability to engage in adapting\nnew techniques in the analysis of force and\nmoments in a system.","k_values":[]}]}$r2025_107_clos$::jsonb,
	$r2025_107_content${"units":[{"unit_id":"I","unit_title":"Statics of Particles","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Resultant of forces in a plane, Equilibrium of a particle in a"},{"number":2,"title":"plane, Addition of concurrent forces in space, Equilibrium of a particle in space."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Assignments and Quiz on resultant forces, Solving of GATE questions."}]}],"remarks":""},{"unit_id":"III","unit_title":"Statics of Rigid Bodies","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Concept of Free Body Diagram, Equivalent systems of"},{"number":2,"title":"forces, Transmissibility, Moment of a force about a point and an axis, Couples and"},{"number":3,"title":"force-couple systems, Equilibrium of rigid bodies in two and three dimensions,"},{"number":4,"title":"Principle of virtual work."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of rigid bodies, Solving of GATE questions."}]}],"remarks":""},{"unit_id":"V","unit_title":"Moments of Inertia","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"First moments of areas and lines, Centroids of composite"},{"number":2,"title":"areas and lines, Theorems of Pappus-Guldinus, Second moment of area, Parallel"},{"number":3,"title":"axis theorem, Rectangular and Polar Moments of inertia of composite areas,"},{"number":4,"title":"Radius of Gyration, Product of Inertia, Principal Axes and Principal Moments of"},{"number":5,"title":"Inertia, Mass moments of inertia of thin plates."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual Simulation of Moment of Inertia, Principal Axes Determination,"},{"number":2,"title":"Solving of GATE questions."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Friction","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Laws of friction, Coefficients of Friction, Angles of Friction, Types of Friction"},{"number":2,"title":"Problems, Wedges and Ladder friction, Belt friction."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual Demonstration of Friction in belts and pulleys, Solving of GATE"},{"number":2,"title":"questions"}]}],"remarks":""}]}$r2025_107_content$::jsonb,
	$r2025_107_books${"primary":[],"references":[{"title":"Beer, F. P., Johnston Jr., E. R., DeWolf, J. T., & Mazurek, D. F. (2015).","author":""},{"title":"Meriam, J. L., & Kraige, L. G. (2018). Engineering Mechanics: Statics and","author":""},{"title":"Pytel, A., & Kiusalaas, J. (2014). Engineering Mechanics (Indian Edition).","author":""}]}$r2025_107_books$::jsonb,
	$r2025_107_web${"resources":[{"title":"skyciv.com","url":"https://skyciv.com/free-moment-of-inertia-"},{"title":"skyciv.com","url":"https://skyciv.com/free-moment-of-inertia-"},{"title":"openstax.org","url":"https://openstax.org/books/university-physics-volume-1/pages/10-4-moment-of-"},{"title":"onlinecourses.swayam2.ac.in","url":"https://onlinecourses.swayam2.ac.in/ntr24_ed75/preview"}]}$r2025_107_web$::jsonb,
	$r2025_107_ped${"methods":[]}$r2025_107_ped$::jsonb,
	$r2025_107_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"2"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO2":"2","PSO3":"1"}}]}$r2025_107_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: ME25C02-Engineering Mechanics.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25C03 | INTRODUCTION TO MECHANICAL ENGINEERING
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25C03'))
		LIMIT 1
	),
	'ME25C03', 'INTRODUCTION TO MECHANICAL ENGINEERING',
	$r2025_108_obj${"objectives":[{"number":1,"description":"To impart the fundamental concepts and principles of various fields such as Manufacturing, Materials, Mechanics, thermal engineering in Mechanical Engineering."}]}$r2025_108_obj$::jsonb,
	$r2025_108_clos${"clos":[{"clo_number":1,"description":"Explain core mechanical engineering concepts.","k_values":[]},{"clo_number":2,"description":"Apply basic engineering calculations in mechanical\nsystems.","k_values":[]},{"clo_number":3,"description":"Identify common manufacturing processes for\nengineering applications.","k_values":[]}]}$r2025_108_clos$::jsonb,
	$r2025_108_content${"units":[{"unit_id":"I","unit_title":"Engineering","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"History and evolution of mechanical engineering, Basic mechanical"},{"number":2,"title":"engineering principles (force, motion, energy, work, power), Units and"},{"number":3,"title":"dimensions, SI system, Ethics and professionalism in engineering."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Interactive quiz, Conversion between SI and other unit systems."}]}],"remarks":""},{"unit_id":"III","unit_title":"Mechanics of Materials and Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Stress and strain, types of stresses"},{"number":2,"title":"(tensile, compressive, shear), Elasticity and plasticity, Mechanical properties of"},{"number":3,"title":"materials (strength, toughness, hardness), Introduction to bending, torsion, and"},{"number":4,"title":"axial loading, Simple structural analysis and design concepts."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of Simple truss or beam problems solved using"},{"number":2,"title":"software."}]}],"remarks":""},{"unit_id":"V","unit_title":"Energy Interactions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"System, Energy Transfer, Conduction, convection, and"},{"number":2,"title":"radiation, Working principle of Heat Engines, Refrigeration and HVAC systems."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of working model of internal combustion engine &"},{"number":2,"title":"refrigerator, Virtual demonstration of Thermodynamic cycles."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Machine Elements","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Gears, bearings, shafts, fasteners, couplings, Selection of"},{"number":2,"title":"machine components, Quality control and safety in mechanical engineering."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of working of Gears, bearings, etc. in a mechanical"},{"number":2,"title":"system."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Manufacturing Processes","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Casting, forming, machining & joining processes, CNC"},{"number":2,"title":"and additive manufacturing, overview of smart manufacturing."}]}],"remarks":""},{"unit_id":"X","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of various machining processes, 3D printing of simple"},{"number":2,"title":"parts."}]}],"remarks":""}]}$r2025_108_content$::jsonb,
	$r2025_108_books${"primary":[],"references":[{"title":"Wickert, J., & Lewis, K. (2016). An Introduction to Mechanical Engineering.","author":""},{"title":"Rajput, R. K., (2017). Fundamentals of Mechanical Engineering, Laxmi","author":""}]}$r2025_108_books$::jsonb,
	$r2025_108_web${"resources":[{"title":"ocw.mit.edu","url":"https://ocw.mit.edu"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu"},{"title":"phet.colorado.edu","url":"https://phet.colorado.edu"},{"title":"eng.libretexts.org","url":"https://eng.libretexts.org"},{"title":"eng.libretexts.org","url":"https://eng.libretexts.org"}]}$r2025_108_web$::jsonb,
	$r2025_108_ped${"methods":["Quiz and gamification","Assignments (40%)","Internal"]}$r2025_108_ped$::jsonb,
	$r2025_108_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3","PSO2":"2"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO3":"2"}}]}$r2025_108_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: ME25C03 -Introduction to Mechanical Engineering.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25C07 | APPLIED ENGINEERING MECHANICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25C07'))
		LIMIT 1
	),
	'ME25C07', 'APPLIED ENGINEERING MECHANICS',
	$r2025_109_obj${"objectives":[{"number":1,"description":"To provide a comprehensive understanding of applied engineering mechanics principles for analyzing structures, machines, and mechanical systems. It develops the ability to solve engineering problems using analytical, energy, and momentum methods."}]}$r2025_109_obj$::jsonb,
	$r2025_109_clos${"clos":[{"clo_number":1,"description":"Explain fundamentals of statics, trusses, frames,\nsimple machines, virtual work, and energy–\nmomentum principles.\n— —","k_values":[]},{"clo_number":2,"description":"Apply statics, virtual work, and energy methods\nto determine forces, reactions, efficiency, and\nmotion parameters.","k_values":[]},{"clo_number":3,"description":"Analyze trusses, frames, particles, and rigid bodies\nusing force, energy, and momentum methods to\nevaluate system behavior.","k_values":[]},{"clo_number":4,"description":"Evaluate stability, efficiency, and performance of\nmechanical systems and develop engineering\nsolutions.","k_values":[]}]}$r2025_109_clos$::jsonb,
	$r2025_109_content${"units":[{"unit_id":"I","unit_title":"Analysis of Structures","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Planar trusses, Assumptions, static determinacy, method of"},{"number":2,"title":"joints, method of sections. Introduction to 3D trusses. Plane Frames, analysis of"},{"number":3,"title":"member forces. Simple Machines, mechanical advantage, velocity ratio, efficiency."},{"number":4,"title":"Activities:"},{"number":5,"title":"Simulation of plane trusses using FEM softwares."},{"number":6,"title":"Physical modeling of 2D trusses using wooden sticks"},{"number":7,"title":"Case Studies of Collapse of 3D Trusses"}]}],"remarks":""},{"unit_id":"II","unit_title":"Method of Virtual Work","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Principle of virtual work, analysis of planar"},{"number":2,"title":"machines/mechanisms, Mechanical efficiency of real machines, Potential energy and"},{"number":3,"title":"equilibrium, Stability of equilibrium of mechanical systems"}]}],"remarks":""},{"unit_id":"III","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Problem-solving assignments using computational tools/programming"},{"number":2,"title":"environments."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Kinetics of Particles","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Energy and Momentum methods: Work Energy principle,"},{"number":2,"title":"Conservation of Energy principle, Impulse Momentum principle, Impacts – Direct and"},{"number":3,"title":"Oblique."},{"number":4,"title":"Activities:"},{"number":5,"title":"Assignments using programming tools to calculate the motion parameters of"},{"number":6,"title":"particles and present the results in graphical form."}]}],"remarks":""},{"unit_id":"V","unit_title":"Plane Motion of Rigid Bodies","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Energy and Momentum methods, Kinetic energy of"},{"number":2,"title":"rigid bodies, Linear and angular momentum principles, Eccentric impacts of rigid"},{"number":3,"title":"bodies"},{"number":4,"title":"Activities:"},{"number":5,"title":"Problem-solving assignments using computational tools/programming"},{"number":6,"title":"environments"},{"number":7,"title":"Case studies of rigid body motion in engineering systems"}]}],"remarks":""}]}$r2025_109_content$::jsonb,
	$r2025_109_books${"primary":[],"references":[{"title":"Ferdinand P. Beer, E. Russell Johnston, David Mazurek, Phillip J. Cornwell and","author":""},{"title":"R. C. Hibbeler, Engineering Mechanics: Statics & Dynamics, 16th Edition,","author":""},{"title":"James L. Meriam, L. G. Kraige and J. N. Bolton, Engineering Mechanics: Statics","author":""}]}$r2025_109_books$::jsonb,
	$r2025_109_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106180"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106180"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106286"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112106286"}]}$r2025_109_web$::jsonb,
	$r2025_109_ped${"methods":["Quiz and gamification","Assignments (25%)","Review of GATE/ESE"]}$r2025_109_ped$::jsonb,
	$r2025_109_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO2":"2"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO1":"2","PO2":"2","PO4":"2"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"2","PO3":"2","PO4":"2"},"psos":{"PSO1":"2","PSO2":"2"}}]}$r2025_109_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: Applied Engineering Mechanics.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- ME25C08 | METALLURGY AND MATERIALS SCIENCE
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, '5f4fcdca-7435-49e5-aef6-6d5d171e7ffb'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, 'b240f5a4-8ce8-4fd7-91cc-fec33384921d'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('ME25C08'))
		LIMIT 1
	),
	'ME25C08', 'METALLURGY AND MATERIALS SCIENCE',
	$r2025_110_obj${"objectives":[{"number":1,"description":"This course provides knowledge on phase diagrams, ferrous and non-ferrous materials, heat treatment processes, polymers, ceramics, composites, and mechanical behavior of engineering materials. It enables students to understand material selection, microstructure-property relationships, testing methods, and modern materials used in engineering applications."}]}$r2025_110_obj$::jsonb,
	$r2025_110_clos${"clos":[{"clo_number":1,"description":"Explain phase diagrams, heat treatment,\nengineering materials, and material properties.\n— —","k_values":[]},{"clo_number":2,"description":"Apply heat treatment methods, alloy selection,\nand material testing techniques.","k_values":[]},{"clo_number":3,"description":"Analyze microstructure, phase transformation,\nand failure behavior of materials.","k_values":[]},{"clo_number":4,"description":"Evaluate the performance of metallic, ceramic,\npolymer, and composite materials.","k_values":[]}]}$r2025_110_clos$::jsonb,
	$r2025_110_content${"units":[{"unit_id":"I","unit_title":"Constitution of Alloys and Phase Diagrams","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Constitution of alloys – Solid"},{"number":2,"title":"solutions, substitutional and interstitial – phase diagrams, Isomorphous, eutectic,"},{"number":3,"title":"eutectoid, peritectic, and peritectoid reactions, Iron – Iron carbide equilibrium"},{"number":4,"title":"diagram. Classification of steel and cast-Iron microstructure, properties and"},{"number":5,"title":"application."},{"number":6,"title":"Activity: Study of phase diagrams and microstructures."}]}],"remarks":""},{"unit_id":"II","unit_title":"Heat Treatment","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Definition – Full annealing, stress relief, recrystallisation and"},{"number":2,"title":"spheroidising – normalizing, hardening and tempering of steel. Isothermal"},{"number":3,"title":"transformation diagrams – cooling curves superimposed on I.T. diagram –"},{"number":4,"title":"continuous cooling Transformation (CCT) diagram – Austempering, Martempering"},{"number":5,"title":"– Hardenability, Jominy end quench test -case hardening, carburizing, Nitriding,"},{"number":6,"title":"cyaniding, carbonitriding – Flame and Induction hardening – Vacuum and Plasma"},{"number":7,"title":"hardening – Thermo-mechanical treatments- elementary ideas on sintering."},{"number":8,"title":"Activity: Demonstration of heat treatment and hardenability test."}]}],"remarks":""},{"unit_id":"III","unit_title":"Ferrous and Non-Ferrous Metals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Effect of alloying additions on steel (Mn, Si,"},{"number":2,"title":"Cr, Mo, Ni, V,Ti& W) – stainless and tool steels – HSLA - Maraging steels – Grey,"},{"number":3,"title":"white, malleable, spheroidal – alloy cast irons, Copper and its alloys – Brass,"},{"number":4,"title":"Bronze and Cupronickel – Aluminium and its alloys; Al-Cu – precipitation"},{"number":5,"title":"strengthening treatment – Titanium alloys, Mg-alloys, Ni-based super alloys –"},{"number":6,"title":"shape memory alloys- Properties and Applications-overview of materials"},{"number":7,"title":"standards."},{"number":8,"title":"Activity: Alloy identification and material selection exercise."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Non-Metallic Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Polymers – types of polymers, commodity and"},{"number":2,"title":"engineering polymers – Properties and applications of PE, PP, PS, PVC, PMMA,"},{"number":3,"title":"PET, PC, PA, ABS, PAI, PPO, PPS, PEEK, PTFE, Thermoset polymers – Urea"},{"number":4,"title":"and Phenol formaldehydes – Nylon, Engineering Ceramics – Properties and"},{"number":5,"title":"applications of Al2O3, SiC, Si3N4, PSZ and SIALON – intermetallics- Composites-"},{"number":6,"title":"Matrix and reinforcement Materials- applications of Composites - Nano"},{"number":7,"title":"composites."},{"number":8,"title":"Activity: Classification of polymers, ceramics, and composites."}]}],"remarks":""}]}$r2025_110_content$::jsonb,
	$r2025_110_books${"primary":[],"references":[{"title":"Kenneth G.Budinski and Michael K. Budinski, “Engineering Materials”,","author":""},{"title":"Sydney H. Avner, Introduction to Physical Metallurgy, McGraw Hill Education,","author":""},{"title":"Alavudeen N., Venkateshwaran N., and Winowlin Jappes J.T., A Textbook of","author":""},{"title":"Amandeep Singh Wadhwa and Harvinder Singh Dhaliwal, A Textbook of","author":""},{"title":"G.S. Upadhyay and Anish Upadhyay, Materials Science and Engineering, Viva","author":""},{"title":"Raghavan V., Materials Science and Engineering, Prentice Hall of India Pvt.","author":""},{"title":"William D. Callister Jr. and David G. Rethwisch, Materials Science and","author":""}]}$r2025_110_books$::jsonb,
	$r2025_110_web${"resources":[]}$r2025_110_web$::jsonb,
	$r2025_110_ped${"methods":["Quiz and gamification","Assignments (25%)","Review of"]}$r2025_110_ped$::jsonb,
	$r2025_110_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO2":"2"},"psos":{"PSO1":"2"}},{"co_id":"CO3","pos":{"PO1":"2","PO2":"2","PO4":"2"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO4","pos":{"PO2":"2","PO3":"2","PO5":"2"},"psos":{"PSO1":"2","PSO2":"2","PSO3":"1"}}]}$r2025_110_po$::jsonb,
	'11d35135-b028-4498-a2e6-63cf1c53b158'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: Metallurgy and Materials Science.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- UC25A02 | PHYSICAL EDUCATION – I
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('UC25A02'))
		LIMIT 1
	),
	'UC25A02', 'PHYSICAL EDUCATION – I',
	$r2025_111_obj${"objectives":[{"number":1,"description":"To impart the fundamentals of physical education for development of students’ physical, mental, and social well-being."},{"number":2,"description":"To instill a lifelong appreciation for physical activity towards the development of positive attitude and fostering values of team work and sportsmanship."}]}$r2025_111_obj$::jsonb,
	$r2025_111_clos${"clos":[{"clo_number":1,"description":"Explain the potential usage of Python in\nengineering applications","k_values":[]},{"clo_number":2,"description":"To apply the concepts of Python in solving\nengineering problems and formulate new\nprojects.","k_values":[]},{"clo_number":3,"description":"To interpret the data and effectively\ncommunicate in groups.","k_values":[]},{"clo_number":4,"description":"Adapt new programming concepts and\ntechnologies in the profession.","k_values":[]}]}$r2025_111_clos$::jsonb,
	$r2025_111_content${"units":[{"unit_id":"I","unit_title":"Introduction to physical education","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Exercise for Good Posture – Conditioning"},{"number":2,"title":"and Calisthenics for Before start, Jogging, Bending, Twisting, Standing, Sitting"},{"number":3,"title":"and Relaxation, Training on First Aid practices."}]}],"remarks":""},{"unit_id":"II","unit_title":"Participation of athletic events","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Rules and regulations of important athletic"},{"number":2,"title":"events, Sprint, Jumps, Throws and Hurdles."}]}],"remarks":""},{"unit_id":"III","unit_title":"Skill development in any one of the following outdoor games","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Basket Ball,"},{"number":2,"title":"Volley Ball, Ball Badminton, Football, Hockey, Kho-Kho, Kabaddi, Cricket, Hand"},{"number":3,"title":"ball and Tennis."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Skill development in any one of the following indoor games","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Shuttle"},{"number":2,"title":"Badminton, Chess and Table Tennis."}]}],"remarks":""}]}$r2025_111_content$::jsonb,
	$r2025_111_books${"primary":[],"references":[{"title":"Singh, A. (2008). Essentials of physical education. Kalyani Publishers.","author":""},{"title":"Kamlesh, M. L. (2006). Psychology in physical education and sport (3rd ed.).","author":""},{"title":"Mangal, S. K. (2009). Psychology of sports performance. Sports Publication.","author":""}]}$r2025_111_books$::jsonb,
	$r2025_111_web${"resources":[{"title":"who.int","url":"https://www.who.int/health-topics/physical-activity"},{"title":"who.int","url":"https://www.who.int/health-topics/physical-activity"}]}$r2025_111_web$::jsonb,
	$r2025_111_ped${"methods":["Attendance (60%)","Quiz and gamification","Participation in Sports"]}$r2025_111_ped$::jsonb,
	$r2025_111_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO5":"2"},"psos":{"PSO2":"2","PSO3":"1"}},{"co_id":"CO3","pos":{"PO2":"3","PO8":"1","PO9":"1"},"psos":{"PSO3":"2"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO2":"2"}}]}$r2025_111_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: UC25A02-PHYSICAL EDUCATION.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- UC25A04 | PHYSICAL EDUCATION – II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('UC25A04'))
		LIMIT 1
	),
	'UC25A04', 'PHYSICAL EDUCATION – II',
	$r2025_112_obj${"objectives":[{"number":1,"description":"To impart knowledge on gymnastic exercises and pressing needs for upskilling in a particular game."}]}$r2025_112_obj$::jsonb,
	$r2025_112_clos${"clos":[{"clo_number":1,"description":"Understand and explain the importance of physical\nactivity for mental and physical health.","k_values":[]},{"clo_number":2,"description":"Apply safety principles and methods during sports\nactivities.","k_values":[]},{"clo_number":3,"description":"Develop teamwork, discipline, and leadership\nthrough sports and group activities and collaborate\neffectively.","k_values":[]},{"clo_number":4,"description":"Demonstrate the advanced technical skills and\nstrategic understanding in the game of their interest.","k_values":[]}]}$r2025_112_clos$::jsonb,
	$r2025_112_content${"units":[{"unit_id":"I","unit_title":"Basic gymnastics exercises","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Warming up, Suitable exercise, Lead up games,"},{"number":2,"title":"Safety education, Movement education, Balanced Walk, execution, floor exercise,"},{"number":3,"title":"tumbling/acrobatics, grip, release, swinging, parallel bar exercise, horizontal bar"},{"number":4,"title":"exercise, flic-flac-walk and pyramids."}]}],"remarks":""},{"unit_id":"II","unit_title":"Upskilling in any one of the athletics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Broad Jump, High Jump, Triple Jump, Relay"},{"number":2,"title":"Sprints, Javelin Throw, Discuss Throw, Shot Put, Short and Long-distance Running."},{"number":3,"title":"Advance skills in any one of the indoor/outdoor games, which has been opted"},{"number":4,"title":"by the student in the I semester."}]}],"remarks":""}]}$r2025_112_content$::jsonb,
	$r2025_112_books${"primary":[],"references":[{"title":"Singh, A. (2008). Essentials of physical education. Kalyani Publishers.","author":""},{"title":"Kamlesh, M. L. (2006). Psychology in physical education and sport (3rd","author":""},{"title":"Mangal, S. K. (2009). Psychology of sports performance. Sports Publication.","author":""},{"title":"Kandappan, K. (2004). Foundations of physical education. Friends Publications.","author":""}]}$r2025_112_books$::jsonb,
	$r2025_112_web${"resources":[{"title":"who.int","url":"https://www.who.int/health-topics/physical-activity"}]}$r2025_112_web$::jsonb,
	$r2025_112_ped${"methods":["Attendance (60%)","Quiz and gamification","Participation in Sports"]}$r2025_112_ped$::jsonb,
	$r2025_112_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO3":"1"}},{"co_id":"CO3","pos":{"PO8":"3"},"psos":{"PSO3":"2"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO3":"2"}}]}$r2025_112_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: UC25A04 Physical Education - ll.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- UC25A01 | LIFE SKILLS FOR ENGINEERS – I
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('UC25A01'))
		LIMIT 1
	),
	'UC25A01', 'LIFE SKILLS FOR ENGINEERS – I',
	$r2025_113_obj${"objectives":[{"number":1,"description":"To equip engineering students with essential life skills encompassing personal and emotional development, effective management of time and stress, financial literacy, digital safety, and civic responsibility."},{"number":2,"description":"To enhance self-awareness, interpersonal skills, and resilience to prepare students for the professional and personal challenges of engineering careers and life beyond academics."}]}$r2025_113_obj$::jsonb,
	$r2025_113_clos${"clos":[{"clo_number":1,"description":"Explain the potential usage of Python in\nengineering applications","k_values":[]},{"clo_number":2,"description":"To apply the concepts of Python in solving\nengineering problems and formulate new\nprojects.","k_values":[]},{"clo_number":3,"description":"To interpret the data and effectively\ncommunicate in groups.","k_values":[]},{"clo_number":4,"description":"Adapt new programming concepts and\ntechnologies in the profession.","k_values":[]}]}$r2025_113_clos$::jsonb,
	$r2025_113_content${"units":[{"unit_id":"I","unit_title":"Personal and Emotional Development","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Self-Awareness & Personality, Emotional"},{"number":2,"title":"Intelligence & Empathy, Positive thinking, Right attitude, Stress & Anger Management,"},{"number":3,"title":"Goal-Setting & Time Management, Growth Mindset & Resilience."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Personality tests (MBTI, DISC), reflection journals, Empathy circle, role-"},{"number":2,"title":"playing difficult conversations, Guided mindfulness sessions, stress relief toolkit"},{"number":3,"title":"creation, Vision board creation, weekly time audit and planner, Group challenge"},{"number":4,"title":"scenarios, resilience journal."}]}],"remarks":""},{"unit_id":"III","unit_title":"Management Skills","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Financial Literacy: Budgeting & Saving, Nutrition, Health, and"},{"number":2,"title":"Hygiene, Digital Literacy & Online Safety, Civic Responsibility & Ethics"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Create a monthly budget, financial simulation game, Meal planning"},{"number":2,"title":"workshop, physical wellness challenge, Social media audit, privacy and safety"},{"number":3,"title":"scenarios, Community service, values debate."}]}],"remarks":""}]}$r2025_113_content$::jsonb,
	$r2025_113_books${"primary":[],"references":[{"title":"Khera, S. (2003). You can win. Macmillan.","author":""},{"title":"Levesque, H. (n.d.). Life skills 101: A practical guide to leaving home and living on","author":""},{"title":"Mitra, B. K. (2017). Personality development & soft skills (3rd impression). Oxford","author":""},{"title":"ICT Academy of Kerala. (2016). Life skills for engineers. McGraw Hill Education","author":""},{"title":"Matthes, E. (2019). Python crash course: A hands-on, project-based","author":""},{"title":"Brown, M. C. (2018). Python: The complete reference (4th ed.). McGraw Hill","author":""},{"title":"Guttag, J. V. (2016). Introduction to computation and programming using","author":""},{"title":"McKinney, W. (2017). Python for data analysis: Data wrangling with pandas,","author":""}]}$r2025_113_books$::jsonb,
	$r2025_113_web${"resources":[{"title":"docs.python.org","url":"https://docs.python.org/3/"},{"title":"docs.python.org","url":"https://docs.python.org/3/"},{"title":"w3schools.com","url":"https://www.w3schools.com/python/"},{"title":"w3schools.com","url":"https://www.w3schools.com/python/"},{"title":"numpy.org","url":"https://numpy.org/doc/"},{"title":"numpy.org","url":"https://numpy.org/doc/"},{"title":"scipy.org","url":"https://scipy.org/"},{"title":"scipy.org","url":"https://scipy.org/"},{"title":"developers.google.com","url":"https://developers.google.com/edu/python/"},{"title":"developers.google.com","url":"https://developers.google.com/edu/python/"}]}$r2025_113_web$::jsonb,
	$r2025_113_ped${"methods":["Assignments (20%)","Flipped classroom"]}$r2025_113_ped$::jsonb,
	$r2025_113_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"2","PO5":"2"},"psos":{"PSO2":"2","PSO3":"1"}},{"co_id":"CO3","pos":{"PO2":"3","PO8":"1","PO9":"1"},"psos":{"PSO3":"2"}},{"co_id":"CO4","pos":{"PO11":"1"},"psos":{"PSO2":"2"}}]}$r2025_113_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: UC25A01-LIFE SKILLS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- UC25A03 | LIFE SKILLS FOR ENGINEERS – II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('UC25A03'))
		LIMIT 1
	),
	'UC25A03', 'LIFE SKILLS FOR ENGINEERS – II',
	$r2025_114_obj${"objectives":[{"number":1,"description":"To impart and cultivate analytical reasoning, innovative thinking, effective collaboration, and ethical leadership to prepare students for complex challenges in professional and personal environments."}]}$r2025_114_obj$::jsonb,
	$r2025_114_clos${"clos":[{"clo_number":1,"description":"Explain the importance of leadership\nand management skills in life.","k_values":[]},{"clo_number":2,"description":"Apply and demonstrate creative\nthinking techniques to generate innovative\nsolutions.","k_values":[]},{"clo_number":3,"description":"Exhibit effective collaboration and communication\nskills through teamwork, active listening, and\nconflict resolution strategies.","k_values":[]},{"clo_number":4,"description":"Integrate scientific temperament and logical\nreasoning into c problem solving in engineering\nand real-world contexts.","k_values":[]}]}$r2025_114_clos$::jsonb,
	$r2025_114_content${"units":[{"unit_id":"I","unit_title":"Critical Thinking","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Creativity, Critical Thinking, Collaboration, Problem Solving,"},{"number":2,"title":"Decision Making, Imagination, Intuition, Experience, Sources of Creativity, Lateral"},{"number":3,"title":"Thinking, Myths of creativity, Critical thinking Vs Creative thinking, Convergent &"},{"number":4,"title":"Divergent Thinking, Critical reading & Multiple Intelligence."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Two-Brainstorm Method, “30 Circles” Challenge, “Desert Survival”"},{"number":2,"title":"Simulation, Lateral thinking riddles and puzzles, \"What If?\" Scenario Writing, Fast vs."}]}],"remarks":""},{"unit_id":"III","unit_title":"Slow Thinking Game, Creativity Myth Busters","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"IV","unit_title":"Problem Solving","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Techniques, Six Thinking Hats, Mind Mapping, Forced Connections."},{"number":2,"title":"Analytical Thinking, Numeric, symbolic, and graphic reasoning. Scientific temperament"},{"number":3,"title":"and Logical thinking."}]}],"remarks":""},{"unit_id":"V","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Case study analysis, Escape Room challenge."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Leadership","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Leadership Styles & Self-Assessment, Communication & Active Listening,"},{"number":2,"title":"Decision-Making & Responsibility, Teamwork & Delegation, Empathy, Integrity &"},{"number":3,"title":"Conflict Management, Vision, Motivation & Goal-Setting."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Crisis Leadership Simulation, Tower Challenge, Leadership Dilemmas"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Role-Play, Team Vision Board","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""}]}$r2025_114_content$::jsonb,
	$r2025_114_books${"primary":[],"references":[{"title":"De Bono, E. (2017). Six thinking hats, Little, Brown Book Group.","author":""},{"title":"Facione, P. A. (2015). Critical thinking: What it is and why it counts. Insight","author":""},{"title":"Kahneman, D. (2011). Thinking, fast and slow. Farrar, Straus and Giroux.","author":""},{"title":"Whetten, D. A., & Cameron, K. S. (2016). Developing management skills. Pearson.","author":""}]}$r2025_114_books$::jsonb,
	$r2025_114_web${"resources":[]}$r2025_114_web$::jsonb,
	$r2025_114_ped${"methods":["Assignments (20%)","Flipped classroom"]}$r2025_114_ped$::jsonb,
	$r2025_114_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO7":"3"},"psos":{"PSO1":"1","PSO2":"1"}},{"co_id":"CO3","pos":{"PO8":"2"},"psos":{"PSO3":"3"}},{"co_id":"CO4","pos":{"PO11":"2"},"psos":{"PSO2":"1","PSO3":"2"}}]}$r2025_114_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: UC25A03 Life Skills for Engineers – II.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- UC25F01 | DEUTSCH – I
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('UC25F01'))
		LIMIT 1
	),
	'UC25F01', 'DEUTSCH – I',
	$r2025_115_obj${"objectives":[{"number":1,"description":"To impart fundamentals of the Deutsch language, including reading, writing systems, pronunciation, and speaking."}]}$r2025_115_obj$::jsonb,
	$r2025_115_clos${"clos":[{"clo_number":1,"description":"Understand simple spoken Deutsch in everyday\ncontexts.","k_values":[]},{"clo_number":2,"description":"Communicate with widely used Deutsch words\neffectively.","k_values":[]},{"clo_number":3,"description":"Develop the skills necessary for self-directed\nlearning and continuous improvement in Deutsch\nlanguage.","k_values":[]}]}$r2025_115_clos$::jsonb,
	$r2025_115_content${"units":[{"unit_id":"I","unit_title":"Basics & Introduction","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"German alphabet and pronunciation, Basic greetings and"},{"number":2,"title":"farewells, Introducing yourself and others (Ich heiße…, Wer bist du?), Numbers 1–100"},{"number":3,"title":"and days of the week, Personal pronouns (ich, du, er, sie…), Sentence structure (SVO"},{"number":4,"title":"word order)."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Alphabet spelling game, short skits, Use color-coded cards for SVO"},{"number":2,"title":"sentences."}]}],"remarks":""},{"unit_id":"III","unit_title":"Grammar Essentials & Everyday Vocabulary","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Present tense of regular verbs (spielen,"},{"number":2,"title":"arbeiten, machen…), Common irregular verbs: sein (to be), haben (to have), gehen,"},{"number":3,"title":"kommen, Articles and gender (der, die, das; ein, eine), Simple questions and negation"},{"number":4,"title":"(nicht, kein), Describing people and things: adjectives and colors, Family, school, food,"},{"number":5,"title":"and common objects vocabulary."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Conjugate regular and irregular verbs, “Question Chain” game, Create a"},{"number":2,"title":"simple family tree."}]}],"remarks":""},{"unit_id":"V","unit_title":"Everyday Communication in German","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Asking for and giving directions, Telling the"},{"number":2,"title":"time and talking about schedules, Ordering food and drinks at a café or restaurant,"},{"number":3,"title":"Talking about hobbies, weather, and daily routines, Listening to short conversations and"},{"number":4,"title":"responding appropriately, Introduction to German culture and formal/informal language"},{"number":5,"title":"use (du vs Sie)."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Ordering food and drinks, Give directions, Formal / Informal greetings, Do’s"},{"number":2,"title":"and Don’ts."}]}],"remarks":""}]}$r2025_115_content$::jsonb,
	$r2025_115_books${"primary":[],"references":[{"title":"Funk, H., Kuhn, C., & Demme, S. (2015). Menschen A1: Deutsch als","author":""}]}$r2025_115_books$::jsonb,
	$r2025_115_web${"resources":[]}$r2025_115_web$::jsonb,
	$r2025_115_ped${"methods":["Assignments (30%)","Quiz and gamification","Internal"]}$r2025_115_ped$::jsonb,
	$r2025_115_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO9":"2"},"psos":{"PSO3":"2"}},{"co_id":"CO3","pos":{"PO11":"1"},"psos":{"PSO3":"2"}}]}$r2025_115_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: UC25F01_Deutsch – I.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CY25C01 | APPLIED CHEMISTRY - I
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CY25C01'))
		LIMIT 1
	),
	'CY25C01', 'APPLIED CHEMISTRY - I',
	$r2025_116_obj${"objectives":[{"number":1,"description":"To provide students with a solid understanding of the chemical principles for engineering applications."},{"number":2,"description":"To introduce the chemical properties of materials and how these properties influence the selection and use of materials in engineering systems."},{"number":3,"description":"To impart practical applications of chemistry in commonly used engineering devices"}]}$r2025_116_obj$::jsonb,
	$r2025_116_clos${"clos":[{"clo_number":1,"description":"Understand the importance of chemistry\napplications with underlying mechanisms.","k_values":[]},{"clo_number":2,"description":"Apply the chemistry concepts in widely used\ndevices.","k_values":[]},{"clo_number":3,"description":"Analyse the effect of various chemical parameters\non performance of engineering systems.","k_values":[]},{"clo_number":4,"description":"Perform experimentations as a group and interpret\nthe results.","k_values":[]},{"clo_number":5,"description":"Communicate findings through case studies and\nreports","k_values":[]}]}$r2025_116_clos$::jsonb,
	$r2025_116_content${"units":[{"unit_id":"I","unit_title":"Water Technology","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Water quality parameters and standards. Industrial feed water,"},{"number":2,"title":"Remediation. Municipal water treatment. Desalination."},{"number":3,"title":"Practical: Analysis of alkalinity, hardness and dissolved oxygen."},{"number":4,"title":"Activity: Coagulation of water sample using Alum"}]}],"remarks":""},{"unit_id":"II","unit_title":"Nano-chemistry","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Classification, Size, dependent properties. Preparation of"},{"number":2,"title":"nanomaterials, Top-down and Bottom-Up approaches, Applications (Flipped"},{"number":3,"title":"classroom)."},{"number":4,"title":"Practical: Preparation of nanoparticles by Sol-Gel method."}]}],"remarks":""},{"unit_id":"III","unit_title":"Electrochemistry","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Electrochemical cell, Electrode potential., Redox reaction."},{"number":2,"title":"Conductivity of electrolytes, Factors."},{"number":3,"title":"Practical: Conductometric titrations"},{"number":4,"title":"Activity: Electrochemical cell demonstration"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Corrosion & Control","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Chemical and electrochemical corrosions, galvanic series,"},{"number":2,"title":"factors influencing corrosion, Electrochemical protection. Organic and Inorganic"},{"number":3,"title":"coating."},{"number":4,"title":"Practical: Corrosion study by weight loss and salt spray method."},{"number":5,"title":"Practical: Potentiometry/UV-visible spectrophotometer."}]}],"remarks":""},{"unit_id":"V","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Case Study on Corrosion in Pipelines and Electronics, Control measures"},{"number":2,"title":"for a corroded metal"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Batteries","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Conventional, Contemporary and Emerging battery storage technologies,"},{"number":2,"title":"Primary & Secondary Batteries, Battery Pack, Battery Materials, Performance"},{"number":3,"title":"Parameters, Testing, Safety aspects."},{"number":4,"title":"Practical: Measurement of EMF, Internal Resistance, Charge and Discharge"},{"number":5,"title":"Characteristics."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of battery pack in e-vehicles."}]}],"remarks":""}]}$r2025_116_content$::jsonb,
	$r2025_116_books${"primary":[],"references":[{"title":"Jain, P. C., & Jain, M. (2015). Engineering Chemistry (17th ed.). Dhanpat Rai","author":""},{"title":"Dara, S. S. (2004). A Textbook of Engineering Chemistry. Chand Publications.","author":""},{"title":"Sachdeva, M. V. (2011). Basics of Nano Chemistry. Anmol Publications Pvt Ltd.","author":""},{"title":"Friedrich, E. (2014). Engineering Chemistry. Medtech.","author":""}]}$r2025_116_books$::jsonb,
	$r2025_116_web${"resources":[{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/105106202."},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/113106028."},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/112104088"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/115106130"},{"title":"batteryuniversity.com","url":"https://batteryuniversity.com/articles"}]}$r2025_116_web$::jsonb,
	$r2025_116_ped${"methods":["Quiz and gamification","Assignments (20%)","Flipped classroom"]}$r2025_116_ped$::jsonb,
	$r2025_116_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"2","PSO2":"1"}},{"co_id":"CO4","pos":{"PO4":"3","PO8":"1"},"psos":{"PSO2":"2","PSO3":"2"}},{"co_id":"CO5","pos":{"PO9":"1"},"psos":{"PSO2":"2","PSO3":"3"}}]}$r2025_116_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CY25C01-APPLIED CHEMISTRY-I.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- CY25C03 | APPLIED CHEMISTRY (ME) – II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('CY25C03'))
		LIMIT 1
	),
	'CY25C03', 'APPLIED CHEMISTRY (ME) – II',
	$r2025_117_obj${"objectives":[]}$r2025_117_obj$::jsonb,
	$r2025_117_clos${"clos":[{"clo_number":1,"description":"Explain the major concepts of chemistry with regard to\napplications in mechanical systems.","k_values":[]},{"clo_number":2,"description":"Apply the chemistry principles and evaluate the\nengineering materials in mechanical systems.","k_values":[]},{"clo_number":3,"description":"Analyse and evaluate the performance and efficiency\nof mechanical systems.","k_values":[]},{"clo_number":4,"description":"Propose innovative solutions for real-world applications\nand challenges.","k_values":[]}]}$r2025_117_clos$::jsonb,
	$r2025_117_content${"units":[{"unit_id":"I","unit_title":"Functional Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Types, Smart coatings, Mechanisms, Sustainable energy"},{"number":2,"title":"materials."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Seminar on recent development in functional materials (e.g., smart"},{"number":2,"title":"coatings, self-cleaning surfaces), Infographic Design of functional nanomaterials."}]}],"remarks":""},{"unit_id":"III","unit_title":"Fuels","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Classification, Chemical Composition, natural resources, Calorific Value -"},{"number":2,"title":"Alternative Fuels - Natural gas benefits."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Comparison of efficiency and emissions in fuels."}]}],"remarks":""},{"unit_id":"V","unit_title":"Composites","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Matrix materials – Reinforcements, Hybrid composites, Engineering"},{"number":2,"title":"applications."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Design of a simple composite structure for a real engineering"},{"number":2,"title":"application (e.g., lightweight bike frame)."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Lubricants","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Types, Functions. Key properties, Synthetic lubricants, Mechanisms,"},{"number":2,"title":"Emerging lubricants."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Collection of lubricants used in real-world engineering systems (e.g.,"},{"number":2,"title":"gears, engines, bearings), Virtual demonstration of lubricant viscosity testing."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Combustion","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Reaction Kinetics, Stoichiometric combustion and air-fuel ratio"},{"number":2,"title":"calculations, Knocking and Anti-knocking agents, Hydrogen combustion, Flue Gas"},{"number":3,"title":"analysis."}]}],"remarks":""},{"unit_id":"X","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual simulation of flue gas analysis and gas composition, Calculation"},{"number":2,"title":"of air-fuel ratio."}]}],"remarks":""},{"unit_id":"XI","unit_title":"Adhesives","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Adhesion Mechanisms, Classification, Bond strength, Industrial"},{"number":2,"title":"adhesives."}]}],"remarks":""},{"unit_id":"XII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Adhesion of thermal pads on different Integrated circuits, Industrial"},{"number":2,"title":"adhesives."}]}],"remarks":""}]}$r2025_117_content$::jsonb,
	$r2025_117_books${"primary":[],"references":[{"title":"Palanna, O. G. (2009). Engineering chemistry. McGraw-Hill Education (India)","author":""},{"title":"Cheong, K. Y., Impellizzeri, G., & Fraga, M. A. (2018). Emerging materials for","author":""},{"title":"Jain, P. C., & Jain, M. (2013). Engineering chemistry. Dhanpat Rai Publishing","author":""}]}$r2025_117_books$::jsonb,
	$r2025_117_web${"resources":[]}$r2025_117_web$::jsonb,
	$r2025_117_ped${"methods":["Quiz and gamification","Seminar presentation","Assignments (30%)"]}$r2025_117_ped$::jsonb,
	$r2025_117_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2"}},{"co_id":"CO3","pos":{"PO2":"3","PO3":"1"},"psos":{"PSO2":"2","PSO3":"1"}},{"co_id":"CO4","pos":{"PO9":"1"}}]}$r2025_117_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: CY25C03-Applied Chemistry (ME) – II.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EN25C01 | ENGLISH ESSENTIALS – I
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EN25C01'))
		LIMIT 1
	),
	'EN25C01', 'ENGLISH ESSENTIALS – I',
	$r2025_118_obj${"objectives":[{"number":1,"description":"Enhance learners’ listening and speaking skills to understand and deliver speeches effectively"},{"number":2,"description":"Equip students with the skills to write clear, coherent, and grammatically correct texts for various purposes."},{"number":3,"description":"Strengthen the ability to comprehend, interpret, and analyse written English across diverse contexts."}]}$r2025_118_obj$::jsonb,
	$r2025_118_clos${"clos":[{"clo_number":1,"description":"Listen and comprehend spoken English, take\nand draft notes.","k_values":[]},{"clo_number":2,"description":"Apply vocabulary and grammar appropriately to\ncommunicate in written and spoken forms.","k_values":[]},{"clo_number":3,"description":"Analyze texts in different contexts using\nappropriate reading strategies.","k_values":[]},{"clo_number":4,"description":"Communicate thoughts and ideas in real life\nsituations.","k_values":[]},{"clo_number":5,"description":"Develop communication skills relevant to\nengineering and technology.","k_values":[]}]}$r2025_118_clos$::jsonb,
	$r2025_118_content${"units":[{"unit_id":"I","unit_title":"Speaking Skills","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Self-Introduction (Tenses, Adjectives) Expressing opinions"},{"number":2,"title":"(Subject-Verb Agreement), Participating in Conversations (Speech Acts - agreeing &"},{"number":3,"title":"disagreeing – synonyms and antonyms)"}]}],"remarks":""},{"unit_id":"II","unit_title":"Suggested Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Self-Introduction, Just a Minute (JAM) Video recording,"},{"number":2,"title":"Situational role plays, Spell Bee, Word Substitution, Usage of Apps."}]}],"remarks":""},{"unit_id":"III","unit_title":"Listening Skills","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Listening to Simple Conversations (Understanding tone and intent),"},{"number":2,"title":"Short Speeches / Stories, Extracting information, Pronunciation, Listening to Various"},{"number":3,"title":"Accents."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Suggested Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Listening and Repeating, Gap fill exercises, Note-taking"}]}],"remarks":""},{"unit_id":"V","unit_title":"Reading Skills","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Reading Strategies – (Skimming, scanning, predicting) intensive"},{"number":2,"title":"reading - short passages and long passages on suggested themes (Sentence"},{"number":3,"title":"Patterns, Prefixes and suffixes, idioms and phrases)."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Reading"},{"number":2,"title":"newspaper and digital articles, Cloze, Reading comprehension,"},{"number":3,"title":"note making and summarising,"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Writing Skills","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Word Substitution, Sentence Formation, Hints Development (Guided"},{"number":2,"title":"Writing), Writing Different Types of Paragraphs - (Sentence Structure) – Letter Writing"},{"number":3,"title":"/ Emails (Informal)"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Error Detection, Picture and poster description, Descriptive, Narrative and"},{"number":2,"title":"Comparative paragraphs, Brainstorming and Mind Mapping - Informal letters/ Emails"}]}],"remarks":""}]}$r2025_118_content$::jsonb,
	$r2025_118_books${"primary":[],"references":[{"title":"Miller, K. Q., & Wahl, S. T. (2023). Business and Professional Communication:","author":""},{"title":"Kumar, Sanjay & Pushpalatha. (2018). English Language and Communication","author":""},{"title":"Sharma, S., & Mishra, B. (2024). Communication Skills for Engineers and","author":""}]}$r2025_118_books$::jsonb,
	$r2025_118_web${"resources":[{"title":"cambridgeenglish.org","url":"https://www.cambridgeenglish.org/learning-"},{"title":"cambridgeenglish.org","url":"https://www.cambridgeenglish.org/learning-"}]}$r2025_118_web$::jsonb,
	$r2025_118_ped${"methods":["Quiz and gamification","Assignments (20%)","Speaking Task (10%)"]}$r2025_118_ped$::jsonb,
	$r2025_118_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2","PSO3":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO2":"1"}},{"co_id":"CO4","pos":{"PO9":"2"},"psos":{"PSO3":"2"}},{"co_id":"CO5","pos":{"PO11":"1"},"psos":{"PSO3":"3"}}]}$r2025_118_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EN25C01- ENGLISH ESSENTIALS-I.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EN25C02 | ENGLISH ESSENTIALS – II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EN25C02'))
		LIMIT 1
	),
	'EN25C02', 'ENGLISH ESSENTIALS – II',
	$r2025_119_obj${"objectives":[{"number":1,"description":"Enable learners to improve fluency and accuracy in spoken and written communication."},{"number":2,"description":"Develop learners’ ability to articulate ideas clearly and effectively in formal and informal spoken interactions."},{"number":3,"description":"Help learners construct well-organised written documents relevant to academic and workplace contexts."}]}$r2025_119_obj$::jsonb,
	$r2025_119_clos${"clos":[{"clo_number":4,"description":"Understand the importance of communication\nand drafting skills in engineering and\ntechnology.","k_values":[]},{"clo_number":5,"description":"Apply listening strategies to comprehend\nspoken English in various contexts.","k_values":[]},{"clo_number":6,"description":"Participate actively in group discussions by\nanalysing critically from different views.","k_values":[]},{"clo_number":7,"description":"Create written reports coherently for various\npurposes.","k_values":[]},{"clo_number":8,"description":"Adapt communication styles to global,\nmulticultural environments.","k_values":[]}]}$r2025_119_clos$::jsonb,
	$r2025_119_content${"units":[{"unit_id":"I","unit_title":"Oral Communication","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Types (Verbal and Nonverbal), Interpersonal and group"},{"number":2,"title":"communication, Telephonic conversation."}]}],"remarks":""},{"unit_id":"II","unit_title":"Suggested Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Short presentations, Debates, Formal Speeches (Welcome,"},{"number":2,"title":"Vote of Thanks and introducing guests), Listen and respond to short podcasts."}]}],"remarks":""},{"unit_id":"III","unit_title":"Business Correspondence","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Email Communication, Formal Letters (Types),"},{"number":2,"title":"Business Meeting."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Suggested Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Email and letter writing (Complaint, request, permission),"},{"number":2,"title":"Agenda, minutes of the meeting."}]}],"remarks":""},{"unit_id":"V","unit_title":"Academic Writing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Paraphrasing, Summarizing, Essay Writing, Instructions and"},{"number":2,"title":"Recommendations."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Suggested Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Essay writing (Cause and effect, argumentative, persuasive),"},{"number":2,"title":"User guides/ manuals, policy document."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Team Work","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Leadership Skills (Team building, Team Leader, Team player),"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Negotiation and Problem solving skills","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"IX","unit_title":"Suggested Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"SWOT Analysis, Brainstorming and Group discussions."}]}],"remarks":""}]}$r2025_119_content$::jsonb,
	$r2025_119_books${"primary":[],"references":[{"title":"Koneru Aruna. (2020). English Language Skills for Engineers. McGraw Hill","author":""},{"title":"Taylor, Shirley & Chandra .V. (2010). Communication for Business A Practical","author":""},{"title":"Ian Badger, et al., (2014). Listening: B2 (Collins English for Life: Skills),","author":""},{"title":"Raymond Murphy (2019), Grammar in Use, Cambridge University Press.","author":""}]}$r2025_119_books$::jsonb,
	$r2025_119_web${"resources":[{"title":"open.umn.edu","url":"https://open.umn.edu/opentextbooks/textbooks/8"},{"title":"ted.com","url":"https://www.ted.com/"},{"title":"ted.com","url":"https://www.ted.com/"}]}$r2025_119_web$::jsonb,
	$r2025_119_ped${"methods":["Worksheets (10%)","Group discussion","Report Writing"]}$r2025_119_ped$::jsonb,
	$r2025_119_po${"mappings":[{"co_id":"CO4","pos":{}},{"co_id":"CO5","pos":{"PO1":"3"},"psos":{"PSO3":"2"}},{"co_id":"CO6","pos":{"PO2":"2","PO8":"1"},"psos":{"PSO3":"3"}},{"co_id":"CO7","pos":{"PO9":"2"},"psos":{"PSO3":"2"}},{"co_id":"CO8","pos":{"PO11":"1"},"psos":{"PSO2":"2"}}]}$r2025_119_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EN25C02-ENGLISH ESSENTIALS-II.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EN25C03 | ENGLISH COMMUNICATIONSKILLS LABORATORY– I
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EN25C03'))
		LIMIT 1
	),
	'EN25C03', 'ENGLISH COMMUNICATIONSKILLS LABORATORY– I',
	$r2025_120_obj${"objectives":[{"number":1,"description":"The objectives of the course are to foster students’ confidence and fluency in professional and social communication and to bridge the gap between academic English and industry expectations."}]}$r2025_120_obj$::jsonb,
	$r2025_120_clos${"clos":[{"clo_number":1,"description":"Communicate effectively in everyday professional\nsituations with confidence - -","k_values":[]},{"clo_number":2,"description":"Deliver well-organised and effective presentations.","k_values":[]},{"clo_number":3,"description":"Participate in group discussions and express ideas\nclearly and confidently.","k_values":[]},{"clo_number":4,"description":"Create professional video resumes and participate in\ninterviews effectively.","k_values":[]},{"clo_number":5,"description":"Create, record and publish motivational podcasts.","k_values":[]}]}$r2025_120_clos$::jsonb,
	$r2025_120_content${"units":[{"unit_id":"I","unit_title":"List of Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"A. Elements of Effective Speaking and Listening"},{"number":2,"title":"(i) Sharing life experience/ turning point in their life – SATORI"},{"number":3,"title":"(ii) Situational Conversation – eg. Talking to a Senior about Internship Tips"},{"number":4,"title":"(iii) Welcoming a Guest Speaker at a Seminar"},{"number":5,"title":"(iv) Pictography to represent data using images or symbols"},{"number":6,"title":"(v) B2-C1 Listening exercises include lectures, interviews, and discussions."},{"number":7,"title":"B. Mastering Presentations"},{"number":8,"title":"(i) Presentation Skills – Non-verbal communication"},{"number":9,"title":"(ii) Mini-Presentations: Topics like “My Dream Project,” “Engineering in"},{"number":10,"title":"2050,”3-minute technical pitches with logical flow"},{"number":11,"title":"(iii) Technical Presentations with PPT"},{"number":12,"title":"C. Group Discussion Strategies:"},{"number":13,"title":"(i) Introduction to Group Discussions - Key skills for effective participation"},{"number":14,"title":"(ii) Phases in a GD and Conversational Phrases in GD."},{"number":15,"title":"(iii) Group Discussions – Abstract and Factual topics"},{"number":16,"title":"D. Resume & LinkedIn Optimization"},{"number":17,"title":"(i) Building LinkedIn Profile – Drafting headlines and summaries"},{"number":18,"title":"(ii) Social Media Optimisation"},{"number":19,"title":"(iii) Preparing Video Resume"},{"number":20,"title":"E. Podcast-Based Language Learning:"},{"number":21,"title":"(i) Listening to podcast (motivational, career oriented, success stories)"},{"number":22,"title":"(ii) Podcast Preparation – Purpose – Topic – Structure – Recording Tips -"},{"number":23,"title":"Publication of the Podcast"}]}],"remarks":""}]}$r2025_120_content$::jsonb,
	$r2025_120_books${"primary":[],"references":[{"title":"Floyd Kory, “Interpersonal Communication”, McGraw Hill Publication, 2023.","author":""},{"title":"Bharadwaj Apoorva, “Leadership Communication Skills for Intercultural","author":""},{"title":"Helen Spencer-Oatey and DomnaLazidou, “Making Working Relationships","author":""},{"author":"Presentations","title":"Cambridge"},{"title":"Speaking Extra -","author":""},{"author":"Listening Extra","title":"Miles Craven by Cambridge University Press"},{"author":"CVs, Resumes, and LinkedIn: A Guide to Professional English","title":"Springer"}]}$r2025_120_books$::jsonb,
	$r2025_120_web${"resources":[{"title":"curiosity.com","url":"https://curiosity.com/videos/simon-sinek-on-training-your-mind-to-perform-"},{"title":"inc.com","url":"https://www.inc.com/video/simon-sinek-explains-why-you-should-put-people-"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=bBsT9omTeh0"}]}$r2025_120_web$::jsonb,
	$r2025_120_ped${"methods":[]}$r2025_120_ped$::jsonb,
	$r2025_120_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO9":"3"},"psos":{"PSO1":"1","PSO3":"2"}},{"co_id":"CO3","pos":{"PO8":"2","PO9":"3"},"psos":{"PSO3":"2"}},{"co_id":"CO4","pos":{"PO9":"2"},"psos":{"PSO3":"3"}},{"co_id":"CO5","pos":{"PO9":"2","PO11":"1"},"psos":{"PSO2":"2","PSO3":"3"}}]}$r2025_120_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EN25C03 English Communication Skills Laboratory.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- EN25C04 | ENGLISH COMMUNICATION SKILLS LABORATORY – II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('EN25C04'))
		LIMIT 1
	),
	'EN25C04', 'ENGLISH COMMUNICATION SKILLS LABORATORY – II',
	$r2025_121_obj${"objectives":[{"number":1,"description":"The objectives of the course are to build students’ advanced communication skills for workplace readiness and develop intercultural competence for effective collaboration in global and virtual teams. Prepare students for competitive exams with focused skill-building and test-oriented practice."}]}$r2025_121_obj$::jsonb,
	$r2025_121_clos${"clos":[{"clo_number":1,"description":"Understand basic industry-related reading\nmaterials. - -","k_values":[]},{"clo_number":2,"description":"Design and present a domain specific poster","k_values":[]},{"clo_number":3,"description":"Deliver effective digital presentations","k_values":[]},{"clo_number":4,"description":"Communicate appropriately in\nintercultural/cross cultural contexts","k_values":[]},{"clo_number":5,"description":"Perform in interviews and competitive exams\nsuccessfully","k_values":[]}]}$r2025_121_clos$::jsonb,
	$r2025_121_content${"units":[{"unit_id":"I","unit_title":"List of Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Stage Ready – Impactful Public Speaking ."},{"number":2,"title":"(i) Simulate a formal event such as an academic conference, convocation, or"},{"number":3,"title":"awards ceremony, where students roles including Master of Ceremonies (MC),"}]}],"remarks":""},{"unit_id":"II","unit_title":"Role as a dignitary, and a Commentator","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"(ii) Visual Prompt Storytelling: Use random images to create spontaneous stories,"},{"number":2,"title":"focusing on plot, setting, and character,"},{"number":3,"title":"(iii) Digital Presentation - Record a short video explaining a project or technical"},{"number":4,"title":"concept, using slides, voiceover, and visual aids (to be uploaded using google"},{"number":5,"title":"classroom or drive link)"}]}],"remarks":""},{"unit_id":"III","unit_title":"Professional and Application-Oriented Writing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"(i) Résumé Preparation: Design ATS-friendly résumés tailored to various job descriptions,"},{"number":2,"title":"using action verbs and quantifiable impact. ·"},{"number":3,"title":"(ii) Design engaging content for poster presentation relevant to their domain."},{"number":4,"title":"Receptive Skills in Workplace Communication·"},{"number":5,"title":"(i) Reading articles related to their domain and discuss in groups"},{"number":6,"title":"(ii) Visit company websites, make inferences and present in the class"},{"number":7,"title":"(iii) Listen to recorded mock interviews and take detailed notes. Summarise key points and"},{"number":8,"title":"action items in a professional format and make a presentation."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Intercultural Communication","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"(i) Assertive vs Aggressive communication"},{"number":2,"title":"(ii) Role play activities – workplace communication in intercultural/crosscultural contexts"}]}],"remarks":""},{"unit_id":"V","unit_title":"From Campus to Career","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Industry Skills and Global Exam Preparation"},{"number":2,"title":"(i) Participate in HR interviews using AI tools or peer interviewers, responding to"},{"number":3,"title":"behavioural questions using methods like STAR (Situation, Task, Action, Result)"},{"number":4,"title":"(ii) Practice Verbal Ability in competitive exams like UPSC, SSC, CDS, TNPSC, etc."}]}],"remarks":""}]}$r2025_121_content$::jsonb,
	$r2025_121_books${"primary":[],"references":[{"title":"Lucas, Stephen, and Paul Stob. The Art of Public Speaking. Thirteenth edition,","author":""},{"title":"Abrahams, Matt. Think Faster, Talk Smarter: How to Speak Successfully When","author":""},{"title":". Beshara, Tony. Powerful Phrases for Successful Interviews, Rev. ed.,","author":""},{"title":"Papalia, Anna. Interviewology: The New Science of Interviewing. Harper Business,","author":""},{"title":"Verbal Ability and Reading Comprehension by Ajay Singh McGraw Hill","author":""}]}$r2025_121_books$::jsonb,
	$r2025_121_web${"resources":[{"title":"owl.purdue.edu","url":"https://owl.purdue.edu/"},{"title":"canva.com","url":"https://www.canva.com/resumes/"},{"title":"bbc.co.uk","url":"https://www.bbc.co.uk/learningenglish/english/features/pronunciation"}]}$r2025_121_web$::jsonb,
	$r2025_121_ped${"methods":[]}$r2025_121_ped$::jsonb,
	$r2025_121_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO9":"3"},"psos":{"PSO1":"2","PSO3":"3"}},{"co_id":"CO3","pos":{"PO9":"3"},"psos":{"PSO2":"1"}},{"co_id":"CO4","pos":{"PO9":"3","PO11":"1"},"psos":{"PSO3":"3"}},{"co_id":"CO5","pos":{"PO9":"3"},"psos":{"PSO3":"1"}}]}$r2025_121_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: EN25C04 English Communication Skills Laboratory-II.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MA25C01 | APPLIED CALCULUS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MA25C01'))
		LIMIT 1
	),
	'MA25C01', 'APPLIED CALCULUS',
	$r2025_122_obj${"objectives":[{"number":1,"description":"To provide technical competence of modelling engineering problems using calculus."},{"number":2,"description":"To apply the calculus concepts in solving engineering problems using analytical methods and computational tools."}]}$r2025_122_obj$::jsonb,
	$r2025_122_clos${"clos":[{"clo_number":1,"description":"Explain the meaning of derivative, integral,\nand their geometric and physical\ninterpretations.","k_values":[]},{"clo_number":2,"description":"Apply differentiation and integration\ntechniques to compute maxima, minima,\nand area.","k_values":[]},{"clo_number":3,"description":"Analyze the behavior of single and\nmultivariable functions using derivatives and\npartial derivatives.","k_values":[]},{"clo_number":4,"description":"Utilize modern computational software\nand online platforms to deepen\nunderstanding, perform complex\ncalculations, and\nvisualize mathematical concepts.","k_values":[]}]}$r2025_122_clos$::jsonb,
	$r2025_122_content${"units":[{"unit_id":"I","unit_title":"Differential Calculus","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Functions, graph of functions, New functions from old functions,"},{"number":2,"title":"Limit of a function, Continuity, Limits at infinity, Derivative as a function, Maxima and"},{"number":3,"title":"Minima of functions of single variable, Mean value theorem, Effect of derivatives on the"},{"number":4,"title":"shape of a graph."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Visualization of the functions, Maxima and Minima of a function using"},{"number":2,"title":"open-source software, Solving of Competitive Examination questions (Ex. GATE)."}]}],"remarks":""},{"unit_id":"III","unit_title":"Functions of Several Variables","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Partial derivatives, Chain rule, Total derivative,"},{"number":2,"title":"Maxima and minima of functions of two variables, Method of Lagrange’s Multipliers,"},{"number":3,"title":"Application problems in engineering."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Partial Derivatives with two or three variables, Maxima and Minima of a"},{"number":2,"title":"function using open-source software, Solving of Competitive Examination questions"},{"number":3,"title":"(Ex. GATE)."}]}],"remarks":""},{"unit_id":"V","unit_title":"Integral Calculus","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Fundamental theorem of Calculus, Indefinite integrals and the Net"},{"number":2,"title":"Change Theorem, Improper integrals, Arc Length, Area of Region, Area of surface of"},{"number":3,"title":"revolution."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Definite and Indefinite Integrals, Determination of Area, Solving of"},{"number":2,"title":"Competitive Examination questions (Ex. GATE)."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Multiple Integrals","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Iterated integrals and Fubini’s theorem, Evaluation of double"},{"number":2,"title":"integrals, change of order of integration, change of variables between Cartesian and"},{"number":3,"title":"polar co-ordinates, evaluation of triple integrals-change of variables between Cartesian"},{"number":4,"title":"and cylindrical and spherical co-ordinates."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Double integrals and triple integrals using open-source software, Solving of"},{"number":2,"title":"Competitive Examination questions (Ex. GATE)."}]}],"remarks":""}]}$r2025_122_content$::jsonb,
	$r2025_122_books${"primary":[],"references":[{"title":"Anton, H., Bivens, I. C., & Davis, S. (2021). Calculus: Early transcendentals. John","author":""},{"title":"Ron Larson and David C. Falvo, (2013), Calculus: an Applied Approach. Cengage","author":""},{"title":"Stewart, J., Clegg, D., & Watson, S. (2019). Calculus: Early transcendentals.","author":""},{"title":"Thomas, G. B., Jr., Weir, M. D., Hass, J., & Heil, C. (2018). Thomas' calculus: Early","author":""},{"title":"Singh, K. (2019). Engineering mathematics through applications. Bloomsbury","author":""},{"title":"Grewal, B. S. (2012). Higher engineering mathematics. Khanna Publishers.","author":""}]}$r2025_122_books$::jsonb,
	$r2025_122_web${"resources":[{"title":"math.libretexts.org","url":"https://math.libretexts.org/Bookshelves/Calculus/Map%3A_Calculus"},{"title":"math.libretexts.org","url":"https://math.libretexts.org/Bookshelves/Calculus/Map%3A_Calculus"},{"title":"openstax.org","url":"https://openstax.org/books/calculus-volume-1/"},{"title":"openstax.org","url":"https://openstax.org/books/calculus-volume-1/"},{"title":"tutorial.math.lamar.edu","url":"https://tutorial.math.lamar.edu/Classes/CalcII/CalcII.aspx"},{"title":"tutorial.math.lamar.edu","url":"https://tutorial.math.lamar.edu/Classes/CalcII/CalcII.aspx"},{"title":"scilab.org","url":"https://www.scilab.org/"},{"title":"scilab.org","url":"https://www.scilab.org/"}]}$r2025_122_web$::jsonb,
	$r2025_122_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_122_ped$::jsonb,
	$r2025_122_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO2":"3"},"psos":{"PSO1":"2","PSO3":"1"}},{"co_id":"CO4","pos":{"PO5":"2","PO11":"1"},"psos":{"PSO2":"3","PSO3":"1"}}]}$r2025_122_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MA25C01 Applied Calculus.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MA25C02 | LINEAR ALGEBRA
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MA25C02'))
		LIMIT 1
	),
	'MA25C02', 'LINEAR ALGEBRA',
	$r2025_123_obj${"objectives":[{"number":1,"description":"To impart foundational knowledge in linear algebra essential for analysing and solving problems in engineering applications."},{"number":2,"description":"To provide the knowledge on computation using software and interpret key linear algebra concepts using software. Vector Spaces Introduction to Vector Spaces, Examples, Subspaces, Linear Combinations, Span, Generating Sets, Linear Dependence and Independence, Basis and Dimension, Dimension of Subspaces."}]}$r2025_123_obj$::jsonb,
	$r2025_123_clos${"clos":[{"clo_number":1,"description":"Explain the fundamental concepts of Linear\nAlgebra.","k_values":[]},{"clo_number":2,"description":"Compute and interpret eigenvalues\nand eigenvectors.","k_values":[]},{"clo_number":3,"description":"Apply inner product concepts and perform\northogonalization.","k_values":[]},{"clo_number":4,"description":"Compute least squares solutions of linear\nsystem of equations.","k_values":[]},{"clo_number":5,"description":"Use MATLAB to implement and validate key\nlinear algebra concepts","k_values":[]}]}$r2025_123_clos$::jsonb,
	$r2025_123_content${"units":[{"unit_id":"I","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Open-Source software, exercises to test linear dependence and"},{"number":2,"title":"independence using rank, compute span and basis of a set of vectors, determine the"},{"number":3,"title":"dimension of subspaces, and illustrate the concept of subspace and basis in 𝑹𝟐/𝑹𝟑"},{"number":4,"title":"with visualization."}]}],"remarks":""},{"unit_id":"II","unit_title":"Linear Transformations and Diagonalization","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Null space, Range, Dimension"},{"number":2,"title":"Theorem (statement only), Matrix representation of a linear transformation,"},{"number":3,"title":"Eigenvalues & Eigenvectors, Diagonalizability."}]}],"remarks":""},{"unit_id":"III","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Open-Source software, exercises to compute the matrix representation"},{"number":2,"title":"of a linear transformation, find the null space and range of a matrix, and compute"},{"number":3,"title":"eigenvalues and eigenvectors of a matrix."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Inner Product Spaces","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Inner product, Norms, Cauchy, Schwarz inequality, Gram,"},{"number":2,"title":"Schmidt orthogonalization, Simple problems (up to 𝑹𝟑)."}]}],"remarks":""},{"unit_id":"V","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Open-Source software, exercises to compute inner products and vector"},{"number":2,"title":"norms."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Matrix Decomposition","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Orthogonal transformation of a symmetric matrix to diagonal"},{"number":2,"title":"form - Positive definite matrices, QR decomposition, Singular Value Decomposition"},{"number":3,"title":"(SVD), Least squares solutions- simple problems (up to 3 × 3 𝑚𝑎𝑡𝑟𝑖𝑐𝑒𝑠)."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Open-Source software, exercises to check if a matrix is positive definite,"},{"number":2,"title":"perform QR decomposition and SVD using built-in functions."}]}],"remarks":""}]}$r2025_123_content$::jsonb,
	$r2025_123_books${"primary":[],"references":[{"title":"Friedberg, S. H., Insel, A. J., & Spence, L. E. (2022). Linear algebra. Pearson.","author":""},{"title":"Lay, D. C., Lay, S. R., & McDonald, J. J. (2020). Linear algebra and its","author":""},{"title":"Bronson, R. (2011). Schaum’s outline of matrix operations. McGraw-Hill","author":""},{"title":"Strang, G., & Thomson, R. (2005). Linear algebra and its applications.","author":""},{"title":"Lipschutz, S., & Lipson, M. (2009). Schaum's outline of linear algebra.","author":""},{"title":"Kreyszig, E. (2018). Advanced engineering mathematics. Wiley India.","author":""}]}$r2025_123_books$::jsonb,
	$r2025_123_web${"resources":[]}$r2025_123_web$::jsonb,
	$r2025_123_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_123_ped$::jsonb,
	$r2025_123_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2"}},{"co_id":"CO3","pos":{"PO1":"3"},"psos":{"PSO1":"1"}},{"co_id":"CO4","pos":{"PO1":"2","PO2":"2"},"psos":{"PSO3":"1"}},{"co_id":"CO5","pos":{"PO5":"1","PO11":"1"},"psos":{"PSO2":"2"}}]}$r2025_123_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MA25C02 Linear Algebra.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MA25C03 | TRANSFORMS AND ITS APPLICATIONS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MA25C03'))
		LIMIT 1
	),
	'MA25C03', 'TRANSFORMS AND ITS APPLICATIONS',
	$r2025_124_obj${"objectives":[{"number":1,"description":"To provide a strong foundation in Fourier Series, Laplace, Fourier and Z- Transforms."},{"number":2,"description":"To develop the ability to analyze and solve engineering problems in continuous and discrete time domains using appropriate transform techniques."}]}$r2025_124_obj$::jsonb,
	$r2025_124_clos${"clos":[{"clo_number":1,"description":"Explain the concept of various transform\nfunctions in engineering applications","k_values":[]},{"clo_number":2,"description":"Apply Laplace and inverse Laplace\ntransforms for solving differential\nequations.","k_values":[]},{"clo_number":3,"description":"Apply Z-transform methods to solve\nproblems and analyze the results","k_values":[]},{"clo_number":4,"description":"Apply Fourier series to express functions\nand analyze the convergence behavior of\nthe series.","k_values":[]},{"clo_number":5,"description":"Select and apply appropriate software for\napplying transform functions","k_values":[]}]}$r2025_124_clos$::jsonb,
	$r2025_124_content${"units":[{"unit_id":"I","unit_title":"Laplace Transforms","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Existence conditions, Properties of Laplace transform, Laplace"},{"number":2,"title":"transform of standard functions, derivatives and integrals, Unit step function and Dirac"},{"number":3,"title":"delta function, Laplace transform of periodic functions; Inverse Laplace transform:"},{"number":4,"title":"Partial fraction technique, Convolution theorem."}]}],"remarks":""},{"unit_id":"II","unit_title":"Application","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Solution of second order ordinary differential equations using Laplace"},{"number":2,"title":"transform."}]}],"remarks":""},{"unit_id":"III","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Compute the Laplace transform of time-domain functions, Inverse Laplace"},{"number":2,"title":"transform, Solution of ordinary differential equations using Laplace transform."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Z-Transform","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Z-transform of standard functions, properties; Inverse Z – transform:"},{"number":2,"title":"Standard functions, Partial fraction technique, Convolution theorem."}]}],"remarks":""},{"unit_id":"V","unit_title":"Application","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Solution of difference equation using Z – transform."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Compute the Z-transform of a discrete-time signal, Solution of linear"},{"number":2,"title":"constant-coefficient difference equations using Z-transform."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Fourier Series","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Dirichlet’s conditions, General Fourier series, Convergence of"},{"number":2,"title":"Fourier series, Odd and even functions; Half range sine series, Half range cosine"},{"number":3,"title":"series, Root mean square value, Parseval’s identity."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Application","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Solution of one-dimensional wave and heat equation."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Compute Fourier coefficients, Reconstruct signal using Fourier series"},{"number":2,"title":"(Partial sum), Plot convergence of Fourier series."}]}],"remarks":""},{"unit_id":"X","unit_title":"Fourier Transform","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Complex Fourier transform, Properties, Relation between"},{"number":2,"title":"Fourier and Laplace transform, Fourier sine and cosine transforms, Parseval’s"},{"number":3,"title":"identity, Convolution theorem."}]}],"remarks":""},{"unit_id":"XI","unit_title":"Application","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Simple applications to solve partial differential equations using Fourier"},{"number":2,"title":"transform."}]}],"remarks":""},{"unit_id":"XII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Compute the Fourier and inverse Fourier transform, Parseval’s theorem"},{"number":2,"title":"validation."}]}],"remarks":""}]}$r2025_124_content$::jsonb,
	$r2025_124_books${"primary":[],"references":[{"title":"Kreyszig, G. E. (2018). Advanced engineering mathematics. John Wiley & Sons","author":""},{"title":"Grewal, B. S. (2021). Higher engineering mathematics. Khanna Publications.","author":""},{"title":"Zill, D. G. (2022). Advanced engineering mathematics. Jones & Bartlett India Ltd.","author":""},{"title":"Wylie, C. R., & Barrett, L. C. (2019). Advanced engineering mathematics. Tata","author":""},{"title":"Duffy, D. G. (2017). Advanced engineering mathematics with MATLAB. CRC","author":""}]}$r2025_124_books$::jsonb,
	$r2025_124_web${"resources":[{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-003-"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-003-"},{"title":"coursera.org","url":"https://www.coursera.org/learn/mathematics-engineers-fourier-laplace-z-"},{"title":"coursera.org","url":"https://www.coursera.org/learn/mathematics-engineers-fourier-laplace-z-"}]}$r2025_124_web$::jsonb,
	$r2025_124_ped${"methods":["Assignment (20%)","Software activity (20%)","Quiz and gamification"]}$r2025_124_ped$::jsonb,
	$r2025_124_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"}},{"co_id":"CO3","pos":{"PO1":"2","PO2":"1","PO5":"1"}},{"co_id":"CO4","pos":{"PO1":"3","PO2":"1","PO5":"1"}},{"co_id":"CO5","pos":{"PO1":"2","PO2":"2","PO5":"1"}}]}$r2025_124_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MA25C03-TRANSFORMS AND ITS APPLICATION.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MA25C04 | MATRICES FOR ENGINEERS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MA25C04'))
		LIMIT 1
	),
	'MA25C04', 'MATRICES FOR ENGINEERS',
	$r2025_125_obj${"objectives":[{"number":1,"description":"The Objectives of the course are to enable the students to understand and apply matrix concepts such as eigenvalues, orthogonal transformations, matrix decompositions (QR and SVD), quadratic forms and least- squares solutions for solving engineering problems."}]}$r2025_125_obj$::jsonb,
	$r2025_125_clos${"clos":[{"clo_number":1,"description":"Understand concepts of eigenvalues,\neigenvectors and matrix norms. - -","k_values":[]},{"clo_number":2,"description":"Apply QR decomposition and SVD to solve\nmatrix problems arising in engineering\napplications.","k_values":[]},{"clo_number":3,"description":"Analyze quadratic forms using orthogonal\ntransformations and use least-squares\nmethods to obtain approximate solutions of\nlinear systems.","k_values":[]}]}$r2025_125_clos$::jsonb,
	$r2025_125_content${"units":[{"unit_id":"I","unit_title":"Matrices","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction – Characteristic equation – Eigenvalues and Eigenvectors of"},{"number":2,"title":"a real matrix – Properties of Eigen values and Eigen vectors (without proof) – Cayley"},{"number":3,"title":"– Hamilton theorem (Statement and applications only) - Orthogonal matrices –"},{"number":4,"title":"Orthogonal transformation of a symmetric matrix to diagonal form – Quadratic form"},{"number":5,"title":"– Nature of Quadratic forms - Reduction of quadratic form to canonical form by"},{"number":6,"title":"orthogonal transformation. Matrix norms, Jordan Normal form, QR decomposition –"},{"number":7,"title":"Singular Value Decomposition (SVD) - Least squares solutions- simple problems."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Computation of eigenvalues and eigenvectors, matrix norm, QR"},{"number":2,"title":"decomposition and SVD using open-source software, Solving Competitive"},{"number":3,"title":"Examination questions."}]}],"remarks":""}]}$r2025_125_content$::jsonb,
	$r2025_125_books${"primary":[],"references":[{"title":"Erwin Kreyszig, Advanced Engineering Mathematics, (11th ed.), John Wiley","author":""},{"title":"Alan Jeffrey, Matrix Operations for Engineers and Scientists, Springer","author":""},{"title":"Gilbert Strang. Linear Algebra for Everyone. 2020. Wellesley-Cambridge","author":""}]}$r2025_125_books$::jsonb,
	$r2025_125_web${"resources":[{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/111108066"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/111108066"}]}$r2025_125_web$::jsonb,
	$r2025_125_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_125_ped$::jsonb,
	$r2025_125_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO2":"3","PO5":"3"},"psos":{"PSO2":"3","PSO3":"2"}}]}$r2025_125_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MA25C04-MATRICS FOR ENGINEERS.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MA25C07 | PROBABILITY AND STATISTICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MA25C07'))
		LIMIT 1
	),
	'MA25C07', 'PROBABILITY AND STATISTICS',
	$r2025_126_obj${"objectives":[{"number":1,"description":"The Objectives of the course are to introduce data collection methods, classification techniques, and graphical representation of data using charts and plots, to explain the fundamental concepts of descriptive statistics, probability theory, random variables, and hypothesis testing for analyzing data and to demonstrate the application of statistical techniques such as experimental design and process control using R/Python for data-driven decision-making."}]}$r2025_126_obj$::jsonb,
	$r2025_126_clos${"clos":[{"clo_number":1,"description":"Understand concepts of descriptive statistics,\nprobability theory and testing of hypothesis.\n- -","k_values":[]},{"clo_number":2,"description":"Apply probability distributions and statistical\nmethods to solve engineering problems","k_values":[]},{"clo_number":3,"description":"Analyze data using correlation, regression, and\nprobability models.","k_values":[]},{"clo_number":4,"description":"Utilize hypothesis testing, ANOVA for\ndata-driven decision-making.","k_values":[]}]}$r2025_126_clos$::jsonb,
	$r2025_126_content${"units":[{"unit_id":"I","unit_title":"Descriptive Statistics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Collection of Data-Classification-Tabulation-Graphical"},{"number":2,"title":"Representation – Simple Bar Chart – Pie Chart -Measures of Central Tendency:"},{"number":3,"title":"Arithmetic Mean, Median and Mode – Measures of Variation: Range, Quartile Deviation"},{"number":4,"title":"Standard Deviation and Coefficient of Variation – Five Number Summary – Box Plot"},{"number":5,"title":"Technique."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Application of descriptive statistics and data presentation methods using R/"},{"number":2,"title":"Python programming and Analysing data using Box Plots using R/ Python programming."}]}],"remarks":""},{"unit_id":"III","unit_title":"Probability and Random Variables","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Axioms of probability - Conditional probability –"},{"number":2,"title":"Total probability – Bayes’ theorem Random variable – Distribution function – properties"},{"number":3,"title":"– Probability mass function – Probability density function – Moments - Standard"},{"number":4,"title":"Distributions - Binomial, Poisson and Normal Distributions-Problems, Uniform"},{"number":5,"title":"Distribution and Exponential Distribution (Simple Problems)"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Application of various distributions using R/ Python programming."}]}],"remarks":""},{"unit_id":"V","unit_title":"Two-Dimensional Random Variables","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Joint distributions – Marginal and conditional"},{"number":2,"title":"distributions – Expected values of functions of two variables– Correlation and regression"},{"number":3,"title":"(for discrete data only) - Central limit theorem – Statement and Simple Problems"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Applications of Correlation and Regression using R/ Python programming."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Testing of Hypothesis","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Large sample tests for single mean and difference of means –"},{"number":2,"title":"Small samples tests based on t and F distributions (single mean, difference of means,"},{"number":3,"title":"paired t- test and variance ratio test) – Chi-square test for independence of attributes"},{"number":4,"title":"and goodness of fit."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Application of Student – t test, F test ,Chi –s square test using R/ Python"},{"number":2,"title":"programming."}]}],"remarks":""},{"unit_id":"IX","unit_title":"Design of Experiments","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Analysis of Variance (ANOVA) – Completely Randomized"},{"number":2,"title":"Design (CRD) – Randomized Block Design (RBD) – Latin Square Design (LSD)"}]}],"remarks":""},{"unit_id":"X","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Application and visualization of One-way ANOVA and Two -way ANOVA"},{"number":2,"title":"using R/ Python programming."}]}],"remarks":""}]}$r2025_126_content$::jsonb,
	$r2025_126_books${"primary":[],"references":[{"title":"Walpole R. E., Myers S.L. & Keying Ye, “Probability and Statistics for Engineers","author":""},{"title":"Gareth James, Daniela Witten, Trevor Hastie and Robert Tibshirani, “An","author":""},{"title":"Johnson R. A., Miller & Freund’s, “Probability and Statistics for Engineers”,","author":""},{"title":"Charles Henry Brase and Corrinne Pellillo Brase, “Understandable","author":""},{"title":"Richard A. Johnson and Dean W. Wichern, “Applied Multivariate Statistical","author":""},{"title":"Anderson, T. W, “An Introduction to Multivariate Statistical Analysis”, 3rd edition,","author":""}]}$r2025_126_books$::jsonb,
	$r2025_126_web${"resources":[{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc22_mg87/previe"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/"},{"title":"coursera.org","url":"https://www.coursera.org/learn/stability-and-capability-in-quality-improv"}]}$r2025_126_web$::jsonb,
	$r2025_126_ped${"methods":["Quiz and gamification","Assignments - 20%","Lab Manual - 15%"]}$r2025_126_ped$::jsonb,
	$r2025_126_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"1"}},{"co_id":"CO3","pos":{"PO2":"3"},"psos":{"PSO1":"2","PSO3":"1"}},{"co_id":"CO4","pos":{"PO5":"3","PO11":"2"},"psos":{"PSO2":"2"}}]}$r2025_126_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MA25C07 Probability and Statistics.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MA25C08 | DISCRETE MATHEMATICS
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MA25C08'))
		LIMIT 1
	),
	'MA25C08', 'DISCRETE MATHEMATICS',
	$r2025_127_obj${"objectives":[{"number":1,"description":"The Objectives of the course are to Introduce foundational concepts of set theory, relations, functions, and recurrence relations relevant to modelling data and algorithmic structures and to explain principles of propositional and predicate logic, Boolean algebra, and lattice theory for reasoning and decision-making in AI systems and to present core ideas of graph theory and its applications to analyse and optimize networks, data structures, and intelligent systems."}]}$r2025_127_obj$::jsonb,
	$r2025_127_clos${"clos":[{"clo_number":1,"description":"Understand the concepts of sets, Functions,\nRecurrence Relations, Logic, Boolean algebra\nand graph theory.\n- -","k_values":[]},{"clo_number":2,"description":"Apply principles of logic, functions, Boolean\nalgebra, lattices, recurrence relations, and graph\ntheory to solve real world engineering problems.","k_values":[]},{"clo_number":3,"description":"Employ discrete mathematical structures such\nas relations, recurrence relations, logical\nstatements, lattices and graphs to analyze\nengineering problems.","k_values":[]},{"clo_number":4,"description":"Model engineering problems and provide discrete\nmathematics based solutions.","k_values":[]}]}$r2025_127_clos$::jsonb,
	$r2025_127_content${"units":[{"unit_id":"I","unit_title":"Set Theory, Relations and Functions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Set theory – inductive definition of sets"},{"number":2,"title":"and proof by induction– Peano postulates – Relations – equivalence relations and"},{"number":3,"title":"partitions. Functions –Type of functions: Injective, surjective and bijective functions"},{"number":4,"title":"–Composition of functions – Inverse functions – Permutation functions –"},{"number":5,"title":"Recurrence relations – Solving linear recurrence relations."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Create and present Venn diagrams to illustrate union, intersection."},{"number":2,"title":"Categorize real-world mappings such as student-to-email ID, username-to-"},{"number":3,"title":"password, as injective, surjective, or bijective using role-play or sorting tasks."}]}],"remarks":""},{"unit_id":"III","unit_title":"Logic","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Propositions – Logical operators – Normal forms – Rules of inference –"},{"number":2,"title":"Consistency and inconsistency-Propositional logic – Proofs – Predicates –"},{"number":3,"title":"Quantifiers – Universe of discourse – Logical equivalences and implications for"},{"number":4,"title":"quantified statements – Rules of specification and generalization – Validity of"},{"number":5,"title":"arguments."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Conduct a truth table building competition for compound propositions"},{"number":2,"title":"using logical operators."}]}],"remarks":""},{"unit_id":"V","unit_title":"Boolean Algebra and Lattice Theory","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Partial ordering – Posets – Lattices as"},{"number":2,"title":"Posets – Properties of lattices - Lattices as algebraic systems – Sub lattices –"},{"number":3,"title":"Direct product and homomorphism – Some special lattices – Boolean algebra –"},{"number":4,"title":"Sub Boolean Algebra – Boolean Homomorphism."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Draw Hasse diagrams for lattices from a given set and identify"},{"number":2,"title":"sublattices and lattice operations."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Graph Theory","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Graphs – Types of graphs – Matrix representation of graphs-"},{"number":2,"title":"Graph isomorphism- Walk – Path – Cycles – Eulerian graphs – Hamiltonian graphs"},{"number":3,"title":"– Planar graphs – Euler formula – Shortest path algorithm: Dijkstra’s algorithm."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Implement Dijkstra’s algorithm to find the shortest path in a weighted AI"},{"number":2,"title":"decision graph."}]}],"remarks":""}]}$r2025_127_content$::jsonb,
	$r2025_127_books${"primary":[],"references":[{"title":"Tremblay J.P., Manohar R., “Discrete Mathematical Structures with","author":""},{"title":"Kenneth H. Rosen, “Discrete Mathematics and its applications: With","author":""},{"title":"Mott J.L, Kandel A. and Baker T.P., “Discrete Mathematics for Computer","author":""},{"title":"Liu C.L, “Elements of Discrete Mathematics”, 4th Edition, McGraw","author":""},{"title":"Grimaldi, R.P. “Discrete and Combinatorial Mathematics: An Applied","author":""}]}$r2025_127_books$::jsonb,
	$r2025_127_web${"resources":[{"title":"courses.csail.mit.edu","url":"https://courses.csail.mit.edu/6.042/spring17/mcs.pdf"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/106106183"},{"title":"nptel.ac.in","url":"https://nptel.ac.in/courses/111106100"},{"title":"ocw.mit.edu","url":"https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-fall-"}]}$r2025_127_web$::jsonb,
	$r2025_127_ped${"methods":["Assignments (20%)","Solution to application-oriented"]}$r2025_127_ped$::jsonb,
	$r2025_127_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO2":"3","PO5":"3","PO11":"1"},"psos":{"PSO1":"2","PSO2":"1"}},{"co_id":"CO4","pos":{"PO5":"3","PO11":"1"},"psos":{"PSO2":"3","PSO3":"1"}}]}$r2025_127_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MA25C08 Discrete Mathematics.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- PH25C01 | APPLIED PHYSICS - I
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('PH25C01'))
		LIMIT 1
	),
	'PH25C01', 'APPLIED PHYSICS - I',
	$r2025_128_obj${"objectives":[]}$r2025_128_obj$::jsonb,
	$r2025_128_clos${"clos":[{"clo_number":1,"description":"Explain the physics concepts in various applications.","k_values":[]},{"clo_number":2,"description":"Apply the principles of wave optics and laser physics\nin practical systems.","k_values":[]},{"clo_number":3,"description":"Analyse the behaviour of materials under different\nconditions.","k_values":[]},{"clo_number":4,"description":"Conduct experiments in groups and interpret the\ndata.","k_values":[]}]}$r2025_128_clos$::jsonb,
	$r2025_128_content${"units":[{"unit_id":"I","unit_title":"Properties of Matter","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Elasticity, Cantilever, Young’s modulus (non-uniform"},{"number":2,"title":"bending), Girders: Bridges and buildings, Viscosity: Stokes method, Surface"},{"number":3,"title":"tension: drop weight method, Thermal expansion, Thermal stress, Bimetallic strips,"},{"number":4,"title":"Expansion joints"},{"number":5,"title":"Practical: Non-Uniform bending, Young’s modulus of the material, Torsional"},{"number":6,"title":"pendulum, Rigidity modulus of the wire and moment of inertia of the disc."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of thermal stress."}]}],"remarks":""},{"unit_id":"III","unit_title":"Oscillations","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Simple Harmonic motion, Torsional pendulum, Couple per unit twist,"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Damped and Forced Oscillation","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"V","unit_title":"Waves","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Waves on a stretched string, Energy and Power, standing waves,"},{"number":2,"title":"Ultrasonics, piezo, electric method, Acoustic grating, Electromagnetic waves:"},{"number":3,"title":"Maxwell equation, Production of EM waves by dipole antenna, Propagation of EM"},{"number":4,"title":"waves in free space, wave equation, Cell phone reception"},{"number":5,"title":"Practical: Melde’s string experiment – Frequency of an electrically vibrating metal"},{"number":6,"title":"tip."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of propagation of EM waves"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Quantum Mechanics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Black body radiation, Photoelectric effect, de Broglie"},{"number":2,"title":"hypothesis, Schrodinger Wave equation, Particle in a box (infinite potential well -"},{"number":3,"title":"three-dimensional box), Barrier penetration and quantum tunnelling."},{"number":4,"title":"Practical: Photo-electric effect, Determination of Planck’s constant."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of Scanning Transmission Electron Microscope"}]}],"remarks":""},{"unit_id":"IX","unit_title":"Applied Optics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Interference: Air wedge, Michelson’s Interferometer, Fiber optics:"},{"number":2,"title":"Structure of a fiber, Fiber Optic Communication System, Fiber Sensors (Virtual"},{"number":3,"title":"demo), Displacement, pressure sensor and Temperature sensor, Einstein"}]}],"remarks":""},{"unit_id":"X","unit_title":"Co-efficient, Nd","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"YAG laser, CO2 laser (construction, functioning and applications),"},{"number":2,"title":"dye laser"},{"number":3,"title":"Practical: Ruling width of Compact disc using Laser, Thickness of a thin sheet/wire"},{"number":4,"title":"using Air wedge Method."}]}],"remarks":""},{"unit_id":"XI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of sensors and applications of Lasers"}]}],"remarks":""}]}$r2025_128_content$::jsonb,
	$r2025_128_books${"primary":[],"references":[{"title":"Young, H. D., & Freedman, R. A. (2020). University physics with modern","author":""},{"title":"Gaur, R. K., & Gupta, S. L. (2022). Engineering physics. Dhanpat Rai","author":""},{"title":"Mathur, D. S. (2010). Elements of properties of matter. S. Chand Publishing.","author":""},{"title":"Griffiths, D. J. (2018). Introduction to quantum mechanics. Cambridge","author":""},{"title":"Silfvast, W. T. (2008). Laser fundamentals. Cambridge University Press.","author":""}]}$r2025_128_books$::jsonb,
	$r2025_128_web${"resources":[{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/115/104/115104096/"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc24_ee31/previe"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc25_ph03/preview"},{"title":"onlinecourses.nptel.ac.in","url":"https://onlinecourses.nptel.ac.in/noc25_ph03/preview"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=WZQ8lvxdzDk"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=WZQ8lvxdzDk"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=1JZG9x_VOwA"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=1JZG9x_VOwA"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=4xF1Fq2wB1I"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=4xF1Fq2wB1I"},{"title":"auece.digimat.in","url":"https://auece.digimat.in/nptel/courses/video/108106173/L02.htm"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=XNYZYbXNWQA"}]}$r2025_128_web$::jsonb,
	$r2025_128_ped${"methods":["Quiz and gamification","Assignments (20%)","Flipped classroom"]}$r2025_128_ped$::jsonb,
	$r2025_128_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"2","PSO2":"2"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"2","PSO3":"1"}},{"co_id":"CO4","pos":{"PO4":"3","PO8":"1"},"psos":{"PSO1":"2","PSO2":"2"}}]}$r2025_128_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: PH25C01 Applied Physics – I.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- PH25C03 | APPLIEDPHYSICS(CSIE)–II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('PH25C03'))
		LIMIT 1
	),
	'PH25C03', 'APPLIEDPHYSICS(CSIE)–II',
	$r2025_129_obj${"objectives":[{"number":1,"description":"To provide a comprehensive understanding of physics concepts in computer science and engineering applications."}]}$r2025_129_obj$::jsonb,
	$r2025_129_clos${"clos":[{"clo_number":1,"description":"Explain the concepts of physics in computer science\nstream.","k_values":[]},{"clo_number":2,"description":"Apply appropriate techniques in physics to solve\nengineering problems.","k_values":[]},{"clo_number":3,"description":"Analyse physical systems and interpret data from the\nvirtual studies in the core branches in computer science\nand engineering.","k_values":[]}]}$r2025_129_clos$::jsonb,
	$r2025_129_content${"units":[{"unit_id":"I","unit_title":"Magnetic Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Parameters, Ferromagnetic materials, Ferrites"},{"number":2,"title":"Soft and Hard"},{"number":3,"title":"magnetic materials – GMR sensors - magnetic disk memories – Principle of magnetic"},{"number":4,"title":"recording – Magnetic data storage."}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Determination of Hysteresis loop for ferromagnetic materials."}]}],"remarks":""},{"unit_id":"III","unit_title":"Logic Gates","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Conversion of Binary to decimal"},{"number":2,"title":"decimal to binary – binary coded"},{"number":3,"title":"decimal code-logic gates (OR ,AND, NOT,NAND and NOR)–Exclusive OR"},{"number":4,"title":"gate-simplification based on basic Boolean theorems(sum of products, product of"},{"number":5,"title":"sums expression )- simplification by Karnaugh Map method( don’t care conditions)."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of Logic Gates."}]}],"remarks":""},{"unit_id":"V","unit_title":"Nano-Devices","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Introduction – electron density in bulk material – size dependence of"},{"number":2,"title":"Fermi energy-quantum confinement – quantum structures: quantum wells, wires and"},{"number":3,"title":"dots – band gap of nanomaterials. Tunneling- Coulomb blockade - single electron"},{"number":4,"title":"transistor - resonant-tunneling diode- Carbon nanotubes: Properties and applications."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of single electron transistor"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Quantum Computing","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Quantum system for information processing - quantum states"},{"number":2,"title":"– classical bits – quantum bits or qubits – Bloch sphere -CNOT gate – Single and"},{"number":3,"title":"multiple qubits – quantum gates (Pauli – X, Y and Z Gates, Hadamard Gate, Phase"},{"number":4,"title":"gate- T gate"},{"number":5,"title":".CNOT Gate )– advantage of quantum computing over classical computing."}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of quantum computing"}]}],"remarks":""}]}$r2025_129_content$::jsonb,
	$r2025_129_books${"primary":[],"references":[{"title":"Kasap, S. O. (2007). Principles of electronic materials and devices. McGraw-Hill","author":""},{"title":"Bernhardt, C. (2019). Quantum computing for everyone. MIT Press.","author":""},{"title":"Hanson, G. W. (2009). Fundamentals of nanoelectronics. Pearson Education.","author":""}]}$r2025_129_books$::jsonb,
	$r2025_129_web${"resources":[{"title":"youtu.be","url":"https://youtu.be/MTT729LtB-o?si=RGaEhGgmyWJWcZib"},{"title":"lab.quantumflytrap.com","url":"https://lab.quantumflytrap.com"},{"title":"vlabs.iitkgp.ac.in","url":"http://vlabs.iitkgp.ac.in/tcad"},{"title":"vlabs.iitkgp.ac.in","url":"http://vlabs.iitkgp.ac.in/tcad"},{"title":"digimat.in","url":"http://www.digimat.in/nptel/courses/video/106106232/L01.html"}]}$r2025_129_web$::jsonb,
	$r2025_129_ped${"methods":["Quiz and gamification","Assignments (30%)","Flipped classroom"]}$r2025_129_ped$::jsonb,
	$r2025_129_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"2"}}]}$r2025_129_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: PH25C03 Applied Physics (CSIE) – II.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- PH25C04 | APPLIED PHYSICS (EE) – II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('PH25C04'))
		LIMIT 1
	),
	'PH25C04', 'APPLIED PHYSICS (EE) – II',
	$r2025_130_obj${"objectives":[{"number":1,"description":"To impart knowledge on physics concepts and explore the potential applications in the field of electrical engineering."}]}$r2025_130_obj$::jsonb,
	$r2025_130_clos${"clos":[{"clo_number":1,"description":"Explain the concepts of physics in electrical\nengineering stream.","k_values":[]},{"clo_number":2,"description":"Apply appropriate techniques in physics to solve\nengineering problems.","k_values":[]},{"clo_number":3,"description":"Analyse physical systems and interpret data from the\nvirtual studies in the core branches in electrical\nengineering.","k_values":[]}]}$r2025_130_clos$::jsonb,
	$r2025_130_content${"units":[{"unit_id":"I","unit_title":"Semiconductor Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Intrinsic and Extrinsic Semiconductors - Carrier"},{"number":2,"title":"Concentration- Fermi level -Dependence on carrier-concentration and temperature-"}]}],"remarks":""},{"unit_id":"II","unit_title":"Carrier generation and recombination-Carrier transport","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"diffusion and drift- Hall"},{"number":2,"title":"Effect – Applications- Metal-semiconductor junction (Ohmic and Schottky)"}]}],"remarks":""},{"unit_id":"III","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Determination of Hall coefficient"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Dielectrics Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Dielectric polarization under static fields"},{"number":2,"title":"electronic, ionic"},{"number":3,"title":"and dipolar polarizations-internal fields in solid-Clausius-Mossotti equation -"},{"number":4,"title":"Behavior of dielectrics in alternating fields- Application of dielectrics in transformers-"},{"number":5,"title":"Capacitor materials – Ferro and piezo materials- Complex dielectric permittivity-"},{"number":6,"title":"dipolar relaxation- dielectric loss- Applications."}]}],"remarks":""},{"unit_id":"V","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Measurement of Dielectric Constant of different materials"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Magnetic Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Magnetic material parameters –Ferromagnetic materials –"},{"number":2,"title":"Ferrites - Soft and Hard magnetic materials – GMR sensors - magnetic disk"},{"number":3,"title":"memories – Principle of magnetic recording – Materials for magnetic data storage."}]}],"remarks":""},{"unit_id":"VII","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Determination of Hysteresis loop for a ferromagnetic material (B-H curve)"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Advanced Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Thermocouple, bimetals, leads soldering and fuses Materials"},{"number":2,"title":"– their applications"}]}],"remarks":""},{"unit_id":"IX","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Virtual demonstration of working of various types of thermocouples."}]}],"remarks":""}]}$r2025_130_content$::jsonb,
	$r2025_130_books${"primary":[],"references":[{"title":"Kasap, S. O. (2007). Principles of electronic materials and devices. McGraw-Hill","author":""},{"title":"Callister, W. D., & Rethwisch, D. G. (2014). Materials science and engineering.","author":""},{"title":"Indulkar, C. S., & Thiruvengadam, S. (n.d.). An introduction to electrical","author":""}]}$r2025_130_books$::jsonb,
	$r2025_130_web${"resources":[]}$r2025_130_web$::jsonb,
	$r2025_130_ped${"methods":["Quiz and gamification","Assignments (30%)","Flipped classroom"]}$r2025_130_ped$::jsonb,
	$r2025_130_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"2"}}]}$r2025_130_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: PH25C04-APPLIED PHYSICS(EE)-II.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- PH25C05 | APPLIED PHYSICS (ME) – II
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('PH25C05'))
		LIMIT 1
	),
	'PH25C05', 'APPLIED PHYSICS (ME) – II',
	$r2025_131_obj${"objectives":[]}$r2025_131_obj$::jsonb,
	$r2025_131_clos${"clos":[{"clo_number":1,"description":"Explain the concepts of physics in mechanical\nengineering stream.","k_values":[]},{"clo_number":2,"description":"Apply appropriate techniques in physics to solve\nengineering problems.","k_values":[]},{"clo_number":3,"description":"Analyse physical systems and interpret data from\nthe virtual studies in the core branches in\nmechanical engineering.","k_values":[]}]}$r2025_131_clos$::jsonb,
	$r2025_131_content${"units":[{"unit_id":"I","unit_title":"Rigid Body Dynamics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Centre of mass – Moment of inertia (circular disc, solid"},{"number":2,"title":"cylinder, hollow cylinder, solid sphere, hollow sphere), Gear, shaft, gyroscope"}]}],"remarks":""},{"unit_id":"II","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of moment of inertia of Gear, shafts and Gyroscopes."}]}],"remarks":""},{"unit_id":"III","unit_title":"Thermal Physics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Thermal conductivity –Transient plane source method, Transient"},{"number":2,"title":"Line Source method- Forbe’s method - conduction through compound media, Laws"},{"number":3,"title":"of Thermodynamics ."}]}],"remarks":""},{"unit_id":"IV","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of thermal conductivity of insulators"}]}],"remarks":""},{"unit_id":"V","unit_title":"Phase Transitions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Solid solutions - single component system, binary phase"},{"number":2,"title":"diagrams - iron-carbon equilibrium diagram, T-T-T-diagram - heat treatment of steels"},{"number":3,"title":"– hardening techniques"}]}],"remarks":""},{"unit_id":"VI","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of Hardening of steels"}]}],"remarks":""},{"unit_id":"VII","unit_title":"Functional Materials","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Ceramics – Composites, Fiber Reinforced Plastics, Metallic"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Glasses, LED Characteristics","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"IX","unit_title":"Activities","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Demonstration of LED working and its characteristics."}]}],"remarks":""}]}$r2025_131_content$::jsonb,
	$r2025_131_books${"primary":[],"references":[{"title":"Mathur, D. S. (2008). Elements of properties of matter. S. Chand.","author":""},{"title":"Brij Lal, & Subramaniyan, N. (2018). Heat, thermodynamics and statistical","author":""},{"title":"Raghavan, V. (2009). Physical metallurgy: Principles and practice. PHI Learning.","author":""},{"title":"Askeland, D. (2010). Materials science and engineering. Brooks/Cole.","author":""}]}$r2025_131_books$::jsonb,
	$r2025_131_web${"resources":[{"title":"youtu.be","url":"https://youtu.be/fDJeVR0o"},{"title":"youtu.be","url":"https://youtu.be/fDJeVR0o"},{"title":"kcl.digimat.in","url":"http://kcl.digimat.in/nptel/courses/video/112106155/L32.html"},{"title":"kcl.digimat.in","url":"http://kcl.digimat.in/nptel/courses/video/112106155/L32.html"},{"title":"archive.nptel.ac.in","url":"https://archive.nptel.ac.in/courses/113/104/113104068/"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=FydJu1A1oeM"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=FydJu1A1oeM"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=ckCN9jGsdUY"},{"title":"youtube.com","url":"https://www.youtube.com/watch?v=ckCN9jGsdUY"},{"title":"youtu.be","url":"https://youtu.be/IgapvczVyXs"},{"title":"youtu.be","url":"https://youtu.be/IgapvczVyXs"}]}$r2025_131_web$::jsonb,
	$r2025_131_ped${"methods":["Quiz and gamification","Assignments (30%)","Flipped classroom"]}$r2025_131_ped$::jsonb,
	$r2025_131_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"3"}},{"co_id":"CO3","pos":{"PO2":"2"},"psos":{"PSO1":"2"}}]}$r2025_131_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: PH25C05 -Applied Physics (ME) – II.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;
-- MA25C05 | PROBABILITY, STATISTICAL AND RANDOM PROCESSES
INSERT INTO public.bos_course_syllabi (
	institutions_id, board_id, regulation_id, composition_id, course_id,
	course_code, course_name,
	course_objectives, course_learning_outcomes, course_content,
	textbooks, web_resources, pedagogy, po_mappings,
	created_by, notes,
	version_number, is_latest, is_archived
) VALUES (
	'5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid, 'a9dac748-ebc3-406f-8f9e-3024bd87f8b6'::uuid, 'de033d70-b873-437e-acb7-e139998e086d'::uuid, '35456cc1-ba22-473f-b09d-278d90488d3f'::uuid, (
		SELECT c.coe_course_id::text
		FROM public.courses c
		WHERE c.institution_id = '5de4fba1-4564-41ed-8c73-5d948b74b843'::uuid
		  AND upper(btrim(c.course_code)) = upper(btrim('MA25C05'))
		LIMIT 1
	),
	'MA25C05', 'PROBABILITY, STATISTICAL AND RANDOM PROCESSES',
	$r2025_134_obj${"objectives":[{"number":1,"description":"To provide a rigorous mathematical foundation in statistical analysis and probability theory required for industrial quality control, semiconductor manufacturing, signal processing, and modern communication systems. The course emphasizes \"small sampling theory\" and stochastic processes essential for electronics R&D."}]}$r2025_134_obj$::jsonb,
	$r2025_134_clos${"clos":[{"clo_number":1,"description":"Understand the basic concepts of probability, random\nvariables, standard probability distributions, and\nrandom processes.\n- -","k_values":[]},{"clo_number":2,"description":"Apply joint distributions, correlation, regression, and\ntransformation of random variables for real-world\ndata analysis.","k_values":[]},{"clo_number":3,"description":"Model and simulate random phenomena using\nstochastic processes and analyze their long-term\nbehavior.","k_values":[]},{"clo_number":4,"description":"Analyze spectral properties of random signals,\nincluding autocorrelation, cross-correlation, and\nspectral density functions.","k_values":[]},{"clo_number":5,"description":"Examine linear time-invariant systems with random\ninputs using transfer function analysis and stochastic\nsystem modeling.","k_values":[]}]}$r2025_134_clos$::jsonb,
	$r2025_134_content${"units":[{"unit_id":"I","unit_title":"Descriptive and Bivariate Statistics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":". Univariate Measures: Mean, Median, Mode,"}]}],"remarks":""},{"unit_id":"II","unit_title":"Variance, and Standard Deviation, Relative Variation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Coefficient of Variation (CV) for"},{"number":2,"title":"comparing component stability., Bivariate Statistics: Covariance and the Correlation"}]}],"remarks":""},{"unit_id":"III","unit_title":"Coefficient (r), Linear Regression","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Method of Least Squares for sensor calibration and"},{"number":2,"title":"trend analysis"}]}],"remarks":""},{"unit_id":"IV","unit_title":"Probability Foundations and Distributions","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"V","unit_title":"Probability Theory","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Axioms, Conditional Probability, and Bayes’ Theorem (Signal"},{"number":2,"title":"Detection)."}]}],"remarks":""},{"unit_id":"VI","unit_title":"Random Variables","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Discrete (Binomial, Poisson for shot noise) and Continuous"},{"number":2,"title":"(Uniform, Exponential)."}]}],"remarks":""},{"unit_id":"VII","unit_title":"The Normal Distribution","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Properties of Gaussian distributions, Central Limit Theorem,"}]}],"remarks":""},{"unit_id":"VIII","unit_title":"Statistical Inference and Small Sampling","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"IX","unit_title":"Sampling Distributions","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Population vs. Sample; Degrees of Freedom."}]}],"remarks":""},{"unit_id":"X","unit_title":"Small Sample Tests","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Student’s t-distribution (One-sample and Two-sample tests)."}]}],"remarks":""},{"unit_id":"XI","unit_title":"Variance Analysis","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Chi-square distribution and F-distribution for comparing production"},{"number":2,"title":"batches."}]}],"remarks":""},{"unit_id":"XII","unit_title":"Estimation","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Confidence Intervals for mean and variance of device parameters."}]}],"remarks":""},{"unit_id":"13","unit_title":"Hypothesis Testing and Error Metrics","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"14","unit_title":"Testing Framework","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Null (H0) and Alternative (H1) Hypotheses."}]}],"remarks":""},{"unit_id":"15","unit_title":"Decision Errors","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Type I error (Alpha), Type II error (Beta), and Power of a test."},{"number":2,"title":"p-values: Interpretation of p-values in industrial datasheets and medical electronics."}]}],"remarks":""},{"unit_id":"16","unit_title":"Parametric & Non-Parametric","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"ANOVA basics and Chi-square Goodness-of-Fit tests."}]}],"remarks":""},{"unit_id":"17","unit_title":"Stochastic Processes and Signal Noise","chapters":[{"chapter_number":1,"title":"","sections":""}],"remarks":""},{"unit_id":"18","unit_title":"Random Processes","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Concept of Stationarity (WSS) and Ergodicity."}]}],"remarks":""},{"unit_id":"19","unit_title":"Correlation Dynamics","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Auto-correlation and Cross-correlation functions."}]}],"remarks":""},{"unit_id":"20","unit_title":"Frequency Domain","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Power Spectral Density (PSD) and Wiener-Khinchin Theorem."}]}],"remarks":""},{"unit_id":"21","unit_title":"LTI Systems","chapters":[{"chapter_number":1,"title":"","sections":"","subtopics":[{"number":1,"title":"Response of linear circuits to random noise; Introduction to the Kalman"},{"number":2,"title":"Filter."}]}],"remarks":""}]}$r2025_134_content$::jsonb,
	$r2025_134_books${"primary":[],"references":[]}$r2025_134_books$::jsonb,
	$r2025_134_web${"resources":[]}$r2025_134_web$::jsonb,
	$r2025_134_ped${"methods":["Assignments (20%)","Solution to application-oriented problems"]}$r2025_134_ped$::jsonb,
	$r2025_134_po${"mappings":[{"co_id":"CO1","pos":{}},{"co_id":"CO2","pos":{"PO1":"3"},"psos":{"PSO1":"1","PSO2":"2"}},{"co_id":"CO3","pos":{"PO2":"3","PO5":"3"},"psos":{"PSO2":"2","PSO3":"1"}},{"co_id":"CO4","pos":{"PO2":"3"},"psos":{"PSO2":"2"}},{"co_id":"CO5","pos":{"PO2":"3","PO5":"3"},"psos":{"PSO2":"2"}}]}$r2025_134_po$::jsonb,
	'137f0774-f011-48fa-9b72-c3cf06d4838d'::uuid, 'Source: courses-failed-2026-07-21.xlsx | Doc: MA25C05-Probability, Statistical and Random Processes.pdf',
	1, true, false
)
ON CONFLICT (regulation_id, course_code, version_number)
DO UPDATE SET
	board_id = EXCLUDED.board_id,
	composition_id = EXCLUDED.composition_id,
	course_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),
	course_name = EXCLUDED.course_name,
	course_objectives = EXCLUDED.course_objectives,
	course_learning_outcomes = EXCLUDED.course_learning_outcomes,
	course_content = EXCLUDED.course_content,
	textbooks = EXCLUDED.textbooks,
	web_resources = EXCLUDED.web_resources,
	pedagogy = EXCLUDED.pedagogy,
	po_mappings = EXCLUDED.po_mappings,
	notes = EXCLUDED.notes,
	last_modified_at = now(),
	last_modified_by = EXCLUDED.created_by;

COMMIT;