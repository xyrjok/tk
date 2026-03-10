const API_BASE = "";
let allCategories = [];
let globalMobileSidebarImg = '';
let allImages = [];       
let filteredImages = [];  
let currentPage = 1; 
const pageSize = 16; 

async function syncFavicon() {
    try {
        const infoRes = await fetch(`${API_BASE}/api/public/siteinfo`);
        const infoData = await infoRes.json();
        globalMobileSidebarImg = infoData.mobile_sidebar_image || '';
        if (infoData.site_favicon) {
        if (infoData.show_site_name === 'on' && infoData.site_name) {
            document.getElementById('site-name').innerText = infoData.site_name;
            document.getElementById('site-name').style.display = 'block'; 
            document.title = infoData.site_name;
        } else if (infoData.show_site_name === 'off') {
            document.getElementById('site-name').style.display = 'none';
        }

        if (infoData.show_site_logo === 'on' && infoData.site_logo) {
            const logoImg = document.getElementById('site-logo');
            logoImg.src = infoData.site_logo;
            logoImg.style.display = 'block';
        }
        
        if (infoData.site_footer_1) document.getElementById('footer-part1').innerHTML = infoData.site_footer_1;
        if (infoData.site_footer_2) document.getElementById('footer-part2').innerHTML = infoData.site_footer_2;

            const newLink = document.createElement('link');
            newLink.id = 'dynamic-favicon';
            newLink.rel = 'icon';
            newLink.href = infoData.site_favicon;
            document.head.appendChild(newLink);
        }
    } catch (err) { 
        console.error("加载网站图标失败"); 
    }
}

window.toggleSubMenu = function(element) {
    element.classList.toggle('active'); 
    const subMenu = element.nextElementSibling; 
    if (subMenu && subMenu.classList.contains('cat-dropdown')) {
        subMenu.classList.toggle('open'); 
    }
};

async function loadPublicCategories() {
    try {
        const res = await fetch(`${API_BASE}/api/public/categories`);
        const categories = await res.json();
        allCategories = categories; 
        const nav = document.getElementById('public-nav-categories');
        if (categories && categories.length > 0 && nav) {
            nav.style.opacity = '0';        
        const mobileHeader = globalMobileSidebarImg 
            ? `<div class="mobile-nav-header" style="padding: 0; border-bottom: none; position: relative;"><img src="${globalMobileSidebarImg}" style="width: 100%; max-height: 160px; object-fit: cover; display: block;"><i class="fas fa-times" style="position: absolute; right: 15px; top: 15px; color: #555; background: rgba(255,255,255,0.8); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; cursor: pointer; z-index: 10;" onclick="document.getElementById('public-nav-categories').classList.remove('show'); document.getElementById('mobile-overlay').classList.remove('show');"></i></div>`
            : `<div class="mobile-nav-header"><span>分类菜单</span><i class="fas fa-times" onclick="document.getElementById('public-nav-categories').classList.remove('show'); document.getElementById('mobile-overlay').classList.remove('show');"></i></div>`;    
        const mobileLoginBtn = '<a href="/admin.html" class="mobile-login-btn"><i class="fas fa-user-cog"></i>登录</a>';
        const buildTreeHTML = (items, pId = 0, lvl = 1) => {
            const children = items.filter(i => (i.parent_id||0) === pId);
            if (!children.length) return '';
            if (lvl > 1) {
                return `<div class="cat-dropdown ${lvl > 2 ? 'cat-dropdown-sub' : ''}">` + children.map(cat => {
                    const hasChild = items.some(i => (i.parent_id||0) === cat.id);
                    const arrowPC = hasChild ? '<span class="arrow-container"><i class="fas fa-angle-right"></i></span>' : '';
                    const toggleMobile = hasChild ? `<span class="submenu-toggle" onclick="event.stopPropagation(); toggleSubMenu(this)"><i class="fas fa-angle-right"></i></span>` : '';
                    return `<div class="has-dropdown" style="position:relative;"><a href="javascript:void(0)" onclick="event.stopPropagation(); loadPublicImages(${cat.id})">${cat.name}${arrowPC}</a>${toggleMobile}${buildTreeHTML(items, cat.id, lvl + 1)}</div>`;
                }).join('') + `</div>`;
            }
            return children.map(cat => {
                const hasChild = items.some(i => (i.parent_id||0) === cat.id);
                const arrowPC = hasChild ? '<span class="arrow-container"><i class="fas fa-angle-down"></i></span>' : '';
                const toggleMobile = hasChild ? `<span class="submenu-toggle" onclick="event.stopPropagation(); toggleSubMenu(this)"><i class="fas fa-angle-right"></i></span>` : '';
                return `<div class="pc-cat-item has-dropdown" style="display: flex; align-items: center;"><a href="javascript:void(0)" onclick="loadPublicImages(${cat.id})" style="color: #666; text-decoration: none; display: flex; align-items: center; padding: 0 8px;">${cat.name}${arrowPC}</a>${toggleMobile}${buildTreeHTML(items, cat.id, lvl + 1)}</div>`;
            }).join('');
        };
        nav.innerHTML = mobileHeader + '<a class="pc-cat-item" href="javascript:void(0)" onclick="loadPublicImages(0)" style="color: #409EFF; text-decoration: none; font-weight: bold; padding: 0 8px;">全部</a>' +
        buildTreeHTML(categories) + mobileLoginBtn;
        nav.style.transition = 'transform 0.3s ease-in-out, opacity 0.2s ease-in-out';
        nav.style.opacity = '1';
        }
    } catch (err) { console.error("加载分类失败"); }
}
async function loadPublicImages(categoryId = 0, isInit = false) {
    const gallery = document.getElementById('public-gallery');
    const pendingImgs = gallery.querySelectorAll('img');
    const blankImg = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    pendingImgs.forEach(img => img.src = blankImg);
    const nav = document.getElementById('public-nav-categories');
    const overlay = document.getElementById('mobile-overlay');
    if(nav) nav.classList.remove('show');
    if(overlay) overlay.classList.remove('show');
    const urlParams = new URLSearchParams(window.location.search);
    if (categoryId === 0) urlParams.delete('category'); 
    else urlParams.set('category', categoryId);
    
    if (!isInit) { 
        urlParams.delete('page'); 
    }
    const newQuery = urlParams.toString();
    const newUrl = newQuery ? '?' + newQuery : window.location.pathname;
    if (!isInit) {
        window.history.pushState(null, '', newUrl);
    } else {
        window.history.replaceState(null, '', newUrl);
    }
    const breadcrumbEl = document.getElementById('category-breadcrumb');
    if (breadcrumbEl) {
        let path = [];
        let currId = categoryId;
        while (currId !== 0) {
            const cat = allCategories.find(c => c.id === currId);
            if (!cat) break;
            path.unshift(`<a href="javascript:void(0)" onclick="loadPublicImages(${cat.id})" style="color: #555; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#409EFF'" onmouseout="this.style.color='#555'">${cat.name}</a>`);
            currId = cat.parent_id || 0;
        }
        if (categoryId === 0) {
            path.unshift(`<span style="color: #555;">全部图片</span>`);
        } else {
            path.unshift(`<a href="javascript:void(0)" onclick="loadPublicImages(0)" style="color: #555; text-decoration: none; transition: color 0.2s;" onmouseover="this.style.color='#409EFF'" onmouseout="this.style.color='#555'">全部</a>`);
        }
        breadcrumbEl.innerHTML = path.join('<span style="margin: 0 8px; color: #999;">/</span>');
        breadcrumbEl.style.display = 'block';
    }
    gallery.innerHTML = '<p style="text-align:center; width: 100%; color: #999;">正在加载图库...</p>';
    try {
        const url = categoryId === 0 ? `${API_BASE}/api/public/images` : `${API_BASE}/api/public/images?category_id=${categoryId}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.length === 0) {
            gallery.innerHTML = '<p style="text-align:center; width: 100%;">该分类下图库空空如也</p>';
            document.getElementById('pagination').style.display = 'none'; 
            return;
        }

        allImages = data;
        filteredImages = data; 
        const params = new URLSearchParams(window.location.search);
        currentPage = parseInt(params.get('page')) || 1;
        renderGallery();
        renderPagination();
    } catch (err) {
        gallery.innerHTML = '<p style="text-align:center; color: red; width: 100%;">无法连接到服务器</p>';
    }
}

function renderGallery() {
    const gallery = document.getElementById('public-gallery');
    if (filteredImages.length === 0) {
        gallery.innerHTML = '<p style="text-align:center; width: 100%;">没有找到相关的图片</p>';
        return;
    }

    const start = (currentPage - 1) * pageSize;
    const pageData = filteredImages.slice(start, start + pageSize);

    gallery.innerHTML = pageData.map(img => {
        const showTitle = img.description && !img.description.includes('Upload');
        return `
        <div class="item">
            <a href="${img.url}" target="_blank">
                <img src="${img.url}" alt="${img.filename || 'image'}" loading="lazy">
            </a>
            ${showTitle ? `<div style="padding: 12px; text-align: center; color: #444; font-size: 14px; font-weight: 500; background: #fff; border-top: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${img.description}</div>` : ''}
        </div>
        `;
    }).join('');
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(filteredImages.length / pageSize);
    
    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }
    
    pagination.style.display = 'flex';
    let html = `<button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(1)">首页</button>`;
    html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">上一页</button>`;

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    if (endPage - startPage < 4) {
        if (startPage === 1) endPage = Math.min(totalPages, startPage + 4);
        else if (endPage === totalPages) startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }

    html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">下一页</button>`;
    html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${totalPages})">尾页</button>`;
    html += `<span class="page-info">${currentPage}/${totalPages}</span>`;
    
    pagination.innerHTML = html;
}

window.changePage = function(page) {
    const totalPages = Math.ceil(filteredImages.length / pageSize);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    const urlParams = new URLSearchParams(window.location.search);
    if (page === 1) urlParams.delete('page'); else urlParams.set('page', page);
    const newQuery = urlParams.toString();
    window.history.replaceState(null, '', newQuery ? '?' + newQuery : window.location.pathname);
    renderGallery();
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
};

function filterImages() {
    const input = document.getElementById('public-search-input');
    const keyword = input.value.toLowerCase().trim();
    
    if (!keyword) {
        filteredImages = allImages;
    } else {
        filteredImages = allImages.filter(img => 
            (img.description && img.description.toLowerCase().includes(keyword)) ||
            (img.filename && img.filename.toLowerCase().includes(keyword))
        );
    }
    
    currentPage = 1; 
    renderGallery();
    renderPagination();
}

document.addEventListener('keydown', (e) => {
    if (e.target.id === 'public-search-input' && e.key === 'Enter') {
        filterImages();
    }
});
document.addEventListener('click', (e) => {
    const searchBox = document.querySelector('.header-right');
    const searchBtn = document.querySelector('.mobile-search-toggle');
    if (searchBox && searchBox.classList.contains('show') && !searchBox.contains(e.target) && !searchBtn.contains(e.target)) {
        searchBox.classList.remove('show');
    }
});

window.addEventListener('scroll', () => {
    const searchBox = document.querySelector('.header-right');
    if (searchBox && searchBox.classList.contains('show')) {
        searchBox.classList.remove('show');
    }
});

window.onload = async () => {
    await syncFavicon();
    await loadPublicCategories();
    const urlParams = new URLSearchParams(window.location.search);
    const initCatId = parseInt(urlParams.get('category')) || 0;
    loadPublicImages(initCatId, true);
};
window.addEventListener('popstate', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const catId = parseInt(urlParams.get('category')) || 0;
    loadPublicImages(catId, true); 
});
