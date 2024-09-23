# nestris.org

Production (main branch auto-deploy): http://138.197.82.78:80

Staging (dev branch auto-deploy): http://138.197.82.78:81

# How to Contribute
I'm grateful for every contribution to my passion project! Generally, the best way to contribute are to create Github tickets, then PR off of the dev branch into your own feature branch within the scope of the ticket. You can test locally using the instructions below, and make sure to write unit tests and run locally! Our integration testing involves merging into the dev branch to test on the staging server, then merging into prod when everything is verified to be good to go.

# For Developers
https://www.nestris.org is a full-stack application written in Angular, NodeJS, and Postgres. It is containerized through Docker and uses Github Actions to deploy production and staging servers to a DigitalOcean Droplet.

## Set up your development environment
If you're interested in developing, testing, or running nestris.org locally, follow the instructions below.

### Clone repository
```
git clone https://github.com/AnselChang/docker-angular-ts-node-postgres-websocket-template.git
cd docker-angular-ts-node-postgres-websocket-template
```

### Install npm packages
```
cd client; npm install; cd ..
cd server; npm install; cd ..
```

### Define .env file for development
In your local copy of the repository, create an .env file with the following:
```
NODE_ENV=production
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=mydatabase
DISCORD_CLIENT_ID=<discord client id>
DISCORD_CLIENT_SECRET=<discord client secret>
```

### Running server or client seperately
If you just want to run the server or client individually, you don't need docker.

To build client with live reload: `cd client; npm start`
To build server: `cd server; npm start`

However, note that the server and client will not be able to communicate. You may run Postgres locally for the server though.
If you would like to build the entire integrated application, go to the next step.

### Install Docker
```
apt update
apt install docker.io
```

### Install `docker-compose`
https://docs.docker.com/compose/install/linux/#install-using-the-repository



### Every time you modify /shared, run this command
`./update-shared.sh`

### To run client (Angular) unit tests
`cd client; npm test; cd ..`

### To run server (Jest) unit tests
`cd server; npm test; cd ..`

## Run Application Locally

### Run docker containers in dev mode
`docker compose -f docker-compose.dev.yml up --build`

Then, you can open it in the browser
```
Client: localhost:80
Server: localhost:3000
```

### Clean docker containers
`docker compose down`

### View Postgres Database
One way I recommend viewing local, staging, and prod databases is through an application called TablePlus. You need to specify your host/socket username, password, and database name, all which should be defined by your environment. The port should be `6543`, which should be defined as the public-facing postgres port in docker-compose.yml.

## Helpful Droplet commands

### Show logs for a container
`docker logs [container-id] [--follow]`

### This opens up an interactive PostgreSQL session in the prod/staging database
`docker exec -it [container-id] psql -U postgres -d mydatabase`

### List all tables in database
`\dt`

### Wipe database and reset###
Initializes the database. DO NOT RUN THIS unless you want to wipe all data.
This needs to be run if you want after changing the database schema at wipe-and-reset-database.sql

`docker exec -i [container-id] psql -U postgres -d mydatabase -f /docker-entrypoint-initdb.d/init.sql`

## Developing for the OCR library
OCR development is on a dedicated subdirectory called `ocr-library`. To start working on it, `cd ocr-library`.

### Install npm
Run `npm install` in the `ocr-library` directory

### Install ffmpeg
This is for processing videos used in test cases. For mac users, you can install ffmpeg with brew `brew instal ffmpeg`.

### Development workflow
`ocr-library` contains a few subdirectories:
- `ocr` hosts the core OCR logic. Running `./update-shared.sh` copies this directory into `client/src/app` to be used in the client application
- `test-cases` contains all the different gameplay videos used for validation testing. Each case contains a `game.mov` video, and a `config.yaml` file that specifies data that is used for calibration and to validate against the OCR results
- `test-output` contains the generated test results for each `test-case`
- `test` contains the testing logic that parses gameplay videos and runs OCR logic against each testcase and generate the test output

### Run OCR tests
Run all OCR test cases through jest with `npm test`.

This will go through each `test-case`, run OCR logic through the entire game, verify the result, and save the output and debug logs into `test-output`.


## How CI/CD works in this project
This repository has a `main` branch and a `dev` branch. They are configured to automatically build and deploy to production and staging servers, respectively. Server tests are automatically run during build, but Angular tests are disabled, though you can run Angular tests locally.

The latest builds for `main` and `dev` branches are always live on the following URLs:
```
Production client: http://138.197.82.78:80
Production server: http://138.197.82.78:3000
Staging client: http://138.197.82.78:81
Staging server: http://138.197.82.78:3001
```

CI and CD are managed through Github actions, which builds the Docker images onto hub.docker.com, does ssh into DigitalOcean Droplet, and then `docker compose pull` the built images and deploys them.

If all Github Action builds pass but there is a problem in deployment at DigitalOcean, ssh into Droplet and view logs:
For production server: `docker compose -f docker-compose.production.yml logs`
For staging server: `docker compose -f docker-compose.staging.yml logs`



## Setting up production environment for CI/CD
The current set up uses Github Actions and DigitalOcean. **This section should be irrelevant to you unless you are interested in hosting your own production deployment server.**

### Define secrets for Github Actions
```
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=mydatabase
DISCORD_CLIENT_ID=<discord client id>
DISCORD_CLIENT_SECRET=<discord client secret>
DO_SSH_KEY=[private key]
```

### Define variables in Github Actions
```
DO_HOST=[DO droplet IP address]
```

## Set up DigitalOcean Droplet
First, `ssh` into the Droplet. Then do the following:

### Install Docker
```
apt update
apt install docker.io
```

### Install `docker-compose`
https://docs.docker.com/compose/install/linux/#install-using-the-repository

### Clone repository
```
git clone https://github.com/netris/nestris.org.git
cd nestris.org
```
