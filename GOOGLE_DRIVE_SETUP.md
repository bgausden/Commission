# Google Drive Integration

After a commission run, the system can automatically upload artifacts to the shared **Lissome > HR > Talenox** folder in Google Drive.

## What Gets Uploaded

Six files are uploaded to a per-month subfolder (`{YEAR}/{YYYYMM}/`):

| File | Description |
|------|-------------|
| `Payroll Report *.xlsx` | Input Mindbody payroll report |
| `Talenox Payments {YYYYMM}.xlsx` | Generated payment spreadsheet |
| `commission-{timestamp}.log` | Staff commission calculation log |
| `contractor-{timestamp}.log` | Contractor payment log |
| `commission.debug` | Full debug log |
| `staffHurdle.json` | Staff commission config snapshot |

Example: a March 2026 run creates `2026/202603/` containing all six files.

## Safety

If the month subfolder already exists **and contains files**, the upload is skipped entirely and a warning is logged. This prevents overwriting historical payrolls. The Feb 2026 folder (manually uploaded) is safe.

## First-Time Setup

### Step 1 — Create a Google Cloud project and service account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `lissome-commission`)
3. Enable the **Google Drive API**: APIs & Services → Enable APIs → search "Google Drive API" → Enable
4. Go to **IAM & Admin → Service Accounts** → Create Service Account
   - Name: `commission-uploader` (or similar)
   - Click through to finish — no roles needed at project level
5. Click the service account → **Keys** tab → **Add Key** → JSON
6. Download the JSON key file — store it somewhere safe **outside the repo**, e.g. `~/.secrets/commission-488916-e52ad9d61061.json`

### Step 2 — Add the service account to the Shared Drive

> **Important:** The Talenox folder must be inside a **Shared Drive** (not someone's My Drive). Service accounts have no personal storage quota, so uploads to a My Drive folder will fail with a quota error.

1. Open the key file and copy the `client_email` value (looks like `commission-uploader@lissome-commission.iam.gserviceaccount.com`)
2. In Google Drive, open the **HR** Shared Drive
3. Click the gear icon → **Manage members**
4. Paste the service account email and set the role to **Content Manager**
5. Uncheck "Notify people" and confirm

### Step 3 — Add credentials to `.env`

Open (or create) `.env` in the project root and add:

```
GDRIVE_SERVICE_ACCOUNT_KEY=/Users/barryg/.secrets/commission-488916-e52ad9d61061.json
GDRIVE_TALENOX_FOLDER_ID=1-gRqG1vlvru7c7-Xn9jPfzsJG5almLnC
```

The folder ID is the string after `/folders/` in the Google Drive URL when you have the Talenox folder open.

### Step 4 — Enable the upload flag

In `config/default.json`, set:

```json
"uploadToGDrive": true
```

Set it back to `false` for test runs where you do not want Drive uploads.

## Verifying the Setup

Run against a payroll file for a month that has **not yet been uploaded** to Drive:

```bash
npm run run:tsx
```

After the run completes, check the Talenox folder in Drive — a new `{YEAR}/{YYYYMM}/` subfolder should appear containing all six files.

To test the no-overwrite safety, run the same payroll file a second time. The log should contain:

```
WARN  Google Drive upload skipped: Drive folder 2026/202603 already exists and contains files — skipping upload to avoid overwriting
```

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `GDRIVE_SERVICE_ACCOUNT_KEY is not set` | Missing entry in `.env` |
| `GDRIVE_TALENOX_FOLDER_ID is not set` | Missing entry in `.env` |
| `Failed to authenticate` | Key file path is wrong or file is corrupted |
| `Failed to search for folder` | Service account not added to the Shared Drive |
| `Service Accounts do not have storage quota` | Talenox folder is in My Drive — move it to a Shared Drive |
| Upload skipped with no warning | `uploadToGDrive` is `false` in `config/default.json` |

## Architecture Note

The integration follows a **functional core / imperative shell** pattern:

- **Core** (`buildFolderHierarchy`, `buildArtifactList`) — pure functions, no I/O, fully unit-testable
- **Shell** (`authenticate`, `findFolder`, `uploadFile`, etc.) — all Drive API calls return `Result<T>` instead of throwing, allowing errors to be handled explicitly without try/catch chains
