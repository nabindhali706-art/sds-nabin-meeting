import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Video, Users, CalendarDays, Copy, Plus, LogOut,
  Globe2, ShieldCheck, Monitor, Link2, X, Headphones
} from "lucide-react";
import {
  LiveKitRoom, VideoConference, RoomAudioRenderer,
  useRoomContext
} from "@livekit/components-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { Language, t } from "./lib/i18n";
import type { Meeting } from "./types";

type Session = { accessToken: string; serverUrl: string };

function App() {
  const [language, setLanguage] = useState<Language>("en");
  const copy = t(language);
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authError, setAuthError] = useState("");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [joinValue, setJoinValue] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [roomSession, setRoomSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSessionUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionUser || !supabase) { setMeetings([]); return; }
    loadMeetings();
  }, [sessionUser]);

  async function loadMeetings() {
    if (!supabase) return;
    const { data } = await supabase
      .from("meetings")
      .select("id,title,room_name,host_id,created_at,status")
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setMeetings(data as Meeting[]);
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true); setAuthError("");
    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        setAuthError("Account created. If email confirmation is enabled, check your inbox.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setAuthError(err.message || copy.authError);
    } finally { setBusy(false); }
  }

  async function createMeeting() {
    if (!supabase || !sessionUser) return;
    setBusy(true); setNotice("");
    try {
      const title = meetingTitle.trim() || `Meeting ${new Date().toLocaleDateString()}`;
      const roomName = `sds-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const { data, error } = await supabase.from("meetings").insert({
        title, room_name: roomName, host_id: sessionUser.id
      }).select().single();
      if (error) throw error;
      setShowCreate(false); setMeetingTitle("");
      await loadMeetings();
      await enterMeeting(data as Meeting);
    } catch (err: any) {
      setNotice(err.message || copy.createError);
    } finally { setBusy(false); }
  }

  function extractMeetingId(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      const url = new URL(trimmed);
      return url.searchParams.get("meeting") || url.pathname.split("/").filter(Boolean).pop() || "";
    } catch {
      return trimmed.replace(/^.*meeting=/, "").replace(/\/$/, "");
    }
  }

  async function joinMeeting() {
    if (!supabase) return;
    const raw = extractMeetingId(joinValue);
    if (!raw) { setNotice(copy.invalidMeeting); return; }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.from("meetings")
        .select("id,title,room_name,host_id,created_at,status")
        .eq("id", raw).maybeSingle();
      if (error || !data) throw error || new Error(copy.joinError);
      await enterMeeting(data as Meeting);
    } catch (err: any) {
      setNotice(err.message || copy.joinError);
    } finally { setBusy(false); }
  }

  async function enterMeeting(meeting: Meeting) {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Please sign in again.");
    const functionUrl = `${import.meta.env.VITE_SUPABASE_FUNCTIONS_URL}/create-livekit-token`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ meetingId: meeting.id })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || copy.joinError);
    setActiveMeeting(meeting);
    setRoomSession({ accessToken: result.token, serverUrl: result.url });
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setActiveMeeting(null); setRoomSession(null);
  }

  async function copyInvite(meeting: Meeting) {
    const link = `${window.location.origin}/?meeting=${meeting.id}`;
    await navigator.clipboard.writeText(link);
    setNotice(copy.copied);
    window.setTimeout(() => setNotice(""), 2500);
  }

  if (loading) return <div className="center-screen">{copy.loading}</div>;

  if (activeMeeting && roomSession) {
    return (
      <LiveKitRoom
        token={roomSession.accessToken}
        serverUrl={roomSession.serverUrl}
        connect={true}
        audio={true}
        video={true}
        onDisconnected={() => { setActiveMeeting(null); setRoomSession(null); loadMeetings(); }}
        data-lk-theme="default"
        className="meeting-shell"
      >
        <div className="meeting-topbar">
          <div className="brand compact"><span className="brand-mark"><Video size={18}/></span><span>SDS NABIN MEETING</span></div>
          <div className="meeting-title">{activeMeeting.title}</div>
          <button className="btn btn-ghost btn-small" onClick={() => copyInvite(activeMeeting)}><Copy size={15}/>{copy.copyLink}</button>
        </div>
        <div className="lk-wrap">
          <VideoConference />
          <RoomAudioRenderer />
        </div>
        <div className="meeting-footer">
          <span><ShieldCheck size={15}/> {activeMeeting.host_id === sessionUser?.id ? copy.host : "Participant"}</span>
          <span>{copy.micCamera}</span>
        </div>
      </LiveKitRoom>
    );
  }

  if (!sessionUser) {
    return (
      <div className="auth-layout">
        <div className="auth-aside">
          <div className="brand brand-light"><span className="brand-mark"><Video size={20}/></span><span>SDS NABIN MEETING</span></div>
          <div className="auth-pitch">
            <div className="eyebrow">MEET • CONNECT • COLLABORATE</div>
            <h1>Bring every conversation into one place.</h1>
            <p>{copy.description}</p>
            <div className="feature-pills"><span><Video size={15}/> HD video</span><span><Users size={15}/> Team meetings</span><span><Monitor size={15}/> Screen sharing</span></div>
          </div>
          <div className="auth-aside-bottom">Simple meetings. Meaningful connections.</div>
        </div>
        <main className="auth-main">
          <div className="language-switch">
            <Globe2 size={16}/>
            <button onClick={() => setLanguage(language === "en" ? "bn" : "en")}>{language === "en" ? "বাংলা" : "English"}</button>
          </div>
          <form className="auth-card" onSubmit={handleAuth}>
            <div className="eyebrow">{authMode === "login" ? "YOUR MEETING WORKSPACE" : "GET STARTED"}</div>
            <h2>{authMode === "login" ? copy.welcome : copy.signUp}</h2>
            <p>{isSupabaseConfigured ? copy.authHint : copy.authSetup}</p>
            {!isSupabaseConfigured && <div className="alert alert-warn">{copy.noConfig}</div>}
            {authMode === "signup" && <label>{copy.fullName}<input value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name"/></label>}
            <label>{copy.email}<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"/></label>
            <label>{copy.password}<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={authMode === "login" ? "current-password" : "new-password"}/></label>
            {authError && <div className="alert">{authError}</div>}
            <button className="btn btn-primary btn-full" disabled={busy || !isSupabaseConfigured}>{busy ? copy.loading : authMode === "login" ? copy.signIn : copy.signUp}<ArrowRight size={17}/></button>
            <div className="auth-toggle">
              {authMode === "login" ? "New to SDS Nabin Meeting?" : "Already have an account?"}
              <button type="button" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setAuthError(""); }}>
                {authMode === "login" ? copy.signUp : copy.signIn}
              </button>
            </div>
          </form>
          <div className="auth-foot">© {new Date().getFullYear()} SDS NABIN MEETING</div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Video size={19}/></span><span>SDS NABIN<br/>MEETING</span></div>
        <div className="side-label">WORKSPACE</div>
        <div className="nav-item active"><CalendarDays size={17}/>{copy.dashboard}</div>
        <div className="sidebar-bottom">
          <div className="secure-note"><ShieldCheck size={17}/><span>Meet with confidence</span></div>
          <button className="nav-item" onClick={signOut}><LogOut size={17}/>{copy.logout}</button>
        </div>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div><div className="eyebrow">SDS NABIN MEETING / WORKSPACE</div><h1>{copy.dashboard}</h1></div>
          <div className="header-actions">
            <button className="language-button" onClick={() => setLanguage(language === "en" ? "bn" : "en")}><Globe2 size={16}/>{language === "en" ? "বাংলা" : "English"}</button>
            <div className="avatar">{(sessionUser.user_metadata?.full_name || sessionUser.email || "U").slice(0,1).toUpperCase()}</div>
          </div>
        </header>
        <section className="welcome-banner">
          <div className="welcome-copy"><div className="eyebrow light-eyebrow">YOUR SPACE, YOUR CONVERSATION</div><h2>{language === "en" ? "Good to see you." : "আপনাকে স্বাগতম।"}</h2><p>{copy.subtitle}</p></div>
          <div className="banner-art"><div className="art-circle"><Video size={44}/></div><div className="art-dot dot-one"/><div className="art-dot dot-two"/></div>
        </section>
        {notice && <div className="alert notice">{notice}</div>}
        <section className="action-grid">
          <div className="action-card primary-action">
            <div className="action-icon"><Video size={21}/></div><div><h3>{copy.newMeeting}</h3><p>{copy.createInstant}</p></div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={17}/>{copy.create}</button>
          </div>
          <div className="action-card">
            <div className="action-icon soft"><Link2 size={21}/></div><div><h3>{copy.joinMeeting}</h3><p>{language === "en" ? "Have a meeting ID or invite link?" : "মিটিং আইডি বা আমন্ত্রণ লিংক আছে?"}</p></div>
            <div className="join-form"><input value={joinValue} onChange={e => setJoinValue(e.target.value)} placeholder={copy.meetingId}/><button className="btn btn-dark" onClick={joinMeeting} disabled={busy}>{copy.join}<ArrowRight size={15}/></button></div>
          </div>
        </section>
        <section className="recent-section">
          <div className="section-heading"><div><h2>{copy.recentMeetings}</h2><p>{language === "en" ? "Rooms you created recently" : "আপনার তৈরি করা সাম্প্রতিক রুম"}</p></div><span className="count-pill">{meetings.length} rooms</span></div>
          {meetings.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><Headphones size={25}/></div><h3>{copy.noMeetings}</h3><p>{language === "en" ? "Your meeting rooms will appear here." : "আপনার মিটিং রুমগুলো এখানে দেখা যাবে।"}</p></div>
          ) : (
            <div className="meeting-list">{meetings.map(m => <div className="meeting-row" key={m.id}><div className="meeting-row-icon"><Video size={19}/></div><div className="meeting-row-info"><strong>{m.title}</strong><span>{new Date(m.created_at).toLocaleString()}</span></div><span className="status-dot">● {m.status}</span><button className="icon-btn" title={copy.copyLink} onClick={() => copyInvite(m)}><Copy size={17}/></button><button className="btn btn-outline btn-small" onClick={() => enterMeeting(m)}>{copy.join}<ArrowRight size={14}/></button></div>)}</div>
          )}
        </section>
        <footer className="dashboard-footer">SDS NABIN MEETING <span>•</span> {copy.description}</footer>
      </main>
      {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">NEW ROOM</div><h2>{copy.createTitle}</h2></div><button className="icon-btn" onClick={() => setShowCreate(false)}><X size={19}/></button></div><label>{copy.meetingName} <span className="muted">({copy.optional})</span><input autoFocus value={meetingTitle} onChange={e => setMeetingTitle(e.target.value)} placeholder={language === "en" ? "e.g. Weekly team meeting" : "যেমন: সাপ্তাহিক টিম মিটিং"}/></label><div className="modal-actions"><button className="btn btn-outline" onClick={() => setShowCreate(false)}>{copy.cancel}</button><button className="btn btn-primary" onClick={createMeeting} disabled={busy}>{busy ? copy.loading : copy.create}<ArrowRight size={16}/></button></div></div></div>}
    </div>
  );
}

export default App;
