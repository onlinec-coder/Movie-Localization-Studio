# Movie Localization Studio

A local-first movie localization review workspace. V1 supports human review of subtitle cues/speech turns, speaker identity, and dubbing-direction metadata. It does not use cloud AI and does not upload media to external services.

## Requirements

- Windows 10/11
- Python 3.10+
- Node.js 20+

## Start the app on Windows

Keep the backend running while reviewing. It stores project JSON and imported video files on this computer.

### 1. Start the local API (PowerShell window 1)

    cd backend
    py -m venv .venv
    .venv\Scripts\python.exe -m pip install -r requirements.txt
    .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

### 2. Start the interface (PowerShell window 2)

    cd frontend
    npm install
    npm run dev

Open http://127.0.0.1:5173.

## Local save and resume

- Project data is automatically saved after edits (short debounce) to `backend/local_data/projects/local-project.json`.
- Imported video is copied to `backend/local_data/media/`; the project remembers its local media path.
- On the next launch, the app restores the last saved project, selected review turn, speaker list, subtitle text, annotations, and confirmation states.
- Keep the backend running. If it is stopped, the browser can preview a newly selected video for the current session, but persistent video storage and autosave are unavailable.
- Use **Export backup JSON** periodically as an additional backup.

## Current review features

- Import video, English SRT, and Mongolian SRT.
- View video and listen to its audio while reviewing both subtitle tracks.
- Pause at the end of the active subtitle cue.
- Assign speakers, including Unknown/off-screen.
- Capture role, emotion, delivery, speed, voice characteristics, emphasis, pauses/breaths, and reviewer notes.
- Split and merge review units.
- Confirm turns and track review progress.
- Keyboard shortcuts: Space play/pause; Enter confirm and advance; J/L seek 3 seconds; 1-9 assign speakers; U set Unknown.

## Privacy and data safety

All project JSON and video files are stored locally under `backend/local_data/`. They are excluded from Git. No cloud AI or external media upload is implemented. Do not delete the local_data folder unless you intend to delete your local projects and imported videos.

## Known limitations

- The current queue begins with subtitle cues; it does not yet automatically infer true speech turns. Use split/merge during review.
- AI speaker, emotion, and voice proposals are not implemented yet.
- Test with copies of source media first and keep independent backups.
