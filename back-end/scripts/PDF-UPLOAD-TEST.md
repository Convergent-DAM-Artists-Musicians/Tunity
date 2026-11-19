# Local PDF upload test

From the music-analyzer-crepe folder in PowerShell:

```powershell
$env:AUDIVERIS_PATH = 'C:\Program Files\Audiveris\Audiveris.exe'
npm.cmd run score-server
```

Open http://127.0.0.1:8080 and select trumpet-test-wide.pdf. Use tempo 60 and
Written B♭ trumpet pitches. Upload, then review the returned reference. For this
exercise the sounding MIDI pitches must be 72, 74, 76, 72, with starts 0, 1, 2, 3
and total duration 4 seconds. Download the JSON for the analyzer.

Audiveris runs automatically in batch mode; its GUI is not needed. It must remain
installed on the backend machine. Tempo and transposition are explicit overrides,
not facts inferred from the PDF. Transposition replaces any recognized XML
transposition, so it is not applied twice. Choose Concert pitches for a PDF showing
concert notation. Printed dynamics are not automatically converted to volume targets.

The API accepts POST /api/scores?tempoBpm=60&transpositionSemitones=-2 with
Content-Type: application/pdf and raw PDF bytes as its body (not multipart data).
It returns the reference JSON with source "omr" and requiresReview true.
Uploads are limited to 20 MiB; one conversion runs at a time; temporary PDF and OMR
files are removed after processing. Recognition errors return HTTP 422.

This is a local development server bound to 127.0.0.1:8080. It has no authentication,
Firebase storage, durable job queue, or production deployment setup. Recognition
may take minutes. Stop it with Ctrl+C. Keep licensed source samples and constructed
audio out of a public repository.
