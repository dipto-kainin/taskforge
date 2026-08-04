#!/bin/bash
set -e

# Create the three logical databases for TaskForge
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE taskforge_auth;
    CREATE DATABASE taskforge_core;
    CREATE DATABASE taskforge_search;
EOSQL

# Enable pgvector extension on the search database
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "taskforge_search" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

echo "✅ TaskForge databases created: taskforge_auth, taskforge_core, taskforge_search (with pgvector)"
