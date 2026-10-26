// stt-push-server.js — local helper: serve dictation pad + push transcript into T3 Code via ⌘V + TTS speak endpoint
// Zero deps (TTS ใช้ edge-tts ที่ติดตั้งผ่าน pip แยกต่างหาก). Run: node stt-push-server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT) || 8917;
const DIR = __dirname;
const DEFAULT_TARGET = 'T3 Code (Nightly)'; // AppleScript app name of the target input app
const PREV_APP_FILE = process.env.DICTATION_PAD_PREV_APP_FILE || '/tmp/dictation-pad-prev-app';

// ผู้เข้าเกี่ยวข้อง: coding agents + GUI chat + terminal apps
const CANDIDATES = [
  'T3 Code (Nightly)', 'T3 Code', 'Kiro', 'Kiro CLI', 'KiroCrew', 'Claude', 'ChatGPT',
  'OpenCode', 'Visual Studio Code', 'Cursor', 'Windsurf', 'Zed', 'Xcode',
  'iTerm', 'Terminal', 'Warp', 'Ghostty'
];

function installedApps() {
  const roots = ['/Applications', '/System/Applications', '/System/Applications/Utilities', path.join(process.env.HOME || '', 'Applications')];
  return CANDIDATES.filter(name =>
    roots.some(root => { try { return fs.existsSync(path.join(root, name + '.app')); } catch { return false; } })
  );
}

function pushText(text, target, sendEnter, cb) {
  const safeTarget = (target || DEFAULT_TARGET).replace(/[^A-Za-z0-9 ()\-_.]/g, '');
  const esc = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  // set frontmost (แม่นกว่า activate) + delay นานพอให้ focus สลับเสร็จก่อน ⌘V
  const lines = [
    '-e', `set the clipboard to "${esc}"`,
    '-e', `tell application "System Events" to set frontmost of process "${safeTarget}" to true`,
    '-e', 'delay 0.7',
    '-e', 'tell application "System Events" to keystroke "v" using {command down}'
  ];
  if (sendEnter) { lines.push('-e', 'delay 0.3', '-e', 'tell application "System Events" to key code 36'); } // ⏎ ส่งเลย
  execFile('osascript', lines, { timeout: 10000 }, cb);
}

// ---------- TTS: Text-to-Speech (edge-tts, ฟรี ไม่มี API key) ----------
const TTS_DEFAULT_VOICE = 'th-TH-PremwadeeNeural'; // หญิง — ผู้ใช้เลือกจากเทส 18 ต.ค. 2026
const TTS_DEFAULT_RATE = '-25%';                   // ช้า 25% — ผู้ใช้ล็อกความเร็วนี้

function findEdgeTts() {
  // launchd PATH สั้น → ต้องหา binary เอง (ปลายทาง: miniconda pip ติดตั้งไว้)
  const home = process.env.HOME || '';
  const candidates = [
    path.join(home, 'miniconda3/bin/edge-tts'),
    path.join(home, 'anaconda3/bin/edge-tts'),
    '/opt/homebrew/bin/edge-tts',
    '/usr/local/bin/edge-tts',
  ];
  for (const p of candidates) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {} }
  return null;
}

function synthesize(text, voice, rate, cb) {
  const bin = findEdgeTts();
  if (!bin) return cb(new Error('ไม่พบ edge-tts — ติดตั้งด้วย: pip3 install edge-tts แล้ว restart server'));
  const out = path.join(os.tmpdir(), `stt-speak-${Date.now()}.mp3`);
  // รูปแบบ --opt=value จำเป็นสำหรับ rate ติดลบ (เช่น -25%) เพราะ argparse ไม่งั้นมองเป็น option
  execFile(bin, [`--voice=${voice}`, `--rate=${rate}`, `--text=${text}`, '--write-media', out],
    { timeout: 120000 }, (err) => (err ? cb(err) : cb(null, out)));
}

function playFile(file, cb) { execFile('/usr/bin/afplay', [file], { timeout: 600000 }, cb); }

// เล่นทีละเสียง (queue) กันเสียงทับกันเมื่อยิงรัว
let speakPending = 0;
let speakQueue = Promise.resolve();
function enqueueSpeak(text, voice, rate) {
  speakPending++;
  const pos = speakPending;
  speakQueue = speakQueue.then(() => new Promise((resolve) => {
    synthesize(text, voice, rate, (err, file) => {
      if (err) { console.error('[speak]', err.message); speakPending--; return resolve(); }
      playFile(file, () => { fs.unlink(file, () => {}); speakPending--; resolve(); });
    });
  }));
  return pos;
}

function readClipboard(cb) { execFile('/usr/bin/pbpaste', [], { timeout: 5000, maxBuffer: 10 * 1024 * 1024 }, (e, out) => cb(e, String(out || ''))); }

// ---------- STT สำรอง: whisper.cpp (engine ในเครื่อง, offline — กันวันที่ engine Google ตาย) ----------
const WHISPER_MODEL = path.join(DIR, 'models', 'ggml-large-v3-turbo-q5_0.bin');
function whisperBin() {
  for (const p of ['/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli']) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch {}
  }
  return null;
}

let lastProbe = null; // ผลวินิจฉัย STT ล่าสุดจาก /probe

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/focus') {
    // หา window ที่ชื่อมีคำว่า Dictation ในทุก Chrome process แล้วดึงขึ้นหน้า (กด hotkey รัวกี่ครั้งก็ได้หน้าต่างเดียว)
    const focusScript = [
      'tell application "System Events"',
      '  repeat with p in (every application process whose name is "Google Chrome")',
      '    tell p',
      '      repeat with w in windows',
      '        if name of w contains "Dictation" then',
      '          set frontmost of p to true',
      '          perform action "AXRaise" of w',
      '          return "focused"',
      '        end if',
      '      end repeat',
      '    end tell',
      '  end repeat',
      'end tell',
      'return "none"'
    ].join('\n');
    execFile('osascript', ['-e', focusScript], { timeout: 5000 }, (err, stdout) => {
      const state = err ? 'error' : String(stdout).trim();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ state }));
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/restore-focus') {
    const reply = (state) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ state }));
    };
    fs.readFile(PREV_APP_FILE, 'utf8', (readErr, name) => {
      const target = String(name || '').trim().replace(/[^A-Za-z0-9 ()\-_.]/g, '');
      if (readErr || !target || target === 'osascript' || target === 'Google Chrome' || target === 'Dictation Pad') return reply('skipped');
      execFile('osascript', ['-e', `tell application "System Events" to set frontmost of process "${target}" to true`], { timeout: 3000 }, (err) => {
        reply(err ? 'error' : 'restored');
      });
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/apps') {
    res.setHeader('Content-Type', 'application/json');
    const apps = installedApps();
    return res.end(JSON.stringify({ apps, default: DEFAULT_TARGET }));
  }
  if (req.method === 'POST' && req.url === '/push') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { text, target, sendEnter } = JSON.parse(body || '{}');
        if (!text || !text.trim()) { res.writeHead(400); return res.end('{"ok":false,"error":"empty text"}'); }
        pushText(text.trim(), target, !!sendEnter, (err) => {
          if (err) {
            const s = String(err);
            let msg;
            if (/not allowed to send keystrokes|assistive access|1002/i.test(s))
              msg = 'ขาดสิทธิ์ Accessibility — ไปที่ System Settings → Privacy & Security → Accessibility กด + แล้วเพิ่ม "T3 Code (Nightly)" (กด ⌘⇧G พิมพ์ path ได้) เปิดสวิตช์ แล้วลอง push ใหม่เลย ไม่ต้อง restart';
            else if (/not authorized|-1743/i.test(s))
              msg = 'ถูกบล็อก Apple Events — อนุญาตใน System Settings → Privacy & Security → Automation';
            else if (/can.?not be found|doesn.?t exist|-1728|-600/i.test(s))
              msg = 'ไม่พบ app ปลายทาง — เช็คชื่อใน dropdown (ต้องเป็นชื่อ app ไม่รวม .app)';
            else
              msg = s.slice(0, 300);
            res.writeHead(500); res.end(JSON.stringify({ ok: false, error: msg }));
          }
          else { res.writeHead(200); res.end(JSON.stringify({ ok: true })); }
        });
      } catch (e) { res.writeHead(400); res.end('{"ok":false,"error":"bad json"}'); }
    });
    return;
  }
  // TTS: POST /speak {text?, voice?, rate?} หรือ GET /speak?text=... — ไม่ส่ง text = อ่านจาก clipboard
  if ((req.method === 'POST' && req.url === '/speak') || (req.method === 'GET' && req.url.startsWith('/speak'))) {
    const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const finish = (text, voice, rate) => {
      text = String(text || '').trim();
      if (!text) return reply(400, { ok: false, error: 'empty text (ไม่ส่ง text = อ่าน clipboard แต่ clipboard ว่าง)' });
      if (text.length > 10000) return reply(400, { ok: false, error: 'text too long (max 10000 chars)' });
      voice = /^[-\w]+$/.test(voice || '') ? voice : TTS_DEFAULT_VOICE;
      rate = /^[+-]\d+%$/.test(rate || '') ? rate : TTS_DEFAULT_RATE;
      const pos = enqueueSpeak(text, voice, rate);
      return reply(200, { ok: true, queued: true, position: pos, voice, rate });
    };
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://127.0.0.1').searchParams;
      if (q.get('text')) return finish(q.get('text'), q.get('voice'), q.get('rate'));
      return readClipboard((e, clip) => finish(e ? '' : clip, q.get('voice'), q.get('rate')));
    }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      try {
        const { text, voice, rate, useClipboard } = JSON.parse(body || '{}');
        if (useClipboard || !text) return readClipboard((e, clip) => finish(e ? '' : clip, voice, rate));
        finish(text, voice, rate);
      } catch { reply(400, { ok: false, error: 'bad json' }); }
    });
    return;
  }
  // Probe วินิจฉัย STT: เปิด /probe → ทดสอบ SR + getUserMedia ในหน้าจริง → POST ผลกลับ → อ่านที่ /probe-result
  if (req.method === 'GET' && req.url === '/probe') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(`<!doctype html><html lang="th"><meta charset="utf-8"><title>STT Probe</title>
<style>body{background:#111;color:#eee;font:16px/1.6 -apple-system,sans-serif;padding:24px}pre{background:#1c1c28;padding:16px;border-radius:8px;white-space:pre-wrap}</style>
<h1>🔍 เทียบ th-TH vs en-US <b style="color:#ffd54f">พูด “ทดสอบ one two three” ใส่ไมค์ตอนนี้!</b></h1><p>ถ้า Chrome ถามสิทธิ์ไมค์ → <b>กด Allow</b> (นี่คือส่วนของการทดสอบ)</p><pre id="out">…</pre>
<script>
const R={};
function report(){document.getElementById('out').textContent=JSON.stringify(R,null,1);
  fetch('/probe-result',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(R)});}
R.url=location.href; R.sr=('webkitSpeechRecognition' in window||'SpeechRecognition' in window)?'YES':'NO';
R.md=navigator.mediaDevices?'YES':'NO'; R.ua=navigator.userAgent; R.t0=Date.now(); report();
function runLang(lang){
  return new Promise(resolve=>{
    try{
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      const r=new SR(); r.lang=lang; r.interimResults=true;
      r.onaudiostart=()=>{R[lang+'_audiostart']=((Date.now()-R.t0)/1000).toFixed(1)+'s';report();};
      r.onspeechstart=()=>{R[lang+'_speechstart']=((Date.now()-R.t0)/1000).toFixed(1)+'s';report();};
      r.onresult=e=>{R[lang+'_text']='🗣 '+Array.from(e.results).map(x=>x[0].transcript).join('');report();};
      r.onerror=e=>{R[lang+'_error']=e.error;report();};
      r.onend=()=>{R[lang+'_end']=((Date.now()-R.t0)/1000).toFixed(1)+'s';report();resolve();};
      setTimeout(()=>{try{r.stop()}catch(e){}},7000);
      r.start();
    }catch(e){R[lang+'_exception']=e.message;resolve();}
  });
}
if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia({audio:true}).then(s=>{
  s.getTracks().forEach(t=>t.stop()); R.mic='GRANTED ✅'; report();
  (async()=>{ await runLang('th-TH'); await runLang('en-US'); R.done='ALL_TESTS_FINISHED'; report(); })();
}).catch(e=>{R.mic='DENIED: '+e.name; report();});
else {R.mic='NO mediaDevices'; report();}
</script></html>`);
  }
  if (req.method === 'POST' && req.url === '/probe-result') {
    let b = ''; req.on('data', c => { b += c; if (b.length > 100_000) req.destroy(); });
    req.on('end', () => { lastProbe = b; console.log('[probe]', b); res.writeHead(200); res.end('{"ok":true}'); });
    return;
  }
  if (req.method === 'GET' && req.url === '/probe-result') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(lastProbe || '{"status":"waiting"}');
  }
  // STT สำรอง: POST /stt?lang=th — body = audio (webm/mp3/wav) → ffmpeg → whisper-cli → {text}
  if (req.method === 'POST' && req.url.startsWith('/stt')) {
    const reply = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const chunks = []; let size = 0;
    req.on('data', (c) => { chunks.push(c); size += c.length; if (size > 50_000_000) req.destroy(); });
    req.on('end', () => {
      const lang = (new URL(req.url, 'http://127.0.0.1').searchParams.get('lang') || 'th').replace(/[^a-z]/gi, '').slice(0, 5) || 'th';
      if (!size) return reply(400, { ok: false, error: 'empty audio' });
      if (!fs.existsSync(WHISPER_MODEL)) return reply(503, { ok: false, error: 'ยังไม่มี model — ดาวน์โหลดไปที่ ~/.stt-dictate/models/ (ggml-large-v3-turbo-q5_0.bin)' });
      const bin = whisperBin();
      if (!bin) return reply(503, { ok: false, error: 'ไม่พบ whisper-cli — ติดตั้ง: brew install whisper-cpp' });
      const id = Date.now();
      const raw = path.join(os.tmpdir(), `stt-raw-${id}.bin`);
      const wav = path.join(os.tmpdir(), `stt-${id}.wav`);
      fs.writeFile(raw, Buffer.concat(chunks), (e) => {
        if (e) return reply(500, { ok: false, error: String(e).slice(0, 200) });
        execFile('/opt/homebrew/bin/ffmpeg', ['-y', '-i', raw, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav], { timeout: 60000 }, (e2) => {
          if (e2) { fs.unlink(raw, () => {}); return reply(500, { ok: false, error: 'ffmpeg: ' + String(e2).slice(0, 200) }); }
          execFile(bin, ['-m', WHISPER_MODEL, '-l', lang, '-np', '-nt', '-f', wav], { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (e3, stdout) => {
            fs.unlink(raw, () => {}); fs.unlink(wav, () => {});
            if (e3) return reply(500, { ok: false, error: 'whisper: ' + String(e3).slice(0, 300) });
            const text = String(stdout).split('\n').map(s => s.trim()).filter(Boolean).join(' ');
            reply(200, { ok: true, text, engine: 'whisper' });
          });
        });
      });
    });
    return;
  }
  // static: serve the pad
  const file = req.url === '/' || req.url.startsWith('/dictation-pad') ? 'dictation-pad.html' : null;
  if (!file) { res.writeHead(404); return res.end('not found'); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  fs.createReadStream(path.join(DIR, file)).on('error', () => { res.writeHead(404); res.end(); }).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => console.log(`stt-push-server on http://127.0.0.1:${PORT} → target: ${DEFAULT_TARGET}`));
