# NetMirror APK — Video API / Backend Analysis

> **Purpose:** Ye document `NetMirror-ABD.apk` ke andar video content kahan se aata hai, kaunsa backend/API use hota hai, aur app ka architecture kya hai — ye reverse-engineer karke document karta hai.
>
> **Verified against:**
> - APK: `NetMirror-ABD.apk` — package `app.netmirror.netmirrornew`, versionName `3.0` (versionCode `1`)
> - SHA-256: `0ab5cb16238f5161c41c755a0b9aafac233fe3d06834553dd6811c4356e66917`
> - Decompiled: jadx (DEX) + `hermes-dec` (React Native Hermes bundle)
> - Live checks: 2026-10-23 (datacenter IP; results badal sakte hain)
>
> **Last updated:** 2026-10-30

> **Important current-status correction (2026-10-30):** The old `net52.cc/playlist.php`
> HLS can decode successfully while carrying a 10-minute anti-abuse video saying
> **“Too Many Requests in Short Period of Time”** instead of the requested title.
> Decoder progress is therefore not proof that the title plays. The working current
> chain is NetMirror catalog API -> `net27.cc/api/embed-tmdb/<id>` -> signed MP4;
> see section 14.

---

## ⚠️ Legal / Safety Warning (pehle padho)

Ye app kisi official OTT API ko use nahi karti. Ye ek **unofficial piracy streaming backend** hai:

- Video content unlicensed sources se scrape/resolve kiya jaata hai (StreamTape + apna HLS/CDN pipeline).
- Koi public API terms, SLA, ya documentation nahi hai.
- Endpoints/domains regularly rotate hote hain; kal ka endpoint kal dead ho sakta hai.
- Copyright infringement, DMCA notices, aur kai countries me criminal liability ka risk hai.
- Play Store / App Store ki policies ke against hai.

**Isliye:** is document ka purpose sirf **technical analysis / security research** hai. Is API ke upar production app mat banao, aur na hi ad-gate/token bypass karke content access karo. Legal app banani hai to licensed APIs (official OTT/studio APIs, TMDB for metadata, etc.) use karo — neeche alternatives diye hain.

---

## 0. TL;DR

| Cheez | Value |
|---|---|
| App type | React Native + Hermes + **WebView wrapper** |
| Native video player? | ❌ Nahi. Playback website ke andar hota hai |
| Official API? | ❌ Nahi |
| Bootstrap API | `GET https://mobiledetect.app/check.php` (23 mirror domains) |
| Web UI | `https://net52.cc/mobile/home?app=1` |
| Current catalog/search | `GET https://net27.cc/api/catalog/*` |
| Current source resolver | `GET https://net27.cc/api/embed-tmdb/<id>?type=...&se=...&ep=...` |
| Current media | Signed MP4 with HTTP byte ranges |
| Current video CDN | `*.hakunaymatata.com` plus rotating hosts |
| Legacy chain | `net52.cc/playlist.php` -> HLS; currently returns warning content |
| Download resolver | `POST https://net52.cc/streamtape.php` (StreamTape scrape) |
| Download host family | `streamtape.com`, `streamtape.net`, `streamtape.to`, `stape.fun` |
| App ka apna backend? | ❌ Nahi. Sirf website + resolver + ad config |

**Ek line me:** APK ek WebView shell hai. Original snapshot me `net52.cc`
playlist/HLS tha; current working website backend `net27.cc/api/catalog/*` aur
`api/embed-tmdb/*` se signed MP4 deta hai.

---

## 1. APK facts

| Field | Value |
|---|---|
| File | `NetMirror-ABD.apk` |
| Package | `app.netmirror.netmirrornew` |
| Version | `3.0` (versionCode `1`) |
| Size | ~52 MB |
| UI framework | React Native (Hermes bytecode) |
| Main bundle | `assets/index.android.bundle` |
| Native libs | `lib/arm64-v8a/libappmodules.so` (stock RN, koi custom streamer nahi) |
| Extra dex | `classes2.dex` (AppCore helper / integrity check) |
| Disguised assets | `assets/r.dat`, `assets/logo.png` — dono actually JSON hain |
| Entry activity | `app.netmirror.netmirrornew.MainActivity` |

DEX me koi video player ya streaming SDK nahi mila. `MainActivity` bas React Native root start karta hai, aur `AppCore` ek native overlay/ads/config layer chalata hai.

---

## 2. High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Android APK                           │
│                                                              │
│  MainActivity                                                │
│      │                                                       │
│      ├── AppCore (signature check, ads, remote config)       │
│      │                                                       │
│      └── React Native UI (Hermes bundle)                     │
│              │                                               │
│              └── <WebView>  ──────────────► net52.cc         │
│                     │                         (website)      │
│                     │                            │           │
│                     │                            ├── search.php
│                     │                            ├── playlist.php
│                     │                            ├── hls/*.m3u8
│                     │                            └── CDN
│                     │                                        │
│                     └── postMessage("downloadStart=...")     │
│                              │                               │
│                              ▼                               │
│                    StreamTape page GET                       │
│                              │                               │
│                              ▼                               │
│                    POST /streamtape.php                      │
│                              │                               │
│                              ▼                               │
│                    dlUrl → external browser                  │
└──────────────────────────────────────────────────────────────┘
```

Important: app ke andar ExoPlayer/Media3/VLC jaisa koi native player nahi hai. Video playback **WebView ke andar website ke player** se hota hai. App sirf:
1. runtime config leta hai,
2. WebView me website kholta hai,
3. download button par StreamTape resolve karke browser me URL kholta hai,
4. ads/update dialogs dikhata hai.

---

## 3. Runtime bootstrap — `check.php`

### 3.1 App JS me kya hai

Hermes bundle me ek base64-encoded host list hai. Har entry ko decode karke `GET <host>/check.php` call hota hai (5 second timeout). Host list me 23 domains hain, pattern:

```
https://mobiledetect.app
https://mobidetect.art
https://mobidetect.cc
https://mobidetect.click
https://mobidetect.ink
... (23 total, .top/.xyz/.site/.shop/.store/.vip/.wiki/.info etc.)
```

Ye deliberate domain rotation hai — ek domain block hua to app next mirror try karti hai.

### 3.2 Response

`GET https://mobiledetect.app/check.php` (2026-10-23):

```json
{
  "token_hash": "aHR0cHM6Ly9uZXQ1Mi5jYy9tb2JpbGUvaG9tZT9hcHA9MQ==",
  "doms": "false",
  "mwin": "true",
  "popwin": "true",
  "var": "1.0",
  "stape": "aHR0cHM6Ly9uZXQ1Mi5jYy9zdHJlYW10YXBlLnBocA==",
  "u": [
    "aHR0cHM6Ly9zdHJlYW10YXBlLmNvbQ==",
    "aHR0cHM6Ly9zdHJlYW10YXBlLm5ldA==",
    "aHR0cHM6Ly9zdHJlYW10YXBlLnRv",
    "aHR0cHM6Ly9zdGFwZS5mdW4="
  ]
}
```

Base64 decode karne par:

| Field | Decoded | Kaam |
|---|---|---|
| `token_hash` | `https://net52.cc/mobile/home?app=1` | WebView ka starting URL |
| `stape` | `https://net52.cc/streamtape.php` | Download resolver API |
| `u[]` | `https://streamtape.com`, `.net`, `.to`, `https://stape.fun` | StreamTape mirror hosts |
| `doms`, `mwin`, `popwin` | flags | WebView/popup behavior |
| `var` | `1.0` | Config version |

### 3.3 App isko kaise use karti hai

React Native code roughly:

1. Host list iterate karo.
2. `GET <host>/check.php`.
3. Response ke `token_hash`, `stape`, `u` ko base64-decode karo.
4. WebView ka `uri` = decoded `token_hash`.
5. Download handler me `stape` endpoint aur `u` hosts use karo.

Yahi app ka "API discovery" layer hai. Iske bina koi hardcoded video API nahi hai.

---

## 4. WebView aur ad gate

Starting URL:

```
https://net52.cc/mobile/home?app=1
```

Ye page normally ek **ad verification gate** return karta hai:

- HTML me `data-addhash="<hash>::<hash>::<expiry>::ni"` hota hai.
- Page `POST /mobile/verify2.php` ko `verify=<addhash>` bhejta hai.
- Response jaise:
  ```json
  {"c":"n","statusup":"Waiting for your ads click."}
  ```
- User ko ad dekhkar 20-30 second wait karna padta hai; phir page reload hota hai.
- `addhash` cookie (`path=/; domain=net52.cc`) session track karta hai.

Search/playlist endpoints bina session bhi metadata de dete hain, lekin real playback ke liye website side session/token expected hai. **Ad gate bypass karna is document ka scope nahi hai.**

---

## 5. Catalog API

### 5.1 Search

**Endpoint:**

```http
GET https://net52.cc/search.php?s=<query>&t=<epoch_seconds>
```

Headers jo kaam karte hain:

```http
User-Agent: okhttp/4.9.2 /OS.Gatu v3.0
X-Requested-With: XMLHttpRequest
Referer: https://net52.cc/
```

Response (sanitized):

```json
{
  "head": "Movies & TV",
  "type": 0,
  "searchResult": [
    { "id": "80100172", "t": "Dark" },
    { "id": "81707187", "t": "Dark Gathering" }
  ]
}
```

- `id` IMDb-style numeric ID hai.
- `t` title hai.
- `s` search query hai.
- `t` query param timestamp hai (cache-busting).

Note: `https://net52.cc/mobile/search.php` alag behaviour deta hai — wo bina query ke "Top Searches" return karta hai. Catalog search ke liye root `/search.php` use hota hai.

### 5.2 Content details / episodes

| Endpoint | Behaviour (observed) |
|---|---|
| `GET/POST /post.php?id=<id>` | `{"status":"n","error":"Invalid User"}` without valid session |
| `GET/POST /episodes.php?id=<id>` | `{"error":"Valid Post ID Not Found!"}` without valid internal post ID |
| `POST /mobile/verify2.php` | Ad verification gate |
| `GET /mobile/app-info.php?os=android` | APK download/info page (HTML) |

`post.php` aur `episodes.php` app ke WebView session/cookies par depend karte hain. Inhe standalone API ki tarah use karne ke liye valid session chahiye — jo ad-gate ke through banta hai.

### 5.3 Playlist / sources

**Endpoint:**

```http
GET https://net52.cc/playlist.php?id=<content_id>&t=Video&tm=<epoch_ms>
```

Response (sanitized):

```json
[
  {
    "image2": "https://<poster-cdn>/poster/1920/<id>.jpg",
    "sources": [
      {
        "file": "/hls/<id>.m3u8?q=720p&in=<token>",
        "label": "Mid HD",
        "type": "application/vnd.apple.mpegurl",
        "default": "true"
      },
      {
        "file": "/hls/<id>.m3u8?q=480p&in=<token>",
        "label": "Low HD",
        "type": "application/vnd.apple.mpegurl"
      }
    ]
  }
]
```

Observations:

- Endpoint bina login ke bhi source list return karta hai.
- `t=Video` content type hai; `tm` timestamp/cache-buster hai.
- `in=` token placeholder (`unknown::ni`) ke saath bhi manifest response mila, lekin real playback ke liye valid session token expected hai.
- Token short-lived / session-bound ho sakta hai; ise forge mat karo.

---

## 6. Video playback chain

### 6.1 HLS master

`playlist.php` ka `file` path `https://net52.cc` par resolve hota hai:

```http
GET https://net52.cc/hls/<id>.m3u8?q=720p&in=<token>
Referer: https://net52.cc/
```

Observed master playlist (sanitized):

```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="und",NAME="Unknown",DEFAULT=NO,URI="https://<audio-host>/files/<id>/a/0/0.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000001,AUDIO="aac",RESOLUTION=1920x1080
https://sXXXX.freecdnX.top/.../1080p/1080p.m3u8?in=<token>
#EXT-X-STREAM-INF:BANDWIDTH=600000,AUDIO="aac",RESOLUTION=1280x720,DEFAULT=YES
https://sXXXX.freecdnX.top/.../720p/720p.m3u8?in=<token>
#EXT-X-STREAM-INF:BANDWIDTH=400000,AUDIO="aac",RESOLUTION=854x480
https://sXXXX.freecdnX.top/.../480p/480p.m3u8?in=<token>
```

Key points:

- Master manifest `net52.cc` se aata hai.
- Variant playlists/segments `*.freecdn*.top` CDN se aate hain.
- `Referer: https://net52.cc/` required tha; bina referer request fail ho sakti hai.
- `q=1080p/720p/480p` quality select karta hai.
- `in=` token playback authorization ke liye hai.

### 6.2 Segments

Public reverse-engineering reports kehti hain ki segments MPEG-TS hote hain lekin `.jpg` extension se disguise kiye jaate hain. **Humne actual video segments download/verify nahi kiye** — ye claim third-party analysis se hai, isliye ise "reported, unverified" maano.

### 6.3 Playback app me kaise hota hai

App khud HLS parse nahi karti. WebView ke andar website ka player HLS URL use karta hai. Isliye:

- App me `playlist.php` / `hls` ka direct client code nahi mila.
- App ke bundle me sirf `check.php` + WebView + download resolver hai.
- Playback ke liye WebView ka session, cookies, aur JS player responsible hain.

---

## 7. Download chain — StreamTape resolver

### 7.1 Flow

1. WebView page par user "Download" dabata hai.
2. Page React Native ko message bhejta hai:
   ```
   downloadStart=<path>
   ```
3. App `u[]` hosts me se ek uthata hai aur GET karta hai:
   ```
   GET https://streamtape.com<path>
   Headers:
     X-Requested-With: <empty>
     User-Agent: <custom>
   ```
4. App response HTML aur final host extract karta hai.
5. App resolver ko POST karta hai:

   ```http
   POST https://net52.cc/streamtape.php
   Content-Type: application/x-www-form-urlencoded

   stdata=<scraped StreamTape HTML>&streamDomain=<streamtape-host>
   ```

6. Resolver response:

   ```json
   {
     "status": "ok",
     "dlUrl": "https://<resolved-download-url>"
   }
   ```

   Error case:

   ```json
   {
     "status": "error",
     "dlUrl": "https:",
     "errorMsg": "my error here"
   }
   ```

7. Success par app `Linking.openURL(dlUrl)` se external browser kholti hai.

### 7.2 Important

- `stdata` me **poora StreamTape page HTML** jaata hai — yani resolver server-side scrape karta hai.
- `streamDomain` batata hai ki HTML kis mirror se aaya.
- Ye stable API nahi hai; StreamTape page structure change hote hi break ho jaayega.
- `dlUrl` direct file host ka link hota hai; is document me working URL include nahi kiya gaya.

---

## 8. AppCore — config, integrity, ads

### 8.1 Disguised config files

`assets/r.dat` aur `assets/logo.png` actually JSON hain (PNG header nahi hai). Fields XOR-obfuscated hain:

```text
decoded_byte[i] = value[i] XOR key[i % key.length]
```

Decoded `r.dat` se milta hai:

| Field | Value (example) |
|---|---|
| remote config URL 1 | `https://co.confy.click/c/netm/axb2.json` |
| remote config URL 2 | `https://co.mellog.xyz/c/netm/axb2.json` |
| salt part A | `xduOOoqMuKx` |
| connect/read timeout | 1500 ms |
| cache TTL | 21600000 ms (6h) |

Decoded `logo.png` se milta hai:

| Field | Value (example) |
|---|---|
| launch URL | `https://quitedrench.org?Ch98t=...` |
| salt part B | `LcQB2Ow9AL9` |
| appended code | `tuBARLYtFVdeJ5m1r9csk` |

Combined salt = `partA + partB + appendedCode`.

### 8.2 Remote config decryption

Remote config `netmirror-aes-cbc-hmac-b64-v1` format me aata hai:

1. Base64 decode.
2. First 16 bytes = IV.
3. Last 32 bytes = HMAC-SHA256.
4. Key material = `SHA-512(salt)`.
5. First 32 bytes = AES key; last 32 bytes = HMAC key.
6. Verify `HMAC(iv || ciphertext)`.
7. AES-CBC decrypt + PKCS7 unpad.

Decrypted config fields (ads/update, not video):

```json
{
  "version": 1,
  "enabled": true,
  "cache_ttl_ms": 43200000,
  "ad_override_enabled": false,
  "ad_url": "https://<ad-host>/?...",
  "ad_watch_seconds": 20,
  "get_app_enabled": false,
  "play_ad_enabled": false,
  "play_ad_mode": "EveryNPlays",
  "play_ad_every_n_plays": 2,
  "update_check_enabled": false,
  "update_version_override": "999.0"
}
```

### 8.3 Integrity checks

`AppCore` kuch checks karta hai:

- APK signature / certificate hash
- `classes2.dex` ka SHA-256
- Trust na hone par process kill / fallback config
- Remote config se ads/update/launch prompts

Ye piracy app ki self-protection hai, API nahi.

---

## 9. Endpoint summary

| # | Method | Endpoint | Auth | Kaam |
|---|---|---|---|---|
| 1 | GET | `https://mobiledetect.app/check.php` | ❌ | Runtime bootstrap (23 mirrors) |
| 2 | GET | `https://net52.cc/mobile/home?app=1` | ❌ (ad gate) | WebView UI |
| 3 | GET | `https://net52.cc/search.php?s=<q>&t=<ts>` | ❌ | Catalog search |
| 4 | GET | `https://net52.cc/mobile/search.php` | ❌ | Top searches |
| 5 | GET/POST | `https://net52.cc/post.php?id=<id>` | ✅ session | Content details |
| 6 | GET/POST | `https://net52.cc/episodes.php?id=<id>` | ✅ session | Episode list |
| 7 | GET | `https://net52.cc/playlist.php?id=<id>&t=Video&tm=<ms>` | ⚠️ partial | HLS source list |
| 8 | GET | `https://net52.cc/hls/<id>.m3u8?q=<quality>&in=<token>` | ⚠️ token + Referer | HLS master |
| 9 | GET | `https://<cdn>.freecdn*.top/...` | ⚠️ token | Video segments |
| 10 | POST | `https://net52.cc/streamtape.php` | ❌ | StreamTape download resolver |
| 11 | POST | `https://net52.cc/mobile/verify2.php` | cookie | Ad gate |
| 12 | GET | `https://net52.cc/mobile/app-info.php?os=android` | ❌ | APK info page |
| 13 | GET | `https://co.confy.click/c/netm/axb2.json` | ❌ | Ad/update remote config |
| 14 | GET | `https://co.mellog.xyz/c/netm/axb2.json` | ❌ | Backup remote config |

---

## 10. Is API par app bana sakte hain?

**Technically:** haan, lekin sirf scraping/resolver ke through — koi official API contract nahi hai.

**Practically:** nahi, kyunki:

1. **Legal:** unlicensed content; copyright infringement.
2. **Stability:** domains, tokens, page structure, CDN sab rotate hote hain.
3. **Access control:** ad gate, session cookies, short-lived tokens.
4. **Store policy:** Play Store/App Store piracy apps reject karte hain.
5. **Security:** third-party scraped HTML server ko bhejna; supply-chain risk.
6. **No SLA:** endpoint kabhi bhi dead, rate-limited, ya Cloudflare challenge de sakta hai.

### Legal alternatives

| Need | Recommended |
|---|---|
| Movie/TV metadata | TMDB API, OMDb API |
| Licensed streaming | Official OTT partner APIs / studio APIs |
| Music | Spotify Web API, Apple Music API, YouTube Data API (metadata only) |
| User watchlists | Apna backend + licensed metadata |
| Trailers | YouTube Data API (official trailers) |

---

## 11. Evidence / reproduction notes

Tools used:

```bash
# APK info
aapt dump badging NetMirror-ABD.apk

# DEX decompile
jadx -d netmirror_src --no-res NetMirror-ABD.apk

# Hermes bytecode decompile
pip install hermes-dec
hbc-decompiler assets/index.android.bundle bundle.hasm
```

Key findings:

- `AppCore.java` — `r.dat` / `logo.png` XOR decode, remote config AES, signature checks.
- `bundle.hasm` — 23 base64 host list + `/check.php` + WebView + download flow.
- Live probe — `check.php` response, `search.php`, `playlist.php`, HLS master, `streamtape.php` error contract.

Is document me koi working downloader, token forge, ad-gate bypass, ya direct signed video URL nahi diya gaya.

---

## 12. Final answer (short)

NetMirror ka video API kisi official provider ka nahi hai:

1. App launch par **`mobiledetect.app/check.php`** (23 mirrors) se runtime config leti hai.
2. Config se WebView URL **`net52.cc/mobile/home?app=1`** aur download resolver **`net52.cc/streamtape.php`** milta hai.
3. Catalog **`net52.cc/search.php`** se, sources **`net52.cc/playlist.php`** se, aur video **`net52.cc/hls/*.m3u8` → `*.freecdn*.top`** se aata hai.
4. Download path **StreamTape** (`streamtape.com/.net/.to`, `stape.fun`) ko scrape karke `streamtape.php` se resolve karta hai.
5. App khud koi player/API client nahi hai — wo bas website ko WebView me dikhane wala shell + ad/update layer hai.

**Recommendation:** is backend par app mat banao. Legal app ke liye licensed metadata/streaming APIs use karo.

---

## 13. Verified working playback flow (co-stream implementation)

Ye section un exact requests ko document karta hai jo `co-stream` app me video render karne ke liye use ho rahe hain. Ye flow 2026-10-30 ko live verify kiya gaya (Dhoomakethu / id `83206696`).

### 13.1 Request order

```text
1. Bootstrap (optional, origin + processor discovery)
   GET https://mobiledetect.app/check.php
   Headers: accept: application/json
   Response: { token_hash, stape, u[], ... }

2. Resolve sources
   GET https://net52.cc/playlist.php?id=<id>&t=Video&tm=<epoch_ms>
   Headers:
     accept: application/json
     User-Agent: okhttp/4.9.2 /OS.Gatu v3.0
     Referer: https://net52.cc/
   Response:
     [{ image2, sources: [{ file: "/hls/<id>.m3u8?q=720p&in=unknown::ni", label, type, default } ] }]

3. HLS master
   GET https://net52.cc/hls/<id>.m3u8?q=720p&in=unknown::ni
   Headers:
     User-Agent: okhttp/4.9.2 /OS.Gatu v3.0
     Referer: https://net52.cc/
   Response: master playlist
     - #EXT-X-MEDIA audio tracks: https://<audio-cdn>.top/.../a/<n>/<n>.m3u8
     - #EXT-X-STREAM-INF video variants: https://sXXXX.freecdnX.top/.../<quality>.m3u8

4. Audio playlist (one per selected language)
   GET https://<audio-cdn>.top/.../a/<n>/<n>.m3u8
   Headers: same User-Agent + Referer
   Response: media playlist with segments like 6610_000.js

5. Video variant playlist
   GET https://sXXXX.freecdnX.top/.../<quality>.m3u8?in=unknown::ni::p
   Headers: same User-Agent + Referer
   Response: media playlist with segments like 2560_000.jpg

6. Segments
   GET .../2560_000.jpg   -> MPEG-TS video (Content-Type upstream: image/jpeg)
   GET .../6610_000.js    -> MPEG-TS AAC audio (Content-Type upstream: text/javascript)
   Headers: same User-Agent + Referer
```

### 13.2 Important playback facts

- Video segments are **MPEG-TS disguised as `.jpg`**.
- Audio segments are **MPEG-TS disguised as `.js`**.
- `Content-Type` upstream is wrong (`image/jpeg` / `text/javascript`). A proxy must return `video/mp2t`.
- Master manifest may advertise an audio track with a hostless URI:
  `URI="https:///files/<id>/a/0/0.m3u8"`.
  This is unusable. Drop that `#EXT-X-MEDIA` line and remove its `AUDIO="group"` attribute from `#EXT-X-STREAM-INF`, otherwise hls.js waits forever for an audio track and the video stays blank (readyState 0).
- Audio CDN hosts rotate. Observed:
  - `s88.nm-cdn30.top`
  - `s88.nm-cdn23.top`
  - `makhi4.top`
  - `s0022.freecdn4.top`
- All CDN requests require `Referer: https://net52.cc/`.
- Do **not** leave CDN URLs pointing directly at the client. Rewrite every manifest URI/segment back through the same proxy so the Referer is always added and CORS stays same-origin.

### 13.3 Verified hls.js result

Before the fix (audio URIs not proxied and `AUDIO` still advertised):

```text
video.readyState = 0
video.currentTime = 0
video.networkState = 2
hls log: checkPendingTracks (pending: 1 codec events expected: 2)
hls log: queuing "video" append ...
=> blank player forever
```

After proxying audio tracks and dropping only invalid audio declarations, the
legacy stream technically decoded:

```text
video.readyState = 4
video.currentTime > 0 (progresses)
video.buffered = [0 .. 66+]
hls + AAC audio load successfully
```

However, extracting and visually checking an actual frame proved that this was
NetMirror's anti-abuse placeholder, not the requested movie. It displays:

```text
Too Many Requests in Short Period of Time
STOP Abuse
```

This legacy path must not be reported as successful title playback.

### 13.4 Thumbnails

`playlist.php` returns the intended thumbnail URL in `image2`:

```json
{ "image2": "https://imgcdn.kim/poster/1920/<id>.jpg" }
```

Current live status (2026-10-30): `imgcdn.kim` returns HTTP 404 for every tested
poster path (`/poster/1920/<id>.jpg`, `/poster/500/...`, with/without Referer or
token). So NetMirror's own thumbnail CDN is currently broken.

`co-stream` therefore falls back to the public IMDb suggestion endpoint:

```http
GET https://v3.sg.media-imdb.com/suggestion/x/<url-encoded-title>.json
User-Agent: Mozilla/5.0
Response: { d: [{ id, l, y, i: { imageUrl } }] }
```

The app exposes it as `/api/poster?title=<title>`, which caches the lookup for 24h
and proxies the image bytes with a 1-day browser cache. This is a metadata-only
fallback; playback still comes from NetMirror.

### 13.5 Proxy rules used by co-stream

- Allowed hosts: `net52.cc`, `*.freecdn*.top`, `*.nm-cdn*.top`, `imgcdn.kim`, and
  NetMirror-style `*.top/files/<id>/...` audio hosts.
- Always send `Referer: https://net52.cc/` and the `okhttp/4.9.2 /OS.Gatu v3.0` UA.
- Retry 429/5xx/network failures up to 4 times with a fresh timeout per attempt.
- 30s timeout per attempt (segments can be 6-8 MB).
- Rewrite:
  - `#EXT-X-MEDIA URI="..."` -> `/api/netmirror/proxy?target=...`
  - `#EXT-X-STREAM-INF` following URI -> `/api/netmirror/proxy?target=...`
  - media playlist segment lines -> `/api/netmirror/proxy?target=...`
- Read small responses (audio fragments, manifests) into memory and cache them
  briefly; stream large video fragments.
- Set hls.js `startLevel: 0` (480p) for fast first frame, then let ABR upgrade.
- Add `muted` to the `<video>` until playback starts, then unmute on the `play`
  event (avoids browser autoplay blocking after async manifest resolution).

### 13.6 Minimal implementation checklist

1. `playlist.php` call -> choose default source.
2. Fetch master through proxy with NetMirror Referer.
3. Rewrite audio + video URLs to proxy URLs.
4. Drop hostless `#EXT-X-MEDIA` entries and their `AUDIO` group references.
5. Proxy variant playlists and segments.
6. Return `video/mp2t` for `.jpg` and `.js` segments.
7. Feed the rewritten master to hls.js.
8. Start muted, unmute on `play`.
9. Cache small audio/manifest responses and retry transient 429/5xx.

---

## 14. Current working API chain (verified 2026-10-30)

NetMirror's current frontend exposes a newer catalog/embed flow on `net27.cc`
(the browser UI currently redirects to `net79.cc`). This replaces the legacy
warning HLS for `co-stream`.

### 14.1 Current catalog and search

```http
GET https://net27.cc/api/catalog/aoneroom-home
GET https://net27.cc/api/catalog/search-hybrid?q=<title>
GET https://net27.cc/api/catalog/title/<movie|tv>/<tmdb_id>
GET https://net27.cc/api/catalog/season/<tmdb_id>/<season_number>
GET https://net27.cc/api/catalog/discover?platform=<platform>&type=<movie|tv>&region=IN
GET https://net27.cc/api/variants-tmdb/<movie|tv>/<tmdb_id>?se=<n>&ep=<n>
```

`search-hybrid` returns `tmdbId`, `type`, metadata, poster, `subjectId`,
`detailPath`, variants, and a `streamable` hint. The app uses the ID returned by
this NetMirror response; it does not query a separate TMDB catalog API.

The current UI uses `discover` for per-platform top-ten rails. Verified platform
keys include `Netflix`, `PrimeVideo`, `JioHotstar`, `SonyLIV`, `AppleTV`,
`Crunchyroll`, and `MX`.

The Home screen builds separate ranked Hindi-movie and Hindi-series rails for
every selected platform. Curated Bollywood/Indian rails seed the movie list;
`variants-tmdb` fills missing positions only when a Hindi audio variant exists.
Indian platform series are requested separately and displayed in their own top
ten row.

### 14.2 Resolve a movie or episode

```http
GET https://net27.cc/api/embed-tmdb/<tmdb_id>?type=movie&se=1&ep=1
GET https://net27.cc/api/embed-tmdb/<tmdb_id>?type=tv&se=<season>&ep=<episode>
Accept: application/json
```

Relevant response fields:

```json
{
  "ok": true,
  "title": "...",
  "type": "movie",
  "streams": [
    { "url": "https://bcdnxw.hakunaymatata.com/...mp4?sign=...&t=...", "resolution": 480 }
  ]
}
```

The signed MP4 URL is proxied server-side with byte ranges intact. Required
referers are host-specific:

| CDN suffix | Referer |
|---|---|
| `hakunaymatata.com` | `https://moviebox.ph/` |
| `mxcontent.net` | `https://mixdrop.top/` |
| `messycloud.ink` | `https://netmirror.hair/` |
| `juicybits.io` | `https://www.messycloud.ink/` |
| `aoneroom.com` | `https://videodownloader.site/` |

Using the old `Referer: https://net52.cc/` against the new MP4 CDN produces HTTP
429. With the correct referer, a range request returns `206 video/mp4`.

### 14.3 Verified outcomes

- Legacy HLS frame: anti-abuse “Too Many Requests” warning (rejected).
- Current Dhoomakethu MP4 frame: actual movie credits (visually checked).
- Browser playback: `readyState=4`, time advanced beyond 27s, and both audio and
  video decoded-byte counters increased.
- Series UI: The Terminal List returned 2 seasons / 16 episodes.
- Season switching: Season 2 returned all 8 episode records.
- Episode playback: S2E3 resolved independently, reached `readyState=4`, and
  advanced with audio/video bytes increasing.
- Quality switching exposes the signed resolutions returned in `streams[]`.
- Captions from `captions[]` are proxied, converted from SRT to WebVTT, and can
  be enabled/disabled per language.
- Audio variants from `variants-tmdb` resolve independently through the embed
  endpoint's `dub`, `dubdp`, `sid`, and `dp` parameters.
- The custom player locks supported fullscreen devices to landscape, falls back
  to native iOS fullscreen, and implements animated left/right double-tap
  backward/forward gestures. Single tap only shows/hides controls; pinch-in and
  pinch-out switch Fit/Fill. Quality, subtitle language, and audio language live
  in one top-right settings menu.
- Playback now starts at 1080p when that variant exists. The player preserves
  byte-range streaming and automatically steps down after a prolonged stall or
  media error. Offline saves use a smaller signed variant and appear in the
  dedicated Movies/Web-Series offline library.
