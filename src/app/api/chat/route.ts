import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const { question, org_ref } = body;

  if (!question) {
    return new Response(JSON.stringify({ error: "Missing question" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get user's mcp_token
  const { data: userData } = await supabase
    .from("users")
    .select("mcp_token")
    .eq("id", user.id)
    .single();

  if (!userData?.mcp_token) {
    return new Response(JSON.stringify({ error: "Missing MCP token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward request to Edge Function with streaming
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/search-context`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "x-mcp-token": userData.mcp_token,
      },
      body: JSON.stringify({
        question,
        org_ref,
        stream: true,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    return new Response(error, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward the streaming response
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
