import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { meetingId } = await req.json();
    if (!meetingId || typeof meetingId !== "string") throw new Error("Meeting ID is required");

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("id,title,room_name,host_id,status")
      .eq("id", meetingId)
      .maybeSingle();

    if (meetingError || !meeting || meeting.status !== "active") {
      return new Response(JSON.stringify({ error: "Meeting not found or already ended" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !livekitUrl) throw new Error("LiveKit secrets are not configured");

    const displayName = String(user.user_metadata?.full_name || user.email || "Participant").slice(0, 80);
    const isHost = meeting.host_id === user.id;

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: displayName,
      ttl: "2h",
    });

    token.addGrant({
      roomJoin: true,
      room: meeting.room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Host moderation permissions will be handled by a trusted admin endpoint
      // in a later release; do not grant roomAdmin to regular clients.
    });

    const jwt = await token.toJwt();
    return new Response(JSON.stringify({
      token: jwt,
      url: livekitUrl,
      meeting: { id: meeting.id, title: meeting.title, isHost }
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
