/* CloudVault actions: file details, sharing, dialogs, uploads and event wiring. */
function closeDrawer(){
 $('fileDrawer').classList.add('hidden');$('drawerBackdrop').classList.add('hidden');state.activeFile=null;
 const loc=new URL(window.location.href);loc.searchParams.delete('file');history.replaceState({},'',loc.pathname+loc.search);
}
async function openFile(id){
 try{
  const d=await api('GET','/api/files/'+id),f=d.file;
  state.activeFile=f;
  $('fileDrawer').classList.remove('hidden');$('drawerBackdrop').classList.remove('hidden');
  $('drawerTitle').textContent=f.file_name;
  const loc=new URL(window.location.href);loc.searchParams.set('file',id);history.replaceState({},'',loc.pathname+loc.search);
  const own=Number(f.user_id)===Number(state.me.user_id),canEdit=own||f.share_permission==='edit',canComment=!f.is_trashed;
  $('drawerBody').innerHTML=`<div class="preview-box">${fileIcon(f.file_name)}<small>${esc(f.file_type||'Cloud file')} · ${bytes(f.file_size)}</small></div>
   <div class="drawer-actions"><button class="primary-btn small-btn" data-file-action="download">↓ Download</button><button class="secondary-btn small-btn" data-file-action="preview">◉ Preview</button>${own?'<button class="outline-btn small-btn" data-file-action="share">♧ Manage sharing</button>':''}</div>
   ${canEdit?`<div class="drawer-actions"><button class="outline-btn small-btn" data-file-action="rename">✎ Rename</button><button class="outline-btn small-btn" data-file-action="edit-description">✎ Description</button>${own?'<button class="outline-btn small-btn" data-file-action="move">⇄ Move</button>':''}${own?`<button class="outline-btn small-btn" data-file-action="trash">${f.is_trashed?'↶ Restore':'♲ Move to trash'}</button>`:''}${own&&f.is_trashed?'<button class="outline-btn small-btn danger-outline" data-file-action="permanent">✕ Delete forever</button>':''}</div>`:''}
   <h3 style="font-size:14px">File information</h3><dl class="details-list"><dt>Owner</dt><dd>${esc(f.owner_name||'Me')}</dd><dt>Size</dt><dd>${bytes(f.file_size)}</dd><dt>Type</dt><dd>${esc(f.file_type||'File')}</dd><dt>Uploaded</dt><dd>${date(f.uploaded_at)}</dd><dt>Description</dt><dd>${esc(f.description||'No description')}</dd></dl>
   <div class="comments-area"><h4>Comments</h4><div id="commentsList">Loading comments...</div>${canComment?'<div class="comment-controls"><textarea id="commentInput" placeholder="Write a comment..."></textarea><button class="primary-btn small-btn" id="addComment">Post</button></div>':''}</div>`;
  if(canComment)$('addComment').onclick=()=>addComment(id);
  await loadComments(id);
 }catch(err){toast(err.message,true)}
}
async function loadComments(fileId){
 const rows=(await api('GET',`/api/files/${fileId}/comments`)).data;
 $('commentsList').innerHTML=rows.length?rows.map(c=>`<div class="comment"><div class="comment-top"><strong>${esc(c.author)}</strong><small>${date(c.created_at)}</small></div><div class="comment-body">${state.config.lab?c.comment_text:esc(c.comment_text)}</div></div>`).join(''):'<div class="empty-small">No comments yet. Start the conversation.</div>';
 // IMPORTANT: lab mode intentionally renders stored comment text as HTML (stored XSS).
 // Normal mode escapes it. This app is designed only for a private dummy-data lab.
}
async function addComment(fid){const text=$('commentInput').value.trim();if(!text)return;try{await api('POST',`/api/files/${fid}/comments`,{comment_text:text});$('commentInput').value='';await loadComments(fid);toast('Comment posted')}catch(err){toast(err.message,true)}}
function closeModal(){ $('modalBackdrop').classList.add('hidden');$('modalBody').innerHTML='' }
function modal(title,html,onSubmit){
 $('modalTitle').textContent=title;
 $('modalBody').innerHTML=`<form id="modalForm">${html}<div class="modal-actions"><button type="button" class="outline-btn" id="modalCancel">Cancel</button><button type="submit" class="primary-btn">Save changes →</button></div></form>`;
 $('modalBackdrop').classList.remove('hidden');$('modalCancel').onclick=closeModal;
 $('modalForm').onsubmit=async e=>{e.preventDefault();try{await onSubmit(e.target);closeModal();toast('Saved successfully');if(state.activeFile){const id=state.activeFile.file_id;await openFile(id)}await navigate(state.page)}catch(err){toast(err.message,true)}};
}
function openNewFolder(){modal('Create a new folder','<label>Folder name<input name="folder_name" placeholder="e.g. My Assignments" maxlength="100" required/></label>',f=>api('POST','/api/folders',{folder_name:f.folder_name.value}));}
async function openShare(file){
 // Owners can give view/edit access and remove old recipients here.
 const rows=(await api('GET',`/api/files/${file.file_id}/share`)).data;
 const recipients=rows.length?rows.map(s=>`<div class="share-recipient"><span>${esc(s.recipient?.email||'Unknown user')} (${esc(s.permission)})</span><button type="button" class="revoke-access" data-email="${esc(s.recipient?.email||'')}">Remove</button></div>`).join(''):'<p class="hint">Only you can currently access this file.</p>';
 modal('Manage file sharing',`<p class="hint">Share <strong>${esc(file.file_name)}</strong> with another registered user.</p><label>Recipient email<input name="email" type="email" placeholder="recipient@example.com" required/></label><label>Permission<select name="permission"><option value="view">Can view</option><option value="edit">Can edit metadata and comments</option></select></label><h4>People with access</h4><div id="sharingList">${recipients}</div>`,f=>api('POST',`/api/files/${file.file_id}/share`,{email:f.email.value,permission:f.permission.value}));
 document.querySelectorAll('.revoke-access').forEach(b=>b.onclick=async()=>{
   if(!confirm('Remove this person’s access to the file?'))return;
   try{await api('DELETE',`/api/files/${file.file_id}/share`,{email:b.dataset.email});closeModal();toast('Access removed');await openFile(file.file_id)}catch(err){toast(err.message,true)}
 });
}
async function moveFile(file){
 const folders=(await api('GET','/api/folders')).data;
 modal('Move file',`<label>Choose folder<select name="folder"><option value="">My Drive (no folder)</option>${folders.map(f=>`<option value="${f.folder_id}" ${Number(file.folder_id)===Number(f.folder_id)?'selected':''}>${esc(f.folder_name)}</option>`).join('')}</select></label>`,f=>api('PATCH',`/api/files/${file.file_id}`,{folder_id:f.folder.value?Number(f.folder.value):null}));
}
function renameFolder(){
 const id=state.folder;if(!id)return;
 modal('Rename folder','<label>New folder name<input name="folder_name" maxlength="100" required/></label>',f=>api('PATCH',`/api/folders/${id}`,{folder_name:f.folder_name.value}));
}
async function deleteFolder(){
 const id=state.folder;if(!id)return;
 if(!confirm('Delete this folder? Your files will remain in My Drive.'))return;
 try{await api('DELETE',`/api/folders/${id}`);state.folder=null;await navigate('files');toast('Folder deleted; files moved to My Drive')}catch(err){toast(err.message,true)}
}
function openRename(file){modal('Rename file',`<label>New filename<input name="file_name" maxlength="180" value="${esc(file.file_name)}" required/></label>`,f=>api('PATCH',`/api/files/${file.file_id}`,{file_name:f.file_name.value}));}
function openDescription(file){modal('Edit description',`<label>Description<textarea name="description" rows="4">${esc(file.description||'')}</textarea></label>`,f=>api('PATCH',`/api/files/${file.file_id}`,{description:f.description.value}));}
async function fileAction(action){
 const f=state.activeFile;if(!f)return;
 if(action==='download'||action==='preview'){window.open(`/api/files/${f.file_id}/${action}`, '_blank','noopener');return;}
 if(action==='share')return openShare(f);
 if(action==='rename')return openRename(f);
 if(action==='edit-description')return openDescription(f);
 if(action==='move')return moveFile(f);
 if(action==='permanent'){
   if(!confirm('Permanently delete this file? This removes its stored bytes and cannot be undone.'))return;
   try{await api('DELETE',`/api/files/${f.file_id}`);closeDrawer();await navigate('trash');toast('File permanently deleted')}catch(err){toast(err.message,true)}
   return;
 }
 if(action==='trash'){
  try{await api('PATCH',`/api/files/${f.file_id}`,{is_trashed:!f.is_trashed});closeDrawer();await navigate(state.page);toast(f.is_trashed?'File restored':'File moved to trash')}catch(e){toast(e.message,true)}
 }
}
async function uploadFiles(input){
 const files=[...input.files];
 for(const file of files){
  if(file.size>10*1024*1024){toast(`${file.name} is larger than 10 MB`,true);continue;}
  const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file)});
  try{toast(`Uploading ${file.name}...`);await api('POST','/api/files/upload',{file_name:file.name,file_type:file.type||'application/octet-stream',base64,folder_id:state.folder});toast(`${file.name} uploaded`);}catch(err){toast(err.message,true)}
 }
 input.value='';await navigate(state.page);
}
async function init(){
 try{state.config=await api('GET','/api/config')}catch(e){toast('CloudVault server not available',true);return;}
 apiServer('GET','/api/health').then(()=>console.log('Connected to CloudVault API server on port 8000')).catch(()=>toast('Backend API server (port 8000) is offline',true));
 try{const response=await api('GET','/api/me');state.me=response.user;state.csrf=response.csrf;displayApp();await navigate('home');const id=new URL(location.href).searchParams.get('file');if(id)openFile(id)}
 catch{displayAuth()}
 $('authForm').addEventListener('submit',onAuthSubmit);
 $('authChange').addEventListener('click',()=>setAuthMode(state.authMode==='login'?'register':'login'));
 $('authForgot').addEventListener('click',()=>setAuthMode('forgot'));
 $('togglePassword').addEventListener('click',()=>setPasswordVisible($('authPassword').type==='password'));
 document.querySelectorAll('.theme-toggle').forEach(button=>button.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark')));
 setTheme(document.documentElement.dataset.theme);

 $('filePicker').onchange=e=>uploadFiles(e.target);
 $('drawerBackdrop').onclick=closeDrawer;$('drawerClose').onclick=closeDrawer;
 $('modalBackdrop').onclick=e=>{if(e.target===$('modalBackdrop'))closeModal()};$('modalClose').onclick=closeModal;
 $('refreshApp').onclick=()=>navigate(state.page);
 $('globalSearch').addEventListener('keydown',async e=>{if(e.key==='Enter'){e.preventDefault();const q=e.target.value.trim();state.page='files';state.folder=null;state.search='';document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page==='files'));$('pageContent').innerHTML=pageHeader('SEARCH RESULTS','Results for “'+q+'”','Matching files in your cloud workspace.');try{const results=await apiServer('GET','/api/files?search='+encodeURIComponent(q));$('pageContent').innerHTML+=fileTable(results.data||[],`Search results (${(results.data||[]).length})`)}catch(err){toast(err.message,true)}}});
 function setAccountMenu(open){
  $('userDropdown').classList.toggle('hidden',!open);
  $('userMenu').setAttribute('aria-expanded', String(open));
 }
 $('userMenu').onclick=()=>setAccountMenu($('userDropdown').classList.contains('hidden'));
 document.addEventListener('click',e=>{
  if(!$('userMenu').contains(e.target)&&!$('userDropdown').contains(e.target))setAccountMenu(false);
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')setAccountMenu(false)});
 $('mobileMenu').onclick=()=>{$('sidebar').classList.add('open');$('sidebarOverlay').classList.remove('hidden')};
 $('mobileClose').onclick=$('sidebarOverlay').onclick=()=>{$('sidebar').classList.remove('open');$('sidebarOverlay').classList.add('hidden')};
 $('signOutButton').onclick=async()=>{await api('POST','/api/auth/logout').catch(()=>{});setAccountMenu(false);displayAuth()};
 document.body.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-page]');if(nav){state.folder=null;state.search='';setAccountMenu(false);navigate(nav.dataset.page);return;}
  const open=e.target.closest('.file-open');if(open){await openFile(Number(open.dataset.id));return;}
  const folder=e.target.closest('.folder-open');if(folder){state.folder=Number(folder.dataset.folder);state.search='';navigate('files');return;}
  const action=e.target.closest('[data-action]');if(action){if(action.dataset.action==='upload')$('filePicker').click();if(action.dataset.action==='new-folder')openNewFolder();if(action.dataset.action==='rename-folder')renameFolder();if(action.dataset.action==='delete-folder')deleteFolder();if(action.dataset.action==='all-folders'){state.folder=null;navigate('files')}return;}
  const fa=e.target.closest('[data-file-action]');if(fa)fileAction(fa.dataset.fileAction);
 });
}
init();
