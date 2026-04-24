addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const B2_KEY_ID = "d01d287e4558";
  const B2_APP_KEY = "00557079826347b81e65bfd787f92cf550b3079c45";
  const B2_BUCKET_NAME = "529665795";
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 1. 根路径：列出文件
  if (path === '/') {
    try {
      // 1.1 授权B2
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) throw new Error("授权失败");
      const authData = await authRes.json();

      // 1.2 列出文件（按官方规范调用）
      const listRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_file_names`, {
        method: 'POST',
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          bucketId: authData.allowed.bucketId,
          maxFileCount: 1000
        })
      });
      if (!listRes.ok) throw new Error("列出文件失败");
      const listData = await listRes.json();

      // 1.3 格式化返回（过滤掉删除操作的文件）
      const files = listData.files
        .filter(f => !f.action || f.action === "upload")
        .map(f => ({
          name: f.fileName,
          size: f.size,
          url: `https://b.im6.qzz.io/${f.fileName}`
        }));

      return new Response(JSON.stringify(files, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // 2. /upload：上传文件
  if (path === '/upload') {
    if (request.method !== 'POST') {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    try {
      // 2.1 授权B2
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) throw new Error("授权失败");
      const authData = await authRes.json();

      // 2.2 获取上传地址
      const uploadRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: 'POST',
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ bucketId: authData.allowed.bucketId })
      });
      if (!uploadRes.ok) throw new Error("获取上传地址失败");
      const uploadData = await uploadRes.json();

      // 2.3 解析文件
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) throw new Error("未找到上传的文件");

      // 2.4 生成文件名
      const ext = file.name.split('.').pop();
      const fileName = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      // 2.5 按官方规范上传文件
      const uploadFileRes = await fetch(uploadData.uploadUrl, {
        method: 'POST',
        headers: {
          "Authorization": uploadData.authorizationToken,
          "X-Bz-File-Name": encodeURIComponent(fileName),
          "Content-Type": file.type,
          "Content-Length": file.size,
          "X-Bz-Content-Sha1": "do_not_verify"
        },
        body: file.stream()
      });
      if (!uploadFileRes.ok) throw new Error("上传文件失败");

      // 2.6 返回文件URL
      return new Response(JSON.stringify({
        code: 200,
        data: { url: `https://b.im6.qzz.io/${fileName}` }
      }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    } catch (err) {
      return new Response(JSON.stringify({ code: 500, msg: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // 3. 其他路径：代理访问文件
  try {
    // 3.1 授权B2
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: {
        "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
      }
    });
    if (!authRes.ok) throw new Error("授权失败");
    const authData = await authRes.json();

    // 3.2 拼接文件访问地址
    const filePath = path.slice(1);
    const fileUrl = `${authData.downloadUrl}/file/${B2_BUCKET_NAME}/${filePath}`;
    const fileRes = await fetch(fileUrl, {
      headers: { "Authorization": authData.authorizationToken }
    });

    if (!fileRes.ok) {
      return new Response("Not Found", { status: 404 });
    }

    // 3.3 返回文件（添加跨域头）
    const headers = new Headers(fileRes.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(fileRes.body, { status: fileRes.status, headers });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
