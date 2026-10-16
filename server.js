// Royal Math – server chống gian lận (Node 16+, không cần cài thêm gói)
// Chạy:  node server.js   →  mở http://localhost:3000
const http = require('http'), fs = require('fs'), vm = require('vm'), crypto = require('crypto'), path = require('path');
const PORT = process.env.PORT || 3000, DBF = path.join(__dirname, 'data.json'), IDX = path.join(__dirname, 'index.html');
const REW = 2000, QT = 60, MINANS = 2500;

// Máy sinh đề chạy Ở SERVER (lấy từ index.html): đáp án không bao giờ gửi xuống trình duyệt
const src = fs.readFileSync(IDX, 'utf8');
const genQ = vm.runInNewContext('const R=n=>Math.floor(Math.random()*n);const window={};' +
  src.slice(src.indexOf('/*GEN-START*/'), src.indexOf('/*GEN-END*/')) + ';genQ');

let db = { secret: crypto.randomBytes(24).toString('hex'), users: {} };
try { db = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch (e) {}
let dirty = false;
setInterval(() => { if (dirty) { dirty = false; fs.writeFile(DBF, JSON.stringify(db), () => {}); } }, 5000);
const sign = id => crypto.createHmac('sha256', db.secret).update(id).digest('hex').slice(0, 20);
const getUser = h => { const [id, sg] = String(h || '').split('.'); return id && sg && sign(id) === sg ? db.users[id] : null; };

// Trần thưởng (bội số tối đa trên tiền cược) và thời gian tối thiểu của một ván
const MAX = { tx: 2, slot: 100, gacha: 8, bj: 2.5, lh: 9, vp: 250, rl: 36, mn: 1000, hl: 1000, th: 3 };
const MINT = { tx: 2800, slot: 3500, gacha: 6000, rl: 4000, lh: 1500, bj: 800, vp: 800, mn: 600, hl: 500, th: 800 };

function handle(u, p, b, now) {
  const reply = (o = {}) => [200, Object.assign({ bal: u.bal, solved: u.solved }, o)];
  const err = (e, c = 400, x = {}) => [c, Object.assign({ err: e, bal: u.bal }, x)];
  if (u.flags >= 5) return err('Phiên bị khóa do hành vi bất thường', 403);
  u.hits = (u.hits || []).filter(t => now - t < 1000); u.hits.push(now);
  if (u.hits.length > 12) { u.flags += 0.2; return err('Thao tác quá nhanh', 429); }
  switch (p) {
    case 'session': return reply({ sid: u.sid, named: !!u.named });
    case 'name': u.name = String(b.n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 16) || u.name; u.named = 1; return reply();
    case 'lb': {
      const rows = Object.values(db.users).sort((x, y) => y.peak - x.peak).slice(0, 10)
        .map(x => ({ n: x.name, peak: x.peak, solved: x.solved, me: x === u }));
      return reply({ rows });
    }
    case 'q': {
      if (now < u.qlock) return err('Chờ ' + Math.ceil((u.qlock - now) / 1000) + 's', 429, { wait: u.qlock - now });
      const g = genQ(), opts = g.slice(2).map(String), ans = opts[0];
      for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
      const id = crypto.randomBytes(6).toString('hex'); u.pend = { id, ans, opts, t0: now };
      return reply({ id, t: g[0], q: g[1], o: opts });
    }
    case 'a': {
      const q = u.pend; if (!q || q.id !== b.id) return reply({ ok: 0, right: -1 });
      u.pend = null; const el = now - q.t0, right = q.opts.indexOf(q.ans);
      if (b.i === right && el < MINANS) u.flags++;                       // trả lời nhanh bất thường → nghi bot
      const good = b.i === right && el >= MINANS && el <= QT * 1000 + 4000;
      if (good) { u.bal += REW; u.solved++; } else u.qlock = now + (b.i === -1 ? 10000 : 3000);
      u.peak = Math.max(u.peak, u.bal); return reply({ ok: good ? 1 : 0, right });
    }
    case 'bet': {
      const g = String(b.g), a = Math.floor(+b.a);
      if (!MAX[g] || !(a >= 1)) return err('Yêu cầu không hợp lệ');
      if (a > u.bal) { u.flags++; return err('Không đủ xu'); }
      if (now - (u.last[g] || 0) > 600000) u.open[g] = 0;
      u.bal -= a; u.open[g] = (u.open[g] || 0) + a; u.last[g] = now; return reply();
    }
    case 'pay': {
      const g = String(b.g); let a = Math.max(0, Math.floor(+b.a || 0)); if (!MAX[g]) return err('Yêu cầu không hợp lệ');
      const o = u.open[g] || 0, early = now - (u.last[g] || 0) < MINT[g];
      if (a > o * MAX[g]) { u.flags++; a = Math.floor(o * MAX[g]); }     // vượt trần thưởng
      else if (early && a > o) { u.flags++; a = 0; }                      // thắng quá nhanh so với thời lượng ván
      u.open[g] = 0; u.bal += a; u.peak = Math.max(u.peak, u.bal); return reply();
    }
  }
  return err('Không tìm thấy', 404);
}

http.createServer((req, res) => {
  const send = (c, o, t = 'application/json') => { res.writeHead(c, { 'Content-Type': t + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(typeof o === 'string' ? o : JSON.stringify(o)); };
  if (req.method === 'GET') return send(200, fs.readFileSync(IDX, 'utf8'), 'text/html');
  const m = /^\/api\/(\w+)$/.exec(req.url); if (req.method !== 'POST' || !m) return send(404, { err: 'Not found' });
  let body = ''; req.on('data', c => { body += c; if (body.length > 4096) req.destroy(); });
  req.on('end', () => {
    let b = {}; try { b = JSON.parse(body || '{}'); } catch (e) {}
    let u = getUser(req.headers['x-sid']);
    if (!u) {
      if (m[1] !== 'session') return send(401, { err: 'Phiên không hợp lệ' });
      const id = crypto.randomBytes(8).toString('hex');
      u = db.users[id] = { sid: id + '.' + sign(id), name: 'Người chơi #' + id.slice(0, 4), bal: 0, peak: 0, solved: 0, open: {}, last: {}, flags: 0, qlock: 0 };
    }
    const [c, o] = handle(u, m[1], b, Date.now()); dirty = true; send(c, o);
  });
}).listen(PORT, () => console.log('Royal Math chạy tại http://localhost:' + PORT));
