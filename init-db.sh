#!/bin/bash
set -e

# Create additional database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE test_db;
EOSQL
