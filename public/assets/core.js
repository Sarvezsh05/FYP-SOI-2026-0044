/* CloudVault UI core: theme, authentication, navigation and shared helpers. */
// CloudVault frontend. Plain JavaScript, no React/npm/browser framework needed.
// The normal interface does not expose a menu of vulnerabilities.
const $=id=>document.getElementById(id);
// Appearance preference is saved in this browser, not in the CloudVault database.
function setTheme(theme){
 const selected = theme === 'dark' ? 'dark' : 'light';
 document.documentElement.dataset.theme = selected;
 try { localStorage.setItem('cloudvault-theme', selected); } catch (_) {}
 const color = document.querySelector('meta[name="theme-color"]');
 if (color) color.content = selected === 'dark' ? '#171325' : '#fdfcfe';
 for (const btn of document.querySelectorAll('.theme-toggle')) {
   const next = selected === 'dark' ? 'light' : 'dark';
   btn.setAttribute('aria-label', `Switch to ${next} mode`);
   btn.setAttribute('aria-pressed', String(selected === 'dark'));
   btn.title = `Switch to ${next} mode`;
   btn.querySelector('.theme-glyph').textContent = selected === 'dark' ? '☀' : '☾';
   btn.querySelector('.theme-toggle-label').textContent = `${next[0].toUpperCase()+next.slice(1)} mode`;
 }
}
function setPasswordVisible(visible){
 const input=$('authPassword'), button=$('togglePassword');
 input.type = visible ? 'text' : 'password';
 button.setAttribute('aria-pressed', String(visible));
 button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
 button.title = visible ? 'Hide password' : 'Show password';
 button.innerHTML = `<svg class="password-eye" aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${visible ? '<path d="M3 3 21 21"/>' : ''}</svg> ${visible ? 'Hide' : 'Show'}`;
}
const state={me:null,csrf:null,config:null,page:'home',folder:null,search:'',activeFile:null,authMode:'login'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bytes=n=>n>=1024**3?(n/1024**3).toFixed(1)+' GB':n>=1024**2?(n/1024**2).toFixed(1)+' MB':n>=1024?(n/1024).toFixed(1)+' KB':(n||0)+' B';
const date=v=>v?new Date(String(v).includes('T')?v:String(v).replace(' ','T')+'Z').toLocaleDateString('en-SG',{day:'numeric',month:'short',year:'numeric'}):'—';
const initials=s=>String(s||'CV').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const fileClass=name=>/\.pdf$/i.test(name)?'pdf':/\.(png|jpe?g|gif|webp)$/i.test(name)?'image':/\.(docx?|xlsx?|pptx?)$/i.test(name)?'doc':'text';
const fileIcon=name=>/\.(png|jpe?g|gif|webp)$/i.test(name)?'▧':/\.pdf$/i.test(name)?'▤':/\.(docx?|xlsx?|pptx?)$/i.test(name)?'▣':'▧';
let toastHandle;
function toast(message,error=false){const t=$('toast');t.textContent=message;t.classList.remove('hidden');t.classList.toggle('error',error);clearTimeout(toastHandle);toastHandle=setTimeout(()=>t.classList.add('hidden'),4000)}
async function api(method,url,body){
 const opts={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
 if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
 if(state.csrf&&method!=='GET')opts.headers['x-csrf-token']=state.csrf;
 const res=await fetch(url,opts);
 let data;try{data=await res.json()}catch{throw new Error('Server returned an invalid response')}
 if(!res.ok)throw new Error(data.message||`Request failed (${res.status})`);
 return data;
}
const API_SERVER='http://127.0.0.1:8000';
async function apiServer(method,path,body){
 const opts={method,headers:{'Accept':'application/json'}};
 if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
 const res=await fetch(API_SERVER+path,opts);
 let data;try{data=await res.json()}catch{throw new Error('API server returned an invalid response')}
 if(!res.ok)throw new Error(data.message||`API server error (${res.status})`);
 return data;
}
const fileButton=f=>`<button class="file-title file-open" data-id="${f.file_id}">${esc(f.file_name)}</button>`;
const fileRow=f=>`<tr><td><div class="file-name-cell"><span class="file-ico ${fileClass(f.file_name)}">${fileIcon(f.file_name)}</span><span>${fileButton(f)}<small style="display:block;color:#a7b2c5;font-size:10px">${esc(f.owner_name||'My workspace')}</small></span></div></td><td>${esc(f.file_type||'File')}</td><td>${bytes(f.file_size)}</td><td>${date(f.uploaded_at)}</td><td><button class="row-action file-open" data-id="${f.file_id}">Open ↗</button></td></tr>`;
const fileTable=(rows,label='Your files')=>`<div class="content-panel"><div class="table-toolbar"><div><h3>${esc(label)}</h3><div class="table-sub">${rows.length} ${rows.length===1?'file':'files'}</div></div><span class="pill">MY CLOUD SPACE</span></div>${rows.length?`<div style="overflow:auto"><table class="file-table"><thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Added</th><th>Action</th></tr></thead><tbody>${rows.map(fileRow).join('')}</tbody></table></div>`:`<div class="empty-state"><div class="empty-icon">☁</div><h3>No files yet</h3><p>Files you upload or receive will appear here.</p></div>`}</div>`;
function pageHeader(eyebrow,title,subtitle,actions=''){return `<header class="page-header"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="page-header-actions">${actions}</div></header>`}
function displayApp(){
 $('authPage').classList.add('hidden');$('appPage').classList.remove('hidden');
 $('workspaceName').textContent=state.me.full_name;
 // Show the member's real role below their name, instead of a generic 'Personal Drive'.
 $('workspaceRole').textContent=({user:'Regular workspace',premium:'Premium workspace',admin:'Administrator workspace'})[state.me.role]||'Personal workspace';
 $('topName').textContent=state.me.full_name;
 $('topAvatar').textContent=$('workspaceInitials').textContent=initials(state.me.full_name);
 $('topRole').textContent=({user:'Regular account',premium:'Premium account',admin:'Administrator'})[state.me.role];
 $('modePill').textContent=state.config.lab?'PRIVATE LAB':'CLOUD WORKSPACE';
 $('adminNav').classList.toggle('hidden',state.me.role!=='admin');

}
function displayAuth(){
 state.me=null;state.csrf=null;
 $('appPage').classList.add('hidden');$('authPage').classList.remove('hidden');
 setAuthMode('login');
}
function setAuthMode(mode){
 state.authMode=mode;
 const heading={login:['WELCOME TO CLOUDVAULT','Welcome back','Sign in to access your personal workspace.'],register:['LET’S GET STARTED','Create your account','Your personal cloud workspace starts here.'],forgot:['ACCOUNT RECOVERY','Forgot password?','Request a reset code for your account.'],reset:['ACCOUNT RECOVERY','Reset password','Enter the code you received and a new password.']}[mode];
 $('authHeading').innerHTML=`<div class="eyebrow">${heading[0]}</div><h2>${heading[1]}</h2><p>${heading[2]}</p>`;
 $('nameWrap').classList.toggle('hidden',mode!=='register');
 $('usernameWrap').classList.toggle('hidden',mode!=='register');
 $('authIdentityLabel').textContent=mode==='login'?'Email or username':'Email address';
 $('authEmail').type=mode==='login'?'text':'email';
 $('authEmail').placeholder=mode==='login'?'Email or username':'name@example.com';$('passwordWrap').classList.toggle('hidden',mode==='forgot');$('codeWrap').classList.toggle('hidden',mode!=='reset');
 $('authSubmit').innerHTML=({login:'Sign in →',register:'Create account →',forgot:'Request reset code →',reset:'Reset password →'})[mode];
 $('authChange').textContent=mode==='login'?'Create an account':'Back to sign in';
 $('authForgot').classList.toggle('hidden',mode==='forgot'||mode==='reset');

 $('authPassword').required=mode!=='forgot';
 $('authName').required=mode==='register';
 $('authUsername').required=mode==='register';
 $('authCode').required=mode==='reset';
 $('authPassword').autocomplete=mode==='login'?'current-password':'new-password';
 setPasswordVisible(false);
}
async function onAuthSubmit(e){
 e.preventDefault();
 const mode=state.authMode,email=$('authEmail').value.trim(),password=$('authPassword').value,name=$('authName').value.trim(),username=$('authUsername').value.trim(),code=$('authCode').value;
 try{
  if(mode==='forgot'){
    const result=await api('POST','/api/auth/forgot',{email});
    setAuthMode('reset');
    if(result.lab_demo_code){$('authCode').value=result.lab_demo_code;toast('Private lab: dummy recovery code shown in the form.');}
    else toast(result.message);
    return;
  }
  if(mode==='reset'){
    await api('POST','/api/auth/reset',{email,code,password});
    setAuthMode('login');$('authPassword').value='';toast('Password changed. Sign in with your new password.');return;
  }
  const result=await api('POST',mode==='register'?'/api/auth/register':'/api/auth/login',mode==='register'?{full_name:name,username,email,password}:{email,password});
  state.me=result.user;state.csrf=result.csrf;displayApp();await navigate('home');toast('Welcome to CloudVault!');
 }catch(err){toast(err.message,true)}
}
async function navigate(page){
 state.page=page;
 if($('topBreadcrumb')) $('topBreadcrumb').textContent=({home:'Dashboard',files:'My Drive',shared:'Shared with me',recent:'Recent files',activity:'My activity',trash:'Trash',profile:'My settings',admin:'Admin center'})[page]||'Workspace';
 $('sidebar').classList.remove('open');$('sidebarOverlay').classList.add('hidden');
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
 $('pageContent').innerHTML='<div class="empty-state">Loading your workspace...</div>';
 try{
  if(page==='home')await renderHome();
  else if(['files','shared','recent','trash'].includes(page))await renderFiles(page);
  else if(page==='activity')await renderActivity();
  else if(page==='profile')renderProfile();
  else if(page==='admin')await renderAdmin();
 }catch(err){$('pageContent').innerHTML=`<div class="empty-state"><h3>Could not open this page</h3><p>${esc(err.message)}</p><button class="secondary-btn" data-page="home">Back to overview</button></div>`;toast(err.message,true)}
}
async function syncStorage(stats){
 const pct=stats.limit_bytes>0 ? Math.min(100,Math.round(stats.used_bytes/stats.limit_bytes*100)) : 0;
 $('sideUsage').textContent=`${bytes(stats.used_bytes)} / ${bytes(stats.limit_bytes)}`;
 $('sideStorageBar').style.width=pct+'%';
 $('storageLabel').textContent=`${pct}% used · ${bytes(stats.limit_bytes-stats.used_bytes)} free`;
}
function foldersMarkup(folders){
 if(!folders.length)return '<div class="no-folders"><span>✦</span> Your next project starts with a folder. Click “New Folder” to get organized.</div>';
 return `<div class="folder-grid">${folders.slice(0,6).map((folder,i)=>`<button class="folder-card folder-open" data-folder="${folder.folder_id}" data-label="${esc(folder.folder_name)}"><span class="folder-illustration ${i%2?'purple':''}">▰</span><span><strong>${esc(folder.folder_name)}</strong><small>Cloud folder</small></span><span class="dots">•••</span></button>`).join('')}</div>`;
}
