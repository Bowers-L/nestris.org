#!/bin/bash

# Execute Docker Compose for local dev environment
docker compose -f docker-compose.dev.server.yml up --build
