export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*', 
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    };

    const getExt = (name) => {
      const match = (name || '').match(/(\.[a-zA-Z0-9]+)$/);
      return match ? match[1].toLowerCase() : '.jpg';
    };
// ==========================================
    // 🌟 新增：全自动数据库初始化与多级分类预设接口
    // ==========================================
    if (url.pathname === '/api/init' && request.method === 'GET') {
      try {
        const stmts = [
          // 1. 创建设置表并填入默认数据 (开启 R2 存储)
          env.db.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`),
          env.db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES 
            ('admin_user', 'admin'), ('admin_pass', '123456'), 
            ('tg_bot_token', ''), ('tg_chat_id', ''), 
            ('api_key', 'sk-my-blog-secret-key-888'), 
            ('site_favicon', 'files/xytk.png'), ('site_name', '夏雨图床'), 
            ('show_site_name', 'off'), ('site_logo', 'files/logo.png'), 
            ('show_site_logo', 'on'), ('storage_provider', 'r2'), 
            ('mobile_sidebar_image', 'files/bg.jpg'),
            ('site_footer_1', '<p>Copyright @ 2026 <a href="https://emx.dpdns.org" target="_blank">夏雨图库 </a> - 基于 Cloudflare构建免费个人图床网站</p>'),
            ('site_footer_2', '<a href="" target="_blank"><i class="fab fa-qq"></i> 137222445</a><span class="split" style="margin: 0 3px;">|</span><a href="" target="_blank"><i class="fab fa-telegram-plane"></i> @gv1688</a><span class="split" style="margin: 0 3px;">|</span><a href="/admin" target="_blank">登陆</a>')`),
          
          // 2. 创建图片和分类数据表
          env.db.prepare(`CREATE TABLE IF NOT EXISTS images (id INTEGER PRIMARY KEY AUTOINCREMENT, file_id TEXT NOT NULL, message_id INTEGER NOT NULL, filename TEXT, description TEXT, upload_time DATETIME DEFAULT CURRENT_TIMESTAMP, category_id INTEGER DEFAULT 0, group_id INTEGER DEFAULT 0)`),
          env.db.prepare(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, sort_order INTEGER DEFAULT 0, is_show INTEGER DEFAULT 1, parent_id INTEGER DEFAULT 0)`),
          
          // 3. 建立数据库性能索引
          env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_images_upload_time ON images(upload_time DESC)`),
          env.db.prepare(`CREATE INDEX IF NOT EXISTS idx_images_category_id ON images(category_id)`),
          
          // 4. 预填你定制的多级分类菜单
          env.db.prepare(`INSERT OR IGNORE INTO categories (id, name, parent_id, sort_order, is_show) VALUES 
            (1, '风景壁纸', 0, 0, 1),
            (2, '二次元', 0, 1, 1),
            (3, '私密相册', 0, 2, 0),
            (4, '自然风光', 1, 0, 1),
            (5, '城市建筑', 1, 1, 1),
            (6, '动漫插画', 2, 0, 1),
            (7, '高山流水', 4, 0, 1),
            (8, '赛博朋克', 5, 0, 1)`)
        ];
        // 批量执行所有 SQL
        await env.db.batch(stmts);
        return jsonResponse({ 
            success: true, 
            message: "🎉 恭喜！数据库初始化成功！表结构与多级分类菜单已完全按预设就绪。请访问 /admin.html 登录后台，默认账号 admin，密码 123456" 
        });
      } catch (e) {
        return jsonResponse({ error: "初始化失败: " + e.message }, 500);
      }
    }
    
    let config = {};
    try {
      const { results } = await env.db.prepare("SELECT key, value FROM settings").all();
      results.forEach(row => { config[row.key] = row.value; });
    } catch (err) {
      return jsonResponse({ error: "Database not initialized or binding 'DB' missing." }, 500);
    }
  
    if (url.pathname === '/api/public/siteinfo' && request.method === 'GET') {
      return jsonResponse({ 
        site_favicon: config.site_favicon,
        site_name: config.site_name,
        show_site_name: config.show_site_name,
        site_logo: config.site_logo,
        show_site_logo: config.show_site_logo,
        site_footer_1: config.site_footer_1,
        site_footer_2: config.site_footer_2,
        mobile_sidebar_image: config.mobile_sidebar_image
      });
    }
    if (url.pathname === '/api/public/categories' && request.method === 'GET') {
      try {
        const { results } = await env.db.prepare("SELECT * FROM categories WHERE ifnull(is_show, 1) = 1 ORDER BY sort_order ASC, id ASC").all();
        return jsonResponse(results);
      } catch(e) { return jsonResponse([]); }
    }
    if (url.pathname === '/api/public/images' && request.method === 'GET') {
      const catId = new URL(request.url).searchParams.get('category_id');
      let query = "SELECT i.file_id, i.filename, i.description FROM images i LEFT JOIN categories c ON i.category_id = c.id WHERE ifnull(c.is_show, 1) = 1 ORDER BY i.upload_time DESC";
      let params = [];
      if (catId && catId !== '0') {
         query = "SELECT file_id, filename, description FROM images WHERE category_id = ? ORDER BY upload_time DESC";
         params.push(catId);
      }
      const { results } = await env.db.prepare(query).bind(...params).all();
      const publicImages = results.map(img => ({
        ...img, 
        url: `${url.origin}/image/${img.file_id}${getExt(img.filename)}` 
      }));
      return jsonResponse(publicImages);
    }
    async function handleUpload(photo, filename, sourceDesc, categoryId = 0, customTitle = '') {
      const ext = getExt(filename);
      if (config.storage_provider === 'r2') {
        if (!env.r2) throw new Error("R2_BUCKET 未绑定");
        const fileId = crypto.randomUUID();
        await env.r2.put(fileId, photo);
        const finalDesc = customTitle ? customTitle : `${sourceDesc} (R2)`;
        await env.db.prepare("INSERT INTO images (file_id, message_id, filename, description, category_id) VALUES (?, ?, ?, ?, ?)").bind(fileId, 0, filename, finalDesc, categoryId).run();
        return { success: true, url: `${url.origin}/image/${fileId}${ext}`, file_id: fileId };
      } else {
        const tgFormData = new FormData();
        tgFormData.append('chat_id', config.tg_chat_id);
        if (filename.toLowerCase().endsWith('.gif')) tgFormData.append('document', photo.slice(0, photo.size, 'application/octet-stream'), 'file.bin');
        else tgFormData.append('document', photo); 
        const tgRes = await fetch(`https://api.telegram.org/bot${config.tg_bot_token}/sendDocument`, { method: 'POST', body: tgFormData });
        const tgData = await tgRes.json();
        if (tgData.ok) {
          const tgDoc = tgData.result.document || tgData.result.animation || tgData.result.video || tgData.result.photo?.pop();
          const fileId = tgDoc.file_id;
          const finalDesc = customTitle ? customTitle : `${sourceDesc} (TG)`;
          await env.db.prepare("INSERT INTO images (file_id, message_id, filename, description, category_id) VALUES (?, ?, ?, ?, ?)").bind(fileId, tgData.result.message_id, filename, finalDesc, categoryId).run();
          return { success: true, url: `${url.origin}/image/${fileId}${ext}`, file_id: fileId }; 
        }
        throw new Error('TG API 错误');
      }
    }

    if (url.pathname.startsWith('/api/external/')) {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== `Bearer ${config.api_key}`) {
        return jsonResponse({ error: 'Unauthorized: Invalid API Key' }, 401);
      }

      if (url.pathname === '/api/external/upload' && request.method === 'POST') {
        try {
          const formData = await request.formData();
          const photo = formData.get('file');
          const result = await handleUpload(photo, photo.name || 'api_upload.png', 'API Upload');
          return jsonResponse(result);
        } catch (err) { return jsonResponse({ error: err.message }, 500); }
      }

      if (url.pathname === '/api/external/edit' && request.method === 'POST') {
        const { file_id, filename, description } = await request.json();
        await env.db.prepare("UPDATE images SET filename = ?, description = ? WHERE file_id = ?")
          .bind(filename, description, file_id).run();
        return jsonResponse({ success: true });
      }
    }

    if (url.pathname.startsWith('/api/admin/')) {
      const authHeader = request.headers.get('Authorization');
      const expectedAuth = `Basic ${btoa(`${config.admin_user}:${config.admin_pass}`)}`;
      
      if (authHeader !== expectedAuth) {
        return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Admin"' } });
      }

      if (url.pathname === '/api/admin/images' && request.method === 'GET') {
        const catId = new URL(request.url).searchParams.get('category_id');
        let query = "SELECT * FROM images ORDER BY upload_time DESC";
        let params = [];
        if (catId && catId !== '0') {
           query = "SELECT * FROM images WHERE category_id = ? ORDER BY upload_time DESC";
           params.push(catId);
        }
        const { results } = await env.db.prepare(query).bind(...params).all();
        const imagesWithUrl = results.map(img => ({...img, url: `${url.origin}/image/${img.file_id}${getExt(img.filename)}`})); 
        return jsonResponse(imagesWithUrl);
      }
      if (url.pathname === '/api/admin/upload' && request.method === 'POST') {
        try {
              const formData = await request.formData();
              const photo = formData.get('file');
              const categoryId = formData.get('category_id') || 0;
              const customTitle = formData.get('title') || ''; 
              const result = await handleUpload(photo, photo.name || 'admin_upload.png', 'Admin Upload', categoryId, customTitle);
              return jsonResponse(result);
            } catch (err) { return jsonResponse({ error: err.message }, 500); }
      }

      if (url.pathname === '/api/admin/delete' && request.method === 'POST') {
        const { id } = await request.json();
        const record = await env.db.prepare("SELECT file_id, message_id FROM images WHERE id = ?").bind(id).first();
        if (record) {
          if (record.message_id === 0) {
            if (env.r2) await env.r2.delete(record.file_id);
          } else {
            await fetch(`https://api.telegram.org/bot${config.tg_bot_token}/deleteMessage`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: config.tg_chat_id, message_id: record.message_id })
            });
          }
          await env.db.prepare("DELETE FROM images WHERE id = ?").bind(id).run();
        }
        return jsonResponse({ success: true });
      }
      if (url.pathname === '/api/admin/delete_batch' && request.method === 'POST') {
        const { ids } = await request.json();
        if (Array.isArray(ids) && ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          const records = await env.db.prepare(`SELECT id, file_id, message_id FROM images WHERE id IN (${placeholders})`).bind(...ids).all();
          if (records && records.results) {
            for (const record of records.results) {
              if (record.message_id === 0) {
                if (env.r2) await env.r2.delete(record.file_id);
              } else {
                await fetch(`https://api.telegram.org/bot${config.tg_bot_token}/deleteMessage`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: config.tg_chat_id, message_id: record.message_id })
                });
              }
            }
            await env.db.prepare(`DELETE FROM images WHERE id IN (${placeholders})`).bind(...ids).run();
          }
        }
        return jsonResponse({ success: true });
      }

      if (url.pathname === '/api/admin/edit_batch' && request.method === 'POST') {
        const { ids, category_id } = await request.json();
        if (Array.isArray(ids) && ids.length > 0) {
          const placeholders = ids.map(() => '?').join(',');
          await env.db.prepare(`UPDATE images SET category_id = ? WHERE id IN (${placeholders})`).bind(category_id, ...ids).run();
        }
        return jsonResponse({ success: true });
      }
      if (url.pathname === '/api/admin/transfer_batch' && request.method === 'POST') {
        const { ids, transfer } = await request.json();
        if (Array.isArray(ids) && ids.length > 0 && transfer !== 'none') {
          const placeholders = ids.map(() => '?').join(',');
          const records = await env.db.prepare(`SELECT * FROM images WHERE id IN (${placeholders})`).bind(...ids).all();
          if (records && records.results) {
            for (const record of records.results) {
              let newFileId = record.file_id;
              let newMessageId = record.message_id;
              let newDesc = record.description || '';

              if (transfer === 'tg2r2' && record.message_id !== 0) {
                if (!env.r2) continue; 
                try {
                  const tgFileRes = await fetch(`https://api.telegram.org/bot${config.tg_bot_token}/getFile?file_id=${record.file_id}`);
                  const tgFile = await tgFileRes.json();
                  if (!tgFile.ok) continue;
                  const imgRes = await fetch(`https://api.telegram.org/file/bot${config.tg_bot_token}/${tgFile.result.file_path}`);
                  const photoBlob = await imgRes.blob();
                  newFileId = crypto.randomUUID();
                  await env.r2.put(newFileId, photoBlob);
                  newMessageId = 0;
                  newDesc = newDesc.replace('(TG)', '(R2)');
                  await env.db.prepare("UPDATE images SET file_id = ?, message_id = ?, description = ? WHERE id = ?").bind(newFileId, newMessageId, newDesc, record.id).run();
                } catch(e) { console.error("TG2R2 Error:", e); }
              } else if (transfer === 'r22tg' && record.message_id === 0) {
                try {
                  const object = await env.r2.get(record.file_id);
                  if (!object) continue;
                  const photoBlob = await object.blob();
                  const tgFormData = new FormData();
                  tgFormData.append('chat_id', config.tg_chat_id);
                  const fName = record.filename || 'transfer.png';
                  const fileObj = new File([photoBlob], fName, { type: photoBlob.type || 'image/jpeg' });
                  if (fName.toLowerCase().endsWith('.gif')) {
                      tgFormData.append('document', photoBlob.slice(0, photoBlob.size, 'application/octet-stream'), 'file.bin');
                  } else {
                      tgFormData.append('document', fileObj);
                  }
                  const tgRes = await fetch(`https://api.telegram.org/bot${config.tg_bot_token}/sendDocument`, { method: 'POST', body: tgFormData });
                  const tgData = await tgRes.json();
                  if (tgData.ok) {
                    const tgDoc = tgData.result.document || tgData.result.photo?.pop();
                    newFileId = tgDoc.file_id;
                    newMessageId = tgData.result.message_id;
                    newDesc = newDesc.replace('(R2)', '(TG)');
                    await env.db.prepare("UPDATE images SET file_id = ?, message_id = ?, description = ? WHERE id = ?").bind(newFileId, newMessageId, newDesc, record.id).run();
                    await env.r2.delete(record.file_id); 
                  }
                } catch(e) { console.error("R22TG Error:", e); }
              }
            }
          }
        }
        return jsonResponse({ success: true });
      }
      if (url.pathname === '/api/admin/edit_image' && request.method === 'POST') {
        const { id, filename, category_id, transfer, title } = await request.json();
        const record = await env.db.prepare("SELECT * FROM images WHERE id = ?").bind(id).first();
        if (!record) return jsonResponse({ error: "Not found" }, 404);
        let newFileId = record.file_id;
        let newMessageId = record.message_id;
        let newDesc = title !== undefined ? title : record.description; 

        if (transfer === 'tg2r2' && record.message_id !== 0) {
            if (!env.r2) return jsonResponse({ error: "R2 未绑定" }, 500);
            const tgFileRes = await fetch(`https://api.telegram.org/bot${config.tg_bot_token}/getFile?file_id=${record.file_id}`);
            const tgFile = await tgFileRes.json();
            const imgRes = await fetch(`https://api.telegram.org/file/bot${config.tg_bot_token}/${tgFile.result.file_path}`);
            const photoBlob = await imgRes.blob();
            newFileId = crypto.randomUUID();
            await env.r2.put(newFileId, photoBlob);
            newMessageId = 0;
            newDesc = newDesc ? newDesc.replace('(TG)', '(R2)') : 'Admin Upload (R2)';
        } else if (transfer === 'r22tg' && record.message_id === 0) {
            const object = await env.r2.get(record.file_id);
            const photoBlob = await object.blob();
            const tgFormData = new FormData();
            tgFormData.append('chat_id', config.tg_chat_id);
            const fName = filename || 'transfer.png';
            const fileObj = new File([photoBlob], fName, { type: photoBlob.type || 'image/jpeg' });
            if (fName.toLowerCase().endsWith('.gif')) {
                tgFormData.append('document', photoBlob.slice(0, photoBlob.size, 'application/octet-stream'), 'file.bin');
            } else {
                tgFormData.append('document', fileObj);
            }
            const tgRes = await fetch(`https://api.telegram.org/bot${config.tg_bot_token}/sendDocument`, { method: 'POST', body: tgFormData });
            const tgData = await tgRes.json();
            if (tgData.ok) {
                const tgDoc = tgData.result.document || tgData.result.photo?.pop();
                newFileId = tgDoc.file_id;
                newMessageId = tgData.result.message_id;
                newDesc = newDesc ? newDesc.replace('(R2)', '(TG)') : 'Admin Upload (TG)';
                await env.r2.delete(record.file_id); 
            }
        }
        try {
            await env.db.prepare("UPDATE images SET filename = ?, category_id = ?, file_id = ?, message_id = ?, description = ? WHERE id = ?").bind(filename, category_id, newFileId, newMessageId, newDesc, id).run();
        } catch (dbErr) {
            return jsonResponse({ error: "数据库写入失败，请检查字段: " + dbErr.message }, 500);
        }
        return jsonResponse({ success: true });
      }
      if (url.pathname === '/api/admin/settings' && request.method === 'GET') {
        const { results } = await env.db.prepare("SELECT key, value FROM settings").all();
        const currentSettings = {};
        results.forEach(row => { currentSettings[row.key] = row.value; });
        return jsonResponse(currentSettings);
      }
      if (url.pathname === '/api/admin/settings' && request.method === 'POST') {
        const updates = await request.json();
        const stmts = Object.keys(updates).map(key => env.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, updates[key]));
        await env.db.batch(stmts);
        return jsonResponse({ success: true });
      }

      // === 新增：后端过滤导出数据接口 ===
      if (url.pathname === '/api/admin/export' && request.method === 'GET') {
        try {
          const exportBasic = url.searchParams.get('basic') === 'true';
          const exportR2 = url.searchParams.get('r2') === 'true';
          const exportTg = url.searchParams.get('tg') === 'true';

          let finalData = { settings: [], categories: [], images: [] };
          if (exportBasic) {
            const settings = await env.db.prepare("SELECT * FROM settings").all();
            const categories = await env.db.prepare("SELECT * FROM categories").all();
            finalData.settings = settings.results;
            finalData.categories = categories.results;
          }
          if (exportR2 || exportTg) {
            let imageQuery = "SELECT * FROM images";
            if (exportR2 && !exportTg) {
              imageQuery = "SELECT * FROM images WHERE message_id = 0"; 
            } else if (!exportR2 && exportTg) {
              imageQuery = "SELECT * FROM images WHERE message_id != 0"; 
            } 
            
            const images = await env.db.prepare(imageQuery).all();
            finalData.images = images.results;
          }
          return jsonResponse(finalData);
        } catch (dbErr) {
          return jsonResponse({ error: "导出失败: " + dbErr.message }, 500);
        }
      }

      // === 新增：导入数据接口 ===
      if (url.pathname === '/api/admin/import' && request.method === 'POST') {
        try {
          const data = await request.json();
          const stmts = [];
          
          if (data.settings && Array.isArray(data.settings)) {
            data.settings.forEach(row => stmts.push(env.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(row.key, row.value)));
          }
          if (data.categories && Array.isArray(data.categories)) {
            data.categories.forEach(row => stmts.push(env.db.prepare("INSERT OR REPLACE INTO categories (id, name, parent_id, sort_order, is_show) VALUES (?, ?, ?, ?, ?)").bind(row.id, row.name, row.parent_id || 0, row.sort_order || 0, row.is_show !== undefined ? row.is_show : 1)));
          }
          if (data.images && Array.isArray(data.images)) {
            data.images.forEach(row => stmts.push(env.db.prepare("INSERT OR REPLACE INTO images (id, file_id, message_id, filename, description, upload_time, category_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(row.id, row.file_id, row.message_id, row.filename, row.description, row.upload_time, row.category_id || 0)));
          }
          
          if (stmts.length > 0) await env.db.batch(stmts);
          return jsonResponse({ success: true });
        } catch (dbErr) {
          return jsonResponse({ error: "导入写入数据库失败: " + dbErr.message }, 500);
        }
      }

      if (url.pathname === '/api/admin/categories' && request.method === 'GET') {
        const { results } = await env.db.prepare("SELECT * FROM categories ORDER BY sort_order ASC, id ASC").all();
        return jsonResponse(results);
      }
      if (url.pathname === '/api/admin/categories' && request.method === 'POST') {
        const { name, parent_id = 0 } = await request.json();
        if (!name) return jsonResponse({ error: "Name required" }, 400);
        try {
            await env.db.prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)").bind(name, parent_id).run();
            return jsonResponse({ success: true });
        } catch(e) { return jsonResponse({ error: "Category exists" }, 400); }
      }
      if (url.pathname === '/api/admin/categories' && request.method === 'DELETE') {
        const { id } = await request.json();
        await env.db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
        return jsonResponse({ success: true });
      }
      if (url.pathname === '/api/admin/categories' && request.method === 'PUT') {
        const { id, name, parent_id = 0 } = await request.json();
        if (!name) return jsonResponse({ error: "Name required" }, 400);
        try {
            await env.db.prepare("UPDATE categories SET name = ?, parent_id = ? WHERE id = ?").bind(name, parent_id, id).run();
            return jsonResponse({ success: true });
        } catch(e) { return jsonResponse({ error: "Update failed" }, 500); }
      }
      if (url.pathname === '/api/admin/categories/toggle' && request.method === 'POST') {
        const { id, is_show } = await request.json();
        await env.db.prepare("UPDATE categories SET is_show = ? WHERE id = ?").bind(is_show, id).run();
        return jsonResponse({ success: true });
      }
      if (url.pathname === '/api/admin/categories/sort' && request.method === 'POST') {
        const { sortedIds } = await request.json();
        if (Array.isArray(sortedIds)) {
          const stmts = sortedIds.map((id, index) => env.db.prepare("UPDATE categories SET sort_order = ? WHERE id = ?").bind(index, id));
          await env.db.batch(stmts);
        }
        return jsonResponse({ success: true });
      }
    }

    if (url.pathname.startsWith('/image/')) {
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), request);
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) return cachedResponse;
      let fileId = url.pathname.replace('/image/', '');
      const extMatch = fileId.match(/(\.[a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1].toLowerCase() : '';
      fileId = fileId.replace(/\.[a-zA-Z0-9]+$/, ''); 
      const record = await env.db.prepare("SELECT message_id FROM images WHERE file_id = ?").bind(fileId).first();
      if (record && record.message_id === 0) {
        if (!env.r2) return new Response('R2未绑定', { status: 500, headers: corsHeaders });
        const object = await env.r2.get(fileId);
        if (!object) return new Response('R2中未找到图片', { status: 404, headers: corsHeaders });
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        const extToMime = { '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
        headers.set('Content-Type', object.httpMetadata?.contentType || extToMime[ext] || 'application/octet-stream');
        headers.set('Cache-Control', 'public, max-age=31536000');
        for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
        const r2Response = new Response(object.body, { headers });
        ctx.waitUntil(cache.put(cacheKey, r2Response.clone()));
        return r2Response;
      }

      const getFileUrl = `https://api.telegram.org/bot${config.tg_bot_token}/getFile?file_id=${fileId}`;
      const fileData = await (await fetch(getFileUrl)).json();

      if (fileData.ok) {
        const filePath = fileData.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${config.tg_bot_token}/${filePath}`;
        const imageRes = await fetch(downloadUrl);

        let contentType = imageRes.headers.get('Content-Type');
        const extToMime = { '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.tiff': 'image/tiff', '.avif': 'image/avif', '.heic': 'image/heic' };
        if (extToMime[ext]) {
          contentType = extToMime[ext];
        } else if (!contentType || contentType === 'application/octet-stream') {
          contentType = 'image/jpeg';
        }
        const tgResponse = new Response(imageRes.body, {
          headers: { 
            'Content-Type': contentType,
            'Content-Disposition': 'inline', 
            'Cache-Control': 'public, max-age=31536000', 
            ...corsHeaders
          }
        });
        ctx.waitUntil(cache.put(cacheKey, tgResponse.clone()));
        return tgResponse;
      }
      return new Response('Image Not Found in Telegram', { status: 404, headers: corsHeaders });
    }

    // 1. 如果是未知的 API 请求，返回 API 状态提示
    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ 
        status: "Image Bed API is running smoothly.",
        endpoints: {
          public_gallery: "/api/public/images",
          admin_api: "/api/admin/*",
          external_api: "/api/external/*"
        }
      });
    }

    // 2. 🚨 核心修复：其他所有请求（包括 /index.html, /admin.html 和 CSS/JS），全部交还给 Pages 的静态资源引擎去渲染！
    return env.ASSETS.fetch(request);
  }
};