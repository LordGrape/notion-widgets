/* Minimal Web Push sender (RFC 8291 payload encryption + RFC 8292 VAPID),
 * implemented against the Workers runtime's native Web Crypto API only —
 * no npm dependency. The encryption sequence below was validated character-
 * for-character against the official RFC 8291 Appendix A test vector before
 * being ported here (ecdh_secret, PRK_key, IKM, PRK, CEK, NONCE, and the
 * final ciphertext all matched exactly), so this isn't guesswork crypto. */

function b64urlToBuf(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function bufToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: (Uint8Array | number[] | string)[]): Uint8Array {
  const bufs = parts.map((p) => {
    if (p instanceof Uint8Array) return p;
    if (Array.isArray(p)) return new Uint8Array(p);
    return new TextEncoder().encode(p);
  });
  const total = bufs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const b of bufs) {
    out.set(b, off);
    off += b.length;
  }
  return out;
}

async function hmacSha256(keyBytes: Uint8Array, dataBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes as BufferSource));
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidConfig {
  publicKeyB64url: string;
  privateKeyD: string;
  subject: string;
}

async function buildVapidHeader(endpoint: string, vapid: VapidConfig): Promise<string> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud, exp: now + 12 * 3600, sub: vapid.subject };
  const headerB64 = bufToB64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = bufToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const pubRaw = b64urlToBuf(vapid.publicKeyB64url);
  const x = bufToB64url(pubRaw.slice(1, 33));
  const y = bufToB64url(pubRaw.slice(33, 65));
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d: vapid.privateKeyD, ext: true } as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(signingInput) as BufferSource)
  );
  const jwt = `${signingInput}.${bufToB64url(sig)}`;
  return `vapid t=${jwt}, k=${vapid.publicKeyB64url}`;
}

async function encryptPayload(uaPublicB64url: string, authSecretB64url: string, plaintextBytes: Uint8Array): Promise<Uint8Array> {
  const uaPublicRaw = b64urlToBuf(uaPublicB64url);
  const authSecret = b64urlToBuf(authSecretB64url);

  const uaPublicKey = await crypto.subtle.importKey("raw", uaPublicRaw as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublicKey } as EcdhKeyDeriveParams, asKeyPair.privateKey, 256)
  );

  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concat("WebPush: info", [0x00], uaPublicRaw, asPublicRaw);
  const ikm = (await hmacSha256(prkKey, concat(keyInfo, [0x01]))).slice(0, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);

  const cekInfo = concat("Content-Encoding: aes128gcm", [0x00]);
  const cek = (await hmacSha256(prk, concat(cekInfo, [0x01]))).slice(0, 16);

  const nonceInfo = concat("Content-Encoding: nonce", [0x00]);
  const nonce = (await hmacSha256(prk, concat(nonceInfo, [0x01]))).slice(0, 12);

  const padded = concat(plaintextBytes, [0x02]); // single/last record padding delimiter (RFC 8188 §2)
  const cekKey = await crypto.subtle.importKey("raw", cek as BufferSource, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 } as AesGcmParams, cekKey, padded as BufferSource)
  );

  const rs = 4096;
  const rsBuf = new Uint8Array(4);
  new DataView(rsBuf.buffer).setUint32(0, rs, false);
  const header = concat(salt, rsBuf, new Uint8Array([asPublicRaw.length]), asPublicRaw);
  return concat(header, ciphertext);
}

export async function sendWebPush(
  subscription: PushSubscription,
  vapid: VapidConfig,
  payloadObj: unknown,
  ttlSeconds = 60
): Promise<{ status: number; ok: boolean; text: string }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(payloadObj));
  const body = await encryptPayload(subscription.keys.p256dh, subscription.keys.auth, plaintext);
  const authHeader = await buildVapidHeader(subscription.endpoint, vapid);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      TTL: String(ttlSeconds),
      Authorization: authHeader,
      "Content-Type": "application/octet-stream"
    },
    body: body as BodyInit
  });
  const text = await res.text().catch(() => "");
  return { status: res.status, ok: res.ok, text };
}
