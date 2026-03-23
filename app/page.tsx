"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Participant = "You" | "Wife";

type LinkPreview = {
  url: string;
  hostname: string;
  title: string;
  description: string;
  image?: string;
  siteName?: string;
};

type Message = {
  id: string;
  author: Participant;
  text: string;
  createdAt: string;
  previews: LinkPreview[];
};

const PARTICIPANTS: Participant[] = ["You", "Wife"];
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

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [activeUser, setActiveUser] = useState<Participant>("You");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("chat-user") as Participant | null;

    if (saved && PARTICIPANTS.includes(saved)) {
      setActiveUser(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("chat-user", activeUser);
  }, [activeUser]);

  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      try {
        const response = await fetch("/api/messages", {
          cache: "no-store"
        });

        if (!response.ok) {
          throw new Error("Failed to load messages.");
        }

        const data = (await response.json()) as { messages: Message[] };

        if (!cancelled) {
          setMessages(data.messages);
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

    loadMessages();
    const interval = window.setInterval(loadMessages, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({
          author: activeUser,
          text
        })
      });

      if (!response.ok) {
        throw new Error("Failed to send message.");
      }

      const data = (await response.json()) as { messages: Message[] };
      setMessages(data.messages);
      setDraft("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unknown error.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="chat-card">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Private room</p>
            <h1>Butler</h1>
            <p className="subtitle">Private messaging for two, with Slack-style link unfurls.</p>
          </div>

          <div className="identity-switcher" aria-label="Choose sender">
            {PARTICIPANTS.map((person) => (
              <button
                className={person === activeUser ? "identity-button active" : "identity-button"}
                key={person}
                onClick={() => setActiveUser(person)}
                type="button"
              >
                {person}
              </button>
            ))}
          </div>
        </header>

        <div className="message-list">
          {isLoading ? <p className="system-message">Loading chat…</p> : null}
          {!isLoading && messages.length === 0 ? (
            <p className="system-message">Share a first message or paste a link to see an unfurl.</p>
          ) : null}

          {messages.map((message) => {
            const ownMessage = message.author === activeUser;

            return (
              <article
                className={ownMessage ? "message-row own-message" : "message-row"}
                key={message.id}
              >
                <div className="message-meta">
                  <span>{message.author}</span>
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
                        <span className="preview-site">
                          {preview.siteName || preview.hostname}
                        </span>
                        <strong>{preview.title}</strong>
                        {preview.description ? <span>{preview.description}</span> : null}
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
            placeholder="Write a message or paste a link…"
            rows={3}
            value={draft}
          />
          <div className="composer-footer">
            <span className="composer-hint">
              Sender: <strong>{activeUser}</strong>
            </span>
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
