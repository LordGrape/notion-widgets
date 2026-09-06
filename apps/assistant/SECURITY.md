# Command Centre security

## Security objective

Anyone may inspect the public interface code. Only a person holding the private Cloudflare Worker key can retrieve synchronized state.

## Current controls

- No personal task, timetable, user, or Notion data is stored in GitHub.
- No access key is hardcoded in HTML, JavaScript, the manifest, or the service worker.
- The lock screen verifies access against the Worker's protected state route before revealing the application.
- Every private state request includes `X-Widget-Key` over HTTPS.
- After successful verification, the key is remembered in browser-local storage on that device.
- Locking clears the in-memory key, session entry, and remembered browser entry.
- The Worker compares the supplied key with its `WIDGET_SECRET` environment secret.
- The Notion integration token remains Worker-side. Browser code can request synchronization but cannot read the token.

## Important limitation

This is shared-secret authentication, not identity authentication. A person who can access the browser profile or obtains the key can access the same protected Worker routes. Use the operating system's device lock and browser-profile protection. Do not use the remembered-key option on a shared or untrusted device.

Keep the key out of GitHub, Notion pages, screenshots, chat messages, and untrusted browser extensions.

## Future hardening

Cloudflare Access, WebAuthn passkeys, or short-lived signed sessions would provide identity-based access and easier revocation. The current durable key is a deliberate convenience trade-off for a single-user, trusted-device application.
