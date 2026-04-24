addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // 你的 B2 主密钥信息（已填好）
  const B2_KEY_ID = "d01d287e4558";
  const B2_APP_KEY = "00557079826347b81e65bfd787f92cf550b3079c45";
  const B2_BUCKET_ID = "529665795";
  const B2_FILES_URL_PREFIX = `/file/${B2_BUCKET_ID}/`;

  try {
    // 1. 用主密钥授权 B2
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

    // 2. 解析请求路径，获取文件名
    const url = new URL(request.url);
    const filePath = url.pathname.slice(1);
    if (!filePath) {
      return new Response("请在地址后面加上文件名，例如 /test.jpg", { status: 400 });
    }

    // 3. 从 B2 拉取文件
    const fileUrl = `${downloadUrl}${B2_FILES_URL_PREFIX}${filePath}`;
    const fileRes = await fetch(fileUrl, {
      headers: {
        "Authorization": authData.authorizationToken
      }
    });

    if (!fileRes.ok) {
      const err = await fileRes.text();
      return new Response(`文件拉取失败: ${fileRes.status} - ${err}`, { status: fileRes.status });
    }

    // 4. 给返回头加上跨域和缓存控制
    const headers = new Headers(fileRes.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "public, max-age=86400");

    return new Response(fileRes.body, {
      status: fileRes.status,
      headers: headers
    });

  } catch (error) {
    return new Response(`运行错误: ${error.message}`, { status: 500 });
  }
}
