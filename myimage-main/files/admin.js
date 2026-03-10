window.alert = function(msg) {
    if (msg === "Failed to fetch" || msg === "NetworkError when attempting to fetch resource.") {
        msg = "网络连接失败，请检查网络或后端域名配置";
    }
    const toast = document.createElement('div');
    toast.innerText = msg;
    let bgColor = msg.includes("成功") ? "#67c23a" : "#f56c6c"; 
    toast.style.cssText = `position:fixed; top:30px; left:50%; transform:translateX(-50%); background:${bgColor}; color:#fff; padding:10px 20px; border-radius:4px; z-index:999999; transition:opacity 0.3s; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); text-align:center; max-width: 80%; word-break: break-all;`;
    document.body.appendChild(toast);
    // 2.5秒后自动淡出并移除
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
};
const apiBaseUrl = "";
let adminAllImages = [];
let adminFilteredImages = [];
let adminCurrentPage = 1;
let adminPageSize = 16; // 默认每页30条
let authHeader = localStorage.getItem('imgbed_auth') || '';
async function syncSiteInfo() {
    try {
        const res = await fetch(`${apiBaseUrl}/api/public/siteinfo`);
        const info = await res.json();
        if (info.site_favicon) document.getElementById('dynamic-favicon').href = info.site_favicon;
        
        if (info.show_site_name === 'on' && info.site_name) {
            document.getElementById('login-site-name').innerText = info.site_name;
            document.getElementById('login-site-name').style.display = 'block';
            const mobileText = document.getElementById('mobile-logo-text'); if(mobileText) mobileText.innerText = info.site_name;
            document.title = info.site_name + " - 管理后台"; 
        } else if (info.show_site_name === 'off') {
            document.getElementById('login-site-name').style.display = 'none';
            const mobileText = document.getElementById('mobile-logo-text'); if(mobileText) mobileText.style.display = 'none';
        }
        
        if (info.show_site_logo === 'on' && info.site_logo) {
            const logoImg = document.getElementById('login-site-logo');
            logoImg.src = info.site_logo;
            logoImg.style.display = 'block';
            const mobileLogo = document.getElementById('mobile-logo-img');
            if(mobileLogo) { mobileLogo.src = info.site_logo; mobileLogo.style.display = 'block'; }
        }
    } catch (err) { 
        console.error("加载网站信息失败"); 
        document.getElementById('login-site-name').style.display = 'block';
    }
}

window.onload = () => {
    syncSiteInfo();
    document.getElementById('username').addEventListener('keydown', function(e) { if (e.key === 'Enter') login(); });
    document.getElementById('password').addEventListener('keydown', function(e) { if (e.key === 'Enter') login(); });
    if (authHeader) {
        showAdmin();
        loadImages();
        loadSettings();
        loadCategories();
        const savedTab = localStorage.getItem('admin_current_tab');
        if (savedTab && savedTab !== 'images') switchTab(savedTab);
    }
    else {
        document.getElementById('login-wrapper').style.display = 'flex';
    }
    setupDragDrop();
    setupFileInput();
};

// --- 移动端菜单弹起与遮罩交互逻辑 ---
document.addEventListener('click', function(e) {
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.querySelector('.admin-overlay');
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    
    // 1. 点击展开/收起按钮
    if (toggleBtn && (toggleBtn.contains(e.target) || e.target === toggleBtn)) {
        sidebar.classList.toggle('is-visible');
        overlay.classList.toggle('is-visible');
        const icon = toggleBtn.querySelector('.fas');
        if (icon.classList.contains('fa-bars')) icon.classList.replace('fa-bars', 'fa-times');
        else icon.classList.replace('fa-times', 'fa-bars');
    }
    // 2. 点击遮罩层或侧边栏里的菜单项自动收起 (屏幕小于800px时)
    else if ((overlay && overlay.contains(e.target)) || (e.target.closest('.admin-sidebar .nav > li > a') && window.innerWidth <= 800)) {
        if(sidebar) sidebar.classList.remove('is-visible');
        if(overlay) overlay.classList.remove('is-visible');
        if(toggleBtn) toggleBtn.querySelector('.fas').classList.replace('fa-times', 'fa-bars');
    }
});

// --- 菜单切换与交互逻辑 ---
function switchTab(tabName, categoryId = 0) {
    localStorage.setItem('admin_current_tab', tabName);
    document.getElementById('tab-images').classList.add('hidden');
    document.getElementById('tab-categories').classList.add('hidden');
    document.getElementById('tab-settings').classList.add('hidden');
    
    document.getElementById('nav-images').classList.remove('active');
    document.getElementById('nav-categories').classList.remove('active');
    document.getElementById('nav-settings').classList.remove('active');

    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    document.getElementById(`nav-${tabName}`).classList.add('active');
    if(tabName === 'images') loadImages(categoryId);
    if(tabName === 'categories') loadCategories();
    if(tabName === 'settings') loadSettings();
}

async function login() {
    const user = document.getElementById('username').value.trim();
    const pass = document.getElementById('password').value.trim();
    if (!user || !pass) return alert("请输入账号密码");
    
    const tempAuth = 'Basic ' + btoa(user + ':' + pass);
    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/images`, { headers: { 'Authorization': tempAuth } });
        if (res.status === 401) throw new Error("账号或密码错误");
        if (!res.ok) throw new Error("API 请求失败");
        
        authHeader = tempAuth;
        localStorage.setItem('imgbed_auth', authHeader);
        showAdmin();
        loadImages();
        loadSettings();
        loadCategories();
    } catch (err) { alert(err.message); }
}

function logout() {
    localStorage.removeItem('imgbed_auth');
    window.location.reload();
}

function showAdmin() {
    document.getElementById('login-wrapper').style.display = 'none';
    document.getElementById('admin-container').classList.remove('hidden');
}

// --- 图片管理 ---
async function loadImages(categoryId = 0) {
    const gallery = document.getElementById('gallery');
    const pendingImgs = gallery.querySelectorAll('img');
    const blankImg = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    pendingImgs.forEach(img => img.src = blankImg);

    gallery.innerHTML = '<p style="color:#999; text-align:center;">加载中...</p>';
    try {
        const url = categoryId == 0 ? `${apiBaseUrl}/api/admin/images` : `${apiBaseUrl}/api/admin/images?category_id=${categoryId}`;
        const res = await fetch(url, { headers: { 'Authorization': authHeader } });
        const data = await res.json();
        adminAllImages = data;
        adminFilteredImages = data;
        adminCurrentPage = 1;
        const r2Count = data.filter(img => img.message_id === 0).length;
        const tgCount = data.length - r2Count;
        const statsImagesEl = document.getElementById('stats-images');
        if (statsImagesEl) {
            statsImagesEl.innerHTML = `<i class="fab fa-cloudflare" style="color:#f48120;"></i> R2: ${r2Count}张 <span style="margin:0 5px;">|</span> <i class="fab fa-telegram-plane" style="color:#0088cc;"></i> TG: ${tgCount}张`;
        }
        renderAdminGallery();
        renderAdminPagination();
    } catch (err) { gallery.innerHTML = '<p class="text-danger">加载失败</p>'; }
}

// 新增：延时等待函数，防止触发 TG 接口限流
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function uploadImage(files) {
    if (!files || files.length === 0) files = document.getElementById('fileInput').files;
    if (files.length === 0) return alert("请选择图片");
    
    const statusEl = document.getElementById('uploadStatus');
    let success = 0, fail = 0;
    let failedFiles = [];
    for (let i = 0; i < files.length; i++) {
        // 过滤超大文件 (TG Bot API 限制直接上传最大 20MB)
        if (files[i].size > 20 * 1024 * 1024) {
            fail++;
            console.warn(`[跳过] ${files[i].name} 体积超过 20MB`);
            failedFiles.push(files[i].name + ' (超 20MB)'); // 必须放在 continue 前面
            continue;
        }
        statusEl.innerText = `正在上传 (${i+1}/${files.length})...`;
        statusEl.style.color = '#337ab7';
        const categoryId = document.getElementById('upload_category') ? document.getElementById('upload_category').value : 0;
        const titleVal = document.getElementById('upload_title') ? document.getElementById('upload_title').value : ''; 
        
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('category_id', categoryId);
        formData.append('title', titleVal); 
        
        let retry = 0;
        const maxRetries = 2; // 失败后最多重试 2 次
        let isUploaded = false;

        while (!isUploaded && retry <= maxRetries) {
            try {
                const res = await fetch(`${apiBaseUrl}/api/admin/upload`, {
                    method: 'POST',
                    headers: { 'Authorization': authHeader },
                    body: formData
                });
                
                if (res.ok) {
                    success++;
                    isUploaded = true;
                } else {
                    // 如果是 429 限流错误，强制额外等待一会
                    if (res.status === 429) await sleep(2000); 
                    throw new Error(`HTTP ${res.status}`);
                }
            } catch (e) { 
                retry++;
                if (retry <= maxRetries) {
                    statusEl.innerText = `第 ${i+1} 张失败，重试中 (${retry}/${maxRetries})...`;
                    await sleep(1500); // 发生错误停顿 1.5 秒再重试
                } else {
                    fail++; 
                    failedFiles.push(files[i].name);
                }
            }
        }
        
        // 成功上传后，强制停顿 800 毫秒，温柔对待 Telegram 接口
        if (isUploaded && i < files.length - 1) {
            await sleep(800);
        }
    }
    if (failedFiles.length > 0) {
        const failListEl = document.getElementById('custom-fail-list');
        failListEl.innerHTML = failedFiles.map(name => `<p><i class="fas fa-times" style="color:#e74c3c; margin-right:5px;"></i> ${name}</p>`).join('');
        document.getElementById('custom-fail-alert').style.display = 'flex';
    }
    statusEl.innerHTML = `<span style="color:green;">成功 ${success}</span> / <span style="color:red;">失败 ${fail}</span>`;
    loadImages();
    document.getElementById('fileInput').value = ''; 
}

function openEditModal(id, filename, categoryId, messageId, description) {
    document.getElementById('edit-id').innerText = id;
    document.getElementById('edit-filename').value = filename === 'null' || filename === 'undefined' ? '' : filename;
    
    // 处理默认的英文描述，过滤掉不展示
    let displayTitle = (description && !description.includes('Upload')) ? description : '';
    document.getElementById('edit-title').value = displayTitle; 

    document.getElementById('edit-category').innerHTML = window.categoryOptions || '<option value="0">默认分类</option>';
    document.getElementById('edit-category').value = categoryId;
    const storageSelect = document.getElementById('edit-storage');
    storageSelect.innerHTML = '<option value="none">不转移</option>';
    if (messageId !== 0) storageSelect.innerHTML += '<option value="tg2r2">转存到 R2</option>';
    else storageSelect.innerHTML += '<option value="r22tg">转存到 TG</option>';
    document.getElementById('edit-modal').style.display = 'block';
}

async function saveEdit() {
    const id = document.getElementById('edit-id').innerText;
    const filename = document.getElementById('edit-filename').value;
    const title = document.getElementById('edit-title').value; // 获取新填的标题
    const categoryId = document.getElementById('edit-category').value;
    const transfer = document.getElementById('edit-storage').value;
    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/edit_image`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, filename, category_id: categoryId, transfer, title }) // 带上 title 提交
        });
        if (res.ok) {
            document.getElementById('edit-modal').style.display = 'none';
            loadImages();
        } else alert("编辑失败");
    } catch (e) { alert("网络错误"); }
}

async function deleteImage(id) {
    if(!confirm("确认彻底删除？")) return;
    try {
        await fetch(`${apiBaseUrl}/api/admin/delete`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        loadImages(); // 重新加载图库以刷新分页数据
    } catch(err) { alert("删除失败"); }
}

// --- 分类管理 ---
async function loadCategories() {
    const listEl = document.getElementById('category-list');
    listEl.innerHTML = '<tr><td colspan="2">加载中...</td></tr>';
    const subMenuEl = document.getElementById('category-submenu');
    const uploadCatEl = document.getElementById('upload_category');
    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/categories`, { headers: { 'Authorization': authHeader } });
        const data = await res.json();
        
        const buildTree = (items, pId = 0, lvl = 0) => items.filter(i => (i.parent_id||0) === pId).map(i => ({...i, lvl, children: buildTree(items, i.id, lvl + 1)}));
        const flatTree = tree => tree.reduce((acc, n) => [...acc, n, ...flatTree(n.children)], []);
        const treeData = flatTree(buildTree(data));
        const lvl1 = treeData.filter(c => c.lvl === 0).length;
        const lvl2 = treeData.filter(c => c.lvl === 1).length;
        const lvl3 = treeData.filter(c => c.lvl === 2).length;
        const statsCatEl = document.getElementById('stats-categories');
        if (statsCatEl) {
            statsCatEl.innerHTML = `<i class="fas fa-sitemap" style="color:#888;"></i> ${lvl1}个一级 / ${lvl2}个二级 / ${lvl3}个三级`;
        }
        if (subMenuEl) {
            subMenuEl.style.display = 'block';
            subMenuEl.innerHTML = `<li onclick="event.stopPropagation(); switchTab('images', 0)"><a style="color:#bdc3c7; cursor:pointer; display:block; padding:8px 0;">├ 全部图片</a></li>` + 
                treeData.map(cat => `<li onclick="event.stopPropagation(); switchTab('images', ${cat.id})"><a style="color:#bdc3c7; cursor:pointer; display:block; padding:8px 0; padding-left:${cat.lvl*15}px;">├ ${cat.name}</a></li>`).join('');
        }
        let options = '<option value="0">默认分类</option>' + treeData.map(cat => `<option value="${cat.id}">${'&nbsp;'.repeat(cat.lvl*4)}${cat.name}</option>`).join('');
        if (uploadCatEl) uploadCatEl.innerHTML = options;
        window.categoryOptions = options;
        const batchCatEl = document.getElementById('batchEditCategory');
        if (batchCatEl) batchCatEl.innerHTML = options;
        const parentSel = document.getElementById('new-category-parent');
        if(parentSel) parentSel.innerHTML = '<option value="0">作为顶级分类</option>' + treeData.filter(c=>c.lvl<2).map(cat => `<option value="${cat.id}">${'&nbsp;'.repeat(cat.lvl*4)}${cat.name}</option>`).join('');

        if(data.length === 0) { listEl.innerHTML = '<tr><td colspan="4">暂无分类</td></tr>'; return; }
        listEl.innerHTML = treeData.map(cat => `
            <tr data-id="${cat.id}" data-parent="${cat.parent_id||0}">
                <td style="vertical-align: middle; cursor: grab;" class="drag-handle"><i class="fas fa-grip-vertical" style="color:#ccc;"></i></td>
                <td style="vertical-align: middle; padding-left: ${cat.lvl*20 + 8}px;">${cat.lvl>0?'├ ':''}${cat.name}</td>
                <td style="vertical-align: middle;"><input type="checkbox" ${cat.is_show !== 0 ? 'checked' : ''} onchange="toggleCategoryShow(${cat.id}, this.checked)"></td>
                <td>
                <button class="btn btn-warning btn-sm" onclick="editCategory(${cat.id}, '${cat.name}', ${cat.parent_id||0})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteCategory(${cat.id})"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        // 初始化或重置拖拽
        if(window.catSortable) window.catSortable.destroy();
        window.catSortable = new Sortable(listEl, {
            handle: '.drag-handle',
            animation: 150,
            onEnd: async function() {
                const sortedIds = Array.from(listEl.children).map(tr => parseInt(tr.dataset.id));
                await fetch(`${apiBaseUrl}/api/admin/categories/sort`, {
                    method: 'POST',
                    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sortedIds })
                });
                // 静默刷新侧边栏顺序
                loadCategories(); 
            }
        });
    } catch (err) { listEl.innerHTML = '<tr><td colspan="3" class="text-danger">加载失败</td></tr>'; }
}

async function addCategory() {
        const input = document.getElementById('new-category-name');
        const parentInput = document.getElementById('new-category-parent');
        if (!input.value.trim()) return;
        try {
            const res = await fetch(`${apiBaseUrl}/api/admin/categories`, {
                method: 'POST',
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: input.value.trim(), parent_id: parentInput ? parseInt(parentInput.value) : 0 })
            });
        if (res.ok) { input.value = ''; loadCategories(); }
        else alert("添加失败或分类已存在");
    } catch (err) { alert(err.message); }
}

async function deleteCategory(id) {
    if (!confirm("确定删除该分类？")) return;
    await fetch(`${apiBaseUrl}/api/admin/categories`, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
    loadCategories();
}
async function editCategory(id, oldName, oldParentId) {
    const newName = prompt("请输入新的分类名称：", oldName);
    if (newName === null || newName.trim() === "") return;
    const newParentStr = prompt("请输入父级分类ID（填0表示顶级分类）：", oldParentId);
    const newParentId = newParentStr ? parseInt(newParentStr) : 0;
    if (newName === oldName && newParentId === oldParentId) return;
    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/categories`, {
            method: 'PUT',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name: newName.trim(), parent_id: newParentId })
        });
        if (res.ok) { loadCategories(); }
        else alert("修改失败或分类名称已存在");
    } catch (err) { alert("网络错误"); }
}
async function toggleCategoryShow(id, isChecked) {
    const is_show = isChecked ? 1 : 0;
    try {
        await fetch(`${apiBaseUrl}/api/admin/categories/toggle`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_show })
        });
    } catch (err) { alert("状态修改失败"); }
}

// --- 系统设置 ---
async function loadSettings() {
    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/settings`, { headers: { 'Authorization': authHeader } });
        const s = await res.json();
        ['tg_bot_token', 'tg_chat_id', 'api_key', 'admin_user', 'admin_pass', 'site_favicon', 'storage_provider', 'site_name', 'show_site_name', 'site_logo', 'show_site_logo', 'site_footer_1', 'site_footer_2', 'mobile_sidebar_image'].forEach(key => {
            const el = document.getElementById(`set_${key}`);
            if(el && s[key]) el.value = s[key];
            if(key === 'site_favicon' && s[key]) document.getElementById('dynamic-favicon').href = s[key];
        });
    } catch (e) {}
}

async function saveSettings() {
    const updates = {};
    ['tg_bot_token', 'tg_chat_id', 'api_key', 'admin_user', 'admin_pass', 'site_favicon', 'storage_provider', 'site_name', 'show_site_name', 'site_logo', 'show_site_logo', 'mobile_sidebar_image'].forEach(key => {
        const el = document.getElementById(`set_${key}`);
        if(el && el.value.trim() !== '') updates[key] = el.value.trim();
    });
    
    ['site_footer_1', 'site_footer_2'].forEach(key => {
        const el = document.getElementById(`set_${key}`);
        if(el) updates[key] = el.value;
    });

    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/settings`, {
            method: 'POST',
            headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
        if(res.ok) {
            alert("保存成功！若修改了密码，请退出重新登录。");
            if(updates.site_favicon) document.getElementById('dynamic-favicon').href = updates.site_favicon;
            if(updates.admin_pass) authHeader = 'Basic ' + btoa(updates.admin_user + ':' + updates.admin_pass);
        } else throw new Error();
    } catch(e) { alert("保存失败"); }
}

async function quickSaveStorage() {
    const provider = document.getElementById('set_storage_provider').value;
    await fetch(`${apiBaseUrl}/api/admin/settings`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storage_provider: provider })
    });
}

// 工具函数
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        const toast = document.createElement('div');
        toast.innerText = '已复制';
        toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.7); color:#fff; padding:8px 16px; border-radius:4px; z-index:9999; transition:opacity 0.3s;';
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 1500);
    });
}

function setupDragDrop() {
    const dz = document.getElementById('drop-zone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
    dz.addEventListener('dragleave', e => { e.preventDefault(); dz.classList.remove('dragover'); });
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('dragover');
        if(e.dataTransfer.files.length) uploadImage(e.dataTransfer.files);
    });
}

function setupFileInput() {
    document.getElementById('fileInput').addEventListener('change', function() {
        uploadImage(this.files);
    });
}
// --- 后台核心渲染引擎 ---
function renderAdminGallery() {
    const gallery = document.getElementById('gallery');
    if (adminFilteredImages.length === 0) {
        gallery.innerHTML = '<p style="color:#999; text-align:center; width: 100%;">未找到相关图片</p>';
        return;
    }

    const start = (adminCurrentPage - 1) * adminPageSize;
    const pageData = adminFilteredImages.slice(start, start + adminPageSize);
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb) selectAllCb.checked = false;
    gallery.innerHTML = pageData.map(img => {
        const safeDesc = img.description ? img.description.replace(/'/g, "\\'") : '';
        return `
        <div class="img-card" id="img-${img.id}">
        <input type="checkbox" class="img-checkbox" value="${img.id}" style="position: absolute; top: 35px; left: 10px; z-index: 10; width: 16px; height: 16px; cursor: pointer;" onclick="checkSelection()">
            ${img.message_id === 0 
                ? '<span class="img-badge badge-r2"><i class="fab fa-cloudflare" style="margin-right:4px;"></i>R2</span>' 
                : '<span class="img-badge badge-tg"><i class="fab fa-telegram-plane" style="margin-right:4px;"></i>TG</span>'}
            <span id="dim-${img.id}" style="position: absolute; top: 10px; right: 10px; font-size: 11px; color: #fff; background: rgba(0,0,0,0.5); padding: 2px 5px; border-radius: 3px; pointer-events: none; display: none; z-index: 10;"></span>
            <a href="${img.url}" target="_blank"><img src="${img.url}" loading="lazy" onload="let d = document.getElementById('dim-${img.id}'); if(d){ d.innerText = this.naturalWidth + ' × ' + this.naturalHeight + ' px'; d.style.display = 'block'; }"></a>
            <div style="margin-top: 8px;">
                <input type="text" class="form-control input-sm" value="${img.url}" readonly onclick="this.select()" style="margin-bottom: 5px;">
                <button class="btn btn-default btn-xs" onclick="copyText('${img.url}')">复制</button>
                <button class="btn btn-warning btn-xs" onclick="openEditModal(${img.id}, '${img.filename}', ${img.category_id || 0}, ${img.message_id}, '${safeDesc}')">编辑</button>
                <button class="btn btn-danger btn-xs pull-right" onclick="deleteImage(${img.id})">删除</button>
            </div>
        </div>
        `;
    }).join('');
}

function renderAdminPagination() {
    const container = document.getElementById('admin-pagination-container');
    const totalItems = adminFilteredImages.length;
    const totalPages = Math.ceil(totalItems / adminPageSize) || 1;
    
    container.style.display = 'flex';
    
    let html = `
        <div class="admin-pagination-left">
            <select class="form-control input-sm" style="width: 60px; display: inline-block; padding: 0 5px; height: 30px;" onchange="changeAdminPageSize(this.value)">
                <option value="10" ${adminPageSize == 10 ? 'selected' : ''}>10</option>
                <option value="20" ${adminPageSize == 20 ? 'selected' : ''}>20</option>
                <option value="30" ${adminPageSize == 30 ? 'selected' : ''}>30</option>
                <option value="50" ${adminPageSize == 50 ? 'selected' : ''}>50</option>
                <option value="100" ${adminPageSize == 100 ? 'selected' : ''}>100</option>
                <option value="200" ${adminPageSize == 200 ? 'selected' : ''}>200</option>
            </select>
            <span style="margin-left: 10px;">条/页</span>
        </div>
        <div class="admin-pagination-center">
            共 ${totalItems} 条数据，第 ${adminCurrentPage} / ${totalPages} 页
        </div>
    `;
    
    let btnHtml = `<div class="admin-pagination-right">`;
    btnHtml += `<button ${adminCurrentPage === 1 ? 'disabled' : ''} onclick="changeAdminPage(${adminCurrentPage - 1})">« 上一页</button>`;
    
    let startPage = Math.max(1, adminCurrentPage - 2);
    let endPage = Math.min(totalPages, adminCurrentPage + 2);
    if (endPage - startPage < 4) {
        if (startPage === 1) endPage = Math.min(totalPages, startPage + 4);
        else if (endPage === totalPages) startPage = Math.max(1, endPage - 4);
    }
    for (let i = startPage; i <= endPage; i++) {
        btnHtml += `<button class="${i === adminCurrentPage ? 'active' : ''}" onclick="changeAdminPage(${i})">${i}</button>`;
    }
    
    btnHtml += `<button ${adminCurrentPage === totalPages ? 'disabled' : ''} onclick="changeAdminPage(${adminCurrentPage + 1})">下一页 »</button>`;
    btnHtml += `</div>`;
    
    container.innerHTML = html + btnHtml;
}

window.changeAdminPage = function(page) {
    const totalPages = Math.ceil(adminFilteredImages.length / adminPageSize);
    if (page < 1 || page > totalPages) return;
    adminCurrentPage = page;
    renderAdminGallery();
    renderAdminPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.changeAdminPageSize = function(size) {
    adminPageSize = parseInt(size);
    adminCurrentPage = 1;
    renderAdminGallery();
    renderAdminPagination();
};

// 适配分页的后台全局搜索过滤功能
function filterAdminImages() {
    const keyword = document.getElementById('admin-search').value.toLowerCase().trim();
    
    if (!keyword) {
        adminFilteredImages = adminAllImages;
    } else {
        adminFilteredImages = adminAllImages.filter(img => {
            const searchStr = `${img.filename || ''} ${img.description || ''}`.toLowerCase();
            return searchStr.includes(keyword);
        });
    }
    
    adminCurrentPage = 1;
    renderAdminGallery();
    renderAdminPagination();
}
function getSelectedIds() {
    return Array.from(document.querySelectorAll('.img-checkbox:checked')).map(cb => parseInt(cb.value));
}

function toggleSelectAll(selectAllCb) {
    document.querySelectorAll('.img-checkbox').forEach(cb => cb.checked = selectAllCb.checked);
}

function checkSelection() {
    const checkboxes = document.querySelectorAll('.img-checkbox');
    const selectAllCb = document.getElementById('selectAllCheckbox');
    if (selectAllCb) selectAllCb.checked = checkboxes.length > 0 && Array.from(checkboxes).every(cb => cb.checked);
}

async function batchDelete() {
    const ids = getSelectedIds();
    if (ids.length === 0) return alert("请先勾选要删除的图片");
    if (!confirm(`⚠ 危险操作：确认要彻底删除选中的 ${ids.length} 张图片吗？此操作不可逆！`)) return;
    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/delete_batch`, {
            method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        if (res.ok) {
            document.getElementById('selectAllCheckbox').checked = false;
            loadImages();
        } else alert("批量删除失败");
    } catch(err) { alert("网络错误"); }
}

async function batchEdit() {
    const ids = getSelectedIds();
    const categoryId = document.getElementById('batchEditCategory').value;
    if (ids.length === 0) return alert("请先勾选要移动的图片");
    if (!categoryId) return alert("请先加载分类");
    if (!confirm(`确认要将选中的 ${ids.length} 张图片移动到该分类吗？`)) return;
    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/edit_batch`, {
            method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, category_id: parseInt(categoryId) })
        });
        if (res.ok) {
            document.getElementById('selectAllCheckbox').checked = false;
            loadImages();
        } else alert("批量修改分类失败");
    } catch(err) { alert("网络错误"); }
}
async function batchTransfer(btn) {
    const ids = getSelectedIds();
    const transferType = document.getElementById('batchTransferStorage').value;
    if (ids.length === 0) return alert("请先勾选要转移的图片");
    if (transferType === 'none') return alert("请在下拉框中选择转移方向");
    
    const direction = transferType === 'tg2r2' ? 'TG 转存到 R2' : 'R2 转存到 TG';
    if (!confirm(`⚠ 注意：批量转移涉及重新下载和上传，可能比较耗时！\n转移期间请勿刷新页面。\n\n确认要将选中的 ${ids.length} 张图片进行 [${direction}] 吗？`)) return;
    
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 转移中...';
    btn.disabled = true;

    try {
        const res = await fetch(`${apiBaseUrl}/api/admin/transfer_batch`, {
            method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, transfer: transferType })
        });
        if (res.ok) {
            document.getElementById('selectAllCheckbox').checked = false;
            loadImages();
            alert("✅ 批量转移完成！");
        } else alert("批量转移失败，可能部分图片未成功转移。");
    } catch(err) { 
        alert("网络错误或转移超时"); 
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
        document.getElementById('batchTransferStorage').value = 'none'; // 恢复默认选项
    }
}

// --- 新增：设置页面水平选项卡切换逻辑 ---
window.switchSettingsTab = function(tab) {
    const basicEl = document.getElementById('basic-settings');
    const dataEl = document.getElementById('data-management');
    const tabs = document.querySelectorAll('#tab-settings .nav-tabs li');
    
    if (tab === 'basic') {
        basicEl.style.display = 'block';
        dataEl.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        basicEl.style.display = 'none';
        dataEl.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
};

// --- 采用后端过滤方式导出选中数据 ---
window.exportData = async function() {
    try {
        const exportBasic = document.getElementById('export-basic').checked;
        const exportR2 = document.getElementById('export-r2').checked;
        const exportTg = document.getElementById('export-tg').checked;

        if (!exportBasic && !exportR2 && !exportTg) {
            return alert("请至少勾选一项要导出的内容！");
        }
        const queryParams = new URLSearchParams({
            basic: exportBasic,
            r2: exportR2,
            tg: exportTg
        }).toString();
        const res = await fetch(`${apiBaseUrl}/api/admin/export?${queryParams}`, { headers: { 'Authorization': authHeader } });
        if (!res.ok) throw new Error("API 导出请求失败");
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xiayu_imgbed_backup_${new Date().getTime()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch(e) { alert("导出失败: " + e.message); }
};

// --- 新增：解析并导入数据 ---
window.importData = async function() {
    const fileInput = document.getElementById('import-file');
    if (!fileInput.files.length) return alert("请先选择要导入的 JSON 备份文件");
    if (!confirm("极度危险：导入将强制覆盖具有相同ID的记录，且操作不可逆转！确认继续执行导入吗？")) return;
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            const chunkSize = 500; // 每次最多写入 500 条图片数据，防止撑爆 D1 限制
            const baseData = {
                settings: jsonData.settings || [],
                categories: jsonData.categories || []
            };
            const allImages = jsonData.images || [];
            const totalChunks = Math.ceil(allImages.length / chunkSize);
            if (totalChunks <= 1) {
                baseData.images = allImages;
                await sendImportRequest(baseData);
                alert("🎉 数据导入成功！系统即将刷新。");
                window.location.reload();
                return;
            }
            baseData.images = allImages.slice(0, chunkSize);
            await sendImportRequest(baseData);
            for (let i = 1; i < totalChunks; i++) {
                const btn = document.querySelector('#data-management .btn-danger');
                if(btn) btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在导入分片 ${i+1}/${totalChunks}...`;
                
                const chunkData = {
                    images: allImages.slice(i * chunkSize, (i + 1) * chunkSize)
                };
                await sendImportRequest(chunkData);
            }
            alert("🎉 全部数据分片导入成功！系统即将刷新。");
            window.location.reload();  
        } catch(err) { 
            alert("导入过程中止: " + err.message); 
            const btn = document.querySelector('#data-management .btn-danger');
            if(btn) btn.innerHTML = `<i class="fas fa-file-import"></i> 导入数据文件`;
        }
    };
    reader.readAsText(file);
};
async function sendImportRequest(dataPayload) {
    const res = await fetch(`${apiBaseUrl}/api/admin/import`, {
        method: 'POST',
        headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(dataPayload)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "网络或数据库请求异常");
    }
}