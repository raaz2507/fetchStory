# FetchStory architecture

FetchStory is a modular monolith: one Express process with three product modules
and a shared core.

## Modules

- `src/dashboard`: mounts story scraping, upload, preview, and export routes.
- `src/reader`: mounts reader pages, local-image access, and reader APIs.
- `src/translator`: owns translation progress and canonical `posts.hin` output.
- `src/core`: owns SQLite, authentication, users, sessions, settings, and admin data.

The existing story files remain unchanged:

```text
temp/jobs/<jobId>/story_data.json
temp/jobs/<jobId>/images/
temp/jobs/<jobId>/exports/
translator/outputs/
downloads/
```

Stories and images are not stored in SQLite.

## Request flow

```text
Browser -> Express route -> controller/service -> filesystem
                         -> SQLite (authentication/admin only)
```

Scraping and translation progress use Server-Sent Events.

## OOP boundary

Stateful infrastructure uses classes:

- `Database`
- `AdminStoreRepository`
- `AuthService`

Routes, Express middleware, validation helpers, and HTML transformations remain
small functions. This keeps dependency boundaries explicit without turning every
utility into a class.
