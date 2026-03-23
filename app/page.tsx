"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import type { ChatMessage, ChatRoom, PendingInvitation } from "../lib/types";

const POLL_INTERVAL_MS = 4000;

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);

  return parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          className="message-link"
          href={part}
          key={`${part}-${index}`}
          rel="noreferrer"
          target="_blank"
        >
          {part}
        </a>
      );
    }

    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function InviteState({ invitation }: { invitation: PendingInvitation | null }) {
  if (!invitation) {
    return (
      <p className="onboarding-copy">
        Add your wife&apos;s Gmail address and Butler will open the conversation automatically once
        she signs in.
      </p>
    );
  }

  if (invitation.direction === "incoming") {
    return (
      <p className="onboarding-copy">
        {invitation.inviterName ?? invitation.email} invited you. Butler will finish pairing this
        chat automatically as soon as the room sync runs.
      </p>
    );
  }

  return (
    <p className="onboarding-copy">
      Invite saved for <strong>{invitation.email}</strong>. When she signs in with that Gmail
      account, this chat will open automatically for both of you.
    </p>
  );
}

function AuthGate() {
  return (
    <main className="app-shell">
      <section className="chat-card auth-card">
        <p className="eyebrow">Private room</p>
        <h1>Butler</h1>
        <p className="subtitle">
          Sign in with Google, invite your wife&apos;s Gmail, and keep one private thread between
          the two of you.
        </p>

        <button className="send-button auth-button" onClick={() => signIn("google")} type="button">
          Continue with Google
        </button>
      </section>
    </main>
  );
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [draft, setDraft] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setRoom(null);
      return;
    }

    let cancelled = false;

    async function loadRoom() {
      try {
        if (!cancelled) {
          setIsLoading(true);
        }

        const response = await fetch("/api/messages", {
          cache: "no-store"
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Failed to load your room.");
        }

        const data = (await response.json()) as ChatRoom;

        if (!cancelled) {
          setRoom(data);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unknown error.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadRoom();
    const interval = window.setInterval(loadRoom, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.messages]);

  if (status === "loading") {
    return (
      <main className="app-shell">
        <section className="chat-card auth-card">
          <p className="system-message">Loading Butler…</p>
        </section>
      </main>
    );
  }

  if (status !== "authenticated" || !session?.user?.email) {
    return <AuthGate />;
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!partnerEmail.trim()) {
      return;
    }

    setIsInviting(true);
    setError(null);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          partnerEmail
        })
      });

      const payload = (await response.json()) as ChatRoom | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Failed to save invite.");
      }

      setRoom(payload);
      setPartnerEmail("");
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Unknown error.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });

      const payload = (await response.json()) as ChatRoom | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error("error" in payload ? payload.error : "Failed to send message.");
      }

      setRoom(payload);
      setDraft("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown error.");
    } finally {
      setIsSending(false);
    }
  }

  if (!room?.partner) {
    return (
      <main className="app-shell">
        <section className="chat-card onboarding-card">
          <header className="chat-header onboarding-header">
            <div>
              <p className="eyebrow">Private room</p>
              <h1>Butler</h1>
              <p className="subtitle">
                Signed in as <strong>{session.user.email}</strong>
              </p>
            </div>

            <button className="identity-button" onClick={() => signOut()} type="button">
              Sign out
            </button>
          </header>

          <div className="onboarding-panel">
            <h2>Invite your wife</h2>
            <InviteState invitation={room?.invitation ?? null} />

            <form className="invite-form" onSubmit={handleInvite}>
              <input
                autoComplete="email"
                className="composer-input"
                onChange={(event) => setPartnerEmail(event.target.value)}
                placeholder="wife@gmail.com"
                type="email"
                value={partnerEmail}
              />
              <button className="send-button" disabled={isInviting} type="submit">
                {isInviting ? "Saving…" : "Save Invite"}
              </button>
            </form>

            <p className="composer-hint">
              Once she signs in with the invited Gmail, Butler will collapse into one shared chat
              thread automatically.
            </p>
          </div>

          {error ? <p className="error-banner">{error}</p> : null}
          {isLoading ? <p className="system-message">Checking for your partner…</p> : null}
        </section>
      </main>
    );
  }

  const messages = room.messages;

  return (
    <main className="app-shell">
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Private room</p>
            <h1>Butler</h1>
            <p className="subtitle">
              {room.partner.name} and {room.viewer.name}, together in one thread.
            </p>
          </div>

          <div className="partner-summary">
            <div className="partner-chip">
              <span className="partner-dot" />
              <span>{room.partner.email}</span>
            </div>
            <button className="identity-button" onClick={() => signOut()} type="button">
              Sign out
            </button>
          </div>
        </header>

        <div className="message-list">
          {isLoading ? <p className="system-message">Refreshing chat…</p> : null}
          {!isLoading && messages.length === 0 ? (
            <p className="system-message">
              Say hi to {room.partner.name.split(" ")[0]} or paste a link to see an unfurl.
            </p>
          ) : null}

          {messages.map((message: ChatMessage) => {
            const ownMessage = message.authorEmail === room.viewer.email;

            return (
              <article
                className={ownMessage ? "message-row own-message" : "message-row"}
                key={message.id}
              >
                <div className="message-meta">
                  <span>{ownMessage ? "You" : message.authorName}</span>
                  <span>{formatTime(message.createdAt)}</span>
                </div>

                <div className={ownMessage ? "message-bubble own-bubble" : "message-bubble"}>
                  <p>{linkify(message.text)}</p>

                  {message.previews.map((preview) => (
                    <a
                      className="preview-card"
                      href={preview.url}
                      key={`${message.id}-${preview.url}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {preview.image ? (
                        <div
                          aria-hidden="true"
                          className="preview-image"
                          style={{ backgroundImage: `url(${preview.image})` }}
                        />
                      ) : null}

                      <div className="preview-copy">
                        <span className="preview-site">{preview.siteName ?? preview.hostname}</span>
                        <strong>{preview.title}</strong>
                        <span>{preview.description}</span>
                      </div>
                    </a>
                  ))}
                </div>
              </article>
            );
          })}

          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            className="composer-input"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message ${room.partner.name.split(" ")[0]}…`}
            rows={3}
            value={draft}
          />

          <div className="composer-footer">
            <p className="composer-hint">
              Signed in as <strong>{room.viewer.email}</strong>
            </p>

            <button className="send-button" disabled={isSending} type="submit">
              {isSending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
      </section>
    </main>
  );
}
