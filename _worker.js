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

  // 处理 /upload 上传接口
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
      if (!authRes.ok) {
        return Response.json({ code: 401, msg: 'B2授权失败' }, { headers: corsHeaders });
      }
      const authData = await authRes.json();
      const apiUrl = authData.apiUrl;
      const downloadUrl = authData.downloadUrl;
      const authToken = authData.authorizationToken;

      // 2. 获取上传地址
      const uploadUrlRes = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: 'POST',
        headers: { 
          "Authorization": authToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ bucketId: authData.bucketId })
      });
      if (!uploadUrlRes.ok) {
        return Response.json({ code: 500, msg: '获取上传地址失败' }, { headers: corsHeaders });
      }
      const uploadData = await uploadUrlRes.json();
      const uploadUrl = uploadData.uploadUrl;
      const uploadAuthToken = uploadData.authorizationToken;

      // 3. 解析上传的文件
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return Response.json({ code: 400, msg: '未找到上传的文件' }, { headers: corsHeaders });
      }

      // 4. 生成唯一文件名
      const ext = file.name.split('.').pop();
      const fileName = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      // 5. 上传到B2
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          "Authorization": uploadAuthToken,
          "X-Bz-File-Name": encodeURIComponent(fileName),
          "Content-Type": file.type,
          "X-Bz-Content-Sha1": "do_not_verify"
        },
        body: file.stream()
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        return Response.json({ code: 500, msg: 'B2上传失败: ' + err }, { headers: corsHeaders });
      }

      // 6. 返回文件URL
      const fileUrl = `https://b.im6.qzz.io/${fileName}`;
      return Response.json({
        code: 200,
        data: { url: fileUrl }
      }, { headers: corsHeaders });

    } catch (err) {
      return Response.json({
        code: 500,
        msg: '服务器错误: ' + err.message
      }, { headers: corsHeaders });
    }
  }

  // 根路径返回文件列表
  if (path === '/') {
    try {
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) {
        return new Response('B2授权失败', { status: 500 });
      }
      const authData = await authRes.json();
      const apiUrl = authData.apiUrl;
      const authToken = authData.authorizationToken;

      const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
        method: 'POST',
        headers: { 
          Authorization: authToken, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          bucketId: authData.bucketId, 
          maxFileCount: 1000,
          prefix: ""
        })
      });

      const listData = await listRes.json();
      const files = (listData.files || []).filter(f => !f.action).map(item => ({
        name: item.fileName,
        size: item.size,
        url: `https://b.im6.qzz.io/${item.fileName}`
      }));

      return new Response(JSON.stringify(files, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (err) {
      return Response.json({ code: 500, msg: '获取文件列表失败: ' + err.message }, { headers: corsHeaders });
    }
  }

  // 访问文件
  try {
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: {
        "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
      }
    });

    if (!authRes.ok) {
      return new Response(`B2授权错误: ${authRes.status}`, { status: 500 });
    }

    const authData = await authRes.json();
    const downloadUrl = authData.downloadUrl;
    const filePath = path.slice(1);

    if (!filePath) {
      return new Response("请输入文件名", { status: 400 });
    }

    const fileUrl = `${downloadUrl}${B2_FILES_URL_PREFIX}${filePath}`;
    const fileRes = await fetch(fileUrl, {
      headers: { Authorization: authData.authorizationToken }
    });

    if (!fileRes.ok) {
      return new Response("文件未找到", { status: 404 });
    }

    const headers = new Headers(fileRes.headers);
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(fileRes.body, {
      status: fileRes.status,
      headers: headers
    });

  } catch (error) {
    return new Response(`服务器错误: ${error.message}`, { status: 500 });
  }
}
