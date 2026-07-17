# Observability and error tracking

All backend HTTP services emit structured JSON logs to stdout. Each request is
assigned an `x-request-id` and its method, path, response status, and duration
are recorded. Gateway propagates this ID to downstream HTTP services.

Sensitive fields such as passwords, tokens, cookies, secrets, and document IDs
are redacted before a record is written. For an incident, search Docker logs by
the request ID shown in the HTTP response or browser network panel:

```bash
docker compose logs --tail=200 booking-service | Select-String requestId
```

The Next.js app posts render and GraphQL failures to `/api/client-errors`; the
web container writes these as `client_error_reported` records. Expected user
errors remain visible in the UI (for example an invalid check-in code) rather
than causing an uncaught browser promise.
