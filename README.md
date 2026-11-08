# Movie Localization Studio

Local-first movie speech-turn review workspace. This first foundation imports video and SRT tracks, supports human speaker confirmation and dubbing metadata, and stores project JSON locally. No cloud AI or media upload is enabled.

## Requirements
- Windows 10/11
- Python 3.10+
- Node.js 20+

## Run

API (PowerShell window 1):

    cd backend
    py -m venv .venv
    .venv\\Scripts\\python.exe -m pip install -r requirements.txt
    .venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

Frontend (PowerShell window 2):

    cd frontend
    npm install
    npm run dev

Open http://127.0.0.1:5173.

Local project JSON is saved under backend/local_data/projects. Uploaded media is stored under backend/local_data/media. Both are excluded from Git. The UI also supports selecting a video directly in the browser for the current session.

Shortcuts: Space play/pause; Enter confirm and advance; J/L seek 3 seconds; 1-9 assign speakers; U set Unknown.

This is an initial foundation and has not yet been tested on the user's PC. Keep backups of source media. A subtitle cue is only an initial review unit; split or merge cues to represent actual speech turns. AI fields are ready for future proposals but AI is not active in V1.
