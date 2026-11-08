import { useEffect, useRef, useState } from 'react';

type AnnotationStatus = 'ai_suggested' | 'confirmed' | 'corrected' | 'not_applicable' | 'needs_review';
type AnnotationKey = 'speaker' | 'role' | 'emotion' | 'delivery' | 'speed' | 'voice' | 'emphasis' | 'pauses';
type FieldState = { aiProposal: string | null; finalValue: string | null; status: AnnotationStatus };
type Turn = {
  id: string; start: number; end: number; en: string; mn: string;
  speaker: string; role: string; emotion: string; delivery: string;
  speed: string; voice: string; emphasis: string; pauses: string;
  notes: string; confirmed: boolean; fieldStates?: Partial<Record<AnnotationKey, FieldState>>;
};
type Speaker = { id: string; name: string };
type Project = {
  id: string; title: string; updatedAt: string; videoUrl: string;
  videoName: string; speakers: Speaker[]; turns: Turn[]; currentTurn: number;
};
const API = 'http://127.0.0.1:8000';
const FIELD_LABELS: Record<AnnotationKey, string> = {
  speaker: 'Яригч / Speaker', role: 'Дүрийн төрөл / Role',
  emotion: 'Сэтгэл хөдлөл / Emotion', delivery: 'Ярианы хэлбэр / Delivery',
  speed: 'Ярих хурд / Speaking speed', voice: 'Дуу хоолойн шинж / Voice characteristics',
  emphasis: 'Онцолж хэлэх үг / Emphasis', pauses: 'Завсарлага, амьсгал / Pauses & breaths',
};
const STATUS_LABELS: Record<AnnotationStatus, string> = {
  ai_suggested: 'AI санал / AI suggested', confirmed: 'Баталгаажсан / Confirmed',
  corrected: 'Засварласан / Corrected', not_applicable: 'Хамаарахгүй / Not applicable',
  needs_review: 'Шалгах шаардлагатай / Needs review',
};
const FIELD_KEYS: AnnotationKey[] = ['speaker','role','emotion','delivery','speed','voice','emphasis','pauses'];
const legacyValue = (turn: Turn, key: AnnotationKey) => String(turn[key] ?? '');
const fieldState = (turn: Turn, key: AnnotationKey): FieldState => {
  const saved = turn.fieldStates?.[key];
  if (saved) return saved;
  const value = legacyValue(turn, key);
  return { aiProposal: null, finalValue: value || null, status: turn.confirmed && value ? 'confirmed' : 'needs_review' };
};
const blankProject = (): Project => ({
  id: 'local-project', title: 'Untitled movie', updatedAt: new Date().toISOString(),
  videoUrl: '', videoName: '', speakers: [], turns: [], currentTurn: 0,
});
const parseTime = (value: string) => {
  const p = value.replace(',', '.').split(':');
  return Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2]);
};
const formatTime = (n: number) => {
  const h = Math.floor(n / 3600), m = Math.floor(n % 3600 / 60);
  const s = Math.floor(n % 60), ms = Math.floor((n % 1) * 1000);
  return [h, m, s].map(x => String(x).padStart(2, '0')).join(':') + ',' + String(ms).padStart(3, '0');
};
function parseSrt(raw: string) {
  return raw.replace(/\r/g, '').trim().split(/\n\s*\n/).flatMap((block, i) => {
    const lines = block.split('\n').map(x => x.trim());
    const ix = lines.findIndex(x => x.includes('-->'));
    if (ix < 0) return [];
    const parts = lines[ix].split('-->');
    return [{
      id: String(i + 1), start: parseTime(parts[0].trim()),
      end: parseTime(parts[1].trim().split(' ')[0]),
      text: lines.slice(ix + 1).join('\n').replace(/<[^>]+>/g, ''),
    }];
  });
}
export default function App() {
  const [project, setProject] = useState<Project>(blankProject);
  const [active, setActive] = useState(0);
  const [videoSrc, setVideoSrc] = useState('');
  const [status, setStatus] = useState('Connecting to local project storage…');
  const [apiReady, setApiReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [subtitleMode, setSubtitleMode] = useState<'off' | 'en' | 'mn' | 'both'>('both');
  const videoRef = useRef<HTMLVideoElement>(null);
  const current = project.turns[active];
  const confirmed = project.turns.filter(t => FIELD_KEYS.every(k => ['confirmed','corrected','not_applicable'].includes(fieldState(t,k).status))).length;

  const update = (patch: Partial<Project>) => setProject(p => ({
    ...p, ...patch, updatedAt: new Date().toISOString(),
  }));
  const patchTurn = (patch: Partial<Turn>) => setProject(p => ({
    ...p, updatedAt: new Date().toISOString(),
    turns: p.turns.map((t, i) => i === active ? { ...t, ...patch } : t),
  }));
  const setFieldStatus = (key: AnnotationKey, status: AnnotationStatus) => {
    if (!current) return;
    const previous = fieldState(current, key);
    const nextState: FieldState = { ...previous, status, finalValue: status === 'not_applicable' ? null : previous.finalValue };
    patchTurn({ fieldStates: { ...current.fieldStates, [key]: nextState }, confirmed: false });
  };
  const setFieldValue = (key: AnnotationKey, value: string) => {
    if (!current) return;
    const previous = fieldState(current, key);
    const status: AnnotationStatus = previous.aiProposal !== null && value !== previous.aiProposal ? 'corrected' : 'needs_review';
    patchTurn({ [key]: value, fieldStates: { ...current.fieldStates, [key]: { ...previous, finalValue: value || null, status } }, confirmed: false } as Partial<Turn>);
  };
  const seekTurn = (index: number) => {
    if (index < 0 || index >= project.turns.length) return;
    setActive(index);
    setProject(p => ({ ...p, currentTurn: index }));
    const v = videoRef.current;
    if (v) { v.currentTime = project.turns[index].start; v.pause(); setPlaying(false); }
  };

  // Restore the last saved project automatically when the local API starts.
  useEffect(() => {
    let alive = true;
    fetch(API + '/api/health').then(r => {
      if (!r.ok) throw new Error('API unavailable');
      return r.json();
    }).then(() => {
      if (!alive) return;
      setApiReady(true);
      return fetch(API + '/api/projects/local-project');
    }).then(r => {
      if (!r || !r.ok) return null;
      return r.json();
    }).then(saved => {
      if (!alive) return;
      if (saved) {
        const restored: Project = { ...blankProject(), ...saved };
        setProject(restored);
        setActive(Math.min(restored.currentTurn || 0, Math.max(0, restored.turns.length - 1)));
        setVideoSrc(restored.videoUrl ? API + restored.videoUrl : '');
        setStatus('Previous project restored from this computer');
      } else {
        setStatus('Local storage ready — import your movie and subtitles');
      }
      setLoaded(true);
    }).catch(() => {
      if (!alive) return;
      setStatus('Local API is not running — start it to enable autosave and resume');
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Debounced autosave: subtitle edits, speaker decisions and annotations are saved together.
  useEffect(() => {
    if (!loaded || !apiReady) return;
    const timer = window.setTimeout(async () => {
      const snapshot = { ...project, currentTurn: active, updatedAt: new Date().toISOString() };
      try {
        const response = await fetch(API + '/api/projects/local-project', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: snapshot }),
        });
        if (!response.ok) throw new Error('Save failed');
        setStatus('Autosaved locally · ' + new Date().toLocaleTimeString());
      } catch {
        setStatus('Autosave failed — check that the local API is running');
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [project, active, loaded, apiReady]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !current) return;
    const stopAtTurnEnd = () => {
      if (v.currentTime >= current.end) { v.pause(); setPlaying(false); }
    };
    v.addEventListener('timeupdate', stopAtTurnEnd);
    return () => v.removeEventListener('timeupdate', stopAtTurnEnd);
  }, [current]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v || !current) return;
    if (v.paused) {
      if (v.currentTime < current.start || v.currentTime >= current.end) v.currentTime = current.start;
      void v.play();
    } else v.pause();
  };
  const seek = (delta: number) => {
    const v = videoRef.current;
    if (v && current) v.currentTime = Math.min(current.end, Math.max(current.start, v.currentTime + delta));
  };
  const confirmNext = () => {
    if (!current) return;
    const complete = FIELD_KEYS.every(k => ['confirmed','corrected','not_applicable'].includes(fieldState(current,k).status));
    if (!complete) { setStatus('Бүх талбарыг баталгаажуулах эсвэл хамаарахгүй гэж тэмдэглэнэ үү / Complete each field first'); return; }
    patchTurn({ confirmed: true });
    if (active < project.turns.length - 1) seekTurn(active + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.key === 'Enter' && current) { e.preventDefault(); confirmNext(); }
      if (e.key.toLowerCase() === 'j') seek(-3);
      if (e.key.toLowerCase() === 'l') seek(3);
      if (e.key.toLowerCase() === 'u' && current) patchTurn({ speaker: 'unknown' });
      if (/^[1-9]$/.test(e.key) && project.speakers[Number(e.key) - 1])
        patchTurn({ speaker: project.speakers[Number(e.key) - 1].id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const importVideo = async (file?: File) => {
    if (!file) return;
    setStatus('Copying video into local project storage…');
    if (!apiReady) {
      const localUrl = URL.createObjectURL(file);
      setVideoSrc(localUrl);
      update({ videoUrl: '', videoName: file.name, title: project.title === 'Untitled movie' ? file.name.replace(/\.[^.]+$/, '') : project.title });
      setStatus('Video opened for this session only — start the API to preserve it after restart');
      return;
    }
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(API + '/api/media', { method: 'POST', body: form });
      if (!response.ok) throw new Error('Video upload to local storage failed');
      const result = await response.json();
      const path = result.url as string;
      setVideoSrc(API + path);
      update({
        videoUrl: path, videoName: file.name,
        title: project.title === 'Untitled movie' ? file.name.replace(/\.[^.]+$/, '') : project.title,
      });
      setStatus('Video copied to local media folder');
    } catch {
      setStatus('Could not copy video — check local API and disk space');
    }
  };

  const importSrt = async (file: File | undefined, language: 'en' | 'mn') => {
    if (!file) return;
    const cues = parseSrt(await file.text());
    if (!cues.length) { setStatus('No valid SRT cues found'); return; }
    setProject(p => {
      const old = p.turns;
      const next = cues.map(c => {
        const match = old.find(t => Math.abs(t.start - c.start) < 0.8);
        return {
          id: c.id, start: c.start, end: c.end,
          en: language === 'en' ? c.text : match?.en || '',
          mn: language === 'mn' ? c.text : match?.mn || '',
          speaker: match?.speaker || '', role: match?.role || 'dialogue',
          emotion: match?.emotion || '', delivery: match?.delivery || '',
          speed: match?.speed || 'normal', voice: match?.voice || '',
          emphasis: match?.emphasis || '', pauses: match?.pauses || '',
          notes: match?.notes || '', confirmed: match?.confirmed || false,
        } as Turn;
      });
      return { ...p, turns: next, currentTurn: 0, updatedAt: new Date().toISOString() };
    });
    setActive(0);
    setStatus('Imported ' + cues.length + ' ' + language.toUpperCase() + ' subtitle cues');
  };

  const addSpeaker = () => {
    const n = project.speakers.length + 1;
    update({ speakers: [...project.speakers, { id: 'C' + String(n).padStart(3, '0'), name: 'Speaker ' + n }] });
  };
  const splitTurn = () => {
    if (!current) return;
    const mid = (current.start + current.end) / 2;
    const parts = project.turns.flatMap((t, i) => i === active
      ? [{ ...t, end: mid, confirmed: false }, { ...t, id: t.id + '-b', start: mid, confirmed: false }]
      : [t]);
    update({ turns: parts });
  };
  const mergeNext = () => {
    const next = project.turns[active + 1];
    if (!current || !next) return;
    const merged = project.turns.filter((_, i) => i !== active + 1).map((t, i) => i === active
      ? { ...t, end: next.end, en: [t.en, next.en].filter(Boolean).join(' '), mn: [t.mn, next.mn].filter(Boolean).join(' '), confirmed: false }
      : t);
    update({ turns: merged });
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ ...project, currentTurn: active }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'localization-project.json'; a.click();
    URL.revokeObjectURL(url);
  };

  return <div className="app">
    <header><div><b>🎬 Movie Localization Studio</b><small>ДОТООД ШАЛГАЛТЫН ОРЧИН / LOCAL REVIEW WORKSPACE</small></div>
      <span className="privacy">● ЗӨВХӨН ДОТООД / LOCAL ONLY</span><button onClick={exportJson}>Нөөц JSON татах / Export backup</button>
    </header>
    <main>
      <aside><h3>ТӨСӨЛ / PROJECT</h3>
        <input value={project.title} onChange={e => update({ title: e.target.value })} />
        <p>{project.turns.length} ярианы хэсэг / turns · {confirmed} бүрэн баталгаажсан / complete</p>
        <h3>ЯРИГЧИД / SPEAKERS <button onClick={addSpeaker}>＋</button></h3>
        {project.speakers.map((s, i) => <button className="speaker" key={s.id} onClick={() => patchTurn({ speaker: s.id })}>{s.name} <kbd>{i + 1}</kbd></button>)}
        <button className="speaker" onClick={() => patchTurn({ speaker: 'unknown' })}>Unknown / off-screen <kbd>U</kbd></button>
        <h3>ФАЙЛ ОРУУЛАХ / IMPORT</h3>
        <label className="file">Видео / Video (дотоодод хадгална)<input type="file" accept="video/*" onChange={e => void importVideo(e.target.files?.[0])} /></label>
        <label className="file">Англи хадмал / English SRT<input type="file" accept=".srt" onChange={e => e.target.files?.[0] && void importSrt(e.target.files[0], 'en')} /></label>
        <label className="file">Монгол хадмал / Mongolian SRT<input type="file" accept=".srt" onChange={e => e.target.files?.[0] && void importSrt(e.target.files[0], 'mn')} /></label>
        <p className="muted">{project.videoName}</p>
      </aside>
      <section className="center">
        <div className="video">{videoSrc
          ? <video ref={videoRef} src={videoSrc} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
          : <div className="placeholder">Видео оруулж дүрс, дууг хамт шалгана уу / Import a movie to review video and sound</div>}
          {current && subtitleMode !== 'off' && <div className="subtitle-overlay">
            {(subtitleMode === 'en' || subtitleMode === 'both') && current.en && <p lang="en">{current.en}</p>}
            {(subtitleMode === 'mn' || subtitleMode === 'both') && current.mn && <p lang="mn">{current.mn}</p>}
          </div>}
        </div>
        <div className="controls"><button onClick={() => seek(-3)}>−3s</button><button className="primary" onClick={togglePlay}>{playing ? 'Зогсоох / Pause' : 'Тоглуулах / Play'}</button><button onClick={() => seek(3)}>+3s</button>
          <label className="subtitle-choice">Хадмал
            <select value={subtitleMode} onChange={e => setSubtitleMode(e.target.value as 'off' | 'en' | 'mn' | 'both')}>
              <option value="off">Унтраах</option><option value="en">English</option><option value="mn">Монгол</option><option value="both">Хоёуланг нь</option>
            </select>
          </label><span>J / L: шилжих · Space: тоглуулах/зогсоох</span></div>
        <div className="subtitles"><small>ЯРИАНЫ ХЭСЭГ / TURN {project.turns.length ? active + 1 + ' / ' + project.turns.length : '—'}</small><p>{current?.en || 'Англи хадмал / English subtitle'}</p><strong>{current?.mn || 'Монгол хадмал'}</strong></div>
        <div className="nav"><button disabled={!active} onClick={() => seekTurn(active - 1)}>← Өмнөх / Previous</button><button disabled={active >= project.turns.length - 1} onClick={() => seekTurn(active + 1)}>Дараах / Next →</button></div>
      </section>
      <aside className="inspector"><h3>ЯРИАНЫ ТЭМДЭГЛЭЛ / TURN ANNOTATION</h3>
        {current ? <>
          {FIELD_KEYS.map(key => {
            const state = fieldState(current, key);
            const options: Record<string, string[]> = {
              role: ['dialogue','narration','inner_monologue','voice_over','unknown'],
              emotion: ['neutral','happy','sad','angry','afraid','surprised','disgusted','confused','curious','sarcastic'],
              delivery: ['normal','whispering','shouting','crying','laughing','singing','strained','breathy','hesitant'],
              speed: ['very_slow','slow','normal','fast','very_fast'],
            };
            return <div className="field-review" key={key}>
              <label>{FIELD_LABELS[key]}
                {key === 'speaker' ? <select value={current.speaker} onChange={e => setFieldValue(key,e.target.value)}><option value="">Сонгох / Select…</option>{project.speakers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id})</option>)}<option value="unknown">Тодорхойгүй / Unknown</option></select>
                : options[key] ? <select value={legacyValue(current,key)} onChange={e => setFieldValue(key,e.target.value)}><option value="">Сонгох / Select…</option>{options[key].map(x => <option key={x} value={x}>{x}</option>)}</select>
                : <input value={legacyValue(current,key)} onChange={e => setFieldValue(key,e.target.value)} placeholder="Утга оруулах / Enter value" />}
              </label>
              <small className="ai-proposal">AI санал / AI proposal: {state.aiProposal ?? 'Одоогоор санал байхгүй / No proposal yet'}</small>
              <div className="field-status">
                <span className={`status-${state.status}`}>{STATUS_LABELS[state.status]}</span>
                <button onClick={() => setFieldStatus(key,'confirmed')}>Зөвшөөрөх / Confirm</button>
                <button onClick={() => setFieldStatus(key,'not_applicable')}>Хамаарахгүй / N/A</button>
                <button onClick={() => setFieldStatus(key,'needs_review')}>Шалгах / Review</button>
              </div>
            </div>;
          })}
          <label>Тайлбар / Reviewer notes<input value={current.notes} onChange={e => patchTurn({ notes: e.target.value })} /></label>
          <div className="actions"><button onClick={splitTurn}>Хуваах / Split</button><button onClick={mergeNext} disabled={active >= project.turns.length - 1}>Нэгтгэх / Merge</button></div>
          <button className="confirm" onClick={confirmNext}>✓ Баталгаажуулаад дараах / Confirm & next <kbd>Enter</kbd></button>
          <small>{current.confirmed ? 'Хүний баталгаажуулалт бүрэн / Fully human-confirmed' : 'Талбаруудыг тус тусад нь баталгаажуулна / Confirm fields individually'}</small>
        </> : <p>Эхлэхийн тулд SRT файл оруулна уу / Import SRT files to start.</p>}
      </aside>
    </main>
    <footer><span>● {status}</span><span>{apiReady ? 'Дотоод автоматаар хадгалалт идэвхтэй · Cloud upload байхгүй' : 'Дотоод API холбогдоогүй · Cloud upload байхгүй'}</span></footer>
  </div>;
}
