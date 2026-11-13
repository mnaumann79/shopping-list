-- Gives the application's non-owner role a password.
--
-- The checks that the role is fit to be the one the application connects as
-- live in scripts/app-role.sql, because they have to hold on an instance as
-- well — and there the password is a real credential that must not be
-- overwritten by a throwaway.
--
-- The password below is a throwaway for the local stack in CI. It is not a
-- credential: the database it belongs to is a container that exists for the
-- length of one job.

\ir ../app-role.sql

ALTER ROLE app WITH LOGIN PASSWORD 'app';
