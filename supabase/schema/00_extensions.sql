-- =============================================
-- Database Extensions
-- =============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable moddatetime extension for automatic timestamp updates
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- Enable pg_net for HTTP requests (used for edge functions)
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Enable full text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable advanced indexing
CREATE EXTENSION IF NOT EXISTS "btree_gist"; 