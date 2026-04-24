addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const B2_KEY_ID = "005d01d287e45580000000002";
  const B2_APP_KEY = "K005g6VFAhOkO4Owc25zP6vDw+xZlNk";
  const B2_BUCKET_NAME = "529665795";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // 1. 根目录 = 列出全部文件
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
          size: item.size,
          url: `https://b.im6.qzz.io/${item.fileName}`
        }));

      return new Response(JSON.stringify(fileList, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({error:"列表获取失败"}), {
        status:500, headers:{...corsHeaders,"Content-Type":"application/json"}
      });
    }
  }

  // 2. /upload 上传接口 （图片、视频都能传）
  if (path === "/upload") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {status:405, headers:corsHeaders});
    }
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
      }).then(r=>r.json());

      const formData = await request.formData();
      const file = formData.get("file");
      if(!file) throw new Error("无文件");

      const suffix = file.name.split(".").pop();
      const newName = `media/${Date.now()}_147157.${suffix}`;

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

      if(!upRes.ok) throw new Error("上传失败");

      return new Response(JSON.stringify({
        code:200,
        url:`https://b.im6.qzz.io/${newName}`
      }),{
        headers:{...corsHeaders,"Content-Type":"application/json"}
      });

    } catch (e) {
      return new Response(JSON.stringify({code:500,msg:e.message}),{
        status:500,headers:{...corsHeaders,"Content-Type":"application/json"}
      });
    }
  }

  // 3. 正常访问文件：图片显示、视频播放、下载
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
    outHeaders.set("Access-Control-Allow-Origin","*");
    outHeaders.set("Access-Control-Allow-Methods","GET,OPTIONS");
    outHeaders.delete("x-bz-info");

    return new Response(fileResp.body, {
      status: fileResp.status,
      headers: outHeaders
    });

  } catch (err) {
    return new Response("文件访问异常",{status:500});
  }
}
