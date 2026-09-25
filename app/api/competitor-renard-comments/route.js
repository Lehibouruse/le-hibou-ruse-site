import { NextResponse } from "next/server";
import { adminOrServiceAuthorized, serviceUnauthorized } from "../../../lib/admin-auth.mjs";
import { resolveSocialEnv } from "../../../lib/social-credentials-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const IDS = ["bkF_sZgBRsU","KQxjChS1p6s","CbFERLNN8AU","oe3BiQXm_gk","H-X9P9QR2n4","Mm1bdOvJqnY","xlEX2Bh4wW4","0hVlMXzcWKY","wLUvgtBtU7k","zzH1utt0mos","c7HaT_71s-4","PhmCkevFQZQ","YTwL352ADPk","7rTGNdQse08","EOoqBy12DI0","ZVtdkZYDKdc","Oysbr6SurI4","LTrJkpQ4CfE","0jv5_naB3Vg","Ja_LuXpNKWk","n0xC2n6oTKw","5q_G2zUQXg4","njeGhoApZsA","hHkOBE3p5ps","ywnmvV0xfxY","8CXw3lxuNzk","pYU2y2YXjaE","cQFWS50Sz5U","AvSWZMJh7Ys","tXKTBLnWRbk","qm30okJah_I","YrfrCjHURIE","k3DnasytDVs","04rchoeXUu0","n7VwycnTyLo","_gVBzMwFJCk","kvm8iewvQFw","gS6YbOOFSDg","SmqjZCk5CeM","vnfaxIoLfcg","KD4mdoJL4ic","C3kk1_6bzAA","FbPz0dUTDwQ","F1oxW2oU184","1mtkjV4qV8M","8T4Cb7W4wf0","7RZwWvqpD6Y","i3UK_ahwM8o","bYppXZfVg-U","i1WM-xRshJA"];

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { text: text.slice(0,1200) }; }
}

export async function GET(request) {
  if (!adminOrServiceAuthorized(request)) return serviceUnauthorized();
  const url = new URL(request.url);
  if (url.searchParams.get("target") !== "renard_finance") {
    return NextResponse.json({ok:false,error:"fixed_target_only"},{status:400});
  }
  const resolved = await resolveSocialEnv("youtube", process.env);
  const token = String((resolved.env || process.env).YOUTUBE_ACCESS_TOKEN || "").trim();
  if (!token) return NextResponse.json({ok:false,error:"youtube_token_missing"},{status:503});

  const out = [];
  for (const videoId of IDS) {
    const api = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
    api.searchParams.set("part","snippet");
    api.searchParams.set("videoId",videoId);
    api.searchParams.set("maxResults","20");
    api.searchParams.set("order","relevance");
    api.searchParams.set("textFormat","plainText");
    const response = await fetch(api,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});
    const data = await readJson(response);
    if (!response.ok) {
      out.push({videoId,error:data?.error?.message || response.statusText,status:response.status});
      continue;
    }
    const comments = (data.items || []).map((item) => {
      const s = item?.snippet?.topLevelComment?.snippet || {};
      return {
        text: s.textDisplay || "",
        likes: Number(s.likeCount || 0),
        publishedAt: s.publishedAt || "",
        replies: Number(item?.snippet?.totalReplyCount || 0)
      };
    });
    out.push({videoId,comments});
  }
  return NextResponse.json({ok:true,videos:out},{headers:{"Cache-Control":"no-store"}});
}
