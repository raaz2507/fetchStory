# FetchStory

FetchStory scrapes supported forum stories, downloads their images, opens them in
an offline reader, transliterates English text to Hindi, and exports ZIP or
`.fstory` packages.

`.fstory` packages use the strict version 2 format. Every package contains
`manifest.json`, story JSON, mandatory `image-index.json`, and any available
images. Version 1 packages are not supported.

## Requirements

- Node.js 26
- A persistent writable data directory

No external database server is required. User accounts, sessions, settings, and
admin activity use SQLite through Node's built-in `node:sqlite` module.

## Start

```powershell
npm.cmd install
npm.cmd start
```
## Online Link
- `https://fetchstory.onrender.com/`
 
Open:

- `http://localhost:3000/home`
- `http://localhost:3000/reader-translator`
- `http://localhost:3000/admin`

## Configuration

Copy `.env.example` values into your process environment. This project does not
load `.env` files automatically.

Important variables:

- `FETCHSTORY_DATA_DIR`: persistent directory containing `users.sqlite`
- `FETCHSTORY_DB_PATH`: optional explicit database file
- `FETCHSTORY_ADMIN_USERNAME`: first-run admin username
- `FETCHSTORY_ADMIN_PASSWORD`: first-run admin password

If neither data variable is set, the database is created at
`data/users.sqlite`. On first SQLite startup, existing users from
`data/admin-store.json` are imported once.

For hosting, the data directory must be mounted on persistent storage. SQLite
cannot preserve users if the hosting provider deletes the whole filesystem on
each deployment.

## Storage

SQLite stores authentication/admin information only. Story content remains in:

```text
temp/jobs/<jobId>/
translator/outputs/
downloads/
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module boundaries.

## Tests

```powershell
npm.cmd test
```
