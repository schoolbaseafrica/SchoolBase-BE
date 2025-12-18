#!/bin/sh

echo "Running database migrations..."
npm run migration:run || {
    echo "Migration failed or no migrations to run - continuing..."
}

echo "Starting application..."
exec npm run start:prod