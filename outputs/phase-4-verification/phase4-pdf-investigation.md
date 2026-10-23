# PDF live-test investigation

The unchanged existing `test:e2e:live` suite reached 41 passing checks and then timed out at its original 15-second PDF download assertion. No assertion or timeout was changed.

A read-only investigation used the same ready 252-byte PDF and built StorageService signing code. Direct Node HTTP returned 200 and the correct Persian RFC5987 Content-Disposition filename. Installed Chrome and Edge 154.0.8037.98 instead received 204, then ERR_ABORTED, without a download event. Replaying actual browser headers using Node still returned 200.

Controlled filename checks using identical content:

| Signed filename | Browser result |
|---|---|
| diagnostic.pdf / diagnostic.PDF | HTTP204, no download |
| diagnostic.txt with application/pdf | HTTP200, downloads |
| diagnostic.pdfx | HTTP200, downloads |
| Persian PNG attachment | HTTP200, downloads |

The browser considers localhost3000 secure; storage allows its origin. IPv4, synchronous activation, alternative MIME/disposition and no proxy did not resolve the PDF path. Blocked PDFs never reached the browser download list. Matching Chrome/Edge registry download policies were not found. The exact filtering component remains unidentified; the evidence does not establish Chrome mixed-content policy. No security policy was bypassed.

The pinned Playwright Chromium headless-shell1243 download was attempted using its standard installer into the chat workspace. The official CDN returned HTTP403 AccessDenied because the service is unavailable in this location. No alternate mirror was used and no repository dependency was installed or updated.

All database queries in this investigation were READ ONLY. Scratch browsers closed; owned live fixtures were subsequently cleaned up. The actual app keeps Persian .pdf filenames and its existing direct S3 download behavior.
