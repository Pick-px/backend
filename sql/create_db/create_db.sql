-- 사용자 생성 (존재하지 않을 경우에만)
DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE rolname = 'pixel_user'
   ) THEN
      CREATE USER pixel_user WITH PASSWORD 'teamgmgdogs_postgres';
   END IF;
END
$$;

-- 데이터베이스 생성 (존재하지 않을 경우에만)
DO
$$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_database
      WHERE datname = 'pick_px'
   ) THEN
      CREATE DATABASE pick_px OWNER pixel_user;
   END IF;
END
$$;