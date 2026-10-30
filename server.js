// Thêm màn hình đăng nhập / đăng ký vào index.html của Royal Math.
// Cách dùng: đặt file này cạnh index.html rồi chạy:  node patch_index.js
// (script tự sao lưu thành index.html.bak và dừng nếu không tìm thấy chỗ cần sửa)
const fs = require('fs'), path = require('path');
const F = path.join(__dirname, 'index.html');
let s = fs.readFileSync(F, 'utf8');
if (s.includes('id="au"')) { console.log('index.html đã có màn hình đăng nhập, không làm gì thêm.'); process.exit(0); }

function once(str, label) {
  const n = s.split(str).length - 1;
  if (n !== 1) { console.error(`Không sửa được: "${label}" xuất hiện ${n} lần (cần đúng 1). index.html chưa bị thay đổi.`); process.exit(1); }
}
function rep(from, to, label) { once(from, label); s = s.replace(from, () => to); }

// 1) CSS
rep('</style>', `
/* đăng nhập */
#au{position:fixed;inset:0;z-index:300;display:none;align-items:center;justify-content:center;padding:16px;background:radial-gradient(ellipse at top,#4a1030,#07050c)}
#au.on{display:flex}
.aub{width:min(360px,100%);padding:24px 20px;border-radius:20px;text-align:center;background:linear-gradient(#2a0f3a,#12071c);border:1px solid var(--g);box-shadow:0 0 50px #f5c54233}
.aub h2{margin:0 0 6px;font:800 26px Cinzel,serif;letter-spacing:3px;color:var(--g)}
.aub input{display:block;width:100%;margin:10px 0;padding:12px 14px;font:600 16px Inter,sans-serif;color:#fff;background:#1b1030;border:1px solid #f5c54288;border-radius:12px;outline:0}
.aub input:focus{border-color:var(--g);box-shadow:0 0 12px #f5c54255}
#ae{min-height:20px;color:#f87171;font-size:13px}
</style>`, '</style>');

// 2) Nút đăng xuất trên thanh đầu trang
rep('<span class="mode" id="mode">Offline</span>',
  '<span class="mode" id="mode">Offline</span><button class="hb" id="lo" onclick="logout()" title="Đăng xuất" style="display:none">⎋</button>',
  'nhãn Offline');

// 3) Khung đăng nhập
rep('<div id="toast"></div>', `<div id="au"><div class="aub"><h2>ROYAL MATH</h2><p class="mut">Đăng nhập để chơi và lưu xu của bạn</p>
<input id="auu" placeholder="Tên đăng nhập" maxlength="16" autocomplete="username">
<input id="aup" type="password" placeholder="Mật khẩu" maxlength="64" autocomplete="current-password" onkeydown="if(event.key=='Enter')doAuth('login')">
<div id="ae"></div>
<div class="row"><button class="go" onclick="doAuth('login')">Đăng nhập</button><button onclick="doAuth('register')">Đăng ký</button></div></div></div>
<div id="toast"></div>`, 'khung toast');

// 4) Gặp lỗi 401 giữa chừng thì quay lại màn hình đăng nhập
rep('{if(!r.ok)throw j;return j}', '{if(!r.ok){if(r.status==401&&window.authUI)authUI(true);throw j}return j}', 'API.call');

// 5) Thay đoạn khởi động cũ (hỏi tên theo trình duyệt) bằng luồng đăng nhập
const a = s.indexOf("(async()=>{try{const r=await fetch('/api/session'"), z = s.lastIndexOf('</script>');
if (a < 0 || z < a || !s.slice(a, z).includes('Tên hiển thị')) {
  console.error('Không tìm thấy đoạn khởi động cũ ở cuối file. index.html chưa bị thay đổi.'); process.exit(1);
}
s = s.slice(0, a) + `/* ===== ĐĂNG NHẬP ===== */
function authUI(show,err){$('#au').classList.toggle('on',show);$('#ae').textContent=err||'';if(show)setTimeout(()=>$('#auu').focus(),50)}
function enter(j){API.sid=j.sid;try{localStorage.setItem('rm_sid',j.sid)}catch(e){}API.on=1;S.bal=j.bal;S.solved=j.solved;save();
 $('#mode').textContent=j.name+' ✓';$('#mode').classList.add('on');$('#lo').style.display='';authUI(false)}
async function boot(){const sid=API.sid||localStorage.getItem('rm_sid')||'';
 try{const r=await fetch('/api/session',{method:'POST',headers:{'X-Sid':sid}});
  if(r.status==401){API.sid=sid;return authUI(true)}
  if(!r.ok)throw 0;enter(await r.json())}catch(e){/* không có server: chạy offline */}}
async function doAuth(kind){const u=$('#auu').value.trim(),p=$('#aup').value;
 if(!u||!p)return authUI(true,'Nhập đủ tên đăng nhập và mật khẩu');
 try{const r=await fetch('/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json','X-Sid':API.sid||localStorage.getItem('rm_sid')||''},body:JSON.stringify({u,p})});
  const j=await r.json();if(!r.ok)return authUI(true,j.err||'Có lỗi xảy ra');
  API.sid=j.sid;try{localStorage.setItem('rm_sid',j.sid)}catch(e){}$('#aup').value='';boot()}
 catch(e){authUI(true,'Không kết nối được server')}}
function logout(){try{localStorage.removeItem('rm_sid')}catch(e){}API.sid='';location.reload()}
boot();
` + s.slice(z);

fs.copyFileSync(F, F + '.bak');
fs.writeFileSync(F, s);
console.log('Xong! Đã thêm đăng nhập vào index.html (bản gốc lưu ở index.html.bak).');
