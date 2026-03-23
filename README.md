# Butler

Butler is a private two-person chat app with Slack-style link unfurls, built with Next.js and backed by PostgreSQL.

## Local development

1. Create a Postgres database.
2. Copy `.env.example` to `.env.local`.
3. Set `DATABASE_URL`.
4. Run:

```bash
npm install
npm run dev
```

The app creates its `messages` table automatically on first request.

## Render deployment

This repo includes a [render.yaml](/Users/srijik/Documents/src/chat-app/render.yaml) blueprint that provisions:

- one Node web service
- one managed PostgreSQL database

Push the repo to GitHub, GitLab, or Bitbucket, then create a new Render Blueprint from the repository.
