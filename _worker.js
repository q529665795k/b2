addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const B2_KEY_ID = "d01d287e4558";
  const B2_APP_KEY = "00557079826347b81e65bfd787f92cf550b3079c45";
  const B2_BUCKET_NAME = "529665795";
  const B2_FILES_URL_PREFIX = `/file/${B2_BUCKET_NAME}/`;

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

  // 1. 文件列表接口
  if (path === '/') {
    try {
      // 1. 授权B2
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) throw new Error("授权失败");
      const authData = await authRes.json();

      // 2. 列出文件
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

      // 3. 格式化文件列表
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

  // 2. 上传接口
  if (path === '/upload') {
    if (request.method !== 'POST') {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }
    try {
      // 1. 授权B2
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) throw new Error("授权失败");
      const authData = await authRes.json();

      // 2. 获取上传地址
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

      // 3. 解析文件
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) throw new Error("未找到文件");

      // 4. 生成文件名
      const ext = file.name.split('.').pop();
      const fileName = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      // 5. 上传到B2
      const uploadFileRes = await fetch(uploadData.uploadUrl, {
        method: 'POST',
        headers: {
          "Authorization": uploadData.authorizationToken,
          "X-Bz-File-Name": encodeURIComponent(fileName),
          "Content-Type": file.type,
          "X-Bz-Content-Sha1": "do_not_verify"
        },
        body: file.stream()
      });
      if (!uploadFileRes.ok) throw new Error("上传失败");

      // 6. 返回结果
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

  // 3. 文件访问接口
  try {
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: {
        "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
      }
    });
    if (!authRes.ok) throw new Error("授权失败");
    const authData = await authRes.json();

    const filePath = path.slice(1);
    const fileUrl = `${authData.downloadUrl}${B2_FILES_URL_PREFIX}${filePath}`;
    const fileRes = await fetch(fileUrl, {
      headers: { "Authorization": authData.authorizationToken }
    });

    if (!fileRes.ok) {
      return new Response("Not Found", { status: 404 });
    }

    const headers = new Headers(fileRes.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(fileRes.body, { status: fileRes.status, headers });
  } catch (err) {
    return new Response("Error: " + err.message, { status: 500 });
  }
}
