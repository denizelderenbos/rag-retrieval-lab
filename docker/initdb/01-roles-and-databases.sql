-- Runs once, when the volume is created.
--
-- rag_app is the role the application connects with. Not a superuser, no
-- BYPASSRLS and not a table owner, so Row Level Security always applies to
-- this role. A superuser (rag_admin) ignores RLS.
CREATE ROLE rag_app LOGIN PASSWORD 'rag_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

CREATE DATABASE rag_lab_test OWNER rag_admin;

GRANT CONNECT ON DATABASE rag_lab TO rag_app;
GRANT CONNECT ON DATABASE rag_lab_test TO rag_app;
