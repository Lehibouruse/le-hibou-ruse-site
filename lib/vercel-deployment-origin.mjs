export function vercelDeploymentOrigin(env = process.env) {
  const host = String(env.VERCEL_URL || "").trim().toLowerCase();
  if (!/^le-hibou-ruse-site(?:-[a-z0-9-]+)?\.vercel\.app$/.test(host)) return "";
  return `https://${host}`;
}
