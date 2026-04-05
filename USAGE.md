# OpenHub Store Backend — Admin Usage Guide

## 1. Authentication
All admin endpoints require an `X-Admin-Secret` header.
Your secret is: `From1to9`

## 2. Key Admin Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/indexed-count` | Check total number of listed apps |
| GET | `/api/admin/queue` | View the processing queue (`?status=pending`) |
| POST | `/api/admin/queue` | Manually add a repo (Body: `{"full_name": "owner/repo"}`) |
| POST | `/api/admin/feature/:id` | Set a repo as the featured app |
| POST | `/api/admin/delist/:id` | Remove a repo from public listing |
| GET | `/api/admin/rate-limit` | Check current GitHub API quota |

## 3. Example Usage (CURL)

### Check Indexed Count
```bash
curl -X GET "https://your-backend.vercel.app/api/admin/indexed-count" \
     -H "X-Admin-Secret: From1to9"
```

### Manually Queue a Repository
```bash
curl -X POST "https://your-backend.vercel.app/api/admin/queue" \
     -H "X-Admin-Secret: From1to9" \
     -H "Content-Type: application/json" \
     -d '{"full_name": "obsproject/obs-studio"}'
```

## 4. Triggering Pipeline Jobs
You can manually trigger discovery and enrichment by visiting these URLs in your browser or using curl (no auth required for cron endpoints):

- **Discovery**: `/api/cron/discover` (Finds new candidates)
- **Enrichment**: `/api/cron/enrich` (Processes the queue)
- **Trending**: `/api/cron/trending` (Recalculates scores)
