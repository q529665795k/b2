addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const B2_KEY_ID = "d01d287e4558";
  const B2_APP_KEY = "00557079826347b81e65bfd787f92cf550b3079c45";
  const B2_BUCKET_NAME = "529665795";
  const B2_FILES_URL_PREFIX = `/file/${B2_BUCKET_NAME}/`;

  // 通用跨域头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  // 预检 OPTIONS 请求直接返回跨域
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ====================== 【新增】上传接口 /upload ======================
  const url = new URL(request.url);
  if (request.method === 'POST' && url.pathname === '/upload') {
    try {
      // 1. 先授权 B2
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
        }
      });
      if (!authRes.ok) {
        return Response.json({ code: 401, msg: '授权失败' }, { headers: corsHeaders });
      }
      const authData = await authRes.json();
      const uploadUrl = authData.upAuthUrl;
      const uploadToken = authData.authorizationToken;

      // 2. 获取上传地址
      const bucketRes = await fetch(`${uploadUrl}/b2api/v2/b2_get_upload_url`, {
        method: 'POST',
        headers: { "Authorization": uploadToken },
        body: JSON.stringify({ bucketId: authData.bucketId })
      });
      if (!bucketRes.ok) {
        return Response.json({ code: 500, msg: '获取上传地址失败' }, { headers: corsHeaders });
      }
      const uploadData = await bucketRes.json();
      const uploadUrlFinal = uploadData.uploadUrl;
      const uploadAuthToken = uploadData.authorizationToken;

      // 3. 接收文件
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) {
        return Response.json({ code: 400, msg: '请上传文件' }, { headers: corsHeaders });
      }

      // 4. 生成文件名
      const ext = file.name.split('.').pop();
      const fileName = `uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      // 5. 上传到 B2
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
        return Response.json({ code: 500, msg: '上传失败' }, { headers: corsHeaders });
      }

      // 6. 返回可直接访问的图片/视频地址
      const fileUrl = `https://b.im6.qzz.io/${fileName}`;
      return Response.json({
        code: 200,
        data: { url: fileUrl }
      }, { headers: corsHeaders });

    } catch (err) {
      return Response.json({
        code: 500,
        msg: '上传异常：' + err.message
      }, { headers: corsHeaders });
    }
  }

  // ====================== 【原有逻辑】读取文件（完全没动） ======================
  try {
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: {
        "Authorization": `Basic ${btoa(`${B2_KEY_ID}:${B2_APP_KEY}`)}`
      }
    });

    if (!authRes.ok) {
      const err = await authRes.text();
      return new Response(`授权失败: ${authRes.status} - ${err}`, { status: 500 });
    }

    const authData = await authRes.json();
    const downloadUrl = authData.downloadUrl;

    const filePath = url.pathname.slice(1);
    if (!filePath) {
      return new Response("请拼接文件名访问，例：/test.jpg", { status: 400 });
    }

    const fileUrl = `${downloadUrl}${B2_FILES_URL_PREFIX}${filePath}`;
    const fileRes = await fetch(fileUrl, {
      headers: {
        "Authorization": authData.authorizationToken
      }
    });

    if (!fileRes.ok) {
      const err = await fileRes.text();
      return new Response(`文件拉取失败: ${fileRes.status} - ${err}`, { status: 404 });
    }

    const headers = new Headers(fileRes.headers);
    headers.set("Access-Control-Allow-Origin", "*");

    return new Response(fileRes.body, {
      status: fileRes.status,
      headers: headers
    });

  } catch (error) {
    return new Response(`运行错误: ${error.message}`, { status: 500 });
  }
}
