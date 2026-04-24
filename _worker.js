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

  // 上传图片/视频
  if (request.method === 'POST' && path === '/upload') {
    try {
      // 每次上传都重新授权，自动刷新令牌
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) {
        return Response.json({ code: 401, msg: 'auth failed' }, { headers: corsHeaders });
      }
      const authData = await authRes.json();
      const uploadUrl = authData.upAuthUrl;
      const uploadToken = authData.authorizationToken;

      const bucketRes = await fetch(`${uploadUrl}/b2api/v2/b2_get_upload_url`, {
        method: 'POST',
        headers: { "Authorization": uploadToken },
        body: JSON.stringify({ bucketId: authData.bucketId })
      });
      if (!bucketRes.ok) {
        return Response.json({ code: 500, msg: 'get upload url failed' }, { headers: corsHeaders });
      }
      const uploadData = await bucketRes.json();
      const uploadUrlFinal = uploadData.uploadUrl;
      const uploadAuthToken = uploadData.authorizationToken;

      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return Response.json({ code: 400, msg: 'no file' }, { headers: corsHeaders });
      }

      const ext = file.name.split('.').pop();
      const fileName = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const uploadResponse = await fetch(uploadUrlFinal, {
        method: 'POST',
        headers: {
          "Authorization": uploadAuthToken,
          "X-Bz-File-Name": encodeURIComponent(fileName),
          "Content-Type": file.type,
          "X-Bz-Content-Sha1": "do_not_verify"
        },
        body: file.stream()
      });

      if (!uploadResponse.ok) {
        return Response.json({ code: 500, msg: 'upload failed' }, { headers: corsHeaders });
      }

      const fileUrl = `https://b.im6.qzz.io/${fileName}`;
      return Response.json({
        code: 200,
        data: { url: fileUrl }
      }, { headers: corsHeaders });

    } catch (err) {
      return Response.json({
        code: 500,
        msg: 'error: ' + err.message
      }, { headers: corsHeaders });
    }
  }

  // 访问根域名，列出所有文件
  if (path === '/') {
    try {
      // 每次列文件都重新授权，自动刷新令牌
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) {
        return new Response('auth failed', { status: 500 });
      }
      const authData = await authRes.json();
      const apiUrl = authData.apiUrl;
      const authToken = authData.authorizationToken;

      const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
        method: 'POST',
        headers: { Authorization: authToken },
        body: JSON.stringify({ bucketId: authData.bucketId, maxFileCount: 1000 })
      });

      const listData = await listRes.json();
      const files = (listData.files || []).map(item => ({
        name: item.fileName,
        size: item.size,
        url: 'https://b.im6.qzz.io/' + item.fileName
      }));

      return new Response(JSON.stringify(files, null, 2), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (err) {
      return Response.json({ code: 500, msg: 'list failed' }, { headers: corsHeaders });
    }
  }

  // 访问图片/视频文件
  try {
    // 每次访问文件都重新授权，自动刷新令牌
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: {
        "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
      }
    });

    if (!authRes.ok) {
      const err = await authRes.text();
      return new Response(`auth error: ${authRes.status}`, { status: 500 });
    }

    const authData = await authRes.json();
    const downloadUrl = authData.downloadUrl;
    const filePath = path.slice(1);

    if (!filePath) {
      return new Response("input filename", { status: 400 });
    }

    const fileUrl = `${downloadUrl}${B2_FILES_URL_PREFIX}${filePath}`;
    const fileRes = await fetch(fileUrl, {
      headers: { Authorization: authData.authorizationToken }
    });

    if (!fileRes.ok) {
      return new Response("not found", { status: 404 });
    }

    const headers = new Headers(fileRes.headers);
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(fileRes.body, {
      status: fileRes.status,
      headers: headers
    });

  } catch (error) {
    return new Response(`error: ${error.message}`, { status: 500 });
  }
}
