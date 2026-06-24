"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Announcement = {
  id: string;
  title?: string | null;
  body: string;
  createdAt: string;
  readAt?: string | null;
};

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  mine: boolean;
  pending?: boolean;
  author: {
    name: string;
    avatarUrl?: string | null;
    isAdmin: boolean;
    hasBadge: boolean;
  };
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function DashboardLiveWidgets({
  isAdmin,
  profile
}: {
  isAdmin?: boolean;
  profile?: { name?: string | null; avatarUrl?: string | null };
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const hasUnread = unreadCount > 0;
  const token = typeof window !== "undefined" ? localStorage.getItem("nurxai_jwt") : null;

  async function authFetch(url: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(url, { ...init, headers });
  }

  async function fetchAnnouncements() {
    if (!token) return;
    const res = await authFetch("/api/announcements");
    if (!res.ok) return;
    const data = await res.json();
    setAnnouncements(data.announcements || []);
    setUnreadCount(data.unreadCount || 0);
  }

  async function fetchChat(markRead = false) {
    if (!token) return;
    const res = await authFetch(`/api/chat${markRead ? "?markRead=1" : ""}`);
    if (!res.ok) return;
    const data = await res.json();
    setMessages(data.messages || []);
    setChatUnreadCount(data.unreadCount || 0);
  }

  useEffect(() => {
    fetchAnnouncements();
    fetchChat(chatOpen);
    const timer = window.setInterval(() => {
      fetchAnnouncements();
      fetchChat(chatOpen);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [token, chatOpen]);

  useEffect(() => {
    if (chatOpen) {
      window.setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }, 60);
    }
  }, [chatOpen, messages.length]);

  async function openNotifications() {
    const nextOpen = !notifOpen;
    setNotifOpen(nextOpen);
    if (nextOpen && announcements.length > 0) {
      const unreadIds = announcements.filter((item) => !item.readAt).map((item) => item.id);
      if (unreadIds.length > 0) {
        setUnreadCount(0);
        await authFetch("/api/announcements", {
          method: "POST",
          body: JSON.stringify({ ids: unreadIds })
        });
        fetchAnnouncements();
      }
    }
  }

  async function sendMessage() {
    const body = chatText.trim();
    if (!body || sending) return;
    const tempId = `pending-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      mine: true,
      pending: true,
      author: {
        name: profile?.name || "You",
        avatarUrl: profile?.avatarUrl || null,
        isAdmin: !!isAdmin,
        hasBadge: false
      }
    };
    setMessages((items) => [...items, optimistic]);
    setChatText("");
    setSending(true);
    const res = await authFetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ body })
    });
    setSending(false);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.message) {
        setMessages((items) => items.map((item) => item.id === tempId ? data.message : item));
      } else {
        await fetchChat();
      }
    } else {
      setMessages((items) => items.filter((item) => item.id !== tempId));
      setChatText(body);
    }
  }

  const chatPreview = useMemo(() => messages[messages.length - 1], [messages]);

  return (
    <div className="dashboard-live-widgets">
      <div className="live-actions">
        <button
          type="button"
          className={`live-icon-btn ${hasUnread ? "live-icon-alert" : "live-icon-ok"}`}
          onClick={openNotifications}
          aria-label="Open notifications"
        >
          <span>!</span>
          {hasUnread && <strong>{unreadCount}</strong>}
        </button>
        <button
          type="button"
          className={`live-icon-btn live-chat-btn ${chatUnreadCount > 0 ? "live-chat-alert" : ""}`}
          onClick={() => {
            const nextOpen = !chatOpen;
            setChatOpen(nextOpen);
            if (nextOpen) {
              setChatUnreadCount(0);
              fetchChat(true);
            }
          }}
          aria-label="Open global chat"
        >
          <span className="chat-globe" aria-hidden="true">🌍</span>
          {chatUnreadCount > 0 && <strong>{chatUnreadCount > 99 ? "99+" : chatUnreadCount}</strong>}
        </button>
      </div>

      {notifOpen && (
        <section className="live-panel notification-panel nb-card">
          <div className="live-panel-head">
            <h2>Notifications</h2>
            <button className="nb-btn text-xs px-2 py-1" onClick={() => setNotifOpen(false)}>Close</button>
          </div>
          <div className="live-panel-list">
            {announcements.length === 0 ? (
              <p className="text-sm opacity-70">No announcements yet.</p>
            ) : (
              announcements.map((item) => (
                <article key={item.id} className={`announcement-item ${item.readAt ? "read" : "unread"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3>{item.title || "Announcement"}</h3>
                    <span>{item.readAt ? "read" : "new"}</span>
                  </div>
                  <p>{item.body}</p>
                  <small>{formatTime(item.createdAt)}</small>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {chatOpen && (
        <section className="live-panel chat-panel nb-card">
          <div className="live-panel-head">
            <div>
              <h2>Global chat</h2>
              {chatPreview && <small>Latest: {chatPreview.author.name}</small>}
            </div>
            <button className="nb-btn text-xs px-2 py-1" onClick={() => setChatOpen(false)}>Close</button>
          </div>
          <div ref={scrollRef} className="chat-list">
            {messages.length === 0 ? (
              <p className="text-sm opacity-70">No messages yet. Start the room.</p>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-message ${message.mine ? "mine" : ""} ${message.author.isAdmin ? "admin" : ""}`}
                >
                  <div className="chat-message-row">
                    <div className="chat-avatar">
                      {message.author.avatarUrl ? (
                        <img src={message.author.avatarUrl} alt="" />
                      ) : (
                        <span>{message.author.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="chat-bubble">
                      <div className="chat-author">
                        <span>{message.author.name}</span>
                        {message.author.isAdmin && <strong className="admin-badge">ADMIN</strong>}
                        {!message.author.isAdmin && message.author.hasBadge && <strong className="spark-badge">+</strong>}
                        {message.pending && <em>sending</em>}
                      </div>
                      <p>{message.body}</p>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
          <div className="chat-compose">
            <input
              className="nb-input"
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              maxLength={500}
              placeholder={isAdmin ? "Send as admin..." : "Message the NurAi room..."}
            />
            <button className="nb-btn nb-btn-primary" onClick={sendMessage} disabled={sending || !chatText.trim()}>
              Send
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
