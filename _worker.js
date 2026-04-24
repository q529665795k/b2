addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // 你刚生成的主密钥（全权限，直接写死在里面了）
  const B2_KEY_ID = "d01d287e4558";
  const B2_APP_KEY = "005d1ab15027fb133ff7b3abcbb3f0962950928081";
  const B2_BUCKET_NAME = "529665795";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 1. 根目录：列出文件（方便你测试）
  if (path === "/") {
    try {
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(B2_KEY_ID + ":" + B2_APP_KEY)}`
        }
      });
      const authData = await authRes.json();

      const listRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_file_names`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          bucketId: authData.allowed.bucketId,
          maxFileCount: 2000
        })
      });
      const listJson = await listRes.json();

      const fileList = listJson.files
        .filter(item => item.action === "upload")
        .map(item => ({
          name: item.fileName,
          url: `https://b.im6.qzz.io/${item.fileName}`
        }));

      return new Response(JSON.stringify(fileList, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "列表获取失败", msg: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // 2. /upload 上传接口（图片、视频都能传）
  if (path === "/upload" && request.method === "POST") {
    try {
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: {
          "Authorization": `Basic ${btoa(B2_KEY_ID + ":" + B2_APP_KEY)}`
        }
      });
      const authData = await authRes.json();

      const uploadInfo = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: "POST",
        headers: {
          "Authorization": authData.authorizationToken,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ bucketId: authData.allowed.bucketId })
      }).then(r => r.json());

      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) throw new Error("无文件");

      const suffix = file.name.split(".").pop();
      const newName = `chat/${Date.now()}_${Math.random().toString(36).slice(2)}.${suffix}`;

      const upRes = await fetch(uploadInfo.uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": uploadInfo.authorizationToken,
          "X-Bz-File-Name": encodeURIComponent(newName),
          "Content-Type": file.type,
          "X-Bz-Content-Sha1": "do_not_verify"
        },
        body: file.stream()
      });

      if (!upRes.ok) throw new Error("上传失败");

      return new Response(JSON.stringify({
        code: 200,
        url: `https://b.im6.qzz.io/${newName}`
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (e) {
      return new Response(JSON.stringify({ code: 500, msg: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // 3. 图片/视频/下载/播放
  try {
    const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
      headers: {
        "Authorization": `Basic ${btoa(B2_KEY_ID + ":" + B2_APP_KEY)}`
      }
    });
    const authData = await authRes.json();

    const rawPath = path.slice(1);
    const targetUrl = `${authData.downloadUrl}/file/${B2_BUCKET_NAME}/${rawPath}`;

    const fileResp = await fetch(targetUrl, {
      headers: {
        "Authorization": authData.authorizationToken,
        "Range": request.headers.get("range") || ""
      }
    });

    const outHeaders = new Headers(fileResp.headers);
    outHeaders.set("Access-Control-Allow-Origin", "*");
    outHeaders.delete("x-bz-info");

    return new Response(fileResp.body, {
      status: fileResp.status,
      headers: outHeaders
    });

  } catch (err) {
    return new Response("文件访问异常: " + err.message, { status: 500 });
  }
}
