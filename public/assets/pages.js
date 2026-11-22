/* CloudVault page views: dashboard, files, personal activity, settings, admin center. */
async function renderHome(){
 const {stats,recent,folders}=await api('GET','/api/dashboard');
 syncStorage(stats);
 const firstName=state.me.full_name.split(' ')[0];
 $('pageContent').innerHTML=`${pageHeader('YOUR WORKSPACE','Overview','Your files and storage, all in one view.',`<button class="outline-btn" data-action="new-folder">＋ New Folder</button><button class="primary-btn" data-action="upload">↑ Upload File</button>`)}
 <!-- One primary action area in the page header. No duplicate folder/upload buttons. -->
 <section class="welcome-hero" aria-label="Workspace overview">
   <div class="hero-copy">
     <span class="pill"><span class="hero-dot"></span> YOUR CLOUD WORKSPACE</span>
     <h2>Welcome back,<br/><em>${esc(firstName)}.</em></h2>
     <p>Your documents, folders and collaborations, neatly organized and ready when you are.</p>
     <div class="hero-actions"><button class="hero-main-action" data-page="files">Explore My Drive <span aria-hidden="true">→</span></button></div>
   </div>
   <div class="hero-visual" aria-hidden="true">
     <div class="hero-halo"></div>
     <div class="workspace-health-card">
       <div class="health-label"><span class="health-icon">▤</span><span>YOUR STORAGE</span></div>
       <strong>${bytes(stats.used_bytes)}</strong>
       <small>of ${bytes(stats.limit_bytes)} used</small>
       <div class="health-track"><div class="health-fill" style="width:${stats.limit_bytes>0?Math.min(100,Math.round(100*stats.used_bytes/stats.limit_bytes)):0}%"></div></div>
       <div class="health-meta"><span>${stats.total_files} files</span><span>${stats.folders} folders</span></div>
     </div>
     <div class="hero-star">✧</div>
   </div>
 </section>
 <div class="stats-grid">
  <div class="stat-card"><div class="stat-top"><span>My Files</span><span class="stat-icon">▤</span></div><div class="stat-value">${stats.total_files}</div><div class="stat-caption">Organized in your workspace</div></div>
  <div class="stat-card"><div class="stat-top"><span>My Folders</span><span class="stat-icon purple">▰</span></div><div class="stat-value">${stats.folders}</div><div class="stat-caption">Spaces for your projects</div></div>
  <div class="stat-card"><div class="stat-top"><span>Storage Used</span><span class="stat-icon green">◴</span></div><div class="stat-value">${bytes(stats.used_bytes)}</div><div class="stat-caption">of ${bytes(stats.limit_bytes)} available</div></div>
  <div class="stat-card"><div class="stat-top"><span>Shared With Me</span><span class="stat-icon orange">♧</span></div><div class="stat-value">${stats.shared_with_me}</div><div class="stat-caption">Files from your teammates</div></div>
 </div><div class="section-header"><h3>My Folders</h3><button data-page="files">View all files →</button></div>${foldersMarkup(folders)}
 <div class="section-header"><h3>Recent files</h3><button data-page="recent">See all recent →</button></div>${fileTable(recent,'Recently added')}`;
}
async function renderFiles(page){
 const scope=page==='files'?'mine':page;
 const data=(await api('GET','/api/files?scope='+encodeURIComponent(scope))).data;
 const labels={files:['MY CLOUD SPACE','My Files','Your whole digital world, beautifully organized.'],shared:['COLLABORATION','Shared With Me','Good work is better together.'],recent:['YOUR ACTIVITY','Recent Files','Pick up right where you left off.'],trash:['RECYCLE BIN','Trash','A second chance for anything you removed.']};
 const [eyebrow,title,subtitle]=labels[page];
 let folderName='';
 const folders=page==='files'?(await api('GET','/api/folders')).data:[];
 if(page==='files'&&state.folder){const folder=folders.find(f=>Number(f.folder_id)===state.folder);if(folder){folderName=folder.folder_name;}else state.folder=null;}
 const filtered=state.folder&&page==='files'?data.filter(f=>Number(f.folder_id)===state.folder):data;
 $('pageContent').innerHTML=`${pageHeader(eyebrow,folderName||title,subtitle,page==='files'?`<button class="outline-btn" data-action="new-folder">＋ New Folder</button><button class="primary-btn" data-action="upload">↑ Upload Files</button>`:'')}
 ${page==='files'?`<div class="section-header"><h3>Your folders</h3>${state.folder?'<div class="folder-menu"><button data-action="all-folders">← All folders</button><button data-action="rename-folder">✎ Rename folder</button><button data-action="delete-folder">Delete folder</button></div>':''}</div>${foldersMarkup(folders)}`:''}
 <div class="section-header"><h3>${page==='files'?'Documents':title}</h3><span class="features-note">${filtered.length} files</span></div>
 <div class="file-controls"><input id="listFilter" placeholder="Filter by filename..." value="${esc(state.search)}" />${page==='files'?`<select id="folderFilter"><option value="">All folders</option>${folders.map(f=>`<option value="${f.folder_id}" ${state.folder===f.folder_id?'selected':''}>${esc(f.folder_name)}</option>`).join('')}</select>`:''}</div>
 <div id="fileListArea">${fileTable(filtered.filter(f=>f.file_name.toLowerCase().includes(state.search.toLowerCase())),title)}</div>`;
 $('listFilter').addEventListener('input',e=>{$('fileListArea').innerHTML=fileTable(filtered.filter(f=>f.file_name.toLowerCase().includes(e.target.value.toLowerCase())),title);state.search=e.target.value;});
 if($('folderFilter'))$('folderFilter').addEventListener('change',e=>{state.folder=e.target.value?Number(e.target.value):null;renderFiles('files')});
}
function renderProfile(){
 $('pageContent').innerHTML=`${pageHeader('PERSONAL SETTINGS','Account settings','Update your account and review your workspace plan.')}
 <div class="profile-grid"><div class="settings-card"><h3>Your profile</h3><div class="settings-avatar">${initials(state.me.full_name)}</div>
 <form id="profileForm"><label class="field"><span>Full name</span><input id="profileName" required value="${esc(state.me.full_name)}"/></label><label class="field"><span>Email address</span><input disabled value="${esc(state.me.email)}"/></label><label class="field"><span>Account role</span><input disabled value="${esc(state.me.role)}"/></label><button class="primary-btn" type="submit">Save changes</button></form><hr/><h3>Change password</h3><form id="passwordForm"><label class="field"><span>Current password</span><input type="password" name="current_password" minlength="8" autocomplete="current-password" required/></label><label class="field"><span>New password</span><input type="password" name="new_password" minlength="8" autocomplete="new-password" required/></label><button class="outline-btn" type="submit">Update password</button></form></div>
 <div class="plan-card"><div class="eyebrow light">YOUR MEMBERSHIP</div><h3>${state.me.role==='premium'?'Premium Cloud Space':state.me.role==='admin'?'Administrator Space':'Personal Cloud Space'}</h3><p>Your workspace has ${bytes(state.me.storage_limit)} storage. Use the My Files area to organize your documents.</p><div class="divider" style="background:#ffffff30"></div><p>CloudVault keeps file management simple. Security monitoring is handled externally through Wazuh — there is no monitoring dashboard here.</p></div></div>`;
 $('profileForm').addEventListener('submit',async e=>{e.preventDefault();try{await api('PATCH','/api/profile',{full_name:$('profileName').value});state.me.full_name=$('profileName').value;displayApp();toast('Profile updated');navigate('profile')}catch(e){toast(e.message,true)}});
 $('passwordForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.target;try{await api('POST','/api/profile/password',{current_password:new FormData(form).get('current_password'),new_password:new FormData(form).get('new_password')});form.reset();toast('Password updated')}catch(error){toast(error.message,true)}});
}
async function renderAdmin(){
 if(state.me.role!=='admin'){navigate('home');return;}
 const users=(await api('GET','/api/admin/users')).data;
 $('pageContent').innerHTML=`${pageHeader('ADMINISTRATION','Admin center','Manage CloudVault accounts and workspace access.')}
 <div class="admin-summary-grid"><div class="admin-summary-card"><span>Total users</span><strong>${users.length}</strong><small>Registered accounts</small></div><div class="admin-summary-card"><span>Regular</span><strong>${users.filter(u=>u.role==='user').length}</strong><small>Personal workspaces</small></div><div class="admin-summary-card"><span>Premium</span><strong>${users.filter(u=>u.role==='premium').length}</strong><small>Expanded storage</small></div><div class="admin-summary-card"><span>Administrators</span><strong>${users.filter(u=>u.role==='admin').length}</strong><small>Account management</small></div></div>
 <div class="content-panel"><div class="table-toolbar"><div><h3>Workspace members</h3><div class="table-sub">${users.length} registered users</div></div><span class="pill">ADMIN ONLY</span></div>${users.map(u=>`<div class="admin-row"><span class="demo-avatar">${initials(u.full_name)}</span><div><strong>${esc(u.full_name)}</strong><small>${u.username?('@'+esc(u.username)+' · '):''}${esc(u.email)} · ${bytes(Number(u.storage_limit))}</small></div><select class="role-select" data-id="${u.user_id}" ${u.user_id===state.me.user_id?'disabled':''}><option value="user" ${u.role==='user'?'selected':''}>Regular</option><option value="premium" ${u.role==='premium'?'selected':''}>Premium</option><option value="admin" ${u.role==='admin'?'selected':''}>Administrator</option></select></div>`).join('')}</div>`;
 document.querySelectorAll('.role-select').forEach(s=>s.addEventListener('change',async e=>{try{await api('POST','/api/admin/role',{user_id:Number(e.target.dataset.id),role:e.target.value});toast('Member role updated');await navigate('admin')}catch(err){toast(err.message,true)}}));
}

// Personal activity is a normal account-history page, NOT a Wazuh monitoring dashboard.
async function renderActivity(){
 const rows=(await api('GET','/api/activity')).data;
 const friendlyType=v=>String(v||'activity').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
 $('pageContent').innerHTML=`${pageHeader('YOUR HISTORY','My activity','Review recent activity on your own CloudVault account.')}
 <div class="content-panel activity-panel"><div class="table-toolbar"><div><h3>Account timeline</h3><div class="table-sub">Recent actions associated with your account</div></div><span class="pill">PRIVATE TO YOU</span></div>
 ${rows.length?`<ol class="activity-timeline">${rows.map(row=>`<li class="activity-event"><span class="activity-event-icon" aria-hidden="true">○</span><div><strong>${esc(friendlyType(row.event_type))}</strong><p>${esc(row.details||'CloudVault activity')}</p><time>${date(row.created_at)} · ${esc(row.status||'recorded')}</time></div></li>`).join('')}</ol>`:`<div class="empty-state"><h3>No recent activity</h3><p>Your account actions will appear here.</p></div>`}</div>`;
}
