/** Liveness only: no AI calls, credentials, customer data, or upstream dependency checks. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const commit = process.env.RENDER_GIT_COMMIT;
  return Response.json(
    {
      status: "ok",
      service: "paycheck",
      revision: commit && /^[a-f0-9]{40}$/.test(commit) ? commit : null,
      checkedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
