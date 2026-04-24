addEventListener('fetch', e=>e.respondWith(main(e.request)))

async function main(req){
  // 双密钥全部写入 兜底切换
  const keyList = [
    {id:"d01d287e4558",key:"005d1ab15027fb133ff7b3abcbb3f0962950928081"},
    {id:"005d01d287e45580000000002",key:"K005g6VFAhOkO4Owc25zP6vDw+xZlNk"}
  ];
  const BUCKET = "529665795";

  const cors = {
    "Access-Control-Allow-Origin":"*",
    "Access-Control-Allow-Methods":"GET,POST,OPTIONS,PUT,DELETE",
    "Access-Control-Allow-Headers":"*"
  };

  if(req.method==="OPTIONS")return new Response(null,{headers:cors});

  const url = new URL(req.url);
  const path = url.pathname;

  // 循环双密钥 哪个能用自动切哪个
  for(let k of keyList){
    try{
      // 1.全员授权
      const auth = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account",{
        headers:{Authorization:`Basic ${btoa(k.id+":"+k.key)}`}
      });
      if(!auth.ok)continue;
      const authData = await auth.json();

      // 2.全参数 列出桶
      const bucketRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_buckets`,{
        method:"POST",
        headers:{Authorization:authData.authorizationToken,"Content-Type":"application/json"},
        body:JSON.stringify({
          accountId:authData.accountId,
          bucketId:"",
          bucketName:"",
          bucketType:""
        })
      });
      const bucketJson = await bucketRes.json();
      const nowBucket = bucketJson.buckets.find(x=>x.bucketName===BUCKET);
      if(!nowBucket)continue;

      // ========== 根目录：列表【所有参数全部塞满】==========
      if(path==="/"){
        const listRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_file_names`,{
          method:"POST",
          headers:{Authorization:authData.authorizationToken,"Content-Type":"application/json"},
          body:JSON.stringify({
            bucketId:nowBucket.bucketId,
            maxFileCount:2000,
            prefix:"",
            delimiter:"/",
            startFileName:"",
            endFileName:"",
            fileId:"",
            contentType:"",
            fileSize:"",
            uploadTimestamp:""
          })
        });
        const listData = await listRes.json();
        const files = Array.isArray(listData.files) 
          ? listData.files.filter(f=>f.action==="upload")
          : [];

        return new Response(JSON.stringify({
          code:200,
          bucketName:BUCKET,
          total:files.length,
          files:files.map(f=>({
            name:f.fileName,
            size:f.size,
            time:f.uploadTimestamp,
            url:`https://b.im6.qzz.io/${f.fileName}`
          }))
        },null,2),{headers:{...cors,"Content-Type":"application/json"}});
      }

      // ========== 上传接口 ==========
      if(path==="/upload"&&req.method==="POST"){
        const upUrlRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`,{
          method:"POST",
          headers:{Authorization:authData.authorizationToken,"Content-Type":"application/json"},
          body:JSON.stringify({bucketId:nowBucket.bucketId})
        });
        const upUrlData = await upUrlRes.json();
        const form = await req.formData();
        const file = form.get("file");
        if(!file)throw "无文件";
        const ext = file.name.split(".").pop();
        const fileName = `chat_${Date.now()}.${ext}`;

        const up = await fetch(upUrlData.uploadUrl,{
          method:"POST",
          headers:{
            Authorization:upUrlData.authorizationToken,
            "X-Bz-File-Name":encodeURIComponent(fileName),
            "X-Bz-Content-Sha1":"do_not_verify",
            "Content-Type":file.type
          },
          body:file.stream()
        });
        const res = await up.json();
        return new Response(JSON.stringify({
          code:200,
          url:`https://b.im6.qzz.io/${res.fileName}`
        }),{headers:{...cors,"Content-Type":"application/json"}});
      }

      // ========== 图片/视频/文件访问 ==========
      const filePath = path.replace(/^\//,"");
      const fileRes = await fetch(`${authData.downloadUrl}/file/${BUCKET}/${filePath}`,{
        headers:{
          Authorization:authData.authorizationToken,
          Range:req.headers.get("Range")||""
        }
      });
      const outH = new Headers(fileRes.headers);
      outH.set("Access-Control-Allow-Origin","*");
      return new Response(fileRes.body,{status:fileRes.status,headers:outH});

    }catch(e){
      continue;
    }
  }

  // 所有密钥都失败
  return new Response("B2全部密钥授权/请求失败",{status:500,headers:cors});
}
