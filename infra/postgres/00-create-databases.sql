-- One PostgreSQL instance, four logical databases. Each microservice owns its
-- schema and runs its own migrations during startup.
CREATE DATABASE trip_db;
CREATE DATABASE booking_db;
CREATE DATABASE seat_db;
CREATE DATABASE analytics_db;
