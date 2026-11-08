from __future__ import annotations
import json, re, shutil, uuid
from pathlib import Path
from typing import Any
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'local_data'
PROJECTS = DATA / 'projects'
MEDIA = DATA / 'media'
PROJECTS.mkdir(parents=True, exist_ok=True)
MEDIA.mkdir(parents=True, exist_ok=True)
app = FastAPI(title='Movie Localization Studio API', version='0.2.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://127.0.0.1:5173', 'http://localhost:5173'],
    allow_methods=['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    allow_headers=['*'],
)
app.mount('/media', StaticFiles(directory=MEDIA), name='media')

class ProjectPayload(BaseModel):
    project: dict[str, Any]

def valid_id(value: str) -> str:
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', value):
        raise HTTPException(400, 'Invalid project id')
    return value

@app.get('/api/health')
def health():
    return {'status': 'ok', 'storage': 'local', 'ai_enabled': False}

@app.get('/api/projects')
def list_projects():
    result = []
    for path in PROJECTS.glob('*.json'):
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            result.append({'id': path.stem, 'title': data.get('title', path.stem), 'updatedAt': data.get('updatedAt')})
        except (OSError, json.JSONDecodeError):
            continue
    return {'projects': sorted(result, key=lambda item: item.get('updatedAt') or '', reverse=True)}

@app.get('/api/projects/{project_id}')
def get_project(project_id: str):
    path = PROJECTS / (valid_id(project_id) + '.json')
    if not path.exists():
        raise HTTPException(404, 'Project not found')
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        raise HTTPException(500, 'Saved project JSON is damaged')

@app.put('/api/projects/{project_id}')
def save_project(project_id: str, payload: ProjectPayload):
    pid = valid_id(project_id)
    data = payload.project
    data['id'] = pid
    target = PROJECTS / (pid + '.json')
    temporary = PROJECTS / (pid + '.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(target)
    return {'saved': True, 'id': pid}

@app.post('/api/media')
async def upload_media(file: UploadFile = File(...)):
    suffix = Path(file.filename or '').suffix.lower()
    if suffix not in {'.mp4', '.mkv', '.mov', '.avi', '.webm'}:
        raise HTTPException(400, 'Unsupported video type')
    name = uuid.uuid4().hex + suffix
    target = MEDIA / name
    try:
        with target.open('wb') as output:
            shutil.copyfileobj(file.file, output)
    except OSError:
        target.unlink(missing_ok=True)
        raise HTTPException(507, 'Could not store video on local disk')
    return {'filename': file.filename, 'url': '/media/' + name}
