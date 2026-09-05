# Command Centre security

## Security objective

Anyone may inspect the public interface code. Only a person holding the private Cloudflare Worker key can retrieve synchronized state.

## Current controls

- No personal task, timetable, user, or Notion data is stored in GitHub.
- No access key is hardcoded in HTML, JavaScript, the manifest, or the service worker.
- The lock screen verifies access against the Worker's protected state route before revealing the application.
- Every private state request includes `X-Widget-Key` over HTTPS.
- The key is stored only in `sessionStorage`, not durable local storage.
- Locking clears the in-memory key, synchronized state, and session entry.
- The Worker compares the supplied key with its `WIDGET_SECRET` environment secret.

## Important limitation

This is shared-secret authentication, not identity authentication. A person who obtains the key can access the same protected Worker routes. Keep the key out of GitHub, Notion pages, screenshots, chat messages, and untrusted browser extensions.

## Future hardening

A later version can replace the shared key with Cloudflare Access, WebAuthn passkeys, or a short-lived signed session. That would provide identity-based access and easier revocation.
