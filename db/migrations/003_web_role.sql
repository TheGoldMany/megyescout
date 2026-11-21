-- Least-privilege login role for the Next.js app.
-- Superusers bypass RLS even with FORCE, so the web app must NOT connect as postgres.
-- Password: the `hunscout.web_password` setting (cli.py migrate sets it from WEB_DB_PASSWORD), otherwise a
-- strong random one (managed Postgres such as Neon rejects weak passwords at COMMIT, which rolled back the
-- whole first production migration). Set your own later with:  ALTER ROLE hunscout_web PASSWORD '...';
DO $$
DECLARE
    pw text := COALESCE(NULLIF(current_setting('hunscout.web_password', true), ''),
                        'Hs!' || encode(gen_random_bytes(24), 'hex') || 'Q9#');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hunscout_web') THEN
        EXECUTE format('CREATE ROLE hunscout_web LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', pw);
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'skipping hunscout_web role creation (managed Postgres?)';
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hunscout_web') THEN
        GRANT USAGE ON SCHEMA public TO hunscout_web;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO hunscout_web;
        GRANT SELECT ON mv_player_explorer TO hunscout_web;
        GRANT INSERT, UPDATE, DELETE ON scout_notes TO hunscout_web;
        GRANT EXECUTE ON FUNCTION haversine_km(double precision, double precision, double precision, double precision) TO hunscout_web;
        GRANT EXECUTE ON FUNCTION current_workspace_id() TO hunscout_web;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hunscout_web;
    END IF;
END $$;
